/**
 * 12-camera-input.js: Camera and input.
 *
 * Camera rig state, debug overrides and input handling (keyboard, mouse, touch).
 *
 * Part of the game closure; see 01-runtime.js.
 */

// debug overrides (pose and camera), only set from the test scripts
const DBG = {};
// camera rig state
const cam = { x: 0, y: 5, z: 0, yaw: 0, orbit: 0, shake: 0, fov: 62, init: true, lx: 0, ly: 0, lz: 0, introT: 0 };

/* ---------- input ---------- */
// keys: pressed KeyboardEvent.code values; touch: state of the on-screen controls
const keys = Object.create(null);
const touch = { steer: 0, push: 0, brake: 0, jump: false, tuck: false, boost: false };
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!S.started) {
    if ((e.code === 'Enter' || e.code === 'Space') && !(e.target && e.target.tagName === 'BUTTON')) start();
    return;
  }
  if (!keys[e.code]) keySeen[e.code] = false;
  keys[e.code] = true;
  keyRel[e.code] = false;
  if (e.code === 'KeyR') {
    resetPlayer(true);
  }
  if (e.code === 'KeyN') nextLevel();
  if (e.code === 'KeyH') {
    S.hud = !S.hud;
    $('app').classList.toggle('nohud', !S.hud);
  }
  if (e.code === 'KeyM') setSound(!S.sound);
});
/* a key released before a frame has read it (low frame rate) stays "pressed" until the next read:
 a very brief tap (flip, jump) is therefore never lost */
const keySeen = Object.create(null),
  keyRel = Object.create(null);
window.addEventListener('keyup', (e) => {
  if (keySeen[e.code] || !keys[e.code]) keys[e.code] = false;
  else keyRel[e.code] = true;
});
window.addEventListener('blur', () => {
  for (const k in keys) {
    keys[k] = false;
    keySeen[k] = false;
    keyRel[k] = false;
  }
});
// control state for this frame: { steer, push, brake, tuck, boost, jump }
function readInput() {
  const r = readInputRaw();
  for (const c in keys) {
    if (keys[c]) {
      if (keyRel[c]) {
        keys[c] = false;
        keyRel[c] = false;
        keySeen[c] = false;
      } else keySeen[c] = true;
    }
  }
  return r;
}
function readInputRaw() {
  const k = (...c) => c.some((x) => keys[x]);
  const steer = clamp((k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0) + touch.steer, -1, 1);
  return {
    steer,
    push: (k('ArrowUp', 'KeyW') ? 1 : 0) || touch.push,
    brake: k('ArrowDown', 'KeyS') || touch.brake > 0,
    tuck: k('KeyC') || touch.tuck,
    boost: k('ShiftLeft', 'ShiftRight') || touch.boost,
    jump: k('Space') || touch.jump
  };
}
/* mouse: drag to look around */
{
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && S.started) {
      drag = { x: e.clientX, o: cam.orbit };
      cam.dragging = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) {
        /* pointer capture is optional */
      }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) cam.orbit = clamp(drag.o - (e.clientX - drag.x) * 0.006, -2.6, 2.6);
  });
  const up = () => {
    drag = null;
    cam.dragging = false;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
}
/* touch */
function setupTouch() {
  const zone = $('joy'),
    knob = $('knob');
  let id = null,
    ox = 0,
    oy = 0;
  zone.addEventListener('pointerdown', (e) => {
    id = e.pointerId;
    try {
      zone.setPointerCapture(id);
    } catch (_) {
      /* pointer capture is optional */
    }
    ox = e.clientX;
    oy = e.clientY;
    knob.style.opacity = 1;
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const dx = clamp(e.clientX - ox, -60, 60),
      dy = clamp(e.clientY - oy, -60, 60);
    touch.steer = dx / 50;
    touch.push = dy < -18 ? 1 : 0;
    touch.brake = dy > 28 ? 1 : 0;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    touch.steer = touch.push = touch.brake = 0;
    knob.style.transform = '';
    knob.style.opacity = 0.6;
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  const hold = (el, prop) => {
    el.addEventListener('pointerdown', (e) => {
      touch[prop] = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch (_) {
        /* pointer capture is optional */
      }
      el.classList.add('on');
    });
    const off = () => {
      touch[prop] = false;
      el.classList.remove('on');
    };
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
  };
  hold($('bJump'), 'jump');
  hold($('bTuck'), 'tuck');
  hold($('bBoost'), 'boost');
}
if (coarse) {
  $('touch').hidden = false;
  setupTouch();
}
