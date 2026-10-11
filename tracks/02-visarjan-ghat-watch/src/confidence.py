"""Evidence confidence for each ghat, kept separate from risk.

Confidence says how much weight the evidence behind a ghat's rank can bear.
It never changes the risk score or rank. Inputs are site-match quality,
completeness, recency of sampling, the number of Class B readings and how well
the source file was checked.
"""

from . import config


def evidence_confidence(site_match_values, class_b_completeness, class_b_taken,
                        seasons_missing_latest_year, dataset_verification,
                        any_needs_check=False):
    """Return (level, reasons). Level is High, Medium or Low."""
    levels = config.CONFIDENCE_LEVELS
    level = levels.index("High")
    cap = level
    reasons = []

    def drop(why):
        nonlocal level
        level = max(level - 1, 0)
        reasons.append(why)

    def limit_to(name, why):
        nonlocal cap
        cap = min(cap, levels.index(name))
        reasons.append(why)

    matches = set(site_match_values)
    if "low" in matches:
        limit_to("Low", "Site name match is low: readings may belong to a different place.")
    elif "medium" in matches:
        limit_to("Medium", "Site name match is medium: the report names may refer to two different places.")

    if class_b_completeness is None or class_b_completeness < config.COMPLETENESS_LOW:
        limit_to("Low", f"Only {_pct(class_b_completeness)} of expected pH/DO/BOD readings are available.")
    elif class_b_completeness < config.COMPLETENESS_OK:
        drop(f"{_pct(class_b_completeness)} of expected pH/DO/BOD readings are available.")

    if seasons_missing_latest_year:
        drop(f"No pH/DO/BOD readings for {', '.join(seasons_missing_latest_year)} "
             f"(latest year {config.YEARS[-1]}).")

    if class_b_taken < config.MIN_CLASS_B_READINGS_FOR_HIGH:
        limit_to("Medium", f"Only {class_b_taken} pH/DO/BOD readings were taken.")

    if any_needs_check:
        limit_to("Low", "Some site names could not be read in the report (needs_check).")
    if dataset_verification != "spot_checked":
        limit_to("Medium", "Source file was not checked against the PDFs table by table.")

    final = levels[min(level, cap)]
    if not reasons:
        reasons.append("High site-name match, near-complete pH/DO/BOD readings including the "
                       "latest year, from a file spot-checked against the PDFs.")
    return final, reasons


def _pct(x):
    return "0%" if x is None else f"{x:.0%}"


def site_confidence(rows, site, completeness_summary, dataset_kind):
    """Gather inputs for one site from its rows and completeness summary."""
    site_rows = [r for r in rows if r["site"] == site]
    latest = config.YEARS[-1]
    missing_latest = [f"{f} {latest}" for f in config.FESTIVALS
                      if completeness_summary["by_season"][f"{f} {latest}"]["class_b_taken"] == 0]
    return evidence_confidence(
        site_match_values=[r.get("site_match_confidence", "") for r in site_rows],
        class_b_completeness=completeness_summary["class_b_completeness"],
        class_b_taken=completeness_summary["class_b_taken"],
        seasons_missing_latest_year=missing_latest,
        dataset_verification=config.DATASET_VERIFICATION.get(dataset_kind, "not_checked"),
        any_needs_check=any(r.get("needs_check", "").strip() for r in site_rows),
    )
