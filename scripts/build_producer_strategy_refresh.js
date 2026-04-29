const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");
const { buildSettlementCountReplayReport } = require("../sample_count_replay.js");
const { buildDefaultWeightImplementationReport } = require("../default_weight_implementation_report.js");
const { buildProducerStrategyArchitectureReport } = require("../producer_strategy_architecture_report.js");
const { buildProducerStrategyReplayDiagnosticsReport } = require("../producer_strategy_replay_diagnostics.js");
const {
    buildProducerStrategyCandidateConfig
} = require("./build_producer_strategy_candidate_config.js");
const {
    DEFAULT_COUNT_FIT_READINESS_REPORT_PATH,
    DEFAULT_COUNT_PRIOR_REPORT_PATH,
    DEFAULT_VALUE_MODEL_REPORT_PATH,
    formatProducerStrategyArchitectureMarkdown
} = require("./build_producer_strategy_architecture_report.js");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_CANDIDATE_OUTPUT_PATH
} = require("./build_producer_strategy_candidate_config.js");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_COUNT_REPLAY_OUTPUT_PATH,
    DEFAULT_SAMPLES_PATH
} = require("./build_producer_strategy_count_replay_report.js");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_REPLAY_DIAGNOSTICS_OUTPUT_PATH,
    formatProducerStrategyReplayDiagnosticsMarkdown
} = require("./build_producer_strategy_replay_diagnostics_report.js");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_ARCHITECTURE_OUTPUT_PATH
} = require("./build_producer_strategy_architecture_report.js");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_DEFAULT_WEIGHT_IMPLEMENTATION_OUTPUT_PATH,
    DEFAULT_PURPLE_FIT_REPORT_PATH,
    formatDefaultWeightImplementationMarkdown
} = require("./build_default_weight_implementation_report.js");
const {
    DEFAULT_CLEAN_REPLAY_QUEUE_PATH,
    DEFAULT_OUTPUT_PATH: DEFAULT_COUNT_FIT_SAMPLE_ACQUISITION_OUTPUT_PATH,
    buildCountFitSampleAcquisitionQueue,
    formatCountFitSampleAcquisitionMarkdown
} = require("./build_count_fit_sample_acquisition_queue.js");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_COUNT_FIT_SAMPLE_ACQUISITION_PACK_OUTPUT_PATH,
    buildCountFitSampleAcquisitionPack,
    formatCountFitSampleAcquisitionPackMarkdown
} = require("./build_count_fit_sample_acquisition_pack.js");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_COUNT_FIT_SAMPLE_REVIEW_TEMPLATE_OUTPUT_PATH,
    buildCountFitSampleReviewTemplate,
    formatCountFitSampleReviewTemplateMarkdown
} = require("./build_count_fit_sample_review_template.js");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_COUNT_FIT_SAMPLE_REVIEW_IMPORT_PATH
} = require("./build_count_fit_sample_review_import.js");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_AUDIT_OUTPUT_PATH,
    buildProducerStrategyChainAuditReport,
    formatProducerStrategyChainAuditMarkdown
} = require("./build_producer_strategy_chain_audit_report.js");
const { normalizeInputSamples } = require("./build_settlement_sample_count_replay.js");

const DEFAULT_OUTPUT_PATHS = {
    candidate: DEFAULT_CANDIDATE_OUTPUT_PATH,
    countReplay: DEFAULT_COUNT_REPLAY_OUTPUT_PATH,
    diagnostics: DEFAULT_REPLAY_DIAGNOSTICS_OUTPUT_PATH,
    architecture: DEFAULT_ARCHITECTURE_OUTPUT_PATH,
    defaultWeightImplementation: DEFAULT_DEFAULT_WEIGHT_IMPLEMENTATION_OUTPUT_PATH,
    countFitSampleAcquisition: DEFAULT_COUNT_FIT_SAMPLE_ACQUISITION_OUTPUT_PATH,
    countFitSampleAcquisitionPack: DEFAULT_COUNT_FIT_SAMPLE_ACQUISITION_PACK_OUTPUT_PATH,
    countFitSampleReviewTemplate: DEFAULT_COUNT_FIT_SAMPLE_REVIEW_TEMPLATE_OUTPUT_PATH,
    countFitSampleReviewImport: DEFAULT_COUNT_FIT_SAMPLE_REVIEW_IMPORT_PATH,
    audit: DEFAULT_AUDIT_OUTPUT_PATH
};
const MAX_REFRESH_ITERATIONS = 5;

function resolveArgs(argv = process.argv.slice(2)) {
    const result = {
        countPriorReportPath: DEFAULT_COUNT_PRIOR_REPORT_PATH,
        valueModelReportPath: DEFAULT_VALUE_MODEL_REPORT_PATH,
        countFitReadinessReportPath: DEFAULT_COUNT_FIT_READINESS_REPORT_PATH,
        cleanReplayQueuePath: DEFAULT_CLEAN_REPLAY_QUEUE_PATH,
        purpleFitReportPath: DEFAULT_PURPLE_FIT_REPORT_PATH,
        samplesPath: DEFAULT_SAMPLES_PATH,
        candidateOutputPath: DEFAULT_CANDIDATE_OUTPUT_PATH,
        countReplayOutputPath: DEFAULT_COUNT_REPLAY_OUTPUT_PATH,
        replayDiagnosticsOutputPath: DEFAULT_REPLAY_DIAGNOSTICS_OUTPUT_PATH,
        architectureOutputPath: DEFAULT_ARCHITECTURE_OUTPUT_PATH,
        defaultWeightImplementationOutputPath: DEFAULT_DEFAULT_WEIGHT_IMPLEMENTATION_OUTPUT_PATH,
        countFitSampleAcquisitionOutputPath: DEFAULT_COUNT_FIT_SAMPLE_ACQUISITION_OUTPUT_PATH,
        countFitSampleAcquisitionPackOutputPath: DEFAULT_COUNT_FIT_SAMPLE_ACQUISITION_PACK_OUTPUT_PATH,
        countFitSampleReviewTemplateOutputPath: DEFAULT_COUNT_FIT_SAMPLE_REVIEW_TEMPLATE_OUTPUT_PATH,
        countFitSampleReviewImportPath: DEFAULT_COUNT_FIT_SAMPLE_REVIEW_IMPORT_PATH,
        auditOutputPath: DEFAULT_AUDIT_OUTPUT_PATH,
        generatedAt: new Date().toISOString()
    };
    const flagMap = {
        "--count-prior": "countPriorReportPath",
        "--value-model": "valueModelReportPath",
        "--readiness": "countFitReadinessReportPath",
        "--clean-replay-queue": "cleanReplayQueuePath",
        "--purple-fit": "purpleFitReportPath",
        "--samples": "samplesPath",
        "--candidate-output": "candidateOutputPath",
        "--count-replay-output": "countReplayOutputPath",
        "--diagnostics-output": "replayDiagnosticsOutputPath",
        "--architecture-output": "architectureOutputPath",
        "--default-weight-implementation-output": "defaultWeightImplementationOutputPath",
        "--count-fit-sample-acquisition-output": "countFitSampleAcquisitionOutputPath",
        "--count-fit-sample-acquisition-pack-output": "countFitSampleAcquisitionPackOutputPath",
        "--count-fit-sample-review-template-output": "countFitSampleReviewTemplateOutputPath",
        "--count-fit-sample-review-import": "countFitSampleReviewImportPath",
        "--audit-output": "auditOutputPath",
        "--generated-at": "generatedAt"
    };

    for (let index = 0; index < argv.length; index += 1) {
        const key = argv[index];
        if (!flagMap[key]) {
            throw new Error(`未知参数: ${key}`);
        }
        const value = argv[index + 1];
        if (!value) throw new Error(`参数 ${key} 缺少值`);
        const targetKey = flagMap[key];
        result[targetKey] = targetKey === "generatedAt" ? value : path.resolve(value);
        index += 1;
    }
    return result;
}

function stableJsonValue(value) {
    if (Array.isArray(value)) return value.map((entry) => stableJsonValue(entry));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, entryValue]) => entryValue !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entryValue]) => [key, stableJsonValue(entryValue)])
    );
}

function stableJson(value) {
    return JSON.stringify(stableJsonValue(value));
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeText(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, payload, "utf8");
}

function buildArchitecture({ countPriorReport, valueModelReport, replayDiagnosticsReport, countFitReadinessReport, generatedAt }) {
    return buildProducerStrategyArchitectureReport({
        countPriorReport,
        valueModelReport,
        replayDiagnosticsReport,
        countFitReadinessReport,
        generatedAt
    });
}

function buildCandidate({ architectureReport, architectureOutputPath, generatedAt }) {
    return buildProducerStrategyCandidateConfig({
        baselineConfig: defaultConfig,
        strategyReport: architectureReport,
        sourceReportPath: architectureOutputPath,
        generatedAt
    });
}

function buildCountReplay({ samples, candidateConfig, generatedAt }) {
    const report = buildSettlementCountReplayReport(samples, defaultConfig, candidateConfig);
    report.generated_at = generatedAt;
    return report;
}

function buildRefreshReports({
    countPriorReport,
    valueModelReport,
    countFitReadinessReport,
    cleanReplayQueue,
    purpleFitReport,
    countFitSampleReviewImport,
    samples,
    paths,
    generatedAt
}) {
    const defaultWeightImplementationReport = buildDefaultWeightImplementationReport({
        defaultConfig,
        purpleFitReport,
        generatedAt
    });
    const countFitSampleAcquisitionQueue = buildCountFitSampleAcquisitionQueue({
        readinessReport: countFitReadinessReport,
        cleanReplayQueue,
        generatedAt,
        paths: {
            readinessReportPath: paths.countFitReadinessReportPath,
            cleanReplayQueuePath: paths.cleanReplayQueuePath
        }
    });
    const countFitSampleAcquisitionPack = buildCountFitSampleAcquisitionPack({
        acquisitionQueue: countFitSampleAcquisitionQueue,
        cleanReplayQueue,
        generatedAt,
        paths: {
            acquisitionQueuePath: paths.countFitSampleAcquisitionOutputPath,
            cleanReplayQueuePath: paths.cleanReplayQueuePath
        }
    });
    const countFitSampleReviewTemplate = buildCountFitSampleReviewTemplate({
        acquisitionPack: countFitSampleAcquisitionPack,
        generatedAt,
        paths: {
            acquisitionPackPath: paths.countFitSampleAcquisitionPackOutputPath
        }
    });
    let replayDiagnosticsReport = {};
    let architectureReport = buildArchitecture({
        countPriorReport,
        valueModelReport,
        replayDiagnosticsReport,
        countFitReadinessReport,
        generatedAt
    });
    let candidateConfig = buildCandidate({
        architectureReport,
        architectureOutputPath: paths.architectureOutputPath,
        generatedAt
    });
    let countReplayReport = null;

    for (let iteration = 1; iteration <= MAX_REFRESH_ITERATIONS; iteration += 1) {
        countReplayReport = buildCountReplay({ samples, candidateConfig, generatedAt });
        replayDiagnosticsReport = buildProducerStrategyReplayDiagnosticsReport({
            replayReport: countReplayReport,
            generatedAt
        });
        architectureReport = buildArchitecture({
            countPriorReport,
            valueModelReport,
            replayDiagnosticsReport,
            countFitReadinessReport,
            generatedAt
        });
        const nextCandidateConfig = buildCandidate({
            architectureReport,
            architectureOutputPath: paths.architectureOutputPath,
            generatedAt
        });
        if (stableJson(nextCandidateConfig) === stableJson(candidateConfig)) {
            const auditReport = buildProducerStrategyChainAuditReport({
                candidateConfig,
                countReplayReport,
                replayDiagnosticsReport,
                architectureReport,
                defaultWeightImplementationReport,
                countFitSampleAcquisitionQueue,
                countFitSampleAcquisitionPack,
                countFitSampleReviewTemplate,
                countFitReadinessReport,
                countFitSampleReviewImport,
                paths: {
                    candidateConfigPath: paths.candidateOutputPath,
                    countReplayReportPath: paths.countReplayOutputPath,
                    replayDiagnosticsReportPath: paths.replayDiagnosticsOutputPath,
                    architectureReportPath: paths.architectureOutputPath,
                    defaultWeightImplementationReportPath: paths.defaultWeightImplementationOutputPath,
                    countFitSampleAcquisitionQueuePath: paths.countFitSampleAcquisitionOutputPath,
                    countFitSampleAcquisitionPackPath: paths.countFitSampleAcquisitionPackOutputPath,
                    countFitSampleReviewTemplatePath: paths.countFitSampleReviewTemplateOutputPath,
                    countFitReadinessReportPath: paths.countFitReadinessReportPath,
                    countFitSampleReviewImportPath: paths.countFitSampleReviewImportPath
                },
                generatedAt
            });
            return {
                iterations: iteration,
                candidateConfig,
                countReplayReport,
                replayDiagnosticsReport,
                architectureReport,
                defaultWeightImplementationReport,
                countFitSampleAcquisitionQueue,
                countFitSampleAcquisitionPack,
                countFitSampleReviewTemplate,
                auditReport
            };
        }
        candidateConfig = nextCandidateConfig;
    }

    throw new Error(`producer strategy refresh 未在 ${MAX_REFRESH_ITERATIONS} 轮内收敛`);
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const countPriorReport = readJson(args.countPriorReportPath);
    const valueModelReport = readJson(args.valueModelReportPath);
    const countFitReadinessReport = readJson(args.countFitReadinessReportPath);
    const cleanReplayQueue = readJson(args.cleanReplayQueuePath);
    const purpleFitReport = readJson(args.purpleFitReportPath);
    const countFitSampleReviewImport = readJson(args.countFitSampleReviewImportPath);
    const samples = normalizeInputSamples(readJson(args.samplesPath));
    const reports = buildRefreshReports({
        countPriorReport,
        valueModelReport,
        countFitReadinessReport,
        cleanReplayQueue,
        purpleFitReport,
        countFitSampleReviewImport,
        samples,
        paths: args,
        generatedAt: args.generatedAt
    });

    writeJson(args.candidateOutputPath, reports.candidateConfig);
    writeJson(args.countReplayOutputPath, reports.countReplayReport);
    writeJson(args.replayDiagnosticsOutputPath, reports.replayDiagnosticsReport);
    writeText(
        args.replayDiagnosticsOutputPath.replace(/\.json$/i, ".md"),
        formatProducerStrategyReplayDiagnosticsMarkdown(reports.replayDiagnosticsReport, args.replayDiagnosticsOutputPath)
    );
    writeJson(args.architectureOutputPath, reports.architectureReport);
    writeText(
        args.architectureOutputPath.replace(/\.json$/i, ".md"),
        formatProducerStrategyArchitectureMarkdown(reports.architectureReport, args.architectureOutputPath)
    );
    writeJson(args.defaultWeightImplementationOutputPath, reports.defaultWeightImplementationReport);
    writeText(
        args.defaultWeightImplementationOutputPath.replace(/\.json$/i, ".md"),
        formatDefaultWeightImplementationMarkdown(
            reports.defaultWeightImplementationReport,
            args.defaultWeightImplementationOutputPath
        )
    );
    writeJson(args.countFitSampleAcquisitionOutputPath, reports.countFitSampleAcquisitionQueue);
    writeText(
        args.countFitSampleAcquisitionOutputPath.replace(/\.json$/i, ".md"),
        formatCountFitSampleAcquisitionMarkdown(
            reports.countFitSampleAcquisitionQueue,
            args.countFitSampleAcquisitionOutputPath
        )
    );
    writeJson(args.countFitSampleAcquisitionPackOutputPath, reports.countFitSampleAcquisitionPack);
    writeText(
        args.countFitSampleAcquisitionPackOutputPath.replace(/\.json$/i, ".md"),
        formatCountFitSampleAcquisitionPackMarkdown(
            reports.countFitSampleAcquisitionPack,
            args.countFitSampleAcquisitionPackOutputPath
        )
    );
    writeJson(args.countFitSampleReviewTemplateOutputPath, reports.countFitSampleReviewTemplate);
    writeText(
        args.countFitSampleReviewTemplateOutputPath.replace(/\.json$/i, ".md"),
        formatCountFitSampleReviewTemplateMarkdown(
            reports.countFitSampleReviewTemplate,
            args.countFitSampleReviewTemplateOutputPath
        )
    );
    writeJson(args.auditOutputPath, reports.auditReport);
    writeText(
        args.auditOutputPath.replace(/\.json$/i, ".md"),
        formatProducerStrategyChainAuditMarkdown(reports.auditReport, args.auditOutputPath)
    );
    process.stdout.write(`${args.auditOutputPath}\n`);
    return reports;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATHS,
    MAX_REFRESH_ITERATIONS,
    buildRefreshReports,
    main,
    resolveArgs
};
