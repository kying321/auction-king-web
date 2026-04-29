# 2026-04-24 叠层截图 clean replay 样本

- 来源目录: `<local-path>
- 样本包: `docs/research/2026-04-24-image-overlay-count-replay-samples.json`
- 当前样本数: 2
- 变更类: `SIM_ONLY`

## 处理原则

- `field_values` 只放估算期可用观测。
- 赛后叠层里能直接揭示答案的字段不放入 `field_values`，只记录在 `metadata.excluded_overlay_fields`。
- `actual_counts` 只放被人工确认的橙/红实际数量，用于回放评分。

## 样本

- `95B70A0BF969AB5351C06B24ED49B88E.png`
  - 地图: `villa / luxury_retirement_home / 奢华养老院`
  - 出价/战利品/利润: `423,500 / 7,934,829 / 7,511,329`
  - clean observation: 总件数 `40`, 蓝件数 `11`, 金均格 `4`, 紫均格 `2.61`, 绿白总格 `22`, 绿白均格 `2.2`
  - holdout actual: 金色 `1`
  - 红色数量在叠层候选里有 `0/5` 两种，暂不作为训练标签。

- `98145F899148815B757506EB6B3C0C41.png`
  - 地图: `sunken_ship / unlisted_privateer_armory / 私掠船军火舱`
  - 出价/战利品/利润: `1,000,000 / 2,147,553 / 1,147,553`
  - clean observation: 总件数 `43`, 蓝件数 `11`, 金均格 `1`, 紫均格 `2.66`, 绿白总格 `38`, 绿白均格 `2.23`
  - holdout actual: 金色 `2`, 红色 `4`

## 首轮回放与采用结果

- 综合 count replay 报告: `docs/research/2026-04-24-overlay-clean-count-replay.json`
- 别墅单图报告: `docs/research/2026-04-24-villa-overlay-clean-count-replay.json`
- 沉船单图报告: `docs/research/2026-04-24-sunken_ship-overlay-clean-count-replay.json`
- 别墅 tuning 候选: `docs/research/2026-04-24-villa-overlay-count-prior-tuning.json`
- 沉船 tuning 候选: `docs/research/2026-04-24-sunken_ship-overlay-count-prior-tuning.json`

旧基线偏差:

- 奢华养老院样本: 金色实际 `1`，当前基线概率 `0.341665`，rank `2`，top1 为 `6`。
- 沉船样本: 金色实际 `2`，当前基线概率 `0.117784`，rank `2`，top1 为 `1`。
- 沉船样本: 红色实际 `4`，当前基线概率 `0.036920`，rank `6`，top1 为 `5`，均值 `6.297`，说明当前沉船红色尾部偏高。

已采用的离线 tuning 候选:

- 别墅: 已把 `alpha_counts.o` 从 `1.8` 降到 `0.9`、`count_prior_strength` 从 `8` 升到 `16`。
- 沉船: 已把 `count_prior_strength` 从 `1` 升到 `8`、`alpha_counts.p` 从 `3.2` 升到 `3.84`。

证据闸:

- 当前两个地图的 tuning report 均输出 `evidence_assessment.status = insufficient_sample_size`。
- 别墅: 地图样本 `1/3`，橙色样本 `1/2`，红色样本 `0/2`，`can_adopt_default_weight = false`。
- 沉船: 地图样本 `1/3`，橙色样本 `1/2`，红色样本 `1/2`，`can_adopt_default_weight = false`。
- 因此这些数值只能作为 `RESEARCH_ONLY`/人工复核证据；继续扩大默认权重前，至少需要补足每地图 `3` 条、每目标品质 `2` 条以上的 clean replay 样本。

采用后 replay:

- 综合: 橙色 mean actual prob `0.749722`、rank `1`、top1 `1`; 红色 mean actual prob `0.452568`、rank `1`、top1 `1`。
- 别墅单图: 金色实际 `1` 的概率 `1`，rank `1`。
- 沉船单图: 金色实际 `2` 的概率 `0.499443`，红色实际 `4` 的概率 `0.452568`，二者 rank 均为 `1`。

## 风险

- 样本量仍然很小，本次默认权重采用的是窄范围 `SIM_ONLY` 修正；后续需要更多 authority-ready battle sample 回放来确认不会过拟合。
- tuning report 已把单样本坐标搜索标记为 `single_sample_coordinate_search_overfit`，后续不应仅凭当前 best/baseline score 继续调参。
- `私掠船军火舱` 不在当前沉船区细分场景列表里，先按 `unlisted_privateer_armory` 标注，后续需要用户确认是否应纳入正式 submap。
