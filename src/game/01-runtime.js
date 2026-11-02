/**
 * SandWake game closure (src/game/*.js).
 *
 * The files in this directory are concatenated in file-name order and wrapped in a single function scope by
 * scripts/build.js, so they share their top-level names. They are not standalone modules, and the order matters
 * because top-level `const` declarations are initialised in sequence.
 *
 * Files:
 *   01-runtime.js          DOM and math helpers, language handling, the current level state and persistent storage.
 *   02-renderer.js         Quality presets, user settings and the WebGL renderer.
 *   03-environment.js      Floating origin, sun and moon, time of night, the uniforms shared by the terrain, sky dome and terrain mesh.
 *   04-particles.js        Floating dust, sand spray, the wake left in the sand and the Tifinagh letters thrown off by the boost.
 *   05-orbs-and-flag.js    Boost-recharge orbs (data and rendering) and the start flag of the Jbel level.
 *   06-night-and-gates.js  Time-of-night blending and the light gates of the Tiziri level (rendering).
 *   07-orb-logic.js        Orb placement around the player and pickup handling.
 *   08-character.js        The rider: materials, rig, woven carpet and the avatar mesh.
 *   09-player.js           The simulation state, the smoothed visual model derived from it and the pose handed to the avatar animation.
 *   10-levels.js           Level logic: Jbel checkpoints and falls, Tiziri gates, the level HUD and level switching.
 *   11-nav-arrow.js        A small 3D scene drawn at the top of the screen that points at the next target.
 *   12-camera-input.js     Camera rig state, debug overrides and input handling (keyboard, mouse, touch).
 *   13-audio.js            WebAudio synthesis for the wind, sand and boost layers, plus the generative music (see music.js).
 *   14-quality-ui.js       Adaptive quality, canvas resizing and the wiring of the intro screen and settings panel.
 *   15-simulation.js       Fixed-step physics, floating-origin rebasing, effects, character model, camera and uniform updates.
 *   16-hud.js              Air-time summary, flips, landings and the boost gauge.
 *   17-boot.js             The frame function, the boot sequence and the debug handle used by the tests.
 *
 * The world is unbounded: positions are kept in double precision on the CPU and everything sent to the GPU is
 * relative to a floating origin (ORG) that is re-centred whenever the player drifts too far from it.
 */

const THREE = window.THREE;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (k, dt) => 1 - Math.exp(-k * dt);
let LANG = 'en';
const tr = (k) => (I18N[LANG] && I18N[LANG][k]) || I18N.en[k] || k;
/* current level: 'jbel' (the canyon), 'tiziri' (the night, the light gates) or 'dunes' (free ride) */
const LV = {
  id: 'jbel',
  cp: 0,
  hudN: -1,
  falls: 0,
  t0: -1,
  tEnd: 0,
  done: false,
  orbsAll: null,
  flag: { x: 0, y: 0, z: 0 },
  hudCp: -1,
  hudT: ''
};
// applies a language: <html lang>, every [data-i] / [data-i-aria] / [data-i-by] element and the language buttons
function applyLang(l) {
  LANG = I18N[l] ? l : 'en';
  document.documentElement.lang = LANG;
  {
    const a = $('lead'),
      b = $('hint'),
      k = LV.id === 'jbel' ? 'Jbel' : LV.id === 'tiziri' ? 'Tiziri' : '';
    if (a) a.dataset.i = 'lead' + k;
    if (b) b.dataset.i = 'hint' + k;
  }
  document.querySelectorAll('[data-i]').forEach((el) => {
    el.textContent = tr(el.dataset.i);
  });
  document.querySelectorAll('[data-i-aria]').forEach((el) => el.setAttribute('aria-label', tr(el.dataset.iAria)));
  document.querySelectorAll('[data-i-by]').forEach((el) => {
    el.innerHTML = tr('by').replace('{n}', '<b class="by">' + MAKER + '</b>');
  });
  document
    .querySelectorAll('.langs button')
    .forEach((b) => b.setAttribute('aria-pressed', b.dataset.l === LANG ? 'true' : 'false'));
}
// localStorage wrapper that ignores storage errors: store(key) reads, store(key, value) writes
function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem('sandwake.' + k);
    localStorage.setItem('sandwake.' + k, v);
  } catch (_) {
    /* storage unavailable */
  }
  return null;
}

{
  const sv = store('level');
  LV.id = sv === 'dunes' || sv === 'tiziri' ? sv : 'jbel';
}
applyLang(pickLang(store('lang')));
