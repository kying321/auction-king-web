const test = require("node:test");
const assert = require("node:assert/strict");
const packageJson = require("../package.json");
const {
    parseAkKeysFromStringsOutput,
    buildProfileStateSummary,
    buildChromeBrowserStateAudit
} = require("../scripts/build_browser_state_audit.js");

test("package exposes chrome browser-state audit entry", () => {
    assert.match(
        packageJson.scripts["build:browser-state-audit"] || "",
        /node\s+scripts\/build_browser_state_audit\.js/
    );
});

test("parseAkKeysFromStringsOutput keeps unique ak_* keys in stable order", () => {
    const parsed = parseAkKeysFromStringsOutput([
        "ak_workspace_state_v2",
        "noise",
        "ak_config_source_v2",
        "ak_workspace_state_v2",
        "ak_settlement_samples_v1"
    ].join("\n"));

    assert.deepEqual(parsed, [
        "ak_config_source_v2",
        "ak_settlement_samples_v1",
        "ak_workspace_state_v2"
    ]);
});

test("buildProfileStateSummary marks browser sample and calibration presence explicitly", () => {
    const summary = buildProfileStateSummary({
        profileName: "Profile 1",
        historyMatches: [
            { title: "竞拍决策台", url: "https://ak.fuuu.fun/" },
            { title: "竞拍决策台", url: "file:///tmp/auction_king_web/index.html" }
        ],
        akKeys: [
            "ak_config_overrides_v2",
            "ak_workspace_state_v2",
            "ak_settlement_samples_v1",
            "ak_calibration_panel_applied_v1"
        ]
    });

    assert.equal(summary.profile_name, "Profile 1");
    assert.equal(summary.history_match_count, 2);
    assert.equal(summary.has_workspace_state, true);
    assert.equal(summary.has_config_overrides, true);
    assert.equal(summary.has_sample_dataset, true);
    assert.equal(summary.has_calibration_applied, true);
    assert.equal(summary.has_calibration_draft, false);
    assert.match(summary.app_urls[0], /ak\.fuuu\.fun/);
});

test("buildChromeBrowserStateAudit aggregates blocker counts across profiles", () => {
    const audit = buildChromeBrowserStateAudit([
        buildProfileStateSummary({
            profileName: "Profile 1",
            historyMatches: [{ title: "竞拍决策台", url: "https://ak.fuuu.fun/" }],
            akKeys: ["ak_workspace_state_v2", "ak_config_source_v2"]
        }),
        buildProfileStateSummary({
            profileName: "Profile 12",
            historyMatches: [],
            akKeys: ["ak_settlement_samples_v1", "ak_workspace_state_v2"]
        })
    ]);

    assert.equal(audit.profile_count, 2);
    assert.deepEqual(audit.profiles_with_history, ["Profile 1"]);
    assert.deepEqual(audit.profiles_with_sample_dataset, ["Profile 12"]);
    assert.equal(audit.summary.any_sample_dataset_present, true);
    assert.equal(audit.summary.any_calibration_draft_present, false);
    assert.equal(audit.summary.any_calibration_applied_present, false);
});
