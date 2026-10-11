// Small shared UI pieces: badges, the completeness bar, the site warning.

import { h } from './dom.js';
import { t, pick } from './i18n.js';
import { riskInfo, confInfo } from './labels.js';

export function riskBadge(level, { large = false } = {}) {
  const i = riskInfo(level);
  return h('span', { class: `badge ${i.tone}${large ? ' badge-lg' : ''}`, title: i.key === 'low' ? t('riskLowNote') : null },
    h('span', { class: 'badge-dot', 'aria-hidden': 'true' }), i.label);
}

export function confBadge(level) {
  const i = confInfo(level);
  return h('span', { class: `badge badge-conf ${i.tone}` },
    h('span', { class: 'conf-dots', 'aria-hidden': 'true' }, [1, 2, 3].map((n) => h('i', { class: n <= i.dots ? 'on' : '' }))),
    i.label);
}

// Shows the counts exactly as given by the scoring module. The bar widths are
// just those counts drawn to scale; no percentage is computed here.
export function completenessBar(c, { compact = false } = {}) {
  if (!c) return h('span', { class: 'muted' }, '—');
  const exp = Number(c.expected_readings) || 0;
  const parts = [
    ['numeric', c.numeric, 'seg-numeric', t('cNumeric')],
    ['bdl', c.bdl, 'seg-bdl', t('cBdl')],
    ['missing_flagged', c.missing_flagged, 'seg-missing', t('cMissingFlagged')],
    ['missing_no_row', c.missing_no_row, 'seg-norow', t('cMissingNoRow')],
    ['other_status', c.other_status, 'seg-other', t('cOther')],
  ].filter((p) => Number(p[1]) > 0);
  const bar = h('div', { class: 'cbar', role: 'img', 'aria-label': parts.map((p) => `${p[1]} ${p[3]}`).join(', ') + ` ${t('cOf', { n: exp })}` },
    exp > 0 ? parts.map((p) => h('span', { class: `seg ${p[2]}`, style: { width: `${(Number(p[1]) / exp) * 100}%` }, title: `${p[1]} ${p[3]}` })) : null);
  const legend = h('div', { class: 'cbar-legend' },
    parts.map((p) => h('span', { class: 'cbar-item' }, h('i', { class: `sw ${p[2]}` }), `${p[1]} ${p[3]}`)),
    h('span', { class: 'cbar-item muted' }, t('cOf', { n: exp })));
  const pct = c.percent_available != null ? h('div', { class: 'cbar-pct' }, t('cPercent', { p: c.percent_available })) : null;
  return h('div', { class: `compl${compact ? ' compl-compact' : ''}` }, bar, legend, pct);
}

export function siteWarning(g) {
  if (g.site_match_confidence === 'high') return null;
  const text = pick(g, 'site_warning') || t('siteWarnShort');
  return h('div', { class: 'site-warning', role: 'note' },
    h('span', { class: 'warn-icon', 'aria-hidden': 'true' }, '⚠'),
    h('div', null, h('strong', null, t('siteMatch', { c: t(`conf_${g.site_match_confidence}`) || g.site_match_confidence })), h('p', null, text)));
}

export function warnChip(g) {
  if (g.site_match_confidence === 'high') return null;
  return h('span', { class: 'warn-chip', title: pick(g, 'site_warning') || t('siteWarnShort') }, '⚠ ', t('siteWarnShort'));
}
