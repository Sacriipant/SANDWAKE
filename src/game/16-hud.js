/**
 * 16-hud.js: HUD.
 *
 * Air-time summary, flips, landings and the boost gauge.
 *
 * Part of the game closure; see 01-runtime.js.
 */

/* ---------- air time, flips, boost gauge ---------- */
let bestAir = parseFloat(store('bestAir')) || 0;
let prevJump = false,
  prevBrake = false;
const airUI = { until: 0, live: false };
const setText = (el, txt) => {
  if (el.textContent !== txt) el.textContent = txt;
};
// pops the "+N %" indicator next to the boost gauge
function gainPop(g) {
  if (g < 0.004) return;
  const el = $('boostGain'),
    box = $('boost');
  el.textContent = '+' + Math.round(g * 100) + ' %';
  el.classList.remove('pop');
  box.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pop');
  box.classList.add('pulse');
}
/* pressing Space (or ↓) in mid-air triggers a flip: one full turn per press, up to three */
function handleFlipInput(inp) {
  if (S.started && inAir() && P.airTime > 0.3 && Math.abs(model.flipTarget) < 2.5 * TAU) {
    if (inp.jump && !prevJump) model.flipTarget += TAU;
    else if (inp.brake && !prevBrake) model.flipTarget -= TAU;
  }
  prevJump = !!inp.jump;
  prevBrake = !!inp.brake;
}
// shows the air-time summary (value = duration, sub = flips / landing / bonus line)
function showAirResult(value, sub, record) {
  const el = $('air');
  setText($('airK'), tr('airLabel'));
  setText($('airV'), value);
  setText($('airS'), sub);
  el.classList.add('show');
  el.classList.toggle('rec', !!record);
  airUI.until = time + 2.8;
  airUI.live = false;
}
/* landing: flight summary, boost bonus, penalty if the flip is not completed */
function onTouchdown() {
  const air = P.lastAir,
    tilt = Math.abs(wrapPI(model.flip));
  const flips = Math.round(Math.abs(model.flipTarget) / TAU),
    clean = tilt < 0.9;
  if (air >= 0.45) {
    let gain = clamp((air - 0.45) * 0.12, 0, 0.3);
    if (clean) gain += flips * 0.09;
    const before = P.energy;
    P.energy = Math.min(1, P.energy + gain);
    const rec = air >= 0.9 && air > bestAir + 0.05;
    if (rec) {
      bestAir = air;
      store('bestAir', air.toFixed(2));
    }
    const parts = [];
    if (flips) parts.push(tr('flipsLabel').replace('{n}', flips));
    if (flips || !clean) parts.push(clean ? tr('cleanLabel') : tr('roughLabel'));
    if (P.energy - before > 0.004) parts.push('+' + Math.round((P.energy - before) * 100) + ' %');
    parts.push(rec ? tr('recordLabel') : bestAir > 0 ? tr('bestLabel') + ' ' + bestAir.toFixed(1) + ' s' : '');
    showAirResult(air.toFixed(1) + ' s', parts.filter(Boolean).join(' · '), rec);
    gainPop(P.energy - before);
    if (audio.ctx && S.sound && clean && (flips || air > 1.2)) {
      bell(PENTA[5], 0.06);
      setTimeout(() => bell(PENTA[7], 0.05), 90);
    }
  }
  if (!clean) {
    // interrupted flip: the landing costs speed
    P.vx *= 0.82;
    P.vy *= 0.82;
    P.vz *= 0.82;
    cam.shake = Math.min(0.16, cam.shake + 0.08);
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * TAU,
        s = 1.5 + Math.random() * 3;
      emit(
        P.x,
        P.y + 0.15,
        P.z,
        Math.cos(a) * s + P.vx * 0.3,
        0.8 + Math.random() * 2,
        Math.sin(a) * s + P.vz * 0.3,
        0.3 + Math.random() * 0.4,
        0.8 + Math.random() * 0.8,
        0.6,
        Math.random() * 0.5
      );
    }
  }
  model.flip = wrapPI(model.flip);
  model.flipTarget = 0;
}
const hudS = { e: -1 };
// boost gauge, live air time and note expiry
function updateHud() {
  const e = P.energy,
    box = $('boost');
  if (Math.abs(e - hudS.e) > 0.002) {
    hudS.e = e;
    $('boostFill').style.transform = 'scaleX(' + e.toFixed(3) + ')';
    box.setAttribute('aria-valuenow', Math.round(e * 100));
  }
  box.classList.toggle('on', P.boosting);
  box.classList.toggle('low', e < 0.15 || P.boostLock);
  $('boostfx').style.opacity = (P.boostK * 0.9).toFixed(3);
  const el = $('air');
  if (S.started && inAir() && P.airTime > 0.45) {
    airUI.live = true;
    airUI.until = 0;
    setText($('airK'), tr('airLabel'));
    setText($('airV'), P.airTime.toFixed(1) + ' s');
    const n = Math.round(Math.abs(model.flipTarget) / TAU);
    setText($('airS'), n ? tr('flipsLabel').replace('{n}', n) : '');
    el.classList.add('show');
    el.classList.remove('rec');
  } else if (time >= airUI.until) {
    el.classList.remove('show');
    airUI.live = false;
  }
  if (time >= noteUI.until) $('note').classList.remove('show');
}
