"""CPCB Class B comparison and risk priority for Bhopal ghats.

Limits come only from the criteria CSV (Class B pH, dissolved oxygen, BOD).
The risk score and tiers are project-defined prioritisation heuristics, not an
official CPCB classification (see config.HEURISTIC_NOTE).

Risk uses only *measured* Class B readings. Missing readings and censored
BDL/ND readings never enter the score, so data gaps can neither raise nor
lower a ghat's risk. Completeness and confidence are computed elsewhere.
"""

import csv
from dataclasses import dataclass
from statistics import median

from . import config


@dataclass(frozen=True)
class Limit:
    parameter: str            # dataset parameter name
    criteria_parameter: str   # name as written in the criteria CSV
    kind: str                 # "min", "max" or "range"
    low: float = None
    high: float = None
    unit: str = ""

    def describe(self):
        unit = f" {self.unit}" if self.unit else ""
        if self.kind == "min":
            return f"at least {self.low:g}{unit}"
        if self.kind == "max":
            return f"at most {self.high:g}{unit}"
        return f"{self.low:g} to {self.high:g}{unit}"


def load_class_b_limits(path=config.CRITERIA_CSV):
    """Read CPCB Class B limits for pH, DO and BOD only."""
    limits = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if r["class"].strip() != config.CPCB_CLASS:
                continue
            dataset_name = config.CLASS_B_PARAMETER_MAP.get(r["parameter"].strip())
            if dataset_name is None:
                continue  # e.g. Total coliform: not tested, not used
            kind = r["limit_type"].strip()
            text = r["limit"].strip()
            unit = r["unit"].strip()
            if kind == "range":
                low, high = (float(x) for x in text.split("-"))
                limits[dataset_name] = Limit(dataset_name, r["parameter"], kind, low, high, unit)
            elif kind == "min":
                limits[dataset_name] = Limit(dataset_name, r["parameter"], kind, low=float(text), unit=unit)
            elif kind == "max":
                limits[dataset_name] = Limit(dataset_name, r["parameter"], kind, high=float(text), unit=unit)
            else:
                raise ValueError(f"Unknown limit_type {kind!r} for {r['parameter']}")
    missing = set(config.CLASS_B_PARAMETER_MAP.values()) - set(limits)
    if missing:
        raise ValueError(f"Class B limits not found in criteria CSV for: {sorted(missing)}")
    return limits


def severity(limit, value):
    """0 when within the limit, otherwise how far past it (capped)."""
    if limit.kind == "min":
        if value >= limit.low:
            return 0.0
        return min((limit.low - value) / limit.low, config.DO_SEVERITY_CAP)
    if limit.kind == "max":
        if value <= limit.high:
            return 0.0
        return min((value - limit.high) / limit.high, config.BOD_SEVERITY_CAP)
    if limit.low <= value <= limit.high:
        return 0.0
    distance = limit.low - value if value < limit.low else value - limit.high
    return min(distance / config.PH_SEVERITY_SCALE, config.PH_SEVERITY_CAP)


def assess_reading(row, limits):
    """Return (class_b_status, limit_text, severity) for one normalised row.

    class_b_status is one of: within_limit, breach, censored_uncertain,
    missing, no_class_b_limit.
    """
    limit = limits.get(row["parameter"])
    if limit is None:
        return "no_class_b_limit", "", None
    status = row["reading_status"]
    if status == "measured":
        sev = severity(limit, row["value_num"])
        return ("breach" if sev > 0 else "within_limit"), limit.describe(), sev
    if status in config.CENSORED_STATUSES:
        return "censored_uncertain", limit.describe(), None
    return "missing", limit.describe(), None


def assess_all(rows, limits):
    """Copy rows and add class_b_status, limit_applied, severity, weight."""
    out = []
    for row in rows:
        r = dict(row)
        status, limit_text, sev = assess_reading(row, limits)
        r["class_b_status"] = status
        r["limit_applied"] = limit_text
        r["severity"] = sev
        r["weight"] = reading_weight(row) if status in ("breach", "within_limit") else None
        r["source_report"] = config.REPORT_FILES.get(row["year"], "")
        out.append(r)
    return out


def reading_weight(row):
    return (config.YEAR_WEIGHTS.get(row["year"], 0.0)
            * config.FESTIVAL_WEIGHTS.get(row["festival"], 1.0)
            * config.PHASE_WEIGHTS.get(row["phase"], 1.0))


# --- Site-level risk ------------------------------------------------------------

PHASE_WORDS = {"pre": "before immersion", "during": "during immersion",
               "after": "one week after immersion"}
PARAM_WORDS = {"Dissolved oxygen": "Dissolved oxygen", "BOD": "BOD", "pH": "pH"}


def describe_breach(r):
    unit = " mg/l" if r["parameter"] != "pH" else ""
    return (f"{PARAM_WORDS[r['parameter']]} was {r['value_num']:g}{unit} "
            f"(Class B limit: {r['limit_applied']}) {PHASE_WORDS[r['phase']]}, "
            f"{r['festival']} {r['year']} [{r['year']} report, page {r['source_page']}]")


def _season_key(r):
    return (r["year"], config.FESTIVALS.index(r["festival"]))


def score_site(site_rows):
    """Risk priority for one site from its assessed rows (Class B only)."""
    measured = [r for r in site_rows if r["class_b_status"] in ("breach", "within_limit")]
    breaches = [r for r in measured if r["class_b_status"] == "breach"]
    censored = [r for r in site_rows if r["class_b_status"] == "censored_uncertain"]

    result = {
        "class_b_measured": len(measured),
        "confirmed_breaches": len(breaches),
        "censored_readings": len(censored),
        "risk_score": None,
        "risk_tier": "Insufficient data",
        "risk_reasons": [],
        "worst_recent_do": None,
        "max_recent_bod": None,
        "breach_counts": {},
        "trend_label": "not enough data",
        "trend_by_year": {},
    }
    for p in config.CLASS_B_PARAMETER_MAP.values():
        taken = [r for r in measured if r["parameter"] == p]
        result["breach_counts"][p] = (sum(r["class_b_status"] == "breach" for r in taken), len(taken))
    result["trend_by_year"], result["trend_label"] = _trend(measured)

    if censored:
        result["risk_reasons"].append(
            f"{len(censored)} DO/BOD reading(s) were BDL/ND; kept as uncertain and not scored.")
    if not measured:
        result["risk_reasons"].insert(0, "No measured pH, dissolved oxygen or BOD readings; risk cannot be judged.")
        return result

    total_weight = sum(r["weight"] for r in measured)
    result["risk_score"] = round(sum(r["weight"] * r["severity"] for r in breaches) / total_weight, 4)

    recent = [r for r in measured if r["year"] in config.RECENT_YEARS]
    recent_do = [r for r in recent if r["parameter"] == "Dissolved oxygen"]
    recent_bod = [r for r in recent if r["parameter"] == "BOD"]
    if recent_do:
        result["worst_recent_do"] = min(r["value_num"] for r in recent_do)
    if recent_bod:
        result["max_recent_bod"] = max(r["value_num"] for r in recent_bod)

    # High rules use only 2024-2025 evidence, like the DO rule and the Low/Medium tiers.
    latest_bod = []
    if recent_bod:
        latest = max(_season_key(r) for r in recent_bod)
        latest_bod = [r for r in recent_bod if _season_key(r) == latest]

    triggers = []
    low_do = [r for r in recent_do if r["value_num"] <= config.HIGH_DO_AT_OR_BELOW]
    if low_do:
        worst = min(low_do, key=lambda r: (r["value_num"], _season_key(r)))
        triggers.append(f"Dissolved oxygen fell to {config.HIGH_DO_AT_OR_BELOW:g} mg/l or below in "
                        f"{len(low_do)} recent reading(s). Worst: {describe_breach(worst)}.")
    high_bod = [r for r in latest_bod if r["value_num"] > config.HIGH_BOD_LATEST_SEASON_ABOVE]
    if high_bod:
        worst = max(high_bod, key=lambda r: r["value_num"])
        triggers.append(f"BOD was above {config.HIGH_BOD_LATEST_SEASON_ABOVE:g} mg/l in the latest "
                        f"season sampled. Worst: {describe_breach(worst)}.")
    if recent and result["risk_score"] >= config.HIGH_SCORE_AT_OR_ABOVE:
        triggers.append(f"Weighted breach score {result['risk_score']:.2f} is at or above "
                        f"{config.HIGH_SCORE_AT_OR_ABOVE:g}.")

    recent_breaches = [r for r in recent if r["class_b_status"] == "breach"]
    if triggers:
        tier = "High"
    elif recent_breaches:
        tier = "Medium"
    elif recent_do or recent_bod:
        # pH alone cannot show low risk; DO or BOD must have been measured.
        tier = "Low"
    else:
        tier = "Insufficient data"
    result["risk_tier"] = tier

    reasons = list(triggers)
    if tier == "Medium":
        top = max(recent_breaches, key=lambda r: r["weight"] * r["severity"])
        reasons.append(f"{len(recent_breaches)} confirmed breach(es) in 2024-2025. Largest: {describe_breach(top)}.")
    elif tier == "Low":
        reasons.append("No confirmed Class B breach in the 2024-2025 readings that were taken. "
                       "This is not a statement that the water is safe.")
    elif tier == "Insufficient data" and recent:
        reasons.append("No measured dissolved oxygen or BOD readings in 2024-2025; "
                       "pH alone cannot show low risk.")
    elif tier == "Insufficient data":
        reasons.append("No measured pH, dissolved oxygen or BOD readings in 2024-2025.")
    counts = result["breach_counts"]
    reasons.append(
        f"{len(breaches)} of {len(measured)} measured Class B readings breached the limit "
        f"(DO below limit: {counts['Dissolved oxygen'][0]}/{counts['Dissolved oxygen'][1]}, "
        f"BOD above limit: {counts['BOD'][0]}/{counts['BOD'][1]}, "
        f"pH outside range: {counts['pH'][0]}/{counts['pH'][1]}).")
    result["risk_reasons"] = reasons + result["risk_reasons"]
    return result


def _trend(measured):
    by_year = {}
    for year in config.YEARS:
        rows = [r for r in measured if r["year"] == year]
        do = [r["value_num"] for r in rows if r["parameter"] == "Dissolved oxygen"]
        bod = [r["value_num"] for r in rows if r["parameter"] == "BOD"]
        by_year[year] = {
            "measured": len(rows),
            "breaches": sum(r["class_b_status"] == "breach" for r in rows),
            "breach_rate": round(sum(r["class_b_status"] == "breach" for r in rows) / len(rows), 3) if rows else None,
            "median_do": median(do) if do else None,
            "median_bod": median(bod) if bod else None,
        }
    usable = [y for y in config.YEARS if by_year[y]["measured"] >= config.TREND_MIN_READINGS]
    if len(usable) < 2:
        return by_year, "not enough data"
    change = by_year[usable[-1]]["breach_rate"] - by_year[usable[0]]["breach_rate"]
    if change > config.TREND_CHANGE_THRESHOLD:
        label = f"worsening ({usable[0]} to {usable[-1]})"
    elif change < -config.TREND_CHANGE_THRESHOLD:
        label = f"improving ({usable[0]} to {usable[-1]})"
    else:
        label = f"flat ({usable[0]} to {usable[-1]})"
    return by_year, label


def rank_sites(assessed_rows, sites):
    """Score every site and order by tier, score, worst DO, then max BOD.

    Sites with 'Insufficient data' get no rank number.
    """
    scored = []
    for site in sites:
        res = score_site([r for r in assessed_rows if r["site"] == site])
        res["site"] = site
        scored.append(res)

    def sort_key(s):
        return (config.TIER_ORDER.index(s["risk_tier"]),
                -(s["risk_score"] or 0.0),
                s["worst_recent_do"] if s["worst_recent_do"] is not None else float("inf"),
                -(s["max_recent_bod"] or 0.0),
                s["site"])

    scored.sort(key=sort_key)
    rank = 0
    for s in scored:
        if s["risk_tier"] == "Insufficient data":
            s["rank"] = None
        else:
            rank += 1
            s["rank"] = rank
    return scored
