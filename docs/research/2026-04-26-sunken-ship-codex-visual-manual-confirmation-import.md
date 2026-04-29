# count-fit sample review import

- change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-26-sunken-ship-codex-visual-manual-confirmation-import.json`
- review entries: `1`
- accepted samples: `1`
- blocked entries: `0`
- review-image flagged entries: `0`
- training-label from pixel: `0`

## Blocker Reasons

| reason | count |
| --- | ---: |
| `-` | `0` |

## Map Counts

| map | accepted samples |
| --- | ---: |
| `sunken_ship` | `1` |

## Import Audit

| source task | source queue | map | status | audit status | event timestamp | blockers |
| --- | --- | --- | --- | --- | --- | --- |
| `-` | `-` | `sunken_ship` | `approved_count_fit_sample` | `accepted` | `2026-04-25T18:19:20.767Z` | - |

## Guardrails

- `actual_counts_source` must be exactly `manual_review`.
- Full count-fit rows must include `w/g/b/p/o/r` and the sum must equal `actual_counts.total_items`.
- `event_timestamp` is required so replay/count-fit logic can avoid forward-looking joins.
- Pixel/OCR/system hints are never exported as training labels.
