#!/usr/bin/env node

const http = require("http");
const https = require("https");
const vm = require("vm");

const { AuctionKingEstimator, resolveEstimatorConfig } = require("../src/core/estimator.js");
const { buildLegacyEstimatorStateFromFieldValues } = require("../src/browser/workspace_runtime.js");

const DEFAULT_ORIGIN = "https://ak.fuuu.fun";
const DEFAULT_PAGE_PATH = "/";
const DEFAULT_MAP_ID = "sunken_ship";
const DEFAULT_THRESHOLD = 0.99;
const DEFAULT_TIMEOUT_MS = 5000;

const DEFAULT_SAMPLES = [
    {
        label: "20260427T1636 large warehouse fallback-only screenshot",
        field_values: {
            total_items: 55,
            blue_count: 15,
            purple_avg_cells: "2.9",
            orange_avg_cells: "4.33",
            white_green_total_cells: 31,
            white_green_avg_cells: "1.63"
        }
    },
    {
        label: "20260427T1640 compact warehouse fallback-only screenshot",
        field_values: {
            total_items: 37,
            blue_count: 12,
            blue_avg_cells: "1.75",
            purple_count: 8,
            purple_avg_cells: "1.62",
            orange_avg_cells: "2.5",
            white_green_total_cells: 13,
            white_green_avg_cells: "1.85"
        }
    }
];

function parseArgs(argv) {
    const args = {
        origin: DEFAULT_ORIGIN,
        pagePath: DEFAULT_PAGE_PATH,
        bundlePath: null,
        mapId: DEFAULT_MAP_ID,
        threshold: DEFAULT_THRESHOLD,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        json: false,
        cacheBustBundle: false,
        cacheBustPage: true
    };
    for (const raw of argv) {
        if (raw === "--json") args.json = true;
        else if (raw === "--cache-bust") args.cacheBustBundle = true;
        else if (raw === "--no-cache-bust") args.cacheBustBundle = false;
        else if (raw === "--no-page-cache-bust") args.cacheBustPage = false;
        else if (raw.startsWith("--origin=")) args.origin = raw.slice("--origin=".length);
        else if (raw.startsWith("--page-path=")) args.pagePath = raw.slice("--page-path=".length);
        else if (raw.startsWith("--bundle-path=")) args.bundlePath = raw.slice("--bundle-path=".length);
        else if (raw.startsWith("--map-id=")) args.mapId = raw.slice("--map-id=".length);
        else if (raw.startsWith("--threshold=")) args.threshold = parseProbabilityArg(raw, "--threshold=");
        else if (raw.startsWith("--timeout-ms=")) args.timeoutMs = parsePositiveIntegerArg(raw, "--timeout-ms=");
        else throw new Error(`Unknown argument: ${raw}`);
    }
    return args;
}

function parseProbabilityArg(raw, prefix) {
    const value = Number.parseFloat(raw.slice(prefix.length));
    if (!Number.isFinite(value) || value <= 0 || value >= 1) {
        throw new Error(`${prefix}${raw.slice(prefix.length)} must be between 0 and 1`);
    }
    return value;
}

function parsePositiveIntegerArg(raw, prefix) {
    const value = Number.parseInt(raw.slice(prefix.length), 10);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${prefix}${raw.slice(prefix.length)} must be a positive integer`);
    }
    return value;
}

function addSmokeParam(url, label) {
    const nextUrl = new URL(url);
    nextUrl.searchParams.set("smoke", `${label}-${Date.now()}`);
    return nextUrl.toString();
}

function buildPageUrl(args) {
    const url = new URL(args.pagePath, args.origin);
    return args.cacheBustPage ? addSmokeParam(url, "posterior-desaturation-page") : url.toString();
}

function buildExplicitBundleUrl(args) {
    const url = new URL(args.bundlePath, args.origin);
    if (args.cacheBustBundle) {
        url.searchParams.set("smoke", `posterior-desaturation-${Date.now()}`);
    }
    return url.toString();
}

function getTagAttribute(tag, name) {
    const pattern = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i");
    const match = tag.match(pattern);
    return match ? match[1].trim() : "";
}

function extractDefaultConfigBundlePath(html) {
    const tagPattern = /<script\b[^>]*>/gi;
    let match;
    while ((match = tagPattern.exec(html))) {
        const src = getTagAttribute(match[0], "src");
        if (/default_config_bundle\.js(?:[?#]|$)/.test(src)) return src;
    }
    throw new Error("Could not find default_config_bundle.js script reference in page HTML");
}

async function resolveBundleUrlFromPage(args) {
    if (args.bundlePath) {
        const bundleUrl = buildExplicitBundleUrl(args);
        return {
            page_url: null,
            bundle_ref: args.bundlePath,
            bundle_url: bundleUrl
        };
    }
    const pageUrl = buildPageUrl(args);
    const html = await fetchText(pageUrl, args.timeoutMs);
    const bundleRef = extractDefaultConfigBundlePath(html);
    return {
        page_url: pageUrl,
        bundle_ref: bundleRef,
        bundle_url: new URL(bundleRef, pageUrl).toString()
    };
}

function fetchText(url, timeoutMs = DEFAULT_TIMEOUT_MS, redirectsLeft = 3) {
    const parsed = new URL(url);
    const client = parsed.protocol === "http:" ? http : https;
    return new Promise((resolve, reject) => {
        const req = client.get(parsed, {
            headers: {
                "accept": "application/javascript,text/javascript,*/*",
                "user-agent": "auction-king-live-posterior-desaturation-smoke/1.0"
            }
        }, (res) => {
            const statusCode = res.statusCode || 0;
            const location = res.headers.location;
            if (statusCode >= 300 && statusCode < 400 && location && redirectsLeft > 0) {
                res.resume();
                res.on("end", () => {
                    resolve(fetchText(new URL(location, parsed).toString(), timeoutMs, redirectsLeft - 1));
                });
                return;
            }
            if (statusCode < 200 || statusCode >= 300) {
                res.resume();
                reject(new Error(`HTTP ${statusCode} while fetching ${url}`));
                return;
            }
            res.setEncoding("utf8");
            let body = "";
            res.on("data", (chunk) => {
                body += chunk;
            });
            res.on("end", () => resolve(body));
        });
        req.setTimeout(timeoutMs, () => {
            req.destroy(Object.assign(new Error(`timeout after ${timeoutMs}ms while fetching ${url}`), { code: "ETIMEDOUT" }));
        });
        req.on("error", reject);
    });
}

function evaluateDefaultConfigBundle(source, sourceUrl = "default_config_bundle.js") {
    const context = {
        module: { exports: {} },
        exports: {},
        window: {}
    };
    vm.runInNewContext(source, context, {
        filename: sourceUrl,
        timeout: 2000
    });
    const exported = context.module.exports;
    if (exported && typeof exported === "object" && exported.app) return exported;
    if (context.window.AUCTION_KING_DEFAULT_CONFIG) return context.window.AUCTION_KING_DEFAULT_CONFIG;
    throw new Error(`Could not evaluate default config bundle from ${sourceUrl}`);
}

function buildPosteriorCheck(label, posterior, threshold = DEFAULT_THRESHOLD) {
    const support = Array.isArray(posterior) ? posterior : [];
    const top = support[0] || null;
    const prob = top && Number.isFinite(top.prob) ? top.prob : null;
    const ok = support.length > 1 && prob !== null && prob < threshold;
    return {
        label,
        ok,
        top_count: top && Number.isFinite(top.count) ? top.count : null,
        top_prob: prob,
        support_count: support.length,
        threshold
    };
}

function extractFirstDateToken(value) {
    const match = String(value || "").match(/20\d{6}/);
    return match ? match[0] : null;
}

function buildAssetFreshnessCheck(bundleUrl, configSourceVersion) {
    const parsed = new URL(bundleUrl);
    const assetVersion = parsed.searchParams.get("v") || parsed.searchParams.get("version") || "";
    const assetDate = extractFirstDateToken(assetVersion);
    const configDate = extractFirstDateToken(configSourceVersion);
    const ok = !assetDate || !configDate || assetDate >= configDate;
    return {
        ok,
        asset_version: assetVersion || null,
        asset_date: assetDate,
        config_date: configDate
    };
}

function runSampleAgainstConfig(config, sample, mapId = DEFAULT_MAP_ID, threshold = DEFAULT_THRESHOLD) {
    const state = buildLegacyEstimatorStateFromFieldValues(sample.field_values);
    const result = new AuctionKingEstimator(resolveEstimatorConfig(config, mapId), state).recompute();
    if (result.error) {
        return {
            label: sample.label,
            ok: false,
            error: true,
            messages: result.messages || []
        };
    }
    const orange = buildPosteriorCheck("orange", result.summary.orange_count_probs, threshold);
    const red = buildPosteriorCheck("red", result.summary.red_count_probs, threshold);
    return {
        label: sample.label,
        ok: orange.ok && red.ok,
        error: false,
        orange,
        red
    };
}

function runPosteriorDesaturation({ config, samples = DEFAULT_SAMPLES, mapId = DEFAULT_MAP_ID, threshold = DEFAULT_THRESHOLD, origin = null, pageUrl = null, bundleRef = null, bundleUrl = null }) {
    const sampleResults = samples.map((sample) => runSampleAgainstConfig(config, sample, mapId, threshold));
    const failures = sampleResults.filter((entry) => !entry.ok);
    const assetFreshness = bundleUrl
        ? buildAssetFreshnessCheck(bundleUrl, config && config.app ? config.app.config_source_version : null)
        : { ok: true, asset_version: null, asset_date: null, config_date: null };
    return {
        ok: failures.length === 0 && assetFreshness.ok,
        origin,
        page_url: pageUrl,
        bundle_ref: bundleRef,
        bundle_url: bundleUrl,
        map_id: mapId,
        threshold,
        config_source_version: config && config.app ? config.app.config_source_version || null : null,
        sunken_red_alpha: config && config.maps && config.maps.sunken_ship ? config.maps.sunken_ship.alpha_counts.r : null,
        sunken_count_prior_strength: config && config.maps && config.maps.sunken_ship && config.maps.sunken_ship.solver
            ? config.maps.sunken_ship.solver.count_prior_strength
            : null,
        asset_freshness: assetFreshness,
        samples: sampleResults,
        failures: assetFreshness.ok ? failures : failures.concat([{ ok: false, label: "asset_freshness", asset_freshness: assetFreshness }])
    };
}

function formatPercent(value) {
    if (!Number.isFinite(value)) return "-";
    return `${(value * 100).toFixed(1)}%`;
}

function formatReportText(report) {
    const lines = [
        `Live posterior desaturation smoke: ${report.ok ? "PASS" : "FAIL"}`,
        `origin: ${report.origin || "-"}`,
        `page: ${report.page_url || "-"}`,
        `bundle_ref: ${report.bundle_ref || "-"}`,
        `bundle: ${report.bundle_url || "-"}`,
        `config_source_version: ${report.config_source_version || "-"}`,
        `asset_version / config_date: ${report.asset_freshness.asset_version || "-"} / ${report.asset_freshness.config_date || "-"}`,
        `sunken red alpha / count prior strength: ${report.sunken_red_alpha} / ${report.sunken_count_prior_strength}`,
        `threshold: top posterior < ${formatPercent(report.threshold)} with support_count > 1`
    ];
    for (const sample of report.samples) {
        if (sample.error) {
            lines.push(`- ${sample.label}: ERROR ${sample.messages.join("; ")}`);
            continue;
        }
        lines.push(
            `- ${sample.label}: orange top ${sample.orange.top_count} @ ${formatPercent(sample.orange.top_prob)} `
            + `(support ${sample.orange.support_count}); red top ${sample.red.top_count} @ ${formatPercent(sample.red.top_prob)} `
            + `(support ${sample.red.support_count})`
        );
    }
    return `${lines.join("\n")}\n`;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const resolved = await resolveBundleUrlFromPage(args);
    const source = await fetchText(resolved.bundle_url, args.timeoutMs);
    const config = evaluateDefaultConfigBundle(source, resolved.bundle_url);
    const report = runPosteriorDesaturation({
        config,
        samples: DEFAULT_SAMPLES,
        mapId: args.mapId,
        threshold: args.threshold,
        origin: args.origin,
        pageUrl: resolved.page_url,
        bundleRef: resolved.bundle_ref,
        bundleUrl: resolved.bundle_url
    });
    if (args.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        process.stdout.write(formatReportText(report));
    }
    if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error && error.stack ? error.stack : String(error));
        process.exitCode = 1;
    });
}

module.exports = {
    DEFAULT_SAMPLES,
    buildAssetFreshnessCheck,
    buildExplicitBundleUrl,
    buildPageUrl,
    buildPosteriorCheck,
    evaluateDefaultConfigBundle,
    extractDefaultConfigBundlePath,
    fetchText,
    formatReportText,
    parseArgs,
    resolveBundleUrlFromPage,
    runPosteriorDesaturation,
    runSampleAgainstConfig
};
