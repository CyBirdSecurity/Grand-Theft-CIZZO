// Low-poly prop factories. Static props write into a Batcher (merged per material);
// animated props return their own meshes. Local origin is on the floor, front faces +Z.
import * as THREE from 'three';
import { M } from '../materials.js';

export function desk(b, x, z, rotY = 0, withChair = true) {
  b.push(x, 0, z, rotY);
  b.box(1.6, 0.06, 0.8, 0, 0.74, 0, M.deskTop);
  for (const [lx, lz] of [[-0.74, -0.34], [0.74, -0.34], [-0.74, 0.34], [0.74, 0.34]]) b.box(0.06, 0.72, 0.06, lx, 0.36, lz, M.deskLeg);
  b.box(1.5, 0.4, 0.04, 0, 0.5, -0.36, M.deskLeg); // modesty panel
  monitor(b, 0, 0.77, -0.15);
  b.box(0.45, 0.02, 0.15, 0, 0.78, 0.15, M.monitor); // keyboard
  if (withChair) chair(b, 0.05, 0.75, Math.PI);
  b.pop();
}

export function monitor(b, x, y, z, rotY = 0, mat = M.screen) {
  b.push(x, y, z, rotY);
  b.box(0.08, 0.2, 0.08, 0, 0.1, 0, M.deskLeg);
  b.box(0.62, 0.38, 0.04, 0, 0.38, 0, M.monitor);
  b.box(0.56, 0.32, 0.01, 0, 0.38, 0.025, mat);
  b.pop();
}

export function chair(b, x, z, rotY = 0) {
  b.push(x, 0, z, rotY);
  b.cyl(0.04, 0.04, 0.4, 6, 0, 0.22, 0, M.deskLeg);
  b.box(0.5, 0.04, 0.5, 0, 0.02, 0, M.deskLeg);
  b.box(0.5, 0.08, 0.5, 0, 0.46, 0, M.chair);
  b.box(0.5, 0.55, 0.07, 0, 0.78, -0.24, M.chair);
  b.pop();
}

/** One cubicle tile. `open` lists edges with a neighbouring cubicle: {n,s,e,w}. */
export function cubicle(b, x, z, open, rotY = 0) {
  b.push(x, 0, z, 0);
  const H = 1.3;
  const T = 0.08;
  const half = 0.97;
  if (!open.n) b.box(1.94, H, T, 0, H / 2, -half, M.partition);
  if (!open.s) b.box(1.94, H, T, 0, H / 2, half, M.partition);
  if (!open.w) b.box(T, H, 1.94, -half, H / 2, 0, M.partition);
  if (!open.e) b.box(T, H, 1.94, half, H / 2, 0, M.partition);
  // shared edges get a lower divider so the block reads as separate desks
  if (open.e) b.box(T, 1.0, 1.94, half, 0.5, 0, M.partition);
  if (open.s) b.box(1.94, 1.0, T, 0, 0.5, half, M.partition);
  if (!open.n) b.box(1.98, 0.05, 0.1, 0, H + 0.02, -half, M.neonPurple);
  if (!open.s) b.box(1.98, 0.05, 0.1, 0, H + 0.02, half, M.neonPurple);
  b.pop();
  b.push(x, 0, z, rotY);
  b.box(1.5, 0.05, 0.7, 0, 0.74, -0.4, M.deskTop);
  b.box(0.06, 0.72, 0.6, -0.7, 0.36, -0.4, M.deskLeg);
  b.box(0.06, 0.72, 0.6, 0.7, 0.36, -0.4, M.deskLeg);
  monitor(b, 0, 0.77, -0.55);
  chair(b, 0.1, 0.35, Math.PI);
  b.pop();
}

/** Security desk counter tile; `screens` adds the CCTV monitor bank. */
export function securityDesk(b, x, z, screens, rotY = 0) {
  b.push(x, 0, z, rotY);
  b.box(1.9, 1.05, 1.9, 0, 0.525, 0, M.counter);
  b.box(2.0, 0.06, 2.0, 0, 1.08, 0, M.counterTop);
  b.box(1.92, 0.06, 0.04, 0, 0.6, 0.96, M.neonSunset);
  b.box(0.04, 0.06, 1.92, 0.96, 0.6, 0, M.neonSunset);
  if (screens) {
    monitor(b, -0.45, 1.11, -0.3, 0, M.screen);
    monitor(b, 0.45, 1.11, -0.3, 0, M.screenMagenta);
    monitor(b, 0, 1.5, -0.6, 0, M.screen);
  }
  b.pop();
}

/** Server rack; LEDs go to two alternating materials so they can blink. */
export function serverRack(b, x, z, rotY = 0) {
  b.push(x, 0, z, rotY);
  b.box(1.4, 2.2, 1.0, 0, 1.1, 0, M.rack);
  b.box(1.3, 2.05, 0.04, 0, 1.1, 0.5, M.rackFront);
  for (let i = 0; i < 9; i++) {
    const y = 0.3 + i * 0.21;
    b.box(1.0, 0.03, 0.02, -0.05, y, 0.53, M.trim);
    b.box(0.05, 0.05, 0.02, 0.5, y, 0.53, i % 2 ? M.ledA : M.ledB);
    b.box(0.05, 0.05, 0.02, 0.4, y, 0.53, i % 3 ? M.ledC : M.ledA);
  }
  b.box(0.04, 2.0, 0.03, -0.62, 1.1, 0.52, M.neonCyan);
  b.pop();
}

export function plant(b, x, z) {
  b.push(x, 0, z, 0);
  b.cyl(0.22, 0.17, 0.42, 7, 0, 0.21, 0, M.pot);
  b.cone(0.38, 0.7, 6, 0, 0.75, 0, M.leaf);
  b.cone(0.28, 0.6, 5, 0.06, 1.1, 0.04, M.leaf);
  b.pop();
}

export function waterCooler(b, x, z, rotY = 0) {
  b.push(x, 0, z, rotY);
  b.box(0.42, 1.0, 0.42, 0, 0.5, 0, M.white);
  b.cyl(0.17, 0.17, 0.42, 8, 0, 1.22, 0, M.glass);
  b.box(0.1, 0.06, 0.04, 0, 0.8, 0.22, M.neonCyan);
  b.pop();
}

export function vendingMachine(b, x, z, rotY = 0) {
  b.push(x, 0, z, rotY);
  b.box(1.0, 1.9, 0.8, 0, 0.95, 0, M.counter);
  b.box(0.62, 1.3, 0.02, -0.12, 1.1, 0.41, M.screenMagenta);
  b.box(0.18, 0.5, 0.02, 0.33, 1.3, 0.41, M.neonCyan);
  b.box(0.7, 0.18, 0.02, -0.08, 0.28, 0.41, M.monitor);
  b.pop();
}

export function whiteboard(b, x, z, rotY = 0) {
  b.push(x, 0, z, rotY);
  b.box(2.2, 1.1, 0.04, 0, 1.6, 0.02, M.frame);
  b.box(2.08, 0.98, 0.02, 0, 1.6, 0.05, M.white);
  b.box(0.7, 0.03, 0.01, -0.5, 1.8, 0.065, M.neonMagenta);
  b.box(0.9, 0.03, 0.01, 0.2, 1.62, 0.065, M.neonCyan);
  b.box(0.5, 0.03, 0.01, -0.3, 1.45, 0.065, M.neonPurple);
  b.pop();
}

export function crates(b, x, z) {
  b.push(x, 0, z, 0);
  b.box(0.8, 0.8, 0.8, -0.45, 0.4, 0, M.crate);
  b.box(0.7, 0.7, 0.7, 0.4, 0.35, 0.02, M.crate);
  b.box(0.6, 0.6, 0.6, -0.4, 1.1, 0, M.crate, 0.4);
  b.pop();
}

export function pedestal(b, x, z) {
  b.push(x, 0, z, 0);
  b.box(0.9, 0.9, 0.9, 0, 0.45, 0, M.pedestal);
  b.box(0.96, 0.04, 0.96, 0, 0.92, 0, M.neonMagenta);
  b.pop();
}

/** The target computer: a glowing magenta tower. Returned as its own group so it can be carried. */
export function computerTower() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.62, 0.62), M.computer);
  body.position.y = 0.31;
  g.add(body);
  const stripGeo = new THREE.BoxGeometry(0.02, 0.5, 0.04);
  for (const sx of [0.17, -0.17]) {
    const strip = new THREE.Mesh(stripGeo, M.computerGlow);
    strip.position.set(sx, 0, 0.24);
    body.add(strip);
  }
  return g;
}

export function keycardMesh() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.24), M.keycard);
  return mesh;
}

/** A cyan diamond used as the objective marker. */
export function markerMesh() {
  const g = new THREE.OctahedronGeometry(0.22, 0);
  g.scale(1, 1.6, 1);
  return new THREE.Mesh(g, M.marker);
}
