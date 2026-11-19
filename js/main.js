// Boot, renderer + post-processing, game loop and state switching.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { DEBUG, DEBUG_QUALITY, PALETTE, WORLD, CAMERA, BLOOM, CAUGHT, INTRO } from './config.js';
import { MISSION_ORDER, SPAWNS, tileCenter, findTiles } from './level/map.js';
import { buildLevel } from './level/build.js';
import { createCollision } from './collision.js';
import { createInput, isTouchDevice } from './input.js';
import { detectTier, tierSettings, pixelRatioFor, TIERS } from './quality.js';
import { createSave } from './save.js';
import { createAudio } from './audio.js';
import { createPlayer } from './player.js';
import { prewarmCharacters, CIZZO, GUARD_LOOKS } from './character.js';
import { createCameraRig } from './camera.js';
import { createGuards } from './guards.js';
import { createWorkers } from './workers.js';
import { createAlert } from './alert.js';
import { createInteract } from './interact.js';
import { createLockpick } from './lockpick.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createMenus, starsFor } from './menus.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

function showFallback(msg) {
  const fb = document.getElementById('fallback');
  if (msg) document.getElementById('fallback-msg').textContent = msg;
  fb.hidden = false;
}

async function boot() {
  // Show the title art straight away and build everything else behind it.
  const titleEl = document.getElementById('screen-title');
  const loadingEl = document.getElementById('loading');
  titleEl.hidden = false;
  titleEl.querySelectorAll('.menu .btn').forEach((b) => { b.disabled = true; });
  loadingEl.hidden = false;
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  if (!webglAvailable()) { titleEl.hidden = true; showFallback(); return; }
  await prewarmCharacters([CIZZO, ...GUARD_LOOKS]);
  titleEl.querySelectorAll('.menu .btn').forEach((b) => { b.disabled = false; });
  loadingEl.hidden = true;

  const touch = isTouchDevice();
  document.body.classList.toggle('is-touch', touch);

  // ---------- persistence + settings ----------
  const save = createSave();
  const settings = save.settings;
  if (!TIERS.includes(settings.quality)) save.saveSettings({ quality: detectTier() });
  let tier = DEBUG_QUALITY && TIERS.includes(DEBUG_QUALITY) ? DEBUG_QUALITY : settings.quality;
  const applyBodyClasses = () => {
    document.body.classList.toggle('large-text', !!settings.largeText);
    document.body.classList.toggle('reduced-motion', !!settings.reducedMotion);
  };
  applyBodyClasses();

  // ---------- scene ----------
  const container = document.getElementById('game');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.night);
  scene.fog = new THREE.Fog(PALETTE.night, WORLD.fogNear, WORLD.fogFar);
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);

  const audio = createAudio(settings);
  const level = buildLevel(scene);
  const collision = createCollision(level);
  const input = createInput({
    container,
    touchLayer: document.getElementById('touch'),
    joyBase: document.getElementById('joy-base'),
    joyKnob: document.getElementById('joy-knob'),
  });
  input.bindButton(document.getElementById('btn-crouch'), 'crouch');
  input.bindButton(document.getElementById('btn-interact'), 'interact');
  input.bindButton(document.getElementById('btn-pause'), 'pause');

  const player = createPlayer({ scene, collision, audio, settings });
  const rig = createCameraRig(camera, collision, settings);
  const guards = createGuards({ scene, collision, level, audio });
  const workers = createWorkers({ scene });
  guards.setConesVisible(settings.showCones);
  const hud = createHud({ scene, camera, level });
  const interact = createInteract({ player });
  const lockpick = createLockpick({ root: document.getElementById('lockpick'), input, audio, save, settings });

  // ---------- renderer + post ----------
  let renderer = null;
  let composer = null;
  let bloomPass = null;
  let contextLost = false;

  function buildComposer() {
    if (composer) { composer.dispose(); composer = null; bloomPass = null; }
    const q = tierSettings(tier);
    if (q.bloom === 'off') return;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    resize();
  }

  function createRenderer() {
    if (renderer) {
      if (composer) { composer.dispose(); composer = null; }
      // retire the old canvas first so its context-loss event isn't treated as a GPU crash
      renderer.domElement.dataset.retired = '1';
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
    const q = tierSettings(tier);
    try {
      renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance' });
    } catch {
      showFallback();
      throw new Error('WebGL renderer could not be created');
    }
    renderer.setPixelRatio(pixelRatioFor(tier));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.info.autoReset = false;
    renderer.domElement.tabIndex = -1;
    container.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      if (canvas.dataset.retired) return;
      e.preventDefault();
      contextLost = true;
      showFallback('The graphics context was lost. Trying to recover…');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      if (canvas.dataset.retired) return;
      contextLost = false;
      document.getElementById('fallback').hidden = true;
      createRenderer();
    });
    level.setLightCount(q.lights);
    buildComposer();
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!renderer) return;
    renderer.setSize(w, h);
    if (composer) {
      composer.setPixelRatio(pixelRatioFor(tier));
      composer.setSize(w, h);
      if (tierSettings(tier).bloom === 'half' && bloomPass) {
        const pr = pixelRatioFor(tier);
        bloomPass.setSize(Math.round((w * pr) / 2), Math.round((h * pr) / 2));
      }
    }
    checkRotate();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // ---------- rotate overlay ----------
  let rotateDismissed = false;
  const rotateEl = document.getElementById('rotate');
  function checkRotate() {
    rotateEl.hidden = !(touch && !rotateDismissed && window.innerHeight > window.innerWidth);
  }
  document.getElementById('rotate-dismiss').addEventListener('click', () => { rotateDismissed = true; checkRotate(); });

  // ---------- game state ----------
  const app = { state: 'TITLE', cinematic: null, freeCam: false };
  const stats = { time: 0, picks: 0 };
  let timeScale = 1;
  let caughtT = 0;
  let introT = 0;
  let lastCheckpoint = null;
  const serverDoor = level.doorByKind('server');
  const keycardDoor = level.doorByKind('keycard');

  const alert = createAlert({
    onSpotted: () => { audio.spotted(); },
    onAlert: () => { audio.alarm(); rig.shake = 0.15; },
    onCaught: () => caught(),
  });

  const missions = createMissions({
    onChange: (state) => {
      guards.activateFor(state);
      level.exitRing.visible = state === 'ESCAPE';
      if (state === 'ESCAPE') hud.toast('Get to the loading dock!', 'magenta');
    },
    onCheckpoint: (state) => {
      lastCheckpoint = state;
      save.saveCheckpoint({ state, time: stats.time, picks: stats.picks, peak: alert.peak, spotted: alert.spotted });
      hud.toast('Checkpoint saved');
      audio.checkpoint();
    },
    onComplete: () => finish(),
  });

  level.onDoorOpened = (d) => {
    if (d.kind === 'keycard') missions.advance('REACH_SERVER_ROOM', 'PICK_LOCK');
  };
  level.onDoorSound = (d) => {
    if (Math.hypot(d.x - player.pos.x, d.z - player.pos.z) < 12) audio.door(d.target > 0);
  };

  // ---------- interactables ----------
  interact.register({
    id: 'keycard',
    pos: () => level.keycardHome,
    available: () => level.keycard.visible && !player.hasKeycard,
    label: () => 'Grab keycard',
    action: () => {
      player.hasKeycard = true;
      level.keycard.visible = false;
      audio.pickup();
      hud.toast('Keycard acquired');
      if (missions.state === 'INFILTRATE' || missions.state === 'GET_KEYCARD') missions.set('REACH_SERVER_ROOM');
    },
  });
  interact.register({
    id: 'keycardDoor',
    range: 2.0,
    pos: () => keycardDoor,
    available: () => !player.hasKeycard,
    label: () => 'Locked — keycard required',
  });
  interact.register({
    id: 'serverDoor',
    range: 1.8,
    pos: () => serverDoor,
    available: () => serverDoor.locked && missions.atLeast('PICK_LOCK'),
    label: () => (lockpick.exhausted ? 'Out of picks — step away and come back' : 'Pick lock'),
    canAct: () => !lockpick.exhausted,
    action: () => { if (!lockpick.exhausted) startLockpick(); },
  });
  interact.register({
    id: 'computer',
    range: 1.7,
    pos: () => level.computerHome,
    available: () => missions.state === 'STEAL_COMPUTER' && !player.carrying,
    label: () => 'Steal the computer',
    action: () => {
      player.carry(level.computer);
      audio.pickup();
      hud.toast('Computer acquired — it’s heavy', 'magenta');
      missions.advance('STEAL_COMPUTER', 'ESCAPE');
    },
  });

  lockpick.onNoise = (r) => guards.hear(player.pos, r);
  lockpick.onBreak = () => { stats.picks++; };

  // ---------- world reset ----------
  function applyWorld(state = 'INFILTRATE') {
    missions.reset(state);
    const idx = MISSION_ORDER.indexOf(state);
    const hasKeycard = idx >= MISSION_ORDER.indexOf('REACH_SERVER_ROOM');
    const serverUnlocked = idx >= MISSION_ORDER.indexOf('STEAL_COMPUTER');
    level.resetDoors({ hasKeycard, serverUnlocked });
    level.keycard.visible = !hasKeycard;
    level.root.add(level.computer);
    level.computer.position.set(level.computerHome.x, 0.94, level.computerHome.z);
    level.computer.rotation.set(0, Math.PI / 2, 0);
    level.exitRing.visible = state === 'ESCAPE';
    const sp = SPAWNS[state] || SPAWNS.START;
    const p = tileCenter(sp.c, sp.r);
    player.reset({ x: p.x, z: p.z, facing: sp.facing, hasKeycard });
    guards.reset(state);
    alert.reset();
    lockpick.resetPicks();
    rig.snapBehind(player.facing);
    hud.clearBarks();
    timeScale = 1;
  }

  // ---------- flow ----------
  function enterPlaying() {
    app.state = 'PLAYING';
    menus.hideAll();
    hud.show(true);
    document.getElementById('touch').hidden = !touch;
    input.setPointerLockWanted(!touch);
    if (!composer && tierSettings(tier).bloom !== 'off') buildComposer();
    audio.startMusic();
  }

  function newGame({ skipIntro = false } = {}) {
    save.clearCheckpoint();
    lastCheckpoint = null;
    stats.time = 0;
    stats.picks = 0;
    alert.resetRun();
    lockpick.broken = 0;
    applyWorld('INFILTRATE');
    enterPlaying();
    if (!skipIntro && !settings.reducedMotion) startIntro();
  }

  function continueGame() {
    const cp = save.checkpoint;
    if (!cp) { newGame(); return; }
    lastCheckpoint = cp.state;
    stats.time = cp.time || 0;
    stats.picks = cp.picks || 0;
    alert.resetRun();
    alert.peak = cp.peak || 0;
    alert.spotted = cp.spotted || 0;
    applyWorld(cp.state);
    enterPlaying();
    hud.toast('Resumed from checkpoint');
  }

  function restartFromCheckpoint() {
    applyWorld(lastCheckpoint || 'INFILTRATE');
    app.cinematic = null;
    document.getElementById('busted').hidden = true;
  }

  function pause() {
    if (app.state === 'LOCKPICK') endLockpick('cancel');
    if (app.state !== 'PLAYING') return;
    app.state = 'PAUSED';
    input.setPointerLockWanted(false);
    input.releaseAll();
    document.getElementById('touch').hidden = true;
    menus.show('pause');
  }

  function resume() {
    if (app.state !== 'PAUSED') return;
    enterPlaying();
  }

  function quitToTitle() {
    app.state = 'TITLE';
    app.cinematic = null;
    hud.show(false);
    document.getElementById('touch').hidden = true;
    document.getElementById('busted').hidden = true;
    document.getElementById('intro-skip').hidden = true;
    lockpick.close();
    input.setPointerLockWanted(false);
    // free GPU memory held by post-processing targets while the title is up
    if (composer) { composer.dispose(); composer = null; bloomPass = null; }
    renderer.renderLists.dispose();
    menus.show('title');
  }

  function startLockpick() {
    app.state = 'LOCKPICK';
    player.kneeling = true;
    player.crouched = false;
    player.facing = Math.atan2(serverDoor.x - player.pos.x, serverDoor.z - player.pos.z);
    input.setPointerLockWanted(false);
    lockpick.open(input.state.device);
  }

  function endLockpick(result) {
    lockpick.close();
    player.kneeling = false;
    if (app.state === 'LOCKPICK') app.state = 'PLAYING';
    input.setPointerLockWanted(!touch);
    if (result === 'success') {
      serverDoor.locked = false;
      hud.toast('Lock opened');
      missions.advance('PICK_LOCK', 'STEAL_COMPUTER');
    } else if (result === 'exhausted') hud.toast('Out of picks', 'red');
  }

  function caught() {
    if (app.cinematic === 'caught') return;
    if (app.state === 'LOCKPICK') endLockpick('cancel');
    app.cinematic = 'caught';
    caughtT = 0;
    timeScale = settings.reducedMotion ? 1 : CAUGHT.slowmo;
    audio.busted();
    hud.flash('red', 0.9);
    if (!settings.reducedMotion) rig.shake = 0.3;
    document.getElementById('busted').hidden = false;
  }

  const INTRO_KEYS = [
    { pos: new THREE.Vector3(46, 14, 36), look: new THREE.Vector3(26, 0, 16) },
    { pos: new THREE.Vector3(34, 9, 18), look: new THREE.Vector3(30, 0, 4) },
    { pos: new THREE.Vector3(18, 9, 6), look: new THREE.Vector3(10, 0, 12) },
    { pos: new THREE.Vector3(10, 7, 30), look: new THREE.Vector3(7, 0.5, 24) },
  ];
  function startIntro() {
    app.cinematic = 'intro';
    introT = 0;
    document.getElementById('intro-skip').hidden = false;
  }
  function endIntro() {
    app.cinematic = null;
    document.getElementById('intro-skip').hidden = true;
    rig.snapBehind(player.facing);
  }
  function updateIntro(dt) {
    introT += dt;
    const t = Math.min(1, introT / INTRO.duration) * (INTRO_KEYS.length - 1);
    const i = Math.min(INTRO_KEYS.length - 2, Math.floor(t));
    let f = t - i;
    f = f * f * (3 - 2 * f);
    const a = INTRO_KEYS[i];
    const b = INTRO_KEYS[i + 1];
    const pos = a.pos.clone().lerp(b.pos, f);
    const look = a.look.clone().lerp(b.look, f);
    camera.position.copy(pos);
    camera.lookAt(look);
    if (introT >= INTRO.duration || input.state.anyPressed) endIntro();
  }

  function finish() {
    app.state = 'RESULTS';
    input.setPointerLockWanted(false);
    hud.show(false);
    document.getElementById('touch').hidden = true;
    const result = { time: stats.time, peak: alert.peak, spotted: alert.spotted, picks: stats.picks };
    result.stars = starsFor(result);
    result.record = save.recordResult({ time: result.time, stars: result.stars });
    save.clearCheckpoint();
    audio.win();
    menus.showResults(result);
    app.lastResult = result;
  }

  const menus = createMenus({
    input,
    save,
    audio,
    actions: {
      play: () => menus.push('brief'),
      start: () => newGame(),
      continue: () => continueGame(),
      resume: () => resume(),
      restart: () => { restartFromCheckpoint(); enterPlaying(); },
      quit: () => quitToTitle(),
      retry: () => newGame({ skipIntro: true }),
      title: () => quitToTitle(),
      back: () => {
        if (menus.top === 'pause') resume();
        else if (menus.top === 'brief') menus.show('title');
      },
      settingsChanged: (key, value) => {
        if (key === 'quality') { tier = value; createRenderer(); }
        if (key === 'music' || key === 'sfx') audio.setVolumes({ [key]: value });
        if (key === 'showCones') guards.setConesVisible(value);
        if (key === 'reducedMotion' || key === 'largeText') applyBodyClasses();
      },
    },
  });
  document.getElementById('brief-hint').textContent = touch
    ? 'Left thumb moves and turns, right thumb turns and looks. Crouch and interact buttons are on the right.'
    : 'W/S to move, A/D or the mouse to turn, C to crouch, E to interact. Gamepads work too.';

  // ---------- global listeners ----------
  const unlockAudio = () => { audio.unlock(); audio.startMusic(); };
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  window.addEventListener('keydown', unlockAudio, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (app.state === 'PLAYING' || app.state === 'LOCKPICK') && app.cinematic !== 'caught') pause();
  });

  // ---------- debug ----------
  const debugEl = document.getElementById('debug');
  const freeKeys = { up: false, down: false };
  let debugT = 0;
  let fps = 0;
  let frames = 0;
  let fpsT = 0;
  let collidersShown = false;
  if (DEBUG) {
    debugEl.hidden = false;
    window.addEventListener('keydown', (e) => {
      if (app.state !== 'PLAYING') return;
      if (e.code === 'KeyF') {
        app.freeCam = !app.freeCam;
        if (app.freeCam) rig.enterFree(); else rig.mode = 'follow';
      }
      if (e.code === 'KeyO') {
        collidersShown = !collidersShown;
        if (level.debugLines) level.debugLines.visible = collidersShown;
        guards.setDebugRays(collidersShown);
      }
      if (e.code === 'KeyQ') freeKeys.down = true;
      if (e.code === 'KeyR') freeKeys.up = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyQ') freeKeys.down = false;
      if (e.code === 'KeyR') freeKeys.up = false;
    });
  }

  function updateDebug(dt) {
    debugT += dt;
    if (debugT < 0.25) return;
    debugT = 0;
    const st = input.state;
    const info = renderer.info.render;
    debugEl.textContent = [
      `FPS ${fps.toFixed(0)}  calls ${info.calls}  tris ${info.triangles}  tier ${tier}`,
      `state ${app.state}${app.cinematic ? ' / ' + app.cinematic : ''}  mission ${missions.state}`,
      `alert ${alert.value.toFixed(1)} peak ${alert.peak.toFixed(0)} spotted ${alert.spotted}`,
      `pos ${player.pos.x.toFixed(2)}, ${player.pos.z.toFixed(2)}  crouch ${player.crouched}  noise ${player.noise}`,
      `device ${st.device}  move ${st.move.x.toFixed(2)},${st.move.y.toFixed(2)}  aim ${st.aim.toFixed(2)}  turn ${st.turnHeld}`,
      `guards ${guards.list.map((g) => `${g.def.id}:${g.active ? g.state[0] : '-'}`).join(' ')}`,
      app.freeCam ? 'FREE CAM (F) — WASD + mouse, R/Q up/down' : 'F free cam · O colliders/rays',
    ].join('\n');
  }

  // ---------- loop ----------
  let last = performance.now();
  let lastLookDebug = { dx: 0, dy: 0 };

  function updateWorld(dt, realDt) {
    const st = input.state;
    const controllable = app.state === 'PLAYING' && !app.cinematic && !app.freeCam;
    if (controllable) rig.applyLook(st.look);
    player.update(dt, input, controllable);
    const actors = [{ x: player.pos.x, z: player.pos.z, isPlayer: true, hasKeycard: player.hasKeycard }];
    for (const g of guards.list) if (g.active) actors.push({ x: g.pos.x, z: g.pos.z, isPlayer: false });
    level.updateDoors(dt, actors);
    interact.update(input, controllable);

    if (app.cinematic !== 'intro' && !(app.cinematic === 'caught' && caughtT > CAUGHT.slowmoTime)) {
      const seen = guards.update(dt, { player, alertValue: alert.value });
      if (app.cinematic !== 'caught') {
        if (guards.caughtBy) caught();
        alert.update(dt, seen.seen, seen.nearest);
        if (player.noise > 0) guards.hear(player.pos, player.noise);
      }
    }
    if (!app.cinematic) {
      missions.update(player);
      stats.time += dt;
    }
    lockpick.checkRefill(Math.hypot(serverDoor.x - player.pos.x, serverDoor.z - player.pos.z));
    level.update(dt);
    workers.update(realDt);

    if (app.cinematic === 'intro') updateIntro(realDt);
    else if (app.freeCam) rig.updateFree(realDt, st, freeKeys);
    else rig.follow(dt > 0 ? dt : realDt, player.pos, player.crouched || player.kneeling, player.facing);
  }

  function render() {
    if (contextLost) return;
    renderer.info.reset();
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const realDt = Math.min(WORLD.maxDt, Math.max(0, (now - last) / 1000));
    last = now;
    frames++;
    fpsT += realDt;
    if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
    input.update(realDt);
    lastLookDebug = { ...input.state.look };
    const st = input.state;

    if (app.state === 'TITLE' || app.state === 'RESULTS') {
      menus.update();
    } else if (app.state === 'PAUSED') {
      menus.update();
      render();
    } else if (app.state === 'PLAYING' || app.state === 'LOCKPICK') {
      if (app.cinematic === 'caught') {
        caughtT += realDt;
        if (caughtT > CAUGHT.slowmoTime) timeScale = 0;
        if (caughtT > CAUGHT.restartDelay) restartFromCheckpoint();
      } else if (st.pausePressed && !(app.state === 'LOCKPICK' && st.backPressed)) {
        pause();
        input.endFrame();
        render();
        return;
      }
      if (app.state === 'LOCKPICK') {
        const r = lockpick.update(realDt);
        if (r) endLockpick(r);
      }
      const dt = realDt * timeScale;
      updateWorld(dt, realDt);
      hud.update(realDt, {
        missions, alert, player, guards, interact, time: stats.time, device: st.device,
        showMarker: !app.cinematic,
      });
      audio.update(alert.value);
      render();
      if (DEBUG) updateDebug(realDt);
    }
    input.endFrame();
  }

  // ---------- start ----------
  createRenderer();
  applyWorld('INFILTRATE');
  resize();
  menus.show('title');
  requestAnimationFrame(frame);

  if (DEBUG) {
    window.__GTC = {
      THREE, scene, camera, input, missions, alert, player, guards, workers, level, lockpick, rig, hud, stats, save, settings, collision,
      get state() { return app.state; },
      get cinematic() { return app.cinematic; },
      get renderer() { return renderer; },
      get drawCalls() { return renderer.info.render.calls; },
      get fps() { return fps; },
      get tier() { return tier; },
      get lastResult() { return app.lastResult; },
      get lastLook() { return lastLookDebug; },
      teleport(x, z, facing) { player.teleport(x, z, facing); rig.snapBehind(player.facing); },
      teleportTile(c, r, facing) { const p = tileCenter(c, r); this.teleport(p.x, p.z, facing); },
      newGame: (opts) => newGame(opts),
      continueGame,
      pause,
      resume,
      quitToTitle,
      startLockpick,
      skipIntro: () => { if (app.cinematic === 'intro') endIntro(); },
      tileOf: (ch) => findTiles(ch)[0],
      setQuality(t) { tier = t; createRenderer(); },
    };
  }
}

boot();
