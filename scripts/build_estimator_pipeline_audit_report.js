const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-05-07-estimator-pipeline-audit-report.json"
);
const DEFAULT_GENERATED_AT = "2026-05-07T00:00:00.000+08:00";

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

function buildEstimatorPipelineAuditReport({ generatedAt = DEFAULT_GENERATED_AT } = {}) {
    return {
        schema_version: "ak_estimator_pipeline_audit_v1",
        generated_at: generatedAt,
        change_class: "SIM_ONLY",
        live_path_touched: false,
        default_parameter_update_allowed: false,
        source_ownership_rule: "source artifacts -> compact handoff/context -> UI/operator summaries -> chat/memory",
        module_ownership: {
            average_observation: {
                owner: "src/core/average_observation_runtime.js",
                compatibility_surface: ["AuctionKingEstimator average-observation call sites"],
                owns: [
                    "average text normalization",
                    "average interval derivation",
                    "feasible average support"
                ]
            },
            posterior: {
                owner: "src/core/posterior_runtime.js",
                compatibility_surface: ["AuctionKingEstimator posterior summarization call sites"],
                owns: [
                    "posterior mass normalization",
                    "posterior mass summaries",
                    "allowed total mass probability"
                ]
            },
            count_constraints: {
                owner: "src/core/count_constraint_runtime.js",
                compatibility_surface: ["AuctionKingEstimator.enumerateCountStates"],
                owns: [
                    "quality count state enumeration",
                    "custom orange/red count bounds",
                    "average-feasibility pruning"
                ]
            },
            valuation: {
                owner: "src/core/valuation_runtime.js",
                compatibility_surface: ["AuctionKingEstimator.valuationMc"],
                owns: [
                    "Monte Carlo valuation sampling",
                    "custom quality value override scaling",
                    "red tail value uplift sampling",
                    "bid profit metrics"
                ]
            },
            estimator_facade: {
                owner: "src/core/estimator.js",
                compatibility_surface: ["AuctionKingEstimator", "resolveEstimatorConfig"],
                owns: [
                    "public estimator facade",
                    "config resolution",
                    "runtime orchestration"
                ]
            }
        },
        public_api_compatibility: {
            auction_king_estimator_methods_preserved: true,
            compatibility_wrappers: [
                "AuctionKingEstimator.enumerateCountStates",
                "AuctionKingEstimator.valuationMc"
            ],
            browser_load_chain_updated: [
                "index.html",
                "src/browser/full_solver_worker.js"
            ],
            commonjs_entrypoints_added: [
                "src/core/average_observation_runtime.js",
                "src/core/posterior_runtime.js",
                "src/core/count_constraint_runtime.js",
                "src/core/valuation_runtime.js"
            ]
        },
        parameter_policy: {
            changed_default_parameters: false,
            protected_parameters: [
                "alpha_counts",
                "cells_per_item",
                "value_model",
                "red_type_profiles",
                "calibration adoption status",
                "promotion gates"
            ],
            reason: "This pipeline task is structural refactoring only; parameter promotion requires separate source-owned replay or shadow evidence."
        },
        parameter_promotion_gates: {
            default_parameter_update_allowed: false,
            blockers: [
                "default_parameter_update_out_of_scope",
                "requires_separate_replay_or_shadow_evidence",
                "requires_source_owned_authority_artifacts",
                "requires_explicit_change_class_for_parameter_update"
            ],
            allowed_next_classes: [
                "RESEARCH_ONLY",
                "SIM_ONLY"
            ]
        },
        required_verification: [
            "node --test tests/average_observation_runtime.test.js tests/estimator.test.js",
            "node --test tests/posterior_runtime.test.js tests/estimator.test.js",
            "node --test tests/count_constraint_runtime.test.js tests/estimator.test.js",
            "node --test tests/valuation_runtime.test.js tests/estimator.test.js",
            "npm run check:js",
            "npm test",
            "npm run build:static",
            "npm run audit:public-release",
            "git diff --check"
        ],
        rollback: {
            latest_task_strategy: "git revert the latest task commit",
            generated_drift_policy: "restore generated config/research artifacts unless the task explicitly owns them"
        },
        residual_risk: [
            "Monte Carlo output remains stochastic by default and must be characterized through deterministic injected-random tests where exact values matter.",
            "Further algorithm or weight updates are blocked until replay/shadow evidence is source-owned and reviewed."
        ]
    };
}

function formatEstimatorPipelineAuditMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const moduleRows = Object.entries(report.module_ownership || {}).map(([id, entry]) => {
        return `| ${[
            markdownCell(id),
            markdownCell(entry.owner),
            markdownCell((entry.compatibility_surface || []).join(", ")),
            markdownCell((entry.owns || []).join(", "))
        ].join(" | ")} |`;
    }).join("\n");
    const verificationRows = (report.required_verification || [])
        .map((command) => `- \`${command}\``)
        .join("\n");

    return `# Estimator pipeline audit

- JSON: \`${jsonDisplayPath}\`
- change class: \`${report.change_class}\`
- live path touched: \`${report.live_path_touched === true}\`
- default parameter update allowed: \`${report.default_parameter_update_allowed === true}\`

## Module ownership

| module | owner | compatibility surface | owns |
| --- | --- | --- | --- |
${moduleRows || "| - | - | - | - |"}

## Promotion gates

- blockers: \`${(report.parameter_promotion_gates.blockers || []).join(", ") || "-"}\`
- allowed next classes: \`${(report.parameter_promotion_gates.allowed_next_classes || []).join(", ") || "-"}\`

## Verification

${verificationRows || "- `-`"}
`;
}

function main(argv = process.argv.slice(2)) {
    const { outputPath, generatedAt } = resolveArgs(argv);
    const report = buildEstimatorPipelineAuditReport({
        generatedAt: generatedAt || DEFAULT_GENERATED_AT
    });
    writeJson(outputPath, report);
    writeText(
        outputPath.replace(/\.json$/i, ".md"),
        formatEstimatorPipelineAuditMarkdown(report, outputPath)
    );
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_GENERATED_AT,
    DEFAULT_OUTPUT_PATH,
    buildEstimatorPipelineAuditReport,
    formatEstimatorPipelineAuditMarkdown,
    main,
    resolveArgs
};
