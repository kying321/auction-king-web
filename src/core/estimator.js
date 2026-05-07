const authorityCalibrationRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./authority_calibration_runtime.js")
    : (typeof AK_AUTHORITY_CALIBRATION_RUNTIME !== "undefined" ? AK_AUTHORITY_CALIBRATION_RUNTIME : (typeof window !== "undefined" ? window.AK_AUTHORITY_CALIBRATION_RUNTIME : {}));
const averageObservationRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./average_observation_runtime.js")
    : (typeof AK_AVERAGE_OBSERVATION_RUNTIME !== "undefined" ? AK_AVERAGE_OBSERVATION_RUNTIME : (typeof globalThis !== "undefined" ? globalThis.AK_AVERAGE_OBSERVATION_RUNTIME : {}));
const posteriorRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./posterior_runtime.js")
    : (typeof AK_POSTERIOR_RUNTIME !== "undefined" ? AK_POSTERIOR_RUNTIME : (typeof globalThis !== "undefined" ? globalThis.AK_POSTERIOR_RUNTIME : {}));

const {
    applyAuthorityCalibrationToResolvedConfig: applyAuthorityCalibrationToResolvedConfigFromRuntime
} = authorityCalibrationRuntime;
const {
    normalizeObservedAverageText,
    formatAverageDisplayFromTotalCells,
    getAverageInterval,
    roundedAvgInterval,
    getCellTotalBounds,
    getMatchingAverageTotals,
    hasFeasibleAverageForCount,
    getMatchingAverageTotalsInRange,
    getAverageObservationOptionsForState,
    getAverageObservationOptionsForQuality
} = averageObservationRuntime;
const {
    normalizePosteriorMass,
    summarizePosteriorMass,
    accumulatePosteriorMass,
    summarizePosteriorMassMap,
    normalizeLabeledWeights,
    approxPosteriorMass,
    getAllowedTotalMassProbability
} = posteriorRuntime;

const COLLECTION_FAMILIES_PHASE1_RUNTIME_ENABLED = false;

const QUALITIES = ["w", "g", "b", "p", "o", "r"];
const MAX_SOLVER_STATES = 4000000;
const MAX_SOLVER_MC_SAMPLES = 180000;
const QUALITY_NAMES = { "w": "白", "g": "绿", "b": "蓝", "p": "紫", "o": "橙", "r": "红" };
const QUALITY_TOTAL_CELL_STATE_KEYS = {
    w: "w_total_cells",
    g: "g_total_cells",
    b: "b_total_cells",
    p: "p_total_cells",
    o: "o_total_cells",
    r: "r_total_cells"
};

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMergeConfig(base, override) {
    if (!isPlainObject(base)) return override === undefined ? base : override;

    const output = JSON.parse(JSON.stringify(base));
    if (!isPlainObject(override)) return output;

    Object.keys(override).forEach((key) => {
        const overrideValue = override[key];
        if (isPlainObject(output[key]) && isPlainObject(overrideValue)) {
            output[key] = deepMergeConfig(output[key], overrideValue);
        } else {
            output[key] = JSON.parse(JSON.stringify(overrideValue));
        }
    });

    return output;
}

function resolveEstimatorConfig(config, mapId) {
    const resolvedBase = isPlainObject(config) ? deepMergeConfig({}, config) : config;
    if (!isPlainObject(resolvedBase)) return resolvedBase;

    const hasStructuredWorkspaceConfig = isPlainObject(resolvedBase.app)
        && isPlainObject(resolvedBase.model)
        && isPlainObject(resolvedBase.maps);

    if (hasStructuredWorkspaceConfig) {
        const defaultMapId = resolvedBase.app.default_map_id || resolvedBase.default_map_id || null;
        const selectedMapId = mapId || defaultMapId || null;
        const mapOverride = selectedMapId && isPlainObject(resolvedBase.maps[selectedMapId])
            ? resolvedBase.maps[selectedMapId]
            : {};
        const resolved = deepMergeConfig(resolvedBase.model, mapOverride);

        resolved.app = deepMergeConfig({}, resolvedBase.app);
        resolved.fields = deepMergeConfig({}, resolvedBase.fields || {});
        resolved.templates = deepMergeConfig({}, resolvedBase.templates || {});
        resolved.maps = deepMergeConfig({}, resolvedBase.maps || {});
        resolved.model = deepMergeConfig({}, resolvedBase.model || {});
        resolved.solver = deepMergeConfig(resolvedBase.solver || {}, mapOverride && mapOverride.solver ? mapOverride.solver : {});
        resolved.active_map_id = selectedMapId;
        resolved.default_map_id = defaultMapId;
        if (!resolved.map_name && selectedMapId && isPlainObject(resolvedBase.maps[selectedMapId])) {
            resolved.map_name = resolvedBase.maps[selectedMapId].map_name || resolvedBase.maps[selectedMapId].label || selectedMapId;
        }
        return typeof applyAuthorityCalibrationToResolvedConfigFromRuntime === "function"
            ? applyAuthorityCalibrationToResolvedConfigFromRuntime(resolved, resolvedBase, selectedMapId)
            : resolved;
    }

    const selectedMapId = mapId || resolvedBase.default_map_id || null;
    const presets = resolvedBase.map_presets;
    if (!selectedMapId || !isPlainObject(presets) || !isPlainObject(presets[selectedMapId])) {
        return resolvedBase;
    }

    const resolved = deepMergeConfig(resolvedBase, presets[selectedMapId]);
    resolved.active_map_id = selectedMapId;
    return typeof applyAuthorityCalibrationToResolvedConfigFromRuntime === "function"
        ? applyAuthorityCalibrationToResolvedConfigFromRuntime(resolved, resolvedBase, selectedMapId)
        : resolved;
}

function safeLog(x) {
    return Math.log(Math.max(x, 1e-300));
}

function logSumExp(values) {
    if (!values || values.length === 0) return -Infinity;
    let m = -Infinity;
    for (let i = 0; i < values.length; i++) {
        if (values[i] > m) m = values[i];
    }
    if (m === -Infinity || isNaN(m)) return m;
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += Math.exp(values[i] - m);
    }
    return m + Math.log(sum);
}

function normalPdf(x, mean, sd) {
    sd = Math.max(sd, 1e-9);
    const z = (x - mean) / sd;
    return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
}

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

function getCountPriorStrength(config) {
    const solver = config && config.solver ? config.solver : {};
    const raw = Number(solver.count_prior_strength);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function hasDirectOrangeRedCountAnchor(state = {}) {
    if (Number.isInteger(state.r2_orange_count)) return true;
    return [
        state.custom_o_min,
        state.custom_o_max,
        state.custom_r_min,
        state.custom_r_max
    ].some((value) => Number.isInteger(value));
}

function getEffectiveCountPriorStrength(config, state = {}) {
    const baseStrength = getCountPriorStrength(config);
    const solver = config && config.solver ? config.solver : {};
    const openStrength = Number(solver.open_high_orange_avg_count_prior_strength);
    if (!Number.isFinite(openStrength) || openStrength <= 0) return baseStrength;
    if (hasDirectOrangeRedCountAnchor(state)) return baseStrength;

    const threshold = Number.isFinite(Number(solver.open_high_orange_avg_threshold))
        ? Number(solver.open_high_orange_avg_threshold)
        : 4;
    const orangeAvg = Number(state && state.r2_orange_avg);
    if (!Number.isFinite(orangeAvg) || orangeAvg < threshold) return baseStrength;

    return Math.min(baseStrength, openStrength);
}

function quantileFromSorted(xs, q) {
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

function deriveAdaptiveSolverBudget(config, state) {
    const solver = config && isPlainObject(config.solver) ? config.solver : {};
    const requestedMaxStates = Number(solver.max_states);
    const requestedMcSamples = Number(solver.mc_samples);
    const baseMaxStates = Number.isInteger(requestedMaxStates) && requestedMaxStates > 0
        ? Math.min(requestedMaxStates, MAX_SOLVER_STATES)
        : MAX_SOLVER_STATES;
    const baseMcSamples = Number.isInteger(requestedMcSamples) && requestedMcSamples > 0
        ? Math.min(requestedMcSamples, MAX_SOLVER_MC_SAMPLES)
        : MAX_SOLVER_MC_SAMPLES;
    const totalItems = Number.isInteger(state && state.r1_total_items) ? state.r1_total_items : 0;
    const knownCountFields = [
        "r1_blue_count",
        "w_total_cells",
        "g_total_cells",
        "b_total_cells",
        "p_total_cells",
        "o_total_cells",
        "r_total_cells",
        "r2_purple_count",
        "r2_orange_count",
        "r2_white_green_cells",
        "r3_green_count",
        "r4_total_storage_cells",
        "r5_white_green_total",
        "r5_white_count",
        "custom_o_min",
        "custom_o_max",
        "custom_r_min",
        "custom_r_max"
    ];
    const avgFields = ["r2_orange_avg", "r3_purple_avg", "r3_white_green_avg", "r4_blue_avg"];
    const knownCounts = knownCountFields.reduce((sum, field) => sum + (Number.isInteger(state && state[field]) ? 1 : 0), 0);
    const knownAverages = avgFields.reduce((sum, field) => sum + (Number.isFinite(state && state[field]) ? 1 : 0), 0);
    const constraintScore = knownCounts * 1.2 + knownAverages * 1.6;
    const totalPenalty = Math.max(0, totalItems - 24) / 18;
    const opennessPenalty = Math.max(0, 4 - constraintScore);

    const sparseFactor = Math.min(1, Math.max(0.05, 0.18 + constraintScore * 0.18 - totalPenalty * 0.22));
    const mcFactor = Math.min(1, Math.max(0.08, 0.12 + constraintScore * 0.16 - totalPenalty * 0.12));
    const maxStates = Math.max(
        60000,
        Math.min(baseMaxStates, Math.round(baseMaxStates * sparseFactor))
    );
    const mcSamples = Math.max(
        12000,
        Math.min(baseMcSamples, Math.round(baseMcSamples * mcFactor))
    );

    return {
        max_states: maxStates,
        mc_samples: mcSamples,
        is_sparse_mode: opennessPenalty > 0.5
    };
}

// Lanczos approximation for log-gamma
function lgamma(x) {
    if (x <= 0) return Infinity;
    const cof = [
        76.18009172947146,
        -86.50532032941677,
        24.01409824083091,
        -1.231739572450155,
        0.001208650973866179,
        -0.000005395239384953
    ];
    let ser = 1.000000000190015;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let y = x;
    for (let j = 0; j < 6; j++) {
        y += 1;
        ser += cof[j] / y;
    }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function isIntegerField(value) {
    return value === null || value === undefined || Number.isInteger(value);
}

class AuctionKingEstimator {
    constructor(config, state) {
        this.config = config;
        this.cellInferenceCache = new Map();
        this.redTypePosteriorCache = new Map();
        this.redFamilyJointPosteriorCache = new Map();
        this.collectionFamilyPosteriorCache = new Map();
        this.redTypeProfilesCache = null;
        this.collectionFamiliesCache = null;
        this.state = {
            r1_total_items: null,
            r1_blue_count: null,
            w_total_cells: null,
            g_total_cells: null,
            b_total_cells: null,
            p_total_cells: null,
            o_total_cells: null,
            r_total_cells: null,
            r2_orange_avg: null,
            r2_orange_avg_text: null,
            r2_purple_count: null,
            r2_orange_count: null,
            r2_white_green_cells: null,
            r3_green_count: null,
            r3_purple_avg: null,
            r3_purple_avg_text: null,
            r3_white_green_avg: null,
            r3_white_green_avg_text: null,
            r4_blue_avg: null,
            r4_blue_avg_text: null,
            r4_total_storage_cells: null,
            r5_white_green_total: null,
            r5_white_count: null,
            custom_o_min: null,
            custom_o_max: null,
            custom_r_min: null,
            custom_r_max: null,
            custom_p_value_w: null,
            custom_o_value_w: null,
            custom_r_value_w: null,
            system_avg_value_type_count: null,
            system_avg_value_per_cell: null,
            bid_price: null,
            ...state
        };
    }

    getUnboundedMaxCellsPerItem() {
        const solver = this.config && this.config.solver ? this.config.solver : {};
        const raw = Number(solver.unbounded_cell_max_per_item);
        return Number.isFinite(raw) && raw > 0 ? raw : 30;
    }

    getCellSupportSigma() {
        const solver = this.config && this.config.solver ? this.config.solver : {};
        const raw = Number(solver.cell_support_sigma);
        return Number.isFinite(raw) && raw > 0 ? raw : 6;
    }

    getCellSupportMaxPoints() {
        const solver = this.config && this.config.solver ? this.config.solver : {};
        const raw = Number(solver.cell_support_max_points);
        return Number.isInteger(raw) && raw > 0 ? raw : 240;
    }

    getContextualMaxTotalForQuality(q) {
        const candidates = [];
        if (Number.isInteger(this.state.r4_total_storage_cells)) candidates.push(this.state.r4_total_storage_cells);
        if ((q === "w" || q === "g") && Number.isInteger(this.state.r2_white_green_cells)) {
            candidates.push(this.state.r2_white_green_cells);
        }
        if (!candidates.length) return null;
        return Math.min(...candidates.filter(Number.isFinite));
    }

    getObservedTotalCellsForQuality(q) {
        const key = QUALITY_TOTAL_CELL_STATE_KEYS[q];
        const value = key ? this.state[key] : null;
        return Number.isInteger(value) ? value : null;
    }

    getCellTotalBoundsForQuality(q, n, options = {}) {
        return getCellTotalBounds(this.config.cells_per_item[q], n, {
            maxTotal: this.getContextualMaxTotalForQuality(q),
            unboundedMaxCellsPerItem: this.getUnboundedMaxCellsPerItem(),
            ...options
        });
    }

    getUnobservedCellSupportBounds(minTotal, maxTotal, meanTotal, sdTotal) {
        const range = maxTotal - minTotal + 1;
        if (range <= this.getCellSupportMaxPoints()) return { low: minTotal, high: maxTotal };
        const sigma = this.getCellSupportSigma();
        const low = Math.max(minTotal, Math.floor(meanTotal - sigma * sdTotal));
        const high = Math.min(maxTotal, Math.ceil(meanTotal + sigma * sdTotal));
        if (low <= high) return { low, high };
        const anchor = Math.max(minTotal, Math.min(maxTotal, Math.round(meanTotal)));
        return { low: anchor, high: anchor };
    }

    getRedTypeProfiles() {
        if (this.redTypeProfilesCache !== null) return this.redTypeProfilesCache;

        const raw = this.config.red_type_profiles && this.config.red_type_profiles.profiles;
        if (!raw || typeof raw !== "object") {
            this.redTypeProfilesCache = [];
            return this.redTypeProfilesCache;
        }

        const fallbackRedValue = this.config.value_model && this.config.value_model.r ? this.config.value_model.r : {};
        const fallbackRedCells = this.config.cells_per_item && this.config.cells_per_item.r ? this.config.cells_per_item.r : {};

        this.redTypeProfilesCache = Object.entries(raw).map(([id, profile]) => ({
            id,
            label: profile.label || id,
            prior: Number.isFinite(profile.prior) ? Math.max(profile.prior, 0) : 1,
            mean_cells_per_item: Number.isFinite(profile.mean_cells_per_item) ? profile.mean_cells_per_item : fallbackRedCells.mean,
            sd_cells_per_item: Number.isFinite(profile.sd_cells_per_item) ? profile.sd_cells_per_item : fallbackRedCells.sd,
            base_item_mean: Number.isFinite(profile.base_item_mean) ? profile.base_item_mean : fallbackRedValue.base_item_mean,
            base_item_sd: Number.isFinite(profile.base_item_sd) ? profile.base_item_sd : fallbackRedValue.base_item_sd,
            per_cell_mean: Number.isFinite(profile.per_cell_mean) ? profile.per_cell_mean : fallbackRedValue.per_cell_mean,
            per_cell_sd: Number.isFinite(profile.per_cell_sd) ? profile.per_cell_sd : fallbackRedValue.per_cell_sd
        })).filter((profile) =>
            Number.isFinite(profile.mean_cells_per_item) &&
            Number.isFinite(profile.sd_cells_per_item) &&
            Number.isFinite(profile.base_item_mean) &&
            Number.isFinite(profile.base_item_sd) &&
            Number.isFinite(profile.per_cell_mean) &&
            Number.isFinite(profile.per_cell_sd)
        );

        return this.redTypeProfilesCache;
    }

    getCollectionFamilies() {
        if (this.collectionFamiliesCache !== null) return this.collectionFamiliesCache;

        if (!COLLECTION_FAMILIES_PHASE1_RUNTIME_ENABLED) {
            this.collectionFamiliesCache = [];
            return this.collectionFamiliesCache;
        }

        const raw = this.config.collection_families;
        if (!raw || typeof raw !== "object") {
            this.collectionFamiliesCache = [];
            return this.collectionFamiliesCache;
        }

        this.collectionFamiliesCache = Object.entries(raw).map(([id, family]) => ({
            id,
            label: family.label || id,
            prior: Number.isFinite(family.prior) ? Math.max(family.prior, 0) : 1,
            value_bias: Number.isFinite(family.value_bias) ? Math.max(family.value_bias, 0) : 1,
            notes: Array.isArray(family.notes) ? family.notes.filter((note) => typeof note === "string") : [],
            red_type_bias: isPlainObject(family.red_type_bias) ? family.red_type_bias : {}
        })).filter((family) =>
            Number.isFinite(family.prior) &&
            Number.isFinite(family.value_bias)
        );

        return this.collectionFamiliesCache;
    }

    inferRedFamilyJointPosterior(redCount, totalRedCells) {
        if (!Number.isInteger(redCount) || redCount <= 0 || !Number.isFinite(totalRedCells)) return [];

        const profiles = this.getRedTypeProfiles();
        if (profiles.length === 0) return [];

        const cacheKey = `${redCount}|${totalRedCells}`;
        if (this.redFamilyJointPosteriorCache.has(cacheKey)) {
            return this.redFamilyJointPosteriorCache.get(cacheKey);
        }

        const families = this.getCollectionFamilies();
        const useFamilies = families.length > 0
            ? families
            : [{ id: "_default", label: "默认", prior: 1, value_bias: 1, notes: [], red_type_bias: {} }];
        const avgCells = totalRedCells / redCount;
        const scale = Math.sqrt(Math.max(redCount, 1));
        const weightedEntries = [];

        for (let i = 0; i < useFamilies.length; i++) {
            const family = useFamilies[i];
            for (let j = 0; j < profiles.length; j++) {
                const profile = profiles[j];
                const familyTypeBiasRaw = family.red_type_bias[profile.id];
                const familyTypeBias = Number.isFinite(familyTypeBiasRaw) ? Math.max(familyTypeBiasRaw, 0) : 1;
                const spread = Math.max(profile.sd_cells_per_item / scale, 0.05);
                const effectiveBaseItemMean = profile.base_item_mean * family.value_bias;
                const effectiveBaseItemSd = profile.base_item_sd * family.value_bias;
                const effectivePerCellMean = profile.per_cell_mean * family.value_bias;
                const effectivePerCellSd = profile.per_cell_sd * family.value_bias;

                weightedEntries.push({
                    ...profile,
                    family_id: family.id,
                    family_label: family.label,
                    family_value_bias: family.value_bias,
                    family_notes: family.notes,
                    anchor_item_value: effectiveBaseItemMean + profile.mean_cells_per_item * effectivePerCellMean,
                    effective_base_item_mean: effectiveBaseItemMean,
                    effective_base_item_sd: effectiveBaseItemSd,
                    effective_per_cell_mean: effectivePerCellMean,
                    effective_per_cell_sd: effectivePerCellSd,
                    weight: Math.max(family.prior, 1e-9) * Math.max(profile.prior, 1e-9) * Math.max(familyTypeBias, 1e-9) * normalPdf(avgCells, profile.mean_cells_per_item, spread)
                });
            }
        }

        const normalized = normalizeLabeledWeights(weightedEntries)
            .map((entry) => ({
                ...entry,
                prob: entry.prob
            }))
            .sort((a, b) => b.prob - a.prob);

        this.redFamilyJointPosteriorCache.set(cacheKey, normalized);
        return normalized;
    }

    inferRedTypePosterior(redCount, totalRedCells) {
        if (!Number.isInteger(redCount) || redCount <= 0 || !Number.isFinite(totalRedCells)) return [];

        const cacheKey = `${redCount}|${totalRedCells}`;
        if (this.redTypePosteriorCache.has(cacheKey)) {
            return this.redTypePosteriorCache.get(cacheKey);
        }

        const jointPosterior = this.inferRedFamilyJointPosterior(redCount, totalRedCells);
        if (jointPosterior.length === 0) {
            this.redTypePosteriorCache.set(cacheKey, []);
            return [];
        }

        const typeMap = {};
        for (let i = 0; i < jointPosterior.length; i++) {
            const entry = jointPosterior[i];
            if (!typeMap[entry.id]) {
                typeMap[entry.id] = {
                    id: entry.id,
                    label: entry.label,
                    prob: 0,
                    anchor_item_value: 0,
                    per_cell_mean: 0
                };
            }
            typeMap[entry.id].prob += entry.prob;
            typeMap[entry.id].anchor_item_value += entry.prob * entry.anchor_item_value;
            typeMap[entry.id].per_cell_mean += entry.prob * entry.effective_per_cell_mean;
        }

        const normalized = Object.values(typeMap).map((entry) => ({
            ...entry,
            anchor_item_value: entry.prob > 0 ? entry.anchor_item_value / entry.prob : 0,
            per_cell_mean: entry.prob > 0 ? entry.per_cell_mean / entry.prob : 0
        })).sort((a, b) => b.prob - a.prob);

        this.redTypePosteriorCache.set(cacheKey, normalized);
        return normalized;
    }

    inferCollectionFamilyPosterior(redCount, totalRedCells) {
        if (!Number.isInteger(redCount) || redCount <= 0 || !Number.isFinite(totalRedCells)) return [];
        const families = this.getCollectionFamilies();
        if (families.length === 0) return [];

        const cacheKey = `${redCount}|${totalRedCells}`;
        if (this.collectionFamilyPosteriorCache.has(cacheKey)) {
            return this.collectionFamilyPosteriorCache.get(cacheKey);
        }

        const jointPosterior = this.inferRedFamilyJointPosterior(redCount, totalRedCells);
        if (jointPosterior.length === 0) {
            const normalized = normalizeLabeledWeights(
                families.map((family) => ({ ...family, weight: Math.max(family.prior, 1e-9) }))
            ).map((family) => ({
                id: family.id,
                label: family.label,
                prob: family.prob,
                value_bias: family.value_bias,
                notes: family.notes
            })).sort((a, b) => b.prob - a.prob);
            this.collectionFamilyPosteriorCache.set(cacheKey, normalized);
            return normalized;
        }

        const familyMap = {};
        for (let i = 0; i < jointPosterior.length; i++) {
            const entry = jointPosterior[i];
            if (!familyMap[entry.family_id]) {
                familyMap[entry.family_id] = {
                    id: entry.family_id,
                    label: entry.family_label,
                    prob: 0,
                    value_bias: entry.family_value_bias,
                    notes: entry.family_notes
                };
            }
            familyMap[entry.family_id].prob += entry.prob;
        }

        const normalized = Object.values(familyMap).sort((a, b) => b.prob - a.prob);
        this.collectionFamilyPosteriorCache.set(cacheKey, normalized);
        return normalized;
    }

    mixRedTypePosterior(redCount, redMass) {
        if (!Number.isInteger(redCount) || redCount <= 0 || !redMass || redMass.length === 0) return [];

        const typeMap = {};
        for (let i = 0; i < redMass.length; i++) {
            const cellEntry = redMass[i];
            const posterior = this.inferRedTypePosterior(redCount, cellEntry.count);
            for (let j = 0; j < posterior.length; j++) {
                const typeEntry = posterior[j];
                if (!typeMap[typeEntry.id]) {
                    typeMap[typeEntry.id] = {
                        id: typeEntry.id,
                        label: typeEntry.label,
                        prob: 0,
                        anchor_item_value: 0,
                        per_cell_mean: 0
                    };
                }
                const weight = cellEntry.prob * typeEntry.prob;
                typeMap[typeEntry.id].prob += weight;
                typeMap[typeEntry.id].anchor_item_value += weight * typeEntry.anchor_item_value;
                typeMap[typeEntry.id].per_cell_mean += weight * typeEntry.per_cell_mean;
            }
        }

        return Object.values(typeMap).map((entry) => ({
            ...entry,
            anchor_item_value: entry.prob > 0 ? entry.anchor_item_value / entry.prob : 0,
            per_cell_mean: entry.prob > 0 ? entry.per_cell_mean / entry.prob : 0
        })).sort((a, b) => b.prob - a.prob);
    }

    mixCollectionFamilyPosterior(redCount, redMass) {
        if (!Number.isInteger(redCount) || redCount <= 0 || !redMass || redMass.length === 0) return [];

        const familyMap = {};
        for (let i = 0; i < redMass.length; i++) {
            const cellEntry = redMass[i];
            const posterior = this.inferCollectionFamilyPosterior(redCount, cellEntry.count);
            for (let j = 0; j < posterior.length; j++) {
                const familyEntry = posterior[j];
                if (!familyMap[familyEntry.id]) {
                    familyMap[familyEntry.id] = {
                        id: familyEntry.id,
                        label: familyEntry.label,
                        prob: 0,
                        value_bias: familyEntry.value_bias,
                        notes: familyEntry.notes
                    };
                }
                familyMap[familyEntry.id].prob += cellEntry.prob * familyEntry.prob;
            }
        }

        return Object.values(familyMap).sort((a, b) => b.prob - a.prob);
    }

    validateState() {
        const s = this.state;
        const errs = [];
        const integerFields = [
            "r1_total_items",
            "r1_blue_count",
            "w_total_cells",
            "g_total_cells",
            "b_total_cells",
            "p_total_cells",
            "o_total_cells",
            "r_total_cells",
            "r2_purple_count",
            "r2_orange_count",
            "r2_white_green_cells",
            "r3_green_count",
            "r4_total_storage_cells",
            "r5_white_green_total",
            "r5_white_count",
            "custom_o_min",
            "custom_o_max",
            "custom_r_min",
            "custom_r_max",
            "system_avg_value_type_count"
        ];
        
        if (s.r1_total_items === null) {
            let hasOther = false;
            for (let k in s) {
                if (k !== "r1_total_items" && k !== "bid_price" && s[k] !== null) hasOther = true;
            }
            if (hasOther) errs.push("请先输入 R1 的总数量。");
        }

        integerFields.forEach((field) => {
            if (!isIntegerField(s[field])) errs.push(`${field} 必须为整数。`);
        });
        
        if (s.r1_total_items !== null && (!Number.isInteger(s.r1_total_items) || s.r1_total_items <= 0)) errs.push("r1_total_items 必须为正整数。");
        if (s.r1_blue_count !== null && s.r1_total_items !== null && (s.r1_blue_count < 0 || s.r1_blue_count > s.r1_total_items)) errs.push("r1_blue_count 超出范围。");
        for (const field of ["w_total_cells", "g_total_cells", "b_total_cells", "p_total_cells", "o_total_cells", "r_total_cells"]) {
            if (s[field] !== null && s[field] < 0) errs.push(`${field} 不能为负数。`);
        }
        if (s.r2_purple_count !== null && s.r1_total_items !== null && (s.r2_purple_count < 0 || s.r2_purple_count > s.r1_total_items)) errs.push("r2_purple_count 超出范围。");
        if (s.r2_orange_count !== null && s.r1_total_items !== null && (s.r2_orange_count < 0 || s.r2_orange_count > s.r1_total_items)) errs.push("r2_orange_count 超出范围。");
        if (s.r2_white_green_cells !== null && s.r2_white_green_cells < 0) errs.push("r2_white_green_cells 不能为负数。");
        if (s.r3_green_count !== null && s.r1_total_items !== null && (s.r3_green_count < 0 || s.r3_green_count > s.r1_total_items)) errs.push("r3_green_count 超出范围。");
        if (s.r4_total_storage_cells !== null && s.r4_total_storage_cells < 0) errs.push("r4_total_storage_cells 不能为负数。");
        if (s.r5_white_count !== null && s.r1_total_items !== null && (s.r5_white_count < 0 || s.r5_white_count > s.r1_total_items)) errs.push("r5_white_count 超出范围。");
        if (s.custom_o_min !== null && s.custom_o_min < 0) errs.push("custom_o_min 不能为负数。");
        if (s.custom_o_max !== null && s.custom_o_max < 0) errs.push("custom_o_max 不能为负数。");
        if (s.custom_r_min !== null && s.custom_r_min < 0) errs.push("custom_r_min 不能为负数。");
        if (s.custom_r_max !== null && s.custom_r_max < 0) errs.push("custom_r_max 不能为负数。");
        if (s.custom_p_value_w !== null && s.custom_p_value_w < 0) errs.push("custom_p_value_w 不能为负数。");
        if (s.custom_o_value_w !== null && s.custom_o_value_w < 0) errs.push("custom_o_value_w 不能为负数。");
        if (s.custom_r_value_w !== null && s.custom_r_value_w < 0) errs.push("custom_r_value_w 不能为负数。");
        if (s.system_avg_value_type_count !== null && s.system_avg_value_type_count < 0) errs.push("system_avg_value_type_count 不能为负数。");
        if (s.system_avg_value_per_cell !== null && s.system_avg_value_per_cell < 0) errs.push("system_avg_value_per_cell 不能为负数。");
        if (s.custom_o_min !== null && s.custom_o_max !== null && s.custom_o_min > s.custom_o_max) errs.push("custom_o_min 不能大于 custom_o_max。");
        if (s.custom_r_min !== null && s.custom_r_max !== null && s.custom_r_min > s.custom_r_max) errs.push("custom_r_min 不能大于 custom_r_max。");
        if (s.r1_total_items !== null && s.custom_o_max !== null && s.custom_o_max > s.r1_total_items) errs.push("custom_o_max 不能超过总数量。");
        if (s.r1_total_items !== null && s.custom_r_max !== null && s.custom_r_max > s.r1_total_items) errs.push("custom_r_max 不能超过总数量。");

        for (const k of ["r2_orange_avg", "r3_purple_avg", "r3_white_green_avg", "r4_blue_avg"]) {
            if (s[k] !== null && s[k] < 0) errs.push(`${k} 不能为负数。`);
        }

        if (s.r2_orange_count !== null && s.custom_o_min !== null && s.r2_orange_count < s.custom_o_min) errs.push("r2_orange_count 不能小于 custom_o_min。");
        if (s.r2_orange_count !== null && s.custom_o_max !== null && s.r2_orange_count > s.custom_o_max) errs.push("r2_orange_count 不能大于 custom_o_max。");

        if (s.r5_white_green_total !== null) {
            if (s.r5_white_green_total < 0) errs.push("r5_white_green_total 不能为负。");
            if (s.r1_total_items !== null && s.r5_white_green_total > s.r1_total_items) errs.push("r5_white_green_total 不能超过总数量。");
            if (s.r3_green_count !== null && s.r5_white_green_total < s.r3_green_count) errs.push("r5_white_green_total 不能小于绿色数量。");
            if (s.r5_white_count !== null && s.r5_white_green_total < s.r5_white_count) errs.push("r5_white_green_total 不能小于白色数量。");
        }

        if (s.r5_white_count !== null && s.r3_green_count !== null && s.r5_white_green_total !== null) {
            if (s.r5_white_count + s.r3_green_count !== s.r5_white_green_total) errs.push("r5_white_count + r3_green_count 必须等于 r5_white_green_total。");
        }

        if (s.r1_total_items !== null) {
            let tk = 0;
            if (s.r1_blue_count !== null) tk += s.r1_blue_count;
            if (s.r2_purple_count !== null) tk += s.r2_purple_count;
            if (s.r2_orange_count !== null) tk += s.r2_orange_count;
            if (s.r3_green_count !== null) tk += s.r3_green_count;
            if (s.r5_white_count !== null) tk += s.r5_white_count;
            if (s.r5_white_green_total !== null) {
                tk += s.r5_white_green_total;
                if (s.r3_green_count !== null) tk -= s.r3_green_count;
                if (s.r5_white_count !== null) tk -= s.r5_white_count;
            }
            if (tk > s.r1_total_items) errs.push("已知数量之和超过总数量。");
        }
        return errs;
    }

    enumerateCountStates(solverBudget = null) {
        const s = this.state;
        const T = s.r1_total_items;
        if (T === null || T === undefined || isNaN(T)) return [];
        
        const known_b = s.r1_blue_count;
        const known_p = s.r2_purple_count;
        const known_o = s.r2_orange_count;
        const known_g = s.r3_green_count;
        const known_wg = s.r5_white_green_total;
        const known_w = s.r5_white_count;
        const known_o_avg = s.r2_orange_avg;
        const known_p_avg = s.r3_purple_avg;
        const known_b_avg = s.r4_blue_avg;
        const known_o_avg_text = s.r2_orange_avg_text;
        const known_p_avg_text = s.r3_purple_avg_text;
        const known_b_avg_text = s.r4_blue_avg_text;
        const custom_o_min = Number.isInteger(s.custom_o_min) ? s.custom_o_min : null;
        const custom_o_max = Number.isInteger(s.custom_o_max) ? s.custom_o_max : null;
        const custom_r_min = Number.isInteger(s.custom_r_min) ? s.custom_r_min : null;
        const custom_r_max = Number.isInteger(s.custom_r_max) ? s.custom_r_max : null;
        
        const results = [];
        const max_states = solverBudget && Number.isInteger(solverBudget.max_states)
            ? solverBudget.max_states
            : this.config.solver.max_states;
        const models = this.config.cells_per_item;
        const orangeAvgObservationOptions = getAverageObservationOptionsForState(this.config, s, "r2_orange_avg");
        const purpleAvgObservationOptions = getAverageObservationOptionsForState(this.config, s, "r3_purple_avg");
        const blueAvgObservationOptions = getAverageObservationOptionsForState(this.config, s, "r4_blue_avg");
        const orangeMinBound = Math.max(0, custom_o_min === null ? 0 : custom_o_min);
        const orangeMaxBound = custom_o_max === null ? Number.POSITIVE_INFINITY : custom_o_max;
        const redMinBound = Math.max(0, custom_r_min === null ? 0 : custom_r_min);
        const redMaxBound = custom_r_max === null ? Number.POSITIVE_INFINITY : custom_r_max;

        if (orangeMinBound > orangeMaxBound || redMinBound > redMaxBound) return [];

        const getOrangeRangeFromRemaining = (remainingAfterWhite) => {
            const lower = Math.max(
                0,
                orangeMinBound,
                Number.isFinite(redMaxBound) ? remainingAfterWhite - redMaxBound : -Infinity
            );
            const upper = Math.min(
                remainingAfterWhite,
                orangeMaxBound,
                remainingAfterWhite - redMinBound
            );
            if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) return null;
            return [lower, upper];
        };

        const getOrangeValuesFromRemaining = (remainingAfterWhite) => {
            const orangeRange = getOrangeRangeFromRemaining(remainingAfterWhite);
            if (!orangeRange) return [];
            if (known_o !== null) {
                return known_o >= orangeRange[0] && known_o <= orangeRange[1] ? [known_o] : [];
            }
            return Array.from({ length: orangeRange[1] - orangeRange[0] + 1 }, (_unused, offset) => orangeRange[0] + offset);
        };

        if (known_b !== null && !hasFeasibleAverageForCount(models.b, known_b, known_b_avg, { rawText: known_b_avg_text, ...blueAvgObservationOptions })) {
            return [];
        }

        const b_values = known_b !== null ? [known_b] : Array.from({length: T + 1}, (_, i) => i);
        
        for (const b of b_values) {
            if (b === null) continue;
            const rem1 = T - b;
            if (rem1 < 0) continue;
            
            const p_values = known_p !== null ? [known_p] : Array.from({length: rem1 + 1}, (_, i) => i);
            for (const p of p_values) {
                if (!hasFeasibleAverageForCount(models.p, p, known_p_avg, { rawText: known_p_avg_text, ...purpleAvgObservationOptions })) continue;
                const rem2 = rem1 - p;
                if (rem2 < 0) continue;
                
                const g_values = known_g !== null ? [known_g] : Array.from({length: rem2 + 1}, (_, i) => i);
                for (const g of g_values) {
                    const rem3 = rem2 - g;
                    if (rem3 < 0) continue;
                    
                    if (known_wg !== null) {
                        const w = known_w !== null ? known_w : known_wg - g;
                        if (known_w !== null && known_w + g !== known_wg) continue;
                        if (w < 0) continue;
                        const rem4 = rem3 - w;
                        if (rem4 < 0) continue;
                        const orangeValues = getOrangeValuesFromRemaining(rem4);
                        if (orangeValues.length === 0) continue;

                        for (let index = 0; index < orangeValues.length; index += 1) {
                            const o = orangeValues[index];
                            if (!hasFeasibleAverageForCount(models.o, o, known_o_avg, { rawText: known_o_avg_text, ...orangeAvgObservationOptions })) continue;
                            const r = rem4 - o;
                            results.push({ w, g, b, p, o, r });
                            if (results.length >= max_states) return results;
                        }
                    } else if (known_w !== null) {
                        const w = known_w;
                        const rem4 = rem3 - w;
                        if (rem4 < 0) continue;
                        const orangeValues = getOrangeValuesFromRemaining(rem4);
                        if (orangeValues.length === 0) continue;

                        for (let index = 0; index < orangeValues.length; index += 1) {
                            const o = orangeValues[index];
                            if (!hasFeasibleAverageForCount(models.o, o, known_o_avg, { rawText: known_o_avg_text, ...orangeAvgObservationOptions })) continue;
                            const r = rem4 - o;
                            results.push({ w, g, b, p, o, r });
                            if (results.length >= max_states) return results;
                        }
                    } else {
                        for (let w = 0; w <= rem3; w++) {
                            const rem4 = rem3 - w;
                            const orangeValues = getOrangeValuesFromRemaining(rem4);
                            if (orangeValues.length === 0) continue;
                            for (let index = 0; index < orangeValues.length; index += 1) {
                                const o = orangeValues[index];
                                if (!hasFeasibleAverageForCount(models.o, o, known_o_avg, { rawText: known_o_avg_text, ...orangeAvgObservationOptions })) continue;
                                const r = rem4 - o;
                                results.push({ w, g, b, p, o, r });
                                if (results.length >= max_states) return results;
                            }
                        }
                    }
                }
            }
        }
        return results;
    }

    logCountPrior(counts) {
        const alpha = this.config.alpha_counts;
        let score = 0.0;
        for (const q of QUALITIES) {
            score += lgamma(counts[q] + alpha[q]) - lgamma(alpha[q]) - lgamma(counts[q] + 1);
        }
        return score;
    }

    inferCellsForColor(q, n, avg_obs, avgText = null) {
        const avgObservationOptions = getAverageObservationOptionsForQuality(this.config, this.state, q);
        const exactTotalCells = this.getObservedTotalCellsForQuality(q);
        const cacheKey = [
            q,
            n,
            avg_obs === null || avg_obs === undefined ? "null" : avg_obs,
            normalizeObservedAverageText(avgText) || "raw:null",
            avgObservationOptions.roundingMode,
            exactTotalCells === null ? "total:null" : `total:${exactTotalCells}`
        ].join("|");
        if (this.cellInferenceCache.has(cacheKey)) {
            return this.cellInferenceCache.get(cacheKey);
        }

        const model = this.config.cells_per_item[q];
        const mean_total = n * model.mean;
        const sd_total = Math.sqrt(Math.max(n, 1)) * model.sd;
        const bounds = this.getCellTotalBoundsForQuality(q, n, {
            avg: avg_obs,
            ...avgObservationOptions
        });
        const min_total = bounds.min;
        const max_total = bounds.max;

        if (n === 0) {
            if (exactTotalCells !== null && exactTotalCells !== 0) {
                this.cellInferenceCache.set(cacheKey, null);
                return null;
            }
            if (avg_obs !== null && avg_obs !== undefined && Math.abs(avg_obs) >= 1e-12) {
                this.cellInferenceCache.set(cacheKey, null);
                return null;
            }
            const zeroResult = {
                posterior: {
                    mean_cells: 0.0,
                    p10_cells: 0,
                    p90_cells: 0,
                    feasible_low: 0,
                    feasible_high: 0,
                    mass: [{ count: 0, prob: 1 }]
                },
                add_score: 0.0
            };
            this.cellInferenceCache.set(cacheKey, zeroResult);
            return zeroResult;
        }

        let support = [];
        let weights = [];
        let feasible_low = min_total;
        let feasible_high = max_total;
        let add_score = 0.0;

        if (avg_obs !== null && avg_obs !== undefined) {
            const matchingTotals = getMatchingAverageTotals(model, n, avg_obs, {
                rawText: avgText,
                ...avgObservationOptions,
                maxTotal: this.getContextualMaxTotalForQuality(q),
                unboundedMaxCellsPerItem: this.getUnboundedMaxCellsPerItem()
            });
            if (matchingTotals.length === 0) {
                this.cellInferenceCache.set(cacheKey, null);
                return null;
            }
            const constrainedTotals = exactTotalCells === null
                ? matchingTotals
                : (matchingTotals.includes(exactTotalCells) ? [exactTotalCells] : []);
            if (constrainedTotals.length === 0) {
                this.cellInferenceCache.set(cacheKey, null);
                return null;
            }

            feasible_low = constrainedTotals[0];
            feasible_high = constrainedTotals[constrainedTotals.length - 1];
            for (let i = 0; i < constrainedTotals.length; i++) {
                const total = constrainedTotals[i];
                support.push(total);
                weights.push(normalPdf(total, mean_total, sd_total));
            }
            const sw = weights.reduce((a, b) => a + b, 0);
            if (sw <= 0) {
                this.cellInferenceCache.set(cacheKey, null);
                return null;
            }
            add_score = safeLog(sw);
        } else {
            if (exactTotalCells !== null) {
                if (exactTotalCells < min_total || exactTotalCells > max_total) {
                    this.cellInferenceCache.set(cacheKey, null);
                    return null;
                }
                feasible_low = exactTotalCells;
                feasible_high = exactTotalCells;
                support.push(exactTotalCells);
                const weight = normalPdf(exactTotalCells, mean_total, sd_total);
                if (weight <= 0) {
                    this.cellInferenceCache.set(cacheKey, null);
                    return null;
                }
                weights.push(weight);
                add_score = safeLog(weight);
            } else {
                const unobservedBounds = this.getUnobservedCellSupportBounds(min_total, max_total, mean_total, sd_total);
                feasible_low = unobservedBounds.low;
                feasible_high = unobservedBounds.high;
                for (let i = unobservedBounds.low; i <= unobservedBounds.high; i++) {
                    support.push(i);
                    weights.push(normalPdf(i, mean_total, sd_total));
                }
            }
        }

        const mass = normalizePosteriorMass(support, weights);
        const stats = summarizePosteriorMass(mass);
        const result = {
            posterior: {
                mean_cells: stats.mean_cells,
                p10_cells: stats.p10_cells,
                p90_cells: stats.p90_cells,
                feasible_low,
                feasible_high,
                mass
            },
            add_score
        };
        this.cellInferenceCache.set(cacheKey, result);
        return result;
    }

    buildCandidates(solverBudget = null) {
        const s = this.state;
        const observed_avg = {
            "o": s.r2_orange_avg,
            "p": s.r3_purple_avg,
            "b": s.r4_blue_avg,
            "w": null, "g": null, "r": null
        };
        const observed_avg_text = {
            "o": s.r2_orange_avg_text,
            "p": s.r3_purple_avg_text,
            "b": s.r4_blue_avg_text,
            "w": null, "g": null, "r": null
        };
        const whiteGreenAvgObservationOptions = getAverageObservationOptionsForState(this.config, s, "r3_white_green_avg");
        const countPriorStrength = getEffectiveCountPriorStrength(this.config, s);
        const candidates = [];
        const count_states = this.enumerateCountStates(solverBudget);

        for (const counts of count_states) {
            let score = this.logCountPrior(counts) * countPriorStrength;
            const color_grids = {};
            let ok = true;
            for (const q of QUALITIES) {
                const info = this.inferCellsForColor(q, counts[q], observed_avg[q], observed_avg_text[q]);
                if (!info) { ok = false; break; }
                color_grids[q] = info.posterior;
                score += info.add_score;
            }
            if (ok) {
                const whiteGreenCount = counts.w + counts.g;
                const whiteGreenMasses = [approxPosteriorMass(color_grids.w), approxPosteriorMass(color_grids.g)];

                if (Number.isFinite(s.r3_white_green_avg)) {
                    if (Number.isInteger(s.r2_white_green_cells)) {
                        const matchingExactWhiteGreenTotals = getMatchingAverageTotalsInRange(
                            s.r2_white_green_cells,
                            s.r2_white_green_cells,
                            whiteGreenCount,
                            s.r3_white_green_avg,
                            {
                                rawText: s.r3_white_green_avg_text,
                                ...whiteGreenAvgObservationOptions
                            }
                        );
                        if (matchingExactWhiteGreenTotals.length === 0) ok = false;
                    } else {
                        const whiteBounds = this.getCellTotalBoundsForQuality("w", counts.w, whiteGreenAvgObservationOptions);
                        const greenBounds = this.getCellTotalBoundsForQuality("g", counts.g, whiteGreenAvgObservationOptions);
                        const whiteGreenLow = whiteBounds.min + greenBounds.min;
                        const whiteGreenHigh = whiteBounds.max + greenBounds.max;
                        const matchingWhiteGreenTotals = getMatchingAverageTotalsInRange(
                            whiteGreenLow,
                            whiteGreenHigh,
                            whiteGreenCount,
                            s.r3_white_green_avg,
                            {
                                rawText: s.r3_white_green_avg_text,
                                ...whiteGreenAvgObservationOptions
                            }
                        );
                        const whiteGreenAvgProb = getAllowedTotalMassProbability(whiteGreenMasses, matchingWhiteGreenTotals);
                        if (whiteGreenAvgProb <= 0) ok = false;
                        else score += safeLog(whiteGreenAvgProb);
                    }
                }

                if (ok && Number.isInteger(s.r2_white_green_cells)) {
                    const whiteGreenCellsProb = getAllowedTotalMassProbability(whiteGreenMasses, [s.r2_white_green_cells]);
                    if (whiteGreenCellsProb <= 0) ok = false;
                    else score += safeLog(whiteGreenCellsProb);
                }

                if (ok && Number.isInteger(s.r4_total_storage_cells)) {
                    const totalStorageProb = getAllowedTotalMassProbability(
                        QUALITIES.map((quality) => approxPosteriorMass(color_grids[quality])),
                        [s.r4_total_storage_cells]
                    );
                    if (totalStorageProb <= 0) ok = false;
                    else score += safeLog(totalStorageProb);
                }
            }
            if (ok) {
                candidates.push({ counts, color_grids, log_score: score });
            }
        }
        return candidates;
    }

    normalize(cands) {
        if (!cands || cands.length === 0) return [];
        const z = logSumExp(cands.map(c => c.log_score));
        const out = cands.map(c => ({ cand: c, p: Math.exp(c.log_score - z) }));
        out.sort((a, b) => b.p - a.p);
        return out;
    }

    summarize(weighted) {
        const posteriorSignatureCache = new WeakMap();
        let nextPosteriorSignatureId = 1;
        const getPosteriorBucketKey = (count, posterior) => {
            if (!posterior || typeof posterior !== "object") return `${count}|none`;
            if (posteriorSignatureCache.has(posterior)) {
                return `${count}|${posteriorSignatureCache.get(posterior)}`;
            }
            const signature = nextPosteriorSignatureId++;
            posteriorSignatureCache.set(posterior, signature);
            return `${count}|${signature}`;
        };

        const out = {
            count_probs: { w: {}, g: {}, b: {}, p: {}, o: {}, r: {} },
            count_means: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 0 },
            cell_means: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 0 },
            cell_low: { w: 1e9, g: 1e9, b: 1e9, p: 1e9, o: 1e9, r: 1e9 },
            cell_high: { w: -1e9, g: -1e9, b: -1e9, p: -1e9, o: -1e9, r: -1e9 },
            red_cell_prob_map: {},
            red_type_prob_map: {},
            family_prob_map: {}
        };
        const cellMassMaps = { w: {}, g: {}, b: {}, p: {}, o: {}, r: {} };
        const redPosteriorBuckets = {};

        for (const {cand, p} of weighted) {
            for (const q of QUALITIES) {
                const n = cand.counts[q];
                const posterior = cand.color_grids[q];
                if (!out.count_probs[q][n]) out.count_probs[q][n] = 0;
                out.count_probs[q][n] += p;
                accumulatePosteriorMass(cellMassMaps[q], approxPosteriorMass(posterior), p);
            }

            const redCount = cand.counts.r;
            const redPosterior = cand.color_grids.r;
            const redMass = approxPosteriorMass(redPosterior);
            const redBucketKey = getPosteriorBucketKey(redCount, redPosterior);
            if (!redPosteriorBuckets[redBucketKey]) {
                redPosteriorBuckets[redBucketKey] = {
                    prob: 0,
                    redCount,
                    redMass
                };
            }
            redPosteriorBuckets[redBucketKey].prob += p;
        }

        for (const q of QUALITIES) {
            const countProbEntries = Object.entries(out.count_probs[q]);
            for (let i = 0; i < countProbEntries.length; i++) {
                const [countKey, prob] = countProbEntries[i];
                const count = parseInt(countKey, 10);
                out.count_means[q] += count * prob;
            }
            const cellStats = summarizePosteriorMassMap(cellMassMaps[q]);
            out.cell_means[q] = cellStats.mean_cells;
            out.cell_low[q] = cellStats.p10_cells;
            out.cell_high[q] = cellStats.p90_cells;
        }

        const redBuckets = Object.values(redPosteriorBuckets);
        for (let i = 0; i < redBuckets.length; i++) {
            const { redCount, prob: redCountProb, redMass } = redBuckets[i];
            redMass.forEach((entry) => {
                if (!out.red_cell_prob_map[entry.count]) out.red_cell_prob_map[entry.count] = 0;
                out.red_cell_prob_map[entry.count] += redCountProb * entry.prob;
            });

            const redTypeMass = this.mixRedTypePosterior(redCount, redMass);
            redTypeMass.forEach((entry) => {
                if (!out.red_type_prob_map[entry.id]) {
                    out.red_type_prob_map[entry.id] = {
                        id: entry.id,
                        label: entry.label,
                        prob: 0,
                        anchor_item_value: entry.anchor_item_value,
                        per_cell_mean: entry.per_cell_mean
                    };
                }
                out.red_type_prob_map[entry.id].prob += redCountProb * entry.prob;
            });

            if (this.getCollectionFamilies().length > 0) {
                const familyMass = this.mixCollectionFamilyPosterior(redCount, redMass);
                familyMass.forEach((entry) => {
                    if (!out.family_prob_map[entry.id]) {
                        out.family_prob_map[entry.id] = {
                            id: entry.id,
                            label: entry.label,
                            prob: 0,
                            value_bias: entry.value_bias,
                            notes: entry.notes
                        };
                    }
                    out.family_prob_map[entry.id].prob += redCountProb * entry.prob;
                });
            }
        }
        
        const sortedEntries = (dict) => Object.entries(dict).map(x => ({ count: parseInt(x[0]), prob: x[1] })).sort((a, b) => b.prob - a.prob);
        out.orange_count_probs = sortedEntries(out.count_probs.o);
        out.red_count_probs = sortedEntries(out.count_probs.r);
        out.red_cell_probs = sortedEntries(out.red_cell_prob_map);
        out.red_type_probs = Object.values(out.red_type_prob_map).sort((a, b) => b.prob - a.prob);
        out.family_probs = Object.values(out.family_prob_map).sort((a, b) => b.prob - a.prob);
        delete out.red_cell_prob_map;
        delete out.red_type_prob_map;
        delete out.family_prob_map;

        return out;
    }

    valuationMc(weighted, solverBudget = null) {
        if (!weighted || weighted.length === 0) return {};
        const sample_n = solverBudget && Number.isInteger(solverBudget.mc_samples)
            ? solverBudget.mc_samples
            : this.config.solver.mc_samples;
        const probs = weighted.map(x => x.p);
        const states = weighted.map(x => x.cand);
        
        const cum = [];
        let running = 0.0;
        for (const p of probs) {
            running += p;
            cum.push(running);
        }

        const drawState = () => {
            const u = Math.random();
            for (let i = 0; i < cum.length; i++) {
                if (u <= cum[i]) return states[i];
            }
            return states[states.length - 1];
        };

        const gaussian = (mean=0, stdev=1) => {
            if (stdev <= 0) return mean;
            stdev = Math.max(stdev, 1e-9);
            const u = 1 - Math.random();
            const v = Math.random();
            const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
            return z * stdev + mean;
        };

        const drawDiscreteMass = (mass) => {
            if (!mass || mass.length === 0) return null;
            const u = Math.random();
            let runningMass = 0.0;
            for (let i = 0; i < mass.length; i++) {
                runningMass += mass[i].prob;
                if (u <= runningMass) return mass[i].count;
            }
            return mass[mass.length - 1].count;
        };

        const drawWeightedEntry = (entries) => {
            if (!entries || entries.length === 0) return null;
            const u = Math.random();
            let runningProb = 0.0;
            for (let i = 0; i < entries.length; i++) {
                runningProb += entries[i].prob;
                if (u <= runningProb) return entries[i];
            }
            return entries[entries.length - 1];
        };

        const drawTailModelUplift = (tailModel, itemCount, totalCells, valueModel) => {
            if (!tailModel || tailModel.enabled === false || !Number.isInteger(itemCount) || itemCount <= 0) return 0;
            const battleProbability = clampProbability(tailModel.battle_probability);
            if (battleProbability <= 0 || Math.random() > battleProbability) return 0;

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
                const u = Math.random() * totalProbability;
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
                const index = Math.min(tailValues.length - 1, Math.floor(Math.random() * tailValues.length));
                tailValue = tailValues[index];
            } else {
                const mean = Number(tailModel.mean);
                const sd = Number(tailModel.sd);
                tailValue = gaussian(Number.isFinite(mean) ? mean : 0, Number.isFinite(sd) ? sd : 0);
            }

            const avgCellsPerItem = Number.isFinite(totalCells) && itemCount > 0 ? totalCells / itemCount : 0;
            const inferredReplacement = (Number(valueModel.base_item_mean) || 0)
                + avgCellsPerItem * (Number(valueModel.per_cell_mean) || 0);
            const replacementValue = Number.isFinite(Number(tailModel.replacement_item_mean))
                ? Number(tailModel.replacement_item_mean)
                : inferredReplacement;
            return Math.max(0, tailValue - Math.max(0, replacementValue));
        };

        const vals = [];
        const bid = this.state.bid_price;
        const systemAvgValuePerCell = Number.isFinite(this.state.system_avg_value_per_cell)
            ? this.state.system_avg_value_per_cell
            : null;

        for (let i = 0; i < sample_n; i++) {
            const cand = drawState();
            let total_value = 0.0;
            let total_cells_draw = 0.0;
            for (const q of QUALITIES) {
                let vm = this.config.value_model[q];
                const n = cand.counts[q];
                const cg = cand.color_grids[q];
                const sampledCells = drawDiscreteMass(cg.mass);
                const cell_mu = cg.mean_cells;
                const cell_sd = Math.max((cg.p90_cells - cg.p10_cells) / 2.56, 0.5);
                const rawCellsDraw = sampledCells !== null ? sampledCells : Math.max(0.0, gaussian(cell_mu, cell_sd));
                const cells_draw = n > 0 ? rawCellsDraw : 0;

                if (systemAvgValuePerCell !== null) {
                    total_cells_draw += cells_draw;
                    continue;
                }

                if (q === "r" && Number.isInteger(n) && n > 0) {
                    const redFallbackValueModel = this.config.value_model && this.config.value_model.r ? this.config.value_model.r : {};
                    const redJointPosterior = this.inferRedFamilyJointPosterior(n, cells_draw);
                    const redJointSample = drawWeightedEntry(redJointPosterior);
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
                const customTargetItemValue = getQualityValueOverrideTarget(this.state, q);
                if (customTargetItemValue !== null) {
                    vm = scaleValueModelToTargetItemValue(vm, customTargetItemValue, cells_draw, n);
                }

                if (n <= 0 && cells_draw <= 0) continue;

                let part = gaussian(n * vm.base_item_mean, Math.sqrt(Math.max(n, 0)) * vm.base_item_sd);
                part += gaussian(cells_draw * vm.per_cell_mean, Math.sqrt(Math.max(cells_draw, 0)) * vm.per_cell_sd);
                part += drawTailModelUplift(vm.tail_model, n, cells_draw, vm);
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
            const mean_neg = neg.length ? neg.reduce((a,b)=>a+b,0)/neg.length : 0;
            const mean_pos = pos.length ? pos.reduce((a,b)=>a+b,0)/pos.length : 0;
            
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

    recompute() {
        const errs = this.validateState();
        if (errs.length > 0) {
            return { error: true, messages: errs };
        }
        const solver_budget = deriveAdaptiveSolverBudget(this.config, this.state);
        const cands = this.buildCandidates(solver_budget);
        if (cands.length === 0) {
            return { error: true, messages: ["当前输入组合下没有可行解。请检查均格上下界、输入件数及总量限制的潜在矛盾。"] };
        }
        const weighted = this.normalize(cands);
        const summary = this.summarize(weighted);
        const valuation = this.valuationMc(weighted, solver_budget);

        return {
            error: false,
            weighted_states: weighted,
            summary,
            valuation,
            solver_budget
        };
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        AuctionKingEstimator,
        resolveEstimatorConfig,
        QUALITIES,
        QUALITY_NAMES,
        safeLog,
        logSumExp,
        normalPdf,
        quantileFromSorted,
        roundedAvgInterval,
        formatAverageDisplayFromTotalCells,
        hasFeasibleAverageForCount,
        deriveAdaptiveSolverBudget,
        lgamma
    };
}

if (typeof window !== "undefined") {
    window.AuctionKingEstimator = AuctionKingEstimator;
    window.resolveEstimatorConfig = resolveEstimatorConfig;
    window.QUALITIES = QUALITIES;
    window.QUALITY_NAMES = QUALITY_NAMES;
    window.formatAverageDisplayFromTotalCells = formatAverageDisplayFromTotalCells;
    window.hasFeasibleAverageForCount = hasFeasibleAverageForCount;
    window.deriveAdaptiveSolverBudget = deriveAdaptiveSolverBudget;
}
