// Builds one seamless, skinned character mesh from a set of blended shapes.
//
// 1. Each shape (ellipsoid, round cone, round box) is a signed distance function attached to a
//    bone. Shapes are combined with a smooth minimum so they melt into each other.
// 2. The field is meshed once with naive surface nets, vertices are projected onto the surface
//    and get normals from the field gradient (fully smooth shading).
// 3. Vertex colours come from the nearest shape (with optional paint functions for clothing
//    details), and skin weights from the distance to each bone's shapes.
import * as THREE from 'three';

const BIG = 1e9;

function sdEllipsoid(x, y, z, rx, ry, rz) {
  const ax = x / rx, ay = y / ry, az = z / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / rx, by = ay / ry, bz = az / rz;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

/** Round cone from the origin to b with radii r1 (at origin) and r2 (at b). */
function sdRoundCone(px, py, pz, bx, by, bz, r1, r2) {
  const l2 = bx * bx + by * by + bz * bz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const y = px * bx + py * by + pz * bz;
  const z = y - l2;
  const qx = px * l2 - bx * y;
  const qy = py * l2 - by * y;
  const qz = pz * l2 - bz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

function sdRoundBox(x, y, z, bx, by, bz, r) {
  const qx = Math.abs(x) - bx + r;
  const qy = Math.abs(y) - by + r;
  const qz = Math.abs(z) - bz + r;
  const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

function smin(a, b, k) {
  const m = a < b ? a : b;
  if (k <= 0) return m;
  const diff = a > b ? a - b : b - a;
  if (diff >= k) return m;
  const h = (k - diff) / k;
  return m - h * h * k * 0.25;
}

/**
 * shapes: [{ type: 'ell'|'cone'|'box', bone, pos:[x,y,z], rot?:[x,y,z], k, color, paint?(lx,ly,lz) ,
 *            r:[rx,ry,rz] (ell) | to:[x,y,z], r1, r2 (cone) | half:[x,y,z], round (box) }]
 * bones: { name: THREE.Bone } already posed in the bind pose with world matrices updated.
 */
export function buildBody({ shapes, bones, cell = 0.012, sigma = 0.02, typeOf = () => 3, smooth = 4 }) {
  const boneNames = Object.keys(bones);
  const boneIndex = Object.fromEntries(boneNames.map((n, i) => [n, i]));

  // ---- compile shapes into character space ----
  const tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const prims = shapes.map((s) => {
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...s.pos),
      s.rot ? q.setFromEuler(new THREE.Euler(...s.rot)) : q.identity(),
      new THREE.Vector3(1, 1, 1),
    );
    const world = tmp.copy(bones[s.bone].matrixWorld).multiply(local).clone();
    const inv = world.clone().invert().elements;
    let cLocal;
    let radius;
    if (s.type === 'ell') { cLocal = [0, 0, 0]; radius = Math.max(...s.r); }
    else if (s.type === 'cone') { cLocal = s.to.map((t) => t / 2); radius = Math.hypot(...s.to) / 2 + Math.max(s.r1, s.r2); }
    else { cLocal = [0, 0, 0]; radius = Math.hypot(...s.half); }
    v.set(...cLocal).applyMatrix4(world);
    return { ...s, inv, pi: 0, cx: v.x, cy: v.y, cz: v.z, R: radius + (s.k || 0) + cell * 3, bi: boneIndex[s.bone] };
  });

  // flatten shape parameters for the hot loops
  prims.forEach((p, i) => {
    p.pi = i;
    p.t = p.type === 'ell' ? 0 : p.type === 'cone' ? 1 : 2;
    const a = p.type === 'ell' ? p.r : p.type === 'cone' ? p.to : p.half;
    p.a0 = a[0]; p.a1 = a[1]; p.a2 = a[2];
    p.b0 = p.type === 'cone' ? p.r1 : p.round || 0;
    p.b1 = p.type === 'cone' ? p.r2 : 0;
    p.kk = p.k || 0;
    p.R2 = p.R * p.R;
  });
  const local = [0, 0, 0];
  function toLocal(p, x, y, z) {
    const e = p.inv;
    local[0] = e[0] * x + e[4] * y + e[8] * z + e[12];
    local[1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    local[2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    return local;
  }
  function primDist(p, x, y, z) {
    const e = p.inv;
    const lx = e[0] * x + e[4] * y + e[8] * z + e[12];
    const ly = e[1] * x + e[5] * y + e[9] * z + e[13];
    const lz = e[2] * x + e[6] * y + e[10] * z + e[14];
    if (p.t === 0) return sdEllipsoid(lx, ly, lz, p.a0, p.a1, p.a2);
    if (p.t === 1) return sdRoundCone(lx, ly, lz, p.a0, p.a1, p.a2, p.b0, p.b1);
    return sdRoundBox(lx, ly, lz, p.a0, p.a1, p.a2, p.b0);
  }
  const near = (p, x, y, z) => {
    const dx = x - p.cx;
    const dy = y - p.cy;
    const dz = z - p.cz;
    return dx * dx + dy * dy + dz * dz < p.R2;
  };
  function field(x, y, z, list = prims) {
    let d = BIG;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const dx = x - p.cx;
      const dy = y - p.cy;
      const dz = z - p.cz;
      if (dx * dx + dy * dy + dz * dz >= p.R2) continue;
      const di = primDist(p, x, y, z);
      d = d === BIG ? di : smin(d, di, p.kk);
    }
    return d === BIG ? cell * 4 : d;
  }

  // ---- sample the field on a grid ----
  let minX = BIG, minY = BIG, minZ = BIG, maxX = -BIG, maxY = -BIG, maxZ = -BIG;
  for (const p of prims) {
    const r = p.R;
    minX = Math.min(minX, p.cx - r); maxX = Math.max(maxX, p.cx + r);
    minY = Math.min(minY, p.cy - r); maxY = Math.max(maxY, p.cy + r);
    minZ = Math.min(minZ, p.cz - r); maxZ = Math.max(maxZ, p.cz + r);
  }
  const nx = Math.ceil((maxX - minX) / cell) + 1;
  const ny = Math.ceil((maxY - minY) / cell) + 1;
  const nz = Math.ceil((maxZ - minZ) / cell) + 1;
  const vals = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);

  // Coarse blocks of B^3 cells: each keeps the shapes that can reach it, and blocks far from
  // the surface are filled without sampling every point.
  const B = 4;
  const bx = Math.ceil(nx / B);
  const by = Math.ceil(ny / B);
  const bz = Math.ceil(nz / B);
  const blockLists = new Array(bx * by * bz);
  const half = (B * cell) / 2;
  const blockDiag = Math.sqrt(3) * half;
  for (let K = 0; K < bz; K++) {
    for (let J = 0; J < by; J++) {
      for (let I = 0; I < bx; I++) {
        const cx = minX + (I * B) * cell + half;
        const cy = minY + (J * B) * cell + half;
        const cz = minZ + (K * B) * cell + half;
        const list = prims.filter((p) => {
          const dx = Math.max(Math.abs(p.cx - cx) - half, 0);
          const dy = Math.max(Math.abs(p.cy - cy) - half, 0);
          const dz = Math.max(Math.abs(p.cz - cz) - half, 0);
          return dx * dx + dy * dy + dz * dz < p.R * p.R;
        });
        blockLists[I + bx * (J + by * K)] = list;
        const i0 = I * B, j0 = J * B, k0 = K * B;
        const i1 = Math.min(nx, i0 + B + 1), j1 = Math.min(ny, j0 + B + 1), k1 = Math.min(nz, k0 + B + 1);
        const dc = list.length ? field(cx, cy, cz, list) : cell * 4;
        if (Math.abs(dc) > blockDiag + cell * 1.5) {
          const fill = dc > 0 ? Math.max(cell * 2, dc - blockDiag) : Math.min(-cell * 2, dc + blockDiag);
          for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
            const n = id(i, j, k);
            if (vals[n] === 0) vals[n] = fill;
          }
          continue;
        }
        for (let k = k0; k < k1; k++) {
          const z = minZ + k * cell;
          for (let j = j0; j < j1; j++) {
            const y = minY + j * cell;
            for (let i = i0; i < i1; i++) vals[id(i, j, k)] = field(minX + i * cell, y, z, list);
          }
        }
      }
    }
  }
  const listAt = (x, y, z) => {
    const I = Math.min(bx - 1, Math.max(0, Math.floor((x - minX) / (B * cell))));
    const J = Math.min(by - 1, Math.max(0, Math.floor((y - minY) / (B * cell))));
    const K = Math.min(bz - 1, Math.max(0, Math.floor((z - minZ) / (B * cell))));
    return blockLists[I + bx * (J + by * K)];
  };

  // ---- surface nets: one vertex per cell that crosses the surface ----
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const CX = [0, 1, 0, 1, 0, 1, 0, 1];
  const CY = [0, 0, 1, 1, 0, 0, 1, 1];
  const CZ = [0, 0, 0, 0, 1, 1, 1, 1];
  const coff = CX.map((_, c) => CX[c] + nx * (CY[c] + ny * CZ[c]));
  const EA = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3];
  const EB = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      let base = nx * (j + ny * k);
      for (let i = 0; i < nx - 1; i++, base++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = vals[base + coff[c]];
          cv[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let e = 0; e < 12; e++) {
          const a = EA[e];
          const b = EB[e];
          const va = cv[a];
          const vb = cv[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          sx += CX[a] + (CX[b] - CX[a]) * t;
          sy += CY[a] + (CY[b] - CY[a]) * t;
          sz += CZ[a] + (CZ[b] - CZ[a]) * t;
          n++;
        }
        cellVert[base] = pos.length / 3;
        pos.push(minX + (i + sx / n) * cell, minY + (j + sy / n) * cell, minZ + (k + sz / n) * cell);
      }
    }
  }

  // project vertices onto the surface and take normals from the gradient
  const vcount = pos.length / 3;
  const normals = new Float32Array(vcount * 3);
  const eps = cell * 0.25;
  const grad = (x, y, z, L) => {
    const gx = field(x + eps, y, z, L) - field(x - eps, y, z, L);
    const gy = field(x, y + eps, z, L) - field(x, y - eps, z, L);
    const gz = field(x, y, z + eps, L) - field(x, y, z - eps, L);
    const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    return [gx / l, gy / l, gz / l];
  };
  for (let vi = 0; vi < vcount; vi++) {
    let x = pos[vi * 3];
    let y = pos[vi * 3 + 1];
    let z = pos[vi * 3 + 2];
    const L = listAt(x, y, z);
    const d = field(x, y, z, L);
    const g = grad(x, y, z, L);
    pos[vi * 3] = x - g[0] * d;
    pos[vi * 3 + 1] = y - g[1] * d;
    pos[vi * 3 + 2] = z - g[2] * d;
    normals[vi * 3] = g[0];
    normals[vi * 3 + 1] = g[1];
    normals[vi * 3 + 2] = g[2];
  }

  // faces: a quad around every grid edge whose ends have different signs
  const index = [];
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // orient against the field gradient at the quad centre (outward = +gradient)
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const wx = pos[c * 3] - ax, wy = pos[c * 3 + 1] - ay, wz = pos[c * 3 + 2] - az;
    const fx = uy * wz - uz * wy;
    const fy = uz * wx - ux * wz;
    const fz = ux * wy - uy * wx;
    const nxv = normals[a * 3] + normals[c * 3];
    const nyv = normals[a * 3 + 1] + normals[c * 3 + 1];
    const nzv = normals[a * 3 + 2] + normals[c * 3 + 2];
    if (fx * nxv + fy * nyv + fz * nzv >= 0) index.push(a, b, c, a, c, d);
    else index.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const inside = vals[id(i, j, k)] < 0;
        if (inside !== vals[id(i + 1, j, k)] < 0) quad(cellVert[id(i, j, k)], cellVert[id(i, j - 1, k)], cellVert[id(i, j - 1, k - 1)], cellVert[id(i, j, k - 1)]);
        if (inside !== vals[id(i, j + 1, k)] < 0) quad(cellVert[id(i, j, k)], cellVert[id(i - 1, j, k)], cellVert[id(i - 1, j, k - 1)], cellVert[id(i, j, k - 1)]);
        if (inside !== vals[id(i, j, k + 1)] < 0) quad(cellVert[id(i, j, k)], cellVert[id(i - 1, j, k)], cellVert[id(i - 1, j - 1, k)], cellVert[id(i, j - 1, k)]);
      }
    }
  }

  // ---- colours and skin weights ----
  const colors = new Float32Array(vcount * 3);
  const mtype = new Float32Array(vcount * 3);
  const skinIndex = new Uint16Array(vcount * 4);
  const skinWeight = new Float32Array(vcount * 4);
  const dists = new Float32Array(prims.length);
  const boneW = new Float32Array(boneNames.length);
  const offs = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((o) => o.map((c) => c * cell * 0.95));
  const tint = new THREE.Color();
  // material types: 0 skin, 1 hair, 2 leather/metal, 3 fabric
  const tw = [0, 0, 0, 0];
  const shapeColor = (p, x, y, z) => {
    tw[0] = tw[1] = tw[2] = tw[3] = 0;
    if (!p.paint) {
      tint.setHex(p.color);
      tw[typeOf(p.color)] = 1;
      return [tint.r, tint.g, tint.b];
    }
    let r = 0, g = 0, bl = 0;
    for (const [ox, oy, oz] of offs) {
      const [lx, ly, lz] = toLocal(p, x + ox, y + oy, z + oz);
      const hex = p.paint(lx, ly, lz) ?? p.color;
      tint.setHex(hex);
      r += tint.r; g += tint.g; bl += tint.b;
      tw[typeOf(hex)] += 1 / offs.length;
    }
    return [r / offs.length, g / offs.length, bl / offs.length];
  };
  for (let vi = 0; vi < vcount; vi++) {
    const x = pos[vi * 3];
    const y = pos[vi * 3 + 1];
    const z = pos[vi * 3 + 2];
    let best = 0;
    let dmin = BIG;
    const L = listAt(x, y, z);
    dists.fill(BIG);
    for (const p of L) {
      const pi = p.pi;
      const d = primDist(p, x, y, z);
      dists[pi] = d;
      if (d < dmin) { dmin = d; best = pi; }
    }
    const bp = prims[best];
    // blend colours of shapes that are almost equally close, for soft seams between shapes
    let wr = 0, wg = 0, wb = 0, ws = 0;
    let m0 = 0, m1 = 0, m2 = 0;
    for (let pi = 0; pi < prims.length; pi++) {
      if (dists[pi] === BIG) continue;
      const w = Math.exp(-(dists[pi] - dmin) / (cell * 0.35));
      if (w < 0.05) continue;
      const [cr, cg, cb] = shapeColor(prims[pi], x, y, z);
      wr += cr * w; wg += cg * w; wb += cb * w; ws += w;
      m0 += tw[0] * w; m1 += tw[1] * w; m2 += tw[2] * w;
    }
    colors[vi * 3] = wr / ws;
    colors[vi * 3 + 1] = wg / ws;
    colors[vi * 3 + 2] = wb / ws;
    mtype[vi * 3] = m0 / ws;
    mtype[vi * 3 + 1] = m1 / ws;
    mtype[vi * 3 + 2] = m2 / ws;

    boneW.fill(0);
    for (let pi = 0; pi < prims.length; pi++) {
      if (dists[pi] === BIG || prims[pi].noSkin) continue;
      const w = Math.exp(-Math.max(0, dists[pi] - dmin) / sigma);
      if (w > boneW[prims[pi].bi]) boneW[prims[pi].bi] = w;
    }
    // shapes flagged rigid (shoes, hands, head pieces) keep their own bone only
    if (bp.rigid) { boneW.fill(0); boneW[bp.bi] = 1; }
    const order = [...boneW.keys()].sort((a, b) => boneW[b] - boneW[a]).slice(0, 4);
    let sum = 0;
    for (const b of order) sum += boneW[b];
    order.forEach((b, s) => {
      skinIndex[vi * 4 + s] = b;
      skinWeight[vi * 4 + s] = sum > 0 ? boneW[b] / sum : s === 0 ? 1 : 0;
    });
  }

  // Taubin smoothing (shrink-free): irons out the grid ripples of the surface-nets mesh
  const P = new Float32Array(pos);
  if (smooth > 0) {
    // compact neighbour lists (CSR) from triangle edges; shared edges appear twice, which is fine
    const deg = new Int32Array(vcount + 1);
    for (let t = 0; t < index.length; t++) deg[index[t] + 1] += 2;
    for (let v = 0; v < vcount; v++) deg[v + 1] += deg[v];
    const nbr = new Int32Array(deg[vcount]);
    const fill = deg.slice(0, vcount);
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t], b = index[t + 1], c = index[t + 2];
      nbr[fill[a]++] = b; nbr[fill[a]++] = c;
      nbr[fill[b]++] = a; nbr[fill[b]++] = c;
      nbr[fill[c]++] = a; nbr[fill[c]++] = b;
    }
    const tmpP = new Float32Array(P.length);
    const pass = (f) => {
      for (let v = 0; v < vcount; v++) {
        const s0 = deg[v];
        const s1 = deg[v + 1];
        if (s1 === s0) { tmpP[v * 3] = P[v * 3]; tmpP[v * 3 + 1] = P[v * 3 + 1]; tmpP[v * 3 + 2] = P[v * 3 + 2]; continue; }
        let ax = 0, ay = 0, az = 0;
        for (let n = s0; n < s1; n++) {
          const u = nbr[n] * 3;
          ax += P[u]; ay += P[u + 1]; az += P[u + 2];
        }
        const inv = 1 / (s1 - s0);
        tmpP[v * 3] = P[v * 3] + f * (ax * inv - P[v * 3]);
        tmpP[v * 3 + 1] = P[v * 3 + 1] + f * (ay * inv - P[v * 3 + 1]);
        tmpP[v * 3 + 2] = P[v * 3 + 2] + f * (az * inv - P[v * 3 + 2]);
      }
      P.set(tmpP);
    };
    for (let it = 0; it < smooth; it++) { pass(0.5); pass(-0.53); }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('mtype', new THREE.BufferAttribute(mtype, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geom.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geom.setIndex(index);
  if (smooth > 0) geom.computeVertexNormals();
  geom.computeBoundingSphere();

  /** March from `origin` along `dir` (character space) to the surface; returns the hit point. */
  function surfacePoint(origin, dir, max = 0.5) {
    let t = 0;
    const p = new THREE.Vector3();
    for (let i = 0; i < 200 && t < max; i++) {
      p.copy(origin).addScaledVector(dir, t);
      const d = field(p.x, p.y, p.z, listAt(p.x, p.y, p.z));
      if (d >= 0 && i > 0) return p;
      t += Math.max(0.002, Math.abs(d) * 0.5);
    }
    return p;
  }

  return { geometry: geom, boneNames, field, surfacePoint };
}
