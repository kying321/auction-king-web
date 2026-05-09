const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.AUCTION_KING_DEFAULT_CONFIG = {};
global.document = {
    addEventListener() {}
};
delete require.cache[require.resolve("../src/browser/app.js")];
const {
    shouldFallbackToMainThreadFullSolve
} = require("../src/browser/app.js");
const {
    deriveAdaptiveSolverBudget
} = require("../src/core/estimator.js");
const {
    resolveTesseractTimeoutMs
} = require("../src/core/catalog_ocr_contour_runtime.js");
const {
    formatCodexVisualManualConfirmationResultsHtml
} = require("../scripts/build_codex_visual_manual_confirmation_results.js");

const ROOT_DIR = path.resolve(__dirname, "..");

function readHeaders(fileName) {
    return fs.readFileSync(path.join(ROOT_DIR, fileName), "utf8");
}

function headerFileExists(fileName) {
    return fs.existsSync(path.join(ROOT_DIR, fileName));
}

function assertStaticSecurityHeaders(headersText) {
    assert.match(headersText, /Content-Security-Policy:/);
    assert.match(headersText, /default-src 'self'/);
    assert.match(headersText, /script-src[^;]*https:\/\/static\.cloudflareinsights\.com/);
    assert.match(headersText, /style-src[^;]*https:\/\/fonts\.googleapis\.com/);
    assert.match(headersText, /font-src[^;]*https:\/\/fonts\.gstatic\.com/);
    assert.match(headersText, /connect-src[^;]*https:\/\/cloudflareinsights\.com/);
    assert.match(headersText, /frame-ancestors 'none'/);
    assert.match(headersText, /object-src 'none'/);
    assert.match(headersText, /base-uri 'self'/);
    assert.match(headersText, /X-Content-Type-Options: nosniff/);
    assert.match(headersText, /Referrer-Policy: strict-origin-when-cross-origin/);
    assert.match(headersText, /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\)/);
}

test("static deployment headers include browser-side hardening", () => {
    assertStaticSecurityHeaders(readHeaders("_headers"));
    if (headerFileExists("dist/_headers")) {
        assertStaticSecurityHeaders(readHeaders("dist/_headers"));
    }
});

test("adversarial solver config cannot raise local CPU budget above shipped caps", () => {
    const budget = deriveAdaptiveSolverBudget({
        solver: {
            max_states: Number.MAX_SAFE_INTEGER,
            mc_samples: Number.MAX_SAFE_INTEGER
        }
    }, {
        r1_total_items: 999,
        r1_blue_count: null,
        r2_orange_avg: null,
        r2_purple_count: null,
        r2_orange_count: null
    });

    assert.ok(budget.max_states <= 4000000, JSON.stringify(budget));
    assert.ok(budget.mc_samples <= 180000, JSON.stringify(budget));
});

test("full solver timeout does not fall back to main-thread recompute", () => {
    assert.equal(shouldFallbackToMainThreadFullSolve(new Error("后台求解超时（>10ms）")), false);
    assert.equal(shouldFallbackToMainThreadFullSolve(new Error("background solve timeout")), false);
    assert.equal(shouldFallbackToMainThreadFullSolve(new Error("Worker constructor unavailable")), true);
});

test("tesseract subprocess timeout is bounded by default and by user override", () => {
    assert.equal(resolveTesseractTimeoutMs({}), 5000);
    assert.equal(resolveTesseractTimeoutMs({ tesseractTimeoutMs: 1 }), 1);
    assert.equal(resolveTesseractTimeoutMs({ tesseractTimeoutMs: 60000 }), 5000);
    assert.equal(resolveTesseractTimeoutMs({ ocrTimeoutMs: 3500 }), 3500);
});

test("manual confirmation HTML neutralizes untrusted review metadata", () => {
    const html = formatCodexVisualManualConfirmationResultsHtml({
        schema_version: "ak_count_fit_sample_review_results_v1",
        generated_at: `</script><img src=x onerror=alert(1)>`,
        summary: {
            priority_counts: { P0: 1 },
            priority_filter: ["P0"]
        },
        fresh_capture_templates: [
            {
                source_task_id: `capture"><img src=x onerror=alert(1)>`,
                map_id: `sunken_ship<script>alert(1)</script>`,
                review_priority: "P0",
                review_reasons: [`reason<script>alert(1)</script>`],
                review_image_path: `/tmp/review"><img src=x onerror=alert(1)>.png`,
                samples: [
                    {
                        status: "needs_human_confirmation",
                        map_id: `sunken_ship<script>alert(1)</script>`,
                        event_timestamp: `2026-04-29T00:00:00.000Z"><img src=x onerror=alert(1)>`,
                        observed_state: { r1_total_items: 1 },
                        actual_counts: { w: 1, g: 0, b: 0, p: 0, o: 0, r: 0, total_items: 1 },
                        actual_counts_source: "manual_review",
                        pixel_training_label_allowed: false
                    }
                ]
            }
        ]
    }, "/tmp/manual-confirmation.json");

    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /\\u003c\/script\\u003e/);
    assert.doesNotMatch(html, /capture"><img/);
    assert.doesNotMatch(html, /reason<script>/);
    assert.doesNotMatch(html, /src="\/tmp\/review"><img/);
});
