const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildBidKingInverseTailShadowCandidateReport,
    fitLogWeightCurve,
    formatBidKingInverseTailShadowCandidateMarkdown,
    main,
    parseDropTableText,
    parseItemTableText,
    resolveArgs
} = require("../scripts/build_bidking_inverse_tail_shadow_candidate_report.js");

function buildFixtureTables() {
    const itemText = [
        "2001\tlow\tlow\titemName_2001\titemName_2001\tdesc\t[1]\t0\t6\t100000",
        "2002\tmid\tmid\titemName_2002\titemName_2002\tdesc\t[1]\t0\t6\t200000",
        "2003\thigh\thigh\titemName_2003\titemName_2003\tdesc\t[1]\t0\t6\t400000",
        "1006001\tjackpot\tjackpot\titemName_1006001\titemName_1006001\tdesc\t[100]\t0\t6\t19371213"
    ].join("\n");
    const dropText = [
        "1066\tfixture red group\tfixture red group\t2\t[[106,2001,1,1,8000],[106,2002,1,1,4000],[106,2003,1,1,2000],[106,1106013,1,1,3333],[100,1006001,1,1,5]]"
    ].join("\n");

    return {
        items: parseItemTableText(itemText),
        drops: parseDropTableText(dropText)
    };
}

test("package exposes BidKing inverse-tail shadow candidate builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-inverse-tail-shadow-candidate"],
        "node scripts/build_bidking_inverse_tail_shadow_candidate_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_bidking_inverse_tail_shadow_candidate_report\.js/);
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-05-07-bidking-inverse-tail-shadow-candidate-report.json"), true);
});

test("fitLogWeightCurve identifies an inverse value curve and beta=1 baseline", () => {
    const fit = fitLogWeightCurve([
        { item_id: 1, base_value: 100000, weight: 8000 },
        { item_id: 2, base_value: 200000, weight: 4000 },
        { item_id: 3, base_value: 400000, weight: 2000 }
    ]);

    assert.equal(fit.n, 3);
    assert.equal(fit.beta, 1);
    assert.equal(fit.correlation, -1);
    assert.equal(fit.r_squared, 1);
    assert.equal(fit.beta_one_mape, 0);
});

test("inverse-tail report keeps missing 1106013 as non-authority diagnostic", () => {
    const { items, drops } = buildFixtureTables();
    const report = buildBidKingInverseTailShadowCandidateReport({
        items,
        drops,
        generatedAt: "2026-05-07T21:00:00.000+08:00"
    });

    assert.equal(report.schema_version, "ak_bidking_inverse_tail_shadow_candidate_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.gates.authority_handoff_allowed, false);
    assert.equal(report.gates.promotion_allowed, false);
    assert.equal(report.summary.verdict, "inverse_value_supported_shadow_only");

    const group = report.drop_group_curve_fits.find((entry) => entry.group_id === 1066);
    assert.equal(group.beta, 1);
    assert.equal(group.known_item_count, 3);
    assert.equal(group.jackpot_item_count, 1);
    assert.deepEqual(group.missing_item_ids, [1106013]);
    assert.equal(group.missing_item_diagnostics[0].authority_allowed, false);
    assert.equal(group.missing_item_diagnostics[0].diagnostic_only, true);
    assert.equal(group.missing_item_diagnostics[0].implied_base_value_by_fitted_curve, 240024.0024);
    assert.equal(group.jackpot_residuals[0].item_id, 1006001);
    assert.ok(group.jackpot_residuals[0].actual_over_predicted_weight < 0.2);
});

test("main writes JSON and Markdown inverse-tail shadow candidate artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-inverse-tail-"));
    const tableRoot = path.join(tempDir, "Tables");
    const outputPath = path.join(tempDir, "inverse-tail.json");
    const { items, drops } = buildFixtureTables();
    fs.mkdirSync(tableRoot, { recursive: true });
    fs.writeFileSync(path.join(tableRoot, "Item.txt"), items.map((entry) => (
        `${entry.id}\t${entry.name}\t${entry.name}\titemName_${entry.id}\titemName_${entry.id}\tdesc\t[1]\t0\t${entry.quality}\t${entry.base_value}`
    )).join("\n"));
    fs.writeFileSync(path.join(tableRoot, "Drop.txt"), drops.map((entry) => (
        `${entry.group_id}\t${entry.name}\t${entry.name}\t${entry.weight_type}\t${JSON.stringify(entry.items_list)}`
    )).join("\n"));

    const args = resolveArgs([
        tableRoot,
        outputPath,
        "--generated-at=2026-05-07T21:00:00.000+08:00"
    ]);
    assert.equal(args.tableRoot, tableRoot);
    assert.equal(args.outputPath, outputPath);

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([tableRoot, outputPath, "--generated-at=2026-05-07T21:00:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.drop_group_fit_count, 1);
    assert.doesNotMatch(report.inputs.table_root, /^\/|^[A-Za-z]:/);
    assert.match(markdown, /inverse-tail shadow candidate/);
    assert.match(formatBidKingInverseTailShadowCandidateMarkdown(report), /Default config update allowed: `false`/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
