const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_ACQUISITION_QUEUE_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-count-fit-sample-acquisition-queue.json"
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
    "2026-04-25-count-fit-sample-acquisition-pack.json"
);
const FALLBACK_REQUIRED_SAME_BATTLE_FIELDS = [
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
        acquisitionQueuePath: positional[0] ? path.resolve(positional[0]) : DEFAULT_ACQUISITION_QUEUE_PATH,
        cleanReplayQueuePath: positional[1] ? path.resolve(positional[1]) : DEFAULT_CLEAN_REPLAY_QUEUE_PATH,
        outputPath: positional[2] ? path.resolve(positional[2]) : DEFAULT_OUTPUT_PATH,
        generatedAt
    };
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeItems(payload = {}) {
    if (Array.isArray(payload)) return payload;
    return payload && typeof payload === "object" && Array.isArray(payload.items) ? payload.items : [];
}

function finiteNonNegativeInteger(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function priorityRank(priority) {
    return { P0: 0, P1: 1, P2: 2, READY: 9 }[priority] ?? 8;
}

function sortedUniqueStrings(values = []) {
    return Array.from(new Set(values.filter((value) => value).map((value) => String(value)))).sort();
}

function buildCleanQueueIndex(cleanReplayQueue = {}) {
    const byId = new Map();
    const byMap = new Map();
    normalizeItems(cleanReplayQueue).forEach((item) => {
        if (!item || typeof item !== "object") return;
        if (item.id) byId.set(String(item.id), item);
        if (item.map_id) {
            const mapId = String(item.map_id);
            if (!byMap.has(mapId)) byMap.set(mapId, []);
            byMap.get(mapId).push(item);
        }
    });
    return { byId, byMap };
}

function resolveRequiredFields(acquisitionItem = {}, acquisitionQueue = {}) {
    if (Array.isArray(acquisitionItem.required_same_battle_fields)) {
        return acquisitionItem.required_same_battle_fields.slice();
    }
    if (acquisitionQueue.summary && Array.isArray(acquisitionQueue.summary.required_same_battle_fields)) {
        return acquisitionQueue.summary.required_same_battle_fields.slice();
    }
    return FALLBACK_REQUIRED_SAME_BATTLE_FIELDS.slice();
}

function resolveTaskAction(cleanQueueItem = {}) {
    if (cleanQueueItem.recommended_action === "pair_observed_state_and_actual_counts") {
        return "fill_same_battle_observed_state_and_actual_counts";
    }
    return "manual_pair_existing_candidate_or_discard";
}

function buildExistingCandidateTasks({ acquisitionItem = {}, cleanQueueIndex, acquisitionQueue = {} } = {}) {
    const requiredFields = resolveRequiredFields(acquisitionItem, acquisitionQueue);
    const candidateIds = Array.isArray(acquisitionItem.existing_candidate_ids)
        ? acquisitionItem.existing_candidate_ids.map((id) => String(id))
        : [];
    const candidates = candidateIds
        .map((id) => cleanQueueIndex.byId.get(id))
        .filter(Boolean);

    if (!candidates.length && acquisitionItem.map_id && cleanQueueIndex.byMap.has(acquisitionItem.map_id)) {
        candidates.push(...cleanQueueIndex.byMap.get(acquisitionItem.map_id));
    }

    return candidates.map((candidate) => ({
        id: `complete_${candidate.id || candidate.basename || acquisitionItem.map_id || "unknown"}`,
        task_type: "complete_existing_candidate",
        map_id: candidate.map_id || acquisitionItem.map_id || null,
        map_priority: acquisitionItem.priority || null,
        source_queue_id: candidate.id || null,
        basename: candidate.basename || null,
        candidate_priority: candidate.priority || null,
        candidate_recommended_action: candidate.recommended_action || null,
        task_action: resolveTaskAction(candidate),
        confirmed_sample_id: candidate.confirmed_sample_id || null,
        source_image_path: candidate.source_image_path || null,
        pixel_overlay_path: candidate.pixel_overlay_path || null,
        required_same_battle_fields: requiredFields,
        pixel_training_label_allowed: false,
        acceptance_criteria: [
            "same_battle_observed_state_and_actual_counts",
            "manual_actual_counts_source",
            "all_six_quality_counts_present_when_available",
            "actual_counts_total_matches_or_explicitly_marks_partial"
        ]
    }));
}

function buildFreshCaptureTask({ acquisitionItem = {}, existingCandidateCount = 0, acquisitionQueue = {} } = {}) {
    const target = finiteNonNegativeInteger(acquisitionItem.target_new_same_battle_samples);
    return {
        id: `fresh_same_battle_${acquisitionItem.map_id || "unknown"}`,
        task_type: "capture_fresh_same_battle_samples",
        map_id: acquisitionItem.map_id || null,
        map_priority: acquisitionItem.priority || null,
        target_same_battle_samples_if_existing_candidates_fail: target,
        target_same_battle_samples_after_all_existing_candidates_accepted: Math.max(0, target - existingCandidateCount),
        required_same_battle_fields: resolveRequiredFields(acquisitionItem, acquisitionQueue),
        capture_guardrails: [
            "record_observed_state_and_settlement_actual_counts_in_one_sample",
            "use_explicit_event_timestamp",
            "do_not_use_pixel_draft_as_training_label",
            "system_rounded_hints_are_context_not_actual_counts"
        ]
    };
}

function countByMap(tasks = []) {
    return tasks.reduce((result, task) => {
        const mapId = task.map_id || "unknown";
        result[mapId] = (result[mapId] || 0) + 1;
        return result;
    }, {});
}

function summarizePack({ acquisitionItems = [], existingCandidateTasks = [], freshCaptureTasks = [] } = {}) {
    const blockedMaps = sortedUniqueStrings(
        acquisitionItems
            .filter((item) => item && item.two_sigma_count_fit_allowed !== true)
            .map((item) => item.map_id)
    );
    return {
        blocked_map_count: blockedMaps.length,
        blocked_maps: blockedMaps,
        existing_candidate_task_count: existingCandidateTasks.length,
        pairable_candidate_task_count: existingCandidateTasks
            .filter((task) => task.task_action === "fill_same_battle_observed_state_and_actual_counts")
            .length,
        manual_pair_candidate_task_count: existingCandidateTasks
            .filter((task) => task.task_action === "manual_pair_existing_candidate_or_discard")
            .length,
        fresh_capture_map_count: freshCaptureTasks.length,
        total_fresh_same_battle_target_if_existing_candidates_fail: freshCaptureTasks.reduce(
            (sum, task) => sum + task.target_same_battle_samples_if_existing_candidates_fail,
            0
        ),
        total_fresh_same_battle_target_after_all_existing_candidates_accepted: freshCaptureTasks.reduce(
            (sum, task) => sum + task.target_same_battle_samples_after_all_existing_candidates_accepted,
            0
        ),
        existing_candidate_task_count_by_map: countByMap(existingCandidateTasks)
    };
}

function buildCountFitSampleAcquisitionPack({
    acquisitionQueue = {},
    cleanReplayQueue = {},
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const acquisitionItems = normalizeItems(acquisitionQueue)
        .filter((item) => item && item.two_sigma_count_fit_allowed !== true)
        .sort((left, right) => (
            priorityRank(left.priority) - priorityRank(right.priority)
            || String(left.map_id || "").localeCompare(String(right.map_id || ""))
        ));
    const cleanQueueIndex = buildCleanQueueIndex(cleanReplayQueue);
    const existingCandidateTasks = [];
    const freshCaptureTasks = [];

    acquisitionItems.forEach((item) => {
        const candidateTasks = buildExistingCandidateTasks({
            acquisitionItem: item,
            cleanQueueIndex,
            acquisitionQueue
        });
        existingCandidateTasks.push(...candidateTasks);
        freshCaptureTasks.push(buildFreshCaptureTask({
            acquisitionItem: item,
            existingCandidateCount: candidateTasks.length,
            acquisitionQueue
        }));
    });

    return {
        schema_version: "ak_count_fit_sample_acquisition_pack_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        inputs: {
            count_fit_sample_acquisition_queue: paths.acquisitionQueuePath || DEFAULT_ACQUISITION_QUEUE_PATH,
            clean_replay_candidate_queue: paths.cleanReplayQueuePath || DEFAULT_CLEAN_REPLAY_QUEUE_PATH
        },
        source_queue_generated_at: acquisitionQueue.generated_at || null,
        summary: summarizePack({ acquisitionItems, existingCandidateTasks, freshCaptureTasks }),
        existing_candidate_tasks: existingCandidateTasks,
        fresh_capture_tasks: freshCaptureTasks
    };
}

function markdownCode(value) {
    if (value === null || value === undefined || value === "") return "`-`";
    return `\`${String(value).replace(/`/g, "\\`")}\``;
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function tableRow(cells = []) {
    return `| ${cells.join(" | ")} |`;
}

function formatCountFitSampleAcquisitionPackMarkdown(pack, jsonPath = DEFAULT_OUTPUT_PATH) {
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const summary = pack.summary || {};
    const candidateRows = (pack.existing_candidate_tasks || []).map((task) => tableRow([
        markdownCode(task.map_priority),
        markdownCode(task.map_id),
        markdownCode(task.source_queue_id),
        markdownCode(task.basename),
        markdownCell(task.task_action),
        markdownCode(task.pixel_training_label_allowed),
        markdownCode(task.source_image_path)
    ])).join("\n");
    const freshRows = (pack.fresh_capture_tasks || []).map((task) => tableRow([
        markdownCode(task.map_priority),
        markdownCode(task.map_id),
        markdownCode(task.target_same_battle_samples_if_existing_candidates_fail),
        markdownCode(task.target_same_battle_samples_after_all_existing_candidates_accepted),
        markdownCell((task.required_same_battle_fields || []).join(", "))
    ])).join("\n");

    return `# count-fit sample acquisition pack

- change class: \`${pack.change_class || "RESEARCH_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- blocked maps: \`${summary.blocked_map_count || 0}\`
- existing candidate tasks: \`${summary.existing_candidate_task_count || 0}\`
- fresh target if existing candidates fail: \`${summary.total_fresh_same_battle_target_if_existing_candidates_fail || 0}\`
- fresh target after existing candidates accepted: \`${summary.total_fresh_same_battle_target_after_all_existing_candidates_accepted || 0}\`

## Existing Candidate Completion

| priority | map | source queue id | basename | action | pixel label allowed | source image |
| --- | --- | --- | --- | --- | --- | --- |
${candidateRows || "| `-` | `-` | `-` | `-` | - | `false` | `-` |"}

## Fresh Same-Battle Capture

| priority | map | target if candidates fail | target after candidates accepted | required fields |
| --- | --- | ---: | ---: | --- |
${freshRows || "| `-` | `-` | `0` | `0` | - |"}

## Guardrails

- same-battle means observed_state and settlement actual_counts come from one battle.
- pixel/OCR drafts remain review aids only.
- system-rounded hints are context, not actual_counts labels.
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
    const pack = buildCountFitSampleAcquisitionPack({
        acquisitionQueue: readJson(args.acquisitionQueuePath),
        cleanReplayQueue: readJson(args.cleanReplayQueuePath),
        generatedAt: args.generatedAt,
        paths: args
    });
    writeJson(args.outputPath, pack);
    fs.writeFileSync(
        args.outputPath.replace(/\.json$/i, ".md"),
        formatCountFitSampleAcquisitionPackMarkdown(pack, args.outputPath),
        "utf8"
    );
    process.stdout.write(`${args.outputPath}\n`);
    return pack;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_ACQUISITION_QUEUE_PATH,
    DEFAULT_CLEAN_REPLAY_QUEUE_PATH,
    DEFAULT_OUTPUT_PATH,
    FALLBACK_REQUIRED_SAME_BATTLE_FIELDS,
    buildCountFitSampleAcquisitionPack,
    formatCountFitSampleAcquisitionPackMarkdown,
    main,
    resolveArgs
};
