
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
竞拍之王 - 沉船图高难精算脚本（交互式）

特点
- 逐项录入信息，随时重算
- 用“整数可行解 + 先验打分 + Monte Carlo”推断橙色数量/红色数量
- 估计各颜色总格子数区间
- 输出估值区间、期望收益、盈利概率、损益比

重要说明
- 默认配置会优先读取 config/default 下的默认节与 sunken_ship preset。
- 你仍然可以通过 load_config 覆盖默认值，替换成自己的样本统计。
- 颜色编码：w=白, g=绿, b=蓝, p=紫, o=橙, r=红
"""

from __future__ import annotations
import copy
import json
import math
import random
import shlex
import statistics
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from avg_display_semantics import (
    build_missing_average_text_warnings,
    get_matching_total_cells,
    normalize_observed_average_text,
    rounded_avg_interval as shared_rounded_avg_interval,
)
from collection_family_config_io import (
    apply_collection_families_payload,
    export_collection_families_payload,
)
from authority_source_runtime import (
    adapt_offline_internal_config,
    export_offline_internal_config_to_source,
    read_workspace_default_sections,
    resolve_workspace_source_config,
)


QUALITIES = ["w", "g", "b", "p", "o", "r"]
COLLECTION_FAMILIES_PHASE1_RUNTIME_ENABLED = False
SOURCE_SCHEMA_KEYS = ("app", "maps", "model", "solver", "calibration", "cells_per_item", "value_model", "alpha_counts")
LEGACY_SCHEMA_KEYS = ("grid_models", "value_models", "count_probs")
DEFAULT_UNBOUNDED_CELL_MAX_PER_ITEM = 30
QUALITY_NAMES = {
    "w": "白",
    "g": "绿",
    "b": "蓝",
    "p": "紫",
    "o": "橙",
    "r": "红",
}


def optional_int(value, fallback=None):
    if value is None or value == "":
        return fallback
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def get_unbounded_cell_max_per_item(config: Dict) -> int:
    solver = config.get("solver", {}) if isinstance(config, dict) else {}
    raw = solver.get("unbounded_cell_max_per_item", DEFAULT_UNBOUNDED_CELL_MAX_PER_ITEM)
    try:
        value = float(raw)
    except (TypeError, ValueError):
        value = DEFAULT_UNBOUNDED_CELL_MAX_PER_ITEM
    if not math.isfinite(value) or value <= 0:
        value = DEFAULT_UNBOUNDED_CELL_MAX_PER_ITEM
    return int(math.ceil(value))


def get_finite_grid_max_cells(config: Dict, model: Dict) -> int:
    min_cells = optional_int(model.get("min_cells"), 0)
    max_cells = optional_int(model.get("max_cells"), None)
    if max_cells is not None:
        return max(min_cells, max_cells)
    return max(min_cells, get_unbounded_cell_max_per_item(config))

DEFAULT_CONFIG_SECTION_FILES = [
    "app.json",
    "maps.json",
    "model.json",
    "solver.json",
    "calibration.json",
]


CONFIG_DEFAULT = {
    "map_name": "沉船图-高难-占位先验",
    "alpha_counts": {
        # 与前端/实时链路保持同一类计数先验，避免离线精算走到另一套后验。
        "w": 1.1,
        "g": 2.0,
        "b": 3.0,
        "p": 2.8,
        "o": 2.4,
        "r": 1.8,
    },
    "count_probs": {
        # 旧版兼容字段；当前默认优先使用 alpha_counts。
        "w": 0.31,
        "g": 0.26,
        "b": 0.18,
        "p": 0.12,
        "o": 0.08,
        "r": 0.05,
    },
    "grid_models": {
        # 每件平均格子数的先验；min/max 是单件格子可行范围
        # 默认设置成“较宽”的占位模板，避免过度自信
        "w": {"mean_cells": 1.3, "sd_cells": 0.7, "min_cells": 1, "max_cells": 4},
        "g": {"mean_cells": 1.7, "sd_cells": 0.8, "min_cells": 1, "max_cells": 5},
        "b": {"mean_cells": 2.0, "sd_cells": 0.9, "min_cells": 1, "max_cells": 6},
        "p": {"mean_cells": 2.4, "sd_cells": 1.0, "min_cells": 1, "max_cells": 7},
        "o": {"mean_cells": 2.8, "sd_cells": 1.1, "min_cells": 1, "max_cells": 8},
        "r": {"mean_cells": 3.3, "sd_cells": 1.2, "min_cells": 1, "max_cells": 10},
    },
    "value_models": {
        # 每件价值的占位模板；请用你自己的样本替换
        "w": {"mean_value": 120, "sd_value": 35},
        "g": {"mean_value": 260, "sd_value": 80},
        "b": {"mean_value": 620, "sd_value": 180},
        "p": {"mean_value": 1450, "sd_value": 420},
        "o": {"mean_value": 3400, "sd_value": 950},
        "r": {"mean_value": 9000, "sd_value": 2600},
    },
    "red_type_profiles": {
        "profiles": {
            "small_red": {
                "label": "小红",
                "prior": 0.52,
                "mean_cells_per_item": 2.4,
                "sd_cells_per_item": 0.7,
                "base_item_mean": 4200,
                "base_item_sd": 1200,
                "per_cell_mean": 650,
                "per_cell_sd": 180,
            },
            "big_red": {
                "label": "大红",
                "prior": 0.30,
                "mean_cells_per_item": 4.6,
                "sd_cells_per_item": 0.9,
                "base_item_mean": 8800,
                "base_item_sd": 2200,
                "per_cell_mean": 1050,
                "per_cell_sd": 260,
            },
            "gold_red": {
                "label": "金",
                "prior": 0.18,
                "mean_cells_per_item": 3.4,
                "sd_cells_per_item": 0.8,
                "base_item_mean": 13200,
                "base_item_sd": 2600,
                "per_cell_mean": 780,
                "per_cell_sd": 210,
            },
        }
    },
    "collection_families": {
        "relics": {"label": "文物", "prior": 1.35, "value_bias": 1.18, "red_type_bias": {"big_red": 1.18, "gold_red": 1.28}},
        "books": {"label": "书籍/书画", "prior": 1.15, "value_bias": 1.15, "red_type_bias": {"big_red": 1.08, "gold_red": 1.18}},
        "jewelry": {"label": "珠宝", "prior": 0.95, "value_bias": 1.12, "red_type_bias": {"big_red": 1.08, "gold_red": 1.32}},
        "medicine": {"label": "医药", "prior": 1.00, "value_bias": 1.03, "red_type_bias": {"small_red": 1.08}},
        "furniture": {"label": "家居", "prior": 1.00, "value_bias": 0.88, "red_type_bias": {"small_red": 1.18, "big_red": 0.82, "gold_red": 0.68}},
        "cargo": {"label": "货物/航运", "prior": 1.00, "value_bias": 1.10, "red_type_bias": {"big_red": 1.12, "gold_red": 1.22}},
        "trendy": {"label": "潮流藏品", "prior": 0.90, "value_bias": 0.95, "red_type_bias": {"small_red": 1.16, "big_red": 0.92, "gold_red": 0.84}},
    },
    "solver": {
        "max_states": 250000,
        "top_states_to_print": 12,
        "mc_samples": 20000,
        "unbounded_cell_max_per_item": DEFAULT_UNBOUNDED_CELL_MAX_PER_ITEM,
        "average_observation": {
            "relax_sparse_support": True,
            "sparse_support_threshold": 1,
            "fallback_slack_cells": 1.0,
            "fallback_min_avg": 1.0,
        },
    },
}


STATE_DEFAULT = {
    "total_items": None,       # 总件数 T
    "avg_g": None,             # 绿平均格子
    "avg_g_text": None,        # 绿平均格子原始显示文本
    "avg_b": None,             # 蓝平均格子
    "avg_b_text": None,        # 蓝平均格子原始显示文本
    "avg_p": None,             # 紫平均格子
    "avg_p_text": None,        # 紫平均格子原始显示文本
    "avg_o": None,             # 橙平均格子
    "avg_o_text": None,        # 橙平均格子原始显示文本
    "known_sum_wg": None,      # 白+绿 总件数
    "known_w": None,
    "known_g": None,
    "known_b": None,
    "known_p": None,
    "known_o": None,
    "known_r": None,
    "total_grid_low": None,    # 整仓总格估计下界（可选）
    "total_grid_high": None,   # 整仓总格估计上界（可选）
    "bid_price": None,         # 出价（可选）
}

AVERAGE_TEXT_FIELDS = {
    "avg_g": "avg_g_text",
    "avg_b": "avg_b_text",
    "avg_p": "avg_p_text",
    "avg_o": "avg_o_text",
}
AVERAGE_VALUE_FIELDS = {text_key: value_key for value_key, text_key in AVERAGE_TEXT_FIELDS.items()}
AVERAGE_WARNING_LABELS = {
    "avg_g": "avg_g",
    "avg_b": "avg_b",
    "avg_p": "avg_p",
    "avg_o": "avg_o",
}


@dataclass
class QualityPosterior:
    mean_grid: float
    low_grid: int
    high_grid: int
    feasible_interval: Tuple[int, int]
    mass: List[Tuple[int, float]] = field(default_factory=list)


@dataclass
class CandidateState:
    counts: Dict[str, int]
    quality_posteriors: Dict[str, QualityPosterior]
    total_grid_mean: float
    total_grid_low: int
    total_grid_high: int
    log_score: float


def safe_log(x: float) -> float:
    return math.log(max(x, 1e-300))


def logsumexp(values: List[float]) -> float:
    if not values:
        return float("-inf")
    m = max(values)
    if math.isinf(m):
        return m
    return m + math.log(sum(math.exp(v - m) for v in values))


def normal_pdf(x: float, mean: float, sd: float) -> float:
    sd = max(sd, 1e-6)
    z = (x - mean) / sd
    return math.exp(-0.5 * z * z) / (sd * math.sqrt(2 * math.pi))


def clip(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def quantile_from_sorted(xs: List[float], q: float) -> float:
    if not xs:
        return float("nan")
    if q <= 0:
        return xs[0]
    if q >= 1:
        return xs[-1]
    pos = (len(xs) - 1) * q
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return xs[lo]
    frac = pos - lo
    return xs[lo] * (1 - frac) + xs[hi] * frac


def _read_default_section_json(config_dir: Path, file_name: str) -> Dict:
    return json.loads((config_dir / file_name).read_text(encoding="utf-8"))


def _deep_merge_source_dict(base: Dict, override: Dict) -> Dict:
    merged = copy.deepcopy(base)
    if not isinstance(override, dict):
        return merged

    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge_source_dict(merged[key], value)
        else:
            merged[key] = copy.deepcopy(value)
    return merged


def _normalize_count_probs_from_alpha(alpha_counts: Dict[str, float]) -> Dict[str, float]:
    weights = {
        q: max(float(alpha_counts.get(q, 0.0)), 0.0)
        for q in QUALITIES
        if isinstance(alpha_counts.get(q), (int, float))
    }
    total = sum(weights.values())
    if total <= 0:
        uniform = 1.0 / len(QUALITIES)
        return {q: uniform for q in QUALITIES}
    return {q: weights.get(q, 0.0) / total for q in QUALITIES}


def _has_cell_value_model(model: Dict) -> bool:
    return isinstance(model, dict) and all(
        isinstance(model.get(key), (int, float))
        for key in ("base_item_mean", "base_item_sd", "per_cell_mean", "per_cell_sd")
    )


def _adapt_source_value_model(source_model: Dict, source_grid_model: Dict, fallback_model: Dict) -> Dict:
    adapted = copy.deepcopy(fallback_model)
    if not _has_cell_value_model(source_model):
        return adapted

    adapted.update({
        "base_item_mean": float(source_model["base_item_mean"]),
        "base_item_sd": float(source_model["base_item_sd"]),
        "per_cell_mean": float(source_model["per_cell_mean"]),
        "per_cell_sd": float(source_model["per_cell_sd"]),
    })

    mean_cells = None
    if isinstance(source_grid_model, dict) and isinstance(source_grid_model.get("mean"), (int, float)):
        mean_cells = float(source_grid_model["mean"])
    if mean_cells is not None:
        adapted["mean_value"] = adapted["base_item_mean"] + mean_cells * adapted["per_cell_mean"]
        adapted["sd_value"] = math.sqrt(
            adapted["base_item_sd"] ** 2 + max(mean_cells, 0.0) * (adapted["per_cell_sd"] ** 2)
        )
    return adapted


def _build_source_backed_offline_config(fallback_config: Dict) -> Dict:
    try:
        workspace_default = read_workspace_default_sections(Path(__file__).resolve().parent)
        resolved = resolve_workspace_source_config(workspace_default, "sunken_ship")
        return adapt_offline_internal_config(fallback_config, resolved)
    except Exception:
        return copy.deepcopy(fallback_config)


CONFIG_DEFAULT = _build_source_backed_offline_config(CONFIG_DEFAULT)


def _resolve_source_schema_config(config: Dict) -> Dict:
    if not isinstance(config, dict):
        return {}
    resolved = copy.deepcopy(config)
    presets = resolved.get("map_presets")
    selected_map_id = resolved.get("default_map_id")
    if isinstance(presets, dict) and isinstance(selected_map_id, str) and isinstance(presets.get(selected_map_id), dict):
        resolved = _deep_merge_source_dict(resolved, presets[selected_map_id])
    return resolved


def describe_config_schema(config: Dict) -> str:
    if not isinstance(config, dict):
        return "unknown"
    explicit_schema = _explicit_config_schema(config)
    if explicit_schema is not None:
        return explicit_schema
    if any(key in config for key in SOURCE_SCHEMA_KEYS):
        return "source"
    if any(key in config for key in LEGACY_SCHEMA_KEYS):
        return "legacy"
    return "partial"


def inspect_config_schema_resolution(config: Dict) -> Dict[str, object]:
    schema = describe_config_schema(config)
    explicit_schema = _explicit_config_schema(config)
    present_source_keys = [key for key in SOURCE_SCHEMA_KEYS if isinstance(config, dict) and key in config]
    present_legacy_keys = [key for key in LEGACY_SCHEMA_KEYS if isinstance(config, dict) and key in config]
    mixed_keys = bool(present_source_keys and present_legacy_keys)
    mode = "explicit" if explicit_schema is not None else "heuristic"
    warning = None
    if mode == "heuristic" and mixed_keys:
        warning = (
            f"检测到混合 schema 键(source={','.join(present_source_keys)}; "
            f"legacy={','.join(present_legacy_keys)})；当前按 {schema} 推断，建议补 config_schema。"
        )
    return {
        "schema": schema,
        "mode": mode,
        "mixed_keys": mixed_keys,
        "source_keys": present_source_keys,
        "legacy_keys": present_legacy_keys,
        "warning": warning,
    }


def format_config_schema_notice(config: Dict) -> str:
    resolution = inspect_config_schema_resolution(config)
    notice = f"schema={resolution['schema']} ({resolution['mode']})"
    if isinstance(resolution["warning"], str) and resolution["warning"]:
        notice += f"; {resolution['warning']}"
    return notice


def _legacy_only_value_model_qualities(config: Dict) -> List[str]:
    if not isinstance(config, dict):
        return []
    value_models = config.get("value_models")
    if not isinstance(value_models, dict):
        return []
    qualities = []
    for q in QUALITIES:
        model = value_models.get(q)
        if not isinstance(model, dict):
            continue
        if _has_cell_value_model(model):
            continue
        if "mean_value" in model or "sd_value" in model:
            qualities.append(q)
    return qualities


def format_export_target_notice(schema: str, config: Optional[Dict] = None) -> str:
    normalized = (schema or "source").strip().lower()
    if normalized in {"legacy", "legacy_internal", "legacy_internal_v1"}:
        return "导出目标 schema=legacy_internal；兼容导出，仅供旧脚本使用，不建议长期维护。"
    warnings = []
    if isinstance(config, dict):
        if not (isinstance(config.get("alpha_counts"), dict) and all(isinstance(config["alpha_counts"].get(q), (int, float)) for q in QUALITIES)):
            if isinstance(config.get("count_probs"), dict):
                warnings.append("count_probs -> alpha_counts")
        legacy_only_qualities = _legacy_only_value_model_qualities(config)
        if legacy_only_qualities:
            warnings.append("mean_value/sd_value -> value_model")
    if warnings:
        return f"导出目标 schema=source；注意这是有损转换: {', '.join(warnings)}。"
    return "导出目标 schema=source"


def _export_source_cells_per_item(grid_model: Dict) -> Dict:
    max_cells = optional_int(grid_model.get("max_cells"), None)
    return {
        "mean": float(grid_model.get("mean_cells", 0.0)),
        "sd": float(grid_model.get("sd_cells", 0.0)),
        "min": int(grid_model.get("min_cells", 0)),
        "max": max_cells,
    }


def _export_source_value_model(value_model: Dict) -> Dict:
    if _has_cell_value_model(value_model):
        return {
            "base_item_mean": float(value_model["base_item_mean"]),
            "base_item_sd": float(value_model["base_item_sd"]),
            "per_cell_mean": float(value_model["per_cell_mean"]),
            "per_cell_sd": float(value_model["per_cell_sd"]),
        }
    return {
        "base_item_mean": float(value_model.get("mean_value", 0.0)),
        "base_item_sd": float(value_model.get("sd_value", 0.0)),
        "per_cell_mean": 0.0,
        "per_cell_sd": 0.0,
    }


def export_current_source_schema_config(config: Dict) -> Dict:
    merged = merge_config_with_defaults(config)
    return export_offline_internal_config_to_source(merged)


def export_current_legacy_internal_config(config: Dict) -> Dict:
    merged = merge_config_with_defaults(config)
    return {
        "config_schema": "legacy_internal",
        "map_name": merged.get("map_name", CONFIG_DEFAULT.get("map_name")),
        "count_probs": copy.deepcopy(merged.get("count_probs", CONFIG_DEFAULT.get("count_probs", {}))),
        "grid_models": copy.deepcopy(merged.get("grid_models", CONFIG_DEFAULT.get("grid_models", {}))),
        "value_models": copy.deepcopy(merged.get("value_models", CONFIG_DEFAULT.get("value_models", {}))),
        "red_type_profiles": copy.deepcopy(merged.get("red_type_profiles", {})),
        "collection_families": copy.deepcopy(merged.get("collection_families", {})),
        "solver": copy.deepcopy(merged.get("solver", {})),
    }


def export_config_payload(config: Dict, schema: str = "source") -> Dict:
    normalized = (schema or "source").strip().lower()
    if normalized in {"source", "source_v1"}:
        return export_current_source_schema_config(config)
    if normalized in {"legacy", "legacy_internal", "legacy_internal_v1"}:
        return export_current_legacy_internal_config(config)
    raise ValueError("save_config 只支持 schema=source 或 legacy_internal。")


def _floats_match(lhs, rhs) -> bool:
    if not isinstance(lhs, (int, float)) or not isinstance(rhs, (int, float)):
        return False
    return abs(float(lhs) - float(rhs)) <= 1e-12


def _explicit_config_schema(config: Dict) -> Optional[str]:
    if not isinstance(config, dict):
        return None
    schema = config.get("config_schema")
    if not isinstance(schema, str):
        return None
    normalized = schema.strip().lower()
    if normalized in {"source", "source_v1"}:
        return "source"
    if normalized in {"legacy", "legacy_internal", "legacy_internal_v1"}:
        return "legacy"
    return None


def _legacy_count_probs_should_override_alpha(config: Dict) -> bool:
    legacy_count_probs = config.get("count_probs")
    if not isinstance(legacy_count_probs, dict):
        return False
    explicit_schema = _explicit_config_schema(config)
    if explicit_schema == "source":
        return False
    if explicit_schema == "legacy":
        return True
    if "alpha_counts" not in config:
        return True

    supplied_alpha = config.get("alpha_counts")
    default_alpha = CONFIG_DEFAULT.get("alpha_counts", {})
    default_count_probs = CONFIG_DEFAULT.get("count_probs", {})
    if not isinstance(supplied_alpha, dict):
        return True

    alpha_matches_default = all(_floats_match(supplied_alpha.get(q), default_alpha.get(q)) for q in QUALITIES)
    probs_differ_from_default = any(not _floats_match(legacy_count_probs.get(q), default_count_probs.get(q)) for q in QUALITIES)
    return alpha_matches_default and probs_differ_from_default


def _legacy_mean_value_should_override_cell_model(q: str, override_model: Dict) -> bool:
    if not isinstance(override_model, dict):
        return False
    default_model = CONFIG_DEFAULT.get("value_models", {}).get(q, {})
    legacy_changed = any(
        key in override_model and not _floats_match(override_model.get(key), default_model.get(key))
        for key in ("mean_value", "sd_value")
    )
    cell_matches_default = all(
        key not in override_model or _floats_match(override_model.get(key), default_model.get(key))
        for key in ("base_item_mean", "base_item_sd", "per_cell_mean", "per_cell_sd")
    )
    return legacy_changed and cell_matches_default


def _apply_source_schema_overrides(merged: Dict, config: Dict) -> Dict:
    if not isinstance(config, dict):
        return merged
    if _explicit_config_schema(config) == "legacy":
        return merged

    source_resolved = _resolve_source_schema_config(config)

    if isinstance(source_resolved.get("map_name"), str):
        merged["map_name"] = source_resolved["map_name"]

    alpha_counts = source_resolved.get("alpha_counts")
    if (
        not _legacy_count_probs_should_override_alpha(config)
        and isinstance(alpha_counts, dict)
        and all(isinstance(alpha_counts.get(q), (int, float)) for q in QUALITIES)
    ):
        merged["alpha_counts"] = {q: float(alpha_counts[q]) for q in QUALITIES}
        merged["count_probs"] = _normalize_count_probs_from_alpha(merged["alpha_counts"])

    cells_per_item = source_resolved.get("cells_per_item")
    if isinstance(cells_per_item, dict):
        for q in QUALITIES:
            if not isinstance(cells_per_item.get(q), dict):
                continue
            source_model = cells_per_item[q]
            source_max = source_model["max"] if "max" in source_model else merged["grid_models"][q].get("max_cells")
            merged["grid_models"][q].update({
                "mean_cells": float(source_model.get("mean", merged["grid_models"][q]["mean_cells"])),
                "sd_cells": float(source_model.get("sd", merged["grid_models"][q]["sd_cells"])),
                "min_cells": int(source_model.get("min", merged["grid_models"][q]["min_cells"])),
                "max_cells": optional_int(source_max, None),
            })

    value_model = source_resolved.get("value_model")
    if isinstance(value_model, dict):
        for q in QUALITIES:
            if not isinstance(value_model.get(q), dict):
                continue
            source_grid_model = (cells_per_item or {}).get(q, {})
            if not isinstance(source_grid_model, dict):
                source_grid_model = {}
            if not source_grid_model and isinstance(merged.get("grid_models", {}).get(q), dict):
                source_grid_model = {
                    "mean": merged["grid_models"][q]["mean_cells"],
                    "sd": merged["grid_models"][q]["sd_cells"],
                    "min": merged["grid_models"][q]["min_cells"],
                    "max": merged["grid_models"][q]["max_cells"],
                }
            merged["value_models"][q] = _adapt_source_value_model(
                value_model[q],
                source_grid_model,
                merged["value_models"][q],
            )

    for replace_key in ("red_type_profiles", "collection_families"):
        if replace_key in source_resolved:
            merged[replace_key] = copy.deepcopy(source_resolved[replace_key])

    if isinstance(source_resolved.get("solver"), dict):
        merged["solver"] = deep_merge_dict(merged["solver"], source_resolved["solver"])

    return merged


def _apply_legacy_internal_overrides(merged: Dict, config: Dict) -> Dict:
    if not isinstance(config, dict):
        return merged
    explicit_schema = _explicit_config_schema(config)
    if explicit_schema == "source":
        return merged

    legacy_count_probs = config.get("count_probs")
    if isinstance(legacy_count_probs, dict) and _legacy_count_probs_should_override_alpha(config):
        merged.pop("alpha_counts", None)
        merged["count_probs"] = {
            q: float(legacy_count_probs.get(q, merged.get("count_probs", {}).get(q, 0.0)))
            for q in QUALITIES
        }

    legacy_value_models = config.get("value_models")
    if isinstance(legacy_value_models, dict):
        for q in QUALITIES:
            override_model = legacy_value_models.get(q)
            if not isinstance(override_model, dict):
                continue
            if explicit_schema == "legacy" and ("mean_value" in override_model or "sd_value" in override_model):
                merged["value_models"][q] = {
                    "mean_value": float(override_model.get("mean_value", merged["value_models"][q].get("mean_value", 0.0))),
                    "sd_value": float(override_model.get("sd_value", merged["value_models"][q].get("sd_value", 0.0))),
                }
                continue
            if _legacy_mean_value_should_override_cell_model(q, override_model):
                merged["value_models"][q] = {
                    "mean_value": float(override_model.get("mean_value", merged["value_models"][q].get("mean_value", 0.0))),
                    "sd_value": float(override_model.get("sd_value", merged["value_models"][q].get("sd_value", 0.0))),
                }
                continue
            if _has_cell_value_model(override_model):
                merged["value_models"][q] = deep_merge_dict(merged["value_models"][q], override_model)
                continue
            if "mean_value" in override_model or "sd_value" in override_model:
                merged["value_models"][q] = {
                    "mean_value": float(override_model.get("mean_value", merged["value_models"][q].get("mean_value", 0.0))),
                    "sd_value": float(override_model.get("sd_value", merged["value_models"][q].get("sd_value", 0.0))),
                }
                continue
            merged["value_models"][q] = deep_merge_dict(merged["value_models"][q], override_model)

    return merged


def rounded_avg_interval(avg: float, n: int) -> Optional[Tuple[int, int]]:
    """
    已显示到小数点后两位的均格 avg，对应整数总格 g 的可行区间：
    avg <= g/n < avg + 0.01
    游戏展示规则按两位小数向下截断，而不是四舍五入。
    """
    return shared_rounded_avg_interval(avg, n)


def is_integer_field(value) -> bool:
    return value is None or isinstance(value, int)


def deep_merge_dict(base: Dict, override: Dict) -> Dict:
    merged = copy.deepcopy(base)
    if not isinstance(override, dict):
        return merged

    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge_dict(merged[key], value)
        else:
            merged[key] = copy.deepcopy(value)
    return merged


def parse_observed_average_value(raw: str) -> Tuple[Optional[float], Optional[str]]:
    value = parse_typed_value(raw)
    if value is None:
        return None, None
    return float(value), normalize_observed_average_text(raw)


def format_observed_average_display(value: Optional[float], raw_text: Optional[str]) -> str:
    normalized_text = normalize_observed_average_text(raw_text)
    if normalized_text:
        return normalized_text
    if value is None:
        return "None"
    return f"{value:.2f}"


def merge_config_with_defaults(config: Dict) -> Dict:
    if isinstance(config, dict) and isinstance(config.get("app"), dict) and isinstance(config.get("model"), dict) and isinstance(config.get("maps"), dict):
        resolved = resolve_workspace_source_config(config, config.get("app", {}).get("default_map_id") or "sunken_ship")
        return adapt_offline_internal_config(CONFIG_DEFAULT, resolved)

    merged = deep_merge_dict(CONFIG_DEFAULT, config)
    if isinstance(config, dict):
        merged = _apply_legacy_internal_overrides(merged, config)
        merged = _apply_source_schema_overrides(merged, config)
        for replace_key in ("collection_families", "red_type_profiles"):
            if replace_key in config:
                merged[replace_key] = copy.deepcopy(config[replace_key])
    return merged


def normal_interval_int(mean: float, sd: float, z: float = 1.28155) -> Tuple[int, int]:
    lo = int(math.floor(mean - z * sd))
    hi = int(math.ceil(mean + z * sd))
    return lo, hi


def normalize_weighted_items(entries: List[Dict]) -> List[Dict]:
    if not entries:
        return []
    total = sum(entry["weight"] for entry in entries)
    if total <= 0:
        uniform = 1.0 / len(entries)
        return [{**entry, "prob": uniform} for entry in entries]
    return [{**entry, "prob": entry["weight"] / total} for entry in entries]


def normalize_quality_mass(counts: List[int], weights: List[float]) -> List[Tuple[int, float]]:
    if not counts:
        return []
    total = sum(weights)
    if total <= 0:
        prob = 1.0 / len(counts)
        return [(count, prob) for count in counts]
    return [(count, weight / total) for count, weight in zip(counts, weights)]


def summarize_quality_mass(mass: List[Tuple[int, float]]) -> Tuple[float, int, int]:
    if not mass:
        return 0.0, 0, 0

    mean_grid = sum(count * prob for count, prob in mass)
    running = 0.0
    low_grid = mass[0][0]
    high_grid = mass[-1][0]
    seen_low = False

    for count, prob in mass:
        running += prob
        if not seen_low and running >= 0.10:
            low_grid = count
            seen_low = True
        if running >= 0.90:
            high_grid = count
            break

    return mean_grid, low_grid, high_grid


def approx_quality_posterior_mass(posterior: QualityPosterior) -> List[Tuple[int, float]]:
    if posterior.mass:
        return posterior.mass
    if posterior.low_grid == posterior.high_grid:
        return [(posterior.low_grid, 1.0)]

    low = max(0, int(round(posterior.low_grid)))
    high = max(low, int(round(posterior.high_grid)))
    sd = max((high - low) / 2.56, 0.5)
    counts = list(range(low, high + 1))
    weights = [normal_pdf(count, posterior.mean_grid, sd) for count in counts]
    total = sum(weights)
    if total <= 0:
        prob = 1.0 / len(counts)
        return [(count, prob) for count in counts]
    return [(count, weight / total) for count, weight in zip(counts, weights)]


def convolve_quality_masses(mass_sets: List[List[Tuple[int, float]]]) -> List[Tuple[int, float]]:
    total_mass: Dict[int, float] = {0: 1.0}
    for mass in mass_sets:
        entries = mass if mass else [(0, 1.0)]
        next_mass: Dict[int, float] = {}
        for total_count, total_prob in total_mass.items():
            for count, prob in entries:
                next_mass[total_count + count] = next_mass.get(total_count + count, 0.0) + total_prob * prob
        total_mass = next_mass
    return sorted(total_mass.items(), key=lambda item: item[0])


class AuctionKingEstimator:
    def __init__(self, config: Dict, state: Dict):
        self.config = merge_config_with_defaults(config)
        self.state = deep_merge_dict(STATE_DEFAULT, state)
        self.replace_config(config)

    def replace_config(self, config: Dict):
        self.config = merge_config_with_defaults(config)
        self._red_type_profiles_cache = None
        self._red_type_posterior_cache = {}
        self._red_family_joint_posterior_cache = {}
        self._collection_family_posterior_cache = {}
        self._collection_families_cache = None

    def replace_state(self, state: Dict):
        self.state = deep_merge_dict(STATE_DEFAULT, state)

    def update_state(self, key: str, value):
        if key not in self.state:
            raise KeyError(f"未知字段: {key}")
        if key in AVERAGE_TEXT_FIELDS and value is None:
            self.state[AVERAGE_TEXT_FIELDS[key]] = None
        if key in AVERAGE_VALUE_FIELDS:
            value = normalize_observed_average_text(value)
        self.state[key] = value

    def print_state(self):
        print("\n当前状态：")
        for k, v in self.state.items():
            print(f"  {k}: {v}")
        print()

    def get_missing_average_text_warnings(self) -> List[str]:
        return build_missing_average_text_warnings(
            self.state,
            AVERAGE_TEXT_FIELDS,
            AVERAGE_WARNING_LABELS,
        )

    def get_average_observation_options(self) -> Dict:
        solver = self.config.get("solver", {})
        if not isinstance(solver, dict):
            return {}
        average_observation = solver.get("average_observation", {})
        if not isinstance(average_observation, dict):
            return {}
        return {
            "relax_sparse_support": bool(average_observation.get("relax_sparse_support", False)),
            "sparse_support_threshold": max(0, int(average_observation.get("sparse_support_threshold", 0)))
            if isinstance(average_observation.get("sparse_support_threshold"), int)
            else 0,
            "fallback_slack_cells": max(0.0, float(average_observation.get("fallback_slack_cells", 0.0)))
            if isinstance(average_observation.get("fallback_slack_cells"), (int, float))
            else 0.0,
            "fallback_min_avg": max(0.0, float(average_observation.get("fallback_min_avg", 1.0)))
            if isinstance(average_observation.get("fallback_min_avg"), (int, float))
            else 1.0,
        }

    def validate_state(self) -> List[str]:
        errors = []
        t = self.state["total_items"]
        integer_fields = [
            "total_items",
            "known_sum_wg",
            "known_w",
            "known_g",
            "known_b",
            "known_p",
            "known_o",
            "known_r",
            "total_grid_low",
            "total_grid_high",
        ]
        for field in integer_fields:
            if not is_integer_field(self.state[field]):
                errors.append(f"{field} 必须为整数。")

        if t is None or not isinstance(t, int) or t <= 0:
            errors.append("total_items 必须先填写为正整数。")

        if self.state["total_grid_low"] is not None and self.state["total_grid_high"] is not None:
            if self.state["total_grid_low"] > self.state["total_grid_high"]:
                errors.append("total_grid_low 不能大于 total_grid_high。")

        if self.state["known_sum_wg"] is not None:
            if self.state["known_sum_wg"] < 0:
                errors.append("known_sum_wg 不能为负数。")

        for q in QUALITIES:
            k = f"known_{q}"
            if self.state[k] is not None and self.state[k] < 0:
                errors.append(f"{k} 不能为负数。")

        if self.state["known_w"] is not None and self.state["known_g"] is not None and self.state["known_sum_wg"] is not None:
            if self.state["known_w"] + self.state["known_g"] != self.state["known_sum_wg"]:
                errors.append("known_w + known_g 与 known_sum_wg 不一致。")

        avg_checks = [("avg_g", self.state["avg_g"]), ("avg_b", self.state["avg_b"]), ("avg_p", self.state["avg_p"]), ("avg_o", self.state["avg_o"])]
        for name, val in avg_checks:
            if val is not None and val < 0:
                errors.append(f"{name} 不能为负数。")

        total_known_min = 0
        for q in QUALITIES:
            k = f"known_{q}"
            if self.state[k] is not None:
                total_known_min += self.state[k]
        if self.state["known_sum_wg"] is not None:
            total_known_min += self.state["known_sum_wg"]
            if self.state["known_w"] is not None:
                total_known_min -= self.state["known_w"]
            if self.state["known_g"] is not None:
                total_known_min -= self.state["known_g"]
        if self.state["total_items"] is not None and total_known_min > self.state["total_items"]:
            errors.append("已知件数之和已经超过 total_items。")

        return errors

    def enumerate_counts(self) -> List[Dict[str, int]]:
        t = self.state["total_items"]
        max_states = self.config["solver"]["max_states"]
        known = {q: self.state[f"known_{q}"] for q in QUALITIES}
        sum_wg = self.state["known_sum_wg"]

        results: List[Dict[str, int]] = []

        def direct_value(q):
            return known[q]

        def append_candidate(counts: Dict[str, int]):
            if len(results) >= max_states:
                return
            if sum(counts.values()) != t:
                return
            if sum_wg is not None and counts["w"] + counts["g"] != sum_wg:
                return
            for q in QUALITIES:
                if direct_value(q) is not None and counts[q] != direct_value(q):
                    return
            results.append(counts.copy())

        # 快速路径：已知(白+绿)、蓝、紫，则只需枚举绿与橙
        if sum_wg is not None and known["b"] is not None and known["p"] is not None:
            b = known["b"]
            p = known["p"]
            g_lo = known["g"] if known["g"] is not None else 0
            g_hi = known["g"] if known["g"] is not None else sum_wg
            for g in range(g_lo, g_hi + 1):
                w = sum_wg - g
                if known["w"] is not None and known["w"] != w:
                    continue
                residual = t - (w + g + b + p)
                if residual < 0:
                    continue
                o_lo = known["o"] if known["o"] is not None else 0
                o_hi = known["o"] if known["o"] is not None else residual
                for o in range(o_lo, o_hi + 1):
                    r = residual - o
                    if known["r"] is not None and known["r"] != r:
                        continue
                    counts = {"w": w, "g": g, "b": b, "p": p, "o": o, "r": r}
                    append_candidate(counts)
                    if len(results) >= max_states:
                        return results
            return results

        # 通用回溯
        order = ["w", "g", "b", "p", "o", "r"]

        def future_direct_min(start_idx: int) -> int:
            s = 0
            for j in range(start_idx, len(order)):
                q = order[j]
                if q == "w" and sum_wg is not None and known["g"] is None:
                    continue
                if q == "g" and sum_wg is not None and known["w"] is None:
                    continue
                if known[q] is not None:
                    s += known[q]
            return s

        def backtrack(i: int, remaining: int, partial: Dict[str, int]):
            if len(results) >= max_states:
                return
            if i == len(order):
                if remaining == 0:
                    append_candidate(partial)
                return

            q = order[i]

            if q == "g" and sum_wg is not None and "w" in partial:
                g = sum_wg - partial["w"]
                if g < 0:
                    return
                if known["g"] is not None and known["g"] != g:
                    return
                if g > remaining:
                    return
                partial[q] = g
                backtrack(i + 1, remaining - g, partial)
                partial.pop(q, None)
                return

            if q == "w" and sum_wg is not None and known["g"] is not None:
                w = sum_wg - known["g"]
                if w < 0:
                    return
                if known["w"] is not None and known["w"] != w:
                    return
                if w > remaining:
                    return
                partial[q] = w
                backtrack(i + 1, remaining - w, partial)
                partial.pop(q, None)
                return

            low = known[q] if known[q] is not None else 0
            high = known[q] if known[q] is not None else remaining

            if q == "w" and sum_wg is not None and known["g"] is None:
                high = min(high, sum_wg)

            for n in range(low, high + 1):
                if q == "w" and sum_wg is not None and known["g"] is None:
                    g_needed = sum_wg - n
                    if g_needed < 0:
                        continue
                    if g_needed > remaining - n:
                        continue
                    if known["g"] is not None and known["g"] != g_needed:
                        continue

                future_min = 0
                # 最后一个变量是 r，不需要太复杂
                if remaining - n < 0:
                    continue

                partial[q] = n
                backtrack(i + 1, remaining - n, partial)
                partial.pop(q, None)

        backtrack(0, t, {})
        return results

    def score_count_prior(self, counts: Dict[str, int]) -> float:
        alpha = self.config.get("alpha_counts")
        if isinstance(alpha, dict) and all(isinstance(alpha.get(q), (int, float)) for q in QUALITIES):
            return sum(
                math.lgamma(counts[q] + float(alpha[q])) - math.lgamma(float(alpha[q])) - math.lgamma(counts[q] + 1)
                for q in QUALITIES
            )

        probs = self.config["count_probs"]
        return sum(counts[q] * safe_log(probs[q]) for q in QUALITIES)

    def infer_quality_grid(self, q: str, n: int, avg_obs: Optional[float], avg_text: Optional[str] = None) -> Optional[Tuple[QualityPosterior, float]]:
        model = self.config["grid_models"][q]
        mu = n * model["mean_cells"]
        sd = math.sqrt(max(n, 1)) * model["sd_cells"]
        min_total = n * model["min_cells"]
        max_total = n * get_finite_grid_max_cells(self.config, model)

        if n == 0:
            if avg_obs is not None and abs(avg_obs) >= 1e-12:
                return None
            qp = QualityPosterior(mean_grid=0.0, low_grid=0, high_grid=0, feasible_interval=(0, 0), mass=[(0, 1.0)])
            return qp, 0.0

        if avg_obs is not None:
            feasible = get_matching_total_cells(
                avg_obs,
                n,
                min_total,
                max_total,
                raw_text=avg_text,
                **self.get_average_observation_options(),
            )
            if not feasible:
                return None
            lo = feasible[0]
            hi = feasible[-1]
            weights = [normal_pdf(g, mu, sd) for g in feasible]
            sw = sum(weights)
            if sw <= 0:
                return None
            mass = normalize_quality_mass(feasible, weights)
            mean_grid, low_grid, high_grid = summarize_quality_mass(mass)

            qp = QualityPosterior(
                mean_grid=mean_grid,
                low_grid=low_grid,
                high_grid=high_grid,
                feasible_interval=(lo, hi),
                mass=mass,
            )
            return qp, safe_log(sw)

        feasible = list(range(min_total, max_total + 1))
        weights = [normal_pdf(g, mu, sd) for g in feasible]
        mass = normalize_quality_mass(feasible, weights)
        mean_grid, low_grid, high_grid = summarize_quality_mass(mass)
        qp = QualityPosterior(
            mean_grid=mean_grid,
            low_grid=int(low_grid),
            high_grid=int(high_grid),
            feasible_interval=(min_total, max_total),
            mass=mass,
        )
        return qp, 0.0

    def build_candidate_states(self) -> List[CandidateState]:
        avg_map = {
            "g": self.state["avg_g"],
            "b": self.state["avg_b"],
            "p": self.state["avg_p"],
            "o": self.state["avg_o"],
            "w": None,
            "r": None,
        }
        avg_text_map = {
            "g": self.state["avg_g_text"],
            "b": self.state["avg_b_text"],
            "p": self.state["avg_p_text"],
            "o": self.state["avg_o_text"],
            "w": None,
            "r": None,
        }
        count_candidates = self.enumerate_counts()
        states: List[CandidateState] = []

        total_grid_low = self.state["total_grid_low"]
        total_grid_high = self.state["total_grid_high"]

        for counts in count_candidates:
            log_score = self.score_count_prior(counts)
            quality_posts: Dict[str, QualityPosterior] = {}
            ok = True
            total_low = 0
            total_high = 0
            total_mean = 0.0

            for q in QUALITIES:
                inferred = self.infer_quality_grid(q, counts[q], avg_map[q], avg_text_map[q])
                if inferred is None:
                    ok = False
                    break
                qp, add_score = inferred
                quality_posts[q] = qp
                log_score += add_score
                total_low += qp.low_grid
                total_high += qp.high_grid
                total_mean += qp.mean_grid

            if not ok:
                continue

            if total_grid_low is not None and total_high < total_grid_low:
                continue
            if total_grid_high is not None and total_low > total_grid_high:
                continue

            # 如果有整仓总格约束，给与轻微加分，越贴近中点越好
            if total_grid_low is not None and total_grid_high is not None:
                target = 0.5 * (total_grid_low + total_grid_high)
                width = max(1.0, (total_grid_high - total_grid_low) / 2.0)
                z = (total_mean - target) / width
                log_score += -0.5 * z * z

            states.append(CandidateState(
                counts=counts,
                quality_posteriors=quality_posts,
                total_grid_mean=total_mean,
                total_grid_low=total_low,
                total_grid_high=total_high,
                log_score=log_score,
            ))

        return states

    def normalize_states(self, states: List[CandidateState]) -> List[Tuple[CandidateState, float]]:
        if not states:
            return []
        lse = logsumexp([s.log_score for s in states])
        weighted = [(s, math.exp(s.log_score - lse)) for s in states]
        weighted.sort(key=lambda x: x[1], reverse=True)
        return weighted

    def get_red_type_profiles(self) -> List[Dict]:
        if self._red_type_profiles_cache is not None:
            return self._red_type_profiles_cache

        raw = self.config.get("red_type_profiles", {}).get("profiles", {})
        if not isinstance(raw, dict) or not raw:
            self._red_type_profiles_cache = []
            return self._red_type_profiles_cache

        fallback_value = self.config.get("value_models", {}).get("r", {})
        fallback_grid = self.config.get("grid_models", {}).get("r", {})
        profiles: List[Dict] = []

        for profile_id, profile in raw.items():
            mean_cells = profile.get("mean_cells_per_item", fallback_grid.get("mean_cells"))
            sd_cells = profile.get("sd_cells_per_item", fallback_grid.get("sd_cells"))
            if not isinstance(mean_cells, (int, float)) or not isinstance(sd_cells, (int, float)):
                continue

            entry = {
                "id": profile_id,
                "label": profile.get("label", profile_id),
                "prior": max(float(profile.get("prior", 1.0)), 0.0),
                "mean_cells_per_item": float(mean_cells),
                "sd_cells_per_item": float(sd_cells),
            }

            if all(isinstance(profile.get(k), (int, float)) for k in ["base_item_mean", "base_item_sd", "per_cell_mean", "per_cell_sd"]):
                entry.update({
                    "value_mode": "cell",
                    "base_item_mean": float(profile["base_item_mean"]),
                    "base_item_sd": float(profile["base_item_sd"]),
                    "per_cell_mean": float(profile["per_cell_mean"]),
                    "per_cell_sd": float(profile["per_cell_sd"]),
                    "anchor_item_value": float(profile["base_item_mean"]) + float(mean_cells) * float(profile["per_cell_mean"]),
                })
            else:
                mean_value = profile.get("mean_value", fallback_value.get("mean_value"))
                sd_value = profile.get("sd_value", fallback_value.get("sd_value"))
                if not isinstance(mean_value, (int, float)) or not isinstance(sd_value, (int, float)):
                    continue
                entry.update({
                    "value_mode": "item",
                    "mean_value": float(mean_value),
                    "sd_value": float(sd_value),
                    "anchor_item_value": float(mean_value),
                })

            profiles.append(entry)

        self._red_type_profiles_cache = profiles
        return profiles

    def get_collection_families(self) -> List[Dict]:
        if self._collection_families_cache is not None:
            return self._collection_families_cache

        if not COLLECTION_FAMILIES_PHASE1_RUNTIME_ENABLED:
            self._collection_families_cache = []
            return self._collection_families_cache

        raw = self.config.get("collection_families", {})
        if not isinstance(raw, dict) or not raw:
            self._collection_families_cache = []
            return self._collection_families_cache

        families: List[Dict] = []
        for family_id, family in raw.items():
            prior = family.get("prior", 1.0)
            value_bias = family.get("value_bias", 1.0)
            if not isinstance(prior, (int, float)) or not isinstance(value_bias, (int, float)):
                continue
            red_type_bias = family.get("red_type_bias", {})
            if not isinstance(red_type_bias, dict):
                red_type_bias = {}
            notes = family.get("notes", [])
            if not isinstance(notes, list):
                notes = []
            families.append({
                "id": family_id,
                "label": family.get("label", family_id),
                "prior": max(float(prior), 0.0),
                "value_bias": max(float(value_bias), 0.0),
                "notes": [note for note in notes if isinstance(note, str)],
                "red_type_bias": red_type_bias,
            })

        self._collection_families_cache = families
        return families

    def infer_red_family_joint_posterior(self, red_count: int, total_red_cells: float) -> List[Dict]:
        if red_count <= 0 or not math.isfinite(total_red_cells):
            return []

        cache_key = (red_count, round(total_red_cells, 6))
        if cache_key in self._red_family_joint_posterior_cache:
            return self._red_family_joint_posterior_cache[cache_key]

        profiles = self.get_red_type_profiles()
        if not profiles:
            self._red_family_joint_posterior_cache[cache_key] = []
            return []

        families = self.get_collection_families()
        if not families:
            families = [{
                "id": "_default",
                "label": "默认",
                "prior": 1.0,
                "value_bias": 1.0,
                "notes": [],
                "red_type_bias": {},
            }]

        avg_cells = total_red_cells / red_count
        spread_scale = math.sqrt(max(red_count, 1))
        weighted_entries: List[Dict] = []

        for family in families:
            for profile in profiles:
                family_type_bias_raw = family["red_type_bias"].get(profile["id"])
                family_type_bias = max(float(family_type_bias_raw), 0.0) if isinstance(family_type_bias_raw, (int, float)) else 1.0
                spread = max(profile["sd_cells_per_item"] / spread_scale, 0.05)
                entry = {
                    **profile,
                    "family_id": family["id"],
                    "family_label": family["label"],
                    "family_value_bias": family["value_bias"],
                    "family_notes": family["notes"],
                    "anchor_item_value": profile["anchor_item_value"] * family["value_bias"],
                    "weight": max(family["prior"], 1e-9) * max(profile["prior"], 1e-9) * max(family_type_bias, 1e-9) * normal_pdf(avg_cells, profile["mean_cells_per_item"], spread),
                }
                if profile["value_mode"] == "cell":
                    entry.update({
                        "effective_base_item_mean": profile["base_item_mean"] * family["value_bias"],
                        "effective_base_item_sd": profile["base_item_sd"] * family["value_bias"],
                        "effective_per_cell_mean": profile["per_cell_mean"] * family["value_bias"],
                        "effective_per_cell_sd": profile["per_cell_sd"] * family["value_bias"],
                    })
                else:
                    entry.update({
                        "effective_mean_value": profile["mean_value"] * family["value_bias"],
                        "effective_sd_value": profile["sd_value"] * family["value_bias"],
                    })
                weighted_entries.append(entry)

        posterior = sorted(normalize_weighted_items(weighted_entries), key=lambda item: item["prob"], reverse=True)
        self._red_family_joint_posterior_cache[cache_key] = posterior
        return posterior

    def infer_red_type_posterior(self, red_count: int, total_red_cells: float) -> List[Dict]:
        if red_count <= 0 or not math.isfinite(total_red_cells):
            return []

        cache_key = (red_count, round(total_red_cells, 6))
        if cache_key in self._red_type_posterior_cache:
            return self._red_type_posterior_cache[cache_key]

        joint_posterior = self.infer_red_family_joint_posterior(red_count, total_red_cells)
        if not joint_posterior:
            self._red_type_posterior_cache[cache_key] = []
            return []

        merged: Dict[str, Dict] = {}
        for entry in joint_posterior:
            if entry["id"] not in merged:
                merged[entry["id"]] = {
                    "id": entry["id"],
                    "label": entry["label"],
                    "prob": 0.0,
                    "anchor_item_value": 0.0,
                }
            merged[entry["id"]]["prob"] += entry["prob"]
            merged[entry["id"]]["anchor_item_value"] += entry["prob"] * entry["anchor_item_value"]

        posterior = sorted(
            [
                {
                    **entry,
                    "anchor_item_value": entry["anchor_item_value"] / entry["prob"] if entry["prob"] > 0 else 0.0,
                }
                for entry in merged.values()
            ],
            key=lambda item: item["prob"],
            reverse=True,
        )
        self._red_type_posterior_cache[cache_key] = posterior
        return posterior

    def infer_collection_family_posterior(self, red_count: int, total_red_cells: float) -> List[Dict]:
        if red_count <= 0 or not math.isfinite(total_red_cells):
            return []

        families = self.get_collection_families()
        if not families:
            return []

        cache_key = (red_count, round(total_red_cells, 6))
        if cache_key in self._collection_family_posterior_cache:
            return self._collection_family_posterior_cache[cache_key]

        joint_posterior = self.infer_red_family_joint_posterior(red_count, total_red_cells)
        if not joint_posterior:
            normalized = sorted(
                [
                    {
                        "id": entry["id"],
                        "label": entry["label"],
                        "value_bias": entry["value_bias"],
                        "notes": entry["notes"],
                        "prob": prob_entry["prob"],
                    }
                    for entry, prob_entry in zip(families, normalize_weighted_items([{**family, "weight": max(family["prior"], 1e-9)} for family in families]))
                ],
                key=lambda item: item["prob"],
                reverse=True,
            )
            self._collection_family_posterior_cache[cache_key] = normalized
            return normalized

        merged: Dict[str, Dict] = {}
        for entry in joint_posterior:
            if entry["family_id"] not in merged:
                merged[entry["family_id"]] = {
                    "id": entry["family_id"],
                    "label": entry["family_label"],
                    "value_bias": entry["family_value_bias"],
                    "notes": entry["family_notes"],
                    "prob": 0.0,
                }
            merged[entry["family_id"]]["prob"] += entry["prob"]

        posterior = sorted(merged.values(), key=lambda item: item["prob"], reverse=True)
        self._collection_family_posterior_cache[cache_key] = posterior
        return posterior

    def mix_red_type_posterior(self, red_count: int, red_mass: List[Tuple[int, float]]) -> List[Dict]:
        if red_count <= 0 or not red_mass:
            return []

        merged: Dict[str, Dict] = {}
        for cell_count, cell_prob in red_mass:
            type_posterior = self.infer_red_type_posterior(red_count, float(cell_count))
            for entry in type_posterior:
                if entry["id"] not in merged:
                    merged[entry["id"]] = {
                        "id": entry["id"],
                        "label": entry["label"],
                        "prob": 0.0,
                        "anchor_item_value": 0.0,
                    }
                weight = cell_prob * entry["prob"]
                merged[entry["id"]]["prob"] += weight
                merged[entry["id"]]["anchor_item_value"] += weight * entry["anchor_item_value"]
        return sorted(
            [
                {
                    **entry,
                    "anchor_item_value": entry["anchor_item_value"] / entry["prob"] if entry["prob"] > 0 else 0.0,
                }
                for entry in merged.values()
            ],
            key=lambda item: item["prob"],
            reverse=True,
        )

    def mix_collection_family_posterior(self, red_count: int, red_mass: List[Tuple[int, float]]) -> List[Dict]:
        if red_count <= 0 or not red_mass:
            return []

        merged: Dict[str, Dict] = {}
        for cell_count, cell_prob in red_mass:
            family_posterior = self.infer_collection_family_posterior(red_count, float(cell_count))
            for entry in family_posterior:
                if entry["id"] not in merged:
                    merged[entry["id"]] = {
                        "id": entry["id"],
                        "label": entry["label"],
                        "value_bias": entry["value_bias"],
                        "notes": entry["notes"],
                        "prob": 0.0,
                    }
                merged[entry["id"]]["prob"] += cell_prob * entry["prob"]
        return sorted(merged.values(), key=lambda item: item["prob"], reverse=True)

    def posterior_summary(self, weighted_states: List[Tuple[CandidateState, float]]) -> Dict:
        out = {
            "count_posteriors": {q: {} for q in QUALITIES},
            "mean_counts": {q: 0.0 for q in QUALITIES},
            "mean_grids": {q: 0.0 for q in QUALITIES},
            "grid_intervals": {q: [10**9, -10**9] for q in QUALITIES},
            "grid_prob_map": {q: {} for q in QUALITIES},
            "total_grid_mean": 0.0,
            "total_grid_low": 10**9,
            "total_grid_high": -10**9,
            "total_grid_prob_map": {},
            "orange_count_probs": {},
            "red_count_probs": {},
            "red_type_prob_map": {},
            "family_prob_map": {},
        }

        for state, p in weighted_states:
            for q in QUALITIES:
                n = state.counts[q]
                out["count_posteriors"][q][n] = out["count_posteriors"][q].get(n, 0.0) + p
                out["mean_counts"][q] += n * p
                quality_mass = approx_quality_posterior_mass(state.quality_posteriors[q])
                for count, prob in quality_mass:
                    out["grid_prob_map"][q][count] = out["grid_prob_map"][q].get(count, 0.0) + p * prob

            total_grid_mass = convolve_quality_masses([
                approx_quality_posterior_mass(state.quality_posteriors[q])
                for q in QUALITIES
            ])
            for count, prob in total_grid_mass:
                out["total_grid_prob_map"][count] = out["total_grid_prob_map"].get(count, 0.0) + p * prob

            red_mass = approx_quality_posterior_mass(state.quality_posteriors["r"])
            for entry in self.mix_red_type_posterior(state.counts["r"], red_mass):
                if entry["id"] not in out["red_type_prob_map"]:
                    out["red_type_prob_map"][entry["id"]] = {
                        "id": entry["id"],
                        "label": entry["label"],
                        "prob": 0.0,
                        "anchor_item_value": entry["anchor_item_value"],
                    }
                out["red_type_prob_map"][entry["id"]]["prob"] += p * entry["prob"]
            for entry in self.mix_collection_family_posterior(state.counts["r"], red_mass):
                if entry["id"] not in out["family_prob_map"]:
                    out["family_prob_map"][entry["id"]] = {
                        "id": entry["id"],
                        "label": entry["label"],
                        "value_bias": entry["value_bias"],
                        "notes": entry["notes"],
                        "prob": 0.0,
                    }
                out["family_prob_map"][entry["id"]]["prob"] += p * entry["prob"]

        for q in QUALITIES:
            grid_mass = sorted(out["grid_prob_map"][q].items(), key=lambda item: item[0])
            mean_grid, low_grid, high_grid = summarize_quality_mass(grid_mass)
            out["mean_grids"][q] = mean_grid
            out["grid_intervals"][q] = [low_grid, high_grid]
        del out["grid_prob_map"]

        total_grid_mass = sorted(out["total_grid_prob_map"].items(), key=lambda item: item[0])
        total_grid_mean, total_grid_low, total_grid_high = summarize_quality_mass(total_grid_mass)
        out["total_grid_mean"] = total_grid_mean
        out["total_grid_low"] = total_grid_low
        out["total_grid_high"] = total_grid_high
        del out["total_grid_prob_map"]

        out["orange_count_probs"] = dict(sorted(out["count_posteriors"]["o"].items(), key=lambda kv: kv[1], reverse=True))
        out["red_count_probs"] = dict(sorted(out["count_posteriors"]["r"].items(), key=lambda kv: kv[1], reverse=True))
        out["red_type_probs"] = sorted(out["red_type_prob_map"].values(), key=lambda item: item["prob"], reverse=True)
        out["family_probs"] = sorted(out["family_prob_map"].values(), key=lambda item: item["prob"], reverse=True)
        del out["red_type_prob_map"]
        del out["family_prob_map"]
        return out

    def run_value_mc(self, weighted_states: List[Tuple[CandidateState, float]]) -> Dict:
        samples_n = self.config["solver"]["mc_samples"]
        if not weighted_states:
            return {}

        probs = [p for _, p in weighted_states]
        states = [s for s, _ in weighted_states]
        cum = []
        running = 0.0
        for p in probs:
            running += p
            cum.append(running)

        def draw_state() -> CandidateState:
            u = random.random()
            for idx, c in enumerate(cum):
                if u <= c:
                    return states[idx]
            return states[-1]

        def draw_weighted_entry(entries: List[Dict]) -> Optional[Dict]:
            if not entries:
                return None
            u = random.random()
            running_prob = 0.0
            for entry in entries:
                running_prob += entry["prob"]
                if u <= running_prob:
                    return entry
            return entries[-1]

        def draw_quality_mass(mass: List[Tuple[int, float]]) -> Optional[float]:
            if not mass:
                return None
            u = random.random()
            running_prob = 0.0
            for count, prob in mass:
                running_prob += prob
                if u <= running_prob:
                    return float(count)
            return float(mass[-1][0])

        def draw_cells_from_posterior(grid_post: QualityPosterior) -> float:
            sampled_cells = draw_quality_mass(grid_post.mass)
            if sampled_cells is not None:
                return sampled_cells
            if grid_post.low_grid == grid_post.high_grid:
                return float(grid_post.mean_grid)
            cell_mu = grid_post.mean_grid
            cell_sd = max((grid_post.high_grid - grid_post.low_grid) / 2.56, 0.5)
            return max(0.0, random.gauss(cell_mu, cell_sd))

        def draw_value_from_model(model: Dict, count: int, cells_draw: float) -> float:
            if _has_cell_value_model(model):
                draw = random.gauss(
                    count * model["base_item_mean"],
                    math.sqrt(max(count, 1)) * model["base_item_sd"],
                )
                draw += random.gauss(
                    cells_draw * model["per_cell_mean"],
                    math.sqrt(max(cells_draw, 1.0)) * model["per_cell_sd"],
                )
                return draw

            mu = count * model["mean_value"]
            sd = math.sqrt(max(count, 1)) * model["sd_value"]
            return random.gauss(mu, sd)

        values = []
        bid = self.state["bid_price"]

        for _ in range(samples_n):
            s = draw_state()
            total_value = 0.0
            for q in QUALITIES:
                if s.counts[q] == 0:
                    continue
                model = self.config["value_models"][q]
                grid_post = s.quality_posteriors[q]
                cells_draw = draw_cells_from_posterior(grid_post)
                if q == "r":
                    red_joint = draw_weighted_entry(self.infer_red_family_joint_posterior(s.counts["r"], cells_draw))
                    if red_joint is not None:
                        if red_joint["value_mode"] == "cell":
                            draw = random.gauss(
                                s.counts[q] * red_joint["effective_base_item_mean"],
                                math.sqrt(max(s.counts[q], 1)) * red_joint["effective_base_item_sd"],
                            )
                            draw += random.gauss(
                                cells_draw * red_joint["effective_per_cell_mean"],
                                math.sqrt(max(cells_draw, 1.0)) * red_joint["effective_per_cell_sd"],
                            )
                        else:
                            draw = random.gauss(
                                s.counts[q] * red_joint["effective_mean_value"],
                                math.sqrt(max(s.counts[q], 1)) * red_joint["effective_sd_value"],
                            )
                    else:
                        draw = draw_value_from_model(model, s.counts[q], cells_draw)
                else:
                    draw = draw_value_from_model(model, s.counts[q], cells_draw)
                if draw < 0:
                    draw = 0.0
                total_value += draw
            values.append(total_value)

        values.sort()
        mean_value = statistics.fmean(values)
        q05 = quantile_from_sorted(values, 0.05)
        q25 = quantile_from_sorted(values, 0.25)
        q50 = quantile_from_sorted(values, 0.50)
        q75 = quantile_from_sorted(values, 0.75)
        q95 = quantile_from_sorted(values, 0.95)

        result = {
            "mean_value": mean_value,
            "q05": q05,
            "q25": q25,
            "q50": q50,
            "q75": q75,
            "q95": q95,
        }

        if bid is not None and bid > 0:
            profits = [v - bid for v in values]
            positive = [max(x, 0.0) for x in profits]
            negative = [max(-x, 0.0) for x in profits]
            profit_prob = sum(1 for x in profits if x > 0) / len(profits)
            loss_prob = 1.0 - profit_prob
            avg_gain = statistics.fmean(positive)
            avg_loss = statistics.fmean(negative)
            result.update({
                "bid_price": bid,
                "expected_profit": mean_value - bid,
                "profit_prob": profit_prob,
                "loss_prob": loss_prob,
                "ev_roi": mean_value / bid - 1.0,
                "q25_roi": q25 / bid - 1.0,
                "q05_roi": q05 / bid - 1.0,
                "gain_loss_ratio": (avg_gain / avg_loss) if avg_loss > 1e-9 else float("inf"),
            })
        return result

    def recompute(self) -> Optional[Dict]:
        errors = self.validate_state()
        if errors:
            print("\n输入存在问题：")
            for e in errors:
                print(" -", e)
            print()
            return None

        states = self.build_candidate_states()
        if not states:
            print("\n没有找到可行解。建议检查：")
            print(" - 总件数是否填错")
            print(" - 均格是否抄错")
            print(" - known_sum_wg / known_b / known_p 是否冲突")
            print(" - 总格区间是否卡得太死")
            print()
            return None

        weighted = self.normalize_states(states)
        summary = self.posterior_summary(weighted)
        valuation = self.run_value_mc(weighted)
        return {
            "weighted_states": weighted,
            "summary": summary,
            "valuation": valuation,
        }

    def print_report(self, report: Dict):
        weighted = report["weighted_states"]
        summary = report["summary"]
        valuation = report["valuation"]

        print("\n" + "=" * 72)
        print(f"地图先验: {self.config['map_name']}")
        print(f"可行状态数: {len(weighted)}")
        print("=" * 72)

        compatibility_warnings = self.get_missing_average_text_warnings()
        if compatibility_warnings:
            print("\n[兼容提示]")
            for warning in compatibility_warnings:
                print(f"  - {warning}")

        topk = self.config["solver"]["top_states_to_print"]
        print("\n[Top 候选状态]")
        for i, (state, p) in enumerate(weighted[:topk], start=1):
            cnt_str = " ".join(f"{QUALITY_NAMES[q]}{state.counts[q]}" for q in QUALITIES)
            print(
                f"{i:>2}. P={p:>7.2%} | {cnt_str} | "
                f"总格≈{state.total_grid_mean:.1f} [{state.total_grid_low},{state.total_grid_high}]"
            )

        def top_probs(d: Dict[int, float], k=6):
            return list(sorted(d.items(), key=lambda kv: kv[1], reverse=True))[:k]

        print("\n[橙色数量后验]")
        for n, p in top_probs(summary["orange_count_probs"]):
            print(f"  橙{n}: {p:.2%}")

        print("\n[红色数量后验]")
        for n, p in top_probs(summary["red_count_probs"]):
            print(f"  红{n}: {p:.2%}")

        if summary["red_type_probs"]:
            print("\n[红件模板后验]")
            for entry in summary["red_type_probs"][:4]:
                print(f"  {entry['label']}: {entry['prob']:.2%} | 件均锚值≈{entry['anchor_item_value']:.0f}")

        if summary["family_probs"]:
            print("\n[家族后验]")
            for entry in summary["family_probs"][:4]:
                note = entry["notes"][0] if entry["notes"] else "家族估值偏置"
                print(f"  {entry['label']}: {entry['prob']:.2%} | 估值偏置≈{entry['value_bias']:.2f}x | {note}")

        print("\n[各颜色件数期望]")
        for q in QUALITIES:
            print(f"  {QUALITY_NAMES[q]}: {summary['mean_counts'][q]:.2f}")

        print("\n[各颜色总格估计]")
        for q in QUALITIES:
            lo, hi = summary["grid_intervals"][q]
            print(
                f"  {QUALITY_NAMES[q]}: 均值≈{summary['mean_grids'][q]:.2f} | 区间≈[{lo},{hi}]"
            )

        print("\n[整仓总格估计]")
        print(
            f"  均值≈{summary['total_grid_mean']:.2f} | 区间≈[{summary['total_grid_low']},{summary['total_grid_high']}]"
        )

        print("\n[估值区间（依赖 value_models 配置）]")
        print(f"  期望估值 EV   : {valuation['mean_value']:.0f}")
        print(f"  保守 5% 分位 : {valuation['q05']:.0f}")
        print(f"  保守 25%分位 : {valuation['q25']:.0f}")
        print(f"  中位数 50%   : {valuation['q50']:.0f}")
        print(f"  乐观 75%分位 : {valuation['q75']:.0f}")
        print(f"  乐观 95%分位 : {valuation['q95']:.0f}")

        if "bid_price" in valuation:
            print("\n[出价损益]")
            print(f"  你的出价      : {valuation['bid_price']:.0f}")
            print(f"  期望利润      : {valuation['expected_profit']:.0f}")
            print(f"  盈利概率      : {valuation['profit_prob']:.2%}")
            print(f"  亏损概率      : {valuation['loss_prob']:.2%}")
            print(f"  EV ROI        : {valuation['ev_roi']:.2%}")
            print(f"  保守 ROI(25%) : {valuation['q25_roi']:.2%}")
            print(f"  极保守 ROI(5%): {valuation['q05_roi']:.2%}")
            glr = valuation["gain_loss_ratio"]
            if math.isinf(glr):
                print("  损益比        : ∞")
            else:
                print(f"  损益比        : {glr:.3f}")

        print("\n[备注]")
        print("  1) 橙数/红数部分可以直接用。")
        print("  2) 红件模板后验会把红区继续映射到小红 / 大红 / 金，用来缩小终值误差。")
        print("  3) 估值区间是否靠谱，取决于你有没有把 value_models / red_type_profiles 换成自己的沉船图样本。")
        print("  4) 如果橙色后验太分散，优先补：紫/蓝数量、总格粗估、或高品轮廓信息。")
        print("=" * 72 + "\n")


def parse_typed_value(raw: str):
    raw = raw.strip()
    if raw.lower() in {"none", "null", ""}:
        return None
    try:
        if "." in raw:
            return float(raw)
        return int(raw)
    except ValueError:
        raise ValueError(f"无法解析数值: {raw}")


def build_ahmed_round_updates(parts: List[str]) -> Dict[str, Optional[float]]:
    cmd = parts[0].lower()
    if cmd == "r1":
        if len(parts) != 3:
            raise ValueError("用法：r1 <total_items> <blue_count>")
        return {
            "total_items": parse_typed_value(parts[1]),
            "known_b": parse_typed_value(parts[2]),
        }
    if cmd == "r2":
        if len(parts) not in {2, 3}:
            raise ValueError("用法：r2 <orange_avg> [purple_count]")
        avg_o, avg_o_text = parse_observed_average_value(parts[1])
        return {
            "avg_o": avg_o,
            "avg_o_text": avg_o_text,
            "known_p": parse_typed_value(parts[2]) if len(parts) > 2 else None,
        }
    if cmd == "r3":
        if len(parts) != 3:
            raise ValueError("用法：r3 <green_count> <purple_avg>")
        avg_p, avg_p_text = parse_observed_average_value(parts[2])
        return {
            "known_g": parse_typed_value(parts[1]),
            "avg_p": avg_p,
            "avg_p_text": avg_p_text,
        }
    if cmd == "r4":
        if len(parts) != 2:
            raise ValueError("用法：r4 <blue_avg>")
        avg_b, avg_b_text = parse_observed_average_value(parts[1])
        return {
            "avg_b": avg_b,
            "avg_b_text": avg_b_text,
        }
    if cmd == "r5":
        if len(parts) not in {2, 3}:
            raise ValueError("用法：r5 <white_green_total> [white_count]")
        return {
            "known_sum_wg": parse_typed_value(parts[1]),
            "known_w": parse_typed_value(parts[2]) if len(parts) > 2 else None,
        }
    raise ValueError(f"不支持的轮次命令: {cmd}")


def apply_ahmed_round_command(estimator: "AuctionKingEstimator", parts: List[str]) -> Optional[Dict]:
    updates = build_ahmed_round_updates(parts)
    for key, value in updates.items():
        estimator.update_state(key, value)
    return estimator.recompute()


def apply_loaded_state_payload(estimator: "AuctionKingEstimator", payload: Dict) -> Optional[Dict]:
    estimator.replace_state(payload)
    if estimator.state.get("total_items") is None:
        return None
    return estimator.recompute()


def apply_loaded_config_payload(estimator: "AuctionKingEstimator", payload: Dict) -> Optional[Dict]:
    estimator.replace_config(payload)
    if estimator.state.get("total_items") is None:
        return None
    return estimator.recompute()


def save_json(path: str, payload: Dict):
    Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_json(path: str) -> Dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


HELP_TEXT = """
命令：
  help
      查看帮助

  state
      查看当前录入状态

  recompute
      重新计算并输出报告

  r1 <total_items> <blue_count>
      艾哈默德 R1：总件数 + 蓝色数量

  r2 <orange_avg> [purple_count]
      艾哈默德 R2：默认只输橙均格；需要时再补紫色数量

  r3 <green_count> <purple_avg>
      艾哈默德 R3：绿色数量 + 紫色均格

  r4 <blue_avg>
      艾哈默德 R4：蓝色均格

  r5 <white_green_total> [white_count]
      艾哈默德 R5：绿白总数；白色数量可选

  set <字段> <值>
      设置字段，例如：
      set total_items 24
      set avg_o 2.58
      set avg_p 2.12
      set avg_b 1.74
      set avg_g 1.40
      set known_sum_wg 13
      set known_b 5
      set known_p 3
      set total_grid_low 92
      set total_grid_high 104
      set bid_price 18800

      清空字段：
      set avg_o none

  save_state <文件路径>
      保存当前输入状态

  load_state <文件路径>
      读取输入状态

  save_config <文件路径> [source|legacy_internal]
      导出当前配置模板；默认 source，也可显式导出 legacy_internal

  load_config <文件路径>
      加载你自己的配置文件，并识别 source / legacy schema
      建议在文件里显式写 config_schema: source 或 legacy_internal

  save_families <文件路径>
      只导出当前 collection_families 模板

  load_families <文件路径>
      只替换当前 collection_families 模板

  guide
      再走一遍顺序录入

  quit / exit
      退出脚本
""".strip()


GUIDE_FIELDS = [
    ("total_items", "总件数 total_items（整数，必填）"),
    ("avg_o", "橙平均格子 avg_o（可空）"),
    ("avg_p", "紫平均格子 avg_p（可空）"),
    ("avg_b", "蓝平均格子 avg_b（可空）"),
    ("avg_g", "绿平均格子 avg_g（可空）"),
    ("known_sum_wg", "白+绿总件数 known_sum_wg（可空）"),
    ("known_w", "白数量 known_w（可空）"),
    ("known_g", "绿数量 known_g（可空）"),
    ("known_b", "蓝数量 known_b（可空）"),
    ("known_p", "紫数量 known_p（可空）"),
    ("known_o", "橙数量 known_o（可空）"),
    ("known_r", "红数量 known_r（可空）"),
    ("total_grid_low", "整仓总格下界 total_grid_low（可空）"),
    ("total_grid_high", "整仓总格上界 total_grid_high（可空）"),
    ("bid_price", "你的出价 bid_price（可空）"),
]


def run_guide(estimator: AuctionKingEstimator):
    print("\n开始顺序录入。直接回车表示跳过该字段。")
    for key, label in GUIDE_FIELDS:
        current = estimator.state.get(key)
        prompt = f"{label}"
        if current is not None:
            prompt += f" [当前={current}]"
        prompt += "："
        raw = input(prompt).strip()
        if not raw:
            continue
        if raw.lower() in {"none", "null"}:
            estimator.update_state(key, None)
            continue
        if key in AVERAGE_TEXT_FIELDS:
            value, raw_text = parse_observed_average_value(raw)
            estimator.update_state(key, value)
            estimator.update_state(AVERAGE_TEXT_FIELDS[key], raw_text)
        else:
            estimator.update_state(key, parse_typed_value(raw))
    print("\n已更新。输入 recompute 查看结果。\n")


def main():
    config = json.loads(json.dumps(CONFIG_DEFAULT))
    state = json.loads(json.dumps(STATE_DEFAULT))
    estimator = AuctionKingEstimator(config=config, state=state)

    print("\n竞拍之王 - 沉船图高难精算脚本")
    print("艾哈默德默认录入链：r1 -> r2 -> r3 -> r4 -> r5")
    print("离线精算也支持 guide / set ...；R2 默认只看橙均格，紫数可选。")
    print("使用 r1 -> r5 时每轮会自动重算；guide / set ... 仍需手动 recompute。")
    print("默认值会优先读取 config/default 的默认节与沉船 preset。")
    print("save_config 默认导出 source schema；需要兼容旧脚本时可加 legacy_internal。")
    print("legacy_internal 仅是兼容导出，不建议当长期 source-of-truth 维护。")
    print("如果你手里还是旧版 legacy schema，load_config 也会兼容识别。")
    print("混合字段但未写 config_schema 时，脚本会提示当前是 explicit 还是 heuristic。\n")

    while True:
        try:
            line = input("AK> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n退出。")
            break

        if not line:
            continue

        parts = shlex.split(line)
        cmd = parts[0].lower()

        try:
            if cmd in {"quit", "exit"}:
                print("退出。")
                break

            elif cmd == "help":
                print(HELP_TEXT)

            elif cmd == "state":
                estimator.print_state()

            elif cmd == "guide":
                run_guide(estimator)

            elif cmd == "recompute":
                report = estimator.recompute()
                if report is not None:
                    estimator.print_report(report)

            elif cmd in {"r1", "r2", "r3", "r4", "r5"}:
                updates = build_ahmed_round_updates(parts)
                report = apply_ahmed_round_command(estimator, parts)
                rendered = ", ".join(f"{key}={value}" for key, value in updates.items())
                print(f"已按 {cmd.upper()} 更新：{rendered}")
                if report is not None:
                    estimator.print_report(report)

            elif cmd == "set":
                if len(parts) < 3:
                    print("用法：set <字段> <值>")
                    continue
                key = parts[1]
                if key in AVERAGE_TEXT_FIELDS:
                    value, raw_text = parse_observed_average_value(parts[2])
                    estimator.update_state(key, value)
                    estimator.update_state(AVERAGE_TEXT_FIELDS[key], raw_text)
                    print(f"已设置 {key} = {format_observed_average_display(value, raw_text)}")
                else:
                    value = parse_typed_value(parts[2])
                    estimator.update_state(key, value)
                    print(f"已设置 {key} = {value}")

            elif cmd == "save_state":
                if len(parts) != 2:
                    print("用法：save_state <文件路径>")
                    continue
                save_json(parts[1], estimator.state)
                print(f"已保存状态到 {parts[1]}")

            elif cmd == "load_state":
                if len(parts) != 2:
                    print("用法：load_state <文件路径>")
                    continue
                report = apply_loaded_state_payload(estimator, load_json(parts[1]))
                print(f"已加载状态 {parts[1]}")
                if report is not None:
                    estimator.print_report(report)

            elif cmd == "save_config":
                if len(parts) not in {2, 3}:
                    print("用法：save_config <文件路径> [source|legacy_internal]")
                    continue
                export_schema = parts[2] if len(parts) == 3 else "source"
                exported = export_config_payload(estimator.config, export_schema)
                save_json(parts[1], exported)
                print(f"已导出配置模板到 {parts[1]} ({format_config_schema_notice(exported)})")
                print(format_export_target_notice(export_schema, estimator.config))

            elif cmd == "load_config":
                if len(parts) != 2:
                    print("用法：load_config <文件路径>")
                    continue
                loaded = load_json(parts[1])
                report = apply_loaded_config_payload(estimator, loaded)
                print(f"已加载配置 {parts[1]} ({format_config_schema_notice(loaded)})")
                if report is not None:
                    estimator.print_report(report)

            elif cmd == "save_families":
                if len(parts) != 2:
                    print("用法：save_families <文件路径>")
                    continue
                save_json(parts[1], export_collection_families_payload(estimator.config))
                print(f"已导出家族模板到 {parts[1]}")

            elif cmd == "load_families":
                if len(parts) != 2:
                    print("用法：load_families <文件路径>")
                    continue
                report = apply_loaded_config_payload(
                    estimator,
                    apply_collection_families_payload(estimator.config, load_json(parts[1])),
                )
                print(f"已加载家族模板 {parts[1]}")
                if report is not None:
                    estimator.print_report(report)

            else:
                print("未知命令。输入 help 查看帮助。")

        except Exception as e:
            print("发生错误：", e)


if __name__ == "__main__":
    random.seed(42)
    main()
