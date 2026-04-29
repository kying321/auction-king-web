const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildInferenceGraphModel
} = require("../src/core/inference_graph.js");

test("buildInferenceGraphModel summarizes the posterior chain and active evidence", () => {
    const model = buildInferenceGraphModel(
        {
            summary: {
                orange_count_probs: [{ count: 3, prob: 0.934 }],
                red_count_probs: [{ count: 9, prob: 0.123 }],
                red_cell_probs: [{ count: 18, prob: 0.41 }],
                red_type_probs: [{ label: "大红", prob: 0.52, anchor_item_value: 330000 }],
                family_probs: [{ label: "海盗军火", prob: 0.61, value_bias: 1.16 }]
            },
            valuation: {
                mean_value: 2313593,
                q25: 1840000,
                q75: 2860000
            }
        },
        {
            r1_total_items: 36,
            r1_blue_count: 16,
            r2_orange_avg: 1.66,
            r2_orange_count: 3,
            r2_purple_count: 4,
            r2_white_green_cells: 12,
            r3_white_green_avg: 2.25,
            r3_purple_avg: 4.75,
            r4_total_storage_cells: 40,
            bid_price: 18800
        },
        {
            map_name: "沉船图 | 默认高难模板"
        },
        "with_purple"
    );

    assert.equal(model.title, "沉船图 | 默认高难模板");
    assert.equal(model.nodes[0].label, "输入锚点");
    assert.match(model.nodes[0].detail, /总件数 36/);
    assert.match(model.nodes[0].detail, /橙件 3/);
    assert.match(model.nodes[0].detail, /绿白总格 12/);
    assert.match(model.nodes[0].detail, /绿白均格 2\.25/);
    assert.match(model.nodes[1].detail, /橙均格 1\.66/);
    assert.match(model.nodes[2].detail, /总仓储空间 40/);
    assert.match(model.nodes[4].detail, /海盗军火/);
    assert.match(model.nodes[5].detail, /2,313,593/);
    assert.equal(model.highlights[0].label, "橙色主峰");
    assert.match(model.highlights[0].value, /3 件/);
    assert.ok(
        model.highlights.some((item) => item.label === "绿白主锚点" && /12 格/.test(item.value)),
        `expected white-green evidence highlight, got ${JSON.stringify(model.highlights)}`
    );
});
