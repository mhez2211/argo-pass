/* Sasan / Inside My Head — 30 s vertical motion reel (1080x1920, 30 fps).
 * Everything is drawn procedurally with Canvas 2D so each frame is deterministic:
 * renderFrame(f) paints frame f. render.mjs drives this in headless Chromium.
 * Scene boundaries are aligned to the phrase gaps measured in audio/narration.mp3. */

const W = 1080, H = 1920, FPS = 30, TOTAL = 918;
const C = { ch: '#080B10', iv: '#F4EFD9', co: '#2448FF', ye: '#EBF500' };
const S = {
  iv1: '#E8E1C8', iv2: '#D3CBAF', iv3: '#B5AD92', iv4: '#857E6A', iv5: '#5C5749',
  co1: '#4462FF', co2: '#1D3BE0', co3: '#1429A6', co4: '#0C186B', co5: '#070D3D', coHi: '#7088FF',
  ch1: '#0D1118', ch2: '#141922', ch3: '#1D232E',
  body: '#161A21', bodyFar: '#0D1015', shoe: '#050608', ink: '#06080B',
  rim: 'rgba(244,239,217,0.30)',
};
const ANCHOR = { x: 540, y: 1037, r: 335 }; // shared circle anchor (0.50W, 0.54H, d = 0.62W)

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const E = {
  lin: t => t,
  io: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  sine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t,
  in3: t => t * t * t,
  outBack: t => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
const seg = (f, a, b, e = E.io) => e(inv(a, b, f));
const L2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const TAU = Math.PI * 2, DEG = Math.PI / 180;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function bez(p0, p1, p2, p3, t) { const u = 1 - t; return [u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0], u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]]; }
// cubic Hermite between p0 (velocity v0) and p1 (velocity v1) over n frames
function hermite(p0, v0, p1, v1, n, t) {
  const u = clamp(t), u2 = u * u, u3 = u2 * u;
  const h00 = 2*u3 - 3*u2 + 1, h10 = u3 - 2*u2 + u, h01 = -2*u3 + 3*u2, h11 = u3 - u2;
  return [h00*p0[0] + h10*n*v0[0] + h01*p1[0] + h11*n*v1[0], h00*p0[1] + h10*n*v0[1] + h01*p1[1] + h11*n*v1[1]];
}
function hermite1(p0, v0, p1, v1, n, t) { return hermite([p0, 0], [v0, 0], [p1, 0], [v1, 0], n, t)[0]; }
// 2-bone IK: returns joint + end. bend = +1/-1 picks the side of the joint
function ik(a, t, l1, l2, bend) {
  let dx = t[0] - a[0], dy = t[1] - a[1];
  let d = Math.hypot(dx, dy);
  d = clamp(d, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const ang = Math.atan2(dy, dx);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ja = ang + bend * A;
  const j = [a[0] + l1 * Math.cos(ja), a[1] + l1 * Math.sin(ja)];
  const ea = Math.atan2(t[1] - j[1], t[0] - j[0]);
  return { j, e: [j[0] + l2 * Math.cos(ea), j[1] + l2 * Math.sin(ea)] };
}
// FK: angle measured from straight down, positive = forward (+x)
const dirv = th => [Math.sin(th), Math.cos(th)];

let ctx, grainCanvas, vignetteCanvas;

// ---------- primitives ----------
function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); }
function ell(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); }
function poly(pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }
function pline(pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); }
function fillPoly(pts, col) { poly(pts); ctx.fillStyle = col; ctx.fill(); }
function area(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }

function glowDot(x, y, r, a = 1) {
  ctx.save();
  ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 4.2);
  g.addColorStop(0, 'rgba(235,245,0,0.42)');
  g.addColorStop(0.3, 'rgba(235,245,0,0.14)');
  g.addColorStop(1, 'rgba(235,245,0,0)');
  ctx.fillStyle = g; circ(x, y, r * 4.2); ctx.fill();
  circ(x, y, r); ctx.fillStyle = C.ye; ctx.fill();
  const h = ctx.createRadialGradient(x - r * .3, y - r * .35, 0, x - r * .3, y - r * .35, r * .8);
  h.addColorStop(0, 'rgba(255,255,220,0.65)'); h.addColorStop(1, 'rgba(255,255,220,0)');
  ctx.fillStyle = h; circ(x, y, r); ctx.fill();
  ctx.restore();
}

function background(top = C.ch, bottom = C.ch) {
  if (top === bottom) { ctx.fillStyle = top; ctx.fillRect(0, 0, W, H); return; }
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

const STARS = {};
function stars(seed, n, f, opt = {}) {
  if (!STARS[seed]) {
    const r = rng(seed); STARS[seed] = [];
    for (let i = 0; i < n; i++) STARS[seed].push({ x: r() * W, y: r() * H, s: r(), p: r() * TAU, k: r() < 0.12 });
  }
  const { dx = 0, dy = 0, sc = 1, ox = 540, oy = 960, alpha = 1 } = opt;
  ctx.save(); ctx.globalAlpha = alpha;
  for (const st of STARS[seed]) {
    let x = ox + (st.x - ox) * sc + dx, y = oy + (st.y - oy) * sc + dy;
    x = ((x % W) + W) % W; y = ((y % H) + H) % H;
    const tw = 0.55 + 0.45 * Math.sin(f * 0.11 + st.p * 7);
    if (st.k) { sparkle(x, y, (7 + st.s * 9) * (0.8 + 0.2 * tw), 0.85 * tw); }
    else { ctx.fillStyle = `rgba(244,239,217,${0.25 + 0.5 * st.s * tw})`; circ(x, y, 1 + st.s * 1.8); ctx.fill(); }
  }
  ctx.restore();
}
function sparkle(x, y, r, a) {
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = C.iv;
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill(); ctx.restore();
}

// iris / segmented ring. rho = hexagon vertex radius (>=360 → reads as a clean ring with inner radius rin)
function iris(cx, cy, R, rin, rho, ang, opt = {}) {
  ctx.save();
  // depth extrusion (cut-paper thickness)
  if (opt.depth) { ctx.fillStyle = S.co4; circ(cx + opt.depth * .35, cy + opt.depth, R); ctx.fill(); }
  const base = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  base.addColorStop(0, S.co1); base.addColorStop(0.55, C.co); base.addColorStop(1, S.co2);
  ctx.fillStyle = base; circ(cx, cy, R); ctx.fill();
  ctx.save(); circ(cx, cy, R); ctx.clip();
  const twist = (1 - clamp(rho / 360)) * 0.9;
  const vs = [];
  for (let k = 0; k < 6; k++) { const a = ang + twist + k * TAU / 6; vs.push([cx + rho * Math.cos(a), cy + rho * Math.sin(a)]); }
  // hit points: edge k (v_k -> v_k+1) extended past v_k+1 to the outer circle
  const hits = [];
  for (let k = 0; k < 6; k++) {
    const a = vs[k], b = vs[(k + 1) % 6];
    const d = [b[0] - a[0], b[1] - a[1]]; const l = Math.hypot(d[0], d[1]); d[0] /= l; d[1] /= l;
    const fx = b[0] - cx, fy = b[1] - cy; const bb = fx * d[0] + fy * d[1]; const cc = fx * fx + fy * fy - R * R * 1.02;
    const s = -bb + Math.sqrt(Math.max(0, bb * bb - cc));
    hits.push([b[0] + d[0] * s, b[1] + d[1] * s]);
  }
  for (let k = 0; k < 6; k++) {
    const vk = vs[k], vk1 = vs[(k + 1) % 6], pk = hits[k], pkm = hits[(k + 5) % 6];
    ctx.beginPath(); ctx.moveTo(vk[0], vk[1]); ctx.lineTo(vk1[0], vk1[1]); ctx.lineTo(pk[0], pk[1]);
    ctx.arc(cx, cy, R * 1.01, Math.atan2(pk[1] - cy, pk[0] - cx), Math.atan2(pkm[1] - cy, pkm[0] - cx), true);
    ctx.closePath();
    const g = ctx.createLinearGradient(vk[0], vk[1], pk[0], pk[1]);
    g.addColorStop(0, k % 2 ? S.co2 : C.co); g.addColorStop(1, k % 2 ? S.co3 : S.co2);
    ctx.fillStyle = g; ctx.globalAlpha = rho < 352 ? 1 : 0.55; ctx.fill(); ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = S.co4; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
  for (let k = 0; k < 6; k++) { pline([vs[k], vs[(k + 1) % 6], hits[k]]); ctx.stroke(); }
  // aperture = hexagon ∩ inner circle
  ctx.save(); circ(cx, cy, rin); ctx.clip();
  poly(vs); const ag = ctx.createRadialGradient(cx, cy, 0, cx, cy, rin);
  ag.addColorStop(0, opt.apIn || '#05070C'); ag.addColorStop(1, opt.apOut || '#05070C');
  ctx.fillStyle = ag; ctx.fill();
  if (opt.inner) opt.inner(vs);
  ctx.restore();
  // inner bevel
  ctx.strokeStyle = 'rgba(7,13,61,0.65)'; ctx.lineWidth = 7; circ(cx, cy, rin + 2); ctx.stroke();
  ctx.restore();
  // rim highlight
  ctx.strokeStyle = 'rgba(112,136,255,0.55)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, R - 2, Math.PI * 0.95, Math.PI * 1.6); ctx.stroke();
  ctx.restore();
}

// flat band ring tipped about its horizontal diameter. part: 'back' (far, upper half) | 'front' | 'all'
function tippedRing(cx, cy, R, w, tip, part, col = C.co, thick = 16) {
  const c = Math.cos(tip), ro = R + w / 2, ri = R - w / 2;
  ctx.save();
  if (part !== 'all') { ctx.beginPath(); if (part === 'back') ctx.rect(0, 0, W, cy); else ctx.rect(0, cy, W, H); ctx.clip(); }
  const th = thick * Math.sin(tip);
  const band = (dy, fill) => {
    ctx.beginPath(); ctx.ellipse(cx, cy + dy, ro, Math.max(0.5, ro * c), 0, 0, TAU);
    ctx.ellipse(cx, cy + dy, ri, Math.max(0.3, ri * c), 0, TAU, 0, true); ctx.fillStyle = fill; ctx.fill('evenodd');
  };
  if (th > 0.5) band(th, S.co4);
  const g = ctx.createLinearGradient(cx - ro, cy - ro * c, cx + ro, cy + ro * c);
  g.addColorStop(0, col === C.co ? S.co1 : col); g.addColorStop(.5, col); g.addColorStop(1, col === C.co ? S.co2 : col);
  band(0, g);
  ctx.restore();
}

// ---------- 3D paper helper ----------
const F3 = 1400, PX = 540, PY = 960;
function cam3(theta, D, yc, xc = 0) {
  const ct = Math.cos(theta), st = Math.sin(theta);
  const p3 = (u, v, w = 0) => [u + xc, yc + v * ct - w * st, D - v * st - w * ct];
  const pr = (u, v, w = 0) => { const p = p3(u, v, w); return [PX + F3 * p[0] / p[2], PY + F3 * p[1] / p[2], p[2]]; };
  return { p3, pr, scaleAt: (u, v, w = 0) => F3 / p3(u, v, w)[2] };
}
function box3(cam, u0, u1, v0, v1, w0, w1, cols) {
  const c = (i, j, k) => cam.pr(i ? u1 : u0, j ? v1 : v0, k ? w1 : w0);
  const faces = {
    top: [c(0,0,1), c(1,0,1), c(1,1,1), c(0,1,1)], bottom: [c(0,1,0), c(1,1,0), c(1,0,0), c(0,0,0)],
    front: [c(0,1,1), c(1,1,1), c(1,1,0), c(0,1,0)], back: [c(0,0,0), c(1,0,0), c(1,0,1), c(0,0,1)],
    left: [c(0,0,0), c(0,0,1), c(0,1,1), c(0,1,0)], right: [c(1,1,0), c(1,1,1), c(1,0,1), c(1,0,0)],
  };
  const ref = Math.sign(area(faces.top)) || 1;
  for (const k of ['back', 'bottom', 'left', 'right', 'front', 'top']) {
    const f = faces[k]; if (Math.sign(area(f)) !== ref) continue;
    if (cols.stroke) { poly(f); ctx.strokeStyle = cols.stroke; ctx.lineWidth = cols.lw || 2; ctx.stroke(); if (cols.fillA) { ctx.globalAlpha = cols.fillA; ctx.fillStyle = cols.stroke; ctx.fill(); ctx.globalAlpha = 1; } }
    else fillPoly(f, cols[k] || cols.side);
  }
}

// ---------- character rig ----------
/* Pose fields: x,y = hip on screen; s = px per unit; dir = 1 (faces right) / -1; rot = body rotation (rad, clockwise);
 * lean = torso lean forward; head = head tilt; view: 'side' | 'front'; legs/arms: [far, near] each either
 * {foot:[sx,sy]} / {hand:[sx,sy]} (screen IK targets) or {a:thigh/upper angle, b: knee/elbow bend}.
 * pal: 'sasan' | 'guest'; smile 0..1; gaze [-1..1, -1..1]; pencil: index of arm holding a pencil (or -1);
 * palm: index of arm with an open welcoming palm; only: 'all' | 'body' | 'nearArm'. */
const LEN = { thigh: .215, shin: .215, up: .165, lo: .155, legW: .118, armW: .092, hipH: .44 };
function toLocal(P, p) {
  const dx = (p[0] - P.x) / P.s, dy = (p[1] - P.y) / P.s;
  const c = Math.cos(-P.rot || 0), s = Math.sin(-P.rot || 0);
  return [(dx * c - dy * s) * (P.dir || 1), dx * s + dy * c];
}
function drawFigure(P) {
  P = Object.assign({ dir: 1, rot: 0, lean: 0, head: 0, view: 'side', smile: 0, gaze: [0.3, 0], pencil: -1, palm: -1, only: 'all', pal: 'sasan', legs: [{ a: 0, b: 0 }, { a: 0, b: 0 }], arms: [{ a: 0.1, b: 0.2 }, { a: -0.1, b: 0.2 }] }, P);
  const guest = P.pal === 'guest';
  const col = guest
    ? { body: S.iv2, far: S.iv3, leg: S.iv3, legFar: S.iv4, shoe: S.iv4, skin: C.iv, rim: 'rgba(8,11,16,0.85)', rimW: 3.4 }
    : { body: S.body, far: S.bodyFar, leg: '#12151B', legFar: '#0B0D11', shoe: S.shoe, skin: C.iv, rim: S.rim, rimW: 3.4 };
  ctx.save();
  ctx.translate(P.x, P.y); ctx.rotate(P.rot); ctx.scale(P.s * P.dir, P.s);
  const rimW = col.rimW / P.s;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const front = P.view === 'front';
  const R = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
  const torsoPt = p => R(p, P.lean);
  const hips = front ? [[-0.075, 0], [0.075, 0]] : [[-0.035, -0.01], [0.03, 0]];
  const shoulders = (front ? [[-0.155, -0.3], [0.155, -0.3]] : [[-0.015, -0.305], [0.025, -0.295]]).map(torsoPt);
  const neck = torsoPt([0.01, -0.37]);
  const stroke = (pts, w, c) => {
    pline(pts); ctx.strokeStyle = col.rim; ctx.lineWidth = w + rimW * 2; ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke();
  };
  const legPts = i => {
    const L = P.legs[i], hp = hips[i];
    if (L.foot) {
      const ft = toLocal(P, L.foot); ft[1] -= 0.045;
      const r = ik(hp, ft, LEN.thigh, LEN.shin, front ? (i ? -1 : 1) * 0.35 : -1);
      return [hp, r.j, r.e, L.footAng || 0];
    }
    const sgn = front ? (i ? 1 : -1) : 1;
    const t = dirv(L.a * sgn); const k = [hp[0] + t[0] * LEN.thigh, hp[1] + t[1] * LEN.thigh];
    const s2 = dirv((L.a - L.b) * sgn); return [hp, k, [k[0] + s2[0] * LEN.shin, k[1] + s2[1] * LEN.shin], L.footAng || 0];
  };
  const drawLeg = (i, c) => {
    const [hp, k, a, fa] = legPts(i);
    stroke([hp, k, a], LEN.legW, c);
    ctx.save(); ctx.translate(a[0], a[1] + 0.012); ctx.rotate(fa + (front ? 0 : 0));
    if (front) { ell(0, 0.022, 0.05, 0.034); } else {
      ctx.beginPath(); ctx.moveTo(-0.045, 0.035); ctx.lineTo(-0.045, -0.01); ctx.quadraticCurveTo(0.02, -0.03, 0.085, 0.0);
      ctx.quadraticCurveTo(0.11, 0.035, 0.085, 0.038); ctx.closePath();
    }
    ctx.strokeStyle = col.rim; ctx.lineWidth = rimW * 2; ctx.stroke(); ctx.fillStyle = col.shoe; ctx.fill();
    ctx.restore();
  };
  const armPts = i => {
    const A = P.arms[i], sh = shoulders[i];
    if (A.hand) {
      const hd = toLocal(P, A.hand);
      const r = ik(sh, hd, LEN.up, LEN.lo, front ? (i ? 1 : -1) * (A.flip ? -1 : 1) : (A.flip ? -1 : 1));
      return [sh, r.j, r.e];
    }
    const sgn = front ? (i ? 1 : -1) : 1;
    const u = dirv(A.a * sgn); const e = [sh[0] + u[0] * LEN.up, sh[1] + u[1] * LEN.up];
    const l = dirv((A.a + A.b) * sgn); return [sh, e, [e[0] + l[0] * LEN.lo, e[1] + l[1] * LEN.lo]];
  };
  const drawHand = (i, w, e, isPencil, isPalm) => {
    const d = Math.atan2(w[1] - e[1], w[0] - e[0]);
    const hc = [w[0] + Math.cos(d) * 0.022, w[1] + Math.sin(d) * 0.022];
    ctx.save(); ctx.translate(hc[0], hc[1]); ctx.rotate(d);
    if (isPencil) {
      const pl = P.pencilLen || 0.16;
      ctx.save(); ctx.rotate(P.pencilAng != null ? P.pencilAng - d : 0.9);
      ctx.fillStyle = C.iv; ctx.strokeStyle = S.ink; ctx.lineWidth = 0.008;
      ctx.beginPath(); ctx.moveTo(-0.02, -0.011); ctx.lineTo(pl - 0.03, -0.011); ctx.lineTo(pl, 0); ctx.lineTo(pl - 0.03, 0.011); ctx.lineTo(-0.02, 0.011); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = S.ink; ctx.beginPath(); ctx.moveTo(pl - 0.012, -0.004); ctx.lineTo(pl, 0); ctx.lineTo(pl - 0.012, 0.004); ctx.fill();
      ctx.fillStyle = S.co2; ctx.fillRect(-0.03, -0.011, 0.016, 0.022);
      ctx.restore();
    }
    ctx.fillStyle = guest ? C.iv : col.skin; ctx.strokeStyle = guest ? col.rim : S.iv3; ctx.lineWidth = 1.6 / P.s;
    if (isPalm) {
      ell(0.02, 0, 0.05, 0.04); ctx.fill(); ctx.stroke();
      for (let k = 0; k < 4; k++) { ctx.save(); ctx.translate(0.06, -0.026 + k * 0.017); ctx.rotate(-0.5 + k * 0.05); ell(0.022, 0, 0.026, 0.009); ctx.fill(); ctx.stroke(); ctx.restore(); }
      ell(0.0, -0.04, 0.012, 0.024, -0.6); ctx.fill(); ctx.stroke();
    } else {
      ell(0.01, 0, 0.048, 0.042); ctx.fill(); ctx.stroke();
      ell(0.03, -0.03, 0.017, 0.012, -0.5); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    return hc;
  };
  const drawArm = (i, c) => {
    const [sh, el, wr] = armPts(i);
    stroke([sh, el, wr], LEN.armW, c);
    drawHand(i, wr, el, P.pencil === i, P.palm === i);
  };
  const drawTorso = () => {
    ctx.save(); ctx.rotate(P.lean);
    ctx.beginPath();
    if (front) {
      ctx.moveTo(-0.15, 0.055); ctx.bezierCurveTo(-0.21, -0.05, -0.22, -0.22, -0.18, -0.32);
      ctx.quadraticCurveTo(-0.13, -0.39, 0, -0.39); ctx.quadraticCurveTo(0.13, -0.39, 0.18, -0.32);
      ctx.bezierCurveTo(0.22, -0.22, 0.21, -0.05, 0.15, 0.055); ctx.quadraticCurveTo(0, 0.09, -0.15, 0.055);
    } else {
      ctx.moveTo(-0.14, 0.055); ctx.bezierCurveTo(-0.185, -0.05, -0.19, -0.22, -0.14, -0.33);
      ctx.quadraticCurveTo(-0.1, -0.39, 0, -0.388); ctx.quadraticCurveTo(0.1, -0.388, 0.14, -0.32);
      ctx.bezierCurveTo(0.195, -0.22, 0.205, -0.05, 0.15, 0.055); ctx.quadraticCurveTo(0, 0.095, -0.14, 0.055);
    }
    ctx.closePath();
    ctx.strokeStyle = col.rim; ctx.lineWidth = rimW * 2; ctx.stroke();
    ctx.fillStyle = col.body; ctx.fill();
    if (!guest) { // turtleneck collar + soft fold
      ctx.fillStyle = '#1C2029'; ctx.beginPath(); ctx.roundRect(-0.07, -0.43, 0.14, 0.075, 0.03); ctx.fill();
      ctx.strokeStyle = 'rgba(244,239,217,0.08)'; ctx.lineWidth = 0.006;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-0.055, -0.415 + k * 0.02); ctx.lineTo(0.055, -0.415 + k * 0.02); ctx.stroke(); }
    } else { // backpack
      ctx.fillStyle = S.iv4; ctx.strokeStyle = col.rim; ctx.lineWidth = rimW * 1.5;
      ctx.beginPath(); ctx.roundRect(-0.25, -0.33, 0.13, 0.3, 0.05); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = S.iv5; ctx.lineWidth = 0.018; ctx.beginPath(); ctx.moveTo(-0.13, -0.3); ctx.quadraticCurveTo(0.02, -0.25, 0.06, -0.12); ctx.stroke();
    }
    ctx.restore();
  };
  const drawHead = () => {
    ctx.save(); ctx.translate(neck[0], neck[1]); ctx.rotate(P.lean * 0.4 + P.head); ctx.translate(0.015, -0.125);
    drawHeadShape(P, front, guest, col);
    ctx.restore();
  };
  if (P.only === 'nearArm') { drawArm(1, col.body); ctx.restore(); return; }
  if (front) {
    drawLeg(0, col.leg); drawLeg(1, col.leg);
    if (P.armsBehind) { drawArm(0, col.body); drawArm(1, col.body); }
    drawTorso(); drawHead();
    if (!P.armsBehind) { drawArm(0, col.body); drawArm(1, col.body); }
  } else {
    drawArm(0, col.far); drawLeg(0, col.legFar); drawLeg(1, col.leg); drawTorso(); drawHead();
    if (P.only !== 'body') drawArm(1, col.body);
  }
  ctx.restore();
}
function drawHeadShape(P, front, guest, col) {
  const rx = 0.108, ry = 0.126;
  const g = ctx.createRadialGradient(front ? -0.02 : 0.03, -0.05, 0.01, 0, 0, 0.14);
  g.addColorStop(0, guest ? S.iv1 : '#FBF7E6'); g.addColorStop(0.7, guest ? S.iv2 : C.iv); g.addColorStop(1, guest ? S.iv3 : S.iv2);
  if (guest) {
    ell(0, 0, rx * 0.95, ry * 0.92); ctx.strokeStyle = col.rim; ctx.lineWidth = col.rimW * 2 / P.s; ctx.stroke(); ctx.fillStyle = g; ctx.fill();
    return;
  }
  const ear = (x) => { ell(x, 0.018, 0.024, 0.034); ctx.fillStyle = S.iv2; ctx.fill(); ell(x, 0.018, 0.012, 0.02); ctx.fillStyle = S.iv3; ctx.fill(); };
  if (P.view === 'back') { ear(-0.104); ear(0.104); }
  if (front) { ear(-0.104); ear(0.104); }
  ell(0, 0, rx, ry); ctx.strokeStyle = col.rim; ctx.lineWidth = 2.4 / P.s; ctx.stroke(); ctx.fillStyle = g; ctx.fill();
  const ink = S.ink, lw = 0.013;
  const gx = P.gaze[0] * 0.011, gy = P.gaze[1] * 0.011;
  const sm = P.smile;
  if (P.view === 'back') return;
  if (front) {
    ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (const sx of [-1, 1]) { circ(sx * 0.047, 0.0, 0.036); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-0.012, -0.004); ctx.quadraticCurveTo(0, -0.012, 0.012, -0.004); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.083, -0.004); ctx.lineTo(-0.104, -0.01); ctx.moveTo(0.083, -0.004); ctx.lineTo(0.104, -0.01); ctx.stroke();
    ctx.fillStyle = ink;
    for (const sx of [-1, 1]) {
      if (sm > 0.6) { ctx.lineWidth = 0.008; ctx.beginPath(); ctx.arc(sx * 0.047 + gx, 0.006 + gy, 0.012, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
      else { circ(sx * 0.047 + gx, gy, 0.0095); ctx.fill(); }
    }
    ctx.fillStyle = S.iv2; ell(0, 0.035, 0.014, 0.012); ctx.fill();
    moustache(0, 0.06, 1);
    if (sm > 0) { ctx.strokeStyle = ink; ctx.lineWidth = 0.007; ctx.beginPath(); ctx.moveTo(-0.02, 0.083); ctx.quadraticCurveTo(0, 0.083 + 0.012 * sm, 0.02, 0.083); ctx.stroke(); }
    return;
  }
  // side / three-quarter (faces +x)
  ear(-0.02);
  circ(0.103, 0.026, 0.023); ctx.fillStyle = C.iv; ctx.fill();
  ctx.strokeStyle = S.iv3; ctx.lineWidth = 0.004; ctx.beginPath(); ctx.arc(0.103, 0.026, 0.023, -0.2, 1.6); ctx.stroke();
  ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.fillStyle = 'rgba(255,255,255,0.10)';
  circ(0.055, -0.002, 0.036); ctx.fill(); ctx.stroke();
  circ(0.122, -0.006, 0.026); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.091, -0.006); ctx.lineTo(0.096, -0.008); ctx.stroke();
  ctx.lineWidth = 0.01; ctx.beginPath(); ctx.moveTo(0.02, -0.004); ctx.lineTo(-0.012, 0.0); ctx.stroke();
  ctx.fillStyle = ink;
  if (sm > 0.6) {
    ctx.lineWidth = 0.008;
    ctx.beginPath(); ctx.arc(0.058 + gx, 0.006 + gy, 0.012, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(0.124 + gx, 0.004 + gy, 0.009, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  } else { circ(0.058 + gx, gy, 0.0095); ctx.fill(); circ(0.124 + gx * 0.8, -0.004 + gy, 0.0075); ctx.fill(); }
  moustache(0.083, 0.061, 0.85);
  if (sm > 0) { ctx.strokeStyle = ink; ctx.lineWidth = 0.007; ctx.beginPath(); ctx.moveTo(0.068, 0.084); ctx.quadraticCurveTo(0.083, 0.084 + 0.012 * sm, 0.1, 0.082); ctx.stroke(); }
}
function moustache(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = S.ink;
  ctx.beginPath(); ctx.moveTo(-0.036, 0.008); ctx.quadraticCurveTo(-0.03, -0.014, 0, -0.012); ctx.quadraticCurveTo(0.03, -0.014, 0.036, 0.008);
  ctx.quadraticCurveTo(0.018, 0.004, 0, 0.007); ctx.quadraticCurveTo(-0.018, 0.004, -0.036, 0.008); ctx.fill();
  ctx.restore();
}
// world point of a hand (wrist) for a given pose — used to attach the dot / pencil tip
function handPoint(P, i, extra = 0.03) {
  P = Object.assign({ dir: 1, rot: 0, lean: 0, view: 'side' }, P);
  const front = P.view === 'front';
  const R = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
  const sh = R((front ? [[-0.155, -0.3], [0.155, -0.3]] : [[-0.015, -0.305], [0.025, -0.295]])[i], P.lean);
  const A = P.arms[i]; let el, wr;
  if (A.hand) { const r = ik(sh, toLocal(P, A.hand), LEN.up, LEN.lo, front ? (i ? 1 : -1) : 1); el = r.j; wr = r.e; }
  else { const sgn = front ? (i ? 1 : -1) : 1; const u = dirv(A.a * sgn); el = [sh[0] + u[0] * LEN.up, sh[1] + u[1] * LEN.up]; const l = dirv((A.a + A.b) * sgn); wr = [el[0] + l[0] * LEN.lo, el[1] + l[1] * LEN.lo]; }
  const d = Math.atan2(wr[1] - el[1], wr[0] - el[0]);
  const lp = [wr[0] + Math.cos(d) * extra, wr[1] + Math.sin(d) * extra];
  return localToScreen(P, lp);
}
function localToScreen(P, lp) {
  const x = lp[0] * (P.dir || 1) * P.s, y = lp[1] * P.s, c = Math.cos(P.rot || 0), s = Math.sin(P.rot || 0);
  return [P.x + x * c - y * s, P.y + x * s + y * c];
}
// pencil tip → where the wrist should be (pencil held at angle pa, in screen space)
function wristForTip(tip, pa, len, s, dir = 1) { return [tip[0] - Math.cos(pa) * (len + 0.03) * s, tip[1] - Math.sin(pa) * (len + 0.03) * s]; }

// footstep tracks: plants [{f, p:[x,y]}] — foot stays planted, then swings (sine arc) to the next plant
function footAt(plants, f, swing = 9, lift = 18) {
  if (f <= plants[0].f) return { p: plants[0].p, ang: 0 };
  for (let i = 0; i < plants.length - 1; i++) {
    const a = plants[i], b = plants[i + 1];
    if (f < b.f) {
      const sw = Math.min(swing, b.f - a.f), ls = b.f - sw;
      if (f <= ls) return { p: a.p, ang: 0 };
      const u = (f - ls) / sw, e = E.sine(u);
      const extra = Math.max(0, a.p[1] - b.p[1]) * 0.6;
      return { p: [lerp(a.p[0], b.p[0], e), lerp(a.p[1], b.p[1], e) - (lift + extra) * Math.sin(Math.PI * u)], ang: -0.35 * Math.sin(Math.PI * u) + (u < .3 ? 0.3 * Math.sin(Math.PI * u / .3) : 0) };
    }
  }
  return { p: plants[plants.length - 1].p, ang: 0 };
}
function contactShadow(x, y, w, a = 0.28) { ctx.save(); ctx.fillStyle = `rgba(8,11,16,${a})`; ell(x, y, w, w * 0.16); ctx.fill(); ctx.restore(); }

// ---------- typography ----------
/* Headline blocks are composited as an independent layer: exact strings, two lines max,
 * whole block tilted ~-3.5°, one in-treatment per scene, 6–10 frame move + 1–2 frame settle. */
const HEADLINES = [
  { l: ['HELLO', 'SASAN'], c: [C.iv, C.ye], a: 4, b: 61, fx: 'slide' },
  { l: ['ARTIST?'], c: [C.iv], a: 71, b: 173, fx: 'pivot', size: 300 },
  { l: ['PHOTO', 'GRAPHY'], c: [C.iv, C.iv], a: 183, b: 233, fx: 'mask' },
  { l: ['GRAPHIC', 'DESIGN'], c: [C.iv, C.iv], a: 241, b: 275, fx: 'slide' },
  { l: ['ARCHITECT'], c: [C.iv], a: 300, b: 353, fx: 'mask', size: 260 },
  { l: ['VISUAL', 'IZATION'], c: [C.iv, C.iv], a: 360, b: 407, fx: 'pivot' },
  { l: ['DIFFERENT TOOLS', 'SAME URGE'], c: [C.iv, C.ye], a: 418, b: 488, fx: 'slide' },
  { l: ['ESCAPE', 'REALITY'], c: [C.iv, C.iv], a: 498, b: 530, fx: 'mask', top: 150, size: 200 },
  { l: ['BUILD MY', 'WORLDS'], c: [C.iv, C.iv], a: 537, b: 581, fx: 'slide' },
  { l: ['A LITTLE', 'MAD?'], c: [C.iv, C.iv], a: 611, b: 662, fx: 'pivot' },
  { l: ['MY STUDIO', '2012'], c: [C.iv, C.ye], a: 671, b: 856, fx: 'mask' },
  { l: ['COME IN.', 'BE MY GUEST.'], c: [C.iv, C.ye], a: 866, b: 9999, fx: 'slide' },
];
const HL_MAX = 236, HL_X = 96, HL_TOP = 190, HL_TILT = -3.5 * DEG;
function headline(f) {
  for (const h of HEADLINES) {
    if (f < h.a || f > h.b + 6) continue;
    ctx.save();
    const maxW = W - HL_X * 2;
    const lines = h.l.map((t, i) => {
      let size = h.size || HL_MAX;
      ctx.font = `${size}px Anton`; let m = ctx.measureText(t);
      if (m.width > maxW) { size = size * maxW / m.width; ctx.font = `${size}px Anton`; m = ctx.measureText(t); }
      return { t, size, w: m.width, asc: size * 0.74, col: h.c[i] };
    });
    let y = h.top || HL_TOP; const gap = 14;
    lines.forEach(L => { L.y = y + L.asc; y += L.asc + gap + L.size * 0.02; });
    const blockH = y - (h.top || HL_TOP), blockW = Math.max(...lines.map(L => L.w));
    const cx = HL_X + blockW / 2, cy = (h.top || HL_TOP) + blockH / 2;
    const tin = f - h.a, tout = h.b - f;
    ctx.translate(cx, cy); ctx.rotate(HL_TILT);
    let extraRot = 0, sc = 1, alpha = 1;
    if (h.fx === 'pivot') { const u = inv(0, 9, tin); extraRot = (1 - E.outBack(u)) * -13 * DEG; sc = lerp(0.9, 1, E.out(u)); alpha = inv(0, 3, tin); }
    ctx.rotate(extraRot); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
    ctx.globalAlpha = alpha;
    lines.forEach((L, i) => {
      ctx.save();
      ctx.font = `${L.size}px Anton`; ctx.textBaseline = 'alphabetic';
      let dx = 0, dy = 0;
      const top = L.y - L.asc - 8, hgt = L.asc + 20;
      if (h.fx === 'slide') { const u = inv(i * 2, i * 2 + 9, tin); dx = (1 - E.outBack(u)) * -(L.w + 160); }
      if (h.fx === 'mask' || h.fx === 'pivot' && false) { ctx.beginPath(); ctx.rect(0, top, W, hgt); ctx.clip(); const u = inv(i * 2, i * 2 + 8, tin); dy = (1 - E.outBack(u)) * hgt; }
      if (tout < 6) { ctx.beginPath(); ctx.rect(0, top, W, hgt); ctx.clip(); dy -= E.in(inv(6, 0, tout)) * hgt * 1.05; }
      ctx.fillStyle = 'rgba(8,11,16,0.85)'; ctx.fillText(L.t, HL_X + dx + 7, L.y + dy + 8);
      ctx.fillStyle = L.col; ctx.fillText(L.t, HL_X + dx, L.y + dy);
      ctx.restore();
    });
    ctx.restore();
  }
}
function chrome(f) {
  ctx.save();
  ctx.font = '700 24px InterB'; ctx.fillStyle = C.iv; ctx.globalAlpha = 0.9;
  ctx.letterSpacing = '7px'; ctx.fillText('SASAN', 96, 104);
  ctx.globalAlpha = 0.55; ctx.letterSpacing = '5px'; ctx.font = '400 24px InterB';
  ctx.fillText('/  INSIDE MY HEAD', 96 + 128, 104);
  const sc = sceneAt(f); ctx.textAlign = 'right'; ctx.globalAlpha = 0.55;
  ctx.fillText(String(sc.id).padStart(2, '0') + ' / 12', W - 96 + 5, 104);
  ctx.restore();
}

// ---------- scene 01 + 02: spectacles bridge → question ring (one shared world) ----------
const FLOOR12 = 1330, SZ12 = 370;
function hipX12(f) { // walking 7 px/frame, decelerating to a stop at x = 470 by frame 116
  if (f < 96) return -302 + 7 * f;
  const t = Math.min(f, 116) - 96; return 370 + 7 * t - 7 * t * t / 40;
}
function vel12(f) { return f < 96 ? 7 : Math.max(0, 7 * (1 - (f - 96) / 20)); }
const PLANTS12 = (() => {
  const tracks = [[], []];
  for (let n = 0; n < 12; n++) {
    const cf = -40 + 16 * n; if (cf > 112) break;
    const foot = n % 2, off = 0.36 * 112 * (vel12(cf) / 7);
    tracks[foot].push({ f: cf, p: [hipX12(cf) + off, FLOOR12] });
  }
  // settle: trailing foot steps beside the support foot
  const last = tracks[0].length && tracks[0][tracks[0].length - 1].f > tracks[1][tracks[1].length - 1].f ? 0 : 1;
  tracks[1 - last].push({ f: 120, p: [440 - 22, FLOOR12] });
  return tracks;
})();
function sasan12(f) {
  const x = hipX12(f), v = vel12(f) / 7;
  const ph = (f + 40) / 16 * Math.PI;
  const bob = -3.2 * Math.cos(2 * ph) * v;
  const reach = seg(f, 110, 138);
  const P = { x, y: FLOOR12 - LEN.hipH * SZ12 + 4 + bob + reach * 6, s: SZ12, lean: 0.05 * v + reach * 0.13 };
  const fa = footAt(PLANTS12[0], f, 9, 16), fb = footAt(PLANTS12[1], f, 9, 16);
  P.legs = [{ foot: fa.p, footAng: fa.ang }, { foot: fb.p, footAng: fb.ang }];
  const swing = Math.sin(ph) * 0.42 * v;
  P.arms = [{ a: -swing * 1.1, b: 0.25 + Math.max(0, -swing) * 0.4 }];
  const carry = { a: 0.75, b: 1.05 };
  const target = [548, 1046];
  if (reach > 0) {
    const cp = handPoint(Object.assign({}, P, { arms: [P.arms[0], carry] }), 1, 0);
    P.arms[1] = { hand: L2(cp, target, reach) };
  } else P.arms[1] = carry;
  const think = seg(f, 136, 160) * (1 - seg(f, 172, 180) * 0);
  P.head = -0.04 * v * Math.sin(2 * ph) + think * 0.16 - reach * 0.05;
  P.gaze = [0.6, -0.2 - reach * 0.6];
  P.smile = f < 50 ? 0.5 : 0;
  return P;
}
function dot12(P) { return handPoint(P, 1, 0.065); }
function slab12(x0, x1) {
  // thin perspective top + front face of the ivory walkway
  const top = 1288, fr = 1372, bot = 1472;
  fillPoly([[x0 + 30, top], [x1 - 30, top], [x1, fr], [x0, fr]], C.iv);
  const g = ctx.createLinearGradient(0, fr, 0, bot); g.addColorStop(0, S.iv2); g.addColorStop(1, S.iv3);
  fillPoly([[x0, fr], [x1, fr], [x1, bot], [x0, bot]], g);
  ctx.fillStyle = 'rgba(8,11,16,0.10)'; ctx.fillRect(x0, fr, x1 - x0, 6);
  // arches cut into the front face
  for (const ax of [-560, 30, 1080]) { ctx.fillStyle = S.ch1; ctx.beginPath(); ctx.moveTo(ax - 34, bot); ctx.lineTo(ax - 34, fr + 48); ctx.arc(ax, fr + 48, 34, Math.PI, 0); ctx.lineTo(ax + 34, bot); ctx.fill(); }
}
function hangingStair(x, y, n, dir) {
  for (let k = 0; k < n; k++) {
    const sx = x + dir * k * 58, sy = y + k * 52;
    fillPoly([[sx, sy], [sx + 58 * dir, sy], [sx + 58 * dir, sy + 52], [sx, sy + 52]], k % 2 ? S.iv2 : S.iv1);
    fillPoly([[sx, sy + 52], [sx + 58 * dir, sy + 52], [sx + 58 * dir + 14 * dir, sy + 60], [sx + 14 * dir, sy + 60]], S.iv3);
  }
}
function planet(x, y, r, lightAng = -2.3) {
  ctx.save();
  const lx = x + Math.cos(lightAng) * r * 0.45, ly = y + Math.sin(lightAng) * r * 0.45;
  const g = ctx.createRadialGradient(lx, ly, r * 0.05, x, y, r);
  g.addColorStop(0, S.co1); g.addColorStop(0.55, C.co); g.addColorStop(1, S.co4);
  ctx.fillStyle = g; circ(x, y, r); ctx.fill();
  ctx.globalAlpha = 0.18; ctx.strokeStyle = S.coHi; ctx.lineWidth = r * 0.04; ctx.beginPath(); ctx.arc(x, y, r * 0.96, lightAng - 0.8, lightAng + 0.8); ctx.stroke();
  ctx.restore();
}
function sceneBridge(f, which) {
  background();
  let cam = { cx: 540, cy: ANCHOR.y, s: 1 };
  if (which === 1) { const u = seg(f, 0, 66, E.io); cam = { cx: lerp(160, 540, u), cy: ANCHOR.y, s: lerp(0.72, 1, u) }; }
  stars(11, 70, f, { dx: (540 - cam.cx) * 0.25 });
  ctx.save();
  ctx.translate(540, ANCHOR.y); ctx.scale(cam.s, cam.s); ctx.translate(-cam.cx, -cam.cy);
  planet(-150, 1730, 95);
  planet(1180, 1640, 46, -2.6);
  hangingStair(700, 1472, 5, 1);
  hangingStair(-420, 1472, 3, -1);
  const ringAng = which === 2 ? -Math.PI / 2 + Math.pow(Math.max(0, f - 136) / 42, 2) * 0.32 : -Math.PI / 2;
  if (which === 1) {
    iris(-220, ANCHOR.y, 366, 304, 362, -Math.PI / 2, { depth: 14 });
    // bridge
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = S.co4; ctx.lineWidth = 58; ctx.beginPath(); ctx.moveTo(110, 905); ctx.quadraticCurveTo(160, 836, 210, 905); ctx.stroke();
    ctx.strokeStyle = C.co; ctx.lineWidth = 52; ctx.beginPath(); ctx.moveTo(110, 896); ctx.quadraticCurveTo(160, 826, 210, 896); ctx.stroke();
    ctx.restore();
  }
  if (which === 2) {
    // question-mark sculpture: rigid extruded glyph
    const bobq = 0;
    ctx.save(); ctx.font = '470px Anton'; ctx.textBaseline = 'alphabetic';
    for (let k = 10; k > 0; k--) { ctx.fillStyle = k > 1 ? S.iv3 : S.iv2; ctx.fillText('?', 52 + k * 2.2, 1298 + bobq + k * 1.2); }
    ctx.fillStyle = C.iv; ctx.fillText('?', 52, 1298 + bobq);
    ctx.restore();
  }
  iris(540, ANCHOR.y, 366, 304, 362, ringAng, { depth: 14 });
  if (which === 2) {
    const fy = 1120 + Math.sin(f * 0.07) * 7;
    fillPoly([[880, fy], [1030, fy], [1060, fy - 26], [910, fy - 26]], C.iv);
    fillPoly([[880, fy], [1030, fy], [1030, fy + 46], [880, fy + 46]], S.iv2);
    fillPoly([[1030, fy], [1060, fy - 26], [1060, fy + 20], [1030, fy + 46]], S.iv3);
    contactShadow(970, fy + 120, 60, 0.0);
  }
  slab12(-1000, 1600);
  const P = sasan12(f);
  contactShadow(P.legs[0].foot[0] + 10, FLOOR12 + 2, 40); contactShadow(P.legs[1].foot[0] + 10, FLOOR12 + 2, 40);
  drawFigure(P);
  const d = dot12(P); glowDot(d[0], d[1], 27);
  ctx.restore();
}

// ---------- scene 03: camera iris ----------
function scene03(f) {
  const t = f - 178;
  background();
  stars(31, 40, f, { alpha: 0.7 });
  const ang = -Math.PI / 2 + 0.32 + (0.32 * 2 / 42) * t - 0.0004 * t * t;
  const close = seg(t, 3, 24, E.io), reopen = seg(t, 30, 52, E.io);
  const rho = lerp(362, 112, close) + 58 * reopen;
  // camera frame brackets
  const fa = inv(2, 10, t), bs = 470 + (1 - E.out(fa)) * 40;
  ctx.save(); ctx.globalAlpha = fa; ctx.strokeStyle = C.iv; ctx.lineWidth = 6; ctx.lineCap = 'square';
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.beginPath(); ctx.moveTo(540 + sx * bs, ANCHOR.y + sy * (bs - 80)); ctx.lineTo(540 + sx * bs, ANCHOR.y + sy * bs); ctx.lineTo(540 + sx * (bs - 80), ANCHOR.y + sy * bs); ctx.stroke();
  }
  ctx.globalAlpha = fa * 0.9; ctx.lineWidth = 4; circ(540, ANCHOR.y, 366 + 22); ctx.stroke();
  ctx.restore();
  iris(540, ANCHOR.y, 366, 304, rho, ang, { depth: 14, apIn: '#0B1230', apOut: '#04060B' });
  // the dot: held at the iris centre, follows the reaching hand, then slides onto a short ivory line
  const handT = seg(t, 0, 34, E.io);
  const hand = L2([610, 1500], [574, 1150], handT);
  const follow = seg(t, 30, 44, E.io), slide = seg(t, 44, 58, E.io);
  let d = L2([548, 1046], [570, 1098], follow);
  const lineA = [566, 1101];
  if (slide > 0) {
    d = L2([570, 1098], [626, 1075], slide);
    ctx.strokeStyle = C.iv; ctx.lineWidth = 6; ctx.lineCap = 'round'; pline([lineA, [lerp(lineA[0], 626, slide), lerp(lineA[1], 1075, slide)]]); ctx.stroke();
  }
  glowDot(d[0], d[1], 28);
  // Sasan over-the-shoulder (back three-quarter), reaching into the aperture
  const sx = 210, sy = 1520;
  ctx.save();
  ctx.fillStyle = S.body; ctx.strokeStyle = S.rim; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-120, 1920); ctx.bezierCurveTo(-110, 1700, 0, 1640, 200, 1640); ctx.bezierCurveTo(400, 1640, 520, 1700, 560, 1920); ctx.closePath(); ctx.stroke(); ctx.fill();
  // reaching arm
  const sh = [420, 1720];
  const r = ik(sh, hand, 250, 240, 1);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  pline([sh, r.j, r.e]); ctx.strokeStyle = S.rim; ctx.lineWidth = 132; ctx.stroke(); ctx.strokeStyle = S.body; ctx.lineWidth = 126; ctx.stroke();
  const hd = Math.atan2(r.e[1] - r.j[1], r.e[0] - r.j[0]);
  ctx.save(); ctx.translate(r.e[0] + Math.cos(hd) * 30, r.e[1] + Math.sin(hd) * 30); ctx.rotate(hd);
  ctx.fillStyle = C.iv; ctx.strokeStyle = S.iv3; ctx.lineWidth = 3; ell(10, 0, 58, 50); ctx.fill(); ctx.stroke();
  ell(62, -12, 34, 14, -0.15); ctx.fill(); ctx.stroke(); ell(30, -48, 16, 26, -0.5); ctx.fill(); ctx.stroke();
  ctx.restore();
  // head (back three-quarter, looking up-right)
  ctx.translate(sx, sy); ctx.rotate(0.28);
  ctx.fillStyle = '#1C2029'; ctx.beginPath(); ctx.roundRect(-90, 130, 180, 90, 40); ctx.fill();
  const g = ctx.createRadialGradient(40, -40, 10, 0, 0, 190); g.addColorStop(0, '#FBF7E6'); g.addColorStop(0.7, C.iv); g.addColorStop(1, S.iv2);
  ell(150, 10, 26, 40); ctx.fillStyle = S.iv2; ctx.fill();
  ell(0, 0, 160, 185); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = S.rim; ctx.lineWidth = 3; ctx.stroke();
  ell(-150, 24, 26, 42); ctx.fillStyle = S.iv2; ctx.fill(); ell(-150, 24, 13, 24); ctx.fillStyle = S.iv3; ctx.fill();
  // glasses seen from behind: thin temple to the ear, lens rim peeking past the cheek
  ctx.strokeStyle = S.ink; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-140, 4); ctx.lineTo(-170, 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(150, -6); ctx.lineTo(166, -10); ctx.stroke();
  ctx.lineWidth = 11; ctx.beginPath(); ctx.arc(186, -12, 40, -1.7, 1.75); ctx.stroke();
  // soft occipital shading
  const sh2 = ctx.createRadialGradient(-60, 80, 20, -60, 80, 200); sh2.addColorStop(0, 'rgba(133,126,106,0.0)'); sh2.addColorStop(1, 'rgba(133,126,106,0.25)');
  ell(0, 0, 160, 185); ctx.fillStyle = sh2; ctx.fill();
  ctx.restore();
}

// ---------- scene 04 + 05 + 06: paper sheet → folded room → wireframe ----------
const SHEET = { a: 470, v0: -400, v1: 900 }, VC = 380, UC = 200;
const CREASE = [[320, -400], [470, -250]];
function paperCam4(t) { const u = seg(t, 3, 32, E.io); return cam3(lerp(0, 60 * DEG, u), lerp(1400, 1819.5, u), lerp(77, 183, u)); }
const CAM5 = () => cam3(60 * DEG, 1819.5, 183);
function cam6(t) { const u = seg(t, 6, 54, E.io); return cam3(lerp(60 * DEG, 90 * DEG, u), lerp(1819.5, 1844, u), lerp(183, 460.5, u)); }
// paper-local (u,v,w) with flap + folds applied
function flapPt(u, v, phi) {
  const [q1, q2] = CREASE; const ax = [q2[0] - q1[0], q2[1] - q1[1]]; const al = Math.hypot(ax[0], ax[1]); ax[0] /= al; ax[1] /= al;
  const rel = [u - q1[0], v - q1[1]]; const pd = rel[0] * ax[0] + rel[1] * ax[1];
  const r = [rel[0] - pd * ax[0], rel[1] - pd * ax[1]]; const rl = Math.hypot(r[0], r[1]);
  return [q1[0] + pd * ax[0] + r[0] * Math.cos(phi), q1[1] + pd * ax[1] + r[1] * Math.cos(phi), rl * Math.sin(phi)];
}
function foldPt(u, v, w, al, be) {
  if (v < VC) { const dv = v - VC; return [u, VC + dv * Math.cos(al) + w * Math.sin(al), -dv * Math.sin(al) + w * Math.cos(al)]; }
  if (u > UC) { const e = u - UC; return [UC + e * Math.cos(be) - w * Math.sin(be), v, e * Math.sin(be) + w * Math.cos(be)]; }
  return [u, v, w];
}
function inFlap(u, v) { // corner triangle beyond the crease
  const [q1, q2] = CREASE; return ((q2[0] - q1[0]) * (v - q1[1]) - (q2[1] - q1[1]) * (u - q1[0])) < 0;
}
function paperState(scene, t) {
  // returns {cam, phi, al, be}
  if (scene === 4) return { cam: paperCam4(t), phi: seg(t, 27, 41, E.out) * 72 * DEG, al: 0, be: 0 };
  if (scene === 5) return { cam: CAM5(), phi: (1 - seg(t, 0, 18, E.io)) * 72 * DEG, al: seg(t, 4, 36, E.io) * 90 * DEG, be: seg(t, 14, 42, E.io) * 90 * DEG };
  return { cam: cam6(t), phi: 0, al: 90 * DEG, be: 90 * DEG };
}
function P3(st, u, v) { // paper point → screen
  const fl = inFlap(u, v) ? flapPt(u, v, st.phi) : [u, v, 0];
  const p = foldPt(fl[0], fl[1], fl[2], st.al, st.be);
  return st.cam.pr(p[0], p[1], p[2]);
}
const SPIRAL = [[86, 38], [300, 140], [430, -110], [372, -298]];
function drawPaper(st, t, mode, scene) {
  const wire = mode === 'wire';
  const N = 14;
  const edge = (a, b) => { const out = []; for (let i = 0; i <= N; i++) out.push(L2(a, b, i / N)); return out; };
  const regionPts = (corners) => { let pts = []; for (let i = 0; i < corners.length; i++) pts = pts.concat(edge(corners[i], corners[(i + 1) % corners.length]).slice(0, -1)); return pts; };
  const a = SHEET.a, v0 = SHEET.v0, v1 = SHEET.v1;
  const [q1, q2] = CREASE;
  // regions (flap corner excluded from the back wall polygon)
  const back = [[-a, v0], [q1[0], v0], [q2[0], q2[1]], [a, VC], [-a, VC]];
  const flap = [[q1[0], v0], [a, v0], [q2[0], q2[1]]];
  const floor = [[-a, VC], [UC, VC], [UC, v1], [-a, v1]];
  const right = [[UC, VC], [a, VC], [a, v1], [UC, v1]];
  const proj = pts => regionPts(pts).map(p => P3(st, p[0], p[1]));
  const wireCol = C.co;
  const drawRegion = (pts, fill, shade) => {
    const pp = proj(pts);
    if (wire) {
      poly(pp); ctx.fillStyle = 'rgba(36,72,255,0.07)'; ctx.fill();
      ctx.strokeStyle = wireCol; ctx.lineWidth = 3; ctx.stroke();
      return pp;
    }
    // paper thickness
    ctx.save(); ctx.translate(0, 4); poly(pp); ctx.fillStyle = S.iv4; ctx.fill(); ctx.restore();
    poly(pp); ctx.fillStyle = fill; ctx.fill();
    if (shade) { ctx.fillStyle = shade; ctx.fill(); }
    return pp;
  };
  const al = st.al;
  // back wall (rises with al)
  const lightBack = `rgba(8,11,16,${0.04 + 0.12 * Math.sin(al)})`;
  drawRegion(back, C.iv, lightBack);
  if (wire) gridLines(st, 'back');
  // printed circle / window on back region
  const circlePts = [];
  for (let i = 0; i < 96; i++) { const th = i / 96 * TAU; circlePts.push([366 * Math.cos(th), 366 * Math.sin(th)]); }
  const cp = circlePts.map(p => P3(st, p[0], p[1]));
  if (wire) {
    poly(cp); ctx.fillStyle = 'rgba(5,9,40,0.85)'; ctx.fill();
    ctx.save(); ctx.shadowColor = 'rgba(36,72,255,0.9)'; ctx.shadowBlur = 14; ctx.strokeStyle = S.co1; ctx.lineWidth = 5; ctx.stroke(); ctx.restore();
    const inner = circlePts.map(p => P3(st, p[0] * 0.86, p[1] * 0.86)); poly(inner); ctx.strokeStyle = 'rgba(68,98,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  } else {
    poly(cp); ctx.fillStyle = C.co; ctx.fill();
    if (al > 0.02) { // depth crescent inside the opening
      ctx.save(); poly(cp); ctx.clip();
      ctx.fillStyle = `rgba(7,13,61,${0.75 * Math.sin(al)})`; poly(cp); ctx.fill();
      const off = circlePts.map(p => P3(st, p[0] * 0.98 + 60 * Math.sin(al), p[1] * 0.98 + 70 * Math.sin(al)));
      poly(off); ctx.fillStyle = C.co; ctx.fill();
      ctx.restore();
    }
  }
  // the drawn ivory line (stays fixed to the paper)
  const lineT = scene === 4 ? seg(t, 6, 30, E.io) : 1;
  if (lineT > 0 && !wire) {
    const pts = []; for (let i = 0; i <= 40; i++) { const s = i / 40 * lineT; const p = bez(...SPIRAL, s); pts.push(P3(st, p[0], p[1])); }
    pline(pts); ctx.strokeStyle = wire ? 'rgba(244,239,217,0.6)' : C.iv; ctx.lineWidth = wire ? 3 : 7 * st.cam.scaleAt(0, 0); ctx.lineCap = 'round'; ctx.stroke();
  }
  // flap
  const fp = proj(flap);
  if (wire) { poly(fp); ctx.strokeStyle = wireCol; ctx.lineWidth = 3; ctx.stroke(); }
  else { poly(fp); ctx.fillStyle = st.phi > 0.05 ? S.iv1 : C.iv; ctx.fill(); if (st.phi > 0.05) { pline([P3(st, q1[0], q1[1]), P3(st, q2[0], q2[1])]); ctx.strokeStyle = 'rgba(8,11,16,0.18)'; ctx.lineWidth = 3; ctx.stroke(); } }
  // right wall: inside face of the arch wall
  const rp = drawRegion(right, C.iv, `rgba(8,11,16,${0.16 * Math.sin(st.be)})`);
  if (wire) gridLines(st, 'right');
  // floor (always flat)
  drawRegion(floor, C.iv, null);
  if (wire) gridLines(st, 'floor');
  // narrow doorway on the back wall, beside the window (paper coords: v measured down from the crease)
  const door = doorPoly();
  const dp = door.map(p => P3(st, p[0], p[1]));
  if (st.al > 0.3 || wire) {
    poly(dp);
    if (wire) {
      const glow = seg(t, 4, 20, E.io);
      ctx.fillStyle = `rgba(235,245,0,${0.9 * glow})`; ctx.fill();
      ctx.save(); ctx.shadowColor = 'rgba(235,245,0,0.8)'; ctx.shadowBlur = 30 * glow; ctx.strokeStyle = `rgba(244,239,217,${glow})`; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
    } else { ctx.fillStyle = S.ch2; ctx.fill(); }
  }
}
function doorPoly() {
  const u0 = 382, u1 = 458, w0 = 360, w1 = 640, r = (u1 - u0) / 2, pts = [];
  pts.push([u0, VC - w0]); pts.push([u1, VC - w0]);
  for (let i = 0; i <= 12; i++) { const th = Math.PI * i / 12; pts.push([u0 + r + r * Math.cos(th), VC - (w1 - r) - r * Math.sin(th)]); }
  return pts;
}
function gridLines(st, which) {
  ctx.save(); ctx.strokeStyle = 'rgba(36,72,255,0.55)'; ctx.lineWidth = 1.6;
  const a = SHEET.a;
  if (which === 'back') {
    for (let u = -a; u <= a + 1; u += 94) { pline([P3(st, u, SHEET.v0), P3(st, u, VC - 1)]); ctx.stroke(); }
    for (let v = SHEET.v0; v < VC; v += 98) { pline([P3(st, -a, v), P3(st, a, v)]); ctx.stroke(); }
  } else if (which === 'floor') {
    for (let u = -a; u <= UC; u += 94) { pline([P3(st, u, VC), P3(st, u, SHEET.v1)]); ctx.stroke(); }
    for (let v = VC; v <= SHEET.v1; v += 104) { pline([P3(st, -a, v), P3(st, UC, v)]); ctx.stroke(); }
  } else {
    for (let u = UC; u <= a; u += 90) { pline([P3(st, u, VC), P3(st, u, SHEET.v1)]); ctx.stroke(); }
    for (let v = VC; v <= SHEET.v1; v += 104) { pline([P3(st, UC, v), P3(st, a, v)]); ctx.stroke(); }
  }
  ctx.restore();
}
// suspended stair in room space (u, v, w)
const STAIR = { n: 4, u0: -200, du: 100, v0: 520, v1: 660, dw: 85 };
function stairTop(k) { return { u: STAIR.u0 + STAIR.du * (k + 0.5), w: STAIR.dw * (k + 1) }; }
function drawStair(cam, t, scene) {
  for (let k = 0; k < STAIR.n; k++) {
    const pop = scene === 5 ? E.outBack(inv(30 + k * 4, 44 + k * 4, t)) : 1;
    if (pop <= 0) continue;
    const u0 = STAIR.u0 + STAIR.du * k, u1 = u0 + STAIR.du, wt = STAIR.dw * (k + 1);
    const wb = k === 0 ? 0 : wt - STAIR.dw * 0.8;
    const wTop = lerp(wb, wt, pop);
    if (scene === 6) box3(cam, u0, u1, STAIR.v0, STAIR.v1, wb, wt, { stroke: S.co1, lw: 3, fillA: 0.18 });
    else box3(cam, u0, u1, STAIR.v0, STAIR.v1, wb, Math.max(wb + 1, wTop), { top: C.iv, front: S.iv2, left: S.iv1, right: S.iv3, side: S.iv2, back: S.iv3, bottom: S.iv4 });
  }
}
// Sasan in room space: plants in (u,v,w); hip follows
function roomSasan(cam, t, scene) {
  const Sw = 380, hipH = LEN.hipH * Sw;
  // feet: start on floor (u=-330, v=600); step onto tread 0 (scene 5), then treads 1,2 (scene 6)
  const T = scene === 5 ? t : t + 78; // continuous timeline across 5 → 6
  const st0 = stairTop(0), st1 = stairTop(1), st2 = stairTop(2);
  const far = [{ f: 0, p: [-345, 0] }, { f: 64, p: [st0.u - 22, st0.w] }, { f: 98, p: [st1.u - 18, st1.w] }, { f: 120, p: [st2.u - 20, st2.w] }];
  const near = [{ f: 0, p: [-300, 0] }, { f: 54, p: [st0.u + 12, st0.w] }, { f: 88, p: [st1.u + 14, st1.w] }, { f: 110, p: [st2.u + 14, st2.w] }, { f: 128, p: [st2.u + 26, st2.w] }];
  const fa = footAt(far, T, 12, 30), fn = footAt(near, T, 12, 30);
  // hip: weight over support foot; pelvis rises after the step lands (push of the supporting leg)
  const hu = (fa.p[0] + fn.p[0]) / 2 + 12;
  const support = Math.max(fa.p[1], fn.p[1]) * 0.35 + Math.min(fa.p[1], fn.p[1]) * 0.65;
  const lag = (T > 54 && T < 70) ? Math.sin(Math.PI * inv(54, 70, T)) * 14 : 0;
  const hw = support + hipH - lag + (T < 30 ? Math.sin(T * 0.55) * 4 * (1 - inv(20, 30, T)) : 0);
  const ground = cam.pr(hu, 600, support);
  const s = Sw * F3 / ground[2];
  const hip = [ground[0], ground[1] - (hw - support) * s / Sw];
  const P = { x: hip[0], y: hip[1], s, lean: 0.06 + (T > 46 && T < 72 ? 0.12 * Math.sin(Math.PI * inv(46, 72, T)) : 0) };
  P.legs = [{ foot: cam.pr(fa.p[0], 600, fa.p[1]).slice(0, 2), footAng: fa.ang }, { foot: cam.pr(fn.p[0], 600, fn.p[1]).slice(0, 2), footAng: fn.ang }];
  const chuckle = scene === 5 ? (1 - inv(22, 30, t)) * (t < 30 ? 1 : 0) : 0;
  P.smile = scene === 5 ? (t < 34 ? 1 : 0.4) : 0.3;
  P.head = chuckle * 0.05 * Math.sin(t * 1.1) - 0.08;
  P.arms = [{ a: -0.2 + 0.1 * Math.sin(T * 0.12), b: 0.4 }, { a: 0.9 + 0.2 * Math.sin(T * 0.05), b: 0.9 }];
  P.pencil = 1; P.pencilAng = -0.7;
  P.gaze = [0.7, -0.5];
  if (scene === 6) { const turn = seg(t, 34, 50); P.head += turn * 0.12; P.gaze = [0.9, -0.2 + turn * 0.6]; }
  return { P, contact: [cam.pr(fa.p[0], 600, fa.p[1]), cam.pr(fn.p[0], 600, fn.p[1])], air: [fa, fn] };
}
function scene04(f) {
  const t = f - 238;
  background(); stars(41, 50, f, { alpha: 0.8 });
  const st = paperState(4, t);
  // Sasan leans over the far edge (lower body hidden behind the sheet)
  const far = st.cam.pr(160, SHEET.v0), sc = 380 * st.cam.scaleAt(160, SHEET.v0);
  const pull = seg(t, 8, 30, E.io);
  const P = { x: far[0] + 30, y: far[1] + 70 * sc / 380 + 10, s: sc, lean: 0.55 - pull * 0.15, head: 0.12, gaze: [0.6, 0.7], smile: 0.3 };
  P.legs = [{ a: 0.05, b: 0.1 }, { a: -0.05, b: 0.05 }];
  const dotP = bez(...SPIRAL, seg(t, 6, 30, E.io));
  const dScr = P3(st, dotP[0], dotP[1]);
  const reachPt = P3(st, 300, -330);
  P.arms = [{ a: 0.4, b: 0.6 }, { hand: L2(L2(reachPt, [far[0] + 220 * sc / 380, far[1] - 30], 0.15), [far[0] + 60, far[1] - 60 * sc / 380], pull * 0.35) }];
  P.palm = -1;
  drawFigure(Object.assign({}, P, { only: 'body' }));
  drawPaper(st, t, 'solid', 4);
  drawFigure(Object.assign({}, P, { only: 'nearArm' }));
  glowDot(dScr[0], dScr[1], 28 * st.cam.scaleAt(dotP[0], dotP[1]));
}
function scene05(f) {
  const t = f - 280;
  background(); stars(51, 50, f, { alpha: 0.8 });
  const st = paperState(5, t);
  drawPaper(st, t, 'solid', 5);
  const cam = st.cam;
  drawStair(cam, t, 5);
  const R = roomSasan(cam, t, 5);
  R.contact.forEach((c, i) => { if (Math.abs(R.air[i].ang) < 0.01) contactShadow(c[0] + 8, c[1] + 2, 36 * R.P.s / 380); });
  drawFigure(R.P);
  // the idea dot lifts off the folding paper and floats toward the doorway
  const pd = P3(st, SPIRAL[3][0], SPIRAL[3][1]);
  const target = cam.pr(420, VC, 430);
  const u = seg(t, 10, 64, E.io);
  const mid = [lerp(pd[0], target[0], u), lerp(pd[1], target[1], u) - Math.sin(Math.PI * u) * 120];
  glowDot(mid[0], mid[1], lerp(28 * cam.scaleAt(SPIRAL[3][0], SPIRAL[3][1]), 26, u));
}
function scene06(f) {
  const t = f - 358;
  const st = paperState(6, t), cam = st.cam;
  background(C.ch, '#060A1C');
  // blueprint dots
  ctx.save(); ctx.fillStyle = 'rgba(36,72,255,0.25)'; for (let y = 40; y < H; y += 60) for (let x = 30; x < W; x += 60) { circ(x, y, 1.6); ctx.fill(); } ctx.restore();
  drawPaper(st, t, 'wire', 6);
  drawStair(cam, t, 6);
  const R = roomSasan(cam, t, 6);
  drawFigure(R.P);
  // dot rides the doorway, then traces the window rim; its ivory line leads outward
  const door = cam.pr(420, VC, 430);
  const trace = seg(t, 14, 52, E.io);
  const a0 = -0.35, sweep = TAU * 0.9;
  let d = door;
  if (trace > 0) {
    const rim = a => P3(st, 366 * 1.07 * Math.cos(a), -366 * 1.07 * Math.sin(a));
    const pts = []; const n = Math.max(2, Math.round(80 * trace));
    for (let i = 0; i <= n; i++) pts.push(rim(a0 + sweep * trace * i / n));
    ctx.save(); ctx.strokeStyle = C.iv; ctx.lineWidth = 6; ctx.lineCap = 'round'; pline(pts); ctx.stroke(); ctx.restore();
    d = L2(door, pts[pts.length - 1], seg(t, 14, 22, E.io));
  }
  glowDot(d[0], d[1], 26);
}

// ---------- scene 07 + 08: tool orbit → escape portal ----------
const TOOL_R = 1.13;
function ring7(t) { // tipped ring geometry across scene 07
  const u = seg(t, 18, 62, E.io);
  return { cx: 540, cy: lerp(ANCHOR.y, 922, u), R: lerp(ANCHOR.r, 356, u), tip: lerp(0, Math.acos(119 / 356), u) };
}
function toolAngle(f) { return 0.6 + (f - 412) * 0.045; } // continuous clockwise orbit
function drawTool(kind, x, y, sc, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
  ctx.lineJoin = 'round';
  if (kind === 0) { // camera
    ctx.fillStyle = S.iv4; ctx.beginPath(); ctx.roundRect(-58, -36, 120, 84, 16); ctx.fill();
    ctx.fillStyle = C.iv; ctx.beginPath(); ctx.roundRect(-62, -40, 120, 84, 16); ctx.fill();
    ctx.fillStyle = S.iv2; ctx.beginPath(); ctx.roundRect(-20, -58, 46, 22, 6); ctx.fill();
    circ(0, 2, 32); ctx.fillStyle = S.ink; ctx.fill(); circ(0, 2, 24); ctx.fillStyle = C.co; ctx.fill(); circ(0, 2, 10); ctx.fillStyle = S.co5; ctx.fill();
    circ(-6, -4, 5); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
    circ(42, -26, 6); ctx.fillStyle = S.ink; ctx.fill();
  } else if (kind === 1) { // pencil
    ctx.fillStyle = S.iv3; ctx.beginPath(); ctx.moveTo(-90, -11); ctx.lineTo(60, -11); ctx.lineTo(92, 0); ctx.lineTo(60, 11); ctx.lineTo(-90, 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.iv; ctx.beginPath(); ctx.moveTo(-90, -13); ctx.lineTo(60, -13); ctx.lineTo(60, 9); ctx.lineTo(-90, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = S.iv2; ctx.beginPath(); ctx.moveTo(60, -13); ctx.lineTo(92, -1); ctx.lineTo(60, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = S.ink; ctx.beginPath(); ctx.moveTo(82, -5); ctx.lineTo(93, -1); ctx.lineTo(82, 3); ctx.fill();
    ctx.fillStyle = C.co; ctx.fillRect(-98, -13, 14, 22);
  } else { // set square
    ctx.fillStyle = S.iv3; ctx.beginPath(); ctx.moveTo(-60, 54); ctx.lineTo(70, 54); ctx.lineTo(-60, -76); ctx.closePath();
    ctx.moveTo(-38, 32); ctx.lineTo(-38, -24); ctx.lineTo(18, 32); ctx.closePath(); ctx.fill('evenodd');
    ctx.translate(-4, -4);
    ctx.fillStyle = C.iv; ctx.beginPath(); ctx.moveTo(-60, 54); ctx.lineTo(70, 54); ctx.lineTo(-60, -76); ctx.closePath();
    ctx.moveTo(-38, 32); ctx.lineTo(-38, -24); ctx.lineTo(18, 32); ctx.closePath(); ctx.fill('evenodd');
    ctx.strokeStyle = S.iv4; ctx.lineWidth = 2; for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.moveTo(-52 + k * 13, 54); ctx.lineTo(-52 + k * 13, k % 2 ? 46 : 42); ctx.stroke(); }
  }
  ctx.restore();
}
function tools(f, rg, depthSide, alpha, flyT = 0) {
  const base = toolAngle(f);
  const c = Math.cos(rg.tip);
  for (let k = 0; k < 3; k++) {
    const a = base + k * TAU / 3;
    const depth = Math.sin(a);
    if ((depth >= 0) !== (depthSide === 'front')) continue;
    let x = rg.cx + rg.R * TOOL_R * Math.cos(a), y = rg.cy + rg.R * TOOL_R * c * Math.sin(a);
    if (flyT > 0) { // leave along the tangent of the clockwise orbit
      const tx = -Math.sin(a), ty = Math.cos(a) * c; const d = flyT * flyT * 1500;
      x += tx * d; y += ty * d - flyT * 200;
    }
    const sc = (1 + 0.14 * depth * Math.sin(rg.tip)) * 0.95;
    ctx.save(); ctx.globalAlpha = alpha; drawTool(k, x, y, sc, a * 0.35 + k); ctx.restore();
  }
}
function platform7(cy, f, shards = 0, fallY = 0) {
  // ivory folded-paper pedestal: top face + front face with arch
  const top = cy, x0 = 270, x1 = 810, d = 70, fh = 260;
  if (shards <= 0) {
    fillPoly([[x0 + 40, top - d], [x1 - 40, top - d], [x1, top], [x0, top]], C.iv);
  }
  const fy = top + fallY * 0.6;
  const g = ctx.createLinearGradient(0, fy, 0, fy + fh); g.addColorStop(0, S.iv2); g.addColorStop(1, S.iv4);
  fillPoly([[x0, fy], [x1, fy], [x1, fy + fh], [x0, fy + fh]], g);
  ctx.fillStyle = S.ch1; ctx.beginPath(); ctx.moveTo(500, fy + fh); ctx.lineTo(500, fy + 120); ctx.arc(540, fy + 120, 40, Math.PI, 0); ctx.lineTo(580, fy + fh); ctx.fill();
  if (shards > 0) {
    // torn top face: four rigid shards rotating away along the crease lines
    const pieces = [
      [[x0 + 40, top - d], [500, top - d], [470, top], [x0, top]],
      [[500, top - d], [640, top - d], [600, top], [470, top]],
      [[640, top - d], [x1 - 40, top - d], [x1, top], [600, top]],
    ];
    pieces.forEach((pc, i) => {
      const cx = pc.reduce((s, p) => s + p[0], 0) / 4, cy2 = pc.reduce((s, p) => s + p[1], 0) / 4;
      const sp = shards; const vx = (i - 1) * 260 * sp, vy = 520 * sp * sp + 60 * sp, rot = (i - 1 || 0.6) * 1.4 * sp;
      ctx.save(); ctx.translate(cx + vx, cy2 + vy); ctx.rotate(rot);
      fillPoly(pc.map(p => [p[0] - cx, p[1] - cy2]), i % 2 ? S.iv1 : C.iv);
      ctx.restore();
    });
  }
}
function sasan7(f) {
  const t = f - 412;
  const spread = seg(t, 8, 40, E.io);
  const P = { x: 540, y: 1252 - LEN.hipH * 400 + 6, s: 400, view: 'front', smile: 0.4, gaze: [0, -0.3] };
  P.legs = [{ foot: [505, 1252] }, { foot: [575, 1252] }];
  P.arms = [{ a: lerp(0.15, 1.35, spread), b: lerp(0.3, 0.35, spread) }, { a: lerp(0.15, 1.35, spread), b: lerp(0.3, 0.35, spread) }];
  P.palm = -1;
  return P;
}
function scene07(f) {
  const t = f - 412;
  background(); stars(71, 60, f);
  const rg = ring7(t);
  platform7(1252, f);
  // ivory connecting line: continues from scene 06 and closes into the orbit
  const lineT = seg(t, 0, 34, E.io);
  const c = Math.cos(rg.tip);
  const drawOrbitLine = (side) => {
    ctx.save(); ctx.beginPath(); if (side === 'back') ctx.rect(0, 0, W, rg.cy); else ctx.rect(0, rg.cy, W, H); ctx.clip();
    ctx.strokeStyle = C.iv; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(rg.cx, rg.cy, rg.R * TOOL_R, rg.R * TOOL_R * c, 0, -0.15, -0.15 + TAU * (0.35 + 0.65 * lineT)); ctx.stroke();
    ctx.restore();
  };
  drawOrbitLine('back');
  const ta = inv(4, 16, t);
  tools(f, rg, 'back', ta);
  tippedRing(rg.cx, rg.cy, rg.R, 54, rg.tip, 'back', C.co, 22);
  const P = sasan7(f); drawFigure(P);
  // dot travels from the window rim to the shared idea at Sasan's chest
  const d = L2([540 + 350 * 1.06 * Math.cos(-0.15 + TAU * 0.98), ANCHOR.y + 350 * 1.06 * Math.sin(-0.15 + TAU * 0.98)], [540, 985], seg(t, 0, 20, E.io));
  tippedRing(rg.cx, rg.cy, rg.R, 54, rg.tip, 'front', C.co, 22);
  drawOrbitLine('front');
  tools(f, rg, 'front', ta);
  glowDot(d[0], d[1] - Math.sin(t * 0.12) * 4 * seg(t, 20, 30), 30);
}
function scene08(f) {
  const t = f - 493;
  // fall kinematics: support lost at t=10, world fall + partial camera follow
  const tf = Math.max(0, t - 10);
  const worldFall = 0.5 * 0.82 * tf * tf;
  const screenDisp = 122 * Math.pow(tf / 32, 2);
  const cam = worldFall - screenDisp;
  { const u = inv(4, 42, t); background(C.ch, `rgb(${Math.round(lerp(8, 7, u))},${Math.round(lerp(11, 12, u))},${Math.round(lerp(16, 38, u))})`); }
  stars(81, 70, f, { dy: -cam * 0.5 });
  // the universe below rises into view
  planet(170, 2460 - cam * 0.95, 560, -1.9);
  planet(900, 2020 - cam * 0.8, 60, -2.4);
  // speed lines
  if (tf > 4) {
    ctx.save(); ctx.strokeStyle = 'rgba(244,239,217,0.35)'; ctx.lineWidth = 2;
    const r = rng(8);
    for (let i = 0; i < 12; i++) { const x = r() * W, y = ((r() * H - cam * 1.8) % H + H) % H; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 60 + r() * 80); ctx.stroke(); }
    ctx.restore();
  }
  const rg = { cx: 540, cy: 922 - cam, R: 356, tip: Math.acos(119 / 356) };
  // portal glow inside the rim
  ctx.save(); const pg = ctx.createRadialGradient(540, rg.cy, 10, 540, rg.cy, 356);
  pg.addColorStop(0, `rgba(36,72,255,${0.35 * inv(0, 12, t)})`); pg.addColorStop(1, 'rgba(36,72,255,0)');
  ctx.fillStyle = pg; ell(540, rg.cy, 330, 330 * Math.cos(rg.tip)); ctx.fill(); ctx.restore();
  tools(f, rg, 'back', 1 - inv(6, 14, t), seg(t, 0, 14, E.in));
  tippedRing(rg.cx, rg.cy, rg.R, 54, rg.tip, 'back', C.co, 22);
  // platform tears and drops
  const shard = Math.max(0, (t - 7) / 30);
  platform7(1252 - cam, f, shard, shard * shard * 900);
  // Sasan: loses support, accelerates down, rotates counter-clockwise into a headfirst fall
  const rotT = Math.max(0, t - 12);
  const rot = -150 * DEG * (rotT * rotT / (30 * 30)) * (rotT <= 30 ? 1 : 0) - (rotT > 30 ? 150 * DEG + (rotT - 30) * 10 * DEG : 0);
  const comY = 1252 - LEN.hipH * 400 + 6 - 72 + worldFall - cam; // torso centre
  const comX = 540 + 20 * Math.pow(tf / 32, 2);
  const s = 400;
  const P = { s, view: 'front', rot, smile: 0, gaze: [0, 0.4] };
  // place hip so that the torso centre (0,-0.18) lands on com
  const off = [0, -0.18 * s]; const c = Math.cos(rot), sn = Math.sin(rot);
  P.x = comX - (off[0] * c - off[1] * sn); P.y = comY - (off[0] * sn + off[1] * c);
  const lagA = Math.min(1, tf / 14);
  P.arms = [{ a: lerp(1.35, 2.3, lagA) + 0.08 * Math.sin(t * 0.5), b: lerp(0.35, -0.2, lagA) }, { a: lerp(1.35, 2.15, lagA) + 0.08 * Math.sin(t * 0.5 + 1), b: lerp(0.35, -0.15, lagA) }];
  const dip = seg(t, 4, 10) * (1 - seg(t, 10, 16));
  P.legs = t < 10 ? [{ foot: [505, 1252 - cam] }, { foot: [575, 1252 - cam] }] : [{ a: lerp(0.1, 0.45, lagA), b: lerp(0.2, 0.9, lagA) }, { a: lerp(0.1, 0.3, lagA), b: lerp(0.2, 0.6, lagA) }];
  if (t < 10) P.y += dip * 10;
  drawFigure(P);
  tippedRing(rg.cx, rg.cy, rg.R, 54, rg.tip, 'front', C.co, 22);
  tools(f, rg, 'front', 1 - inv(6, 14, t), seg(t, 0, 14, E.in));
  // dot drifts with him toward the cut anchor (0.60W, 0.58H)
  const d = L2([540, 985 + worldFall * 0 - 0], [648, 1114], seg(t, 4, 42, E.io));
  glowDot(d[0], d[1], 30);
  return { P, comX, comY };
}

// ---------- scene 09 + 10: build my worlds → inside the head ----------
const FALL_END = (() => { // state at the 08>09 cut (t=42)
  const tf = 32; const rotT = 30; return { com: [540 + 20, 1010 + 122], v: [20 * 2 / 32, 2 * 122 / 32], rot: -150 * DEG, w: -2 * 150 * DEG / 30 };
})();
function innerWorld(f, opt = {}) {
  // everything here is in "world" coordinates where the orbit circle sits at the anchor
  const t = f - 535;
  const orbitT = opt.orbitT != null ? opt.orbitT : 1;
  // main orbit circle
  ctx.save(); ctx.strokeStyle = 'rgba(244,239,217,0.85)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(ANCHOR.x, ANCHOR.y, ANCHOR.r, -Math.PI / 2, -Math.PI / 2 + TAU * orbitT); ctx.stroke(); ctx.restore();
  // planet
  const pg = opt.planetIn != null ? opt.planetIn : 1;
  if (pg > 0) planet(430, 1150, 118 * pg, -2.2);
  // diagonal orbit (morphed from the portal arc) with three nodes
  const m = opt.morph != null ? opt.morph : 1;
  const ex = lerp(540, 540, m), ey = lerp(opt.portalY || 624, ANCHOR.y + 10, m), erx = lerp(356, 430, m), ery = lerp(119, 96, m), er = lerp(0, -24 * DEG, m);
  ctx.save(); ctx.strokeStyle = m < 1 ? `rgb(${Math.round(lerp(36, 244, m))},${Math.round(lerp(72, 239, m))},${Math.round(lerp(255, 217, m))})` : C.iv; ctx.lineWidth = lerp(54, 3.5, Math.pow(m, 0.35));
  ell(ex, ey, erx, ery, er); ctx.stroke(); ctx.restore();
  if (m > 0.6) {
    ctx.save(); ctx.globalAlpha = inv(0.6, 1, m);
    for (let k = 0; k < 3; k++) {
      const a = (f - 535) * 0.03 + k * 2.1;
      const px = ex + erx * Math.cos(a) * Math.cos(er) - ery * Math.sin(a) * Math.sin(er), py = ey + erx * Math.cos(a) * Math.sin(er) + ery * Math.sin(a) * Math.cos(er);
      circ(px, py, 10); ctx.fillStyle = C.iv; ctx.fill();
    }
    ctx.restore();
  }
  // miniature impossible stair-and-cube structure, drawn by the pencil
  const build = opt.build != null ? opt.build : 1;
  structure(650, 1215, build, f);
}
function structure(x, y, b, f) {
  if (b <= 0) return;
  ctx.save(); ctx.translate(x, y);
  const lineA = clamp(b * 1.6), fillA = inv(0.55, 1, b);
  // cube block with an arch window (ivory) + cobalt stair climbing its side
  const faces = [
    { pts: [[-70, -140], [40, -140], [80, -170], [-30, -170]], c: C.iv },
    { pts: [[-70, -140], [40, -140], [40, 0], [-70, 0]], c: S.iv1 },
    { pts: [[40, -140], [80, -170], [80, -30], [40, 0]], c: S.iv3 },
  ];
  ctx.globalAlpha = fillA; faces.forEach(fc => fillPoly(fc.pts, fc.c));
  ctx.fillStyle = S.co2; ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-34, -60); ctx.arc(-15, -60, 19, Math.PI, 0); ctx.lineTo(4, 0); ctx.fill();
  for (let k = 0; k < 6; k++) { fillPoly([[-150 + k * 16, -k * 24], [-118 + k * 16, -k * 24], [-118 + k * 16, -k * 24 + 24], [-150 + k * 16, -k * 24 + 24]], k % 2 ? S.co2 : C.co); fillPoly([[-150 + k * 16, -k * 24], [-118 + k * 16, -k * 24], [-108 + k * 16, -k * 24 - 8], [-140 + k * 16, -k * 24 - 8]], S.co1); }
  ctx.globalAlpha = 1;
  // pencil line drawing layer
  if (lineA < 1 || fillA < 1) {
    ctx.strokeStyle = C.iv; ctx.lineWidth = 3; ctx.setLineDash([900]); ctx.lineDashOffset = 900 * (1 - lineA);
    ctx.beginPath(); faces.forEach(fc => { fc.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); });
    ctx.moveTo(-150, 24); for (let k = 0; k < 6; k++) { ctx.lineTo(-150 + k * 16, -k * 24); ctx.lineTo(-118 + k * 16, -k * 24); }
    ctx.globalAlpha = 1 - fillA * 0.7; ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}
function sasan9(f) {
  const t = f - 535;
  const n = 34;
  const com = hermite(FALL_END.com, FALL_END.v, [470, 905], [0, 0], n, t / n);
  const drift = t > n ? [Math.sin((t - n) * 0.08) * 6, -Math.sin((t - n) * 0.06) * 8] : [0, 0];
  const p = [com[0] + drift[0], com[1] + drift[1]];
  let rot, view, s;
  // keep turning counter-clockwise; switch to the side rig mid-turn, settle into the float-and-draw pose
  if (t < 10) { rot = FALL_END.rot + FALL_END.w * t * (1 - t / 24); view = 'front'; }
  else { const r10 = FALL_END.rot + FALL_END.w * 10 * (1 - 10 / 24) + TAU; rot = hermite1(r10, FALL_END.w * (1 - 20 / 24), 78 * DEG, 0, 26, (t - 10) / 26); view = 'side'; }
  s = lerp(400, 230, seg(t, 0, 36, E.io));
  const P = { s, rot, view, smile: t > 24 ? 0.5 : 0, gaze: [0.6, 0.5] };
  const off = [0, -0.18 * s]; const c = Math.cos(rot), sn = Math.sin(rot);
  P.x = p[0] - (off[0] * c - off[1] * sn); P.y = p[1] - (off[0] * sn + off[1] * c);
  const lag = 1 - seg(t, 0, 20);
  if (view === 'front') {
    P.arms = [{ a: 2.3, b: -0.2 }, { a: 2.15, b: -0.15 }];
    P.legs = [{ a: 0.45, b: 0.9 }, { a: 0.3, b: 0.6 }];
  } else {
    const drawT = seg(t, 24, 50, E.lin);
    P.legs = [{ a: -0.5 - 0.15 * lag, b: 0.6 }, { a: -0.2 + 0.05 * Math.sin(t * 0.15), b: 0.9 }];
    P.arms = [{ a: -0.6 + 0.2 * lag, b: 0.5 }, { a: 1.2, b: 0.3 }];
    P.pencil = 1; P.pencilAng = rot + 0.95;
    if (t > 18) {
      // pencil tip traces the structure outline
      const tip = structureTip(drawT);
      const blend = seg(t, 18, 26);
      const wr = wristForTip(tip, P.pencilAng, 0.16, s);
      const free = handPoint(P, 1, 0);
      P.arms[1] = { hand: L2(free, wr, blend) };
    }
  }
  return P;
}
function structureTip(u) {
  const path = [[650 - 150, 1215 + 24], [650 - 54, 1215 - 120], [650 - 70, 1215 - 140], [650 - 30, 1215 - 170], [650 + 80, 1215 - 170], [650 + 40, 1215 - 140], [650 + 40, 1215]];
  const n = path.length - 1, x = clamp(u) * n, i = Math.min(n - 1, Math.floor(x));
  return L2(path[i], path[i + 1], E.sine(x - i));
}
function dot9(f) {
  const t = f - 535;
  const start = [648, 1114];
  const end = [632, 1028];
  return hermite(start, [0, 3], end, [0, 0], 30, t / 30);
}
function scene09(f) {
  const t = f - 535;
  background('#070C26', '#060A1C');
  stars(91, 80, f, { dy: -t * 0.6 });
  const morph = seg(t, 0, 22, E.io);
  innerWorld(f, { orbitT: seg(t, 8, 40, E.io), morph, portalY: 624 - t * 2, build: seg(t, 22, 50, E.lin), planetIn: E.outBack(inv(4, 18, t)) });
  const P = sasan9(f);
  drawFigure(P);
  const d = dot9(f); glowDot(d[0], d[1], 27);
}
function scene10(f) {
  const t = f - 586;
  background('#070C26', '#060A1C');
  const k = lerp(1, 0.56, seg(t, 0, 30, E.io));
  const fc = [540, lerp(ANCHOR.y, 860, seg(t, 0, 30, E.io))]; // where the orbit centre lands on screen
  stars(101, 90, f, { sc: 1, alpha: 1 });
  // head geometry in final screen space
  const headY = 1330 + (1 - seg(t, 0, 26, E.io)) * 700;
  const H0 = { x: 540, y: headY, rx: 340, ry: 400 };
  const cutY = headY - 300, cutRx = 300, cutRy = 62;
  // turtleneck + shoulders
  ctx.save();
  ctx.fillStyle = S.body; ctx.strokeStyle = S.rim; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-60, H + 40); ctx.bezierCurveTo(-40, headY + 420, 200, headY + 330, 540, headY + 330); ctx.bezierCurveTo(880, headY + 330, 1120, headY + 420, 1140, H + 40); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1C2029'; ctx.beginPath(); ctx.roundRect(390, headY + 300, 300, 140, 50); ctx.fill();
  ctx.restore();
  // ears
  for (const sx of [-1, 1]) { ell(540 + sx * 338, headY + 40, 46, 74); ctx.fillStyle = S.iv2; ctx.fill(); ell(540 + sx * 338, headY + 40, 24, 44); ctx.fillStyle = S.iv3; ctx.fill(); }
  // head below the cut
  ctx.save();
  ctx.beginPath(); ctx.rect(0, cutY, W, H); ctx.clip();
  const g = ctx.createRadialGradient(470, headY - 60, 40, 540, headY, 430); g.addColorStop(0, '#FBF7E6'); g.addColorStop(0.75, C.iv); g.addColorStop(1, S.iv2);
  ell(H0.x, H0.y, H0.rx, H0.ry); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = S.rim; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
  // cavity (the open skull) — dark inner universe
  ctx.save(); ell(540, cutY, cutRx, cutRy); ctx.fillStyle = '#050A26'; ctx.fill(); ctx.restore();
  // inner world (scaled), clipped so its lower part sits inside the head
  ctx.save();
  // clip: everything above the cut ellipse's front edge, or inside the cavity
  ctx.beginPath(); ctx.rect(0, 0, W, cutY); ctx.moveTo(540 + cutRx, cutY); ctx.ellipse(540, cutY, cutRx, cutRy, 0, 0, Math.PI, false); ctx.closePath(); ctx.clip();
  ctx.translate(fc[0], fc[1]); ctx.scale(k, k); ctx.translate(-ANCHOR.x, -ANCHOR.y);
  innerWorld(f, {});
  const P = sasan9(586 + 0); P.x += Math.sin(t * 0.05) * 8; P.y += Math.sin(t * 0.04) * 10;
  const tt = 51 + t; const tip = structureTip(1);
  drawFigure(Object.assign(sasan9(535 + Math.min(51, 51)), { x: P.x + Math.sin(t * 0.05) * 8, y: P.y }));
  ctx.restore();
  // rim of the cut (front half, thickness)
  ctx.save(); ctx.strokeStyle = S.iv3; ctx.lineWidth = 10; ctx.beginPath(); ctx.ellipse(540, cutY, cutRx, cutRy, 0, 0, Math.PI); ctx.stroke();
  ctx.strokeStyle = C.iv; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(540, cutY - 3, cutRx, cutRy, 0, 0, Math.PI); ctx.stroke(); ctx.restore();
  // reveal mask: before the head arrives, keep the original full-frame universe (paper-mask wipe)
  // lid on a fixed rear hinge (left), settling open
  const lidA = -(128 + 14 * Math.exp(-Math.max(0, t - 16) / 10) * Math.cos(Math.max(0, t - 16) * 0.45)) * DEG * seg(t, 4, 16, E.out);
  ctx.save(); ctx.translate(540 - cutRx + 6, cutY); ctx.rotate(lidA);
  ctx.beginPath(); ctx.ellipse(cutRx, 0, cutRx, 210, 0, Math.PI, 0); ctx.ellipse(cutRx, 0, cutRx, cutRy, 0, 0, Math.PI, false); ctx.closePath();
  const lg = ctx.createLinearGradient(0, -210, 0, 60); lg.addColorStop(0, '#FBF7E6'); lg.addColorStop(1, S.iv2);
  ctx.fillStyle = lg; ctx.fill(); ctx.strokeStyle = S.rim; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cutRx, 0, cutRx, cutRy, 0, 0, TAU); ctx.fillStyle = S.iv3; ctx.fill();
  ctx.restore();
  // face
  const dotP = dot10(f);
  const gx = clamp((dotP[0] - 540) / 300, -1, 1), gy = clamp((dotP[1] - (headY + 40)) / 400, -1, 1);
  const smile = seg(t, 56, 64);
  ctx.save(); ctx.strokeStyle = S.ink; ctx.lineWidth = 17; ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (const sx of [-1, 1]) { circ(540 + sx * 112, headY + 50, 84); ctx.fill(); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(512, headY + 46); ctx.quadraticCurveTo(540, headY + 30, 568, headY + 46); ctx.stroke();
  ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(540 - 196, headY + 44); ctx.lineTo(540 - 300, headY + 30); ctx.moveTo(540 + 196, headY + 44); ctx.lineTo(540 + 300, headY + 30); ctx.stroke();
  ctx.fillStyle = S.ink;
  for (const sx of [-1, 1]) {
    const ex = 540 + sx * 112 + gx * 26, ey = headY + 50 + gy * 26;
    if (smile > 0.5) { ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(ex, ey + 10, 22, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    else { circ(ex, ey, 18); ctx.fill(); }
  }
  ctx.fillStyle = S.iv2; ell(540, headY + 140, 34, 26); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.translate(540, headY + 200); ctx.scale(410, 410); moustache(0, 0, 1); ctx.restore();
  if (smile > 0) { ctx.save(); ctx.strokeStyle = S.ink; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(500, headY + 250); ctx.quadraticCurveTo(540, headY + 250 + 18 * smile, 580, headY + 250); ctx.stroke(); ctx.restore(); }
  // paper-mask reveal: the original framing stays visible inside a shrinking circle for the first frames
  if (t < 14) {
    ctx.save();
    const rr = lerp(1500, 0, E.in(inv(0, 14, t)));
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(540, ANCHOR.y, ANCHOR.r, 0, TAU, true); ctx.clip('evenodd');
    ctx.beginPath(); ctx.arc(540, ANCHOR.y, ANCHOR.r + rr, 0, TAU); ctx.arc(540, ANCHOR.y, ANCHOR.r, 0, TAU, true); ctx.clip('evenodd');
    background('#070C26', '#060A1C'); stars(91, 80, f, { dy: -(51) * 0.6 });
    ctx.restore();
  }
  glowDot(dotP[0], dotP[1], dotP[2]);
}
function dot10(f) {
  const t = f - 586;
  const k = lerp(1, 0.56, seg(t, 0, 30, E.io)), fcy = lerp(ANCHOR.y, 860, seg(t, 0, 30, E.io));
  const inner = [540 + (632 - 540) * k, fcy + (1028 - ANCHOR.y) * k];
  const rise = seg(t, 36, 70, E.io);
  const target = [670, 768];
  let p = L2(inner, target, rise);
  p[1] -= Math.sin(Math.PI * rise) * 70; p[0] += Math.sin(Math.PI * rise) * 40;
  // small damped settling arc at the end
  if (t > 70) { const s = t - 70; p[0] += 6 * Math.exp(-s / 5) * Math.sin(s * 0.9); }
  return [p[0], p[1], lerp(27 * k, 54, rise)];
}

// ---------- scene 11 + 12: the atelier ----------
const DESK = { by: 1340, fy: 1600, bx0: 100, bx1: 980, fx0: 40, fx1: 1040, th: 46 };
const CIRC1 = { x: 497, y: 1459, rx: 205, ry: 70 }, CIRC2 = { x: 787, y: 1459, rx: 205, ry: 70 };
function lamp(f) {
  const t = f - 667;
  const L = 818, pivot = [670, -50];
  const phi = 0.03 * Math.exp(-t / 45) * Math.sin(t * 0.16 + 0.4);
  const bulb = [pivot[0] + Math.sin(phi) * L, pivot[1] + Math.cos(phi) * L];
  return { pivot, bulb, phi };
}
function drawLamp(f) {
  const { pivot, bulb, phi } = lamp(f);
  // soft light cone (ivory, very low alpha) toward the desk
  ctx.save();
  const cg = ctx.createLinearGradient(0, bulb[1], 0, 1500);
  cg.addColorStop(0, 'rgba(244,239,217,0.20)'); cg.addColorStop(1, 'rgba(244,239,217,0)');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(bulb[0] - 70, bulb[1] - 10); ctx.lineTo(bulb[0] + 70, bulb[1] - 10); ctx.lineTo(bulb[0] + 360, 1500); ctx.lineTo(bulb[0] - 360, 1500); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.strokeStyle = S.ink; ctx.lineWidth = 4; pline([pivot, [bulb[0] - Math.sin(phi) * 70, bulb[1] - Math.cos(phi) * 70]]); ctx.stroke();
  glowDot(bulb[0], bulb[1], 54);
  ctx.translate(bulb[0], bulb[1]); ctx.rotate(-phi);
  ctx.fillStyle = '#0B0E13'; ctx.beginPath(); ctx.moveTo(-96, 6); ctx.bezierCurveTo(-90, -60, -40, -78, 0, -78); ctx.bezierCurveTo(40, -78, 90, -60, 96, 6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(244,239,217,0.35)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#0B0E13'; ctx.fillRect(-10, -98, 20, 24);
  ctx.restore();
}
function atelierBack(f) {
  background();
  // ivory back wall + charcoal recess with the cobalt book doorway
  const wg = ctx.createLinearGradient(0, 640, 0, 1310); wg.addColorStop(0, S.iv2); wg.addColorStop(1, C.iv);
  ctx.fillStyle = wg; ctx.fillRect(0, 640, 720, 670);
  ctx.fillStyle = S.ch2; ctx.fillRect(720, 640, 360, 670);
  ctx.fillStyle = 'rgba(8,11,16,0.25)'; ctx.fillRect(704, 640, 16, 670);
  // shelf niches
  for (const [x, y, w, h] of [[44, 780, 200, 130], [44, 930, 200, 130]]) {
    ctx.fillStyle = S.ch1; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = S.iv3; ctx.fillRect(x, y + h - 6, w, 6);
  }
  ctx.fillStyle = C.iv; ctx.fillRect(66, 820, 22, 84); ctx.fillStyle = S.iv2; ctx.fillRect(92, 834, 18, 70); ctx.fillStyle = C.co; circ(180, 880, 24); ctx.fill();
  ctx.fillStyle = S.iv1; fillPoly([[70, 1054], [140, 1054], [140, 1000], [70, 1054]], S.iv1); ctx.fillStyle = C.iv; ctx.fillRect(160, 990, 54, 64);
  // doorway (arch) with a cobalt stair inside and the door swung open like a book cover
  const ax0 = 800, ax1 = 1010, ay = 920, by = 1310, ar = (ax1 - ax0) / 2;
  ctx.fillStyle = C.co; ctx.beginPath(); ctx.moveTo(ax0 - 22, by); ctx.lineTo(ax0 - 22, ay); ctx.arc(ax0 + ar, ay, ar + 22, Math.PI, 0); ctx.lineTo(ax1 + 22, by); ctx.closePath(); ctx.fill();
  ctx.fillStyle = S.co5; ctx.beginPath(); ctx.moveTo(ax0, by); ctx.lineTo(ax0, ay); ctx.arc(ax0 + ar, ay, ar, Math.PI, 0); ctx.lineTo(ax1, by); ctx.closePath(); ctx.fill();
  for (let k = 0; k < 6; k++) { const sx = ax0 + 30 + k * 26, sy = by - 30 - k * 34; fillPoly([[sx, sy], [ax1, sy], [ax1, sy + 34], [sx, sy + 34]], k % 2 ? S.co3 : S.co2); fillPoly([[sx, sy], [ax1, sy], [ax1, sy + 8], [sx, sy + 8]], S.co1); }
  fillPoly([[ax0, by], [ax0, ay - 20], [ax0 - 90, ay + 30], [ax0 - 90, by + 40]], S.co3);
  ctx.strokeStyle = S.co1; ctx.lineWidth = 3; pline([[ax0 - 8, ay], [ax0 - 80, ay + 40]]); ctx.stroke();
  // floor
  ctx.fillStyle = S.ch1; ctx.fillRect(0, 1310, W, H - 1310);
  ctx.fillStyle = S.iv3; ctx.fillRect(0, 1306, 720, 6);
}
function atelierDesk(f, c1, c2) {
  const d = DESK;
  // legs
  for (const [x, y0] of [[d.fx0 + 30, d.fy + d.th], [d.fx1 - 60, d.fy + d.th]]) { ctx.fillStyle = S.iv3; ctx.fillRect(x, y0, 30, 260); ctx.fillStyle = S.iv4; ctx.fillRect(x + 22, y0, 8, 260); }
  fillPoly([[d.bx0, d.by], [d.bx1, d.by], [d.fx1, d.fy], [d.fx0, d.fy]], C.iv);
  const g = ctx.createLinearGradient(0, d.fy, 0, d.fy + d.th); g.addColorStop(0, S.iv2); g.addColorStop(1, S.iv3);
  fillPoly([[d.fx0, d.fy], [d.fx1, d.fy], [d.fx1, d.fy + d.th], [d.fx0, d.fy + d.th]], g);
  // paper sheet on the desk
  fillPoly([[230, 1372], [940, 1372], [990, 1560], [190, 1560]], '#FBF8EA');
  ctx.strokeStyle = 'rgba(8,11,16,0.08)'; ctx.lineWidth = 2; poly([[230, 1372], [940, 1372], [990, 1560], [190, 1560]]); ctx.stroke();
  const ringStroke = (c, u, a0) => {
    if (u <= 0) return;
    ctx.save(); ctx.strokeStyle = C.co; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, a0, a0 + TAU * u * (u < 1 ? 1 : 1.0001)); ctx.stroke(); ctx.restore();
  };
  ringStroke(CIRC1, c1, Math.PI);
  ringStroke(CIRC2, c2, 0);
}
function ellPt(c, a) { return [c.x + c.rx * Math.cos(a), c.y + c.ry * Math.sin(a)]; }
function sasan11(f) {
  // seated behind the desk, drawing circle 1 with a long pencil, then turning toward the doorway
  const t = f - 667;
  const drawU = seg(t, 12, 72, E.sine);
  const turn = seg(t, 84, 110, E.io);
  const welcome = f >= 795 ? seg(f - 795, 4, 20, E.io) * (1 - seg(f - 795, 50, 66, E.io)) : 0;
  const s = 600;
  const a = Math.PI + drawU * TAU;
  const relax = f >= 795 ? seg(f - 795, 66, 80, E.io) : 0;
  const idleA = Math.PI * 1.25 + Math.sin((f - 870) * 0.05) * 0.6 * relax;
  let tip = drawU < 1 ? ellPt(CIRC1, a) : ellPt(CIRC1, Math.PI + TAU);
  if (turn > 0) tip = L2(tip, [tip[0] + 10, tip[1] - 26], turn * (1 - relax));
  if (relax > 0) tip = L2(tip, ellPt(CIRC1, idleA), relax);
  const lean = 0.62 + (tip[0] - 497) / 205 * 0.14 - turn * 0.28 * (1 - relax) + relax * 0.0;
  const hipX = 330 + (tip[0] - 497) * 0.18;
  const P = { x: hipX, y: 1400, s, lean, head: -0.1 + turn * 0.2 * (1 - relax) - welcome * 0.05, smile: lerp(0.2, 0.9, Math.max(turn, welcome)) * (relax > 0.5 ? 0.6 : 1), gaze: [0.8, lerp(0.8, -0.4, Math.max(turn * (1 - relax), welcome))] };
  P.legs = [{ a: 1.35, b: 1.5 }, { a: 1.3, b: 1.45 }];
  const pa = 1.05;
  const wr = wristForTip(tip, pa, 0.2, s);
  P.pencil = 1; P.pencilAng = pa; P.pencilLen = 0.2;
  P.arms = [{ hand: [hipX + 150, 1330] }, { hand: wr }];
  if (welcome > 0) {
    const open = { a: lerp(0.6, 1.9, welcome), b: lerp(0.9, -0.15, welcome) };
    const pencilArm = P.arms[1];
    P.arms[1] = welcome > 0.02 ? open : pencilArm; P.pencil = welcome > 0.02 ? -1 : 1; P.palm = welcome > 0.02 ? 1 : -1;
    if (welcome < 1 && welcome > 0.02) { // blend from the pencil pose via the hand position
      const hp = handPoint(Object.assign({}, P, { arms: [P.arms[0], open] }), 1, 0);
      P.arms[1] = { hand: L2(wr, hp, welcome) };
    }
  }
  return { P, tip };
}
function guest12(f) {
  const t = f - 795;
  // enters from the doorway, walks toward the desk, stops, pivots and draws circle 2
  const walkU = seg(t, 6, 56, E.lin);
  const n = 50;
  const hp0 = [905, 1075], hp1 = [930, 1300];
  const pos = hermite(hp0, [0, 0], hp1, [0, 0], n, walkU);
  const s = lerp(470, 610, E.sine(walkU));
  const steps = walkU > 0 && walkU < 1 ? Math.sin(t * Math.PI / 8) : 0;
  const drawU = seg(t, 70, 108, E.sine);
  const lean = seg(t, 56, 68, E.io) * 0.6;
  const a = drawU * TAU;
  const tip = ellPt(CIRC2, a);
  const P = { pal: 'guest', dir: -1, s, x: pos[0] - (drawU > 0 ? (tip[0] - 787) * 0.2 : 0), y: pos[1] - Math.abs(steps) * 6, lean: lean + (drawU > 0 ? (787 - tip[0]) / 205 * 0.1 : 0) };
  const sw = steps * 0.45;
  P.legs = [{ a: sw, b: Math.max(0, sw) * 0.6 + 0.05 }, { a: -sw, b: Math.max(0, -sw) * 0.6 + 0.05 }];
  P.arms = [{ a: -sw * 0.8, b: 0.3 }, { a: sw * 0.8 + seg(t, 56, 70) * 0.8, b: 0.4 + seg(t, 56, 70) * 0.5 }];
  if (t >= 64) {
    const pa = Math.PI - 1.05;
    P.pencil = 1; P.pencilAng = 1.05; P.pencilLen = 0.2;
    const wr = [tip[0] + Math.cos(1.05) * 0.23 * s * 1, tip[1] - Math.sin(1.05) * 0.23 * s];
    const wr2 = [tip[0] + Math.cos(pa - Math.PI) * -0.23 * s, tip[1] - Math.sin(1.05) * 0.23 * s];
    const blend = seg(t, 62, 70);
    const free = handPoint(P, 1, 0);
    P.arms[1] = { hand: L2(free, wr2, blend) };
  }
  return { P, drawU };
}
function scene11(f) {
  const t = f - 667;
  atelierBack(f);
  drawLamp(f);
  const { P } = sasan11(f);
  // stool
  ctx.fillStyle = S.ch3; ctx.fillRect(P.x - 70, 1440, 140, 26);
  drawFigure(Object.assign({}, P, { only: 'body' }));
  atelierDesk(f, seg(t, 12, 72, E.sine), 0);
  drawFigure(Object.assign({}, P, { only: 'nearArm' }));
  // head-world planes open into the studio walls
  if (t < 18) {
    const u = E.io(inv(0, 18, t));
    ctx.save();
    for (const sd of [-1, 1]) {
      const w = 540 * (1 - u);
      const x0 = sd < 0 ? 0 : W - w;
      const g = ctx.createLinearGradient(x0, 0, x0 + w, 0); g.addColorStop(0, sd < 0 ? C.iv : S.iv2); g.addColorStop(1, sd < 0 ? S.iv2 : C.iv);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x0, sd < 0 ? 0 : -60 * u); ctx.lineTo(x0 + w, sd < 0 ? -60 * u : 0); ctx.lineTo(x0 + w, sd < 0 ? H + 60 * u : H); ctx.lineTo(x0, sd < 0 ? H : H + 60 * u); ctx.fill();
    }
    ctx.restore();
    const { bulb } = lamp(f); glowDot(bulb[0], bulb[1], 54);
  }
}
function scene12(f) {
  const t = f - 795;
  atelierBack(f);
  drawLamp(f);
  const G = guest12(f);
  const { P } = sasan11(f);
  ctx.fillStyle = S.ch3; ctx.fillRect(P.x - 70, 1440, 140, 26);
  drawFigure(Object.assign({}, G.P, { only: 'body' }));
  drawFigure(Object.assign({}, P, { only: 'body' }));
  atelierDesk(f, 1, G.drawU);
  drawFigure(Object.assign({}, P, { only: 'nearArm' }));
  drawFigure(Object.assign({}, G.P, { only: 'nearArm' }));
}

// ---------- timeline ----------
const SCENES = [
  { id: 1, a: 0, b: 66, draw: f => sceneBridge(f, 1) },
  { id: 2, a: 66, b: 178, draw: f => sceneBridge(f, 2) },
  { id: 3, a: 178, b: 238, draw: scene03 },
  { id: 4, a: 238, b: 280, draw: scene04 },
  { id: 5, a: 280, b: 358, draw: scene05 },
  { id: 6, a: 358, b: 412, draw: scene06 },
  { id: 7, a: 412, b: 493, draw: scene07 },
  { id: 8, a: 493, b: 535, draw: scene08 },
  { id: 9, a: 535, b: 586, draw: scene09 },
  { id: 10, a: 586, b: 667, draw: scene10 },
  { id: 11, a: 667, b: 795, draw: scene11 },
  { id: 12, a: 795, b: 918, draw: scene12 },
];
function sceneAt(f) { return SCENES.find(s => f >= s.a && f < s.b) || SCENES[SCENES.length - 1]; }

function makeGrain() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); const id = g.createImageData(W, H); const r = rng(1234);
  for (let i = 0; i < W * H; i++) { const v = r() * 255; id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  g.putImageData(id, 0, 0); return c;
}
function makeVignette() {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
  v.addColorStop(0, 'rgba(8,11,16,0)'); v.addColorStop(1, 'rgba(8,11,16,0.55)');
  g.fillStyle = v; g.fillRect(0, 0, W, H); return c;
}
function initReel(canvas) {
  ctx = canvas.getContext('2d');
  grainCanvas = makeGrain(); vignetteCanvas = makeVignette();
}
function renderFrame(f, opt = {}) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const sc = sceneAt(f);
  sc.draw(f);
  ctx.restore(); ctx.save();
  ctx.drawImage(vignetteCanvas, 0, 0);
  headline(f);
  chrome(f);
  // stable print grain
  ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay'; ctx.drawImage(grainCanvas, 0, 0);
  ctx.globalAlpha = 0.035; ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(grainCanvas, 0, 0);
  ctx.restore();
  if (opt.debug) {
    ctx.save(); ctx.strokeStyle = 'rgba(255,0,255,0.8)'; ctx.lineWidth = 2; circ(ANCHOR.x, ANCHOR.y, ANCHOR.r); ctx.stroke();
    ctx.fillStyle = '#f0f'; ctx.font = '30px monospace'; ctx.fillText('f' + f + ' s' + sc.id, 20, 1890); ctx.restore();
  }
}
