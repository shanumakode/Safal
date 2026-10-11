// Checks the loaded JSON against the DRAFT contract (docs/CONTRACT.md).
// errors   => fatal, nothing is rendered
// warnings => rendered anyway, shown in "About the data"; unknown values render grey
// This only checks shape. It never recalculates scores, counts or verdicts.

import { RISK_LEVELS, CONF_LEVELS, READING_STATUSES, VERDICTS, CLASS_B_STATUSES, SITE_CONF } from './labels.js';

const SUPPORTED_MAJOR = ['0', '1'];
const MAX_WARNINGS = 60;

export function validateContract(doc) {
  const errors = [];
  const warnings = [];
  const warn = (msg) => { if (warnings.length < MAX_WARNINGS) warnings.push(msg); else if (warnings.length === MAX_WARNINGS) warnings.push('… more warnings not shown'); };

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    errors.push('Top level must be a JSON object.');
    return { errors, warnings };
  }
  const major = String(doc.schema_version ?? '').split(/[.-]/)[0];
  if (!SUPPORTED_MAJOR.includes(major)) errors.push(`schema_version "${doc.schema_version}" is not supported (expected 0.x or 1.x).`);
  if (!Array.isArray(doc.ghats) || doc.ghats.length === 0) errors.push('"ghats" must be a non-empty array.');
  if (errors.length) return { errors, warnings };

  if (doc.is_mock !== true && doc.is_mock !== false) warn('is_mock is missing or not true/false: the red MOCK banner is shown as a precaution.');
  if (!doc.generated_at) warn('generated_at is missing.');
  if (doc.units_assumed !== true) warn('units_assumed is not true: the reports print no units, so units should be marked as assumed.');

  const sourceIds = new Set();
  for (const s of doc.sources || []) {
    if (sourceIds.has(s.source_id)) warn(`Duplicate source_id "${s.source_id}".`);
    sourceIds.add(s.source_id);
    if (!s.repo_path && !s.official_url && !s.is_mock_source) warn(`Source "${s.source_id}" has neither repo_path nor official_url: no link can be shown.`);
  }
  if (!Array.isArray(doc.sources)) warn('"sources" array is missing: source files cannot be named.');

  const paramIds = new Set((doc.parameters || []).map((p) => p.parameter_id));
  if (!Array.isArray(doc.parameters)) warn('"parameters" array is missing: parameter names fall back to IDs.');
  for (const lim of doc.class_b_limits || []) {
    if (!['min', 'max', 'range'].includes(lim.limit_type)) warn(`class_b_limits: unknown limit_type "${lim.limit_type}" for ${lim.parameter_id}.`);
    if (lim.limit_type === 'range' && (typeof lim.min !== 'number' || typeof lim.max !== 'number')) warn(`class_b_limits: ${lim.parameter_id} range needs numeric min and max.`);
  }
  if (!Array.isArray(doc.class_b_limits)) warn('"class_b_limits" array is missing.');

  const siteIds = new Set();
  const readingIds = new Set();
  for (const g of doc.ghats) {
    const where = `Ghat "${g?.site ?? g?.site_id ?? '?'}"`;
    if (!g || typeof g !== 'object') { errors.push('A ghat entry is not an object.'); continue; }
    if (!g.site_id || !g.site) errors.push(`${where}: site_id and site are required.`);
    if (siteIds.has(g.site_id)) errors.push(`${where}: duplicate site_id.`);
    siteIds.add(g.site_id);
    if (!g.risk || !g.evidence_confidence || !g.completeness) errors.push(`${where}: risk, evidence_confidence and completeness must be three separate objects.`);
    if (!Array.isArray(g.readings)) errors.push(`${where}: readings array is required.`);
    if (errors.length) continue;

    if (!RISK_LEVELS.includes(g.risk.level)) warn(`${where}: unknown risk.level "${g.risk.level}" (shown grey).`);
    if (!CONF_LEVELS.includes(g.evidence_confidence.level)) warn(`${where}: unknown evidence_confidence.level "${g.evidence_confidence.level}" (shown grey).`);
    if (!SITE_CONF.includes(g.site_match_confidence)) warn(`${where}: unknown site_match_confidence "${g.site_match_confidence}".`);
    if (g.site_match_confidence !== 'high' && !g.site_warning_en) warn(`${where}: site match is not high confidence but site_warning_en is empty (a generic warning is shown).`);
    if (g.rank != null && !(Number.isInteger(g.rank) && g.rank >= 1)) warn(`${where}: rank must be a positive integer or null.`);
    if (g.rank == null && !g.rank_excluded_reason_en) warn(`${where}: rank is null but rank_excluded_reason_en is empty.`);
    if (g.risk.score != null && !g.risk.score_scale) warn(`${where}: risk.score given without score_scale, so the number is hidden.`);

    for (const cb of g.class_b_status || []) {
      if (!CLASS_B_STATUSES.includes(cb.status)) warn(`${where}: unknown class_b_status "${cb.status}" for ${cb.parameter_id} (shown grey).`);
    }

    for (const r of g.readings) {
      const rw = `${where} reading ${r.reading_id ?? '(no id)'}`;
      if (!r.reading_id) warn(`${rw}: reading_id missing.`);
      else if (readingIds.has(r.reading_id)) warn(`${rw}: duplicate reading_id.`);
      readingIds.add(r.reading_id);
      if (paramIds.size && !paramIds.has(r.parameter_id)) warn(`${rw}: parameter_id "${r.parameter_id}" not in parameters list.`);
      if (!READING_STATUSES.includes(r.status)) warn(`${rw}: unknown status "${r.status}" (shown neutral grey, never as clean).`);
      if (r.status === 'numeric' && typeof r.value !== 'number') warn(`${rw}: status numeric but value is not a number.`);
      if (r.status !== 'numeric' && r.value != null) warn(`${rw}: status "${r.status}" must have value null${r.status === 'bdl' ? ' (BDL is not zero)' : ''}; value ignored.`);
      if (!VERDICTS.includes(r.class_b_verdict)) warn(`${rw}: unknown class_b_verdict "${r.class_b_verdict}" (shown grey).`);
      if ((r.class_b_verdict === 'breach' || r.class_b_verdict === 'within') && r.status !== 'numeric') warn(`${rw}: pass/fail verdict on a reading without a measured value; displayed as not assessable.`);
      if (!r.is_synthetic) {
        if (!sourceIds.has(r.source_id)) warn(`${rw}: source_id "${r.source_id}" not found in sources.`);
        if (!Number.isInteger(r.source_page)) warn(`${rw}: source_page missing on a real (non-synthetic) reading.`);
        if (r.value_as_printed === undefined) warn(`${rw}: value_as_printed missing.`);
        if (r.site_as_printed === undefined) warn(`${rw}: site_as_printed missing.`);
      }
    }
    for (const id of g.risk.driver_reading_ids || []) {
      if (!g.readings.some((r) => r.reading_id === id)) warn(`${where}: driver_reading_id "${id}" not found in its readings.`);
    }
  }
  return { errors, warnings };
}
