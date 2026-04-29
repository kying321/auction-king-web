# 竞拍之王 - 沉船图高难 - 5回合实时拟合脚本

输入顺序：
- R1: 总数量 + 蓝色数量
- R2: 默认只看橙色均格；需要时再补紫色数量
- R3: 绿色数量 + 紫色均格
- R4: 蓝色均格
- R5: 绿白总数

R5 现在支持两种方式：
- `r5 <绿白总数>`
- `r5 <绿白总数> <白色件数>`

启动：
```bash
python legacy/python/auction_king_sunken_ship_realtime.py
```

常用命令：
```bash
r1 28 5
r2 2.33
r2 2.33 4
r3 6 2.25
r4 1.80
r5 12
r5 12 5
bid 18800
save_families my_families.json
load_families my_families.json
```

每一轮输入后都会立即输出：
1. 橙色数量概率分布
2. 红色数量概率分布
3. 红色格子概率分布与区间
4. 红件类型模板后验（小红 / 大红 / 金）
5. 家族后验（文物 / 家居等启动模板）
6. 各颜色格子估计
7. 即时估值区间
8. 若已设置出价，则输出损益比、盈利概率、ROI

默认 config 只是启动模板。你应该用自己的沉船图高难样本替换：
- alpha_counts
- cells_per_item
- value_model
- red_type_profiles
- collection_families

如果你现在只想校准家族层，不想改整份配置，直接用：
- `save_families <path>` 导出当前 `collection_families`
- `load_families <path>` 只替换 `collection_families`
- 仓库内现成样板： `my_families.json`
- 样本记录模板： `family_calibration_template.csv`
- 建议生成命令：`python legacy/python/suggest_family_calibration.py family_calibration_template.csv my_families.json my_families_suggested.json`

件数字段现在会做整数校验；像 `r1 12.5 2` 或 `set r2_purple_count 3.5` 这类输入会直接报错，而不是在枚举阶段崩掉。

红色格子后验现在是显式离散质量，不再只靠 `均值 + 区间` 近似：
- 报告会直接展示红格概率分布
- 红件模板后验会基于这条离散分布混合
- 家族后验会基于同一条红格离散分布混合
- 估值 MC 会优先从离散红格后验抽样
- 红件估值会把 `collection_families.value_bias` 一起吃进去
