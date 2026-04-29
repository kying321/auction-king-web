import copy
import math
import unittest
from unittest.mock import patch

from auction_king_sunken_ship_estimator import (
    CONFIG_DEFAULT,
    STATE_DEFAULT,
    AuctionKingEstimator,
    CandidateState,
    QualityPosterior,
    apply_loaded_config_payload,
    apply_loaded_state_payload,
    apply_ahmed_round_command,
    build_ahmed_round_updates,
    describe_config_schema,
    export_config_payload,
    format_export_target_notice,
    format_config_schema_notice,
    inspect_config_schema_resolution,
    export_current_source_schema_config,
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
    return QualityPosterior(
        mean_grid=0.0,
        low_grid=0,
        high_grid=0,
        feasible_interval=(0, 0),
    )


def point_red_posterior(cells):
    return QualityPosterior(
        mean_grid=float(cells),
        low_grid=cells,
        high_grid=cells,
        feasible_interval=(cells, cells),
    )


class OfflineEstimatorRedTemplateTests(unittest.TestCase):
    def test_partial_state_payload_merges_with_defaults_and_recomputes(self):
        estimator = AuctionKingEstimator(make_config(), make_state())

        report = apply_loaded_state_payload(estimator, {"total_items": 8})

        self.assertIsNotNone(report)
        self.assertEqual(estimator.state["total_items"], 8)
        self.assertIsNone(estimator.state["known_b"])
        self.assertIn("orange_count_probs", report["summary"])

    def test_partial_config_payload_merges_with_defaults_and_recomputes(self):
        estimator = AuctionKingEstimator(
            make_config(),
            {
                **make_state(),
                "total_items": 8,
            },
        )

        report = apply_loaded_config_payload(
            estimator,
            {
                "value_models": {
                    "r": {
                        "base_item_mean": 123456,
                    }
                }
            },
        )

        self.assertIsNotNone(report)
        self.assertEqual(estimator.config["value_models"]["r"]["base_item_mean"], 123456)
        self.assertIn("o", estimator.config["value_models"])
        self.assertIn("grid_models", estimator.config)

    def test_default_config_tracks_source_backed_sunken_ship_sections(self):
        self.assertEqual(CONFIG_DEFAULT["map_name"], "沉船图-高难-互联网校准v1")
        self.assertEqual(CONFIG_DEFAULT["alpha_counts"]["o"], 1)
        self.assertEqual(CONFIG_DEFAULT["alpha_counts"]["r"], 0.6)
        self.assertEqual(CONFIG_DEFAULT["grid_models"]["o"]["mean_cells"], 4.1)
        self.assertIsNone(CONFIG_DEFAULT["grid_models"]["o"]["max_cells"])
        self.assertEqual(CONFIG_DEFAULT["grid_models"]["p"]["mean_cells"], 2.55)
        self.assertEqual(CONFIG_DEFAULT["value_models"]["r"]["base_item_mean"], 128777)
        self.assertEqual(CONFIG_DEFAULT["value_models"]["r"]["per_cell_mean"], 0)

    def test_score_count_prior_prefers_alpha_counts_over_legacy_count_probs(self):
        config = make_config()
        config["count_probs"] = {
            "w": 0.99,
            "g": 0.001,
            "b": 0.001,
            "p": 0.001,
            "o": 0.001,
            "r": 0.006,
        }
        config["alpha_counts"] = {
            "w": 4.0,
            "g": 5.0,
            "b": 6.0,
            "p": 7.0,
            "o": 8.0,
            "r": 9.0,
        }
        estimator = AuctionKingEstimator(config, make_state())
        counts = {"w": 1, "g": 2, "b": 3, "p": 4, "o": 5, "r": 6}

        expected = sum(
            math.lgamma(counts[q] + config["alpha_counts"][q]) - math.lgamma(config["alpha_counts"][q]) - math.lgamma(counts[q] + 1)
            for q in counts
        )

        self.assertAlmostEqual(estimator.score_count_prior(counts), expected, places=12)

    def test_score_count_prior_falls_back_to_legacy_count_probs_when_alpha_counts_missing(self):
        config = make_config()
        config["count_probs"] = {
            "w": 0.31,
            "g": 0.26,
            "b": 0.18,
            "p": 0.12,
            "o": 0.08,
            "r": 0.05,
        }
        estimator = AuctionKingEstimator(config, make_state())
        estimator.config.pop("alpha_counts", None)
        estimator.config["count_probs"] = copy.deepcopy(config["count_probs"])
        counts = {"w": 1, "g": 2, "b": 3, "p": 4, "o": 5, "r": 6}

        expected = sum(counts[q] * math.log(config["count_probs"][q]) for q in counts)

        self.assertAlmostEqual(estimator.score_count_prior(counts), expected, places=12)

    def test_apply_ahmed_round_command_updates_state_and_recomputes_immediately(self):
        estimator = AuctionKingEstimator(make_config(), make_state())

        with patch.object(estimator, "recompute", return_value={"summary": {}}) as recompute:
            report = apply_ahmed_round_command(estimator, ["r2", "2.5"])

        self.assertEqual(estimator.state["avg_o"], 2.5)
        self.assertIsNone(estimator.state["known_p"])
        self.assertEqual(report, {"summary": {}})
        recompute.assert_called_once_with()

    def test_build_ahmed_round_updates_accepts_orange_avg_without_purple_count(self):
        updates = build_ahmed_round_updates(["r2", "2.5"])

        self.assertEqual(
            updates,
            {
                "avg_o": 2.5,
                "avg_o_text": "2.5",
                "known_p": None,
            },
        )

    def test_build_ahmed_round_updates_maps_all_five_rounds(self):
        self.assertEqual(
            build_ahmed_round_updates(["r1", "10", "2"]),
            {"total_items": 10, "known_b": 2},
        )
        self.assertEqual(
            build_ahmed_round_updates(["r2", "2.5", "3"]),
            {"avg_o": 2.5, "avg_o_text": "2.5", "known_p": 3},
        )
        self.assertEqual(
            build_ahmed_round_updates(["r3", "4", "2.2"]),
            {"known_g": 4, "avg_p": 2.2, "avg_p_text": "2.2"},
        )
        self.assertEqual(
            build_ahmed_round_updates(["r4", "1.8"]),
            {"avg_b": 1.8, "avg_b_text": "1.8"},
        )
        self.assertEqual(
            build_ahmed_round_updates(["r5", "9", "3"]),
            {"known_sum_wg": 9, "known_w": 3},
        )

    def test_apply_ahmed_round_command_preserves_raw_average_text(self):
        estimator = AuctionKingEstimator(make_config(), make_state())

        with patch.object(estimator, "recompute", return_value={"summary": {}}):
            apply_ahmed_round_command(estimator, ["r2", "1.30"])
            apply_ahmed_round_command(estimator, ["r3", "4", "2.50"])
            apply_ahmed_round_command(estimator, ["r4", "0.70"])

        self.assertEqual(estimator.state["avg_o"], 1.3)
        self.assertEqual(estimator.state["avg_o_text"], "1.30")
        self.assertEqual(estimator.state["avg_p"], 2.5)
        self.assertEqual(estimator.state["avg_p_text"], "2.50")
        self.assertEqual(estimator.state["avg_b"], 0.7)
        self.assertEqual(estimator.state["avg_b_text"], "0.70")

    def test_truncated_orange_avg_keeps_266_state_feasible(self):
        self.assertEqual(rounded_avg_interval(2.66, 3), (8, 8))

        estimator = AuctionKingEstimator(
            make_config(),
            {
                **make_state(),
                "total_items": 34,
                "known_b": 10,
                "avg_o": 2.66,
            },
        )

        report = estimator.recompute()

        self.assertIsNotNone(report)
        self.assertTrue(report["summary"]["orange_count_probs"])
        self.assertTrue(
            all(count % 3 == 0 for count in report["summary"]["orange_count_probs"].keys()),
            report["summary"]["orange_count_probs"],
        )

    def test_raw_average_display_text_disambiguates_compact_and_fixed_width_inputs(self):
        config = make_config()
        config["grid_models"]["o"] = {"mean_cells": 1.0, "sd_cells": 0.1, "min_cells": 0, "max_cells": 30}

        compact = AuctionKingEstimator(
            config,
            {
                **make_state(),
                "total_items": 30,
                "avg_o": 0.3,
                "avg_o_text": "0.3",
            },
        ).recompute()
        fixed = AuctionKingEstimator(
            config,
            {
                **make_state(),
                "total_items": 30,
                "avg_o": 0.3,
                "avg_o_text": "0.30",
            },
        ).recompute()

        self.assertEqual(list(compact["summary"]["orange_count_probs"].keys()), [10, 20, 30])
        self.assertEqual(list(fixed["summary"]["orange_count_probs"].keys()), [13, 23, 26])

    def test_missing_raw_average_text_is_reported_for_legacy_state_payloads(self):
        estimator = AuctionKingEstimator(
            make_config(),
            {
                **make_state(),
                "total_items": 30,
                "avg_o": 0.3,
            },
        )

        warnings = estimator.get_missing_average_text_warnings()

        self.assertEqual(len(warnings), 1)
        self.assertIn("avg_o", warnings[0])
        self.assertIn("0.3/0.30", warnings[0])

    def test_validate_state_rejects_non_integer_count_fields(self):
        estimator = AuctionKingEstimator(
            make_config(),
            {
                **make_state(),
                "total_items": 12.5,
                "known_b": 2,
            },
        )

        errors = estimator.validate_state()

        self.assertTrue(any("整数" in error for error in errors), errors)

    def test_zero_orange_average_keeps_only_zero_orange_count(self):
        estimator = AuctionKingEstimator(
            make_config(),
            {
                **make_state(),
                "total_items": 8,
                "avg_o": 0,
            },
        )

        report = estimator.recompute()

        self.assertIsNotNone(report)
        self.assertEqual(list(report["summary"]["orange_count_probs"].keys()), [0])
        self.assertAlmostEqual(report["summary"]["orange_count_probs"][0], 1.0, places=12)

    def test_average_observation_relaxes_sparse_high_avg_support(self):
        strict_config = make_config()
        strict_config["solver"]["average_observation"] = {"relax_sparse_support": False}
        strict_estimator = AuctionKingEstimator(strict_config, make_state())
        strict_info = strict_estimator.infer_quality_grid("p", 4, 4.75, "4.75")

        relaxed_config = make_config()
        relaxed_config["solver"]["average_observation"] = {
            "relax_sparse_support": True,
            "sparse_support_threshold": 1,
            "fallback_slack_cells": 1.0,
            "fallback_min_avg": 1.0,
        }
        relaxed_estimator = AuctionKingEstimator(relaxed_config, make_state())
        relaxed_info = relaxed_estimator.infer_quality_grid("p", 4, 4.75, "4.75")

        self.assertIsNotNone(strict_info)
        self.assertIsNotNone(relaxed_info)
        self.assertEqual(strict_info[0].feasible_interval, (19, 19))
        self.assertLessEqual(relaxed_info[0].feasible_interval[0], 18)
        self.assertGreaterEqual(relaxed_info[0].feasible_interval[1], 20)

    def test_extreme_orange_average_returns_no_feasible_solution(self):
        estimator = AuctionKingEstimator(
            make_config(),
            {
                **make_state(),
                "total_items": 8,
                "avg_o": 99,
            },
        )

        report = estimator.recompute()

        self.assertIsNone(report)

    def test_infer_quality_grid_exposes_explicit_mass_across_full_feasible_red_range(self):
        estimator = AuctionKingEstimator(make_config(), make_state())

        posterior, _ = estimator.infer_quality_grid("r", 1, None)
        support = [count for count, _ in posterior.mass]
        total_prob = sum(prob for _, prob in posterior.mass)

        self.assertEqual(support, list(range(1, 31)))
        self.assertAlmostEqual(total_prob, 1.0, places=9)

    def test_posterior_summary_prefers_explicit_red_mass_over_low_high_approximation(self):
        config = make_config()
        config["collection_families"] = {}
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
                    "mean_cells_per_item": 10.0,
                    "sd_cells_per_item": 0.2,
                    "base_item_mean": 100,
                    "base_item_sd": 0,
                    "per_cell_mean": 10,
                    "per_cell_sd": 0,
                },
            }
        }

        estimator = AuctionKingEstimator(config, make_state())
        zero = zero_posterior()
        red = QualityPosterior(
            mean_grid=3.0,
            low_grid=1,
            high_grid=5,
            feasible_interval=(1, 10),
            mass=[(10, 1.0)],
        )
        state = CandidateState(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 0, "r": 1},
            quality_posteriors={"w": zero, "g": zero, "b": zero, "p": zero, "o": zero, "r": red},
            total_grid_mean=10.0,
            total_grid_low=10,
            total_grid_high=10,
            log_score=0.0,
        )

        summary = estimator.posterior_summary([(state, 1.0)])

        self.assertEqual(summary["red_type_probs"][0]["id"], "big_red")
        self.assertGreater(summary["red_type_probs"][0]["prob"], 0.999)

    def test_posterior_summary_exposes_red_type_template_posterior(self):
        config = make_config()
        config["collection_families"] = {}
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

        estimator = AuctionKingEstimator(config, make_state())
        zero = zero_posterior()
        red = point_red_posterior(5)
        state = CandidateState(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 0, "r": 1},
            quality_posteriors={"w": zero, "g": zero, "b": zero, "p": zero, "o": zero, "r": red},
            total_grid_mean=5.0,
            total_grid_low=5,
            total_grid_high=5,
            log_score=0.0,
        )

        summary = estimator.posterior_summary([(state, 1.0)])

        self.assertEqual(summary["red_type_probs"][0]["id"], "big_red")
        self.assertEqual(summary["red_type_probs"][0]["label"], "大红")
        self.assertGreater(summary["red_type_probs"][0]["prob"], 0.999)

    def test_posterior_summary_uses_weighted_grid_quantiles_instead_of_extreme_envelopes(self):
        estimator = AuctionKingEstimator(make_config(), make_state())
        zero = zero_posterior()
        purple_main = QualityPosterior(
            mean_grid=19.0,
            low_grid=19,
            high_grid=19,
            feasible_interval=(19, 19),
            mass=[(19, 1.0)],
        )
        purple_tail = QualityPosterior(
            mean_grid=57.0,
            low_grid=57,
            high_grid=57,
            feasible_interval=(57, 57),
            mass=[(57, 1.0)],
        )

        main = CandidateState(
            counts={"w": 0, "g": 0, "b": 0, "p": 4, "o": 0, "r": 0},
            quality_posteriors={"w": zero, "g": zero, "b": zero, "p": purple_main, "o": zero, "r": zero},
            total_grid_mean=19.0,
            total_grid_low=19,
            total_grid_high=19,
            log_score=0.0,
        )
        tail = CandidateState(
            counts={"w": 0, "g": 0, "b": 0, "p": 12, "o": 0, "r": 0},
            quality_posteriors={"w": zero, "g": zero, "b": zero, "p": purple_tail, "o": zero, "r": zero},
            total_grid_mean=57.0,
            total_grid_low=57,
            total_grid_high=57,
            log_score=0.0,
        )

        summary = estimator.posterior_summary([(main, 0.999999999999), (tail, 1e-12)])

        self.assertEqual(summary["grid_intervals"]["p"][0], 19)
        self.assertEqual(summary["grid_intervals"]["p"][1], 19, summary["grid_intervals"])

    def test_posterior_summary_uses_weighted_total_grid_quantiles_instead_of_extreme_envelopes(self):
        estimator = AuctionKingEstimator(make_config(), make_state())
        zero = zero_posterior()
        purple_main = QualityPosterior(
            mean_grid=19.0,
            low_grid=19,
            high_grid=19,
            feasible_interval=(19, 19),
            mass=[(19, 1.0)],
        )
        purple_tail = QualityPosterior(
            mean_grid=57.0,
            low_grid=57,
            high_grid=57,
            feasible_interval=(57, 57),
            mass=[(57, 1.0)],
        )

        main = CandidateState(
            counts={"w": 0, "g": 0, "b": 0, "p": 4, "o": 0, "r": 0},
            quality_posteriors={"w": zero, "g": zero, "b": zero, "p": purple_main, "o": zero, "r": zero},
            total_grid_mean=19.0,
            total_grid_low=19,
            total_grid_high=19,
            log_score=0.0,
        )
        tail = CandidateState(
            counts={"w": 0, "g": 0, "b": 0, "p": 12, "o": 0, "r": 0},
            quality_posteriors={"w": zero, "g": zero, "b": zero, "p": purple_tail, "o": zero, "r": zero},
            total_grid_mean=57.0,
            total_grid_low=57,
            total_grid_high=57,
            log_score=0.0,
        )

        summary = estimator.posterior_summary([(main, 0.999999999999), (tail, 1e-12)])

        self.assertEqual(summary["total_grid_low"], 19)
        self.assertEqual(summary["total_grid_high"], 19, summary)

    def test_posterior_summary_ignores_collection_family_posterior_in_phase1(self):
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

        estimator = AuctionKingEstimator(config, make_state())
        zero = zero_posterior()
        red = point_red_posterior(3)
        state = CandidateState(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 0, "r": 1},
            quality_posteriors={"w": zero, "g": zero, "b": zero, "p": zero, "o": zero, "r": red},
            total_grid_mean=3.0,
            total_grid_low=3,
            total_grid_high=3,
            log_score=0.0,
        )

        summary = estimator.posterior_summary([(state, 1.0)])
        self.assertEqual(summary["family_probs"], [])

    def test_run_value_mc_uses_red_type_template_value_params(self):
        config = make_config()
        config["collection_families"] = {}
        config["value_models"]["r"] = {"mean_value": 0, "sd_value": 0}
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

        estimator = AuctionKingEstimator(config, make_state())
        zero = zero_posterior()
        red = point_red_posterior(5)
        state = CandidateState(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 0, "r": 1},
            quality_posteriors={"w": zero, "g": zero, "b": zero, "p": zero, "o": zero, "r": red},
            total_grid_mean=5.0,
            total_grid_low=5,
            total_grid_high=5,
            log_score=0.0,
        )

        with patch("random.random", return_value=0.5):
            valuation = estimator.run_value_mc([(state, 1.0)])

        self.assertEqual(valuation["mean_value"], 20)

    def test_run_value_mc_ignores_collection_family_value_bias_in_phase1(self):
        config = make_config()
        config["value_models"]["r"] = {"mean_value": 0, "sd_value": 0}
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

        estimator = AuctionKingEstimator(config, make_state())
        zero = zero_posterior()
        red = point_red_posterior(5)
        state = CandidateState(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 0, "r": 1},
            quality_posteriors={"w": zero, "g": zero, "b": zero, "p": zero, "o": zero, "r": red},
            total_grid_mean=5.0,
            total_grid_low=5,
            total_grid_high=5,
            log_score=0.0,
        )

        with patch("random.random", return_value=0.5):
            valuation = estimator.run_value_mc([(state, 1.0)])

        self.assertEqual(valuation["mean_value"], 20)

    def test_run_value_mc_uses_cell_value_models_for_non_red_items(self):
        config = make_config()
        config["value_models"]["o"] = {
            "base_item_mean": 10,
            "base_item_sd": 0,
            "per_cell_mean": 3,
            "per_cell_sd": 0,
        }

        estimator = AuctionKingEstimator(config, make_state())
        zero = zero_posterior()
        orange = point_red_posterior(5)
        state = CandidateState(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 1, "r": 0},
            quality_posteriors={"w": zero, "g": zero, "b": zero, "p": zero, "o": orange, "r": zero},
            total_grid_mean=5.0,
            total_grid_low=5,
            total_grid_high=5,
            log_score=0.0,
        )

        with patch("random.random", return_value=0.5):
            valuation = estimator.run_value_mc([(state, 1.0)])

        self.assertEqual(valuation["mean_value"], 25)

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

        estimator = AuctionKingEstimator(config, make_state())
        first = estimator.infer_collection_family_posterior(1, 3.0)

        next_config = copy.deepcopy(config)
        next_config["collection_families"] = {
            "cargo": {"label": "货物", "prior": 1, "value_bias": 0.8}
        }
        estimator.replace_config(next_config)
        second = estimator.infer_collection_family_posterior(1, 3.0)

        self.assertEqual(first, [])
        self.assertEqual(second, [])

    def test_partial_state_payload_is_merged_with_defaults(self):
        estimator = AuctionKingEstimator(make_config(), {"total_items": 10})

        report = estimator.recompute()

        self.assertIsNotNone(report)
        self.assertEqual(estimator.state["total_items"], 10)
        self.assertIn("known_sum_wg", estimator.state)

    def test_replace_config_merges_partial_payload_with_default_schema(self):
        estimator = AuctionKingEstimator(make_config(), make_state())

        estimator.replace_config({"solver": {"mc_samples": 7}})

        self.assertEqual(estimator.config["solver"]["mc_samples"], 7)
        self.assertIn("grid_models", estimator.config)

    def test_replace_config_accepts_current_source_schema_and_resolves_selected_map_preset(self):
        estimator = AuctionKingEstimator(make_config(), make_state())

        estimator.replace_config(
            {
                "default_map_id": "sunken_ship",
                "alpha_counts": {"w": 1.0, "g": 1.0, "b": 1.0, "p": 1.0, "o": 9.0, "r": 1.0},
                "cells_per_item": {
                    "o": {"mean": 9.5, "sd": 0.2, "min": 9, "max": 10}
                },
                "value_model": {
                    "o": {"base_item_mean": 123, "base_item_sd": 0, "per_cell_mean": 45, "per_cell_sd": 0}
                },
                "map_presets": {
                    "sunken_ship": {
                        "cells_per_item": {
                            "o": {"mean": 7.5, "sd": 0.2, "min": 7, "max": 8}
                        },
                        "value_model": {
                            "o": {"base_item_mean": 222, "base_item_sd": 0, "per_cell_mean": 66, "per_cell_sd": 0}
                        }
                    }
                },
            }
        )

        self.assertEqual(estimator.config["alpha_counts"]["o"], 9.0)
        self.assertEqual(estimator.config["grid_models"]["o"]["mean_cells"], 7.5)
        self.assertEqual(estimator.config["grid_models"]["o"]["min_cells"], 7)
        self.assertEqual(estimator.config["value_models"]["o"]["base_item_mean"], 222)
        self.assertEqual(estimator.config["value_models"]["o"]["per_cell_mean"], 66)

    def test_source_schema_null_cell_max_accepts_catalog_items_above_old_cap(self):
        estimator = AuctionKingEstimator(make_config(), make_state())
        estimator.replace_config(
            {
                "solver": {"unbounded_cell_max_per_item": 30},
                "cells_per_item": {
                    "o": {"mean": 2.95, "sd": 1.1, "min": 1, "max": None}
                },
            }
        )

        self.assertIsNone(estimator.config["grid_models"]["o"]["max_cells"])
        inferred = estimator.infer_quality_grid("o", 1, 13, "13")

        self.assertIsNotNone(inferred)
        posterior, _ = inferred
        self.assertIn(13, [count for count, _ in posterior.mass])
        self.assertLessEqual(posterior.feasible_interval[0], 13)
        self.assertGreaterEqual(posterior.feasible_interval[1], 13)

    def test_replace_config_current_source_value_model_changes_non_red_valuation(self):
        estimator = AuctionKingEstimator(make_config(), make_state())
        estimator.replace_config(
            {
                "value_model": {
                    "o": {"base_item_mean": 10, "base_item_sd": 0, "per_cell_mean": 3, "per_cell_sd": 0}
                },
                "cells_per_item": {
                    "o": {"mean": 5, "sd": 0.1, "min": 5, "max": 5}
                },
            }
        )

        zero = zero_posterior()
        orange = point_red_posterior(5)
        state = CandidateState(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 1, "r": 0},
            quality_posteriors={"w": zero, "g": zero, "b": zero, "p": zero, "o": orange, "r": zero},
            total_grid_mean=5.0,
            total_grid_low=5,
            total_grid_high=5,
            log_score=0.0,
        )

        with patch("random.random", return_value=0.5):
            valuation = estimator.run_value_mc([(state, 1.0)])

        self.assertEqual(valuation["mean_value"], 25)

    def test_export_current_source_schema_round_trips_loaded_source_config(self):
        estimator = AuctionKingEstimator(make_config(), make_state())
        estimator.replace_config(
            {
                "default_map_id": "sunken_ship",
                "alpha_counts": {"w": 1.0, "g": 1.0, "b": 1.0, "p": 1.0, "o": 9.0, "r": 1.0},
                "cells_per_item": {
                    "o": {"mean": 7.5, "sd": 0.2, "min": 7, "max": 8}
                },
                "value_model": {
                    "o": {"base_item_mean": 222, "base_item_sd": 0, "per_cell_mean": 66, "per_cell_sd": 0}
                },
            }
        )

        exported = export_current_source_schema_config(estimator.config)

        self.assertEqual(describe_config_schema(exported), "source")
        self.assertEqual(exported["app"]["default_map_id"], "sunken_ship")
        self.assertIn("maps", exported)
        self.assertIn("model", exported)
        self.assertIn("solver", exported)
        self.assertNotIn("grid_models", exported)
        self.assertEqual(exported["maps"]["sunken_ship"]["alpha_counts"]["o"], 9.0)
        self.assertEqual(exported["maps"]["sunken_ship"]["cells_per_item"]["o"]["mean"], 7.5)
        self.assertEqual(exported["maps"]["sunken_ship"]["value_model"]["o"]["base_item_mean"], 222)
        self.assertEqual(exported["maps"]["sunken_ship"]["value_model"]["o"]["per_cell_mean"], 66)

        reloaded = AuctionKingEstimator(make_config(), make_state())
        reloaded.replace_config(exported)

        self.assertEqual(reloaded.config["grid_models"]["o"]["mean_cells"], 7.5)
        self.assertEqual(reloaded.config["value_models"]["o"]["base_item_mean"], 222)
        self.assertEqual(reloaded.config["value_models"]["o"]["per_cell_mean"], 66)

    def test_export_current_source_schema_preserves_legacy_mean_value_models(self):
        config = make_config()
        config["value_models"]["o"] = {"mean_value": 123, "sd_value": 7}

        exported = export_current_source_schema_config(config)

        self.assertEqual(describe_config_schema(exported), "source")
        self.assertEqual(
            exported["maps"]["sunken_ship"]["value_model"]["o"],
            {
                "base_item_mean": 123.0,
                "base_item_sd": 7.0,
                "per_cell_mean": 0.0,
                "per_cell_sd": 0.0,
            },
        )

        reloaded = AuctionKingEstimator(make_config(), make_state())
        reloaded.replace_config(exported)

        self.assertEqual(reloaded.config["value_models"]["o"]["mean_value"], 123.0)
        self.assertEqual(reloaded.config["value_models"]["o"]["sd_value"], 7.0)

    def test_replace_config_legacy_value_model_changes_non_red_valuation(self):
        estimator = AuctionKingEstimator(make_config(), make_state())
        estimator.replace_config(
            {
                "value_models": {
                    "o": {"mean_value": 123, "sd_value": 0}
                }
            }
        )

        zero = zero_posterior()
        orange = point_red_posterior(5)
        state = CandidateState(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 1, "r": 0},
            quality_posteriors={"w": zero, "g": zero, "b": zero, "p": zero, "o": orange, "r": zero},
            total_grid_mean=5.0,
            total_grid_low=5,
            total_grid_high=5,
            log_score=0.0,
        )

        with patch("random.random", return_value=0.5):
            valuation = estimator.run_value_mc([(state, 1.0)])

        self.assertEqual(valuation["mean_value"], 123)

    def test_replace_config_legacy_count_probs_overrides_default_alpha_counts(self):
        estimator = AuctionKingEstimator(make_config(), make_state())
        legacy_probs = {
            "w": 0.99,
            "g": 0.001,
            "b": 0.001,
            "p": 0.001,
            "o": 0.001,
            "r": 0.006,
        }
        counts = {"w": 1, "g": 2, "b": 3, "p": 4, "o": 5, "r": 6}

        estimator.replace_config({"count_probs": legacy_probs})

        expected = sum(counts[q] * math.log(legacy_probs[q]) for q in counts)
        self.assertNotIn("alpha_counts", estimator.config)
        self.assertAlmostEqual(estimator.score_count_prior(counts), expected, places=12)

    def test_replace_config_legacy_internal_file_prefers_count_probs_when_alpha_counts_unchanged(self):
        estimator = AuctionKingEstimator(make_config(), make_state())
        legacy_file = make_config()
        legacy_file["count_probs"] = {
            "w": 0.99,
            "g": 0.001,
            "b": 0.001,
            "p": 0.001,
            "o": 0.001,
            "r": 0.006,
        }
        counts = {"w": 1, "g": 2, "b": 3, "p": 4, "o": 5, "r": 6}

        estimator.replace_config(legacy_file)

        expected = sum(counts[q] * math.log(legacy_file["count_probs"][q]) for q in counts)
        self.assertAlmostEqual(estimator.score_count_prior(counts), expected, places=12)

    def test_export_current_source_schema_uses_legacy_count_probs_when_alpha_counts_absent(self):
        config = make_config()
        config.pop("alpha_counts", None)
        config["count_probs"] = {
            "w": 0.31,
            "g": 0.26,
            "b": 0.18,
            "p": 0.12,
            "o": 0.08,
            "r": 0.05,
        }

        exported = export_current_source_schema_config(config)

        self.assertEqual(exported["config_schema"], "source")
        self.assertEqual(exported["app"]["default_map_id"], "sunken_ship")
        self.assertEqual(exported["maps"]["sunken_ship"]["alpha_counts"], config["count_probs"])

    def test_replace_config_legacy_internal_file_prefers_mean_value_when_cell_fields_unchanged(self):
        estimator = AuctionKingEstimator(make_config(), make_state())
        legacy_file = make_config()
        legacy_file["value_models"]["o"]["mean_value"] = 123
        legacy_file["value_models"]["o"]["sd_value"] = 0

        estimator.replace_config({"value_models": {"o": legacy_file["value_models"]["o"]}})

        zero = zero_posterior()
        orange = point_red_posterior(5)
        state = CandidateState(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 1, "r": 0},
            quality_posteriors={"w": zero, "g": zero, "b": zero, "p": zero, "o": orange, "r": zero},
            total_grid_mean=5.0,
            total_grid_low=5,
            total_grid_high=5,
            log_score=0.0,
        )

        with patch("random.random", return_value=0.5):
            valuation = estimator.run_value_mc([(state, 1.0)])

        self.assertEqual(valuation["mean_value"], 123)

    def test_replace_config_explicit_legacy_schema_prefers_count_probs_over_alpha_counts(self):
        estimator = AuctionKingEstimator(make_config(), make_state())
        counts = {"w": 1, "g": 2, "b": 3, "p": 4, "o": 5, "r": 6}
        config = {
            "config_schema": "legacy_internal",
            "count_probs": {
                "w": 0.99,
                "g": 0.001,
                "b": 0.001,
                "p": 0.001,
                "o": 0.001,
                "r": 0.006,
            },
            "alpha_counts": {
                "w": 4.0,
                "g": 5.0,
                "b": 6.0,
                "p": 7.0,
                "o": 8.0,
                "r": 9.0,
            },
        }

        estimator.replace_config(config)

        expected = sum(counts[q] * math.log(config["count_probs"][q]) for q in counts)
        self.assertAlmostEqual(estimator.score_count_prior(counts), expected, places=12)

    def test_replace_config_explicit_legacy_schema_prefers_mean_value_over_cell_fields(self):
        estimator = AuctionKingEstimator(make_config(), make_state())
        estimator.replace_config(
            {
                "config_schema": "legacy_internal",
                "value_models": {
                    "o": {
                        "mean_value": 123,
                        "sd_value": 0,
                        "base_item_mean": 9999,
                        "base_item_sd": 0,
                        "per_cell_mean": 999,
                        "per_cell_sd": 0,
                    }
                },
            }
        )

        zero = zero_posterior()
        orange = point_red_posterior(5)
        state = CandidateState(
            counts={"w": 0, "g": 0, "b": 0, "p": 0, "o": 1, "r": 0},
            quality_posteriors={"w": zero, "g": zero, "b": zero, "p": zero, "o": orange, "r": zero},
            total_grid_mean=5.0,
            total_grid_low=5,
            total_grid_high=5,
            log_score=0.0,
        )

        with patch("random.random", return_value=0.5):
            valuation = estimator.run_value_mc([(state, 1.0)])

        self.assertEqual(valuation["mean_value"], 123)

    def test_inspect_config_schema_resolution_marks_mixed_heuristic_files(self):
        resolution = inspect_config_schema_resolution(
            {
                "cells_per_item": {"o": {"mean": 7.5, "sd": 0.2, "min": 7, "max": 8}},
                "value_models": {"o": {"mean_value": 123, "sd_value": 0}},
            }
        )

        self.assertEqual(resolution["schema"], "source")
        self.assertEqual(resolution["mode"], "heuristic")
        self.assertTrue(resolution["mixed_keys"])
        self.assertIn("建议补 config_schema", resolution["warning"])

    def test_format_config_schema_notice_marks_explicit_schema_without_warning(self):
        notice = format_config_schema_notice(
            {
                "config_schema": "legacy_internal",
                "count_probs": {"w": 0.31, "g": 0.26, "b": 0.18, "p": 0.12, "o": 0.08, "r": 0.05},
                "cells_per_item": {"o": {"mean": 7.5, "sd": 0.2, "min": 7, "max": 8}},
            }
        )

        self.assertEqual(notice, "schema=legacy (explicit)")

    def test_export_config_payload_supports_explicit_legacy_internal_schema(self):
        exported = export_config_payload(make_config(), "legacy_internal")

        self.assertEqual(exported["config_schema"], "legacy_internal")
        self.assertNotIn("alpha_counts", exported)
        self.assertIn("count_probs", exported)
        self.assertIn("grid_models", exported)
        self.assertIn("value_models", exported)
        self.assertNotIn("cells_per_item", exported)
        self.assertNotIn("value_model", exported)

    def test_export_config_payload_source_remains_default(self):
        exported = export_config_payload(make_config(), "source")

        self.assertEqual(exported["config_schema"], "source")
        self.assertIn("app", exported)
        self.assertIn("maps", exported)
        self.assertIn("model", exported)
        self.assertEqual(exported["app"]["default_map_id"], "sunken_ship")
        self.assertIn("alpha_counts", exported["maps"]["sunken_ship"])
        self.assertIn("cells_per_item", exported["maps"]["sunken_ship"])
        self.assertIn("value_model", exported["maps"]["sunken_ship"])

    def test_format_export_target_notice_marks_legacy_internal_as_compat_only(self):
        notice = format_export_target_notice("legacy_internal")

        self.assertIn("legacy_internal", notice)
        self.assertIn("兼容导出", notice)
        self.assertIn("不建议长期维护", notice)

    def test_format_export_target_notice_source_has_no_compat_warning(self):
        notice = format_export_target_notice("source")

        self.assertEqual(notice, "导出目标 schema=source")

    def test_format_export_target_notice_warns_when_source_export_is_lossy(self):
        config = make_config()
        config.pop("alpha_counts", None)
        config["value_models"]["o"] = {"mean_value": 123, "sd_value": 7}

        notice = format_export_target_notice("source", config)

        self.assertIn("count_probs -> alpha_counts", notice)
        self.assertIn("mean_value/sd_value -> value_model", notice)

    def test_apply_loaded_state_payload_recomputes_when_total_items_ready(self):
        estimator = AuctionKingEstimator(make_config(), make_state())

        with patch.object(estimator, "recompute", return_value={"summary": {"ok": True}}) as recompute:
            report = apply_loaded_state_payload(estimator, {"total_items": 24})

        self.assertEqual(estimator.state["total_items"], 24)
        self.assertEqual(report, {"summary": {"ok": True}})
        recompute.assert_called_once_with()

    def test_apply_loaded_config_payload_recomputes_when_state_ready(self):
        estimator = AuctionKingEstimator(make_config(), {"total_items": 24})

        with patch.object(estimator, "recompute", return_value={"summary": {"ok": True}}) as recompute:
            report = apply_loaded_config_payload(estimator, {"solver": {"mc_samples": 7}})

        self.assertEqual(estimator.config["solver"]["mc_samples"], 7)
        self.assertEqual(report, {"summary": {"ok": True}})
        recompute.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
