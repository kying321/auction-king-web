# count-fit sample review import

- change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-27-sunken-ship-p0-manual-count-confirmation-import.json`
- review entries: `2`
- accepted samples: `0`
- blocked entries: `2`
- review-image flagged entries: `0`
- training-label from pixel: `0`

## Blocker Reasons

| reason | count |
| --- | ---: |
| `actual_counts_total_mismatch` | `1` |
| `status_not_approved_for_import` | `2` |

## Map Counts

| map | accepted samples |
| --- | ---: |
| `-` | `0` |

## Import Audit

| source task | source queue | map | status | audit status | event timestamp | blockers |
| --- | --- | --- | --- | --- | --- | --- |
| `capture_full_count_sunken_ship_2026_04_26T11_39_14_204Z` | `-` | `sunken_ship` | `needs_human_confirmation` | `blocked` | `2026-04-26T11:39:14.204Z` | status_not_approved_for_import, actual_counts_total_mismatch |
| `capture_full_count_sunken_ship_2026_04_26T12_39_48_135Z` | `-` | `sunken_ship` | `needs_human_confirmation` | `blocked` | `2026-04-26T12:39:48.135Z` | status_not_approved_for_import |

## Guardrails

- `actual_counts_source` must be exactly `manual_review`.
- Full count-fit rows must include `w/g/b/p/o/r` and the sum must equal `actual_counts.total_items`.
- `event_timestamp` is required so replay/count-fit logic can avoid forward-looking joins.
- Pixel/OCR/system hints are never exported as training labels.
