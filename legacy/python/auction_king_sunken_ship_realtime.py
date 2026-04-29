#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
竞拍之王 - 沉船图高难 - 5回合实时拟合脚本
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
    adapt_realtime_internal_config,
    export_realtime_internal_config_to_source,
    read_workspace_default_sections,
    resolve_workspace_source_config,
)

QUALITIES = ["w", "g", "b", "p", "o", "r"]
COLLECTION_FAMILIES_PHASE1_RUNTIME_ENABLED = False
DEFAULT_UNBOUNDED_CELL_MAX_PER_ITEM = 30
QN = {"w": "白", "g": "绿", "b": "蓝", "p": "紫", "o": "橙", "r": "红"}


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


def get_finite_cell_model_max(config: Dict, model: Dict) -> int:
    min_cells = optional_int(model.get("min"), 0)
    max_cells = optional_int(model.get("max"), None)
    if max_cells is not None:
        return max(min_cells, max_cells)
    return max(min_cells, get_unbounded_cell_max_per_item(config))

CONFIG_DEFAULT = {
    "map_name": "沉船图-高难-实时滤波模板",
    "alpha_counts": {
        "w": 5.8,
        "g": 5.0,
        "b": 3.5,
        "p": 2.5,
        "o": 1.8,
        "r": 0.9,
    },
    "cells_per_item": {
        "w": {"mean": 1.25, "sd": 0.55, "min": 1, "max": 3},
        "g": {"mean": 1.50, "sd": 0.65, "min": 1, "max": 4},
        "b": {"mean": 1.85, "sd": 0.75, "min": 1, "max": 5},
        "p": {"mean": 2.20, "sd": 0.85, "min": 1, "max": 6},
        "o": {"mean": 2.65, "sd": 0.95, "min": 1, "max": 8},
        "r": {"mean": 3.25, "sd": 1.20, "min": 1, "max": 10},
    },
    "value_model": {
        "w": {"base_item_mean": 80,   "base_item_sd": 25,   "per_cell_mean": 30,  "per_cell_sd": 8},
        "g": {"base_item_mean": 170,  "base_item_sd": 55,   "per_cell_mean": 60,  "per_cell_sd": 18},
        "b": {"base_item_mean": 420,  "base_item_sd": 140,  "per_cell_mean": 120, "per_cell_sd": 35},
        "p": {"base_item_mean": 1050, "base_item_sd": 300,  "per_cell_mean": 240, "per_cell_sd": 70},
        "o": {"base_item_mean": 2500, "base_item_sd": 700,  "per_cell_mean": 420, "per_cell_sd": 120},
        "r": {"base_item_mean": 7000, "base_item_sd": 2000, "per_cell_mean": 900, "per_cell_sd": 250},
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
        "relics": {
            "label": "文物",
            "prior": 1.15,
            "value_bias": 1.18,
            "red_type_bias": {"gold_red": 1.20, "big_red": 1.08},
            "notes": ["沉船里高价值红件更容易把估值拉高"],
        },
        "household": {
            "label": "家居",
            "prior": 1.00,
            "value_bias": 0.92,
            "red_type_bias": {"small_red": 1.08},
            "notes": ["偏稳态红件，单件价值通常低于文物"],
        },
    },
    "solver": {
        "max_states": 500000,
        "posterior_print_k": 10,
        "mc_samples": 20000,
        "unbounded_cell_max_per_item": DEFAULT_UNBOUNDED_CELL_MAX_PER_ITEM,
        "average_observation": {
            "relax_sparse_support": True,
            "sparse_support_threshold": 1,
            "fallback_slack_cells": 1.0,
            "fallback_min_avg": 1.0,
        },
    },
    "report": {
        "orange_top_k": 8,
        "red_top_k": 8,
        "red_cell_top_k": 8,
        "red_type_top_k": 4,
    },
}


def _build_source_backed_realtime_config(fallback_config: Dict) -> Dict:
    try:
        workspace_default = read_workspace_default_sections(Path(__file__).resolve().parent)
        resolved = resolve_workspace_source_config(workspace_default, "sunken_ship")
        return adapt_realtime_internal_config(fallback_config, resolved)
    except Exception:
        return copy.deepcopy(fallback_config)


CONFIG_DEFAULT = _build_source_backed_realtime_config(CONFIG_DEFAULT)

STATE_DEFAULT = {
    "r1_total_items": None,
    "r1_blue_count": None,
    "r2_orange_avg": None,
    "r2_orange_avg_text": None,
    "r2_purple_count": None,
    "r3_green_count": None,
    "r3_purple_avg": None,
    "r3_purple_avg_text": None,
    "r4_blue_avg": None,
    "r4_blue_avg_text": None,
    "r5_white_green_total": None,
    "r5_white_count": None,
    "bid_price": None,
}

AVERAGE_TEXT_FIELDS = {
    "r2_orange_avg": "r2_orange_avg_text",
    "r3_purple_avg": "r3_purple_avg_text",
    "r4_blue_avg": "r4_blue_avg_text",
}
AVERAGE_VALUE_FIELDS = {text_key: value_key for value_key, text_key in AVERAGE_TEXT_FIELDS.items()}
AVERAGE_WARNING_LABELS = {
    "r2_orange_avg": "r2_orange_avg",
    "r3_purple_avg": "r3_purple_avg",
    "r4_blue_avg": "r4_blue_avg",
}


@dataclass
class ColorGridPosterior:
    mean_cells: float
    p10_cells: int
    p90_cells: int
    feasible_low: int
    feasible_high: int
    mass: List[Tuple[int, float]] = field(default_factory=list)


@dataclass
class Candidate:
    counts: Dict[str, int]
    color_grids: Dict[str, ColorGridPosterior]
    log_score: float


def safe_log(x: float) -> float:
    return math.log(max(x, 1e-300))


def logsumexp(xs: List[float]) -> float:
    if not xs:
        return float("-inf")
    m = max(xs)
    return m + math.log(sum(math.exp(x - m) for x in xs))


def normal_pdf(x: float, mean: float, sd: float) -> float:
    sd = max(sd, 1e-9)
    z = (x - mean) / sd
    return math.exp(-0.5 * z * z) / (sd * math.sqrt(2 * math.pi))


def quantile_sorted(xs: List[float], q: float) -> float:
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

    mean_cells = sum(count * prob for count, prob in mass)
    running = 0.0
    p10_cells = mass[0][0]
    p90_cells = mass[-1][0]
    seen10 = False

    for count, prob in mass:
        running += prob
        if not seen10 and running >= 0.10:
            p10_cells = count
            seen10 = True
        if running >= 0.90:
            p90_cells = count
            break

    return mean_cells, p10_cells, p90_cells


def approx_posterior_mass(posterior: ColorGridPosterior) -> List[Tuple[int, float]]:
    if posterior.mass:
        return posterior.mass
    if posterior.p10_cells == posterior.p90_cells:
        return [(posterior.p10_cells, 1.0)]

    low = max(0, int(round(posterior.p10_cells)))
    high = max(low, int(round(posterior.p90_cells)))
    sd = max((high - low) / 2.56, 0.5)
    counts = list(range(low, high + 1))
    weights = [normal_pdf(count, posterior.mean_cells, sd) for count in counts]
    total = sum(weights)
    if total <= 0:
        prob = 1.0 / len(counts)
        return [(count, prob) for count in counts]
    return [(count, weight / total) for count, weight in zip(counts, weights)]


def rounded_avg_interval(avg: float, n: int) -> Optional[Tuple[int, int]]:
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
    value = parse_num(raw)
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
        return adapt_realtime_internal_config(CONFIG_DEFAULT, resolved)

    merged = deep_merge_dict(CONFIG_DEFAULT, config)
    if isinstance(config, dict):
        for replace_key in ("collection_families", "red_type_profiles"):
            if replace_key in config:
                merged[replace_key] = copy.deepcopy(config[replace_key])
    return merged


class RealtimeRoundEstimator:
    def __init__(self, config: Dict, state: Dict):
        self.config = merge_config_with_defaults(config)
        self.state = deep_merge_dict(STATE_DEFAULT, state)
        self.replace_config(config)

    def replace_config(self, config: Dict):
        self.config = merge_config_with_defaults(config)
        self._red_type_profiles_cache = None
        self._red_family_joint_posterior_cache = {}
        self._collection_family_posterior_cache = {}
        self._collection_families_cache = None
        self._red_type_posterior_cache = {}

    def replace_state(self, state: Dict):
        self.state = deep_merge_dict(STATE_DEFAULT, state)

    def current_round(self) -> int:
        if self.state["r5_white_green_total"] is not None:
            return 5
        if self.state["r5_white_count"] is not None:
            return 5
        if self.state["r4_blue_avg"] is not None:
            return 4
        if self.state["r3_green_count"] is not None or self.state["r3_purple_avg"] is not None:
            return 3
        if self.state["r2_orange_avg"] is not None or self.state["r2_purple_count"] is not None:
            return 2
        if self.state["r1_total_items"] is not None or self.state["r1_blue_count"] is not None:
            return 1
        return 0

    def has_round_inputs(self) -> bool:
        return any(
            self.state[key] is not None
            for key in [
                "r1_total_items",
                "r1_blue_count",
                "r2_orange_avg",
                "r2_purple_count",
                "r3_green_count",
                "r3_purple_avg",
                "r4_blue_avg",
                "r5_white_green_total",
                "r5_white_count",
            ]
        )

    def show_state(self):
        print("\n当前观测：")
        for k, v in self.state.items():
            print(f"  {k}: {v}")
        print(f"当前轮次: R{self.current_round()}\n")

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

    def set_field(self, key: str, value):
        if key not in self.state:
            raise KeyError(f"未知字段: {key}")
        if key in AVERAGE_TEXT_FIELDS and value is None:
            self.state[AVERAGE_TEXT_FIELDS[key]] = None
        if key in AVERAGE_VALUE_FIELDS:
            value = normalize_observed_average_text(value)
        self.state[key] = value

    def validate(self) -> List[str]:
        s = self.state
        errs = []
        integer_fields = [
            "r1_total_items",
            "r1_blue_count",
            "r2_purple_count",
            "r3_green_count",
            "r5_white_green_total",
            "r5_white_count",
        ]
        for field in integer_fields:
            if not is_integer_field(s.get(field)):
                errs.append(f"{field} 必须为整数。")
        if s["r1_total_items"] is None and any(s[k] is not None for k in s if k != "bid_price"):
            errs.append("请先输入 R1 的总数量。")
        if s["r1_total_items"] is not None and (not isinstance(s["r1_total_items"], int) or s["r1_total_items"] <= 0):
            errs.append("r1_total_items 必须为正整数。")
        if s["r1_blue_count"] is not None and s["r1_total_items"] is not None:
            if s["r1_blue_count"] < 0 or s["r1_blue_count"] > s["r1_total_items"]:
                errs.append("r1_blue_count 超出范围。")
        if s["r2_purple_count"] is not None and s["r1_total_items"] is not None:
            if s["r2_purple_count"] < 0 or s["r2_purple_count"] > s["r1_total_items"]:
                errs.append("r2_purple_count 超出范围。")
        if s["r3_green_count"] is not None and s["r1_total_items"] is not None:
            if s["r3_green_count"] < 0 or s["r3_green_count"] > s["r1_total_items"]:
                errs.append("r3_green_count 超出范围。")
        for k in ["r2_orange_avg", "r3_purple_avg", "r4_blue_avg"]:
            if s[k] is not None and s[k] < 0:
                errs.append(f"{k} 不能为负数。")
        if s["r5_white_green_total"] is not None:
            if s["r5_white_green_total"] < 0:
                errs.append("r5_white_green_total 不能为负。")
            if s["r1_total_items"] is not None and s["r5_white_green_total"] > s["r1_total_items"]:
                errs.append("r5_white_green_total 不能超过总数量。")
            if s["r3_green_count"] is not None and s["r5_white_green_total"] < s["r3_green_count"]:
                errs.append("r5_white_green_total 不能小于绿色数量。")
            if s["r5_white_count"] is not None and s["r5_white_green_total"] < s["r5_white_count"]:
                errs.append("r5_white_green_total 不能小于白色数量。")
        if s["r5_white_count"] is not None:
            if s["r5_white_count"] < 0:
                errs.append("r5_white_count 不能为负。")
            if s["r1_total_items"] is not None and s["r5_white_count"] > s["r1_total_items"]:
                errs.append("r5_white_count 不能超过总数量。")
        if (
            s["r5_white_count"] is not None
            and s["r3_green_count"] is not None
            and s["r5_white_green_total"] is not None
            and s["r5_white_count"] + s["r3_green_count"] != s["r5_white_green_total"]
        ):
            errs.append("r5_white_count + r3_green_count 必须等于 r5_white_green_total。")
        if s["r1_total_items"] is not None:
            total_known = 0
            for k in ["r1_blue_count", "r2_purple_count", "r3_green_count"]:
                if s[k] is not None:
                    total_known += s[k]
            if s["r5_white_green_total"] is not None:
                total_known += s["r5_white_green_total"]
                if s["r5_white_count"] is not None:
                    total_known -= s["r5_white_count"]
                if s["r3_green_count"] is not None:
                    total_known -= s["r3_green_count"]
            if total_known > s["r1_total_items"]:
                errs.append("蓝/紫/绿已知数量之和超过总数量。")
        return errs

    def enumerate_count_states(self) -> List[Dict[str, int]]:
        s = self.state
        T = s["r1_total_items"]
        if T is None:
            return []
        known_b = s["r1_blue_count"]
        known_p = s["r2_purple_count"]
        known_g = s["r3_green_count"]
        known_wg = s["r5_white_green_total"]
        known_w = s["r5_white_count"]
        results = []
        max_states = self.config["solver"]["max_states"]
        b_values = [known_b] if known_b is not None else list(range(T + 1))
        for b in b_values:
            if b is None:
                continue
            rem1 = T - b
            if rem1 < 0:
                continue
            p_values = [known_p] if known_p is not None else range(rem1 + 1)
            for p in p_values:
                rem2 = T - b - p
                if rem2 < 0:
                    continue
                g_values = [known_g] if known_g is not None else range(rem2 + 1)
                for g in g_values:
                    rem3 = T - b - p - g
                    if rem3 < 0:
                        continue
                    if known_wg is not None:
                        w = known_w if known_w is not None else known_wg - g
                        if known_w is not None and known_w + g != known_wg:
                            continue
                        if w < 0:
                            continue
                        rem4 = T - b - p - g - w
                        if rem4 < 0:
                            continue
                        for o in range(rem4 + 1):
                            r = rem4 - o
                            results.append({"w": w, "g": g, "b": b, "p": p, "o": o, "r": r})
                            if len(results) >= max_states:
                                return results
                    elif known_w is not None:
                        w = known_w
                        rem4 = T - b - p - g - w
                        if rem4 < 0:
                            continue
                        for o in range(rem4 + 1):
                            r = rem4 - o
                            results.append({"w": w, "g": g, "b": b, "p": p, "o": o, "r": r})
                            if len(results) >= max_states:
                                return results
                    else:
                        for w in range(rem3 + 1):
                            rem4 = rem3 - w
                            for o in range(rem4 + 1):
                                r = rem4 - o
                                results.append({"w": w, "g": g, "b": b, "p": p, "o": o, "r": r})
                                if len(results) >= max_states:
                                    return results
        return results

    def log_count_prior(self, counts: Dict[str, int]) -> float:
        alpha = self.config["alpha_counts"]
        score = 0.0
        for q in QUALITIES:
            score += math.lgamma(counts[q] + alpha[q]) - math.lgamma(alpha[q]) - math.lgamma(counts[q] + 1)
        return score

    def infer_cells_for_color(self, q: str, n: int, avg_obs: Optional[float], avg_text: Optional[str] = None) -> Optional[Tuple[ColorGridPosterior, float]]:
        model = self.config["cells_per_item"][q]
        mean_total = n * model["mean"]
        sd_total = math.sqrt(max(n, 1)) * model["sd"]
        min_total = n * model["min"]
        max_total = n * get_finite_cell_model_max(self.config, model)
        if n == 0:
            if avg_obs is not None and abs(avg_obs) >= 1e-12:
                return None
            return ColorGridPosterior(0.0, 0, 0, 0, 0, [(0, 1.0)]), 0.0
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
            weights = [normal_pdf(x, mean_total, sd_total) for x in feasible]
            sw = sum(weights)
            if sw <= 0:
                return None
            mass = normalize_quality_mass(feasible, weights)
            mean_cells, p10, p90 = summarize_quality_mass(mass)
            return ColorGridPosterior(mean_cells, p10, p90, lo, hi, mass), safe_log(sw)
        feasible = list(range(min_total, max_total + 1))
        weights = [normal_pdf(x, mean_total, sd_total) for x in feasible]
        mass = normalize_quality_mass(feasible, weights)
        mean_cells, p10, p90 = summarize_quality_mass(mass)
        return ColorGridPosterior(mean_cells, p10, p90, min_total, max_total, mass), 0.0

    def build_candidates(self) -> List[Candidate]:
        s = self.state
        observed_avg = {
            "o": s["r2_orange_avg"],
            "p": s["r3_purple_avg"],
            "b": s["r4_blue_avg"],
            "w": None,
            "g": None,
            "r": None,
        }
        observed_avg_text = {
            "o": s["r2_orange_avg_text"],
            "p": s["r3_purple_avg_text"],
            "b": s["r4_blue_avg_text"],
            "w": None,
            "g": None,
            "r": None,
        }
        candidates = []
        for counts in self.enumerate_count_states():
            score = self.log_count_prior(counts)
            color_grids = {}
            ok = True
            for q in QUALITIES:
                info = self.infer_cells_for_color(q, counts[q], observed_avg.get(q), observed_avg_text.get(q))
                if info is None:
                    ok = False
                    break
                posterior, add_score = info
                color_grids[q] = posterior
                score += add_score
            if ok:
                candidates.append(Candidate(counts, color_grids, score))
        return candidates

    def normalize(self, cands: List[Candidate]) -> List[Tuple[Candidate, float]]:
        if not cands:
            return []
        z = logsumexp([c.log_score for c in cands])
        out = [(c, math.exp(c.log_score - z)) for c in cands]
        out.sort(key=lambda x: x[1], reverse=True)
        return out

    def get_red_type_profiles(self) -> List[Dict]:
        if self._red_type_profiles_cache is not None:
            return self._red_type_profiles_cache

        raw = self.config.get("red_type_profiles", {}).get("profiles", {})
        if not isinstance(raw, dict) or not raw:
            self._red_type_profiles_cache = []
            return self._red_type_profiles_cache

        fallback_value = self.config.get("value_model", {}).get("r", {})
        fallback_cells = self.config.get("cells_per_item", {}).get("r", {})
        profiles = []
        for profile_id, profile in raw.items():
            mean_cells = profile.get("mean_cells_per_item", fallback_cells.get("mean"))
            sd_cells = profile.get("sd_cells_per_item", fallback_cells.get("sd"))
            base_mean = profile.get("base_item_mean", fallback_value.get("base_item_mean"))
            base_sd = profile.get("base_item_sd", fallback_value.get("base_item_sd"))
            per_cell_mean = profile.get("per_cell_mean", fallback_value.get("per_cell_mean"))
            per_cell_sd = profile.get("per_cell_sd", fallback_value.get("per_cell_sd"))
            if not all(isinstance(v, (int, float)) for v in [mean_cells, sd_cells, base_mean, base_sd, per_cell_mean, per_cell_sd]):
                continue
            profiles.append({
                "id": profile_id,
                "label": profile.get("label", profile_id),
                "prior": max(float(profile.get("prior", 1.0)), 0.0),
                "mean_cells_per_item": float(mean_cells),
                "sd_cells_per_item": float(sd_cells),
                "base_item_mean": float(base_mean),
                "base_item_sd": float(base_sd),
                "per_cell_mean": float(per_cell_mean),
                "per_cell_sd": float(per_cell_sd),
            })

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

        families = []
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
        weighted_entries = []

        for family in families:
            for profile in profiles:
                family_type_bias_raw = family["red_type_bias"].get(profile["id"])
                family_type_bias = max(float(family_type_bias_raw), 0.0) if isinstance(family_type_bias_raw, (int, float)) else 1.0
                spread = max(profile["sd_cells_per_item"] / spread_scale, 0.05)
                weighted_entries.append({
                    **profile,
                    "family_id": family["id"],
                    "family_label": family["label"],
                    "family_value_bias": family["value_bias"],
                    "family_notes": family["notes"],
                    "anchor_item_value": (profile["base_item_mean"] + profile["mean_cells_per_item"] * profile["per_cell_mean"]) * family["value_bias"],
                    "effective_base_item_mean": profile["base_item_mean"] * family["value_bias"],
                    "effective_base_item_sd": profile["base_item_sd"] * family["value_bias"],
                    "effective_per_cell_mean": profile["per_cell_mean"] * family["value_bias"],
                    "effective_per_cell_sd": profile["per_cell_sd"] * family["value_bias"],
                    "weight": max(family["prior"], 1e-9)
                    * max(profile["prior"], 1e-9)
                    * max(family_type_bias, 1e-9)
                    * normal_pdf(avg_cells, profile["mean_cells_per_item"], spread),
                })

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
                    "per_cell_mean": 0.0,
                }
            merged[entry["id"]]["prob"] += entry["prob"]
            merged[entry["id"]]["anchor_item_value"] += entry["prob"] * entry["anchor_item_value"]
            merged[entry["id"]]["per_cell_mean"] += entry["prob"] * entry["per_cell_mean"] * entry["family_value_bias"]

        posterior = sorted(
            [
                {
                    **entry,
                    "anchor_item_value": entry["anchor_item_value"] / entry["prob"] if entry["prob"] > 0 else 0.0,
                    "per_cell_mean": entry["per_cell_mean"] / entry["prob"] if entry["prob"] > 0 else 0.0,
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
            posterior = sorted(
                [
                    {
                        "id": entry["id"],
                        "label": entry["label"],
                        "value_bias": entry["value_bias"],
                        "notes": entry["notes"],
                        "prob": prob_entry["prob"],
                    }
                    for entry, prob_entry in zip(
                        families,
                        normalize_weighted_items([{**family, "weight": max(family["prior"], 1e-9)} for family in families]),
                    )
                ],
                key=lambda item: item["prob"],
                reverse=True,
            )
            self._collection_family_posterior_cache[cache_key] = posterior
            return posterior

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
                        "per_cell_mean": 0.0,
                    }
                weight = cell_prob * entry["prob"]
                merged[entry["id"]]["prob"] += weight
                merged[entry["id"]]["anchor_item_value"] += weight * entry["anchor_item_value"]
                merged[entry["id"]]["per_cell_mean"] += weight * entry["per_cell_mean"]
        return sorted(
            [
                {
                    **entry,
                    "anchor_item_value": entry["anchor_item_value"] / entry["prob"] if entry["prob"] > 0 else 0.0,
                    "per_cell_mean": entry["per_cell_mean"] / entry["prob"] if entry["prob"] > 0 else 0.0,
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

    def summarize(self, weighted: List[Tuple[Candidate, float]]) -> Dict:
        out = {
            "count_probs": {q: {} for q in QUALITIES},
            "count_means": {q: 0.0 for q in QUALITIES},
            "cell_means": {q: 0.0 for q in QUALITIES},
            "cell_low": {q: 10**9 for q in QUALITIES},
            "cell_high": {q: -10**9 for q in QUALITIES},
            "cell_prob_map": {q: {} for q in QUALITIES},
            "red_cell_prob_map": {},
            "red_type_prob_map": {},
            "family_prob_map": {},
        }
        for cand, p in weighted:
            for q in QUALITIES:
                n = cand.counts[q]
                out["count_probs"][q][n] = out["count_probs"][q].get(n, 0.0) + p
                out["count_means"][q] += n * p
                quality_mass = approx_posterior_mass(cand.color_grids[q])
                for count, prob in quality_mass:
                    out["cell_prob_map"][q][count] = out["cell_prob_map"][q].get(count, 0.0) + p * prob
            red_mass = approx_posterior_mass(cand.color_grids["r"])
            for count, prob in red_mass:
                if count not in out["red_cell_prob_map"]:
                    out["red_cell_prob_map"][count] = 0.0
                out["red_cell_prob_map"][count] += p * prob
            for entry in self.mix_red_type_posterior(cand.counts["r"], red_mass):
                if entry["id"] not in out["red_type_prob_map"]:
                    out["red_type_prob_map"][entry["id"]] = {
                        "id": entry["id"],
                        "label": entry["label"],
                        "prob": 0.0,
                        "anchor_item_value": entry["anchor_item_value"],
                        "per_cell_mean": entry["per_cell_mean"],
                    }
                out["red_type_prob_map"][entry["id"]]["prob"] += p * entry["prob"]
            for entry in self.mix_collection_family_posterior(cand.counts["r"], red_mass):
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
            cell_mass = sorted(out["cell_prob_map"][q].items(), key=lambda item: item[0])
            mean_cells, p10_cells, p90_cells = summarize_quality_mass(cell_mass)
            out["cell_means"][q] = mean_cells
            out["cell_low"][q] = p10_cells
            out["cell_high"][q] = p90_cells
        del out["cell_prob_map"]
        for q in QUALITIES:
            out["count_probs"][q] = dict(sorted(out["count_probs"][q].items(), key=lambda kv: kv[1], reverse=True))
        out["red_cell_probs"] = [
            {"count": count, "prob": prob}
            for count, prob in sorted(out["red_cell_prob_map"].items(), key=lambda item: item[0])
        ]
        del out["red_cell_prob_map"]
        out["red_type_probs"] = sorted(out["red_type_prob_map"].values(), key=lambda item: item["prob"], reverse=True)
        del out["red_type_prob_map"]
        out["family_probs"] = sorted(out["family_prob_map"].values(), key=lambda item: item["prob"], reverse=True)
        del out["family_prob_map"]
        return out

    def valuation_mc(self, weighted: List[Tuple[Candidate, float]]) -> Dict:
        if not weighted:
            return {}
        sample_n = self.config["solver"]["mc_samples"]
        probs = [p for _, p in weighted]
        states = [c for c, _ in weighted]
        cum = []
        running = 0.0
        for p in probs:
            running += p
            cum.append(running)
        def draw_state() -> Candidate:
            u = random.random()
            for i, c in enumerate(cum):
                if u <= c:
                    return states[i]
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

        vals = []
        bid = self.state["bid_price"]
        for _ in range(sample_n):
            cand = draw_state()
            total_value = 0.0
            for q in QUALITIES:
                vm = self.config["value_model"][q]
                n = cand.counts[q]
                cg = cand.color_grids[q]
                if n == 0:
                    continue
                sampled_cells = draw_quality_mass(cg.mass)
                if sampled_cells is not None:
                    cells_draw = sampled_cells
                elif cg.p10_cells == cg.p90_cells:
                    cells_draw = float(cg.mean_cells)
                else:
                    cell_mu = cg.mean_cells
                    cell_sd = max((cg.p90_cells - cg.p10_cells) / 2.56, 0.5)
                    cells_draw = max(0.0, random.gauss(cell_mu, cell_sd))
                if q == "r" and n > 0:
                    red_joint = draw_weighted_entry(self.infer_red_family_joint_posterior(n, cells_draw))
                    if red_joint is not None:
                        vm = {
                            "base_item_mean": red_joint["effective_base_item_mean"],
                            "base_item_sd": red_joint["effective_base_item_sd"],
                            "per_cell_mean": red_joint["effective_per_cell_mean"],
                            "per_cell_sd": red_joint["effective_per_cell_sd"],
                        }
                part = random.gauss(n * vm["base_item_mean"], math.sqrt(max(n, 1)) * vm["base_item_sd"])
                part += random.gauss(cells_draw * vm["per_cell_mean"], math.sqrt(max(cells_draw, 1.0)) * vm["per_cell_sd"])
                total_value += max(0.0, part)
            vals.append(total_value)
        vals.sort()
        mean_v = statistics.fmean(vals)
        q05 = quantile_sorted(vals, 0.05)
        q25 = quantile_sorted(vals, 0.25)
        q50 = quantile_sorted(vals, 0.50)
        q75 = quantile_sorted(vals, 0.75)
        q95 = quantile_sorted(vals, 0.95)
        res = {"mean_value": mean_v, "q05": q05, "q25": q25, "q50": q50, "q75": q75, "q95": q95}
        if bid is not None and bid > 0:
            profits = [v - bid for v in vals]
            pos = [max(x, 0.0) for x in profits]
            neg = [max(-x, 0.0) for x in profits]
            mean_neg = statistics.fmean(neg)
            res.update({
                "bid_price": bid,
                "expected_profit": mean_v - bid,
                "profit_prob": sum(1 for x in profits if x > 0) / len(profits),
                "loss_prob": sum(1 for x in profits if x <= 0) / len(profits),
                "ev_roi": mean_v / bid - 1.0,
                "q25_roi": q25 / bid - 1.0,
                "q05_roi": q05 / bid - 1.0,
                "gain_loss_ratio": (statistics.fmean(pos) / mean_neg) if mean_neg > 1e-9 else float("inf"),
            })
        return res

    def recompute(self) -> Optional[Dict]:
        errs = self.validate()
        if errs:
            print("\n输入存在问题：")
            for e in errs:
                print(" -", e)
            print()
            return None
        cands = self.build_candidates()
        if not cands:
            print("\n当前输入下没有可行解。")
            print("优先检查：")
            print(" - 橙色/紫色/蓝色均格是否抄错")
            print(" - 蓝/紫/绿数量是否输入错位")
            print(" - 五轮顺序是否填错")
            print()
            return None
        weighted = self.normalize(cands)
        return {"weighted": weighted, "summary": self.summarize(weighted), "valuation": self.valuation_mc(weighted)}

    def _top_probs(self, d: Dict[int, float], k: int) -> List[str]:
        return [f"{n}件={p:.2%}" for n, p in list(d.items())[:k]]

    def print_report(self, report: Dict):
        weighted = report["weighted"]
        summary = report["summary"]
        valuation = report["valuation"]
        s = self.state
        print("\n" + "=" * 78)
        print(f"地图: {self.config['map_name']} | 当前轮次: R{self.current_round()} | 可行状态数: {len(weighted)}")
        print("=" * 78)

        compatibility_warnings = self.get_missing_average_text_warnings()
        if compatibility_warnings:
            print("\n[兼容提示]")
            for warning in compatibility_warnings:
                print(f"  - {warning}")
        print("\n[当前已知信息]")
        lines = []
        if s["r1_total_items"] is not None:
            lines.append(f"R1 总数量={s['r1_total_items']}")
        if s["r1_blue_count"] is not None:
            lines.append(f"R1 蓝色数量={s['r1_blue_count']}")
        if s["r2_orange_avg"] is not None:
            lines.append(f"R2 橙色均格={format_observed_average_display(s['r2_orange_avg'], s.get('r2_orange_avg_text'))}")
        if s["r2_purple_count"] is not None:
            lines.append(f"R2 紫色数量={s['r2_purple_count']}")
        if s["r3_green_count"] is not None:
            lines.append(f"R3 绿色数量={s['r3_green_count']}")
        if s["r3_purple_avg"] is not None:
            lines.append(f"R3 紫色均格={format_observed_average_display(s['r3_purple_avg'], s.get('r3_purple_avg_text'))}")
        if s["r4_blue_avg"] is not None:
            lines.append(f"R4 蓝色均格={format_observed_average_display(s['r4_blue_avg'], s.get('r4_blue_avg_text'))}")
        if s["r5_white_green_total"] is not None:
            lines.append(f"R5 绿白总数={s['r5_white_green_total']}")
        if s["r5_white_count"] is not None:
            lines.append(f"R5 白色数量={s['r5_white_count']}")
        print("  " + " | ".join(lines))
        print("\n[首要输出：橙色数量概率分布]")
        for txt in self._top_probs(summary["count_probs"]["o"], self.config["report"]["orange_top_k"]):
            print(" ", txt)
        print("\n[由橙数推导的红色数量概率分布]")
        for txt in self._top_probs(summary["count_probs"]["r"], self.config["report"]["red_top_k"]):
            print(" ", txt)
        print("\n[红色格子实时估计]")
        print(f"  红格均值≈{summary['cell_means']['r']:.2f} | 80%区间≈[{summary['cell_low']['r']},{summary['cell_high']['r']}]")
        if summary["red_cell_probs"]:
            print("  红格概率分布:", " | ".join(
                f"{entry['count']}格={entry['prob']:.2%}"
                for entry in summary["red_cell_probs"][:self.config["report"].get("red_cell_top_k", 8)]
            ))
        if summary["red_type_probs"]:
            print("\n[红件模板后验]")
            top_k = self.config["report"].get("red_type_top_k", 4)
            for entry in summary["red_type_probs"][:top_k]:
                print(
                    f"  {entry['label']}: {entry['prob']:.2%} | "
                    f"件均锚值≈{entry['anchor_item_value']:.0f} | 格均≈{entry['per_cell_mean']:.0f}"
                )
        if summary["family_probs"]:
            print("\n[家族后验]")
            top_k = self.config["report"].get("red_type_top_k", 4)
            for entry in summary["family_probs"][:top_k]:
                notes = f" | {' / '.join(entry['notes'])}" if entry["notes"] else ""
                print(
                    f"  {entry['label']}: {entry['prob']:.2%} | "
                    f"value_bias={entry['value_bias']:.2f}{notes}"
                )
        print("\n[关键颜色格子估计]")
        for q in ["o", "r", "p", "b", "g", "w"]:
            print(f"  {QN[q]}格: 均值≈{summary['cell_means'][q]:.2f} | 80%区间≈[{summary['cell_low'][q]},{summary['cell_high'][q]}]")
        print("\n[各颜色件数期望]")
        for q in QUALITIES:
            print(f"  {QN[q]}件≈{summary['count_means'][q]:.2f}")
        print("\n[最可能的完整颜色数量组合]")
        for idx, (cand, p) in enumerate(weighted[:self.config['solver']['posterior_print_k']], start=1):
            counts_txt = " ".join(f"{QN[q]}{cand.counts[q]}" for q in QUALITIES)
            print(f"  {idx:>2}. P={p:>7.2%} | {counts_txt}")
        print("\n[即时估值区间]")
        print(f"  极保守(5%) : {valuation['q05']:.0f}")
        print(f"  保守(25%)  : {valuation['q25']:.0f}")
        print(f"  中位数(50%): {valuation['q50']:.0f}")
        print(f"  乐观(75%)  : {valuation['q75']:.0f}")
        print(f"  极乐观(95%): {valuation['q95']:.0f}")
        print(f"  EV期望     : {valuation['mean_value']:.0f}")
        if "bid_price" in valuation:
            print("\n[以当前出价计算的损益]")
            print(f"  出价          : {valuation['bid_price']:.0f}")
            print(f"  期望利润      : {valuation['expected_profit']:.0f}")
            print(f"  盈利概率      : {valuation['profit_prob']:.2%}")
            print(f"  亏损概率      : {valuation['loss_prob']:.2%}")
            print(f"  EV ROI        : {valuation['ev_roi']:.2%}")
            print(f"  保守 ROI(25%) : {valuation['q25_roi']:.2%}")
            print(f"  极保守 ROI(5%): {valuation['q05_roi']:.2%}")
            glr = valuation['gain_loss_ratio']
            print("  损益比        :", "∞" if math.isinf(glr) else f"{glr:.3f}")
        print("\n[实时解读]")
        orange_top = list(summary["count_probs"]["o"].items())[:3]
        red_top = list(summary["count_probs"]["r"].items())[:3]
        if orange_top:
            best_o, best_po = orange_top[0]
            print(f"  当前最可能橙数: {best_o}件 ({best_po:.2%})")
        if red_top:
            best_r, best_pr = red_top[0]
            print(f"  当前最可能红数: {best_r}件 ({best_pr:.2%})")
        if self.current_round() < 3:
            print("  还在前中期，橙均格是主信号，红格估计仍会偏宽。")
        elif self.current_round() == 3:
            print("  绿色数量和紫均格已加入，橙/红分布通常会明显收敛。")
        elif self.current_round() == 4:
            print("  蓝均格已加入，中低品格子约束更强，红数误差会再降一档。")
        else:
            print("  绿白总数已加入，白色被锁定后，橙/红分布接近终局判断。")
        print("=" * 78 + "\n")


HELP = """
命令：
  help
  show
  report
  r1 <total_items> <blue_count>
  r2 <orange_avg> [purple_count]
  r3 <green_count> <purple_avg>
  r4 <blue_avg>
  r5 <white_green_total> [white_count]
  bid <price>
  set <field> <value>
  reset
  save_state <path>
  load_state <path>
  save_config <path>
  load_config <path>
  save_families <path>
  load_families <path>
  quit / exit
""".strip()


def parse_num(s: str):
    s = s.strip()
    if s.lower() in {"none", "null", ""}:
        return None
    if "." in s:
        return float(s)
    return int(s)


def parse_r2_command_args(parts: List[str]) -> Tuple[float, Optional[str], Optional[int]]:
    orange_avg, orange_avg_text = parse_observed_average_value(parts[1])
    purple_count = parse_num(parts[2]) if len(parts) > 2 else None
    return orange_avg, orange_avg_text, purple_count


def save_json(path: str, payload: Dict):
    Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_json(path: str) -> Dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main():
    config = json.loads(json.dumps(CONFIG_DEFAULT))
    state = json.loads(json.dumps(STATE_DEFAULT))
    est = RealtimeRoundEstimator(config, state)
    print("\n竞拍之王 - 沉船图高难 - 5回合实时拟合脚本")
    print("按回合输入：r1 -> r2 -> r3 -> r4 -> r5")
    print("每输完一轮，脚本会立即重算。")
    print("橙数分布、红数分布、红格区间、红件模板后验会放在报告最前面。\n")
    while True:
        try:
            line = input("AK-R> ").strip()
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
                print(HELP)
            elif cmd == "show":
                est.show_state()
            elif cmd == "report":
                rep = est.recompute()
                if rep is not None:
                    est.print_report(rep)
            elif cmd == "r1":
                est.set_field("r1_total_items", parse_num(parts[1]))
                est.set_field("r1_blue_count", parse_num(parts[2]))
                rep = est.recompute()
                if rep is not None:
                    est.print_report(rep)
            elif cmd == "r2":
                orange_avg, orange_avg_text, purple_count = parse_r2_command_args(parts)
                est.set_field("r2_orange_avg", orange_avg)
                est.set_field("r2_orange_avg_text", orange_avg_text)
                est.set_field("r2_purple_count", purple_count)
                rep = est.recompute()
                if rep is not None:
                    est.print_report(rep)
            elif cmd == "r3":
                est.set_field("r3_green_count", parse_num(parts[1]))
                purple_avg, purple_avg_text = parse_observed_average_value(parts[2])
                est.set_field("r3_purple_avg", purple_avg)
                est.set_field("r3_purple_avg_text", purple_avg_text)
                rep = est.recompute()
                if rep is not None:
                    est.print_report(rep)
            elif cmd == "r4":
                blue_avg, blue_avg_text = parse_observed_average_value(parts[1])
                est.set_field("r4_blue_avg", blue_avg)
                est.set_field("r4_blue_avg_text", blue_avg_text)
                rep = est.recompute()
                if rep is not None:
                    est.print_report(rep)
            elif cmd == "r5":
                est.set_field("r5_white_green_total", parse_num(parts[1]))
                est.set_field("r5_white_count", parse_num(parts[2]) if len(parts) > 2 else None)
                rep = est.recompute()
                if rep is not None:
                    est.print_report(rep)
            elif cmd == "bid":
                est.set_field("bid_price", parse_num(parts[1]))
                rep = est.recompute()
                if rep is not None:
                    est.print_report(rep)
            elif cmd == "set":
                key = parts[1]
                if key in AVERAGE_TEXT_FIELDS:
                    value, raw_text = parse_observed_average_value(parts[2])
                    est.set_field(key, value)
                    est.set_field(AVERAGE_TEXT_FIELDS[key], raw_text)
                    print(f"已设置 {key} = {format_observed_average_display(value, raw_text)}")
                else:
                    value = parse_num(parts[2])
                    est.set_field(key, value)
                    print(f"已设置 {key} = {value}")
            elif cmd == "reset":
                est.replace_state({})
                print("已清空当前状态。")
            elif cmd == "save_state":
                save_json(parts[1], est.state)
                print(f"已保存到 {parts[1]}")
            elif cmd == "load_state":
                est.replace_state(load_json(parts[1]))
                print(f"已读取 {parts[1]}")
                if est.has_round_inputs():
                    rep = est.recompute()
                    if rep is not None:
                        est.print_report(rep)
            elif cmd == "save_config":
                save_json(parts[1], export_realtime_internal_config_to_source(est.config))
                print(f"已导出配置到 {parts[1]}")
            elif cmd == "load_config":
                est.replace_config(load_json(parts[1]))
                print(f"已加载配置 {parts[1]}")
                if est.has_round_inputs():
                    rep = est.recompute()
                    if rep is not None:
                        est.print_report(rep)
            elif cmd == "save_families":
                save_json(parts[1], export_collection_families_payload(est.config))
                print(f"已导出家族模板到 {parts[1]}")
            elif cmd == "load_families":
                est.replace_config(apply_collection_families_payload(est.config, load_json(parts[1])))
                print(f"已加载家族模板 {parts[1]}")
                if est.has_round_inputs():
                    rep = est.recompute()
                    if rep is not None:
                        est.print_report(rep)
            else:
                print("未知命令，输入 help 查看帮助。")
        except Exception as e:
            print("发生错误：", e)


if __name__ == "__main__":
    random.seed(42)
    main()
