// Maps contract enum values to labels and CSS tone classes.
// Rules: unknown values => neutral grey. No value ever maps to green.
// "within" uses a neutral steel-blue, never a "safe" colour.

import { t } from './i18n.js';
import { parameterById } from './state.js';

export const RISK_LEVELS = ['high', 'elevated', 'low', 'insufficient_data'];
export const CONF_LEVELS = ['high', 'medium', 'low'];
export const READING_STATUSES = ['numeric', 'bdl', 'not_sampled', 'not_reported', 'not_in_protocol'];
export const VERDICTS = ['breach', 'within', 'no_class_b_limit', 'not_assessable'];
export const CLASS_B_STATUSES = ['breach', 'within', 'mixed', 'no_class_b_limit', 'not_tested', 'insufficient_data'];
export const SITE_CONF = ['high', 'medium', 'low'];

const known = (list, v) => list.includes(v);

export function riskInfo(level) {
  const k = known(RISK_LEVELS, level) ? level : 'unknown';
  return { key: k, label: t(`risk_${k}`), tone: { high: 'tone-red', elevated: 'tone-amber', low: 'tone-steel', insufficient_data: 'tone-grey-hatch', unknown: 'tone-grey' }[k] };
}

export function confInfo(level) {
  const k = known(CONF_LEVELS, level) ? level : 'unknown';
  return { key: k, label: t(`conf_${k}`), tone: { high: 'tone-cyan-3', medium: 'tone-cyan-2', low: 'tone-cyan-1', unknown: 'tone-grey' }[k], dots: { high: 3, medium: 2, low: 1, unknown: 0 }[k] };
}

export function statusInfo(status) {
  const k = known(READING_STATUSES, status) ? status : 'unknown';
  return {
    key: k,
    label: t(`st_${k}`),
    short: k === 'numeric' ? null : t(`sh_${k}`),
    tone: { numeric: '', bdl: 'tone-violet', not_sampled: 'tone-grey-hatch', not_reported: 'tone-grey-hatch-dash', not_in_protocol: 'tone-grey-dot', unknown: 'tone-grey' }[k],
    isMissing: k !== 'numeric' && k !== 'bdl',
  };
}

export function verdictInfo(v) {
  const k = known(VERDICTS, v) ? v : 'unknown';
  return { key: k, label: t(`v_${k}`), tone: { breach: 'tone-red', within: 'tone-steel', no_class_b_limit: 'tone-outline', not_assessable: 'tone-grey-hatch', unknown: 'tone-grey' }[k] };
}

export function classBInfo(v) {
  const k = known(CLASS_B_STATUSES, v) ? v : 'unknown';
  return { key: k, label: t(`cb_${k}`), tone: { breach: 'tone-red', within: 'tone-steel', mixed: 'tone-amber', no_class_b_limit: 'tone-outline', not_tested: 'tone-grey-hatch', insufficient_data: 'tone-grey-hatch', unknown: 'tone-grey' }[k] };
}

// Display guard (not scoring): a reading without a measured value, or a
// parameter that has no Class B limit, can never be shown as pass/fail —
// even if the file says otherwise. Returns the verdict to display plus
// whether the guard overrode the file.
export function displayVerdict(reading) {
  const fileVerdict = reading.class_b_verdict;
  const param = parameterById(reading.parameter_id);
  const passFail = fileVerdict === 'breach' || fileVerdict === 'within';
  if (passFail && param && param.has_class_b_limit === false) {
    return { verdict: 'no_class_b_limit', overridden: true, fileVerdict };
  }
  if (passFail && reading.status !== 'numeric') {
    return { verdict: 'not_assessable', overridden: true, fileVerdict };
  }
  return { verdict: fileVerdict, overridden: false, fileVerdict };
}

export function paramName(id, lang) {
  const p = parameterById(id);
  if (!p) return id;
  return (lang === 'hi' && p.name_hi) || p.name_en || id;
}

export function limitText(lim) {
  if (!lim) return '';
  const u = lim.unit ? ` ${lim.unit}` : '';
  if (lim.limit_type === 'range') return `${lim.min} – ${lim.max}${u}`;
  if (lim.limit_type === 'min') return `≥ ${lim.min}${u}`;
  if (lim.limit_type === 'max') return `≤ ${lim.max}${u}`;
  return '';
}
