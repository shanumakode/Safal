import unittest

from helpers import raw_row, rows, write_csv
from src.load_data import BHOPAL_COLUMNS, STATEWIDE_COLUMNS, classify_status, load_csv, validate


class StatusTests(unittest.TestCase):
    def test_bdl_is_not_zero_and_not_missing(self):
        (r,) = rows(raw_row(parameter="Lead", value="", flag="BDL", value_as_printed="BDL"))
        self.assertEqual(r["reading_status"], "below_detection")
        self.assertIsNone(r["value_num"])
        self.assertNotEqual(r["value_num"], 0.0)

    def test_nd_is_not_zero(self):
        (r,) = rows(raw_row(parameter="Lead", value="", flag="ND", value_as_printed="ND"))
        self.assertEqual(r["reading_status"], "not_detected")
        self.assertIsNone(r["value_num"])

    def test_missing_codes_are_not_sampled(self):
        for flag, printed in [("not sampled", ""), ("not sampled", "_"), ("not sampled", "-"),
                              ("*", "*"), ("**", "**"), ("", "")]:
            with self.subTest(flag=flag, printed=printed):
                self.assertEqual(classify_status("", flag, printed)[0], "not_sampled")

    def test_dry_and_na_are_not_available(self):
        for code in ("DRY", "NA", "na"):
            self.assertEqual(classify_status("", code, code)[0], "not_available")

    def test_unknown_code_is_flagged(self):
        self.assertEqual(classify_status("", "XYZ", "XYZ")[0], "unknown")

    def test_real_zero_is_measured(self):
        (r,) = rows(raw_row(value="0.0", value_as_printed="0"))
        self.assertEqual(r["reading_status"], "measured")
        self.assertEqual(r["value_num"], 0.0)

    def test_original_columns_untouched(self):
        raw = raw_row(value="", flag="BDL", value_as_printed="BDL", parameter="Lead",
                      source_page="61", site_match_confidence="medium")
        (r,) = rows(dict(raw))
        for col in BHOPAL_COLUMNS:
            self.assertEqual(r[col], raw[col])


class ValidationTests(unittest.TestCase):
    def _issues(self, *raws):
        return validate(list(raws), BHOPAL_COLUMNS, "bhopal")

    def test_clean_row_has_no_issues(self):
        self.assertEqual(self._issues(raw_row()), [])

    def test_value_with_flag_is_error(self):
        issues = self._issues(raw_row(value="2.0", flag="BDL"))
        self.assertTrue(any(i.level == "error" for i in issues))

    def test_non_numeric_value_is_error(self):
        issues = self._issues(raw_row(value="abc"))
        self.assertTrue(any("not a number" in i.message for i in issues))

    def test_blank_value_without_flag_is_warning(self):
        issues = self._issues(raw_row(value="", value_as_printed=""))
        self.assertEqual([i.level for i in issues], ["warning"])

    def test_empty_source_page_is_error(self):
        issues = self._issues(raw_row(source_page=""))
        self.assertTrue(any("source_page" in i.message for i in issues))

    def test_duplicate_key_is_error(self):
        issues = self._issues(raw_row(), raw_row())
        self.assertTrue(any("share key" in i.message for i in issues))

    def test_bdl_ph_is_warning(self):
        issues = self._issues(raw_row(parameter="pH", value="", flag="BDL", value_as_printed="BDL"))
        self.assertTrue(any("pH" in i.message for i in issues))

    def test_missing_column_is_error(self):
        issues = validate([], BHOPAL_COLUMNS[:-1], "bhopal")
        self.assertEqual(issues[0].level, "error")


class LoadCsvTests(unittest.TestCase):
    def test_load_detects_bhopal_and_keeps_micro_sign(self):
        path = write_csv([raw_row(parameter="Conductivity", unit_assumed="µS/cm", value="512")])
        ds = load_csv(path)
        self.assertEqual(ds.kind, "bhopal")
        self.assertEqual(ds.rows[0]["unit_assumed"], "µS/cm")

    def test_load_recognises_statewide_codes(self):
        base = {c: "" for c in STATEWIDE_COLUMNS}
        base.update(year="2024", festival="Durga", regional_office="R.O. Test", phase="pre",
                    parameter="BOD", site_as_printed="Somewhere", source_page="5")
        raws = [dict(base, flag="ND", value_as_printed="ND", phase="pre"),
                dict(base, flag="DRY", value_as_printed="DRY", phase="during"),
                dict(base, flag="NA", value_as_printed="NA", phase="after")]
        ds = load_csv(write_csv(raws, columns=STATEWIDE_COLUMNS))
        self.assertEqual(ds.kind, "statewide")
        self.assertEqual([r["reading_status"] for r in ds.rows],
                         ["not_detected", "not_available", "not_available"])


if __name__ == "__main__":
    unittest.main()
