// Animated SVG chart of one parameter at one ghat across festival-years and
// phases. Point colours come from the (guarded) verdict in the file; the
// Class B limit line is drawn from class_b_limits for reference only.

import { s, h } from './dom.js';
import { state, limitFor, parameterById } from './state.js';
import { t } from './i18n.js';
import { statusInfo, verdictInfo, displayVerdict } from './labels.js';
import { openReading } from './popover.js';

export const PHASES = ['pre', 'during', 'after'];
const FEST_ORDER = { Ganesh: 0, Durga: 1 };

// Distinct (year, festival) pairs present anywhere in the file, chronological.
export function festivalYears() {
  const seen = new Map();
  for (const g of state.data.ghats) for (const r of g.readings) seen.set(`${r.year}|${r.festival}`, { year: r.year, festival: r.festival });
  return [...seen.values()].sort((a, b) => a.year - b.year || (FEST_ORDER[a.festival] ?? 9) - (FEST_ORDER[b.festival] ?? 9));
}

const COLORS = { breach: '#ff6161', within: '#8fb3d9', no_class_b_limit: '#7fd8d0', not_assessable: '#8a979b', unknown: '#8a979b' };

export function renderChart(ghat, parameterId) {
  const param = parameterById(parameterId);
  const lim = limitFor(parameterId);
  const fys = festivalYears();
  const byKey = new Map(ghat.readings.filter((r) => r.parameter_id === parameterId).map((r) => [`${r.year}|${r.festival}|${r.phase}`, r]));

  const W = 920, H = 320, L = 58, R = 120, T = 22, B = 62;
  const pw = W - L - R, ph = H - T - B;
  const gw = pw / Math.max(1, fys.length);
  const slotX = (fi, pi) => L + gw * fi + gw * (0.2 + pi * 0.3);

  const nums = [...byKey.values()].filter((r) => r.status === 'numeric' && typeof r.value === 'number').map((r) => r.value);
  const limVals = lim ? [lim.min, lim.max].filter((v) => typeof v === 'number') : [];
  const all = [...nums, ...limVals];
  let lo = 0, hi = all.length ? Math.max(...all) * 1.15 : 1;
  if (parameterId === 'ph' && all.length) { lo = Math.floor(Math.min(...all) - 0.5); hi = Math.ceil(Math.max(...all) + 0.5); }
  if (hi <= lo) hi = lo + 1;
  const y = (v) => T + ph - ((v - lo) / (hi - lo)) * ph;

  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${t('chartTitle')}: ${param?.name_en ?? parameterId}` });
  svg.append(s('defs', null,
    s('pattern', { id: 'gw-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      s('rect', { width: 6, height: 6, fill: 'rgba(138,151,155,0.06)' }),
      s('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'rgba(138,151,155,0.45)', 'stroke-width': 1.4 }))));

  // Festival bands + labels.
  fys.forEach((fy, fi) => {
    if (fi % 2 === 0) svg.append(s('rect', { x: L + gw * fi, y: T, width: gw, height: ph, fill: 'rgba(94,234,212,0.035)' }));
    svg.append(s('text', { x: L + gw * fi + gw / 2, y: H - B + 34, class: 'ch-fy' }, String(fy.year)));
    svg.append(s('text', { x: L + gw * fi + gw / 2, y: H - B + 50, class: 'ch-fy-sub' }, t(`festival_${fy.festival}`)));
    PHASES.forEach((p, pi) => svg.append(s('text', { x: slotX(fi, pi), y: H - B + 16, class: 'ch-phase' }, t(`phase_${p}`).slice(0, 3))));
  });

  // Y grid.
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4;
    svg.append(s('line', { x1: L, x2: L + pw, y1: y(v), y2: y(v), class: 'ch-grid' }));
    svg.append(s('text', { x: L - 8, y: y(v) + 4, class: 'ch-ytick' }, fmt(v)));
  }
  if (param?.unit_assumed) svg.append(s('text', { x: L - 8, y: T - 8, class: 'ch-ytick' }, `${param.unit_assumed}*`));

  // Limit lines.
  if (lim && param?.tested_in_data !== false) {
    const lines = [];
    if (typeof lim.min === 'number') lines.push([lim.min, t('chartLimitMin', { v: `${lim.min}${lim.unit ? ' ' + lim.unit : ''}` })]);
    if (typeof lim.max === 'number') lines.push([lim.max, t('chartLimitMax', { v: `${lim.max}${lim.unit ? ' ' + lim.unit : ''}` })]);
    for (const [v, label] of lines) {
      if (v < lo || v > hi) continue;
      svg.append(s('line', { x1: L, x2: L + pw, y1: y(v), y2: y(v), class: 'ch-limit' }));
      svg.append(s('text', { x: L + pw + 8, y: y(v) + 4, class: 'ch-limit-label' }, label));
    }
  }

  // Missing / BDL / unknown markers and numeric points.
  let n = 0;
  fys.forEach((fy, fi) => {
    const pts = [];
    PHASES.forEach((p, pi) => {
      const r = byKey.get(`${fy.year}|${fy.festival}|${p}`);
      const x = slotX(fi, pi);
      if (!r) return;
      const st = statusInfo(r.status);
      const click = () => openReading(r, ghat);
      const titleText = `${fy.year} ${fy.festival} ${p}: ${st.key === 'numeric' ? r.value : st.label}`;
      if (st.key === 'numeric' && typeof r.value === 'number') {
        const dv = displayVerdict(r);
        const vi = verdictInfo(dv.verdict);
        pts.push({ x, y: y(r.value), r, color: COLORS[vi.key], titleText, click });
      } else if (st.key === 'bdl') {
        const yy = T + ph - 8;
        svg.append(s('g', { class: 'ch-mark pop', style: `animation-delay:${n++ * 25}ms`, tabindex: 0, role: 'button', onclick: click, onkeydown: keyClick(click) },
          s('title', null, titleText),
          s('path', { d: `M${x} ${yy - 6} L${x + 6} ${yy} L${x} ${yy + 6} L${x - 6} ${yy} Z`, class: 'ch-bdl' }),
          s('text', { x, y: yy - 10, class: 'ch-bdl-label' }, 'BDL')));
      } else {
        svg.append(s('g', { class: 'ch-mark', tabindex: 0, role: 'button', onclick: click, onkeydown: keyClick(click) },
          s('title', null, titleText),
          s('rect', { x: x - gw * 0.13, y: T, width: gw * 0.26, height: ph, fill: 'url(#gw-hatch)', class: st.key === 'not_reported' ? 'ch-miss ch-miss-dash' : 'ch-miss' }),
          s('text', { x, y: T + ph / 2, class: 'ch-miss-label' }, st.short || '?')));
      }
    });
    // Connect consecutive numeric phases within one festival-year only.
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const adjacent = PHASES.indexOf(b.r.phase) - PHASES.indexOf(a.r.phase) === 1;
      if (adjacent) svg.append(s('path', { d: `M${a.x} ${a.y} L${b.x} ${b.y}`, class: 'ch-line draw', pathLength: 1 }));
    }
    for (const p of pts) {
      svg.append(s('g', { class: 'ch-pt pop', style: `animation-delay:${n++ * 25}ms`, tabindex: 0, role: 'button', onclick: p.click, onkeydown: keyClick(p.click) },
        s('title', null, p.titleText),
        s('circle', { cx: p.x, cy: p.y, r: 11, fill: 'transparent' }),
        s('circle', { cx: p.x, cy: p.y, r: 5, fill: p.color, class: 'ch-dot' })));
    }
  });

  const note = !param?.has_class_b_limit ? t('chartNoLimit') : param?.tested_in_data === false ? t('chartNotTested') : null;
  return h('div', { class: 'chart-wrap' }, svg, note ? h('p', { class: 'chart-note' }, note) : null);
}

function keyClick(fn) { return (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } }; }
function fmt(v) { return Math.abs(v) >= 100 ? Math.round(v).toString() : Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(Math.abs(v) < 1 ? 2 : 1); }
