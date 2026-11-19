// Tunable constants. Every gameplay number lives here.

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

// Debug tools (FPS / draw-call overlay, free camera, window.__GTC) only work on a local dev
// server, so ?debug does nothing on the live site.
const host = typeof location !== 'undefined' ? location.hostname : '';
const LOCAL_HOST = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
  || host.endsWith('.localhost') || host.endsWith('.test') || host === '';
export const DEBUG = LOCAL_HOST && params.has('debug');
export const DEBUG_NO_GUARDS = DEBUG && params.has('noguards');
export const DEBUG_SEED = DEBUG && params.has('seed') ? Number(params.get('seed')) || 1 : null;
export const DEBUG_QUALITY = DEBUG ? params.get('quality') : null;

export const PALETTE = {
  night: 0x0b0820,
  violet: 0x2a1b5c,
  purple: 0x7b2ff7,
  magenta: 0xff3ea5,
  cyan: 0x22d3ee,
  sunset: 0xff8a3d,
  ink: 0xf5f0ff,
  red: 0xff2a3d,
  amber: 0xffc23d,
  green: 0x3dff9a,
};

export const WORLD = {
  tile: 2,
  wallHeight: 3,
  maxDt: 0.05,
  fogNear: 22,
  fogFar: 75,
};

export const PLAYER = {
  walkSpeed: 3.2,
  crouchSpeed: 1.6,
  carrySpeed: 2.2,
  radius: 0.35,
  accel: 14,
  keyTurnSpeed: 2.6, // rad/s when turning with keys / stick / joystick
  backwardMul: 0.6,
  noiseWalk: 4,
  noiseCrouch: 1,
  noiseCarry: 6,
  moveThreshold: 0.15, // m/s below which the player counts as standing still
  strideWalk: 0.7, // metres per footstep
  strideCrouch: 0.55,
};

export const CAMERA = {
  distance: 4,
  tightDistance: 2.5,
  height: 1.6,
  shoulder: 0.35,
  pitchMin: -10,
  pitchMax: 60,
  pitchDefault: 16,
  fov: 62,
  near: 0.1,
  far: 160,
  mouseSens: 0.0024, // rad per pixel
  dragSens: 0.005,
  touchSens: 0.0065,
  padSens: 2.6, // rad per second at full stick
  pad: 0.25, // distance kept from walls
  minDistance: 0.6,
  pullInRate: 30,
  easeOutRate: 4,
  followRate: 14,
  yawFollowRate: 14, // how quickly the camera swings back behind the player
};

export const GUARD = {
  patrolSpeed: 1.6,
  suspiciousSpeed: 2,
  alertSpeed: 3.6,
  lookAroundTime: 3,
  catchDistance: 1.0,
  fov: 70,
  range: 9,
  rangeCrouched: 5,
  radius: 0.3,
  turnRate: 6,
  eyeHeight: 1.6,
  coneRays: 18,
  coneStep: 0.25,
  repathInterval: 0.4,
  waypointReach: 0.2,
  barkTime: 1.8,
  noticeStopAt: 0, // speed while noticing below the suspicious threshold
};

export const ALERT = {
  riseRate: 35,
  nearDist: 3,
  nearMul: 2,
  farDist: 6,
  farMul: 0.5,
  suspicious: 30,
  alert: 70,
  max: 100,
  drainRate: 10,
  drainDelay: 2,
  labels: ['MONITORING', 'ANOMALY', 'SOC ALERT'],
};

export const DOOR = {
  openDist: 1.5,
  speed: 3.2, // openness per second
  height: 2.3,
  thickness: 0.18,
  colliderThickness: 0.3,
  passableAt: 0.6, // openness above which the door no longer blocks
};

export const INTERACT = {
  range: 1.6,
  minDot: 0.2,
  closeRange: 0.7, // inside this the "in front" test is skipped
};

export const LOCKPICK = {
  sweetMin: -80,
  sweetMax: 80,
  tolFull: 8,
  tolPartial: 30,
  partialMaxRotation: 72,
  minRotation: 6,
  aimMin: -90,
  aimMax: 90,
  openAngle: 90,
  picks: 3,
  strainBreak: 1.2,
  strainRecover: 2,
  turnSpeed: 150,
  returnSpeed: 260,
  aimKeySpeed: 80, // degrees per second at full key/stick
  aimDragSens: 0.45, // degrees per pixel
  noiseInterval: 1,
  noiseRadius: 3,
  clickStep: 6, // degrees between aim clicks
  refillDistance: 5, // step this far from the door to get new picks
  exhaustedCloseDelay: 1.2,
};

export const CAUGHT = {
  slowmo: 0.25,
  slowmoTime: 1.2,
  restartDelay: 2.8,
};

export const SCORING = {
  twoStarPeak: 60,
  threeStarPeak: 10,
  threeStarTime: 240,
};

export const QUALITY = {
  low: { pixelRatio: 1, bloom: 'off', lights: 2, antialias: false },
  medium: { pixelRatio: 1.5, bloom: 'half', lights: 4, antialias: true },
  high: { pixelRatio: 2, bloom: 'full', lights: 6, antialias: true },
};

export const BLOOM = { strength: 0.6, radius: 0.4, threshold: 0.7 };

export const MINIMAP = { px: 8, guardRange: 10 };

export const INTRO = { duration: 6.5 };

export const INPUT = {
  deadzone: 0.18,
  joystickRadius: 56,
  leftZone: 0.4,
  menuRepeat: 0.28,
};

export const AUDIO = {
  bpm: 96,
  lookahead: 0.25,
  tensionMax: 0.22,
  musicBase: 0.55,
};

export const DEFAULT_SETTINGS = {
  quality: null, // null = auto-detect on first run
  lookSens: 1,
  invertY: false,
  music: 0.6,
  sfx: 0.8,
  showCones: true,
  reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  largeText: false,
};
