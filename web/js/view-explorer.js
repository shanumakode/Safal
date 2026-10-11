// Tab 2: pseudo-3D lake/ghat explorer on a 2D canvas (no external library).
// Schematic only: positions come from ghat.map_position (0..1) when present,
// otherwise ghats are grouped by water body. Pillar height/colour encode the
// scoring module's categorical risk.level — not a measurement.

import { h } from './dom.js';
import { state } from './state.js';
import { t, siteName } from './i18n.js';
import { riskBadge, warnChip } from './components.js';
import { riskInfo } from './labels.js';

const HEIGHT = { high: 0.3, elevated: 0.22, low: 0.14, insufficient_data: 0.1, unknown: 0.1 };
const COLOR = { high: '#ff6161', elevated: '#f4b04f', low: '#8fb3d9', insufficient_data: '#8a979b', unknown: '#8a979b' };
const PITCH = 0.98;
const DIST = 2.3;

export function renderExplorer(root) {
  const ghats = state.data.ghats;
  const hasPos = ghats.every((g) => g.map_position && Number.isFinite(g.map_position.x) && Number.isFinite(g.map_position.y));
  const points = layout(ghats, hasPos);
  const bodies = waterBodies(points);

  const canvas = h('canvas', { class: 'explorer-canvas', role: 'img', 'aria-label': t('explorerIntro') });
  const tip = h('div', { class: 'explorer-tip glass', hidden: true });
  const stage = h('div', { class: 'explorer-stage' }, canvas, tip,
    h('div', { class: 'explorer-ctrl' },
      h('button', { class: 'icon-btn', type: 'button', title: t('rotateLeft'), 'aria-label': t('rotateLeft'), onclick: () => nudge(-0.4) }, '⟲'),
      h('button', { class: 'icon-btn', type: 'button', title: t('resetView'), 'aria-label': t('resetView'), onclick: () => { yaw = -0.35; idleSince = performance.now(); paint(); } }, '◎'),
      h('button', { class: 'icon-btn', type: 'button', title: t('rotateRight'), 'aria-label': t('rotateRight'), onclick: () => nudge(0.4) }, '⟳')),
    h('div', { class: 'explorer-hint' }, t('explorerHint')));

  const list = h('ul', { class: 'explorer-list' }, ghats.map((g) =>
    h('li', null, h('a', {
      class: 'explorer-item glass', href: `#detail/${encodeURIComponent(g.site_id)}`,
      onmouseenter: () => { highlight = g.site_id; paint(); }, onmouseleave: () => { highlight = null; paint(); },
      onfocus: () => { highlight = g.site_id; paint(); }, onblur: () => { highlight = null; paint(); },
    },
    h('span', { class: 'explorer-item-name' }, g.rank != null ? `${g.rank}${g.tied ? '=' : ''}. ` : '— ', siteName(g)),
    h('span', { class: 'explorer-item-badges' }, riskBadge(g.risk?.level), warnChip(g))))));

  root.append(h('section', { class: 'section reveal' },
    h('header', { class: 'section-head' },
      h('h2', null, t('explorerTitle')),
      h('p', { class: 'lead' }, t('explorerIntro')),
      hasPos ? null : h('p', { class: 'basis' }, t('explorerNoPos'))),
    h('div', { class: 'explorer' }, h('div', { class: 'explorer-main glass' }, stage),
      h('aside', { class: 'explorer-side' }, h('h3', null, t('ghatList')), list))));

  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, yaw = -0.35, raf = 0, highlight = null, hover = null;
  let dragging = false, dragMoved = 0, lastX = 0, idleSince = performance.now();
  let projected = [];
  const reduced = () => state.reducedMotion;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint();
  }

  function project(x, y, z) {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const xr = x * c - y * sn;
    const yr = x * sn + y * c;
    const k = Math.min(W * 0.95, H * 1.55);
    const persp = DIST / (DIST - yr * Math.sin(PITCH));
    return { x: W / 2 + xr * k * persp, y: H * 0.56 + yr * Math.cos(PITCH) * k * persp - z * k * persp, depth: yr, s: persp };
  }

  function paint(now = performance.now()) {
    if (!W) return;
    const tt = reduced() ? 0 : now / 1000;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#04161a'); g.addColorStop(1, '#020b0d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Ground grid.
    ctx.lineWidth = 1;
    for (let i = -6; i <= 6; i++) {
      const v = i / 10;
      ctx.strokeStyle = 'rgba(94,234,212,0.06)';
      line(project(v, -0.62, 0), project(v, 0.62, 0));
      line(project(-0.62, v, 0), project(0.62, v, 0));
    }

    // Water bodies.
    for (const b of bodies) {
      const poly = (scale) => b.shape.map(([dx, dy]) => project(b.cx + dx * scale, b.cy + dy * scale, 0));
      const outer = poly(1);
      const c0 = project(b.cx, b.cy, 0);
      const grad = ctx.createRadialGradient(c0.x, c0.y, 0, c0.x, c0.y, b.r * Math.min(W, H) * 1.4);
      grad.addColorStop(0, 'rgba(20,110,118,0.75)'); grad.addColorStop(1, 'rgba(8,52,60,0.6)');
      ctx.fillStyle = grad;
      path(outer); ctx.fill();
      ctx.strokeStyle = 'rgba(110,235,225,0.55)'; ctx.lineWidth = 1.4; path(outer); ctx.stroke();
      ctx.lineWidth = 1;
      for (let k = 1; k <= 3; k++) {
        const sc = ((k / 3.4) + (tt * 0.06)) % 1;
        ctx.strokeStyle = `rgba(140,240,230,${0.16 * (1 - sc)})`;
        path(poly(sc)); ctx.stroke();
      }
      const lbl = project(b.cx, b.cy + b.r * 0.92, 0);
      ctx.fillStyle = 'rgba(160,220,220,0.55)';
      ctx.font = '500 11px system-ui, "Segoe UI", "Nirmala UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label.toUpperCase(), lbl.x, lbl.y + 14);
    }

    // Pins, far to near.
    projected = points.map((p) => {
      const key = riskInfo(p.g.risk?.level).key;
      const base = project(p.x, p.y, 0);
      const top = project(p.x, p.y, HEIGHT[key]);
      return { p, key, base, top };
    }).sort((a, b) => a.base.depth - b.base.depth);

    for (const q of projected) {
      const col = COLOR[q.key];
      const isHi = highlight === q.p.g.site_id || hover === q.p.g.site_id;
      // Base ripples.
      for (let k = 0; k < 2; k++) {
        const ph = ((tt * 0.5 + k * 0.5 + q.p.seed) % 1);
        const rr = (6 + ph * 22) * q.base.s;
        ctx.strokeStyle = hexA(col, 0.35 * (1 - ph));
        ctx.beginPath(); ctx.ellipse(q.base.x, q.base.y, rr, rr * Math.cos(PITCH), 0, 0, Math.PI * 2); ctx.stroke();
      }
      // Pillar.
      const grad = ctx.createLinearGradient(q.base.x, q.base.y, q.top.x, q.top.y);
      grad.addColorStop(0, hexA(col, 0.05)); grad.addColorStop(1, hexA(col, 0.9));
      ctx.strokeStyle = grad; ctx.lineWidth = isHi ? 4 : 3;
      if (q.key === 'insufficient_data' || q.key === 'unknown') ctx.setLineDash([4, 4]);
      line(q.base, q.top); ctx.setLineDash([]);
      // Orb.
      const r = (isHi ? 8 : 6) * q.top.s;
      const glow = ctx.createRadialGradient(q.top.x, q.top.y, 0, q.top.x, q.top.y, r * 3.2);
      glow.addColorStop(0, hexA(col, 0.55)); glow.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(q.top.x, q.top.y, r * 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q.top.x, q.top.y, r, 0, Math.PI * 2); ctx.fill();
      if (q.p.g.site_match_confidence !== 'high') {
        ctx.fillStyle = '#f4b04f'; ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('⚠', q.top.x + r + 8, q.top.y - r);
      }
      ctx.fillStyle = isHi ? '#e9fffd' : 'rgba(215,240,238,0.85)';
      ctx.font = `${isHi ? 600 : 500} 12px system-ui, "Segoe UI", "Nirmala UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(siteName(q.p.g), q.top.x, q.top.y - r - 8);
    }
  }

  function line(a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  function path(pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); }

  function loop(now) {
    raf = 0;
    if (!canvas.isConnected) return;
    if (!reduced() && !dragging && now - idleSince > 3500) yaw += 0.0011;
    if (!document.hidden) paint(now);
    if (!reduced()) raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf && !reduced()) raf = requestAnimationFrame(loop); }
  function nudge(d) { yaw += d; idleSince = performance.now(); paint(); }

  function hit(e) {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 22;
    for (const q of projected) {
      const d = Math.hypot(q.top.x - x, q.top.y - y);
      if (d < bd) { bd = d; best = q; }
    }
    return { best, x, y };
  }

  canvas.addEventListener('pointerdown', (e) => { dragging = true; dragMoved = 0; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) {
      const dx = e.clientX - lastX; lastX = e.clientX; dragMoved += Math.abs(dx);
      yaw += dx * 0.008; idleSince = performance.now();
      if (reduced()) paint();
      return;
    }
    const { best, x, y } = hit(e);
    const id = best ? best.p.g.site_id : null;
    if (id !== hover) { hover = id; if (reduced()) paint(); }
    canvas.style.cursor = best ? 'pointer' : 'grab';
    if (best) {
      const g0 = best.p.g;
      tip.replaceChildren(h('strong', null, siteName(g0)), h('div', null, riskBadge(g0.risk?.level)), warnChip(g0));
      tip.hidden = false;
      tip.style.transform = `translate(${Math.min(x + 14, W - 220)}px, ${Math.max(0, y - 20)}px)`;
    } else tip.hidden = true;
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    if (dragMoved < 5) {
      const { best } = hit(e);
      if (best) location.hash = `#detail/${encodeURIComponent(best.p.g.site_id)}`;
    }
  });
  canvas.addEventListener('pointerleave', () => { hover = null; tip.hidden = true; if (reduced()) paint(); });

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  start();

  return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf); raf = 0; };
}

function layout(ghats, hasPos) {
  if (hasPos) return ghats.map((g, i) => ({ g, x: g.map_position.x - 0.5, y: g.map_position.y - 0.5, seed: (i * 0.137) % 1 }));
  // Fallback: water bodies on a ring, ghats around each body's centre.
  const groups = [...new Set(ghats.map((g) => g.water_body || '?'))];
  return ghats.map((g, i) => {
    const gi = groups.indexOf(g.water_body || '?');
    const members = ghats.filter((x) => (x.water_body || '?') === (g.water_body || '?'));
    const mi = members.indexOf(g);
    const a = (gi / groups.length) * Math.PI * 2;
    const cx = Math.cos(a) * 0.28, cy = Math.sin(a) * 0.28;
    const b = (mi / members.length) * Math.PI * 2;
    const rr = members.length > 1 ? 0.07 : 0;
    return { g, x: cx + Math.cos(b) * rr, y: cy + Math.sin(b) * rr, seed: (i * 0.137) % 1 };
  });
}

function waterBodies(points) {
  const byBody = new Map();
  for (const p of points) {
    const k = p.g.water_body || '?';
    if (!byBody.has(k)) byBody.set(k, []);
    byBody.get(k).push(p);
  }
  return [...byBody.entries()].map(([label, ps], bi) => {
    const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length;
    const cy = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    const r = Math.max(0.09, ...ps.map((p) => Math.hypot(p.x - cx, p.y - cy) + 0.08));
    const s1 = bi * 1.7 + 0.4, s2 = bi * 2.3 + 1.1;
    const shape = Array.from({ length: 44 }, (_, i) => {
      const a = (i / 44) * Math.PI * 2;
      const rr = r * (1 + 0.1 * Math.sin(3 * a + s1) + 0.06 * Math.sin(5 * a + s2));
      return [Math.cos(a) * rr, Math.sin(a) * rr * 0.85];
    });
    return { label, cx, cy, r, shape };
  });
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
