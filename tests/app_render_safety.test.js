const test = require("node:test");
const assert = require("node:assert/strict");

test("escapeHtml neutralizes config-driven markup before innerHTML rendering", () => {
    global.AUCTION_KING_DEFAULT_CONFIG = {};
    global.document = {
        addEventListener() {}
    };

    delete require.cache[require.resolve("../app.js")];
    const { escapeHtml } = require("../app.js");

    assert.equal(
        escapeHtml(`<img src=x onerror="alert('xss')"> & "quoted"`),
        "&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt; &amp; &quot;quoted&quot;"
    );

    delete require.cache[require.resolve("../app.js")];
    delete global.AUCTION_KING_DEFAULT_CONFIG;
    delete global.document;
});
