
# Auction King 项目说明

## 结构

- `index.html` / `style.css` / `src/browser/app.js`: 静态前端页面与交互。
- `src/core/estimator.js`: 前端版求解器与估值逻辑，当前单元测试主要覆盖这里。
- `src/browser/role_strategy.js`: 基于联网攻略与社区反馈整理出的角色策略层。
- `legacy/python/auction_king_sunken_ship_realtime.py`: 5 回合实时拟合 CLI 版本。
- `legacy/python/auction_king_sunken_ship_estimator.py`: 更通用的离线估值脚本。
- `tests/`: Node 原生测试。

## Web 版使用

直接用浏览器打开 `index.html` 即可，无需构建。

当前页面默认主视角固定为 `艾哈默德`，按五回合情报链做精算：

- R1: 总件数 + 蓝色数量
- R2: 默认只看橙色均格；需要时再补紫色数量
- R3: 紫色均格 + 绿色数量
- R4: 蓝色平均格数
- R5: 绿色 + 白色总数量

当前 web 端已支持 3 个地图 preset：

- `沉船图`：默认高难模板
- `别墅图`：低红低橙、偏家居的保守模板
- `航运区`：高价值稀缺件偏多的模板

切换地图会实际覆盖底层 `alpha_counts / cells_per_item / value_model / red_type_profiles / collection_families`，不是纯 UI 文案切换。

R5 支持两种约束方式：

- 只填 `绿+白总和`
- 同时填 `绿+白总和` 和 `白色件数`，进一步收缩状态空间

新增角色策略视角：

- 艾哈默德：默认主视角，重点看 `橙色数量分布 -> 红色数量分布 -> 红色格数分布 -> 红件类型模板 -> 估值`
  其中红色格数分布现在是显式离散后验，并会继续映射到 `小红 / 大红 / 金` 启动模板，给终值估算补一层件均/格均锚点
- 伊森：偏轮廓/布局型，适合中盘收敛后按版型定价
- 索菲：偏抽样/均值型，适合第 3-4 轮前压
- 拉文：偏终局定锤型，建议拖到第 5 轮
- 艾莎 / 伊莎贝拉 / 吴起灵：分别对应层级筛仓、见红捡漏、专精图谱三类打法

更完整的来源整理见 `docs/research/2026-04-21-bidking-role-guide-notes.md`。
地图/藏品数据层的审计见 `docs/research/2026-04-21-ahmed-map-data-audit.md`。

## 测试

```bash
npm test
npm run check:js
npm run build:static
```

不依赖第三方测试框架，默认使用 Node 内置 `node:test`。
当前已覆盖 `R2 默认无紫数` 的核心逻辑与输入框同步行为，但还没有完整浏览器 E2E。

## Cloudflare 挂载预备

当前项目已经收口成可直接部署到 Cloudflare 静态资产的形态：

```bash
npm run build:static
```

这会生成 `dist/`，只包含实际页面所需文件：

- `index.html`
- `style.css`
- `src/browser/`
- `src/core/`
- `src/research/`

仓库根目录已提供 `wrangler.toml`，默认按 Cloudflare Workers Static Assets 指向 `./dist`。
等你确认子域名前缀和目标承载方式后，可以直接接 `ak.fuuu.fun` 这类自定义域名。

## Python CLI 版使用

### 启动

```bash
python legacy/python/auction_king_sunken_ship_estimator.py
```

当前离线 Python CLI 也已支持 `红件类型模板后验`，并且红格推断已改成显式离散质量，会把红区继续映射到 `小红 / 大红 / 金` 启动模板，再给估值区间。现在它还会额外输出 `家族后验`，并把 `collection_families.value_bias` 接进红件估值。

### 首次建议操作

进入脚本后执行：

```bash
guide
```

### 常用命令

```bash
help
state
recompute
r1 24 5
r2 2.58
r2 2.58 3
r3 8 2.18
r4 1.76
r5 13
r5 13 4
set total_items 24
set avg_o 2.58
set avg_p 2.18
set avg_b 1.76
set avg_g 1.42
set known_sum_wg 13
set known_b 5
set total_grid_low 92
set total_grid_high 104
set bid_price 18800
recompute
```

如果你按艾哈默德 5 回合链路录入，优先用 `r1 -> r2 -> r3 -> r4 -> r5`。
`r1 -> r5` 每次录入后会自动重算；`set ...` 仍然保留，适合补录、修正或做离线试算。

### 保存/读取

```bash
save_state my_state.json
load_state my_state.json

save_config my_config.json
load_config my_config.json

save_families my_families.json
load_families my_families.json
```

如果你现在只想校准家族层，不想改整份配置，优先用 `save_families / load_families`。
仓库里已经放了一份可直接修改的样板 `my_families.json`。
样本记录模板在 `family_calibration_template.csv`。

最小校准流程：
1. 每局结束后往 `family_calibration_template.csv` 追加一行。
2. 至少积累 5 到 10 条同图样本后，执行：

```bash
python legacy/python/suggest_family_calibration.py family_calibration_template.csv my_families.json my_families_suggested.json
```

3. 用 `load_families my_families_suggested.json` 试跑。
4. `family_revealed` 主要校 `prior`，`red_type_revealed` 主要校 `red_type_bias`，`final_total_value` 只做一个很轻的 `value_bias` 建议，不替代人工判断。

## 校准说明

默认参数只是启动模板。要提高估值区间和损益比质量，仍然需要用你自己的“沉船图高难”样本替换：

- `alpha_counts`
- `cells_per_item`
- `value_model`
- `red_type_profiles`
- `collection_families`

当前 `collection_families` 已经进入 web 端估值层：

- 会给 `小红 / 大红 / 金` 模板先验加地图条件化偏置
- 会给红件估值乘上家族级 `value_bias`
- 会在页面里额外展示“地图家族价值混合”

它仍然**没有进入颜色件数后验本身**；也就是说现在改的是 `红件模板 / 估值` 层，不是 `橙数 / 红数` 的计数求解层。
