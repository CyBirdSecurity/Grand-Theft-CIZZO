// The ACME Corp ground floor as data. No Three.js here so plain Node tests can import it.
// 1 tile = 2 m. Tile (col,row) centre is x = col*2+1, z = row*2+1. North is -Z (row 0).

export const TILE = 2;

export const MAP = [
  '####################',
  '#..d.#..d.#r.r..r.r#',
  '#....#....#.......C#',
  '#....#....#r.r..r.r#',
  '##ggD#gDgg##S#######',
  '#.........K........#',
  '########D###########',
  '#....#.............g',
  '#.dd.D.cc.cc.cc.ss.g',
  '#.dd.#.cc.cc.cc.sk.g',
  '#....#.............g',
  '##D########D########',
  '#E.P...............#',
  '####################',
];

export const COLS = 20;
export const ROWS = 14;

export const LEGEND = {
  '#': { name: 'wall', blocksMove: true, blocksSight: true },
  g: { name: 'glass', blocksMove: true, blocksSight: false },
  '.': { name: 'floor', blocksMove: false, blocksSight: false },
  D: { name: 'door', blocksMove: 'closed', blocksSight: 'closed' },
  K: { name: 'keycardDoor', blocksMove: 'closed', blocksSight: 'closed' },
  S: { name: 'serverDoor', blocksMove: 'closed', blocksSight: 'closed' },
  d: { name: 'desk', blocksMove: true, blocksSight: 'crouched' },
  c: { name: 'cubicle', blocksMove: true, blocksSight: 'crouched' },
  s: { name: 'securityDesk', blocksMove: true, blocksSight: 'crouched' },
  r: { name: 'serverRack', blocksMove: true, blocksSight: true },
  k: { name: 'keycard', blocksMove: false, blocksSight: false },
  C: { name: 'computer', blocksMove: true, blocksSight: false },
  P: { name: 'spawn', blocksMove: false, blocksSight: false },
  E: { name: 'exit', blocksMove: false, blocksSight: false },
};

export const DOOR_CHARS = 'DKS';
export const LOW_COVER_CHARS = 'dcs';

export const tileAt = (c, r) => (r < 0 || r >= ROWS || c < 0 || c >= COLS ? '#' : MAP[r][c]);
export const tileCenter = (c, r) => ({ x: c * TILE + TILE / 2, z: r * TILE + TILE / 2 });
export const worldToTile = (x, z) => ({ c: Math.floor(x / TILE), r: Math.floor(z / TILE) });

export function findTiles(ch) {
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (MAP[r][c] === ch) out.push({ c, r });
  return out;
}

/** Walkable for reachability when locks are ignored (doors count as open). */
export const passableIgnoringLocks = (ch) => !'#gdcsrC'.includes(ch);

/** True for tiles whose up/down neighbours are solid, i.e. the tile sits in a north-south wall line. */
export function runsNorthSouth(c, r) {
  const solid = (ch) => '#gDKS'.includes(ch);
  return solid(tileAt(c, r - 1)) && solid(tileAt(c, r + 1));
}

// Mission areas
export const OPEN_OFFICE = { colMin: 6, colMax: 18, rowMin: 7, rowMax: 10 };

export const MISSION_ORDER = [
  'INFILTRATE',
  'GET_KEYCARD',
  'REACH_SERVER_ROOM',
  'PICK_LOCK',
  'STEAL_COMPUTER',
  'ESCAPE',
  'COMPLETE',
];

export const OBJECTIVES = {
  INFILTRATE: 'Get inside. Find the security desk.',
  GET_KEYCARD: 'Grab the keycard from the security desk.',
  REACH_SERVER_ROOM: 'Use the keycard on the north corridor door.',
  PICK_LOCK: 'Pick the server room lock.',
  STEAL_COMPUTER: 'Steal the target computer.',
  ESCAPE: 'Get out through the loading dock.',
  COMPLETE: '',
};

// Respawn points used by checkpoints (safe tiles out of the guards' opening sight lines).
// `facing` uses the character convention: forward = (sin f, cos f), so
// north (-Z) = PI, east (+X) = PI/2, south = 0, west = -PI/2.
export const SPAWNS = {
  START: { c: 3, r: 12, facing: Math.PI / 2 },
  REACH_SERVER_ROOM: { c: 9, r: 5, facing: Math.PI / 2 },
  STEAL_COMPUTER: { c: 12, r: 3, facing: Math.PI / 2 },
};

export const CHECKPOINT_STATES = ['REACH_SERVER_ROOM', 'STEAL_COMPUTER'];

// Guard patrols, as tile waypoints. Paths between waypoints are found with A*.
export const GUARD_ROUTES = [
  { id: 'G1', name: 'Lobby', route: [[17, 7], [17, 10], [13, 10], [13, 7]], mode: 'loop', pause: 0.8, activeFrom: 'INFILTRATE' },
  { id: 'G2', name: 'Floor', route: [[6, 7], [6, 10], [12, 10], [12, 7], [9, 7]], mode: 'loop', pause: 2, activeFrom: 'INFILTRATE' },
  { id: 'G3', name: 'Corridor', route: [[1, 5], [9, 5]], mode: 'pingpong', pause: 1.5, activeFrom: 'REACH_SERVER_ROOM' },
];

// Night-shift office workers seated at desks (ambient; they wear headphones). look = WORKER_LOOKS index.
export const WORKERS = [
  { c: 7, r: 8, look: 0 },
  { c: 11, r: 8, look: 1 },
  { c: 10, r: 9, look: 2 },
  { c: 14, r: 9, look: 3 },
  { c: 8, r: 1, look: 2 },
];

// Where the objective marker points for each mission state.
export const OBJECTIVE_TARGETS = {
  INFILTRATE: { c: 16.5, r: 8.5, y: 2.2 },
  GET_KEYCARD: { char: 'k', y: 1.4 },
  REACH_SERVER_ROOM: { char: 'K', y: 2.8 },
  PICK_LOCK: { char: 'S', y: 2.8 },
  STEAL_COMPUTER: { char: 'C', y: 2.2 },
  ESCAPE: { char: 'E', y: 1.6 },
};

// Decoration (no gameplay effect beyond a small collider). Positions in world metres.
export const DECOR = [
  { type: 'vending', x: 2.6, z: 14.45, rotY: 0 },
  { type: 'cooler', x: 8.9, z: 14.4, rotY: 0 },
  { type: 'plant', x: 9.4, z: 21.5 },
  { type: 'plant', x: 38.4, z: 14.5 },
  { type: 'plant', x: 12.3, z: 21.6 },
  { type: 'plant', x: 2.5, z: 2.5 },
  { type: 'plant', x: 18.5, z: 2.5 },
  { type: 'plant', x: 37.5, z: 24.5 },
  { type: 'whiteboard', x: 4.4, z: 2.06, rotY: 0 },
  { type: 'whiteboard', x: 14.2, z: 2.06, rotY: 0 },
  { type: 'crates', x: 9, z: 24.5 },
  { type: 'crates', x: 31, z: 24.5 },
];

export const SIGN = { x: 31, y: 2.05, z: 14.04 }; // ACME logo on the lobby's north wall
export const SOC_SCREENS = [
  { x: 30, y: 1.55, z: 2.04, w: 2.4, h: 1.0 },
  { x: 30, y: 1.55, z: 7.96, w: 2.4, h: 0.9, rotY: Math.PI },
];

// Neon strips on the ceiling: [x1, z1, x2, z2, colour]
export const CEILING_STRIPS = [
  [2, 11, 38, 11, 'purple'],
  [2, 25, 38, 25, 'magenta'],
  [13, 15.5, 37, 15.5, 'cyan'],
  [13, 20.5, 37, 20.5, 'cyan'],
  [24, 5, 38, 5, 'magenta'],
  [2, 19, 9, 19, 'purple'],
  [2, 5, 9, 5, 'cyan'],
  [12, 5, 19, 5, 'cyan'],
];

// Overhead ceiling light panels: [x, z, rotY]. Each also gets a soft light pool on the floor.
export const CEILING_LIGHTS = [
  [6, 4, 0], [15, 4, 0], // offices
  [26, 5, 0], [34, 5, 0], // server room
  [5, 11, Math.PI / 2], [13, 11, Math.PI / 2], [25, 11, Math.PI / 2], [33, 11, Math.PI / 2], // corridor
  [6, 18, 0], // break room
  [16, 18, 0], [22, 18, 0], [28, 18, 0], [34, 18, 0], // open office / lobby
  [6, 25, Math.PI / 2], [15, 25, Math.PI / 2], [24, 25, Math.PI / 2], [33, 25, Math.PI / 2], // back hallway
];

// Point lights in priority order: the quality tier keeps the first N.
export const LIGHTS = [
  { x: 31, y: 2.7, z: 18, color: 'sunset', intensity: 30, distance: 18 },
  { x: 30, y: 2.7, z: 5, color: 'magenta', intensity: 26, distance: 16 },
  { x: 17, y: 2.7, z: 18, color: 'cyan', intensity: 24, distance: 18 },
  { x: 12, y: 2.7, z: 11, color: 'purple', intensity: 22, distance: 20 },
  { x: 14, y: 2.7, z: 25, color: 'purple', intensity: 22, distance: 20 },
  { x: 6, y: 2.7, z: 16, color: 'sunset', intensity: 18, distance: 14 },
];
