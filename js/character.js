// Characters are single seamless skinned meshes generated from blended shapes (see body.js),
// rigged to a small bone hierarchy (hips > torso > head, shoulders > elbows, hips > knees)
// and animated procedurally. Clothing details are painted into the vertex colours; only true
// props (sunglasses, eyes, flashlight, the neon belt line) are separate meshes.
import * as THREE from 'three';
import { M, paint, merge, createBodyMaterial } from './materials.js';
import { PALETTE } from './config.js';
import { buildBody } from './body.js';

export const CIZZO = {
  id: 'cizzo',
  skin: 0xc68a63, hair: 0x241710, shirt: 0xcac5da, sleeve: 0xcac5da, forearm: 0xc68a63, cuff: 0xcac5da,
  collar: 0xcac5da, vest: 0x262338, tie: 0x161427, pants: 0x1d1b2c, shoes: 0x0d0b14, belt: 0x0d0b14,
  glasses: true, stubble: 0x8a6048, lips: 0x7a4436, quiff: true, watch: 0xc9c2d8, accent: PALETTE.magenta,
};

const GUARD_BASE = {
  shirt: 0x223066, sleeve: 0x223066, forearm: 0x223066, collar: 0x223066, cuff: null,
  vest: null, tie: 0x0f1530, pants: 0x161c3e, shoes: 0x0a0a12, belt: 0x0a0a12, lips: 0x6e4034,
  cap: 0x161d44, badge: 0xffc23d, flashlight: true, epaulettes: 0x34449a, pocket: 0x1a2554, accent: PALETTE.sunset,
};

/** Three guard looks so the night shift isn't a row of clones. */
export const GUARD_LOOKS = [
  { ...GUARD_BASE, id: 'g1', skin: 0xb98060, hair: 0x1c1410, mustache: true },
  { ...GUARD_BASE, id: 'g2', skin: 0x7a4e36, hair: 0x0e0a08, lips: 0x4e2a22, build: 1.08 },
  { ...GUARD_BASE, id: 'g3', skin: 0xe0b394, hair: 0x6b4a2a, lips: 0x9a5a4a, build: 0.95 },
];
export const GUARD_LOOK = GUARD_LOOKS[0];

/** Night-shift office workers (ambient, wearing headphones). Built at a coarser resolution. */
const WORKER_BASE = { vest: null, tie: null, badge: null, pocket: null, cap: null, flashlight: false, accent: null, headphones: true, cell: 0.016 };
export const WORKER_LOOKS = [
  { ...WORKER_BASE, id: 'w1', skin: 0xd8a888, hair: 0x4a2e1a, shirt: 0x8fb4e0, sleeve: 0x8fb4e0, forearm: 0x8fb4e0, pants: 0x5e5544, shoes: 0x2a1e14, belt: 0x2a1e14, lips: 0x9a5a4a, phones: 0xff3ea5 },
  { ...WORKER_BASE, id: 'w2', skin: 0x8a5a3e, hair: 0x1a1210, shirt: 0xc45a8c, sleeve: 0xc45a8c, forearm: 0x8a5a3e, pants: 0x2a2438, shoes: 0x0e0a10, belt: 0x0e0a10, lips: 0x7a3a3a, longHair: true, build: 0.9, phones: 0x22d3ee },
  { ...WORKER_BASE, id: 'w3', skin: 0xf0c8a8, hair: 0xc8a060, shirt: 0xe8e4f0, sleeve: 0xe8e4f0, forearm: 0xe8e4f0, tie: 0x7b2ff7, pants: 0x3a3a48, shoes: 0x14121a, belt: 0x14121a, lips: 0xb06a5a, phones: 0x7b2ff7 },
  { ...WORKER_BASE, id: 'w4', skin: 0xc89878, hair: 0x7a3a20, shirt: 0x3aa8a0, sleeve: 0x3aa8a0, forearm: 0xc89878, pants: 0x1e2236, shoes: 0x101018, belt: 0x101018, lips: 0x9a4a40, ponytail: true, build: 0.9, phones: 0xffc23d },
];

const HIP = 0.92;
const ARM_OUT = 0.2; // bind pose: arms angled out so they don't melt into the torso
const LEG_OUT = 0.04;

// ---------- skeleton ----------
function makeSkeleton(build) {
  const bone = (name, x, y, z, rx = 0, rz = 0) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    b.rotation.set(rx, 0, rz);
    return b;
  };
  const hips = bone('hips', 0, HIP, 0);
  const torso = bone('torso', 0, 0.06, 0);
  const head = bone('head', 0, 0.62, 0);
  const shoulderL = bone('shoulderL', -0.2 * build, 0.465, 0, 0, -ARM_OUT);
  const elbowL = bone('elbowL', 0, -0.29, 0, -0.12);
  const shoulderR = bone('shoulderR', 0.2 * build, 0.465, 0, 0, ARM_OUT);
  const elbowR = bone('elbowR', 0, -0.29, 0, -0.12);
  const hipL = bone('hipL', -0.095 * build, -0.03, 0, 0, -LEG_OUT);
  const kneeL = bone('kneeL', 0, -0.43, 0, 0.05);
  const hipR = bone('hipR', 0.095 * build, -0.03, 0, 0, LEG_OUT);
  const kneeR = bone('kneeR', 0, -0.43, 0, 0.05);
  hips.add(torso, hipL, hipR);
  torso.add(head, shoulderL, shoulderR);
  shoulderL.add(elbowL);
  shoulderR.add(elbowR);
  hipL.add(kneeL);
  hipR.add(kneeR);
  return { hips, torso, head, shoulderL, elbowL, shoulderR, elbowR, hipL, kneeL, hipR, kneeR };
}

// ---------- body shapes for a look ----------
function shapesFor(o) {
  const b = o.build || 1;
  const S = [];
  const add = (s) => { S.push(s); return s; };
  // paint helpers receive shape-local coords; convert to bone coords by adding the shape position
  const boneSpace = (pos, fn) => (x, y, z) => fn(x + pos[0], y + pos[1], z + pos[2]);

  // pelvis + belt
  const pelvisPos = [0, 0.0, 0];
  add({ type: 'ell', bone: 'hips', pos: pelvisPos, r: [0.168 * b, 0.12, 0.122], k: 0, color: o.pants,
    paint: boneSpace(pelvisPos, (x, y, z) => {
      if (y > 0.045 && y < 0.1) return Math.abs(x) < 0.024 && z > 0.06 ? 0xb8b0c8 : o.belt;
      return null;
    }) });

  // torso (waist, chest, trapezius) painted with the outfit
  const torsoPaint = o.vest
    ? (x, y, z) => {
      if (y > 0.5) return o.shirt;
      const front = z > 0.03;
      if (front && y > 0.07 && y < 0.5) {
        const tieW = 0.017 + (0.5 - y) * 0.03;
        if (y > 0.455 && Math.abs(x) < 0.03) return o.tie;
        if (Math.abs(x) < tieW && y > 0.12) return o.tie;
        if (y > 0.24 && Math.abs(x) < (0.1 * (y - 0.24)) / 0.26) return o.shirt;
      }
      return o.vest;
    }
    : (x, y, z) => {
      const front = z > 0.04;
      if (front) {
        if (o.tie && y > 0.2 && y < 0.5 && Math.abs(x) < 0.015 + (0.5 - y) * 0.02) return o.tie;
        if (o.pocket && Math.abs(x) < 0.008) return o.pocket;
        const ax = Math.abs(x);
        if (o.pocket && y > 0.31 && y < 0.42 && ax > 0.05 && ax < 0.14) return y > 0.395 ? 0x111a40 : o.pocket;
      }
      return o.shirt;
    };
  for (const [pos, r, k] of [
    [[0, 0.13, 0], [0.155 * b, 0.165, 0.11], 0.08],
    [[0, 0.345, 0.006], [0.188 * b, 0.19, 0.12], 0.1],
    [[0, 0.5, -0.012], [0.165 * b, 0.07, 0.09], 0.06],
  ]) add({ type: 'ell', bone: 'torso', pos, r, k, color: o.shirt, paint: boneSpace(pos, torsoPaint) });

  for (const side of [-1, 1]) {
    const pos = [side * 0.2 * b, 0.462, 0];
    add({ type: 'ell', bone: 'torso', pos, r: [0.074 * b, 0.07, 0.074], k: 0.05, color: o.sleeve,
      paint: o.epaulettes ? (x, y) => (y > 0.025 ? o.epaulettes : null) : null });
  }
  // neck with a collar
  add({ type: 'cone', bone: 'torso', pos: [0, 0.5, -0.004], to: [0, 0.17, 0.012], r1: 0.064, r2: 0.054, k: 0.03, color: o.skin,
    paint: (x, y, z) => (y < 0.065 ? o.collar ?? o.shirt : y < 0.085 && z < 0.02 ? o.collar ?? o.shirt : null) });

  // head
  const facePos = [0, 0.072, 0.03];
  add({ type: 'ell', bone: 'head', pos: [0, 0.15, -0.006], r: [0.098, 0.118, 0.11], k: 0, color: o.skin });
  add({ type: 'ell', bone: 'head', pos: facePos, r: [0.077, 0.074, 0.08], k: 0.05, color: o.skin,
    paint: boneSpace(facePos, (x, y, z) => {
      if (z > 0.06 && Math.abs(x) < 0.024 && Math.abs(y - 0.06) < 0.006) return o.lips;
      if (o.mustache && z > 0.06 && Math.abs(x) < 0.034 && y > 0.07 && y < 0.088) return o.hair;
      if (o.stubble && y < 0.098 && z > -0.04) return o.stubble;
      return null;
    }) });
  add({ type: 'ell', bone: 'head', pos: [0, 0.028, 0.068], r: [0.034, 0.03, 0.03], k: 0.03, color: o.stubble || o.skin });
  const browPos = [0, 0.155, 0.074];
  add({ type: 'ell', bone: 'head', pos: browPos, r: [0.08, 0.028, 0.036], k: 0.03, color: o.skin,
    paint: boneSpace(browPos, (x, y, z) => (y > 0.163 && z > 0.07 && Math.abs(x) > 0.012 && Math.abs(x) < 0.074 ? o.hair : null)) });
  add({ type: 'cone', bone: 'head', pos: [0, 0.142, 0.098], to: [0, -0.046, 0.022], r1: 0.011, r2: 0.017, k: 0.016, color: o.skin });
  for (const side of [-1, 1]) add({ type: 'ell', bone: 'head', pos: [side * 0.097, 0.12, -0.006], r: [0.016, 0.03, 0.022], k: 0.012, color: o.skin });
  add({ type: 'ell', bone: 'head', pos: [0, 0.176, -0.016], r: [0.104, 0.105, 0.118], k: 0.01, color: o.hair });
  if (o.longHair) add({ type: 'ell', bone: 'head', pos: [0, 0.07, -0.06], r: [0.108, 0.16, 0.072], k: 0.03, color: o.hair });
  if (o.ponytail) add({ type: 'cone', bone: 'head', pos: [0, 0.16, -0.11], to: [0, -0.2, -0.04], r1: 0.034, r2: 0.016, k: 0.02, color: o.hair });
  if (o.quiff) add({ type: 'ell', bone: 'head', pos: [0, 0.252, 0.042], rot: [-0.45, 0, 0], r: [0.072, 0.034, 0.064], k: 0.03, color: o.hair });
  if (o.cap) {
    const crownPos = [0, 0.222, -0.008];
    add({ type: 'ell', bone: 'head', pos: crownPos, r: [0.112, 0.062, 0.122], k: 0.006, color: o.cap });
    add({ type: 'box', bone: 'head', pos: [0, 0.198, 0.106], rot: [0.28, 0, 0], half: [0.09, 0.007, 0.05], round: 0.006, k: 0.004, color: o.cap });
  }

  // arms
  for (const side of [-1, 1]) {
    const sh = side < 0 ? 'shoulderL' : 'shoulderR';
    const el = side < 0 ? 'elbowL' : 'elbowR';
    add({ type: 'cone', bone: sh, pos: [0, 0, 0], to: [0, -0.29, 0], r1: 0.062 * b, r2: 0.05, k: 0.04, color: o.sleeve });
    add({ type: 'cone', bone: el, pos: [0, 0, 0], to: [0, -0.24, 0], r1: 0.05, r2: 0.036, k: 0.03, color: o.forearm,
      paint: (x, y) => {
        if (o.cuff && y > -0.055) return o.cuff;
        if (o.watch && side < 0 && y < -0.198 && y > -0.222) return o.watch;
        return null;
      } });
    if (o.cuff) add({ type: 'cone', bone: el, pos: [0, 0.012, 0], to: [0, -0.06, 0], r1: 0.058, r2: 0.056, k: 0.014, color: o.cuff });
    add({ type: 'ell', bone: el, pos: [0, -0.305, 0.008], r: [0.024, 0.062, 0.044], k: 0.03, color: o.skin });
    add({ type: 'cone', bone: el, pos: [0, -0.268, 0.036], to: [0, -0.05, 0.016], r1: 0.013, r2: 0.011, k: 0.014, color: o.skin });
  }

  // legs
  for (const side of [-1, 1]) {
    const hp = side < 0 ? 'hipL' : 'hipR';
    const kn = side < 0 ? 'kneeL' : 'kneeR';
    add({ type: 'cone', bone: hp, pos: [0, 0, 0], to: [0, -0.43, 0], r1: 0.088 * b, r2: 0.062, k: 0.05, color: o.pants });
    add({ type: 'cone', bone: kn, pos: [0, 0, 0], to: [0, -0.39, -0.006], r1: 0.06, r2: 0.045, k: 0.03, color: o.pants });
    add({ type: 'ell', bone: kn, pos: [0, -0.13, -0.02], r: [0.054, 0.1, 0.054], k: 0.04, color: o.pants });
    const shoePos = [0, -0.435, 0.045];
    add({ type: 'box', bone: kn, pos: shoePos, half: [0.048, 0.036, 0.12], round: 0.03, k: 0.02, color: o.shoes, rigid: true,
      paint: (x, y) => (y < -0.022 ? 0x050508 : null) });
  }
  return S;
}

// ---------- props attached to bones ----------
function propGeometry(o, body, bones) {
  const parts = [];
  const head = bones.head;
  const toHead = (p) => head.worldToLocal(p.clone());
  const charPoint = (bone, x, y, z) => bone.localToWorld(new THREE.Vector3(x, y, z));
  const fwd = new THREE.Vector3(0, 0, 1);
  const eyeY = 0.135;
  const eyes = [-1, 1].map((side) => toHead(body.surfacePoint(charPoint(head, side * 0.037, eyeY, 0), fwd)));
  if (o.glasses) {
    for (const [i, e] of eyes.entries()) {
      const side = i === 0 ? -1 : 1;
      const lens = new THREE.SphereGeometry(0.034, 14, 8);
      lens.scale(1.05, 0.68, 0.28);
      lens.rotateY(side * -0.18);
      lens.translate(e.x + side * 0.004, e.y + 0.004, e.z + 0.012);
      parts.push(paint(lens, 0x08070e));
    }
    const bridge = new THREE.BoxGeometry(0.026, 0.007, 0.008).translate(0, eyes[0].y + 0.012, eyes[0].z + 0.018);
    parts.push(paint(bridge, 0x08070e));
    for (const side of [-1, 1]) {
      const temple = new THREE.BoxGeometry(0.006, 0.007, 0.11).translate(side * 0.1, eyes[0].y + 0.012, eyes[0].z - 0.045);
      parts.push(paint(temple, 0x08070e));
    }
  } else {
    for (const e of eyes) {
      parts.push(paint(new THREE.SphereGeometry(0.0115, 12, 8).scale(1.2, 0.8, 1).translate(e.x, e.y, e.z - 0.0065), 0xe8e2da));
      parts.push(paint(new THREE.SphereGeometry(0.0062, 10, 6).translate(e.x, e.y, e.z + 0.0015), 0x1a120c));
    }
  }
  if (o.cap && o.badge) {
    const front = toHead(body.surfacePoint(charPoint(head, 0, 0.235, 0), fwd));
    const shield = new THREE.CylinderGeometry(0.02, 0.016, 0.006, 6).rotateX(Math.PI / 2).translate(front.x, front.y, front.z + 0.002);
    parts.push(paint(shield, o.badge));
  }
  if (o.headphones) {
    const band = new THREE.TorusGeometry(0.118, 0.011, 6, 18, Math.PI).translate(0, 0.15, -0.01);
    parts.push(paint(band, 0x1a1626));
    for (const side of [-1, 1]) {
      const cup = new THREE.CylinderGeometry(0.036, 0.036, 0.03, 14).rotateZ(Math.PI / 2).translate(side * 0.112, 0.13, -0.008);
      parts.push(paint(cup, o.phones || 0x22d3ee));
    }
  }
  return merge(parts);
}

function beltRing(body, bones) {
  const hips = bones.hips;
  const c = hips.localToWorld(new THREE.Vector3(0, 0.07, 0));
  const rx = body.surfacePoint(c, new THREE.Vector3(1, 0, 0)).distanceTo(c) + 0.004;
  const rzF = body.surfacePoint(c, new THREE.Vector3(0, 0, 1)).distanceTo(c) + 0.004;
  const rzB = body.surfacePoint(c, new THREE.Vector3(0, 0, -1)).distanceTo(c) + 0.004;
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const rz = Math.sin(a) > 0 ? rzF : rzB;
    pts.push(new THREE.Vector3(Math.cos(a) * rx, 0.07, Math.sin(a) * rz));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.005, 4, true);
}

/** Small rigid props on the torso (the guards' chest badge). */
function torsoPropGeometry(o, body, bones) {
  if (!o.badge) return null;
  const torso = bones.torso;
  const p = torso.worldToLocal(body.surfacePoint(torso.localToWorld(new THREE.Vector3(-0.1, 0.45, 0)), new THREE.Vector3(0, 0, 1)).clone());
  const parts = [
    paint(new THREE.CylinderGeometry(0.026, 0.02, 0.008, 6).rotateX(Math.PI / 2).translate(p.x, p.y, p.z + 0.003), o.badge),
    paint(new THREE.BoxGeometry(0.03, 0.008, 0.006).translate(p.x, p.y + 0.035, p.z + 0.002), 0xd8d0e8),
  ];
  return merge(parts);
}

const cache = new Map();
let bodyMaterial = null;
function assetsFor(o) {
  const key = o.id || o;
  if (cache.has(key)) return cache.get(key);
  const bones = makeSkeleton(o.build || 1);
  const holder = new THREE.Group();
  holder.add(bones.hips);
  holder.updateMatrixWorld(true);
  const skinish = new Set([o.skin, o.lips, o.stubble].filter((c) => c != null));
  const leatherish = new Set([o.shoes, o.belt, o.watch, o.badge, 0x050508, 0xb8b0c8].filter((c) => c != null));
  const typeOf = (hex) => (skinish.has(hex) ? 0 : hex === o.hair ? 1 : leatherish.has(hex) ? 2 : 3);
  const body = buildBody({ shapes: shapesFor(o), bones, cell: o.cell || 0.013, typeOf });
  const assets = { body, props: propGeometry(o, body, bones), torsoProps: torsoPropGeometry(o, body, bones), belt: beltRing(body, bones) };
  cache.set(key, assets);
  return assets;
}

/** Builds the meshes for the given looks one per animation frame, so the page stays responsive. */
export async function prewarmCharacters(looks) {
  for (const look of looks) {
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    assetsFor(look);
  }
}

export function createCharacter(o) {
  const { body, props, torsoProps, belt } = assetsFor(o);
  const root = new THREE.Group();
  const bones = makeSkeleton(o.build || 1);
  root.add(bones.hips);
  root.updateMatrixWorld(true);

  bodyMaterial = bodyMaterial || createBodyMaterial();
  const skinned = new THREE.SkinnedMesh(body.geometry, bodyMaterial);
  skinned.frustumCulled = false;
  root.add(skinned);
  const skeleton = new THREE.Skeleton(body.boneNames.map((n) => bones[n]));
  skinned.bind(skeleton);

  bones.head.add(new THREE.Mesh(props, M.character));
  if (torsoProps) bones.torso.add(new THREE.Mesh(torsoProps, M.character));

  const accentMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: o.accent || 0, emissiveIntensity: 1.2 });
  if (o.accent) bones.hips.add(new THREE.Mesh(belt, accentMat));

  let flashlight = null;
  let lens = null;
  if (o.flashlight) {
    flashlight = new THREE.Group();
    flashlight.position.set(0, -0.31, 0.04);
    flashlight.rotation.x = Math.PI / 2;
    flashlight.add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.21, 10).rotateX(Math.PI / 2), M.trim));
    lens = new THREE.Mesh(new THREE.CircleGeometry(0.032, 10), new THREE.MeshBasicMaterial({ color: 0xffe7b0 }));
    lens.position.z = 0.106;
    flashlight.add(lens);
    bones.elbowR.add(flashlight);
  }

  const carryAnchor = new THREE.Group();
  carryAnchor.position.set(0, 0.18, 0.36);
  bones.torso.add(carryAnchor);

  const hips = bones.hips;
  const torso = bones.torso;
  const head = bones.head;
  const armL = { shoulder: bones.shoulderL, elbow: bones.elbowL };
  const armR = { shoulder: bones.shoulderR, elbow: bones.elbowR };
  const legL = { hip: bones.hipL, knee: bones.kneeL };
  const legR = { hip: bones.hipR, knee: bones.kneeR };

  // ---------- procedural animation ----------
  let phase = 0;
  let breath = 0;
  const lerp = (a, b, k) => a + (b - a) * k;
  const set = (obj, prop, target, k) => { obj.rotation[prop] = lerp(obj.rotation[prop], target, k); };

  /** pose: { speed, crouch, carry, kneel, lookYaw, flashlightUp } */
  function animate(dt, pose) {
    const k = 1 - Math.exp(-12 * dt);
    const speed = pose.speed || 0;
    phase += speed * dt * 3.3;
    breath += dt * 2.2;
    const amt = Math.min(1, speed / 3);
    const s = Math.sin(phase);
    const c = Math.cos(phase);

    let hipY = HIP - 0.02 * amt + Math.abs(c) * 0.035 * amt;
    let lean = 0.04 + speed * 0.025;
    let thighL = s * 0.55 * amt;
    let thighR = -s * 0.55 * amt;
    let kneeL = (0.08 + Math.max(0, -c) * 0.9) * amt + 0.05;
    let kneeR = (0.08 + Math.max(0, c) * 0.9) * amt + 0.05;
    let shL = -s * 0.5 * amt;
    let shR = s * 0.5 * amt;
    let elL = -0.15 - 0.35 * amt;
    let elR = -0.15 - 0.35 * amt;
    let shZ = 0.1;
    let sway = c * 0.04 * amt;

    if (pose.crouch) {
      hipY = 0.5 + Math.abs(c) * 0.02 * amt;
      lean = 0.5;
      thighL = -1.2 + s * 0.3 * amt;
      thighR = -1.2 - s * 0.3 * amt;
      kneeL = 2.0 - Math.max(0, s) * 0.4 * amt;
      kneeR = 2.0 - Math.max(0, -s) * 0.4 * amt;
      shL = -0.35 - s * 0.25 * amt;
      shR = -0.35 + s * 0.25 * amt;
      elL = elR = -0.7;
      shZ = 0.16;
    }
    if (pose.kneel) {
      hipY = 0.5;
      lean = 0.3;
      thighL = -1.4;
      kneeL = 1.4;
      thighR = 0.1;
      kneeR = 1.5;
      shL = -0.7 + Math.sin(breath * 3) * 0.04;
      shR = -0.75 - Math.sin(breath * 3) * 0.04;
      elL = elR = -0.8;
      sway = 0;
    }
    if (pose.seated) {
      const t = breath;
      hipY = 0.6;
      lean = 0.14 + Math.sin(t * 0.37) * 0.04;
      thighL = thighR = -1.35;
      kneeL = kneeR = 1.35;
      const typing = pose.typing ? 1 : 0;
      shL = -0.62 + Math.sin(t * 9.1) * 0.03 * typing;
      shR = -0.62 + Math.sin(t * 8.3 + 1) * 0.03 * typing;
      elL = -0.95 + Math.sin(t * 13.7) * 0.06 * typing;
      elR = -0.95 + Math.sin(t * 12.9 + 2) * 0.06 * typing;
      shZ = 0.14;
      sway = 0;
    }
    if (pose.carry) {
      shL = shR = -0.75;
      elL = elR = -0.95;
      shZ = 0.02;
      lean = 0.1;
    }
    if (pose.flashlightUp && !pose.carry) {
      shR = -0.85 + s * 0.08 * amt;
      elR = -0.55;
    }

    hips.position.y = lerp(hips.position.y, hipY, k);
    hips.rotation.y = lerp(hips.rotation.y, sway, k);
    torso.rotation.x = lerp(torso.rotation.x, lean, k);
    torso.rotation.y = lerp(torso.rotation.y, -sway * 2, k);
    torso.scale.y = 1 + Math.sin(breath) * 0.008;
    set(legL.hip, 'x', thighL, k);
    set(legR.hip, 'x', thighR, k);
    set(legL.knee, 'x', kneeL, k);
    set(legR.knee, 'x', kneeR, k);
    set(armL.shoulder, 'x', shL, k);
    set(armR.shoulder, 'x', shR, k);
    set(armL.shoulder, 'z', -shZ, k);
    set(armR.shoulder, 'z', shZ, k);
    set(armL.elbow, 'x', elL, k);
    set(armR.elbow, 'x', elR, k);
    head.rotation.y = lerp(head.rotation.y, pose.lookYaw || 0, k * 0.6);
    head.rotation.x = lerp(head.rotation.x, pose.seated ? 0.12 : -lean * 0.6, k);
  }

  function setAccent(color) {
    accentMat.emissive.setHex(color);
  }

  return { root, hips, torso, head, armL, armR, legL, legR, carryAnchor, flashlight, lens, animate, setAccent, skinned };
}

/** Soft round shadow decal under a character. */
export function blobShadow(radius = 0.45) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 16).rotateX(-Math.PI / 2), M.blob);
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}
