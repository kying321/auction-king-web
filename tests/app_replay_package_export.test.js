const test = require("node:test");
const assert = require("node:assert/strict");
global.AUCTION_KING_DEFAULT_CONFIG = {};
const {
    buildCalibrationReplayCandidateConfig,
    buildReplayPackageFilename,
    buildReplayReportFilename,
    buildReplayPackageExportPayload
} = require("../app.js");

test("buildCalibrationReplayCandidateConfig maps panel calibration values into replay candidate config", () => {
    const payload = buildCalibrationReplayCandidateConfig("villa", {
        alpha_counts: {
            o: 2.5,
            r: 0.8
        },
        value_model: {
            o: {
                base_item_mean: 45678,
                base_item_sd: 1200
            }
        }
    });

    assert.deepEqual(payload, {
        maps: {
            villa: {
                alpha_counts: {
                    o: 2.5,
                    r: 0.8
                },
                value_model: {
                    o: {
                        base_item_mean: 45678,
                        base_item_sd: 1200
                    }
                }
            }
        }
    });
});

test("buildReplayPackageExportPayload embeds candidate config and export context metadata", () => {
    const replayPackage = buildReplayPackageExportPayload({
        schema_version: "ak_settlement_calibration_replay_package_v1",
        export_context: {
            map_id: "villa",
            filter_value: "batch:batch_b"
        },
        samples: [
            { id: "villa_case" }
        ]
    }, {
        mapId: "villa",
        calibrationMode: "draft",
        calibrationRecord: {
            alpha_counts: {
                o: 2.5,
                r: 0.8
            },
            value_model: {
                o: {
                    base_item_mean: 45678,
                    base_item_sd: 1200
                }
            }
        },
        sourceArtifactVersion: "ak_authority_calibration_v1"
    });

    assert.equal(replayPackage.export_context.candidate_mode, "draft");
    assert.equal(replayPackage.export_context.source_artifact_version, "ak_authority_calibration_v1");
    assert.equal(replayPackage.candidate_config.maps.villa.alpha_counts.o, 2.5);
    assert.equal(replayPackage.candidate_config.maps.villa.value_model.o.base_item_mean, 45678);
});

test("buildReplayPackageFilename uses filter-aware slugs", () => {
    assert.equal(
        buildReplayPackageFilename("villa", "batch:batch_b"),
        "auction-king-replay-package-villa-batch-b.json"
    );
});

test("buildReplayReportFilename uses filter-aware slugs", () => {
    assert.equal(
        buildReplayReportFilename("villa", "batch:batch_b"),
        "auction-king-replay-report-villa-batch-b.json"
    );
});
