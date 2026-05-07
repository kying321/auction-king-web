# Estimator pipeline audit

- JSON: `docs/research/2026-05-07-estimator-pipeline-audit-report.json`
- change class: `SIM_ONLY`
- live path touched: `false`
- default parameter update allowed: `false`

## Module ownership

| module | owner | compatibility surface | owns |
| --- | --- | --- | --- |
| average_observation | src/core/average_observation_runtime.js | AuctionKingEstimator average-observation call sites | average text normalization, average interval derivation, feasible average support |
| posterior | src/core/posterior_runtime.js | AuctionKingEstimator posterior summarization call sites | posterior mass normalization, posterior mass summaries, allowed total mass probability |
| count_constraints | src/core/count_constraint_runtime.js | AuctionKingEstimator.enumerateCountStates | quality count state enumeration, custom orange/red count bounds, average-feasibility pruning |
| valuation | src/core/valuation_runtime.js | AuctionKingEstimator.valuationMc | Monte Carlo valuation sampling, custom quality value override scaling, red tail value uplift sampling, bid profit metrics |
| estimator_facade | src/core/estimator.js | AuctionKingEstimator, resolveEstimatorConfig | public estimator facade, config resolution, runtime orchestration |

## Promotion gates

- blockers: `default_parameter_update_out_of_scope, requires_separate_replay_or_shadow_evidence, requires_source_owned_authority_artifacts, requires_explicit_change_class_for_parameter_update`
- allowed next classes: `RESEARCH_ONLY, SIM_ONLY`

## Verification

- `node --test tests/average_observation_runtime.test.js tests/estimator.test.js`
- `node --test tests/posterior_runtime.test.js tests/estimator.test.js`
- `node --test tests/count_constraint_runtime.test.js tests/estimator.test.js`
- `node --test tests/valuation_runtime.test.js tests/estimator.test.js`
- `npm run check:js`
- `npm test`
- `npm run build:static`
- `npm run audit:public-release`
- `git diff --check`
