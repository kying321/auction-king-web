const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildBidKingSteamDepotTableAcquisitionAttemptReport,
    formatBidKingSteamDepotTableAcquisitionAttemptMarkdown,
    main,
    redactSensitiveText,
    resolveArgs
} = require("../scripts/build_bidking_steam_depot_table_acquisition_attempt_report.js");

function sourceSearchReport() {
    return {
        schema_version: "ak_bidking_public_authority_source_search_v1",
        summary: {
            target_item_id: 1106013,
            current_full_client_depot_id: 4128581,
            current_full_client_build_id: "23055226",
            current_full_client_manifest_id: "7599723101430486725",
            current_full_client_item_txt_size: "487.41 KiB",
            current_full_client_drop_txt_size: "283.09 KiB",
            steam_current_full_client_path_viable: true,
            authority_intake_allowed: false,
            default_config_update_allowed: false
        },
        gates: {
            authority_intake_allowed: false,
            default_config_update_allowed: false
        }
    };
}

test("package exposes BidKing Steam depot table acquisition attempt builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-steam-depot-table-acquisition-attempt"],
        "node scripts/build_bidking_steam_depot_table_acquisition_attempt_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_bidking_steam_depot_table_acquisition_attempt_report\.js/);
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-05-07-bidking-steam-depot-table-acquisition-attempt-report.json"), true);
});

test("resolveArgs accepts source search report, output path, download dir, tool path, logs, and generated time", () => {
    const result = resolveArgs([
        "source.json",
        "attempt.json",
        "--download-dir=/tmp/tables",
        "--depotdownloader-path=/tmp/dd/DepotDownloader",
        "--depotdownloader-version=DepotDownloader v3.4.0",
        "--attempt-log=anonymous_noauth:1:/tmp/anonymous.log",
        "--generated-at=2026-05-07T23:35:00.000+08:00"
    ]);

    assert.equal(result.sourceSearchReportPath, path.resolve("source.json"));
    assert.equal(result.outputPath, path.resolve("attempt.json"));
    assert.equal(result.downloadDir, path.resolve("/tmp/tables"));
    assert.equal(result.depotDownloaderPath, path.resolve("/tmp/dd/DepotDownloader"));
    assert.equal(result.depotDownloaderVersion, "DepotDownloader v3.4.0");
    assert.deepEqual(result.attemptLogs, [
        { id: "anonymous_noauth", exit_code: 1, path: path.resolve("/tmp/anonymous.log") }
    ]);
    assert.equal(result.generatedAt, "2026-05-07T23:35:00.000+08:00");
});

test("attempt report records anonymous Steam access blocker and keeps all gates closed", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-attempt-empty-"));
    const depotDownloaderPath = path.join(tempDir, "DepotDownloader");
    fs.writeFileSync(depotDownloaderPath, "#!/bin/sh\n", "utf8");
    const report = buildBidKingSteamDepotTableAcquisitionAttemptReport({
        sourceSearchReport: sourceSearchReport(),
        generatedAt: "2026-05-07T23:35:00.000+08:00",
        downloadDir: tempDir,
        depotDownloaderPath,
        depotDownloaderVersion: "DepotDownloader v3.4.0",
        attempts: [
            {
                id: "anonymous_username_arg_crash",
                exit_code: 134,
                output: "Enter account password for \"anonymous\": LogOn requires a username and password or access token"
            },
            {
                id: "anonymous_noauth_blocked",
                exit_code: 1,
                output: "Logging anonymously into Steam3... Done! App 4128580 (BidKing) is not available from this account."
            }
        ]
    });

    assert.equal(report.schema_version, "ak_bidking_steam_depot_table_acquisition_attempt_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.equal(report.summary.download_attempted, true);
    assert.equal(report.summary.depotdownloader_available, true);
    assert.equal(report.summary.steam_account_access_blocked, true);
    assert.equal(report.summary.table_files_downloaded, false);
    assert.equal(report.summary.source_item_row_recovered, false);
    assert.equal(report.summary.target_item_id, 1106013);
    assert.equal(report.summary.current_full_client_depot_id, 4128581);
    assert.deepEqual(report.next_authenticated_commands.filelist_lines, [
        "regex:.*BidKing_Data/StreamingAssets/Tables/(Item|Drop)\\.txt$",
        "regex:.*Tables/(Item|Drop)\\.txt$"
    ]);
    assert.match(report.next_authenticated_commands.depotdownloader_command, /-app 4128580/);
    assert.match(report.next_authenticated_commands.depotdownloader_command, /<STEAM_USERNAME>/);
    assert.match(report.next_authenticated_commands.depotdownloader_command, /tables_owned/);
    assert.doesNotMatch(report.next_authenticated_commands.depotdownloader_command, /password/);
    assert.match(report.next_authenticated_commands.post_download_scan_command, /build:bidking-missing-item-source-recovery-scan/);
    assert.match(report.summary.recommended_next_action, /owned_authenticated_steam_account_or_developer_export/);
    assert.equal(report.gates.authority_intake_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
});

test("attempt report scans downloaded table files without promoting recovered rows", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-attempt-found-"));
    const tablesDir = path.join(tempDir, "BidKing_Data", "StreamingAssets", "Tables");
    fs.mkdirSync(tablesDir, { recursive: true });
    fs.writeFileSync(path.join(tablesDir, "Item.txt"), "1106013\tRecovered row\titemName_1106013\n", "utf8");
    fs.writeFileSync(path.join(tablesDir, "Drop.txt"), "1066\tfixture\tfixture\t[[106,1106013,1,1,3333]]\n", "utf8");

    const report = buildBidKingSteamDepotTableAcquisitionAttemptReport({
        sourceSearchReport: sourceSearchReport(),
        generatedAt: "2026-05-07T23:35:00.000+08:00",
        downloadDir: tempDir,
        attempts: [{ id: "owned_account_download", exit_code: 0, output: "Success" }]
    });

    assert.equal(report.summary.table_files_downloaded, true);
    assert.equal(report.summary.source_item_row_recovered, true);
    assert.equal(report.summary.authority_intake_allowed, false);
    assert.match(report.table_scan.source_item_row.snippet, /1106013/);
    assert.match(report.summary.recommended_next_action, /run_missing_item_staging_intake/);
});

test("attempt report marks downloaded base64 tables as inspected when target item row is absent", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-attempt-base64-missing-"));
    const tablesDir = path.join(tempDir, "BidKing_Data", "StreamingAssets", "Tables");
    fs.mkdirSync(tablesDir, { recursive: true });
    fs.writeFileSync(
        path.join(tablesDir, "Item.txt"),
        Buffer.from("1106012\tNeighbor row\titemName_1106012\n", "utf8").toString("base64"),
        "utf8"
    );
    fs.writeFileSync(
        path.join(tablesDir, "Drop.txt"),
        Buffer.from("1066\tfixture\tfixture\t[[106,1106013,1,1,3333]]\n", "utf8").toString("base64"),
        "utf8"
    );

    const report = buildBidKingSteamDepotTableAcquisitionAttemptReport({
        sourceSearchReport: sourceSearchReport(),
        generatedAt: "2026-05-09T21:10:00.000+08:00",
        downloadDir: tempDir,
        attempts: []
    });

    assert.equal(report.summary.download_attempted, true);
    assert.equal(report.summary.table_files_downloaded, true);
    assert.equal(report.summary.source_item_row_recovered, false);
    assert.match(report.summary.blockers.join(","), /downloaded_tables_missing_source_item_row_1106013/);
    assert.doesNotMatch(report.summary.blockers.join(","), /steam_depot_tables_not_downloaded/);
    assert.match(report.summary.recommended_next_action, /developer_or_server_side_table_export/);
});

test("redacts sensitive attempt log values", () => {
    assert.match(redactSensitiveText("password hunter2 access token abc"), /password <redacted>/);
    assert.doesNotMatch(redactSensitiveText("password hunter2 access token abc"), /hunter2/);
});

test("main writes JSON and Markdown acquisition attempt artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-attempt-main-"));
    const sourcePath = path.join(tempDir, "source.json");
    const outputPath = path.join(tempDir, "attempt.json");
    const logPath = path.join(tempDir, "anonymous.log");
    fs.writeFileSync(sourcePath, JSON.stringify(sourceSearchReport(), null, 2));
    fs.writeFileSync(logPath, "App 4128580 (BidKing) is not available from this account.\n");

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([
            sourcePath,
            outputPath,
            `--download-dir=${tempDir}`,
            `--attempt-log=anonymous_noauth_blocked:1:${logPath}`,
            "--generated-at=2026-05-07T23:35:00.000+08:00"
        ]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.steam_account_access_blocked, true);
    assert.match(markdown, /Steam depot table acquisition attempt/);
    assert.match(formatBidKingSteamDepotTableAcquisitionAttemptMarkdown(report), /4128581/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
