#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import math
from typing import List, Optional, Tuple


def gcd(a: int, b: int) -> int:
    x = abs(a)
    y = abs(b)
    while y != 0:
        x, y = y, x % y
    return x or 1


def normalize_observed_average_text(raw_text: Optional[str]) -> Optional[str]:
    if not isinstance(raw_text, str):
        return None
    trimmed = raw_text.strip()
    if not trimmed:
        return None
    if trimmed.startswith("-."):
        return f"-0{trimmed[1:]}"
    if trimmed.startswith("."):
        return f"0{trimmed}"
    return trimmed


def get_exact_decimal_places(total_cells: int, count: int) -> float:
    remainder = abs(total_cells % count)
    if remainder == 0:
        return 0
    reduced_divisor = count // gcd(remainder, count)
    denom = reduced_divisor
    twos = 0
    fives = 0
    while denom % 2 == 0:
        denom //= 2
        twos += 1
    while denom % 5 == 0:
        denom //= 5
        fives += 1
    if denom != 1:
        return math.inf
    return max(twos, fives)


def build_division_digits(remainder: int, count: int, precision: int) -> List[str]:
    digits: List[str] = []
    rem = remainder
    for _ in range(precision):
        rem *= 10
        digits.append(str(rem // count))
        rem %= count
    return digits


def format_average_display_from_total_cells(total_cells: int, count: int, precision: int = 2) -> Optional[str]:
    if not isinstance(total_cells, int) or not isinstance(count, int) or count <= 0:
        return None
    negative = total_cells < 0
    abs_total = abs(total_cells)
    integer_part = abs_total // count
    remainder = abs_total % count
    if remainder == 0:
        return f"{'-' if negative else ''}{integer_part}"
    exact_places = get_exact_decimal_places(abs_total, count)
    display_places = int(exact_places) if exact_places <= precision else precision
    digits = build_division_digits(remainder, count, display_places)
    return f"{'-' if negative else ''}{integer_part}.{''.join(digits)}"


def rounded_avg_interval(avg: float, count: int, precision: int = 2) -> Optional[Tuple[int, int]]:
    if avg is None or count <= 0:
        return None
    step = 10 ** (-precision)
    low = math.ceil(avg * count - 1e-12)
    high = math.floor((avg + step - 1e-12) * count)
    if low > high:
        return None
    return low, high


def build_relaxed_total_cells_support(
    avg: float,
    count: int,
    min_total: int,
    max_total: int,
    precision: int = 2,
    fallback_slack_cells: float = 0.0,
    fallback_min_avg: float = 1.0,
) -> List[int]:
    if not isinstance(count, int) or count <= 0:
        return []
    if not isinstance(avg, (int, float)) or not math.isfinite(avg):
        return []
    if not isinstance(fallback_slack_cells, (int, float)) or fallback_slack_cells <= 0:
        return []
    if abs(avg) < max(0.0, float(fallback_min_avg)):
        return []

    step = 10 ** (-precision)
    low = math.ceil(avg * count - float(fallback_slack_cells) - 1e-12)
    high = math.floor((avg + step) * count + float(fallback_slack_cells) - 1e-12)
    low = max(low, min_total)
    high = min(high, max_total)
    if low > high:
        return []
    return list(range(low, high + 1))


def get_matching_total_cells(
    avg: float,
    count: int,
    min_total: int,
    max_total: int,
    raw_text: Optional[str] = None,
    precision: int = 2,
    relax_sparse_support: bool = False,
    sparse_support_threshold: int = 0,
    fallback_slack_cells: float = 0.0,
    fallback_min_avg: float = 1.0,
) -> List[int]:
    if not isinstance(count, int) or count <= 0:
        return []

    normalized_text = normalize_observed_average_text(raw_text)
    if not normalized_text:
        interval = rounded_avg_interval(avg, count, precision=precision)
        if interval is None:
            support: List[int] = []
        else:
            low = max(interval[0], min_total)
            high = min(interval[1], max_total)
            if low > high:
                support = []
            else:
                support = list(range(low, high + 1))
    else:
        support = []
        for total_cells in range(min_total, max_total + 1):
            if format_average_display_from_total_cells(total_cells, count, precision=precision) == normalized_text:
                support.append(total_cells)

    if not relax_sparse_support:
        return support

    threshold = sparse_support_threshold if isinstance(sparse_support_threshold, int) and sparse_support_threshold >= 0 else 0
    if len(support) > threshold:
        return support

    relaxed_support = build_relaxed_total_cells_support(
        avg,
        count,
        min_total,
        max_total,
        precision=precision,
        fallback_slack_cells=fallback_slack_cells,
        fallback_min_avg=fallback_min_avg,
    )
    if not relaxed_support:
        return support
    if not support:
        return relaxed_support
    return sorted(set(support + relaxed_support))


def build_missing_average_text_warnings(
    state: dict,
    value_to_text_field: dict,
    field_labels: dict,
) -> List[str]:
    warnings: List[str] = []
    for value_key, text_key in value_to_text_field.items():
        value = state.get(value_key)
        if value is None:
            continue
        if normalize_observed_average_text(state.get(text_key)):
            continue
        label = field_labels.get(value_key, value_key)
        warnings.append(
            f"{label} 缺少原始显示文本；当前只能按旧截断语义处理，像 0.3/0.30 这类输入已无法区分。"
        )
    return warnings
