const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_ASSEMBLY_PATH,
    buildBidKingDropHelperSemanticsReport,
    formatBidKingDropHelperSemanticsMarkdown
} = require("../scripts/build_bidking_drop_helper_semantics_report.js");

test("package exposes BidKing drop helper semantics entry", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    assert.match(packageJson.scripts["build:bidking-drop-helper-semantics"], /build_bidking_drop_helper_semantics_report\.js/);
    assert.match(packageJson.scripts["check:js"], /build_bidking_drop_helper_semantics_report\.js/);
});

test("local BidKing drop helper semantics report builds from assembly when available", () => {
    if (!fs.existsSync(DEFAULT_ASSEMBLY_PATH)) return;
    const report = buildBidKingDropHelperSemanticsReport();
    assert.equal(report.schema_version, "ak_bidking_drop_helper_semantics_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.summary.authority_adoption_allowed, false);
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.summary.parse_status, "drop_helper_semantics_candidate_built");
    assert.equal(report.summary.random_count_upper_bound_exclusive, true);
    assert.equal(report.summary.probability_mode_is_independent_bernoulli, true);
    assert.equal(report.summary.weighted_mode_is_single_cumulative_choice, true);

    const probability = report.helper_methods.find((entry) => entry.helper_key === "SelectByProbability/1");
    assert.ok(probability);
    assert.match(probability.semantics_candidate.semantics, /independent Bernoulli/);

    const randomCount = report.helper_methods.find((entry) => entry.helper_key === "RandomCount/2");
    assert.ok(randomCount.semantics_candidate.pseudocode.some((line) => /Random\(\)\.Next\(low, high\)/.test(line)));
    assert.match(formatBidKingDropHelperSemanticsMarkdown(report), /RandomCount upper bound exclusive/);
});
