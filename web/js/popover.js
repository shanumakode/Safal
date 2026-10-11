// Source-traceability dialog for a single reading.

import { h } from './dom.js';
import { state, sourceById, parameterById } from './state.js';
import { t, pick, siteName } from './i18n.js';
import { statusInfo, verdictInfo, displayVerdict, paramName } from './labels.js';

let dialog = null;

// Resolve a repo-relative PDF path against the repo root. index.html lives at
// <root>/web/, so "../" is the repo root both locally (node web/tools/serve.mjs)
// and on GitHub Pages served from the repository root.
export function pdfHref(source, page) {
  if (!source?.repo_path) return null;
  const rootUrl = new URL('../', location.href);
  const url = new URL(source.repo_path.split('/').map(encodeURIComponent).join('/'), rootUrl);
  return url.href + (Number.isInteger(page) ? `#page=${page}` : '');
}

export function openReading(reading, ghat) {
  if (!dialog) {
    dialog = h('dialog', { class: 'reading-dialog glass', 'aria-labelledby': 'rd-title' });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
  }
  const st = statusInfo(reading.status);
  const dv = displayVerdict(reading);
  const vi = verdictInfo(dv.verdict);
  const src = sourceById(reading.source_id);
  const param = parameterById(reading.parameter_id);
  const href = pdfHref(src, reading.source_page);

  const valueNode = st.key === 'numeric'
    ? h('span', { class: 'rd-value' }, String(reading.value), reading.unit_assumed ? h('small', null, ` ${reading.unit_assumed}*`) : null)
    : h('span', { class: `rd-status ${st.tone}` }, st.label);

  const rows = [
    [t('popValue'), valueNode],
    [t('popPrinted'), reading.is_synthetic ? h('span', { class: 'muted' }, '—') : h('code', null, reading.value_as_printed ? reading.value_as_printed : t('popPrintedBlank'))],
    param?.unit_assumed || reading.unit_assumed ? [t('popUnit'), reading.unit_assumed || param.unit_assumed] : null,
    [t('popVerdict'), h('span', { class: `badge ${vi.tone}` }, vi.label)],
    [t('popSource'), src ? (src.file || src.source_id) : (reading.source_id || '—')],
    [t('popPage'), Number.isInteger(reading.source_page) ? String(reading.source_page) : h('span', { class: 'muted' }, t('popNoPage'))],
    [t('popSite'), reading.site_as_printed ? h('code', null, reading.site_as_printed) : h('span', { class: 'muted' }, '—')],
    [t('popId'), h('code', { class: 'rd-id' }, reading.reading_id || '—')],
  ].filter(Boolean);

  const links = [];
  if (src?.is_mock_source) links.push(h('p', { class: 'rd-mock' }, t('popMockSource')));
  if (href) links.push(h('a', { class: 'btn btn-primary', href, target: '_blank', rel: 'noopener' }, t('popOpenPdf', { p: reading.source_page })));
  if (src?.official_url) links.push(h('a', { class: 'btn', href: src.official_url, target: '_blank', rel: 'noopener noreferrer' }, t('popOfficial')));

  dialog.replaceChildren(
    h('div', { class: 'rd-head' },
      h('div', null,
        h('p', { class: 'rd-kicker' }, `${siteName(ghat)} · ${reading.year} ${t(`festival_${reading.festival}`)} · ${t(`phaseLong_${reading.phase}`)}`),
        h('h3', { id: 'rd-title' }, paramName(reading.parameter_id, state.lang))),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('close'), onclick: () => dialog.close() }, '✕')),
    state.mock ? h('p', { class: 'rd-mockline' }, 'MOCK / NOT REAL RESULTS') : null,
    h('dl', { class: 'rd-grid' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
    reading.is_synthetic ? h('p', { class: 'rd-note' }, t('popSynthetic')) : null,
    pick(reading, 'note') ? h('p', { class: 'rd-note' }, pick(reading, 'note')) : null,
    dv.overridden ? h('p', { class: 'rd-guard' }, t('popGuard', { v: dv.fileVerdict, shown: vi.label })) : null,
    links.length ? h('div', { class: 'rd-links' }, links) : null);

  dialog.showModal();
}
