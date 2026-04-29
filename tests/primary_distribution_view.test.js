const test = require("node:test");
const assert = require("node:assert/strict");
const {
    getPrimaryDistributionMarkup,
    applyPrimaryDistributionMarkup
} = require("../src/core/primary_distribution_view.js");

test("getPrimaryDistributionMarkup returns waiting placeholders", () => {
    assert.deepEqual(getPrimaryDistributionMarkup("waiting"), {
        orangeHtml: '<li class="waiting-data">等待输入 "总件数" 与相应约束...</li>',
        redHtml: '<li class="waiting-data">等候贝叶斯联合分布渲染...</li>'
    });
});

test("getPrimaryDistributionMarkup returns error placeholders", () => {
    assert.deepEqual(getPrimaryDistributionMarkup("error"), {
        orangeHtml: '<li class="waiting-data">当前输入组合下无可用橙色分布。</li>',
        redHtml: '<li class="waiting-data">当前输入组合下无可用红色分布。</li>'
    });
});

test("applyPrimaryDistributionMarkup overwrites stale posterior lists on error", () => {
    const orangeEl = { innerHTML: "<li>旧橙色后验</li>" };
    const redEl = { innerHTML: "<li>旧红色后验</li>" };

    applyPrimaryDistributionMarkup(orangeEl, redEl, "error");

    assert.equal(orangeEl.innerHTML, '<li class="waiting-data">当前输入组合下无可用橙色分布。</li>');
    assert.equal(redEl.innerHTML, '<li class="waiting-data">当前输入组合下无可用红色分布。</li>');
});
