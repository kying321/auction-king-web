const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    resolveArgs,
    main
} = require("../scripts/build_authority_from_settlement_samples.js");

const REPO_ROOT = path.join(__dirname, "..");

function copyFileIntoDir(filePath, targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(filePath, path.join(targetDir, path.basename(filePath)));
}

function createTempWorkspaceRoot() {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ak-authority-from-samples-"));
    const configDir = path.join(tempRoot, "config", "default");
    const manualCatalogDir = path.join(tempRoot, "data", "manual_catalog");

    [
        "app.json",
        "fields.json",
        "templates.json",
        "maps.json",
        "model.json",
        "solver.json",
        "roles.json"
    ].forEach((fileName) => {
        copyFileIntoDir(path.join(REPO_ROOT, "config", "default", fileName), configDir);
    });

    fs.readdirSync(path.join(REPO_ROOT, "data", "manual_catalog"))
        .filter((fileName) => fileName.endsWith(".json"))
        .forEach((fileName) => {
            copyFileIntoDir(path.join(REPO_ROOT, "data", "manual_catalog", fileName), manualCatalogDir);
        });

    return tempRoot;
}

test("package exposes one-step authority refresh from exported settlement samples", () => {
    assert.match(
        packageJson.scripts["build:authority-from-samples"] || "",
        /node\s+scripts\/build_authority_from_settlement_samples\.js/
    );
});

test("resolveArgs supports settlement sample path and optional workspace root", () => {
    const result = resolveArgs(["samples.json", "workspace-root"]);

    assert.equal(result.inputPath, path.resolve("samples.json"));
    assert.equal(result.workspaceRoot, path.resolve("workspace-root"));
    assert.equal(result.mergeExisting, false);
});

test("resolveArgs supports explicit merge-existing and workspace-root flags", () => {
    const result = resolveArgs([
        "samples.json",
        "--workspace-root",
        "workspace-root",
        "--merge-existing"
    ]);

    assert.equal(result.inputPath, path.resolve("samples.json"));
    assert.equal(result.workspaceRoot, path.resolve("workspace-root"));
    assert.equal(result.mergeExisting, true);
});

test("main explains that settlement samples and Authority Battle Samples are both accepted inputs", () => {
    assert.throws(
        () => main([]),
        /结算样本或 Authority Battle Samples JSON 路径/
    );
});

test("main rebuilds battle samples, source package, calibration artifact, and default bundle from exported settlement samples", () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const samplesPath = path.join(workspaceRoot, "exported_samples.json");

    fs.writeFileSync(samplesPath, JSON.stringify([
        {
            id: "villa_export_1",
            map_id: "villa",
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
            items: [
                { quality: "p", category: "trendy", cells: 6, value: 25000 }
            ],
            source_kind: "settlement_export"
        }
    ], null, 2));

    const summary = main([samplesPath, workspaceRoot]);

    const battleSamplesPath = path.join(workspaceRoot, "data", "battle_samples", "authority_battle_samples.json");
    const sourcePackagePath = path.join(workspaceRoot, "data", "source_packages", "authority_source_package.json");
    const calibrationPath = path.join(workspaceRoot, "config", "default", "calibration.json");
    const defaultBundlePath = path.join(workspaceRoot, "default_config_bundle.js");

    const battleSamples = JSON.parse(fs.readFileSync(battleSamplesPath, "utf8"));
    const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, "utf8"));
    const calibration = JSON.parse(fs.readFileSync(calibrationPath, "utf8"));
    delete require.cache[require.resolve(defaultBundlePath)];
    const defaultBundle = require(defaultBundlePath);

    assert.equal(summary.workspaceRoot, workspaceRoot);
    assert.equal(summary.battleSampleCount, 1);
    assert.equal(battleSamples.length, 1);
    assert.equal(battleSamples[0].record_type, "battle_sample");
    assert.equal(battleSamples[0].observed_state.r1_total_items, 45);
    assert.equal(sourcePackage.summary.battle_sample_count, 1);
    assert.deepEqual(sourcePackage.summary.maps_with_battle_samples, ["villa"]);
    assert.equal(calibration.calibration.source_summary.battle_sample_count, 1);
    assert.equal(calibration.calibration.maps.villa.count_prior_calibration.battle_sample_count, 1);
    assert.equal(defaultBundle.calibration.source_summary.battle_sample_count, 1);
    assert.equal(defaultBundle.calibration.maps.villa.count_prior_calibration.battle_sample_count, 1);
});

test("main keeps authority refresh idempotent when the exported sample file repeats the same sample id", () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const samplesPath = path.join(workspaceRoot, "duplicated_exported_samples.json");

    fs.writeFileSync(samplesPath, JSON.stringify([
        {
            id: "villa_export_dup",
            map_id: "villa",
            field_values: {
                total_items: 45,
                blue_count: 11
            },
            actual_counts: {
                o: 1,
                r: 0
            },
            loot_value: 300000
        },
        {
            id: "villa_export_dup",
            map_id: "villa",
            field_values: {
                total_items: 45,
                blue_count: 11
            },
            actual_counts: {
                o: 3,
                r: 0
            },
            loot_value: 364320
        }
    ], null, 2));

    const summary = main([samplesPath, workspaceRoot]);
    const battleSamplesPath = path.join(workspaceRoot, "data", "battle_samples", "authority_battle_samples.json");
    const sourcePackagePath = path.join(workspaceRoot, "data", "source_packages", "authority_source_package.json");
    const calibrationPath = path.join(workspaceRoot, "config", "default", "calibration.json");

    const battleSamples = JSON.parse(fs.readFileSync(battleSamplesPath, "utf8"));
    const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, "utf8"));
    const calibration = JSON.parse(fs.readFileSync(calibrationPath, "utf8"));

    assert.equal(summary.battleSampleCount, 1);
    assert.equal(battleSamples.length, 1);
    assert.deepEqual(battleSamples[0].actual_counts, { o: 3, r: 0 });
    assert.equal(sourcePackage.summary.battle_sample_count, 1);
    assert.equal(calibration.calibration.source_summary.battle_sample_count, 1);
    assert.equal(calibration.calibration.maps.villa.count_prior_calibration.battle_sample_count, 1);
});

test("main also accepts a wrapped authority export package that contains a samples array", () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const samplesPath = path.join(workspaceRoot, "wrapped_authority_package.json");

    fs.writeFileSync(samplesPath, JSON.stringify({
        schema_version: "ak_authority_battle_sample_package_v1",
        export_kind: "authority_battle_samples",
        export_context: {
            map_id: "villa",
            filter_value: "pending_export",
            scope: "filtered"
        },
        samples: [
            {
                id: "villa_wrapped_case",
                map_id: "villa",
                field_values: {
                    total_items: 45,
                    blue_count: 11
                },
                actual_counts: {
                    o: 2,
                    r: 1
                },
                loot_value: 333333
            }
        ]
    }, null, 2));

    const summary = main([samplesPath, workspaceRoot]);
    const battleSamplesPath = path.join(workspaceRoot, "data", "battle_samples", "authority_battle_samples.json");
    const sourcePackagePath = path.join(workspaceRoot, "data", "source_packages", "authority_source_package.json");
    const calibrationPath = path.join(workspaceRoot, "config", "default", "calibration.json");

    const battleSamples = JSON.parse(fs.readFileSync(battleSamplesPath, "utf8"));
    const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, "utf8"));
    const calibration = JSON.parse(fs.readFileSync(calibrationPath, "utf8"));

    assert.equal(summary.battleSampleCount, 1);
    assert.equal(battleSamples.length, 1);
    assert.equal(battleSamples[0].id, "villa_wrapped_case");
    assert.deepEqual(battleSamples[0].actual_counts, { o: 2, r: 1 });
    assert.equal(sourcePackage.summary.battle_sample_count, 1);
    assert.equal(sourcePackage.summary.battle_sample_import_context.scope, "filtered");
    assert.equal(sourcePackage.summary.battle_sample_import_context.filter_value, "pending_export");
    assert.equal(calibration.calibration.source_summary.battle_sample_count, 1);
    assert.equal(calibration.calibration.source_summary.battle_sample_import_context.scope, "filtered");
    assert.equal(calibration.calibration.manifest.source_inputs.battle_sample_import_context.scope, "filtered");
    assert.equal(calibration.calibration.maps.villa.count_prior_calibration.battle_sample_count, 1);
});

test("main can merge imported samples with existing authority samples", () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const samplesPath = path.join(workspaceRoot, "new_count_fit_import.json");
    const battleSamplesPath = path.join(workspaceRoot, "data", "battle_samples", "authority_battle_samples.json");
    fs.mkdirSync(path.dirname(battleSamplesPath), { recursive: true });

    fs.writeFileSync(battleSamplesPath, JSON.stringify([
        {
            id: "villa_existing_case",
            map_id: "villa",
            observed_state: {
                r1_total_items: 45
            },
            actual_counts: {
                o: 1,
                r: 0
            },
            source_kind: "settlement_export"
        },
        {
            id: "sunken_duplicate_case",
            map_id: "sunken_ship",
            observed_state: {
                r1_total_items: 58
            },
            actual_counts: {
                p: 10
            },
            source_kind: "count_fit_manual_review"
        }
    ], null, 2));

    fs.writeFileSync(samplesPath, JSON.stringify({
        schema_version: "ak_count_fit_sample_review_import_v1",
        samples: [
            {
                id: "sunken_duplicate_case",
                map_id: "sunken_ship",
                observed_state: {
                    r1_total_items: 58,
                    r1_blue_count: 15
                },
                actual_counts: {
                    w: 0,
                    g: 13,
                    b: 15,
                    p: 24,
                    o: 3,
                    r: 3
                },
                source_kind: "count_fit_manual_review"
            },
            {
                id: "sunken_new_case",
                map_id: "sunken_ship",
                observed_state: {
                    r1_total_items: 12,
                    r1_blue_count: 3
                },
                actual_counts: {
                    w: 0,
                    g: 3,
                    b: 3,
                    p: 4,
                    o: 1,
                    r: 1
                },
                source_kind: "count_fit_manual_review"
            }
        ]
    }, null, 2));

    const summary = main([samplesPath, workspaceRoot, "--merge-existing"]);
    const battleSamples = JSON.parse(fs.readFileSync(battleSamplesPath, "utf8"));
    const sourcePackagePath = path.join(workspaceRoot, "data", "source_packages", "authority_source_package.json");
    const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, "utf8"));

    assert.equal(summary.mergeExisting, true);
    assert.equal(summary.previousBattleSampleCount, 2);
    assert.equal(summary.incomingSampleCount, 2);
    assert.equal(summary.battleSampleCount, 3);
    assert.equal(battleSamples.length, 3);
    assert.deepEqual(
        battleSamples.find((sample) => sample.id === "sunken_duplicate_case").actual_counts,
        { w: 0, g: 13, b: 15, p: 24, o: 3, r: 3 }
    );
    assert.deepEqual(sourcePackage.summary.maps_with_battle_samples, ["sunken_ship", "villa"]);
});
