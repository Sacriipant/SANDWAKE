/**
 * 03-environment.js: Environment.
 *
 * Floating origin, sun and moon, time of night, the uniforms shared by the terrain, sky dome and terrain
 * mesh.
 *
 * Part of the game closure; see 01-runtime.js.
 */

/* ---------- sun ---------- */
const SUN_AZ = (WIND_ANG + 16) * D2R,
  SUN_EL = 23 * D2R;
const SUN = new THREE.Vector3(
  Math.cos(SUN_EL) * Math.cos(SUN_AZ),
  Math.sin(SUN_EL),
  Math.cos(SUN_EL) * Math.sin(SUN_AZ)
);
const SUN2D = new THREE.Vector2(Math.cos(SUN_AZ), Math.sin(SUN_AZ));
/* ---------- time of night: TOD.k = 1 in the middle of the night (Tiziri level), 0 in the evening. SUN is then the moon direction:
 at dawn it sinks, the sun rises and everything is recoloured (see uNight in shaders.js) ---------- */
const MOON_AZ = -38 * D2R,
  MOON_EL = 34 * D2R;
// time of day: k = current value, goal = target value, rate = change per second
const TOD = { k: 0, goal: 0, rate: 1 / 12 };

/* ---------- shared uniforms (GPU terrain = same formula as sim.js) ---------- */
const V4 = (a, b, c, d) => new THREE.Vector4(a, b, c, d);
const sharedUniforms = {
  uK: { value: COMPS.map((c) => V4(c.kx, c.kz, c.amp, c.skew)) },
  uQ: { value: COMPS.map((c) => V4(c.qx, c.qz, c.wamp, c.lod)) },
  uM: { value: COMPS.map((c) => V4(c.mx, c.mz, c.edep, c.rw)) },
  uP: { value: COMPS.map((c) => V4(0, 0, 0, c.sharp)) },
  uAmp: { value: TERRAIN.amp },
  uNight: { value: 0 },
  uLvl: { value: 0 },
  uJO: { value: V4(0, 0, 0, 0) },
  uJA: {
    value: Array.from({ length: JBEL.NM }, (_, i) =>
      V4(JBEL_A[4 * i], JBEL_A[4 * i + 1], JBEL_A[4 * i + 2], JBEL_A[4 * i + 3])
    )
  },
  uJB: {
    value: Array.from({ length: JBEL.NM }, (_, i) =>
      V4(JBEL_B[4 * i], JBEL_B[4 * i + 1], JBEL_B[4 * i + 2], JBEL_B[4 * i + 3])
    )
  },
  uJC: {
    value: Array.from({ length: JBEL.NM }, (_, i) =>
      V4(JBEL_C[4 * i], JBEL_C[4 * i + 1], JBEL_C[4 * i + 2], JBEL_C[4 * i + 3])
    )
  }
};
const phaseArr = new Float32Array(NCOMP * 4);
// terrain wave phases at the player position, computed in double precision (see terrainPhases in sim.js)
function updatePhases(cx, cz) {
  terrainPhases(cx, cz, phaseArr);
  for (let i = 0; i < NCOMP; i++)
    sharedUniforms.uP.value[i].set(phaseArr[i * 4], phaseArr[i * 4 + 1], phaseArr[i * 4 + 2], phaseArr[i * 4 + 3]);
}

/* ---------- sky ---------- */
const skyU = {
  uSun: { value: SUN },
  uCR: { value: new THREE.Vector3() },
  uCU: { value: new THREE.Vector3() },
  uCF: { value: new THREE.Vector3() },
  uTan: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
  uNight: sharedUniforms.uNight
};
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const m = new THREE.ShaderMaterial({
    vertexShader: VS_SKY,
    fragmentShader: FS_SKY,
    uniforms: skyU,
    depthWrite: false,
    depthTest: true
  });
  const sky = new THREE.Mesh(g, m);
  sky.frustumCulled = false;
  sky.renderOrder = 1000;
  scene.add(sky);
}

/* ---------- terrain ---------- */
const FAR = 560;
const terrU = Object.assign(
  {
    uSun: { value: SUN },
    uSun2D: { value: SUN2D },
    uSunTan: { value: Math.tan(SUN_EL) },
    uTime: { value: 0 },
    uCamLocal: { value: new THREE.Vector3() },
    uRP: { value: new THREE.Vector4() },
    uPP: { value: new THREE.Vector2() },
    uCell: { value: new THREE.Vector2() },
    uShAmt: { value: 0.8 },
    uShOff: { value: 0 },
    uShLen: { value: 2.8 },
    uFogD: { value: 1 / 330 },
    uFar: { value: FAR },
    uGP: { value: V4(0, 0, 0, 0) },
    uGC: { value: new THREE.Color(1, 0.55, 0.18) }
  },
  sharedUniforms
);
const terrMat = new THREE.ShaderMaterial({
  vertexShader: VS_TERRAIN,
  fragmentShader: FS_TERRAIN,
  uniforms: terrU,
  defines: { SH_STEPS: 6, GLITTER: 1, RIPPLE: 1 },
  extensions: { derivatives: true }
});
const terrain3 = new THREE.Mesh(new THREE.BufferGeometry(), terrMat);
terrain3.frustumCulled = false;
scene.add(terrain3);

/** Polar terrain mesh: nr rings (log-spaced from 0.9 m to FAR) of ns segments around the centre; heights come from the vertex shader. */
function buildTerrainGeometry(nr, ns) {
  const nv = 1 + nr * ns,
    r0 = 0.9;
  const pos = new Float32Array(nv * 3);
  for (let j = 1; j <= nr; j++) {
    const r = r0 * Math.pow(FAR / r0, (j - 1) / (nr - 1));
    for (let i = 0; i < ns; i++) {
      const a = (i / ns) * TAU,
        o = (1 + (j - 1) * ns + i) * 3;
      pos[o] = Math.cos(a) * r;
      pos[o + 2] = Math.sin(a) * r;
    }
  }
  const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ns * 3 + (nr - 1) * ns * 6);
  let k = 0;
  for (let i = 0; i < ns; i++) {
    idx[k++] = 0;
    idx[k++] = 1 + ((i + 1) % ns);
    idx[k++] = 1 + i;
  }
  for (let j = 1; j < nr; j++) {
    const a = 1 + (j - 1) * ns,
      b = 1 + j * ns;
    for (let i = 0; i < ns; i++) {
      const i1 = (i + 1) % ns;
      idx[k++] = a + i;
      idx[k++] = a + i1;
      idx[k++] = b + i;
      idx[k++] = a + i1;
      idx[k++] = b + i1;
      idx[k++] = b + i;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
