const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCleanReplayCandidateQueue,
    buildConfirmedSettlementSummary,
    formatCandidateQueueMarkdown,
    main,
    normalizeInputPayload,
    resolveArgs
} = require("../scripts/build_clean_replay_candidate_queue.js");

test("package exposes clean replay candidate queue entry", () => {
    assert.match(
        packageJson.scripts["build:clean-replay-candidate-queue"] || "",
        /node\s+scripts\/build_clean_replay_candidate_queue\.js/
    );
});

test("normalizeInputPayload accepts arrays and wrapped result payloads", () => {
    const results = [{ basename: "a.png" }];

    assert.deepEqual(normalizeInputPayload(results, "results"), results);
    assert.deepEqual(normalizeInputPayload({ results }, "results"), results);
    assert.deepEqual(normalizeInputPayload({ samples: results }, "samples"), results);
    assert.deepEqual(normalizeInputPayload({}, "results"), []);
});

test("buildCleanReplayCandidateQueue prioritizes confirmed settlement-only samples and attaches overlays", () => {
    const queue = buildCleanReplayCandidateQueue({
        imageAudit: {
            results: [
                {
                    file: "/tmp/villa.png",
                    basename: "villa.png",
                    kind: "settlement",
                    map_ids: ["villa"],
                    submap_ids: ["unknown_villa"],
                    battle_matched_fields: 0,
                    settlement_matched_fields: 1,
                    settlement_item_candidates: 0,
                    preview: "villa settlement",
                    warnings: ["needs manual count"]
                },
                {
                    file: "/tmp/villa_battle.png",
                    basename: "villa_battle.png",
                    kind: "unknown",
                    map_ids: ["villa"],
                    submap_ids: ["luxury_retirement_home"],
                    battle_matched_fields: 1,
                    settlement_matched_fields: 0,
                    settlement_item_candidates: 0,
                    preview: "villa battle"
                },
                {
                    file: "/tmp/noise.png",
                    basename: "noise.png",
                    kind: "unknown",
                    map_ids: [],
                    submap_ids: [],
                    battle_matched_fields: 0,
                    settlement_matched_fields: 0,
                    settlement_item_candidates: 0
                }
            ]
        },
        gapAudit: {
            maps: {
                villa: {
                    can_adopt_default_weight: false,
                    gaps: {
                        map_samples: 2,
                        quality_samples: { o: 1, r: 2 }
                    }
                }
            }
        },
        settlementCandidates: [
            {
                id: "confirmed_villa",
                source_image_path: "/tmp/villa.png",
                map_id: "villa",
                bid_price: 888888,
                loot_value: 999999,
                profit: 111111,
                quick_recycle_total_items: 48,
                status: "settlement_only_partial"
            }
        ],
        pixelReport: {
            results: [
                {
                    basename: "villa.png",
                    overlay_path: "/tmp/villa-overlay.png",
                    summary: {
                        counts: { w: 0, g: 1, b: 0, p: 0, o: 2, r: 1 },
                        total: 4
                    },
                    blocks: [
                        { quality: "g", confidence: 0.78 },
                        { quality: "o", confidence: 0.42 },
                        { quality: "o", confidence: 0.71 },
                        { quality: "r", confidence: 0.63 }
                    ]
                }
            ]
        }
    });

    assert.equal(queue.summary.queue_count, 2);
    assert.equal(queue.summary.priority_counts.P0, 1);
    assert.equal(queue.summary.pixel_draft_count, 1);
    assert.equal(queue.summary.pixel_draft_with_low_confidence_count, 1);
    assert.equal(queue.summary.pixel_training_label_allowed_count, 0);
    assert.equal(queue.summary.manual_review_template_count, 2);
    assert.equal(queue.summary.manual_review_trainable_count, 0);
    assert.equal(queue.items[0].confirmed_sample_id, "confirmed_villa");
    assert.equal(queue.items[0].priority, "P0");
    assert.equal(queue.items[0].recommended_action, "pair_observed_state_and_actual_counts");
    assert.equal(queue.items[0].pixel_overlay_path, "/tmp/villa-overlay.png");
    assert.deepEqual(queue.items[0].pixel_quality_draft.counts, { w: 0, g: 1, b: 0, p: 0, o: 2, r: 1 });
    assert.equal(queue.items[0].pixel_quality_draft.total, 4);
    assert.equal(queue.items[0].pixel_quality_draft.training_label_allowed, false);
    assert.equal(queue.items[0].pixel_quality_draft.low_confidence_block_count, 1);
    assert.deepEqual(queue.items[0].confirmed_settlement_summary, {
        bid_price: 888888,
        loot_value: 999999,
        profit: 111111,
        quick_recycle_total_items: 48
    });
    assert.deepEqual(queue.items[0].pixel_vs_settlement_total, {
        status: "pixel_partial_under_settlement_total",
        pixel_total: 4,
        settlement_total: 48,
        delta: -44,
        training_label_allowed: false
    });
    assert.equal(queue.items[0].manual_review_template.schema_version, "ak_clean_replay_manual_review_v1");
    assert.equal(queue.items[0].manual_review_template.output_target, "clean_replay_sample_candidate");
    assert.equal(queue.items[0].manual_review_template.training_label_allowed, false);
    assert.deepEqual(queue.items[0].manual_review_template.required_fields, [
        "observed_state",
        "actual_counts.w",
        "actual_counts.g",
        "actual_counts.b",
        "actual_counts.p",
        "actual_counts.o",
        "actual_counts.r",
        "actual_counts.total_items",
        "actual_counts_source",
        "reviewer_notes"
    ]);
    assert.deepEqual(queue.items[0].manual_review_template.prefill, {
        source_image_path: "/tmp/villa.png",
        map_id: "villa",
        map_variant_id: "unknown_villa",
        confirmed_sample_id: "confirmed_villa",
        pixel_total: 4,
        settlement_total: 48
    });
    assert.deepEqual(queue.items[0].manual_review_template.guardrails, [
        "do_not_use_pixel_quality_draft_as_training_label",
        "do_not_train_without_observed_state",
        "do_not_train_without_manual_actual_counts",
        "settlement_total_is_cross_check_only"
    ]);
    assert.deepEqual(queue.items[0].blockers, ["missing_observed_state", "missing_actual_counts"]);
    assert.equal(queue.items[1].priority, "P2");
    assert.equal(queue.items[1].recommended_action, "manual_pair_or_discard");
    assert.deepEqual(queue.items[1].manual_review_template.required_fields, [
        "manual_decision",
        "observed_state_or_discard_reason",
        "pairing_notes",
        "reviewer_notes"
    ]);
});

test("buildCleanReplayCandidateQueue carries crop sensitivity into review-only pixel drafts", () => {
    const queue = buildCleanReplayCandidateQueue({
        imageAudit: {
            results: [
                {
                    file: "/tmp/villa.png",
                    basename: "villa.png",
                    kind: "settlement",
                    map_ids: ["villa"],
                    submap_ids: ["unknown_villa"],
                    settlement_matched_fields: 1
                }
            ]
        },
        gapAudit: {
            maps: {
                villa: {
                    can_adopt_default_weight: false,
                    gaps: { map_samples: 2, quality_samples: { o: 1, r: 0 } }
                }
            }
        },
        settlementCandidates: [
            {
                id: "confirmed_villa",
                source_image_path: "/tmp/villa.png",
                map_id: "villa",
                quick_recycle_total_items: 48,
                status: "settlement_only_partial"
            }
        ],
        pixelReport: {
            results: [
                {
                    basename: "villa.png",
                    overlay_path: "/tmp/villa-overlay.png",
                    summary: {
                        counts: { w: 0, g: 0, b: 4, p: 1, o: 2, r: 4 },
                        total: 11
                    },
                    blocks: [
                        { quality: "b", confidence: 0.71 },
                        { quality: "r", confidence: 0.64 }
                    ]
                }
            ]
        },
        cropSensitivityReport: {
            schema_version: "ak_quality_pixel_crop_sensitivity_v1",
            results: [
                {
                    basename: "villa.png",
                    action: "manual_review_required_crop_sensitive",
                    stable: false,
                    variant_count: 9,
                    unique_signature_count: 3,
                    majority_fraction: 0.3333,
                    majority_summary: {
                        counts: { w: 0, g: 0, b: 4, p: 1, o: 2, r: 4 },
                        total: 11
                    }
                }
            ]
        }
    });

    assert.equal(queue.summary.pixel_draft_count, 1);
    assert.equal(queue.summary.pixel_crop_sensitive_count, 1);
    assert.equal(queue.summary.pixel_crop_stable_count, 0);
    assert.equal(queue.summary.pixel_training_label_allowed_count, 0);
    assert.deepEqual(queue.items[0].pixel_quality_draft.crop_sensitivity, {
        source: "quality_pixel_crop_sensitivity_v1",
        status: "crop_sensitive_review_required",
        stable: false,
        action: "manual_review_required_crop_sensitive",
        variant_count: 9,
        unique_signature_count: 3,
        majority_fraction: 0.3333,
        majority_summary: {
            counts: { w: 0, g: 0, b: 4, p: 1, o: 2, r: 4 },
            total: 11
        },
        training_label_allowed: false
    });
    assert.equal(queue.items[0].manual_review_template.prefill.pixel_crop_sensitivity_action, "manual_review_required_crop_sensitive");
    assert.ok(queue.items[0].manual_review_template.guardrails.includes("do_not_train_from_crop_sensitive_pixel_counts"));
});

test("resolveArgs accepts image audit, gap audit, settlement candidates, pixel report, output path, and crop sensitivity flag", () => {
    const result = resolveArgs([
        "audit.json",
        "gap.json",
        "settlement.json",
        "pixel.json",
        "queue.json",
        "--crop-sensitivity=crop.json"
    ]);

    assert.equal(result.imageAuditPath, path.resolve("audit.json"));
    assert.equal(result.gapAuditPath, path.resolve("gap.json"));
    assert.equal(result.settlementCandidatesPath, path.resolve("settlement.json"));
    assert.equal(result.pixelReportPath, path.resolve("pixel.json"));
    assert.equal(result.outputPath, path.resolve("queue.json"));
    assert.equal(result.cropSensitivityPath, path.resolve("crop.json"));
});

test("buildConfirmedSettlementSummary does not coerce missing totals into zero", () => {
    assert.deepEqual(buildConfirmedSettlementSummary({
        bid_price: 858000,
        loot_value: 915248,
        profit: 57248,
        quick_recycle_total_items: null
    }), {
        bid_price: 858000,
        loot_value: 915248,
        profit: 57248
    });
});

test("formatCandidateQueueMarkdown summarizes priorities and next review actions", () => {
    const markdown = formatCandidateQueueMarkdown({
        summary: {
            queue_count: 2,
            priority_counts: { P0: 1, P2: 1 },
            action_counts: {
                pair_observed_state_and_actual_counts: 1,
                manual_pair_or_discard: 1
            },
            map_counts: { villa: 2 },
            pixel_draft_count: 1,
            pixel_draft_with_low_confidence_count: 1,
            pixel_crop_sensitive_count: 1,
            pixel_crop_stable_count: 0,
            pixel_training_label_allowed_count: 0,
            manual_review_template_count: 2,
            manual_review_trainable_count: 0
        },
        items: [
            {
                priority: "P0",
                basename: "villa.png",
                map_id: "villa",
                map_variant_id: "unknown_villa",
                recommended_action: "pair_observed_state_and_actual_counts",
                blockers: ["missing_observed_state", "missing_actual_counts"],
                confirmed_settlement_summary: {
                    quick_recycle_total_items: 48
                },
                pixel_vs_settlement_total: {
                    status: "pixel_partial_under_settlement_total",
                    pixel_total: 4,
                    settlement_total: 48,
                    delta: -44,
                    training_label_allowed: false
                },
                manual_review_template: {
                    required_fields: [
                        "observed_state",
                        "actual_counts.o",
                        "actual_counts.r",
                        "reviewer_notes"
                    ],
                    training_label_allowed: false
                },
                pixel_overlay_path: "/tmp/villa-overlay.png",
                pixel_quality_draft: {
                    counts: { w: 0, g: 1, b: 0, p: 0, o: 2, r: 1 },
                    total: 4,
                    min_confidence: 0.42,
                    low_confidence_block_count: 1,
                    crop_sensitivity: {
                        action: "manual_review_required_crop_sensitive",
                        stable: false,
                        unique_signature_count: 3,
                        majority_fraction: 0.3333,
                        training_label_allowed: false
                    },
                    training_label_allowed: false
                }
            },
            {
                priority: "P2",
                basename: "villa_battle.png",
                map_id: "villa",
                recommended_action: "manual_pair_or_discard",
                blockers: ["needs_manual_pairing"]
            }
        ]
    }, "queue.json");

    assert.match(markdown, /clean replay 候选队列/);
    assert.match(markdown, /queue count: `2`/);
    assert.match(markdown, /pixel drafts: `1`/);
    assert.match(markdown, /low-confidence drafts: `1`/);
    assert.match(markdown, /crop-sensitive drafts: `1`/);
    assert.match(markdown, /training-label allowed: `0`/);
    assert.match(markdown, /manual review templates: `2`/);
    assert.match(markdown, /manual review trainable: `0`/);
    assert.match(markdown, /\| `P0` \| `1` \|/);
    assert.match(markdown, /\| `villa\.png` \| `villa` \| `unknown_villa` \| pair_observed_state_and_actual_counts \|/);
    assert.match(markdown, /像素草稿/);
    assert.match(markdown, /g:1, o:2, r:1/);
    assert.match(markdown, /low=1/);
    assert.match(markdown, /crop=manual_review_required_crop_sensitive/);
    assert.match(markdown, /settlement_total=48/);
    assert.match(markdown, /pixel_partial_under_settlement_total/);
    assert.match(markdown, /人工填写字段/);
    assert.match(markdown, /observed_state/);
    assert.match(markdown, /actual_counts\.o/);
    assert.match(markdown, /\| `P0` \| `villa\.png` \| `villa` \| pair_observed_state_and_actual_counts \|/);
    assert.match(markdown, /`villa\.png`/);
    assert.match(markdown, /missing_observed_state/);
    assert.match(markdown, /villa-overlay\.png/);
});

test("main writes a clean replay candidate queue", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-clean-queue-"));
    const auditPath = path.join(tempDir, "audit.json");
    const gapPath = path.join(tempDir, "gap.json");
    const settlementPath = path.join(tempDir, "settlement.json");
    const pixelPath = path.join(tempDir, "pixel.json");
    const outputPath = path.join(tempDir, "queue.json");

    fs.writeFileSync(auditPath, JSON.stringify({
        results: [
            {
                file: "/tmp/villa.png",
                basename: "villa.png",
                kind: "settlement",
                map_ids: ["villa"],
                submap_ids: ["unknown_villa"],
                settlement_matched_fields: 1
            }
        ]
    }, null, 2));
    fs.writeFileSync(gapPath, JSON.stringify({
        maps: {
            villa: {
                can_adopt_default_weight: false,
                gaps: { map_samples: 2, quality_samples: { o: 1, r: 2 } }
            }
        }
    }, null, 2));
    fs.writeFileSync(settlementPath, JSON.stringify([
        {
            id: "confirmed_villa",
            source_image_path: "/tmp/villa.png",
            map_id: "villa",
            status: "settlement_only_partial"
        }
    ], null, 2));
    fs.writeFileSync(pixelPath, JSON.stringify({ results: [] }, null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([auditPath, gapPath, settlementPath, pixelPath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.queue_count, 1);
    assert.equal(report.items[0].confirmed_sample_id, "confirmed_villa");
    assert.match(markdown, /confirmed_villa|villa\.png/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
