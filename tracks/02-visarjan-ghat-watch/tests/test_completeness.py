import unittest

from helpers import full_table, raw_row, rows
from src import config
from src.completeness import site_completeness


class CompletenessTests(unittest.TestCase):
    def all_tables(self, site="S", skip=(), values=None):
        raws = []
        for year in config.YEARS:
            for fest in config.FESTIVALS:
                if (year, fest) not in skip:
                    raws += full_table(site=site, year=year, festival=fest, values=values)
        return raws

    def test_full_class_b_grid_is_complete(self):
        summary, gaps = site_completeness(rows(*self.all_tables()), "S")
        self.assertEqual((summary["class_b_taken"], summary["class_b_expected"]), (54, 54))
        self.assertEqual([g for g in gaps if g["is_class_b"] == "yes"], [])

    def test_absent_table_creates_gaps_without_fabricated_readings(self):
        data = rows(*self.all_tables(skip={("2025", "Durga")}))
        summary, gaps = site_completeness(data, "S")
        absent = [g for g in gaps if g["gap_reason"] == "table_absent" and g["is_class_b"] == "yes"]
        self.assertEqual(len(absent), 9)
        self.assertEqual(summary["class_b_taken"], 45)
        self.assertEqual(summary["class_b_expected"], 54)
        self.assertEqual(summary["absent_tables"], ["Durga 2025"])
        for g in absent:
            self.assertEqual((g["source_page"], g["value_as_printed"]), ("", ""))
        self.assertEqual(len(data), 45)  # source rows were not padded

    def test_censored_counts_as_taken(self):
        raws = self.all_tables()
        for r in raws:
            if r["parameter"] == "BOD":
                r.update(value="", flag="BDL", value_as_printed="BDL")
        summary, _ = site_completeness(rows(*raws), "S")
        self.assertEqual(summary["class_b_taken"], 54)

    def test_not_sampled_is_a_gap(self):
        raws = self.all_tables(values={("pre", "BOD"): "_"})
        summary, gaps = site_completeness(rows(*raws), "S")
        self.assertEqual(summary["class_b_taken"], 48)
        self.assertTrue(all(g["gap_reason"] == "not_sampled" and g["source_page"] == "12" for g in gaps
                            if g["is_class_b"] == "yes"))

    def test_optional_parameter_only_expected_where_reported(self):
        raws = self.all_tables()
        raws.append(raw_row(site="S", year="2024", festival="Ganesh", phase="pre",
                            parameter="Suspended solids", value="10"))
        summary, gaps = site_completeness(rows(*raws), "S")
        ss_gaps = [g for g in gaps if g["parameter"] == "Suspended solids"]
        self.assertEqual({(g["year"], g["festival"]) for g in ss_gaps}, {("2024", "Ganesh")})
        self.assertEqual(len(ss_gaps), 2)  # during/after rows missing in that table only


if __name__ == "__main__":
    unittest.main()
