/**
 * 05-orbs-and-flag.js: Orbs and start flag.
 *
 * Boost-recharge orbs (data and rendering) and the start flag of the Jbel level.
 *
 * Part of the game closure; see 01-runtime.js.
 */

/* ---------- boost recharge orbs ----------
 The world is infinite: a grid of 46 m cells, each of which holds (or not) an orb determined by a hash of its coordinates.
 Nothing is stored except the list of collected orbs, which respawn after 80 s. */
// cell: grid size (m); view: scan radius (m); density: share of cells holding an orb; gain / gainAir: boost energy restored; rGround / rAir: pickup radius (m); respawn: seconds
const ORB = { cell: 46, view: 260, density: 0.42, gain: 0.34, gainAir: 0.6, rGround: 3.6, rAir: 4.6, respawn: 80 };
const MAX_ORBS = 96;
const orbs = {
  list: [],
  taken: new Map(),
  ci: 1e9,
  cj: 1e9,
  scanT: 0,
  dirty: true,
  dirtyScan: true,
  px: NaN,
  py: 0,
  pz: 0
};
// deterministic hash of a grid cell, in [0, 1)
function cellHash(i, j, salt) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(salt + 1, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const orbU = { uTime: terrU.uTime, uPx: { value: 800 } };
const orbPos = new Float32Array(MAX_ORBS * 3),
  orbType = new Float32Array(MAX_ORBS),
  orbPh = new Float32Array(MAX_ORBS);
const orbGeo = new THREE.BufferGeometry();
orbGeo.setAttribute('position', new THREE.BufferAttribute(orbPos, 3).setUsage(THREE.DynamicDrawUsage));
orbGeo.setAttribute('aType', new THREE.BufferAttribute(orbType, 1).setUsage(THREE.DynamicDrawUsage));
orbGeo.setAttribute('aPh', new THREE.BufferAttribute(orbPh, 1).setUsage(THREE.DynamicDrawUsage));
orbGeo.setDrawRange(0, 0);
const orbPts = new THREE.Points(
  orbGeo,
  new THREE.ShaderMaterial({
    vertexShader: VS_ORB,
    fragmentShader: FS_ORB,
    uniforms: orbU,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);
orbPts.frustumCulled = false;
orbPts.renderOrder = 6;
scene.add(orbPts);
/* light columns */
const plPos = new Float32Array(MAX_ORBS * 4 * 3),
  plCorner = new Float32Array(MAX_ORBS * 4 * 2),
  plType = new Float32Array(MAX_ORBS * 4),
  plH = new Float32Array(MAX_ORBS * 4);
const plIdx = new Uint16Array(MAX_ORBS * 6);
for (let i = 0; i < MAX_ORBS; i++) {
  plCorner.set([-1, 0, 1, 0, -1, 1, 1, 1], i * 8);
  plIdx.set([4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 2, 4 * i + 1, 4 * i + 3], i * 6);
}
const plGeo = new THREE.BufferGeometry();
plGeo.setAttribute('position', new THREE.BufferAttribute(plPos, 3).setUsage(THREE.DynamicDrawUsage));
plGeo.setAttribute('aCorner', new THREE.BufferAttribute(plCorner, 2));
plGeo.setAttribute('aType', new THREE.BufferAttribute(plType, 1).setUsage(THREE.DynamicDrawUsage));
plGeo.setAttribute('aH', new THREE.BufferAttribute(plH, 1).setUsage(THREE.DynamicDrawUsage));
plGeo.setIndex(new THREE.BufferAttribute(plIdx, 1));
plGeo.setDrawRange(0, 0);
const plMesh = new THREE.Mesh(
  plGeo,
  new THREE.ShaderMaterial({
    vertexShader: VS_PILLAR,
    fragmentShader: FS_PILLAR,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  })
);
plMesh.frustumCulled = false;
plMesh.renderOrder = 5;
scene.add(plMesh);

/* ---------- start flag (Jbel level): a pole and a red cloth, facing downwind ---------- */
const flagMesh = (() => {
  const pole = new THREE.BoxGeometry(0.09, 5.6, 0.09);
  pole.translate(0, 2.8, 0);
  const cloth = new THREE.PlaneGeometry(2.1, 1.25, 12, 6);
  cloth.translate(1.095, 4.95, 0);
  const pn = pole.attributes.position.count,
    cn = cloth.attributes.position.count;
  const pos = new Float32Array((pn + cn) * 3),
    af = new Float32Array((pn + cn) * 3);
  pos.set(pole.attributes.position.array, 0);
  pos.set(cloth.attributes.position.array, pn * 3);
  for (let i = 0; i < cn; i++) {
    const o = (pn + i) * 3;
    af[o] = 1;
    af[o + 1] = (pos[o] - 0.045) / 2.1;
    af[o + 2] = (pos[o + 1] - 4.325) / 1.25;
  }
  const pi = pole.index.array,
    ci = cloth.index.array,
    idx = new Uint16Array(pi.length + ci.length);
  idx.set(pi, 0);
  for (let i = 0; i < ci.length; i++) idx[pi.length + i] = ci[i] + pn;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aF', new THREE.BufferAttribute(af, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.Mesh(
    g,
    new THREE.ShaderMaterial({
      vertexShader: VS_FLAG,
      fragmentShader: FS_FLAG,
      side: THREE.DoubleSide,
      uniforms: { uTime: terrU.uTime, uSun: { value: SUN }, uFogD: terrU.uFogD }
    })
  );
  m.frustumCulled = false;
  m.visible = false;
  m.rotation.y = -Math.atan2(WIND.z, WIND.x);
  scene.add(m);
  return m;
})();
