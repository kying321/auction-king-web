import copy
import json
import unittest
from pathlib import Path

from family_calibration_suggester import suggest_collection_families


class FamilyCalibrationSuggesterTests(unittest.TestCase):
    def setUp(self):
        payload = json.loads(Path("my_families.json").read_text(encoding="utf-8"))
        self.base_payload = copy.deepcopy(payload)

    def test_suggest_collection_families_updates_prior_bias_and_value_bias_from_rows(self):
        rows = [
            {"family_revealed": "relics", "red_type_revealed": "gold_red", "final_total_value": "20000"},
            {"family_revealed": "relics", "red_type_revealed": "gold_red", "final_total_value": "22000"},
            {"family_revealed": "cargo", "red_type_revealed": "big_red", "final_total_value": "15000"},
            {"family_revealed": "cargo", "red_type_revealed": "big_red", "final_total_value": "14000"},
            {"family_revealed": "cargo", "red_type_revealed": "small_red", "final_total_value": "13000"},
        ]

        suggested = suggest_collection_families(self.base_payload, rows)
        families = suggested["collection_families"]

        self.assertAlmostEqual(families["relics"]["prior"], 0.8, places=3)
        self.assertAlmostEqual(families["cargo"]["prior"], 1.2, places=3)
        self.assertGreater(families["relics"]["red_type_bias"]["gold_red"], 1.0)
        self.assertLess(families["cargo"]["red_type_bias"]["gold_red"], 1.0)
        self.assertGreater(families["relics"]["value_bias"], families["cargo"]["value_bias"])
        self.assertIn("auto: 样本2条", families["relics"]["notes"])
        self.assertEqual(suggested["calibration_summary"]["observed_family_rows"], 5)

    def test_suggest_collection_families_keeps_base_values_when_rows_are_empty(self):
        suggested = suggest_collection_families(self.base_payload, [])

        self.assertEqual(suggested["collection_families"], self.base_payload["collection_families"])
        self.assertEqual(suggested["calibration_summary"]["observed_family_rows"], 0)


if __name__ == "__main__":
    unittest.main()
