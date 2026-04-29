const WAITING_PRIMARY_DISTRIBUTION = {
    orangeHtml: '<li class="waiting-data">等待输入 "总件数" 与相应约束...</li>',
    redHtml: '<li class="waiting-data">等候贝叶斯联合分布渲染...</li>'
};

const ERROR_PRIMARY_DISTRIBUTION = {
    orangeHtml: '<li class="waiting-data">当前输入组合下无可用橙色分布。</li>',
    redHtml: '<li class="waiting-data">当前输入组合下无可用红色分布。</li>'
};

function getPrimaryDistributionMarkup(kind) {
    return kind === "error"
        ? { ...ERROR_PRIMARY_DISTRIBUTION }
        : { ...WAITING_PRIMARY_DISTRIBUTION };
}

function applyPrimaryDistributionMarkup(orangeEl, redEl, kind) {
    if (!orangeEl || !redEl) return getPrimaryDistributionMarkup(kind);

    const markup = getPrimaryDistributionMarkup(kind);
    orangeEl.innerHTML = markup.orangeHtml;
    redEl.innerHTML = markup.redHtml;
    return markup;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        WAITING_PRIMARY_DISTRIBUTION,
        ERROR_PRIMARY_DISTRIBUTION,
        getPrimaryDistributionMarkup,
        applyPrimaryDistributionMarkup
    };
}

if (typeof window !== "undefined") {
    window.WAITING_PRIMARY_DISTRIBUTION = WAITING_PRIMARY_DISTRIBUTION;
    window.ERROR_PRIMARY_DISTRIBUTION = ERROR_PRIMARY_DISTRIBUTION;
    window.getPrimaryDistributionMarkup = getPrimaryDistributionMarkup;
    window.applyPrimaryDistributionMarkup = applyPrimaryDistributionMarkup;
}
