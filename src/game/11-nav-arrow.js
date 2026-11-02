/**
 * 11-nav-arrow.js: Navigation arrow.
 *
 * A small 3D scene drawn at the top of the screen that points at the next target.
 *
 * Part of the game closure; see 01-runtime.js.
 */

/* ---------- navigation arrow: a small 3D scene at the top of the screen, pointing at the next pillar (then the golden star) ----------
 It is drawn after the main scene in a reserved frame (#nav), with its own camera. It rotates in the frame of the game
 camera: pointing to the top of the screen = straight ahead. */
const nav = (() => {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1.6, 0.1, 40);
  cam.position.set(0, 4.6, 3.3);
  cam.lookAt(0, 0, -0.1);
  const sh = new THREE.Shape();
  sh.moveTo(0, 1.55);
  sh.lineTo(0.98, 0.3);
  sh.lineTo(0.44, 0.3);
  sh.lineTo(0.44, -1.22);
  sh.lineTo(0, -0.86);
  sh.lineTo(-0.44, -1.22);
  sh.lineTo(-0.44, 0.3);
  sh.lineTo(-0.98, 0.3);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.08,
    bevelSegments: 2,
    curveSegments: 1
  });
  geo.translate(0, -0.165, -0.11);
  geo.rotateX(-Math.PI / 2); // lying flat, tip towards -z, centred
  const uni = { uA: { value: 0 }, uT: terrU.uTime };
  const body = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({ vertexShader: VS_NAV, fragmentShader: FS_NAV, uniforms: uni, transparent: true })
  );
  const rim = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      vertexShader: VS_NAVO,
      fragmentShader: FS_NAVO,
      uniforms: uni,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false
    })
  );
  rim.scale.set(1.13, 1.7, 1.1);
  rim.renderOrder = 0;
  body.renderOrder = 1;
  const tilt = new THREE.Group(),
    pivot = new THREE.Group();
  tilt.add(rim, body);
  pivot.add(tilt);
  scene.add(pivot);
  return {
    scene,
    cam,
    pivot,
    tilt,
    uni,
    ang: 0,
    pit: 0,
    a: 0,
    on: false,
    dist: 0,
    lab: '',
    rect: null,
    dirty: true,
    init: false
  };
})();
// maps the #nav element to a viewport rectangle of the canvas
function navLayout() {
  const r = $('nav').getBoundingClientRect(),
    c = canvas.getBoundingClientRect();
  if (r.width < 8 || c.height < 8) {
    nav.rect = null;
    return;
  }
  nav.rect = { x: r.left - c.left, y: c.height - (r.top - c.top) - r.height, w: r.width, h: r.height };
  nav.cam.aspect = r.width / r.height;
  nav.cam.updateProjectionMatrix();
  nav.dirty = false;
}
// target of the arrow: next pillar, then the golden star (Jbel) or the active gate (Tiziri); out.dist = distance (m)
function navTarget(out) {
  if (TIZIRI.on) {
    const g = TIZIRI.gates[Math.min(LV.cp, GATE_COUNT - 1)];
    out.x = g[0];
    out.z = g[2];
    out.y = g[1];
    out.dist = Math.hypot(g[0] - P.x, g[2] - P.z);
    return;
  }
  const s = jbelS(P.x, P.z),
    t = jbelT(P.x, P.z);
  if (LV.cp < JBEL.NP - 1) {
    const i = LV.cp + 1,
      m = JBEL.M[i],
      ts = 0.5 * (m[0] + m[1]),
      tt = m[2];
    out.x = jbelX(ts, tt);
    out.z = jbelZ(ts, tt);
    out.y = m[4];
    out.dist = Math.max(0, jbelSd(i, s, t));
  } else {
    out.x = jbelX(JBEL.finishS, JBEL.finishT);
    out.z = jbelZ(JBEL.finishS, JBEL.finishT);
    out.y = JBEL.M[JBEL.NP - 1][4] + 2.6;
    out.dist = Math.hypot(out.x - P.x, out.z - P.z);
  }
}
const navT = { x: 0, y: 0, z: 0, dist: 0 };
// orients the arrow towards the target, relative to the camera direction
function updateNav(dt) {
  const want = (JBEL.on || TIZIRI.on) && S.started && S.hud && !LV.done;
  nav.a += ((want ? 1 : 0) - nav.a) * damp(6, dt);
  nav.on = nav.a > 0.02;
  nav.uni.uA.value = nav.a;
  $('nav').classList.toggle('show', want);
  if (!nav.on) {
    nav.init = false;
    return;
  }
  if (nav.dirty || !nav.rect) navLayout();
  navTarget(navT);
  nav.dist = navT.dist;
  const e = camera.matrixWorld.elements;
  const dx = navT.x - P.x,
    dz = navT.z - P.z,
    hd = Math.hypot(dx, dz);
  const r = dx * e[0] + dz * e[2],
    f = -(dx * e[8] + dz * e[10]);
  const goal = Math.atan2(-r, f),
    pit = clamp(Math.atan2(navT.y - P.y, Math.max(hd, 30)) * 0.9, -0.5, 0.45);
  if (!nav.init) {
    nav.ang = goal;
    nav.pit = pit;
    nav.init = true;
  } else {
    nav.ang += wrapPI(goal - nav.ang) * damp(9, dt);
    nav.pit += (pit - nav.pit) * damp(5, dt);
  }
  const t = time,
    close = navT.dist < 60 ? 1 : 0;
  nav.pivot.rotation.y = nav.ang;
  nav.tilt.rotation.x = nav.pit;
  nav.pivot.position.y = Math.sin(t * 2.1) * 0.07;
  const k = 1 + 0.05 * Math.sin(t * 4.2) * close + 0.04 * close;
  nav.pivot.scale.set(k, k, k);
}
// draws the arrow in its own viewport on top of the scene
function renderNav() {
  const R = nav.rect;
  if (!nav.on || !R) return;
  renderer.autoClear = false;
  renderer.setScissorTest(true);
  renderer.setViewport(R.x, R.y, R.w, R.h);
  renderer.setScissor(R.x, R.y, R.w, R.h);
  renderer.clearDepth();
  renderer.render(nav.scene, nav.cam);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, VW, VH);
  renderer.autoClear = true;
}
