const path = require("node:path");
const {
    normalizeManualCatalogBatch,
    loadManualCatalogBatchesFromDirectory
} = require("./manual_item_catalog.js");

const QUALITY_ALIASES = new Map([
    ["w", "w"], ["white", "w"], ["白", "w"], ["白色", "w"], ["灰", "w"], ["灰色", "w"],
    ["g", "g"], ["green", "g"], ["绿", "g"], ["绿色", "g"],
    ["b", "b"], ["blue", "b"], ["蓝", "b"], ["蓝色", "b"],
    ["p", "p"], ["purple", "p"], ["violet", "p"], ["紫", "p"], ["紫色", "p"],
    ["o", "o"], ["orange", "o"], ["橙", "o"], ["橙色", "o"], ["金", "o"], ["金色", "o"],
    ["r", "r"], ["red", "r"], ["红", "r"], ["红色", "r"]
]);

const DEFAULT_MATCH_OPTIONS = {
    acceptThreshold: 0.86,
    minNameScore: 0.78,
    minScoreGap: 0.04,
    topN: 5,
    nameWeight: 0.75,
    qualityWeight: 0.25,
    requireQualityMatch: true
};

const TRAILING_CJK_ORDINALS = {
    0: "零",
    1: "一",
    2: "二",
    3: "三",
    4: "四",
    5: "五",
    6: "六",
    7: "七",
    8: "八",
    9: "九"
};

function round(value, digits = 4) {
    const factor = 10 ** digits;
    return Math.round(Number(value || 0) * factor) / factor;
}

function normalizeQualityCode(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value)
        .normalize("NFKC")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
    return QUALITY_ALIASES.get(normalized) || null;
}

function normalizeCatalogMatchName(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .normalize("NFKC")
        .trim()
        .toLowerCase()
        .replace(/([\u4e00-\u9fff])([0-9])$/g, (_, prefix, digit) => `${prefix}${TRAILING_CJK_ORDINALS[digit] || digit}`)
        .replace(/[【】《》〈〉「」『』（）()[\]{}<>.,，。:：;；'’"“”`·_\-—~～!！?？/\\|+*=#@￥$%^&\s]/g, "")
        .replace(/[^\p{Script=Han}a-z0-9]/gu, "");
}

function stringChars(value) {
    return Array.from(value || "");
}

function levenshteinDistance(left, right) {
    const a = stringChars(left);
    const b = stringChars(right);
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row += 1) {
        const current = [row];
        for (let col = 1; col <= b.length; col += 1) {
            const substitutionCost = a[row - 1] === b[col - 1] ? 0 : 1;
            current[col] = Math.min(
                current[col - 1] + 1,
                previous[col] + 1,
                previous[col - 1] + substitutionCost
            );
        }
        previous = current;
    }
    return previous[b.length];
}

function editSimilarity(left, right) {
    if (!left && !right) return 1;
    const maxLength = Math.max(stringChars(left).length, stringChars(right).length);
    if (!maxLength) return 0;
    return Math.max(0, 1 - (levenshteinDistance(left, right) / maxLength));
}

function makeNgrams(value, size = 2) {
    const chars = stringChars(value);
    if (chars.length <= size) return chars;
    const grams = [];
    for (let index = 0; index <= chars.length - size; index += 1) {
        grams.push(chars.slice(index, index + size).join(""));
    }
    return grams;
}

function diceSimilarity(left, right) {
    const leftGrams = makeNgrams(left);
    const rightGrams = makeNgrams(right);
    if (!leftGrams.length && !rightGrams.length) return 1;
    if (!leftGrams.length || !rightGrams.length) return 0;
    const remaining = new Map();
    rightGrams.forEach((gram) => remaining.set(gram, (remaining.get(gram) || 0) + 1));
    let overlap = 0;
    leftGrams.forEach((gram) => {
        const count = remaining.get(gram) || 0;
        if (count <= 0) return;
        overlap += 1;
        remaining.set(gram, count - 1);
    });
    return (2 * overlap) / (leftGrams.length + rightGrams.length);
}

function containmentSimilarity(left, right) {
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (!left.includes(right) && !right.includes(left)) return 0;
    const leftLength = stringChars(left).length;
    const rightLength = stringChars(right).length;
    return Math.min(leftLength, rightLength) / Math.max(leftLength, rightLength);
}

function scoreNameSimilarity(candidateName, catalogName) {
    const candidate = normalizeCatalogMatchName(candidateName);
    const catalog = normalizeCatalogMatchName(catalogName);
    if (!candidate || !catalog) return 0;
    return round(Math.max(
        editSimilarity(candidate, catalog),
        diceSimilarity(candidate, catalog),
        containmentSimilarity(candidate, catalog)
    ), 6);
}

function countCjkCharacters(value = "") {
    const matches = String(value).match(/\p{Script=Han}/gu);
    return matches ? matches.length : 0;
}

function candidateLooksLowSignal(input, best) {
    if (!input.normalized_name) return false;
    if (best && best.name_score >= 0.95) return false;
    const chars = stringChars(input.normalized_name);
    if (countCjkCharacters(input.normalized_name) > 0) return false;
    return chars.length < 8 || /^[a-z0-9]+$/i.test(input.normalized_name);
}

function normalizeIndexItem(batch, item, itemIndex) {
    const quality = normalizeQualityCode(batch.quality);
    const name = item && item.name ? String(item.name).trim() : "";
    const normalizedName = normalizeCatalogMatchName(name);
    if (!quality || !normalizedName) return null;
    return {
        id: `${quality}-${String(itemIndex + 1).padStart(4, "0")}`,
        quality,
        batch_id: batch.batch_id || null,
        item_index: itemIndex,
        name,
        normalized_name: normalizedName,
        value: Number.isFinite(Number(item.value)) ? Number(item.value) : null,
        cells: Number.isFinite(Number(item.cells)) && Number(item.cells) > 0 ? Number(item.cells) : null,
        name_confidence: item.name_confidence || null
    };
}

function buildCatalogItemIndex(batches = []) {
    const items = [];
    batches
        .map((batch) => normalizeManualCatalogBatch(batch))
        .forEach((batch) => {
            batch.items.forEach((item, itemIndex) => {
                const indexed = normalizeIndexItem(batch, item, itemIndex);
                if (indexed) items.push(indexed);
            });
        });
    return {
        schema_version: "ak_catalog_item_match_index_v1",
        item_count: items.length,
        quality_counts: items.reduce((counts, item) => {
            counts[item.quality] = (counts[item.quality] || 0) + 1;
            return counts;
        }, {}),
        items
    };
}

function loadCatalogItemIndexFromDirectory(directoryPath = path.join(process.cwd(), "data", "manual_catalog")) {
    return buildCatalogItemIndex(loadManualCatalogBatchesFromDirectory(directoryPath));
}

function resolveCandidateQuality(candidate = {}) {
    return normalizeQualityCode(
        candidate.quality
        || candidate.color
        || candidate.detected_quality
        || candidate.detected_color
        || candidate.quality_color
        || candidate.quality_label
    );
}

function compactMatchItem(item) {
    if (!item) return null;
    return {
        id: item.id,
        quality: item.quality,
        batch_id: item.batch_id,
        item_index: item.item_index,
        name: item.name,
        value: item.value,
        cells: item.cells,
        name_confidence: item.name_confidence
    };
}

function scoreCatalogCandidate(input, item, options) {
    const nameScore = scoreNameSimilarity(input.name, item.name);
    const qualityMatch = input.quality ? item.quality === input.quality : null;
    const qualityScore = input.quality ? (qualityMatch ? 1 : 0) : 0.5;
    return {
        ...compactMatchItem(item),
        name_score: round(nameScore, 6),
        quality_score: round(qualityScore, 6),
        combined_score: round((nameScore * options.nameWeight) + (qualityScore * options.qualityWeight), 6),
        quality_match: qualityMatch
    };
}

function normalizeOptions(options = {}) {
    const merged = { ...DEFAULT_MATCH_OPTIONS, ...(options || {}) };
    merged.topN = Math.max(1, Math.round(Number(merged.topN) || DEFAULT_MATCH_OPTIONS.topN));
    merged.nameWeight = Math.max(0, Number(merged.nameWeight) || 0);
    merged.qualityWeight = Math.max(0, Number(merged.qualityWeight) || 0);
    const totalWeight = merged.nameWeight + merged.qualityWeight;
    if (totalWeight > 0 && totalWeight !== 1) {
        merged.nameWeight /= totalWeight;
        merged.qualityWeight /= totalWeight;
    }
    return merged;
}

function sortScoredCandidates(left, right) {
    return right.combined_score - left.combined_score
        || right.name_score - left.name_score
        || right.quality_score - left.quality_score
        || String(left.name).localeCompare(String(right.name), "zh-Hans-CN");
}

function resolveStatus(blockers) {
    if (!blockers.length) return "accepted";
    if (blockers.includes("quality_mismatch")
        || blockers.includes("candidate_low_signal")
        || blockers.includes("candidate_name_missing")
        || blockers.includes("catalog_index_empty")) {
        return "blocked";
    }
    return "needs_manual_review";
}

function matchCatalogItem(candidate = {}, indexOrItems = [], options = {}) {
    const matchOptions = normalizeOptions(options);
    const input = {
        id: candidate.id || null,
        name: candidate.name || candidate.ocr_name || candidate.best_text || candidate.text || "",
        normalized_name: normalizeCatalogMatchName(candidate.name || candidate.ocr_name || candidate.best_text || candidate.text || ""),
        quality: resolveCandidateQuality(candidate)
    };
    const items = Array.isArray(indexOrItems)
        ? indexOrItems
        : (Array.isArray(indexOrItems.items) ? indexOrItems.items : []);
    const blockers = [];

    if (!input.normalized_name) blockers.push("candidate_name_missing");
    if (!items.length) blockers.push("catalog_index_empty");

    const scored = items
        .map((item) => scoreCatalogCandidate(input, item, matchOptions))
        .sort(sortScoredCandidates);
    const best = scored[0] || null;

    if (best) {
        if (best.name_score < matchOptions.minNameScore) blockers.push("name_score_below_minimum");
        if (candidateLooksLowSignal(input, best)) blockers.push("candidate_low_signal");
        if (input.quality && matchOptions.requireQualityMatch && best.quality_match !== true) blockers.push("quality_mismatch");
        if (best.combined_score < matchOptions.acceptThreshold) blockers.push("combined_score_below_threshold");

        const ambiguityPool = scored
            .filter((entry) => entry.name_score >= matchOptions.minNameScore)
            .filter((entry) => !input.quality || !matchOptions.requireQualityMatch || entry.quality_match === true);
        const second = ambiguityPool[1] || null;
        if (second && best.quality_match !== false && best.combined_score - second.combined_score < matchOptions.minScoreGap) {
            blockers.push("ambiguous_match_gap");
        }
    }

    const candidateList = scored
        .filter((entry) => entry.name_score >= matchOptions.minNameScore)
        .filter((entry) => !input.quality || !matchOptions.requireQualityMatch || entry.quality_match === true)
        .slice(0, matchOptions.topN);
    const fallbackList = candidateList.length ? candidateList : scored.slice(0, matchOptions.topN);
    const status = resolveStatus([...new Set(blockers)]);

    return {
        id: input.id,
        accepted: status === "accepted",
        status,
        candidate: {
            name: input.name,
            normalized_name: input.normalized_name,
            quality: input.quality
        },
        match: compactMatchItem(best),
        scores: best ? {
            name_score: best.name_score,
            quality_score: best.quality_score,
            combined_score: best.combined_score,
            quality_match: best.quality_match
        } : {
            name_score: 0,
            quality_score: 0,
            combined_score: 0,
            quality_match: null
        },
        blockers: [...new Set(blockers)],
        candidates: fallbackList
    };
}

function matchCatalogItems(candidates = [], indexOrItems = [], options = {}) {
    return (Array.isArray(candidates) ? candidates : []).map((candidate) => ({
        ...matchCatalogItem(candidate, indexOrItems, options),
        id: candidate && candidate.id ? candidate.id : null
    }));
}

module.exports = {
    DEFAULT_MATCH_OPTIONS,
    buildCatalogItemIndex,
    loadCatalogItemIndexFromDirectory,
    matchCatalogItem,
    matchCatalogItems,
    normalizeCatalogMatchName,
    normalizeQualityCode,
    scoreNameSimilarity
};
