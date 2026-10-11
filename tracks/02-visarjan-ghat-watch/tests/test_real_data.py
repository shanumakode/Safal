"""Checks against the real Bhopal data and the headline numbers in PROBLEM.md."""

import csv
import tempfile
import unittest
from pathlib import Path

from src import config
from src.load_data import BHOPAL_COLUMNS, load_csv
from src.risk_engine import assess_all, load_class_b_limits, rank_sites
from src.run_pipeline import build, write_outputs

BAIRAGARH = "Bairagarh (Sant Hirdaram) kund"
MALIKHEDI = "Malikhedi kund"
RANI = "Rani Kamlapati ghat / Kamla Park kund"


class RealDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = build(config.BHOPAL_CSV, config.CRITERIA_CSV)
        cls.ds = cls.result["dataset"]
        cls.assessed = cls.result["assessed"]
        cls.by_site = {s["site"]: s for s in cls.result["ranking"]}

    def measured(self, parameter):
        return [r for r in self.assessed if r["parameter"] == parameter and r["reading_status"] == "measured"]

    def test_no_validation_errors(self):
        self.assertEqual(self.ds.errors, [])
        self.assertEqual(len(self.ds.rows), 1524)

    def test_headline_do_count(self):
        do = self.measured("Dissolved oxygen")
        self.assertEqual((sum(r["class_b_status"] == "breach" for r in do), len(do)), (42, 116))

    def test_headline_bod_count(self):
        bod = self.measured("BOD")
        self.assertEqual((sum(r["class_b_status"] == "breach" for r in bod), len(bod)), (100, 112))

    def test_ph_outside_range_count(self):
        ph = self.measured("pH")
        self.assertEqual((sum(r["class_b_status"] == "breach" for r in ph), len(ph)), (6, 115))

    def test_four_zero_do_readings_all_at_bairagarh(self):
        zeros = [r for r in self.measured("Dissolved oxygen") if r["value_num"] == 0.0]
        self.assertEqual(len(zeros), 4)
        self.assertEqual({r["site"] for r in zeros}, {BAIRAGARH})

    def test_missing_class_b_readings_are_missing_not_safe(self):
        missing = [r for r in self.assessed if r["class_b_status"] == "missing"]
        self.assertEqual(len(missing), 17)
        self.assertTrue(all(r["value_num"] is None for r in missing))

    def test_bdl_metals_kept_as_bdl(self):
        bdl = [r for r in self.assessed if r["flag"] == "BDL"]
        self.assertEqual(len(bdl), 174)
        self.assertTrue(all(r["reading_status"] == "below_detection" and r["value_num"] is None for r in bdl))
        self.assertTrue(all(r["class_b_status"] == "no_class_b_limit" for r in bdl))

    def test_all_seven_ghats_ranked_with_traceable_reasons(self):
        self.assertEqual(len(self.result["ranking"]), 7)
        for s in self.result["ranking"]:
            self.assertIsNotNone(s["rank"])
            self.assertIn("page", s["risk_reasons"][0])

    def test_absent_durga_2025_tables_in_completeness(self):
        for site in (BAIRAGARH, MALIKHEDI):
            s = self.by_site[site]
            self.assertEqual(s["absent_tables"], ["Durga 2025"])
            self.assertEqual((s["class_b_taken"], s["class_b_expected"]), (39, 54))
            gaps = [g for g in self.result["gaps"] if g["site"] == site
                    and g["gap_reason"] == "table_absent" and g["is_class_b"] == "yes"]
            self.assertEqual(len(gaps), 9)
            self.assertTrue(all(g["source_page"] == "" for g in gaps))

    def test_rani_kamlapati_confidence_not_above_medium(self):
        self.assertIn(self.by_site[RANI]["confidence_level"], ("Low", "Medium"))

    def test_risk_independent_of_confidence_inputs(self):
        changed = [dict(r, site_match_confidence="low") for r in self.ds.rows]
        limits = load_class_b_limits(config.CRITERIA_CSV)
        sites = list(self.by_site)
        again = {s["site"]: s for s in rank_sites(assess_all(changed, limits), sites)}
        for site, s in self.by_site.items():
            self.assertEqual((s["risk_score"], s["risk_tier"], s["rank"]),
                             (again[site]["risk_score"], again[site]["risk_tier"], again[site]["rank"]))

    def test_sample_file_matches_2025_slice(self):
        sample = build(config.SAMPLE_CSV, config.CRITERIA_CSV)["assessed"]
        full_2025 = [r for r in self.assessed if r["year"] == "2025"]
        self.assertEqual([(r["class_b_status"], r["severity"]) for r in sample],
                         [(r["class_b_status"], r["severity"]) for r in full_2025])


class OutputFileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name)
        write_outputs(build(config.BHOPAL_CSV, config.CRITERIA_CSV), cls.out)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def read(self, name):
        with open(self.out / name, encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))

    def test_processed_file_preserves_every_source_row_and_column(self):
        with open(config.BHOPAL_CSV, encoding="utf-8-sig", newline="") as f:
            source = list(csv.DictReader(f))
        processed = self.read("readings_processed.csv")
        self.assertEqual(len(processed), len(source))
        for src_row, out_row in zip(source, processed):
            self.assertEqual({c: out_row[c] for c in BHOPAL_COLUMNS}, src_row)

    def test_breach_evidence_has_pages(self):
        rows = self.read("breach_evidence.csv")
        self.assertEqual(len(rows), 148)
        self.assertTrue(all(r["source_page"] and r["site_match_confidence"] for r in rows))

    def test_ranking_files_carry_notes(self):
        ranking = self.read("ghat_ranking.csv")
        self.assertEqual(len(ranking), 7)
        text = (self.out / "ghat_ranking.json").read_text(encoding="utf-8")
        self.assertIn("not an official CPCB", text)
        self.assertIn("censored", text)

    # Regression (issue 3): the CSV an officer opens must carry the disclaimer.
    def test_ranking_csv_has_method_note_on_every_row(self):
        ranking = self.read("ghat_ranking.csv")
        self.assertTrue(all(r["method_note"] == config.HEURISTIC_NOTE for r in ranking))
        self.assertIn("not an official CPCB", ranking[0]["method_note"])


if __name__ == "__main__":
    unittest.main()
