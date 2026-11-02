/**
 * 10-levels.js: Levels.
 *
 * Level logic: Jbel checkpoints and falls, Tiziri gates, the level HUD and level switching.
 *
 * Part of the game closure; see 01-runtime.js.
 */

/* ---------- level 1: Jbel ----------
 The player starts at the flag, on the cliff, and must chain jumps (speed + boost + charged jump) from one pillar to the next
 up to the golden star on the last one. Falling below the level brings the player back to the last pillar reached, with momentum. */
const noteUI = { until: 0 };
// centre notification: small label k, big value v, subtitle s, shown for secs seconds
function showNote(k, v, s, secs) {
  setText($('noteK'), k || '');
  setText($('noteV'), v || '');
  setText($('noteS'), s || '');
  $('note').classList.add('show');
  noteUI.until = time + (secs || 2.6);
}
// seconds -> m:ss.s
function fmtTime(t) {
  const m = Math.floor(t / 60),
    s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}
// Jbel: places the player at level coordinates (s, t), facing along the level axis
function placeLevel(s, t, speed) {
  placeAt(P, jbelX(s, t), jbelZ(s, t), Math.atan2(JBEL.dx, JBEL.dz), speed);
  afterPlace();
}
// resets the visual state after a teleport
function afterPlace() {
  model.nx = P.nx;
  model.ny = P.ny;
  model.nz = P.nz;
  model.yaw = P.h;
  cam.init = true;
  model.flip = model.flipTarget = 0;
  orbs.dirtyScan = true;
  orbs.px = NaN;
  trail.linked = false;
  trail.lx = 1e9;
  pAcc.init = false;
}
// (re)starts the current level
function startLevel() {
  LV.cp = 0;
  LV.falls = 0;
  LV.t0 = -1;
  LV.done = false;
  LV.tEnd = 0;
  LV.hudCp = -1;
  gateTrack.tPass.fill(-99);
  gateTrack.px = NaN;
  gateTrack.miss = -1;
  orbs.taken.clear();
  if (TIZIRI.on) {
    TOD.k = TOD.goal = 1;
    applyTod();
    placeAt(P, TIZIRI.start.x, TIZIRI.start.z, TIZIRI.start.h, 0);
    afterPlace();
  } else placeLevel(JBEL.spawnS, 0, 0);
  P.energy = 1;
  if (S.started) showLevelTitle();
}
function showLevelTitle() {
  if (TIZIRI.on) showNote('ⵜⵉⵣⵉⵔⵉ', 'Tiziri', tr('lvGoalT'), 4.6);
  else showNote('ⴰⴷⵔⴰⵔ', 'Jbel', tr('lvGoal'), 4.6);
}
// Jbel: the player fell into the canyon; back to the last pillar reached, with some momentum
function fallRespawn() {
  if (!LV.done) {
    LV.falls++;
    showNote(tr('lvFall'), '', tr('lvFallS'), 2.2);
  }
  const e = Math.max(P.energy, 0.8),
    m = JBEL.M[LV.cp];
  if (LV.cp === 0) placeLevel(JBEL.respawnS, 0, 26);
  else placeLevel(m[0] + 26, m[2], 30);
  P.energy = e;
  orbs.taken.clear();
}
// Jbel: the golden star has been reached
function finishLevel(o) {
  if (LV.done) return;
  LV.done = true;
  LV.cp = JBEL.NP - 1;
  LV.tEnd = LV.t0 < 0 ? 0 : time - LV.t0;
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * TAU;
    emitGlyph(
      o.x,
      o.y + 0.5,
      o.z,
      Math.cos(a) * 3.2,
      1.6 + Math.random() * 2.2,
      Math.sin(a) * 3.2,
      0.6 + Math.random() * 0.4,
      1.8 + Math.random() * 1.0,
      (Math.random() * GLYPHS.length) | 0
    );
  }
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * TAU,
      s = 2 + Math.random() * 7;
    emit(
      o.x,
      o.y,
      o.z,
      Math.cos(a) * s,
      Math.random() * 6 - 0.5,
      Math.sin(a) * s,
      0.36 + Math.random() * 0.5,
      1.1 + Math.random() * 1.1,
      0.95,
      2 + Math.random() * 0.999
    );
  }
  P.energy = 1;
  cam.shake = Math.min(0.14, cam.shake + 0.08);
  showNote(
    'ⴰⴷⵔⴰⵔ · Jbel',
    fmtTime(LV.tEnd),
    tr('lvDone') + ' · ' + tr('lvFalls').replace('{n}', LV.falls) + ' · ' + tr('lvRestart') + ' · ' + tr('lvNext2'),
    14
  );
  if (audio.ctx && S.sound) [4, 5, 6, 8].forEach((k, i) => setTimeout(() => bell(PENTA[k], 0.08), i * 130));
}
// per-frame level logic: timer, falls and pillar checkpoints (Jbel), gates (Tiziri)
function updateLevel() {
  if (!S.started) return;
  if (TIZIRI.on) {
    updateTiziri();
    return;
  }
  if (!JBEL.on) return;
  if (LV.t0 < 0 && P.speed > 1.5) LV.t0 = time;
  if (P.y < JBEL.killY) {
    fallRespawn();
    return;
  }
  if (P.grounded && !inAir() && !LV.done) {
    const s = jbelS(P.x, P.z),
      t = jbelT(P.x, P.z);
    for (let i = JBEL.NP - 1; i > LV.cp; i--) {
      if (jbelSd(i, s, t) < -8) {
        LV.cp = i;
        showNote(tr('lvCheck'), i + ' / ' + (JBEL.NP - 1), '', 2.4);
        if (audio.ctx && S.sound) {
          bell(PENTA[5], 0.06);
          setTimeout(() => bell(PENTA[7], 0.05), 90);
        }
        break;
      }
    }
  }
}
/* Tiziri: the gates are crossed in order; the segment travelled since the previous frame is tested against the lozenge of the active gate */
function updateTiziri() {
  if (LV.t0 < 0 && P.speed > 1.5) LV.t0 = time;
  const cx = P.x,
    cy = P.y + 0.9,
    cz = P.z;
  if (!LV.done && LV.cp < GATE_COUNT && isFinite(gateTrack.px)) {
    const g = TIZIRI.gates[LV.cp];
    if (segmentCrossesGate(g, gateTrack.px, gateTrack.py, gateTrack.pz, cx, cy, cz)) passGate(LV.cp);
    else if (gateTrack.miss !== LV.cp && (cx - g[0]) * g[3] + (cz - g[2]) * g[4] > 110) {
      gateTrack.miss = LV.cp;
      showNote(tr('lvMiss'), '', '', 2.8);
    }
  }
  gateTrack.px = cx;
  gateTrack.py = cy;
  gateTrack.pz = cz;
}
// gate i has been crossed: energy bonus, small speed boost, effects, progress note
function passGate(i) {
  const g = TIZIRI.gates[i],
    fin = g[6] === 2;
  gateTrack.tPass[i] = time;
  LV.cp = i + 1;
  const before = P.energy;
  P.energy = Math.min(1, P.energy + 0.5);
  const sp = Math.hypot(P.vx, P.vz);
  if (sp > 3 && sp < 80) {
    const k = 6 / sp;
    P.vx += P.vx * k;
    P.vz += P.vz * k;
  }
  gainPop(P.energy - before);
  const gx = g[0],
    gy = g[1],
    gz = g[2],
    ux = -g[4],
    uz = g[3];
  for (let n = 0; n < 14; n++) {
    const a = (n / 14) * TAU + Math.random() * 0.3,
      u = Math.cos(a) * g[5] * 0.7,
      v = Math.sin(a) * g[5] * 0.7;
    emitGlyph(
      gx + ux * u,
      gy + v,
      gz + uz * u,
      g[3] * 4 + ux * u * 0.12,
      v * 0.1 + 0.8,
      g[4] * 4 + uz * u * 0.12,
      0.5 + Math.random() * 0.3,
      1.3 + Math.random() * 0.8,
      n % 3 === 0 ? 1 : (Math.random() * GLYPHS.length) | 0
    );
  }
  cam.shake = Math.min(0.1, cam.shake + 0.04);
  if (fin) {
    finishTiziri(g);
    return;
  }
  showNote(tr('lvGate'), i + 1 + ' / ' + GATE_COUNT, '', 1.1);
  if (audio.ctx && S.sound) {
    const k = i % 6;
    bell(PENTA[2 + k], 0.07);
    setTimeout(() => bell(PENTA[4 + k], 0.05), 80);
  }
}
// last gate crossed: celebration, and the dawn starts
function finishTiziri(g) {
  LV.done = true;
  LV.cp = GATE_COUNT;
  LV.tEnd = LV.t0 < 0 ? 0 : time - LV.t0;
  P.energy = 1;
  TOD.goal = 0;
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * TAU,
      sp = 2 + Math.random() * 7;
    emit(
      g[0],
      g[1],
      g[2],
      Math.cos(a) * sp,
      Math.random() * 6 - 0.5,
      Math.sin(a) * sp,
      0.36 + Math.random() * 0.5,
      1.1 + Math.random() * 1.1,
      0.95,
      2 + Math.random() * 0.999
    );
  }
  showNote('ⵜⵉⵣⵉⵔⵉ · Tiziri', fmtTime(LV.tEnd), tr('lvDoneT') + ' · ' + tr('lvRestart') + ' · ' + tr('lvNextFree'), 16);
  if (audio.ctx && S.sound) [4, 5, 6, 8].forEach((k, i) => setTimeout(() => bell(PENTA[k], 0.08), i * 130));
}
// builds the n progress diamonds of the level HUD
function buildPips(n) {
  const el = $('lvlP');
  if (el.children.length !== n) {
    el.textContent = '';
    for (let i = 0; i < n; i++) el.appendChild(document.createElement('i'));
  }
  el.classList.toggle('many', n > 8);
  LV.hudCp = -1;
}
// timer, progress diamonds and distance label of the level HUD
function updateLevelHud() {
  if (!JBEL.on && !TIZIRI.on) return;
  const tt = LV.done ? LV.tEnd : LV.t0 < 0 ? 0 : time - LV.t0,
    txt = fmtTime(tt);
  if (txt !== LV.hudT) {
    LV.hudT = txt;
    $('lvlT').textContent = txt;
  }
  const prog = JBEL.on ? LV.cp + 1 : LV.cp;
  if (LV.hudCp !== prog) {
    LV.hudCp = prog;
    const d = $('lvlP').children;
    for (let i = 0; i < d.length; i++) d[i].classList.toggle('on', i < prog);
  }
  $('lvlP').classList.toggle('done', LV.done);
  if (nav.on) {
    const d = Math.round(nav.dist) + ' ' + tr('unitM');
    if (d !== nav.lab) {
      nav.lab = d;
      $('navD').textContent = d;
    }
  }
}
// configures world, HUD and rendering for the current level (LV.id)
function applyLevelFlags() {
  const jb = LV.id === 'jbel',
    tz = LV.id === 'tiziri',
    lv = jb || tz;
  JBEL.on = jb;
  TIZIRI.on = tz;
  TERRAIN.amp = jb ? JBEL.amp : tz ? TIZIRI.amp : 1;
  TOD.k = TOD.goal = tz ? 1 : 0;
  applyTod();
  sharedUniforms.uAmp.value = TERRAIN.amp;
  sharedUniforms.uLvl.value = jb ? 1 : 0;
  if (jb) {
    if (!LV.orbsAll) buildLevelOrbs();
    LV.flag.x = jbelX(JBEL.spawnS + 16, 9);
    LV.flag.z = jbelZ(JBEL.spawnS + 16, 9);
    LV.flag.y = heightAt(LV.flag.x, LV.flag.z) - 0.05;
  }
  flagMesh.visible = jb;
  gateMesh.visible = tz;
  buildPips(tz ? GATE_COUNT : JBEL.NP);
  $('lvl').hidden = !lv;
  $('nav').hidden = !lv;
  nav.dirty = true;
  nav.a = 0;
  nav.init = false;
  $('app').classList.toggle('lvl-on', lv);
  document
    .querySelectorAll('.lvls button')
    .forEach((b) => b.setAttribute('aria-pressed', b.dataset.lv === LV.id ? 'true' : 'false'));
  applyLang(LANG);
}
// switches level and restarts it
function setLevel(id) {
  if (id === LV.id) return;
  LV.id = id;
  store('level', id);
  applyLevelFlags();
  resetPlayer(true);
}
/* N, once the level is finished: Jbel -> Tiziri -> free dunes */
function nextLevel() {
  if (LV.done) setLevel(LV.id === 'jbel' ? 'tiziri' : 'dunes');
}
