/**
 * sim.js: analytic terrain and carpet-gliding physics (no dependencies).
 *
 * The terrain is a closed-form height field evaluated on the CPU here and on the GPU in
 * shaders.js, so physics and rendering always agree. The module is exported for the Node test
 * scripts; in the browser all source files are concatenated into a single script.
 */
const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
// prevailing wind direction (degrees); the dune crests are oriented relative to it
const WIND_ANG = 28;
const WIND = { x: Math.cos(WIND_ANG * D2R), z: Math.sin(WIND_ANG * D2R) };

/*
 * Each dune component is a phase-modulated wave:
 *   theta    = K.p + p0 + wamp * sin(Q.p + p1)              meandering crests
 *   theta2   = theta + skew * sin(theta)                    steeper lee face
 *   profile  = sin(theta2)  or  0.64 - sqrt(sin^2 + sharp)  sharp crest, wide trough
 *   envelope = 1 - edep * (0.5 - 0.5 * sin(M.p + p2))       height varies from dune to dune
 */
function makeComp(o) {
  const a = o.ang * D2R,
    k = TAU / o.wl;
  const wa = (o.wang || 0) * D2R,
    wk = TAU / (o.wwl || 1000);
  const ea = (o.eang || 0) * D2R,
    ek = TAU / (o.ewl || 1000);
  return {
    kx: Math.cos(a) * k,
    kz: Math.sin(a) * k,
    amp: o.amp,
    skew: o.skew || 0,
    qx: Math.cos(wa) * wk,
    qz: Math.sin(wa) * wk,
    wamp: o.wamp || 0,
    lod: o.lod ? 1 : 0,
    mx: Math.cos(ea) * ek,
    mz: Math.sin(ea) * ek,
    edep: o.edep || 0,
    rw: o.rw || 0,
    sharp: o.sharp || 0.04,
    p0: o.p0 || 0,
    p1: o.p1 || 0,
    p2: o.p2 || 0
  };
}
// dune components, from large swells to fine ripples (`lod: 1` marks the detail that fades with distance)
// prettier-ignore
const COMPS = [
  { ang: WIND_ANG,      wl: 132, amp: 5.0, skew: 0.50, rw: 1, sharp: 0.035, wwl: 360, wamp: 2.6, wang: WIND_ANG + 90, ewl: 610, eang: WIND_ANG + 40, edep: 0.50, p0: 0.4, p1: 1.1, p2: 2.0 },
  { ang: WIND_ANG - 24, wl: 78,  amp: 2.2, skew: 0.40, rw: 1, sharp: 0.050, wwl: 210, wamp: 2.0, wang: WIND_ANG + 70, ewl: 340, eang: WIND_ANG + 110, edep: 0.55, p0: 2.2, p1: 0.3, p2: 4.0 },
  { ang: WIND_ANG + 78, wl: 310, amp: 7.0, skew: 0,    rw: 0, wwl: 760, wamp: 1.3, wang: 12,  p0: 1.3, p1: 2.0 },
  { ang: WIND_ANG - 58, wl: 197, amp: 3.6, skew: 0,    rw: 0, wwl: 520, wamp: 2.2, wang: 100, p0: 5.0, p1: 0.7 },
  { ang: WIND_ANG + 8,  wl: 27,  amp: 0.26, skew: 0.25, rw: 0.5, sharp: 0.06, wwl: 80, wamp: 1.8, wang: WIND_ANG + 80, ewl: 120, eang: 20, edep: 0.6, lod: 1, p0: 0.9, p1: 3.0, p2: 1.0 },
  { ang: WIND_ANG + 35, wl: 41,  amp: 0.50, skew: 0,    rw: 0, wwl: 130, wamp: 1.5, wang: 200, lod: 1, p0: 3.3, p1: 5.1 }
].map(makeComp);
const NCOMP = COMPS.length;
const TERRAIN = { amp: 1 }; // global dune scale (tunable)

/*
 * ===== Level 1: JBEL (deep canyon, red rock pillars, jumps that need boost) =====
 * The level is one more analytic height field: "rounded boxes" (pillars and cliffs) whose edge
 * drops into the void. The same formula runs here (physics) and in the shader (rendering).
 * Level frame: s along the axis, t across it.
 * Each pillar: [s0, s1, tc, half-width, height, launch ramp, corner radius, slope, undulation, phase].
 */
const JBEL = (() => {
  const ang = 160 * D2R,
    dx = Math.cos(ang),
    dz = Math.sin(ang);
  // prettier-ignore
  const M = [
    [-520,    0,   0, 170,  0.0, 3.0, 60,  0.000, 0, 0],      // 0: start cliff
    [ 130,  330,  16,  42, -6.0, 3.0, 26,  0.000, 0, 0],      // 1: A
    [ 480,  650, -20,  40, -1.5, 3.0, 25,  0.000, 0, 0],      // 2: B
    [ 850, 1030,  22,  38, -5.0, 3.0, 24,  0.000, 0, 0],      // 3: C
    [1170, 1410,   0,  72,  3.0, 3.5, 40, -0.025, 0, 0],      // 4: D, large mesa sloping downwards
    [1580, 1730, -16,  46, -8.0, 0.0, 28,  0.000, 0, 0],      // 5: E, last pillar (golden star)
    [-1200, 2800, 620, 360, 46.0, 0.0, 70, 0.000, 9, 1.3],    // canyon walls (right)
    [-1200, 2800, -620, 360, 44.0, 0.0, 70, 0.000, 9, 4.1]    // canyon walls (left)
  ];
  const NP = 6; // playable pillars (the rest are walls)
  return {
    on: false,
    dx,
    dz,
    nx: -dz,
    nz: dx,
    M,
    NP,
    NM: M.length,
    Wc: 6, // half-width of the cliff-edge smoothing band (m)
    rim: 5.1,
    foot: 5.5, // rendering: top edge (sd = -rim) and wall foot (sd = +foot), see jbSnap (shaders.js)
    L: 22, // length of the launch ramp (m)
    floor: -88, // canyon floor
    killY: -22, // below this height the player has fallen
    amp: 0.14, // dunes are only a slight relief on the rock
    spawnS: -300,
    respawnS: -230,
    finishS: 1655,
    finishT: -14,
    k1: 0.0113,
    k2: 0.0271,
    /* level orbs: [s, t, absolute altitude (null = on the ground), type 0 ground / 1 air / 2 finish] */
    // prettier-ignore
    orbs: [
      [-200, 10, null, 0], [-110, -8, null, 0],                   // run-up
      [95, 12, 18, 1],                                            // apex of jump 1 (air)
      [235, 10, null, 0], [292, 0, null, 0],                      // pillar A
      [424, -4, 14.5, 1],                                           // jump 2
      [560, -20, null, 0], [612, -8, null, 0],                    // pillar B
      [740, 4, 19, 1],                                            // jump 3, the longest
      [915, 20, null, 0], [985, 12, null, 0],                     // pillar C
      [1130, 8, 19, 1],                                           // jump 4
      [1250, 0, null, 0], [1310, -4, null, 0], [1370, -10, null, 0],   // mesa D
      [1510, -13, 19, 1],                                         // jump 5
      [1655, -14, null, 2]                                        // the golden star (finish)
    ]
  };
})();
const JBEL_A = new Float32Array(JBEL.NM * 4),
  JBEL_B = new Float32Array(JBEL.NM * 4),
  JBEL_C = new Float32Array(JBEL.NM * 4);
for (let i = 0; i < JBEL.NM; i++) {
  const m = JBEL.M[i];
  JBEL_A.set([m[0], m[1], m[2], m[3]], i * 4);
  JBEL_B.set([m[4], m[5], m[6], m[7]], i * 4);
  JBEL_C.set([m[8], m[9], 0, 0], i * 4);
}
// world (x, z) <-> level frame (s along the axis, t across it)
const jbelS = (x, z) => x * JBEL.dx + z * JBEL.dz;
const jbelT = (x, z) => x * JBEL.nx + z * JBEL.nz;
const jbelX = (s, t) => s * JBEL.dx + t * JBEL.nx;
const jbelZ = (s, t) => s * JBEL.dz + t * JBEL.nz;
/* signed distance to pillar i (negative inside) */
function jbelSd(i, s, t) {
  const m = JBEL.M,
    hl = 0.5 * (m[i][1] - m[i][0]),
    R = m[i][6];
  const qx = Math.abs(s - 0.5 * (m[i][0] + m[i][1])) - (hl - R),
    qy = Math.abs(t - m[i][2]) - (m[i][3] - R);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
}
/* adds the level's height and gradient (h, gx, gz) to `out`; the dunes are added separately */
function jbelAdd(x, z, out) {
  const s = jbelS(x, z),
    t = jbelT(x, z),
    Wc = JBEL.Wc,
    L = JBEL.L,
    M = JBEL.M;
  let h = JBEL.floor,
    hs = 0,
    ht = 0;
  for (let i = 0; i < JBEL.NM; i++) {
    const m = M[i],
      hl = 0.5 * (m[1] - m[0]),
      R = m[6];
    const qs = s - 0.5 * (m[0] + m[1]),
      qt = t - m[2];
    const ds = Math.abs(qs) - (hl - R),
      dt = Math.abs(qt) - (m[3] - R);
    const os = Math.max(ds, 0),
      ot = Math.max(dt, 0),
      len = Math.hypot(os, ot);
    const sd = len + Math.min(Math.max(ds, dt), 0) - R;
    if (sd >= Wc) continue;
    let gs, gt;
    if (len > 1e-5) {
      gs = (Math.sign(qs) * os) / len;
      gt = (Math.sign(qt) * ot) / len;
    } else if (ds > dt) {
      gs = Math.sign(qs);
      gt = 0;
    } else {
      gs = 0;
      gt = Math.sign(qt);
    }
    const u = Math.min(1, Math.max(0, (sd + Wc) / (2 * Wc)));
    const w = 1 - u * u * (3 - 2 * u),
      dwd = (-6 * u * (1 - u)) / (2 * Wc);
    let T = m[4] + m[7] * (s - m[0]),
      dT = m[7];
    if (m[8] > 0) {
      const a1 = s * JBEL.k1 + m[9],
        a2 = s * JBEL.k2 + m[9] * 2.3;
      T += m[8] * (0.6 * Math.sin(a1) + 0.4 * Math.sin(a2));
      dT += m[8] * (0.6 * JBEL.k1 * Math.cos(a1) + 0.4 * JBEL.k2 * Math.cos(a2));
    }
    const us = Math.min(1, Math.max(0, (s - (m[1] - Wc - L)) / L));
    if (m[5] !== 0) {
      T += m[5] * us * us * (3 - 2 * us);
      dT += (m[5] * 6 * us * (1 - us)) / L;
    }
    const amp = T - JBEL.floor,
      H = JBEL.floor + amp * w;
    if (H > h) {
      h = H;
      hs = dT * w + amp * dwd * gs;
      ht = amp * dwd * gt;
    }
  }
  out.h += h;
  out.gx += hs * JBEL.dx + ht * JBEL.nx;
  out.gz += hs * JBEL.dz + ht * JBEL.nz;
}

/*
 * ===== Level 2: TIZIRI ("moonlight"): a night sea of dunes and a chain of light gates =====
 * No special ground: these are the regular dunes, only taller (amp). The course is a series of
 * lozenge-shaped gates placed along the natural trajectory (found with an autopilot): skimming the
 * sand, mid-air at the top of a take-off, and the last one, golden, on a crest.
 * Each gate: [x, centre y, z, direction x, direction z, radius (half-height), type 0 ground / 1 air / 2 finish].
 */
const TIZIRI = {
  on: false,
  amp: 1.7,
  GW: 0.8, // GW: lozenge half-width relative to its radius
  start: { x: 64.56, z: -13.72, h: 1.5794 },
  // prettier-ignore
  gates: [
    [249.4, -15.8, -28.1, 0.9987, -0.0505, 9.5, 0],
    [479.2, -8.3, -12.5, 0.9732, 0.2299, 10.5, 1],
    [646.4, -3.8, 16.8, 0.9753, 0.2208, 9.5, 0],
    [816.8, -3.5, 72.6, 0.9343, 0.3566, 9.5, 0],
    [930.0, -9.0, 120.5, 0.9282, 0.3720, 10.5, 1],
    [1174.9, -13.4, 223.5, 0.9455, 0.3255, 10.5, 1],
    [1355.6, 13.9, 286.9, 0.9576, 0.2881, 9.5, 0],
    [1554.1, 10.5, 378.2, 0.8879, 0.4600, 9.5, 0],
    [1769.6, 14.7, 532.2, 0.6872, 0.7265, 10.5, 1],
    [1829.6, 12.1, 620.5, 0.4447, 0.8957, 9.5, 0],
    [1919.7, 10.1, 798.3, 0.4234, 0.9059, 9.5, 0],
    [1964.4, 17.7, 903.8, 0.3642, 0.9313, 17.0, 2]
  ]
};
/* does the player's segment (a -> b) cross gate g, in the direction of travel, inside the lozenge (15 % margin)? */
function segmentCrossesGate(g, ax, ay, az, bx, by, bz) {
  const d0 = (ax - g[0]) * g[3] + (az - g[2]) * g[4],
    d1 = (bx - g[0]) * g[3] + (bz - g[2]) * g[4];
  if (!(d0 <= 0 && d1 > 0)) return false;
  const k = -d0 / (d1 - d0),
    qx = ax + (bx - ax) * k,
    qz = az + (bz - az) * k,
    qy = ay + (by - ay) * k;
  const u = (qx - g[0]) * -g[4] + (qz - g[2]) * g[3],
    v = qy - g[1];
  return Math.abs(u) / (TIZIRI.GW * g[5]) + Math.abs(v) / g[5] < 1.15;
}

/* height h (m) and gradient (gx, gz) written to `out`. lod = 1 keeps all the detail (physics and near field) */
function terrain(x, z, out, lod) {
  if (lod === undefined) lod = 1;
  let h = 0,
    gx = 0,
    gz = 0;
  for (let i = 0; i < NCOMP; i++) {
    const c = COMPS[i];
    const amp = c.amp * (c.lod ? lod : 1);
    if (amp < 1e-4) continue;
    const qa = c.qx * x + c.qz * z + c.p1;
    const wq = c.wamp * Math.cos(qa);
    const th = c.kx * x + c.kz * z + c.p0 + c.wamp * Math.sin(qa);
    const dthx = c.kx + wq * c.qx,
      dthz = c.kz + wq * c.qz;
    const th2 = th + c.skew * Math.sin(th);
    const dth2 = 1 + c.skew * Math.cos(th);
    const sn = Math.sin(th2),
      cs = Math.cos(th2);
    const r = Math.sqrt(sn * sn + c.sharp);
    const f = (1 - c.rw) * sn + c.rw * (0.64 - r);
    const df = (1 - c.rw) * cs + c.rw * ((-sn * cs) / r);
    const ea = c.mx * x + c.mz * z + c.p2;
    const E = 1 - c.edep * 0.5 * (1 - Math.sin(ea));
    const dE = c.edep * 0.5 * Math.cos(ea);
    h += amp * E * f;
    gx += amp * (E * df * dth2 * dthx + f * dE * c.mx);
    gz += amp * (E * df * dth2 * dthz + f * dE * c.mz);
  }
  out.h = h * TERRAIN.amp;
  out.gx = gx * TERRAIN.amp;
  out.gz = gz * TERRAIN.amp;
  if (JBEL.on) jbelAdd(x, z, out);
  return out;
}
/** Terrain height (m) at (x, z), full detail. */
function heightAt(x, z) {
  return terrain(x, z, _t0).h;
}
// scratch outputs reused across calls to avoid allocations
const _t0 = { h: 0, gx: 0, gz: 0 },
  _t1 = { h: 0, gx: 0, gz: 0 };

/*
 * Phases sent to the GPU: the shader works in local coordinates (around the player) and receives
 * (K.c + p0) mod 2pi computed here in double precision, so there is no precision loss even very far away.
 */
function terrainPhases(cx, cz, outArr) {
  for (let i = 0; i < NCOMP; i++) {
    const c = COMPS[i];
    outArr[i * 4 + 0] = mod2pi(c.kx * cx + c.kz * cz + c.p0);
    outArr[i * 4 + 1] = mod2pi(c.qx * cx + c.qz * cz + c.p1);
    outArr[i * 4 + 2] = mod2pi(c.mx * cx + c.mz * cz + c.p2);
    outArr[i * 4 + 3] = c.sharp;
  }
}
function mod2pi(v) {
  v = v % TAU;
  return v < 0 ? v + TAU : v;
}

/* ---------------- Physics ---------------- */
const PHYS = {
  G: 11.0, // gravity (m/s²)
  mu: 0.03, // sliding friction
  drag: 0.0008, // air drag (quadratic)
  grip: 4.2, // lateral grip (carpet edge)
  push: 14.0, // pushing thrust (m/s²)
  pushMax: 28.0, // speed above which pushing fades out
  turn: 3.0, // turn rate (rad/s)
  turnSpd: 0.03, // turning gets stiffer with speed
  jumpMin: 6.5, // tapped jump (m/s)
  jumpMax: 13.5, // fully charged jump (m/s)
  chargeTime: 0.55, // full charge duration (s)
  maxSpeed: 70, // soft speed cap without boost (m/s)
  boostSpeedK: 1.4, // boost raises the cap by 40 %
  boostAccel: 26, // boost thrust (m/s²)
  boostDrain: 0.24, // energy drained per second (1 = full gauge)
  boostRegen: 0.07, // energy regained per second...
  boostDelay: 1.4, // ...after this delay without boosting (s)
  boostMin: 0.12, // minimum energy to restart after depletion
  /* mid-air control with boost: the thrust is steerable, the trajectory follows the heading, C dives */
  boostAirSteer: 0.4, // mid-air turn factor with boost (0.55 without): slower, but the trajectory follows the heading, so it is precise
  boostAirAlign: 2.6, // how fast the trajectory realigns with the heading (1/s)
  boostAirTurn: 0.9, // maximum trajectory turn rate (rad/s)
  boostDive: 9.0, // C while airborne: dive (m/s²)
  stick: 14, // ground suction: smooths small bumps, lets crests launch (m/s²)
  stickH: 0.4 // height below which the suction applies (m)
};

/** Creates a fresh player state (position, velocity, smoothed inputs, jump and boost state). */
function newPlayer() {
  return {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    h: 0,
    grounded: true,
    coyote: 0.1,
    airTime: 0,
    tuck: 0,
    steer: 0,
    nx: 0,
    ny: 1,
    nz: 0,
    speed: 0,
    vf: 0,
    slip: 0,
    landImpact: 0,
    jumped: false,
    _jumpHeld: false,
    charge: 0,
    noStick: 0,
    jumpPower: 0,
    energy: 1,
    boosting: false,
    boostK: 0,
    boostLock: false,
    sinceBoost: 9,
    apex: 0,
    lastAir: 0,
    lastApex: 0,
    landEvt: false
  };
}

/** Wraps an angle to [-PI, PI). */
function wrapPI(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Places the player on a nearby crest (optionally facing downhill towards prefX, prefZ) and resets the dynamic state. */
function placeOnCrest(s, cx, cz, prefX, prefZ) {
  // scan rings around (cx, cz): prefer high points with a moderate slope, descent facing (prefX, prefZ) if given
  let best = -1e9,
    bx = cx,
    bz = cz;
  for (let r = 0; r <= 120; r += 4) {
    for (let a = 0; a < TAU; a += Math.PI / 18) {
      const px = cx + Math.cos(a) * r,
        pz = cz + Math.sin(a) * r;
      terrain(px, pz, _t0);
      const g = Math.hypot(_t0.gx, _t0.gz);
      let score = _t0.h - r * 0.03;
      if (g < 0.14 || g > 0.5) score -= 6;
      if (prefX !== undefined) score += 9 * ((-_t0.gx * prefX - _t0.gz * prefZ) / (g || 1));
      if (score > best) {
        best = score;
        bx = px;
        bz = pz;
      }
    }
  }
  terrain(bx, bz, _t0);
  s.x = bx;
  s.z = bz;
  s.y = _t0.h + 0.001;
  s.vx = s.vy = s.vz = 0;
  s.h = Math.atan2(-_t0.gx, -_t0.gz);
  s.grounded = true;
  s.coyote = 0.1;
  s.airTime = 0;
  s.tuck = 0;
  s.steer = 0;
  s.charge = 0;
  s.noStick = 0;
  s.boosting = false;
  s.boostK = 0;
  s.boostLock = false;
  s.sinceBoost = 9;
  s.apex = 0;
  s.landEvt = false;
  {
    const l = Math.hypot(_t0.gx, 1, _t0.gz);
    s.nx = -_t0.gx / l;
    s.ny = 1 / l;
    s.nz = -_t0.gz / l;
  }
  return s;
}

/**
 * Places the player at (x, z) with heading h (0 = +z), already moving at `speed` m/s along the heading.
 * Used for level starts and for respawns after a fall.
 */
function placeAt(s, x, z, h, speed) {
  terrain(x, z, _t0);
  s.x = x;
  s.z = z;
  s.y = _t0.h + 0.001;
  s.h = h;
  s.vx = Math.sin(h) * speed;
  s.vy = 0;
  s.vz = Math.cos(h) * speed;
  s.grounded = true;
  s.coyote = 0.1;
  s.airTime = 0;
  s.tuck = 0;
  s.steer = 0;
  s.charge = 0;
  s.noStick = 0;
  s.boosting = false;
  s.boostK = 0;
  s.boostLock = false;
  s.sinceBoost = 9;
  s.apex = 0;
  s.landEvt = false;
  s.landImpact = 0;
  s.jumped = false;
  s._jumpHeld = false;
  s.slip = 0;
  s.speed = speed;
  {
    const l = Math.hypot(_t0.gx, 1, _t0.gz);
    s.nx = -_t0.gx / l;
    s.ny = 1 / l;
    s.nz = -_t0.gz / l;
  }
  return s;
}

/**
 * Advances the player by `dt` seconds (called at a fixed 120 Hz).
 * `inp` = { steer: -1..1, push: 0..1, tuck, brake, jump, boost }
 */
function stepPlayer(s, inp, dt) {
  const G = PHYS.G;
  terrain(s.x, s.z, _t1);
  let nx = -_t1.gx,
    ny = 1,
    nz = -_t1.gz;
  const nl = Math.hypot(nx, ny, nz);
  nx /= nl;
  ny /= nl;
  nz /= nl;
  const height = s.y - _t1.h;
  const touching = height < 0.05;
  s.coyote = touching ? 0.1 : Math.max(0, s.coyote - dt);
  const ctl = s.coyote > 0;
  s.noStick = Math.max(0, s.noStick - dt);

  /* smoothed inputs */
  s.steer += (inp.steer - s.steer) * (1 - Math.exp(-10 * dt));
  s.tuck += ((inp.tuck ? 1 : 0) - s.tuck) * (1 - Math.exp(-7 * dt));
  const brake = inp.brake ? 1 : 0;

  /* boost: drains energy, recharges over time, locks out when depleted */
  if (s.boostLock && s.energy >= PHYS.boostMin) s.boostLock = false;
  const boostOn = !!inp.boost && s.energy > 0 && !s.boostLock;
  if (boostOn) {
    s.energy = Math.max(0, s.energy - PHYS.boostDrain * dt);
    s.sinceBoost = 0;
    if (s.energy <= 0) s.boostLock = true;
  } else {
    s.sinceBoost += dt;
    if (s.sinceBoost > PHYS.boostDelay) s.energy = Math.min(1, s.energy + PHYS.boostRegen * dt);
  }
  s.boosting = boostOn;
  s.boostK += ((boostOn ? 1 : 0) - s.boostK) * (1 - Math.exp(-9 * dt));

  /* heading */
  const sp0 = Math.hypot(s.vx, s.vy, s.vz);
  const hs0 = Math.hypot(s.vx, s.vz);
  const turnRate = PHYS.turn / (1 + PHYS.turnSpd * sp0);
  s.h -= s.steer * turnRate * (ctl ? 1 : 0.55 + (PHYS.boostAirSteer - 0.55) * s.boostK) * dt;
  if (ctl && hs0 > 3 && Math.abs(s.steer) < 0.15) {
    const diff = wrapPI(Math.atan2(s.vx, s.vz) - s.h);
    if (Math.abs(diff) < 1.9) s.h += diff * (1 - Math.exp(-1.3 * dt));
  }
  const fx = Math.sin(s.h),
    fz = Math.cos(s.h);

  /* drag + gravity */
  const cd = PHYS.drag * (1 - 0.5 * s.tuck);
  const dk = Math.max(0, 1 - cd * sp0 * dt);
  s.vx *= dk;
  s.vy *= dk;
  s.vz *= dk;
  s.vy -= G * dt;

  /* charged jump: hold to charge, release to take off */
  let doJump = false;
  if (inp.jump && ctl) s.charge = Math.min(1, s.charge + dt / PHYS.chargeTime);
  else if (!inp.jump && s._jumpHeld && s.charge > 0 && ctl) doJump = true;
  else if (!ctl || !inp.jump) s.charge = 0;
  const jumpV = PHYS.jumpMin + (PHYS.jumpMax - PHYS.jumpMin) * s.charge;

  /* contact forces (on the sand) */
  s.slip = 0;
  s.vf = 0;
  if (touching) {
    let vn = s.vx * nx + s.vy * ny + s.vz * nz;
    /* suction: the carpet "sticks" to the sand over small bumps but lets go on real crests */
    if (s.noStick <= 0 && vn > 0) vn = Math.max(0, vn - PHYS.stick * dt);
    const vnx = nx * vn,
      vny = ny * vn,
      vnz = nz * vn;
    let tx = s.vx - nx * (s.vx * nx + s.vy * ny + s.vz * nz),
      ty = s.vy - ny * (s.vx * nx + s.vy * ny + s.vz * nz),
      tz = s.vz - nz * (s.vx * nx + s.vy * ny + s.vz * nz);
    /* friction */
    const mu = PHYS.mu * (1 - 0.4 * s.tuck) + brake * 0.42;
    const vtl = Math.hypot(tx, ty, tz);
    if (vtl > 1e-5) {
      const k = Math.max(0, 1 - (mu * G * ny * dt) / vtl);
      tx *= k;
      ty *= k;
      tz *= k;
    }
    /* local frame: forward / right in the tangent plane */
    let ax = fx - nx * (fx * nx + fz * nz),
      ay = -ny * (fx * nx + fz * nz),
      az = fz - nz * (fx * nx + fz * nz);
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al;
    ay /= al;
    az /= al;
    const rx = ay * nz - az * ny,
      ry = az * nx - ax * nz,
      rz = ax * ny - ay * nx; // cross(f, n) = right
    let vf = tx * ax + ty * ay + tz * az;
    let vs = tx * rx + ty * ry + tz * rz;
    /* grip: part of the removed lateral energy is given back to forward speed (carved turn) */
    const grip = PHYS.grip * (1 - 0.3 * s.tuck) + brake * 5.0;
    const kk = 1 - Math.exp(-grip * dt);
    const vs2 = vs * (1 - kk);
    const dEs = vs * vs - vs2 * vs2;
    const vf2 = Math.sqrt(Math.max(0, vf * vf + 0.45 * dEs)) * (vf < 0 ? -1 : 1);
    vf = vf2;
    vs = vs2;
    /* push */
    if (inp.push > 0 && s.tuck < 0.5) {
      const pf = Math.min(1, Math.max(0, 1 - vf / PHYS.pushMax));
      vf += PHYS.push * pf * inp.push * dt;
    }
    /* boost: strong thrust, never limited by pushMax (the soft cap bounds it instead) */
    if (s.boostK > 0.01) vf += PHYS.boostAccel * s.boostK * dt;
    s.vf = vf;
    s.slip = Math.abs(vs);
    s.vx = ax * vf + rx * vs + vnx;
    s.vy = ay * vf + ry * vs + vny;
    s.vz = az * vf + rz * vs + vnz;
    if (doJump) {
      s.vx += nx * jumpV;
      s.vy += ny * jumpV;
      s.vz += nz * jumpV;
      s.coyote = 0;
      s.jumped = true;
      s.jumpPower = jumpV;
      s.charge = 0;
      s.noStick = 0.4;
    }
  } else {
    if (doJump) {
      // "coyote" jump just after leaving the crest
      s.vy += jumpV;
      s.coyote = 0;
      s.jumped = true;
      s.jumpPower = jumpV;
      s.charge = 0;
      s.noStick = 0.4;
    } else if (height < PHYS.stickH && s.noStick <= 0) {
      const vn = s.vx * nx + s.vy * ny + s.vz * nz; // small hop: the carpet is pulled back towards the sand
      if (vn > 0) {
        const d = Math.min(vn, PHYS.stick * dt);
        s.vx -= nx * d;
        s.vy -= ny * d;
        s.vz -= nz * d;
      }
    }
    if (s.boostK > 0.01) {
      const a = PHYS.boostAccel * 0.35 * s.boostK * dt;
      s.vx += fx * a;
      s.vz += fz * a;
      /* the thrust is steerable: the trajectory turns towards the heading without losing speed */
      const hv = Math.hypot(s.vx, s.vz);
      if (hv > 4) {
        const lim = PHYS.boostAirTurn * s.boostK * dt;
        const r = Math.max(
          -lim,
          Math.min(lim, wrapPI(s.h - Math.atan2(s.vx, s.vz)) * (1 - Math.exp(-PHYS.boostAirAlign * s.boostK * dt)))
        );
        const c = Math.cos(r),
          sn = Math.sin(r),
          vx = s.vx,
          vz = s.vz;
        s.vx = vx * c + vz * sn;
        s.vz = vz * c - vx * sn;
      }
      /* C: dive (the descent gets shorter, speed goes up) */
      s.vy -= PHYS.boostDive * s.tuck * s.boostK * dt;
    }
  }
  s._jumpHeld = !!inp.jump;

  /* soft speed cap (boost raises it); hard limit for safety */
  const cap = PHYS.maxSpeed * (1 + (PHYS.boostSpeedK - 1) * s.boostK);
  const sp = Math.hypot(s.vx, s.vy, s.vz);
  if (sp > cap) {
    const k = 1 - ((sp - cap) / sp) * (1 - Math.exp(-2.5 * dt));
    s.vx *= k;
    s.vy *= k;
    s.vz *= k;
  }
  const hard = PHYS.maxSpeed * PHYS.boostSpeedK * 1.2;
  if (sp > hard) {
    const k = hard / sp;
    s.vx *= k;
    s.vy *= k;
    s.vz *= k;
  }

  /* integration */
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;

  /* collision with the sand */
  terrain(s.x, s.z, _t1);
  let mx = -_t1.gx,
    my = 1,
    mz = -_t1.gz;
  const ml = Math.hypot(mx, my, mz);
  mx /= ml;
  my /= ml;
  mz /= ml;
  let contact = false;
  if (s.y <= _t1.h) {
    const vn = s.vx * mx + s.vy * my + s.vz * mz;
    if (vn < 0) {
      s.vx -= mx * vn;
      s.vy -= my * vn;
      s.vz -= mz * vn;
      const imp = -vn;
      if (!s.grounded && imp > 2.5) s.landImpact = Math.max(s.landImpact, imp);
      if (imp > 3) {
        const k = Math.max(0.75, 1 - 0.012 * imp);
        s.vx *= k;
        s.vy *= k;
        s.vz *= k;
      }
    }
    s.y = _t1.h;
    contact = true;
  } else if (s.y - _t1.h < 0.02) contact = true;
  if (!contact) s.apex = Math.max(s.apex, s.y - _t1.h);
  if (contact && !s.grounded) {
    s.lastAir = s.airTime;
    s.lastApex = s.apex;
    s.apex = 0;
    s.landEvt = true;
  }
  s.nx = mx;
  s.ny = my;
  s.nz = mz;
  s.grounded = contact;
  s.airTime = contact ? 0 : s.airTime + dt;
  s.speed = Math.hypot(s.vx, s.vy, s.vz);
}

// Node export for the tests; in the browser all source files share one script scope
if (typeof module !== 'undefined') {
  module.exports = {
    terrain,
    heightAt,
    COMPS,
    PHYS,
    TERRAIN,
    newPlayer,
    placeOnCrest,
    placeAt,
    stepPlayer,
    terrainPhases,
    TAU,
    WIND,
    wrapPI,
    JBEL,
    jbelSd,
    jbelS,
    jbelT,
    jbelX,
    jbelZ,
    TIZIRI,
    segmentCrossesGate
  };
}
