/**
 * 02-renderer.js: Renderer.
 *
 * Quality presets, user settings and the WebGL renderer.
 *
 * Part of the game closure; see 01-runtime.js.
 */

/* ---------- quality settings ---------- */
// nr x ns: terrain mesh rings x segments; wisps: dust particles; glit / rip: sand glitter and ripples; sh: sun-shadow steps; pr: max pixel ratio; spray: sand particles
// prettier-ignore
const PRESETS = {
low:  { nr: 90,  ns: 96,  wisps: 700,  glit: 0, rip: 0, sh: 3, pr: 1.0,  spray: 160 },
med:  { nr: 120, ns: 132, wisps: 2000, glit: 1, rip: 1, sh: 5, pr: 1.25, spray: 260 },
high: { nr: 150, ns: 170, wisps: 4200, glit: 1, rip: 1, sh: 6, pr: 1.75, spray: 360 }
};
// touch device (coarse pointer): lower default quality and on-screen controls
const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
// user settings and run state
const S = {
  quality: store('quality') || 'auto',
  sound: store('sound') !== '0',
  fps: store('fps') === '1',
  level: coarse ? 'med' : 'high',
  resScale: 1,
  started: false,
  hud: true
};
if (!['auto', 'low', 'med', 'high'].includes(S.quality)) S.quality = 'auto';
const curPreset = () => PRESETS[S.quality === 'auto' ? S.level : S.quality];

/* ---------- renderer ---------- */
const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    stencil: false,
    powerPreference: 'default'
  });
} catch (e) {
  console.error('WebGL init', (e && e.message) || e);
  $('nogl').hidden = false;
  $('intro').hidden = true;
  // Nothing else can run without WebGL: this `return` stops the whole game closure (see scripts/build.js).
  return;
}
renderer.setClearColor(0xe8a872, 1);
renderer.autoClear = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.25, 900);
let VW = 1,
  VH = 1,
  curPR = 1;

/* floating origin: everything sent to the GPU is (world - ORG) */
const ORG = { x: 0, z: 0 };
