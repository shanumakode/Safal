// Tab 1: ghats in the order given by the scoring module's `rank`.

import { h } from './dom.js';
import { state } from './state.js';
import { t, pick, pickList, siteName } from './i18n.js';
import { riskBadge, confBadge, completenessBar, warnChip } from './components.js';

export function renderRanking(root) {
  const ghats = state.data.ghats;
  // Ordering by the provided rank only; ties keep file order.
  const ranked = ghats.filter((g) => g.rank != null).sort((a, b) => a.rank - b.rank);
  const unranked = ghats.filter((g) => g.rank == null);
  const basis = pick(state.data, 'rank_basis');

  root.append(
    h('section', { class: 'section reveal' },
      h('header', { class: 'section-head' },
        h('h2', null, t('rankingTitle')),
        h('p', { class: 'lead' }, t('rankingIntro')),
        basis ? h('p', { class: 'basis' }, h('strong', null, `${t('rankBasis')}: `), basis) : null),
      h('div', { class: 'rank-head', 'aria-hidden': 'true' },
        h('span', null, '#'), h('span', null, ''), h('span', null, t('riskLabel')), h('span', null, t('confLabel')), h('span', null, t('complLabel'))),
      h('ol', { class: 'rank-list' }, ranked.map((g, i) => rankRow(g, i))),
      unranked.length
        ? h('div', { class: 'unranked' },
          h('h3', null, t('unrankedTitle')),
          h('ul', { class: 'rank-list' }, unranked.map((g, i) => rankRow(g, ranked.length + i))))
        : null));
}

function rankRow(g, i) {
  const reasons = pickList(g.risk, 'reasons');
  const rankLabel = g.rank == null ? '—' : `${g.rank}${g.tied ? '=' : ''}`;
  return h('li', { class: 'rank-row glass', style: { '--i': i } },
    h('a', { class: 'rank-link', href: `#detail/${encodeURIComponent(g.site_id)}`, 'aria-label': `${siteName(g)} — ${t('open')}` }),
    h('div', { class: `rank-num${g.rank == null ? ' rank-none' : ''}`, title: g.tied ? t('tied') : null }, rankLabel),
    h('div', { class: 'rank-main' },
      h('div', { class: 'rank-title' }, h('strong', null, siteName(g)), warnChip(g)),
      h('div', { class: 'rank-sub' }, (state.lang === 'hi' && g.water_body_hi) || g.water_body || ''),
      h('p', { class: 'rank-reason' }, g.rank == null ? (pick(g, 'rank_excluded_reason') || t('noReason')) : (reasons[0] || t('noReason')))),
    h('div', { class: 'rank-cell', 'data-label': t('riskLabel') }, riskBadge(g.risk?.level)),
    h('div', { class: 'rank-cell', 'data-label': t('confLabel') }, confBadge(g.evidence_confidence?.level)),
    h('div', { class: 'rank-cell rank-compl', 'data-label': t('complLabel') }, completenessBar(g.completeness, { compact: true })));
}
