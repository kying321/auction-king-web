const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
    DEFAULT_CANDIDATE_CONFIG_PATH,
    DEFAULT_OUTPUT_PATH: DEFAULT_GATE_OUTPUT_PATH
} = require("./build_codex_visual_shadow_candidate_replay_gate.js");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_MANUAL_CANDIDATE_OUTPUT_PATH
} = require("./build_manual_count_prior_shadow_candidate_config.js");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_MANUAL_CANDIDATE_GATE_OUTPUT_PATH
} = require("./build_manual_count_prior_shadow_candidate_replay_gate.js");
const {
    DEFAULT_CHAIN_OUTPUT_PATH,
    DEFAULT_IMPORT_OUTPUT_PATH,
    main: refreshManualConfirmationChain
} = require("./refresh_codex_visual_manual_confirmation_chain.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_DOWNLOADS_DIR = path.join(os.homedir(), "Downloads");
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-latest-manual-confirmation-ingest-report.json"
);
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const CONFIRMATION_FILENAME_PATTERN = /manual[-_ ]count[-_ ]confirmation[-_ ]results|manual[-_ ]confirmation[-_ ]results/i;

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    const result = {
        confirmationResultsPath: null,
        downloadsDir: DEFAULT_DOWNLOADS_DIR,
        candidateConfigPath: DEFAULT_CANDIDATE_CONFIG_PATH,
        importOutputPath: DEFAULT_IMPORT_OUTPUT_PATH,
        gateOutputPath: DEFAULT_GATE_OUTPUT_PATH,
        manualCandidateOutputPath: DEFAULT_MANUAL_CANDIDATE_OUTPUT_PATH,
        manualCandidateGateOutputPath: DEFAULT_MANUAL_CANDIDATE_GATE_OUTPUT_PATH,
        chainOutputPath: DEFAULT_CHAIN_OUTPUT_PATH,
        outputPath: DEFAULT_OUTPUT_PATH,
        generatedAt: new Date().toISOString(),
        failOnBlockers: false,
        requiredPriority: null
    };
    const flagMap = {
        "--downloads-dir": "downloadsDir",
        "--candidate-config": "candidateConfigPath",
        "--import-output": "importOutputPath",
        "--gate-output": "gateOutputPath",
        "--manual-candidate-output": "manualCandidateOutputPath",
        "--manual-candidate-gate-output": "manualCandidateGateOutputPath",
        "--chain-output": "chainOutputPath",
        "--output": "outputPath",
        "--generated-at": "generatedAt"
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const eqIndex = String(arg).indexOf("=");
        const flagName = eqIndex > -1 ? String(arg).slice(0, eqIndex) : arg;
        const inlineValue = eqIndex > -1 ? String(arg).slice(eqIndex + 1) : null;
        if (arg === "--fail-on-blockers") {
            result.failOnBlockers = true;
        } else if (flagName === "--priority" || flagName === "--required-priority") {
            const value = inlineValue !== null ? inlineValue : argv[index + 1];
            if (value === undefined) throw new Error(`${flagName} 缺少值`);
            if (inlineValue === null) index += 1;
            result.requiredPriority = normalizePriority(value);
        } else if (flagMap[flagName]) {
            const value = inlineValue !== null ? inlineValue : argv[index + 1];
            if (value === undefined) throw new Error(`${flagName} 缺少值`);
            if (inlineValue === null) index += 1;
            const targetKey = flagMap[flagName];
            result[targetKey] = targetKey === "generatedAt" ? value : path.resolve(value);
        } else {
            positional.push(arg);
        }
    }

    if (positional.length > 1) {
        throw new Error("最多只接受 1 个位置参数: [manual-confirmation-results.json]");
    }
    if (positional[0]) result.confirmationResultsPath = path.resolve(positional[0]);
    return result;
}

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readJsonIfPossible(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (_error) {
        return null;
    }
}

function sumActualCounts(actualCounts = {}) {
    return QUALITY_ORDER.reduce((sum, quality) => sum + (Number(actualCounts[quality]) || 0), 0);
}

function hasFullIntegerCounts(actualCounts = {}) {
    return QUALITY_ORDER.every((quality) => (
        Number.isInteger(Number(actualCounts[quality]))
        && Number(actualCounts[quality]) >= 0
    ));
}

function flattenSamples(payload = {}) {
    const samples = [];
    (Array.isArray(payload.review_results) ? payload.review_results : []).forEach((entry) => {
        if (isPlainObject(entry)) samples.push(entry);
    });
    (Array.isArray(payload.fresh_capture_templates) ? payload.fresh_capture_templates : []).forEach((template) => {
        (Array.isArray(template.samples) ? template.samples : []).forEach((sample) => {
            if (isPlainObject(sample)) samples.push(sample);
        });
    });
    return samples;
}

function isManualConfirmationPayload(payload = {}) {
    return isPlainObject(payload)
        && payload.schema_version === "ak_count_fit_sample_review_results_v1"
        && flattenSamples(payload).length > 0;
}

function normalizePriority(value) {
    const priority = String(value || "").trim().toUpperCase();
    return priority || null;
}

function countPriorityEntries(values = []) {
    return values.reduce((result, value) => {
        const priority = normalizePriority(value);
        if (priority) result[priority] = (result[priority] || 0) + 1;
        return result;
    }, {});
}

function collectReviewPriorities(payload = {}) {
    const values = [];
    const summary = isPlainObject(payload.summary) ? payload.summary : {};
    if (isPlainObject(summary.priority_counts)) {
        values.push(...Object.keys(summary.priority_counts));
    }
    if (Array.isArray(summary.priority_filter)) {
        values.push(...summary.priority_filter);
    }
    (Array.isArray(payload.review_results) ? payload.review_results : []).forEach((entry) => {
        if (isPlainObject(entry)) values.push(entry.review_priority || entry.priority);
    });
    (Array.isArray(payload.fresh_capture_templates) ? payload.fresh_capture_templates : []).forEach((template) => {
        if (isPlainObject(template)) values.push(template.review_priority || template.priority);
        (Array.isArray(template.samples) ? template.samples : []).forEach((sample) => {
            if (isPlainObject(sample)) values.push(sample.review_priority || sample.priority);
        });
    });
    return Array.from(new Set(values.map(normalizePriority).filter(Boolean))).sort();
}

function summarizePriorityCounts(payload = {}) {
    const samplePriorities = flattenSamples(payload)
        .map((sample) => sample.review_priority || sample.priority)
        .map(normalizePriority)
        .filter(Boolean);
    if (samplePriorities.length) return countPriorityEntries(samplePriorities);
    const templatePriorities = (Array.isArray(payload.fresh_capture_templates) ? payload.fresh_capture_templates : [])
        .map((template) => template.review_priority || template.priority)
        .map(normalizePriority)
        .filter(Boolean);
    return countPriorityEntries(templatePriorities);
}

function summarizeManualConfirmationPayload(payload = {}) {
    const samples = flattenSamples(payload);
    let approvedCount = 0;
    let validCount = 0;
    let importReadyCount = 0;

    samples.forEach((sample) => {
        const status = String(sample.status || sample.review_status || "").trim().toLowerCase();
        const actualCounts = isPlainObject(sample.actual_counts) ? sample.actual_counts : {};
        const totalItems = Number(actualCounts.total_items);
        const qualitySum = sumActualCounts(actualCounts);
        const fullCounts = hasFullIntegerCounts(actualCounts);
        const valid = fullCounts && Number.isInteger(totalItems) && totalItems >= 0 && qualitySum === totalItems;
        const approved = status === "approved_count_fit_sample"
            || status === "count_fit_sample_ready"
            || status === "approved_same_battle_sample";
        if (approved) approvedCount += 1;
        if (valid) validCount += 1;
        if (approved && valid) importReadyCount += 1;
    });

    const summary = {
        sample_count: samples.length,
        valid_count: validCount,
        approved_count: approvedCount,
        import_ready_count: importReadyCount
    };
    const priorityCounts = summarizePriorityCounts(payload);
    if (Object.keys(priorityCounts).length) {
        summary.review_priorities = collectReviewPriorities(payload);
        summary.priority_counts = priorityCounts;
    }
    return summary;
}

function listManualConfirmationDownloads(downloadsDir = DEFAULT_DOWNLOADS_DIR) {
    if (!fs.existsSync(downloadsDir)) return [];
    return fs.readdirSync(downloadsDir)
        .filter((name) => name.endsWith(".json") && CONFIRMATION_FILENAME_PATTERN.test(name))
        .map((name) => {
            const filePath = path.join(downloadsDir, name);
            const stat = fs.statSync(filePath);
            const payload = readJsonIfPossible(filePath);
            return {
                path: filePath,
                name,
                mtimeMs: stat.mtimeMs,
                payload,
                is_manual_confirmation_payload: isManualConfirmationPayload(payload),
                summary: isManualConfirmationPayload(payload)
                    ? summarizeManualConfirmationPayload(payload)
                    : null
            };
        })
        .filter((entry) => entry.is_manual_confirmation_payload)
        .sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
}

function sourceMatchesPriority(source = {}, requiredPriority = null) {
    const priority = normalizePriority(requiredPriority);
    if (!priority) return true;
    const summary = source.summary || {};
    if (summary.priority_counts && Number(summary.priority_counts[priority] || 0) > 0) return true;
    if (Array.isArray(summary.review_priorities) && summary.review_priorities.includes(priority)) return true;
    return false;
}

function chooseManualConfirmationSource({
    confirmationResultsPath = null,
    downloadsDir = DEFAULT_DOWNLOADS_DIR,
    requiredPriority = null
} = {}) {
    if (confirmationResultsPath) {
        const payload = readJsonIfPossible(confirmationResultsPath);
        const source = {
            path: confirmationResultsPath,
            name: path.basename(confirmationResultsPath),
            mtimeMs: fs.existsSync(confirmationResultsPath) ? fs.statSync(confirmationResultsPath).mtimeMs : null,
            payload,
            is_manual_confirmation_payload: isManualConfirmationPayload(payload),
            summary: isManualConfirmationPayload(payload)
                ? summarizeManualConfirmationPayload(payload)
                : null
        };
        source.priority_matched = sourceMatchesPriority(source, requiredPriority);
        return {
            source,
            candidates: [],
            filtered_candidate_count: source.priority_matched ? 1 : 0
        };
    }
    const candidates = listManualConfirmationDownloads(downloadsDir);
    const filtered = candidates.filter((candidate) => sourceMatchesPriority(candidate, requiredPriority));
    return {
        source: filtered[0] || null,
        candidates,
        filtered_candidate_count: filtered.length
    };
}

function writeText(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
}

function writeJson(filePath, payload) {
    writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function formatMarkdown(report = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const blockers = report.blockers || [];
    const readiness = report.readiness || {};
    return [
        "# Latest Manual Confirmation Ingest",
        "",
        `- JSON: \`${path.relative(ROOT_DIR, outputPath)}\``,
        `- Source: \`${report.inputs && report.inputs.manual_confirmation_results ? report.inputs.manual_confirmation_results : "none"}\``,
        `- Status: \`${summary.status || "blocked"}\``,
        `- Accepted samples: \`${summary.accepted_sample_count || 0}\``,
        `- Blocked entries: \`${summary.blocked_entry_count || 0}\``,
        `- Manual candidate replay passed: \`${summary.manual_candidate_replay_passed === true}\``,
        `- Authority sample import ready: \`${readiness.authority_sample_import_ready === true}\``,
        `- Default weight update allowed: \`${readiness.default_weight_update_allowed === true}\``,
        `- Next action: \`${summary.recommended_next_action || "collect_human_confirmed_count_fit_samples"}\``,
        "",
        "## Blockers",
        ...(blockers.length ? blockers.map((blocker) => `- \`${blocker}\``) : ["- `none`"]),
        ""
    ].join("\n");
}

function buildMissingSourceReport({ args = {}, candidates = [] } = {}) {
    return {
        schema_version: "ak_latest_manual_confirmation_ingest_v1",
        generated_at: args.generatedAt,
        mode: "source_first_implementation",
        change_class: "RESEARCH_ONLY",
        inputs: {
            downloads_dir: args.downloadsDir,
            manual_confirmation_results: null,
            required_priority: args.requiredPriority || null
        },
        outputs: {
            ingest_report: args.outputPath
        },
        summary: {
            status: "missing_source",
            scanned_candidate_count: candidates.length,
            filtered_candidate_count: Number(args.filteredCandidateCount || 0),
            accepted_sample_count: 0,
            blocked_entry_count: 0,
            manual_candidate_replay_passed: false,
            recommended_next_action: "download_human_approved_manual_confirmation_json"
        },
        readiness: {
            authority_sample_import_ready: false,
            replay_candidate_ready: false,
            default_weight_update_allowed: false
        },
        blockers: [args.requiredPriority ? "missing_manual_confirmation_download_for_priority" : "missing_manual_confirmation_download"]
    };
}

function buildInvalidSourceReport({ args = {}, source = null } = {}) {
    return {
        schema_version: "ak_latest_manual_confirmation_ingest_v1",
        generated_at: args.generatedAt,
        mode: "source_first_implementation",
        change_class: "RESEARCH_ONLY",
        inputs: {
            downloads_dir: args.downloadsDir,
            manual_confirmation_results: source ? source.path : null,
            required_priority: args.requiredPriority || null
        },
        outputs: {
            ingest_report: args.outputPath
        },
        source_summary: source ? source.summary : null,
        summary: {
            status: "invalid_source",
            accepted_sample_count: 0,
            blocked_entry_count: 0,
            manual_candidate_replay_passed: false,
            recommended_next_action: "use_manual_confirmation_results_json"
        },
        readiness: {
            authority_sample_import_ready: false,
            replay_candidate_ready: false,
            default_weight_update_allowed: false
        },
        blockers: ["selected_file_is_not_manual_confirmation_results"]
    };
}

function buildPriorityMismatchReport({ args = {}, source = null } = {}) {
    return {
        schema_version: "ak_latest_manual_confirmation_ingest_v1",
        generated_at: args.generatedAt,
        mode: "source_first_implementation",
        change_class: "RESEARCH_ONLY",
        inputs: {
            downloads_dir: args.downloadsDir,
            manual_confirmation_results: source ? source.path : null,
            required_priority: args.requiredPriority || null
        },
        outputs: {
            ingest_report: args.outputPath
        },
        source_summary: source ? source.summary : null,
        summary: {
            status: "priority_mismatch",
            accepted_sample_count: 0,
            blocked_entry_count: 0,
            manual_candidate_replay_passed: false,
            recommended_next_action: "use_matching_priority_manual_confirmation_results_json"
        },
        readiness: {
            authority_sample_import_ready: false,
            replay_candidate_ready: false,
            default_weight_update_allowed: false
        },
        blockers: ["manual_confirmation_priority_mismatch"]
    };
}

function chooseIngestStatus({
    acceptedCount = 0,
    blockedCount = 0,
    manualReplayPassed = false,
    manualCandidateGateBlockers = []
} = {}) {
    if (acceptedCount <= 0) return "no_accepted_samples";
    if (blockedCount > 0) return "partial_or_invalid_confirmation";
    if (
        manualCandidateGateBlockers.includes("accepted_sample_count_below_minimum")
        || manualCandidateGateBlockers.includes("map_sample_count_below_minimum")
    ) {
        return "sample_count_below_minimum";
    }
    if (!manualReplayPassed) return "replay_blocked";
    return "replay_passed_review_required";
}

function buildIngestReport({ args = {}, source = {}, chainReports = {} } = {}) {
    const chainSummary = chainReports.chainReport && chainReports.chainReport.summary
        ? chainReports.chainReport.summary
        : {};
    const acceptedCount = Number(chainSummary.accepted_sample_count || 0);
    const blockedCount = Number(chainSummary.blocked_entry_count || 0);
    const manualReplayPassed = chainSummary.manual_candidate_replay_passed === true;
    const manualCandidateGateBlockers = Array.isArray(chainSummary.manual_candidate_gate_blockers)
        ? chainSummary.manual_candidate_gate_blockers.slice()
        : [];
    const status = chooseIngestStatus({
        acceptedCount,
        blockedCount,
        manualReplayPassed,
        manualCandidateGateBlockers
    });
    const blockers = [];
    if (acceptedCount <= 0) blockers.push("missing_accepted_manual_count_fit_samples");
    if (blockedCount > 0) blockers.push("manual_confirmation_import_contains_blocked_entries");
    if (!manualReplayPassed) blockers.push("manual_candidate_replay_gate_not_passed");
    manualCandidateGateBlockers.forEach((blocker) => {
        if (!blockers.includes(blocker)) blockers.push(blocker);
    });

    return {
        schema_version: "ak_latest_manual_confirmation_ingest_v1",
        generated_at: args.generatedAt,
        mode: "source_first_implementation",
        change_class: "RESEARCH_ONLY",
        inputs: {
            downloads_dir: args.downloadsDir,
            manual_confirmation_results: source.path,
            required_priority: args.requiredPriority || null,
            candidate_config: args.candidateConfigPath
        },
        outputs: {
            count_fit_sample_review_import: args.importOutputPath,
            codex_visual_shadow_candidate_replay_gate: args.gateOutputPath,
            manual_count_prior_shadow_candidate_config: args.manualCandidateOutputPath,
            manual_count_prior_shadow_candidate_replay_gate: args.manualCandidateGateOutputPath,
            chain_refresh_report: args.chainOutputPath,
            ingest_report: args.outputPath
        },
        source_summary: source.summary || null,
        summary: {
            status,
            accepted_sample_count: acceptedCount,
            blocked_entry_count: blockedCount,
            manual_candidate_replay_passed: manualReplayPassed,
            manual_candidate_gate_blockers: manualCandidateGateBlockers,
            recommended_next_action: chainSummary.manual_candidate_gate_recommended_next_action
                || chainSummary.gate_recommended_next_action
                || "collect_human_confirmed_count_fit_samples"
        },
        readiness: {
            authority_sample_import_ready: acceptedCount > 0 && blockedCount === 0,
            replay_candidate_ready: manualReplayPassed,
            default_weight_update_allowed: false
        },
        blockers
    };
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const { source, candidates } = chooseManualConfirmationSource({
        confirmationResultsPath: args.confirmationResultsPath,
        downloadsDir: args.downloadsDir,
        requiredPriority: args.requiredPriority
    });
    args.filteredCandidateCount = chooseManualConfirmationSource({
        confirmationResultsPath: null,
        downloadsDir: args.downloadsDir,
        requiredPriority: args.requiredPriority
    }).filtered_candidate_count;
    let report;

    if (!source) {
        report = buildMissingSourceReport({ args, candidates });
    } else if (!source.is_manual_confirmation_payload) {
        report = buildInvalidSourceReport({ args, source });
    } else if (source.priority_matched === false) {
        report = buildPriorityMismatchReport({ args, source });
    } else {
        const chainReports = refreshManualConfirmationChain([
            source.path,
            args.importOutputPath,
            args.gateOutputPath,
            "--candidate-config",
            args.candidateConfigPath,
            "--manual-candidate-output",
            args.manualCandidateOutputPath,
            "--manual-candidate-gate-output",
            args.manualCandidateGateOutputPath,
            "--chain-output",
            args.chainOutputPath,
            `--generated-at=${args.generatedAt}`
        ].filter((value) => value !== undefined));
        report = buildIngestReport({ args, source, chainReports });
    }

    writeJson(args.outputPath, report);
    writeText(args.outputPath.replace(/\.json$/i, ".md"), formatMarkdown(report, args.outputPath));
    if (args.failOnBlockers && report.blockers && report.blockers.length) {
        throw new Error(`latest manual confirmation ingest blockers: ${report.blockers.join(", ")}`);
    }
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    CONFIRMATION_FILENAME_PATTERN,
    DEFAULT_DOWNLOADS_DIR,
    DEFAULT_OUTPUT_PATH,
    chooseManualConfirmationSource,
    chooseIngestStatus,
    collectReviewPriorities,
    flattenSamples,
    isManualConfirmationPayload,
    listManualConfirmationDownloads,
    main,
    resolveArgs,
    summarizeManualConfirmationPayload
};
