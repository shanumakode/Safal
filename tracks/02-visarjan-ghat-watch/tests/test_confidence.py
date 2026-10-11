import unittest

from src.confidence import evidence_confidence

GOOD = dict(site_match_values=["high"], class_b_completeness=1.0, class_b_taken=54,
            seasons_missing_latest_year=[], dataset_verification="spot_checked")


def level(**changes):
    return evidence_confidence(**{**GOOD, **changes})[0]


class ConfidenceTests(unittest.TestCase):
    def test_good_evidence_is_high(self):
        self.assertEqual(level(), "High")

    def test_medium_site_match_caps_at_medium(self):
        self.assertEqual(level(site_match_values=["medium"]), "Medium")

    def test_low_completeness_is_low(self):
        self.assertEqual(level(class_b_completeness=0.5), "Low")

    def test_partial_completeness_drops_one(self):
        self.assertEqual(level(class_b_completeness=0.75), "Medium")

    def test_missing_latest_season_drops_one(self):
        self.assertEqual(level(seasons_missing_latest_year=["Durga 2025"]), "Medium")

    def test_few_readings_caps_at_medium(self):
        self.assertEqual(level(class_b_taken=10), "Medium")

    def test_unchecked_source_caps_at_medium(self):
        self.assertEqual(level(dataset_verification="not_checked"), "Medium")

    def test_needs_check_is_low(self):
        self.assertEqual(level(any_needs_check=True), "Low")

    def test_reasons_always_given(self):
        for changes in ({}, {"site_match_values": ["medium"]}):
            self.assertTrue(evidence_confidence(**{**GOOD, **changes})[1])


if __name__ == "__main__":
    unittest.main()
