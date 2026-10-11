import unittest

from helpers import full_table, raw_row, rows, write_criteria
from src.risk_engine import assess_all, assess_reading, load_class_b_limits, rank_sites, score_site


class LimitTests(unittest.TestCase):
    def test_only_class_b_ph_do_bod_loaded(self):
        limits = load_class_b_limits(write_criteria())
        self.assertEqual(set(limits), {"pH", "Dissolved oxygen", "BOD"})
        self.assertEqual(limits["Dissolved oxygen"].low, 5.0)   # Class B, not Class A's 6
        self.assertEqual(limits["BOD"].high, 3.0)
        self.assertEqual((limits["pH"].low, limits["pH"].high), (6.5, 8.5))

    def test_limits_follow_the_csv(self):
        limits = load_class_b_limits(write_criteria(replace=("Dissolved oxygen", "4")))
        (r,) = rows(raw_row(value="4.5"))
        self.assertEqual(assess_reading(r, limits)[0], "within_limit")

    def test_missing_class_b_limit_raises(self):
        path = write_criteria()
        text = path.read_text(encoding="utf-8").replace("BOD (5 days 20C)", "Something else")
        path.write_text(text, encoding="utf-8")
        with self.assertRaises(ValueError):
            load_class_b_limits(path)


class AssessTests(unittest.TestCase):
    def setUp(self):
        self.limits = load_class_b_limits(write_criteria())

    def status(self, parameter, value):
        (r,) = rows(raw_row(parameter=parameter, value=value))
        return assess_reading(r, self.limits)

    def test_boundaries(self):
        cases = [("Dissolved oxygen", "5.0", "within_limit"), ("Dissolved oxygen", "4.99", "breach"),
                 ("BOD", "3.0", "within_limit"), ("BOD", "3.01", "breach"),
                 ("pH", "6.5", "within_limit"), ("pH", "8.5", "within_limit"),
                 ("pH", "6.49", "breach"), ("pH", "8.51", "breach")]
        for param, value, expected in cases:
            with self.subTest(param=param, value=value):
                self.assertEqual(self.status(param, value)[0], expected)

    def test_do_zero_has_full_severity(self):
        self.assertEqual(self.status("Dissolved oxygen", "0")[2], 1.0)

    def test_bod_severity_capped(self):
        self.assertEqual(self.status("BOD", "100")[2], 3.0)

    def test_missing_is_never_within_limit(self):
        for flag, printed in [("not sampled", ""), ("not sampled", "_"), ("*", "*"), ("**", "**")]:
            (r,) = rows(raw_row(value="", flag=flag, value_as_printed=printed))
            self.assertEqual(assess_reading(r, self.limits)[0], "missing")

    def test_other_parameters_have_no_limit(self):
        for p in ("COD", "Lead", "Chromium", "Conductivity", "Turbidity"):
            self.assertEqual(self.status(p, "999")[0], "no_class_b_limit")

    def test_censored_do_and_bod_are_uncertain(self):
        for p in ("Dissolved oxygen", "BOD"):
            for code in ("BDL", "ND"):
                (r,) = rows(raw_row(parameter=p, value="", flag=code, value_as_printed=code))
                status, _, sev = assess_reading(r, self.limits)
                self.assertEqual(status, "censored_uncertain")
                self.assertIsNone(sev)

    def test_assess_keeps_original_columns(self):
        (r,) = assess_all(rows(raw_row(source_page="28", site_match_confidence="medium")), self.limits)
        self.assertEqual((r["source_page"], r["site_match_confidence"]), ("28", "medium"))


class ScoreTests(unittest.TestCase):
    def setUp(self):
        self.limits = load_class_b_limits(write_criteria())

    def score(self, raws):
        return score_site(assess_all(rows(*raws), self.limits))

    def test_no_usable_readings_is_insufficient_not_low(self):
        res = self.score(full_table(values={(ph, p): "" for ph in ("pre", "during", "after")
                                            for p in ("pH", "Dissolved oxygen", "BOD")}))
        self.assertEqual(res["risk_tier"], "Insufficient data")
        self.assertIsNone(res["risk_score"])

    def test_only_censored_is_insufficient(self):
        raws = [raw_row(phase=ph, parameter=p, value="", flag="BDL", value_as_printed="BDL")
                for ph in ("pre", "during") for p in ("Dissolved oxygen", "BOD")]
        res = self.score(raws)
        self.assertEqual(res["risk_tier"], "Insufficient data")
        self.assertEqual(res["censored_readings"], 4)

    def test_only_old_data_is_insufficient(self):
        res = self.score(full_table(year="2023"))
        self.assertEqual(res["risk_tier"], "Insufficient data")

    # Regression (issue 1): pH alone must not produce "Low".
    def test_ph_only_recent_is_insufficient_not_low(self):
        res = self.score(full_table(values={(ph, p): "" for ph in ("pre", "during", "after")
                                            for p in ("Dissolved oxygen", "BOD")}))
        self.assertEqual(res["risk_tier"], "Insufficient data")
        self.assertIn("pH alone cannot show low risk", " ".join(res["risk_reasons"]))

    def test_ph_only_with_censored_do_bod_is_insufficient_not_low(self):
        raws = [r for r in full_table() if r["parameter"] == "pH"]
        raws += [raw_row(phase=ph, parameter=p, value="", flag=code, value_as_printed=code)
                 for ph, code in (("pre", "BDL"), ("during", "ND"), ("after", "BDL"))
                 for p in ("Dissolved oxygen", "BOD")]
        res = self.score(raws)
        self.assertEqual(res["risk_tier"], "Insufficient data")
        self.assertEqual(res["censored_readings"], 6)

    def test_recent_ph_breach_without_do_bod_is_still_medium(self):
        res = self.score(full_table(values={("during", "pH"): "9.0",
                                            **{(ph, p): "" for ph in ("pre", "during", "after")
                                               for p in ("Dissolved oxygen", "BOD")}}))
        self.assertEqual(res["risk_tier"], "Medium")

    # Regression (issue 2): High rules use only 2024-2025 evidence.
    def test_only_old_data_with_high_bod_is_insufficient(self):
        res = self.score(full_table(year="2023", values={("during", "BOD"): "10"}))
        self.assertEqual(res["risk_tier"], "Insufficient data")

    def test_old_high_bod_not_used_as_latest_season(self):
        raws = (full_table(year="2023", values={("during", "BOD"): "10"})
                + [r for r in full_table() if r["parameter"] != "BOD"])
        res = self.score(raws)
        self.assertNotIn("latest season", " ".join(res["risk_reasons"]))
        self.assertEqual(res["risk_tier"], "Low")

    def test_clean_recent_is_low_with_caveat(self):
        res = self.score(full_table())
        self.assertEqual(res["risk_tier"], "Low")
        self.assertIn("not a statement that the water is safe", " ".join(res["risk_reasons"]))

    def test_do_zero_is_high_with_page(self):
        res = self.score(full_table(values={("during", "Dissolved oxygen"): "0"}))
        self.assertEqual(res["risk_tier"], "High")
        self.assertIn("page 12", res["risk_reasons"][0])

    def test_small_breach_is_medium(self):
        res = self.score(full_table(values={("during", "BOD"): "3.5"}))
        self.assertEqual(res["risk_tier"], "Medium")

    def test_missing_rows_do_not_change_score(self):
        base = full_table(values={("during", "BOD"): "5.0"})
        with_gaps = base + full_table(festival="Durga", values={(ph, p): "" for ph in ("pre", "during", "after")
                                                                for p in ("pH", "Dissolved oxygen", "BOD")})
        self.assertEqual(self.score(base)["risk_score"], self.score(with_gaps)["risk_score"])

    def test_censored_rows_do_not_change_score(self):
        base = full_table(values={("during", "BOD"): "5.0"})
        extra = [raw_row(festival="Durga", parameter="BOD", value="", flag="BDL", value_as_printed="BDL")]
        self.assertEqual(self.score(base)["risk_score"], self.score(base + extra)["risk_score"])

    def test_recent_breach_outweighs_old(self):
        recent = full_table(values={("during", "BOD"): "5.0"}) + full_table(year="2023")
        old = full_table() + full_table(year="2023", values={("during", "BOD"): "5.0"})
        self.assertGreater(self.score(recent)["risk_score"], self.score(old)["risk_score"])

    def test_rank_puts_insufficient_last_without_rank(self):
        raws = (full_table(site="A", values={("during", "Dissolved oxygen"): "0"})
                + full_table(site="B")
                + full_table(site="C", values={(ph, p): "" for ph in ("pre", "during", "after")
                                               for p in ("pH", "Dissolved oxygen", "BOD")}))
        ranked = rank_sites(assess_all(rows(*raws), self.limits), ["C", "B", "A"])
        self.assertEqual([s["site"] for s in ranked], ["A", "B", "C"])
        self.assertEqual([s["rank"] for s in ranked], [1, 2, None])


if __name__ == "__main__":
    unittest.main()
