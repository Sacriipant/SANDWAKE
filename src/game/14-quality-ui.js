/**
 * 14-quality-ui.js: Quality and UI.
 *
 * Adaptive quality, canvas resizing and the wiring of the intro screen and settings panel.
 *
 * Part of the game closure; see 01-runtime.js.
 */

/* ---------- quality ---------- */
let curKey = '';
// applies the current preset: rebuilds the terrain mesh if needed, toggles shader features, updates the buttons
function applyQuality() {
  const p = curPreset();
  const key = [p.nr, p.ns, p.sh, p.glit, p.rip].join();
  if (key !== curKey) {
    curKey = key;
    terrain3.geometry.dispose();
    terrain3.geometry = buildTerrainGeometry(p.nr, p.ns);
    const df = { SH_STEPS: p.sh };
    if (p.glit) df.GLITTER = 1;
    if (p.rip) df.RIPPLE = 1;
    terrMat.defines = df;
    terrMat.needsUpdate = true;
  }
  wisps.geometry.setDrawRange(0, p.wisps);
  spray.cap = Math.min(MAX_SPRAY, p.spray);
  resize(true);
  document
    .querySelectorAll('#qual button')
    .forEach((b) => b.setAttribute('aria-pressed', b.dataset.q === S.quality ? 'true' : 'false'));
}
// keeps the canvas size and pixel ratio in sync with its container
function resize(force) {
  const app = $('app'),
    w = Math.max(1, app.clientWidth),
    h = Math.max(1, app.clientHeight);
  const pr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, curPreset().pr) * S.resScale);
  if (!force && w === VW && h === VH && Math.abs(pr - curPR) < 0.001) return;
  VW = w;
  VH = h;
  curPR = pr;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  nav.dirty = true;
}
new ResizeObserver(() => resize(false)).observe($('app'));
window.addEventListener('resize', () => resize(false));

/* automatic resolution scaling (and effects as a last resort) */
const perf = { ema: 16.7, cool: 0, hold: 0, bad: 0 };
// from the smoothed frame time: lowers the resolution scale when slow, restores it slowly when fast, and after repeated failures drops one preset
function adapt(dtms, now) {
  perf.ema = lerp(perf.ema, Math.min(dtms, 100), 0.04);
  if (S.quality !== 'auto' || !S.started) return;
  if (now < perf.cool) return;
  if (perf.ema > 21 && S.resScale > 0.5) {
    S.resScale = Math.max(0.5, S.resScale - 0.1);
    perf.cool = now + 1200;
    perf.hold = now + 10000;
    resize(true);
    if (S.resScale <= 0.55) perf.bad++;
  } else if (perf.ema < 18.5 && S.resScale < 1 && now > perf.hold) {
    S.resScale = Math.min(1, S.resScale + 0.05);
    perf.cool = now + 2500;
    resize(true);
  }
  if (perf.bad >= 3 && S.level !== 'low') {
    S.level = S.level === 'high' ? 'med' : 'low';
    perf.bad = 0;
    S.resScale = 0.8;
    applyQuality();
    perf.cool = now + 3000;
  }
}

/* ---------- interface ---------- */
// leaves the intro screen and starts the game (also unlocks audio)
function start() {
  if (S.started) return;
  S.started = true;
  $('intro').classList.add('gone');
  $('app').classList.remove('intro-on');
  $('app').focus();
  initAudio();
  if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  setTimeout(() => {
    $('intro').hidden = true;
  }, 900);
  setTimeout(() => $('hint').classList.add('fade'), 9000);
  if (JBEL.on || TIZIRI.on) showLevelTitle();
}
$('go').addEventListener('click', start);
$('gear').addEventListener('click', () => {
  const p = $('panel');
  p.hidden = !p.hidden;
  $('gear').setAttribute('aria-expanded', p.hidden ? 'false' : 'true');
  if (S.started) $('app').focus();
});
document.querySelectorAll('#qual button').forEach((b) =>
  b.addEventListener('click', () => {
    S.quality = b.dataset.q;
    store('quality', S.quality);
    S.resScale = 1;
    perf.bad = 0;
    applyQuality();
    if (S.started) $('app').focus();
  })
);
document.querySelectorAll('.lvls button').forEach((b) =>
  b.addEventListener('click', () => {
    setLevel(b.dataset.lv);
    if (S.started) {
      $('panel').hidden = true;
      $('gear').setAttribute('aria-expanded', 'false');
      $('app').focus();
    }
  })
);
$('optSound').addEventListener('click', () => {
  if (!audio.ctx && S.started) initAudio();
  setSound(!S.sound);
});
$('optFps').addEventListener('click', () => {
  S.fps = !S.fps;
  store('fps', S.fps ? '1' : '0');
  $('optFps').setAttribute('aria-pressed', S.fps ? 'true' : 'false');
  $('fps').hidden = !S.fps;
});
document.querySelectorAll('.langs button').forEach((b) =>
  b.addEventListener('click', () => {
    store('lang', b.dataset.l);
    applyLang(b.dataset.l);
  })
);
$('optSound').setAttribute('aria-pressed', S.sound ? 'true' : 'false');
$('optFps').setAttribute('aria-pressed', S.fps ? 'true' : 'false');
$('fps').hidden = !S.fps;
$('optReset').addEventListener('click', () => {
  resetPlayer(true);
  $('panel').hidden = true;
  $('gear').setAttribute('aria-expanded', 'false');
  $('app').focus();
});
