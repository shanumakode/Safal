"""Load, validate and normalise the immersion CSVs.

Every original column is kept verbatim as a string. Derived fields are added
alongside: ``value_num`` (float or None), ``reading_status`` and
``status_note``. BDL/ND never become 0 and blanks never become clean.
"""

import csv
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from . import config

BHOPAL_COLUMNS = [
    "year", "festival", "site", "water_body", "phase", "parameter", "value",
    "unit_assumed", "flag", "value_as_printed", "parameter_as_printed",
    "site_as_printed", "site_match_confidence", "source_page",
]
STATEWIDE_COLUMNS = [
    "year", "festival", "regional_office", "phase", "parameter", "value",
    "unit_assumed", "flag", "value_as_printed", "parameter_as_printed",
    "site_as_printed", "needs_check", "source_page",
]
DERIVED_COLUMNS = ["value_num", "reading_status", "status_note"]


@dataclass
class Issue:
    level: str        # "error" or "warning"
    row_number: int   # 1-based data row (header excluded); 0 = whole file
    message: str

    def __str__(self):
        where = f"row {self.row_number}" if self.row_number else "file"
        return f"[{self.level.upper()}] {where}: {self.message}"


def parse_number(text):
    """Return a float for a numeric string, else None. Never invents 0."""
    text = (text or "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def classify_status(value, flag, value_as_printed):
    """Return (reading_status, note) for one reading."""
    if parse_number(value) is not None:
        return "measured", ""
    flag = (flag or "").strip()
    printed = (value_as_printed or "").strip()
    for code in (flag, printed):
        if code and code in config.STATUS_CODES:
            status = config.STATUS_CODES[code]
            return status, _status_note(status, code)
    if not flag and not printed:
        return "not_sampled", "blank in report"
    return "unknown", f"unrecognised code {flag or printed!r}"


def _status_note(status, code):
    if status == "below_detection":
        return "below detection limit (not zero, not missing)"
    if status == "not_detected":
        return "not detected (not zero, not missing)"
    if status == "not_available":
        return "dry" if code == "DRY" else f"not available ({code})"
    if code in ("*", "**"):
        return f"not sampled at this stage ({code})"
    if code in ("_", "-"):
        return f"not sampled ({code} in report)"
    return "not sampled"


def detect_dataset(fieldnames):
    if "site" in fieldnames:
        return "bhopal"
    if "regional_office" in fieldnames:
        return "statewide"
    raise ValueError("Unrecognised CSV: needs a 'site' or 'regional_office' column")


def normalise(raw_rows):
    """Add derived fields to copies of the raw rows. Originals stay untouched."""
    out = []
    for raw in raw_rows:
        row = dict(raw)
        status, note = classify_status(raw.get("value"), raw.get("flag"),
                                       raw.get("value_as_printed"))
        row["value_num"] = parse_number(raw.get("value")) if status == "measured" else None
        row["reading_status"] = status
        row["status_note"] = note
        out.append(row)
    return out


def validate(raw_rows, fieldnames, dataset):
    """Check the raw rows. Problems are reported, never silently fixed."""
    issues = []
    required = BHOPAL_COLUMNS if dataset == "bhopal" else STATEWIDE_COLUMNS
    missing_cols = [c for c in required if c not in fieldnames]
    if missing_cols:
        issues.append(Issue("error", 0, f"missing columns: {missing_cols}"))
        return issues
    clash = [c for c in DERIVED_COLUMNS if c in fieldnames]
    if clash:
        issues.append(Issue("error", 0, f"source already has derived columns: {clash}"))

    keys = Counter()
    for i, r in enumerate(raw_rows, start=1):
        if r["year"] not in config.YEARS:
            issues.append(Issue("warning", i, f"unexpected year {r['year']!r}"))
        if r["festival"] not in config.FESTIVALS:
            issues.append(Issue("error", i, f"unexpected festival {r['festival']!r}"))
        if r["phase"] not in config.PHASES:
            issues.append(Issue("error", i, f"unexpected phase {r['phase']!r}"))
        if dataset == "bhopal" and r["site_match_confidence"] not in ("high", "medium", "low"):
            issues.append(Issue("error", i, "site_match_confidence must be high/medium/low"))
        if not r["source_page"].strip():
            issues.append(Issue("error", i, "source_page is empty"))

        value, flag = r["value"].strip(), r["flag"].strip()
        if value:
            if parse_number(value) is None:
                issues.append(Issue("error", i, f"value {value!r} is not a number"))
            if flag:
                issues.append(Issue("error", i, f"value {value!r} has flag {flag!r}"))
        else:
            status, note = classify_status(value, flag, r["value_as_printed"])
            if not flag:
                issues.append(Issue("warning", i, "empty value with no flag (treated as not sampled)"))
            if status == "unknown":
                issues.append(Issue("warning", i, note))
            if status in config.CENSORED_STATUSES and r["parameter"] == "pH":
                issues.append(Issue("warning", i, f"pH reported as {flag}, which is not meaningful"))

        site_key = r["site"] if dataset == "bhopal" else r["site_as_printed"]
        keys[(r["year"], r["festival"], site_key, r["phase"], r["parameter"],
              r["source_page"] if dataset == "statewide" else "")] += 1

    for key, n in keys.items():
        if n > 1:
            issues.append(Issue("error" if dataset == "bhopal" else "warning", 0,
                                f"{n} rows share key {key}"))
    return issues


@dataclass
class Dataset:
    kind: str
    fieldnames: list
    rows: list      # normalised rows
    issues: list

    @property
    def errors(self):
        return [i for i in self.issues if i.level == "error"]


def load_csv(path):
    path = Path(path)
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        raw_rows = list(reader)
    kind = detect_dataset(fieldnames)
    issues = validate(raw_rows, fieldnames, kind)
    return Dataset(kind, fieldnames, normalise(raw_rows), issues)
