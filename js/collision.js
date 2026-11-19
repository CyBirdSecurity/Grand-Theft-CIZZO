// 2D (XZ) circle-vs-AABB collision with wall sliding, grid line of sight (DDA over tiles)
// and a 3D segment cast for the camera.
import { COLS, ROWS, TILE, tileAt } from './level/map.js';

export function createCollision(level) {
  const grid = Array.from({ length: COLS * ROWS }, () => []);
  for (const col of level.colliders) {
    const c0 = Math.max(0, Math.floor(col.minX / TILE));
    const c1 = Math.min(COLS - 1, Math.floor((col.maxX - 1e-6) / TILE));
    const r0 = Math.max(0, Math.floor(col.minZ / TILE));
    const r1 = Math.min(ROWS - 1, Math.floor((col.maxZ - 1e-6) / TILE));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r * COLS + c].push(col);
  }

  let stamp = 0;
  const seen = new Map();
  const scratch = [];
  function nearby(minX, maxX, minZ, maxZ) {
    stamp++;
    scratch.length = 0;
    const c0 = Math.max(0, Math.floor(minX / TILE));
    const c1 = Math.min(COLS - 1, Math.floor(maxX / TILE));
    const r0 = Math.max(0, Math.floor(minZ / TILE));
    const r1 = Math.min(ROWS - 1, Math.floor(maxZ / TILE));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (const col of grid[r * COLS + c]) {
          if (seen.get(col) === stamp) continue;
          seen.set(col, stamp);
          scratch.push(col);
        }
      }
    }
    return scratch;
  }

  /** Pushes the circle at p ({x,z}) out of every enabled collider. `ignore(col)` can skip some. */
  function resolveCircle(p, radius, ignore = null) {
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      const list = nearby(p.x - radius, p.x + radius, p.z - radius, p.z + radius);
      for (const b of list) {
        if (!b.enabled || (ignore && ignore(b))) continue;
        const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (radius - d);
          p.z += (dz / d) * (radius - d);
        } else {
          const l = p.x - b.minX;
          const r = b.maxX - p.x;
          const t = p.z - b.minZ;
          const bt = b.maxZ - p.z;
          const m = Math.min(l, r, t, bt);
          if (m === l) p.x = b.minX - radius;
          else if (m === r) p.x = b.maxX + radius;
          else if (m === t) p.z = b.minZ - radius;
          else p.z = b.maxZ + radius;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return p;
  }

  function tileBlocksSight(c, r, crouched) {
    const ch = tileAt(c, r);
    if (ch === '#' || ch === 'r') return true;
    if (ch === 'D' || ch === 'K' || ch === 'S') {
      const d = level.doorAt(c, r);
      return !d || d.collider.enabled;
    }
    if (crouched && (ch === 'd' || ch === 'c' || ch === 's')) return true;
    return false;
  }

  /** Grid DDA from a to b; applies the sight rules of the tile table. */
  function lineOfSight(a, b, { crouched = false } = {}) {
    const x0 = a.x / TILE;
    const z0 = a.z / TILE;
    const x1 = b.x / TILE;
    const z1 = b.z / TILE;
    let c = Math.floor(x0);
    let r = Math.floor(z0);
    const ce = Math.floor(x1);
    const re = Math.floor(z1);
    const sc = c;
    const sr = r;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const stepC = dx > 0 ? 1 : -1;
    const stepR = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? c + 1 - x0 : x0 - c) * tdx : Infinity;
    let tmz = dz !== 0 ? (dz > 0 ? r + 1 - z0 : z0 - r) * tdz : Infinity;
    for (let n = 0; n < 64; n++) {
      const isEnd = c === ce && r === re;
      if (!(c === sc && r === sr) && !isEnd && tileBlocksSight(c, r, crouched)) return false;
      if (isEnd || Math.min(tmx, tmz) > 1) return true;
      if (tmx < tmz) { tmx += tdx; c += stepC; } else { tmz += tdz; r += stepR; }
    }
    return true;
  }

  /** How far a standing-height ray travels before a tall blocker (for drawing vision cones). */
  function sightDistance(x, z, angle, maxDist, step = 0.25) {
    const dx = Math.sin(angle);
    const dz = Math.cos(angle);
    const sc = Math.floor(x / TILE);
    const sr = Math.floor(z / TILE);
    for (let d = step; d <= maxDist; d += step) {
      const px = x + dx * d;
      const pz = z + dz * d;
      const c = Math.floor(px / TILE);
      const r = Math.floor(pz / TILE);
      if ((c !== sc || r !== sr) && tileBlocksSight(c, r, false)) return Math.max(0, d - step * 0.5);
    }
    return maxDist;
  }

  /** Fraction (0..1) along the 3D segment from -> to before it hits a collider box. */
  function segmentCast(from, to, pad = 0) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const list = nearby(Math.min(from.x, to.x) - 1, Math.max(from.x, to.x) + 1, Math.min(from.z, to.z) - 1, Math.max(from.z, to.z) + 1);
    let best = 1;
    for (const b of list) {
      if (!b.enabled) continue;
      let tmin = 0;
      let tmax = 1;
      const axes = [
        [from.x, dx, b.minX - pad, b.maxX + pad],
        [from.y, dy, b.minY, b.maxY + pad],
        [from.z, dz, b.minZ - pad, b.maxZ + pad],
      ];
      let hit = true;
      for (const [o, d, mn, mx] of axes) {
        if (Math.abs(d) < 1e-8) {
          if (o < mn || o > mx) { hit = false; break; }
        } else {
          let t1 = (mn - o) / d;
          let t2 = (mx - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { hit = false; break; }
        }
      }
      if (hit && tmin < best) best = tmin;
    }
    return best;
  }

  return { resolveCircle, lineOfSight, sightDistance, segmentCast, tileBlocksSight, nearby };
}
