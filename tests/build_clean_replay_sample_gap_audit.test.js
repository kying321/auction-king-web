const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCleanReplaySampleGapAudit,
    main,
    normalizeInputPayload,
    resolveArgs
} = require("../scripts/build_clean_replay_sample_gap_audit.js");

test("package exposes clean replay sample gap audit entry", () => {
    assert.match(
        packageJson.scripts["build:clean-replay-gap-audit"] || "",
        /node\s+scripts\/build_clean_replay_sample_gap_audit\.js/
    );
});

test("normalizeInputPayload accepts sample payloads and legacy arrays", () => {
    const samples = [{ id: "a" }];

    assert.deepEqual(normalizeInputPayload({ samples }), samples);
    assert.deepEqual(normalizeInputPayload(samples), samples);
    assert.deepEqual(normalizeInputPayload({}), []);
});

test("buildCleanReplaySampleGapAudit separates usable replay coverage from settlement-only candidates", () => {
    const audit = buildCleanReplaySampleGapAudit({
        replaySamples: [
            {
                id: "villa_clean_o",
                map_id: "villa",
                actual_counts: { o: 1 }
            },
            {
                id: "sunken_clean_or",
                map_id: "sunken_ship",
                actual_counts: { o: 2, r: 4 }
            }
        ],
        settlementCandidates: [
            {
                id: "villa_settlement_only",
                map_id: "villa",
                status: "settlement_only_partial"
            },
            {
                id: "sunken_ready",
                map_id: "sunken_ship",
                status: "clean_replay_ready"
            }
        ],
        targetMaps: ["villa", "sunken_ship"],
        thresholds: {
            min_map_sample_count: 3,
            min_quality_sample_count: 2
        }
    });

    assert.equal(audit.summary.maps_ready_for_default_weight, 0);
    assert.equal(audit.summary.settlement_only_candidate_count, 1);
    assert.equal(audit.maps.villa.clean_replay_sample_count, 1);
    assert.deepEqual(audit.maps.villa.quality_sample_counts, { o: 1, r: 0 });
    assert.deepEqual(audit.maps.villa.gaps, {
        map_samples: 2,
        quality_samples: { o: 1, r: 2 }
    });
    assert.equal(audit.maps.villa.can_adopt_default_weight, false);
    assert.deepEqual(audit.maps.villa.settlement_only_candidate_ids, ["villa_settlement_only"]);
    assert.deepEqual(audit.maps.sunken_ship.gaps.quality_samples, { o: 1, r: 1 });
});

test("resolveArgs accepts replay samples, settlement candidates, and output path", () => {
    const result = resolveArgs(["replay.json", "settlement.json", "report.json"]);

    assert.equal(result.replaySamplesPath, path.resolve("replay.json"));
    assert.equal(result.settlementCandidatesPath, path.resolve("settlement.json"));
    assert.equal(result.outputPath, path.resolve("report.json"));
});

test("main writes a clean replay sample gap audit report", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-clean-gap-"));
    const replayPath = path.join(tempDir, "replay.json");
    const settlementPath = path.join(tempDir, "settlement.json");
    const outputPath = path.join(tempDir, "report.json");

    fs.writeFileSync(replayPath, JSON.stringify({
        samples: [
            {
                id: "villa_clean_o",
                map_id: "villa",
                actual_counts: { o: 1 }
            }
        ]
    }, null, 2));
    fs.writeFileSync(settlementPath, JSON.stringify([
        {
            id: "villa_settlement_only",
            map_id: "villa",
            status: "settlement_only_partial"
        }
    ], null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([replayPath, settlementPath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(report.maps.villa.clean_replay_sample_count, 1);
    assert.deepEqual(report.maps.villa.settlement_only_candidate_ids, ["villa_settlement_only"]);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
