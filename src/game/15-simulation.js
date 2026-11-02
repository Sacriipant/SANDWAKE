/**
 * 15-simulation.js: Per-frame simulation.
 *
 * Fixed-step physics, floating-origin rebasing, effects, character model, camera and uniform updates.
 *
 * Part of the game closure; see 01-runtime.js.
 */

/* ---------- main loop ---------- */
// fixed physics time step (s)
const STEP = 1 / 120;
// loop state: physics accumulator, last timestamp, game clock (s), per-effect spawn accumulators and HUD / fps timers
let acc = 0,
  last = performance.now(),
  time = 0,
  sprayAcc = 0,
  boostAcc = 0,
  glyAcc = 0,
  hudT = 0,
  fpsT = 0,
  fpsN = 0;
const v3a = new THREE.Vector3(),
  v3b = new THREE.Vector3(),
  v3c = new THREE.Vector3(),
  m4 = new THREE.Matrix4();
// speed (m/s) at which the floating dust drifts with the wind
const WINDSP = 7;

// floating origin: past 2048 m from ORG, moves ORG (in 1024 m steps) and shifts every CPU-side GPU buffer accordingly
function rebaseIfNeeded() {
  const nx = Math.round(P.x / 1024) * 1024,
    nz = Math.round(P.z / 1024) * 1024;
  if (Math.abs(P.x - ORG.x) < 2048 && Math.abs(P.z - ORG.z) < 2048) return;
  const dx = nx - ORG.x,
    dz = nz - ORG.z;
  ORG.x = nx;
  ORG.z = nz;
  for (let k = 0; k < MAX_TRAIL_POINTS * 2; k++) {
    trail.pos[3 * k] -= dx;
    trail.pos[3 * k + 2] -= dz;
  }
  for (let i = 0; i < MAX_SPRAY; i++) {
    spray.pos[3 * i] -= dx;
    spray.pos[3 * i + 2] -= dz;
  }
  for (let i = 0; i < MAX_GLYPHS; i++) {
    gly.pos[3 * i] -= dx;
    gly.pos[3 * i + 2] -= dz;
  }
  trail.dirty = true;
  orbs.dirty = true;
}

// runs the fixed-step physics for dt seconds (at most 8 steps per frame) and dispatches the jump / landing events
function stepWorld(dt, inp) {
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 8) {
    stepPlayer(P, inp, STEP);
    acc -= STEP;
    n++;
    if (P.landImpact > 0) {
      onLand(P.landImpact);
      P.landImpact = 0;
    }
    if (P.jumped) {
      P.jumped = false;
      onJump();
    }
    if (P.landEvt) {
      P.landEvt = false;
      onTouchdown();
    }
  }
  if (n === 8) acc = 0;
}
// hard landing: sand burst, camera shake, soft bell (imp = impact speed)
function onLand(imp) {
  model.landImp = Math.max(model.landImp, imp);
  const k = clamp(imp / 8, 0.2, 1.4);
  for (let i = 0; i < 26 * k; i++) {
    const a = Math.random() * TAU,
      s = (1.2 + Math.random() * 3.2) * k;
    emit(
      P.x + Math.cos(a) * 0.3,
      P.y + 0.12,
      P.z + Math.sin(a) * 0.3,
      Math.cos(a) * s + P.vx * 0.35,
      0.6 + Math.random() * 2.4 * k,
      Math.sin(a) * s + P.vz * 0.35,
      0.28 + Math.random() * 0.4,
      0.8 + Math.random() * 0.9,
      0.6,
      Math.random()
    );
  }
  cam.shake = Math.min(0.12, cam.shake + imp * 0.01);
  if (audio.ctx && S.sound) bell(PENTA[2 + ((Math.random() * 3) | 0)] / 2, 0.06 * k);
}
// take-off: small sand burst and a bell
function onJump() {
  const jk = clamp(P.jumpPower / 9, 0.7, 1.6);
  for (let i = 0; i < 12 * jk; i++) {
    const a = Math.random() * TAU;
    emit(
      P.x,
      P.y + 0.1,
      P.z,
      Math.cos(a) * 1.4 + P.vx * 0.3,
      0.8 + Math.random() * 1.2,
      Math.sin(a) * 1.4 + P.vz * 0.3,
      0.22 + Math.random() * 0.3,
      0.7 + Math.random() * 0.6,
      0.5,
      Math.random()
    );
  }
  if (audio.ctx && S.sound) bell(PENTA[5 + ((Math.random() * 3) | 0)], 0.05);
}

// spawns and updates the visual effects: wake, sand spray, boost trail, Tifinagh letters
function updateEffects(dt) {
  const sp = P.speed,
    gap = P.y - heightAt(P.x, P.z),
    low = !inAir() && gap < 0.45;
  /* wake + spray (the sand suction smooths micro-bounces: the wake is only interrupted in real flight) */
  if (low && sp > 1.5) {
    trailAdd(P.x, P.z, model.yaw, time);
    sprayAcc += dt * (6 + Math.min(sp, 40) * 1.6 + Math.min(P.slip, 10) * 8);
    const fx = Math.sin(P.h),
      fz = Math.cos(P.h);
    while (sprayAcc >= 1) {
      sprayAcc -= 1;
      const side = (Math.random() - 0.5) * 2,
        back = 0.25 + Math.random() * 0.4;
      const rx = -Math.cos(P.h),
        rz = Math.sin(P.h);
      emit(
        P.x - fx * back + rx * side * 0.25,
        P.y + 0.06,
        P.z - fz * back + rz * side * 0.25,
        P.vx * 0.3 - fx * 0.8 + rx * side * (0.8 + P.slip * 0.5) + (Math.random() - 0.5) * 0.6,
        0.5 + Math.random() * (0.7 + Math.min(sp, 40) * 0.07),
        P.vz * 0.3 - fz * 0.8 + rz * side * (0.8 + P.slip * 0.5) + (Math.random() - 0.5) * 0.6,
        0.14 + Math.random() * 0.26,
        0.5 + Math.random() * 0.9,
        0.34 + 0.2 * clamp(sp / 30, 0, 1),
        0.35 + Math.random() * 0.65
      );
    }
  } else if (inAir()) trailBreak();
  if (low && sp <= 1.5) trailBreak();
  /* boost: lozenges and yaz stay behind the carpet, in still air (the Tifinagh letters, further down, fly off as well) */
  if (P.boosting && S.started) {
    boostAcc += dt * 40 * P.boostK;
    const fx = Math.sin(P.h),
      fz = Math.cos(P.h),
      rx = -fz,
      rz = fx;
    while (boostAcc >= 1) {
      boostAcc -= 1;
      const side = (Math.random() - 0.5) * 1.5,
        back = 0.9 + Math.random() * 0.9;
      emit(
        P.x - fx * back + rx * side,
        P.y + 0.15 + Math.random() * 1.2,
        P.z - fz * back + rz * side,
        P.vx * 0.12 - fx * (0.8 + Math.random() * 1.6) + rx * side * 0.8,
        (Math.random() - 0.35) * 1.0,
        P.vz * 0.12 - fz * (0.8 + Math.random() * 1.6) + rz * side * 0.8,
        0.26 + Math.random() * 0.24,
        0.9 + Math.random() * 0.9,
        0.95,
        2 + Math.random() * 0.999
      );
    }
  }
  if (P.boosting && S.started) {
    glyAcc += dt * 9 * P.boostK;
    const fx = Math.sin(P.h),
      fz = Math.cos(P.h),
      rx = -Math.cos(P.h),
      rz = Math.sin(P.h);
    while (glyAcc >= 1) {
      glyAcc -= 1;
      const side = (Math.random() - 0.5) * 1.6;
      emitGlyph(
        P.x - fx * (1.1 + Math.random() * 0.4) + rx * side,
        P.y + 0.5 + Math.random() * 0.9,
        P.z - fz * (1.1 + Math.random() * 0.4) + rz * side,
        P.vx * 0.5 - fx * (1.0 + Math.random() * 1.6) + rx * side * 0.6,
        0.3 + Math.random() * 0.8,
        P.vz * 0.5 - fz * (1.0 + Math.random() * 1.6) + rz * side * 0.6,
        0.34 + Math.random() * 0.22,
        0.9 + Math.random() * 0.8,
        Math.random() < 0.3 ? 1 : (Math.random() * GLYPHS.length) | 0
      );
    }
  }
  updateSpray(dt);
  updateGlyphs(dt);
  trailFlush();
}

// orients the character on the surface, applies roll / flip and drives the avatar animation
function updateModel(dt, inp) {
  const flying = inAir();
  const kn = damp(flying ? 2.5 : 12, dt);
  const tx = flying ? 0 : P.nx,
    ty = flying ? 1 : P.ny,
    tz = flying ? 0 : P.nz;
  model.nx = lerp(model.nx, tx, kn);
  model.ny = lerp(model.ny, ty, kn);
  model.nz = lerp(model.nz, tz, kn);
  const nl = Math.hypot(model.nx, model.ny, model.nz);
  model.nx /= nl;
  model.ny /= nl;
  model.nz /= nl;
  /* smoothed heading (follows P.h) */
  model.yaw += wrapPI(P.h - model.yaw) * damp(16, dt);
  const fx = Math.sin(model.yaw),
    fz = Math.cos(model.yaw);
  const d = fx * model.nx + fz * model.nz;
  let Fx = fx - model.nx * d,
    Fy = -model.ny * d,
    Fz = fz - model.nz * d;
  const fl = Math.hypot(Fx, Fy, Fz) || 1;
  Fx /= fl;
  Fy /= fl;
  Fz /= fl;
  /* x = U × F */
  const Xx = model.ny * Fz - model.nz * Fy,
    Xy = model.nz * Fx - model.nx * Fz,
    Xz = model.nx * Fy - model.ny * Fx;
  v3a.set(Xx, Xy, Xz);
  v3b.set(model.nx, model.ny, model.nz);
  v3c.set(Fx, Fy, Fz);
  m4.makeBasis(v3a, v3b, v3c);
  m4.setPosition(P.x - ORG.x, P.y + 0.02, P.z - ORG.z);
  rig.matrix.copy(m4);
  rig.matrixWorldNeedsUpdate = true;
  rig.updateMatrixWorld(true);
  /* lean in turns, posture */
  const tgtRoll =
    inp.steer * 0.42 * clamp(P.speed / 8, 0, 1) + clamp(P.slip * 0.03, 0, 0.2) * Math.sign(inp.steer || 0);
  model.roll = lerp(model.roll, tgtRoll, damp(7, dt));
  model.crouch = lerp(model.crouch, Math.max(P.tuck, P.charge * 0.95), damp(9, dt));
  const air = flying ? 1 : 0;
  /* flip: the character spins around its centre, then smoothly straightens up after landing */
  model.flip += clamp(model.flipTarget - model.flip, -9 * dt, 9 * dt);
  flipG.rotation.x = model.flip;
  pivot.rotation.z = model.roll;
  /* pose: the traveller's skeleton is driven by the game state (see avatar.js, animate) */
  model.steerS = lerp(model.steerS, inp.steer, damp(7, dt));
  const vfw = P.vx * Math.sin(P.h) + P.vz * Math.cos(P.h);
  if (!pAcc.init) {
    pAcc.vf = vfw;
    pAcc.vy = P.vy;
    pAcc.init = true;
  }
  const ka = damp(7, dt);
  pAcc.accF = lerp(pAcc.accF, clamp((vfw - pAcc.vf) / dt, -40, 40), ka);
  pAcc.accY = lerp(pAcc.accY, clamp((P.vy - pAcc.vy) / dt, -60, 60), ka);
  pAcc.vf = vfw;
  pAcc.vy = P.vy;
  pAcc.air = lerp(pAcc.air, air, damp(flying ? 9 : 12, dt));
  pose.t = time;
  pose.speed = P.speed;
  pose.boostK = P.boostK;
  pose.air = pAcc.air;
  pose.vy = P.vy;
  pose.crouch = model.crouch;
  pose.tuck = P.tuck;
  pose.charge = P.charge;
  pose.steer = model.steerS;
  pose.roll = model.roll;
  pose.accF = pAcc.accF;
  pose.accY = pAcc.accY;
  pose.land = model.landImp;
  model.landImp = 0;
  pose.flip = Math.abs(model.flipTarget) > 0.5 ? 1 : 0;
  if (DBG.pose) Object.assign(pose, DBG.pose);
  avatar.animate(pose, dt);
  flagU.uSp.value = clamp(P.speed / 50, 0, 1);
  flagU.uBoost.value = P.boostK;
  /* cast shadow */
  const alt = Math.max(0, P.y - heightAt(P.x, P.z));
  terrU.uShAmt.value = 0.8 * clamp(1 - alt / 4.5, 0, 1);
  terrU.uShLen.value = 3.2 * (1 + 0.1 * model.crouch);
}

// third-person chase camera: follows the heading and velocity, stays above the ground, shakes on impacts; the field of view widens with speed and boost
function updateCamera(dt, inp) {
  const sp = P.speed;
  const hv = sp > 3 ? Math.atan2(P.vx, P.vz) : P.h;
  const mix = sp > 3 ? clamp(sp / 9, 0, 1) : 0;
  const tgt = P.h + wrapPI(hv - P.h) * mix * 0.6;
  if (cam.init) {
    cam.yaw = tgt;
  }
  cam.yaw += wrapPI(tgt - cam.yaw) * damp(2.4, dt);
  if (!cam.dragging) cam.orbit *= Math.exp(-0.5 * dt);
  let yaw = cam.yaw + cam.orbit,
    dist = 4.15 + clamp(sp * 0.032, 0, 2.0) + 1.0 * P.boostK,
    height = 1.9 + 0.6 * (1 - P.tuck * 0.5);
  let introSpin = 0;
  if (!S.started) {
    cam.introT += dt;
    introSpin = Math.sin(cam.introT * 0.12) * 0.55 + 0.5;
    dist = 6.6;
    height = 2.5;
  }
  yaw += introSpin;
  const tx = P.x - Math.sin(yaw) * dist + P.vx * 0.06,
    tz = P.z - Math.cos(yaw) * dist + P.vz * 0.06;
  const gyT = heightAt(tx, tz);
  let ty = Math.max(P.y + height, gyT + 1.15);
  if (cam.init) {
    cam.x = tx;
    cam.y = ty;
    cam.z = tz;
    cam.init = false;
  }
  const kp = damp(sp > 2 ? 8 + Math.min(sp, 60) * 0.14 : 5, dt);
  cam.x = lerp(cam.x, tx, kp);
  cam.z = lerp(cam.z, tz, kp);
  cam.y = lerp(cam.y, ty, damp(5.5, dt));
  const gy = heightAt(cam.x, cam.z) + 0.9;
  if (cam.y < gy) cam.y = gy;
  cam.shake *= Math.exp(-5 * dt);
  const sh = cam.shake + 0.012 * P.boostK,
    t = time * 40;
  camera.position.set(cam.x - ORG.x + Math.sin(t) * sh, cam.y + Math.cos(t * 1.3) * sh, cam.z - ORG.z);
  const lf = 3.2;
  camera.lookAt(P.x - ORG.x + Math.sin(yaw) * lf, P.y + 1.0 + (S.started ? 0 : 0.25), P.z - ORG.z + Math.cos(yaw) * lf);
  if (DBG.cam) {
    const o = DBG.cam.o,
      t = DBG.cam.t;
    camera.position.set(P.x - ORG.x + o[0], P.y + o[1], P.z - ORG.z + o[2]);
    camera.lookAt(P.x - ORG.x + t[0], P.y + t[1], P.z - ORG.z + t[2]);
  }
  const aspectK = Math.max(1, 1.35 / camera.aspect);
  const base = 56 + clamp(sp / 60, 0, 1) * 11 + 9 * P.boostK;
  const fov = Math.min(92, (2 * Math.atan(Math.tan((base * D2R) / 2) * aspectK)) / D2R);
  if (Math.abs(fov - camera.fov) > 0.01) {
    camera.fov = lerp(camera.fov, fov, damp(3, dt));
    camera.updateProjectionMatrix();
  }
}

// per-frame uniforms: terrain phases (double precision on the CPU), level and gate data, camera vectors for the sky
function updateUniforms() {
  const cx = P.x,
    cz = P.z;
  updatePhases(cx, cz);
  if (JBEL.on) {
    sharedUniforms.uJO.value.set(jbelS(cx, cz), jbelT(cx, cz), 0, 0);
    flagMesh.position.set(LV.flag.x - ORG.x, LV.flag.y, LV.flag.z - ORG.z);
  }
  if (TIZIRI.on) {
    for (let i = 0; i < GATE_COUNT; i++) {
      const g = TIZIRI.gates[i],
        mode = LV.done || i < LV.cp ? 2 : i === LV.cp ? 1 : 0;
      gateU.uGA.value[i].set(g[0] - ORG.x, g[1], g[2] - ORG.z, g[5]);
      gateU.uGB.value[i].set(g[3], g[4], mode, clamp(1 - (time - gateTrack.tPass[i]) / 1.4, 0, 1));
    }
    const ag = !LV.done && LV.cp < GATE_COUNT ? TIZIRI.gates[LV.cp] : null;
    if (ag) {
      terrU.uGP.value.set(ag[0] - cx, ag[1], ag[2] - cz, ag[6] === 2 ? 1.5 : 0.95);
      terrU.uGC.value.setRGB(1.0, ag[6] === 2 ? 0.72 : 0.5, ag[6] === 2 ? 0.28 : 0.16);
    } else terrU.uGP.value.w = 0;
  } else terrU.uGP.value.w = 0;
  terrain3.position.set(cx - ORG.x, 0, cz - ORG.z);
  wisps.position.copy(terrain3.position);
  terrU.uCamLocal.value.set(
    camera.position.x - terrain3.position.x,
    camera.position.y,
    camera.position.z - terrain3.position.z
  );
  terrU.uTime.value = time;
  const mod = (v, m) => ((v % m) + m) % m;
  terrU.uRP.value.set(
    mod(RIPPLE.kr * (WIND.x * cx + WIND.z * cz), TAU),
    mod(RIPPLE.w1[0] * cx + RIPPLE.w1[1] * cz, TAU),
    mod(RIPPLE.w2[0] * cx + RIPPLE.w2[1] * cz, TAU),
    mod(RIPPLE.w3[0] * cx + RIPPLE.w3[1] * cz, TAU)
  );
  terrU.uPP.value.set(
    mod(RIPPLE.pw1[0] * cx + RIPPLE.pw1[1] * cz, TAU),
    mod(RIPPLE.pw2[0] * cx + RIPPLE.pw2[1] * cz, TAU)
  );
  terrU.uCell.value.set(mod(cx * RIPPLE.cellScale, 4096), mod(cz * RIPPLE.cellScale, 4096));
  const M2 = 2 * WBOX;
  wispU.uCM.value.set(mod(cx, M2), mod(cz, M2));
  wispU.uWindMove.value.set(mod(WIND.x * WINDSP * time, M2), mod(WIND.z * WINDSP * time, M2));
  const px = renderer.domElement.height / (2 * Math.tan((camera.fov * D2R) / 2));
  wispU.uPx.value = px;
  sprayU.uPx.value = px;
  orbU.uPx.value = px;
  glyU.uPx.value = px;
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  skyU.uCR.value.set(e[0], e[1], e[2]);
  skyU.uCU.value.set(e[4], e[5], e[6]);
  skyU.uCF.value.set(-e[8], -e[9], -e[10]);
  const th = Math.tan((camera.fov * D2R) / 2);
  skyU.uTan.value.set(th * camera.aspect, th);
  skyU.uTime.value = time;
  /* sun direction in camera space, for the character */
  charU.uSunV.value.copy(SUN).transformDirection(camera.matrixWorldInverse);
}
