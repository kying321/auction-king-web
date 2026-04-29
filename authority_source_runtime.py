#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import copy
import json
import math
from pathlib import Path
from typing import Dict

QUALITIES = ["w", "g", "b", "p", "o", "r"]
DEFAULT_UNBOUNDED_CELL_MAX_PER_ITEM = 30
DEFAULT_WORKSPACE_SECTION_FILES = [
    "app.json",
    "maps.json",
    "model.json",
    "solver.json",
    "calibration.json",
]


def optional_int(value, fallback=None):
    if value is None or value == "":
        return fallback
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


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


def read_workspace_default_sections(base_dir: Path) -> Dict:
    config_dir = base_dir / "config" / "default"
    composed = {}
    for file_name in DEFAULT_WORKSPACE_SECTION_FILES:
        file_path = config_dir / file_name
        if not file_path.exists():
            continue
        composed.update(json.loads(file_path.read_text(encoding="utf-8")))
    return composed


def apply_calibration_to_workspace_config(config: Dict) -> Dict:
    next_config = copy.deepcopy(config)
    calibration = next_config.get("calibration")
    maps = next_config.get("maps")
    if not isinstance(calibration, dict) or not isinstance(maps, dict):
        return next_config

    for map_id, map_entry in maps.items():
        calibration_entry = calibration.get("maps", {}).get(map_id)
        if not isinstance(calibration_entry, dict):
            continue
        count_prior = calibration_entry.get("count_prior_calibration", {})
        value_model_calibration = calibration_entry.get("value_model_calibration", {})
        if isinstance(count_prior.get("alpha_counts"), dict):
            map_entry["alpha_counts"] = copy.deepcopy(count_prior["alpha_counts"])
        if isinstance(value_model_calibration.get("value_model"), dict):
            map_entry["value_model"] = copy.deepcopy(value_model_calibration["value_model"])

    return next_config


def resolve_workspace_source_config(config: Dict, selected_map_id: str | None = None) -> Dict:
    if not isinstance(config, dict):
        return {}

    if not (
        isinstance(config.get("app"), dict)
        and isinstance(config.get("model"), dict)
        and isinstance(config.get("maps"), dict)
    ):
        return {}

    calibrated = apply_calibration_to_workspace_config(config)
    app = calibrated.get("app", {})
    maps = calibrated.get("maps", {})
    model = calibrated.get("model", {})
    default_map_id = app.get("default_map_id") or "sunken_ship"
    active_map_id = selected_map_id or default_map_id
    map_override = maps.get(active_map_id, {}) if isinstance(maps.get(active_map_id), dict) else {}

    resolved = deep_merge_dict(model, map_override)
    resolved["app"] = copy.deepcopy(app)
    resolved["maps"] = copy.deepcopy(maps)
    resolved["model"] = copy.deepcopy(model)
    resolved["solver"] = deep_merge_dict(calibrated.get("solver", {}), map_override.get("solver", {}))
    resolved["default_map_id"] = default_map_id
    resolved["active_map_id"] = active_map_id
    resolved["map_name"] = resolved.get("map_name") or map_override.get("map_name") or map_override.get("label") or active_map_id
    resolved["calibration"] = copy.deepcopy(calibrated.get("calibration", {}))
    return resolved


def normalize_count_probs(alpha_counts: Dict[str, float]) -> Dict[str, float]:
    weights = {
        quality: max(float(alpha_counts.get(quality, 0.0)), 0.0)
        for quality in QUALITIES
    }
    total = sum(weights.values())
    if total <= 0:
        uniform = 1.0 / len(QUALITIES)
        return {quality: uniform for quality in QUALITIES}
    return {quality: weights[quality] / total for quality in QUALITIES}


def normalize_alpha_counts(alpha_counts: Dict | None = None, legacy_count_probs: Dict | None = None) -> Dict[str, float]:
    source = alpha_counts if isinstance(alpha_counts, dict) else legacy_count_probs if isinstance(legacy_count_probs, dict) else {}
    return {
        quality: float(source.get(quality, 0.0))
        for quality in QUALITIES
    }


def export_grid_model_to_cells_per_item(grid_model: Dict | None = None) -> Dict[str, float | int | None]:
    model = grid_model if isinstance(grid_model, dict) else {}
    max_cells = optional_int(model.get("max_cells"), None)
    return {
        "mean": float(model.get("mean_cells", 0.0)),
        "sd": float(model.get("sd_cells", 0.0)),
        "min": int(model.get("min_cells", 0)),
        "max": max_cells,
    }


def export_value_model_to_source(value_model: Dict | None = None) -> Dict[str, float]:
    model = value_model if isinstance(value_model, dict) else {}
    if all(key in model for key in ("base_item_mean", "base_item_sd", "per_cell_mean", "per_cell_sd")):
        return {
            "base_item_mean": float(model.get("base_item_mean", 0.0)),
            "base_item_sd": float(model.get("base_item_sd", 0.0)),
            "per_cell_mean": float(model.get("per_cell_mean", 0.0)),
            "per_cell_sd": float(model.get("per_cell_sd", 0.0)),
        }
    return {
        "base_item_mean": float(model.get("mean_value", 0.0)),
        "base_item_sd": float(model.get("sd_value", 0.0)),
        "per_cell_mean": 0.0,
        "per_cell_sd": 0.0,
    }


def normalize_cells_per_item_entry(entry: Dict | None = None) -> Dict[str, float | int | None]:
    model = entry if isinstance(entry, dict) else {}
    return {
        "mean": float(model.get("mean", 0.0)),
        "sd": float(model.get("sd", 0.0)),
        "min": int(model.get("min", 0)),
        "max": optional_int(model.get("max"), None),
    }


def normalize_source_value_model_entry(entry: Dict | None = None) -> Dict[str, float]:
    model = entry if isinstance(entry, dict) else {}
    return {
        "base_item_mean": float(model.get("base_item_mean", 0.0)),
        "base_item_sd": float(model.get("base_item_sd", 0.0)),
        "per_cell_mean": float(model.get("per_cell_mean", 0.0)),
        "per_cell_sd": float(model.get("per_cell_sd", 0.0)),
    }


def _build_workspace_source_export(
    *,
    map_id: str,
    map_name: str | None,
    alpha_counts: Dict[str, float],
    cells_per_item: Dict[str, Dict[str, float | int]],
    value_model: Dict[str, Dict[str, float]],
    solver: Dict | None = None,
    red_type_profiles: Dict | None = None,
    collection_families: Dict | None = None,
    calibration: Dict | None = None,
) -> Dict:
    model = {}
    if isinstance(red_type_profiles, dict):
        model["red_type_profiles"] = copy.deepcopy(red_type_profiles)
    if isinstance(collection_families, dict):
        model["collection_families"] = copy.deepcopy(collection_families)

    return {
        "config_schema": "source",
        "app": {
            "default_map_id": map_id,
        },
        "maps": {
            map_id: {
                "map_name": map_name or map_id,
                "alpha_counts": copy.deepcopy(alpha_counts),
                "cells_per_item": copy.deepcopy(cells_per_item),
                "value_model": copy.deepcopy(value_model),
            }
        },
        "model": model,
        "solver": copy.deepcopy(solver) if isinstance(solver, dict) else {},
        "calibration": copy.deepcopy(calibration) if isinstance(calibration, dict) else {},
    }


def export_offline_internal_config_to_source(config: Dict, default_map_id: str | None = None) -> Dict:
    source = copy.deepcopy(config) if isinstance(config, dict) else {}
    map_id = str(default_map_id or source.get("active_map_id") or source.get("default_map_id") or "sunken_ship")
    return _build_workspace_source_export(
        map_id=map_id,
        map_name=source.get("map_name"),
        alpha_counts=normalize_alpha_counts(source.get("alpha_counts"), source.get("count_probs")),
        cells_per_item={
            quality: export_grid_model_to_cells_per_item(source.get("grid_models", {}).get(quality))
            for quality in QUALITIES
        },
        value_model={
            quality: export_value_model_to_source(source.get("value_models", {}).get(quality))
            for quality in QUALITIES
        },
        solver=source.get("solver"),
        red_type_profiles=source.get("red_type_profiles"),
        collection_families=source.get("collection_families"),
        calibration=None,
    )


def export_realtime_internal_config_to_source(config: Dict, default_map_id: str | None = None) -> Dict:
    source = copy.deepcopy(config) if isinstance(config, dict) else {}
    map_id = str(default_map_id or source.get("active_map_id") or source.get("default_map_id") or "sunken_ship")
    return _build_workspace_source_export(
        map_id=map_id,
        map_name=source.get("map_name"),
        alpha_counts=normalize_alpha_counts(source.get("alpha_counts")),
        cells_per_item={
            quality: normalize_cells_per_item_entry(source.get("cells_per_item", {}).get(quality))
            for quality in QUALITIES
        },
        value_model={
            quality: normalize_source_value_model_entry(source.get("value_model", {}).get(quality))
            for quality in QUALITIES
        },
        solver=source.get("solver"),
        red_type_profiles=source.get("red_type_profiles"),
        collection_families=source.get("collection_families"),
        calibration=None,
    )


def adapt_offline_internal_config(fallback_config: Dict, resolved_source: Dict) -> Dict:
    if not resolved_source:
        return copy.deepcopy(fallback_config)

    fallback_grid_models = fallback_config.get("grid_models", {})
    fallback_value_models = fallback_config.get("value_models", {})
    cells_per_item = resolved_source.get("cells_per_item", {})
    value_model = resolved_source.get("value_model", {})
    alpha_counts = copy.deepcopy(resolved_source.get("alpha_counts", fallback_config.get("alpha_counts", {})))

    return {
        **copy.deepcopy(fallback_config),
        "default_map_id": resolved_source.get("default_map_id", fallback_config.get("default_map_id", "sunken_ship")),
        "active_map_id": resolved_source.get("active_map_id", resolved_source.get("default_map_id", fallback_config.get("default_map_id", "sunken_ship"))),
        "map_name": resolved_source.get("map_name", fallback_config.get("map_name")),
        "alpha_counts": alpha_counts,
        "count_probs": normalize_count_probs(alpha_counts),
        "grid_models": {
            quality: {
                "mean_cells": float(cells_per_item.get(quality, {}).get("mean", fallback_grid_models.get(quality, {}).get("mean_cells", 0.0))),
                "sd_cells": float(cells_per_item.get(quality, {}).get("sd", fallback_grid_models.get(quality, {}).get("sd_cells", 0.0))),
                "min_cells": int(cells_per_item.get(quality, {}).get("min", fallback_grid_models.get(quality, {}).get("min_cells", 0))),
                "max_cells": optional_int(
                    cells_per_item.get(quality, {})["max"]
                    if isinstance(cells_per_item.get(quality), dict) and "max" in cells_per_item.get(quality, {})
                    else fallback_grid_models.get(quality, {}).get("max_cells"),
                    None,
                ),
            }
            for quality in QUALITIES
        },
        "value_models": {
            quality: {
                "base_item_mean": float(value_model.get(quality, {}).get("base_item_mean", fallback_value_models.get(quality, {}).get("base_item_mean", fallback_value_models.get(quality, {}).get("mean_value", 0.0)))),
                "base_item_sd": float(value_model.get(quality, {}).get("base_item_sd", fallback_value_models.get(quality, {}).get("base_item_sd", fallback_value_models.get(quality, {}).get("sd_value", 0.0)))),
                "per_cell_mean": float(value_model.get(quality, {}).get("per_cell_mean", fallback_value_models.get(quality, {}).get("per_cell_mean", 0.0))),
                "per_cell_sd": float(value_model.get(quality, {}).get("per_cell_sd", fallback_value_models.get(quality, {}).get("per_cell_sd", 0.0))),
                "mean_value": float(value_model.get(quality, {}).get("base_item_mean", fallback_value_models.get(quality, {}).get("mean_value", 0.0)))
                + float(cells_per_item.get(quality, {}).get("mean", 0.0)) * float(value_model.get(quality, {}).get("per_cell_mean", fallback_value_models.get(quality, {}).get("per_cell_mean", 0.0))),
                "sd_value": math.sqrt(
                    float(value_model.get(quality, {}).get("base_item_sd", fallback_value_models.get(quality, {}).get("sd_value", 0.0))) ** 2
                    + max(float(cells_per_item.get(quality, {}).get("mean", 0.0)), 0.0)
                    * float(value_model.get(quality, {}).get("per_cell_sd", fallback_value_models.get(quality, {}).get("per_cell_sd", 0.0))) ** 2
                ),
            }
            for quality in QUALITIES
        },
        "red_type_profiles": copy.deepcopy(resolved_source.get("red_type_profiles", fallback_config.get("red_type_profiles", {}))),
        "collection_families": copy.deepcopy(resolved_source.get("collection_families", fallback_config.get("collection_families", {}))),
        "solver": deep_merge_dict(copy.deepcopy(fallback_config.get("solver", {})), resolved_source.get("solver", {})),
        "calibration": copy.deepcopy(resolved_source.get("calibration", fallback_config.get("calibration", {}))),
    }


def adapt_realtime_internal_config(fallback_config: Dict, resolved_source: Dict) -> Dict:
    if not resolved_source:
        return copy.deepcopy(fallback_config)

    return {
        **copy.deepcopy(fallback_config),
        "default_map_id": resolved_source.get("default_map_id", fallback_config.get("default_map_id", "sunken_ship")),
        "active_map_id": resolved_source.get("active_map_id", resolved_source.get("default_map_id", fallback_config.get("default_map_id", "sunken_ship"))),
        "map_name": resolved_source.get("map_name", fallback_config.get("map_name")),
        "alpha_counts": copy.deepcopy(resolved_source.get("alpha_counts", fallback_config.get("alpha_counts", {}))),
        "cells_per_item": copy.deepcopy(resolved_source.get("cells_per_item", fallback_config.get("cells_per_item", {}))),
        "value_model": copy.deepcopy(resolved_source.get("value_model", fallback_config.get("value_model", {}))),
        "red_type_profiles": copy.deepcopy(resolved_source.get("red_type_profiles", fallback_config.get("red_type_profiles", {}))),
        "collection_families": copy.deepcopy(resolved_source.get("collection_families", fallback_config.get("collection_families", {}))),
        "solver": deep_merge_dict(copy.deepcopy(fallback_config.get("solver", {})), resolved_source.get("solver", {})),
        "calibration": copy.deepcopy(resolved_source.get("calibration", fallback_config.get("calibration", {}))),
    }
