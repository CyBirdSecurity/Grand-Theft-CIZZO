// Builds the office from the ASCII map: merged static meshes, doors, props, lights,
// colliders (AABBs on the XZ plane with a height range) and interactable placements.
import * as THREE from 'three';
import { DOOR, PALETTE, WORLD, DEBUG } from '../config.js';
import { M, NEON_BY_NAME, Batcher, canvasTexture } from '../materials.js';
import {
  MAP, COLS, ROWS, TILE, tileAt, tileCenter, findTiles, runsNorthSouth,
  DECOR, SIGN, SOC_SCREENS, CEILING_STRIPS, CEILING_LIGHTS, LIGHTS,
} from './map.js';
import * as P from './props.js';

const H = WORLD.wallHeight;
const isFloorish = (ch) => !'#g'.includes(ch);

export function buildLevel(scene) {
  const root = new THREE.Group();
  root.name = 'level';
  scene.add(root);

  const b = new Batcher();
  const colliders = [];
  const addCollider = (minX, maxX, minZ, maxZ, maxY, tags = {}) => {
    const col = { minX, maxX, minZ, maxZ, minY: tags.minY ?? 0, maxY, enabled: true, blocksSight: false, lowCover: false, ...tags };
    colliders.push(col);
    return col;
  };

  // ---- Floor, ceiling, outside ground ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(COLS * TILE, ROWS * TILE).rotateX(-Math.PI / 2), M.floor);
  floor.position.set((COLS * TILE) / 2, 0, (ROWS * TILE) / 2);
  root.add(floor);
  // carpets in the offices and the break room
  for (const [c0, r0, c1, r1] of [[1, 1, 4, 3], [6, 1, 9, 3], [1, 7, 4, 10]]) {
    const w = (c1 - c0 + 1) * TILE;
    const d = (r1 - r0 + 1) * TILE;
    b.box(w - 0.2, 0.01, d - 0.2, c0 * TILE + w / 2, 0.006, r0 * TILE + d / 2, M.carpet);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(COLS * TILE, ROWS * TILE).rotateX(Math.PI / 2), M.ceiling);
  ceiling.position.set((COLS * TILE) / 2, H, (ROWS * TILE) / 2);
  root.add(ceiling);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), M.outside);
  ground.position.set(20, -0.02, 14);
  root.add(ground);
  b.box(10, 0.02, 220, 50, -0.005, 14, M.road);
  for (let z = -90; z < 120; z += 6) b.box(0.18, 0.02, 2.4, 50, 0.01, z, M.neonSunset);
  b.box(0.2, 0.03, 220, 44.5, 0.01, 14, M.neonCyan);
  for (const z of [4, 18, 30, -10, 44]) palm(b, 42.5, z);

  // ---- Tiles ----
  const doors = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = MAP[r][c];
      const { x, z } = tileCenter(c, r);
      if (ch === '#') {
        b.box(TILE, H, TILE, x, H / 2, z, M.wall);
        b.box(TILE, 0.06, TILE, x, H + 0.03, z, M.wallTop);
        addCollider(x - 1, x + 1, z - 1, z + 1, H, { blocksSight: true, kind: 'wall' });
        // neon baseboards on faces that border the interior
        baseboards(b, c, r, x, z);
      } else if (ch === 'g') {
        const ns = runsNorthSouth(c, r);
        glassPane(b, x, z, ns);
        const t = DOOR.colliderThickness / 2;
        if (ns) addCollider(x - t, x + t, z - 1, z + 1, H, { kind: 'glass' });
        else addCollider(x - 1, x + 1, z - t, z + t, H, { kind: 'glass' });
      } else if (ch === 'D' || ch === 'K' || ch === 'S') {
        doors.push(makeDoor(root, b, c, r, ch, addCollider));
      } else if (ch === 'd') {
        const rot = r <= 3 ? 0 : (c === 2 ? Math.PI / 2 : -Math.PI / 2);
        P.desk(b, x, z, rot);
        addCollider(x - 0.9, x + 0.9, z - 0.9, z + 0.9, 1.0, { lowCover: true, kind: 'desk' });
      } else if (ch === 'c') {
        const open = { n: tileAt(c, r - 1) === 'c', s: tileAt(c, r + 1) === 'c', w: tileAt(c - 1, r) === 'c', e: tileAt(c + 1, r) === 'c' };
        P.cubicle(b, x, z, open, open.n ? Math.PI : 0);
        addCollider(x - 1, x + 1, z - 1, z + 1, 1.3, { lowCover: true, kind: 'cubicle' });
      } else if (ch === 's') {
        P.securityDesk(b, x, z, r === 8, 0);
        addCollider(x - 0.98, x + 0.98, z - 0.98, z + 0.98, 1.1, { lowCover: true, kind: 'securityDesk' });
      } else if (ch === 'r') {
        P.serverRack(b, x, z, r === 1 ? 0 : Math.PI);
        addCollider(x - 0.75, x + 0.75, z - 0.55, z + 0.55, 2.2, { blocksSight: true, kind: 'rack' });
      } else if (ch === 'C') {
        P.pedestal(b, x, z);
        addCollider(x - 0.45, x + 0.45, z - 0.45, z + 0.45, 0.9, { kind: 'pedestal' });
      }
    }
  }

  // ---- Decoration ----
  for (const d of DECOR) {
    if (d.type === 'plant') { P.plant(b, d.x, d.z); addCollider(d.x - 0.25, d.x + 0.25, d.z - 0.25, d.z + 0.25, 1.2, { kind: 'decor' }); }
    if (d.type === 'cooler') { P.waterCooler(b, d.x, d.z, d.rotY); addCollider(d.x - 0.25, d.x + 0.25, d.z - 0.25, d.z + 0.25, 1.4, { kind: 'decor' }); }
    if (d.type === 'vending') { P.vendingMachine(b, d.x, d.z, d.rotY); addCollider(d.x - 0.5, d.x + 0.5, d.z - 0.4, d.z + 0.4, 1.9, { kind: 'decor' }); }
    if (d.type === 'whiteboard') P.whiteboard(b, d.x, d.z, d.rotY);
    if (d.type === 'crates') { P.crates(b, d.x, d.z); addCollider(d.x - 0.85, d.x + 0.8, d.z - 0.4, d.z + 0.4, 1.4, { kind: 'decor' }); }
  }
  // Loading dock roll-up door on the west wall by the exit
  {
    const e = tileCenter(1, 12);
    b.box(0.06, 2.4, 1.8, e.x - 0.97, 1.2, e.z, M.frame);
    for (let i = 0; i < 8; i++) b.box(0.07, 0.03, 1.7, e.x - 0.96, 0.2 + i * 0.28, e.z, M.trim);
    b.box(0.08, 0.12, 1.9, e.x - 0.95, 2.48, e.z, M.neonSunset);
  }

  // Ceiling neon strips
  for (const [x1, z1, x2, z2, color] of CEILING_STRIPS) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const horizontal = Math.abs(z2 - z1) < 0.01;
    b.box(horizontal ? len : 0.1, 0.06, horizontal ? 0.1 : len, (x1 + x2) / 2, H - 0.1, (z1 + z2) / 2, NEON_BY_NAME[color]);
  }

  // Overhead light panels with a soft pool of light on the floor below each one
  for (const [lx, lz, rot] of CEILING_LIGHTS) {
    b.push(lx, 0, lz, rot);
    b.box(1.6, 0.06, 0.62, 0, H - 0.05, 0, M.frame);
    b.box(1.44, 0.03, 0.46, 0, H - 0.09, 0, M.lightPanel);
    b.pop();
    const pool = new THREE.CircleGeometry(2.1, 20).rotateX(-Math.PI / 2);
    pool.translate(lx, 0.02, lz);
    b.add(pool, M.lightPool);
  }

  const staticMeshes = b.build(root);

  // ---- Animated / special props ----
  const kTile = findTiles('k')[0];
  const kPos = tileCenter(kTile.c, kTile.r);
  const keycard = P.keycardMesh();
  keycard.position.set(kPos.x, 0.9, kPos.z);
  root.add(keycard);

  const cTile = findTiles('C')[0];
  const cPos = tileCenter(cTile.c, cTile.r);
  const computer = P.computerTower();
  computer.position.set(cPos.x, 0.94, cPos.z);
  computer.rotation.y = Math.PI / 2;
  root.add(computer);

  const eTile = findTiles('E')[0];
  const ePos = tileCenter(eTile.c, eTile.r);
  const exitRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 24).rotateX(-Math.PI / 2), M.exitRing);
  exitRing.position.set(ePos.x, 0.03, ePos.z);
  exitRing.visible = false;
  root.add(exitRing);

  const sign = makeSign();
  sign.position.set(SIGN.x, SIGN.y, SIGN.z);
  root.add(sign);

  const soc = makeSocScreens(root);
  const skyline = makeSkyline();
  root.add(skyline);

  // ---- Lights ----
  const hemi = new THREE.HemisphereLight(0xb8a6ff, 0x3a2470, 2.6);
  const amb = new THREE.AmbientLight(0x6a58b8, 1.6);
  root.add(hemi, amb);
  const pointLights = LIGHTS.map((l) => {
    const light = new THREE.PointLight(PALETTE[l.color], l.intensity, l.distance, 1.2);
    light.position.set(l.x, l.y, l.z);
    root.add(light);
    return light;
  });
  // A cool moonlight through the glass front so the lobby reads even on low quality.
  const moon = new THREE.DirectionalLight(0x9a7cff, 0.6);
  moon.position.set(60, 40, 10);
  root.add(moon);

  // ---- Debug collider wireframes ----
  let debugLines = null;
  if (DEBUG) {
    const pts = [];
    for (const col of colliders) {
      const y = 0.05;
      const { minX: a, maxX: bx, minZ: c, maxZ: d } = col;
      pts.push(a, y, c, bx, y, c, bx, y, c, bx, y, d, bx, y, d, a, y, d, a, y, d, a, y, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    debugLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x00ff88 }));
    debugLines.visible = false;
    root.add(debugLines);
  }

  const doorGrid = new Map(doors.map((d) => [d.r * COLS + d.c, d]));
  let time = 0;
  let socT = 0;

  const level = {
    root,
    colliders,
    doors,
    staticMeshes,
    keycard,
    keycardHome: { x: kPos.x, z: kPos.z },
    computer,
    computerHome: { x: cPos.x, z: cPos.z },
    exitRing,
    exitPos: ePos,
    pointLights,
    debugLines,
    doorAt: (c, r) => doorGrid.get(r * COLS + c) || null,
    doorByKind: (kind) => doors.find((d) => d.kind === kind),
    onDoorOpened: null,
    onDoorSound: null,

    setLightCount(n) {
      pointLights.forEach((l, i) => { l.visible = i < n; });
    },

    /** Opens doors for nearby actors. actors: [{x, z, isPlayer, hasKeycard}] */
    updateDoors(dt, actors) {
      for (const d of doors) {
        let want = false;
        if (d.kind === 'server' && !d.locked) want = true;
        else {
          for (const a of actors) {
            if (Math.hypot(a.x - d.x, a.z - d.z) > DOOR.openDist) continue;
            if (d.kind === 'door') want = true;
            else if (d.kind === 'keycard' && a.isPlayer && a.hasKeycard) want = true;
            if (want) break;
          }
        }
        if (d.kind === 'keycard') d.locked = !actors.some((a) => a.isPlayer && a.hasKeycard);
        const before = d.open;
        d.target = want ? 1 : 0;
        const step = DOOR.speed * dt;
        d.open = d.target > d.open ? Math.min(d.target, d.open + step) : Math.max(d.target, d.open - step);
        if (before === 0 && d.open > 0 && level.onDoorSound) level.onDoorSound(d, true);
        if (before === 1 && d.open < 1 && level.onDoorSound) level.onDoorSound(d, false);
        if (d.open > 0.5 && !d.everOpened) {
          d.everOpened = true;
          if (level.onDoorOpened) level.onDoorOpened(d);
        }
        d.collider.enabled = d.open < DOOR.passableAt;
        const e = d.open * d.open * (3 - 2 * d.open); // smoothstep easing
        d.panel.position.y = -e * (DOOR.height + 0.05);
        if (d.light) d.light.material = d.locked ? M.lightRed : M.lightGreen;
      }
    },

    resetDoors({ hasKeycard, serverUnlocked }) {
      for (const d of doors) {
        d.open = 0;
        d.target = 0;
        d.everOpened = false;
        if (d.kind === 'keycard') d.locked = !hasKeycard;
        if (d.kind === 'server') {
          d.locked = !serverUnlocked;
          if (serverUnlocked) { d.open = 1; d.everOpened = true; }
        }
        d.collider.enabled = d.open < DOOR.passableAt;
        d.panel.position.y = -d.open * (DOOR.height + 0.05);
        if (d.light) d.light.material = d.locked ? M.lightRed : M.lightGreen;
      }
    },

    update(dt) {
      time += dt;
      M.ledA.emissiveIntensity = 1.4 + 1.4 * (Math.sin(time * 7) > 0 ? 1 : 0.2);
      M.ledB.emissiveIntensity = 1.4 + 1.4 * (Math.sin(time * 4.3 + 1) > 0 ? 1 : 0.2);
      M.ledC.emissiveIntensity = 1.2 + 1.2 * (Math.sin(time * 11 + 2) > 0 ? 1 : 0.3);
      if (keycard.visible && keycard.parent === root) {
        keycard.rotation.y += dt * 1.6;
        keycard.position.y = 0.9 + Math.sin(time * 2.4) * 0.08;
      }
      M.keycard.emissiveIntensity = 2.2 + Math.sin(time * 4) * 0.9;
      M.computerGlow.emissiveIntensity = 2.2 + Math.sin(time * 3) * 1.0;
      if (exitRing.visible) {
        const s = 1 + 0.25 * Math.sin(time * 4);
        exitRing.scale.set(s, 1, s);
        M.exitRing.opacity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(time * 4));
      }
      socT += dt;
      if (socT > 0.25) { socT = 0; soc.redraw(time); }
    },
  };
  level.resetDoors({ hasKeycard: false, serverUnlocked: false });
  return level;
}

function baseboards(b, c, r, x, z) {
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dc, dr] of dirs) {
    const n = tileAt(c + dc, r + dr);
    if (!isFloorish(n) || n === 'D' || n === 'K' || n === 'S') continue;
    if (c + dc < 0 || c + dc >= COLS || r + dr < 0 || r + dr >= ROWS) continue;
    const fx = x + dc * 1.01;
    const fz = z + dr * 1.01;
    if (dc === 0) b.box(2, 0.05, 0.03, fx, 0.12, fz, M.neonPurple);
    else b.box(0.03, 0.05, 2, fx, 0.12, fz, M.neonPurple);
  }
}

function glassPane(b, x, z, ns) {
  const rot = ns ? Math.PI / 2 : 0;
  b.push(x, 0, z, rot);
  b.box(2, H, 0.06, 0, H / 2, 0, M.glass);
  b.box(2, 0.12, 0.14, 0, 0.06, 0, M.frame);
  b.box(2, 0.1, 0.14, 0, H - 0.05, 0, M.frame);
  b.box(0.08, H, 0.12, -0.96, H / 2, 0, M.frame);
  b.box(2, 0.03, 0.08, 0, 1.1, 0, M.neonCyan);
  b.pop();
}

function makeDoor(root, b, c, r, ch, addCollider) {
  const { x, z } = tileCenter(c, r);
  const ns = runsNorthSouth(c, r);
  const rot = ns ? Math.PI / 2 : 0;
  // header above the opening and jambs
  b.push(x, 0, z, rot);
  b.box(2, H - DOOR.height, 0.6, 0, DOOR.height + (H - DOOR.height) / 2, 0, M.wall);
  b.box(2.02, 0.06, 0.62, 0, H + 0.03, 0, M.wallTop);
  const trim = ch === 'K' ? M.neonCyan : ch === 'S' ? M.neonMagenta : M.neonPurple;
  b.box(2, 0.05, 0.64, 0, DOOR.height + 0.02, 0, trim);
  b.box(0.12, DOOR.height, 0.64, -0.94, DOOR.height / 2, 0, M.frame);
  b.box(0.12, DOOR.height, 0.64, 0.94, DOOR.height / 2, 0, M.frame);
  b.pop();

  const holder = new THREE.Group();
  holder.position.set(x, 0, z);
  holder.rotation.y = rot;
  root.add(holder);
  const panel = new THREE.Group();
  holder.add(panel);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.78, DOOR.height, DOOR.thickness), M.door);
  slab.position.y = DOOR.height / 2;
  panel.add(slab);
  const stripeMat = ch === 'K' ? M.neonCyan : ch === 'S' ? M.neonMagenta : M.doorStripe;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, DOOR.thickness + 0.02), stripeMat);
  stripe.position.y = 1.2;
  panel.add(stripe);

  let light = null;
  if (ch === 'K' || ch === 'S') {
    light = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.7), M.lightRed);
    light.position.set(0.7, 1.4, 0);
    holder.add(light);
  }

  const t = DOOR.colliderThickness / 2;
  const collider = ns
    ? addCollider(x - t, x + t, z - 1, z + 1, H, { blocksSight: true, kind: 'door' })
    : addCollider(x - 1, x + 1, z - t, z + t, H, { blocksSight: true, kind: 'door' });

  const door = {
    c, r, x, z, ch, ns,
    kind: ch === 'K' ? 'keycard' : ch === 'S' ? 'server' : 'door',
    open: 0,
    target: 0,
    locked: ch !== 'D',
    everOpened: false,
    panel,
    light,
    collider,
  };
  collider.doorRef = door;
  return door;
}

function palm(b, x, z) {
  b.push(x, 0, z, 0);
  for (let i = 0; i < 5; i++) b.cyl(0.14 - i * 0.015, 0.16 - i * 0.015, 1.3, 6, i * 0.06, 0.65 + i * 1.25, 0, M.trim);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.push(0.3, 6.6, 0, a);
    b.box(2.2, 0.06, 0.45, 1.0, -0.25, 0, M.trim, 0);
    b.pop();
  }
  b.pop();
}

function makeSign() {
  const { tex } = canvasTexture(512, 192, (ctx, w, h) => {
    ctx.fillStyle = '#120c2a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#7b2ff7';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    // triangle logo
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.moveTo(70, 150); ctx.lineTo(115, 42); ctx.lineTo(160, 150); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#120c2a';
    ctx.beginPath();
    ctx.moveTo(100, 150); ctx.lineTo(115, 112); ctx.lineTo(130, 150); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f5f0ff';
    ctx.font = 'bold 74px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('ACME', 190, 72);
    ctx.font = '600 52px system-ui, sans-serif';
    ctx.fillStyle = '#22d3ee';
    ctx.fillText('CORP', 192, 136);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
}

function makeSocScreens(root) {
  const lines = ['SOC ALERT', 'DETECTING ANOMALY…', 'INVESTIGATING…'];
  const hex = '0123456789ABCDEF';
  const { tex, ctx, canvas } = canvasTexture(512, 208, () => {});
  const redraw = (t) => {
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0a0620';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    const blink = Math.floor(t * 2) % 2 === 0;
    ctx.fillStyle = blink ? '#ff3ea5' : '#ff2a3d';
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillText(lines[0], 22, 62);
    ctx.fillStyle = '#22d3ee';
    ctx.font = '600 30px ui-monospace, monospace';
    ctx.fillText(lines[1], 22, 108);
    ctx.fillText(lines[2] + (blink ? '_' : ''), 22, 146);
    ctx.fillStyle = 'rgba(123,47,247,0.9)';
    ctx.font = '18px ui-monospace, monospace';
    let s = '';
    for (let i = 0; i < 36; i++) s += hex[(Math.floor(t * 8) * 7 + i * 13) % 16];
    ctx.fillText(s, 22, 184);
    for (let i = 0; i < 8; i++) {
      const bh = 10 + 40 * Math.abs(Math.sin(t * 2 + i));
      ctx.fillStyle = i % 2 ? '#ff3ea5' : '#22d3ee';
      ctx.fillRect(400 + i * 12, 150 - bh, 8, bh);
    }
    tex.needsUpdate = true;
  };
  redraw(0);
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  for (const s of SOC_SCREENS) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
    m.position.set(s.x, s.y, s.z);
    m.rotation.y = s.rotY || 0;
    root.add(m);
  }
  return { redraw };
}

function makeSkyline() {
  const { tex } = canvasTexture(2048, 640, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#120a35');
    g.addColorStop(0.35, '#5a2a8a');
    g.addColorStop(0.6, '#d9468f');
    g.addColorStop(0.78, '#ff8a3d');
    g.addColorStop(1, '#ffb36b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // striped synthwave sun
    const cx = w * 0.42;
    const cy = h * 0.68;
    const sg = ctx.createLinearGradient(0, cy - 150, 0, cy + 150);
    sg.addColorStop(0, '#ffe08a');
    sg.addColorStop(1, '#ff3ea5');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(cx, cy, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d9468f';
    for (let i = 0; i < 7; i++) ctx.fillRect(cx - 160, cy + 10 + i * 20, 320, 4 + i * 1.6);
    // stars
    ctx.fillStyle = 'rgba(245,240,255,0.8)';
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 120; i++) ctx.fillRect(rnd() * w, rnd() * h * 0.3, 2, 2);
    // towers
    const towers = 34;
    for (let i = 0; i < towers; i++) {
      const tw = 40 + rnd() * 70;
      const th = 120 + rnd() * 330;
      const tx = rnd() * w;
      const ty = h - th;
      ctx.fillStyle = i % 3 ? '#1b1040' : '#24145a';
      ctx.fillRect(tx, ty, tw, th);
      if (rnd() > 0.6) { ctx.fillRect(tx + tw / 2 - 2, ty - 40, 4, 40); }
      for (let wy = ty + 10; wy < h - 10; wy += 14) {
        for (let wx = tx + 6; wx < tx + tw - 8; wx += 12) {
          if (rnd() > 0.55) {
            const p = rnd();
            ctx.fillStyle = p > 0.85 ? '#ff3ea5' : p > 0.6 ? '#22d3ee' : '#ffc66b';
            ctx.fillRect(wx, wy, 5, 7);
          }
        }
      }
    }
    // palm silhouettes
    const palmAt = (px, ph) => {
      ctx.strokeStyle = '#0b0820';
      ctx.fillStyle = '#0b0820';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(px, h);
      ctx.quadraticCurveTo(px + 30, h - ph / 2, px + 18, h - ph);
      ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI + (i / 6) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(px + 18, h - ph);
        ctx.quadraticCurveTo(px + 18 + Math.cos(a) * 80, h - ph - 40, px + 18 + Math.cos(a) * 130, h - ph + 50 + Math.abs(Math.sin(a)) * -30);
        ctx.lineWidth = 8;
        ctx.stroke();
      }
    };
    palmAt(w * 0.12, 300);
    palmAt(w * 0.7, 260);
    palmAt(w * 0.86, 330);
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(260, 80), mat);
  plane.rotation.y = -Math.PI / 2;
  plane.position.set(110, 34, 14);
  return plane;
}
