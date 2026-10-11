"""Project settings for GhatWatch.

IMPORTANT: the risk score, weights and tiers below are PROJECT-DEFINED
PRIORITISATION HEURISTICS for the GhatWatch tool. They are NOT an official
CPCB or MPPCB risk classification. Only the Class B limits themselves are
official, and those are read from data/cpcb_water_quality_criteria.csv,
never hardcoded here.
"""

from pathlib import Path

TRACK_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = TRACK_DIR / "data"
OUTPUT_DIR = TRACK_DIR / "outputs"

BHOPAL_CSV = DATA_DIR / "bhopal_ghats_2023_2025.csv"
SAMPLE_CSV = DATA_DIR / "sample_bhopal_2025.csv"
STATEWIDE_CSV = DATA_DIR / "mp_immersion_sites_2023_2025.csv"
CRITERIA_CSV = DATA_DIR / "cpcb_water_quality_criteria.csv"

# Source report for each year, so every reading can be traced to a PDF page.
REPORT_FILES = {
    "2023": "resources/Idol_immer._Report_23_CPCB.pdf",
    "2024": "resources/Ganesh_and_Durga_visarjan_report-2024.pdf",
    "2025": "resources/Ganesh_and_Durga_visarjan_report-2025.pdf",
}

# How far each source file was checked against the PDFs (DATA_DICTIONARY.md).
DATASET_VERIFICATION = {
    "bhopal": "spot_checked",
    "statewide": "not_checked",
}

# --- Expected sampling design -------------------------------------------------

YEARS = ["2023", "2024", "2025"]
FESTIVALS = ["Ganesh", "Durga"]  # Ganesh comes before Durga within a year
PHASES = ["pre", "during", "after"]

# Parameters expected in every table. Suspended solids was not tested in every
# table, so it only counts where the table actually reports it.
CORE_PARAMETERS = [
    "pH", "Total solids", "Dissolved solids", "Dissolved oxygen", "BOD", "COD",
    "Turbidity", "Conductivity", "Chromium", "Lead", "Zinc", "Copper",
]
OPTIONAL_PARAMETERS = ["Suspended solids"]

# --- CPCB Class B ---------------------------------------------------------------

CPCB_CLASS = "B"
# Criteria CSV parameter name -> dataset parameter name. Only these three
# Class B limits are used. No limits are invented for any other parameter.
CLASS_B_PARAMETER_MAP = {
    "pH": "pH",
    "Dissolved oxygen": "Dissolved oxygen",
    "BOD (5 days 20C)": "BOD",
}

# --- Reading status codes -------------------------------------------------------

# flag / value_as_printed code -> reading_status
STATUS_CODES = {
    "BDL": "below_detection",
    "ND": "not_detected",
    "not sampled": "not_sampled",
    "": "not_sampled",
    "_": "not_sampled",
    "-": "not_sampled",
    "*": "not_sampled",
    "**": "not_sampled",
    "NA": "not_available",
    "na": "not_available",
    "DRY": "not_available",
}
SAMPLED_STATUSES = {"measured", "below_detection", "not_detected"}
CENSORED_STATUSES = {"below_detection", "not_detected"}

# --- Risk priority heuristic (project-defined, adjustable) ----------------------

YEAR_WEIGHTS = {"2025": 1.0, "2024": 0.75, "2023": 0.5}
FESTIVAL_WEIGHTS = {"Durga": 1.2, "Ganesh": 1.0}  # Durga visarjan is next
PHASE_WEIGHTS = {"during": 1.0, "after": 1.0, "pre": 0.8}

# Severity of a confirmed breach, 0 = at the limit.
PH_SEVERITY_SCALE = 0.5   # pH units outside the range that give severity 1
PH_SEVERITY_CAP = 1.0
DO_SEVERITY_CAP = 1.0     # DO 0 mg/l gives 1.0
BOD_SEVERITY_CAP = 3.0    # caps extreme BOD outliers

RECENT_YEARS = {"2024", "2025"}
HIGH_DO_AT_OR_BELOW = 2.0          # any recent DO at or below this -> High
HIGH_BOD_LATEST_SEASON_ABOVE = 6.0  # BOD above this in latest season -> High
HIGH_SCORE_AT_OR_ABOVE = 1.0        # weighted breach intensity -> High

TIER_ORDER = ["High", "Medium", "Low", "Insufficient data"]
TREND_MIN_READINGS = 6      # measured Class B readings needed per year
TREND_CHANGE_THRESHOLD = 0.10  # change in breach rate to call a trend

# --- Evidence confidence (project-defined, adjustable) --------------------------

CONFIDENCE_LEVELS = ["Low", "Medium", "High"]
COMPLETENESS_OK = 0.85
COMPLETENESS_LOW = 0.60
MIN_CLASS_B_READINGS_FOR_HIGH = 20

# --- Notes written into outputs -------------------------------------------------

HEURISTIC_NOTE = (
    "Risk score and tiers are project-defined prioritisation heuristics for "
    "planning cleaning, aeration and testing. They are not an official CPCB or "
    "MPPCB risk classification. Readings are compared with CPCB Class B "
    "(outdoor bathing) limits for pH, dissolved oxygen and BOD only."
)
CENSORED_NOTE = (
    "BDL/ND readings for dissolved oxygen or BOD are kept as censored "
    "(uncertain). The reports do not give detection limits, so they are not "
    "counted as a confirmed breach or a confirmed pass. They count as sampled "
    "for completeness and are left out of breach scoring."
)
MISSING_NOTE = (
    "Missing readings (not sampled, '_', '-', '*', '**', blank, or a whole "
    "table absent from the report) are never treated as clean. They lower "
    "data completeness and evidence confidence, not the risk score."
)
