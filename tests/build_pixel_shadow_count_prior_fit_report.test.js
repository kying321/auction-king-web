const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildPixelShadowCountPriorFitReport,
    formatPixelShadowCountPriorFitMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_pixel_shadow_count_prior_fit_report.js");

test("package exposes pixel shadow count-prior fit entry", () => {
    assert.match(
        packageJson.scripts["build:pixel-shadow-count-prior-fit"] || "",
        /node\s+scripts\/build_pixel_shadow_count_prior_fit_report\.js/
    );
});

test("resolveArgs accepts candidate queue and output path", () => {
    const result = resolveArgs(["queue.json", "shadow-fit.json"]);

    assert.equal(result.candidateQueuePath, path.resolve("queue.json"));
    assert.equal(result.outputPath, path.resolve("shadow-fit.json"));
});

test("buildPixelShadowCountPriorFitReport aggregates pixel drafts as review-only shadow candidates", () => {
    const report = buildPixelShadowCountPriorFitReport({
        generatedAt: "2026-04-24T12:00:00.000Z",
        baselineConfig: {
            app: { default_map_id: "villa" },
            model: {
                alpha_counts: { w: 6, g: 5, b: 4, p: 3, o: 2, r: 1 },
                solver: { count_prior_strength: 9 }
            },
            maps: {
                villa: {
                    alpha_counts: { w: 3, g: 3, b: 3, p: 3, o: 2, r: 1 },
                    solver: { count_prior_strength: 16 }
                }
            }
        },
        candidateQueue: {
            items: [
                {
                    id: "review_villa_a",
                    map_id: "villa",
                    priority: "P0",
                    pixel_quality_draft: {
                        training_label_allowed: false,
                        counts: { w: 0, g: 1, b: 1, p: 0, o: 2, r: 6 },
                        total: 10,
                        low_confidence_block_count: 4,
                        crop_sensitivity: {
                            stable: false,
                            training_label_allowed: false
                        }
                    }
                },
                {
                    id: "review_villa_b",
                    map_id: "villa",
                    priority: "P1",
                    pixel_quality_draft: {
                        training_label_allowed: false,
                        counts: { w: 1, g: 0, b: 2, p: 1, o: 1, r: 5 },
                        total: 10,
                        low_confidence_block_count: 0,
                        crop_sensitivity: {
                            stable: true,
                            training_label_allowed: false
                        }
                    }
                },
                {
                    id: "review_unknown",
                    priority: "P2",
                    pixel_quality_draft: {
                        training_label_allowed: false,
                        counts: { w: 0, g: 0, b: 0, p: 0, o: 1, r: 0 },
                        total: 1,
                        low_confidence_block_count: 1,
                        crop_sensitivity: {
                            stable: false,
                            training_label_allowed: false
                        }
                    }
                },
                {
                    id: "review_no_pixel",
                    map_id: "villa"
                }
            ]
        }
    });

    assert.equal(report.schema_version, "ak_pixel_shadow_count_prior_fit_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.source_classification, "pixel_review_only_shadow_fit");
    assert.equal(report.adoption_allowed, false);
    assert.equal(report.summary.queue_count, 4);
    assert.equal(report.summary.pixel_input_count, 3);
    assert.equal(report.summary.training_label_allowed_count, 0);
    assert.equal(report.summary.crop_sensitive_input_count, 2);
    assert.equal(report.summary.crop_stable_input_count, 1);
    assert.equal(report.summary.low_confidence_input_count, 2);
    assert.equal(report.summary.pixel_total, 21);
    assert.deepEqual(report.summary.map_counts, { unknown: 1, villa: 2 });
    assert.ok(report.adoption_blockers.includes("pixel_counts_not_training_labels"));
    assert.ok(report.adoption_blockers.includes("missing_same_battle_observed_state"));

    const villa = report.maps.villa;
    assert.equal(villa.pixel_input_count, 2);
    assert.equal(villa.pixel_total, 20);
    assert.deepEqual(villa.pixel_counts, { w: 1, g: 1, b: 3, p: 1, o: 3, r: 11 });
    assert.deepEqual(villa.empirical_fractions, { w: 0.05, g: 0.05, b: 0.15, p: 0.05, o: 0.15, r: 0.55 });
    assert.deepEqual(villa.baseline_alpha_counts, { w: 3, g: 3, b: 3, p: 3, o: 2, r: 1 });
    assert.equal(villa.baseline_alpha_total, 15);
    assert.deepEqual(villa.alpha_counts_candidate, { w: 0.75, g: 0.75, b: 2.25, p: 0.75, o: 2.25, r: 8.25 });
    assert.equal(villa.solver_candidate.count_prior_strength, 16);
    assert.equal(villa.adoption_allowed, false);
    assert.equal(villa.training_label_allowed_count, 0);
    assert.ok(villa.blockers.includes("crop_sensitive_pixel_counts"));
    assert.ok(villa.blockers.includes("missing_manual_actual_counts"));

    const unknown = report.maps.unknown;
    assert.equal(unknown.baseline_alpha_counts, null);
    assert.deepEqual(unknown.alpha_counts_candidate, { w: 0, g: 0, b: 0, p: 0, o: 1, r: 0 });
    assert.ok(unknown.blockers.includes("unknown_map_id"));
});

test("main writes pixel shadow fit JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-pixel-shadow-fit-"));
    const queuePath = path.join(tempDir, "queue.json");
    const outputPath = path.join(tempDir, "shadow-fit.json");

    fs.writeFileSync(queuePath, JSON.stringify({
        items: [
            {
                id: "review_villa",
                map_id: "villa",
                pixel_quality_draft: {
                    training_label_allowed: false,
                    counts: { w: 0, g: 1, b: 0, p: 0, o: 1, r: 2 },
                    total: 4,
                    low_confidence_block_count: 1,
                    crop_sensitivity: {
                        stable: false,
                        training_label_allowed: false
                    }
                }
            }
        ]
    }, null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([queuePath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.pixel_input_count, 1);
    assert.match(markdown, /pixel shadow count-prior fit/);
    assert.match(formatPixelShadowCountPriorFitMarkdown(report, outputPath), /adoption allowed: `false`/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
