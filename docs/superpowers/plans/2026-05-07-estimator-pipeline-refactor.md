# Estimator Pipeline Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current estimator pipeline into focused runtime modules while preserving existing behavior and keeping all parameter promotion gates fail-closed.

**Architecture:** Keep `src/core/estimator.js` as the public orchestrator and extract pure helper modules in small, test-backed steps. Each task moves one responsibility, runs targeted equivalence tests, then runs broader verification before commit.

**Tech Stack:** Node.js CommonJS modules, native `node --test`, static browser scripts, generated config bundle from `config/default/`.

---

## Files And Responsibilities

- Create `src/core/average_observation_runtime.js`: average display text, rounding semantics, feasible total-cell support.
- Create `src/core/posterior_runtime.js`: posterior mass normalization, accumulation, and summaries.
- Create `src/core/count_constraint_runtime.js`: count-state validation, bounds, count prior, and candidate enumeration helpers.
- Create `src/core/valuation_runtime.js`: value override scaling and Monte Carlo valuation helpers.
- Modify `src/core/estimator.js`: replace in-file helper ownership with calls into extracted modules while preserving public exports.
- Add tests beside existing coverage:
  - `tests/average_observation_runtime.test.js`
  - `tests/posterior_runtime.test.js`
  - `tests/count_constraint_runtime.test.js`
  - `tests/valuation_runtime.test.js`
  - targeted compatibility assertions in existing `tests/default_config_bundle.test.js` or `tests/settlement_sample_count_replay.test.js` only when needed.
- Optionally create `scripts/build_estimator_pipeline_audit_report.js` and `tests/build_estimator_pipeline_audit_report.test.js` after the extraction tasks are complete.

## Task 1: Extract Average Observation Runtime

**Files:**

- Create: `src/core/average_observation_runtime.js`
- Create: `tests/average_observation_runtime.test.js`
- Modify: `src/core/estimator.js`
- Modify: `package.json` `check:js`

- [ ] **Step 1: Write the failing tests**

Create tests that assert current semantics:

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const {
  normalizeObservedAverageText,
  formatAverageDisplayFromTotalCells,
  getAverageInterval,
  getMatchingAverageTotals
} = require("../src/core/average_observation_runtime.js");

test("average display preserves compact and fixed width semantics", () => {
  assert.equal(normalizeObservedAverageText(".30"), "0.30");
  assert.equal(formatAverageDisplayFromTotalCells(3, 10, 2), "0.30");
});

test("truncate interval keeps 0.3 and 0.30 on different support branches", () => {
  assert.deepEqual(getAverageInterval(0.3, 10, { precision: 1, roundingMode: "truncate" }), [3, 3]);
  assert.deepEqual(getAverageInterval(0.3, 10, { precision: 2, roundingMode: "truncate" }), [3, 3]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/average_observation_runtime.test.js
```

Expected: fail because the module does not exist.

- [ ] **Step 3: Move average helpers**

Move these helpers from `src/core/estimator.js` to `src/core/average_observation_runtime.js`:

- `gcd`
- `normalizeObservedAverageText`
- `getExactDecimalPlaces`
- `buildDivisionDigits`
- `formatAverageDisplayFromTotalCells`
- `getAverageInterval`
- `roundedAvgInterval`
- `buildRelaxedAverageSupport`
- `getAverageObservationOptions`
- `resolveAverageRoundingMode`
- `getAverageObservationOptionsForState`
- `getAverageObservationOptionsForQuality`
- `getMatchingAverageTotals`
- `getMatchingAverageTotalsInRange`
- `hasFeasibleAverageForCount`

Export all functions still consumed by tests or scripts. Keep compatibility exports from `estimator.js` by re-exporting where needed.

- [ ] **Step 4: Wire estimator to the new module**

At the top of `src/core/estimator.js`, require:

```js
const averageObservationRuntime = require("./average_observation_runtime.js");
```

Use destructuring for moved helpers and remove duplicate local definitions only after tests pass.

- [ ] **Step 5: Add JS check entry**

Update `package.json` `check:js` to include:

```bash
node --check src/core/average_observation_runtime.js
```

- [ ] **Step 6: Verify**

Run:

```bash
node --test tests/average_observation_runtime.test.js
node --test tests/avg_probability_core.test.js
node --test tests/default_config_bundle.test.js
npm run check:js
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/average_observation_runtime.js src/core/estimator.js tests/average_observation_runtime.test.js package.json
git commit -m "refactor: extract average observation runtime"
```

## Task 2: Extract Posterior Runtime

**Files:**

- Create: `src/core/posterior_runtime.js`
- Create: `tests/posterior_runtime.test.js`
- Modify: `src/core/estimator.js`
- Modify: `package.json` `check:js`

- [ ] **Step 1: Write the failing tests**

Test normalization, confidence, and accumulation behavior:

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const {
  normalizePosteriorMass,
  summarizePosteriorMass,
  accumulatePosteriorMass,
  summarizePosteriorMassMap
} = require("../src/core/posterior_runtime.js");

test("posterior mass normalizes weighted counts", () => {
  assert.deepEqual(normalizePosteriorMass([1, 2], [1, 3]), {
    1: 0.25,
    2: 0.75
  });
});

test("posterior summary exposes top confidence", () => {
  const summary = summarizePosteriorMass({ 1: 0.25, 2: 0.75 });
  assert.equal(summary.top_count, 2);
  assert.equal(summary.top_prob, 0.75);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/posterior_runtime.test.js
```

Expected: fail because the module does not exist.

- [ ] **Step 3: Move posterior helpers**

Move these helpers from `estimator.js`:

- `normalizePosteriorMass`
- `summarizePosteriorMass`
- `accumulatePosteriorMass`
- `summarizePosteriorMassMap`
- `normalizeLabeledWeights`
- `approxPosteriorMass`
- `accumulateConvolvedTotalMass`
- `getAllowedTotalMassProbability`

Keep return shapes identical.

- [ ] **Step 4: Wire estimator to the new module**

Require `posterior_runtime.js` and replace local helper references.

- [ ] **Step 5: Verify**

```bash
node --test tests/posterior_runtime.test.js
node --test tests/settlement_sample_count_replay.test.js
node --test tests/coarse_estimator.test.js
npm run check:js
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/posterior_runtime.js src/core/estimator.js tests/posterior_runtime.test.js package.json
git commit -m "refactor: extract posterior runtime"
```

## Task 3: Extract Count Constraint Runtime

**Files:**

- Create: `src/core/count_constraint_runtime.js`
- Create: `tests/count_constraint_runtime.test.js`
- Modify: `src/core/estimator.js`
- Modify: `package.json` `check:js`

- [ ] **Step 1: Write characterization tests**

Use a compact config/state pair and compare output against `AuctionKingEstimator.enumerateCountStates()`.

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const defaultConfig = require("../src/core/default_config_bundle.js");
const { AuctionKingEstimator } = require("../src/core/estimator.js");
const { enumerateCountStates } = require("../src/core/count_constraint_runtime.js");

test("count constraint runtime matches estimator count enumeration", () => {
  const state = {
    total_count: 20,
    total_cells: 45,
    b_count: 3,
    p_count: 2,
    r2_orange_count: 1
  };
  const estimator = new AuctionKingEstimator(defaultConfig, state);
  assert.deepEqual(
    enumerateCountStates(estimator.config, estimator.state, { maxStates: 100000 }),
    estimator.enumerateCountStates({ maxStates: 100000 })
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/count_constraint_runtime.test.js
```

Expected: fail because the module does not exist.

- [ ] **Step 3: Move stateless count helpers**

Move or duplicate temporarily, then delete old copies after equivalence passes:

- `isIntegerField`
- `getCountPriorStrength`
- `hasDirectOrangeRedCountAnchor`
- `getEffectiveCountPriorStrength`
- `getCellModelMin`
- `getCellModelMax`
- `getCellTotalBounds`
- `deriveAdaptiveSolverBudget`

For class methods, first create pure helper functions and keep class wrappers:

- `validateState`
- `enumerateCountStates`
- `logCountPrior`
- `inferCellsForColor`
- `buildCandidates`

- [ ] **Step 4: Preserve class API**

`AuctionKingEstimator` methods should call the new runtime so all existing tests keep working.

- [ ] **Step 5: Verify**

```bash
node --test tests/count_constraint_runtime.test.js
node --test tests/default_config_bundle.test.js
node --test tests/settlement_sample_count_replay.test.js
npm test
npm run check:js
```

Expected: all pass.

- [ ] **Step 6: Restore generated artifacts if tests rewrite them**

Check:

```bash
git status --short
```

If only known generated research artifacts changed unintentionally, restore them:

```bash
git checkout -- docs/research/2026-04-26-manual-count-prior-shadow-candidate-config.json docs/research/2026-04-26-sunken-ship-codex-visual-manual-confirmation-chain-refresh.json docs/research/2026-04-26-sunken-ship-codex-visual-manual-confirmation-import.json
```

- [ ] **Step 7: Commit**

```bash
git add src/core/count_constraint_runtime.js src/core/estimator.js tests/count_constraint_runtime.test.js package.json
git commit -m "refactor: extract count constraint runtime"
```

## Task 4: Extract Valuation Runtime

**Files:**

- Create: `src/core/valuation_runtime.js`
- Create: `tests/valuation_runtime.test.js`
- Modify: `src/core/estimator.js`
- Modify: `package.json` `check:js`

- [ ] **Step 1: Write characterization tests**

Compare a deterministic low-sample valuation shape against the estimator method. Do not assert random exact values unless a seeded path is introduced.

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const { scaleValueModelToTargetItemValue } = require("../src/core/valuation_runtime.js");

test("value override scaling preserves target item value", () => {
  const scaled = scaleValueModelToTargetItemValue(
    { base_item_mean: 100, base_item_sd: 10, per_cell_mean: 50, per_cell_sd: 5 },
    400,
    6,
    2
  );
  assert.equal(Math.round(scaled.base_item_mean + 3 * scaled.per_cell_mean), 400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/valuation_runtime.test.js
```

Expected: fail because the module does not exist.

- [ ] **Step 3: Move valuation helpers**

Move:

- `getQualityValueOverrideTarget`
- `scaleValueModelToTargetItemValue`
- `clampProbability`
- red type posterior mix helpers used by valuation
- `valuationMc` internals that can be pure functions

Keep `AuctionKingEstimator.valuationMc()` as a wrapper for compatibility.

- [ ] **Step 4: Verify**

```bash
node --test tests/valuation_runtime.test.js
node --test tests/settlement_sample_value_replay.test.js
node --test tests/result_panel_runtime.test.js
npm run check:js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/valuation_runtime.js src/core/estimator.js tests/valuation_runtime.test.js package.json
git commit -m "refactor: extract valuation runtime"
```

## Task 5: Add Pipeline Audit Report

**Files:**

- Create: `scripts/build_estimator_pipeline_audit_report.js`
- Create: `tests/build_estimator_pipeline_audit_report.test.js`
- Modify: `package.json`
- Create generated output only if intentionally adding it to public docs: `docs/research/2026-05-07-estimator-pipeline-audit-report.json`

- [ ] **Step 1: Write failing test**

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const { buildEstimatorPipelineAuditReport } = require("../scripts/build_estimator_pipeline_audit_report.js");

test("pipeline audit maps algorithm ownership to focused modules", () => {
  const report = buildEstimatorPipelineAuditReport();
  assert.equal(report.schema_version, "ak_estimator_pipeline_audit_v1");
  assert.equal(report.live_path_touched, false);
  assert.equal(report.default_parameter_update_allowed, false);
  assert.deepEqual(report.module_ownership.average_observation.owner, "src/core/average_observation_runtime.js");
});
```

- [ ] **Step 2: Implement report**

Report should summarize:

- module ownership
- public API compatibility
- default parameter update status
- live path touched status
- required verification commands
- residual gates blocking parameter promotion

- [ ] **Step 3: Add package script and JS check**

Add:

```json
"build:estimator-pipeline-audit": "node scripts/build_estimator_pipeline_audit_report.js"
```

Add script to `check:js`.

- [ ] **Step 4: Verify**

```bash
node --test tests/build_estimator_pipeline_audit_report.test.js
npm run build:estimator-pipeline-audit
npm run check:js
npm run audit:public-release
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_estimator_pipeline_audit_report.js tests/build_estimator_pipeline_audit_report.test.js package.json docs/research/2026-05-07-estimator-pipeline-audit-report.json
git commit -m "chore: add estimator pipeline audit report"
```

## Task 6: Full Verification And Release Hygiene

**Files:**

- No expected source changes unless generated docs are intentionally updated.

- [ ] **Step 1: Run full checks**

```bash
npm run check:js
npm test
python3 -m unittest discover -s tests -p 'test_realtime_red_templates.py'
python3 -m unittest discover -s tests -p 'test_offline_estimator_red_templates.py'
python3 -m unittest discover -s tests -p 'test_family_calibration_suggester.py'
python3 -m unittest discover -s tests -p 'test_collection_family_config_io.py'
npm run build:static
npm run audit:public-release
git diff --check
```

Expected:

- JavaScript checks pass.
- Node tests pass.
- Python legacy tests pass.
- Static build passes.
- Public release audit reports `finding_count=0`.
- No whitespace errors.

- [ ] **Step 2: Confirm release boundary**

```bash
find . -maxdepth 1 -type f \\( -name '*.js' -o -name '*.py' \\) -print | sort
git status --short
```

Expected:

- root `.js` and `.py` output is empty.
- only intentional source, test, docs, or package files are modified.

- [ ] **Step 3: Final commit if needed**

```bash
git add .
git commit -m "refactor: split estimator pipeline"
```

Use this only for final cleanup not already committed in prior tasks.

## Rollback

Each task is separately committed. Roll back the latest task with:

```bash
git revert <commit>
```

If a generated artifact drifted during verification, restore the baseline:

```bash
git checkout -- config/default/calibration.json data/source_packages/authority_source_package.json src/core/default_config_bundle.js dist docs/research
```

## Implementation Notes

- Keep all new runtime modules pure CommonJS.
- Do not introduce third-party dependencies.
- Do not use current time in replay, signal math, or historical indicators.
- Build scripts that stamp `generated_at` may keep existing behavior, but do not make tests depend on wall-clock time.
- Any future parameter update must be a separate `SIM_ONLY` or `RESEARCH_ONLY` task with source-owned gate evidence.
