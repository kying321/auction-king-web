const DEFAULT_QUALITIES = ["w", "g", "b", "p", "o", "r"];

function getQualityValueOverrideTarget(state, quality) {
    if (!state || typeof state !== "object") return null;
    const rawValueByQuality = {
        p: state.custom_p_value_w,
        o: state.custom_o_value_w,
        r: state.custom_r_value_w
    };
    const rawValue = rawValueByQuality[quality];
    if (!Number.isFinite(rawValue)) return null;
    return Math.max(0, rawValue) * 10000;
}

function scaleValueModelToTargetItemValue(valueModel, targetItemValue, totalCells, itemCount) {
    if (!valueModel || typeof valueModel !== "object") return valueModel;
    if (!Number.isFinite(targetItemValue) || !Number.isInteger(itemCount) || itemCount <= 0) return valueModel;

    const avgCellsPerItem = Number.isFinite(totalCells) && totalCells > 0 ? totalCells / itemCount : 0;
    const baseItemMean = Number.isFinite(valueModel.base_item_mean) ? valueModel.base_item_mean : 0;
    const baseItemSd = Number.isFinite(valueModel.base_item_sd) ? valueModel.base_item_sd : 0;
    const perCellMean = Number.isFinite(valueModel.per_cell_mean) ? valueModel.per_cell_mean : 0;
    const perCellSd = Number.isFinite(valueModel.per_cell_sd) ? valueModel.per_cell_sd : 0;
    const referenceItemValue = Math.max(0, baseItemMean + avgCellsPerItem * perCellMean);

    if (referenceItemValue <= 1e-9) {
        return {
            base_item_mean: targetItemValue,
            base_item_sd: 0,
            per_cell_mean: 0,
            per_cell_sd: 0
        };
    }

    const scale = Math.max(targetItemValue, 0) / referenceItemValue;
    return {
        base_item_mean: baseItemMean * scale,
        base_item_sd: baseItemSd * scale,
        per_cell_mean: perCellMean * scale,
        per_cell_sd: perCellSd * scale
    };
}

function clampProbability(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(1, numeric));
}

function defaultQuantileFromSorted(xs, q) {
    if (!xs || xs.length === 0) return NaN;
    if (q <= 0) return xs[0];
    if (q >= 1) return xs[xs.length - 1];
    const pos = (xs.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return xs[lo];
    const frac = pos - lo;
    return xs[lo] * (1 - frac) + xs[hi] * frac;
}

function gaussian(mean = 0, stdev = 1, random = Math.random) {
    if (stdev <= 0) return mean;
    stdev = Math.max(stdev, 1e-9);
    const u = 1 - random();
    const v = random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdev + mean;
}

function drawDiscreteMass(mass, random = Math.random) {
    if (!mass || mass.length === 0) return null;
    const u = random();
    let runningMass = 0.0;
    for (let i = 0; i < mass.length; i++) {
        runningMass += mass[i].prob;
        if (u <= runningMass) return mass[i].count;
    }
    return mass[mass.length - 1].count;
}

function drawWeightedEntry(entries, random = Math.random) {
    if (!entries || entries.length === 0) return null;
    const u = random();
    let runningProb = 0.0;
    for (let i = 0; i < entries.length; i++) {
        runningProb += entries[i].prob;
        if (u <= runningProb) return entries[i];
    }
    return entries[entries.length - 1];
}

function drawTailModelUplift(tailModel, itemCount, totalCells, valueModel, random = Math.random) {
    if (!tailModel || tailModel.enabled === false || !Number.isInteger(itemCount) || itemCount <= 0) return 0;
    const battleProbability = clampProbability(tailModel.battle_probability);
    if (battleProbability <= 0 || random() > battleProbability) return 0;

    const weightedTailValues = Array.isArray(tailModel.weighted_values)
        ? tailModel.weighted_values
            .map((entry) => ({
                value: Number(entry && entry.value),
                probability: Number(entry && entry.probability)
            }))
            .filter((entry) => Number.isFinite(entry.value) && entry.value >= 0 && Number.isFinite(entry.probability) && entry.probability > 0)
        : [];
    const tailValues = Array.isArray(tailModel.values)
        ? tailModel.values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value >= 0)
        : [];
    let tailValue = 0;
    if (weightedTailValues.length > 0) {
        const totalProbability = weightedTailValues.reduce((sum, entry) => sum + entry.probability, 0);
        const u = random() * totalProbability;
        let runningProbability = 0;
        for (let i = 0; i < weightedTailValues.length; i++) {
            runningProbability += weightedTailValues[i].probability;
            if (u <= runningProbability) {
                tailValue = weightedTailValues[i].value;
                break;
            }
        }
        if (tailValue <= 0) tailValue = weightedTailValues[weightedTailValues.length - 1].value;
    } else if (tailValues.length > 0) {
        const index = Math.min(tailValues.length - 1, Math.floor(random() * tailValues.length));
        tailValue = tailValues[index];
    } else {
        const mean = Number(tailModel.mean);
        const sd = Number(tailModel.sd);
        tailValue = gaussian(Number.isFinite(mean) ? mean : 0, Number.isFinite(sd) ? sd : 0, random);
    }

    const avgCellsPerItem = Number.isFinite(totalCells) && itemCount > 0 ? totalCells / itemCount : 0;
    const inferredReplacement = (Number(valueModel.base_item_mean) || 0)
        + avgCellsPerItem * (Number(valueModel.per_cell_mean) || 0);
    const replacementValue = Number.isFinite(Number(tailModel.replacement_item_mean))
        ? Number(tailModel.replacement_item_mean)
        : inferredReplacement;
    return Math.max(0, tailValue - Math.max(0, replacementValue));
}

function drawState(weighted, random = Math.random) {
    const u = random();
    let running = 0.0;
    for (let i = 0; i < weighted.length; i++) {
        running += weighted[i].p;
        if (u <= running) return weighted[i].cand;
    }
    return weighted[weighted.length - 1].cand;
}

function runValuationMonteCarlo({
    config,
    state,
    weighted,
    solverBudget = null,
    inferRedFamilyJointPosterior = null,
    quantileFromSorted = defaultQuantileFromSorted,
    random = Math.random,
    qualities = DEFAULT_QUALITIES
} = {}) {
    if (!weighted || weighted.length === 0) return {};
    const solver = config && config.solver ? config.solver : {};
    const sample_n = solverBudget && Number.isInteger(solverBudget.mc_samples)
        ? solverBudget.mc_samples
        : solver.mc_samples;
    const valueModelByQuality = config && config.value_model ? config.value_model : {};
    const vals = [];
    const bid = state ? state.bid_price : null;
    const systemAvgValuePerCell = Number.isFinite(state && state.system_avg_value_per_cell)
        ? state.system_avg_value_per_cell
        : null;

    for (let i = 0; i < sample_n; i++) {
        const cand = drawState(weighted, random);
        let total_value = 0.0;
        let total_cells_draw = 0.0;
        for (const q of qualities) {
            let vm = valueModelByQuality[q];
            const n = cand.counts[q];
            const cg = cand.color_grids[q];
            const sampledCells = drawDiscreteMass(cg.mass, random);
            const cell_mu = cg.mean_cells;
            const cell_sd = Math.max((cg.p90_cells - cg.p10_cells) / 2.56, 0.5);
            const rawCellsDraw = sampledCells !== null ? sampledCells : Math.max(0.0, gaussian(cell_mu, cell_sd, random));
            const cells_draw = n > 0 ? rawCellsDraw : 0;

            if (systemAvgValuePerCell !== null) {
                total_cells_draw += cells_draw;
                continue;
            }

            if (q === "r" && Number.isInteger(n) && n > 0) {
                const redFallbackValueModel = valueModelByQuality && valueModelByQuality.r ? valueModelByQuality.r : {};
                const redJointPosterior = typeof inferRedFamilyJointPosterior === "function"
                    ? inferRedFamilyJointPosterior(n, cells_draw)
                    : [];
                const redJointSample = drawWeightedEntry(redJointPosterior, random);
                if (redJointSample) {
                    vm = {
                        base_item_mean: redJointSample.effective_base_item_mean,
                        base_item_sd: redJointSample.effective_base_item_sd,
                        per_cell_mean: redJointSample.effective_per_cell_mean,
                        per_cell_sd: redJointSample.effective_per_cell_sd,
                        ...(redFallbackValueModel.tail_model ? { tail_model: redFallbackValueModel.tail_model } : {})
                    };
                }
            }
            const customTargetItemValue = getQualityValueOverrideTarget(state, q);
            if (customTargetItemValue !== null) {
                vm = scaleValueModelToTargetItemValue(vm, customTargetItemValue, cells_draw, n);
            }

            if (n <= 0 && cells_draw <= 0) continue;

            let part = gaussian(n * vm.base_item_mean, Math.sqrt(Math.max(n, 0)) * vm.base_item_sd, random);
            part += gaussian(cells_draw * vm.per_cell_mean, Math.sqrt(Math.max(cells_draw, 0)) * vm.per_cell_sd, random);
            part += drawTailModelUplift(vm.tail_model, n, cells_draw, vm, random);
            total_value += Math.max(0.0, part);
        }
        if (systemAvgValuePerCell !== null) total_value = Math.max(0.0, total_cells_draw * systemAvgValuePerCell);
        vals.push(total_value);
    }

    vals.sort((a, b) => a - b);
    const mean_v = vals.reduce((a, b) => a + b, 0) / vals.length;
    const q05 = quantileFromSorted(vals, 0.05);
    const q25 = quantileFromSorted(vals, 0.25);
    const q50 = quantileFromSorted(vals, 0.50);
    const q75 = quantileFromSorted(vals, 0.75);
    const q95 = quantileFromSorted(vals, 0.95);

    const res = { mean_value: mean_v, q05, q25, q50, q75, q95 };
    if (systemAvgValuePerCell !== null) res.system_avg_value_per_cell = systemAvgValuePerCell;

    if (bid !== null && bid !== undefined && bid > 0) {
        const profits = vals.map(v => v - bid);
        const pos = profits.filter(x => x > 0);
        const neg = profits.filter(x => x <= 0).map(x => -x);
        const mean_neg = neg.length ? neg.reduce((a, b) => a + b, 0) / neg.length : 0;
        const mean_pos = pos.length ? pos.reduce((a, b) => a + b, 0) / pos.length : 0;

        res.bid_price = bid;
        res.expected_profit = mean_v - bid;
        res.profit_prob = pos.length / profits.length;
        res.loss_prob = 1.0 - res.profit_prob;
        res.ev_roi = mean_v / bid - 1.0;
        res.q25_roi = q25 / bid - 1.0;
        res.q05_roi = q05 / bid - 1.0;
        res.gain_loss_ratio = mean_neg > 1e-9 ? mean_pos / mean_neg : Infinity;
    }

    return res;
}

const valuationRuntime = {
    getQualityValueOverrideTarget,
    scaleValueModelToTargetItemValue,
    clampProbability,
    gaussian,
    drawDiscreteMass,
    drawWeightedEntry,
    drawTailModelUplift,
    runValuationMonteCarlo
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = valuationRuntime;
}

if (typeof globalThis !== "undefined") {
    globalThis.AK_VALUATION_RUNTIME = valuationRuntime;
}
