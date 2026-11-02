/**
 * music.js: generative score inspired by the Ahwash and the Rways of the Souss.
 *
 * A 12-beat pulse (4 x 3), a pentatonic mode on D with a minor second as colour, and five synthesised
 * voices: bendir (frame drum with buzzing snares), naqus (small metals), lotar (plucked lute), rebab
 * (bowed fiddle with glides and a late vibrato) and an "aah" choir in fifths. Everything is driven by
 * the gameplay: the tempo follows the speed, the percussion comes in when moving, the lute when running
 * fast, the choir when boosting. There are no audio files: every sound is synthesised with Web Audio.
 */
function createMusic(ctx, dest, noise) {
  const NOTE = [146.83, 164.81, 174.61, 220.0, 261.63, 293.66, 329.63, 349.23, 440.0, 523.25, 587.33]; // D E F A C D E F A C D
  // helpers: random, clamp, smoothstep
  const rnd = Math.random,
    cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const sm = (x, a, b) => {
    const t = cl((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const bus = ctx.createGain();
  bus.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 14;
  comp.ratio.value = 3.2;
  comp.attack.value = 0.008;
  comp.release.value = 0.22;
  comp.connect(dest);
  bus.connect(comp);
  /* reverb: very light, a decaying noise impulse response (1.5 s) */
  {
    const len = Math.floor(ctx.sampleRate * 1.5),
      ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const e = Math.pow(1 - i / len, 2.6);
        lp += (rnd() * 2 - 1 - lp) * 0.55;
        d[i] = lp * e;
      }
    }
    const rev = ctx.createConvolver();
    rev.buffer = ir;
    const rg = ctx.createGain();
    rg.gain.value = 0.26;
    bus.connect(rev);
    rev.connect(rg);
    rg.connect(comp);
  }
  /* drone: low D and fifth, very soft */
  const droneG = ctx.createGain();
  droneG.gain.value = 0;
  droneG.connect(bus);
  {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    lp.connect(droneG);
    [
      [73.42, 'triangle', 1],
      [110.0, 'sine', 0.6],
      [146.83, 'triangle', 0.3]
    ].forEach(([f, ty, g], i) => {
      const o = ctx.createOscillator();
      o.type = ty;
      o.frequency.value = f;
      o.detune.value = i * 3 - 3;
      const gg = ctx.createGain();
      gg.gain.value = 0.5 * g;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + i * 0.03;
      const lg = ctx.createGain();
      lg.gain.value = 0.18 * g;
      lfo.connect(lg);
      lg.connect(gg.gain);
      lfo.start();
      o.connect(gg);
      gg.connect(lp);
      o.start();
    });
    droneG.gain.setTargetAtTime(0.09, ctx.currentTime + 0.1, 3.0);
  }

  /* --- voices --- */
  // filtered noise burst, the basis of the percussion
  function hiss(t, dur, type, f, q, v, decay) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    s.connect(fl);
    fl.connect(g);
    g.connect(bus);
    s.start(t, rnd() * 2);
    s.stop(t + dur + 0.05);
  }
  function dum(t, v) {
    // skin struck in the centre: deep, with buzzing snares
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(175, t);
    o.frequency.exponentialRampToValueAtTime(62, t + 0.17);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 0.5);
    hiss(t, 0.1, 'lowpass', 280, 0.7, v * 0.45, 0.08);
    hiss(t, 0.3, 'highpass', 5200, 0.8, v * 0.16, 0.26);
  }
  function tek(t, v) {
    // skin struck at the rim: dry and clear
    hiss(t, 0.1, 'bandpass', 2700, 1.3, v * 0.6, 0.075);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(210, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v * 0.22, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 0.14);
  }
  function naqus(t, v) {
    hiss(t, 0.08, 'highpass', 6800, 0.9, v, 0.05);
  }
  function pluck(f, t, v, dur) {
    // lute: sharp attack, timbre that darkens
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 2.003;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.Q.value = 2.5;
    fl.frequency.setValueAtTime(Math.min(5200, f * 12), t);
    fl.frequency.exponentialRampToValueAtTime(Math.max(320, f * 2.2), t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = ctx.createGain();
    g2.gain.value = 0.33;
    o1.connect(fl);
    o2.connect(g2);
    g2.connect(fl);
    fl.connect(g);
    g.connect(bus);
    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }
  function bow(f, t, dur, v, from) {
    // rebab: nasal tone, attack glide, vibrato that builds up
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    if (from) {
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.15);
    } else o.frequency.setValueAtTime(f, t);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.0 + rnd() * 1.2;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.011, t + 0.45);
    lfo.connect(lg);
    lg.connect(o.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1000 + f * 0.6;
    bp.Q.value = 1.1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2800;
    lp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.07);
    g.gain.setValueAtTime(v, t + Math.max(0.08, dur - 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(bus);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }
  function choir(f, t, dur, v) {
    // "aah": two sawtooth voices run through formant filters
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.35);
    g.gain.setValueAtTime(v, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.6;
    const lg = ctx.createGain();
    lg.gain.value = f * 0.007;
    lfo.connect(lg);
    [
      [-7, 1],
      [6, 0.8]
    ].forEach(([det, gg]) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      lg.connect(o.frequency);
      const sub = ctx.createGain();
      sub.gain.value = gg;
      [
        [720, 5, 1],
        [1180, 6, 0.55]
      ].forEach(([ff, q, fg]) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = ff;
        bp.Q.value = q;
        const fgn = ctx.createGain();
        fgn.gain.value = fg;
        o.connect(bp);
        bp.connect(fgn);
        fgn.connect(sub);
      });
      sub.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }

  /* --- score --- */
  // 12-step drum patterns: 'D' = dum (centre hit), 't' = tek (rim hit), 0 = rest
  const DRUM = [
    ['D', 0, 0, 't', 0, 't', 'D', 0, 't', 0, 't', 't'],
    ['D', 0, 't', 't', 0, 't', 'D', 0, 't', 0, 'D', 't'],
    ['D', 0, 0, 't', 0, 't', 'D', 0, 0, 't', 't', 't'],
    ['D', 't', 0, 't', 0, 't', 'D', 0, 't', 'D', 't', 't']
  ];
  // lute patterns: one NOTE index per tick, -1 = rest
  const LOTAR = {
    A: [0, -1, 3, -1, 5, 3, 0, -1, 2, -1, 1, 0],
    B: [0, -1, 3, 3, -1, 5, 6, -1, 5, 3, -1, 1],
    C: [3, -1, 5, -1, 6, 5, 3, -1, 2, 0, -1, 0],
    D: [0, 0, -1, 3, -1, 2, 1, -1, 0, -1, -1, -1]
  };
  // a song is a sequence of four lute patterns (one per bar)
  const SONGS = [
    ['A', 'A', 'B', 'C'],
    ['A', 'B', 'A', 'D'],
    ['A', 'A', 'C', 'B']
  ];
  const REBAB = [
    // [note, start tick, duration in ticks, glide from]
    [
      [8, 0, 6, -1],
      [7, 6, 3, 8],
      [5, 9, 3, 7]
    ],
    [
      [6, 0, 4, -1],
      [8, 4, 4, 6],
      [9, 8, 4, 8]
    ],
    [
      [5, 0, 9, -1],
      [3, 9, 3, 5]
    ],
    [
      [8, 0, 3, -1],
      [9, 3, 3, 8],
      [8, 6, 3, 9],
      [6, 9, 3, 8]
    ],
    [
      [10, 0, 5, 8],
      [9, 5, 3, 10],
      [8, 8, 4, 9]
    ]
  ];
  // scheduler state
  let nextT = 0,
    step = 0,
    bar = 0,
    song = SONGS[0],
    tickDur = 0.2;
  // bar boundary: pick the song and add the rebab answers and the boost choir
  function newBar(t, st) {
    bar++;
    if (bar % 4 === 1) song = SONGS[(rnd() * SONGS.length) | 0];
    const sp = st.speed,
      run = sm(sp, 8, 24),
      bk = st.boostK;
    if (bar % 2 === 0 && rnd() < 0.25 + 0.55 * run) {
      // the rebab answers the lute
      const ph = REBAB[(rnd() * REBAB.length) | 0],
        vol = 0.075 + 0.05 * run;
      ph.forEach(([n, s0, len, from]) =>
        bow(NOTE[n], t + s0 * tickDur, len * tickDur * 1.04, vol, from >= 0 ? NOTE[from] : 0)
      );
    }
    if (bk > 0.5 && bar % 2 === 1) {
      // choir in fifths while boosting
      choir(NOTE[5], t, tickDur * 12, 0.05 * bk);
      choir(NOTE[8], t, tickDur * 12, 0.04 * bk);
    }
  }
  // one tick (1 of 12 per bar): drums when moving, shaker and lute when running, extras while boosting
  function playStep(i, t, st) {
    const sp = st.speed,
      bk = st.boostK,
      moving = sm(sp, 1.5, 9),
      run = sm(sp, 8, 24),
      fast = sm(sp, 22, 50);
    if (i === 0) newBar(t, st);
    const dr = DRUM[bar % 4][i];
    if (moving > 0.02) {
      const v = (0.3 + 0.7 * moving) * (0.8 + 0.2 * bk) * (1 - 0.3 * (st.night || 0));
      if (dr === 'D') dum(t, 0.5 * v);
      else if (dr === 't') tek(t, (i % 3 === 0 ? 0.4 : 0.28) * v);
      if (fast > 0.3 && dr === 0 && i % 3 === 1 && rnd() < fast * 0.5) tek(t, 0.16 * fast);
    }
    if (run > 0.15 && i % 3 === 2) naqus(t, 0.03 + 0.05 * run + 0.03 * bk);
    const pat = LOTAR[song[bar % 4]],
      n = pat[i];
    if (n >= 0 && run > 0.04) {
      const acc = i % 3 === 0 ? 1 : 0.7,
        v = (0.06 + 0.12 * run) * acc;
      pluck(NOTE[n], t, v, 0.5);
      if (bk > 0.3 && n >= 0) pluck(NOTE[n] * 2, t + tickDur * 0.5, v * 0.45 * bk, 0.3);
    }
    if (moving < 0.1 && bar % 4 === 2 && i === 0 && rnd() < 0.6) bow(NOTE[3], t, tickDur * 12, 0.05, NOTE[5]); // when standing still, a held note
  }
  // look-ahead scheduling: queues every tick that starts before tEnd
  function scheduleUntil(tEnd, st) {
    if (nextT < 0.0001) nextT = ctx.currentTime + 0.1;
    while (nextT < tEnd) {
      const bpm = (86 + 22 * cl(st.speed / 40, 0, 1) + 12 * st.boostK) * (1 - 0.1 * (st.night || 0));
      tickDur = 60 / bpm / 3;
      playStep(step, nextT, st);
      step = (step + 1) % 12;
      nextT += tickDur;
    }
  }
  // to be called every frame with st = { speed, boostK, night }
  function update(st) {
    const now = ctx.currentTime;
    if (nextT < now - 0.15) nextT = now + 0.05; // tab left in the background: do not catch up on the missed steps
    scheduleUntil(now + 0.3, st);
  }
  return { update, scheduleUntil, bus, droneG, NOTE };
}
