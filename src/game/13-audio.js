/**
 * 13-audio.js: Audio.
 *
 * WebAudio synthesis for the wind, sand and boost layers, plus the generative music (see music.js).
 *
 * Part of the game closure; see 01-runtime.js.
 */

/* ---------- sound (WebAudio synthesis, no files) ---------- */
const audio = { ctx: null };
// builds the audio graph on the first user gesture: wind, sand slide and boost noise layers, plus the music
function initAudio() {
  if (audio.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  audio.ctx = ctx;
  const master = ctx.createGain();
  master.gain.value = S.sound ? 0.8 : 0;
  master.connect(ctx.destination);
  audio.master = master;
  const nb = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate),
    d = nb.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  const mk = (type, f, q, g) => {
    const src = ctx.createBufferSource();
    src.buffer = nb;
    src.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const gn = ctx.createGain();
    gn.gain.value = g;
    src.connect(fl);
    fl.connect(gn);
    gn.connect(master);
    src.start(0, Math.random() * 2);
    return { fl, gn };
  };
  audio.wind = mk('bandpass', 420, 0.5, 0.05);
  audio.slide = mk('bandpass', 1500, 0.8, 0.0);
  audio.boost = mk('bandpass', 2000, 0.9, 0.0);
  /* the music: bendir, naqus, lotar, rebab and choir, generated live (see music.js) */
  audio.mus = createMusic(ctx, master, nb);
}
const PENTA = [293.66, 329.63, 349.23, 440.0, 523.25, 587.33, 659.25, 698.46, 880.0]; // D E F A C D E F A: the mode of the music
// short inharmonic bell used for pickups and level events
function bell(freq, vol) {
  const ctx = audio.ctx;
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const [m, v, dec] of [
    [1, 1, 3.2],
    [2.01, 0.28, 1.8],
    [3.98, 0.1, 0.9]
  ]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * m;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g);
    g.connect(audio.master);
    o.start(t);
    o.stop(t + dec + 0.1);
  }
}
// maps speed, slip and boost to the noise layers and feeds the music
function updateAudio(dt) {
  const ctx = audio.ctx;
  if (!ctx) return;
  const t = ctx.currentTime,
    sp = clamp(P.speed / 55, 0, 1.5);
  audio.wind.gn.gain.setTargetAtTime(
    0.035 + 0.15 * Math.min(sp, 1.2) * Math.min(sp, 1.2) + 0.02 * Math.sin(t * 0.37),
    t,
    0.15
  );
  audio.wind.fl.frequency.setTargetAtTime(300 + 900 * sp, t, 0.2);
  const sl = !inAir() ? clamp(P.speed / 40, 0, 1) * (0.07 + 0.5 * clamp(P.slip / 8, 0, 1) * 0.5) : 0;
  audio.slide.gn.gain.setTargetAtTime(sl * 0.55, t, 0.06);
  audio.slide.fl.frequency.setTargetAtTime(900 + 2600 * Math.min(sp, 1), t, 0.1);
  audio.boost.gn.gain.setTargetAtTime(0.2 * P.boostK, t, 0.08);
  audio.boost.fl.frequency.setTargetAtTime(1500 + 1800 * P.boostK, t, 0.15);
  if (audio.mus && S.started)
    audio.mus.update({ speed: P.speed, boostK: P.boostK, night: sharedUniforms.uNight.value });
}
function setSound(on) {
  S.sound = on;
  store('sound', on ? '1' : '0');
  if (audio.master) audio.master.gain.setTargetAtTime(on ? 0.8 : 0, audio.ctx.currentTime, 0.1);
  const b = $('optSound');
  if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
}
