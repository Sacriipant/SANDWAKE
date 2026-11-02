/**
 * 17-boot.js: Main loop and boot.
 *
 * The frame function, the boot sequence and the debug handle used by the tests.
 *
 * Part of the game closure; see 01-runtime.js.
 */

// one rendered frame: input, fixed-step physics, updates, rendering, adaptive quality
function frame(now) {
  requestAnimationFrame(frame);
  const dtms = now - last;
  last = now;
  const dt = clamp(dtms / 1000, 0.0005, 0.05);
  time += dt;
  const inp = readInput();
  if (S.started) {
    handleFlipInput(inp);
    stepWorld(dt, inp);
  }
  rebaseIfNeeded();
  updateLevel();
  updateOrbs(dt);
  updateModel(dt, inp);
  updateEffects(dt);
  updateCamera(dt, inp);
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  updateNav(dt);
  updateTod(dt);
  updateUniforms();
  updateAudio(dt);
  updateHud();
  renderer.render(scene, camera);
  renderNav();
  adapt(dtms, now);
  /* HUD */
  hudT += dt;
  fpsT += dt;
  fpsN++;
  if (hudT > 0.1) {
    hudT = 0;
    const kmh = Math.round(P.speed * 3.6);
    if ($('speedv').textContent != kmh) $('speedv').textContent = kmh;
    updateLevelHud();
  }
  if (fpsT > 0.5) {
    if (S.fps) $('fps').textContent = Math.round(fpsN / fpsT) + ' ' + tr('fpsUnit') + ' · ×' + curPR.toFixed(2);
    fpsT = 0;
    fpsN = 0;
  }
}

/* ---------- startup (and resume after a live update of the page) ---------- */
// initial setup; data is the state restored after a live page update, if any
function boot(data) {
  applyLevelFlags();
  resetPlayer(true);
  const sv = data && data.p;
  if (sv && isFinite(sv.x) && isFinite(sv.z)) {
    Object.assign(P, sv);
    P._jumpHeld = false;
    model.yaw = P.h;
    cam.init = true;
    if (data.started) {
      S.started = true;
      $('intro').hidden = true;
      $('intro').classList.add('gone');
      $('app').classList.remove('intro-on');
    }
  }
  applyQuality();
  $('app').classList.add('ready');
  /* a few steps so that the first frame is already settled (scarf, camera) */
  for (let i = 0; i < 4; i++) {
    rebaseIfNeeded();
    updateModel(0.016, { steer: 0 });
    updateCamera(0.016, { steer: 0 });
  }
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
}
try {
  // optional hot-reload hook of the hosting page: keeps the player state across live updates (does nothing elsewhere)
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function')
    hot.snapshot(() => ({
      p: { x: P.x, y: P.y, z: P.z, vx: P.vx, vy: P.vy, vz: P.vz, h: P.h, energy: P.energy },
      started: S.started
    }));
  if (hot && typeof hot.ready === 'function') hot.ready(boot);
  else boot((hot && hot.data) || {});
} catch (e) {
  boot({});
}

/* test bench: one game frame without rendering (autopilot, tests) */
function headlessTick(dt, inp) {
  time += dt;
  handleFlipInput(inp);
  stepWorld(dt, inp);
  rebaseIfNeeded();
  updateLevel();
  updateOrbs(dt);
  updateModel(dt, inp);
  updateEffects(dt);
  updateCamera(dt, inp);
  camera.updateMatrixWorld();
  updateNav(dt);
  updateTod(dt);
}
// debug and test handle: the end-to-end tests (tests/e2e) drive the game through it
window.__sandwake = {
  headlessTick,
  nav,
  navT,
  LV,
  JBEL,
  TIZIRI,
  TOD,
  gateTrack,
  gateU,
  gateMesh,
  applyTod,
  passGate,
  nextLevel,
  terrU,
  setLevel,
  finishLevel,
  fallRespawn,
  startLevel,
  pose,
  settle(n, dt, steer) {
    for (let i = 0; i < n; i++) updateModel(dt || 0.03, { steer: steer || 0 });
  },
  body,
  avatar,
  glyphTex,
  gly,
  DBG,
  flagU,
  orbs,
  ORB,
  model,
  onTouchdown,
  collectOrb,
  scanOrbs,
  uploadOrbs,
  terrMat,
  sharedUniforms,
  updatePhases,
  P,
  S,
  cam,
  ORG,
  PRESETS,
  applyQuality,
  resetPlayer,
  camera,
  renderer,
  stepWorld,
  readInput,
  keys,
  setTime(t) {
    time = t;
  },
  SUN
};
