const test = require("node:test");
const assert = require("node:assert/strict");
const {
    SETTLEMENT_SAMPLE_STORAGE_KEY,
    appendSettlementSample,
    attachSettlementSampleScreenshot,
    buildSettlementCollectionProgress,
    buildSettlementSampleStats,
    clearSettlementSamples,
    createSettlementSampleFromWorkspaceCapture,
    createSettlementSample,
    buildSettlementCalibrationReplayPackage,
    buildSettlementAuthorityExportPackage,
    exportAuthorityBattleSamplesByIds,
    exportAuthorityBattleSamplesForMap,
    exportAuthorityBattleSamples,
    exportSettlementSamples,
    getSettlementSampleCountFitReadiness,
    getSettlementSampleAuthorityExportMeta,
    isSettlementSampleAuthorityExported,
    isCountFitReadySettlementSample,
    loadSettlementSamples,
    markSettlementSamplesExported,
    removeSettlementSampleById,
    updateSettlementSampleById
} = require("../sample_dataset.js");

function createMemoryStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        }
    };
}

test("settlement samples append, load, export, and clear through storage", () => {
    const storage = createMemoryStorage();

    appendSettlementSample({
        map_id: "sunken_ship",
        bid_price: 18888,
        loot_value: 26666,
        profit: 7778,
        field_values: {
            total_items: 24,
            blue_count: 8
        },
        actual_counts: {
            o: 2,
            r: 1
        },
        actual_value: 26666
    }, storage);

    const loaded = loadSettlementSamples(storage);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].map_id, "sunken_ship");
    assert.equal(loaded[0].profit, 7778);
    assert.equal(loaded[0].field_values.total_items, 24);
    assert.equal(loaded[0].actual_counts.o, 2);
    assert.equal(loaded[0].actual_value, 26666);

    const exported = exportSettlementSamples(storage);
    assert.match(exported, /sunken_ship/);
    assert.match(exported, /18888/);
    assert.match(exported, /actual_counts/);
    assert.match(exported, /field_values/);

    clearSettlementSamples(storage);
    assert.equal(storage.getItem(SETTLEMENT_SAMPLE_STORAGE_KEY), null);
    assert.deepEqual(loadSettlementSamples(storage), []);
});

test("settlement stats aggregate counts, averages, and future-ready weight slots", () => {
    const stats = buildSettlementSampleStats([
        {
            map_id: "sunken_ship",
            bid_price: 18000,
            loot_value: 24000,
            profit: 6000,
            field_values: {
                total_items: 24
            },
            observed_state: {
                system_avg_value_type_count: 2,
                system_avg_value_per_cell: 123.45
            },
            actual_counts: {
                o: 1,
                r: 0
            },
            actual_cells: 10,
            items: [
                { quality: "p", category: "weapon", cells: 4, value: 8000 },
                { quality: "o", category: "medical", cells: 2, value: 10000 }
            ]
        },
        {
            map_id: "sunken_ship",
            bid_price: 20000,
            loot_value: 32000,
            profit: 12000,
            items: [
                { quality: "p", category: "weapon", cells: 8, value: 12000 }
            ]
        }
    ]);

    assert.equal(stats.sample_count, 2);
    assert.equal(stats.authority_ready_sample_count, 1);
    assert.equal(stats.count_fit_ready_sample_count, 0);
    assert.deepEqual(stats.count_fit_unready_reason_counts, {
        missing_observed_state: 1,
        missing_full_actual_counts: 2
    });
    assert.deepEqual(stats.authority_unready_reason_counts, {
        missing_observed_state: 1,
        missing_actual_counts: 1
    });
    assert.equal(stats.average_bid_price, 19000);
    assert.equal(stats.average_loot_value, 28000);
    assert.equal(stats.average_profit, 9000);
    assert.deepEqual(stats.scene_distribution[0], { key: "sunken_ship", count: 2, weight: 1 });
    assert.deepEqual(stats.authority_ready_scene_distribution[0], { key: "sunken_ship", count: 1, weight: 1 });
    assert.equal(stats.system_hint_sample_count, 1);
    assert.equal(stats.system_hint_scored_sample_count, 1);
    assert.deepEqual(stats.quality_weights[0], { key: "p", count: 2, weight: 2 / 3 });
    assert.deepEqual(stats.category_weights[0], { key: "weapon", count: 2, weight: 2 / 3 });
    assert.deepEqual(stats.per_cell_avg_by_quality[0], {
        quality: "p",
        average_value_per_cell: 1750,
        sample_count: 2
    });
});

test("settlement collection progress reports per-map count-fit gaps", () => {
    const progress = buildSettlementCollectionProgress([
        {
            map_id: "villa",
            field_values: { total_items: 45 },
            actual_counts: { w: 20, g: 8, b: 10, p: 4, o: 3, r: 0 }
        },
        {
            map_id: "villa",
            field_values: { total_items: 44 },
            actual_counts: { o: 3, r: 0 }
        },
        {
            map_id: "sunken_ship",
            field_values: { total_items: 42 }
        }
    ], ["villa", "sunken_ship", "shipping"], { target_per_map: 2 });

    assert.equal(progress.target_per_map, 2);
    assert.equal(progress.map_count, 3);
    assert.equal(progress.maps.villa.sample_count, 2);
    assert.equal(progress.maps.villa.authority_ready_sample_count, 2);
    assert.equal(progress.maps.villa.count_fit_ready_sample_count, 1);
    assert.equal(progress.maps.villa.count_fit_gap, 1);
    assert.equal(progress.maps.sunken_ship.count_fit_gap, 2);
    assert.equal(progress.maps.shipping.sample_count, 0);
    assert.equal(progress.total_count_fit_ready_sample_count, 1);
    assert.equal(progress.total_count_fit_gap, 5);
    assert.equal(progress.next_map_id, "villa");
    assert.equal(progress.next_action, "capture_same_battle_full_quality_counts");
});

test("count-fit readiness requires observed state and every quality count", () => {
    const partial = createSettlementSample({
        map_id: "villa",
        field_values: { total_items: 45 },
        actual_counts: {
            o: 3,
            r: 0
        }
    });
    const full = createSettlementSample({
        map_id: "villa",
        field_values: { total_items: 45 },
        actual_counts: {
            w: 20,
            g: 8,
            b: 10,
            p: 4,
            o: 3,
            r: 0
        }
    });

    assert.deepEqual(getSettlementSampleCountFitReadiness(partial), {
        ready: false,
        missing_observed_state: false,
        missing_full_actual_counts: true,
        missing_quality_counts: ["w", "g", "b", "p"]
    });
    assert.equal(isCountFitReadySettlementSample(partial), false);
    assert.equal(isCountFitReadySettlementSample(full), true);
});

test("createSettlementSample preserves authority-ready replay fields from imported payloads", () => {
    const sample = createSettlementSample({
        record_type: "battle_sample",
        map_id: "villa",
        map_variant_id: "designer_residence",
        map_variant_label: "设计师居所",
        observed_state: {
            r1_total_items: 45,
            r2_orange_avg: 3.33
        },
        state: {
            r1_total_items: 45
        },
        field_values: {
            total_items: 45,
            blue_count: 11
        },
        actual_counts: {
            o: 3,
            r: "0"
        },
        actual_value: "364320",
        actual_cells: "88",
        metadata: {
            imported_from: "manual_review"
        }
    });

    assert.equal(sample.record_type, "battle_sample");
    assert.equal(sample.map_variant_id, "designer_residence");
    assert.equal(sample.map_variant_label, "设计师居所");
    assert.deepEqual(sample.observed_state, {
        r1_total_items: 45,
        r2_orange_avg: 3.33
    });
    assert.deepEqual(sample.state, {
        r1_total_items: 45
    });
    assert.deepEqual(sample.field_values, {
        total_items: 45,
        blue_count: 11
    });
    assert.deepEqual(sample.actual_counts, {
        o: 3,
        r: 0
    });
    assert.equal(sample.actual_value, 364320);
    assert.equal(sample.actual_cells, 88);
    assert.deepEqual(sample.metadata, {
        imported_from: "manual_review"
    });
});

test("exportAuthorityBattleSamples keeps only authority-ready samples and normalizes them into unified battle_sample records", () => {
    const storage = createMemoryStorage();

    appendSettlementSample({
        id: "ready_sample",
        map_id: "villa",
        map_variant_id: "designer_residence",
        map_variant_label: "设计师居所",
        field_values: {
            total_items: 45,
            blue_count: 11,
            orange_avg_cells: 3.33,
            bid: 18888
        },
        actual_counts: {
            o: 3,
            r: 0
        },
        loot_value: 364320,
        actual_cells: 88,
        items: [
            { quality: "p", category: "trendy", cells: 6, value: 25000, note: "main" }
        ],
        source_kind: "settlement_export",
        metadata: {
            imported_from: "panel"
        }
    }, storage);
    appendSettlementSample({
        id: "non_ready_sample",
        map_id: "villa",
        loot_value: 12000
    }, storage);

    const exported = JSON.parse(exportAuthorityBattleSamples(storage));

    assert.equal(exported.length, 1);
    assert.equal(exported[0].record_type, "battle_sample");
    assert.equal(exported[0].id, "ready_sample");
    assert.equal(exported[0].map_variant_id, "designer_residence");
    assert.equal(exported[0].map_variant_label, "设计师居所");
    assert.deepEqual(exported[0].observed_state, {
        r1_total_items: 45,
        r1_blue_count: 11,
        r2_orange_avg: 3.33,
        r2_orange_avg_text: "3.33",
        r2_orange_avg_rounding_mode: "truncate",
        bid_price: 18888
    });
    assert.deepEqual(exported[0].actual_counts, { o: 3, r: 0 });
    assert.equal(exported[0].actual_value, 364320);
    assert.equal(exported[0].actual_cells, 88);
    assert.equal(exported[0].source_kind, "settlement_export");
    assert.equal(exported[0].items[0].metadata.category, "trendy");
    assert.equal(exported[0].items[0].metadata.note, "main");
});

test("exportAuthorityBattleSamplesForMap keeps only the selected map's authority-ready samples", () => {
    const storage = createMemoryStorage();

    appendSettlementSample({
        id: "villa_ready_sample",
        map_id: "villa",
        field_values: {
            total_items: 45,
            system_avg_value_type_count: 2,
            system_avg_value_per_cell: 8735.34
        },
        actual_counts: {
            o: 3,
            r: 0
        },
        actual_cells: 88
    }, storage);
    appendSettlementSample({
        id: "sunken_ready_sample",
        map_id: "sunken_ship",
        field_values: {
            total_items: 36
        },
        actual_counts: {
            o: 2,
            r: 1
        }
    }, storage);
    appendSettlementSample({
        id: "villa_non_ready_sample",
        map_id: "villa",
        loot_value: 12000
    }, storage);

    const exported = JSON.parse(exportAuthorityBattleSamplesForMap("villa", storage));

    assert.deepEqual(exported.map((entry) => entry.id), ["villa_ready_sample"]);
    assert.equal(exported[0].map_id, "villa");
});

test("exportAuthorityBattleSamplesByIds keeps only selected authority-ready samples", () => {
    const storage = createMemoryStorage();

    appendSettlementSample({
        id: "villa_ready_sample",
        map_id: "villa",
        field_values: {
            total_items: 45,
            system_avg_value_type_count: 2,
            system_avg_value_per_cell: 8735.34
        },
        actual_counts: {
            o: 3,
            r: 0
        },
        actual_cells: 88
    }, storage);
    appendSettlementSample({
        id: "villa_non_ready_sample",
        map_id: "villa",
        loot_value: 12000
    }, storage);
    appendSettlementSample({
        id: "sunken_ready_sample",
        map_id: "sunken_ship",
        field_values: {
            total_items: 36
        },
        actual_counts: {
            o: 2,
            r: 1
        }
    }, storage);

    const exported = JSON.parse(exportAuthorityBattleSamplesByIds([
        "villa_ready_sample",
        "villa_non_ready_sample"
    ], storage));

    assert.deepEqual(exported.map((entry) => entry.id), ["villa_ready_sample"]);
});

test("buildSettlementCalibrationReplayPackage wraps selected authority-ready samples with export context", () => {
    const storage = createMemoryStorage();

    appendSettlementSample({
        id: "villa_ready_sample",
        map_id: "villa",
        field_values: {
            total_items: 45,
            system_avg_value_type_count: 2,
            system_avg_value_per_cell: 8735.34
        },
        actual_counts: {
            o: 3,
            r: 0
        },
        actual_cells: 88
    }, storage);
    appendSettlementSample({
        id: "villa_non_ready_sample",
        map_id: "villa",
        loot_value: 12000
    }, storage);

    const replayPackage = buildSettlementCalibrationReplayPackage(["villa_ready_sample", "villa_non_ready_sample"], {
        map_id: "villa",
        filter_value: "batch:batch_b",
        filter_label: "batch_b (1条)"
    }, storage);

    assert.equal(replayPackage.schema_version, "ak_settlement_calibration_replay_package_v1");
    assert.equal(replayPackage.export_context.map_id, "villa");
    assert.equal(replayPackage.export_context.filter_value, "batch:batch_b");
    assert.equal(replayPackage.export_context.filter_label, "batch_b (1条)");
    assert.equal(replayPackage.export_context.sample_count, 1);
    assert.equal(replayPackage.export_context.selected_sample_count, 2);
    assert.equal(replayPackage.export_context.skipped_sample_count, 1);
    assert.deepEqual(replayPackage.sample_quality_summary.system_hint, {
        sample_count: 1,
        scored_sample_count: 1,
        missing_system_hint_count: 0,
        missing_actual_cells_count: 0
    });
    assert.deepEqual(replayPackage.samples.map((entry) => entry.id), ["villa_ready_sample"]);
});

test("buildSettlementAuthorityExportPackage wraps selected authority-ready samples with publish context", () => {
    const storage = createMemoryStorage();

    appendSettlementSample({
        id: "villa_ready_sample",
        map_id: "villa",
        field_values: {
            total_items: 45
        },
        actual_counts: {
            o: 3,
            r: 0
        }
    }, storage);
    appendSettlementSample({
        id: "villa_non_ready_sample",
        map_id: "villa",
        loot_value: 12000
    }, storage);

    const authorityPackage = buildSettlementAuthorityExportPackage(["villa_ready_sample", "villa_non_ready_sample"], {
        map_id: "villa",
        filter_value: "pending_export",
        filter_label: "待发布 (2条)",
        scope: "filtered",
        batch_id: "authority_export_filtered_001",
        source_artifact_version: "ak_authority_calibration_v1"
    }, storage);

    assert.equal(authorityPackage.schema_version, "ak_authority_battle_sample_package_v1");
    assert.equal(authorityPackage.export_kind, "authority_battle_samples");
    assert.equal(authorityPackage.export_context.map_id, "villa");
    assert.equal(authorityPackage.export_context.filter_value, "pending_export");
    assert.equal(authorityPackage.export_context.filter_label, "待发布 (2条)");
    assert.equal(authorityPackage.export_context.scope, "filtered");
    assert.equal(authorityPackage.export_context.batch_id, "authority_export_filtered_001");
    assert.equal(authorityPackage.export_context.source_artifact_version, "ak_authority_calibration_v1");
    assert.equal(authorityPackage.export_context.sample_count, 1);
    assert.equal(authorityPackage.export_context.selected_sample_count, 2);
    assert.equal(authorityPackage.export_context.skipped_sample_count, 1);
    assert.deepEqual(authorityPackage.samples.map((entry) => entry.id), ["villa_ready_sample"]);
});

test("markSettlementSamplesExported marks ready samples as exported and authority changes make them pending again", () => {
    const storage = createMemoryStorage();

    appendSettlementSample({
        id: "ready_sample",
        map_id: "villa",
        field_values: {
            total_items: 45
        },
        actual_counts: {
            o: 3,
            r: 0
        },
        actual_value: 364320
    }, storage);

    markSettlementSamplesExported(["ready_sample"], {
        scope: "current_map",
        batch_id: "batch_current_map_001",
        sample_count: 1
    }, storage);

    let loaded = loadSettlementSamples(storage);
    assert.equal(isSettlementSampleAuthorityExported(loaded[0]), true);
    assert.deepEqual(getSettlementSampleAuthorityExportMeta(loaded[0]), {
        exported_at: loaded[0].metadata.authority_export.exported_at,
        scope: "current_map",
        batch_id: "batch_current_map_001",
        sample_count: 1
    });

    let stats = buildSettlementSampleStats(loaded);
    assert.equal(stats.authority_exported_sample_count, 1);
    assert.equal(stats.authority_pending_export_sample_count, 0);
    assert.equal(stats.latest_authority_export_scope, "current_map");
    assert.equal(stats.latest_authority_export_batch_id, "batch_current_map_001");
    assert.equal(stats.latest_authority_export_sample_count, 1);
    assert.equal(stats.latest_authority_exported_at, loaded[0].metadata.authority_export.exported_at);

    updateSettlementSampleById("ready_sample", {
        actual_counts: {
            o: 2,
            r: 1
        }
    }, storage);

    loaded = loadSettlementSamples(storage);
    assert.equal(isSettlementSampleAuthorityExported(loaded[0]), false);
    assert.equal(getSettlementSampleAuthorityExportMeta(loaded[0]), null);

    stats = buildSettlementSampleStats(loaded);
    assert.equal(stats.authority_exported_sample_count, 0);
    assert.equal(stats.authority_pending_export_sample_count, 1);
    assert.equal(stats.latest_authority_export_scope, null);
    assert.equal(stats.latest_authority_export_batch_id, null);
    assert.equal(stats.latest_authority_export_sample_count, null);
    assert.equal(stats.latest_authority_exported_at, null);
});

test("createSettlementSample normalizes item drafts and drops incomplete rows", () => {
    const sample = createSettlementSample({
        map_id: "sunken_ship",
        items: [
            { quality: " P ", category: " weapon ", cells: "8", value: "12000", note: "main" },
            { quality: "o", category: "medical", cells: "0", value: "8000" },
            { quality: "b", category: "", cells: "4", value: "5000" }
        ]
    });

    assert.deepEqual(sample.items, [
        { quality: "p", category: "weapon", cells: 8, value: 12000, note: "main" }
    ]);
});

test("createSettlementSampleFromWorkspaceCapture derives observed state and partial actual counts from current workspace fields", () => {
    const sample = createSettlementSampleFromWorkspaceCapture({
        map_id: "sunken_ship",
        field_values: {
            total_items: 42,
            blue_count: 10,
            orange_avg_cells: 3.2,
            orange_count: 2,
            system_avg_value_type_count: 2,
            system_avg_value_per_cell: 8735.34,
            bid: 18888
        },
        fieldCatalogItems: [
            { id: "orange_count", family: "quality", metric: "count", quality: "o" },
            { id: "white_count", family: "quality", metric: "count", quality: "w" }
        ],
        metadata: {
            template_id: "ahmed_default"
        }
    });

    assert.equal(sample.map_id, "sunken_ship");
    assert.equal(sample.source_kind, "workspace_capture");
    assert.equal(sample.bid_price, 18888);
    assert.deepEqual(sample.actual_counts, { o: 2 });
    assert.deepEqual(sample.state, {
        r1_total_items: 42,
        r1_blue_count: 10,
        r2_orange_avg: 3.2,
        r2_orange_avg_text: 3.2,
        r2_orange_avg_rounding_mode: "truncate",
        r2_orange_count: 2,
        system_avg_value_type_count: 2,
        system_avg_value_per_cell: 8735.34,
        bid_price: 18888
    });
    assert.equal(sample.metadata.template_id, "ahmed_default");
    assert.equal(sample.metadata.capture_source, "workspace_panel");
});

test("updateSettlementSampleById rewrites actual counts and preserves prior sample fields", () => {
    const storage = createMemoryStorage();

    appendSettlementSample({
        id: "captured_sample",
        map_id: "sunken_ship",
        field_values: {
            total_items: 42
        },
        state: {
            r1_total_items: 42
        },
        source_kind: "workspace_capture",
        metadata: {
            template_id: "ahmed_default"
        }
    }, storage);

    const updated = updateSettlementSampleById("captured_sample", {
        actual_counts: {
            o: 2,
            r: 1
        },
        actual_value: 88000,
        actual_cells: 54,
        metadata: {
            reviewer: "local"
        }
    }, storage);

    assert.deepEqual(updated.actual_counts, { o: 2, r: 1 });
    assert.equal(updated.actual_value, 88000);
    assert.equal(updated.actual_cells, 54);
    assert.equal(updated.source_kind, "workspace_capture");
    assert.equal(updated.metadata.template_id, "ahmed_default");
    assert.equal(updated.metadata.reviewer, "local");
});

test("attachSettlementSampleScreenshot stores screenshot metadata for raw exports", () => {
    const storage = createMemoryStorage();

    appendSettlementSample({ id: "sample_with_image", map_id: "villa", field_values: { total_items: 45 } }, storage);

    const updated = attachSettlementSampleScreenshot("sample_with_image", {
        name: "settlement.png",
        type: "image/png",
        size: 12,
        data_url: "data:image/png;base64,AAAA"
    }, storage);

    assert.equal(updated.metadata.screenshot_attachment.name, "settlement.png");
    assert.equal(updated.metadata.screenshot_attachment.type, "image/png");
    assert.equal(updated.metadata.screenshot_attachment.size, 12);
    assert.equal(updated.metadata.screenshot_attachment.data_url, "data:image/png;base64,AAAA");
    assert.equal(JSON.parse(exportSettlementSamples(storage))[0].metadata.screenshot_attachment.name, "settlement.png");
});

test("attachSettlementSampleScreenshot stores compressed screenshot preview without raw original data", () => {
    const storage = createMemoryStorage();

    appendSettlementSample({ id: "compressed_sample", map_id: "villa", field_values: { total_items: 45 } }, storage);

    const updated = attachSettlementSampleScreenshot("compressed_sample", {
        name: "settlement-large.png",
        type: "image/png",
        size: 2500000,
        data_url: "data:image/png;base64,ORIGINAL_RAW_DATA",
        thumbnail_data_url: "data:image/jpeg;base64,SMALL_PREVIEW",
        thumbnail_type: "image/jpeg",
        thumbnail_size: 120000,
        original_width: 2560,
        original_height: 1440,
        stored_width: 1280,
        stored_height: 720,
        compression: {
            applied: true,
            max_dimension: 1280,
            quality: 0.72
        },
        original_data_url: "data:image/png;base64,SHOULD_NOT_BE_STORED"
    }, storage);

    const attachment = updated.metadata.screenshot_attachment;
    assert.equal(attachment.name, "settlement-large.png");
    assert.equal(attachment.type, "image/jpeg");
    assert.equal(attachment.size, 120000);
    assert.equal(attachment.original_size, 2500000);
    assert.equal(attachment.original_type, "image/png");
    assert.equal(attachment.data_url, "data:image/jpeg;base64,SMALL_PREVIEW");
    assert.equal(attachment.original_width, 2560);
    assert.equal(attachment.original_height, 1440);
    assert.equal(attachment.stored_width, 1280);
    assert.equal(attachment.stored_height, 720);
    assert.equal(attachment.compression.applied, true);
    assert.equal(attachment.compression.max_dimension, 1280);
    assert.equal(attachment.compression.quality, 0.72);
    assert.equal(Object.prototype.hasOwnProperty.call(attachment, "original_data_url"), false);
    assert.equal(JSON.stringify(JSON.parse(exportSettlementSamples(storage))).includes("ORIGINAL_RAW_DATA"), false);
});

test("removeSettlementSampleById deletes only the selected local sample", () => {
    const storage = createMemoryStorage();

    appendSettlementSample({ id: "sample_a", map_id: "sunken_ship", field_values: { total_items: 42 } }, storage);
    appendSettlementSample({ id: "sample_b", map_id: "villa", field_values: { total_items: 45 } }, storage);

    const remaining = removeSettlementSampleById("sample_a", storage);

    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, "sample_b");
});
