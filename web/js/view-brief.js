// Tab 4: forwardable plain-text brief in English and Hindi, assembled from
// the JSON's own ranks, levels, reasons and counts. Fixed template words only.

import { h } from './dom.js';
import { state, readingById, sourceById } from './state.js';
import { t, pick, pickList, siteName, formatDate } from './i18n.js';
import { riskInfo, confInfo } from './labels.js';

const TOP_N = 3;

export function buildBrief(lang) {
  const d = state.data;
  const L = (k, v) => t(k, v, lang);
  const risk = (lv) => t(`risk_${riskInfo(lv).key}`, null, lang);
  const conf = (lv) => t(`conf_${confInfo(lv).key}`, null, lang);
  const ranked = d.ghats.filter((g) => g.rank != null).sort((a, b) => a.rank - b.rank);
  const top = ranked.filter((g) => g.rank <= TOP_N);
  const others = ranked.filter((g) => g.rank > TOP_N);
  const unranked = d.ghats.filter((g) => g.rank == null);
  const out = [];

  if (state.mock) out.push(L('mockBriefLine'), '');
  out.push(L('b_heading'));
  out.push(L('b_data', { d: formatDate(d.generated_at, lang), c: d.cpcb_class_used ?? '?' }));
  const basis = pick(d, 'rank_basis', lang);
  if (basis) out.push(L('b_basis', { basis }));
  out.push('', L('b_priority'));

  for (const g of top) {
    out.push(L('b_item', { rank: `${g.rank}${g.tied ? '=' : ''}`, site: siteName(g, lang), body: (lang === 'hi' && g.water_body_hi) || g.water_body || '', risk: risk(g.risk.level), conf: conf(g.evidence_confidence.level) }));
    const reasons = pickList(g.risk, 'reasons', lang);
    if (reasons[0]) out.push(L('b_why', { r: reasons[0] }));
    const srcs = (g.risk.driver_reading_ids || []).map(readingById).filter(Boolean).map(({ reading }) => {
      const s = sourceById(reading.source_id);
      return `${s?.file ?? reading.source_id} ${L('b_page', { p: reading.source_page ?? '—' })}`;
    });
    if (srcs.length) out.push(L('b_src', { src: [...new Set(srcs)].join('; ') }));
    const c = g.completeness;
    out.push(L('b_counts', { numeric: c.numeric ?? '?', bdl: c.bdl ?? '?', miss: c.missing_flagged ?? '?', norow: c.missing_no_row ?? '?', exp: c.expected_readings ?? '?' }));
    if (g.site_match_confidence !== 'high') out.push(L('b_warn', { w: pick(g, 'site_warning', lang) || L('siteWarnShort') }));
  }
  if (others.length) out.push('', L('b_others', { list: others.map((g) => `${g.rank}${g.tied ? '=' : ''}. ${siteName(g, lang)} (${risk(g.risk.level)})`).join(', ') }));
  if (unranked.length) out.push(L('b_unranked', { list: unranked.map((g) => siteName(g, lang)).join(', ') }));
  const gaps = d.ghats.flatMap((g) => (g.completeness.missing_tables || []).map((m) => `${siteName(g, lang)}: ${m.year} ${t(`festival_${m.festival}`, null, lang)}`));
  if (gaps.length) out.push(L('b_gaps', { list: gaps.join('; ') }));
  out.push('', L('b_coliform'), L('b_notsafe'));
  if (state.mock) out.push('', L('mockBriefLine'));
  return out.join('\n');
}

export function renderBrief(root) {
  const panel = (lang, title) => {
    const text = buildBrief(lang);
    const btn = h('button', { class: 'btn btn-primary', type: 'button' }, t('copy'));
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); } catch {
        const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
        document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      btn.textContent = t('copied');
      setTimeout(() => { btn.textContent = t('copy'); }, 1600);
    });
    return h('article', { class: `glass card brief${state.mock ? ' brief-mock' : ''}`, lang },
      h('div', { class: 'card-head' }, h('h3', null, title), btn),
      h('pre', { class: 'brief-text' }, text));
  };
  root.append(h('section', { class: 'section reveal' },
    h('header', { class: 'section-head' }, h('h2', null, t('briefTitle')), h('p', { class: 'lead' }, t('briefIntro'))),
    h('div', { class: 'brief-grid' }, panel('en', 'English'), panel('hi', 'हिन्दी'))));
}
