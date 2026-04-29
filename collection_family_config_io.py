from __future__ import annotations

import copy
from typing import Dict


def export_collection_families_payload(config: Dict) -> Dict:
    return {
        "collection_families": copy.deepcopy(config.get("collection_families", {}))
    }


def apply_collection_families_payload(config: Dict, payload: Dict) -> Dict:
    if not isinstance(payload, dict):
        raise ValueError("collection_families 配置必须是 JSON 对象。")

    families = payload.get("collection_families", payload)
    if not isinstance(families, dict) or not families:
        raise ValueError("collection_families 不能为空，且必须是对象。")
    if not all(isinstance(entry, dict) for entry in families.values()):
        raise ValueError("每个 family 条目都必须是对象。")

    next_config = copy.deepcopy(config)
    next_config["collection_families"] = copy.deepcopy(families)
    return next_config
