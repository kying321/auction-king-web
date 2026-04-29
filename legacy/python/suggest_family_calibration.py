#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import json
import sys
from pathlib import Path

from family_calibration_suggester import (
    load_calibration_rows,
    load_collection_families_payload,
    suggest_collection_families,
)


def main(argv: list[str]) -> int:
    csv_path = Path(argv[1]) if len(argv) > 1 else Path("family_calibration_template.csv")
    base_path = Path(argv[2]) if len(argv) > 2 else Path("my_families.json")
    out_path = Path(argv[3]) if len(argv) > 3 else Path("my_families_suggested.json")

    suggested = suggest_collection_families(
        load_collection_families_payload(base_path),
        load_calibration_rows(csv_path),
    )
    out_path.write_text(json.dumps(suggested, ensure_ascii=False, indent=2), encoding="utf-8")

    summary = suggested["calibration_summary"]
    print(f"已生成建议文件: {out_path}")
    print(f"家族样本数: {summary['observed_family_rows']}")
    print(f"家族命中: {summary['family_counts']}")
    print(f"红模板命中: {summary['global_red_type_counts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
