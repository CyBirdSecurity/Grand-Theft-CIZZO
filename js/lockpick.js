// Sweet-spot lockpick minigame as a DOM/SVG overlay over the running 3D view.
import { LOCKPICK, DEBUG_SEED } from './config.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Maximum cylinder rotation (degrees) allowed for a pick `d` degrees away from the sweet spot. */
export function maxRotationFor(d) {
  const L = LOCKPICK;
  if (d <= L.tolFull) return L.openAngle;
  if (d >= L.tolPartial) return L.minRotation;
  const k = (d - L.tolFull) / (L.tolPartial - L.tolFull);
  return L.partialMaxRotation + (L.minRotation - L.partialMaxRotation) * k;
}

export function createLockpick({ root, input, audio, save, settings }) {
  let rng = DEBUG_SEED !== null ? mulberry32(DEBUG_SEED) : Math.random;
  root.innerHTML = `
    <div class="lp-panel" role="dialog" aria-label="Lockpick">
      <div class="lp-head">
        <span class="lp-title">SERVER ROOM LOCK</span>
        <button class="lp-close btn-icon" aria-label="Cancel lockpicking">✕</button>
      </div>
      <svg class="lp-svg" viewBox="-120 -120 240 240" aria-hidden="true">
        <circle r="112" class="lp-outer"/>
        <circle r="100" class="lp-ring"/>
        <g class="lp-cyl">
          <circle r="72" class="lp-cyl-face"/>
          <circle r="72" class="lp-cyl-edge"/>
          <path d="M-9,-38 a14,14 0 1,1 18,0 l6,44 h-30 z" class="lp-keyhole"/>
          <rect x="-4" y="40" width="8" height="70" rx="3" class="lp-wrench"/>
        </g>
        <g class="lp-pick">
          <rect x="-2.5" y="-112" width="5" height="100" rx="2" class="lp-pick-shaft"/>
          <rect x="-6" y="-118" width="12" height="12" rx="2" class="lp-pick-tip"/>
        </g>
      </svg>
      <div class="lp-meter"><span>STRAIN</span><div class="lp-strain"><div class="lp-strain-fill"></div></div></div>
      <div class="lp-picks" aria-live="polite"></div>
      <p class="lp-hint"></p>
      <div class="lp-controls">
        <span class="lp-keys"></span>
        <button class="lp-turn btn" aria-label="Turn the cylinder (hold)">Hold to turn</button>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const svg = $('.lp-svg');
  const cyl = $('.lp-cyl');
  const pick = $('.lp-pick');
  const strainFill = $('.lp-strain-fill');
  const picksEl = $('.lp-picks');
  const hintEl = $('.lp-hint');
  const keysEl = $('.lp-keys');
  input.bindButton($('.lp-turn'), 'turn');

  const lp = {
    active: false,
    sweet: 0,
    aim: 0,
    rot: 0,
    strain: 0,
    picks: LOCKPICK.picks,
    exhausted: false,
    broken: 0,
    result: null,
    onNoise: null,
    onBreak: null,
  };
  let noiseT = 0;
  let lastClick = 0;
  let vibT = 0;
  let closeT = 0;
  let hasSweet = false;
  let dragging = null;

  const cancel = () => { lp.result = 'cancel'; };
  $('.lp-close').addEventListener('click', cancel);
  $('.lp-close').addEventListener('pointerdown', (e) => e.stopPropagation());

  svg.addEventListener('pointerdown', (e) => {
    dragging = { id: e.pointerId, x: e.clientX };
    try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    lp.setAim(lp.aim + (e.clientX - dragging.x) * LOCKPICK.aimDragSens);
    dragging.x = e.clientX;
  });
  const endDrag = () => { dragging = null; };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  lp.setAim = (v) => {
    lp.aim = Math.max(LOCKPICK.aimMin, Math.min(LOCKPICK.aimMax, v));
    if (Math.abs(lp.aim - lastClick) >= LOCKPICK.clickStep) {
      lastClick = lp.aim;
      audio.click();
    }
  };

  lp.seed = (s) => { rng = mulberry32(s); hasSweet = false; };

  function renderPicks() {
    picksEl.innerHTML = 'PICKS ' + Array.from({ length: LOCKPICK.picks }, (_, i) => `<i class="${i < lp.picks ? 'on' : ''}"></i>`).join('');
    picksEl.setAttribute('aria-label', `${lp.picks} picks left`);
  }

  function render() {
    pick.setAttribute('transform', `rotate(${lp.aim.toFixed(1)})`);
    cyl.setAttribute('transform', `rotate(${lp.rot.toFixed(1)})`);
    strainFill.style.width = `${Math.min(100, (lp.strain / LOCKPICK.strainBreak) * 100)}%`;
  }

  lp.open = (device) => {
    if (!hasSweet) {
      lp.sweet = LOCKPICK.sweetMin + rng() * (LOCKPICK.sweetMax - LOCKPICK.sweetMin);
      hasSweet = true;
    }
    lp.active = true;
    lp.result = null;
    lp.rot = 0;
    lp.strain = 0;
    noiseT = 0;
    closeT = 0;
    root.hidden = false;
    root.classList.remove('success', 'shake');
    renderPicks();
    const tutorial = !save.flag('lockpickTutorial');
    hintEl.textContent = tutorial
      ? 'Find the sweet spot — the lock shakes when you’re close. Aim the pick, then hold Turn. If it strains, ease off before the pick snaps.'
      : 'Aim the pick, hold Turn. Ease off when it strains.';
    if (tutorial) save.setFlag('lockpickTutorial');
    keysEl.textContent = device === 'gamepad' ? 'Left stick: aim · A: turn · B: cancel'
      : device === 'touch' ? 'Drag the lock to aim'
        : 'Drag or A/D to aim · Space: turn · Esc: cancel';
    root.classList.toggle('touch', device === 'touch');
    render();
    $('.lp-turn').focus({ preventScroll: true });
  };

  lp.close = () => {
    lp.active = false;
    root.hidden = true;
    root.classList.remove('shake');
    audio.stopGrind();
    dragging = null;
  };

  /** Restores the picks once the player walked away after breaking all of them. */
  lp.checkRefill = (distFromDoor) => {
    if (lp.exhausted && distFromDoor > LOCKPICK.refillDistance) {
      lp.exhausted = false;
      lp.picks = LOCKPICK.picks;
    }
  };

  lp.resetPicks = () => {
    lp.exhausted = false;
    lp.picks = LOCKPICK.picks;
  };

  /** Returns 'success' | 'cancel' | 'exhausted' | null. */
  lp.update = (dt) => {
    if (!lp.active) return null;
    if (lp.result) return lp.result;
    const st = input.state;
    if (closeT > 0) {
      closeT -= dt;
      if (closeT <= 0) return lp.exhausted ? 'exhausted' : 'success';
      return null;
    }
    if (st.backPressed) return 'cancel';
    if (Math.abs(st.aim) > 0.01) lp.setAim(lp.aim + st.aim * LOCKPICK.aimKeySpeed * dt);

    const d = Math.abs(lp.aim - lp.sweet);
    const maxRot = maxRotationFor(d);
    let straining = false;
    if (st.turnHeld) {
      lp.rot = Math.min(maxRot, lp.rot + LOCKPICK.turnSpeed * dt);
      if (lp.rot >= LOCKPICK.openAngle - 0.01) {
        audio.stopGrind();
        audio.clunk();
        root.classList.remove('shake');
        root.classList.add('success');
        hintEl.textContent = 'Unlocked!';
        navigator.vibrate?.([40, 40, 80]);
        closeT = 0.6;
        render();
        return null;
      }
      if (lp.rot >= maxRot - 0.01) {
        straining = true;
        lp.strain += dt;
        if (lp.strain >= LOCKPICK.strainBreak) {
          lp.picks--;
          lp.broken++;
          lp.strain = 0;
          lp.rot = 0;
          audio.stopGrind();
          audio.snap();
          navigator.vibrate?.(120);
          lp.onBreak?.();
          renderPicks();
          if (lp.picks <= 0) {
            lp.exhausted = true;
            hintEl.textContent = 'Out of picks. Step away and come back with fresh ones.';
            closeT = LOCKPICK.exhaustedCloseDelay;
          } else hintEl.textContent = 'Snap! Pick broken. Try a different angle.';
          straining = false;
        }
      }
    } else {
      lp.rot = Math.max(0, lp.rot - LOCKPICK.returnSpeed * dt);
      lp.strain = Math.max(0, lp.strain - LOCKPICK.strainRecover * dt);
    }

    if (straining) {
      audio.startGrind();
      audio.setGrind(lp.strain / LOCKPICK.strainBreak);
      if (!settings.reducedMotion) root.classList.add('shake');
      vibT -= dt;
      if (vibT <= 0) { navigator.vibrate?.(25); vibT = 0.15; }
    } else {
      audio.stopGrind();
      root.classList.remove('shake');
    }

    noiseT += dt;
    if (noiseT >= LOCKPICK.noiseInterval) {
      noiseT = 0;
      lp.onNoise?.(LOCKPICK.noiseRadius);
    }
    render();
    return null;
  };

  root.hidden = true;
  return lp;
}
