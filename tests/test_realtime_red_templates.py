import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "legacy" / "python"))

from authority_source_runtime import export_realtime_internal_config_to_source
from auction_king_sunken_ship_realtime import (
    CONFIG_DEFAULT,
    STATE_DEFAULT,
    Candidate,
    ColorGridPosterior,
    RealtimeRoundEstimator,
    parse_r2_command_args,
    rounded_avg_interval,
)


def make_config():
    config = copy.deepcopy(CONFIG_DEFAULT)
    config["solver"]["mc_samples"] = 1
    config["solver"]["average_observation"] = {"relax_sparse_support": False}
    return config


def make_state():
    return copy.deepcopy(STATE_DEFAULT)


def zero_posterior():
    return ColorGridPosterior(
        mean_cells=0.0,
        p10_cells=0,
        p90_cells=0,
        feasible_low=0,
        feasible_high=0,
    )


def point_red_posterior(cells):
    return ColorGridPosterior(
        mean_cells=float(cells),
        p10_cells=cells,
        p90_cells=cells,
        feasible_low=cells,
        feasible_high=cells,
    )


class RealtimeRedTemplateTests(unittest.TestCase):
    def test_default_config_tracks_current_legacy_realtime_sections(self):
        self.assertEqual(CONFIG_DEFAULT["map_name"], "沉船图-高难-实时滤波模板")
        self.assertEqual(CONFIG_DEFAULT["alpha_counts"]["o"], 1.8)
        self.assertEqual(CONFIG_DEFAULT["cells_per_item"]["p"]["mean"], 2.2)
        self.assertEqual(CONFIG_DEFAULT["cells_per_item"]["p"]["max"], 6)
        self.assertEqual(CONFIG_DEFAULT["value_model"]["p"]["base_item_mean"], 1050)
        self.assertEqual(CONFIG_DEFAULT["value_model"]["p"]["per_cell_mean"], 240)

    def test_partial_state_payload_merges_with_defaults_and_recomputes(self):
        est = RealtimeRoundEstimator(make_config(), make_state())

        est.replace_state({"r1_total_items": 8})
        report = est.recompute()

        self.assertIsNotNone(report)
        self.assertEqual(est.state["r1_total_items"], 8)
        self.assertIsNone(est.state["r1_blue_count"])
        self.assertIn("count_probs", report["summary"])

    def test_partial_config_payload_merges_with_defaults_and_recomputes(self):
        est = RealtimeRoundEstimator(
            make_config(),
            {
                **make_state(),
                "r1_total_items": 8,
            },
        )

        est.replace_config(
            {
                "value_model": {
                    "r": {
                        "base_item_mean": 123456,
                    }
                }
            }
        )
        report = est.recompute()

        self.assertIsNotNone(report)
        self.assertEqual(est.config["value_model"]["r"]["base_item_mean"], 123456)
        self.assertIn("o", est.config["value_model"])
        self.assertIn("cells_per_item", est.config)

    def test_exported_structured_source_config_round_trips_realtime_overrides(self):
        est = RealtimeRoundEstimator(make_config(), make_state())
        est.replace_config(
            {
                "alpha_counts": {"w": 1.0, "g": 1.0, "b": 1.0, "p": 1.0, "o": 9.0, "r": 1.0},
                "cells_per_item": {
                    "o": {"mean": 7.5, "sd": 0.2, "min": 7, "max": 8}
                },
                "value_model": {
                    "o": {"base_item_mean": 222, "base_item_sd": 0, "per_cell_mean": 66, "per_cell_sd": 0}
                },
                "solver": {
                    "mc_samples": 7
                },
            }
        )

        exported = export_realtime_internal_config_to_source(est.config, default_map_id="villa")

        self.assertEqual(exported["config_schema"], "source")
        self.assertEqual(exported["app"]["default_map_id"], "villa")
        self.assertEqual(exported["maps"]["villa"]["alpha_counts"]["o"], 9.0)
        self.assertEqual(exported["maps"]["villa"]["cells_per_item"]["o"]["mean"], 7.5)
        self.assertEqual(exported["maps"]["villa"]["value_model"]["o"]["base_item_mean"], 222)
        self.assertEqual(exported["solver"]["mc_samples"], 7)

        reloaded = RealtimeRoundEstimator(make_config(), make_state())
        reloaded.replace_config(exported)

        self.assertEqual(reloaded.config["alpha_counts"]["o"], 9.0)
        self.assertEqual(reloaded.config["cells_per_item"]["o"]["mean"], 7.5)
        self.assertEqual(reloaded.config["value_model"]["o"]["base_item_mean"], 222)
        self.assertEqual(reloaded.config["solver"]["mc_samples"], 7)

    def test_null_cell_max_accepts_catalog_items_above_old_cap(self):
        est = RealtimeRoundEstimator(make_config(), make_state())
        est.replace_config(
            {
                "solver": {"unbounded_cell_max_per_item": 30},
                "cells_per_item": {
                    "o": {"mean": 2.95, "sd": 1.1, "min": 1, "max": None}
                },
            }
        )

        self.assertIsNone(est.config["cells_per_item"]["o"]["max"])
        inferred = est.infer_cells_for_color("o", 1, 13, "13")

        self.assertIsNotNone(inferred)
        posterior, _ = inferred
        self.assertIn(13, [count for count, _ in posterior.mass])
        self.assertLessEqual(posterior.feasible_low, 13)
        self.assertGreaterEqual(posterior.feasible_high, 13)

    def test_parse_r2_command_args_accepts_orange_avg_without_purple_count(self):
        orange_avg, orange_avg_text, purple_count = parse_r2_command_args(["r2", "2.5"])

        self.assertEqual(orange_avg, 2.5)
        self.assertEqual(orange_avg_text, "2.5")
        self.assertIsNone(purple_count)

    def test_parse_r2_command_args_accepts_optional_purple_count(self):
        orange_avg, orange_avg_text, purple_count = parse_r2_command_args(["r2", "2.5", "3"])

        self.assertEqual(orange_avg, 2.5)
        self.assertEqual(orange_avg_text, "2.5")
        self.assertEqual(purple_count, 3)

    def test_set_field_preserves_raw_average_text_for_round_inputs(self):
        est = RealtimeRoundEstimator(make_config(), make_state())

        est.set_field("r2_orange_avg", 1.3)
        est.set_field("r2_orange_avg_text", "1.30")
        est.set_field("r3_purple_avg", 2.5)
        est.set_field("r3_purple_avg_text", "2.50")
        est.set_field("r4_blue_avg", 0.7)
        est.set_field("r4_blue_avg_text", "0.70")

        self.assertEqual(est.state["r2_orange_avg"], 1.3)
        self.assertEqual(est.state["r2_orange_avg_text"], "1.30")
        self.assertEqual(est.state["r3_purple_avg"], 2.5)
        self.assertEqual(est.state["r3_purple_avg_text"], "2.50")
        self.assertEqual(est.state["r4_blue_avg"], 0.7)
        self.assertEqual(est.state["r4_blue_avg_text"], "0.70")

    def test_truncated_orange_avg_keeps_266_state_feasible(self):
        self.assertEqual(rounded_avg_interval(2.66, 3), (8, 8))

        est = RealtimeRoundEstimator(
            make_config(),
            {
                **make_state(),
                "r1_total_items": 34,
                "r1_blue_count": 10,
                "r2_orange_avg": 2.66,
            },
        )

        report = est.recompute()

        self.assertIsNotNone(report)
        self.assertTrue(report["summary"]["count_probs"]["o"])
        self.assertTrue(
            all(count % 3 == 0 for count in report["summary"]["count_probs"]["o"].keys()),
            report["summary"]["count_probs"]["o"],
        )

    def test_raw_average_display_text_disambiguates_compact_and_fixed_width_inputs(self):
        config = make_config()
        config["cells_per_item"]["o"] = {"mean": 1.0, "sd": 0.1, "min": 0, "max": 30}

        compact = RealtimeRoundEstimator(
            config,
            {
                **make_state(),
                "r1_total_items": 30,
                "r2_orange_avg": 0.3,
                "r2_orange_avg_text": "0.3",
            },
        ).recompute()
        fixed = RealtimeRoundEstimator(
            config,
            {
                **make_state(),
                "r1_total_items": 30,
                "r2_orange_avg": 0.3,
                "r2_orange_avg_text": "0.30",
            },
        ).recompute()

        self.assertEqual(list(compact["summary"]["count_probs"]["o"].keys()), [10, 20, 30])
        self.assertEqual(list(fixed["summary"]["count_probs"]["o"].keys()), [13, 23, 26])

    def test_missing_raw_average_text_is_reported_for_legacy_state_payloads(self):
        est = RealtimeRoundEstimator(
            make_config(),
            {
                **make_state(),
                "r1_total_items": 30,
                "r2_orange_avg": 0.3,
            },
        )

        warnings = est.get_missing_average_text_warnings()

        self.assertEqual(len(warnings), 1)
        self.assertIn("r2_orange_avg", warnings[0])
        self.assertIn("0.3/0.30", warnings[0])

    def test_validate_rejects_non_integer_count_fields(self):
        est = RealtimeRoundEstimator(
            make_config(),
            {
                **make_state(),
                "r1_total_items": 12.5,
                "r1_blue_count": 2,
            },
        )

        errors = est.validate()

        self.assertTrue(any("整数" in error for error in errors), errors)

    def test_zero_orange_average_keeps_only_zero_orange_count(self):
        est = RealtimeRoundEstimator(
            make_config(),
            {
                **make_state(),
                "r1_total_items": 8,
                "r2_orange_avg": 0,
            },
        )

        report = est.recompute()

        self.assertIsNotNone(report)
        orange_probs = report["summary"]["count_probs"]["o"]
        self.assertEqual(list(orange_probs.keys()), [0])
        self.assertAlmostEqual(orange_probs[0], 1.0, places=12)

    def test_average_observation_relaxes_sparse_high_avg_support(self):
        strict_config = make_config()
        strict_config["solver"]["average_observation"] = {"relax_sparse_support": False}
        strict_est = RealtimeRoundEstimator(strict_config, make_state())
        strict_info = strict_est.infer_cells_for_color("p", 4, 4.75, "4.75")

        relaxed_config = make_config()
        relaxed_config["solver"]["average_observation"] = {
            "relax_sparse_support": True,
            "sparse_support_threshold": 1,
            "fallback_slack_cells": 1.0,
            "fallback_min_avg": 1.0,
        }
        relaxed_est = RealtimeRoundEstimator(relaxed_config, make_state())
        relaxed_info = relaxed_est.infer_cells_for_color("p", 4, 4.75, "4.75")

        self.assertIsNotNone(strict_info)
        self.assertIsNotNone(relaxed_info)
        self.assertEqual(strict_info[0].feasible_low, 19)
        self.assertEqual(strict_info[0].feasible_high, 19)
        self.assertLessEqual(relaxed_info[0].feasible_low, 18)
        self.assertGreaterEqual(relaxed_info[0].feasible_high, 20)

    def test_extreme_orange_average_returns_no_feasible_solution(self):
        est = RealtimeRoundEstimator(
            make_config(),
            {
                **make_state(),
                "r1_total_items": 8,
                "r2_orange_avg": 99,
            },
        )

        report = est.recompute()

        self.assertIsNone(report)

    def test_enumerate_count_states_respects_explicit_white_count_constraints(self):
        state = {
            **make_state(),
            "r1_total_items": 10,
            "r1_blue_count": 2,
            "r2_purple_count": 1,
            "r5_white_green_total": 5,
            "r5_white_count": 2,
        }
        est = RealtimeRoundEstimator(make_config(), state)

        states = est.enumerate_count_states()

        self.assertTrue(states)
        self.assertTrue(all(state["w"] == 2 for state in states), states[:5])
        self.assertTrue(all(state["g"] == 3 for state in states), states[:5])

    def test_infer_cells_for_color_exposes_explicit_mass_across_full_feasible_red_range(self):
        est = RealtimeRoundEstimator(make_config(), make_state())

        posterior, _ = est.infer_cells_for_color("r", 1, None)
        support = [count for count, _ in posterior.mass]
        total_prob = sum(prob for _, prob in posterior.mass)

        self.assertEqual(support, list(range(1, 11)))
        self.assertAlmostEqual(total_prob, 1.0, places=9)

    def test_summary_keeps_exact_red_cell_tail_support_from_candidate_posteriors(self):
        est = RealtimeRoundEstimator(make_config(), make_state())
        zero = zero_posterior()
        red, _ = est.infer_cells_for_color("r", 1, None)
        cand = Candidate(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 0, "r": 1},
            color_grids={"w": zero, "g": zero, "b": zero, "p": zero, "o": zero, "r": red},
            log_score=0.0,
        )

        summary = est.summarize([(cand, 1.0)])
        support = sorted(entry["count"] for entry in summary["red_cell_probs"])

        self.assertEqual(support[0], 1)
        self.assertEqual(support[-1], 10)

    def test_summary_exposes_a_normalized_red_cell_distribution(self):
        state = {
            **make_state(),
            "r1_total_items": 12,
            "r1_blue_count": 2,
            "r2_orange_avg": 2.5,
            "r2_purple_count": 2,
            "r3_green_count": 3,
            "r3_purple_avg": 2.0,
            "r4_blue_avg": 2.0,
            "r5_white_green_total": 5,
        }
        est = RealtimeRoundEstimator(make_config(), state)

        report = est.recompute()
        total_prob = sum(entry["prob"] for entry in report["summary"]["red_cell_probs"])

        self.assertIsNotNone(report)
        self.assertTrue(report["summary"]["red_cell_probs"])
        self.assertAlmostEqual(total_prob, 1.0, places=6)

    def test_summary_uses_weighted_cell_quantiles_instead_of_extreme_envelopes(self):
        est = RealtimeRoundEstimator(make_config(), make_state())
        zero = zero_posterior()
        purple_main = ColorGridPosterior(
            mean_cells=19.0,
            p10_cells=19,
            p90_cells=19,
            feasible_low=19,
            feasible_high=19,
        )
        purple_tail = ColorGridPosterior(
            mean_cells=57.0,
            p10_cells=57,
            p90_cells=57,
            feasible_low=57,
            feasible_high=57,
        )

        main = Candidate(
            counts={"w": 0, "g": 0, "b": 0, "p": 4, "o": 0, "r": 0},
            color_grids={"w": zero, "g": zero, "b": zero, "p": purple_main, "o": zero, "r": zero},
            log_score=0.0,
        )
        tail = Candidate(
            counts={"w": 0, "g": 0, "b": 0, "p": 12, "o": 0, "r": 0},
            color_grids={"w": zero, "g": zero, "b": zero, "p": purple_tail, "o": zero, "r": zero},
            log_score=0.0,
        )

        summary = est.summarize([(main, 0.999999999999), (tail, 1e-12)])

        self.assertEqual(summary["cell_low"]["p"], 19)
        self.assertEqual(summary["cell_high"]["p"], 19, summary["cell_high"])

    def test_summary_exposes_red_type_template_posterior(self):
        config = make_config()
        config["red_type_profiles"] = {
            "profiles": {
                "small_red": {
                    "label": "小红",
                    "prior": 1,
                    "mean_cells_per_item": 2.0,
                    "sd_cells_per_item": 0.2,
                    "base_item_mean": 100,
                    "base_item_sd": 0,
                    "per_cell_mean": 10,
                    "per_cell_sd": 0,
                },
                "big_red": {
                    "label": "大红",
                    "prior": 1,
                    "mean_cells_per_item": 5.0,
                    "sd_cells_per_item": 0.2,
                    "base_item_mean": 100,
                    "base_item_sd": 0,
                    "per_cell_mean": 10,
                    "per_cell_sd": 0,
                },
            }
        }

        est = RealtimeRoundEstimator(config, make_state())
        zero = zero_posterior()
        red = point_red_posterior(5)
        cand = Candidate(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 0, "r": 1},
            color_grids={"w": zero, "g": zero, "b": zero, "p": zero, "o": zero, "r": red},
            log_score=0.0,
        )

        summary = est.summarize([(cand, 1.0)])

        self.assertEqual(summary["red_type_probs"][0]["id"], "big_red")
        self.assertEqual(summary["red_type_probs"][0]["label"], "大红")
        self.assertGreater(summary["red_type_probs"][0]["prob"], 0.999)

    def test_summary_ignores_collection_family_posterior_in_phase1(self):
        config = make_config()
        config["red_type_profiles"] = {
            "profiles": {
                "small_red": {
                    "label": "小红",
                    "prior": 1,
                    "mean_cells_per_item": 3.0,
                    "sd_cells_per_item": 0.2,
                    "base_item_mean": 100,
                    "base_item_sd": 0,
                    "per_cell_mean": 10,
                    "per_cell_sd": 0,
                }
            }
        }
        config["collection_families"] = {
            "relics": {"label": "文物", "prior": 3, "value_bias": 1.2},
            "furniture": {"label": "家居", "prior": 1, "value_bias": 0.8},
        }

        est = RealtimeRoundEstimator(config, make_state())
        zero = zero_posterior()
        red = point_red_posterior(3)
        cand = Candidate(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 0, "r": 1},
            color_grids={"w": zero, "g": zero, "b": zero, "p": zero, "o": zero, "r": red},
            log_score=0.0,
        )

        summary = est.summarize([(cand, 1.0)])
        self.assertEqual(summary["family_probs"], [])

    def test_valuation_uses_red_type_template_value_params(self):
        config = make_config()
        config["collection_families"] = {}
        config["value_model"]["r"] = {
            "base_item_mean": 0,
            "base_item_sd": 0,
            "per_cell_mean": 0,
            "per_cell_sd": 0,
        }
        config["red_type_profiles"] = {
            "profiles": {
                "small_red": {
                    "label": "小红",
                    "prior": 0.0001,
                    "mean_cells_per_item": 2.0,
                    "sd_cells_per_item": 0.2,
                    "base_item_mean": 3,
                    "base_item_sd": 0,
                    "per_cell_mean": 1,
                    "per_cell_sd": 0,
                },
                "big_red": {
                    "label": "大红",
                    "prior": 1,
                    "mean_cells_per_item": 5.0,
                    "sd_cells_per_item": 0.2,
                    "base_item_mean": 10,
                    "base_item_sd": 0,
                    "per_cell_mean": 2,
                    "per_cell_sd": 0,
                },
            }
        }

        est = RealtimeRoundEstimator(config, make_state())
        zero = zero_posterior()
        red = point_red_posterior(5)
        cand = Candidate(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 0, "r": 1},
            color_grids={"w": zero, "g": zero, "b": zero, "p": zero, "o": zero, "r": red},
            log_score=0.0,
        )

        with patch("random.random", return_value=0.5):
            valuation = est.valuation_mc([(cand, 1.0)])

        self.assertEqual(valuation["mean_value"], 20)

    def test_valuation_ignores_collection_family_value_bias_in_phase1(self):
        config = make_config()
        config["value_model"]["r"] = {
            "base_item_mean": 0,
            "base_item_sd": 0,
            "per_cell_mean": 0,
            "per_cell_sd": 0,
        }
        config["red_type_profiles"] = {
            "profiles": {
                "small_red": {
                    "label": "小红",
                    "prior": 1,
                    "mean_cells_per_item": 5.0,
                    "sd_cells_per_item": 0.2,
                    "base_item_mean": 10,
                    "base_item_sd": 0,
                    "per_cell_mean": 2,
                    "per_cell_sd": 0,
                }
            }
        }
        config["collection_families"] = {
            "relics": {"label": "文物", "prior": 1, "value_bias": 1.5}
        }

        est = RealtimeRoundEstimator(config, make_state())
        zero = zero_posterior()
        red = point_red_posterior(5)
        cand = Candidate(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 0, "r": 1},
            color_grids={"w": zero, "g": zero, "b": zero, "p": zero, "o": zero, "r": red},
            log_score=0.0,
        )

        with patch("random.random", return_value=0.5):
            valuation = est.valuation_mc([(cand, 1.0)])

        self.assertEqual(valuation["mean_value"], 20)

    def test_replace_config_keeps_family_posteriors_disabled_in_phase1(self):
        config = make_config()
        config["red_type_profiles"] = {
            "profiles": {
                "small_red": {
                    "label": "小红",
                    "prior": 1,
                    "mean_cells_per_item": 3.0,
                    "sd_cells_per_item": 0.2,
                    "base_item_mean": 100,
                    "base_item_sd": 0,
                    "per_cell_mean": 10,
                    "per_cell_sd": 0,
                }
            }
        }
        config["collection_families"] = {
            "relics": {"label": "文物", "prior": 1, "value_bias": 1.2}
        }

        est = RealtimeRoundEstimator(config, make_state())
        first = est.infer_collection_family_posterior(1, 3.0)

        next_config = copy.deepcopy(config)
        next_config["collection_families"] = {
            "cargo": {"label": "货物", "prior": 1, "value_bias": 0.8}
        }
        est.replace_config(next_config)
        second = est.infer_collection_family_posterior(1, 3.0)

        self.assertEqual(first, [])
        self.assertEqual(second, [])

    def test_has_round_inputs_ignores_bid_only_state(self):
        est = RealtimeRoundEstimator(
            make_config(),
            {
                **make_state(),
                "bid_price": 18800,
            },
        )

        self.assertFalse(est.has_round_inputs())

    def test_has_round_inputs_detects_round_observations(self):
        est = RealtimeRoundEstimator(
            make_config(),
            {
                **make_state(),
                "r1_total_items": 10,
            },
        )

        self.assertTrue(est.has_round_inputs())

    def test_partial_state_payload_is_merged_with_defaults(self):
        est = RealtimeRoundEstimator(make_config(), {"r1_total_items": 10})

        report = est.recompute()

        self.assertIsNotNone(report)
        self.assertEqual(est.state["r1_total_items"], 10)
        self.assertIn("r1_blue_count", est.state)

    def test_replace_config_merges_partial_payload_with_default_schema(self):
        est = RealtimeRoundEstimator(make_config(), make_state())

        est.replace_config({"solver": {"mc_samples": 7}})

        self.assertEqual(est.config["solver"]["mc_samples"], 7)
        self.assertIn("cells_per_item", est.config)


if __name__ == "__main__":
    unittest.main()
