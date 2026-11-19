// Plain Node check of the level data: row widths and reachability of every objective.
import assert from 'node:assert/strict';
import { MAP, COLS, ROWS, findTiles, tileAt, passableIgnoringLocks, GUARD_ROUTES, SPAWNS } from '../js/level/map.js';

assert.equal(MAP.length, ROWS, `map has ${MAP.length} rows, expected ${ROWS}`);
MAP.forEach((row, r) => assert.equal(row.length, COLS, `row ${r} is ${row.length} wide`));

const start = findTiles('P');
assert.equal(start.length, 1, 'exactly one spawn P');
const seen = new Set();
const queue = [start[0]];
seen.add(`${start[0].c},${start[0].r}`);
while (queue.length) {
  const { c, r } = queue.shift();
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nc = c + dc;
    const nr = r + dr;
    const k = `${nc},${nr}`;
    if (seen.has(k) || !passableIgnoringLocks(tileAt(nc, nr))) continue;
    seen.add(k);
    queue.push({ c: nc, r: nr });
  }
}
const reachable = ({ c, r }) => seen.has(`${c},${r}`) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => seen.has(`${c + dc},${r + dr}`));
for (const ch of ['k', 'K', 'S', 'C', 'E']) {
  const tiles = findTiles(ch);
  assert.equal(tiles.length, 1, `exactly one ${ch}`);
  assert.ok(reachable(tiles[0]), `${ch} at ${tiles[0].c},${tiles[0].r} is not reachable from P`);
}
for (const g of GUARD_ROUTES) for (const [c, r] of g.route) assert.ok(seen.has(`${c},${r}`), `${g.id} waypoint ${c},${r} is not walkable/reachable`);
for (const [name, s] of Object.entries(SPAWNS)) assert.ok(seen.has(`${s.c},${s.r}`), `spawn ${name} is not reachable`);
console.log(`map ok: ${COLS}x${ROWS}, ${seen.size} reachable tiles, all objectives, waypoints and spawns reachable`);
