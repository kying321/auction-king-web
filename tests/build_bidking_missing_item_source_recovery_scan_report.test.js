const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildBidKingMissingItemSourceRecoveryScanReport,
    classifyTextHit,
    formatBidKingMissingItemSourceRecoveryScanMarkdown,
    main,
    resolveArgs,
    scanDirectoryForItemId
} = require("../scripts/build_bidking_missing_item_source_recovery_scan_report.js");

function writeFixtureFile(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
}

function buildCandidateReport(itemId = 5003) {
    return {
        schema_version: "ak_bidking_missing_item_resolution_candidate_v1",
        summary: {
            project_relevant_missing_item_ids: [itemId],
            default_config_update_allowed: false
        },
        missing_item_candidates: [
            {
                item_id: itemId,
                candidate_status: "unresolved_source_gap",
                source_item_record_found: false,
                project_map_ids: ["fixture_map"],
                reference_weights: [333],
                blockers: ["missing_item_source_row_unresolved"]
            }
        ]
    };
}

test("package exposes BidKing missing item source recovery scan builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-missing-item-source-recovery-scan"],
        "node scripts/build_bidking_missing_item_source_recovery_scan_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_bidking_missing_item_source_recovery_scan_report\.js/);
});

test("resolveArgs accepts candidate report, output path, scan sources, and generated time", () => {
    const result = resolveArgs([
        "candidate.json",
        "scan.json",
        "--source=/tmp/a",
        "--source",
        "/tmp/b",
        "--generated-at=2026-04-29T05:00:00.000+08:00"
    ]);

    assert.equal(result.missingItemCandidateReportPath, path.resolve("candidate.json"));
    assert.equal(result.outputPath, path.resolve("scan.json"));
    assert.deepEqual(result.scanSources, ["/tmp/a", "/tmp/b"]);
    assert.equal(result.generatedAt, "2026-04-29T05:00:00.000+08:00");
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-29-bidking-missing-item-source-recovery-scan-report.json"), true);
});

test("directory scan distinguishes source Item rows from Drop references", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-source-scan-"));
    writeFixtureFile(path.join(tempDir, "Tables", "Item.txt"), [
        "5001\tKnown item",
        "5003\tRecovered source row\titemName_5003"
    ].join("\n"));
    writeFixtureFile(path.join(tempDir, "Tables", "Drop.txt"), "10\tfixture\tfixture\t2\t[[50,5003,1,1,333]]\n");
    writeFixtureFile(path.join(tempDir, "filelist.txt"), "model/items/modle_5003.data\n");

    const result = scanDirectoryForItemId(tempDir, 5003);
    assert.equal(result.source_item_row_hits.length, 1);
    assert.equal(result.reference_hits.length, 1);
    assert.equal(result.path_hint_hits.length, 1);
    assert.equal(classifyTextHit({ filePath: path.join(tempDir, "Tables", "Item.txt"), line: "5003\tRecovered" }, 5003), "source_item_row");
});

test("source recovery report keeps recovered candidates non-authoritative until ingest and integrity rerun", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-source-found-"));
    writeFixtureFile(path.join(tempDir, "Tables", "Item.txt"), "5003\tRecovered source row\titemName_5003\n");
    writeFixtureFile(path.join(tempDir, "Tables", "Drop.txt"), "10\tfixture\tfixture\t2\t[[50,5003,1,1,333]]\n");

    const report = buildBidKingMissingItemSourceRecoveryScanReport({
        missingItemCandidateReport: buildCandidateReport(),
        scanSources: [tempDir],
        generatedAt: "2026-04-29T05:00:00.000+08:00"
    });

    assert.equal(report.schema_version, "ak_bidking_missing_item_source_recovery_scan_v1");
    assert.equal(report.change_class, "SIM_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.equal(report.summary.source_item_row_recovered_count, 1);
    assert.equal(report.summary.source_item_row_recovered_for_project_scope, true);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.equal(report.gates.authority_handoff_allowed, false);
    assert.match(report.summary.recommended_next_action, /ingest_recovered_item_rows/);
});

test("source recovery report redacts local absolute paths for public artifacts", () => {
    const homeDir = os.homedir();
    const report = buildBidKingMissingItemSourceRecoveryScanReport({
        missingItemCandidateReport: buildCandidateReport(1106013),
        scanSources: [
            path.join(homeDir, "Downloads", "BidKing_zip_extract_min"),
            path.join(homeDir, "Downloads", "BidKing"),
            path.join(homeDir, "Library", "Application Support", "Steam", "steamapps")
        ],
        generatedAt: "2026-05-09T19:20:00.000+08:00",
        paths: {
            missingItemCandidateReportPath: path.resolve("docs/research/fixture-candidate.json")
        }
    });

    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes(homeDir), false);
    assert.equal(report.inputs.missing_item_candidate_report, "<repo>/docs/research/fixture-candidate.json");
    assert.deepEqual(report.inputs.scan_sources, [
        "<local>/BidKing_zip_extract_min",
        "<local>/BidKing",
        "<steam>/steamapps"
    ]);
    assert.deepEqual(report.source_scans.map((entry) => entry.source_path), [
        "<local>/BidKing_zip_extract_min",
        "<local>/BidKing",
        "<steam>/steamapps"
    ]);

    const markdown = formatBidKingMissingItemSourceRecoveryScanMarkdown(report);
    assert.equal(markdown.includes(homeDir), false);
    assert.match(markdown, /<local>\/BidKing_zip_extract_min/);
    assert.match(markdown, /<steam>\/steamapps/);
});

test("source recovery report keeps skipped counts without publishing skipped file paths", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-source-skipped-"));
    writeFixtureFile(path.join(tempDir, "Tables", "Drop.txt"), "10\tfixture\tfixture\t2\t[[50,5003,1,1,333]]\n");
    fs.writeFileSync(path.join(tempDir, "payload.bin"), Buffer.from([0, 1, 2, 3]));

    const report = buildBidKingMissingItemSourceRecoveryScanReport({
        missingItemCandidateReport: buildCandidateReport(),
        scanSources: [tempDir],
        generatedAt: "2026-05-09T19:20:00.000+08:00"
    });
    const itemScan = report.source_scans[0].item_scans["5003"];

    assert.equal(itemScan.skipped_file_count, 1);
    assert.deepEqual(itemScan.skipped_files, []);
    assert.equal(JSON.stringify(report).includes("payload.bin"), false);
});

test("main writes JSON and Markdown source recovery scan artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-source-missing-"));
    const sourceDir = path.join(tempDir, "source");
    const candidatePath = path.join(tempDir, "candidate.json");
    const outputPath = path.join(tempDir, "scan.json");
    fs.mkdirSync(sourceDir, { recursive: true });
    writeFixtureFile(path.join(sourceDir, "Tables", "Drop.txt"), "10\tfixture\tfixture\t2\t[[50,5003,1,1,333]]\n");
    fs.writeFileSync(candidatePath, JSON.stringify(buildCandidateReport(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([candidatePath, outputPath, "--source", sourceDir, "--generated-at=2026-04-29T05:00:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.source_item_row_recovered_count, 0);
    assert.match(markdown, /source recovery scan/);
    assert.match(formatBidKingMissingItemSourceRecoveryScanMarkdown(report), /Source item row recovered/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
