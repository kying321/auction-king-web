const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");

function loadBuilder() {
    return require("../scripts/build_bidking_public_authority_source_search_report.js");
}

test("package exposes BidKing public authority source search builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-public-authority-source-search"],
        "node scripts/build_bidking_public_authority_source_search_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_bidking_public_authority_source_search_report\.js/);
});

test("resolveArgs accepts output path and generated time", () => {
    const { DEFAULT_OUTPUT_PATH, resolveArgs } = loadBuilder();
    const result = resolveArgs([
        "search-report.json",
        "--generated-at=2026-04-29T09:05:00.000+08:00"
    ]);

    assert.equal(result.outputPath, path.resolve("search-report.json"));
    assert.equal(result.generatedAt, "2026-04-29T09:05:00.000+08:00");
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-29-bidking-public-authority-source-search-report.json"), true);
});

test("public authority source search report keeps current unresolved item fail-closed", () => {
    const { buildBidKingPublicAuthoritySourceSearchReport } = loadBuilder();
    const report = buildBidKingPublicAuthoritySourceSearchReport({
        generatedAt: "2026-04-29T09:05:00.000+08:00"
    });

    assert.equal(report.schema_version, "ak_bidking_public_authority_source_search_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.equal(report.summary.target_item_id, 1106013);
    assert.equal(report.summary.direct_public_authority_item_row_found, false);
    assert.equal(report.summary.current_public_manifest_has_authority_gap, true);
    assert.equal(report.summary.steamdb_login_manifest_history_available, true);
    assert.equal(report.summary.visible_manifest_count, 25);
    assert.equal(report.summary.visible_manifest_item_txt_change_count, 0);
    assert.equal(report.summary.steam_older_manifest_path_viable, false);
    assert.equal(report.gates.authority_intake_allowed, false);
    assert.equal(report.gates.staging_item_ingest_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.match(report.summary.blockers.join(","), /no_direct_public_item_row_found/);
    assert.match(report.summary.blockers.join(","), /steam_visible_manifest_history_has_no_item_txt_change/);
    assert.match(report.summary.recommended_next_action, /developer_or_server_side_table_export/);
});

test("report records SteamDB manifest history and demotes old-depot download after no Item.txt changes", () => {
    const { buildBidKingPublicAuthoritySourceSearchReport } = loadBuilder();
    const report = buildBidKingPublicAuthoritySourceSearchReport({
        generatedAt: "2026-04-29T09:05:00.000+08:00"
    });
    const selectiveDownload = report.candidate_paths.find((entry) => entry.id === "steam_older_manifest_selective_tables_download");

    assert.ok(selectiveDownload);
    assert.equal(selectiveDownload.change_class, "RESEARCH_ONLY");
    assert.deepEqual(selectiveDownload.app_depot, {
        app_id: 4205000,
        depot_id: 4205001,
        branch: "public"
    });
    assert.deepEqual(selectiveDownload.filelist, [
        "BidKing/BidKing_Data/StreamingAssets/Tables/Item.txt",
        "BidKing/BidKing_Data/StreamingAssets/Tables/Drop.txt"
    ]);
    assert.equal(selectiveDownload.requires_steam_login_or_ownership, true);
    assert.equal(selectiveDownload.expected_output_can_enter_intake, false);
    assert.equal(selectiveDownload.priority_after_history_scan, "low");
    assert.equal(report.steamdb_manifest_history.find((entry) => entry.manifest_id === "4886628206852187961").table_changes.length, 2);
});

test("main writes JSON and Markdown public authority source search artifacts", () => {
    const {
        formatBidKingPublicAuthoritySourceSearchMarkdown,
        main
    } = loadBuilder();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-public-source-search-"));
    const outputPath = path.join(tempDir, "search-report.json");

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([outputPath, "--generated-at=2026-04-29T09:05:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.generated_at, "2026-04-29T09:05:00.000+08:00");
    assert.match(markdown, /BidKing public authority source search/);
    assert.match(markdown, /steam_older_manifest_selective_tables_download/);
    assert.match(formatBidKingPublicAuthoritySourceSearchMarkdown(report, outputPath), /Authority intake allowed/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
