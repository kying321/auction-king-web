const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    resolveArgs,
    main
} = require("../scripts/build_authority_battle_samples.js");

test("package exposes authority battle sample builder entry", () => {
    assert.match(
        packageJson.scripts["build:authority-battle-samples"] || "",
        /node\s+scripts\/build_authority_battle_samples\.js/
    );
});

test("resolveArgs supports explicit input and output paths", () => {
    const result = resolveArgs(["samples.json", "authority.json"]);

    assert.equal(result.inputPath, path.resolve("samples.json"));
    assert.equal(result.outputPath, path.resolve("authority.json"));
});

test("main writes normalized authority battle samples from exported settlement samples", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-authority-battle-"));
    const inputPath = path.join(tempDir, "samples.json");
    const outputPath = path.join(tempDir, "authority_battle_samples.json");

    fs.writeFileSync(inputPath, JSON.stringify([
        {
            id: "sample_from_workspace",
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

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([inputPath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const output = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(output.length, 1);
    assert.equal(output[0].record_type, "battle_sample");
    assert.equal(output[0].map_id, "villa");
    assert.deepEqual(output[0].actual_counts, { o: 3, r: 0 });
    assert.equal(output[0].observed_state.r1_total_items, 45);
    assert.equal(output[0].observed_state.r1_blue_count, 11);
    assert.equal(output[0].observed_state.r2_orange_avg, 3.33);
    assert.equal(output[0].actual_value, 364320);
    assert.equal(printed.join(""), `${outputPath}\n`);
});

test("main de-duplicates repeated sample ids so repeated exports stay idempotent", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-authority-battle-dedupe-"));
    const inputPath = path.join(tempDir, "samples.json");
    const outputPath = path.join(tempDir, "authority_battle_samples.json");

    fs.writeFileSync(inputPath, JSON.stringify([
        {
            id: "duplicate_sample",
            map_id: "villa",
            field_values: {
                total_items: 45
            },
            actual_counts: {
                o: 1,
                r: 0
            },
            loot_value: 300000
        },
        {
            id: "duplicate_sample",
            map_id: "villa",
            field_values: {
                total_items: 45
            },
            actual_counts: {
                o: 3,
                r: 0
            },
            loot_value: 364320
        }
    ], null, 2));

    main([inputPath, outputPath]);

    const output = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(output.length, 1);
    assert.equal(output[0].id, "duplicate_sample");
    assert.deepEqual(output[0].actual_counts, { o: 3, r: 0 });
    assert.equal(output[0].actual_value, 364320);
});

test("main also accepts a wrapped authority export package that contains a samples array", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-authority-battle-package-"));
    const inputPath = path.join(tempDir, "authority_package.json");
    const outputPath = path.join(tempDir, "authority_battle_samples.json");

    fs.writeFileSync(inputPath, JSON.stringify({
        schema_version: "ak_authority_battle_sample_package_v1",
        export_kind: "authority_battle_samples",
        export_context: {
            map_id: "villa",
            filter_value: "pending_export",
            scope: "filtered"
        },
        samples: [
            {
                id: "wrapped_sample",
                map_id: "villa",
                field_values: {
                    total_items: 45
                },
                actual_counts: {
                    o: 2,
                    r: 1
                },
                loot_value: 320000
            }
        ]
    }, null, 2));

    main([inputPath, outputPath]);

    const output = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(output.length, 1);
    assert.equal(output[0].id, "wrapped_sample");
    assert.equal(output[0].map_id, "villa");
    assert.deepEqual(output[0].actual_counts, { o: 2, r: 1 });
    assert.equal(output[0].actual_value, 320000);
});
