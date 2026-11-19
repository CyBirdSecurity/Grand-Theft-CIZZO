// Playwright smoke test: desktop + phone viewports, fails on any console error.
// Usage: python3 -m http.server 8080  (in another terminal), then  node tests/smoke.mjs
// Env: GTC_URL (default http://localhost:8080/), PW_CHANNEL=chrome to use an installed Chrome.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const BASE = process.env.GTC_URL || 'http://localhost:8080/';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const wait = (page, ms) => page.waitForTimeout(ms);
const failures = [];

async function run(name, contextOpts, fn, query = '?debug') {
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + query);
    await page.waitForFunction(() => window.__GTC && window.__GTC.state === 'TITLE');
    await page.screenshot({ path: `${OUT}${name}-title.png` });
    await fn(page);
    assert.deepEqual(errors, [], `${name}: console errors`);
    console.log(`✓ ${name}`);
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.log(`✗ ${name}: ${e.message}`);
    await page.screenshot({ path: `${OUT}${name}-failure.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

const key = async (page, code, ms = 80) => {
  await page.keyboard.down(code);
  await wait(page, ms);
  await page.keyboard.up(code);
};

// 1. Desktop: title -> brief -> play, walk, look around, draw-call budget.
await run('desktop', { viewport: { width: 1280, height: 720 } }, async (page) => {
  await page.click('[data-action="play"]');
  await page.click('[data-action="start"]');
  await page.evaluate(() => __GTC.skipIntro());
  await key(page, 'KeyW', 1200);
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(800, 380, { steps: 8 });
  await page.mouse.up();
  await wait(page, 500);
  const s = await page.evaluate(() => ({ state: __GTC.state, x: __GTC.player.pos.x, calls: __GTC.drawCalls }));
  assert.equal(s.state, 'PLAYING');
  assert.ok(s.x > 7.5, `player should have moved east (x=${s.x})`);
  await page.screenshot({ path: `${OUT}desktop-play.png` });
  await page.evaluate(() => __GTC.setQuality('high'));
  await wait(page, 800);
  const calls = await page.evaluate(() => __GTC.drawCalls);
  assert.ok(calls < 120, `draw calls ${calls} exceed 120 at high quality`);
  assert.equal(await page.evaluate(() => document.getElementById('fallback').hidden), true, 'fallback screen shown after a quality change');
  assert.ok(calls > 10, `scene should still render after a quality change (calls=${calls})`);
  await page.evaluate(() => __GTC.teleportTile(15, 9, Math.PI / 2));
  await wait(page, 600);
  await page.screenshot({ path: `${OUT}desktop-lobby.png` });
});

// 2. Phone (iPhone 13 landscape): touch joystick reaches input.state.move.
await run('phone', { ...devices['iPhone 13 landscape'] }, async (page) => {
  await page.evaluate(() => __GTC.newGame({ skipIntro: true }));
  await wait(page, 300);
  const move = await page.evaluate(async () => {
    const layer = document.getElementById('touch');
    const ev = (type, x, y) => layer.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
    ev('pointerdown', 120, 260);
    ev('pointermove', 120, 200);
    await new Promise((r) => setTimeout(r, 120));
    const m = { ...__GTC.input.state.move };
    await new Promise((r) => setTimeout(r, 600));
    ev('pointerup', 120, 200);
    return m;
  });
  assert.ok(move.y > 0.5, `joystick drag should give forward move (got ${JSON.stringify(move)})`);
  await page.screenshot({ path: `${OUT}phone-play.png` });
});

// 3. Full mission with guards disabled (stub-free: real lockpick with a fixed seed).
await run('mission', { viewport: { width: 1280, height: 720 } }, async (page) => {
  await page.evaluate(() => __GTC.newGame({ skipIntro: true }));
  const step = async (fn, ms = 300) => { await page.evaluate(fn); await wait(page, ms); };
  await step(() => __GTC.teleportTile(15, 8, Math.PI / 2));
  assert.equal(await page.evaluate(() => __GTC.missions.state), 'GET_KEYCARD');
  await step(() => __GTC.teleportTile(17, 9, Math.PI));
  await key(page, 'KeyE');
  await wait(page, 200);
  assert.equal(await page.evaluate(() => __GTC.missions.state), 'REACH_SERVER_ROOM');
  await step(() => __GTC.teleport(19.6, 11, Math.PI / 2), 900);
  assert.equal(await page.evaluate(() => __GTC.missions.state), 'PICK_LOCK');
  await step(() => __GTC.teleport(25, 10.3, Math.PI));
  await key(page, 'KeyE');
  await wait(page, 200);
  assert.equal(await page.evaluate(() => __GTC.state), 'LOCKPICK');
  await page.screenshot({ path: `${OUT}mission-lockpick.png` });
  // 40 degrees off: a pick breaks in about 1.2 s of game time (headless can run below 20 fps,
  // where the clamped dt makes wall-clock time longer, so measure with the game clock)
  const broke = await page.evaluate(async () => {
    const lp = __GTC.lockpick;
    lp.setAim(lp.sweet + 40);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    const t0 = __GTC.stats.time;
    const w0 = performance.now();
    while (lp.picks === 3 && performance.now() - w0 < 6000) await new Promise((r) => setTimeout(r, 16));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    return __GTC.stats.time - t0;
  });
  assert.ok(broke > 1.1 && broke < 1.45, `pick broke after ${broke.toFixed(2)} s of game time`);
  await page.evaluate(() => __GTC.lockpick.setAim(__GTC.lockpick.sweet));
  await key(page, 'Space', 1100);
  await wait(page, 900);
  assert.equal(await page.evaluate(() => __GTC.missions.state), 'STEAL_COMPUTER');
  await step(() => __GTC.teleport(35.9, 5, Math.PI / 2));
  await key(page, 'KeyE');
  await wait(page, 200);
  assert.equal(await page.evaluate(() => __GTC.missions.state), 'ESCAPE');
  await step(() => __GTC.teleport(5, 25, -Math.PI / 2), 200);
  await key(page, 'KeyW', 1100);
  await wait(page, 500);
  assert.equal(await page.evaluate(() => __GTC.state), 'RESULTS');
  await page.screenshot({ path: `${OUT}mission-results.png` });
}, '?debug&noguards&seed=42');

// 4. Stealth: standing in G1's path gets caught, then respawn at the checkpoint with alert 0.
await run('stealth', { viewport: { width: 1280, height: 720 } }, async (page) => {
  await page.evaluate(() => __GTC.newGame({ skipIntro: true }));
  await page.evaluate(() => __GTC.teleportTile(17, 9, Math.PI));
  await wait(page, 100);
  await key(page, 'KeyE');
  await page.evaluate(() => { const g = __GTC.guards.list[0]; __GTC.teleport(g.pos.x, g.pos.z + 3.5, Math.PI); });
  await page.waitForFunction(() => __GTC.cinematic === 'caught', null, { timeout: 10000 });
  await page.screenshot({ path: `${OUT}stealth-busted.png` });
  await page.waitForFunction(() => __GTC.cinematic === null, null, { timeout: 6000 });
  const s = await page.evaluate(() => ({ m: __GTC.missions.state, a: __GTC.alert.value, x: __GTC.player.pos.x, z: __GTC.player.pos.z }));
  assert.equal(s.m, 'REACH_SERVER_ROOM');
  assert.equal(s.a, 0);
  assert.deepEqual([s.x, s.z], [19, 11]);
  // crouched behind cubicles while G2 passes keeps the alert low
  await page.evaluate(() => { __GTC.newGame({ skipIntro: true }); __GTC.teleport(19, 19.6, 0); });
  await key(page, 'KeyC');
  await wait(page, 6000);
  const peak = await page.evaluate(() => __GTC.alert.peak);
  assert.ok(peak < 30, `crouched behind cubicles, peak alert ${peak}`);
});

if (failures.length) {
  console.error(`\n${failures.length} failing:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nAll smoke tests passed. Screenshots in ${OUT}`);
