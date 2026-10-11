// Boot: load data (real by default, MOCK only with ?mock=1), validate, render.
// There is deliberately NO automatic fallback from real data to mock data.

import { h, $ } from './dom.js';
import { state, update, subscribe } from './state.js';
import { t, formatDate } from './i18n.js';
import { validateContract } from './contract.js';
import { createWater } from './hero-water.js';
import { renderRanking } from './view-ranking.js';
import { renderExplorer } from './view-explorer.js';
import { renderDetail } from './view-detail.js';
import { renderBrief } from './view-brief.js';
import { renderAbout } from './view-about.js';

const REAL_URL = 'data/ghat_scores.json';
const MOCK_URL = 'data/ghat_scores.mock.json';
const VISARJAN = new Date('2026-10-20T00:00:00+05:30');
const TABS = [
  ['ranking', 'tabRanking'],
  ['explorer', 'tabExplorer'],
  ['detail', 'tabDetail'],
  ['brief', 'tabBrief'],
  ['about', 'tabAbout'],
];

let water = null;
let cleanupView = null;
let fatal = null;

function initPrefs() {
  const savedLang = localStorage.getItem('gw-lang');
  const savedMotion = localStorage.getItem('gw-motion');
  const osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  update({
    lang: savedLang === 'hi' ? 'hi' : 'en',
    reducedMotion: savedMotion ? savedMotion === 'reduced' : osReduced,
  });
}

function applyPrefs() {
  document.documentElement.lang = state.lang;
  document.documentElement.classList.toggle('reduce-motion', state.reducedMotion);
  document.documentElement.classList.toggle('motion-forced', !state.reducedMotion);
  $('#lang-en').setAttribute('aria-pressed', String(state.lang === 'en'));
  $('#lang-hi').setAttribute('aria-pressed', String(state.lang === 'hi'));
  const mb = $('#motion-btn');
  mb.textContent = state.reducedMotion ? t('motionOff') : t('motionOn');
  mb.setAttribute('aria-pressed', String(state.reducedMotion));
}

function renderHero() {
  $('#hero-kicker').textContent = t('heroKicker');
  $('#hero-title').textContent = t('heroTitle');
  $('#hero-sub').textContent = t('heroSub');
  document.title = `${t('appTitle')}${state.mock ? ' · MOCK' : ''}`;
  const days = Math.ceil((VISARJAN - new Date()) / 86400000);
  const countdown = days > 1 ? t('daysLeft', { n: days }) : days === 1 ? t('dayLeft') : days === 0 ? t('today') : null;
  const meta = $('#hero-meta');
  meta.replaceChildren(...[
    h('span', { class: 'pill pill-accent' }, t('visarjanDate'), countdown ? h('b', null, ` · ${countdown}`) : null),
    state.data ? h('span', { class: 'pill' }, t('metaClass', { c: state.data.cpcb_class_used ?? '?' })) : null,
    state.data ? h('span', { class: 'pill' }, t('metaGhats', { n: state.data.ghats.length })) : null,
    state.data?.sources ? h('span', { class: 'pill' }, t('metaSources', { n: state.data.sources.length })) : null,
    state.data?.generated_at ? h('span', { class: 'pill' }, t('metaGenerated', { d: formatDate(state.data.generated_at) })) : null,
  ].filter(Boolean));
}

function renderBanner() {
  const b = $('#mock-banner');
  if (!state.mock) { b.hidden = true; document.body.classList.remove('has-banner'); return; }
  b.hidden = false;
  document.body.classList.add('has-banner');
  const why = state.data && state.data.is_mock !== true && state.data.is_mock !== false ? ' (is_mock flag missing)' : '';
  b.replaceChildren(
    h('strong', null, 'MOCK / NOT REAL RESULTS'),
    h('span', null, ' · नकली डेटा / असली नतीजे नहीं · '),
    h('span', { class: 'mock-sub' }, `Fake ghats (MOCK Ghat A–G) and invented numbers for interface testing only${why}.`));
}

function renderTabs(active) {
  const nav = $('#tabs');
  nav.replaceChildren(...TABS.map(([id, key]) => h('a', {
    href: `#${id}`, role: 'tab', class: `tab${active === id ? ' active' : ''}`, 'aria-selected': String(active === id),
  }, t(key))));
  nav.hidden = !state.data;
}

function route() {
  if (fatal) { renderFatal(); return; }
  if (!state.data) return;
  const [view, arg] = decodeURIComponent(location.hash.replace(/^#/, '')).split('/');
  const active = TABS.some(([id]) => id === view) ? view : 'ranking';
  renderTabs(active);
  if (cleanupView) { cleanupView(); cleanupView = null; }
  const app = $('#app');
  app.replaceChildren();
  const views = { ranking: renderRanking, explorer: renderExplorer, detail: (root) => renderDetail(root, arg), brief: renderBrief, about: renderAbout };
  cleanupView = views[active](app) || null;
}

function rerender() {
  applyPrefs();
  renderHero();
  renderBanner();
  water?.refresh();
  route();
}

function renderFatal() {
  const { kind, url, details } = fatal;
  const cmd = (text) => h('pre', { class: 'cmd' }, text);
  const mockLink = h('a', { class: 'btn', href: '?mock=1' }, `${location.pathname}?mock=1`);
  const content = {
    file: [t('fatalFileTitle'), t('fatalFileBody'), cmd('node web/tools/serve.mjs')],
    realMissing: [t('fatalRealMissingTitle'), t('fatalRealMissingBody'), [h('p', null, t('fatalMockHint')), mockLink]],
    mockMissing: [t('fatalMockMissingTitle'), t('fatalMockMissingBody'), cmd('node web/tools/generate-mock.mjs')],
    badJson: [t('fatalBadJsonTitle'), t('fatalBadJsonBody'), null],
    contract: [t('fatalContractTitle'), t('fatalContractBody'), h('ul', { class: 'check-list' }, (details || []).map((d) => h('li', null, d)))],
    network: [t('fatalNetworkTitle'), t('fatalNetworkBody'), cmd('node web/tools/serve.mjs')],
  }[kind];
  renderTabs(null);
  $('#app').replaceChildren(h('section', { class: 'section' },
    h('article', { class: 'glass card fatal' },
      h('p', { class: 'kicker' }, url || ''),
      h('h2', null, content[0]),
      h('p', null, content[1]),
      content[2])));
}

async function load() {
  const mockRequested = new URLSearchParams(location.search).get('mock') === '1';
  const url = mockRequested ? MOCK_URL : REAL_URL;
  update({ mock: mockRequested, dataUrl: `web/${url}` });
  if (location.protocol === 'file:') { fatal = { kind: 'file' }; return; }
  let res;
  try { res = await fetch(url, { cache: 'no-store' }); } catch { fatal = { kind: 'network', url }; return; }
  if (!res.ok) { fatal = { kind: mockRequested ? 'mockMissing' : 'realMissing', url: `web/${url}` }; return; }
  let json;
  try { json = await res.json(); } catch { fatal = { kind: 'badJson', url }; return; }
  const check = validateContract(json);
  if (check.errors.length) { fatal = { kind: 'contract', url, details: check.errors }; return; }
  // Banner shows if MOCK was requested OR the file does not explicitly say is_mock: false.
  update({ data: json, check, mock: mockRequested || json.is_mock !== false });
}

async function boot() {
  initPrefs();
  $('#lang-en').addEventListener('click', () => { localStorage.setItem('gw-lang', 'en'); update({ lang: 'en' }); });
  $('#lang-hi').addEventListener('click', () => { localStorage.setItem('gw-lang', 'hi'); update({ lang: 'hi' }); });
  $('#motion-btn').addEventListener('click', () => {
    const next = !state.reducedMotion;
    localStorage.setItem('gw-motion', next ? 'reduced' : 'on');
    update({ reducedMotion: next });
  });
  applyPrefs();
  water = createWater($('#hero-canvas'), { isReduced: () => state.reducedMotion });
  renderHero();
  await load();
  subscribe(rerender);
  window.addEventListener('hashchange', route);
  rerender();
}

boot();
