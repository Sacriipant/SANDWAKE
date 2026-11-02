/**
 * 09-player.js: Player state.
 *
 * The simulation state, the smoothed visual model derived from it and the pose handed to the avatar
 * animation.
 *
 * Part of the game closure; see 01-runtime.js.
 */

/* ---------- player state ---------- */
// simulation state (see sim.js), then the smoothed visual state derived from it
const P = newPlayer();
// visual model: smoothed surface normal, roll, lean, crouch, heading and flip angle
const model = {
  nx: 0,
  ny: 1,
  nz: 0,
  roll: 0,
  lean: 0,
  crouch: 0,
  yaw: 0,
  flip: 0,
  flipTarget: 0,
  steerS: 0,
  landImp: 0
};
// input of avatar.animate(), refreshed every frame from the game state
const pose = {
  t: 0,
  speed: 0,
  boostK: 0,
  air: 0,
  vy: 0,
  crouch: 0,
  tuck: 0,
  charge: 0,
  steer: 0,
  roll: 0,
  accF: 0,
  accY: 0,
  land: 0,
  flip: 0
};
// filtered longitudinal / vertical accelerations, used by the pose
const pAcc = { vf: 0, vy: 0, accF: 0, accY: 0, air: 0, init: false };
const inAir = () => P.airTime > 0.12; // real take-off (micro-bounces over the ripples do not count)
// restarts the current level, or in free ride puts the player back on a crest (hard = back to the origin)
function resetPlayer(hard) {
  if (JBEL.on || TIZIRI.on) {
    startLevel();
    return;
  }
  placeOnCrest(P, hard ? 0 : P.x, hard ? 0 : P.z, SUN2D.x, SUN2D.y);
  model.nx = 0;
  model.ny = 1;
  model.nz = 0;
  model.yaw = P.h;
  cam.init = true;
  model.flip = model.flipTarget = 0;
  P.energy = 1;
  orbs.taken.clear();
  orbs.dirtyScan = true;
  orbs.px = NaN;
  trail.linked = false;
  trail.lx = 1e9;
  pAcc.init = false;
}
