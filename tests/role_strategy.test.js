const test = require("node:test");
const assert = require("node:assert/strict");
const {
    determineCurrentRound,
    buildRoleStrategy
} = require("../src/browser/role_strategy.js");
const defaultConfig = require("../src/core/default_config_bundle.js");

function createResult(overrides = {}) {
    return {
        valuation: {
            mean_value: 420000,
            q25: 320000,
            q50: 400000,
            q75: 520000
        },
        summary: {
            orange_count_probs: [{ count: 2, prob: 0.48 }, { count: 1, prob: 0.22 }],
            red_count_probs: [{ count: 1, prob: 0.32 }, { count: 0, prob: 0.28 }],
            count_means: { w: 4, g: 3, b: 2, p: 1.5, o: 1.8, r: 0.7 },
            cell_low: { w: 4, g: 4, b: 4, p: 3, o: 3, r: 2 },
            cell_high: { w: 7, g: 7, b: 6, p: 5, o: 5, r: 4 }
        },
        ...overrides
    };
}

function createState(overrides = {}) {
    return {
        r1_total_items: 24,
        r1_blue_count: 5,
        r2_orange_avg: 2.6,
        r2_orange_count: null,
        r2_purple_count: 3,
        r2_white_green_cells: null,
        r3_green_count: 6,
        r3_white_green_avg: null,
        r3_purple_avg: 2.2,
        r4_blue_avg: null,
        r4_total_storage_cells: null,
        r5_white_green_total: null,
        r5_white_count: null,
        bid_price: 188000,
        ...overrides
    };
}

test("determineCurrentRound follows the highest unlocked observation round", () => {
    assert.equal(determineCurrentRound(createState()), 3);
    assert.equal(determineCurrentRound(createState({ r4_blue_avg: 1.8 })), 4);
    assert.equal(determineCurrentRound(createState({ r5_white_green_total: 13 })), 5);
});

test("determineCurrentRound recognizes the new white-green and storage observations", () => {
    assert.equal(determineCurrentRound(createState({
        r2_orange_avg: null,
        r2_purple_count: null,
        r3_green_count: null,
        r3_purple_avg: null,
        r2_white_green_cells: 12
    })), 2);
    assert.equal(determineCurrentRound(createState({
        r2_orange_avg: null,
        r2_purple_count: null,
        r3_green_count: null,
        r3_purple_avg: null,
        r2_white_green_cells: 12,
        r3_white_green_avg: 2.25
    })), 3);
    assert.equal(determineCurrentRound(createState({
        r2_orange_avg: null,
        r2_purple_count: null,
        r3_green_count: null,
        r3_purple_avg: null,
        r2_white_green_cells: 12,
        r3_white_green_avg: 2.25,
        r4_total_storage_cells: 41
    })), 4);
});

test("buildRoleStrategy makes Sophie more aggressive in round 3-4 when posterior is concentrated", () => {
    const strategy = buildRoleStrategy("sophie", createResult(), createState({ r4_blue_avg: 1.8 }));

    assert.equal(strategy.currentRound, 4);
    assert.match(strategy.posture, /第3-4轮前压/);
    assert.ok(strategy.caps.steady > 400000, `expected Sophie steady cap to beat median anchor, got ${strategy.caps.steady}`);
});

test("buildRoleStrategy warns Raven about manipulation risk before round 5", () => {
    const strategy = buildRoleStrategy("raven", createResult(), createState());

    assert.equal(strategy.currentRound, 3);
    assert.match(strategy.posture, /拖到第5轮/);
    assert.ok(strategy.caps.steady < 400000, `expected Raven steady cap to be discounted before round 5, got ${strategy.caps.steady}`);
    assert.ok(strategy.notes.some((note) => /被做局/.test(note)), `expected manipulation warning, got ${strategy.notes.join(" | ")}`);
});

test("buildRoleStrategy highlights Isabella's red-sniping advantage when red probability is high", () => {
    const strategy = buildRoleStrategy(
        "isabella",
        createResult({
            summary: {
                orange_count_probs: [{ count: 1, prob: 0.25 }],
                red_count_probs: [{ count: 1, prob: 0.61 }, { count: 0, prob: 0.11 }],
                count_means: { w: 5, g: 4, b: 2, p: 1, o: 1.2, r: 1.1 },
                cell_low: { w: 4, g: 4, b: 4, p: 3, o: 3, r: 2 },
                cell_high: { w: 7, g: 7, b: 6, p: 5, o: 6, r: 5 }
            }
        }),
        createState({ r2_orange_avg: null, r2_purple_count: null, r3_green_count: null, r3_purple_avg: null })
    );

    assert.equal(strategy.currentRound, 1);
    assert.ok(strategy.notes.some((note) => /见红/.test(note)), `expected red-snipe note, got ${strategy.notes.join(" | ")}`);
    assert.ok(strategy.signalScore >= 0.6, `expected strong signal score, got ${strategy.signalScore}`);
});

test("buildRoleStrategy defaults to Ahmed's five-round calculation view", () => {
    const strategy = buildRoleStrategy(undefined, createResult(), createState());

    assert.equal(strategy.roleId, "ahmed");
    assert.equal(strategy.roleLabel, "艾哈默德");
    assert.match(strategy.posture, /五回合/);
    assert.ok(
        strategy.notes.some((note) => /橙色数量分布/.test(note)),
        `expected Ahmed notes to mention the posterior chain, got ${strategy.notes.join(" | ")}`
    );
});

test("buildRoleStrategy reads role profiles from source-owned config", () => {
    const strategy = buildRoleStrategy(
        "custom_scout",
        createResult(),
        createState({
            r2_orange_avg: null,
            r2_purple_count: null,
            r3_green_count: null,
            r3_purple_avg: null
        }),
        {
            roles: {
                default_role_id: "custom_scout",
                profiles: {
                    custom_scout: {
                        id: "custom_scout",
                        label: "测试侦察",
                        archetype: "公开数据流",
                        preferredRounds: [1],
                        factors: { cold: 0.55, steady: 0.65, hot: 0.75 },
                        sourceCue: "公开小数信息按四舍五入处理，人物技能/道具按截断处理。"
                    }
                }
            }
        }
    );

    assert.equal(strategy.roleId, "custom_scout");
    assert.equal(strategy.roleLabel, "测试侦察");
    assert.equal(strategy.archetype, "公开数据流");
    assert.match(strategy.notes[0], /四舍五入/);
    assert.ok(strategy.caps.steady < 320000, `expected custom steady cap to use configured factors, got ${strategy.caps.steady}`);
});

test("default role config keeps the known character strategy roster available", () => {
    const strategies = ["ahmed", "ethan", "sophie", "raven", "aisha", "isabella", "wuqiling"]
        .map((roleId) => buildRoleStrategy(roleId, createResult(), createState(), defaultConfig));

    assert.deepEqual(
        strategies.map((strategy) => strategy.roleLabel),
        ["艾哈默德", "伊森", "索菲", "拉文", "艾莎", "伊莎贝拉", "吴起灵"]
    );
    assert.ok(strategies.every((strategy) => Number.isFinite(strategy.caps.steady)));
});

test("buildRoleStrategy updates Ahmed to the white-green first chain and storage refinement", () => {
    const strategy = buildRoleStrategy(
        "ahmed",
        createResult(),
        createState({
            r2_orange_avg: 1.66,
            r2_orange_count: 3,
            r2_white_green_cells: 12,
            r3_green_count: null,
            r3_white_green_avg: 2.25,
            r4_blue_avg: 1.8,
            r4_total_storage_cells: 40
        })
    );

    assert.equal(strategy.currentRound, 4);
    assert.match(strategy.posture, /绿白总格/);
    assert.ok(
        strategy.notes.some((note) => /绿白均格/.test(note)),
        `expected Ahmed notes to mention white-green average, got ${strategy.notes.join(" | ")}`
    );
    assert.ok(
        strategy.notes.some((note) => /总仓储空间/.test(note)),
        `expected Ahmed notes to mention storage refinement, got ${strategy.notes.join(" | ")}`
    );
});
