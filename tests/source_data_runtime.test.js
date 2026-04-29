const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
    buildAuthoritySourcePackage,
    createBattleSampleRecord,
    normalizeBattleSampleRecords,
    loadCatalogBatchAsSourceRecord
} = require("../src/core/source_data_runtime.js");

test("loadCatalogBatchAsSourceRecord migrates a legacy manual catalog batch into the unified source schema", () => {
    const record = loadCatalogBatchAsSourceRecord(
        path.join(__dirname, "..", "data", "manual_catalog", "purple_quality_items_batch_2026-04-23.json")
    );

    assert.equal(record.record_type, "catalog_batch");
    assert.equal(record.quality, "p");
    assert.equal(record.cells_status, "pending_high_res");
    assert.equal(record.items[0].quality, "p");
    assert.equal(record.items[0].metadata.source_batch_id, "purple_quality_items_batch_2026-04-23");
    assert.equal(record.items[0].metadata.source_kind, "manual_thread_images");
});

test("createBattleSampleRecord normalizes observed state, actual totals, and shared item metadata", () => {
    const record = createBattleSampleRecord({
        id: "villa_case",
        map_id: "villa",
        map_variant_id: "designer_residence",
        map_variant_label: "设计师居所",
        observed_state: { r1_total_items: 45, r1_blue_count: 11 },
        actual_counts: { o: 3, r: 0 },
        actual_value: 364320,
        items: [
            { name: "限定真人展示牌", quality: "p", category: "trendy", cells: 6, value: 25000 }
        ],
        source_kind: "settlement_ocr"
    });

    assert.deepEqual(record, {
        record_type: "battle_sample",
        id: "villa_case",
        map_id: "villa",
        map_variant_id: "designer_residence",
        map_variant_label: "设计师居所",
        observed_state: { r1_total_items: 45, r1_blue_count: 11 },
        actual_counts: { o: 3, r: 0 },
        actual_value: 364320,
        actual_cells: null,
        source_kind: "settlement_ocr",
        items: [
            {
                name: "限定真人展示牌",
                quality: "p",
                value: 25000,
                cells: 6,
                name_confidence: "high",
                metadata: { category: "trendy" }
            }
        ],
        metadata: {}
    });
});

test("createBattleSampleRecord accepts field_values and state aliases when normalizing observed state", () => {
    const fieldValueRecord = createBattleSampleRecord({
        id: "field_value_case",
        map_id: "sunken_ship",
        field_values: {
            total_items: 24,
            blue_count: 8,
            orange_avg_cells: 2.5,
            system_avg_value_type_count: 2,
            system_avg_value_per_cell: 8735.34,
            bid: 18888
        },
        actual_counts: { o: 2, r: 1 },
        loot_value: 50000
    });
    const stateAliasRecord = createBattleSampleRecord({
        id: "state_alias_case",
        map_id: "sunken_ship",
        state: {
            r1_total_items: 24,
            r1_blue_count: 8,
            bid_price: 18888
        },
        actual_counts: { o: 2, r: 1 },
        loot_value: 50000
    });

    assert.deepEqual(fieldValueRecord.observed_state, {
        r1_total_items: 24,
        r1_blue_count: 8,
        r2_orange_avg: 2.5,
        r2_orange_avg_text: "2.5",
        r2_orange_avg_rounding_mode: "truncate",
        system_avg_value_type_count: 2,
        system_avg_value_per_cell: 8735.34,
        bid_price: 18888
    });
    assert.deepEqual(stateAliasRecord.observed_state, {
        r1_total_items: 24,
        r1_blue_count: 8,
        bid_price: 18888
    });
    assert.equal(fieldValueRecord.actual_value, 50000);
    assert.equal(stateAliasRecord.actual_value, 50000);
});

test("buildAuthoritySourcePackage combines catalog batches and battle samples into one source package", () => {
    const sourcePackage = buildAuthoritySourcePackage({
        catalogBatchPaths: [
            path.join(__dirname, "..", "data", "manual_catalog", "white_quality_items_batch_2026-04-23.json"),
            path.join(__dirname, "..", "data", "manual_catalog", "purple_quality_items_batch_2026-04-23.json")
        ],
        battleSamples: [
            {
                id: "villa_case",
                map_id: "villa",
                observed_state: { r1_total_items: 45 },
                actual_counts: { o: 3, r: 0 },
                actual_value: 364320
            }
        ]
    });

    assert.equal(sourcePackage.schema_version, "ak_authority_source_v1");
    assert.equal(sourcePackage.catalog_batches.length, 2);
    assert.equal(sourcePackage.battle_samples.length, 1);
    assert.equal(sourcePackage.summary.catalog_batch_count, 2);
    assert.equal(sourcePackage.summary.battle_sample_count, 1);
    assert.deepEqual(sourcePackage.summary.catalog_qualities.sort(), ["p", "w"]);
});

test("buildAuthoritySourcePackage carries battle sample import context into source summary", () => {
    const sourcePackage = buildAuthoritySourcePackage({
        battleSamples: [
            {
                id: "villa_case",
                map_id: "villa",
                observed_state: { r1_total_items: 45 },
                actual_counts: { o: 3, r: 0 },
                actual_value: 364320
            }
        ],
        battleSampleImportContext: {
            map_id: "villa",
            filter_value: "pending_export",
            scope: "filtered",
            batch_id: "authority_export_filtered_001",
            selected_sample_count: 2,
            skipped_sample_count: 1
        }
    });

    assert.equal(sourcePackage.battle_sample_import_context.scope, "filtered");
    assert.equal(sourcePackage.battle_sample_import_context.map_variant_id, null);
    assert.equal(sourcePackage.battle_sample_import_context.batch_id, "authority_export_filtered_001");
    assert.equal(sourcePackage.summary.battle_sample_import_context.scope, "filtered");
    assert.equal(sourcePackage.summary.battle_sample_import_context.selected_sample_count, 2);
    assert.equal(sourcePackage.summary.battle_sample_import_context.skipped_sample_count, 1);
});

test("battle sample import context preserves optional map variant metadata", () => {
    const sourcePackage = buildAuthoritySourcePackage({
        battleSamples: [
            {
                id: "villa_case",
                map_id: "villa",
                map_variant_id: "designer_residence",
                map_variant_label: "设计师居所",
                observed_state: { r1_total_items: 45 },
                actual_counts: { o: 3, r: 0 },
                actual_value: 364320
            }
        ],
        battleSampleImportContext: {
            map_id: "villa",
            map_variant_id: "designer_residence",
            map_variant_label: "设计师居所",
            filter_value: "pending_export"
        }
    });

    assert.equal(sourcePackage.battle_samples[0].map_variant_id, "designer_residence");
    assert.equal(sourcePackage.battle_samples[0].map_variant_label, "设计师居所");
    assert.equal(sourcePackage.battle_sample_import_context.map_variant_id, "designer_residence");
    assert.equal(sourcePackage.summary.battle_sample_import_context.map_variant_label, "设计师居所");
});

test("normalizeBattleSampleRecords de-duplicates repeated ids and keeps the latest sample payload", () => {
    const records = normalizeBattleSampleRecords([
        {
            id: "villa_case",
            map_id: "villa",
            observed_state: { r1_total_items: 45 },
            actual_counts: { o: 1, r: 0 },
            actual_value: 300000
        },
        {
            id: "villa_case",
            map_id: "villa",
            observed_state: { r1_total_items: 45, r1_blue_count: 11 },
            actual_counts: { o: 3, r: 0 },
            actual_value: 364320
        }
    ]);

    assert.equal(records.length, 1);
    assert.equal(records[0].id, "villa_case");
    assert.deepEqual(records[0].observed_state, { r1_total_items: 45, r1_blue_count: 11 });
    assert.deepEqual(records[0].actual_counts, { o: 3, r: 0 });
    assert.equal(records[0].actual_value, 364320);
});
