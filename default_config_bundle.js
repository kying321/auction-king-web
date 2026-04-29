const AUCTION_KING_DEFAULT_CONFIG = {
    "app": {
        "title": "竞拍之王 | 手填模板工作台",
        "default_map_id": "sunken_ship",
        "default_template_id": "ahmed_default",
        "config_source_version": "ak_workspace_v2_20260428_sunken_red_tail_refit_v2"
    },
    "fields": {
        "items": [
            {
                "id": "total_items",
                "label": "总数量",
                "short_help": "本局拍品总件数",
                "family": "aggregate",
                "metric": "count",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "total_storage_cells",
                "label": "总格数",
                "short_help": "本局仓储总占格",
                "family": "aggregate",
                "metric": "total_cells",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "total_value",
                "label": "总价值",
                "family": "aggregate",
                "metric": "total_value",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": false
            },
            {
                "id": "system_avg_value_type_count",
                "label": "系统均价类型数",
                "short_help": "系统均价提示覆盖的藏品类型数量，仅作为回放证据保留",
                "family": "aggregate",
                "metric": "type_count",
                "input_mode": "integer",
                "participates_in_solver": false,
                "participates_in_valuation": false
            },
            {
                "id": "system_avg_value_per_cell",
                "label": "系统每格均价",
                "short_help": "系统提示的本场占位每格均价，数值为四舍五入近似值",
                "family": "aggregate",
                "metric": "avg_value",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": true
            },
            {
                "id": "bid",
                "label": "出价",
                "family": "aggregate",
                "metric": "bid",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": true
            },
            {
                "id": "white_count",
                "label": "白色数量",
                "family": "quality",
                "quality": "w",
                "metric": "count",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "white_avg_cells",
                "label": "白色均格",
                "family": "quality",
                "quality": "w",
                "metric": "avg_cells",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": false
            },
            {
                "id": "white_total_cells",
                "label": "白色总格",
                "family": "quality",
                "quality": "w",
                "metric": "total_cells",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "white_avg_value",
                "label": "白色平均价值",
                "family": "quality",
                "quality": "w",
                "metric": "avg_value",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": false
            },
            {
                "id": "white_total_value",
                "label": "白色全部价值",
                "family": "quality",
                "quality": "w",
                "metric": "total_value",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": false
            },
            {
                "id": "green_count",
                "label": "绿色数量",
                "family": "quality",
                "quality": "g",
                "metric": "count",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "green_avg_cells",
                "label": "绿色均格",
                "family": "quality",
                "quality": "g",
                "metric": "avg_cells",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": false
            },
            {
                "id": "green_total_cells",
                "label": "绿色总格",
                "family": "quality",
                "quality": "g",
                "metric": "total_cells",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "green_avg_value",
                "label": "绿色平均价值",
                "family": "quality",
                "quality": "g",
                "metric": "avg_value",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": false
            },
            {
                "id": "green_total_value",
                "label": "绿色全部价值",
                "family": "quality",
                "quality": "g",
                "metric": "total_value",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": false
            },
            {
                "id": "blue_count",
                "label": "蓝色数量",
                "short_help": "已观测到的蓝色件数",
                "family": "quality",
                "quality": "b",
                "metric": "count",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "blue_avg_cells",
                "label": "蓝色均格",
                "short_help": "蓝色拍品平均占格",
                "family": "quality",
                "quality": "b",
                "metric": "avg_cells",
                "input_mode": "decimal",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "blue_total_cells",
                "label": "蓝色总格",
                "family": "quality",
                "quality": "b",
                "metric": "total_cells",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "blue_avg_value",
                "label": "蓝色平均价值",
                "family": "quality",
                "quality": "b",
                "metric": "avg_value",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": false
            },
            {
                "id": "blue_total_value",
                "label": "蓝色全部价值",
                "family": "quality",
                "quality": "b",
                "metric": "total_value",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": false
            },
            {
                "id": "purple_count",
                "label": "紫色数量",
                "family": "quality",
                "quality": "p",
                "metric": "count",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "purple_avg_cells",
                "label": "紫色均格",
                "short_help": "紫色拍品平均占格",
                "family": "quality",
                "quality": "p",
                "metric": "avg_cells",
                "input_mode": "decimal",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "purple_total_cells",
                "label": "紫色总格",
                "family": "quality",
                "quality": "p",
                "metric": "total_cells",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "purple_avg_value",
                "label": "紫色平均价值",
                "family": "quality",
                "quality": "p",
                "metric": "avg_value",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": true
            },
            {
                "id": "purple_total_value",
                "label": "紫色全部价值",
                "family": "quality",
                "quality": "p",
                "metric": "total_value",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": false
            },
            {
                "id": "orange_count",
                "label": "金色数量",
                "family": "quality",
                "quality": "o",
                "metric": "count",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "orange_avg_cells",
                "label": "金色均格",
                "short_help": "金色拍品平均占格",
                "family": "quality",
                "quality": "o",
                "metric": "avg_cells",
                "input_mode": "decimal",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "orange_total_cells",
                "label": "金色总格",
                "family": "quality",
                "quality": "o",
                "metric": "total_cells",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "orange_avg_value",
                "label": "金色平均价值",
                "family": "quality",
                "quality": "o",
                "metric": "avg_value",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": true
            },
            {
                "id": "orange_total_value",
                "label": "金色全部价值",
                "family": "quality",
                "quality": "o",
                "metric": "total_value",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": false
            },
            {
                "id": "red_count",
                "label": "红色数量",
                "family": "quality",
                "quality": "r",
                "metric": "count",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "red_avg_cells",
                "label": "红色均格",
                "family": "quality",
                "quality": "r",
                "metric": "avg_cells",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": false
            },
            {
                "id": "red_total_cells",
                "label": "红色总格",
                "family": "quality",
                "quality": "r",
                "metric": "total_cells",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "red_avg_value",
                "label": "红色平均价值",
                "family": "quality",
                "quality": "r",
                "metric": "avg_value",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": true
            },
            {
                "id": "red_total_value",
                "label": "红色全部价值",
                "family": "quality",
                "quality": "r",
                "metric": "total_value",
                "input_mode": "decimal",
                "participates_in_solver": false,
                "participates_in_valuation": false
            },
            {
                "id": "white_green_total_cells",
                "label": "绿白总格数",
                "short_help": "绿色与白色合计占格",
                "family": "combo",
                "metric": "total_cells",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "white_green_avg_cells",
                "label": "绿白均格",
                "short_help": "绿白拍品平均占格",
                "family": "combo",
                "metric": "avg_cells",
                "input_mode": "decimal",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "white_green_total_count",
                "label": "绿白总数量",
                "family": "combo",
                "metric": "count",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "orange_count_min",
                "label": "金色数量下界",
                "family": "constraint",
                "metric": "min_count",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "orange_count_max",
                "label": "金色数量上界",
                "family": "constraint",
                "metric": "max_count",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "red_count_min",
                "label": "红色数量下界",
                "family": "constraint",
                "metric": "min_count",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            },
            {
                "id": "red_count_max",
                "label": "红色数量上界",
                "family": "constraint",
                "metric": "max_count",
                "input_mode": "integer",
                "participates_in_solver": true,
                "participates_in_valuation": false
            }
        ]
    },
    "templates": {
        "allow_local_clone": true,
        "builtins": [
            {
                "id": "ahmed_default",
                "label": "Ahmed 默认模板",
                "description": "按总数量 -> 金色均格 -> 蓝色数量 -> 紫色均格 -> 绿白总格数 -> 绿白均格 -> 蓝色均格 -> 总格数的手填链组织。",
                "groups": [
                    {
                        "id": "core",
                        "label": "核心链路"
                    }
                ],
                "fields": [
                    {
                        "field_id": "total_items",
                        "group_id": "core",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "orange_avg_cells",
                        "group_id": "core",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "blue_count",
                        "group_id": "core",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "purple_avg_cells",
                        "group_id": "core",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "white_green_total_cells",
                        "group_id": "core",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "white_green_avg_cells",
                        "group_id": "core",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "blue_avg_cells",
                        "group_id": "core",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "total_storage_cells",
                        "group_id": "core",
                        "recommended": true,
                        "default_visible": true
                    }
                ]
            },
            {
                "id": "generic_full_observation",
                "label": "全观察模板",
                "description": "展开更多数量/均格/总格字段，适合复盘和全量手填。",
                "groups": [
                    {
                        "id": "counts",
                        "label": "数量"
                    },
                    {
                        "id": "cells",
                        "label": "格数"
                    },
                    {
                        "id": "value",
                        "label": "价值"
                    }
                ],
                "fields": [
                    {
                        "field_id": "total_items",
                        "group_id": "counts",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "white_count",
                        "group_id": "counts",
                        "recommended": false,
                        "default_visible": true
                    },
                    {
                        "field_id": "green_count",
                        "group_id": "counts",
                        "recommended": false,
                        "default_visible": true
                    },
                    {
                        "field_id": "blue_count",
                        "group_id": "counts",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "purple_count",
                        "group_id": "counts",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "orange_count",
                        "group_id": "counts",
                        "recommended": false,
                        "default_visible": true
                    },
                    {
                        "field_id": "red_count",
                        "group_id": "counts",
                        "recommended": false,
                        "default_visible": true
                    },
                    {
                        "field_id": "white_green_total_count",
                        "group_id": "counts",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "white_green_total_cells",
                        "group_id": "cells",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "white_green_avg_cells",
                        "group_id": "cells",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "blue_avg_cells",
                        "group_id": "cells",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "purple_avg_cells",
                        "group_id": "cells",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "orange_avg_cells",
                        "group_id": "cells",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "total_storage_cells",
                        "group_id": "cells",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "system_avg_value_per_cell",
                        "group_id": "value",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "purple_avg_value",
                        "group_id": "value",
                        "recommended": false,
                        "default_visible": true
                    },
                    {
                        "field_id": "orange_avg_value",
                        "group_id": "value",
                        "recommended": false,
                        "default_visible": true
                    },
                    {
                        "field_id": "red_avg_value",
                        "group_id": "value",
                        "recommended": false,
                        "default_visible": true
                    },
                    {
                        "field_id": "total_value",
                        "group_id": "value",
                        "recommended": false,
                        "default_visible": true
                    },
                    {
                        "field_id": "bid",
                        "group_id": "value",
                        "recommended": true,
                        "default_visible": true
                    }
                ]
            },
            {
                "id": "value_focus",
                "label": "价值观察模板",
                "description": "把出价、各品质均价和总价值放在前面，适合高预算精细估值。",
                "groups": [
                    {
                        "id": "solver",
                        "label": "核心约束"
                    },
                    {
                        "id": "value",
                        "label": "价值观察"
                    }
                ],
                "fields": [
                    {
                        "field_id": "total_items",
                        "group_id": "solver",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "orange_avg_cells",
                        "group_id": "solver",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "purple_avg_cells",
                        "group_id": "solver",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "blue_count",
                        "group_id": "solver",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "white_green_total_cells",
                        "group_id": "solver",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "system_avg_value_per_cell",
                        "group_id": "value",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "purple_avg_value",
                        "group_id": "value",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "orange_avg_value",
                        "group_id": "value",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "red_avg_value",
                        "group_id": "value",
                        "recommended": true,
                        "default_visible": true
                    },
                    {
                        "field_id": "total_value",
                        "group_id": "value",
                        "recommended": false,
                        "default_visible": true
                    },
                    {
                        "field_id": "bid",
                        "group_id": "value",
                        "recommended": true,
                        "default_visible": true
                    }
                ]
            }
        ]
    },
    "roles": {
        "default_role_id": "ahmed",
        "profiles": {
            "ahmed": {
                "id": "ahmed",
                "label": "艾哈默德",
                "archetype": "五回合情报链精算流",
                "preferredRounds": [
                    2,
                    3,
                    4,
                    5
                ],
                "factors": {
                    "cold": 0.9,
                    "steady": 1,
                    "hot": 1.06
                },
                "sourceCue": "按当前项目约定，艾哈默德主链为：R1总数+蓝数，R2看橙均格并记录绿白总格，紫件/橙件属于高精度补充，R3看绿白均格与紫均格，R4看蓝均格并可选总仓储空间，R5再用白绿拆分补尾。"
            },
            "ethan": {
                "id": "ethan",
                "label": "伊森",
                "archetype": "轮廓布局流",
                "preferredRounds": [
                    3,
                    4
                ],
                "factors": {
                    "cold": 0.86,
                    "steady": 0.94,
                    "hot": 1
                },
                "sourceCue": "官网称其“构建空间矩阵，能够瞬间计算出布局轮廓”；B站已有“伊森沉船公式化打法”实战视频。"
            },
            "sophie": {
                "id": "sophie",
                "label": "索菲",
                "archetype": "抽样均值流",
                "preferredRounds": [
                    3,
                    4
                ],
                "factors": {
                    "cold": 0.9,
                    "steady": 1,
                    "hot": 1.08
                },
                "sourceCue": "官网强调其“精通各类珍品”；玩家实战反馈里，索菲常用“随机五个/四均”在第3-4轮秒仓。"
            },
            "raven": {
                "id": "raven",
                "label": "拉文",
                "archetype": "终局定锤流",
                "preferredRounds": [
                    5
                ],
                "factors": {
                    "cold": 0.84,
                    "steady": 0.94,
                    "hot": 1.02
                },
                "sourceCue": "官网写法是“静观全场博弈，于终局时刻一锤定音”；社区反馈也集中指出其前中期容易被做局。"
            },
            "aisha": {
                "id": "aisha",
                "label": "艾莎",
                "archetype": "层级侦察流",
                "preferredRounds": [
                    1,
                    2,
                    3
                ],
                "factors": {
                    "cold": 0.82,
                    "steady": 0.9,
                    "hot": 0.97
                },
                "sourceCue": "官网写其能发现低价值目标；开发者采访补充她更像“看仓深、看是否存在紫色以上”的层级侦察。"
            },
            "isabella": {
                "id": "isabella",
                "label": "伊莎贝拉",
                "archetype": "见红捡漏流",
                "preferredRounds": [
                    1,
                    2,
                    3
                ],
                "factors": {
                    "cold": 0.88,
                    "steady": 0.97,
                    "hot": 1.08
                },
                "sourceCue": "官网主打“稀缺性孤品”；社区帖提到她一度能“开局见红，还能看到是什么红”。"
            },
            "wuqiling": {
                "id": "wuqiling",
                "label": "吴起灵",
                "archetype": "专精图谱流",
                "preferredRounds": [
                    2,
                    3,
                    4
                ],
                "factors": {
                    "cold": 0.86,
                    "steady": 0.95,
                    "hot": 1.04
                },
                "sourceCue": "官网描述为“层层揭示文玩古董的信息”；采访点名吴起灵高价出手时容易把其他人拖进杀猪盘。"
            }
        }
    },
    "maps": {
        "sunken_ship": {
            "label": "沉船图",
            "map_name": "沉船图-高难-互联网校准v1",
            "submaps": [
                {
                    "id": "unknown_wreck",
                    "label": "未知残骸"
                },
                {
                    "id": "ocean_liner_hold",
                    "label": "远洋客轮仓房"
                },
                {
                    "id": "military_vault",
                    "label": "军用舰艇保险库"
                },
                {
                    "id": "cold_chain_quarantine",
                    "label": "冷链货船隔离舱"
                },
                {
                    "id": "colonial_treasure_hold",
                    "label": "殖民商船宝库"
                },
                {
                    "id": "explorer_archive",
                    "label": "探险家座舰资料库"
                },
                {
                    "id": "royal_supply_hold",
                    "label": "皇家御用货仓"
                },
                {
                    "id": "biolab_sample_vault",
                    "label": "生物实验室样本库"
                }
            ],
            "alpha_counts": {
                "w": 5.2,
                "g": 6.62,
                "b": 8.5,
                "p": 2.95,
                "o": 1.25,
                "r": 0.8
            },
            "solver": {
                "count_prior_strength": 2.4,
                "open_high_orange_avg_threshold": 4,
                "open_high_orange_avg_count_prior_strength": 1.4
            },
            "cells_per_item": {
                "w": {
                    "mean": 1.6338,
                    "sd": 1.1307,
                    "min": 1,
                    "max": null
                },
                "g": {
                    "mean": 2.0379,
                    "sd": 1.333,
                    "min": 1,
                    "max": null
                },
                "b": {
                    "mean": 2.5705,
                    "sd": 1.8377,
                    "min": 1,
                    "max": null
                },
                "p": {
                    "mean": 2.7773,
                    "sd": 1.8794,
                    "min": 1,
                    "max": null
                },
                "o": {
                    "mean": 3.1784,
                    "sd": 2.3,
                    "min": 1,
                    "max": null
                },
                "r": {
                    "mean": 2.5984,
                    "sd": 2,
                    "min": 1,
                    "max": null
                }
            },
            "value_model": {
                "w": {
                    "base_item_mean": 700,
                    "base_item_sd": 220,
                    "per_cell_mean": 260,
                    "per_cell_sd": 70
                },
                "g": {
                    "base_item_mean": 1700,
                    "base_item_sd": 500,
                    "per_cell_mean": 520,
                    "per_cell_sd": 140
                },
                "b": {
                    "base_item_mean": 3900,
                    "base_item_sd": 1100,
                    "per_cell_mean": 1100,
                    "per_cell_sd": 300
                },
                "p": {
                    "base_item_mean": 9000,
                    "base_item_sd": 2200,
                    "per_cell_mean": 2300,
                    "per_cell_sd": 600
                },
                "o": {
                    "base_item_mean": 20000,
                    "base_item_sd": 4800,
                    "per_cell_mean": 4300,
                    "per_cell_sd": 950
                },
                "r": {
                    "base_item_mean": 128000,
                    "base_item_sd": 48000,
                    "per_cell_mean": 0,
                    "per_cell_sd": 0
                }
            },
            "value_model_refit": {
                "change_class": "SIM_ONLY",
                "source": "docs/research/2026-04-28-sunken-red-tail-refit-v2-backtest.json",
                "notes": [
                    "2026-04-28 settlement screenshots showed systematic underpricing of compact and large red outcomes.",
                    "Applied after catalog authority calibration so map-specific live defaults keep the red-tail pressure correction.",
                    "v2 incorporates new 2026-04-28 settlement screenshots; red count pressure and red type means are pulled back while keeping a wide tail band."
                ],
                "value_model": {
                    "p": {
                        "base_item_mean": 10631,
                        "base_item_sd": 6182,
                        "per_cell_mean": 0,
                        "per_cell_sd": 0,
                        "value_basis": "catalog_reported_item_mean"
                    },
                    "o": {
                        "base_item_mean": 53737,
                        "base_item_sd": 33642,
                        "per_cell_mean": 0,
                        "per_cell_sd": 0,
                        "value_basis": "catalog_reported_item_mean"
                    },
                    "r": {
                        "base_item_mean": 149381,
                        "base_item_sd": 56098,
                        "per_cell_mean": 0,
                        "per_cell_sd": 0,
                        "value_basis": "catalog_tail_aware_common_item_mean",
                        "tail_model": {
                            "battle_probability": 0.14,
                            "replacement_item_mean": 149381
                        }
                    }
                }
            },
            "red_type_profiles": {
                "profiles": {
                    "small_red": {
                        "label": "小红",
                        "prior": 0.66,
                        "mean_cells_per_item": 2.1,
                        "sd_cells_per_item": 1.05,
                        "base_item_mean": 77000,
                        "base_item_sd": 65000,
                        "per_cell_mean": 6300,
                        "per_cell_sd": 3200
                    },
                    "big_red": {
                        "label": "大红",
                        "prior": 0.25,
                        "mean_cells_per_item": 4,
                        "sd_cells_per_item": 1.6,
                        "base_item_mean": 252000,
                        "base_item_sd": 240000,
                        "per_cell_mean": 33600,
                        "per_cell_sd": 15000
                    },
                    "gold_red": {
                        "label": "金",
                        "prior": 0.09,
                        "mean_cells_per_item": 6.7,
                        "sd_cells_per_item": 2.6,
                        "base_item_mean": 644000,
                        "base_item_sd": 760000,
                        "per_cell_mean": 63000,
                        "per_cell_sd": 30000
                    }
                }
            },
            "collection_families": {
                "relics": {
                    "prior": 1.25,
                    "value_bias": 1.12,
                    "red_type_bias": {
                        "big_red": 1.1,
                        "gold_red": 1.18
                    }
                },
                "books": {
                    "prior": 1.05,
                    "value_bias": 1.06,
                    "red_type_bias": {
                        "big_red": 1.02,
                        "gold_red": 1.08
                    }
                },
                "furniture": {
                    "prior": 0.85,
                    "value_bias": 0.9,
                    "red_type_bias": {
                        "small_red": 1.06,
                        "big_red": 0.86,
                        "gold_red": 0.76
                    }
                }
            }
        },
        "villa": {
            "label": "别墅图",
            "map_name": "别墅图-高难-实值校准模板",
            "submaps": [
                {
                    "id": "unknown_villa",
                    "label": "未知别墅"
                },
                {
                    "id": "designer_residence",
                    "label": "设计师居所"
                },
                {
                    "id": "scientist_residence",
                    "label": "科学家居所"
                },
                {
                    "id": "wellness_residence",
                    "label": "养生学家居所"
                },
                {
                    "id": "noble_residence",
                    "label": "望族居所"
                },
                {
                    "id": "scholar_residence",
                    "label": "学者居所"
                },
                {
                    "id": "private_vault",
                    "label": "私人金库"
                },
                {
                    "id": "luxury_retirement_home",
                    "label": "奢华养老院"
                },
                {
                    "id": "doomsday_shelter",
                    "label": "末日庇护所"
                }
            ],
            "alpha_counts": {
                "w": 8.5,
                "g": 7.6,
                "b": 3.9,
                "p": 3.2,
                "o": 4,
                "r": 0.12
            },
            "solver": {
                "count_prior_strength": 8
            },
            "cells_per_item": {
                "w": {
                    "mean": 1.8,
                    "sd": 0.6,
                    "min": 1,
                    "max": null
                },
                "g": {
                    "mean": 2.2,
                    "sd": 0.7,
                    "min": 1,
                    "max": null
                },
                "b": {
                    "mean": 2.7,
                    "sd": 0.85,
                    "min": 1,
                    "max": null
                },
                "p": {
                    "mean": 3.1,
                    "sd": 1,
                    "min": 1,
                    "max": null
                },
                "o": {
                    "mean": 3.6,
                    "sd": 1.1,
                    "min": 1,
                    "max": null
                },
                "r": {
                    "mean": 4.1,
                    "sd": 1.2,
                    "min": 1,
                    "max": null
                }
            },
            "value_model": {
                "w": {
                    "base_item_mean": 600,
                    "base_item_sd": 250,
                    "per_cell_mean": 300,
                    "per_cell_sd": 80
                },
                "g": {
                    "base_item_mean": 1600,
                    "base_item_sd": 500,
                    "per_cell_mean": 500,
                    "per_cell_sd": 150
                },
                "b": {
                    "base_item_mean": 3600,
                    "base_item_sd": 1000,
                    "per_cell_mean": 1000,
                    "per_cell_sd": 280
                },
                "p": {
                    "base_item_mean": 7000,
                    "base_item_sd": 1800,
                    "per_cell_mean": 1700,
                    "per_cell_sd": 500
                },
                "o": {
                    "base_item_mean": 11000,
                    "base_item_sd": 2800,
                    "per_cell_mean": 2200,
                    "per_cell_sd": 800
                },
                "r": {
                    "base_item_mean": 112000,
                    "base_item_sd": 42000,
                    "per_cell_mean": 0,
                    "per_cell_sd": 0
                }
            },
            "red_type_profiles": {
                "profiles": {
                    "small_red": {
                        "prior": 0.78,
                        "mean_cells_per_item": 2.2,
                        "sd_cells_per_item": 0.6,
                        "base_item_mean": 52000,
                        "base_item_sd": 19000,
                        "per_cell_mean": 8000,
                        "per_cell_sd": 2800
                    },
                    "big_red": {
                        "prior": 0.19,
                        "mean_cells_per_item": 3.8,
                        "sd_cells_per_item": 0.8,
                        "base_item_mean": 90000,
                        "base_item_sd": 36000,
                        "per_cell_mean": 12000,
                        "per_cell_sd": 4200
                    },
                    "gold_red": {
                        "prior": 0.03,
                        "mean_cells_per_item": 3,
                        "sd_cells_per_item": 0.7,
                        "base_item_mean": 130000,
                        "base_item_sd": 48000,
                        "per_cell_mean": 15000,
                        "per_cell_sd": 5000
                    }
                }
            },
            "collection_families": {
                "furniture": {
                    "notes": [
                        "别墅主家族"
                    ],
                    "prior": 2.25,
                    "value_bias": 0.84,
                    "red_type_bias": {
                        "small_red": 1.22,
                        "big_red": 0.78,
                        "gold_red": 0.6
                    }
                },
                "trendy": {
                    "notes": [
                        "别墅次主家族"
                    ],
                    "prior": 1.65,
                    "value_bias": 0.9,
                    "red_type_bias": {
                        "small_red": 1.18,
                        "big_red": 0.88,
                        "gold_red": 0.7
                    }
                },
                "relics": {
                    "prior": 0.7,
                    "value_bias": 1.02,
                    "red_type_bias": {
                        "big_red": 0.9,
                        "gold_red": 0.82
                    }
                }
            }
        },
        "shipping": {
            "label": "航运区",
            "map_name": "航运区-高难-实值校准模板",
            "alpha_counts": {
                "w": 4.5,
                "g": 4.4,
                "b": 3.6,
                "p": 2.9,
                "o": 2.2,
                "r": 0.9
            },
            "cells_per_item": {
                "w": {
                    "mean": 1.3,
                    "sd": 0.55,
                    "min": 1,
                    "max": null
                },
                "g": {
                    "mean": 1.7,
                    "sd": 0.7,
                    "min": 1,
                    "max": null
                },
                "b": {
                    "mean": 2.1,
                    "sd": 0.8,
                    "min": 1,
                    "max": null
                },
                "p": {
                    "mean": 2.5,
                    "sd": 0.95,
                    "min": 1,
                    "max": null
                },
                "o": {
                    "mean": 3.1,
                    "sd": 1.1,
                    "min": 1,
                    "max": null
                },
                "r": {
                    "mean": 3.8,
                    "sd": 1.25,
                    "min": 1,
                    "max": null
                }
            },
            "value_model": {
                "w": {
                    "base_item_mean": 900,
                    "base_item_sd": 300,
                    "per_cell_mean": 320,
                    "per_cell_sd": 90
                },
                "g": {
                    "base_item_mean": 2200,
                    "base_item_sd": 700,
                    "per_cell_mean": 700,
                    "per_cell_sd": 200
                },
                "b": {
                    "base_item_mean": 5200,
                    "base_item_sd": 1600,
                    "per_cell_mean": 1500,
                    "per_cell_sd": 450
                },
                "p": {
                    "base_item_mean": 12000,
                    "base_item_sd": 3600,
                    "per_cell_mean": 3300,
                    "per_cell_sd": 1000
                },
                "o": {
                    "base_item_mean": 28000,
                    "base_item_sd": 7000,
                    "per_cell_mean": 6500,
                    "per_cell_sd": 1700
                },
                "r": {
                    "base_item_mean": 130000,
                    "base_item_sd": 50000,
                    "per_cell_mean": 0,
                    "per_cell_sd": 0
                }
            },
            "red_type_profiles": {
                "profiles": {
                    "small_red": {
                        "prior": 0.68,
                        "mean_cells_per_item": 2.8,
                        "sd_cells_per_item": 0.7,
                        "base_item_mean": 80000,
                        "base_item_sd": 28000,
                        "per_cell_mean": 13000,
                        "per_cell_sd": 4200
                    },
                    "big_red": {
                        "prior": 0.27,
                        "mean_cells_per_item": 4.8,
                        "sd_cells_per_item": 0.9,
                        "base_item_mean": 120000,
                        "base_item_sd": 48000,
                        "per_cell_mean": 15000,
                        "per_cell_sd": 5000
                    },
                    "gold_red": {
                        "prior": 0.05,
                        "mean_cells_per_item": 3.7,
                        "sd_cells_per_item": 0.8,
                        "base_item_mean": 140000,
                        "base_item_sd": 54000,
                        "per_cell_mean": 15000,
                        "per_cell_sd": 5200
                    }
                }
            },
            "collection_families": {
                "cargo": {
                    "notes": [
                        "航运主家族"
                    ],
                    "prior": 2.15,
                    "value_bias": 1.14,
                    "red_type_bias": {
                        "big_red": 1.16,
                        "gold_red": 1.22
                    }
                },
                "jewelry": {
                    "notes": [
                        "航运高价值稀缺件"
                    ],
                    "prior": 1.75,
                    "value_bias": 1.22,
                    "red_type_bias": {
                        "big_red": 1.08,
                        "gold_red": 1.45
                    }
                },
                "relics": {
                    "prior": 0.8,
                    "value_bias": 1.05,
                    "red_type_bias": {
                        "big_red": 0.92,
                        "gold_red": 1.05
                    }
                }
            }
        }
    },
    "model": {
        "alpha_counts": {
            "w": 1,
            "g": 1.9,
            "b": 3,
            "p": 2.9,
            "o": 2.5,
            "r": 1.7
        },
        "cells_per_item": {
            "w": {
                "mean": 1.3,
                "sd": 0.5,
                "min": 1,
                "max": null
            },
            "g": {
                "mean": 1.6,
                "sd": 0.6,
                "min": 1,
                "max": null
            },
            "b": {
                "mean": 2,
                "sd": 0.75,
                "min": 1,
                "max": null
            },
            "p": {
                "mean": 2.5,
                "sd": 0.85,
                "min": 1,
                "max": null
            },
            "o": {
                "mean": 2.9,
                "sd": 0.95,
                "min": 1,
                "max": null
            },
            "r": {
                "mean": 3.6,
                "sd": 1.15,
                "min": 1,
                "max": null
            }
        },
        "value_model": {
            "w": {
                "base_item_mean": 700,
                "base_item_sd": 250,
                "per_cell_mean": 260,
                "per_cell_sd": 80
            },
            "g": {
                "base_item_mean": 1800,
                "base_item_sd": 600,
                "per_cell_mean": 550,
                "per_cell_sd": 170
            },
            "b": {
                "base_item_mean": 4200,
                "base_item_sd": 1400,
                "per_cell_mean": 1200,
                "per_cell_sd": 380
            },
            "p": {
                "base_item_mean": 9000,
                "base_item_sd": 3000,
                "per_cell_mean": 2300,
                "per_cell_sd": 700
            },
            "o": {
                "base_item_mean": 16000,
                "base_item_sd": 5200,
                "per_cell_mean": 3400,
                "per_cell_sd": 1000
            },
            "r": {
                "base_item_mean": 128000,
                "base_item_sd": 48000,
                "per_cell_mean": 0,
                "per_cell_sd": 0
            }
        },
        "red_type_profiles": {
            "profiles": {
                "small_red": {
                    "label": "小红",
                    "prior": 0.74,
                    "mean_cells_per_item": 2.6,
                    "sd_cells_per_item": 0.7,
                    "base_item_mean": 70000,
                    "base_item_sd": 24000,
                    "per_cell_mean": 12000,
                    "per_cell_sd": 3600
                },
                "big_red": {
                    "label": "大红",
                    "prior": 0.22,
                    "mean_cells_per_item": 4.4,
                    "sd_cells_per_item": 0.9,
                    "base_item_mean": 110000,
                    "base_item_sd": 42000,
                    "per_cell_mean": 14500,
                    "per_cell_sd": 4600
                },
                "gold_red": {
                    "label": "金",
                    "prior": 0.04,
                    "mean_cells_per_item": 3.6,
                    "sd_cells_per_item": 0.8,
                    "base_item_mean": 140000,
                    "base_item_sd": 52000,
                    "per_cell_mean": 16000,
                    "per_cell_sd": 5200
                }
            }
        },
        "collection_families": {
            "relics": {
                "label": "文物",
                "prior": 1.1,
                "value_bias": 1.1,
                "red_type_bias": {
                    "big_red": 1.08,
                    "gold_red": 1.12
                }
            },
            "books": {
                "label": "书籍/书画",
                "prior": 1.02,
                "value_bias": 1.05,
                "red_type_bias": {
                    "big_red": 1.02,
                    "gold_red": 1.06
                }
            },
            "jewelry": {
                "label": "珠宝",
                "prior": 1.05,
                "value_bias": 1.12,
                "red_type_bias": {
                    "big_red": 1.08,
                    "gold_red": 1.22
                }
            },
            "medicine": {
                "label": "医药",
                "prior": 1,
                "value_bias": 1,
                "red_type_bias": {
                    "small_red": 1.03
                }
            },
            "furniture": {
                "label": "家居",
                "prior": 0.95,
                "value_bias": 0.9,
                "red_type_bias": {
                    "small_red": 1.08,
                    "big_red": 0.88,
                    "gold_red": 0.78
                }
            },
            "cargo": {
                "label": "货物/航运",
                "prior": 1.02,
                "value_bias": 1.06,
                "red_type_bias": {
                    "big_red": 1.06,
                    "gold_red": 1.12
                }
            },
            "trendy": {
                "label": "潮流藏品",
                "prior": 0.95,
                "value_bias": 0.94,
                "red_type_bias": {
                    "small_red": 1.06,
                    "big_red": 0.88,
                    "gold_red": 0.82
                }
            }
        }
    },
    "solver": {
        "max_states": 4000000,
        "mc_samples": 180000,
        "count_prior_strength": 1,
        "average_observation": {
            "rounding_mode": "truncate",
            "relax_sparse_support": true,
            "sparse_support_threshold": 1,
            "fallback_slack_cells": 1,
            "fallback_min_avg": 1
        },
        "staging": {
            "refine_ratio": 0.45,
            "refine_min_states": 50000,
            "refine_min_samples": 4000,
            "min_signals_for_full": 3,
            "min_signals_for_full_sparse": 5,
            "refine_timeout_ms_sparse": 1400,
            "refine_timeout_ms_dense": 2200,
            "full_timeout_ms_sparse": 2600,
            "full_timeout_ms_dense": 4200
        },
        "unbounded_cell_max_per_item": 30
    },
    "calibration": {
        "artifact_version": "ak_authority_calibration_v1",
        "generated_at": "2026-04-29T10:05:16.500Z",
        "source_summary": {
            "catalog_batch_count": 6,
            "battle_sample_count": 0,
            "catalog_qualities": [
                "b",
                "g",
                "o",
                "p",
                "r",
                "w"
            ],
            "maps_with_battle_samples": [],
            "battle_sample_import_context": null
        },
        "quality_status": {
            "alpha_counts": "fallback_only",
            "value_model_base_items": "catalog_backed",
            "cells_per_item": "pending",
            "collection_families": "ignored_phase1"
        },
        "manifest": {
            "adopted_fields": [
                "alpha_counts",
                "value_model.base_item_mean",
                "value_model.base_item_sd",
                "value_model.per_cell_mean",
                "value_model.per_cell_sd"
            ],
            "pending_fields": [
                "cells_per_item"
            ],
            "ignored_fields": [
                "collection_families"
            ],
            "source_inputs": {
                "catalog_batch_count": 6,
                "battle_sample_count": 0,
                "battle_sample_import_context": null
            }
        },
        "maps": {
            "sunken_ship": {
                "count_prior_calibration": {
                    "battle_sample_count": 0,
                    "authority_status": "fallback_only",
                    "alpha_counts": {
                        "w": 5.2,
                        "g": 6.62,
                        "b": 8.5,
                        "p": 2.95,
                        "o": 1.25,
                        "r": 0.8
                    },
                    "observed_qualities": [],
                    "fallback_qualities": [
                        "w",
                        "g",
                        "b",
                        "p",
                        "o",
                        "r"
                    ],
                    "notes": [
                        "no_battle_samples_using_current_map_defaults"
                    ]
                },
                "value_model_calibration": {
                    "catalog_batch_count": 6,
                    "authority_status": "catalog_backed",
                    "quality_sample_counts": {
                        "b": 103,
                        "g": 91,
                        "o": 100,
                        "p": 103,
                        "r": 92,
                        "w": 100
                    },
                    "missing_qualities": [],
                    "value_model": {
                        "w": {
                            "base_item_mean": 267,
                            "base_item_sd": 160,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "g": {
                            "base_item_mean": 872,
                            "base_item_sd": 658,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "b": {
                            "base_item_mean": 3126,
                            "base_item_sd": 2134,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "p": {
                            "base_item_mean": 9492,
                            "base_item_sd": 5520,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "o": {
                            "base_item_mean": 46325,
                            "base_item_sd": 29002,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "r": {
                            "base_item_mean": 128777,
                            "base_item_sd": 48360,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_tail_aware_common_item_mean",
                            "tail_model": {
                                "threshold": 200000,
                                "battle_probability": 0.05,
                                "catalog_tail_rate": 0.521739,
                                "catalog_tail_sample_count": 48,
                                "replacement_item_mean": 128777,
                                "values": [
                                    226800,
                                    240660,
                                    249000,
                                    255115,
                                    255840,
                                    258760,
                                    259165,
                                    266050,
                                    281600,
                                    282240,
                                    284519,
                                    287280,
                                    293400,
                                    294000,
                                    295500,
                                    305920,
                                    316000,
                                    322560,
                                    357040,
                                    361000,
                                    362400,
                                    375000,
                                    390000,
                                    422002,
                                    444000,
                                    452800,
                                    457200,
                                    465000,
                                    470400,
                                    475000,
                                    512000,
                                    531000,
                                    567900,
                                    844000,
                                    1003000,
                                    1039000,
                                    1089660,
                                    1236666,
                                    1491800,
                                    1495000,
                                    1552500,
                                    1553900,
                                    1688400,
                                    2516000,
                                    3000000,
                                    7402320,
                                    13145200,
                                    19371213
                                ],
                                "weighted_values": [
                                    {
                                        "value": 226800,
                                        "z_score": 0.114464,
                                        "probability": 0.03161865
                                    },
                                    {
                                        "value": 240660,
                                        "z_score": 0.168456,
                                        "probability": 0.03137808
                                    },
                                    {
                                        "value": 249000,
                                        "z_score": 0.199466,
                                        "probability": 0.03119959
                                    },
                                    {
                                        "value": 255115,
                                        "z_score": 0.22155,
                                        "probability": 0.03105488
                                    },
                                    {
                                        "value": 255840,
                                        "z_score": 0.224133,
                                        "probability": 0.03103701
                                    },
                                    {
                                        "value": 258760,
                                        "z_score": 0.234463,
                                        "probability": 0.03096358
                                    },
                                    {
                                        "value": 259165,
                                        "z_score": 0.235886,
                                        "probability": 0.03095322
                                    },
                                    {
                                        "value": 266050,
                                        "z_score": 0.259752,
                                        "probability": 0.03077069
                                    },
                                    {
                                        "value": 281600,
                                        "z_score": 0.311457,
                                        "probability": 0.03031963
                                    },
                                    {
                                        "value": 282240,
                                        "z_score": 0.313523,
                                        "probability": 0.03030006
                                    },
                                    {
                                        "value": 284519,
                                        "z_score": 0.320844,
                                        "probability": 0.03022979
                                    },
                                    {
                                        "value": 287280,
                                        "z_score": 0.329634,
                                        "probability": 0.03014349
                                    },
                                    {
                                        "value": 293400,
                                        "z_score": 0.348821,
                                        "probability": 0.02994792
                                    },
                                    {
                                        "value": 294000,
                                        "z_score": 0.350681,
                                        "probability": 0.02992845
                                    },
                                    {
                                        "value": 295500,
                                        "z_score": 0.355313,
                                        "probability": 0.02987955
                                    },
                                    {
                                        "value": 305920,
                                        "z_score": 0.386857,
                                        "probability": 0.02953183
                                    },
                                    {
                                        "value": 316000,
                                        "z_score": 0.416366,
                                        "probability": 0.02918392
                                    },
                                    {
                                        "value": 322560,
                                        "z_score": 0.435069,
                                        "probability": 0.02895248
                                    },
                                    {
                                        "value": 357040,
                                        "z_score": 0.527511,
                                        "probability": 0.02769257
                                    },
                                    {
                                        "value": 361000,
                                        "z_score": 0.537551,
                                        "probability": 0.0275449
                                    },
                                    {
                                        "value": 362400,
                                        "z_score": 0.541075,
                                        "probability": 0.02749261
                                    },
                                    {
                                        "value": 375000,
                                        "z_score": 0.572184,
                                        "probability": 0.02702063
                                    },
                                    {
                                        "value": 390000,
                                        "z_score": 0.607884,
                                        "probability": 0.02645741
                                    },
                                    {
                                        "value": 422002,
                                        "z_score": 0.679669,
                                        "probability": 0.02526255
                                    },
                                    {
                                        "value": 444000,
                                        "z_score": 0.725922,
                                        "probability": 0.02445456
                                    },
                                    {
                                        "value": 452800,
                                        "z_score": 0.743787,
                                        "probability": 0.02413562
                                    },
                                    {
                                        "value": 457200,
                                        "z_score": 0.752589,
                                        "probability": 0.02397719
                                    },
                                    {
                                        "value": 465000,
                                        "z_score": 0.767987,
                                        "probability": 0.02369813
                                    },
                                    {
                                        "value": 470400,
                                        "z_score": 0.778497,
                                        "probability": 0.02350633
                                    },
                                    {
                                        "value": 475000,
                                        "z_score": 0.787355,
                                        "probability": 0.02334387
                                    },
                                    {
                                        "value": 512000,
                                        "z_score": 0.855631,
                                        "probability": 0.02207058
                                    },
                                    {
                                        "value": 531000,
                                        "z_score": 0.888798,
                                        "probability": 0.02144126
                                    },
                                    {
                                        "value": 567900,
                                        "z_score": 0.949951,
                                        "probability": 0.02026904
                                    },
                                    {
                                        "value": 844000,
                                        "z_score": 1.310594,
                                        "probability": 0.01348353
                                    },
                                    {
                                        "value": 1003000,
                                        "z_score": 1.4677,
                                        "probability": 0.01083982
                                    },
                                    {
                                        "value": 1039000,
                                        "z_score": 1.499798,
                                        "probability": 0.01033567
                                    },
                                    {
                                        "value": 1089660,
                                        "z_score": 1.543132,
                                        "probability": 0.00967621
                                    },
                                    {
                                        "value": 1236666,
                                        "z_score": 1.658326,
                                        "probability": 0.00804681
                                    },
                                    {
                                        "value": 1491800,
                                        "z_score": 1.829054,
                                        "probability": 0.00597497
                                    },
                                    {
                                        "value": 1495000,
                                        "z_score": 1.831005,
                                        "probability": 0.00595368
                                    },
                                    {
                                        "value": 1552500,
                                        "z_score": 1.865357,
                                        "probability": 0.00558743
                                    },
                                    {
                                        "value": 1553900,
                                        "z_score": 1.866178,
                                        "probability": 0.00557888
                                    },
                                    {
                                        "value": 1688400,
                                        "z_score": 1.94174,
                                        "probability": 0.00483133
                                    },
                                    {
                                        "value": 2516000,
                                        "z_score": 2.304824,
                                        "probability": 0.00223489
                                    },
                                    {
                                        "value": 3000000,
                                        "z_score": 2.464974,
                                        "probability": 0.00152539
                                    },
                                    {
                                        "value": 7402320,
                                        "z_score": 3.287084,
                                        "probability": 0.00014339
                                    },
                                    {
                                        "value": 13145200,
                                        "z_score": 3.809801,
                                        "probability": 0.00002244
                                    },
                                    {
                                        "value": 19371213,
                                        "z_score": 4.16273,
                                        "probability": 0.0000055
                                    }
                                ],
                                "tail_weight_basis": "log_price_normal_tail",
                                "tail_log_sigma_base": 3,
                                "value_basis": "catalog_over_threshold_downweighted_battle_tail"
                            }
                        }
                    }
                },
                "cells_per_item_status": {
                    "adopted_fields": [],
                    "pending_fields": [
                        "cells_per_item"
                    ],
                    "ignored_fields": [
                        "collection_families"
                    ],
                    "notes": [
                        "phase1_keeps_existing_map_cells_per_item"
                    ]
                }
            },
            "villa": {
                "count_prior_calibration": {
                    "battle_sample_count": 0,
                    "authority_status": "fallback_only",
                    "alpha_counts": {
                        "w": 8.5,
                        "g": 7.6,
                        "b": 3.9,
                        "p": 3.2,
                        "o": 4,
                        "r": 0.12
                    },
                    "observed_qualities": [],
                    "fallback_qualities": [
                        "w",
                        "g",
                        "b",
                        "p",
                        "o",
                        "r"
                    ],
                    "notes": [
                        "no_battle_samples_using_current_map_defaults"
                    ]
                },
                "value_model_calibration": {
                    "catalog_batch_count": 6,
                    "authority_status": "catalog_backed",
                    "quality_sample_counts": {
                        "b": 103,
                        "g": 91,
                        "o": 100,
                        "p": 103,
                        "r": 92,
                        "w": 100
                    },
                    "missing_qualities": [],
                    "value_model": {
                        "w": {
                            "base_item_mean": 267,
                            "base_item_sd": 160,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "g": {
                            "base_item_mean": 872,
                            "base_item_sd": 658,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "b": {
                            "base_item_mean": 3126,
                            "base_item_sd": 2134,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "p": {
                            "base_item_mean": 9492,
                            "base_item_sd": 5520,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "o": {
                            "base_item_mean": 46325,
                            "base_item_sd": 29002,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "r": {
                            "base_item_mean": 128777,
                            "base_item_sd": 48360,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_tail_aware_common_item_mean",
                            "tail_model": {
                                "threshold": 200000,
                                "battle_probability": 0.05,
                                "catalog_tail_rate": 0.521739,
                                "catalog_tail_sample_count": 48,
                                "replacement_item_mean": 128777,
                                "values": [
                                    226800,
                                    240660,
                                    249000,
                                    255115,
                                    255840,
                                    258760,
                                    259165,
                                    266050,
                                    281600,
                                    282240,
                                    284519,
                                    287280,
                                    293400,
                                    294000,
                                    295500,
                                    305920,
                                    316000,
                                    322560,
                                    357040,
                                    361000,
                                    362400,
                                    375000,
                                    390000,
                                    422002,
                                    444000,
                                    452800,
                                    457200,
                                    465000,
                                    470400,
                                    475000,
                                    512000,
                                    531000,
                                    567900,
                                    844000,
                                    1003000,
                                    1039000,
                                    1089660,
                                    1236666,
                                    1491800,
                                    1495000,
                                    1552500,
                                    1553900,
                                    1688400,
                                    2516000,
                                    3000000,
                                    7402320,
                                    13145200,
                                    19371213
                                ],
                                "weighted_values": [
                                    {
                                        "value": 226800,
                                        "z_score": 0.114464,
                                        "probability": 0.03161865
                                    },
                                    {
                                        "value": 240660,
                                        "z_score": 0.168456,
                                        "probability": 0.03137808
                                    },
                                    {
                                        "value": 249000,
                                        "z_score": 0.199466,
                                        "probability": 0.03119959
                                    },
                                    {
                                        "value": 255115,
                                        "z_score": 0.22155,
                                        "probability": 0.03105488
                                    },
                                    {
                                        "value": 255840,
                                        "z_score": 0.224133,
                                        "probability": 0.03103701
                                    },
                                    {
                                        "value": 258760,
                                        "z_score": 0.234463,
                                        "probability": 0.03096358
                                    },
                                    {
                                        "value": 259165,
                                        "z_score": 0.235886,
                                        "probability": 0.03095322
                                    },
                                    {
                                        "value": 266050,
                                        "z_score": 0.259752,
                                        "probability": 0.03077069
                                    },
                                    {
                                        "value": 281600,
                                        "z_score": 0.311457,
                                        "probability": 0.03031963
                                    },
                                    {
                                        "value": 282240,
                                        "z_score": 0.313523,
                                        "probability": 0.03030006
                                    },
                                    {
                                        "value": 284519,
                                        "z_score": 0.320844,
                                        "probability": 0.03022979
                                    },
                                    {
                                        "value": 287280,
                                        "z_score": 0.329634,
                                        "probability": 0.03014349
                                    },
                                    {
                                        "value": 293400,
                                        "z_score": 0.348821,
                                        "probability": 0.02994792
                                    },
                                    {
                                        "value": 294000,
                                        "z_score": 0.350681,
                                        "probability": 0.02992845
                                    },
                                    {
                                        "value": 295500,
                                        "z_score": 0.355313,
                                        "probability": 0.02987955
                                    },
                                    {
                                        "value": 305920,
                                        "z_score": 0.386857,
                                        "probability": 0.02953183
                                    },
                                    {
                                        "value": 316000,
                                        "z_score": 0.416366,
                                        "probability": 0.02918392
                                    },
                                    {
                                        "value": 322560,
                                        "z_score": 0.435069,
                                        "probability": 0.02895248
                                    },
                                    {
                                        "value": 357040,
                                        "z_score": 0.527511,
                                        "probability": 0.02769257
                                    },
                                    {
                                        "value": 361000,
                                        "z_score": 0.537551,
                                        "probability": 0.0275449
                                    },
                                    {
                                        "value": 362400,
                                        "z_score": 0.541075,
                                        "probability": 0.02749261
                                    },
                                    {
                                        "value": 375000,
                                        "z_score": 0.572184,
                                        "probability": 0.02702063
                                    },
                                    {
                                        "value": 390000,
                                        "z_score": 0.607884,
                                        "probability": 0.02645741
                                    },
                                    {
                                        "value": 422002,
                                        "z_score": 0.679669,
                                        "probability": 0.02526255
                                    },
                                    {
                                        "value": 444000,
                                        "z_score": 0.725922,
                                        "probability": 0.02445456
                                    },
                                    {
                                        "value": 452800,
                                        "z_score": 0.743787,
                                        "probability": 0.02413562
                                    },
                                    {
                                        "value": 457200,
                                        "z_score": 0.752589,
                                        "probability": 0.02397719
                                    },
                                    {
                                        "value": 465000,
                                        "z_score": 0.767987,
                                        "probability": 0.02369813
                                    },
                                    {
                                        "value": 470400,
                                        "z_score": 0.778497,
                                        "probability": 0.02350633
                                    },
                                    {
                                        "value": 475000,
                                        "z_score": 0.787355,
                                        "probability": 0.02334387
                                    },
                                    {
                                        "value": 512000,
                                        "z_score": 0.855631,
                                        "probability": 0.02207058
                                    },
                                    {
                                        "value": 531000,
                                        "z_score": 0.888798,
                                        "probability": 0.02144126
                                    },
                                    {
                                        "value": 567900,
                                        "z_score": 0.949951,
                                        "probability": 0.02026904
                                    },
                                    {
                                        "value": 844000,
                                        "z_score": 1.310594,
                                        "probability": 0.01348353
                                    },
                                    {
                                        "value": 1003000,
                                        "z_score": 1.4677,
                                        "probability": 0.01083982
                                    },
                                    {
                                        "value": 1039000,
                                        "z_score": 1.499798,
                                        "probability": 0.01033567
                                    },
                                    {
                                        "value": 1089660,
                                        "z_score": 1.543132,
                                        "probability": 0.00967621
                                    },
                                    {
                                        "value": 1236666,
                                        "z_score": 1.658326,
                                        "probability": 0.00804681
                                    },
                                    {
                                        "value": 1491800,
                                        "z_score": 1.829054,
                                        "probability": 0.00597497
                                    },
                                    {
                                        "value": 1495000,
                                        "z_score": 1.831005,
                                        "probability": 0.00595368
                                    },
                                    {
                                        "value": 1552500,
                                        "z_score": 1.865357,
                                        "probability": 0.00558743
                                    },
                                    {
                                        "value": 1553900,
                                        "z_score": 1.866178,
                                        "probability": 0.00557888
                                    },
                                    {
                                        "value": 1688400,
                                        "z_score": 1.94174,
                                        "probability": 0.00483133
                                    },
                                    {
                                        "value": 2516000,
                                        "z_score": 2.304824,
                                        "probability": 0.00223489
                                    },
                                    {
                                        "value": 3000000,
                                        "z_score": 2.464974,
                                        "probability": 0.00152539
                                    },
                                    {
                                        "value": 7402320,
                                        "z_score": 3.287084,
                                        "probability": 0.00014339
                                    },
                                    {
                                        "value": 13145200,
                                        "z_score": 3.809801,
                                        "probability": 0.00002244
                                    },
                                    {
                                        "value": 19371213,
                                        "z_score": 4.16273,
                                        "probability": 0.0000055
                                    }
                                ],
                                "tail_weight_basis": "log_price_normal_tail",
                                "tail_log_sigma_base": 3,
                                "value_basis": "catalog_over_threshold_downweighted_battle_tail"
                            }
                        }
                    }
                },
                "cells_per_item_status": {
                    "adopted_fields": [],
                    "pending_fields": [
                        "cells_per_item"
                    ],
                    "ignored_fields": [
                        "collection_families"
                    ],
                    "notes": [
                        "phase1_keeps_existing_map_cells_per_item"
                    ]
                }
            },
            "shipping": {
                "count_prior_calibration": {
                    "battle_sample_count": 0,
                    "authority_status": "fallback_only",
                    "alpha_counts": {
                        "w": 4.5,
                        "g": 4.4,
                        "b": 3.6,
                        "p": 2.9,
                        "o": 2.2,
                        "r": 0.9
                    },
                    "observed_qualities": [],
                    "fallback_qualities": [
                        "w",
                        "g",
                        "b",
                        "p",
                        "o",
                        "r"
                    ],
                    "notes": [
                        "no_battle_samples_using_current_map_defaults"
                    ]
                },
                "value_model_calibration": {
                    "catalog_batch_count": 6,
                    "authority_status": "catalog_backed",
                    "quality_sample_counts": {
                        "b": 103,
                        "g": 91,
                        "o": 100,
                        "p": 103,
                        "r": 92,
                        "w": 100
                    },
                    "missing_qualities": [],
                    "value_model": {
                        "w": {
                            "base_item_mean": 267,
                            "base_item_sd": 160,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "g": {
                            "base_item_mean": 872,
                            "base_item_sd": 658,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "b": {
                            "base_item_mean": 3126,
                            "base_item_sd": 2134,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "p": {
                            "base_item_mean": 9492,
                            "base_item_sd": 5520,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "o": {
                            "base_item_mean": 46325,
                            "base_item_sd": 29002,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_reported_item_mean"
                        },
                        "r": {
                            "base_item_mean": 128777,
                            "base_item_sd": 48360,
                            "per_cell_mean": 0,
                            "per_cell_sd": 0,
                            "value_basis": "catalog_tail_aware_common_item_mean",
                            "tail_model": {
                                "threshold": 200000,
                                "battle_probability": 0.05,
                                "catalog_tail_rate": 0.521739,
                                "catalog_tail_sample_count": 48,
                                "replacement_item_mean": 128777,
                                "values": [
                                    226800,
                                    240660,
                                    249000,
                                    255115,
                                    255840,
                                    258760,
                                    259165,
                                    266050,
                                    281600,
                                    282240,
                                    284519,
                                    287280,
                                    293400,
                                    294000,
                                    295500,
                                    305920,
                                    316000,
                                    322560,
                                    357040,
                                    361000,
                                    362400,
                                    375000,
                                    390000,
                                    422002,
                                    444000,
                                    452800,
                                    457200,
                                    465000,
                                    470400,
                                    475000,
                                    512000,
                                    531000,
                                    567900,
                                    844000,
                                    1003000,
                                    1039000,
                                    1089660,
                                    1236666,
                                    1491800,
                                    1495000,
                                    1552500,
                                    1553900,
                                    1688400,
                                    2516000,
                                    3000000,
                                    7402320,
                                    13145200,
                                    19371213
                                ],
                                "weighted_values": [
                                    {
                                        "value": 226800,
                                        "z_score": 0.114464,
                                        "probability": 0.03161865
                                    },
                                    {
                                        "value": 240660,
                                        "z_score": 0.168456,
                                        "probability": 0.03137808
                                    },
                                    {
                                        "value": 249000,
                                        "z_score": 0.199466,
                                        "probability": 0.03119959
                                    },
                                    {
                                        "value": 255115,
                                        "z_score": 0.22155,
                                        "probability": 0.03105488
                                    },
                                    {
                                        "value": 255840,
                                        "z_score": 0.224133,
                                        "probability": 0.03103701
                                    },
                                    {
                                        "value": 258760,
                                        "z_score": 0.234463,
                                        "probability": 0.03096358
                                    },
                                    {
                                        "value": 259165,
                                        "z_score": 0.235886,
                                        "probability": 0.03095322
                                    },
                                    {
                                        "value": 266050,
                                        "z_score": 0.259752,
                                        "probability": 0.03077069
                                    },
                                    {
                                        "value": 281600,
                                        "z_score": 0.311457,
                                        "probability": 0.03031963
                                    },
                                    {
                                        "value": 282240,
                                        "z_score": 0.313523,
                                        "probability": 0.03030006
                                    },
                                    {
                                        "value": 284519,
                                        "z_score": 0.320844,
                                        "probability": 0.03022979
                                    },
                                    {
                                        "value": 287280,
                                        "z_score": 0.329634,
                                        "probability": 0.03014349
                                    },
                                    {
                                        "value": 293400,
                                        "z_score": 0.348821,
                                        "probability": 0.02994792
                                    },
                                    {
                                        "value": 294000,
                                        "z_score": 0.350681,
                                        "probability": 0.02992845
                                    },
                                    {
                                        "value": 295500,
                                        "z_score": 0.355313,
                                        "probability": 0.02987955
                                    },
                                    {
                                        "value": 305920,
                                        "z_score": 0.386857,
                                        "probability": 0.02953183
                                    },
                                    {
                                        "value": 316000,
                                        "z_score": 0.416366,
                                        "probability": 0.02918392
                                    },
                                    {
                                        "value": 322560,
                                        "z_score": 0.435069,
                                        "probability": 0.02895248
                                    },
                                    {
                                        "value": 357040,
                                        "z_score": 0.527511,
                                        "probability": 0.02769257
                                    },
                                    {
                                        "value": 361000,
                                        "z_score": 0.537551,
                                        "probability": 0.0275449
                                    },
                                    {
                                        "value": 362400,
                                        "z_score": 0.541075,
                                        "probability": 0.02749261
                                    },
                                    {
                                        "value": 375000,
                                        "z_score": 0.572184,
                                        "probability": 0.02702063
                                    },
                                    {
                                        "value": 390000,
                                        "z_score": 0.607884,
                                        "probability": 0.02645741
                                    },
                                    {
                                        "value": 422002,
                                        "z_score": 0.679669,
                                        "probability": 0.02526255
                                    },
                                    {
                                        "value": 444000,
                                        "z_score": 0.725922,
                                        "probability": 0.02445456
                                    },
                                    {
                                        "value": 452800,
                                        "z_score": 0.743787,
                                        "probability": 0.02413562
                                    },
                                    {
                                        "value": 457200,
                                        "z_score": 0.752589,
                                        "probability": 0.02397719
                                    },
                                    {
                                        "value": 465000,
                                        "z_score": 0.767987,
                                        "probability": 0.02369813
                                    },
                                    {
                                        "value": 470400,
                                        "z_score": 0.778497,
                                        "probability": 0.02350633
                                    },
                                    {
                                        "value": 475000,
                                        "z_score": 0.787355,
                                        "probability": 0.02334387
                                    },
                                    {
                                        "value": 512000,
                                        "z_score": 0.855631,
                                        "probability": 0.02207058
                                    },
                                    {
                                        "value": 531000,
                                        "z_score": 0.888798,
                                        "probability": 0.02144126
                                    },
                                    {
                                        "value": 567900,
                                        "z_score": 0.949951,
                                        "probability": 0.02026904
                                    },
                                    {
                                        "value": 844000,
                                        "z_score": 1.310594,
                                        "probability": 0.01348353
                                    },
                                    {
                                        "value": 1003000,
                                        "z_score": 1.4677,
                                        "probability": 0.01083982
                                    },
                                    {
                                        "value": 1039000,
                                        "z_score": 1.499798,
                                        "probability": 0.01033567
                                    },
                                    {
                                        "value": 1089660,
                                        "z_score": 1.543132,
                                        "probability": 0.00967621
                                    },
                                    {
                                        "value": 1236666,
                                        "z_score": 1.658326,
                                        "probability": 0.00804681
                                    },
                                    {
                                        "value": 1491800,
                                        "z_score": 1.829054,
                                        "probability": 0.00597497
                                    },
                                    {
                                        "value": 1495000,
                                        "z_score": 1.831005,
                                        "probability": 0.00595368
                                    },
                                    {
                                        "value": 1552500,
                                        "z_score": 1.865357,
                                        "probability": 0.00558743
                                    },
                                    {
                                        "value": 1553900,
                                        "z_score": 1.866178,
                                        "probability": 0.00557888
                                    },
                                    {
                                        "value": 1688400,
                                        "z_score": 1.94174,
                                        "probability": 0.00483133
                                    },
                                    {
                                        "value": 2516000,
                                        "z_score": 2.304824,
                                        "probability": 0.00223489
                                    },
                                    {
                                        "value": 3000000,
                                        "z_score": 2.464974,
                                        "probability": 0.00152539
                                    },
                                    {
                                        "value": 7402320,
                                        "z_score": 3.287084,
                                        "probability": 0.00014339
                                    },
                                    {
                                        "value": 13145200,
                                        "z_score": 3.809801,
                                        "probability": 0.00002244
                                    },
                                    {
                                        "value": 19371213,
                                        "z_score": 4.16273,
                                        "probability": 0.0000055
                                    }
                                ],
                                "tail_weight_basis": "log_price_normal_tail",
                                "tail_log_sigma_base": 3,
                                "value_basis": "catalog_over_threshold_downweighted_battle_tail"
                            }
                        }
                    }
                },
                "cells_per_item_status": {
                    "adopted_fields": [],
                    "pending_fields": [
                        "cells_per_item"
                    ],
                    "ignored_fields": [
                        "collection_families"
                    ],
                    "notes": [
                        "phase1_keeps_existing_map_cells_per_item"
                    ]
                }
            }
        }
    }
};

if (typeof window !== "undefined") {
    window.AUCTION_KING_DEFAULT_CONFIG = AUCTION_KING_DEFAULT_CONFIG;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = AUCTION_KING_DEFAULT_CONFIG;
}
