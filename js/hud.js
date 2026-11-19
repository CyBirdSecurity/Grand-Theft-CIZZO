// HUD: objective panel, SOC alert meter, inventory, prompts, toasts, minimap,
// objective marker (3D diamond + off-screen arrow), guard barks and the alert vignette.
import * as THREE from 'three';
import { ALERT, MINIMAP, PALETTE } from './config.js';
import { MAP, COLS, ROWS, TILE, OBJECTIVE_TARGETS, findTiles, tileCenter } from './level/map.js';
import { markerMesh } from './level/props.js';

const SEGMENTS = 20;
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export function createHud({ scene, camera, level }) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    objective: $('objective-text'),
    timer: $('timer'),
    alertBar: $('alert-bar'),
    alertLabel: $('alert-label'),
    alertPct: $('alert-pct'),
    alertBox: $('alert'),
    keycard: $('inv-keycard'),
    computer: $('inv-computer'),
    prompt: $('prompt'),
    toasts: $('toasts'),
    minimap: $('minimap'),
    arrow: $('marker-arrow'),
    barks: $('barks'),
    vignette: $('vignette'),
    flash: $('flash'),
    interactBtn: $('btn-interact'),
    crouchBtn: $('btn-crouch'),
  };

  // alert meter segments
  const segs = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const s = document.createElement('i');
    const t = i / (SEGMENTS - 1);
    s.style.setProperty('--seg', t < 0.3 ? 'var(--cyan)' : t < 0.7 ? 'var(--magenta)' : 'var(--red)');
    el.alertBar.appendChild(s);
    segs.push(s);
  }

  // objective marker
  const marker = markerMesh();
  marker.visible = false;
  scene.add(marker);
  const markerTargets = {};
  for (const [state, t] of Object.entries(OBJECTIVE_TARGETS)) {
    if (t.char) {
      const tile = findTiles(t.char)[0];
      markerTargets[state] = { ...tileCenter(tile.c, tile.r), y: t.y };
    } else markerTargets[state] = { x: t.c * TILE, z: t.r * TILE, y: t.y };
  }

  // minimap static layer
  const px = MINIMAP.px;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const mm = el.minimap;
  mm.width = COLS * px * dpr;
  mm.height = ROWS * px * dpr;
  mm.style.width = `${COLS * px}px`;
  mm.style.height = `${ROWS * px}px`;
  const mctx = mm.getContext('2d');
  const base = document.createElement('canvas');
  base.width = mm.width;
  base.height = mm.height;
  {
    const b = base.getContext('2d');
    b.scale(dpr, dpr);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = MAP[r][c];
        const color = ch === '#' ? '#4a3290' : ch === 'g' ? '#22d3ee' : 'dcs'.includes(ch) ? '#2e2160' : ch === 'r' ? '#3a2a70' : ch === 'C' ? '#ff3ea5' : '#140e30';
        b.fillStyle = color;
        b.fillRect(c * px, r * px, px, px);
      }
    }
  }

  const project = new THREE.Vector3();
  const toastQueue = [];
  let toastT = 0;
  const barkEls = new Map();
  let lastObjective = '';
  let flashT = 0;

  function toast(text, kind = '') {
    toastQueue.push({ text, kind });
  }

  function formatTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  const canAct = (item) => !!item.action && (!item.canAct || item.canAct());

  function promptText(item, device) {
    const label = item.label();
    if (!canAct(item)) return label;
    if (device === 'gamepad') return `Ⓐ  ${label}`;
    if (device === 'touch') return label;
    return `E — ${label}`;
  }

  function drawMinimap(ctx) {
    const { player, guards, missions } = ctx;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mm.width, mm.height);
    mctx.drawImage(base, 0, 0);
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = px / TILE;
    for (const d of level.doors) {
      mctx.fillStyle = d.open > 0.5 ? '#140e30' : d.kind === 'door' ? '#7b2ff7' : d.locked ? '#ff2a3d' : '#3dff9a';
      mctx.fillRect(d.c * px + 1, d.r * px + 1, px - 2, px - 2);
    }
    const t = markerTargets[missions.state];
    if (t) {
      mctx.fillStyle = '#22d3ee';
      mctx.save();
      mctx.translate(t.x * s, t.z * s);
      mctx.rotate(Math.PI / 4);
      mctx.fillRect(-3, -3, 6, 6);
      mctx.restore();
    }
    for (const g of guards.list) {
      if (!g.active) continue;
      if (Math.hypot(g.pos.x - player.pos.x, g.pos.z - player.pos.z) > MINIMAP.guardRange) continue;
      mctx.fillStyle = g.state === 'ALERT' ? '#ff2a3d' : g.state === 'SUSPICIOUS' ? '#ffc23d' : '#ff8a3d';
      tri(g.pos.x * s, g.pos.z * s, g.facing, 4);
    }
    mctx.fillStyle = '#ff3ea5';
    tri(player.pos.x * s, player.pos.z * s, player.facing, 5);
  }

  function tri(x, y, facing, size) {
    mctx.save();
    mctx.translate(x, y);
    mctx.rotate(-facing + Math.PI);
    mctx.beginPath();
    mctx.moveTo(0, -size);
    mctx.lineTo(size * 0.75, size * 0.8);
    mctx.lineTo(-size * 0.75, size * 0.8);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  function updateMarker(ctx, time) {
    const t = markerTargets[ctx.missions.state];
    const show = !!t && ctx.showMarker;
    marker.visible = show;
    if (!show) { el.arrow.hidden = true; return; }
    marker.position.set(t.x, t.y + Math.sin(time * 2.5) * 0.12, t.z);
    marker.rotation.y = time * 1.5;
    project.copy(marker.position).project(camera);
    const behind = project.z > 1;
    const off = behind || Math.abs(project.x) > 0.92 || Math.abs(project.y) > 0.88;
    el.arrow.hidden = !off;
    if (off) {
      let x = project.x;
      let y = project.y;
      if (behind) { x = -x; y = -y; }
      const a = Math.atan2(y, x);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const ex = Math.cos(a);
      const ey = Math.sin(a);
      const k = Math.min((w / 2 - 40) / Math.abs(ex || 1e-6), (h / 2 - 40) / Math.abs(ey || 1e-6));
      el.arrow.style.transform = `translate(${w / 2 + ex * k}px, ${h / 2 - ey * k}px) rotate(${-a}rad)`;
    }
  }

  function updateBarks(ctx) {
    for (const g of ctx.guards.list) {
      let b = barkEls.get(g);
      if (!g.bark || !g.active) { if (b) b.hidden = true; continue; }
      if (!b) {
        b = document.createElement('div');
        b.className = 'bark';
        el.barks.appendChild(b);
        barkEls.set(g, b);
      }
      project.set(g.pos.x, 2.3, g.pos.z).project(camera);
      if (project.z > 1 || Math.abs(project.x) > 1.1 || Math.abs(project.y) > 1.1) { b.hidden = true; continue; }
      b.hidden = false;
      b.textContent = g.bark;
      b.classList.toggle('alert', g.state === 'ALERT');
      b.style.transform = `translate(${((project.x + 1) / 2) * window.innerWidth}px, ${((1 - project.y) / 2) * window.innerHeight}px) translate(-50%, -100%)`;
    }
  }

  const hud = {
    marker,
    toast,
    show(on) { el.hud.hidden = !on; if (!on) { marker.visible = false; el.arrow.hidden = true; } },
    flash(color = 'red', duration = 0.6) {
      el.flash.style.background = color === 'red' ? 'rgba(255,42,61,0.55)' : 'rgba(34,211,238,0.35)';
      flashT = duration;
      el.flash.style.opacity = '1';
    },
    clearBarks() { for (const b of barkEls.values()) b.hidden = true; },

    update(dt, ctx) {
      const { missions, alert, player, interact, time, device } = ctx;
      // objective
      if (missions.objective !== lastObjective) {
        lastObjective = missions.objective;
        el.objective.textContent = missions.objective;
        el.objective.parentElement.classList.remove('pulse');
        void el.objective.offsetWidth;
        el.objective.parentElement.classList.add('pulse');
      }
      el.timer.textContent = formatTime(time);

      // alert meter
      const v = alert.value;
      const lit = Math.ceil((v / ALERT.max) * SEGMENTS);
      segs.forEach((s, i) => s.classList.toggle('on', i < lit));
      el.alertLabel.textContent = alert.label();
      el.alertPct.textContent = `${Math.round(v)}%`;
      el.alertBox.dataset.level = String(alert.level());
      el.vignette.style.opacity = String(Math.min(0.85, (v / ALERT.max) * 0.9));

      // inventory
      el.keycard.hidden = !player.hasKeycard;
      el.computer.hidden = !player.carrying;

      // prompt / context button
      const item = interact.current;
      if (item) {
        el.prompt.textContent = promptText(item, device);
        el.prompt.hidden = device === 'touch' && canAct(item);
        el.prompt.classList.toggle('info', !canAct(item));
      } else el.prompt.hidden = true;
      if (el.interactBtn) {
        const show = !!item && canAct(item);
        el.interactBtn.hidden = !show;
        if (show) el.interactBtn.textContent = item.label();
      }
      if (el.crouchBtn) {
        el.crouchBtn.classList.toggle('active', player.crouched);
        el.crouchBtn.disabled = player.carrying;
        el.crouchBtn.setAttribute('aria-pressed', String(player.crouched));
      }

      // toasts
      if (toastT > 0) {
        toastT -= dt;
        if (toastT <= 0) el.toasts.innerHTML = '';
      } else if (toastQueue.length) {
        const t = toastQueue.shift();
        el.toasts.innerHTML = '';
        const d = document.createElement('div');
        d.className = `toast ${t.kind}`;
        d.textContent = t.text;
        el.toasts.appendChild(d);
        toastT = 2.2;
      }

      if (flashT > 0) {
        flashT -= dt;
        if (flashT <= 0) el.flash.style.opacity = '0';
      }

      drawMinimap(ctx);
      updateMarker(ctx, time);
      updateBarks(ctx);
    },
  };
  return hud;
}

export { hex };
export const PALETTE_CSS = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, hex(v)]));
