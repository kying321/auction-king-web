from __future__ import annotations

import copy
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List


DEFAULT_RED_TYPES = ("small_red", "big_red", "gold_red")


def clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def parse_optional_float(raw) -> float | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def load_collection_families_payload(path: str | Path) -> Dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_calibration_rows(path: str | Path) -> List[Dict[str, str]]:
    with Path(path).open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def collect_known_red_types(collection_families: Dict[str, Dict]) -> List[str]:
    known = set(DEFAULT_RED_TYPES)
    for family in collection_families.values():
        bias = family.get("red_type_bias", {})
        if isinstance(bias, dict):
            known.update(key for key in bias if isinstance(key, str) and key)
    return sorted(known)


def suggest_collection_families(base_payload: Dict, calibration_rows: Iterable[Dict]) -> Dict:
    base_families = copy.deepcopy(base_payload.get("collection_families", base_payload))
    if not isinstance(base_families, dict) or not base_families:
        raise ValueError("base_payload 必须包含 collection_families。")

    known_red_types = collect_known_red_types(base_families)
    family_counts = Counter()
    family_type_counts = defaultdict(Counter)
    global_type_counts = Counter()
    family_value_samples = defaultdict(list)

    for row in calibration_rows:
        family_id = str(row.get("family_revealed", "")).strip()
        if family_id not in base_families:
            continue
        family_counts[family_id] += 1

        red_type_id = str(row.get("red_type_revealed", "")).strip()
        if red_type_id in known_red_types:
            family_type_counts[family_id][red_type_id] += 1
            global_type_counts[red_type_id] += 1

        final_total_value = parse_optional_float(row.get("final_total_value"))
        if final_total_value is not None and final_total_value > 0:
            family_value_samples[family_id].append(final_total_value)

    suggested_families = copy.deepcopy(base_families)
    observed_family_rows = sum(family_counts.values())
    observed_family_count = len(family_counts)
    mean_family_count = observed_family_rows / observed_family_count if observed_family_count else None
    all_value_samples = [value for samples in family_value_samples.values() for value in samples]
    overall_value_mean = sum(all_value_samples) / len(all_value_samples) if all_value_samples else None
    known_type_count = len(known_red_types)
    global_type_total = sum(global_type_counts.values())

    for family_id, family in suggested_families.items():
        observed_count = family_counts[family_id]
        if observed_count and mean_family_count:
            family["prior"] = round(observed_count / mean_family_count, 3)

        family_type_total = sum(family_type_counts[family_id].values())
        if family_type_total and global_type_total:
            next_bias = copy.deepcopy(family.get("red_type_bias", {}))
            for red_type_id in known_red_types:
                family_share = (family_type_counts[family_id][red_type_id] + 1) / (family_type_total + known_type_count)
                global_share = (global_type_counts[red_type_id] + 1) / (global_type_total + known_type_count)
                next_bias[red_type_id] = round(clip(family_share / global_share, 0.7, 1.5), 3)
            family["red_type_bias"] = next_bias

        values = family_value_samples[family_id]
        if overall_value_mean and len(values) >= 2:
            family["value_bias"] = round(clip((sum(values) / len(values)) / overall_value_mean, 0.75, 1.35), 3)

        if observed_count:
            notes = [note for note in family.get("notes", []) if isinstance(note, str)]
            auto_note = f"auto: 样本{observed_count}条"
            if auto_note not in notes:
                notes.append(auto_note)
            family["notes"] = notes

    return {
        "collection_families": suggested_families,
        "calibration_summary": {
            "observed_family_rows": observed_family_rows,
            "family_counts": dict(sorted(family_counts.items())),
            "global_red_type_counts": dict(sorted(global_type_counts.items())),
        },
    }
