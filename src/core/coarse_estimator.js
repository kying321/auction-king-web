const COARSE_QUALITIES = ["w", "g", "b", "p", "o", "r"];
const COLLECTION_FAMILIES_PHASE1_RUNTIME_ENABLED = false;
const COARSE_QUALITY_NAMES = { w: "白", g: "绿", b: "蓝", p: "紫", o: "橙", r: "红" };

function normalizeWeightedEntries(entries) {
    if (!entries || entries.length === 0) return [];
    const total = entries.reduce((sum, entry) => sum + entry.prob, 0);
    if (total <= 0) {
        const uniform = 1 / entries.length;
        return entries.map((entry) => ({ ...entry, prob: uniform }));
    }
    return entries.map((entry) => ({ ...entry, prob: entry.prob / total }));
}

function gaussianWeight(x, mean, sd) {
    const denom = Math.max(sd, 1e-9);
    const z = (x - mean) / denom;
    return Math.exp(-0.5 * z * z);
}

function normalCdf(x) {
    const sign = x < 0 ? -1 : 1;
    const scaled = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + 0.3275911 * scaled);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-scaled * scaled);
    return 0.5 * (1 + sign * erf);
}

function isIntegerCount(value) {
    return value === null || value === undefined || Number.isInteger(value);
}

function pickInteger(value) {
    return value === null || value === undefined || Number.isNaN(value) ? null : value;
}

function buildCountDistribution(mean, totalItems, fixedCount = null) {
    if (Number.isInteger(fixedCount)) {
        return [{ count: fixedCount, prob: 1 }];
    }

    const boundedMean = Math.max(0, Math.min(totalItems, mean || 0));
    const sd = Math.max(1, Math.sqrt(Math.max(boundedMean, 1)) * 0.7);
    const lo = Math.max(0, Math.floor(boundedMean - 2 * sd));
    const hi = Math.min(totalItems, Math.ceil(boundedMean + 2 * sd));
    const entries = [];
    for (let count = lo; count <= hi; count++) {
        entries.push({
            count,
            prob: gaussianWeight(count, boundedMean, sd)
        });
    }
    return normalizeWeightedEntries(entries);
}

function applyCountBounds(distribution, minBound = 0, maxBound = Number.POSITIVE_INFINITY) {
    if (!Array.isArray(distribution) || distribution.length === 0) return [];
    const bounded = distribution.filter((entry) => entry.count >= minBound && entry.count <= maxBound);
    return normalizeWeightedEntries(bounded);
}

function buildCellDistribution(meanCells, maxCells) {
    const boundedMean = Math.max(0, Math.min(maxCells, meanCells || 0));
    const sd = Math.max(1, Math.sqrt(Math.max(boundedMean, 1)) * 0.8);
    const lo = Math.max(0, Math.floor(boundedMean - 2 * sd));
    const hi = Math.max(lo, Math.min(maxCells, Math.ceil(boundedMean + 2 * sd)));
    const entries = [];
    for (let count = lo; count <= hi; count++) {
        entries.push({
            count,
            prob: gaussianWeight(count, boundedMean, sd)
        });
    }
    return normalizeWeightedEntries(entries);
}

function getSolverUnboundedCellMax(config) {
    const raw = Number(config && config.solver && config.solver.unbounded_cell_max_per_item);
    return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

function getCellModelMin(model) {
    const raw = Number(model && model.min);
    return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

function getCellModelMax(model, config) {
    const min = getCellModelMin(model);
    const rawMax = model ? model.max : null;
    if (rawMax !== null && rawMax !== undefined && rawMax !== "") {
        const finiteMax = Number(rawMax);
        if (Number.isFinite(finiteMax)) return Math.max(min, finiteMax);
    }

    const guardMax = getSolverUnboundedCellMax(config);
    const mean = Number(model && model.mean);
    const sd = Number(model && model.sd);
    const modelEnvelope = Number.isFinite(mean) && Number.isFinite(sd)
        ? mean + 3 * Math.max(sd, 0)
        : 0;
    return Math.max(min, guardMax, modelEnvelope);
}

function buildPriorPosterior(entries, fallbackLabelKey) {
    const normalized = normalizeWeightedEntries(entries.map((entry) => ({
        ...entry,
        prob: entry.prior > 0 ? entry.prior : 1
    })));
    return normalized
        .map((entry) => ({
            ...entry,
            label: entry.label || fallbackLabelKey?.[entry.id] || entry.id
        }))
        .sort((a, b) => b.prob - a.prob);
}

function estimateUnknownMeans(totalItems, alphaCounts, fixedCounts, whiteGreenTotal) {
    const expectedCounts = {};
    const knownCounts = { ...fixedCounts };
    const errors = [];
    const alpha = alphaCounts || {};
    const unresolvedWhite = knownCounts.w === null || knownCounts.w === undefined;
    const unresolvedGreen = knownCounts.g === null || knownCounts.g === undefined;

    if (whiteGreenTotal !== null && whiteGreenTotal !== undefined) {
        if (!unresolvedWhite && !unresolvedGreen && knownCounts.w + knownCounts.g !== whiteGreenTotal) {
            errors.push("绿+白总和与已知白/绿件数矛盾，当前输入不可行。");
            return { errors };
        }
        if (!unresolvedWhite && unresolvedGreen) {
            knownCounts.g = whiteGreenTotal - knownCounts.w;
        } else if (unresolvedWhite && !unresolvedGreen) {
            knownCounts.w = whiteGreenTotal - knownCounts.g;
        }
    }

    const reservedWhiteGreen = (whiteGreenTotal !== null && whiteGreenTotal !== undefined && unresolvedWhite && unresolvedGreen)
        ? whiteGreenTotal
        : 0;

    let fixedSum = 0;
    COARSE_QUALITIES.forEach((quality) => {
        const value = knownCounts[quality];
        if (value !== null && value !== undefined) fixedSum += value;
    });

    if (fixedSum + reservedWhiteGreen > totalItems) {
        errors.push("已知件数约束超过总件数，当前输入不可行。");
        return { errors };
    }

    const directUnknowns = COARSE_QUALITIES.filter((quality) => {
        if (quality === "w" && reservedWhiteGreen) return false;
        if (quality === "g" && reservedWhiteGreen) return false;
        return knownCounts[quality] === null || knownCounts[quality] === undefined;
    });

    const remaining = totalItems - fixedSum - reservedWhiteGreen;
    const directWeightSum = directUnknowns.reduce((sum, quality) => sum + Math.max(alpha[quality] || 0, 0.01), 0);

    directUnknowns.forEach((quality) => {
        const weight = Math.max(alpha[quality] || 0, 0.01);
        expectedCounts[quality] = remaining * weight / directWeightSum;
    });

    if (reservedWhiteGreen) {
        const wWeight = Math.max(alpha.w || 0, 0.01);
        const gWeight = Math.max(alpha.g || 0, 0.01);
        const groupWeight = wWeight + gWeight;
        expectedCounts.w = reservedWhiteGreen * wWeight / groupWeight;
        expectedCounts.g = reservedWhiteGreen * gWeight / groupWeight;
    }

    COARSE_QUALITIES.forEach((quality) => {
        if (knownCounts[quality] !== null && knownCounts[quality] !== undefined) {
            expectedCounts[quality] = knownCounts[quality];
        }
    });

    COARSE_QUALITIES.forEach((quality) => {
        if (expectedCounts[quality] === null || expectedCounts[quality] === undefined || Number.isNaN(expectedCounts[quality])) {
            expectedCounts[quality] = 0;
        }
        if (expectedCounts[quality] < 0) {
            errors.push(`${COARSE_QUALITY_NAMES[quality]}色件数约束推导为负数，当前输入不可行。`);
        }
    });

    return { errors, expectedCounts, fixedCounts: knownCounts };
}

function buildCoarseEngineResult(config, stateVars) {
    const totalItems = pickInteger(stateVars && stateVars.r1_total_items);
    if (!Number.isInteger(totalItems) || totalItems <= 0) {
        return {
            error: true,
            mode: "coarse",
            messages: ["总件数必须是正整数。"],
            summary: {},
            valuation: {}
        };
    }

    const countFields = {
        w: pickInteger(stateVars && stateVars.r5_white_count),
        g: pickInteger(stateVars && stateVars.r3_green_count),
        b: pickInteger(stateVars && stateVars.r1_blue_count),
        p: pickInteger(stateVars && stateVars.r2_purple_count),
        o: null,
        r: null
    };
    const whiteGreenTotal = pickInteger(stateVars && stateVars.r5_white_green_total);
    const customOrangeMin = pickInteger(stateVars && stateVars.custom_o_min);
    const customOrangeMax = pickInteger(stateVars && stateVars.custom_o_max);
    const customRedMin = pickInteger(stateVars && stateVars.custom_r_min);
    const customRedMax = pickInteger(stateVars && stateVars.custom_r_max);
    const countErrors = [];

    Object.entries({
        "场上白色件数": countFields.w,
        "场上绿色件数": countFields.g,
        "场上蓝色件数": countFields.b,
        "场上紫色件数": countFields.p,
        "绿+白总和": whiteGreenTotal,
        "橙色件数下界": customOrangeMin,
        "橙色件数上界": customOrangeMax,
        "红色件数下界": customRedMin,
        "红色件数上界": customRedMax
    }).forEach(([label, value]) => {
        if (!isIntegerCount(value)) countErrors.push(`${label}必须是整数。`);
    });
    if (customOrangeMin !== null && customOrangeMin < 0) countErrors.push("橙色件数下界不能为负。");
    if (customOrangeMax !== null && customOrangeMax < 0) countErrors.push("橙色件数上界不能为负。");
    if (customRedMin !== null && customRedMin < 0) countErrors.push("红色件数下界不能为负。");
    if (customRedMax !== null && customRedMax < 0) countErrors.push("红色件数上界不能为负。");
    if (customOrangeMin !== null && customOrangeMax !== null && customOrangeMin > customOrangeMax) countErrors.push("橙色件数下界不能大于上界。");
    if (customRedMin !== null && customRedMax !== null && customRedMin > customRedMax) countErrors.push("红色件数下界不能大于上界。");
    if (customOrangeMax !== null && customOrangeMax > totalItems) countErrors.push("橙色件数上界不能超过总件数。");
    if (customRedMax !== null && customRedMax > totalItems) countErrors.push("红色件数上界不能超过总件数。");

    if (countErrors.length > 0) {
        return {
            error: true,
            mode: "coarse",
            messages: countErrors,
            summary: {},
            valuation: {}
        };
    }

    const estimated = estimateUnknownMeans(totalItems, config.alpha_counts, countFields, whiteGreenTotal);
    if (estimated.errors.length > 0) {
        return {
            error: true,
            mode: "coarse",
            messages: estimated.errors,
            summary: {},
            valuation: {}
        };
    }

    const summary = {
        count_probs: { w: {}, g: {}, b: {}, p: {}, o: {}, r: {} },
        count_means: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 0 },
        cell_means: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 0 },
        cell_low: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 0 },
        cell_high: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 0 },
        orange_count_probs: [],
        red_count_probs: [],
        red_cell_probs: [],
        red_type_probs: [],
        family_probs: []
    };
    const countDistributionsByQuality = {};
    const boundsByQuality = {
        o: {
            min: customOrangeMin === null ? 0 : customOrangeMin,
            max: customOrangeMax === null ? totalItems : customOrangeMax
        },
        r: {
            min: customRedMin === null ? 0 : customRedMin,
            max: customRedMax === null ? totalItems : customRedMax
        }
    };

    COARSE_QUALITIES.forEach((quality) => {
        const fixedCount = estimated.fixedCounts[quality];
        let countDist = buildCountDistribution(estimated.expectedCounts[quality], totalItems, fixedCount);
        if (boundsByQuality[quality]) {
            const qualityBounds = boundsByQuality[quality];
            countDist = applyCountBounds(countDist, qualityBounds.min, qualityBounds.max);
        }
        if (countDist.length === 0) {
            countErrors.push(`${COARSE_QUALITY_NAMES[quality]}色件数约束无可行分布。`);
            return;
        }
        countDistributionsByQuality[quality] = countDist;
        countDist.forEach((entry) => {
            summary.count_probs[quality][entry.count] = entry.prob;
            summary.count_means[quality] += entry.count * entry.prob;
        });

        const cellConfig = config.cells_per_item && config.cells_per_item[quality]
            ? config.cells_per_item[quality]
            : { mean: 0, min: 0, max: 0 };
        summary.cell_means[quality] = summary.count_means[quality] * (cellConfig.mean || 0);
        const minCount = countDist.length > 0 ? countDist[countDist.length - 1].count : 0;
        const maxCount = countDist.length > 0 ? countDist[countDist.length - 1].count : 0;
        const supportCounts = countDist.map((entry) => entry.count);
        const supportMin = supportCounts.length > 0 ? Math.min(...supportCounts) : 0;
        const supportMax = supportCounts.length > 0 ? Math.max(...supportCounts) : 0;
        summary.cell_low[quality] = Math.max(0, Math.floor(supportMin * getCellModelMin(cellConfig)));
        summary.cell_high[quality] = Math.max(summary.cell_low[quality], Math.ceil(supportMax * getCellModelMax(cellConfig, config)));
    });
    if (countErrors.length > 0) {
        return {
            error: true,
            mode: "coarse",
            messages: countErrors,
            summary: {},
            valuation: {}
        };
    }

    summary.orange_count_probs = (countDistributionsByQuality.o || []).sort((a, b) => b.prob - a.prob);
    summary.red_count_probs = (countDistributionsByQuality.r || []).sort((a, b) => b.prob - a.prob);

    const redCellConfig = config.cells_per_item && config.cells_per_item.r
        ? config.cells_per_item.r
        : { max: totalItems, mean: 0 };
    summary.red_cell_probs = buildCellDistribution(
        summary.count_means.r * (redCellConfig.mean || 0),
        Math.max(totalItems * getCellModelMax(redCellConfig, config), totalItems)
    ).sort((a, b) => b.prob - a.prob);

    const redProfiles = (((config.red_type_profiles || {}).profiles) || {});
    summary.red_type_probs = buildPriorPosterior(
        Object.entries(redProfiles).map(([id, profile]) => ({
            id,
            label: profile.label,
            prior: profile.prior,
            anchor_item_value: profile.base_item_mean || 0,
            per_cell_mean: profile.per_cell_mean || 0
        }))
    );

    summary.family_probs = COLLECTION_FAMILIES_PHASE1_RUNTIME_ENABLED
        ? buildPriorPosterior(
            Object.entries(config.collection_families || {}).map(([id, family]) => ({
                id,
                label: family.label,
                prior: family.prior,
                value_bias: family.value_bias,
                notes: family.notes
            }))
        )
        : [];

    const valuation = {
        mean_value: 0,
        q05: 0,
        q25: 0,
        q50: 0,
        q75: 0,
        q95: 0
    };
    let variance = 0;

    COARSE_QUALITIES.forEach((quality) => {
        const valueModel = config.value_model && config.value_model[quality]
            ? config.value_model[quality]
            : { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 };
        valuation.mean_value += summary.count_means[quality] * (valueModel.base_item_mean || 0);
        valuation.mean_value += summary.cell_means[quality] * (valueModel.per_cell_mean || 0);
        variance += summary.count_means[quality] * Math.pow(valueModel.base_item_sd || 0, 2);
        variance += summary.cell_means[quality] * Math.pow(valueModel.per_cell_sd || 0, 2);
    });

    const totalSd = Math.max(Math.sqrt(Math.max(variance, 1)), 1);
    valuation.q05 = Math.max(0, valuation.mean_value - 1.645 * totalSd);
    valuation.q25 = Math.max(0, valuation.mean_value - 0.674 * totalSd);
    valuation.q50 = valuation.mean_value;
    valuation.q75 = Math.max(0, valuation.mean_value + 0.674 * totalSd);
    valuation.q95 = Math.max(0, valuation.mean_value + 1.645 * totalSd);

    const bid = pickInteger(stateVars && stateVars.bid_price);
    if (bid !== null && bid > 0) {
        const profitProb = 1 - normalCdf((bid - valuation.mean_value) / totalSd);
        valuation.bid_price = bid;
        valuation.expected_profit = valuation.mean_value - bid;
        valuation.profit_prob = Math.max(0, Math.min(1, profitProb));
        valuation.loss_prob = 1 - valuation.profit_prob;
        valuation.ev_roi = valuation.mean_value / bid - 1;
        valuation.q25_roi = valuation.q25 / bid - 1;
        valuation.q05_roi = valuation.q05 / bid - 1;
        valuation.gain_loss_ratio = valuation.q05 > 0 ? valuation.q75 / Math.max(valuation.q25, 1) : Infinity;
    }

    return {
        error: false,
        mode: "coarse",
        messages: [],
        summary,
        valuation
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        buildCoarseEngineResult
    };
}

if (typeof window !== "undefined") {
    window.buildCoarseEngineResult = buildCoarseEngineResult;
}
