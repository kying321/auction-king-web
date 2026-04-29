const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_ASSEMBLY_PATH,
    parseDotnetMetadata,
    parsePeSections
} = require("./build_bidking_table_schema_metadata_report.js");
const {
    buildMethodDefinitionLookup,
    metadataToken
} = require("./build_bidking_method_metadata_report.js");
const { parseMethodIl } = require("./build_bidking_focused_il_report.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-drop-helper-semantics-report.json"
);

const HELPER_METHODS = [
    "GetValues",
    "RandomWeightIndex",
    "RandomProbabilityIndex",
    "SelectByProbability",
    "RandomCount",
    "AddRange",
    "AddItem"
];

const HELPER_SEMANTICS = {
    "GetValues/1": {
        semantics: "extract tuple[1] from each row",
        pseudocode: [
            "values = new int[rows.length]",
            "for i in range(rows.length): values[i] = rows[i][1]",
            "return values"
        ],
        notes: ["Not used by DoDrop main branch; included because it is in the same helper family."]
    },
    "GetValues/3": {
        semantics: "extract tuple[columnIndex] from each row, falling back when the row is too short",
        pseudocode: [
            "values = new int[rows.length]",
            "for i in range(rows.length):",
            "  values[i] = fallback if columnIndex >= rows[i].length else rows[i][columnIndex]",
            "return values"
        ],
        notes: ["DoDrop calls GetValues(items_list, 4, 10000), so tuple[4] is the probability or weight source."]
    },
    "RandomWeightIndex/1": {
        semantics: "single weighted choice by cumulative sum",
        pseudocode: [
            "if weights is null or empty: throw ArgumentException",
            "if weights.length == 1: return 0",
            "total = Sum(weights)",
            "threshold = Random().Next(0, total)",
            "cumulative = 0",
            "for i in range(weights.length):",
            "  cumulative += weights[i]",
            "  if threshold < cumulative: return i",
            "return weights.length - 1"
        ],
        notes: ["Random source is a new System.Random per call."]
    },
    "RandomProbabilityIndex/1": {
        semantics: "convert integer weights to probabilities and independently select all passing indexes",
        pseudocode: [
            "total = Sum(weights)",
            "probabilities = weights.map(weight => weight / total)",
            "return SelectByProbability(probabilities)"
        ],
        notes: ["This can return multiple indexes, matching DoDrop AddRange behavior for weight_type == 1."]
    },
    "SelectByProbability/1": {
        semantics: "independent Bernoulli selection for each probability entry",
        pseudocode: [
            "if probabilities is null or empty: throw ArgumentException",
            "selected = []",
            "random = new Random()",
            "for i in range(probabilities.Count):",
            "  if random.NextDouble() < probabilities[i]: selected.Add(i)",
            "return selected"
        ],
        notes: ["This is not roulette-wheel selection; each index is tested independently."]
    },
    "RandomCount/2": {
        semantics: "random integer in normalized [min, max) range, exact return when min == max",
        pseudocode: [
            "if a == b: return a",
            "low = min(a, b)",
            "high = max(a, b)",
            "return Random().Next(low, high)"
        ],
        notes: ["System.Random.Next(min, max) uses an exclusive upper bound."]
    },
    "AddRange/2": {
        semantics: "merge dictionary counts through AddItem",
        pseudocode: [
            "for (key, value) in source:",
            "  AddItem(target, key, value)"
        ],
        notes: ["Nested drop groups accumulate into the same result dictionary."]
    },
    "AddItem/3": {
        semantics: "accumulate item count by dictionary key",
        pseudocode: [
            "if result.ContainsKey(itemId): result[itemId] = result[itemId] + count",
            "else: result.Add(itemId, count)"
        ],
        notes: []
    }
};

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        assemblyPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_ASSEMBLY_PATH,
        outputPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_OUTPUT_PATH
    };
}

function signatureKey(method) {
    return `${method.name}/${(method.signature && method.signature.parameters ? method.signature.parameters.length : 0)}`;
}

function compactInstructionSignal(instruction) {
    return {
        il_offset: instruction.il_offset,
        opcode_name: instruction.opcode_name,
        operand_value: instruction.operand_value,
        branch_target_offset: instruction.branch_target_offset,
        resolved_full_name: instruction.resolved_full_name
    };
}

function shouldKeepSignal(instruction) {
    return (
        instruction.resolved_full_name
        || instruction.operand_value !== undefined
        || instruction.branch_target_offset !== undefined
        || ["ret", "throw"].includes(instruction.opcode_name)
    );
}

function buildHelperEntry(method, assembly, sections, metadata, methodDefLookup) {
    const body = parseMethodIl(assembly, sections, method, metadata, methodDefLookup);
    const key = signatureKey(method);
    return {
        helper_key: key,
        declaring_type: method.declaring_type,
        method_name: method.name,
        method_rid: method.rid,
        metadata_token: metadataToken(0x06, method.rid),
        rva_hex: `0x${Number(method.rva).toString(16).padStart(8, "0")}`,
        signature: method.signature,
        body_summary: {
            parse_status: body.parse_status,
            code_size: body.code_size,
            instruction_count: body.instruction_count,
            call_count: (body.instructions || []).filter((instruction) => /^call/.test(instruction.opcode_name) || instruction.opcode_name === "newobj").length,
            branch_count: (body.instructions || []).filter((instruction) => instruction.branch_target_offset !== undefined).length
        },
        semantics_candidate: HELPER_SEMANTICS[key] || {
            semantics: "not mapped",
            pseudocode: [],
            notes: ["No semantics mapping is registered for this helper overload."]
        },
        instruction_signals: (body.instructions || []).filter(shouldKeepSignal).map(compactInstructionSignal)
    };
}

function buildBidKingDropHelperSemanticsReport({
    assemblyPath = DEFAULT_ASSEMBLY_PATH
} = {}) {
    const assembly = fs.readFileSync(assemblyPath);
    const metadata = parseDotnetMetadata(assemblyPath);
    const pe = parsePeSections(assembly);
    const methodDefLookup = buildMethodDefinitionLookup(metadata);
    const helperMethods = (metadata.method_definitions || [])
        .filter((method) => method.declaring_type === "GameServerDemo.Utils" && HELPER_METHODS.includes(method.name))
        .map((method) => buildHelperEntry(method, assembly, pe.sections, metadata, methodDefLookup));
    const missingHelperKeys = Object.keys(HELPER_SEMANTICS)
        .filter((key) => !helperMethods.some((entry) => entry.helper_key === key));

    return {
        schema_version: "ak_bidking_drop_helper_semantics_v1",
        generated_at: new Date().toISOString(),
        mode: "architecture_review",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        inputs: {
            assembly_path: assemblyPath
        },
        summary: {
            parse_status: missingHelperKeys.length ? "drop_helper_semantics_incomplete" : "drop_helper_semantics_candidate_built",
            evidence_confidence: missingHelperKeys.length ? "medium" : "medium_high",
            authority_adoption_allowed: false,
            reverse_engineering_source_allowed: true,
            default_config_update_allowed: false,
            core_refactor_recommended_now: false,
            shadow_candidate_allowed: false,
            helper_method_count: helperMethods.length,
            missing_helper_keys: missingHelperKeys,
            random_count_upper_bound_exclusive: true,
            probability_mode_is_independent_bernoulli: true,
            weighted_mode_is_single_cumulative_choice: true
        },
        helper_methods: helperMethods,
        refactor_impact: {
            recommended_change_class: "RESEARCH_ONLY",
            live_path_touched: false,
            useful_now: [
                "DoDrop helper semantics are explicit enough to implement a shadow-only simulator",
                "weight_type == 1 should be modeled as independent Bernoulli selection, not one weighted draw",
                "RandomCount max bound should be treated as exclusive until runtime sampling proves otherwise"
            ],
            blockers_before_model_change: [
                "compare helper semantics against observed settlement samples",
                "decide whether new System.Random per call needs deterministic replay injection",
                "implement simulator behind shadow-only artifact gates",
                "manual authority handoff must remain closed before estimator/default config changes"
            ]
        }
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatSignature(signature) {
    if (!signature) return "-";
    return `${signature.return_type || "unknown"}(${(signature.parameters || []).join(", ")})`;
}

function formatBidKingDropHelperSemanticsMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const rows = (report.helper_methods || []).map((entry) => (
        `| ${markdownCell(entry.helper_key)} | ${markdownCell(formatSignature(entry.signature))} | ${markdownCell(entry.semantics_candidate.semantics)} | ${markdownCell(entry.body_summary.code_size)} | ${markdownCell(entry.body_summary.instruction_count)} |`
    )).join("\n");
    const pseudoSections = (report.helper_methods || []).map((entry) => (
        `### ${entry.helper_key}\n\n\`\`\`text\n${(entry.semantics_candidate.pseudocode || []).join("\n") || "-"}\n\`\`\`\n`
    )).join("\n");

    return `# BidKing drop helper semantics report

- Change class: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- Assembly: \`${report.inputs ? report.inputs.assembly_path : "-"}\`
- Parse status: \`${summary.parse_status || "-"}\`
- Evidence confidence: \`${summary.evidence_confidence || "-"}\`
- Authority adoption allowed: \`${summary.authority_adoption_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Shadow candidate allowed: \`${summary.shadow_candidate_allowed === true}\`
- RandomCount upper bound exclusive: \`${summary.random_count_upper_bound_exclusive === true}\`
- Probability mode independent Bernoulli: \`${summary.probability_mode_is_independent_bernoulli === true}\`
- Weighted mode single cumulative choice: \`${summary.weighted_mode_is_single_cumulative_choice === true}\`
- Live/order/funds path touched: \`${report.refactor_impact && report.refactor_impact.live_path_touched === true}\`

## Coverage

| signal | value |
| --- | --- |
| helper methods | \`${summary.helper_method_count ?? 0}\` |
| missing helper keys | ${markdownCell((summary.missing_helper_keys || []).join(", ") || "-")} |

## Helpers

| helper | signature | semantics | IL bytes | instructions |
| --- | --- | --- | --- | --- |
${rows || "| - | - | - | - | - |"}

## Pseudocode

${pseudoSections}

## Conclusion

The helper layer is now explicit enough for a shadow-only DoDrop simulator. The most important modeling details are independent Bernoulli selection for probability mode and exclusive upper bound for RandomCount.
`;
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeMarkdown(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, payload, "utf8");
}

function main(argv = process.argv.slice(2)) {
    const { assemblyPath, outputPath } = resolveArgs(argv);
    const report = buildBidKingDropHelperSemanticsReport({ assemblyPath });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatBidKingDropHelperSemanticsMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_ASSEMBLY_PATH,
    DEFAULT_OUTPUT_PATH,
    buildBidKingDropHelperSemanticsReport,
    formatBidKingDropHelperSemanticsMarkdown,
    main,
    resolveArgs
};
