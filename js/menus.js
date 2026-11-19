// Title, brief, controls, settings, pause and results screens with keyboard, mouse,
// touch and gamepad navigation.
import { SCORING } from './config.js';
import { TIERS } from './quality.js';

const SCHEMES = {
  keyboard: [
    ['Move', '<kbd>W</kbd> / <kbd>S</kbd> (or ↑ / ↓) forward and back'],
    ['Turn', '<kbd>A</kbd> / <kbd>D</kbd> (or ← / →), or move the mouse — the camera stays behind Cizzo'],
    ['Look up / down', 'Mouse (click to capture; dragging works too)'],
    ['Crouch (toggle)', '<kbd>C</kbd> / <kbd>Ctrl</kbd>'],
    ['Interact', '<kbd>E</kbd>'],
    ['Lockpick', 'Drag or <kbd>A</kbd>/<kbd>D</kbd> to aim, hold <kbd>Space</kbd> to turn'],
    ['Pause', '<kbd>Esc</kbd> / <kbd>P</kbd>'],
  ],
  touch: [
    ['Move', 'Left thumb joystick: push up / down'],
    ['Turn', 'Joystick left / right, or drag sideways on the right side'],
    ['Look up / down', 'Drag up / down on the right side'],
    ['Crouch (toggle)', 'Crouch button'],
    ['Interact', 'Context button (appears when available)'],
    ['Lockpick', 'Drag the lock to aim, hold Turn'],
    ['Pause', '⏸ button'],
  ],
  gamepad: [
    ['Move', 'Left stick up / down'],
    ['Turn', 'Left stick left / right, or right stick'],
    ['Look up / down', 'Right stick up / down'],
    ['Crouch (toggle)', 'B'],
    ['Interact', 'A'],
    ['Lockpick', 'Left stick to aim, hold A to turn'],
    ['Pause', 'Start'],
  ],
};

export const FLAVOUR = {
  1: 'You got out. The SOC is still writing the incident report.',
  2: 'Clean enough. The night shift will blame a firmware update.',
  3: 'Ghost protocol. ACME won’t know a thing until Monday.',
};

export function starsFor({ peak, time, spotted }) {
  if (peak < SCORING.threeStarPeak && spotted === 0 && time < SCORING.threeStarTime) return 3;
  if (peak < SCORING.twoStarPeak) return 2;
  return 1;
}

export const formatTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t % 1) * 10))}`;

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canFullscreen = () => !!(document.fullscreenEnabled && document.documentElement.requestFullscreen) && !isIOS;

export function createMenus({ input, save, audio, actions }) {
  const screens = {};
  for (const id of ['title', 'brief', 'controls', 'settings', 'pause', 'results']) screens[id] = document.getElementById(`screen-${id}`);
  const stack = [];

  const focusables = (el) => [...el.querySelectorAll('button:not([hidden]):not(:disabled), input:not([hidden])')].filter((b) => b.offsetParent !== null);

  function focusFirst(el) {
    const f = el.querySelector('.btn.primary:not([hidden])') || focusables(el)[0];
    f?.focus({ preventScroll: true });
  }

  function render() {
    for (const [id, el] of Object.entries(screens)) el.hidden = id !== stack[stack.length - 1];
    const top = stack[stack.length - 1];
    if (top) {
      if (top === 'title') refreshTitle();
      if (top === 'controls') setScheme(input.state.device);
      if (top === 'settings') refreshSettings();
      focusFirst(screens[top]);
    }
  }

  const menus = {
    get top() { return stack[stack.length - 1] || null; },
    get open() { return stack.length > 0; },
    show(id) { stack.length = 0; stack.push(id); render(); },
    push(id) { stack.push(id); render(); },
    back() {
      if (stack.length > 1) { stack.pop(); render(); audio.ui(); return true; }
      return false;
    },
    hideAll() { stack.length = 0; render(); },
  };

  // ---------- actions ----------
  document.querySelectorAll('.screen [data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      audio.unlock();
      audio.ui();
      const a = btn.dataset.action;
      if (a === 'controls') menus.push('controls');
      else if (a === 'settings') menus.push('settings');
      else if (a === 'back') { if (!menus.back()) actions.back?.(); }
      else if (a === 'fullscreen') toggleFullscreen();
      else actions[a]?.();
    });
  });

  function toggleFullscreen() {
    if (!canFullscreen()) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    }
  }
  if (canFullscreen()) document.querySelectorAll('.fs-only').forEach((b) => { b.hidden = false; });

  // ---------- title ----------
  function refreshTitle() {
    screens.title.querySelector('[data-action="continue"]').hidden = !save.checkpoint;
    const best = save.best;
    document.getElementById('best').textContent = best ? `BEST ${formatTime(best.time)} · ${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)}` : '';
  }

  // ---------- controls ----------
  const table = document.getElementById('controls-table');
  const tabs = [...screens.controls.querySelectorAll('.tab')];
  function setScheme(scheme) {
    if (!SCHEMES[scheme]) scheme = 'keyboard';
    table.innerHTML = SCHEMES[scheme].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.scheme === scheme)));
  }
  tabs.forEach((t) => t.addEventListener('click', () => { audio.ui(); setScheme(t.dataset.scheme); }));

  // ---------- settings ----------
  const s = save.settings;
  const q = (id) => document.getElementById(id);
  const segBtns = [...screens.settings.querySelectorAll('.seg-btn')];
  const toggles = { 'set-invert': 'invertY', 'set-cones': 'showCones', 'set-motion': 'reducedMotion', 'set-large': 'largeText' };
  const ranges = { 'set-sens': 'lookSens', 'set-music': 'music', 'set-sfx': 'sfx' };

  function refreshSettings() {
    segBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.quality === s.quality)));
    for (const [id, key] of Object.entries(toggles)) q(id).setAttribute('aria-pressed', String(!!s[key]));
    for (const [id, key] of Object.entries(ranges)) q(id).value = s[key];
  }
  function change(key, value) {
    save.saveSettings({ [key]: value });
    actions.settingsChanged?.(key, value);
    refreshSettings();
  }
  segBtns.forEach((b) => b.addEventListener('click', () => { audio.ui(); change('quality', b.dataset.quality); }));
  for (const [id, key] of Object.entries(toggles)) q(id).addEventListener('click', () => { audio.ui(); change(key, !s[key]); });
  for (const [id, key] of Object.entries(ranges)) q(id).addEventListener('input', (e) => change(key, Number(e.target.value)));

  // ---------- results ----------
  menus.showResults = ({ time, peak, spotted, picks, stars, record }) => {
    document.getElementById('res-stars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= stars ? 'on' : 'off'}">★</span>`).join('');
    document.getElementById('res-stars').setAttribute('aria-label', `${stars} of 3 stars`);
    document.getElementById('res-flavour').textContent = FLAVOUR[stars];
    document.getElementById('res-time').textContent = formatTime(time);
    document.getElementById('res-peak').textContent = `${Math.round(peak)}%`;
    document.getElementById('res-spotted').textContent = String(spotted);
    document.getElementById('res-picks').textContent = String(picks);
    const best = save.best;
    const notes = [];
    if (record.newBestTime) notes.push('NEW BEST TIME');
    if (record.newBestStars) notes.push('NEW BEST RATING');
    document.getElementById('res-best').textContent = notes.length ? notes.join(' · ') : best ? `Best ${formatTime(best.time)} · ${'★'.repeat(best.stars)}` : '';
    menus.show('results');
  };

  // ---------- keyboard + gamepad navigation ----------
  function moveFocus(dir) {
    const el = screens[menus.top];
    if (!el) return;
    const list = focusables(el);
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const next = i < 0 ? list[0] : list[(i + dir + list.length) % list.length];
    next.focus({ preventScroll: false });
    audio.ui();
  }

  function adjust(dir) {
    const a = document.activeElement;
    if (!a) return;
    if (a.type === 'range') {
      const step = Number(a.step) || 0.1;
      a.value = String(Math.min(Number(a.max), Math.max(Number(a.min), Number(a.value) + dir * step)));
      a.dispatchEvent(new Event('input'));
    } else if (a.classList.contains('seg-btn')) {
      const i = TIERS.indexOf(a.dataset.quality);
      const nb = segBtns[Math.max(0, Math.min(segBtns.length - 1, i + dir))];
      nb.focus();
    } else if (a.classList.contains('tab')) {
      const i = tabs.indexOf(a);
      tabs[(i + dir + tabs.length) % tabs.length].focus();
    } else moveFocus(dir);
  }

  window.addEventListener('keydown', (e) => {
    if (!menus.open) return;
    const tag = document.activeElement?.type;
    if (e.code === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
    if (e.code === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
    if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && tag !== 'range') {
      e.preventDefault();
      adjust(e.code === 'ArrowLeft' ? -1 : 1);
    }
  });

  /** Gamepad navigation and back handling; call every frame while a menu is open. */
  menus.update = () => {
    if (!menus.open) return;
    const st = input.state;
    if (st.nav.down) moveFocus(1);
    if (st.nav.up) moveFocus(-1);
    if (st.nav.left) adjust(-1);
    if (st.nav.right) adjust(1);
    if (st.confirmPressed && document.activeElement && document.activeElement !== document.body) document.activeElement.click();
    if (st.backPressed) {
      if (!menus.back()) actions.back?.();
    } else if (st.pausePressed && menus.top === 'pause') actions.resume?.();
  };

  return menus;
}
