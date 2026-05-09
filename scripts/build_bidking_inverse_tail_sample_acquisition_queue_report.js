const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_INVERSE_TAIL_REPLAY_GATE_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-05-07-bidking-inverse-tail-shadow-replay-gate-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-05-07-bidking-inverse-tail-sample-acquisition-queue.json"
);
const TARGET_ITEM_ID = 1106013;
const REQUIRED_SAME_BATTLE_FIELDS = [
    "map_id",
    "event_timestamp",
    "observed_state",
    "actual_counts.w",
    "actual_counts.g",
    "actual_counts.b",
    "actual_counts.p",
    "actual_counts.o",
    "actual_counts.r",
    "actual_counts.total_items",
    "actual_counts_source",
    "reviewer_notes"
];

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let generatedAt = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at requires an ISO timestamp");
            generatedAt = String(argv[index]);
        } else if (arg.startsWith("--generated-at=")) {
            generatedAt = arg.slice("--generated-at=".length);
        } else {
            positional.push(arg);
        }
    }

    return {
        inverseTailReplayGateReportPath: positional[0]
            ? path.resolve(positional[0])
            : DEFAULT_INVERSE_TAIL_REPLAY_GATE_REPORT_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        generatedAt
    };
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeText(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
}

function writeJson(filePath, payload) {
    writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function safeSummary(report) {
    return report && report.summary && typeof report.summary === "object" ? report.summary : {};
}

function safeGates(report) {
    return report && report.gates && typeof report.gates === "object" ? report.gates : {};
}

function toNonNegativeInteger(value) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function sortedEntries(object = {}) {
    return Object.entries(object || {}).sort(([left], [right]) => String(left).localeCompare(String(right)));
}

function formatReportPath(filePath) {
    if (!filePath) return null;
    const resolved = path.resolve(filePath);
    const relative = path.relative(ROOT_DIR, resolved);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        return relative.split(path.sep).join("/");
    }
    return filePath;
}

function buildAuthorityTask(summary) {
    if (summary.missing_1106013_source_recovered === true) return null;
    return {
        id: "inverse_tail_authority_gap_1106013",
        priority: "P0",
        task_type: "recover_missing_item_authority_row",
        target_item_id: TARGET_ITEM_ID,
        target_table: "Tables/Item.txt",
        target_raw_row_prefix: `${TARGET_ITEM_ID}\t`,
        recommended_action: "recover_raw_item_txt_row_with_provenance",
        blocking_gate: "source_item_row_recovered_for_project_scope",
        acceptance_criteria: [
            "raw Item.txt row begins with 1106013",
            "row has complete tab-delimited fields under current Table_Item schema",
            "source package provenance is recorded",
            "table reference integrity rerun shows no project-relevant missing terminal item ids"
        ],
        forbidden_actions: [
            "infer_1106013_from_neighbor_items",
            "synthesize_1106013_as_authority",
            "drop_tuple_to_unblock_map"
        ]
    };
}

function buildMapSampleTask(mapId, deficit, summary) {
    const acceptedByMap = summary.accepted_same_battle_sample_count_by_map || {};
    return {
        id: `inverse_tail_same_battle_gap_${mapId}`,
        priority: "P0",
        task_type: "capture_fresh_same_battle_samples",
        map_id: mapId,
        target_new_same_battle_samples: toNonNegativeInteger(deficit),
        current_accepted_same_battle_samples: toNonNegativeInteger(acceptedByMap[mapId]),
        min_same_battle_samples_per_impacted_map: toNonNegativeInteger(
            summary.min_same_battle_samples_per_impacted_map
        ),
        recommended_action: "capture_and_review_fresh_same_battle_count_fit_samples",
        output_target: "count_fit_same_battle_sample",
        required_fields: REQUIRED_SAME_BATTLE_FIELDS.slice(),
        acceptance_criteria: [
            "same_battle_observed_state_and_actual_counts",
            "all_six_quality_counts_present",
            "actual_counts_total_matches_total_items",
            "manual_or_authority_ready_count_source",
            "explicit_event_timestamp"
        ],
        blocked_until_review_import_accepts_samples: true
    };
}

function buildBidKingInverseTailSampleAcquisitionQueue({
    inverseTailReplayGateReport = readJson(DEFAULT_INVERSE_TAIL_REPLAY_GATE_REPORT_PATH),
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const summary = safeSummary(inverseTailReplayGateReport);
    const gates = safeGates(inverseTailReplayGateReport);
    const deficits = summary.same_battle_sample_deficit_by_impacted_map || {};
    const authorityTask = buildAuthorityTask(summary);
    const mapTasks = sortedEntries(deficits)
        .filter(([, deficit]) => toNonNegativeInteger(deficit) > 0)
        .map(([mapId, deficit]) => buildMapSampleTask(mapId, deficit, summary));
    const items = [authorityTask, ...mapTasks].filter(Boolean);
    const totalTargetSamples = mapTasks.reduce(
        (total, entry) => total + toNonNegativeInteger(entry.target_new_same_battle_samples),
        0
    );
    const queueStatus = items.length === 0 && gates.inverse_tail_shadow_replay_allowed === true
        ? "ready_for_shadow_replay_comparison"
        : "blocked_pending_authority_or_same_battle_samples";

    return {
        schema_version: "ak_bidking_inverse_tail_sample_acquisition_queue_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        inputs: {
            inverse_tail_shadow_replay_gate_report: formatReportPath(
                paths.inverseTailReplayGateReportPath || DEFAULT_INVERSE_TAIL_REPLAY_GATE_REPORT_PATH
            )
        },
        summary: {
            queue_status: queueStatus,
            authority_task_required: Boolean(authorityTask),
            map_sample_task_count: mapTasks.length,
            total_task_count: items.length,
            target_item_id: TARGET_ITEM_ID,
            impacted_project_maps: Array.isArray(summary.impacted_project_maps)
                ? summary.impacted_project_maps.slice()
                : [],
            total_target_new_same_battle_samples: totalTargetSamples,
            same_battle_sample_deficit_by_map: Object.fromEntries(
                sortedEntries(deficits).map(([mapId, deficit]) => [mapId, toNonNegativeInteger(deficit)])
            ),
            diagnostic_shadow_analysis_allowed: summary.diagnostic_shadow_analysis_allowed === true,
            inverse_tail_shadow_replay_allowed: summary.inverse_tail_shadow_replay_allowed === true,
            promotion_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            recommended_next_action: items.length
                ? "recover_1106013_authority_and_collect_impacted_map_same_battle_samples"
                : "run_shadow_replay_comparison_without_default_promotion",
            blockers: items.length
                ? [
                    "missing_authority_or_same_battle_samples",
                    "shadow_replay_not_default_promotion",
                    "authority_handoff_gate_closed"
                ]
                : [
                    "shadow_replay_not_default_promotion",
                    "authority_handoff_gate_closed",
                    "default_config_update_gate_closed"
                ]
        },
        gates: {
            diagnostic_shadow_analysis_allowed: summary.diagnostic_shadow_analysis_allowed === true,
            inverse_tail_shadow_replay_allowed: gates.inverse_tail_shadow_replay_allowed === true,
            promotion_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            source_item_row_recovered_for_project_scope: gates.source_item_row_recovered_for_project_scope === true,
            impacted_map_sample_count_ready: gates.impacted_map_sample_count_ready === true
        },
        items,
        maps: Object.fromEntries(mapTasks.map((entry) => [entry.map_id, entry])),
        authority_task: authorityTask,
        notes: [
            "This queue is derived from the inverse-tail shadow replay gate.",
            "It creates acquisition tasks only; it does not mutate runtime config or source tables.",
            "Accepted same-battle samples must re-enter through the existing review/import pipeline."
        ]
    };
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

function formatBidKingInverseTailSampleAcquisitionQueueMarkdown(queue, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = safeSummary(queue);
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;
    const rows = (queue.items || []).map((item) => (
        `| ${markdownCode(item.priority)} | ${markdownCode(item.task_type)} | ${markdownCode(item.map_id || item.target_item_id)} | ${markdownCode(item.target_new_same_battle_samples || 0)} | ${markdownCell(item.recommended_action)} |`
    )).join("\n");

    return `# BidKing inverse-tail sample acquisition queue

- Change class: \`${queue.change_class || "RESEARCH_ONLY"}\`
- Recommended change class: \`${queue.recommended_change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Queue status: \`${summary.queue_status || "unknown"}\`
- Authority task required: \`${summary.authority_task_required === true}\`
- Map sample tasks: \`${summary.map_sample_task_count || 0}\`
- Total target new same-battle samples: \`${summary.total_target_new_same_battle_samples || 0}\`
- Promotion allowed: \`${summary.promotion_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${queue.live_path_touched === true}\`

## Tasks

| priority | type | target | same-battle target | action |
| --- | --- | --- | ---: | --- |
${rows || "| `-` | `-` | `-` | `0` | - |"}

## Required Same-Battle Fields

${REQUIRED_SAME_BATTLE_FIELDS.map((field) => `- \`${field}\``).join("\n")}

## Decision

Collect only authority-grade \`1106013\` source evidence and reviewed same-battle samples. Do not use this queue to update default config or promote the inverse-tail candidate.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const queue = buildBidKingInverseTailSampleAcquisitionQueue({
        inverseTailReplayGateReport: readJson(args.inverseTailReplayGateReportPath),
        generatedAt: args.generatedAt || new Date().toISOString(),
        paths: {
            inverseTailReplayGateReportPath: args.inverseTailReplayGateReportPath
        }
    });
    writeJson(args.outputPath, queue);
    writeText(
        args.outputPath.replace(/\.json$/i, ".md"),
        formatBidKingInverseTailSampleAcquisitionQueueMarkdown(queue, args.outputPath)
    );
    process.stdout.write(`${args.outputPath}\n`);
    return queue;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    REQUIRED_SAME_BATTLE_FIELDS,
    buildBidKingInverseTailSampleAcquisitionQueue,
    formatBidKingInverseTailSampleAcquisitionQueueMarkdown,
    main,
    resolveArgs
};
