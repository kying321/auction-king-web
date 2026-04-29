# BidKing 算法与权重优化决策树

- 变更类别：`RESEARCH_ONLY` (仅限研究)
- JSON：`docs/research/2026-04-29-bidking-algorithm-weight-optimization-decision-tree-report.json`
- 目标物品 ID：`1106013`
- 已获取根权威来源：`false`
- 受阻地图：`sunken_ship, villa`
- 允许权威摄入：`false`
- 允许覆盖影子模拟器：`false`
- 允许基于数据表的影子重放：`false`
- 允许默认配置更新：`false`
- 触及实盘/订单/资金路径：`false`

## 来源门控 (Source Gates)

| 门控 | 值 |
| --- | --- |
| `authority_intake_allowed` | `false` |
| `staging_item_ingest_allowed` | `false` |
| `staging_overlay_reference_integrity_clean_for_project_scope` | `false` |
| `overlay_shadow_simulator_candidate_allowed` | `false` |
| `table_backed_shadow_replay_allowed` | `false` |
| `authority_handoff_allowed` | `false` |
| `default_config_update_allowed` | `false` |
| `synthetic_item_as_authority_allowed` | `false` |
| `drop_tuple_exclusion_as_authority_allowed` | `false` |

## 阻碍因素 (Blockers)

- `no_direct_public_item_row_found` (未找到直接的公开物品行)
- `steam_visible_manifest_history_has_no_item_txt_change` (Steam 可见清单历史中没有 Item.txt 变更)
- `current_public_manifest_has_authority_gap` (当前公开清单存在权威断层)
- `developer_or_server_side_table_export_required` (需要开发者或服务端的数据表导出)
- `no_staged_item_rows` (无已暂存的物品行)
- `project_relevant_missing_terminal_item_references_after_overlay` (覆盖后仍缺少与项目相关的末端物品引用)
- `staging_overlay_reference_integrity_not_clean` (预发覆盖层引用完整性有误)
- `staging_overlay_shadow_replay_candidate_not_allowed` (不允许预发覆盖层影子重放候选)
- `maps_still_blocked_after_overlay` (覆盖后地图仍处于受阻状态)

## 禁止行为 (Forbidden Actions)

- `synthesize_1106013_as_authority` (将 1106013 合成为权威数据)
- `infer_1106013_from_neighbor_items` (从相邻物品推导 1106013)
- `drop_tuple_to_unblock_map` (为了解除地图受阻而丢弃元组)
- `update_default_config_while_any_gate_is_closed` (在任何门控关闭时更新默认配置)
- `treat_visual_or_manual_shadow_prior_as_source_authority` (将视觉或人工影子先验视为来源权威)

## 决策节点索引 (Decision Node Index)

| 节点 | 父节点 | 状态 | 成功后下一步 | 失败后下一步 |
| --- | --- | --- | --- | --- |
| `root_authority_source_for_1106013` | `root` | `blocked_authority_gap` | `authority_intake_audit` | `jump_to_parallel_shadow_lanes_then_return_to_root` |
| `authority_intake_audit` | `root_authority_source_for_1106013` | `blocked_until_authority_row_exists` | `staging_item_ingest` | `return_to_root_authority_source_for_1106013` |
| `staging_item_ingest` | `authority_intake_audit` | `blocked_until_intake_passes` | `staging_overlay_reference_integrity` | `return_to_authority_intake_audit` |
| `staging_overlay_reference_integrity` | `staging_item_ingest` | `blocked_reference_integrity` | `overlay_shadow_simulator_candidate_gate` | `return_to_staging_item_ingest_or_root_authority_source` |
| `overlay_shadow_simulator_candidate_gate` | `staging_overlay_reference_integrity` | `blocked_overlay_shadow_gate` | `manual_mechanics_review_same_battle` | `return_to_staging_overlay_reference_integrity` |
| `manual_mechanics_review_same_battle` | `overlay_shadow_simulator_candidate_gate` | `pending_after_shadow_candidate` | `table_backed_shadow_replay` | `return_to_manual_sample_acquisition_or_shadow_candidate` |
| `table_backed_shadow_replay` | `manual_mechanics_review_same_battle` | `blocked_until_shadow_and_review_pass` | `default_weight_update_review` | `return_to_candidate_weight_tuning_or_manual_review` |
| `default_weight_update_review` | `table_backed_shadow_replay` | `blocked_by_current_gates` | `separate_source_first_implementation_task` | `return_to_table_backed_shadow_replay` |

## 优化路径 (Optimization Lanes)

| 优先级 | 路径 | 当前状态 | 采用上限 |
| --- | --- | --- | --- |
| `P0` | `authority_mainline` | `blocked_on_1106013_authority` | `research_or_shadow_only` |
| `P0` | `manual_confirmed_battle_samples` | `available_as_non_authority_shadow_path` | `shadow_prior_candidate_until_authority_handoff_opens` |
| `P1` | `existing_default_estimator_weight_tuning` | `allowed_for_shadow_replay_only` | `shadow_only_unless_default_update_gate_opens` |
| `P1` | `shipping_clean_table_mechanics_diagnostics` | `diagnostics_only` | `diagnostic_or_shadow_only` |
| `P2` | `visual_catalog_priors_shadow_only` | `weak_prior_only` | `shadow_ranker_never_authority` |
| `P0_guardrail` | `stress_security_gate_validation` | `should_run_before_any_promotion` | `guardrail_required_for_all_lanes` |

### authority_mainline

- 优先级：`P0`
- 当前状态：`blocked_on_1106013_authority`
- 目标：解锁 sunken_ship 和 villa 的基于数据表的 BidKing 机制，不使用合成数据。
- 采用上限：`research_or_shadow_only`
- 路线：
  - root_authority_source_for_1106013
  - authority_intake_audit
  - staging_item_ingest
  - staging_overlay_reference_integrity
  - overlay_shadow_simulator_candidate_gate
  - manual_mechanics_review_same_battle
  - table_backed_shadow_replay
  - default_weight_update_review
- 受阻时需深挖的证据：
  - 开发者或服务端的数据表导出
  - 包含出处的完整旧版 StreamingAssets/Tables 压缩包
  - 原始的 1106013 行数据以及配套的 Drop.txt 上下文
- 回滚点：删除生成的权威/预发/影子构件；不修改任何运行时默认配置。

### manual_confirmed_battle_samples

- 优先级：`P0`
- 当前状态：`available_as_non_authority_shadow_path`
- 目标：在缺失物品的权威断层仍然关闭期间，通过人工确认的掉落数量/价值结果来改进先验数据。
- 采用上限：`shadow_prior_candidate_until_authority_handoff_opens`
- 路线：
  - 构建 P0 确认页面。
  - 摄入审核后的下载数据。
  - 构建人工确认权威移交门控。
  - 如果 accepted_sample_count 为零，则返回样本采集阶段。
  - 如果已接受样本通过一致性检查，则仅将其输入影子候选先验。
- 受阻时需深挖的证据：
  - 针对相同地图和战斗上下文的更多 P0 样本。
  - 仅在 P0 不再有足够未解决的高风险行之后，才处理 P1/P2。
  - 审核意见（解释拒绝原因、数量模糊性或 OCR/截图识别问题）。
- 回滚点：丢弃本次审核失败批次的导入 JSON 和影子候选输出。

### existing_default_estimator_weight_tuning

- 优先级：`P1`
- 当前状态：`allowed_for_shadow_replay_only`
- 目标：使用现有的已接受结算/重放证据微调当前的 alpha/数量/价值权重，而不依赖缺失的 BidKing 数据表。
- 采用上限：`shadow_only_unless_default_update_gate_opens`
- 路线：
  - 针对当前默认配置运行结算数量重放。
  - 按地图和品质识别稳定的残差。
  - 在候选配置中拟合极小的单地图增量。
  - 运行数量和价值的无回归测试。
  - 如果出现回归，回退到父级残差桶，并拆分数量/价值的变更。
- 受阻时需深挖的证据：
  - 带有明确时间戳的已接受结算样本。
  - 在多轮中重复出现的残差桶。
  - 在对全局先验进行任何更改之前，进行特定地图的对比。
- 回滚点：删除候选配置/重放报告；保持 default_config_bundle 不变。

### shipping_clean_table_mechanics_diagnostics

- 优先级：`P1`
- 当前状态：`diagnostics_only`
- 目标：使用未被 1106013 阻碍的地图（如 shipping）进行机制健全性检查，而不提升被阻碍的地图。
- 采用上限：`diagnostic_or_shadow_only`
- 路线：
  - 运行数据表引用完整性检查。
  - 仅选择引用完整性无误的地图。
  - 将恢复出的机制与当前的估算器先验进行对比。
  - 如果无误地图的行为出现分歧，在拟合权重前检查反编译语义。
  - 绝对不要利用无误地图的通过来提升处于受阻状态的 sunken_ship 或 villa。
- 受阻时需深挖的证据：
  - 无误地图的物品/数量/价值分布。
  - 所选地图的 DoDrop 或辅助语义。
  - 无误地图的同场战斗样本。
- 回滚点：删除在受阻分支之后生成的诊断报告。

### visual_catalog_priors_shadow_only

- 优先级：`P2`
- 当前状态：`weak_prior_only`
- 目标：仅利用目录、OCR 和视觉先验来对候选假设进行排序，而不占用权威所有权。
- 采用上限：`shadow_ranker_never_authority`
- 路线：
  - 构建视觉/目录先验报告。
  - 与人工审核样本进行交叉比对。
  - 仅在能够降低不确定性时，生成保守的影子候选。
  - 如果与源数据表或人工样本冲突，则返回人工确认阶段。
- 受阻时需深挖的证据：
  - 人工确认的物品身份。
  - 目录结构匹配置信度。
  - 表明视觉先验在不产生尾部回归的情况下降低了误差的重放记录。
- 回滚点：丢弃视觉先验候选构件。

### stress_security_gate_validation

- 优先级：`P0_guardrail`
- 当前状态：`should_run_before_any_promotion`
- 目标：在进行任何权重晋升之前，寻找薄弱的门控并对优化器行为进行压力测试。
- 采用上限：`guardrail_required_for_all_lanes`
- 路线：
  - 在测试中注入具有对抗性的缺失物品/引用案例。
  - 断言在遇到合成行、丢弃元组、陈旧构件和重放回归时，门控会失败关闭。
  - 检查求解器的预算上限以及源数据陈旧漂移。
  - 如果任何门控被错误开启，返回父级门控并优先修复防护测试。
- 受阻时需深挖的证据：
  - 针对每个晋升门控的定向测试。
  - 对由摘要拥有的陈旧状态进行静态检查。
  - 重放预算和超时证据。
- 回滚点：回退错误开启门控的候选版本；保留失败的测试作为阻碍因素。


## 决策节点详情 (Decision Node Details)

### root_authority_source_for_1106013

- 状态：`blocked_authority_gap`
- 目标：决定基于 BidKing 数据表的算法工作能否将缺失物品作为权威数据。
- 准入标准：
  - 任何优化器路径想要包含 sunken_ship 或 villa 的数据表机制。
  - 掉落/分组引用仍终结于物品 1106013。
- 所需证据：
  - 原始的 Tables/Item.txt 行，以 1106013 开头，后接制表符分隔的字段。
  - 客户端版本、服务端导出或完整的旧版 StreamingAssets/Tables 压缩包的出处。
  - 匹配的 Drop.txt 和地图上下文，展示该行如何参与分组 1066 或其继任者。
- 允许的行为：
  - 获取开发者或服务端的数据表导出。
  - 获取独立完整的旧版 StreamingAssets/Tables 压缩包。
  - 仅在出现新的数据源库存时，重新运行公开权威来源搜索。
- 禁止的行为：
  - 将 1106013 合成为权威数据。
  - 从相邻物品推导该行数据。
  - 为了解除地图受阻而丢弃元组。
  - 基于不完整的数据表更新默认权重。
- 成功后下一步：`authority_intake_audit`
- 失败后下一步：`jump_to_parallel_shadow_lanes_then_return_to_root`
- 受阻深挖：
  - 优先索要开发者/服务端数据表导出。
  - 仅搜索具有出处的完整数据表压缩包，而非孤立的复制行。
  - 将公开 Steam 旧清单路径设为低优先级，因为可见的 Item.txt 变更次数为零。
- 验证：
  - `npm run build:bidking-public-authority-source-search`
  - 检查 docs/research/2026-04-29-bidking-public-authority-source-search-report.json 的摘要和门控。
- 回滚点：删除任何新暂存的权威输入文件以及重新生成的权威研究报告。

### authority_intake_audit

- 状态：`blocked_until_authority_row_exists`
- 目标：将原始的外部数据行转化为经过审核的项目摄入候选，而不赋予其运行时权威。
- 准入标准：
  - 根权威来源已获取到带有出处的原始 1106013 Item.txt 行。
  - 该行数据足够完整，可在当前表结构元数据下解析。
- 所需证据：
  - 填好的权威摄入模板，包含原始行、来源路径、来源时间戳和审核意见。
  - 审核确认结构字段可解析，且物品 ID 确为 1106013。
  - 审核确认未使用任何合成字段。
- 允许的行为：
  - 运行缺失物品的权威摄入审核。
  - 仅在审核通过后创建预发候选。
  - 将出处和审核状态记录为源拥有的研究元数据。
- 禁止的行为：
  - 将原始行直接合并到默认数据表中。
  - 将未经审核的行标记为权威。
  - 跳过结构审核。
  - 更新默认配置。
- 成功后下一步：`staging_item_ingest`
- 失败后下一步：`return_to_root_authority_source_for_1106013`
- 受阻深挖：
  - 如果字段无法解析，检查结构元数据和来源压缩包的完整性。
  - 如果出处薄弱，返回来源获取阶段，而非放宽审核标准。
- 验证：
  - `npm run build:bidking-missing-item-authority-intake-audit`
  - `node --test tests/build_bidking_missing_item_authority_intake_audit_report.test.js`
- 回滚点：移除摄入的 JSON/模板输出，保持原始来源数据表不变。

### staging_item_ingest

- 状态：`blocked_until_intake_passes`
- 目标：将审核后的数据行摄入到一个预发覆盖层中，该覆盖层可以独立于默认表进行检查。
- 准入标准：
  - 权威摄入审核已通过。
  - 审核状态允许预发，但不允许赋予默认权威。
- 所需证据：
  - 预发输出中准确包含一次物品 1106013。
  - 预发输出与运行时/默认来源数据表分离。
  - 每个预发字段均从经过审核的来源证据中复制而来。
- 允许的行为：
  - 运行缺失物品预发摄入报告。
  - 保留原始数据表文件。
  - 仅将预发覆盖层用于影子分析。
- 禁止的行为：
  - 编辑运行时的 Item.txt。
  - 将预发覆盖层提升为默认配置。
  - 使用估算器先验填充缺失字段。
  - 删除掉落引用。
- 成功后下一步：`staging_overlay_reference_integrity`
- 失败后下一步：`return_to_authority_intake_audit`
- 受阻深挖：
  - 如果出现重复或缺失的预发数据行，检查摄入映射和原始输入。
  - 如果字段不完整，返回权威摄入，而非允许部分覆盖。
- 验证：
  - `npm run build:bidking-missing-item-staging-ingest`
  - `node --test tests/build_bidking_missing_item_staging_ingest_report.test.js`
- 回滚点：删除预发摄入输出和重新生成的覆盖层诊断信息。

### staging_overlay_reference_integrity

- 状态：`blocked_reference_integrity`
- 目标：在运行任何基于数据表的重放之前，证明预发层解决了与项目相关的末端引用。
- 准入标准：
  - 预发覆盖层包含物品 1106013。
  - 项目范围地图为 shipping、sunken_ship 和 villa。
- 所需证据：
  - 覆盖后不存在未解决的项目相关缺失物品 ID。
  - sunken_ship 和 villa 不再因缺少末端物品引用而受阻。
  - 项目范围内的引用完整性报告是清洁无误的。
- 允许的行为：
  - 运行预发覆盖层引用完整性构建器。
  - 保持引用未解决的地图处于受阻状态。
  - 仅允许无误的地图进入影子模拟器。
- 禁止的行为：
  - 忽略未解决的项目缺失物品 ID。
  - 从摘要层单方面宣告地图无误。
  - 为受阻的地图更新权重。
  - 为了解除地图受阻而丢弃元组。
- 成功后下一步：`overlay_shadow_simulator_candidate_gate`
- 失败后下一步：`return_to_staging_item_ingest_or_root_authority_source`
- 受阻深挖：
  - 如果 1106013 仍未解决，返回预发摄入并审计原始行覆盖率。
  - 如果仅部分地图无误，将无误地图的诊断与受阻地图的晋升剥离开来。
- 验证：
  - `npm run build:bidking-staging-overlay-reference-integrity`
  - `node --test tests/build_bidking_staging_overlay_reference_integrity_report.test.js`
- 回滚点：移除预发覆盖层输出；不触碰默认配置或源数据表。

### overlay_shadow_simulator_candidate_gate

- 状态：`blocked_overlay_shadow_gate`
- 目标：在引用完整性无误后，开启影子模拟器候选。
- 准入标准：
  - 项目范围内的预发覆盖层引用完整性无误。
  - 未发生运行时/默认表变更。
- 所需证据：
  - 允许覆盖层影子模拟器候选门控。
  - 候选版本记录其准确的预发层源构件版本。
  - 候选版本在晋升中排除任何受阻地图。
- 允许的行为：
  - 运行覆盖层影子模拟器门控。
  - 生成 SIM_ONLY 候选构件。
  - 在重放和人工审核通过前，将候选版本排除在默认运行时之外。
- 禁止的行为：
  - 将影子候选版本作为运行时权威使用。
  - 跳过同场战斗审核。
  - 在重放前更新默认权重。
  - 未经门控便合并候选版本。
- 成功后下一步：`manual_mechanics_review_same_battle`
- 失败后下一步：`return_to_staging_overlay_reference_integrity`
- 受阻深挖：
  - 如果门控仍然关闭，在调整策略权重前，检查未解决的覆盖层阻碍因素。
  - 如果仅 shipping 无误，继续进行 shipping 诊断，但保持 sunken_ship/villa 处于受阻状态。
- 验证：
  - `npm run build:bidking-overlay-shadow-simulator-gate`
  - `node --test tests/build_bidking_overlay_shadow_simulator_gate_report.test.js`
- 回滚点：删除覆盖层影子候选输出；无需更改运行时文件。

### manual_mechanics_review_same_battle

- 状态：`pending_after_shadow_candidate`
- 目标：验证恢复出的 BidKing 机制是否与人工确认的同场战斗表现相符。
- 准入标准：
  - 允许覆盖层影子模拟器候选。
  - 针对项目地图存在人工机制审核模板。
- 所需证据：
  - 人工确认的战斗/数量样本，包含地图 ID、可见数量和结算结果。
  - 现有估算器与 BidKing 机制候选版本之间的同场战斗对比。
  - 针对特定地图分歧的审核意见。
- 允许的行为：
  - 构建 P0/P1/P2 人工确认页面。
  - 仅通过专用的摄入入口点来摄入审核后的下载数据。
  - 使用已接受样本校准影子先验。
- 禁止的行为：
  - 将未确认的样本视为权威。
  - 重复使用已被拒绝的审核数据行。
  - 混淆 P0/P1/P2 的优先级。
  - 仅凭单轮带噪音的数据进行提升。
- 成功后下一步：`table_backed_shadow_replay`
- 失败后下一步：`return_to_manual_sample_acquisition_or_shadow_candidate`
- 受阻深挖：
  - 如果 P0 接受样本为零，在重放前继续扩充审核覆盖率。
  - 如果样本证据与数据表机制冲突，在拟合权重前检查重放输入。
- 验证：
  - `npm run build:p0-manual-count-confirmation-results`
  - `npm run ingest:p0-manual-confirmation`
  - `npm run build:p0-manual-confirmation-authority-handoff-gate`
- 回滚点：丢弃最新的手动确认导入数据及影子候选构件。

### table_backed_shadow_replay

- 状态：`blocked_until_shadow_and_review_pass`
- 目标：在考虑使用默认值之前，针对重放证据运行基于数据表的算法/权重候选方案。
- 准入标准：
  - 引用完整性无误。
  - 允许影子候选门控。
  - 人工同场战斗审核已获得接受的样本。
- 所需证据：
  - 数量重放对比现有默认估算器表现出无回归。
  - 价值重放没有增加红/橙色尾部误差。
  - 求解器预算和运行时间保持在配置上限之下。
- 允许的行为：
  - 在影子配置中拟合 alpha/数量先验。
  - 运行结算数量重放和价值重放。
  - 保持候选版本处于重放门控之后。
- 禁止的行为：
  - 重放失败时更改默认配置。
  - 在没有进行样本外 (OOS) 检查的情况下，过度拟合到单一地图。
  - 为了通过重放而移除预算上限。
  - 忽视红尾部回归。
- 成功后下一步：`default_weight_update_review`
- 失败后下一步：`return_to_candidate_weight_tuning_or_manual_review`
- 受阻深挖：
  - 如果数量改善但价值回归，将数量先验与价值模型变更剥离。
  - 如果某个地图发生回归，隔离该地图专属的先验，而非改变全局默认配置。
- 验证：
  - `npm run build:bidking-table-backed-shadow-simulator`
  - `npm run build:settlement-count-replay`
  - `npm run build:settlement-replay`
- 回滚点：删除影子候选配置/重放构件；保持 default_config_bundle 不变。

### default_weight_update_review

- 状态：`blocked_by_current_gates`
- 目标：仅将无回归的、有数据源支持的增量推进到默认权重实现评审中。
- 准入标准：
  - 基于数据表的影子重放通过了无回归门控。
  - 明确允许权威移交。
  - 默认配置更新门控已开启。
- 所需证据：
  - 已接受样本计数和受阻的条目计数均归源拥有。
  - 重放报告标明了准确更改的权重以及未更改的地图。
  - 回滚目标为前一个默认配置的源码版本。
- 允许的行为：
  - 创建一个极小的默认权重实现候选方案。
  - 运行包级别的 JS 检查和定向算法测试。
  - 仅在获得独立的发布授权后才予以发布。
- 禁止的行为：
  - 未经门控便编辑默认配置。
  - 混合使用权威与视觉先验且未加标签。
  - 在评估中剔除失败的地图。
  - 基于研究构件进行部署。
- 成功后下一步：`separate_source_first_implementation_task`
- 失败后下一步：`return_to_table_backed_shadow_replay`
- 受阻深挖：
  - 如果默认更新门控关闭，报告阻碍因素并保持候选方案仅在影子模式下运行。
  - 如果权威移交关闭，在修改代码前先修复源拥有的移交证据。
- 验证：
  - `node --test tests/bidking_algorithm_weight_integration.test.js`
  - `npm run check:js`
  - `npm test`
- 回滚点：仅回滚默认配置候选文件；保留研究构件以供审计。


## 回溯规则 (Backtracking Rules)

| 阻碍点 | 跳转回 | 下一步深挖 | 禁止行为 |
| --- | --- | --- | --- |
| `authority_gap` | `root_authority_source_for_1106013` | 开发者/服务端数据表导出；有出处的完整旧数据表包；仅将人工样本作为影子证据 | 合成物品数据行；丢弃未解决的元组；更新默认配置 |
| `manual_sample_gap` | `manual_confirmed_battle_samples` | 更多 P0 样本；采集/视觉模糊性评审；P0 不再占主导风险后再考虑 P1/P2 | 将草案样本视为已接受；混淆优先级；基于单轮带噪数据进行拟合 |
| `shadow_replay_regression` | `table_backed_shadow_replay` | 剥离数量先验与价值模型；隔离特定地图增量；恢复前一候选版本并重跑重放 | 移除预算上限；提升部分通过的方案；隐瞒回归地图 |
| `source_consumer_drift` | `source_artifact_builder` | 重建源构件；修复构建器输入契约；让摘要/UI 重新作为只读消费者 | 人工修补摘要输出；将聊天/记忆视为源；在 UI 中推导门控状态 |

## 决议 (Decision)

当前安全的路线是：在 `1106013` 权威断层解决并且重放门控通过之前，将所有基于 BidKing 数据表的算法和权重变更保留在研究或影子专用的构件中。如果任何路径受阻，跳转到其父级证据断层，深化该证据，之后方可重新进入子路径。
