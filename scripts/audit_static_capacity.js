#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const https = require("https");
const { performance } = require("perf_hooks");

const DEFAULT_ORIGIN = "https://ak.fuuu.fun";
const DEFAULT_HTML = "dist/index.html";
const DEFAULT_PAGE_PATH = "/";

function parseArgs(argv) {
    const args = {
        origin: DEFAULT_ORIGIN,
        html: DEFAULT_HTML,
        pagePath: DEFAULT_PAGE_PATH,
        vus: 10,
        seconds: 8,
        timeoutMs: 5000,
        maxRedirects: 5,
        json: false,
        listPaths: false
    };
    for (const raw of argv) {
        if (raw === "--json") args.json = true;
        else if (raw === "--list-paths") args.listPaths = true;
        else if (raw.startsWith("--origin=")) args.origin = raw.slice("--origin=".length);
        else if (raw.startsWith("--html=")) args.html = raw.slice("--html=".length);
        else if (raw.startsWith("--path=")) args.pagePath = raw.slice("--path=".length);
        else if (raw.startsWith("--vus=")) args.vus = parsePositiveInteger(raw, "--vus=");
        else if (raw.startsWith("--seconds=")) args.seconds = parsePositiveInteger(raw, "--seconds=");
        else if (raw.startsWith("--timeout-ms=")) args.timeoutMs = parsePositiveInteger(raw, "--timeout-ms=");
        else if (raw.startsWith("--max-redirects=")) args.maxRedirects = parsePositiveInteger(raw, "--max-redirects=");
        else throw new Error(`Unknown argument: ${raw}`);
    }
    return args;
}

function parsePositiveInteger(raw, prefix) {
    const value = Number.parseInt(raw.slice(prefix.length), 10);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${prefix}${raw.slice(prefix.length)} must be a positive integer`);
    }
    return value;
}

function getTagAttribute(tag, name) {
    const pattern = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i");
    const match = tag.match(pattern);
    return match ? match[1].trim() : "";
}

function normalizeSameOriginPath(rawUrl, pagePath) {
    if (!rawUrl || rawUrl.startsWith("#") || rawUrl.startsWith("data:")) return null;
    if (/^(https?:)?\/\//i.test(rawUrl)) return null;
    const parsed = new URL(rawUrl, `https://ak.local${pagePath}`);
    return `${parsed.pathname}${parsed.search}`;
}

function extractPageResourcePaths(htmlFile, pagePath) {
    const html = fs.readFileSync(htmlFile, "utf8");
    const paths = new Set([pagePath]);
    const tagPattern = /<(script|link)\b[^>]*>/gi;
    let match;
    while ((match = tagPattern.exec(html))) {
        const tagName = match[1].toLowerCase();
        const tag = match[0];
        if (tagName === "script") {
            const path = normalizeSameOriginPath(getTagAttribute(tag, "src"), pagePath);
            if (path) paths.add(path);
            continue;
        }
        const rel = getTagAttribute(tag, "rel").toLowerCase();
        if (!/(stylesheet|modulepreload|preload)/.test(rel)) continue;
        const path = normalizeSameOriginPath(getTagAttribute(tag, "href"), pagePath);
        if (path) paths.add(path);
    }
    return Array.from(paths);
}

function createAgent(origin) {
    const parsed = new URL(origin);
    const Agent = parsed.protocol === "http:" ? http.Agent : https.Agent;
    return new Agent({ keepAlive: true, maxSockets: 500 });
}

function requestOnce(url, { agent, timeoutMs, maxRedirects }, redirectCount = 0) {
    const startedAt = performance.now();
    const parsed = new URL(url);
    const client = parsed.protocol === "http:" ? http : https;
    return new Promise((resolve) => {
        const req = client.get(parsed, {
            agent,
            headers: {
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "accept-encoding": "br,gzip",
                "user-agent": "auction-king-static-capacity-audit/1.0"
            }
        }, (res) => {
            const statusCode = res.statusCode || 0;
            const location = res.headers.location;
            if (statusCode >= 300 && statusCode < 400 && location && redirectCount < maxRedirects) {
                res.resume();
                res.on("end", async () => {
                    const nextUrl = new URL(location, parsed).toString();
                    const result = await requestOnce(nextUrl, { agent, timeoutMs, maxRedirects }, redirectCount + 1);
                    resolve({
                        ...result,
                        ms: performance.now() - startedAt,
                        redirects: result.redirects + 1
                    });
                });
                return;
            }
            let bytes = 0;
            res.on("data", (chunk) => {
                bytes += chunk.length;
            });
            res.on("end", () => {
                resolve({
                    ok: statusCode >= 200 && statusCode < 400,
                    status: String(statusCode),
                    ms: performance.now() - startedAt,
                    bytes,
                    redirects: redirectCount
                });
            });
        });
        req.setTimeout(timeoutMs, () => {
            req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
        });
        req.on("error", (error) => {
            resolve({
                ok: false,
                status: error.code || "ERR",
                ms: performance.now() - startedAt,
                bytes: 0,
                redirects: redirectCount
            });
        });
    });
}

async function requestPath(origin, path, options) {
    const target = new URL(path, origin).toString();
    return requestOnce(target, options);
}

async function pageLoad(origin, paths, options) {
    const startedAt = performance.now();
    const results = await Promise.all(paths.map((path) => requestPath(origin, path, options)));
    return {
        ms: performance.now() - startedAt,
        results
    };
}

function percentile(sortedValues, q) {
    if (!sortedValues.length) return null;
    const index = Math.min(sortedValues.length - 1, Math.floor((sortedValues.length - 1) * q));
    return Math.round(sortedValues[index]);
}

async function runAudit(args) {
    const paths = extractPageResourcePaths(args.html, args.pagePath);
    if (args.listPaths) {
        console.log(paths.join("\n"));
        return null;
    }
    const agent = createAgent(args.origin);
    const requestOptions = {
        agent,
        timeoutMs: args.timeoutMs,
        maxRedirects: args.maxRedirects
    };
    const endAt = performance.now() + args.seconds * 1000;
    const pages = [];
    async function workerLoop() {
        while (performance.now() < endAt) {
            pages.push(await pageLoad(args.origin, paths, requestOptions));
        }
    }
    await Promise.all(Array.from({ length: args.vus }, workerLoop));
    agent.destroy();

    const allRequests = pages.flatMap((page) => page.results);
    const okRequests = allRequests.filter((result) => result.ok).length;
    const pageDurations = pages.map((page) => page.ms).sort((a, b) => a - b);
    const byStatus = {};
    let redirectCount = 0;
    let encodedBytes = 0;
    for (const result of allRequests) {
        byStatus[result.status] = (byStatus[result.status] || 0) + 1;
        redirectCount += result.redirects;
        encodedBytes += result.bytes;
    }
    const pageLoadsPerSecond = pages.length / args.seconds;
    const requestRps = allRequests.length / args.seconds;
    return {
        origin: args.origin,
        html: args.html,
        page_path: args.pagePath,
        virtual_users: args.vus,
        seconds: args.seconds,
        resources_per_page_load: paths.length,
        page_loads: pages.length,
        page_loads_per_second: round(pageLoadsPerSecond),
        request_rps: round(requestRps),
        ok_request_pct: allRequests.length ? round((okRequests / allRequests.length) * 100) : 0,
        page_p50_ms: percentile(pageDurations, 0.50),
        page_p95_ms: percentile(pageDurations, 0.95),
        page_p99_ms: percentile(pageDurations, 0.99),
        redirects: redirectCount,
        encoded_mb: round(encodedBytes / 1024 / 1024),
        estimated_users_one_load_per_30s: Math.floor(pageLoadsPerSecond * 30),
        estimated_users_one_load_per_60s: Math.floor(pageLoadsPerSecond * 60),
        by_status: byStatus
    };
}

function round(value) {
    return Math.round(value * 100) / 100;
}

function printText(result) {
    console.log("Auction King static capacity audit");
    console.log(`origin: ${result.origin}`);
    console.log(`html: ${result.html}`);
    console.log(`virtual users: ${result.virtual_users}`);
    console.log(`duration: ${result.seconds}s`);
    console.log(`resources/page-load: ${result.resources_per_page_load}`);
    console.log(`page-loads: ${result.page_loads} (${result.page_loads_per_second}/s)`);
    console.log(`requests: ${result.request_rps}/s, ok: ${result.ok_request_pct}%`);
    console.log(`page latency: p50=${result.page_p50_ms}ms p95=${result.page_p95_ms}ms p99=${result.page_p99_ms}ms`);
    console.log(`estimated concurrent users: ${result.estimated_users_one_load_per_30s} @ one full load/30s, ${result.estimated_users_one_load_per_60s} @ one full load/60s`);
    console.log(`status: ${JSON.stringify(result.by_status)}, redirects=${result.redirects}, encoded_mb=${result.encoded_mb}`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const result = await runAudit(args);
    if (!result) return;
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else printText(result);
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
