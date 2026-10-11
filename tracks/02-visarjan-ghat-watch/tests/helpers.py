"""Small builders for hand-made test rows and criteria files."""

import csv
import tempfile
from pathlib import Path

from src.load_data import BHOPAL_COLUMNS, normalise

CRITERIA_HEADER = ["class", "designated_best_use", "parameter", "limit_type", "limit", "unit"]
CLASS_B_ROWS = [
    ["A", "Drinking", "pH", "range", "6.5-8.5", ""],
    ["A", "Drinking", "Dissolved oxygen", "min", "6", "mg/l"],
    ["B", "Outdoor bathing (organised)", "Total coliform", "max", "500", "MPN/100 ml"],
    ["B", "Outdoor bathing (organised)", "pH", "range", "6.5-8.5", ""],
    ["B", "Outdoor bathing (organised)", "Dissolved oxygen", "min", "5", "mg/l"],
    ["B", "Outdoor bathing (organised)", "BOD (5 days 20C)", "max", "3", "mg/l"],
    ["E", "Irrigation", "Electrical conductivity at 25C", "max", "2250", "micromhos/cm"],
]


def raw_row(**overrides):
    row = {
        "year": "2025", "festival": "Ganesh", "site": "Test ghat", "water_body": "Test Lake",
        "phase": "during", "parameter": "Dissolved oxygen", "value": "6.0",
        "unit_assumed": "mg/l", "flag": "", "value_as_printed": "6", "parameter_as_printed": "D.O.",
        "site_as_printed": "Test Visarjan Ghat, Bhopal", "site_match_confidence": "high",
        "source_page": "12",
    }
    row.update(overrides)
    if "value" in overrides and "value_as_printed" not in overrides:
        row["value_as_printed"] = overrides["value"]
    return row


def rows(*raws):
    return normalise(list(raws))


def write_csv(rows_, columns=BHOPAL_COLUMNS, directory=None):
    directory = Path(directory or tempfile.mkdtemp())
    path = directory / "input.csv"
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns)
        w.writeheader()
        w.writerows(rows_)
    return path


def write_criteria(extra_rows=(), replace=None, directory=None):
    directory = Path(directory or tempfile.mkdtemp())
    path = directory / "criteria.csv"
    data = [list(r) for r in CLASS_B_ROWS]
    if replace:
        for r in data:
            if r[0] == "B" and r[2] == replace[0]:
                r[4] = replace[1]
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(CRITERIA_HEADER)
        w.writerows(data + list(extra_rows))
    return path


def full_table(site="Test ghat", year="2025", festival="Ganesh", values=None, **extra):
    """All 3 phases x 3 Class B parameters for one table. values: {(phase, param): value}."""
    defaults = {"pH": "7.5", "Dissolved oxygen": "6.0", "BOD": "2.0"}
    values = values or {}
    out = []
    for phase in ("pre", "during", "after"):
        for param, v in defaults.items():
            v = values.get((phase, param), v)
            flag = "" if _is_num(v) else ("not sampled" if v in ("", "_", "-") else v)
            out.append(raw_row(site=site, year=year, festival=festival, phase=phase,
                               parameter=param, value=v if _is_num(v) else "", flag=flag,
                               value_as_printed=v, **extra))
    return out


def _is_num(v):
    try:
        float(v)
        return True
    except ValueError:
        return False
