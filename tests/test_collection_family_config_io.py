import copy
import json
import unittest
from pathlib import Path

from auction_king_sunken_ship_estimator import CONFIG_DEFAULT as OFFLINE_CONFIG_DEFAULT
from collection_family_config_io import (
    apply_collection_families_payload,
    export_collection_families_payload,
)


class CollectionFamilyConfigIOTests(unittest.TestCase):
    def test_export_collection_families_payload_wraps_current_config_block(self):
        config = copy.deepcopy(OFFLINE_CONFIG_DEFAULT)

        payload = export_collection_families_payload(config)

        self.assertEqual(payload["collection_families"], config["collection_families"])
        self.assertIsNot(payload["collection_families"], config["collection_families"])

    def test_apply_collection_families_payload_accepts_wrapped_payload_and_replaces_family_block(self):
        config = copy.deepcopy(OFFLINE_CONFIG_DEFAULT)
        original_red_profiles = copy.deepcopy(config["red_type_profiles"])
        payload = {
            "collection_families": {
                "relics": {"label": "文物", "prior": 2.0, "value_bias": 1.4}
            }
        }

        updated = apply_collection_families_payload(config, payload)

        self.assertEqual(updated["collection_families"], payload["collection_families"])
        self.assertEqual(updated["red_type_profiles"], original_red_profiles)
        self.assertEqual(config["collection_families"], OFFLINE_CONFIG_DEFAULT["collection_families"])

    def test_apply_collection_families_payload_accepts_raw_family_map(self):
        config = copy.deepcopy(OFFLINE_CONFIG_DEFAULT)
        payload = {
            "household": {"label": "家居", "prior": 1.0, "value_bias": 0.9}
        }

        updated = apply_collection_families_payload(config, payload)

        self.assertEqual(updated["collection_families"], payload)

    def test_apply_collection_families_payload_rejects_non_mapping_payload(self):
        config = copy.deepcopy(OFFLINE_CONFIG_DEFAULT)

        with self.assertRaises(ValueError):
            apply_collection_families_payload(config, [])

    def test_apply_collection_families_payload_rejects_empty_payload(self):
        config = copy.deepcopy(OFFLINE_CONFIG_DEFAULT)

        with self.assertRaises(ValueError):
            apply_collection_families_payload(config, {})

    def test_my_families_example_file_can_be_applied(self):
        config = copy.deepcopy(OFFLINE_CONFIG_DEFAULT)
        payload = json.loads(Path("my_families.json").read_text(encoding="utf-8"))

        updated = apply_collection_families_payload(config, payload)

        self.assertIn("relics", updated["collection_families"])
        self.assertIn("cargo", updated["collection_families"])
        self.assertIn("notes", updated["collection_families"]["relics"])


if __name__ == "__main__":
    unittest.main()
