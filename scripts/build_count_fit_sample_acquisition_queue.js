const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_READINESS_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-settlement-count-fit-readiness-report.json"
);
const DEFAULT_CLEAN_REPLAY_QUEUE_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-24-clean-replay-candidate-queue.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-count-fit-sample-acquisition-queue.json"
);
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
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
    let generatedAt = new Date().toISOString();
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at 需要提供 ISO 时间");
            generatedAt = argv[index];
        } else if (String(arg).startsWith("--generated-at=")) {
            generatedAt = String(arg).slice("--generated-at=".length);
        } else {
            positional.push(arg);
        }
    }
    return {
        readinessReportPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_READINESS_REPORT_PATH,
        cleanReplayQueuePath: positional[1] ? path.resolve(positional[1]) : DEFAULT_CLEAN_REPLAY_QUEUE_PATH,
        outputPath: positional[2] ? path.resolve(positional[2]) : DEFAULT_OUTPUT_PATH,
        generatedAt
    };
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNonNegativeInteger(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function normalizeQualityCounts(counts = {}) {
    return QUALITY_ORDER.reduce((result, quality) => {
        result[quality] = finiteNonNegativeInteger(counts && counts[quality], 0);
        return result;
    }, {});
}

function maxQualityGap(fitGapByQuality = {}) {
    return Math.max(...QUALITY_ORDER.map((quality) => finiteNonNegativeInteger(fitGapByQuality[quality], 0)));
}

function getQueueItems(cleanReplayQueue = {}) {
    if (Array.isArray(cleanReplayQueue)) return cleanReplayQueue;
    return Array.isArray(cleanReplayQueue.items) ? cleanReplayQueue.items : [];
}

function buildCandidateIndex(cleanReplayQueue = {}) {
    const index = new Map();
    getQueueItems(cleanReplayQueue).forEach((item) => {
        const mapId = item && item.map_id ? String(item.map_id) : "";
        if (!mapId) return;
        if (!index.has(mapId)) {
            index.set(mapId, {
                existing_candidate_count: 0,
                pairable_candidate_count: 0,
                manual_pair_candidate_count: 0,
                confirmed_settlement_candidate_count: 0,
                candidate_ids: []
            });
        }
        const entry = index.get(mapId);
        entry.existing_candidate_count += 1;
        if (item.recommended_action === "pair_observed_state_and_actual_counts") {
            entry.pairable_candidate_count += 1;
        }
        if (item.recommended_action === "manual_pair_or_discard") {
            entry.manual_pair_candidate_count += 1;
        }
        if (item.confirmed_sample_id) entry.confirmed_settlement_candidate_count += 1;
        if (item.id) entry.candidate_ids.push(String(item.id));
    });
    return index;
}

function resolvePriority({ blocked, candidateSummary }) {
    if (!blocked) return "READY";
    if (candidateSummary.pairable_candidate_count > 0) return "P0";
    if (candidateSummary.existing_candidate_count > 0) return "P1";
    return "P2";
}

function resolveRecommendedAction(priority) {
    if (priority === "READY") return "no_action";
    if (priority === "P0") return "finish_existing_settlement_only_pairs";
    if (priority === "P1") return "manual_pair_existing_candidates_or_run_fresh_same_battle_samples";
    return "run_fresh_same_battle_samples";
}

function buildMapItem(mapEntry = {}, candidateSummary = {}) {
    const fitGapByQuality = normalizeQualityCounts(mapEntry.fit_gap_by_quality);
    const countFitScoredByQuality = normalizeQualityCounts(mapEntry.count_fit_scored_sample_count_by_quality);
    const fullCountFitScoredGap = finiteNonNegativeInteger(
        mapEntry.full_count_fit_scored_gap,
        finiteNonNegativeInteger(mapEntry.full_count_fit_scored_sample_count) > 0 ? 0 : maxQualityGap(fitGapByQuality)
    );
    const targetNewSameBattleSamples = Math.max(fullCountFitScoredGap, maxQualityGap(fitGapByQuality));
    const blocked = mapEntry.two_sigma_count_fit_allowed !== true;
    const priority = resolvePriority({ blocked, candidateSummary });
    return {
        id: `count_fit_sample_gap_${mapEntry.map_id || "unknown"}`,
        map_id: mapEntry.map_id || "unknown",
        priority,
        recommended_action: resolveRecommendedAction(priority),
        two_sigma_count_fit_allowed: mapEntry.two_sigma_count_fit_allowed === true,
        current_full_count_fit_scored_sample_count: finiteNonNegativeInteger(mapEntry.full_count_fit_scored_sample_count),
        required_full_count_fit_scored_sample_count: finiteNonNegativeInteger(
            mapEntry.full_count_fit_scored_sample_count
        ) + fullCountFitScoredGap,
        full_count_fit_scored_gap: fullCountFitScoredGap,
        target_new_same_battle_samples: targetNewSameBattleSamples,
        count_fit_scored_sample_count_by_quality: countFitScoredByQuality,
        fit_gap_by_quality: fitGapByQuality,
        risk_flags: Array.isArray(mapEntry.risk_flags) ? mapEntry.risk_flags.slice() : [],
        existing_candidate_summary: candidateSummary,
        existing_candidate_ids: Array.isArray(candidateSummary.candidate_ids)
            ? candidateSummary.candidate_ids.slice(0, 12)
            : [],
        required_same_battle_fields: REQUIRED_SAME_BATTLE_FIELDS.slice(),
        acceptance_criteria: [
            "same_battle_observed_state_and_actual_counts",
            "all_six_quality_counts_present",
            "actual_counts_total_matches_total_items",
            "manual_or_authority_ready_count_source",
            "explicit_event_timestamp"
        ]
    };
}

function priorityRank(priority) {
    return { P0: 0, P1: 1, P2: 2, READY: 9 }[priority] ?? 8;
}

function summarizeItems(items = []) {
    return items.reduce((summary, item) => {
        summary.map_count += 1;
        if (item.two_sigma_count_fit_allowed) summary.ready_map_count += 1;
        else summary.blocked_map_count += 1;
        summary.total_full_count_fit_scored_gap += item.full_count_fit_scored_gap;
        summary.total_target_new_same_battle_samples += item.target_new_same_battle_samples;
        summary.priority_counts[item.priority] = (summary.priority_counts[item.priority] || 0) + 1;
        return summary;
    }, {
        map_count: 0,
        ready_map_count: 0,
        blocked_map_count: 0,
        total_full_count_fit_scored_gap: 0,
        total_target_new_same_battle_samples: 0,
        priority_counts: {},
        required_same_battle_fields: REQUIRED_SAME_BATTLE_FIELDS.slice()
    });
}

function buildCountFitSampleAcquisitionQueue({
    readinessReport = {},
    cleanReplayQueue = {},
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const candidateIndex = buildCandidateIndex(cleanReplayQueue);
    const mapEntries = isPlainObject(readinessReport.maps) ? Object.values(readinessReport.maps) : [];
    const items = mapEntries.map((entry) => {
        const mapId = entry.map_id || "unknown";
        const candidateSummary = candidateIndex.get(mapId) || {
            existing_candidate_count: 0,
            pairable_candidate_count: 0,
            manual_pair_candidate_count: 0,
            confirmed_settlement_candidate_count: 0,
            candidate_ids: []
        };
        return buildMapItem(entry, candidateSummary);
    }).sort((left, right) => (
        priorityRank(left.priority) - priorityRank(right.priority)
        || right.target_new_same_battle_samples - left.target_new_same_battle_samples
        || String(left.map_id).localeCompare(String(right.map_id))
    ));

    return {
        schema_version: "ak_count_fit_sample_acquisition_queue_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        inputs: {
            settlement_count_fit_readiness_report: paths.readinessReportPath || DEFAULT_READINESS_REPORT_PATH,
            clean_replay_candidate_queue: paths.cleanReplayQueuePath || DEFAULT_CLEAN_REPLAY_QUEUE_PATH
        },
        thresholds: isPlainObject(readinessReport.thresholds) ? readinessReport.thresholds : {},
        summary: summarizeItems(items),
        items,
        maps: Object.fromEntries(items.map((item) => [item.map_id, item]))
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

function compactQualityCounts(counts = {}) {
    return QUALITY_ORDER.map((quality) => `${quality}:${finiteNonNegativeInteger(counts[quality])}`).join(" ");
}

function formatCountFitSampleAcquisitionMarkdown(queue, jsonPath = DEFAULT_OUTPUT_PATH) {
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const rows = (queue.items || []).map((item) => `| ${[
        markdownCode(item.priority),
        markdownCode(item.map_id),
        markdownCode(item.target_new_same_battle_samples),
        markdownCode(item.current_full_count_fit_scored_sample_count),
        markdownCell(compactQualityCounts(item.fit_gap_by_quality)),
        markdownCode(item.existing_candidate_summary && item.existing_candidate_summary.existing_candidate_count),
        markdownCode(item.existing_candidate_summary && item.existing_candidate_summary.pairable_candidate_count),
        markdownCell(item.recommended_action),
        markdownCell((item.risk_flags || []).join(", "))
    ].join(" | ")} |`).join("\n");

    return `# count-fit sample acquisition queue

- change class: \`${queue.change_class || "RESEARCH_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- blocked maps: \`${queue.summary ? queue.summary.blocked_map_count : 0}\`
- total same-battle samples needed: \`${queue.summary ? queue.summary.total_target_new_same_battle_samples : 0}\`
- required fields: \`${(queue.summary && queue.summary.required_same_battle_fields || []).join(", ")}\`

## Map queue

| priority | map | same-battle target | current scored | quality gaps | existing candidates | pairable candidates | action | risk flags |
| --- | --- | ---: | ---: | --- | ---: | ---: | --- | --- |
${rows || "| `-` | `-` | `0` | `0` | - | `0` | `0` | - | - |"}

## Acceptance criteria

- Use same-battle observed state and settlement actual counts in one sample record.
- Include all six quality counts plus total item cross-check.
- Pixel/OCR drafts are review aids only; they are not count-fit training labels.
`;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const queue = buildCountFitSampleAcquisitionQueue({
        readinessReport: readJson(args.readinessReportPath),
        cleanReplayQueue: readJson(args.cleanReplayQueuePath),
        generatedAt: args.generatedAt,
        paths: args
    });
    writeJson(args.outputPath, queue);
    fs.writeFileSync(
        args.outputPath.replace(/\.json$/i, ".md"),
        formatCountFitSampleAcquisitionMarkdown(queue, args.outputPath),
        "utf8"
    );
    process.stdout.write(`${args.outputPath}\n`);
    return queue;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CLEAN_REPLAY_QUEUE_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_READINESS_REPORT_PATH,
    REQUIRED_SAME_BATTLE_FIELDS,
    buildCountFitSampleAcquisitionQueue,
    buildCandidateIndex,
    formatCountFitSampleAcquisitionMarkdown,
    main,
    resolveArgs
};
