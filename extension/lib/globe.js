// Dependency-free dotted globe on <canvas>: orthographic projection, glowing country markers,
// electric arcs from "you", drag to spin. Pauses when off-screen; static with reduced motion.

const RAD = Math.PI / 180;

/** Pure: orthographic projection. Returns { x, y, visible } in unit-radius space. */
export function project(lat, lon, lon0, lat0) {
  const phi = lat * RAD;
  const lam = (lon - lon0) * RAD;
  const phi0 = lat0 * RAD;
  const cosc = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lam);
  return {
    x: Math.cos(phi) * Math.sin(lam),
    y: -(Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lam)),
    visible: cosc > 0,
    depth: cosc
  };
}

const toVec = (lat, lon) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
const toLatLon = ([x, y, z]) => [Math.asin(Math.max(-1, Math.min(1, z))) / RAD, Math.atan2(y, x) / RAD];

/** Pure: points along the great circle from a to b ([lat, lon]), lifted into an arc. */
export function arcPoints(a, b, steps = 48) {
  const va = toVec(...a);
  const vb = toVec(...b);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let v;
    if (omega < 1e-6) v = va;
    else {
      const s1 = Math.sin((1 - t) * omega) / Math.sin(omega);
      const s2 = Math.sin(t * omega) / Math.sin(omega);
      v = [va[0] * s1 + vb[0] * s2, va[1] * s1 + vb[1] * s2, va[2] * s1 + vb[2] * s2];
    }
    const [lat, lon] = toLatLon(v);
    pts.push({ lat, lon, lift: 1 + Math.sin(Math.PI * t) * Math.min(0.28, omega * 0.18) });
  }
  return pts;
}

function css(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 * @param {Array<[number,number]>} opts.dots land dots [lat, lon]
 * @param {Record<string,[number,number]>} opts.centroids ISO alpha-2 → [lat, lon]
 * @param {Array<{code:string,count:number}>} [opts.highlights]
 * @param {string|null} [opts.you]
 * @param {(hit: null | {code:string, count?:number, you?:boolean, x:number, y:number}) => void} [opts.onHover]
 */
export function createGlobe(canvas, { dots, centroids, highlights = [], you = null, onHover }) {
  const ctx = canvas.getContext('2d');
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const youPos = you && centroids[you];
  let lon0 = youPos ? youPos[1] : 20;
  let lat0 = youPos ? Math.max(-35, Math.min(35, youPos[0] * 0.6)) : 18;
  let marks = [];
  let arcs = [];
  let dragging = null;
  let raf = 0;
  let visible = true;
  let t0 = performance.now();
  let lastHit = null;
  const max = () => Math.max(1, ...marks.map((m) => m.count));

  function setHighlights(list) {
    marks = list.filter((h) => centroids[h.code]).map((h) => ({ ...h, pos: centroids[h.code] }));
    arcs = youPos ? marks.filter((m) => m.code !== you).slice(0, 6).map((m) => arcPoints(youPos, m.pos)) : [];
    if (reduced) draw(0);
  }

  function size() {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || w;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    return { w: canvas.width, h: canvas.height, dpr };
  }

  function draw(now) {
    const { w, h, dpr } = size();
    const R = Math.min(w, h) * 0.44;
    const cx = w / 2;
    const cy = h / 2;
    const accent = css('--accent', '#7d70ff');
    const accent2 = css('--accent-2', '#19b8d4');
    const land = css('--globe-land', 'rgba(125,112,255,0.55)');
    ctx.clearRect(0, 0, w, h);

    // Atmosphere + ocean.
    const glow = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.18);
    glow.addColorStop(0, 'rgba(25,184,212,0.28)');
    glow.addColorStop(1, 'rgba(25,184,212,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
    ctx.fill();
    const ocean = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
    ocean.addColorStop(0, css('--globe-ocean-1', 'rgba(91,75,255,0.18)'));
    ocean.addColorStop(1, css('--globe-ocean-2', 'rgba(20,20,40,0.05)'));
    ctx.fillStyle = ocean;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // Land dots (front hemisphere only, dimmer toward the limb).
    ctx.fillStyle = land;
    const dotR = Math.max(1, R / 150);
    for (const [lat, lon] of dots) {
      const p = project(lat, lon, lon0, lat0);
      if (!p.visible) continue;
      ctx.globalAlpha = 0.25 + 0.75 * p.depth;
      ctx.beginPath();
      ctx.arc(cx + p.x * R, cy + p.y * R, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Electric arcs from "you" to the top countries, with a travelling spark.
    const phase = reduced ? 0.6 : ((now - t0) / 2200) % 1;
    ctx.lineWidth = 1.4 * dpr;
    for (const pts of arcs) {
      ctx.strokeStyle = accent2;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      let pen = false;
      for (const q of pts) {
        const p = project(q.lat, q.lon, lon0, lat0);
        if (!p.visible && q.lift < 1.05) {
          pen = false;
          continue;
        }
        const x = cx + p.x * R * q.lift;
        const y = cy + p.y * R * q.lift;
        pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        pen = true;
      }
      ctx.stroke();
      const q = pts[Math.floor(phase * (pts.length - 1))];
      const p = project(q.lat, q.lon, lon0, lat0);
      if (p.visible || q.lift > 1.05) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.shadowColor = accent2;
        ctx.shadowBlur = 12 * dpr;
        ctx.beginPath();
        ctx.arc(cx + p.x * R * q.lift, cy + p.y * R * q.lift, 2.2 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1;

    // Country markers: size by share, gentle pulse.
    const pulse = reduced ? 0.5 : (Math.sin(now / 420) + 1) / 2;
    const hits = [];
    const m = max();
    for (const mk of marks) {
      const p = project(mk.pos[0], mk.pos[1], lon0, lat0);
      if (!p.visible) continue;
      const r = (2.5 + 9 * Math.sqrt(mk.count / m)) * dpr;
      const x = cx + p.x * R;
      const y = cy + p.y * R;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.18 + 0.12 * pulse;
      ctx.beginPath();
      ctx.arc(x, y, r * (1.6 + 0.4 * pulse), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      hits.push({ code: mk.code, count: mk.count, x: x / dpr, y: y / dpr, r: Math.max(8, r / dpr) });
    }
    ctx.globalAlpha = 1;

    // "You are (probably) here".
    if (youPos) {
      const p = project(youPos[0], youPos[1], lon0, lat0);
      if (p.visible) {
        const x = cx + p.x * R;
        const y = cy + p.y * R;
        ctx.strokeStyle = '#ffd84d';
        ctx.lineWidth = 2 * dpr;
        ctx.globalAlpha = 1 - pulse * 0.6;
        ctx.beginPath();
        ctx.arc(x, y, (5 + 10 * pulse) * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffd84d';
        ctx.beginPath();
        ctx.arc(x, y, 3.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        hits.push({ code: you, you: true, x: x / dpr, y: y / dpr, r: 10 });
      }
    }
    canvas._hits = hits;
  }

  function loop(now) {
    if (!dragging) lon0 = (lon0 + 0.06) % 360;
    draw(now);
    raf = visible ? requestAnimationFrame(loop) : 0;
  }

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf && !reduced) raf = requestAnimationFrame(loop);
  });
  io.observe(canvas);

  const onDown = (e) => {
    dragging = { x: e.clientX, y: e.clientY, lon0, lat0 };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (dragging) {
      const k = 180 / (canvas.clientWidth || 320);
      lon0 = dragging.lon0 - (e.clientX - dragging.x) * k;
      lat0 = Math.max(-70, Math.min(70, dragging.lat0 + (e.clientY - dragging.y) * k));
      if (reduced) draw(0);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = (canvas._hits || []).find((h) => (h.x - x) ** 2 + (h.y - y) ** 2 <= h.r ** 2) || null;
    if (hit?.code !== lastHit?.code || hit?.you !== lastHit?.you) onHover?.(hit);
    lastHit = hit;
  };
  const onUp = () => (dragging = null);
  const onLeave = () => {
    lastHit = null;
    onHover?.(null);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  setHighlights(highlights);
  if (reduced) draw(0);
  else raf = requestAnimationFrame(loop);

  return {
    setHighlights,
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
    }
  };
}
