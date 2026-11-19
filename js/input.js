// Unified input. Every frame `update(dt)` folds keyboard/mouse, touch and gamepad into a single
// `input.state`; `endFrame()` clears the one-frame "pressed" edges and look deltas.
import { CAMERA, INPUT } from './config.js';

export const isTouchDevice = () =>
  (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

export function createInput({ container, touchLayer, joyBase, joyKnob }) {
  const state = {
    move: { x: 0, y: 0 },
    look: { dx: 0, dy: 0 }, // radians this frame (before the sensitivity setting)
    crouchPressed: false,
    interactPressed: false,
    turnHeld: false,
    pausePressed: false,
    backPressed: false,
    confirmPressed: false,
    anyPressed: false,
    nav: { up: false, down: false, left: false, right: false },
    aim: 0, // -1..1 from keys / stick, used by the lockpick
    device: isTouchDevice() ? 'touch' : 'keyboard',
    pointerLocked: false,
  };

  const keys = new Set();
  const pend = { crouch: false, interact: false, pause: false, back: false, confirm: false, any: false, dx: 0, dy: 0 };
  const touchButtons = { turn: false };
  let wantPointerLock = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  // ---------- keyboard ----------
  const isTyping = (e) => e.target && (e.target.tagName === 'INPUT' && e.target.type !== 'range');
  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    state.device = 'keyboard';
    if (!e.repeat) {
      pend.any = true;
      if (e.code === 'KeyC' || e.code === 'ControlLeft' || e.code === 'ControlRight') pend.crouch = true;
      if (e.code === 'KeyE') pend.interact = true;
      if (e.code === 'Escape' || e.code === 'KeyP') pend.pause = true;
      if (e.code === 'Escape' || e.code === 'Backspace') pend.back = true;
    }
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && document.activeElement === document.body) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); dragging = false; });

  // ---------- mouse ----------
  container.addEventListener('contextmenu', (e) => e.preventDefault());
  container.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    state.device = 'keyboard';
    pend.any = true;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    if (wantPointerLock && !state.pointerLocked && container.requestPointerLock) {
      try {
        const p = container.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch { /* pointer lock unavailable: drag fallback */ }
    }
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (state.pointerLocked) {
      pend.dx += e.movementX * CAMERA.mouseSens;
      pend.dy += e.movementY * CAMERA.mouseSens;
    } else if (dragging) {
      pend.dx += (e.clientX - lastX) * CAMERA.dragSens;
      pend.dy += (e.clientY - lastY) * CAMERA.dragSens;
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });
  document.addEventListener('pointerlockchange', () => {
    state.pointerLocked = document.pointerLockElement === container;
  });

  // ---------- touch (pointer events on the touch layer) ----------
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const look = { id: null, x: 0, y: 0 };
  const showJoy = (on) => {
    if (!joyBase) return;
    joyBase.style.display = on ? 'block' : 'none';
    if (on) {
      joyBase.style.transform = `translate(${joy.ox}px, ${joy.oy}px)`;
      joyKnob.style.transform = 'translate(0px, 0px)';
    }
  };
  const onDown = (e) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    state.device = 'touch';
    pend.any = true;
    const w = window.innerWidth;
    if (e.clientX < w * INPUT.leftZone && joy.id === null) {
      joy.id = e.pointerId;
      joy.ox = e.clientX;
      joy.oy = e.clientY;
      joy.x = 0;
      joy.y = 0;
      showJoy(true);
    } else if (look.id === null) {
      look.id = e.pointerId;
      look.x = e.clientX;
      look.y = e.clientY;
    }
    try { touchLayer.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
  };
  const onMove = (e) => {
    if (e.pointerId === joy.id) {
      e.preventDefault();
      const R = INPUT.joystickRadius;
      let dx = e.clientX - joy.ox;
      let dy = e.clientY - joy.oy;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      joy.x = dx / R;
      joy.y = -dy / R;
      if (joyKnob) joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (e.pointerId === look.id) {
      e.preventDefault();
      pend.dx += (e.clientX - look.x) * CAMERA.touchSens;
      pend.dy += (e.clientY - look.y) * CAMERA.touchSens;
      look.x = e.clientX;
      look.y = e.clientY;
    }
  };
  const onUp = (e) => {
    if (e.pointerId === joy.id) {
      joy.id = null;
      joy.x = 0;
      joy.y = 0;
      showJoy(false);
    }
    if (e.pointerId === look.id) look.id = null;
  };
  if (touchLayer) {
    touchLayer.addEventListener('pointerdown', onDown, { passive: false });
    touchLayer.addEventListener('pointermove', onMove, { passive: false });
    touchLayer.addEventListener('pointerup', onUp);
    touchLayer.addEventListener('pointercancel', onUp);
    touchLayer.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }
  // Block pinch zoom / iOS gestures and pull-to-refresh on the game surface.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1 || !e.target.closest('.scrollable')) e.preventDefault();
  }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());

  /** Wire an on-screen button: kind = 'crouch' | 'interact' | 'pause' | 'turn'. */
  function bindButton(el, kind) {
    if (!el) return;
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.device = 'touch';
      pend.any = true;
      if (kind === 'crouch') pend.crouch = true;
      if (kind === 'interact') pend.interact = true;
      if (kind === 'pause') pend.pause = true;
      if (kind === 'turn') touchButtons.turn = true;
    };
    const up = (e) => {
      e.stopPropagation();
      if (kind === 'turn') touchButtons.turn = false;
    };
    el.addEventListener('pointerdown', down, { passive: false });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('click', (e) => e.stopPropagation());
  }

  // ---------- gamepad ----------
  let prevButtons = [];
  let navTimer = 0;
  let navHeldDir = null;
  const dz = (v) => (Math.abs(v) < INPUT.deadzone ? 0 : (v - Math.sign(v) * INPUT.deadzone) / (1 - INPUT.deadzone));

  function pollGamepad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    const out = { mx: 0, my: 0, lx: 0, ly: 0, a: false, held: false };
    if (!pad) { prevButtons = []; return out; }
    const btn = (i) => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));
    const edge = (i) => btn(i) && !prevButtons[i];
    out.mx = dz(pad.axes[0] || 0);
    out.my = -dz(pad.axes[1] || 0);
    out.lx = dz(pad.axes[2] || 0);
    out.ly = dz(pad.axes[3] || 0);
    const anyActive = Math.abs(out.mx) + Math.abs(out.my) + Math.abs(out.lx) + Math.abs(out.ly) > 0 || pad.buttons.some((b) => b.pressed);
    if (anyActive) state.device = 'gamepad';
    if (edge(0)) { pend.interact = true; pend.confirm = true; pend.any = true; }
    if (edge(1)) { pend.crouch = true; pend.back = true; pend.any = true; }
    if (edge(9)) { pend.pause = true; pend.any = true; }
    out.held = btn(0);

    // menu navigation with auto-repeat (d-pad or left stick)
    let dir = null;
    if (btn(12) || out.my > 0.6) dir = 'up';
    else if (btn(13) || out.my < -0.6) dir = 'down';
    else if (btn(14) || out.mx < -0.6) dir = 'left';
    else if (btn(15) || out.mx > 0.6) dir = 'right';
    if (dir !== navHeldDir) { navHeldDir = dir; navTimer = 0; if (dir) state.nav[dir] = true; }
    else if (dir) {
      navTimer += dt;
      if (navTimer > INPUT.menuRepeat) { navTimer = 0; state.nav[dir] = true; }
    }
    prevButtons = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    return out;
  }

  function update(dt) {
    const gp = pollGamepad(dt);
    let mx = 0;
    let my = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) my += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my -= 1;
    mx += joy.x + gp.mx;
    my += joy.y + gp.my;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    state.move.x = mx;
    state.move.y = my;
    state.aim = Math.max(-1, Math.min(1, mx));

    state.look.dx = pend.dx + gp.lx * CAMERA.padSens * dt;
    state.look.dy = pend.dy + gp.ly * CAMERA.padSens * dt;
    pend.dx = 0;
    pend.dy = 0;

    state.crouchPressed = pend.crouch;
    state.interactPressed = pend.interact;
    state.pausePressed = pend.pause;
    state.backPressed = pend.back;
    state.confirmPressed = pend.confirm;
    state.anyPressed = pend.any;
    pend.crouch = pend.interact = pend.pause = pend.back = pend.confirm = pend.any = false;
    state.turnHeld = keys.has('Space') || touchButtons.turn || gp.held;
  }

  function endFrame() {
    state.crouchPressed = state.interactPressed = state.pausePressed = false;
    state.backPressed = state.confirmPressed = state.anyPressed = false;
    state.look.dx = state.look.dy = 0;
    state.nav.up = state.nav.down = state.nav.left = state.nav.right = false;
  }

  function setPointerLockWanted(on) {
    wantPointerLock = on;
    if (!on && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  function releaseAll() {
    keys.clear();
    joy.id = null; joy.x = 0; joy.y = 0;
    look.id = null;
    touchButtons.turn = false;
    showJoy(false);
  }

  return { state, update, endFrame, bindButton, setPointerLockWanted, releaseAll };
}
