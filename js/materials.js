// Shared flat-shaded and emissive neon materials, plus small geometry helpers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from './config.js';

const flat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.05, ...extra });

const neon = (color, intensity = 2.4) =>
  new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, flatShading: true });

export const M = {
  floor: flat(0x2a2058, { roughness: 0.6 }),
  carpet: flat(0x33266e, { roughness: 1 }),
  wall: flat(0x3a2878),
  wallTop: flat(0x4a3290),
  trim: flat(0x15102e),
  ceiling: flat(0x120c2a, { side: THREE.FrontSide }),
  glass: new THREE.MeshStandardMaterial({
    color: PALETTE.cyan, transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0.3, depthWrite: false,
  }),
  frame: flat(0x3a2d6e, { metalness: 0.4, roughness: 0.5 }),
  deskTop: flat(0x3b2f63),
  deskLeg: flat(0x14102a, { metalness: 0.5 }),
  chair: flat(0x2b1f4a),
  monitor: flat(0x0d0a1c, { metalness: 0.3 }),
  partition: flat(0x463a78, { roughness: 1 }),
  counter: flat(0x2c2152),
  counterTop: flat(0x6b58b0),
  rack: flat(0x110d22, { metalness: 0.5, roughness: 0.5 }),
  rackFront: flat(0x1d1638, { metalness: 0.6, roughness: 0.4 }),
  door: flat(0x3d2a7a, { metalness: 0.3 }),
  doorStripe: neon(PALETTE.purple, 1.6),
  pot: flat(0xd8c9ff),
  leaf: flat(0x1f8f6a),
  white: flat(0xe8e3f5),
  crate: flat(0x5a3d2a),
  pedestal: flat(0x231a46, { metalness: 0.4 }),
  outside: flat(0x07051a, { roughness: 1 }),
  road: flat(0x0e0b24, { roughness: 1 }),
  lightPanel: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff0dc, emissiveIntensity: 2.0 }),
  lightPool: new THREE.MeshBasicMaterial({ color: 0xffe2c4, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false }),
  neonPurple: neon(PALETTE.purple, 2.2),
  neonMagenta: neon(PALETTE.magenta, 2.2),
  neonCyan: neon(PALETTE.cyan, 1.8),
  neonSunset: neon(PALETTE.sunset, 2.2),
  screen: neon(PALETTE.cyan, 1.1),
  screenMagenta: neon(PALETTE.magenta, 1.2),
  ledA: neon(PALETTE.cyan, 2.6),
  ledB: neon(PALETTE.magenta, 2.6),
  ledC: neon(PALETTE.green, 2.2),
  lightRed: neon(PALETTE.red, 2.6),
  lightGreen: neon(PALETTE.green, 2.6),
  keycard: neon(PALETTE.cyan, 3),
  computer: flat(0x14102a, { metalness: 0.5, roughness: 0.4, emissive: PALETTE.magenta, emissiveIntensity: 0.25 }),
  computerGlow: neon(PALETTE.magenta, 3),
  marker: new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.9 }),
  exitRing: new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
  blob: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
  character: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04 }),
};

export const NEON_BY_NAME = {
  purple: M.neonPurple,
  magenta: M.neonMagenta,
  cyan: M.neonCyan,
  sunset: M.neonSunset,
};

/** Box geometry with a solid vertex colour, optionally rotated then translated. */
export function coloredBox(w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return paint(g, color);
}

export function paint(g, color) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function merge(list) {
  const allIndexed = list.every((g) => g.index);
  const geoms = allIndexed ? list : list.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = mergeGeometries(geoms, false);
  for (const g of list) g.dispose();
  return out;
}

/**
 * Collects transformed geometries per material and merges them into one mesh per material,
 * so the whole static level costs about one draw call per material.
 */
export class Batcher {
  constructor() {
    this.lists = new Map();
    this.stack = [new THREE.Matrix4()];
  }
  top() {
    return this.stack[this.stack.length - 1];
  }
  push(x, y, z, rotY = 0) {
    const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
    this.stack.push(this.top().clone().multiply(m));
  }
  pop() {
    this.stack.pop();
  }
  add(geom, mat) {
    geom.applyMatrix4(this.top());
    if (!this.lists.has(mat)) this.lists.set(mat, []);
    this.lists.get(mat).push(geom);
  }
  box(w, h, d, x, y, z, mat, rotY = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotY) g.rotateY(rotY);
    g.translate(x, y, z);
    this.add(g, mat);
  }
  cyl(rTop, rBottom, h, seg, x, y, z, mat) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
    g.translate(x, y, z);
    this.add(g, mat);
  }
  cone(r, h, seg, x, y, z, mat) {
    const g = new THREE.ConeGeometry(r, h, seg);
    g.translate(x, y, z);
    this.add(g, mat);
  }
  build(parent) {
    const meshes = [];
    for (const [mat, list] of this.lists) {
      const mesh = new THREE.Mesh(merge(list), mat);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.lists.clear();
    return meshes;
  }
}

/** Canvas texture drawn in code (no image files). */
export function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, canvas, ctx };
}

/**
 * Character body material: vertex colours plus procedural surface detail generated in the
 * shader (no textures). The per-vertex `mtype` attribute weights skin / hair / leather, with
 * fabric being the remainder. Detail is in bind-pose object space so it sticks to the body
 * while it animates, and fades with distance to avoid shimmering.
 */
export function createBodyMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.02 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 mtype;
        varying vec3 vObjPos;
        varying vec3 vMType;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObjPos = position;
        vMType = mtype;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObjPos;
        varying vec3 vMType;
        float gtcHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float gtcNoise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(gtcHash(i + vec3(0, 0, 0)), gtcHash(i + vec3(1, 0, 0)), f.x),
                         mix(gtcHash(i + vec3(0, 1, 0)), gtcHash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(gtcHash(i + vec3(0, 0, 1)), gtcHash(i + vec3(1, 0, 1)), f.x),
                         mix(gtcHash(i + vec3(0, 1, 1)), gtcHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }
        // fades a pattern of the given spatial frequency out before it aliases
        float gtcFade(float freq) {
          float w = length(fwidth(vObjPos)) * freq;
          return clamp(1.5 - w * 1.5, 0.0, 1.0);
        }
        float gtcHeight;
        float gtcSkin;
        float gtcHair;
        float gtcLeather;
        float gtcFabric;
        vec3 gtcBump(vec3 surfPos, vec3 surfNorm, float h) {
          vec3 sx = dFdx(surfPos);
          vec3 sy = dFdy(surfPos);
          vec3 r1 = cross(sy, surfNorm);
          vec3 r2 = cross(surfNorm, sx);
          float det = dot(sx, r1);
          vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
          return normalize(abs(det) * surfNorm - g);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 w = clamp(vMType, 0.0, 1.0);
          gtcSkin = w.x;
          gtcHair = w.y;
          gtcLeather = w.z;
          gtcFabric = clamp(1.0 - w.x - w.y - w.z, 0.0, 1.0);
          vec3 p = vObjPos;
          // skin: soft blotches, fine pores
          float blotch = gtcNoise(p * 30.0);
          float pores = gtcNoise(p * 260.0) * gtcFade(260.0);
          float skinTone = 0.96 + 0.08 * blotch - 0.025 * pores;
          // hair: fine strands running mostly vertically
          float strands = gtcNoise(vec3(p.x * 700.0, p.y * 45.0, p.z * 700.0)) * gtcFade(700.0);
          float hairTone = 0.72 + 0.5 * strands;
          // fabric: weave plus soft folds
          float weaveF = 1300.0;
          float weave = (0.5 + 0.25 * (sin(p.x * weaveF + p.z * weaveF) + sin(p.y * weaveF))) * gtcFade(weaveF * 0.16);
          float folds = gtcNoise(p * vec3(18.0, 7.0, 18.0));
          float fabricTone = 0.91 + 0.12 * folds + 0.03 * (weave - 0.5);
          // leather / metal: faint grain
          float grain = gtcNoise(p * 260.0) * gtcFade(260.0);
          float leatherTone = 0.96 + 0.06 * grain;
          float tone = gtcSkin * skinTone + gtcHair * hairTone + gtcFabric * fabricTone + gtcLeather * leatherTone;
          diffuseColor.rgb *= tone;
          gtcHeight = gtcSkin * (pores * 0.12 + blotch * 0.3) + gtcHair * strands * 0.7 + gtcFabric * (weave * 0.12 + folds * 1.4) + gtcLeather * grain * 0.1;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = gtcSkin * 0.52 + gtcHair * 0.42 + gtcLeather * 0.28 + gtcFabric * 0.86;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = gtcBump(-vViewPosition, normal, gtcHeight * 0.0006);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // light scattering through skin and a faint sheen on hair at grazing angles
          float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += diffuseColor.rgb * rim * (gtcSkin * vec3(0.55, 0.22, 0.16) + gtcHair * vec3(0.18, 0.16, 0.24));
        }`);
  };
  return mat;
}
