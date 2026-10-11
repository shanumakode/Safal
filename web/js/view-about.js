// Tab 5: what the data is, what it does not cover, limits applied, sources,
// colour legend and the contract check results.

import { h } from './dom.js';
import { state } from './state.js';
import { t, pick, pickList, formatDate } from './i18n.js';
import { riskBadge, confBadge } from './components.js';
import { verdictInfo, statusInfo, paramName, limitText } from './labels.js';
import { pdfHref } from './popover.js';

export function renderAbout(root) {
  const d = state.data;
  const check = state.check;
  const limits = d.class_b_limits || [];

  root.append(h('section', { class: 'section reveal' },
    h('header', { class: 'section-head' }, h('h2', null, t('aboutTitle'))),
    h('div', { class: 'about-grid' },
      h('article', { class: 'glass card' },
        h('h3', null, t('classChoice', { c: d.cpcb_class_used ?? '?' })),
        h('p', null, pick(d, 'cpcb_class_reason') || '—'),
        h('p', { class: 'small muted' }, t('unitsAssumed'))),
      h('article', { class: 'glass card' },
        h('h3', null, t('limitationsTitle')),
        h('ul', { class: 'reasons' }, pickList(d, 'known_limitations').map((x) => h('li', null, x))))),

    h('article', { class: 'glass card' },
      h('h3', null, t('limitsTitle')),
      h('div', { class: 'mx-scroll' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, t('thParam')), h('th', null, t('thCpcb')), h('th', null, t('thLimit')), h('th', null, t('thTested')))),
        h('tbody', null, limits.map((l) => h('tr', null,
          h('td', null, paramName(l.parameter_id, state.lang)),
          h('td', null, h('code', null, l.cpcb_parameter ?? '—')),
          h('td', null, limitText(l), l.inclusive ? h('small', { class: 'muted' }, ` (${t('inclusive')})`) : null),
          h('td', { class: l.tested_in_data === false ? 'tone-grey-hatch' : '' }, l.tested_in_data === false ? t('no') : t('yes')))))))),

    h('article', { class: 'glass card' },
      h('h3', null, t('legendTitle')),
      h('p', { class: 'small muted' }, t('noGreen')),
      h('div', { class: 'legend legend-col' },
        h('div', { class: 'chip-row' }, ['high', 'elevated', 'low', 'insufficient_data'].map((l) => riskBadge(l))),
        h('div', { class: 'chip-row' }, ['high', 'medium', 'low'].map((l) => confBadge(l))),
        h('div', { class: 'chip-row' }, ['breach', 'within', 'no_class_b_limit', 'not_assessable'].map((v) => { const i = verdictInfo(v); return h('span', { class: `badge ${i.tone}` }, i.label); })),
        h('div', { class: 'chip-row' }, ['bdl', 'not_sampled', 'not_reported', 'not_in_protocol', 'unknown'].map((v) => { const i = statusInfo(v); return h('span', { class: `badge ${i.tone}` }, i.label); })))),

    h('article', { class: 'glass card' },
      h('h3', null, t('sourcesTitle')),
      h('ul', { class: 'sources' }, (d.sources || []).map((s) => {
        const href = pdfHref(s);
        return h('li', null,
          h('strong', null, s.file || s.source_id), s.year ? ` (${s.year})` : '',
          s.is_mock_source ? h('span', { class: 'badge tone-red badge-sm' }, 'MOCK') : null,
          href ? [' · ', h('a', { href, target: '_blank', rel: 'noopener' }, 'PDF')] : null,
          s.official_url ? [' · ', h('a', { href: s.official_url, target: '_blank', rel: 'noopener noreferrer' }, 'MPPCB')] : null,
          pick(s, 'note') ? h('div', { class: 'small muted' }, pick(s, 'note')) : null);
      }))),

    h('div', { class: 'about-grid' },
      h('article', { class: 'glass card' },
        h('h3', null, t('generatorTitle')),
        h('p', null, h('code', null, d.generator?.module ?? '—')),
        h('p', { class: 'small muted' }, `version ${d.generator?.version ?? '—'} · schema ${d.schema_version} · ${formatDate(d.generated_at)}`),
        pick(d.generator, 'note') ? h('p', { class: 'small' }, pick(d.generator, 'note')) : null,
        h('p', { class: 'small muted' }, `file: ${state.dataUrl}`)),
      h('article', { class: 'glass card' },
        h('h3', null, t('checkTitle')),
        check.warnings.length
          ? [h('p', { class: 'small' }, t('checkWarnings', { n: check.warnings.length })), h('ul', { class: 'check-list' }, check.warnings.map((w) => h('li', null, w)))]
          : h('p', { class: 'small' }, t('checkOk'))))));
}
