"""Run the GhatWatch Bhopal pipeline and write files to outputs/.

Usage (from the track folder):
    python -m src.run_pipeline
    python -m src.run_pipeline --input data/sample_bhopal_2025.csv --output outputs_sample
"""

import argparse
import csv
import json
import sys
from pathlib import Path

from . import config
from .completeness import GAP_COLUMNS, all_sites_completeness
from .confidence import site_confidence
from .load_data import DERIVED_COLUMNS, load_csv
from .risk_engine import assess_all, load_class_b_limits, rank_sites

ASSESS_COLUMNS = ["class_b_status", "limit_applied", "severity", "source_report"]
EVIDENCE_COLUMNS = ["site", "year", "festival", "phase", "parameter", "value", "unit_assumed",
                    "limit_applied", "severity", "weight", "value_as_printed", "site_as_printed",
                    "site_match_confidence", "source_report", "source_page"]
RANKING_COLUMNS = ["rank", "site", "water_body", "risk_tier", "risk_score", "risk_reasons",
                   "confirmed_breaches", "class_b_measured", "censored_readings",
                   "worst_recent_do", "max_recent_bod", "trend_label",
                   "class_b_completeness", "class_b_taken", "class_b_expected",
                   "all_param_completeness", "class_b_gap_count", "absent_tables",
                   "confidence_level", "confidence_reasons", "site_match_confidence",
                   "method_note"]


def _fmt(v):
    if v is None:
        return ""
    if isinstance(v, float):
        return f"{v:g}"
    return v


def write_csv(path, columns, rows):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({c: _fmt(r.get(c)) for c in columns})


def build(input_path=config.BHOPAL_CSV, criteria_path=config.CRITERIA_CSV):
    """Run every stage and return a dict of results (no files written)."""
    ds = load_csv(input_path)
    if ds.kind != "bhopal":
        raise SystemExit("Ranking is only produced for the Bhopal dataset for now.")
    limits = load_class_b_limits(criteria_path)
    assessed = assess_all(ds.rows, limits)

    sites = list(dict.fromkeys(r["site"] for r in ds.rows))
    ranking = rank_sites(assessed, sites)
    completeness, gaps = all_sites_completeness(ds.rows, sites)

    for s in ranking:
        site_rows = [r for r in ds.rows if r["site"] == s["site"]]
        comp = completeness[s["site"]]
        level, reasons = site_confidence(ds.rows, s["site"], comp, ds.kind)
        s.update({k: v for k, v in comp.items() if k != "by_season"})
        s["completeness_by_season"] = comp["by_season"]
        s["confidence_level"] = level
        s["confidence_reasons"] = reasons
        s["water_body"] = site_rows[0]["water_body"] if site_rows else ""
        s["site_match_confidence"] = "/".join(sorted({r["site_match_confidence"] for r in site_rows}))

    return {"dataset": ds, "limits": limits, "assessed": assessed, "ranking": ranking, "gaps": gaps}


def write_outputs(result, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    ds = result["dataset"]

    write_csv(out_dir / "readings_processed.csv", ds.fieldnames + DERIVED_COLUMNS + ASSESS_COLUMNS,
              result["assessed"])
    write_csv(out_dir / "breach_evidence.csv", EVIDENCE_COLUMNS,
              [r for r in result["assessed"] if r["class_b_status"] == "breach"])
    write_csv(out_dir / "censored_readings.csv", EVIDENCE_COLUMNS[:7] + ["value_as_printed", "source_page"],
              [r for r in result["assessed"] if r["class_b_status"] == "censored_uncertain"])
    write_csv(out_dir / "expected_gaps.csv", GAP_COLUMNS, result["gaps"])

    flat = []
    for s in result["ranking"]:
        row = dict(s)
        row["risk_reasons"] = " | ".join(s["risk_reasons"])
        row["confidence_reasons"] = " | ".join(s["confidence_reasons"])
        row["absent_tables"] = "; ".join(s["absent_tables"])
        row["method_note"] = config.HEURISTIC_NOTE
        flat.append(row)
    write_csv(out_dir / "ghat_ranking.csv", RANKING_COLUMNS, flat)

    payload = {
        "notes": {"heuristic": config.HEURISTIC_NOTE, "censored": config.CENSORED_NOTE,
                  "missing": config.MISSING_NOTE},
        "class_b_limits": {p: {"criteria_parameter": l.criteria_parameter, "limit": l.describe()}
                           for p, l in result["limits"].items()},
        "weights": {"year": config.YEAR_WEIGHTS, "festival": config.FESTIVAL_WEIGHTS,
                    "phase": config.PHASE_WEIGHTS},
        "ranking": result["ranking"],
    }
    with open(out_dir / "ghat_ranking.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    with open(out_dir / "validation_report.txt", "w", encoding="utf-8") as f:
        f.write(f"Source: {ds.kind} dataset, {len(ds.rows)} rows\n")
        f.write(f"Errors: {len(ds.errors)}  Warnings: {len(ds.issues) - len(ds.errors)}\n\n")
        for issue in ds.issues:
            f.write(f"{issue}\n")
        f.write("\nNotes\n-----\n")
        for note in (config.HEURISTIC_NOTE, config.CENSORED_NOTE, config.MISSING_NOTE):
            f.write(f"- {note}\n")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--input", default=str(config.BHOPAL_CSV))
    p.add_argument("--criteria", default=str(config.CRITERIA_CSV))
    p.add_argument("--output", default=str(config.OUTPUT_DIR))
    args = p.parse_args(argv)

    result = build(args.input, args.criteria)
    write_outputs(result, args.output)

    print(f"Rows: {len(result['dataset'].rows)}  Validation errors: {len(result['dataset'].errors)}")
    print(f"{'Rank':<5}{'Ghat':<40}{'Tier':<19}{'Score':<8}{'Class B compl.':<16}Confidence")
    for s in result["ranking"]:
        score = "" if s["risk_score"] is None else f"{s['risk_score']:.3f}"
        print(f"{s['rank'] or '-':<5}{s['site']:<40}{s['risk_tier']:<19}{score:<8}"
              f"{s['class_b_taken']}/{s['class_b_expected']:<13}{s['confidence_level']}")
    print(f"\nOutputs written to {args.output}")
    print("Note: risk tiers are project-defined heuristics, not an official CPCB classification.")
    return 1 if result["dataset"].errors else 0


if __name__ == "__main__":
    sys.exit(main())
