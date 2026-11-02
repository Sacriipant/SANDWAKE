/**
 * 06-night-and-gates.js: Night and light gates.
 *
 * Time-of-night blending and the light gates of the Tiziri level (rendering).
 *
 * Part of the game closure; see 01-runtime.js.
 */

/* applies TOD: direction of the light source (moon -> sun, dipping a little halfway: the moon sets, the sun rises) and night intensity */
function updateTod(dt) {
  if (TOD.k === TOD.goal) return;
  const d = TOD.goal - TOD.k;
  TOD.k += Math.sign(d) * Math.min(Math.abs(d), dt * TOD.rate);
  applyTod();
}
function applyTod() {
  const k = clamp(TOD.k, 0, 1),
    e = k * k * (3 - 2 * k),
    m = 1 - e;
  const az = lerp(MOON_AZ, SUN_AZ, m),
    el = lerp(MOON_EL, SUN_EL, m) - 24 * D2R * Math.sin(Math.PI * m);
  SUN.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
  SUN2D.set(Math.cos(az), Math.sin(az));
  terrU.uSunTan.value = Math.tan(el);
  sharedUniforms.uNight.value = e;
}

/* ---------- level 2: the Tiziri light gates ----------
 A single mesh for the twelve gates: each is made of 9 ribbons (the lozenge, the target, the light column), and its state
 (upcoming, active, passed, flash on crossing) arrives through two uniform arrays. */
const GATE_COUNT = TIZIRI.gates.length;
const gateTrack = { tPass: new Float32Array(GATE_COUNT).fill(-99), px: NaN, py: 0, pz: 0, miss: -1 };
const gateU = {
  uTime: terrU.uTime,
  uGA: { value: Array.from({ length: GATE_COUNT }, () => V4(0, 0, 0, 1)) },
  uGB: { value: Array.from({ length: GATE_COUNT }, () => V4(1, 0, 0, 0)) }
};
const gateMesh = (() => {
  const nq = GATE_COUNT * 9,
    aG = new Float32Array(nq * 16),
    aSd = new Float32Array(nq * 4),
    idx = new Uint16Array(nq * 6);
  let q = 0;
  const quad = (g, ring, e) => {
    for (let k = 0; k < 4; k++) {
      const v = q * 4 + k;
      aG.set([g, ring, e, k >> 1], v * 4);
      aSd[v] = k & 1 ? 1 : -1;
    }
    idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 2, q * 4 + 1, q * 4 + 3], q * 6);
    q++;
  };
  for (let g = 0; g < GATE_COUNT; g++) {
    for (let r = 0; r < 2; r++) for (let e = 0; e < 4; e++) quad(g, r, e);
    quad(g, 2, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nq * 12), 3));
  geo.setAttribute('aG', new THREE.BufferAttribute(aG, 4));
  geo.setAttribute('aSd', new THREE.BufferAttribute(aSd, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      vertexShader: VS_GATE,
      fragmentShader: FS_GATE,
      uniforms: gateU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    })
  );
  m.frustumCulled = false;
  m.visible = false;
  m.renderOrder = 4;
  scene.add(m);
  return m;
})();
