function formatPercent(prob) {
    if (!Number.isFinite(prob)) return "-";
    return `${(prob * 100).toFixed(1)}%`;
}

function formatInteger(value) {
    if (!Number.isFinite(value)) return "-";
    return Math.round(value).toLocaleString();
}

function formatAverage(value, rawValue) {
    if (typeof rawValue === "string" && rawValue.trim() !== "" && Number.isFinite(value)) {
        return Number(value).toFixed(2);
    }
    if (!Number.isFinite(value)) return "-";
    return Number(value).toFixed(2);
}

function buildTopCountText(distribution, unitLabel) {
    if (!Array.isArray(distribution) || distribution.length === 0) return `暂无${unitLabel}主峰`;
    const top = distribution[0];
    return `${top.count} ${unitLabel} | ${formatPercent(top.prob)}`;
}

function buildEvidenceText(stateVars, r2PurpleMode) {
    const parts = [];
    if (Number.isFinite(stateVars && stateVars.r1_total_items)) parts.push(`总件数 ${stateVars.r1_total_items}`);
    if (Number.isFinite(stateVars && stateVars.r1_blue_count)) parts.push(`蓝件 ${stateVars.r1_blue_count}`);
    if (Number.isFinite(stateVars && stateVars.r2_orange_count)) parts.push(`橙件 ${stateVars.r2_orange_count}`);
    if (r2PurpleMode === "with_purple" && Number.isFinite(stateVars && stateVars.r2_purple_count)) parts.push(`紫件 ${stateVars.r2_purple_count}`);
    if (Number.isFinite(stateVars && stateVars.r2_white_green_cells)) parts.push(`绿白总格 ${stateVars.r2_white_green_cells}`);
    if (Number.isFinite(stateVars && stateVars.r3_green_count)) parts.push(`绿件 ${stateVars.r3_green_count}`);
    if (Number.isFinite(stateVars && stateVars.r3_white_green_avg)) {
        parts.push(`绿白均格 ${formatAverage(stateVars.r3_white_green_avg, stateVars.r3_white_green_avg_text)}`);
    }
    if (Number.isFinite(stateVars && stateVars.r4_total_storage_cells)) parts.push(`总仓储空间 ${stateVars.r4_total_storage_cells}`);
    if (Number.isFinite(stateVars && stateVars.bid_price)) parts.push(`出价 ${formatInteger(stateVars.bid_price)}`);
    if (Number.isFinite(stateVars && stateVars.r2_orange_avg)) parts.push(`橙均格 ${formatAverage(stateVars.r2_orange_avg, stateVars.r2_orange_avg_text)}`);
    if (Number.isFinite(stateVars && stateVars.r3_purple_avg)) parts.push(`紫均格 ${formatAverage(stateVars.r3_purple_avg, stateVars.r3_purple_avg_text)}`);
    return parts.join(" | ");
}

function buildInferenceGraphModel(res, stateVars, resolvedConfig, r2PurpleMode) {
    const summary = res && res.summary ? res.summary : {};
    const valuation = res && res.valuation ? res.valuation : {};
    const redType = Array.isArray(summary.red_type_probs) && summary.red_type_probs.length > 0 ? summary.red_type_probs[0] : null;
    const family = Array.isArray(summary.family_probs) && summary.family_probs.length > 0 ? summary.family_probs[0] : null;
    const redCells = Array.isArray(summary.red_cell_probs) && summary.red_cell_probs.length > 0 ? summary.red_cell_probs[0] : null;

    const nodes = [
        {
            id: "evidence",
            label: "输入锚点",
            detail: buildEvidenceText(stateVars || {}, r2PurpleMode)
        },
        {
            id: "orange",
            label: "橙色后验",
            detail: `${Number.isFinite(stateVars && stateVars.r2_orange_avg) ? `橙均格 ${formatAverage(stateVars.r2_orange_avg, stateVars.r2_orange_avg_text)} | ` : ""}${Number.isFinite(stateVars && stateVars.r2_orange_count) ? `橙件 ${stateVars.r2_orange_count} | ` : ""}${buildTopCountText(summary.orange_count_probs, "件")} | ${r2PurpleMode === "orange_only" ? "仅由橙均格约束" : "叠加橙均格与紫件/橙件情报"}`
        },
        {
            id: "red",
            label: "红色后验",
            detail: `${buildTopCountText(summary.red_count_probs, "件")} | ${Number.isFinite(stateVars && stateVars.r2_white_green_cells) ? `绿白总格 ${stateVars.r2_white_green_cells} | ` : ""}${Number.isFinite(stateVars && stateVars.r3_white_green_avg) ? `绿白均格 ${formatAverage(stateVars.r3_white_green_avg, stateVars.r3_white_green_avg_text)} | ` : ""}${Number.isFinite(stateVars && stateVars.r4_total_storage_cells) ? `总仓储空间 ${stateVars.r4_total_storage_cells} | ` : ""}白绿约束与总格预算继续向红区传播`
        },
        {
            id: "red-cells",
            label: "红区模板",
            detail: redType
                ? `${Number.isFinite(stateVars && stateVars.r3_purple_avg) ? `紫均格 ${formatAverage(stateVars.r3_purple_avg, stateVars.r3_purple_avg_text)} | ` : ""}${redCells ? `${redCells.count} 格主峰 | ` : ""}${redType.label} ${formatPercent(redType.prob)} | 件均锚值 ${formatInteger(redType.anchor_item_value)}`
                : (redCells ? `${redCells.count} 格主峰 | 等待红件模板细分` : "红区格数仍在宽分布")
        },
        {
            id: "family",
            label: "地图家族",
            detail: family
                ? `${family.label} ${formatPercent(family.prob)} | 估值偏置 ${Number.isFinite(family.value_bias) ? `${family.value_bias.toFixed(2)}x` : "-"}`
                : "当前没有显著家族偏置"
        },
        {
            id: "valuation",
            label: "估值投影",
            detail: `EV ${formatInteger(valuation.mean_value)} | Q25 ${formatInteger(valuation.q25)} | Q75 ${formatInteger(valuation.q75)}`
        }
    ];

    return {
        title: resolvedConfig && resolvedConfig.map_name ? resolvedConfig.map_name : "当前地图",
        nodes,
        highlights: [
            {
                label: "橙色主峰",
                value: buildTopCountText(summary.orange_count_probs, "件")
            },
            {
                label: "红色主峰",
                value: buildTopCountText(summary.red_count_probs, "件")
            },
            {
                label: "绿白主锚点",
                value: `${Number.isFinite(stateVars && stateVars.r2_white_green_cells) ? `${stateVars.r2_white_green_cells} 格` : "总格缺失"} | ${Number.isFinite(stateVars && stateVars.r3_white_green_avg) ? `均格 ${formatAverage(stateVars.r3_white_green_avg, stateVars.r3_white_green_avg_text)}` : "均格缺失"}`
            },
            {
                label: "红件模板",
                value: redType ? `${redType.label} | ${formatPercent(redType.prob)}` : "暂无细分"
            },
            {
                label: "估值中枢",
                value: formatInteger(valuation.mean_value)
            }
        ]
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        buildInferenceGraphModel
    };
}

if (typeof window !== "undefined") {
    window.buildInferenceGraphModel = buildInferenceGraphModel;
}
