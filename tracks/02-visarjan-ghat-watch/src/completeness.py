"""Data completeness for each Bhopal ghat, kept separate from risk.

Completeness is measured against the expected sampling grid
(years x festivals x phases x parameters), not against the rows that happen to
exist, so a table missing from a report shows up as gaps. Gap records are
placeholders: they carry no value and no source_page and are never mixed into
the source readings.
"""

from . import config

GAP_COLUMNS = ["site", "year", "festival", "phase", "parameter", "is_class_b",
               "gap_reason", "note", "value_as_printed", "source_page"]


def _index(rows):
    idx = {}
    for r in rows:
        idx[(r["site"], r["year"], r["festival"], r["phase"], r["parameter"])] = r
    return idx


def expected_slots(rows, site):
    """Yield (year, festival, phase, parameter, table_present) for one site.

    Core parameters are expected in every table. Optional parameters
    (Suspended solids) are expected only where that table reports them.
    """
    tables = {}
    for r in rows:
        if r["site"] == site:
            tables.setdefault((r["year"], r["festival"]), set()).add(r["parameter"])
    for year in config.YEARS:
        for festival in config.FESTIVALS:
            present = tables.get((year, festival))
            params = list(config.CORE_PARAMETERS)
            if present:
                params += [p for p in config.OPTIONAL_PARAMETERS if p in present]
                params += sorted(p for p in present
                                 if p not in config.CORE_PARAMETERS and p not in config.OPTIONAL_PARAMETERS)
            for phase in config.PHASES:
                for parameter in params:
                    yield year, festival, phase, parameter, present is not None


def site_completeness(rows, site):
    """Return (summary dict, list of gap dicts) for one site."""
    idx = _index(rows)
    class_b = set(config.CLASS_B_PARAMETER_MAP.values())
    totals = {"class_b": [0, 0], "all": [0, 0]}  # [taken, expected]
    by_season = {}
    gaps = []

    for year, festival, phase, parameter, table_present in expected_slots(rows, site):
        is_b = parameter in class_b
        season = by_season.setdefault(f"{festival} {year}", {"class_b_taken": 0, "class_b_expected": 0,
                                                             "table_present": table_present})
        row = idx.get((site, year, festival, phase, parameter))
        taken = row is not None and row["reading_status"] in config.SAMPLED_STATUSES

        totals["all"][1] += 1
        totals["all"][0] += taken
        if is_b:
            totals["class_b"][1] += 1
            totals["class_b"][0] += taken
            season["class_b_expected"] += 1
            season["class_b_taken"] += taken

        if taken:
            continue
        if row is None:
            reason = "table_absent" if not table_present else "row_absent"
            note = (f"No {festival} {year} table for this site in the source data"
                    if not table_present else "Parameter row missing from this table")
            printed, page = "", ""
        else:
            reason = row["reading_status"]
            note = row["status_note"]
            printed, page = row["value_as_printed"], row["source_page"]
        gaps.append({"site": site, "year": year, "festival": festival, "phase": phase,
                     "parameter": parameter, "is_class_b": "yes" if is_b else "no",
                     "gap_reason": reason, "note": note,
                     "value_as_printed": printed, "source_page": page})

    def ratio(pair):
        return round(pair[0] / pair[1], 4) if pair[1] else None

    summary = {
        "class_b_taken": totals["class_b"][0],
        "class_b_expected": totals["class_b"][1],
        "class_b_completeness": ratio(totals["class_b"]),
        "all_param_taken": totals["all"][0],
        "all_param_expected": totals["all"][1],
        "all_param_completeness": ratio(totals["all"]),
        "class_b_gap_count": sum(g["is_class_b"] == "yes" for g in gaps),
        "absent_tables": sorted({f"{g['festival']} {g['year']}" for g in gaps
                                 if g["gap_reason"] == "table_absent"}),
        "by_season": by_season,
    }
    return summary, gaps


def all_sites_completeness(rows, sites):
    summaries, gaps = {}, []
    for site in sites:
        summary, site_gaps = site_completeness(rows, site)
        summaries[site] = summary
        gaps.extend(site_gaps)
    return summaries, gaps
