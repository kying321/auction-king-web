function defaultSetElementText(element, text) {
    if (!element) return;
    element.innerText = text || "";
    element.textContent = text || "";
}

function defaultClearElementContent(element) {
    if (!element) return;
    element.innerHTML = "";
    element.innerText = "";
    element.textContent = "";
    if (Array.isArray(element.children)) {
        element.children.length = 0;
    }
    if (Array.isArray(element.options)) {
        element.options.length = 0;
    }
}

function defaultFormatNumber(value, digits = 0) {
    if (!Number.isFinite(value)) return "-";
    if (digits > 0) return value.toFixed(digits);
    return Math.round(value).toLocaleString();
}

function defaultFormatPercent(value) {
    if (!Number.isFinite(value)) return "-";
    return `${(value * 100).toFixed(1)}%`;
}

function defaultParseLooseNumber(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().replace(/[，,]/g, "");
    if (!normalized) return null;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
}

function resolveHelpers(helpers = {}) {
    return {
        documentRef: helpers.documentRef || (typeof document !== "undefined" ? document : null),
        setElementText: typeof helpers.setElementText === "function" ? helpers.setElementText : defaultSetElementText,
        clearElementContent: typeof helpers.clearElementContent === "function" ? helpers.clearElementContent : defaultClearElementContent,
        formatNumber: typeof helpers.formatNumber === "function" ? helpers.formatNumber : defaultFormatNumber,
        formatPercent: typeof helpers.formatPercent === "function" ? helpers.formatPercent : defaultFormatPercent,
        parseLooseNumber: typeof helpers.parseLooseNumber === "function" ? helpers.parseLooseNumber : defaultParseLooseNumber
    };
}

function resetOutputToWaiting(view, helpers = {}) {
    const {
        orangeList,
        redList,
        orangeConfidenceNote,
        redConfidenceNote,
        errorBox,
        gridSection,
        valuationSection,
        gridBody
    } = view || {};
    const {
        documentRef,
        clearElementContent,
        setElementText
    } = resolveHelpers(helpers);

    clearElementContent(orangeList);
    clearElementContent(redList);
    setElementText(orangeConfidenceNote, "等待总数量与约束字段。");
    setElementText(redConfidenceNote, "等待求解后验。");

    if (documentRef && typeof documentRef.createElement === "function") {
        const orangeWaiting = documentRef.createElement("li");
        orangeWaiting.className = "waiting-data";
        orangeWaiting.innerText = "等待总数量与约束字段。";
        orangeList.appendChild(orangeWaiting);

        const redWaiting = documentRef.createElement("li");
        redWaiting.className = "waiting-data";
        redWaiting.innerText = "等待求解后验。";
        redList.appendChild(redWaiting);
    }

    if (errorBox && errorBox.classList) errorBox.classList.add("hidden");
    if (gridSection && gridSection.classList) gridSection.classList.add("hidden");
    if (valuationSection && valuationSection.classList) valuationSection.classList.add("hidden");
    clearElementContent(gridBody);
}

function renderPosteriorSummary(confidenceEl, entries, options = {}, helpers = {}) {
    const { suffix = "件", waitingText = "等待输入" } = options;
    const { setElementText, formatPercent } = resolveHelpers(helpers);

    if (!confidenceEl) return;
    if (!Array.isArray(entries) || !entries.length) {
        setElementText(confidenceEl, waitingText);
        return;
    }

    const top1 = entries[0];
    const top2 = entries[1] || null;
    const confidenceLabel = top1.prob >= 0.7
        ? "高把握"
        : top1.prob >= 0.45
            ? "中等把握"
            : "分散";

    setElementText(
        confidenceEl,
        `${confidenceLabel} | 主分支 ${top1.count}${suffix} ${formatPercent(top1.prob)}，次分支 ${top2 ? `${top2.count}${suffix} ${formatPercent(top2.prob)}` : "—"}`
    );
}

function renderDistributionList(target, entries, options = {}, helpers = {}) {
    const {
        suffix = "件",
        waitingText = "当前输入下暂无分布。",
        barClassName = "o-bar"
    } = options;
    const {
        documentRef,
        clearElementContent,
        formatPercent
    } = resolveHelpers(helpers);

    clearElementContent(target);
    if (!Array.isArray(entries) || !entries.length) {
        if (documentRef && typeof documentRef.createElement === "function") {
            const item = documentRef.createElement("li");
            item.className = "waiting-data";
            item.innerText = waitingText;
            target.appendChild(item);
        }
        return;
    }

    const visibleEntries = entries.slice(0, 8);
    const maxProb = visibleEntries[0] && Number.isFinite(visibleEntries[0].prob) ? visibleEntries[0].prob : 0;

    visibleEntries.forEach((entry, index) => {
        const item = documentRef.createElement("li");
        item.className = "mega-prob-item";
        if (index === 0) item.classList.add("top-result");

        const count = documentRef.createElement("span");
        count.className = "mega-prob-count";
        count.innerText = `${entry.count}${suffix}`;
        item.appendChild(count);

        const barContainer = documentRef.createElement("div");
        barContainer.className = "mega-bar-container";
        const bar = documentRef.createElement("div");
        bar.className = `mega-bar ${barClassName}`;
        const relativeWidth = maxProb > 0 ? Math.max((entry.prob / maxProb) * 100, 2) : 0;
        bar.style.width = `${relativeWidth}%`;
        barContainer.appendChild(bar);
        item.appendChild(barContainer);

        const probability = documentRef.createElement("span");
        probability.className = `mega-prob-val${entry.prob < 0.08 ? " low-prob" : ""}`;
        probability.innerText = formatPercent(entry.prob);
        item.appendChild(probability);

        target.appendChild(item);
    });
}

function renderGridSummary(gridBody, summary, helpers = {}) {
    const { clearElementContent, formatNumber, documentRef } = resolveHelpers(helpers);

    clearElementContent(gridBody);
    if (!summary || !summary.count_means || !summary.cell_means) return;

    const rows = [
        ["白", "w"],
        ["绿", "g"],
        ["蓝", "b"],
        ["紫", "p"],
        ["金", "o"],
        ["红", "r"]
    ];

    rows.forEach(([label, key]) => {
        const row = documentRef.createElement("tr");
        [
            label,
            formatNumber(summary.count_means[key], 2),
            formatNumber(summary.cell_means[key], 2),
            `${formatNumber(summary.cell_low[key], 0)} - ${formatNumber(summary.cell_high[key], 0)}`
        ].forEach((value) => {
            const cell = documentRef.createElement("td");
            cell.innerText = value;
            row.appendChild(cell);
        });
        gridBody.appendChild(row);
    });

    if (summary.cell_means.w !== undefined && summary.cell_means.g !== undefined) {
        const comboRow = documentRef.createElement("tr");
        [
            "绿+白",
            formatNumber((summary.count_means.w || 0) + (summary.count_means.g || 0), 2),
            formatNumber((summary.cell_means.w || 0) + (summary.cell_means.g || 0), 2),
            `${formatNumber((summary.cell_low.w || 0) + (summary.cell_low.g || 0), 0)} - ${formatNumber((summary.cell_high.w || 0) + (summary.cell_high.g || 0), 0)}`
        ].forEach((value) => {
            const cell = documentRef.createElement("td");
            cell.innerText = value;
            comboRow.appendChild(cell);
        });
        gridBody.appendChild(comboRow);
    }
}

function buildBidRecommendation(valuation = {}) {
    const meanValue = Number(valuation.mean_value);
    const q25 = Number(valuation.q25);
    if (!Number.isFinite(meanValue) || meanValue <= 0) return null;
    const meanCap = meanValue * 0.82;
    const q25Cap = Number.isFinite(q25) && q25 > 0 ? q25 : meanCap;
    return Math.max(0, Math.min(meanCap, q25Cap));
}

function classifyBidRisk(bid, recommendedBid) {
    if (!Number.isFinite(bid) || bid <= 0 || !Number.isFinite(recommendedBid) || recommendedBid <= 0) return "待定";
    if (bid <= recommendedBid) return "可跟";
    if (bid <= recommendedBid * 1.05) return "压线";
    return "偏贵";
}

function renderValuation(view, valuation, bidValue, helpers = {}) {
    const {
        valEv,
        valQ05,
        valQ25,
        valQ75,
        valProb,
        valRoi,
        valDecisionHeadline,
        valDecisionSummary
    } = view || {};
    const {
        setElementText,
        formatNumber,
        formatPercent,
        parseLooseNumber
    } = resolveHelpers(helpers);

    if (!valuation) return;
    setElementText(valEv, formatNumber(valuation.mean_value || 0));
    setElementText(valQ05, formatNumber(valuation.q05 || 0));
    setElementText(valQ25, formatNumber(valuation.q25 || 0));
    setElementText(valQ75, formatNumber(valuation.q75 || 0));

    const bid = parseLooseNumber(bidValue);
    const recommendedBid = buildBidRecommendation(valuation);
    const formattedRecommendedBid = Number.isFinite(recommendedBid) ? formatNumber(recommendedBid) : "-";
    const formattedProfitProb = Number.isFinite(Number(valuation.profit_prob))
        ? formatPercent(Number(valuation.profit_prob))
        : "-";
    if (Number.isFinite(bid) && bid > 0) {
        const roi = ((valuation.mean_value || 0) - bid) / bid;
        const bidRisk = classifyBidRisk(bid, recommendedBid);
        setElementText(valProb, formattedProfitProb);
        setElementText(valRoi, formatPercent(roi));
        setElementText(
            valDecisionHeadline,
            `建议上限 ${formattedRecommendedBid}，当前出价 ${formatNumber(bid)}，${bidRisk}`
        );
        setElementText(
            valDecisionSummary,
            `EV ${formatNumber(valuation.mean_value || 0)} | ROI ${roi > 0 ? "+" : ""}${formatPercent(roi)} | 盈利概率 ${formattedProfitProb} | Q25 ${formatNumber(valuation.q25 || 0)}`
        );
        return;
    }

    setElementText(valProb, "-");
    setElementText(valRoi, "-");
    setElementText(valDecisionHeadline, `建议上限 ${formattedRecommendedBid}，当前未填写出价`);
    setElementText(valDecisionSummary, `EV ${formatNumber(valuation.mean_value || 0)} | Q25 ${formatNumber(valuation.q25 || 0)} | 填写出价后显示后验盈利概率。`);
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        resetOutputToWaiting,
        renderPosteriorSummary,
        renderDistributionList,
        renderGridSummary,
        buildBidRecommendation,
        renderValuation
    };
}

if (typeof window !== "undefined") {
    window.AK_RESULT_PANEL_RUNTIME = {
        resetOutputToWaiting,
        renderPosteriorSummary,
        renderDistributionList,
        renderGridSummary,
        renderValuation
    };
}
