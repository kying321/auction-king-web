# Public and Unpack Weight-Curve Validation

- Mode: `research_backtest`
- Change class: `RESEARCH_ONLY`
- Live/order/funds path touched: `false`
- Default config update allowed: `false`
- JSON: `docs/research/2026-05-07-public-and-unpack-weight-curve-validation-report.json`

## Conclusion

The user's hypothesis is mostly supported, but needs one important refinement:

> The recovered model is closer to `same-quality item weight ~= value^-beta` plus map/tier quality priors plus a red jackpot/log-price tail mixture. It is not a single raw-price normal curve and not one global rarity curve.

Strongest evidence:

- Local `Drop.txt` terminal item weights regress strongly against `Item.txt` `base_value`.
- Major red terminal groups have beta near `1.18-1.45` and correlation near `-0.95` on `log(weight) ~ log(value)`.
- Public calculators independently use inverse-price same-grade sampling and red/orange tail suppression.
- Current project red-tail runtime already uses `log_price_normal_tail`, which matches the direction better than raw red mean.

## Local Unpack Evidence

Source root:

`<local>/BidKing_zip_extract_min/Tables`

Checked tables:

| table | rows | relevant finding |
| --- | ---: | --- |
| `Item.txt` | `1127` | `1106013` is missing as an item row |
| `Drop.txt` | `593` | group `1066` references `1106013` with weight `3333` |
| `BidMap.txt` | `103` | project roots: shipping `2301`, villa `2401`, sunken `2501` |
| `RankMap.txt` | `61` | value ranges: shipping up to `100000`, villa `200000`, sunken `300000` |

Terminal drop regression, using OLS on `log(weight) ~ log(base_value)`:

| quality | groups | beta mean | beta min | beta max | corr mean |
| --- | ---: | ---: | ---: | ---: | ---: |
| orange / quality 5 | `11` | `0.970` | `0.108` | `1.451` | `-0.796` |
| red / quality 6 | `30` | `1.058` | `0.000` | `1.458` | `-0.796` |

Project-relevant red groups:

| group | name | n | beta | corr | note |
| --- | --- | ---: | ---: | ---: | --- |
| `1016` | 家具物品品质6 | `10` | `1.1833` | `-0.9481` | clean |
| `1046` | 兵装军火品质6 | `10` | `1.4530` | `-0.9580` | clean |
| `1056` | 珠宝矿藏品质6 | `19` | `1.1803` | `-0.9574` | clean |
| `1066` | 文物古董品质6 | `34` | `1.2393` | `-0.9545` | missing `1106013` |
| `1096` | 食饮珍馐品质6 | `13` | `1.4111` | `-0.9638` | clean |
| `1106` | 书画古籍品质6 | `17` | `1.3258` | `-0.9751` | clean |

Interpretation:

- Same-quality item rarity is strongly inverse-value-like.
- The highest jackpot item `1006001` (`19,371,213`) repeatedly has weight `5`, which is much lower than a smooth inverse-only fit would suggest. That is jackpot suppression.
- `1106013` can be treated as a blocked source gap only. Its nearby weight is useful for diagnostics, not authority reconstruction.

## Public Evidence

GitHub repository search for `BidKing in:name,description,readme` returned `85` repositories. The relevant public tools cluster around calculators, analyzers, and local table extraction.

Useful sources:

- [sarkozyfan/bidking-bot](https://github.com/sarkozyfan/bidking-bot)
- [snkrsubscriberdqh/BidKingCalculator](https://github.com/snkrsubscriberdqh/BidKingCalculator)
- [Jrinky908/bidking](https://github.com/Jrinky908/bidking)
- [MAE5blog/bidking-analyzer-rs](https://github.com/MAE5blog/bidking-analyzer-rs)
- [SeasonCake/bidking-lab](https://github.com/SeasonCake/bidking-lab)

### sarkozyfan/bidking-bot

Sources:

- [manual_bidking_advisor.py](https://raw.githubusercontent.com/sarkozyfan/bidking-bot/main/manual_bidking_advisor.py)
- [price_config.json](https://raw.githubusercontent.com/sarkozyfan/bidking-bot/main/bidking_fresh_bot/price_config.json)

Observed model:

- Grid prices: purple `0.28w`, orange/gold `1.13w`, red `4.77w`.
- Global item values: purple `0.891w`, orange `4.661w`, red `22.972w`.
- Across 10 categories, mean ratios:
  - orange item / purple item: `5.3474`
  - red item / orange item: `5.0716`
  - red grid midpoint / orange grid midpoint: `5.5774`
  - red grid midpoint / purple grid: `20.8253`

This supports separate per-item/per-grid value bands and red ranges. It does not expose authoritative drop weights.

### snkrsubscriberdqh/BidKingCalculator

Source:

- [BidKingCalculator](https://github.com/snkrsubscriberdqh/BidKingCalculator)

Observed model:

- Grade prior: `32:32:16:8:2:1`.
- Same-grade item sampling: inverse price.
- Sampling: with replacement.
- Red/orange controls: extreme high-price filter, max high-price count, second-item decay, max red/orange count.

This is the strongest public corroboration for the user's inverse-weight idea.

### MAE5blog/bidking-analyzer-rs

Source:

- [bidking-analyzer-rs](https://github.com/MAE5blog/bidking-analyzer-rs)

Observed model:

- Uses embedded `static_data.json` with `drop_weights`, `quality_p50_default`, `nest_weighted_prices`, `map_to_nest`, and `map_names`.
- Example quality P50 defaults: blue `2500`, purple `9045.5`, orange `40000`, red `160000`.
- Implements map quality probabilities from resolved drop graph when available.
- Splits jackpot values at threshold `1,000,000`.

This supports map-specific quality priors and red jackpot separation. It argues against a single global smooth curve.

## Alignment With Current Project

Current local catalog already shows red is heavy-tailed:

| metric | value |
| --- | ---: |
| red n | `92` |
| mean | `822956.57` |
| median | `244830` |
| mean / median | `3.3613` |
| CV | `3.0477` |
| skew | `5.8806` |
| tail >= `200000` | `48` |

Current runtime tail model:

- `tail_weight_basis`: `log_price_normal_tail`
- threshold: `200000`
- sunken tail battle probability: `0.14`
- villa/shipping tail battle probability: `0.05`

So the current direction is correct: ordinary red should use a catalog-tail-aware common mean, and jackpot red should be a separate log-price tail uplift.

## Decision

Do not promote public or unpack evidence into default config yet.

Blocked by:

- missing authoritative `Item.txt` row for `1106013`
- same-battle replay samples missing
- manual mechanics review not promoted
- authority handoff gate closed

Safe next step:

Build or refresh a shadow-only candidate that separates:

- same-grade inverse item weights
- map/tier quality priors
- red jackpot/log-price tail
- accepted same-battle replay validation

Forbidden until gates open:

- synthesize `1106013` as authority
- drop tuple `1066 -> 1106013` to unblock villa/sunken
- replace current `alpha_counts` with public repo priors
- treat public calculators as authoritative game data
