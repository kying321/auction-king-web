const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");
const {
    applyAuthorityCalibration,
    buildAuthorityCalibrationArtifacts
} = require("../authority_calibration_runtime.js");
const { buildAuthoritySourcePackage } = require("../source_data_runtime.js");
const { resolveEstimatorConfig } = require("../estimator.js");

function buildSourcePackageWithBattleSample() {
    return buildAuthoritySourcePackage({
        catalogBatchPaths: [
            path.join(__dirname, "..", "data", "manual_catalog", "white_quality_items_batch_2026-04-23.json"),
            path.join(__dirname, "..", "data", "manual_catalog", "purple_quality_items_batch_2026-04-23.json"),
            path.join(__dirname, "..", "data", "manual_catalog", "orange_quality_items_batch_2026-04-23.json"),
            path.join(__dirname, "..", "data", "manual_catalog", "red_quality_items_batch_2026-04-23.json")
        ],
        battleSamples: [
            {
                id: "villa_case",
                map_id: "villa",
                observed_state: { r1_total_items: 45, r1_blue_count: 11 },
                actual_counts: { w: 18, g: 9, b: 11, p: 3, o: 3, r: 0 },
                actual_value: 364320
            }
        ]
    });
}

test("buildAuthorityCalibrationArtifacts generates manifest, count priors, and base-item calibrations", () => {
    const artifact = buildAuthorityCalibrationArtifacts(buildSourcePackageWithBattleSample(), defaultConfig);

    assert.equal(artifact.artifact_version, "ak_authority_calibration_v1");
    assert.equal(artifact.quality_status.alpha_counts, "sample_backed_partial");
    assert.equal(artifact.quality_status.value_model_base_items, "catalog_backed_partial");
    assert.equal(artifact.manifest.adopted_fields.includes("alpha_counts"), true);
    assert.equal(artifact.manifest.adopted_fields.includes("value_model.base_item_mean"), true);
    assert.equal(artifact.manifest.pending_fields.includes("cells_per_item"), true);
    assert.equal(artifact.manifest.ignored_fields.includes("collection_families"), true);
    assert.equal(artifact.maps.villa.count_prior_calibration.battle_sample_count, 1);
    assert.equal(artifact.maps.villa.count_prior_calibration.authority_status, "sample_backed");
    assert.equal(artifact.maps.villa.count_prior_calibration.alpha_counts.p, 3);
    assert.equal(artifact.maps.villa.value_model_calibration.authority_status, "catalog_backed_partial");
    assert.equal(artifact.maps.villa.value_model_calibration.value_model.p.base_item_mean, 9492);
    assert.equal(artifact.maps.villa.value_model_calibration.value_model.p.base_item_sd, 5520);
    assert.equal(artifact.maps.villa.value_model_calibration.value_model.r.base_item_mean, 128777);
    assert.equal(artifact.maps.villa.value_model_calibration.value_model.r.tail_model.threshold, 200000);
    assert.equal(artifact.maps.villa.value_model_calibration.value_model.r.tail_model.battle_probability, 0.05);
    assert.equal(artifact.maps.villa.value_model_calibration.value_model.r.tail_model.catalog_tail_sample_count, 48);
    assert.equal(artifact.maps.villa.cells_per_item_status.adopted_fields.length, 0);
});

test("buildAuthorityCalibrationArtifacts carries battle sample import context into source summary and manifest source inputs", () => {
    const sourcePackage = buildAuthoritySourcePackage({
        battleSamples: [
            {
                id: "villa_case",
                map_id: "villa",
                observed_state: { r1_total_items: 45, r1_blue_count: 11 },
                actual_counts: { o: 3, r: 0 },
                actual_value: 364320
            }
        ],
        battleSampleImportContext: {
            map_id: "villa",
            filter_value: "pending_export",
            scope: "filtered",
            batch_id: "authority_export_filtered_001",
            sample_count: 1,
            selected_sample_count: 2,
            skipped_sample_count: 1
        }
    });
    const artifact = buildAuthorityCalibrationArtifacts(sourcePackage, defaultConfig);

    assert.equal(artifact.source_summary.battle_sample_import_context.scope, "filtered");
    assert.equal(artifact.source_summary.battle_sample_import_context.batch_id, "authority_export_filtered_001");
    assert.equal(artifact.manifest.source_inputs.battle_sample_import_context.map_id, "villa");
    assert.equal(artifact.manifest.source_inputs.battle_sample_import_context.selected_sample_count, 2);
    assert.equal(artifact.manifest.source_inputs.battle_sample_import_context.skipped_sample_count, 1);
});

test("buildAuthorityCalibrationArtifacts marks alpha count authority as fallback_only when no battle samples are present", () => {
    const sourcePackage = buildAuthoritySourcePackage({
        catalogBatchPaths: [
            path.join(__dirname, "..", "data", "manual_catalog", "white_quality_items_batch_2026-04-23.json")
        ],
        battleSamples: []
    });
    const artifact = buildAuthorityCalibrationArtifacts(sourcePackage, defaultConfig);

    assert.equal(artifact.quality_status.alpha_counts, "fallback_only");
    assert.equal(artifact.maps.villa.count_prior_calibration.authority_status, "fallback_only");
    assert.match(artifact.maps.villa.count_prior_calibration.notes[0], /no_battle_samples/);
});

test("applyAuthorityCalibration overlays catalog item value basis and zeroes per-cell params", () => {
    const artifact = buildAuthorityCalibrationArtifacts(buildSourcePackageWithBattleSample(), defaultConfig);
    const nextConfig = applyAuthorityCalibration(defaultConfig, artifact, "villa");
    const resolved = resolveEstimatorConfig(nextConfig, "villa");

    assert.equal(resolved.alpha_counts.p, 3);
    assert.equal(resolved.alpha_counts.o, 3);
    assert.equal(resolved.value_model.p.base_item_mean, 9492);
    assert.equal(resolved.value_model.p.base_item_sd, 5520);
    assert.equal(resolved.value_model.p.per_cell_mean, 0);
    assert.equal(resolved.value_model.p.per_cell_sd, 0);
    assert.equal(resolved.value_model.p.value_basis, "catalog_reported_item_mean");
    assert.equal(resolved.value_model.r.value_basis, "catalog_tail_aware_common_item_mean");
    assert.equal(resolved.value_model.r.tail_model.threshold, 200000);
    assert.equal(resolved.value_model.r.tail_model.values[0], 226800);
    assert.equal(resolved.value_model.r.tail_model.values.at(-1), 19371213);
    assert.equal(resolved.value_model.r.tail_model.weighted_values.length, 48);
    assert.equal(resolved.cells_per_item.p.mean, defaultConfig.maps.villa.cells_per_item.p.mean);
});

test("applyAuthorityCalibration does not let fallback-only alpha counts override current map defaults", () => {
    const config = JSON.parse(JSON.stringify(defaultConfig));
    config.maps.villa.alpha_counts = {
        w: 10,
        g: 9,
        b: 3.9,
        p: 0.8,
        o: 0.15,
        r: 0.03
    };
    config.calibration.maps.villa.count_prior_calibration = {
        ...config.calibration.maps.villa.count_prior_calibration,
        authority_status: "fallback_only",
        battle_sample_count: 0,
        alpha_counts: {
            w: 6.2,
            g: 5.4,
            b: 3.9,
            p: 2.4,
            o: 1.8,
            r: 1.2
        }
    };

    const nextConfig = applyAuthorityCalibration(config, config.calibration, "villa");
    const resolved = resolveEstimatorConfig(nextConfig, "villa");

    assert.deepEqual(nextConfig.maps.villa.alpha_counts, config.maps.villa.alpha_counts);
    assert.deepEqual(resolved.alpha_counts, config.maps.villa.alpha_counts);
    assert.equal(
        resolved.value_model.p.base_item_mean,
        config.calibration.maps.villa.value_model_calibration.value_model.p.base_item_mean
    );
});

test("resolveEstimatorConfig keeps map alpha_counts editable when bundled authority status is fallback_only", () => {
    const config = JSON.parse(JSON.stringify(defaultConfig));
    config.maps.villa.alpha_counts = {
        w: 10,
        g: 9,
        b: 3.9,
        p: 0.8,
        o: 0.15,
        r: 0.03
    };
    config.calibration.maps.villa.count_prior_calibration.authority_status = "fallback_only";
    config.calibration.maps.villa.count_prior_calibration.battle_sample_count = 0;

    const resolved = resolveEstimatorConfig(config, "villa");

    assert.deepEqual(resolved.alpha_counts, config.maps.villa.alpha_counts);
});

test("resolveEstimatorConfig applies map value model refits after catalog calibration", () => {
    const config = JSON.parse(JSON.stringify(defaultConfig));
    config.maps.villa.value_model_refit = {
        value_model: {
            r: {
                base_item_mean: 222222,
                base_item_sd: 33333,
                tail_model: {
                    battle_probability: 0.21,
                    replacement_item_mean: 222222
                }
            }
        }
    };

    const resolved = resolveEstimatorConfig(config, "villa");

    assert.equal(resolved.value_model.r.base_item_mean, 222222);
    assert.equal(resolved.value_model.r.base_item_sd, 33333);
    assert.equal(resolved.value_model.r.value_basis, "catalog_tail_aware_common_item_mean");
    assert.equal(resolved.value_model.r.tail_model.threshold, 200000);
    assert.equal(resolved.value_model.r.tail_model.battle_probability, 0.21);
    assert.equal(resolved.value_model.r.tail_model.replacement_item_mean, 222222);
});
