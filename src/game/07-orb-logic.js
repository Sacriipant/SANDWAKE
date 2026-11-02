/**
 * 07-orb-logic.js: Orb logic.
 *
 * Orb placement around the player and pickup handling.
 *
 * Part of the game closure; see 01-runtime.js.
 */

// free ride: rebuilds the list of orbs around the player from the cell hash
function scanOrbs(now) {
  const ci = Math.floor(P.x / ORB.cell),
    cj = Math.floor(P.z / ORB.cell),
    R = Math.ceil(ORB.view / ORB.cell),
    v2 = ORB.view * ORB.view;
  const out = [];
  for (let i = ci - R; i <= ci + R; i++)
    for (let j = cj - R; j <= cj + R; j++) {
      if (cellHash(i, j, 1) > ORB.density) continue;
      const key = i + ',' + j,
        t0 = orbs.taken.get(key);
      if (t0 !== undefined && now - t0 < ORB.respawn) continue;
      const x = (i + 0.15 + 0.7 * cellHash(i, j, 2)) * ORB.cell,
        z = (j + 0.15 + 0.7 * cellHash(i, j, 3)) * ORB.cell;
      const d2 = (x - P.x) * (x - P.x) + (z - P.z) * (z - P.z);
      if (d2 > v2) continue;
      const air = cellHash(i, j, 4) < 0.22,
        g = heightAt(x, z);
      out.push({ key, x, z, g, y: g + (air ? 4.2 + 4.2 * cellHash(i, j, 5) : 1.15), air, ph: cellHash(i, j, 6), d2 });
    }
  out.sort((a, b) => a.d2 - b.d2);
  orbs.list = out.length > MAX_ORBS ? out.slice(0, MAX_ORBS) : out;
  orbs.ci = ci;
  orbs.cj = cj;
  orbs.scanT = 0.5;
  orbs.dirty = true;
  orbs.dirtyScan = false;
  for (const [k, t0] of orbs.taken) if (now - t0 > ORB.respawn + 5) orbs.taken.delete(k);
}
/* level: the orbs are fixed (data from sim.js); type 0 on the ground, 1 in the air, 2 the golden finish star */
function buildLevelOrbs() {
  LV.orbsAll = JBEL.orbs.map((d, i) => {
    const x = jbelX(d[0], d[1]),
      z = jbelZ(d[0], d[1]),
      g = heightAt(x, z),
      kind = d[3];
    const air = kind === 1,
      fin = kind === 2;
    return {
      key: 'L' + i,
      x,
      z,
      g: air ? d[2] - 14 : g,
      y: air ? d[2] : g + (fin ? 2.6 : 1.15),
      air,
      fin,
      r: fin ? 9.5 : air ? 7.5 : 5,
      ph: cellHash(i, 7, 6),
      d2: 0
    };
  });
}
// level mode: every orb that has not been collected yet
function scanLevelOrbs() {
  orbs.list = LV.orbsAll.filter((o) => !orbs.taken.has(o.key));
  orbs.scanT = 0.5;
  orbs.dirty = true;
  orbs.dirtyScan = false;
}
// copies the orbs and their light columns to the GPU buffers
function uploadOrbs() {
  const n = orbs.list.length;
  for (let i = 0; i < n; i++) {
    const o = orbs.list[i],
      ox = o.x - ORG.x,
      oz = o.z - ORG.z,
      ty = o.fin ? 2 : o.air ? 1 : 0;
    orbPos[3 * i] = ox;
    orbPos[3 * i + 1] = o.y;
    orbPos[3 * i + 2] = oz;
    orbType[i] = ty;
    orbPh[i] = o.ph;
    const H = o.fin ? 150 : o.air ? o.y - o.g + 5 : 13;
    for (let k = 0; k < 4; k++) {
      const q = 4 * i + k;
      plPos[3 * q] = ox;
      plPos[3 * q + 1] = o.g - 0.4;
      plPos[3 * q + 2] = oz;
      plType[q] = ty;
      plH[q] = H;
    }
  }
  orbGeo.setDrawRange(0, n);
  plGeo.setDrawRange(0, n * 6);
  const a = orbGeo.attributes,
    b = plGeo.attributes;
  a.position.needsUpdate = a.aType.needsUpdate = a.aPh.needsUpdate = true;
  b.position.needsUpdate = b.aType.needsUpdate = b.aH.needsUpdate = true;
  orbs.dirty = false;
}
// refreshes the orb list and handles pickups
function updateOrbs(dt) {
  if (TIZIRI.on) {
    if (orbs.list.length) {
      orbs.list.length = 0;
      orbs.dirty = true;
    }
    if (orbs.dirty) uploadOrbs();
    return;
  }
  orbs.scanT -= dt;
  const lvl = JBEL.on;
  if (!S.started) {
    if (orbs.dirtyScan || orbs.scanT <= 0) {
      if (lvl) scanLevelOrbs();
      else scanOrbs(time);
    }
    if (orbs.dirty) uploadOrbs();
    return;
  }
  if (lvl) {
    if (orbs.dirtyScan || orbs.scanT <= 0) scanLevelOrbs();
  } else if (
    orbs.dirtyScan ||
    orbs.scanT <= 0 ||
    Math.floor(P.x / ORB.cell) !== orbs.ci ||
    Math.floor(P.z / ORB.cell) !== orbs.cj
  )
    scanOrbs(time);
  /* pickup: the segment travelled since the previous frame is tested (no orb is skipped at high speed) */
  const cx = P.x,
    cy = P.y + 0.9,
    cz = P.z;
  if (isFinite(orbs.px)) {
    const dx = cx - orbs.px,
      dy = cy - orbs.py,
      dz = cz - orbs.pz,
      dl = dx * dx + dy * dy + dz * dz;
    for (let i = orbs.list.length - 1; i >= 0; i--) {
      const o = orbs.list[i],
        r = o.r || (o.air ? ORB.rAir : ORB.rGround);
      if (P.energy >= 0.995 && !o.fin) continue;
      const t = dl > 1e-9 ? clamp(((o.x - orbs.px) * dx + (o.y - orbs.py) * dy + (o.z - orbs.pz) * dz) / dl, 0, 1) : 0;
      const qx = orbs.px + dx * t - o.x,
        qy = orbs.py + dy * t - o.y,
        qz = orbs.pz + dz * t - o.z;
      if (qx * qx + qy * qy + qz * qz < r * r) collectOrb(o, i);
    }
  }
  orbs.px = cx;
  orbs.py = cy;
  orbs.pz = cz;
  if (orbs.dirty) uploadOrbs();
}
// pickup effects: energy, particles, bell; the golden star finishes the level
function collectOrb(o, idx) {
  if (o.fin) {
    orbs.taken.set(o.key, time);
    orbs.list.splice(idx, 1);
    orbs.dirty = true;
    finishLevel(o);
    return;
  }
  const before = P.energy,
    add = o.air ? ORB.gainAir : ORB.gain;
  P.energy = Math.min(1, P.energy + add);
  orbs.taken.set(o.key, time);
  orbs.list.splice(idx, 1);
  orbs.dirty = true;
  gainPop(P.energy - before);
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * TAU;
    emitGlyph(
      o.x,
      o.y + 0.2,
      o.z,
      Math.cos(a) * 1.6 + P.vx * 0.3,
      1.0 + Math.random() * 1.4,
      Math.sin(a) * 1.6 + P.vz * 0.3,
      0.4 + Math.random() * 0.2,
      1.1 + Math.random() * 0.5,
      i < 3 ? 1 : (Math.random() * GLYPHS.length) | 0
    );
  }
  for (let i = 0; i < 28; i++) {
    const a = Math.random() * TAU,
      s = 1.5 + Math.random() * 4.5,
      up = Math.random() * 3.2 - 0.4;
    emit(
      o.x,
      o.y,
      o.z,
      Math.cos(a) * s + P.vx * 0.5,
      up,
      Math.sin(a) * s + P.vz * 0.5,
      0.32 + Math.random() * 0.4,
      0.8 + Math.random() * 0.8,
      0.95,
      2 + Math.random() * 0.999
    );
  }
  if (audio.ctx && S.sound) {
    bell(PENTA[4], 0.07);
    setTimeout(() => bell(PENTA[6], 0.06), 70);
    setTimeout(() => bell(PENTA[8], 0.05), 140);
  }
}
