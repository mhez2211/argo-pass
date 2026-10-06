  // SCORE BODY — dog disco (inside buildScore(); see kit/score-head.js). One bar of chiptune in D major, 120 BPM:
  // a kick and triangle bass on the beats, pulse arps that double each beat, a hard stop into the freeze
  // (near-silence 1.25-1.5s), then the payoff on 1.5: a chord stab, a sub, a crash and a two-note bark.
  const T = TIMELINE, cu = T.cues;
  const chip = (t, n, vel, dur = 0.09, pan = 0, type = 'square', cut = 3400) => {
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut;
    const g = ac.createGain(); env(g, t, 0.002, vel, dur);
    osc(type, nz(n), t, t + dur + 0.05).connect(lp); lp.connect(g); out(g, pan, 0.1);
  };
  const tri = (t, n, vel, dur = 0.2) => { const g = ac.createGain(); env(g, t, 0.003, vel, dur); osc('triangle', nz(n), t, t + dur + 0.04).connect(g); out(g, 0, 0); };
  const kick = (t, vel) => { const o = osc('sine', 160, t, t + 0.16); o.frequency.exponentialRampToValueAtTime(48, t + 0.11); const g = ac.createGain(); env(g, t, 0.002, vel, 0.12); o.connect(g); out(g); };
  const hat = (t, vel) => noiseHit(t, 0.03, 'highpass', 7500, 0.8, vel, 0.15);
  const bark = (t, f0, f1, vel) => {   // a square yelp through a vocal-ish band
    const o = osc('square', f0, t, t + 0.14); o.frequency.exponentialRampToValueAtTime(f1, t + 0.11);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.4;
    const g = ac.createGain(); env(g, t, 0.004, vel, 0.11); o.connect(bp); bp.connect(g); out(g, 0.1, 0.15);
  };
  to = 'm';
  // beat 1: 8ths; beat 2: 16ths; beat 3 (the spin): a 32nd run up. Everything ends before the freeze at 1.25.
  [['D5', 0], ['Fs5', 0.25]].forEach(([n, t]) => chip(t, n, 0.035, 0.12, -0.15));
  ['A4', 'D5', 'Fs5', 'D5'].forEach((n, i) => chip(0.5 + i * E16, n, 0.032, 0.07, 0.1));
  ['D5', 'Fs5', 'A5', 'D6'].forEach((n, i) => chip(cu.spin + i * E16 / 2, n, 0.036, 0.05, -0.1 + i * 0.07));
  tri(0, 'D3', 0.13, 0.3); tri(0.5, 'B2', 0.13, 0.3); tri(cu.spin, 'A2', 0.13, 0.18);
  // the payoff: a short stab, then a flat chord under it
  ['D4', 'Fs4', 'A4', 'D5'].forEach((n, i) => chip(cu.jump, n, 0.05, 0.4, -0.2 + i * 0.13, 'square', 4200));
  tri(cu.jump, 'D2', 0.16, 0.45);
  to = 's';
  [0, 0.5, cu.spin].forEach((t) => kick(t, 0.22));
  [0.25, 0.75, 0.875].forEach((t) => hat(t, 0.02));
  sweep(cu.spin, cu.freeze - 0.03, 0.02, 700, 4200, 0);            // the spin whooshes up and stops dead
  noiseHit(cu.freeze, 0.04, 'bandpass', 2600, 4, 0.012);           // a tiny scratch as everything freezes
  sub(cu.jump, 0.3); kick(cu.jump, 0.3);
  noiseHit(cu.jump, 0.45, 'highpass', 5000, 0.7, 0.05, 0, 0.3);    // the crash
  bark(cu.jump + 1 / 12, 620, 300, 0.11); bark(cu.jump + 1 / 12 + 0.13, 560, 260, 0.09);   // WOOF!
  kick(cu.land, 0.12);                                             // the landing
