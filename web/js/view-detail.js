// Tab 3: one ghat — three separate cards (risk / evidence confidence /
// completeness), Class B status, chart, and the full traceable readings matrix.

import { h } from './dom.js';
import { state, ghatById, readingById, sourceById, limitFor } from './state.js';
import { t, pick, pickList, siteName } from './i18n.js';
import { riskBadge, confBadge, completenessBar, siteWarning } from './components.js';
import { statusInfo, verdictInfo, classBInfo, displayVerdict, paramName, limitText } from './labels.js';
import { renderChart, festivalYears, PHASES } from './chart.js';
import { openReading } from './popover.js';

let chartParam = 'dissolved_oxygen';

export function renderDetail(root, siteId) {
  const ghats = state.data.ghats;
  const ghat = ghatById(siteId) || [...ghats].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))[0];
  const params = state.data.parameters || uniqueParams(ghat);
  if (!params.some((p) => p.parameter_id === chartParam)) chartParam = params[0]?.parameter_id;

  const select = h('select', { id: 'ghat-select', class: 'select', onchange: (e) => { location.hash = `#detail/${encodeURIComponent(e.target.value)}`; } },
    [...ghats].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)).map((g) =>
      h('option', { value: g.site_id, selected: g.site_id === ghat.site_id }, `${g.rank != null ? `${g.rank}${g.tied ? '=' : ''}. ` : '— '}${siteName(g)}`)));

  const chartHost = h('div', { class: 'chart-host' });
  const paramSelect = h('select', { class: 'select', 'aria-label': t('parameter'), onchange: (e) => { chartParam = e.target.value; drawChart(); } },
    params.map((p) => h('option', { value: p.parameter_id, selected: p.parameter_id === chartParam }, paramName(p.parameter_id, state.lang))));
  const drawChart = () => chartHost.replaceChildren(renderChart(ghat, chartParam));
  drawChart();

  root.append(h('section', { class: 'section reveal' },
    h('div', { class: 'detail-top' },
      h('div', null,
        h('p', { class: 'kicker' }, t('detailTitle')),
        h('h2', { class: 'detail-name' }, siteName(ghat)),
        h('p', { class: 'muted' }, [(state.lang === 'hi' && ghat.water_body_hi) || ghat.water_body, ghat.rank != null ? t('rankText', { r: `${ghat.rank}${ghat.tied ? '=' : ''}` }) : t('unranked')].filter(Boolean).join(' · '))),
      h('label', { class: 'field' }, h('span', null, t('chooseGhat')), select)),
    siteWarning(ghat),
    printedNames(ghat),
    h('div', { class: 'triad' }, riskCard(ghat), confidenceCard(ghat), completenessCard(ghat)),
    classBSection(ghat, params),
    h('div', { class: 'glass card' },
      h('div', { class: 'card-head' }, h('h3', null, t('chartTitle')), h('label', { class: 'field field-inline' }, h('span', null, t('parameter')), paramSelect)),
      chartHost,
      chartLegend()),
    matrix(ghat, params)));
}

function uniqueParams(g) {
  return [...new Set(g.readings.map((r) => r.parameter_id))].map((id) => ({ parameter_id: id, name_en: id }));
}

function printedNames(g) {
  const v = g.site_as_printed_variants || [];
  if (!v.length) return null;
  return h('details', { class: 'printed glass' }, h('summary', null, `${t('siteAsPrinted')} (${v.length})`),
    h('ul', null, v.map((n) => h('li', null, h('code', null, n)))));
}

function riskCard(g) {
  const reasons = pickList(g.risk, 'reasons');
  const drivers = (g.risk.driver_reading_ids || []).map((id) => readingById(id)).filter(Boolean);
  return h('article', { class: 'glass card triad-card' },
    h('p', { class: 'card-kicker' }, t('riskLabel')),
    riskBadge(g.risk.level, { large: true }),
    g.risk.level === 'low' ? h('p', { class: 'small muted' }, t('riskLowNote')) : null,
    g.risk.score != null && g.risk.score_scale ? h('p', { class: 'small muted' }, t('score', { s: g.risk.score, scale: g.risk.score_scale })) : null,
    g.rank == null && pick(g, 'rank_excluded_reason') ? h('p', { class: 'small' }, pick(g, 'rank_excluded_reason')) : null,
    reasons.length ? [h('h4', null, t('why')), h('ul', { class: 'reasons' }, reasons.map((r) => h('li', null, r)))] : h('p', { class: 'muted small' }, t('noReason')),
    drivers.length ? [h('h4', null, t('keyReadings')), h('ul', { class: 'drivers' }, drivers.map(({ reading, ghat }) => {
      const src = sourceById(reading.source_id);
      return h('li', null, h('button', { class: 'link-btn', type: 'button', onclick: () => openReading(reading, ghat) },
        `${paramName(reading.parameter_id, state.lang)}: ${reading.status === 'numeric' ? reading.value : statusInfo(reading.status).label} · ${reading.year} ${t(`festival_${reading.festival}`)} ${t(`phase_${reading.phase}`)} · ${src?.file ?? reading.source_id} ${t('b_page', { p: reading.source_page ?? '—' })}`));
    }))] : null);
}

function confidenceCard(g) {
  const reasons = pickList(g.evidence_confidence, 'reasons');
  return h('article', { class: 'glass card triad-card' },
    h('p', { class: 'card-kicker' }, t('confLabel')),
    confBadge(g.evidence_confidence.level),
    reasons.length ? h('ul', { class: 'reasons' }, reasons.map((r) => h('li', null, r))) : null);
}

function completenessCard(g) {
  const c = g.completeness;
  return h('article', { class: 'glass card triad-card' },
    h('p', { class: 'card-kicker' }, t('complLabel')),
    completenessBar(c),
    Number(c.not_in_protocol) > 0 ? h('p', { class: 'small muted' }, `+ ${c.not_in_protocol} ${t('cNotInProtocol')}`) : null,
    (c.missing_tables || []).length ? [h('h4', null, t('cMissingTables')), h('ul', { class: 'reasons' }, c.missing_tables.map((m) => h('li', null, `${m.year} ${t(`festival_${m.festival}`)}${pick(m, 'note') ? `: ${pick(m, 'note')}` : ''}`)))] : null,
    (c.parameters_never_tested || []).length ? h('p', { class: 'small' }, h('strong', null, `${t('cNeverTested')}: `), c.parameters_never_tested.map((id) => paramName(id, state.lang)).join(', ')) : null);
}

function classBSection(g, params) {
  const statusFor = (id) => (g.class_b_status || []).find((x) => x.parameter_id === id);
  const withLimit = params.filter((p) => p.has_class_b_limit);
  const noLimit = params.filter((p) => p.has_class_b_limit === false);
  return h('section', { class: 'glass card' },
    h('div', { class: 'card-head' }, h('h3', null, t('classBTitle'))),
    h('p', { class: 'small muted' }, t('classBIntro')),
    h('h4', null, t('withLimit')),
    h('div', { class: 'cb-grid' }, withLimit.map((p) => {
      const st = statusFor(p.parameter_id);
      // Never-tested parameters are shown as not tested even if no status row exists.
      const ci = classBInfo(st?.status ?? (p.tested_in_data === false ? 'not_tested' : undefined));
      const lim = limitFor(p.parameter_id);
      const worst = st?.worst_reading_id ? readingById(st.worst_reading_id) : null;
      return h('div', { class: `cb-tile ${ci.tone}` },
        h('div', { class: 'cb-name' }, paramName(p.parameter_id, state.lang)),
        h('div', { class: 'cb-limit' }, limitText(lim)),
        h('div', { class: 'cb-status' }, ci.label),
        st && Number.isInteger(st.n_assessed) && st.n_assessed > 0 ? h('div', { class: 'cb-count' }, t('cbCount', { b: st.n_breach ?? 0, n: st.n_assessed })) : null,
        worst ? h('button', { class: 'link-btn small', type: 'button', onclick: () => openReading(worst.reading, worst.ghat) }, `→ ${worst.reading.value ?? ''} · ${t('b_page', { p: worst.reading.source_page ?? '—' })}`) : null);
    })),
    h('h4', null, t('noLimitGroup')),
    h('div', { class: 'chip-row' }, noLimit.map((p) => h('span', { class: 'chip tone-outline' }, paramName(p.parameter_id, state.lang)))));
}

function chartLegend() {
  const item = (cls, label) => h('span', { class: 'lg-item' }, h('i', { class: `lg ${cls}` }), label);
  return h('div', { class: 'legend' },
    item('lg-breach', verdictInfo('breach').label),
    item('lg-within', verdictInfo('within').label),
    item('lg-nolimit', verdictInfo('no_class_b_limit').label),
    item('lg-bdl', statusInfo('bdl').label),
    item('lg-miss', `${statusInfo('not_sampled').label} / ${statusInfo('not_reported').label}`),
    item('lg-limit', 'CPCB Class B'),
    h('span', { class: 'lg-item muted' }, `* ${t('unitsAssumed')}`));
}

function matrix(g, params) {
  const fys = festivalYears();
  const lookup = new Map(g.readings.map((r) => [`${r.parameter_id}|${r.year}|${r.festival}|${r.phase}`, r]));
  const head1 = h('tr', null, h('th', { rowspan: 2, class: 'mx-param' }, t('parameter')),
    fys.map((fy) => h('th', { colspan: 3, class: 'mx-fy' }, `${fy.year} ${t(`festival_${fy.festival}`)}`)));
  const head2 = h('tr', null, fys.map(() => PHASES.map((p) => h('th', { class: 'mx-phase' }, t(`phase_${p}`)))));

  const body = params.map((p) => {
    const rowReadings = fys.flatMap((fy) => PHASES.map((ph) => lookup.get(`${p.parameter_id}|${fy.year}|${fy.festival}|${ph}`)));
    if (p.tested_in_data === false && rowReadings.every((r) => !r)) {
      return h('tr', { class: 'mx-row-untested' }, h('th', { class: 'mx-param', scope: 'row' }, paramName(p.parameter_id, state.lang)),
        h('td', { colspan: fys.length * 3, class: 'mx-untested tone-grey-hatch' }, t('coliformRow')));
    }
    return h('tr', null, h('th', { class: 'mx-param', scope: 'row' }, paramName(p.parameter_id, state.lang), p.unit_assumed ? h('small', null, ` ${p.unit_assumed}*`) : null),
      rowReadings.map((r) => cell(r, g)));
  });

  return h('section', { class: 'glass card' },
    h('div', { class: 'card-head' }, h('h3', null, t('matrixTitle'))),
    h('p', { class: 'small muted' }, t('matrixHint')),
    h('div', { class: 'mx-scroll' }, h('table', { class: 'mx' }, h('thead', null, head1, head2), h('tbody', null, body))),
    matrixLegend());
}

function cell(r, g) {
  if (!r) return h('td', { class: 'mx-cell tone-grey' }, h('span', { class: 'sr' }, 'no entry'), '·');
  const st = statusInfo(r.status);
  const dv = displayVerdict(r);
  const vi = verdictInfo(dv.verdict);
  const cls = st.key === 'numeric' ? `mx-num ${vi.key === 'breach' ? 'mx-breach' : vi.key === 'within' ? 'mx-within' : ''}` : st.tone;
  const text = st.key === 'numeric' ? (r.value_as_printed || String(r.value)) : st.short;
  return h('td', { class: 'mx-cell' },
    h('button', { class: `mx-btn ${cls}`, type: 'button', title: `${st.key === 'numeric' ? vi.label : st.label}`, onclick: () => openReading(r, g) }, text));
}

function matrixLegend() {
  const item = (cls, label) => h('span', { class: 'lg-item' }, h('i', { class: `sw-cell ${cls}` }), label);
  return h('div', { class: 'legend' },
    item('mx-breach', verdictInfo('breach').label),
    item('mx-within', verdictInfo('within').label),
    item('mx-num', verdictInfo('no_class_b_limit').label),
    item('tone-violet', statusInfo('bdl').label),
    item('tone-grey-hatch', `${t('sh_not_sampled')} = ${statusInfo('not_sampled').label}`),
    item('tone-grey-hatch-dash', `${t('sh_not_reported')} = ${statusInfo('not_reported').label}`),
    item('tone-grey-dot', `${t('sh_not_in_protocol')} = ${statusInfo('not_in_protocol').label}`),
    item('tone-grey', `? = ${statusInfo('unknown').label}`));
}
