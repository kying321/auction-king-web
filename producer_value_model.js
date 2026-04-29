const defaultConfig = require("./default_config_bundle.js");

const TARGET_QUALITIES = ["p", "o", "r"];
const RUNTIME_FAMILY_STATUS = "phase1_disabled";

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function roundTo(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeWeights(weights = {}) {
    const entries = Object.entries(weights || {})
        .map(([id, weight]) => [id, Number(weight)])
        .filter(([, weight]) => Number.isFinite(weight) && weight > 0);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    if (total <= 0) return {};
    return Object.fromEntries(entries.map(([id, weight]) => [id, roundTo(weight / total)]).sort(([left], [right]) => left.localeCompare(right)));
}

function buildValueTwoSigmaFit({ expectedValue = 0, observedMean = null, observedSd = null } = {}) {
    const expected = Number(expectedValue);
    const mean = Number(observedMean);
    const sd = Number(observedSd);
    const safeExpected = Number.isFinite(expected) ? expected : 0;
    if (!Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0) {
        return {
            expected_value: roundTo(safeExpected),
            observed_mean: Number.isFinite(mean) ? roundTo(mean) : null,
            observed_sd: Number.isFinite(sd) ? roundTo(sd) : null,
            z: null,
            within_2sigma: false,
            low_2sigma: null,
            high_2sigma: null
        };
    }
    const z = (safeExpected - mean) / sd;
    return {
        expected_value: roundTo(safeExpected),
        observed_mean: roundTo(mean),
        observed_sd: roundTo(sd),
        z: roundTo(z),
        within_2sigma: Math.abs(z) <= 2,
        low_2sigma: roundTo(Math.max(0, mean - 2 * sd)),
        high_2sigma: roundTo(mean + 2 * sd)
    };
}

function profileUnitValue(profile = {}) {
    const meanCells = Number(profile.mean_cells_per_item) || 0;
    const sdCells = Number(profile.sd_cells_per_item) || 0;
    const baseMean = Number(profile.base_item_mean) || 0;
    const baseSd = Number(profile.base_item_sd) || 0;
    const perCellMean = Number(profile.per_cell_mean) || 0;
    const perCellSd = Number(profile.per_cell_sd) || 0;
    const mean = baseMean + meanCells * perCellMean;
    const variance = (baseSd ** 2) + (meanCells * (perCellSd ** 2)) + ((perCellMean * sdCells) ** 2);
    return {
        mean,
        sd: Math.sqrt(Math.max(variance, 0))
    };
}

function buildRedTypeValueEnvelope(redTypeProfiles = {}) {
    const profiles = isPlainObject(redTypeProfiles.profiles) ? redTypeProfiles.profiles : {};
    const probabilities = normalizeWeights(Object.fromEntries(
        Object.entries(profiles).map(([id, profile]) => [id, Number(profile && profile.prior) || 0])
    ));
    const entries = Object.entries(profiles)
        .filter(([id]) => probabilities[id] > 0)
        .map(([id, profile]) => ({
            id,
            label: profile.label || id,
            probability: probabilities[id],
            ...profileUnitValue(profile)
        }));
    const mean = entries.reduce((sum, entry) => sum + entry.probability * entry.mean, 0);
    const variance = entries.reduce((sum, entry) => {
        return sum + entry.probability * ((entry.sd ** 2) + ((entry.mean - mean) ** 2));
    }, 0);
    const sd = Math.sqrt(Math.max(variance, 0));

    return {
        mean_unit_value: roundTo(mean),
        sd_unit_value: roundTo(sd),
        low_2sigma: roundTo(Math.max(0, mean - 2 * sd)),
        high_2sigma: roundTo(mean + 2 * sd),
        type_probabilities: probabilities,
        type_entries: entries.map((entry) => ({
            id: entry.id,
            label: entry.label,
            probability: roundTo(entry.probability),
            mean_unit_value: roundTo(entry.mean),
            sd_unit_value: roundTo(entry.sd)
        }))
    };
}

function buildFamilyPriorProbabilities(collectionFamilies = {}) {
    if (!isPlainObject(collectionFamilies)) return {};
    return normalizeWeights(Object.fromEntries(
        Object.entries(collectionFamilies).map(([id, family]) => [id, Number(family && family.prior) || 0])
    ));
}

function readCatalogQualitySummaries(snapshot = {}) {
    const summaries = Array.isArray(snapshot.quality_summaries) ? snapshot.quality_summaries : [];
    return Object.fromEntries(summaries.map((entry) => [entry.quality, entry]));
}

function buildQualityFitForMap(mapConfig = {}, catalogByQuality = {}) {
    return Object.fromEntries(TARGET_QUALITIES.map((quality) => {
        const vm = mapConfig.value_model && mapConfig.value_model[quality] ? mapConfig.value_model[quality] : {};
        const cells = mapConfig.cells_per_item && mapConfig.cells_per_item[quality] ? mapConfig.cells_per_item[quality] : {};
        const expectedValue = (Number(vm.base_item_mean) || 0) + ((Number(cells.mean) || 0) * (Number(vm.per_cell_mean) || 0));
        const observed = catalogByQuality[quality] || {};
        return [
            quality,
            buildValueTwoSigmaFit({
                expectedValue,
                observedMean: observed.observed_average_value,
                observedSd: observed.observed_value_sd
            })
        ];
    }));
}

function buildProducerValueModelReport({
    baselineConfig = defaultConfig,
    catalogCalibrationSnapshot = {},
    generatedAt = new Date().toISOString()
} = {}) {
    const catalogByQuality = readCatalogQualitySummaries(catalogCalibrationSnapshot);
    const maps = {};
    Object.entries(baselineConfig.maps || {}).forEach(([mapId, mapConfig]) => {
        const qualityFits = buildQualityFitForMap(mapConfig, catalogByQuality);
        const redTypeValueEnvelope = buildRedTypeValueEnvelope(mapConfig.red_type_profiles || {});
        const familyPriorProbabilities = buildFamilyPriorProbabilities(mapConfig.collection_families || {});
        const allTargetFitsWithinTwoSigma = TARGET_QUALITIES.every((quality) => qualityFits[quality] && qualityFits[quality].within_2sigma);
        const blockers = [
            "collection_family_runtime_disabled",
            "family_bias_not_authority",
            "per_cell_catalog_data_missing"
        ];
        if (!allTargetFitsWithinTwoSigma) blockers.push("quality_value_outside_2sigma");
        if (!Object.keys(familyPriorProbabilities).length) blockers.push("missing_collection_family_priors");

        maps[mapId] = {
            map_id: mapId,
            label: mapConfig.label || mapId,
            quality_fits: qualityFits,
            red_type_value_envelope: redTypeValueEnvelope,
            family_prior_probabilities: familyPriorProbabilities,
            runtime_family_status: RUNTIME_FAMILY_STATUS,
            all_target_fits_within_2sigma: allTargetFitsWithinTwoSigma,
            adoption_allowed: false,
            recommended_change_class: "RESEARCH_ONLY",
            blockers
        };
    });

    return {
        schema_version: "ak_producer_value_model_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        adoption_allowed: false,
        runtime_family_status: RUNTIME_FAMILY_STATUS,
        architecture: [
            "catalog_value_two_sigma_fit",
            "map_red_type_value_envelope",
            "collection_family_prior_shadow",
            "runtime_family_disabled_gate"
        ],
        summary: {
            map_count: Object.keys(maps).length,
            maps_with_all_target_fits_within_2sigma: Object.values(maps).filter((entry) => entry.all_target_fits_within_2sigma).length,
            adoption_allowed: false
        },
        blockers: [
            "collection_family_runtime_disabled",
            "per_cell_catalog_data_missing",
            "family_bias_not_authority"
        ],
        maps
    };
}

module.exports = {
    RUNTIME_FAMILY_STATUS,
    TARGET_QUALITIES,
    buildFamilyPriorProbabilities,
    buildProducerValueModelReport,
    buildRedTypeValueEnvelope,
    buildValueTwoSigmaFit,
    normalizeWeights
};
