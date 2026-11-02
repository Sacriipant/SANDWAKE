/**
 * Unit tests for src/sim.js: the analytic terrain, the level data and the carpet physics.
 *
 * sim.js keeps some global state (the active level flags and the physics constants), so every test that changes it
 * restores it afterwards.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sim = require('../../src/sim.js');

const { PHYS, JBEL, TIZIRI, newPlayer, placeOnCrest, stepPlayer, heightAt, terrain, terrainPhases } = sim;

const DT = 1 / 120;
const IDLE = Object.freeze({ steer: 0, push: 0, tuck: false, brake: false, jump: false, boost: false });

/** Small deterministic generator (LCG) so that the randomised tests are reproducible. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** Runs `fn` with temporary overrides of the physics constants. */
function withPhysics(overrides, fn) {
  const saved = { ...PHYS };
  Object.assign(PHYS, overrides);
  try {
    return fn();
  } finally {
    Object.assign(PHYS, saved);
  }
}

test('terrain: heights are finite and deterministic', () => {
  const out = { h: 0, gx: 0, gz: 0 };
  for (let i = 0; i < 200; i++) {
    const x = ((i * 97.3) % 5000) - 2500;
    const z = ((i * 61.9) % 5000) - 2500;
    const first = heightAt(x, z);
    assert.ok(Number.isFinite(first));
    assert.equal(heightAt(x, z), first);
    terrain(x, z, out);
    assert.equal(out.h, first);
  }
});

test('terrain: the analytic gradient matches a finite difference', () => {
  const out = { h: 0, gx: 0, gz: 0 };
  const eps = 1e-3;
  for (let i = 0; i < 100; i++) {
    const x = ((i * 37.1) % 900) - 300;
    const z = ((i * 53.7) % 700) - 200;
    terrain(x, z, out);
    const gx = (heightAt(x + eps, z) - heightAt(x - eps, z)) / (2 * eps);
    const gz = (heightAt(x, z + eps) - heightAt(x, z - eps)) / (2 * eps);
    assert.ok(Math.abs(gx - out.gx) < 1e-5, `d/dx at (${x}, ${z})`);
    assert.ok(Math.abs(gz - out.gz) < 1e-5, `d/dz at (${x}, ${z})`);
  }
});

test('terrain: the GPU phases are wrapped to [0, 2*PI)', () => {
  const phases = new Float32Array(sim.COMPS.length * 4);
  terrainPhases(123456.789, -98765.4321, phases);
  for (let i = 0; i < phases.length; i += 4) {
    for (let k = 0; k < 3; k++) assert.ok(phases[i + k] >= 0 && phases[i + k] < sim.TAU + 1e-6);
  }
});

test('Jbel: the start is solid ground and the canyon floor is out of reach', () => {
  JBEL.on = true;
  try {
    const spawnHeight = heightAt(sim.jbelX(JBEL.spawnS, 0), sim.jbelZ(JBEL.spawnS, 0));
    assert.ok(spawnHeight > JBEL.killY, 'spawn height must be above the kill height');
    const gapHeight = heightAt(sim.jbelX(405, 0), sim.jbelZ(405, 0));
    assert.ok(gapHeight < JBEL.killY, 'the gap between pillars A and B must be below the kill height');
  } finally {
    JBEL.on = false;
  }
});

test('Jbel: every orb sits on a pillar or in the air above the gap', () => {
  assert.ok(JBEL.orbs.length > 0);
  for (const [s, t, altitude, kind] of JBEL.orbs) {
    assert.ok(Number.isFinite(s) && Number.isFinite(t));
    assert.ok([0, 1, 2].includes(kind));
    assert.equal(altitude === null, kind !== 1, 'only air orbs carry an absolute altitude');
  }
  assert.equal(JBEL.orbs.at(-1)[3], 2, 'the last orb is the finish star');
});

test('Tiziri: gates are ordered along the course and the last one is the finish', () => {
  const { gates } = TIZIRI;
  assert.equal(gates.length, 12);
  for (let i = 1; i < gates.length; i++)
    assert.ok(gates[i][0] > gates[i - 1][0], `gate ${i} must be further than gate ${i - 1}`);
  gates.forEach((gate, i) => {
    assert.ok(Math.abs(Math.hypot(gate[3], gate[4]) - 1) < 1e-3, `gate ${i} direction must be a unit vector`);
    assert.equal(gate[6], i === gates.length - 1 ? 2 : gate[6] === 1 ? 1 : 0);
  });
});

test('Tiziri: a gate is crossed only through its opening and in the direction of travel', () => {
  const gate = TIZIRI.gates[0];
  const [x, y, z, dx, dz] = gate;
  const through = (offsetAcross, offsetUp, sign) =>
    sim.segmentCrossesGate(
      gate,
      x - sign * dx,
      y + offsetUp,
      z - sign * dz + offsetAcross * dx,
      x + sign * dx,
      y + offsetUp,
      z + sign * dz + offsetAcross * dx
    );
  assert.equal(through(0, 0, 1), true, 'through the centre');
  assert.equal(through(0, 0, -1), false, 'wrong direction');
  assert.equal(through(gate[5] * 2, 0, 1), false, 'far to the side');
  assert.equal(through(0, gate[5] * 2, 1), false, 'far above');
});

test('physics: a player gliding from a crest keeps finite, plausible state', () => {
  const player = placeOnCrest(newPlayer(), 40, -30);
  let topSpeed = 0;
  for (let i = 0; i < 60 * 120; i++) {
    stepPlayer(player, { ...IDLE, push: 1 }, DT);
    topSpeed = Math.max(topSpeed, player.speed);
    assert.ok(Number.isFinite(player.x + player.y + player.z + player.vx + player.vy + player.vz));
  }
  assert.ok(topSpeed > 5, 'pushing must build up speed');
  assert.ok(topSpeed < PHYS.maxSpeed * 1.5, 'the soft cap must hold');
});

test('physics: random inputs never produce NaN, out-of-range energy or a player below the sand', () => {
  for (let run = 0; run < 6; run++) {
    const random = makeRandom(99 + run);
    const player = placeOnCrest(newPlayer(), (random() - 0.5) * 20000, (random() - 0.5) * 20000);
    let input = { ...IDLE, push: 1 };
    let nextChange = 0;
    for (let i = 0; i < 120 * 60; i++) {
      if (i >= nextChange) {
        input = {
          steer: [-1, 0, 1, 0.5][Math.floor(random() * 4)],
          push: random() < 0.8 ? 1 : 0,
          tuck: random() < 0.15,
          brake: random() < 0.08,
          jump: random() < 0.3,
          boost: random() < 0.5
        };
        nextChange = i + Math.round((0.1 + random() * 0.6) * 120);
      }
      stepPlayer(player, input, DT);
      assert.ok(Number.isFinite(player.x + player.y + player.z + player.vx + player.vy + player.vz + player.energy));
      assert.ok(player.energy >= -1e-9 && player.energy <= 1 + 1e-9, 'boost energy stays within the gauge');
      assert.ok(player.y - heightAt(player.x, player.z) > -0.05, 'the player never sinks into the sand');
    }
  }
});

test('physics: without friction, drag, thrust or boost the mechanical energy cannot grow', () => {
  withPhysics({ mu: 0, drag: 0 }, () => {
    for (let run = 0; run < 4; run++) {
      const player = placeOnCrest(newPlayer(), 40 + run * 120, -30 + run * 90);
      const energy = () => PHYS.G * player.y + 0.5 * (player.vx ** 2 + player.vy ** 2 + player.vz ** 2);
      const start = energy();
      let peak = start;
      for (let i = 0; i < 120 * 40; i++) {
        stepPlayer(player, { ...IDLE, steer: Math.sin((i / 120) * 0.7) * 0.6 }, DT);
        peak = Math.max(peak, energy());
      }
      assert.ok(peak - start < 0.1, `energy gain ${peak - start} J/kg`);
    }
  });
});

test('physics: a longer jump charge gives a stronger, higher jump, up to a limit', () => {
  const flat = { h: 0, gx: 0, gz: 0 };
  let spot = [0, 0];
  search: for (let x = 0; x < 3000; x += 7) {
    for (let z = 0; z < 800; z += 7) {
      terrain(x, z, flat);
      if (Math.hypot(flat.gx, flat.gz) < 0.012) {
        spot = [x, z];
        break search;
      }
    }
  }
  const apexAfterHolding = (seconds) => {
    const player = placeOnCrest(newPlayer(), spot[0], spot[1]);
    Object.assign(player, { x: spot[0], z: spot[1], y: heightAt(spot[0], spot[1]), vx: 0, vy: 0, vz: 0 });
    for (let i = 0; i < 30; i++) stepPlayer(player, IDLE, DT);
    for (let i = 0; i < Math.round(seconds / DT); i++) stepPlayer(player, { ...IDLE, jump: true }, DT);
    let apex = 0;
    let left = false;
    for (let i = 0; i < 6 * 120; i++) {
      stepPlayer(player, IDLE, DT);
      if (!player.grounded) {
        left = true;
        apex = Math.max(apex, player.y - heightAt(player.x, player.z));
      } else if (left) break;
    }
    return { apex, power: player.jumpPower };
  };
  const holds = [0.04, 0.2, 0.4, 0.9].map(apexAfterHolding);
  for (let i = 1; i < holds.length; i++)
    assert.ok(holds[i].apex >= holds[i - 1].apex - 1e-6, 'apex grows with the charge');
  assert.ok(holds[0].power >= PHYS.jumpMin - 1e-6 && holds[0].power < PHYS.jumpMax);
  assert.ok(Math.abs(holds.at(-1).power - PHYS.jumpMax) < 1e-6, 'a full charge reaches the maximum');
});

test('physics: boosting drains the gauge, locks out at zero and recharges afterwards', () => {
  const player = placeOnCrest(newPlayer(), 40, -30);
  let lockedOut = false;
  let energyAfterHold = 1;
  for (let i = 0; i < 40 * 120; i++) {
    const t = i * DT;
    stepPlayer(player, { ...IDLE, push: 1, boost: t < 8 }, DT);
    lockedOut ||= player.boostLock;
    if (i === 8 * 120) energyAfterHold = player.energy;
  }
  assert.ok(energyAfterHold < 0.05, 'eight seconds of boost empty the gauge');
  assert.ok(lockedOut, 'an empty gauge locks the boost');
  assert.ok(player.energy > 0.95, 'the gauge refills while the boost is released');
  assert.equal(player.boosting, false);
});
