// Animated night-lake hero on a 2D canvas: layered wave lines, a shimmering
// moon reflection, ghat-step silhouette with diya lights, expanding ripples
// and drifting particles. Pauses when off-screen or the tab is hidden; draws a
// single still frame when reduced motion is on.

export function createWater(canvas, { isReduced }) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, raf = 0, visible = true;
  let particles = [];
  let ripples = [];
  let lastSpawn = 0;
  let shore = [];
  let lamps = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    if (isReduced()) draw(4000);
  }

  function seed() {
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const n = Math.round(Math.min(70, w / 18));
    particles = Array.from({ length: n }, () => ({
      x: rnd() * w, y: rnd() * h, r: 0.4 + rnd() * 1.3,
      vx: (rnd() - 0.5) * 0.12, vy: -0.03 - rnd() * 0.08, a: 0.12 + rnd() * 0.4, ph: rnd() * 6.28,
    }));
    // Far shore: stepped ghat silhouette with small shrine domes and trees.
    const horizon = h * 0.5;
    shore = [];
    let x = 0;
    while (x < w + 40) {
      const kind = rnd();
      const width = 30 + rnd() * 80;
      if (kind < 0.18) shore.push({ type: 'dome', x, width: width * 0.6, height: 18 + rnd() * 22 });
      else if (kind < 0.55) shore.push({ type: 'tree', x, width, height: 10 + rnd() * 26 });
      else shore.push({ type: 'steps', x, width, height: 6 + rnd() * 10 });
      x += width * (kind < 0.18 ? 0.6 : 1);
    }
    lamps = Array.from({ length: Math.round(w / 90) }, () => ({ x: rnd() * w, y: horizon - 2 - rnd() * 6, ph: rnd() * 6.28 }));
    ripples = [];
  }

  function spawnRipple(x, y, now) {
    ripples.push({ x, y, born: now });
    if (ripples.length > 14) ripples.shift();
  }

  function drawShore(horizon) {
    ctx.fillStyle = '#02090b';
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (const p of shore) {
      if (p.type === 'steps') {
        const steps = 3;
        for (let i = 0; i <= steps; i++) ctx.lineTo(p.x + (p.width * i) / steps, horizon - (p.height * (steps - i)) / steps - 3);
      } else if (p.type === 'tree') {
        ctx.lineTo(p.x, horizon - 4);
        ctx.quadraticCurveTo(p.x + p.width * 0.15, horizon - p.height * 1.2, p.x + p.width * 0.5, horizon - p.height);
        ctx.quadraticCurveTo(p.x + p.width * 0.85, horizon - p.height * 1.2, p.x + p.width, horizon - 4);
      } else {
        const cx = p.x + p.width / 2;
        ctx.lineTo(p.x, horizon - 4);
        ctx.lineTo(p.x, horizon - p.height * 0.55);
        ctx.quadraticCurveTo(cx, horizon - p.height * 1.25, p.x + p.width, horizon - p.height * 0.55);
        ctx.lineTo(cx + 1, horizon - p.height * 0.55);
        ctx.lineTo(p.x + p.width, horizon - 4);
      }
    }
    ctx.lineTo(w, horizon);
    ctx.closePath();
    ctx.fill();
  }

  function draw(now) {
    const tt = now / 1000;
    const horizon = h * 0.5;

    let g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, '#01080a');
    g.addColorStop(1, '#0a2b30');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, horizon);

    const mx = w * 0.74, my = horizon * 0.38;
    g = ctx.createRadialGradient(mx, my, 0, mx, my, h * 0.45);
    g.addColorStop(0, 'rgba(180,245,240,0.22)');
    g.addColorStop(0.08, 'rgba(120,220,220,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(225,252,250,0.9)';
    ctx.beginPath(); ctx.arc(mx, my, Math.max(6, h * 0.022), 0, Math.PI * 2); ctx.fill();

    drawShore(horizon);

    g = ctx.createLinearGradient(0, horizon, 0, h);
    g.addColorStop(0, '#0a3237');
    g.addColorStop(0.5, '#052025');
    g.addColorStop(1, '#020d10');
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, w, h - horizon);

    // Moon reflection: horizontal glints that widen with distance from the horizon.
    for (let i = 0; i < 64; i++) {
      const p = i / 64;
      const y = horizon + Math.pow(p, 1.5) * (h - horizon);
      const amp = 4 + (y - horizon) * 0.06;
      const len = (8 + (y - horizon) * 0.22) * (0.55 + 0.45 * Math.sin(tt * 1.4 + i * 1.3));
      const x = mx + Math.sin(tt * 0.9 + i * 0.7) * amp;
      ctx.fillStyle = `rgba(170,240,236,${0.32 * (1 - p)})`;
      ctx.fillRect(x - len / 2, y, len, 1 + p * 1.6);
    }

    // Diya lamps on the shore with wobbling reflections.
    for (const l of lamps) {
      const flick = 0.7 + 0.3 * Math.sin(tt * 6 + l.ph);
      ctx.fillStyle = `rgba(255,190,110,${0.75 * flick})`;
      ctx.beginPath(); ctx.arc(l.x, l.y, 1.4, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 7; k++) {
        const ry = horizon + 3 + k * 5;
        ctx.fillStyle = `rgba(255,180,100,${0.16 * flick * (1 - k / 7)})`;
        ctx.fillRect(l.x - 2 + Math.sin(tt * 2 + k + l.ph) * 2, ry, 4, 1.2);
      }
    }

    // Wave lines.
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const p = i / 24;
      const y0 = horizon + Math.pow(p, 1.7) * (h - horizon) + 2;
      ctx.strokeStyle = `rgba(94,234,212,${0.025 + 0.09 * p})`;
      ctx.beginPath();
      for (let x = 0; x <= w + 16; x += 16) {
        const y = y0 + Math.sin(x * (0.012 / (0.3 + p)) + tt * (0.5 + p) + i) * (0.8 + p * 4)
          + Math.sin(x * 0.03 - tt * 0.7 + i * 1.7) * (0.4 + p * 1.6);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Ripples (perspective-squashed ellipses).
    if (!isReduced() && now - lastSpawn > 1400) {
      lastSpawn = now;
      spawnRipple(w * (0.1 + Math.random() * 0.8), horizon + (h - horizon) * (0.2 + Math.random() * 0.7), now);
    }
    for (const r of ripples) {
      const age = (now - r.born) / 1000;
      if (age > 4) continue;
      const depth = (r.y - horizon) / (h - horizon);
      for (let k = 0; k < 3; k++) {
        const a = age - k * 0.35;
        if (a <= 0) continue;
        const rx = a * 38 * (0.4 + depth);
        ctx.strokeStyle = `rgba(150,240,235,${Math.max(0, 0.32 * (1 - a / 3.6))})`;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, rx, rx * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Particles (mist / pollen glints).
    for (const p of particles) {
      if (!isReduced()) {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
        if (p.x < -4) p.x = w + 4; else if (p.x > w + 4) p.x = -4;
      }
      ctx.fillStyle = `rgba(160,245,235,${p.a * (0.6 + 0.4 * Math.sin(tt * 1.5 + p.ph))})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function loop(now) {
    raf = 0;
    if (isReduced()) { draw(4000); return; }
    if (visible && !document.hidden) draw(now);
    raf = requestAnimationFrame(loop);
  }

  function start() { if (!raf) raf = requestAnimationFrame(loop); }

  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(canvas);
  window.addEventListener('resize', resize);
  canvas.parentElement.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const y = e.clientY - r.top;
    if (y > h * 0.5 && !isReduced()) spawnRipple(e.clientX - r.left, y, performance.now());
  });

  resize();
  start();
  return { refresh() { resize(); start(); } };
}
