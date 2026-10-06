// =====================================================================
//  SCENES — dog disco. One era at 135x240 (8 px per pixel), 16 colours; everything in low-res PIXELS, TT on 2s.
//  Orange is the dog's alone. The pose is a table keyed on the boil (24 boils per loop, one per 2 frames).
//  World time WT stops during the freeze (1.25-1.5s), so the ball, reflections, notes and bulbs freeze with
//  the dog; it runs 1.75s per loop and every world motion repeats on that, so the loop point is seamless.
// =====================================================================
const Q = PAL16;
const GY = 172;                      // the floor line
const DX = Math.round(CX / 8);       // the dog's column (59)
const WLOOP = 1.75;
const worldT = () => (TT < 1.25 ? TT : TT < 1.5 ? 1.25 : TT - 0.25);
const boil = () => mod(Math.round(TT * 12), 24);

// ---- the pose, per boil: lean, bob, arms (paw offset from the shoulder), view, jump, crouch, face
function dogPose(b) {
  const P = { lean: 0, hx: 0, bob: 0, crouch: 0, jump: 0, view: 'front', dir: 1, armL: [-4, 9], armR: [4, 9], tap: null, ears: 'up', eyes: 'open', mouth: 'smile' };
  if (b < 12) {   // the groove: a disco point left, then right; a bounce on every beat
    const k = b % 6, e = Math.floor(b / 3);
    P.bob = [3, 2, 1, 0, 0, 1][k];
    P.ears = P.bob >= 2 ? 'flop' : 'up';
    Object.assign(P, [
      { lean: -2, hx: -1, armL: [-9, 3], armR: [5, -11] },
      { lean: -1, hx: -1, armL: [-4, 9], armR: [9, -8], tap: 'L' },
      { lean: 2, hx: 1, armL: [-5, -11], armR: [9, 3] },
      { lean: 1, hx: 1, armL: [-9, -8], armR: [4, 9], tap: 'R' },
    ][e]);
  } else if (b < 15) {   // the spin: side, back, other side, with a little lift
    Object.assign(P, [{ view: 'side', dir: 1 }, { view: 'back' }, { view: 'side', dir: -1 }][b - 12], { jump: 2, armL: [-3, 8], armR: [3, 8] });
  } else if (b < 18) {   // the freeze: a deep crouch, paws forward, eyes screwed shut
    Object.assign(P, { crouch: 4, armL: [-5, 3], armR: [5, 3], ears: 'flop', eyes: 'squint', mouth: 'line' });
  } else {   // the pose: up with paws in a V, WOOF, back down into the opening pose
    const k = b - 18;
    P.jump = [0, 14, 21, 21, 14, 0][k];
    P.eyes = 'happy'; P.mouth = 'open';
    if (k === 0) Object.assign(P, { bob: -1, armL: [-8, -12], armR: [8, -12] });
    else if (k < 4) Object.assign(P, { armL: [-8, -12], armR: [8, -12], ears: k === 1 ? 'up' : 'flop' });
    else if (k === 4) Object.assign(P, { armL: [-9, -6], armR: [9, -6] });
    else Object.assign(P, { bob: 3, lean: -1, hx: -1, armL: [-9, 3], armR: [8, -4], ears: 'flop', eyes: 'open', mouth: 'smile' });
  }
  return P;
}

// ---- drawing helpers (pixel coords)
function limb(x0, y0, x1, y1, r, c) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) pcircle(Math.round(lerp(x0, x1, i / n)), Math.round(lerp(y0, y1, i / n)), r, c);
}
function shrinkTri(P, d) {
  const c = [(P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3];
  return P.map(([x, y]) => { const L = Math.hypot(x - c[0], y - c[1]) || 1; return [x + (c[0] - x) / L * d, y + (c[1] - y) / L * d]; });
}
function ear(hx, hcy, s, flop) {   // s = -1 left, +1 right; a pointy ear whose tip flops outward on the squash
  const T = [[hx + s * 3, hcy - 7], [hx + s * 12, hcy - 4], [hx + s * (flop ? 12 : 9), hcy - (flop ? 13 : 16)]];
  ppoly(T, Q.ink);
  ppoly(shrinkTri(T, 1.6), Q.orange);
  ppoly(shrinkTri(T, 3.6), Q.pink);
}
function arm(sx, sy, px, py) {   // a 3-px orange arm with an ink rim and a white sock paw
  limb(sx, sy, px, py, 2, Q.ink);
  pcircle(px, py, 3, Q.ink);
  limb(sx, sy, px, py, 1, Q.orange);
  pcircle(px, py, 2, Q.white);
}
function leg(x, top, foot, lift) {
  const fy = foot - lift;
  prect(x - 3, top, 7, fy - top + 1, Q.ink);
  prect(x - 2, top, 5, fy - top - 1, Q.orange);
  prect(x - 2, fy - 2, 5, 2, Q.white);
}
function shadeBody(bx, bcy, rx, ry, belly) {   // orange with a light top-left and a dithered brown bottom-right
  pellipse(bx, bcy, rx + 1, ry + 1, Q.ink);
  pellipse(bx, bcy, rx, ry, Q.orange);
  pdither(bx - rx, bcy - ry, 2 * rx + 1, 2 * ry + 1, null, Q.brown, (i, j) => { const u = (i - bx) / rx + (j - bcy) / ry; return ((i - bx) / rx) ** 2 + ((j - bcy) / ry) ** 2 <= 0.92 && u > 0.7 ? clamp((u - 0.7) * 1.6) : 0; });
  pdither(bx - rx, bcy - ry, 2 * rx + 1, 2 * ry + 1, null, Q.yellow, (i, j) => { const u = -(i - bx) / rx - (j - bcy) / ry; return ((i - bx) / rx) ** 2 + ((j - bcy) / ry) ** 2 <= 0.8 && u > 0.9 ? clamp((u - 0.9) * 1.4) : 0; });
  if (belly) pellipse(bx + belly[0], bcy + belly[1], belly[2], belly[3], Q.white);
}
function eye(x, y, kind, s) {
  if (kind === 'happy') { pset(x - 1, y + 1, Q.ink); prect(x, y, 2, 1, Q.ink); pset(x + 2, y + 1, Q.ink); return; }
  if (kind === 'squint') { prect(x - 1, y, 4, 1, Q.ink); pset(x + (s < 0 ? -1 : 2), y - 2, Q.ink); pset(x + (s < 0 ? 0 : 1), y - 1, Q.ink); return; }
  prect(x, y - 1, 2, 3, Q.ink); pset(x, y - 1, Q.white);
}

// ---- the dog
function drawDog(P) {
  const footY = GY + 2 - P.jump, bx = DX + P.lean, bcy = footY - 18 + P.bob + P.crouch, hx = bx + P.hx, hcy = bcy - 19;
  const flop = P.ears === 'flop', wag = boil() % 2;
  // shadow on the floor, shrinking as it rises
  const sw = Math.max(4, 12 - Math.round(P.jump / 3));
  pellipse(DX, GY + 4, sw, 1, Q.ink);
  if (P.view === 'back') {
    leg(bx - 5, bcy + 8, footY, 0); leg(bx + 5, bcy + 8, footY, 0);
    shadeBody(bx, bcy, 10, 12, null);
    arm(bx - 9, bcy - 6, bx - 11, bcy + 2); arm(bx + 9, bcy - 6, bx + 11, bcy + 2);
    // the curled tail, seen from behind, wagging
    const tx = bx + (wag ? 1 : -1), ty = bcy + 1;   // an orange curl with a brown inside and a white tip
    pcircle(tx, ty, 4, Q.ink); pcircle(tx, ty, 3, Q.orange); prect(tx - 1, ty - 1, 2, 2, Q.brown); pset(tx, ty, Q.ink);
    prect(tx + 1, ty - 3, 2, 2, Q.white);
    prect(bx - 7, hcy + 9, 15, 2, Q.red);
    ear(hx, hcy, -1, flop); ear(hx, hcy, 1, flop);
    pellipse(hx, hcy, 14, 11, Q.ink); pellipse(hx, hcy, 13, 10, Q.orange);
    pdither(hx - 13, hcy - 10, 27, 21, null, Q.brown, (i, j) => (((i - hx) / 13) ** 2 + ((j - hcy) / 10) ** 2 <= 0.75 && j - hcy > 5 ? 0.2 : 0));
    return { top: hcy - 16, hx, hcy };
  }
  if (P.view === 'side') {
    const d = P.dir;
    pcircle(bx - d * 10, bcy - 3 + wag, 4, Q.ink); pcircle(bx - d * 10, bcy - 3 + wag, 3, Q.orange); pcircle(bx - d * 10, bcy - 3 + wag, 1, Q.yellow);
    leg(bx - d * 2, bcy + 8, footY, 0); leg(bx + d * 3, bcy + 8, footY, 0);
    shadeBody(bx, bcy, 8, 12, [d * 4, 3, 3, 8]);
    arm(bx + d * 3, bcy - 6, bx + d * 7, bcy + 2);
    prect(bx - 6, hcy + 9, 13, 2, Q.red);
    ear(hx - d * 2, hcy, -d, flop);
    pellipse(hx, hcy, 12, 11, Q.ink); pellipse(hx, hcy, 11, 10, Q.orange);
    pellipse(hx + d * 11, hcy + 3, 6, 5, Q.ink); pellipse(hx + d * 11, hcy + 3, 5, 4, Q.white);
    pellipse(hx + d * 4, hcy + 5, 6, 3, Q.white);
    prect(hx + d * 15 - (d > 0 ? 1 : 1), hcy + 1, 3, 2, Q.ink);
    eye(hx + d * 5 - (d < 0 ? 1 : 0), hcy - 2, 'open', d);
    prect(hx + d * 9 - 1, hcy + 6, 3, 1, Q.ink);
    return { top: hcy - 16, hx, hcy };
  }
  // front view: tail behind, legs, body, collar, arms, ears, head, face
  pcircle(bx + 11, bcy - 2 - wag, 4, Q.ink); pcircle(bx + 11, bcy - 2 - wag, 3, Q.orange); pcircle(bx + 11, bcy - 2 - wag, 1, Q.yellow);
  leg(DX - 5 + Math.round(P.lean / 2), bcy + 8, footY, P.tap === 'L' ? 2 : 0);
  leg(DX + 5 + Math.round(P.lean / 2), bcy + 8, footY, P.tap === 'R' ? 2 : 0);
  shadeBody(bx, bcy, 10, 12, [0, 3, 6, 8]);
  arm(bx - 8, bcy - 7, bx - 8 + P.armL[0], bcy - 7 + P.armL[1]);
  arm(bx + 8, bcy - 7, bx + 8 + P.armR[0], bcy - 7 + P.armR[1]);
  ear(hx, hcy, -1, flop); ear(hx, hcy, 1, flop);
  pellipse(hx, hcy, 14, 11, Q.ink); pellipse(hx, hcy, 13, 10, Q.orange);
  pdither(hx - 13, hcy - 10, 27, 21, null, Q.yellow, (i, j) => (((i - hx) / 13) ** 2 + ((j - hcy) / 10) ** 2 <= 0.7 && (i - hx) + (j - hcy) < -9 ? 0.5 : 0));
  pellipse(hx, hcy + 5, 9, 4, Q.white);                         // white cheeks and muzzle
  prect(hx - 6, hcy - 5, 2, 1, Q.white); prect(hx + 5, hcy - 5, 2, 1, Q.white);   // eyebrow dots
  prect(hx - 7, hcy + 10, 15, 2, Q.red); prect(hx - 1, hcy + 12, 2, 2, Q.yellow);  // collar and tag
  eye(hx - 6, hcy - 1, P.eyes, -1); eye(hx + 5, hcy - 1, P.eyes, 1);
  prect(hx - 1, hcy + 2, 3, 2, Q.ink);                          // nose
  if (P.mouth === 'open') { prect(hx - 2, hcy + 4, 5, 3, Q.ink); prect(hx - 1, hcy + 5, 3, 2, Q.pink); }
  else if (P.mouth === 'line') prect(hx - 1, hcy + 5, 3, 1, Q.ink);
  else { pset(hx - 2, hcy + 5, Q.ink); pset(hx - 1, hcy + 6, Q.ink); pset(hx, hcy + 5, Q.ink); pset(hx + 1, hcy + 6, Q.ink); pset(hx + 2, hcy + 5, Q.ink); }
  prect(hx - 10, hcy + 3, 2, 1, Q.pink); prect(hx + 9, hcy + 3, 2, 1, Q.pink);   // cheeks
  SPARK_AT = pixToScreen(bx, bcy);
  return { top: hcy - 16, hx, hcy };
}

// ---- the club: beams, the disco ball, reflections, the sign, speakers, notes, the floor
function beam(x0, xa, xb, dens, col) {   // a dithered light cone from the ceiling to the floor
  const P = [[x0 - 2, 0], [x0 + 2, 0], [xb, GY + 6], [xa, GY + 6]];
  polySpans(P, 0, GY + 6).forEach((sp, j) => sp.forEach(([a, b]) => { for (let i = a; i < b; i++) if (dens * (0.55 + 0.45 * j / GY) > bayer(i, j)) pset(i, j, col); }));
}
function discoBall(wt, flash) {
  const cx = DX, cy = 21, r = 9, rot = Math.floor(wt * 48 / 7);   // 12 facet steps per world loop
  prect(cx, 0, 1, cy - r, Q.grey);
  pglow(cx, cy, r + 1, r + 7, flash ? Q.white : Q.slate, flash ? 0.7 : 0.45);
  pcircle(cx, cy, r + 1, Q.ink);
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    if (i * i + j * j > (r + 0.5) ** 2) continue;
    const u = Math.floor((i + r + rot) / 3), v = Math.floor((j + r) / 3), shade = (i + j) / (2 * r);
    let c = (u + v) % 2 ? Q.grey : Q.white;
    if (shade > 0.35) c = (u + v) % 2 ? Q.slate : Q.grey;
    if (shade < -0.5 && (u + v) % 2) c = Q.ice;
    pset(cx + i, cy + j, c);
  }
  const e8 = Math.floor(wt / E8 + 1e-6);
  [[cx - 15, cy - 4], [cx + 13, cy + 5], [cx - 11, cy + 11], [cx + 15, cy - 7]].forEach(([x, y], k) => {
    if (flash || (e8 + k) % 2 === 0) sprite(SPR.spark, { a: Q.white, b: Q.ice }, x - 2, y - 2);
  });
}
function reflections(wt) {   // light flecks thrown by the ball, sweeping across the wall
  const step = Math.floor(wt * 12 + 1e-6), drift = Math.round(wt / WLOOP * 45);
  for (let k = 0; k < 18; k++) {
    const R = RNG('fleck', k), x = mod(R.i(0, 44) + drift, 45) + 45 * (k % 3), y = R.i(56, GY - 6);
    if ((step + k) % 7 === 0) continue;
    const c = [Q.white, Q.ice, Q.pink][k % 3];
    prect(x, y, k % 2 ? 2 : 1, 1, c);
  }
}
function sign(wt, flash) {
  const str = 'DOG DISCO', tw = pixTextW(str), w = tw + 8, h = 15, x0 = DX - Math.floor(w / 2), y0 = 38;
  pixBox(x0, y0, w, h, { bg: Q.ink, edge: Q.pink, shadow: Q.night });
  pixText(str, x0 + 4, y0 + 4, flash ? Q.white : Q.pink, { shadow: flash ? Q.purple : undefined });
  const chase = Math.floor(wt * 12 + 1e-6), bulbs = [];
  for (let x = x0 + 2; x < x0 + w - 1; x += 3) { bulbs.push([x, y0 - 2]); bulbs.push([x, y0 + h + 1]); }
  bulbs.forEach(([x, y], k) => pset(x, y, flash || (Math.floor(k / 2) + chase) % 3 === 0 ? Q.yellow : Q.slate));
}
function speaker(x, pulse) {
  prect(x, GY - 38, 20, 39, Q.ink); prect(x + 1, GY - 37, 18, 37, Q.slate); prect(x + 1, GY - 37, 18, 1, Q.grey);
  pcircle(x + 10, GY - 29, 3, Q.ink); pcircle(x + 10, GY - 29, 2, Q.grey); pset(x + 10, GY - 29, Q.ink);
  pcircle(x + 10, GY - 13, 7, Q.ink);
  pcircle(x + 10, GY - 13, 6 + Math.min(1, pulse), Q.grey);
  pcircle(x + 10, GY - 13, 3 + pulse, pulse ? Q.white : Q.slate); pcircle(x + 10, GY - 13, 1, Q.ink);
  if (pulse > 1) { pset(x + 1, GY - 22, Q.white); pset(x + 18, GY - 4, Q.white); }
}
function notes(wt) {   // one note per beat rises from alternating speakers
  for (let n = 0; n < 4; n++) {
    const age = mod(wt - n * WLOOP / 4, WLOOP); if (age > 1.2) continue;
    const x = (n % 2 ? 123 : 12) + Math.round(3 * Math.sin(age * 6 + n)), y = GY - 46 - Math.round(age * 24);
    sprite(SPR.note, { a: [Q.pink, Q.sky, Q.lime, Q.yellow][n] }, x - 2, y);
  }
}
const ROWS = [[GY, 18], [GY + 18, 22], [GY + 40, 28]];
const LIT = [[1, 1, Q.pink], [3, 0, Q.sky], [0, 2, Q.lime]];   // one more lights on each beat
function floor(beatI, flash) {
  const FL = [Q.pink, Q.sky, Q.lime, Q.yellow, Q.purple];
  ROWS.forEach(([y, h], r) => {
    for (let c = 0; c < 5; c++) {
      const x = c * 27, lit = LIT.findIndex(([lc, lr]) => lc === c && lr === r);
      let col = flash ? FL[(c + 2 * r + boil()) % FL.length] : lit >= 0 && lit <= beatI ? LIT[lit][2] : null;
      prect(x, y, 27, h, col || Q.night);
      prect(x, y, 26, 1, col ? Q.white : Q.slate); prect(x, y, 1, h - 1, col ? Q.white : Q.slate);
      prect(x + 26, y, 1, h, Q.ink); prect(x, y + h - 1, 27, 1, Q.ink);
      if (col) { prect(x + 3, y + 3, 2, 2, Q.white); pdither(x + 1, y + 1, 25, h - 2, null, Q.white, (i, j) => (i - x + j - y < 9 ? 0.25 : 0)); }
    }
  });
  prect(0, GY, 135, 1, Q.grey);
}

function sceneDisco() {
  const b = boil(), wt = worldT(), beatI = Math.floor(TT / BEAT + 1e-6), flash = b >= 18, frozen = b >= 15 && b < 18;
  const P = dogPose(b);
  lowres(ERA_RES[0], () => {
    // the back wall: dark at the top, a purple glow down by the stage
    pgrad(0, 0, 135, GY, [Q.ink, Q.ink, Q.night, Q.purple], { ease: (u) => u ** 1.3 });
    reflections(wt);
    // two spotlights swing toward the dog on each beat, lock onto it in the freeze, flare on the pose
    const sw = frozen || flash ? 0 : [-10, 10, 0, 0][beatI] + (b >= 12 && b < 15 ? [-6, 0, 6][b - 12] : 0);
    const dens = flash ? 0.5 : frozen ? 0.36 : 0.26, bc = flash ? Q.white : Q.ice;
    beam(6, DX - 16 + sw, DX + 8 + sw, dens, bc);
    beam(129, DX - 8 + sw, DX + 16 + sw, dens, bc);
    pellipse(DX + sw, GY + 4, 18, 3, flash ? Q.white : Q.slate);
    discoBall(wt, flash);
    sign(wt, flash);
    floor(beatI, flash);
    const beatStart = b % 6 === 0;
    const pulse = flash ? (b <= 19 ? 2 : 0) : frozen ? 0 : beatStart ? 1 : 0;
    speaker(2, pulse); speaker(113, pulse);
    notes(wt);
    const d = drawDog(P);
    if (b >= 19 && b <= 21) pixBubble('WOOF!', Math.min(d.hx + 14, 104), d.top - 1, { bg: Q.white, edge: Q.ink, fg: Q.ink });
  }, { fx: { pal: PAL16 } });
}
