const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-05-07-bidking-public-authority-source-search-refresh-report.json"
);

const TARGET_ITEM_ID = 1106013;
const STEAM_CURRENT_FULL_CLIENT_DEPOT = {
    app_id: 4128580,
    depot_id: 4128581,
    branch: "public",
    build_id: "23055226",
    manifest_id: "7599723101430486725",
    item_txt_size: "487.41 KiB",
    drop_txt_size: "283.09 KiB"
};
const STEAM_DEMO_APP_DEPOT = {
    app_id: 4205000,
    depot_id: 4205001,
    branch: "public"
};

const STEAMDB_MANIFEST_HISTORY = [
    ["2026-03-27T10:07:30Z", "1315456865473715661", []],
    ["2026-03-08T04:43:10Z", "4886628206852187961", [
        "Modified BidKing_Data/StreamingAssets/Tables/BidMap.txt",
        "Modified BidKing_Data/StreamingAssets/Tables/UIWnd.txt"
    ]],
    ["2026-03-06T23:56:38Z", "5576874997177669598", []],
    ["2026-03-05T07:51:12Z", "8698809290618236723", []],
    ["2026-03-05T00:34:06Z", "4182572642630314667", []],
    ["2026-03-05T00:10:14Z", "2340981591259985735", []],
    ["2026-03-03T12:28:33Z", "2153546685868663515", []],
    ["2026-03-03T08:09:25Z", "5131151526784359445", []],
    ["2026-03-03T05:22:08Z", "6031622431758926749", []],
    ["2026-03-03T04:44:35Z", "5022372084761066812", []],
    ["2026-03-02T16:07:29Z", "6349242050786958380", []],
    ["2026-03-02T11:55:28Z", "5876006455415871414", []],
    ["2026-03-01T06:33:28Z", "2370499148997698552", []],
    ["2026-02-28T11:16:37Z", "3563099403767696362", []],
    ["2026-02-27T11:44:25Z", "8212627120037214570", []],
    ["2026-02-26T23:33:38Z", "2793736098442106886", []],
    ["2026-02-25T15:33:16Z", "9171888562104012148", []],
    ["2026-02-25T08:23:23Z", "6930259792601057946", []],
    ["2026-02-25T07:52:02Z", "151962360258298603", []],
    ["2026-02-24T12:36:09Z", "6596320064435764614", []],
    ["2026-02-24T11:15:35Z", "7487338112914403735", []],
    ["2026-02-24T05:12:37Z", "6641342558605775562", []],
    ["2026-02-23T18:52:15Z", "340218291271457690", []],
    ["2026-02-23T18:26:32Z", "7350724336958074923", []],
    ["2026-02-23T14:25:33Z", "4903037663004784443", []]
].map(([seenAtUtc, manifestId, tableChanges]) => ({
    seen_at_utc: seenAtUtc,
    manifest_id: manifestId,
    table_changes: tableChanges
}));

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let generatedAt = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at 需要提供 ISO 时间");
            generatedAt = String(argv[index]);
        } else if (arg.startsWith("--generated-at=")) {
            generatedAt = arg.slice("--generated-at=".length);
        } else {
            positional.push(arg);
        }
    }

    return {
        outputPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_OUTPUT_PATH,
        generatedAt
    };
}

function writeText(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
}

function writeJson(filePath, payload) {
    writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function markdownCode(value) {
    if (value === null || value === undefined || value === "") return "`-`";
    return `\`${String(value).replace(/`/g, "\\`")}\``;
}

function buildCandidatePaths() {
    return [
        {
            id: "steam_current_full_client_selective_tables_download",
            status: "source_candidate_requires_table_download_and_scan",
            change_class: "RESEARCH_ONLY",
            app_depot: {
                app_id: STEAM_CURRENT_FULL_CLIENT_DEPOT.app_id,
                depot_id: STEAM_CURRENT_FULL_CLIENT_DEPOT.depot_id,
                branch: STEAM_CURRENT_FULL_CLIENT_DEPOT.branch,
                build_id: STEAM_CURRENT_FULL_CLIENT_DEPOT.build_id,
                manifest_id: STEAM_CURRENT_FULL_CLIENT_DEPOT.manifest_id
            },
            filelist: [
                "BidKing/BidKing_Data/StreamingAssets/Tables/Item.txt",
                "BidKing/BidKing_Data/StreamingAssets/Tables/Drop.txt"
            ],
            visible_file_sizes: {
                item_txt: STEAM_CURRENT_FULL_CLIENT_DEPOT.item_txt_size,
                drop_txt: STEAM_CURRENT_FULL_CLIENT_DEPOT.drop_txt_size
            },
            requires_steam_login_or_ownership: true,
            expected_output_can_enter_intake_if_row_found: true,
            expected_output_can_enter_intake: false,
            priority_after_history_scan: "high",
            reason: "SteamDB current full-client depot exposes Item.txt and Drop.txt file entries, but not raw row contents.",
            acceptance_criteria: [
                "raw Item.txt row begins with 1106013",
                "Drop.txt reference context for group 1066 is preserved",
                "depot app id, depot id, build id, and manifest id are recorded",
                "table reference integrity rerun passes before any staging or handoff"
            ]
        },
        {
            id: "steam_older_manifest_selective_tables_download",
            status: "demoted_after_manifest_history_scan",
            change_class: "RESEARCH_ONLY",
            app_depot: STEAM_DEMO_APP_DEPOT,
            filelist: [
                "BidKing/BidKing_Data/StreamingAssets/Tables/Item.txt",
                "BidKing/BidKing_Data/StreamingAssets/Tables/Drop.txt"
            ],
            requires_steam_login_or_ownership: true,
            expected_output_can_enter_intake: false,
            priority_after_history_scan: "low",
            reason: "SteamDB logged-in manifest history shows no Item.txt changes across all visible manifests."
        },
        {
            id: "developer_or_server_side_table_export",
            status: "recommended",
            change_class: "RESEARCH_ONLY",
            required_evidence: [
                "raw Tables/Item.txt row beginning with 1106013\\t",
                "client build or server export version provenance",
                "matching Drop.txt reference context for group 1066"
            ],
            expected_output_can_enter_intake: true,
            priority_after_history_scan: "high"
        },
        {
            id: "independent_older_client_package_outside_visible_steam_history",
            status: "possible_but_unproven",
            change_class: "RESEARCH_ONLY",
            required_evidence: [
                "complete StreamingAssets/Tables export",
                "provenance predating or outside the 25 SteamDB-visible manifests",
                "Item.txt row for 1106013"
            ],
            expected_output_can_enter_intake: true,
            priority_after_history_scan: "medium"
        }
    ];
}

function buildBidKingPublicAuthoritySourceSearchReport({
    generatedAt = new Date().toISOString()
} = {}) {
    const itemTxtChangeManifests = STEAMDB_MANIFEST_HISTORY.filter((entry) => (
        entry.table_changes.some((change) => change.includes("/Item.txt"))
    ));
    const dropTxtChangeManifests = STEAMDB_MANIFEST_HISTORY.filter((entry) => (
        entry.table_changes.some((change) => change.includes("/Drop.txt"))
    ));
    const blockers = [
        "no_direct_public_item_row_found",
        "current_full_client_tables_not_downloaded",
        "steam_visible_manifest_history_has_no_item_txt_change",
        "current_public_manifest_has_authority_gap",
        "developer_or_server_side_table_export_required"
    ];

    return {
        schema_version: "ak_bidking_public_authority_source_search_v1",
        generated_at: generatedAt,
        mode: "architecture_review",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        live_path_touched: false,
        source_urls: [
            "https://steamdb.info/app/4128580/depots/",
            "https://steamdb.info/depot/4128581/apps/",
            "https://steamdb.info/depot/4128581/manifests/",
            "https://steamdb.info/depot/4205001/manifests/",
            "https://steamdb.info/depot/4205001/history/?changeid=M:4886628206852187961",
            "https://api.steamcmd.net/v1/info/4205000?pretty=1",
            "https://github.com/SteamRE/DepotDownloader/releases/latest"
        ],
        summary: {
            target_item_id: TARGET_ITEM_ID,
            direct_public_authority_item_row_found: false,
            current_public_manifest_has_authority_gap: true,
            steamdb_login_manifest_history_available: true,
            visible_manifest_count: STEAMDB_MANIFEST_HISTORY.length,
            visible_manifest_item_txt_change_count: itemTxtChangeManifests.length,
            visible_manifest_drop_txt_change_count: dropTxtChangeManifests.length,
            current_full_client_depot_id: STEAM_CURRENT_FULL_CLIENT_DEPOT.depot_id,
            current_full_client_build_id: STEAM_CURRENT_FULL_CLIENT_DEPOT.build_id,
            current_full_client_manifest_id: STEAM_CURRENT_FULL_CLIENT_DEPOT.manifest_id,
            current_full_client_depot_table_files_visible: true,
            current_full_client_item_txt_size: STEAM_CURRENT_FULL_CLIENT_DEPOT.item_txt_size,
            current_full_client_drop_txt_size: STEAM_CURRENT_FULL_CLIENT_DEPOT.drop_txt_size,
            steam_current_full_client_path_viable: true,
            current_public_manifest_id: "1315456865473715661",
            current_public_build_id: "22531236",
            app_id: STEAM_DEMO_APP_DEPOT.app_id,
            depot_id: STEAM_DEMO_APP_DEPOT.depot_id,
            steam_older_manifest_path_viable: false,
            authority_intake_allowed: false,
            staging_item_ingest_allowed: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            recommended_next_action: "selectively_download_current_full_client_tables_then_scan_1106013",
            blockers
        },
        gates: {
            authority_intake_allowed: false,
            staging_item_ingest_allowed: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            synthetic_item_as_authority_allowed: false,
            drop_tuple_exclusion_as_authority_allowed: false
        },
        steam_app_depot: STEAM_DEMO_APP_DEPOT,
        steam_current_full_client_depot: STEAM_CURRENT_FULL_CLIENT_DEPOT,
        steam_demo_app_depot: STEAM_DEMO_APP_DEPOT,
        steamdb_manifest_history: STEAMDB_MANIFEST_HISTORY,
        candidate_paths: buildCandidatePaths(),
        notes: [
            "SteamDB login exposed 25 previously seen depot manifests.",
            "No visible manifest history entry modified BidKing_Data/StreamingAssets/Tables/Item.txt.",
            "The only visible table changes were BidMap.txt and UIWnd.txt in manifest 4886628206852187961.",
            "This artifact does not synthesize the missing item row and does not open any promotion gate."
        ]
    };
}

function formatBidKingPublicAuthoritySourceSearchMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;
    const manifestRows = (report.steamdb_manifest_history || []).map((entry) => (
        `| ${markdownCode(entry.seen_at_utc)} | ${markdownCode(entry.manifest_id)} | ${markdownCell(JSON.stringify(entry.table_changes || []))} |`
    )).join("\n");
    const candidateRows = (report.candidate_paths || []).map((entry) => (
        `| ${markdownCode(entry.id)} | ${markdownCode(entry.status)} | ${markdownCode(entry.priority_after_history_scan)} | ${markdownCode(entry.expected_output_can_enter_intake === true ? "true" : entry.expected_output_can_enter_intake_if_row_found === true ? "if_row_found" : "false")} |`
    )).join("\n");

    return `# BidKing public authority source search

- Change class: \`${report.change_class || "RESEARCH_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Target item id: \`${summary.target_item_id || TARGET_ITEM_ID}\`
- Direct public authority row found: \`${summary.direct_public_authority_item_row_found === true}\`
- Current full-client depot: \`${summary.current_full_client_depot_id || "-"}\`
- Current full-client table files visible: \`${summary.current_full_client_depot_table_files_visible === true}\`
- Current full-client Item.txt size: \`${summary.current_full_client_item_txt_size || "-"}\`
- SteamDB visible manifest count: \`${summary.visible_manifest_count || 0}\`
- Visible Item.txt change count: \`${summary.visible_manifest_item_txt_change_count || 0}\`
- Current full-client path viable: \`${summary.steam_current_full_client_path_viable === true}\`
- Steam older manifest path viable: \`${summary.steam_older_manifest_path_viable === true}\`
- Authority intake allowed: \`${summary.authority_intake_allowed === true}\`
- Staging item ingest allowed: \`${summary.staging_item_ingest_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Manifest History

| seen at UTC | manifest | table changes |
| --- | --- | --- |
${manifestRows}

## Candidate Paths

| path | status | priority | can enter intake |
| --- | --- | --- | --- |
${candidateRows}

## Blockers

${(summary.blockers || []).map((blocker) => `- \`${blocker}\``).join("\n") || "- `none`"}

## Decision

Logged-in SteamDB history does not show any visible demo-depot \`Item.txt\` change, so old public demo manifest download is demoted. The next source-recovery path is selective download of current full-client depot tables, followed by a raw \`1106013\\t\` scan. If that row is still absent, fall back to developer/server-side table export or an independently sourced complete \`StreamingAssets/Tables\` package.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildBidKingPublicAuthoritySourceSearchReport({
        generatedAt: args.generatedAt || new Date().toISOString()
    });
    writeJson(args.outputPath, report);
    writeText(
        args.outputPath.replace(/\.json$/i, ".md"),
        formatBidKingPublicAuthoritySourceSearchMarkdown(report, args.outputPath)
    );
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    STEAM_CURRENT_FULL_CLIENT_DEPOT,
    STEAM_DEMO_APP_DEPOT,
    STEAMDB_MANIFEST_HISTORY,
    buildBidKingPublicAuthoritySourceSearchReport,
    formatBidKingPublicAuthoritySourceSearchMarkdown,
    main,
    resolveArgs
};
