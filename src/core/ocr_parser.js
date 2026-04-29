function normalizeOcrText(text) {
    return String(text || "")
        .replace(/\r/g, "")
        .replace(/\u3000/g, " ")
        .replace(/[：]/g, ":");
}

function normalizeOcrNumberToken(token, { integer = false } = {}) {
    const normalizedText = normalizeOcrNumberText(token, { integer });
    if (normalizedText === null) return null;
    const value = integer ? parseInt(normalizedText, 10) : Number(normalizedText);
    return Number.isFinite(value) ? value : null;
}

function normalizeOcrNumberText(token, { integer = false } = {}) {
    if (token === null || token === undefined) return null;
    const normalized = String(token)
        .trim()
        .replace(/[Oo]/g, "0")
        .replace(/[Il|]/g, "1")
        .replace(/[，,\s]/g, "")
        .replace(/−/g, "-")
        .replace(/[。]/g, ".");
    if (!normalized) return null;
    const validPattern = integer ? /^-?\d+$/ : /^-?(?:\d+\.?\d*|\.\d+)$/;
    return validPattern.test(normalized) ? normalized : null;
}

function buildLabelRegex(labels, { integer = false } = {}) {
    const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const numberPattern = integer ? "[-−]?[0-9OoIl|，,\\s]+" : "[-−]?[0-9OoIl|，,。.\\s]+";
    return new RegExp(`(?:${labelPattern})[\\s\\S]{0,12}?(${numberPattern})`, "i");
}

function extractLabeledNumber(text, labels, options = {}) {
    const match = normalizeOcrText(text).match(buildLabelRegex(labels, options));
    if (!match) return null;
    return normalizeOcrNumberToken(match[1], options);
}

function extractLabeledNumberText(text, labels, options = {}) {
    const match = normalizeOcrText(text).match(buildLabelRegex(labels, options));
    if (!match) return null;
    return normalizeOcrNumberText(match[1], options);
}

function extractBattleTotalItems(text, activeOcrConfig) {
    const direct = extractBattleFieldValue(text, activeOcrConfig, "total_items", { integer: true });
    if (direct !== null) return direct;
    const quickRecycle = normalizeBattleSnapshotText(text, activeOcrConfig).match(/快捷回收[\s(（]*([0-9OoIl|，,\s]+)\s*件/i);
    if (!quickRecycle) return null;
    return normalizeOcrNumberToken(quickRecycle[1], { integer: true });
}

function compactObjectEntries(source) {
    return Object.fromEntries(
        Object.entries(source).filter(([, value]) => value !== null && value !== undefined && value !== "")
    );
}

const FALLBACK_OCR_CONFIG = {
    battle_text_replacements: {
        總件數: "总件数",
        藍色件數: "蓝色件数",
        橙均挌: "橙均格",
        綠白總格數: "绿白总格数",
        綠白均格: "绿白均格",
        總倉儲空間: "总仓储空间"
    },
    battle_field_aliases: {
        total_items: ["总件数", "总数量", "本场件数", "本场藏品"],
        known_b: ["场上蓝色件数", "蓝色件数", "蓝色数量", "蓝件"],
        avg_o: ["橙色平均格数", "橙色均格", "橙均格"],
        known_o: ["场上橙色件数", "橙色件数", "橙色数量", "场上橙色数量", "橙件"],
        known_p: ["场上紫色件数", "紫色件数", "紫色数量", "紫件"],
        wg_cells_total: ["绿白总格数", "绿白格数", "绿白总格", "白绿总格", "绿+白总格数", "绿+白总格", "白+绿总格数", "白+绿总格"],
        known_g: ["场上绿色件数", "绿色件数", "绿色数量", "绿件"],
        avg_wg: ["绿白平均格数", "绿白均格", "白绿平均格数", "白绿均格", "绿+白平均格数", "绿+白均格", "白+绿平均格数", "白+绿均格"],
        avg_p: ["紫色平均格数", "紫色均格", "紫均格"],
        avg_b: ["蓝色平均格数", "蓝色均格", "蓝均格"],
        total_storage_cells: ["总仓储空间", "仓储空间", "总仓储格数", "总仓储容量"],
        known_sum_wg: ["绿+白总和", "绿白总和", "白+绿总和", "绿+白总件数", "白+绿总件数", "绿白总件数", "白绿总件数"],
        known_w: ["场上白色件数", "白色件数", "白色数量", "白件"],
        system_avg_value_per_cell: ["占位每格的均价", "占位每格均价", "系统每格均价", "本场占位每格均价", "每格均价"],
        bid_price: ["预期入场水温", "bid", "出价", "竞拍价"]
    },
    settlement_item_replacements: {
        武噐: "武器",
        医疔: "医疗",
        数玛: "数码",
        數碼: "数码",
        傢具: "家具",
        礦物: "矿物"
    },
    settlement_item_quality_aliases: {
        w: ["白", "white"],
        g: ["绿", "green"],
        b: ["蓝", "blue"],
        p: ["紫", "purple"],
        o: ["橙", "金", "orange"],
        r: ["红", "red"]
    },
    settlement_item_category_aliases: {
        furniture: ["家具", "furniture"],
        medical: ["医疗", "medical"],
        fashion: ["时尚", "fashion"],
        weapon: ["武器", "weapon"],
        mineral: ["矿物", "矿石", "矿", "mineral"],
        antique: ["文玩", "古董", "antique"],
        digital: ["数码", "digital"],
        energy: ["能源", "energy"],
        food: ["饮食", "食物", "食品", "food"],
        book: ["书籍", "书本", "书", "book"]
    }
};

let runtimeOcrConfigOverride = null;

function cloneJsonValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeAliasDictionary(source) {
    const normalized = {};
    if (!source || typeof source !== "object") return normalized;
    Object.entries(source).forEach(([key, aliases]) => {
        if (!Array.isArray(aliases)) return;
        const deduped = Array.from(new Set(aliases.map((alias) => String(alias || "").trim()).filter(Boolean)));
        if (deduped.length) normalized[key] = deduped;
    });
    return normalized;
}

function mergeAliasDictionary(base, override) {
    const merged = cloneJsonValue(base || {});
    Object.entries(normalizeAliasDictionary(override)).forEach(([key, aliases]) => {
        const previous = Array.isArray(merged[key]) ? merged[key] : [];
        merged[key] = Array.from(new Set(previous.concat(aliases)));
    });
    return merged;
}

function normalizeReplacementDictionary(source) {
    const normalized = {};
    if (!source || typeof source !== "object") return normalized;
    Object.entries(source).forEach(([from, to]) => {
        const normalizedFrom = String(from || "").trim();
        const normalizedTo = String(to || "").trim();
        if (!normalizedFrom || !normalizedTo) return;
        normalized[normalizedFrom] = normalizedTo;
    });
    return normalized;
}

function getBundledOcrConfig() {
    if (typeof AUCTION_KING_DEFAULT_CONFIG !== "undefined" && AUCTION_KING_DEFAULT_CONFIG && AUCTION_KING_DEFAULT_CONFIG.ocr) {
        return AUCTION_KING_DEFAULT_CONFIG.ocr;
    }
    if (typeof window !== "undefined" && window.AUCTION_KING_DEFAULT_CONFIG && window.AUCTION_KING_DEFAULT_CONFIG.ocr) {
        return window.AUCTION_KING_DEFAULT_CONFIG.ocr;
    }
    if (typeof module !== "undefined" && typeof require === "function") {
        try {
            const bundledConfig = require("./default_config_bundle.js");
            if (bundledConfig && bundledConfig.ocr) return bundledConfig.ocr;
        } catch (_error) {
            return null;
        }
    }
    return null;
}

function resolveActiveOcrConfig(overrideConfig = null) {
    const bundledConfig = getBundledOcrConfig();
    const merged = {
        battle_text_replacements: {
            ...normalizeReplacementDictionary(FALLBACK_OCR_CONFIG.battle_text_replacements),
            ...normalizeReplacementDictionary(bundledConfig && bundledConfig.battle_text_replacements),
            ...normalizeReplacementDictionary(runtimeOcrConfigOverride && runtimeOcrConfigOverride.battle_text_replacements),
            ...normalizeReplacementDictionary(overrideConfig && overrideConfig.battle_text_replacements)
        },
        battle_field_aliases: mergeAliasDictionary(
            mergeAliasDictionary(
                FALLBACK_OCR_CONFIG.battle_field_aliases,
                bundledConfig && bundledConfig.battle_field_aliases
            ),
            mergeAliasDictionary(
                runtimeOcrConfigOverride && runtimeOcrConfigOverride.battle_field_aliases,
                overrideConfig && overrideConfig.battle_field_aliases
            )
        ),
        settlement_item_replacements: {
            ...normalizeReplacementDictionary(FALLBACK_OCR_CONFIG.settlement_item_replacements),
            ...normalizeReplacementDictionary(bundledConfig && bundledConfig.settlement_item_replacements),
            ...normalizeReplacementDictionary(runtimeOcrConfigOverride && runtimeOcrConfigOverride.settlement_item_replacements),
            ...normalizeReplacementDictionary(overrideConfig && overrideConfig.settlement_item_replacements)
        },
        settlement_item_quality_aliases: mergeAliasDictionary(
            mergeAliasDictionary(
                FALLBACK_OCR_CONFIG.settlement_item_quality_aliases,
                bundledConfig && bundledConfig.settlement_item_quality_aliases
            ),
            mergeAliasDictionary(
                runtimeOcrConfigOverride && runtimeOcrConfigOverride.settlement_item_quality_aliases,
                overrideConfig && overrideConfig.settlement_item_quality_aliases
            )
        ),
        settlement_item_category_aliases: mergeAliasDictionary(
            mergeAliasDictionary(
                FALLBACK_OCR_CONFIG.settlement_item_category_aliases,
                bundledConfig && bundledConfig.settlement_item_category_aliases
            ),
            mergeAliasDictionary(
                runtimeOcrConfigOverride && runtimeOcrConfigOverride.settlement_item_category_aliases,
                overrideConfig && overrideConfig.settlement_item_category_aliases
            )
        )
    };
    return merged;
}

function setAuctionKingOcrConfig(ocrConfig) {
    runtimeOcrConfigOverride = ocrConfig ? cloneJsonValue(ocrConfig) : null;
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasMatchesLine(line, alias) {
    if (!alias) return false;
    const aliasText = String(alias).trim();
    if (!aliasText) return false;
    if (/^[A-Za-z0-9_ -]+$/.test(aliasText)) {
        return new RegExp(`\\b${escapeRegex(aliasText)}\\b`, "i").test(line);
    }
    return line.includes(aliasText);
}

function detectMappedAlias(line, aliasDictionary) {
    const entries = Object.entries(aliasDictionary || {});
    for (let index = 0; index < entries.length; index += 1) {
        const [key, aliases] = entries[index];
        if ((aliases || []).some((alias) => aliasMatchesLine(line, alias))) {
            return key;
        }
    }
    return null;
}

function normalizeSettlementItemLine(line, ocrConfig = null) {
    const activeConfig = resolveActiveOcrConfig(ocrConfig);
    let normalized = normalizeOcrText(line);
    Object.entries(activeConfig.settlement_item_replacements || {}).forEach(([from, to]) => {
        normalized = normalized.replaceAll(from, to);
    });
    return normalized;
}

function normalizeBattleSnapshotText(text, ocrConfig = null) {
    const activeConfig = resolveActiveOcrConfig(ocrConfig);
    let normalized = normalizeOcrText(text);
    Object.entries(activeConfig.battle_text_replacements || {}).forEach(([from, to]) => {
        normalized = normalized.replaceAll(from, to);
    });
    return normalized;
}

function extractBattleFieldValue(text, activeOcrConfig, fieldKey, options = {}) {
    const labels = activeOcrConfig && activeOcrConfig.battle_field_aliases
        ? activeOcrConfig.battle_field_aliases[fieldKey]
        : null;
    if (!Array.isArray(labels) || !labels.length) return null;
    if (options.rawText === true) return extractLabeledNumberText(text, labels, options);
    return extractLabeledNumber(text, labels, options);
}

function extractSystemAverageValueTypeCount(text) {
    const normalized = normalizeBattleSnapshotText(text);
    const match = normalized.match(/有\s*([0-9OoIl|，,\s]+)\s*种藏品类型[\s\S]{0,16}?(?:占位每格|每格)/i);
    if (!match) return null;
    return normalizeOcrNumberToken(match[1], { integer: true });
}

function extractSettlementItemCells(line) {
    const normalized = normalizeSettlementItemLine(line);
    const direct = normalized.match(/(?:格数|占格)[:\s]*([0-9OoIl|，,\s]+)/i);
    if (direct) return normalizeOcrNumberToken(direct[1], { integer: true });
    const inlineMatches = Array.from(normalized.matchAll(/([0-9OoIl|，,]+)\s*格/gi));
    if (inlineMatches.length) {
        return normalizeOcrNumberToken(inlineMatches[inlineMatches.length - 1][1], { integer: true });
    }
    return null;
}

function extractScaledNumberToken(token, unit = "") {
    if (token === null || token === undefined) return null;
    const normalized = String(token)
        .trim()
        .replace(/[Oo]/g, "0")
        .replace(/[Il|]/g, "1")
        .replace(/[，,]/g, "")
        .replace(/−/g, "-")
        .replace(/[。]/g, ".");
    if (!normalized) return null;
    const baseValue = Number(normalized);
    if (!Number.isFinite(baseValue)) return null;
    const normalizedUnit = String(unit || "").trim().toLowerCase();
    if (normalizedUnit === "w" || normalizedUnit === "万") {
        return Math.round(baseValue * 10000);
    }
    return baseValue;
}

function extractSettlementItemValue(line) {
    const normalized = normalizeSettlementItemLine(line);
    const direct = normalized.match(/(?:价值|价格|估值|单价)[:\s]*([0-9OoIl|][0-9OoIl|，,。.]*)(\s*[wW万]?)/i);
    if (direct) return extractScaledNumberToken(direct[1], direct[2]);

    const matches = Array.from(normalized.matchAll(/([0-9OoIl|][0-9OoIl|，,。.]*)(\s*[wW万]?)/g));
    const candidates = matches
        .map((match) => {
            const token = match[1];
            const unit = match[2];
            const after = normalized.slice(match.index + match[0].length).trimStart();
            const before = normalized.slice(0, match.index).trimEnd();
            const previousChar = before.slice(-1);
            if (after.startsWith("格")) return null;
            if (/[x×*]/i.test(previousChar)) return null;
            return extractScaledNumberToken(token, unit);
        })
        .filter((value) => Number.isFinite(value));
    if (!candidates.length) return null;
    return candidates[candidates.length - 1];
}

function parseBattleSnapshotText(text, options = {}) {
    const activeOcrConfig = resolveActiveOcrConfig(options.ocrConfig || null);
    const rawText = normalizeBattleSnapshotText(text, activeOcrConfig);
    const fields = compactObjectEntries({
        total_items: extractBattleTotalItems(rawText, activeOcrConfig),
        known_b: extractBattleFieldValue(rawText, activeOcrConfig, "known_b", { integer: true }),
        avg_o: extractBattleFieldValue(rawText, activeOcrConfig, "avg_o", { rawText: true }),
        known_o: extractBattleFieldValue(rawText, activeOcrConfig, "known_o", { integer: true }),
        known_p: extractBattleFieldValue(rawText, activeOcrConfig, "known_p", { integer: true }),
        wg_cells_total: extractBattleFieldValue(rawText, activeOcrConfig, "wg_cells_total", { integer: true }),
        known_g: extractBattleFieldValue(rawText, activeOcrConfig, "known_g", { integer: true }),
        avg_wg: extractBattleFieldValue(rawText, activeOcrConfig, "avg_wg", { rawText: true }),
        avg_p: extractBattleFieldValue(rawText, activeOcrConfig, "avg_p", { rawText: true }),
        avg_b: extractBattleFieldValue(rawText, activeOcrConfig, "avg_b", { rawText: true }),
        total_storage_cells: extractBattleFieldValue(rawText, activeOcrConfig, "total_storage_cells", { integer: true }),
        known_sum_wg: extractBattleFieldValue(rawText, activeOcrConfig, "known_sum_wg", { integer: true }),
        known_w: extractBattleFieldValue(rawText, activeOcrConfig, "known_w", { integer: true }),
        system_avg_value_type_count: extractSystemAverageValueTypeCount(rawText),
        system_avg_value_per_cell: extractBattleFieldValue(rawText, activeOcrConfig, "system_avg_value_per_cell"),
        bid_price: extractBattleFieldValue(rawText, activeOcrConfig, "bid_price")
    });
    const warnings = [];
    if (!fields.total_items) warnings.push("未稳定识别出总件数，建议手动核对。");
    if (Object.keys(fields).length < 3) warnings.push("当前更像是原始游戏截图而不是带文字面板的复盘图，OCR 草稿可能较弱。");
    return {
        rawText,
        fields,
        matchedFieldCount: Object.keys(fields).length,
        warnings
    };
}

function parseSettlementText(text) {
    const rawText = normalizeOcrText(text);
    const draft = compactObjectEntries({
        bid_price: extractLabeledNumber(rawText, ["最终竞拍价", "最终竞拍价格", "竞拍价", "最终出价"]),
        loot_value: extractLabeledNumber(rawText, ["战利品价格", "战利品总价", "藏品价格", "战利品价", "战利品总价值"]),
        profit: extractLabeledNumber(rawText, ["利润", "盈亏", "收益"])
    });
    const warnings = [];
    if (!draft.bid_price) warnings.push("未稳定识别出最终竞拍价。");
    if (!draft.loot_value) warnings.push("未稳定识别出战利品价格。");
    if (Object.keys(draft).length === 0) warnings.push("结算图 OCR 未命中核心字段，建议手动补录。");
    return {
        rawText,
        draft,
        matchedFieldCount: Object.keys(draft).length,
        warnings
    };
}

function parseSettlementItemCandidates(text, options = {}) {
    const rawText = normalizeOcrText(text);
    const items = [];
    const warnings = [];
    const activeOcrConfig = resolveActiveOcrConfig(options.ocrConfig || null);

    rawText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
            const normalizedLine = normalizeSettlementItemLine(line, activeOcrConfig);
            const quality = detectMappedAlias(normalizedLine, activeOcrConfig.settlement_item_quality_aliases);
            const category = detectMappedAlias(normalizedLine, activeOcrConfig.settlement_item_category_aliases);
            const cells = extractSettlementItemCells(normalizedLine);
            const value = extractSettlementItemValue(normalizedLine);

            if ((quality || category) && Number.isFinite(cells) && Number.isFinite(value) && cells > 0 && value >= 0) {
                items.push(compactObjectEntries({ quality, category, cells, value }));
            }
        });

    if (!items.length) warnings.push("未从 OCR 原文中稳定提取到单件候选，建议手动补录或直接粘贴结构化文本。");

    return {
        rawText,
        items,
        matchedItemCount: items.length,
        warnings
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        normalizeOcrText,
        normalizeOcrNumberToken,
        parseBattleSnapshotText,
        parseSettlementText,
        parseSettlementItemCandidates,
        setAuctionKingOcrConfig,
        resolveActiveOcrConfig
    };
}

if (typeof window !== "undefined") {
    window.normalizeOcrText = normalizeOcrText;
    window.normalizeOcrNumberToken = normalizeOcrNumberToken;
    window.parseBattleSnapshotText = parseBattleSnapshotText;
    window.parseSettlementText = parseSettlementText;
    window.parseSettlementItemCandidates = parseSettlementItemCandidates;
    window.setAuctionKingOcrConfig = setAuctionKingOcrConfig;
}
