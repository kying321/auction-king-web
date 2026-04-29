const DEFAULT_ROLE_CONFIG = {
    default_role_id: "ahmed",
    profiles: {
        ahmed: {
        id: "ahmed",
        label: "艾哈默德",
        archetype: "五回合情报链精算流",
        preferredRounds: [2, 3, 4, 5],
        factors: { cold: 0.9, steady: 1.0, hot: 1.06 },
        sourceCue: "按当前项目约定，艾哈默德主链为：R1总数+蓝数，R2看橙均格并记录绿白总格，紫件/橙件属于高精度补充，R3看绿白均格与紫均格，R4看蓝均格并可选总仓储空间，R5再用白绿拆分补尾。"
        },
        ethan: {
        id: "ethan",
        label: "伊森",
        archetype: "轮廓布局流",
        preferredRounds: [3, 4],
        factors: { cold: 0.86, steady: 0.94, hot: 1.0 },
        sourceCue: "官网称其“构建空间矩阵，能够瞬间计算出布局轮廓”；B站已有“伊森沉船公式化打法”实战视频。"
        },
        sophie: {
        id: "sophie",
        label: "索菲",
        archetype: "抽样均值流",
        preferredRounds: [3, 4],
        factors: { cold: 0.9, steady: 1.0, hot: 1.08 },
        sourceCue: "官网强调其“精通各类珍品”；玩家实战反馈里，索菲常用“随机五个/四均”在第3-4轮秒仓。"
        },
        raven: {
        id: "raven",
        label: "拉文",
        archetype: "终局定锤流",
        preferredRounds: [5],
        factors: { cold: 0.84, steady: 0.94, hot: 1.02 },
        sourceCue: "官网写法是“静观全场博弈，于终局时刻一锤定音”；社区反馈也集中指出其前中期容易被做局。"
        },
        aisha: {
        id: "aisha",
        label: "艾莎",
        archetype: "层级侦察流",
        preferredRounds: [1, 2, 3],
        factors: { cold: 0.82, steady: 0.9, hot: 0.97 },
        sourceCue: "官网写其能发现低价值目标；开发者采访补充她更像“看仓深、看是否存在紫色以上”的层级侦察。"
        },
        isabella: {
        id: "isabella",
        label: "伊莎贝拉",
        archetype: "见红捡漏流",
        preferredRounds: [1, 2, 3],
        factors: { cold: 0.88, steady: 0.97, hot: 1.08 },
        sourceCue: "官网主打“稀缺性孤品”；社区帖提到她一度能“开局见红，还能看到是什么红”。"
        },
        wuqiling: {
        id: "wuqiling",
        label: "吴起灵",
        archetype: "专精图谱流",
        preferredRounds: [2, 3, 4],
        factors: { cold: 0.86, steady: 0.95, hot: 1.04 },
        sourceCue: "官网描述为“层层揭示文玩古董的信息”；采访点名吴起灵高价出手时容易把其他人拖进杀猪盘。"
        }
    }
};

const ROLE_PROFILES = DEFAULT_ROLE_CONFIG.profiles;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function safeNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

function isPlainObject(value) {
    return !!(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeRoleProfile(rawProfile, fallbackProfile = {}) {
    const raw = isPlainObject(rawProfile) ? rawProfile : {};
    const fallbackFactors = isPlainObject(fallbackProfile.factors) ? fallbackProfile.factors : {};
    const rawFactors = isPlainObject(raw.factors) ? raw.factors : {};
    const id = String(raw.id || fallbackProfile.id || "ahmed");
    return {
        id,
        label: String(raw.label || fallbackProfile.label || id),
        archetype: String(raw.archetype || fallbackProfile.archetype || "通用竞拍流"),
        preferredRounds: Array.isArray(raw.preferredRounds)
            ? raw.preferredRounds.filter((round) => Number.isFinite(round))
            : (Array.isArray(fallbackProfile.preferredRounds) ? [...fallbackProfile.preferredRounds] : []),
        factors: {
            cold: safeNumber(rawFactors.cold, safeNumber(fallbackFactors.cold, 0.88)),
            steady: safeNumber(rawFactors.steady, safeNumber(fallbackFactors.steady, 0.96)),
            hot: safeNumber(rawFactors.hot, safeNumber(fallbackFactors.hot, 1.04))
        },
        sourceCue: String(raw.sourceCue || fallbackProfile.sourceCue || "配置未提供角色来源说明。")
    };
}

function normalizeRoleConfig(configOrRoles = null) {
    const root = isPlainObject(configOrRoles) && isPlainObject(configOrRoles.roles)
        ? configOrRoles.roles
        : configOrRoles;
    const source = isPlainObject(root) ? root : {};
    const profiles = {};
    Object.entries(ROLE_PROFILES).forEach(([roleId, profile]) => {
        profiles[roleId] = normalizeRoleProfile(profile);
    });
    if (isPlainObject(source.profiles)) {
        Object.entries(source.profiles).forEach(([roleId, profile]) => {
            profiles[roleId] = normalizeRoleProfile(
                { ...(isPlainObject(profile) ? profile : {}), id: (profile && profile.id) || roleId },
                profiles[roleId]
            );
        });
    }
    const defaultRoleId = String(source.default_role_id || source.defaultRoleId || DEFAULT_ROLE_CONFIG.default_role_id);
    return { defaultRoleId, profiles };
}

function listRoleProfiles(configOrRoles = null) {
    const roleConfig = normalizeRoleConfig(configOrRoles);
    return Object.values(roleConfig.profiles);
}

function resolveRoleProfile(roleId, configOrRoles = null) {
    const roleConfig = normalizeRoleConfig(configOrRoles);
    const requestedRoleId = roleId && roleConfig.profiles[roleId] ? roleId : roleConfig.defaultRoleId;
    return roleConfig.profiles[requestedRoleId] || roleConfig.profiles[DEFAULT_ROLE_CONFIG.default_role_id] || ROLE_PROFILES.ahmed;
}

function pickAnchor(value, fallback) {
    return value !== null && value !== undefined && Number.isFinite(value) ? value : fallback;
}

function topProbability(list) {
    if (!list || list.length === 0) return 0;
    return safeNumber(list[0].prob);
}

function determineCurrentRound(state) {
    if (!state) return 0;
    if (state.r5_white_green_total !== null && state.r5_white_green_total !== undefined) return 5;
    if (state.r5_white_count !== null && state.r5_white_count !== undefined) return 5;
    if (state.r4_blue_avg !== null && state.r4_blue_avg !== undefined) return 4;
    if (state.r4_total_storage_cells !== null && state.r4_total_storage_cells !== undefined) return 4;
    if (
        (state.r3_white_green_avg !== null && state.r3_white_green_avg !== undefined) ||
        (state.r3_green_count !== null && state.r3_green_count !== undefined) ||
        (state.r3_purple_avg !== null && state.r3_purple_avg !== undefined)
    ) return 3;
    if (
        (state.r2_orange_count !== null && state.r2_orange_count !== undefined) ||
        (state.r2_white_green_cells !== null && state.r2_white_green_cells !== undefined) ||
        (state.r2_orange_avg !== null && state.r2_orange_avg !== undefined) ||
        (state.r2_purple_count !== null && state.r2_purple_count !== undefined)
    ) return 2;
    if (
        (state.r1_total_items !== null && state.r1_total_items !== undefined) ||
        (state.r1_blue_count !== null && state.r1_blue_count !== undefined)
    ) return 1;
    return 0;
}

function computeMeanRangeWidth(summary) {
    if (!summary || !summary.cell_low || !summary.cell_high) return 6;
    const widths = [];
    Object.keys(summary.cell_low).forEach((quality) => {
        const lo = safeNumber(summary.cell_low[quality], NaN);
        const hi = safeNumber(summary.cell_high[quality], NaN);
        if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo) {
            widths.push(hi - lo);
        }
    });
    if (widths.length === 0) return 6;
    return widths.reduce((acc, width) => acc + width, 0) / widths.length;
}

function computeSignalScore(roleId, result, currentRound) {
    const summary = result && result.summary ? result.summary : {};
    const orangeTopProb = topProbability(summary.orange_count_probs);
    const redTopProb = topProbability(summary.red_count_probs);
    const meanRangeWidth = computeMeanRangeWidth(summary);
    const layoutClarity = clamp(1 - meanRangeWidth / 6, 0, 1);
    const tierSignal = clamp(Math.max(orangeTopProb, redTopProb), 0, 1);
    const midRoundBonus = currentRound >= 3 && currentRound <= 4 ? 0.12 : 0;
    const lateRoundBonus = currentRound === 5 ? 0.16 : 0;

    switch (roleId) {
        case "ahmed":
            return clamp(tierSignal * 0.35 + layoutClarity * 0.2 + currentRound * 0.11 + 0.08, 0, 1);
        case "ethan":
            return clamp(layoutClarity * 0.7 + (currentRound >= 3 ? 0.18 : 0), 0, 1);
        case "sophie":
            return clamp(tierSignal * 0.45 + layoutClarity * 0.2 + midRoundBonus + 0.12, 0, 1);
        case "raven":
            return clamp(tierSignal * 0.35 + lateRoundBonus - (currentRound < 5 ? 0.15 : 0) + 0.2, 0, 1);
        case "aisha":
            return clamp(tierSignal * 0.4 + currentRound * 0.08 + 0.18, 0, 1);
        case "isabella":
            return clamp(redTopProb * 0.75 + orangeTopProb * 0.15 + 0.12, 0, 1);
        case "wuqiling":
            return clamp(tierSignal * 0.4 + layoutClarity * 0.15 + (currentRound >= 2 ? 0.2 : 0.05), 0, 1);
        default:
            return clamp(tierSignal * 0.4 + layoutClarity * 0.2 + currentRound * 0.05, 0, 1);
    }
}

function computeRoundFit(profile, currentRound) {
    const preferred = profile.preferredRounds || [];
    if (preferred.includes(currentRound)) return 0.06;
    if (preferred.length === 0) return 0;
    const minPreferred = Math.min(...preferred);
    const maxPreferred = Math.max(...preferred);
    if (currentRound < minPreferred) return -0.08;
    if (currentRound > maxPreferred) return -0.04;
    return 0;
}

function buildCaps(profile, result, signalScore, currentRound) {
    const valuation = result && result.valuation ? result.valuation : {};
    const meanValue = pickAnchor(valuation.mean_value, 0);
    const anchors = {
        cold: pickAnchor(valuation.q25, meanValue * 0.76),
        steady: pickAnchor(valuation.q50, meanValue * 0.92),
        hot: pickAnchor(valuation.q75, meanValue * 1.05)
    };
    const roundFit = computeRoundFit(profile, currentRound);
    const signalBonus = (signalScore - 0.5) * 0.12;

    const coldFactor = clamp(profile.factors.cold + roundFit * 0.5 + signalBonus * 0.6, 0.72, 1.02);
    const steadyFactor = clamp(profile.factors.steady + roundFit + signalBonus, 0.78, 1.14);
    const hotFactor = clamp(profile.factors.hot + roundFit * 1.2 + signalBonus * 1.4, 0.86, 1.22);

    return {
        cold: Math.round(anchors.cold * coldFactor),
        steady: Math.round(anchors.steady * steadyFactor),
        hot: Math.round(anchors.hot * hotFactor)
    };
}

function buildPosture(profile, currentRound, signalScore, result) {
    const summary = result && result.summary ? result.summary : {};
    const redTopProb = topProbability(summary.red_count_probs);

    switch (profile.id) {
        case "ahmed":
            return currentRound < 4
                ? "艾哈默德仍是五回合情报链精算视角，当前应先用绿白总格与绿白均格锁白绿件数，再叠加橙均格、紫件与蓝件约束去反推红色数量。"
                : "艾哈默德五回合链路已进入后半段，绿白总格与绿白均格已成型，可再用蓝均格和总仓储空间把红格与红件模板继续压实。";
        case "ethan":
            return currentRound >= 3
                ? "中盘起看轮廓收口，版型越清晰越适合按布局定价。"
                : "前两轮别把伊森当透视，轮廓信息未成形时先少跟价。";
        case "sophie":
            return currentRound >= 3 && currentRound <= 4 && signalScore >= 0.55
                ? "第3-4轮前压，先把抽样/四均换成单格锚点，再抢跑定价。"
                : "索菲更适合样本转均值，不要在前两轮空样本硬冲。";
        case "raven":
            return currentRound < 5
                ? "信息未到终局，建议拖到第5轮再定锤，提前跟价容易被做局。"
                : "终局已开，且后验开始收束，可以执行拉文的一锤定音。";
        case "aisha":
            return "先用层级信息判断仓深和紫色以上存在性，再决定是否继续跟价。";
        case "isabella":
            return redTopProb >= 0.35
                ? "当前见红信号偏强，伊莎贝拉可以走捡漏快进场，但只对稀缺件放大热档。"
                : "没有明确见红前，别把伊莎贝拉当全图通杀号。";
        case "wuqiling":
            return "吴起灵适合专精图谱图，一旦高价出手，要防别人把你当抬价信号。";
        default:
            return "按当前后验分布收缩速度调节出价，信息未闭合前先保守。";
    }
}

function buildNotes(profile, currentRound, signalScore, result) {
    const summary = result && result.summary ? result.summary : {};
    const orangeTopProb = topProbability(summary.orange_count_probs);
    const redTopProb = topProbability(summary.red_count_probs);
    const notes = [profile.sourceCue];

    switch (profile.id) {
        case "ahmed":
            notes.push("主链路优先用绿白总格与绿白均格锁白绿件数，再结合总件数与蓝件数去反推红色数量；绿色件数现在只作为旧链路补充。");
            notes.push("橙均格负责压缩高价值段与橙色数量分布，紫件、橙件与紫均格都属于预算充足时的加精度锚点，不再是唯一主线。");
            notes.push("红色数量分布收缩后，再把剩余格子预算压到红格；如果总仓储空间已知，就能和蓝均格一起继续压缩红区模板。");
            if (currentRound >= 4) notes.push("当前已经拿到蓝均格或总仓储空间，适合把后验分布直接换算成物品格均值估值。");
            break;
        case "ethan":
            notes.push("适合把“格子区间变窄”当作加价依据，而不是只看均值。");
            if (signalScore >= 0.55) notes.push("当前布局清晰度较高，轮廓型角色价值被放大。");
            break;
        case "sophie":
            notes.push("社区经验是“随机五个/四均”后，在第3-4轮把样本均值折算成单格价格。");
            if (orangeTopProb >= 0.4 || redTopProb >= 0.3) notes.push("橙/红后验集中度已不低，索菲适合提前秒仓。");
            break;
        case "raven":
            notes.push("TapTap 实战反馈明确提到：拉文前中期常因拖到终局而被集体做局。");
            if (currentRound < 5) notes.push("当前仍属于易被做局阶段，热档报价应明显打折。");
            break;
        case "aisha":
            notes.push("采访里开发者明确说艾莎更像“看仓深、看是否有紫色以上”，而不是直接报总价。");
            notes.push("所以算法上应把她当筛仓角色，而非终局定价角色。");
            break;
        case "isabella":
            notes.push("社区帖提到伊莎贝拉一度能“开局见红，还能看到是什么红”，适合稀缺件捡漏。");
            if (redTopProb >= 0.35) notes.push("当前后验见红概率偏高，可把“见红”作为热档放大的前置条件。");
            break;
        case "wuqiling":
            notes.push("开发者采访把吴起灵与伊莎贝拉并列为会制造高价预期差的角色。");
            notes.push("如果不是专精图或藏品类型已对上，跟随吴起灵高价容易被杀猪盘。");
            break;
        default:
            notes.push("暂无额外角色笔记。");
            break;
    }

    return notes;
}

function buildRoleStrategy(roleId, result, state, configOrRoles = null) {
    const profile = resolveRoleProfile(roleId, configOrRoles);
    const currentRound = determineCurrentRound(state);
    const signalScore = computeSignalScore(profile.id, result, currentRound);
    const caps = buildCaps(profile, result, signalScore, currentRound);

    return {
        roleId: profile.id,
        roleLabel: profile.label,
        archetype: profile.archetype,
        currentRound,
        signalScore: Number(signalScore.toFixed(2)),
        posture: buildPosture(profile, currentRound, signalScore, result),
        notes: buildNotes(profile, currentRound, signalScore, result),
        caps
    };
}

const exported = {
    DEFAULT_ROLE_CONFIG,
    ROLE_PROFILES,
    normalizeRoleConfig,
    listRoleProfiles,
    resolveRoleProfile,
    determineCurrentRound,
    buildRoleStrategy
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
}

if (typeof window !== "undefined") {
    window.AK_ROLE_STRATEGY_RUNTIME = exported;
    window.ROLE_PROFILES = ROLE_PROFILES;
    window.listRoleProfiles = listRoleProfiles;
    window.determineCurrentRound = determineCurrentRound;
    window.buildRoleStrategy = buildRoleStrategy;
}
