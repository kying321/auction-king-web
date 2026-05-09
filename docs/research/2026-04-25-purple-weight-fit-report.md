# purple weight fit

- 变更类: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-25-purple-weight-fit-report.json`
- adoption allowed: `false`
- selected default multiplier: `-`
- near-double multiplier: `2`
- default change class: `RESEARCH_ONLY`
- baseline config source: `default_config_plus_overrides`

## Candidate scan

| multiplier | red mean delta | objective | orange metrics | red metrics |
| --- | --- | --- | --- | --- |
| 1 | 0 | 29.087059 | n=2, p=0.142101, loss=9.020003, abs=2.5466 | n=1, p=0.032993, loss=3.411453, abs=2.5424 |
| 1.25 | -0.164 | 27.466547 | n=2, p=0.144748, loss=7.940357, abs=2.5192 | n=1, p=0.021471, loss=3.841033, abs=2.7064 |
| 1.5 | -0.2545 | 25.90382 | n=2, p=0.146342, loss=6.919114, abs=2.5031 | n=1, p=0.014087, loss=4.262492, abs=2.7969 |
| 1.75 | -0.3077 | 24.43154 | n=2, p=0.147336, loss=5.949314, abs=2.5067 | n=1, p=0.009378, loss=4.669412, abs=2.8501 |
| 2 | -0.3406 | 23.018939 | n=2, p=0.14802, loss=5.025537, abs=2.5126 | n=1, p=0.006348, loss=5.059665, abs=2.883 |
| 2.25 | -0.3614 | 21.653459 | n=2, p=0.148774, loss=4.143559, abs=2.5148 | n=1, p=0.00437, loss=5.432941, abs=2.9038 |
| 2.5 | -0.3751 | 20.325246 | n=2, p=0.150899, loss=3.300852, abs=2.50815 | n=1, p=0.003059, loss=5.789742, abs=2.9175 |

## Evidence

- replay samples: `2`
- red label samples: `1`
- orange label samples: `2`
- blockers: `red_label_sample_count_below_default_update_gate, fit_uses_partial_overlay_replay_samples, purple_multiplier_scan_is_shadow_only`

## Conclusion

2x purple suppresses red mean but fails the only current red-label replay; keep as aggressive shadow, not default.
