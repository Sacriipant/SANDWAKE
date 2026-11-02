/**
 * 04-particles.js: Particles.
 *
 * Floating dust, sand spray, the wake left in the sand and the Tifinagh letters thrown off by the boost.
 *
 * Part of the game closure; see 01-runtime.js.
 */

/* ---------- floating dust ---------- */
const WBOX = 42;
const wispU = Object.assign(
  {
    uTime: terrU.uTime,
    uWindMove: { value: new THREE.Vector2() },
    uCM: { value: new THREE.Vector2() },
    uPx: { value: 800 },
    uBox: { value: WBOX }
  },
  sharedUniforms
);
const wispMat = new THREE.ShaderMaterial({
  vertexShader: VS_WISP,
  fragmentShader: FS_WISP,
  uniforms: wispU,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending
});
const wisps = new THREE.Points(new THREE.BufferGeometry(), wispMat);
wisps.frustumCulled = false;
wisps.renderOrder = 3;
scene.add(wisps);
{
  const MAXW = PRESETS.high.wisps,
    r = new Float32Array(MAXW * 3),
    z = new Float32Array(MAXW * 3);
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < r.length; i++) r[i] = rnd();
  wisps.geometry.setAttribute('position', new THREE.BufferAttribute(z, 3));
  wisps.geometry.setAttribute('aR', new THREE.BufferAttribute(r, 3));
}

/* ---------- sand spray ---------- */
const MAX_SPRAY = 360;
const spray = {
  pos: new Float32Array(MAX_SPRAY * 3),
  vel: new Float32Array(MAX_SPRAY * 3),
  size: new Float32Array(MAX_SPRAY),
  alpha: new Float32Array(MAX_SPRAY),
  base: new Float32Array(MAX_SPRAY),
  tint: new Float32Array(MAX_SPRAY),
  life: new Float32Array(MAX_SPRAY),
  age: new Float32Array(MAX_SPRAY),
  s0: new Float32Array(MAX_SPRAY),
  cap: 360,
  next: 0
};
const sprayU = { uPx: { value: 800 }, uNight: sharedUniforms.uNight };
const sprayGeo = new THREE.BufferGeometry();
sprayGeo.setAttribute('position', new THREE.BufferAttribute(spray.pos, 3).setUsage(THREE.DynamicDrawUsage));
sprayGeo.setAttribute('aSize', new THREE.BufferAttribute(spray.size, 1).setUsage(THREE.DynamicDrawUsage));
sprayGeo.setAttribute('aAlpha', new THREE.BufferAttribute(spray.alpha, 1).setUsage(THREE.DynamicDrawUsage));
sprayGeo.setAttribute('aTint', new THREE.BufferAttribute(spray.tint, 1).setUsage(THREE.DynamicDrawUsage));
const sprayPts = new THREE.Points(
  sprayGeo,
  new THREE.ShaderMaterial({
    vertexShader: VS_SPRAY,
    fragmentShader: FS_SPRAY,
    uniforms: sprayU,
    transparent: true,
    depthWrite: false
  })
);
sprayPts.frustumCulled = false;
sprayPts.renderOrder = 4;
scene.add(sprayPts);
// spawns a sand particle in the ring buffer (world position, stored relative to ORG); tint in [0, 1] picks the sand colour, tint >= 2 selects a boost glyph
function emit(x, y, z, vx, vy, vz, size, life, a, tint) {
  const i = spray.next;
  spray.next = (i + 1) % spray.cap;
  spray.pos[i * 3] = x - ORG.x;
  spray.pos[i * 3 + 1] = y;
  spray.pos[i * 3 + 2] = z - ORG.z;
  spray.vel[i * 3] = vx;
  spray.vel[i * 3 + 1] = vy;
  spray.vel[i * 3 + 2] = vz;
  spray.s0[i] = size;
  spray.size[i] = size;
  spray.life[i] = life;
  spray.age[i] = 0.0001;
  spray.base[i] = a;
  spray.alpha[i] = a;
  spray.tint[i] = tint;
}
// integrates the sand particles: drag, gravity, bounce on the ground, growth and fade-out
function updateSpray(dt) {
  const k = Math.exp(-1.6 * dt);
  for (let i = 0; i < MAX_SPRAY; i++) {
    if (spray.age[i] <= 0) {
      spray.alpha[i] = 0;
      continue;
    }
    spray.age[i] += dt;
    const t = spray.age[i] / spray.life[i];
    if (t >= 1) {
      spray.age[i] = 0;
      spray.alpha[i] = 0;
      spray.size[i] = 0;
      continue;
    }
    const o = i * 3;
    spray.vel[o] *= k;
    spray.vel[o + 2] *= k;
    spray.vel[o + 1] = spray.vel[o + 1] * k - 5.5 * dt;
    spray.pos[o] += spray.vel[o] * dt;
    spray.pos[o + 1] += spray.vel[o + 1] * dt;
    spray.pos[o + 2] += spray.vel[o + 2] * dt;
    const gy = heightAt(spray.pos[o] + ORG.x, spray.pos[o + 2] + ORG.z);
    if (spray.pos[o + 1] < gy + 0.02) {
      spray.pos[o + 1] = gy + 0.02;
      spray.vel[o + 1] = Math.abs(spray.vel[o + 1]) * 0.2;
    }
    spray.size[i] = spray.s0[i] * (spray.tint[i] > 1.5 ? 1 + 0.35 * t : 1 + 1.8 * t);
    spray.alpha[i] = (1 - t) * (1 - t) * spray.base[i];
  }
  const A = sprayGeo.attributes;
  A.position.needsUpdate = true;
  A.aSize.needsUpdate = true;
  A.aAlpha.needsUpdate = true;
  A.aTint.needsUpdate = true;
}

/* ---------- wake in the sand ---------- */
const MAX_TRAIL_POINTS = 700;
const trail = {
  pos: new Float32Array(MAX_TRAIL_POINTS * 2 * 3),
  side: new Float32Array(MAX_TRAIL_POINTS * 2),
  birth: new Float32Array(MAX_TRAIL_POINTS * 2),
  on: new Float32Array(MAX_TRAIL_POINTS * 2),
  valid: new Uint8Array(MAX_TRAIL_POINTS),
  head: -1,
  count: 0,
  lx: 1e9,
  lz: 1e9,
  linked: false
};
for (let k = 0; k < MAX_TRAIL_POINTS; k++) {
  trail.side[2 * k] = -1;
  trail.side[2 * k + 1] = 1;
}
const trailIdx = new Uint16Array(MAX_TRAIL_POINTS * 6);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trail.pos, 3).setUsage(THREE.DynamicDrawUsage));
trailGeo.setAttribute('aSide', new THREE.BufferAttribute(trail.side, 1));
trailGeo.setAttribute('aBirth', new THREE.BufferAttribute(trail.birth, 1).setUsage(THREE.DynamicDrawUsage));
trailGeo.setAttribute('aOn', new THREE.BufferAttribute(trail.on, 1).setUsage(THREE.DynamicDrawUsage));
trailGeo.setIndex(new THREE.BufferAttribute(trailIdx, 1).setUsage(THREE.DynamicDrawUsage));
trailGeo.setDrawRange(0, 0);
const trailU = { uTime: terrU.uTime };
const trailMat = new THREE.ShaderMaterial({
  vertexShader: VS_TRAIL,
  fragmentShader: FS_TRAIL,
  uniforms: trailU,
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.ZeroFactor,
  blendDst: THREE.SrcColorFactor,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2
});
const trailMesh = new THREE.Mesh(trailGeo, trailMat);
trailMesh.frustumCulled = false;
trailMesh.renderOrder = 2;
scene.add(trailMesh);
// appends a left / right vertex pair (heading h) to the wake ribbon once the player has moved far enough
function trailAdd(x, z, h, time) {
  const dx = x - trail.lx,
    dz = z - trail.lz;
  if (dx * dx + dz * dz < 0.12) return;
  const k = (trail.head + 1) % MAX_TRAIL_POINTS;
  const rx = -Math.cos(h) * 0.21,
    rz = Math.sin(h) * 0.21;
  const ax = x - rx,
    az = z - rz,
    bx = x + rx,
    bz = z + rz;
  trail.pos[6 * k] = ax - ORG.x;
  trail.pos[6 * k + 1] = heightAt(ax, az) + 0.035;
  trail.pos[6 * k + 2] = az - ORG.z;
  trail.pos[6 * k + 3] = bx - ORG.x;
  trail.pos[6 * k + 4] = heightAt(bx, bz) + 0.035;
  trail.pos[6 * k + 5] = bz - ORG.z;
  trail.birth[2 * k] = trail.birth[2 * k + 1] = time;
  trail.on[2 * k] = trail.on[2 * k + 1] = 1;
  trail.valid[k] = trail.linked ? 1 : 0;
  trail.valid[(k + 1) % MAX_TRAIL_POINTS] = 0;
  trail.head = k;
  trail.count = Math.min(MAX_TRAIL_POINTS, trail.count + 1);
  trail.linked = true;
  trail.lx = x;
  trail.lz = z;
  trail.dirty = true;
}
function trailBreak() {
  trail.linked = false;
}
// rebuilds the ribbon indices: only segments between consecutive valid samples are drawn
function trailFlush() {
  if (!trail.dirty) return;
  trail.dirty = false;
  let n = 0;
  for (let k = 0; k < MAX_TRAIL_POINTS; k++) {
    if (!trail.valid[k]) continue;
    const p = (k + MAX_TRAIL_POINTS - 1) % MAX_TRAIL_POINTS,
      a = 2 * p,
      b = 2 * k;
    trailIdx[n++] = a;
    trailIdx[n++] = a + 1;
    trailIdx[n++] = b;
    trailIdx[n++] = a + 1;
    trailIdx[n++] = b + 1;
    trailIdx[n++] = b;
  }
  trailGeo.setDrawRange(0, n);
  trailGeo.index.needsUpdate = true;
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.aBirth.needsUpdate = true;
  trailGeo.attributes.aOn.needsUpdate = true;
}

/* ---------- Tifinagh letters: they fly off behind the carpet when boosting ---------- */
const GLYPHS = ['ⴰ', 'ⵣ', 'ⵓ', 'ⵍ', 'ⵎ', 'ⵔ', 'ⵜ', 'ⵉ', 'ⴼ', 'ⵙ', 'ⴳ', 'ⴷ'];
const glyphTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 192;
  const cx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const draw = () => {
    cx.clearRect(0, 0, 256, 192);
    cx.fillStyle = '#fff';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.font = '400 48px "Tfng", "Noto Sans Tifinagh", "Ebrima", "Noto Sans", "Segoe UI Symbol", sans-serif';
    GLYPHS.forEach((g, i) => cx.fillText(g, (i % 4) * 64 + 32, (2 - Math.floor(i / 4)) * 64 + 34));
    tex.needsUpdate = true;
  };
  draw();
  try {
    if (document.fonts && document.fonts.load) document.fonts.load('48px "Tfng"', GLYPHS.join('')).then(draw, () => {});
  } catch (_) {
    /* font loading API unavailable: the fallback font is used */
  }
  return tex;
})();
const MAX_GLYPHS = 40;
const gly = {
  pos: new Float32Array(MAX_GLYPHS * 3),
  vel: new Float32Array(MAX_GLYPHS * 3),
  size: new Float32Array(MAX_GLYPHS),
  alpha: new Float32Array(MAX_GLYPHS),
  glyph: new Float32Array(MAX_GLYPHS),
  rot: new Float32Array(MAX_GLYPHS),
  rotv: new Float32Array(MAX_GLYPHS),
  life: new Float32Array(MAX_GLYPHS),
  age: new Float32Array(MAX_GLYPHS),
  s0: new Float32Array(MAX_GLYPHS),
  next: 0
};
const glyU = { uPx: { value: 800 }, uTex: { value: glyphTex } };
const glyGeo = new THREE.BufferGeometry();
glyGeo.setAttribute('position', new THREE.BufferAttribute(gly.pos, 3).setUsage(THREE.DynamicDrawUsage));
glyGeo.setAttribute('aSize', new THREE.BufferAttribute(gly.size, 1).setUsage(THREE.DynamicDrawUsage));
glyGeo.setAttribute('aAlpha', new THREE.BufferAttribute(gly.alpha, 1).setUsage(THREE.DynamicDrawUsage));
glyGeo.setAttribute('aGlyph', new THREE.BufferAttribute(gly.glyph, 1).setUsage(THREE.DynamicDrawUsage));
glyGeo.setAttribute('aRot', new THREE.BufferAttribute(gly.rot, 1).setUsage(THREE.DynamicDrawUsage));
const glyPts = new THREE.Points(
  glyGeo,
  new THREE.ShaderMaterial({
    vertexShader: VS_GLYPH,
    fragmentShader: FS_GLYPH,
    uniforms: glyU,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);
glyPts.frustumCulled = false;
glyPts.renderOrder = 7;
scene.add(glyPts);
// spawns a floating Tifinagh letter (g = index in GLYPHS)
function emitGlyph(x, y, z, vx, vy, vz, size, life, g) {
  const i = gly.next;
  gly.next = (i + 1) % MAX_GLYPHS;
  gly.pos[i * 3] = x - ORG.x;
  gly.pos[i * 3 + 1] = y;
  gly.pos[i * 3 + 2] = z - ORG.z;
  gly.vel[i * 3] = vx;
  gly.vel[i * 3 + 1] = vy;
  gly.vel[i * 3 + 2] = vz;
  gly.s0[i] = size;
  gly.size[i] = size;
  gly.life[i] = life;
  gly.age[i] = 0.0001;
  gly.glyph[i] = g;
  gly.rot[i] = (Math.random() - 0.5) * 0.6;
  gly.rotv[i] = (Math.random() - 0.5) * 1.6;
  gly.alpha[i] = 0;
}
// integrates the letters: drift, spin, growth and fade
function updateGlyphs(dt) {
  const k = Math.exp(-1.3 * dt);
  for (let i = 0; i < MAX_GLYPHS; i++) {
    if (gly.age[i] <= 0) {
      gly.alpha[i] = 0;
      continue;
    }
    gly.age[i] += dt;
    const t = gly.age[i] / gly.life[i];
    if (t >= 1) {
      gly.age[i] = 0;
      gly.alpha[i] = 0;
      gly.size[i] = 0;
      continue;
    }
    const o = i * 3;
    gly.vel[o] *= k;
    gly.vel[o + 2] *= k;
    gly.vel[o + 1] = gly.vel[o + 1] * k + 0.9 * dt;
    gly.pos[o] += gly.vel[o] * dt;
    gly.pos[o + 1] += gly.vel[o + 1] * dt;
    gly.pos[o + 2] += gly.vel[o + 2] * dt;
    gly.rot[i] += gly.rotv[i] * dt;
    gly.size[i] = gly.s0[i] * (0.8 + 0.5 * t);
    gly.alpha[i] = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.95;
  }
  const A = glyGeo.attributes;
  A.position.needsUpdate = true;
  A.aSize.needsUpdate = true;
  A.aAlpha.needsUpdate = true;
  A.aRot.needsUpdate = true;
  A.aGlyph.needsUpdate = true;
}
