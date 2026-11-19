# Grand Theft Cizzo — Build Plan (v1)

Read `CLAUDE.md` first: it holds the stack, constraints, conventions and the definition of
done that apply to every phase below. Work the phases **in order**, one per session (or
PR), and tick the boxes as you go.

## 1. Game summary

| | |
|---|---|
| Genre | Third-person 3D stealth heist |
| Setting | ACME Corp office, ground floor, at night |
| Session length | 5–10 minutes for a first run, about 2 minutes for a speedrun |
| Platforms | Desktop browsers (keyboard + mouse, gamepad) and mobile browsers (touch, landscape) |
| Art | Stylized low poly, neon on dark violet, bloom, all generated in code |
| Fail state | SOC alert meter hits 100%, or a guard reaches you while alerted → restart from the last checkpoint |
| Win state | Carry the stolen computer back to the loading-dock exit |

### Mission flow

```
INFILTRATE ──► GET_KEYCARD ──► REACH_SERVER_ROOM ──► PICK_LOCK ──► STEAL_COMPUTER ──► ESCAPE ──► COMPLETE
 (spawn at       (security       (keycard door        (lockpick     (pick up = carry,   (reach exit
  loading dock)   desk in lobby)  opens corridor)      minigame)     slower + louder)    zone E)
                   ▲ checkpoint 1                      ▲ checkpoint 2
```

| State | Objective text | Completes when |
|---|---|---|
| `INFILTRATE` | "Get inside. Find the security desk." | Player enters the open office (any tile in rows 7–10, cols 6–18) |
| `GET_KEYCARD` | "Grab the keycard from the security desk." | Player interacts with `k` |
| `REACH_SERVER_ROOM` | "Use the keycard on the north corridor door." | Player opens door `K` |
| `PICK_LOCK` | "Pick the server room lock." | Lockpick minigame succeeds at door `S` |
| `STEAL_COMPUTER` | "Steal the target computer." | Player interacts with `C` (now carrying) |
| `ESCAPE` | "Get out through the loading dock." | Player, still carrying, enters `E` |
| `COMPLETE` | — | Results screen |

Checkpoints are saved on entering `REACH_SERVER_ROOM` and `STEAL_COMPUTER`. A checkpoint
stores the mission state, the player position and inventory (keycard). It resets guards to
their patrol start and the alert meter to 0.

### Results and scoring

The results screen shows the time, the peak alert %, the number of times spotted and picks
broken, and a rating of 1–3 stars:

- ★ Completed
- ★★ Completed with peak alert < 60%
- ★★★ Completed without ever being spotted (peak alert < 10%) and in under 4:00

The best time and best stars are saved with `save.js`.

## 2. Level design

**Grid:** 20 × 14 tiles, **1 tile = 2 m**, so the floor is 40 m × 28 m. Tile `(col, row)` has
its centre at world `x = col*2 + 1`, `z = row*2 + 1`. North is −Z (row 0).

```
 col  0         1
      01234567890123456789
row 0 ####################
    1 #..d.#..d.#r.r..r.r#   offices (W, E)        | server room
    2 #....#....#.......C#                         | C = target computer
    3 #....#....#r.r..r.r#                         | r = server racks
    4 ##ggD#gDgg##S#######   glass office fronts    | S = lockpick door
    5 #.........K........#   north corridor; K = keycard door
    6 ########D###########
    7 #....#.............g   break room | open office / lobby (glass street front)
    8 #.dd.D.cc.cc.cc.ss.g               c = cubicle partitions, s = security desk
    9 #.dd.#.cc.cc.cc.sk.g               k = keycard
   10 #....#.............g
   11 ##D########D########
   12 #E.P...............#   back hallway / loading dock; P = spawn, E = exit
   13 ####################
```

| Char | Tile | Blocks movement | Blocks sight |
|---|---|---|---|
| `#` | Wall, 3 m tall | yes | yes |
| `g` | Glass wall (cyan-tinted, transparent) | yes | **no** |
| `.` | Floor | no | no |
| `D` | Door, opens automatically when the player or a guard is within 1.5 m | when closed | when closed |
| `K` | Keycard door: locked until the player has the keycard, then works like `D` (player only) | when closed | when closed |
| `S` | Server door: locked until the lockpick succeeds, then stays open | when closed | when closed |
| `d` | Desk, 0.75 m tall, with a monitor and chair | yes | only for a **crouched** target |
| `c` | Cubicle partition, 1.3 m tall | yes | only for a **crouched** target |
| `s` | Security desk, 1.1 m tall, with CCTV monitors | yes | only for a **crouched** target |
| `r` | Server rack, 2.2 m tall, with blinking LEDs | yes | yes |
| `k` | Keycard (floating, cyan glow) on floor next to the security desk | no | no |
| `C` | Target computer (glowing magenta tower) on a pedestal | yes | no |
| `P` | Player spawn, facing north | no | no |
| `E` | Exit zone (pulsing ground ring, active only in `ESCAPE`) | no | no |

The map above has been checked: every objective is reachable from `P` when locks are
ignored. `tests/map.mjs` must keep checking this.

**Decoration** (no gameplay effect): neon ceiling strips along corridors, ACME logo wall
sign in the lobby, plants, water cooler, vending machine in the break room, whiteboards in
the offices, a city skyline backdrop with a sunset gradient seen through the glass front,
and "SOC ALERT / DETECTING ANOMALY…" text on the server-room screens (canvas texture
drawn in code).

### Guards

| Guard | Route (tile waypoints) | Notes |
|---|---|---|
| G1 "Lobby" | (17,7) → (17,10) → (13,10) → (13,7), loop | Passes the security desk, so the keycard grab needs timing |
| G2 "Floor" | (6,7) → (6,10) → (12,10) → (12,7) → (9,7), loop | Weaves through the cubicles; pauses 2 s at each corner |
| G3 "Corridor" | (1,5) → (9,5), ping-pong | Active from `REACH_SERVER_ROOM`; walks the north corridor west side |

Waypoints live in `level/map.js` as data, not in the AI code.

## 3. Systems spec

All numbers go in `js/config.js`; these are starting values.

**Player**
- Walk 3.2 m/s, crouch 1.6 m/s, carrying 2.2 m/s (no crouch while carrying).
- Collision radius 0.35 m. Turn to face the movement direction (relative to the camera).
- Noise radius: walk 4 m, crouch 1 m, carrying 6 m. A guard within the noise radius turns
  toward the player and becomes `SUSPICIOUS`.

**Camera**
- Over-the-shoulder orbit, distance 4 m (2.5 m in tight spaces), height 1.6 m.
- Mouse drag or pointer lock on desktop, right-half drag on touch, right stick on gamepad.
- Pitch clamped between −10° and 60°. Raycast against wall boxes; pull in when blocked.

**Guards (AI states)**
- `PATROL`: walk 1.6 m/s between waypoints.
- `SUSPICIOUS`: stop, turn to the last known position, walk there at 2 m/s, look around for
  3 s, then return to patrol.
- `ALERT`: chase at 3.6 m/s toward the last seen position. A guard closer than 1.0 m catches
  the player.
- Vision: 70° cone, 9 m range (5 m against a crouched player), with grid line-of-sight rules
  from the tile table. The cone is drawn on the floor as a translucent sunset-orange fan,
  turning red when alerted.

**SOC alert meter (0–100)**
- While any guard sees the player: rises at 35%/s, scaled ×2 within 3 m and ×0.5 beyond 6 m.
- Guard states: 30% or more → `SUSPICIOUS`; 70% or more → `ALERT`; 100% → caught.
- When unseen: drains 10%/s after a 2 s delay.
- HUD: segmented bar, cyan → magenta → red, with text labels "MONITORING / ANOMALY /
  SOC ALERT" so the state isn't conveyed by color alone.

**Lockpick minigame** (sweet-spot rotate), shown as a DOM/SVG overlay over the 3D view
- A random sweet spot in −80°…80°, with a tolerance of ±8° (full turn) fading to ±30°
  (partial turn).
- Drag horizontally (mouse/touch) or use the left stick to aim the pick (−90°…90°).
- Hold **Turn** (Space / on-screen button / gamepad A) to rotate the cylinder. The maximum
  rotation allowed depends on how close the pick is to the sweet spot. When the cylinder
  hits its limit, the lock shakes (CSS + `navigator.vibrate` where supported) and pick
  strain builds. 1.2 s of strain breaks a pick.
- 3 picks in total. Breaking all three ends the attempt, and the player gets 3 new picks
  after leaving and returning. Reaching 90° opens the lock.
- The world keeps running: guards still patrol and can spot the player. Picking makes noise
  every 1 s (radius 3 m). **Esc** / ✕ cancels.

**Interaction**
- When the nearest interactable is within 1.6 m and in front of the player, show a prompt:
  "E — Grab keycard" on desktop, a context button on touch, "A" on gamepad.

**Input map**

| Action | Keyboard / mouse | Touch | Gamepad |
|---|---|---|---|
| Move | WASD / arrows | Left virtual joystick (floating, left 40% of screen) | Left stick |
| Look | Mouse (pointer lock after click; drag fallback) | Drag on the right side | Right stick |
| Crouch (toggle) | C / Ctrl | Crouch button | B |
| Interact | E | Context button (appears only when available) | A |
| Pause | Esc / P | ⏸ button | Start |

## 4. Technical budgets

| Budget | Target |
|---|---|
| Total download (excluding `cover.jpg`) | < 1.5 MB (Three.js min ≈ 700 KB) |
| Draw calls | < 120 at high quality |
| Frame rate | 60 fps desktop; ≥ 30 fps on a mid-range phone at low quality |
| Time to interactive | < 3 s on broadband |

**Quality tiers** (`quality.js`). The tier is auto-picked on first run (touch device or a
small GPU → low), can be changed in Settings, and is saved.

| | Low | Medium | High |
|---|---|---|---|
| Pixel ratio cap | 1.0 | 1.5 | 2.0 |
| Bloom | off (emissive only) | half-res | full |
| Shadows | none | player + guards (blob shadows) | blob shadows |
| Dynamic lights | 2 | 4 | 6 |
| Antialias | off | on | on |

Every tier uses blob (decal) shadows rather than shadow maps, which keeps it cheap.

---

## Phase 0 — Repo, hosting and scaffold

**You do these by hand (Claude Code can't):**
1. Create the repo `CyBirdSecurity/grand-theft-cizzo` (public), add this `CLAUDE.md`,
   `PLAN.md` and `assets/cover.jpg` to the root, and push `main`.
2. In your DNS provider, add a **CNAME** record: `gtc` → `cybirdsecurity.github.io`.
3. Repo **Settings → Pages**: Source = *Deploy from a branch*, Branch = `main` / `/ (root)`.
   Set Custom domain = `gtc.cybirdsecurity.com`, and once the certificate is issued
   (minutes to an hour), tick **Enforce HTTPS**.
4. Start a Claude Code session on the new repo and paste the Phase 0 prompt.

**Claude Code tasks**
- [ ] `CNAME` containing `gtc.cybirdsecurity.com`; empty `.nojekyll`; `.gitignore` (`tests/out/`, `node_modules/`).
- [ ] `tools/vendor-three.sh`: downloads `three@0.170.0` from `https://cdn.jsdelivr.net/npm/three@0.170.0/` into `vendor/three/`, keeping the package paths:
  `build/three.module.min.js`;
  `examples/jsm/postprocessing/{EffectComposer,RenderPass,UnrealBloomPass,OutputPass,ShaderPass,MaskPass,Pass}.js`;
  `examples/jsm/shaders/{CopyShader,LuminosityHighPassShader,OutputShader}.js`;
  `examples/jsm/utils/BufferGeometryUtils.js`.
  After downloading, grep every vendored file's `import` lines and fetch any missing
  relative dependency. Run it and commit the vendored files plus `vendor/three/LICENSE`.
- [ ] `index.html` with an import map (`"three": "./vendor/three/build/three.module.min.js"`, `"three/addons/": "./vendor/three/examples/jsm/"`), `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`, theme colour `#0b0820`, `<title>Grand Theft Cizzo</title>`, Open Graph tags using `assets/cover.jpg`, and a `<noscript>`/WebGL-unsupported message.
- [ ] `js/main.js`: renderer, resize handling, a rotating neon cube, an `?debug` FPS overlay and `window.__GTC`.
- [ ] `js/config.js` with the palette + constants skeleton; `css/game.css` with palette tokens.
- [ ] `tests/smoke.mjs` as described in CLAUDE.md (desktop + iPhone 13 landscape, fails on console errors, saves screenshots).
- [ ] `README.md`: what the game is, how to run locally, controls, and credits (Three.js MIT).

**Acceptance:** the cube renders at both viewports with no console errors, and after you
push, https://gtc.cybirdsecurity.com shows it over HTTPS.

> **Prompt:** Read CLAUDE.md and PLAN.md. Do Phase 0: scaffold the repo, vendor Three.js r170
> with the script, build the hello-cube page and the Playwright smoke test. Run the test,
> check the screenshots, tick the Phase 0 boxes, commit and push.

## Phase 1 — Engine core and input

- [ ] Game loop with clamped `dt`, a pause flag, and states `TITLE | PLAYING | PAUSED | LOCKPICK | RESULTS` (title is a stub for now).
- [ ] `quality.js`: tiers, auto-detect, apply (pixel ratio, antialias requires renderer recreation, bloom toggle).
- [ ] Post-processing: `EffectComposer` → `RenderPass` → `UnrealBloomPass` → `OutputPass`, skipped entirely on low quality.
- [ ] `input.js`: a single `input.state` per frame — `move {x,y}`, `look {dx,dy}`, `crouchPressed`, `interactPressed`, `turnHeld`, `pausePressed`, `aim` — fed by keyboard, mouse (pointer lock with drag fallback), touch (floating left joystick, right-side look drag, on-screen buttons) and the Gamepad API. Touch controls show only on touch devices.
- [ ] Prevent page scroll, zoom and pull-to-refresh on the canvas (`touch-action: none`, passive:false where needed).
- [ ] Rotate-device overlay in portrait on phones ("Rotate for the best experience", dismissible).
- [ ] Unlock audio context on the first user gesture (stub in `audio.js`).

**Acceptance:** with `?debug`, the overlay shows live input values from each device type; in
the smoke test, a simulated joystick drag on the phone viewport produces non-zero `move`.

> **Prompt:** Do Phase 1 from PLAN.md (engine core, quality tiers, unified input incl.
> touch joystick and gamepad). Extend the smoke test to simulate touch input and assert it
> reaches `__GTC.input.state`.

## Phase 2 — Level geometry and look

- [ ] `level/map.js`: the ASCII map from §2, the legend and guard waypoints, exported as data.
- [ ] `tests/map.mjs` (plain Node, no browser): asserts all rows are 20 wide and that `k`, `K`, `S`, `C`, `E` are reachable from `P` ignoring locks.
- [ ] `materials.js`: shared flat-shaded materials from the palette; emissive neon materials.
- [ ] `level/props.js`: low-poly factories — desk + monitor + chair, cubicle partition, security desk with CCTV screens, server rack with LED strip, plant, water cooler, vending machine, whiteboard, keycard, target computer tower, pedestal.
- [ ] `level/build.js`: builds walls (merged per material), glass walls, floor and ceiling, doors (as animated meshes), and instanced props. Outputs `colliders` (AABBs tagged with `blocksSight` / `lowCover`), `doors`, `interactables` and spawn points.
- [ ] Lighting: dim violet ambient + hemisphere light, neon ceiling strips (emissive, not real lights), a few point lights per the quality tier, fog in `--night`.
- [ ] Skyline backdrop outside the glass front: a sunset gradient plane with low-poly tower silhouettes with lit windows and a palm-tree silhouette.
- [ ] Server-room screens with "SOC ALERT / DETECTING ANOMALY… / INVESTIGATING…" drawn to a canvas texture.
- [ ] Debug free-fly camera under `?debug` (toggle with F).

**Acceptance:** fly-through screenshots of the lobby, cubicles, corridor and server room
look neon and readable; draw calls are below 120 at high quality (show the count in the
debug overlay).

> **Prompt:** Do Phase 2 from PLAN.md: build the office level from the ASCII map with
> low-poly props, neon lighting and the skyline backdrop. Add tests/map.mjs. Take debug
> fly-cam screenshots of each room and check them against the visual style in CLAUDE.md.

## Phase 3 — Player, character and camera

- [ ] `character.js`: blocky low-poly humanoid (head, torso, arms, legs as boxes, with a
  hierarchy for animation) built from options for colours and accessories. The player is
  "Cizzo": white shirt, dark vest, tie, sunglasses, magenta accent. Guards wear a navy
  uniform, cap and flashlight.
- [ ] Procedural animation: idle breathing, walk/run cycle (limb swing scaled by speed), crouch pose, carry pose (arms forward holding the computer), lockpick pose (kneel).
- [ ] `collision.js`: circle-vs-AABB resolution with sliding along walls; grid DDA raycast (`lineOfSight(a, b, {crouched})`) that applies the sight rules from §2.
- [ ] `player.js`: camera-relative movement, crouch toggle, speed by state, noise radius, blob shadow.
- [ ] `camera.js`: orbit camera as specified in §3, with smoothing, wall pull-in, and touch/gamepad sensitivity settings.
- [ ] Footstep sounds (synthesized ticks) whose rate follows speed — a simple version in `audio.js`.

**Acceptance:** you can walk from `P` to every room on desktop and phone without clipping
through walls or getting stuck on corners. The camera never ends up behind a wall.
`__GTC.teleport()` works.

> **Prompt:** Do Phase 3 from PLAN.md: the procedural low-poly character, player
> controller with collision, and the third-person camera. In the smoke test, walk the
> player along a scripted path through every door and assert they reach each room.

## Phase 4 — Interaction, doors and items

- [ ] `interact.js`: registry of interactables (`keycard`, `keycardDoor`, `serverDoor`, `computer`, `exit`) with conditions, prompt text and handlers; picks the nearest valid one in front of the player.
- [ ] Doors: auto-open `D` for the player and guards; `K` shows "Locked — keycard required" until the player has the keycard; `S` routes to the lockpick (stub: instant success for now).
- [ ] Keycard pickup (adds to inventory, HUD icon). Computer pickup switches the player to the carry state; carrying can't be dropped in v1.
- [ ] Objective marker: a cyan diamond floating above the current target, plus an edge-of-screen arrow when it's off-screen.

**Acceptance:** the whole mission can be completed with no guards, using the stub lock.

> **Prompt:** Do Phase 4 from PLAN.md: interaction system, doors, keycard, carrying the
> computer and objective markers. Add a smoke test that completes the mission with guards
> disabled via a debug flag.

## Phase 5 — Guards, vision and the SOC alert

- [ ] `guards.js`: three guards with the waypoints from §2 and the state machine from §3 (`PATROL / SUSPICIOUS / ALERT`); G3 only spawns from `REACH_SERVER_ROOM`.
- [ ] Simple steering along waypoints; in `SUSPICIOUS`/`ALERT`, move toward the target on a grid A* path over walkable tiles (doors count as walkable for guards).
- [ ] Vision cones as floor-projected fan meshes with colour by state, plus a flashlight cone mesh.
- [ ] Hearing via the player's noise radius.
- [ ] `alert.js`: the meter rules from §3, plus "spotted" and "caught" events.
- [ ] Caught sequence: slow-mo, red flash, "BUSTED — the SOC traced you", then restart from the checkpoint.
- [ ] Guard bark text bubbles ("Huh?", "Who's there?", "Intruder!") and matching synthesized sounds.

**Acceptance:** scripted smoke tests show that (a) standing in G1's path gets the player
caught, (b) crouching behind the cubicles while G2 passes keeps the alert below 30%, and
(c) after being caught, the player respawns at the right checkpoint with the alert at 0.

> **Prompt:** Do Phase 5 from PLAN.md: guard AI with patrols, vision cones, hearing and
> the SOC alert meter, plus caught/restart. Add the three scripted stealth tests from the
> acceptance criteria.

## Phase 6 — Lockpick minigame

- [ ] `lockpick.js` overlay per §3: lock face (SVG), pick that follows the input, cylinder rotation, shake, strain bar, picks left, "Turn" and ✕ buttons on touch.
- [ ] Works with mouse drag, touch drag, keyboard (A/D or arrows to aim, Space to turn) and gamepad (left stick + A).
- [ ] Sounds: click on movement, grind under strain, snap on a broken pick, clunk on unlock. Haptics via `navigator.vibrate` where supported.
- [ ] The 3D view stays visible behind the overlay, guards keep moving, and getting caught closes it.
- [ ] A first-time tutorial hint ("Find the sweet spot — the lock shakes when you're close").

**Acceptance:** a test with a fixed seed opens the lock by aiming at the known sweet spot;
holding Turn while 40° away breaks a pick in about 1.2 s; the overlay is fully usable at
the phone viewport.

> **Prompt:** Do Phase 6 from PLAN.md: the sweet-spot lockpick minigame with mouse, touch,
> keyboard and gamepad support. Make the RNG seedable under ?debug and add the acceptance
> tests.

## Phase 7 — Missions, HUD and checkpoints

- [ ] `missions.js`: the state machine and objective texts from §1, the checkpoints, and events to the HUD.
- [ ] `hud.js`: objective panel (top left), SOC alert meter (top centre), inventory icons, interaction prompt, toasts ("Keycard acquired", "Checkpoint saved"), and a minimap (top right) — a canvas 2D top-down map with the player arrow, guards visible when within 10 m, and the objective marker.
- [ ] Timer and stats tracking (time, peak alert, times spotted, picks broken).
- [ ] Results screen with stars per §1, best results saved with `save.js`, and Retry / Title buttons.

**Acceptance:** a full playthrough test from spawn to results passes with guards enabled,
using the debug teleport only between rooms the player can actually reach.

> **Prompt:** Do Phase 7 from PLAN.md: mission state machine, HUD with minimap,
> checkpoints, stats and the results screen. Add an end-to-end playthrough test.

## Phase 8 — Title screen, menus, settings and audio

- [ ] Title screen: `assets/cover.jpg` as a full-bleed background (`object-fit: cover`, focus on the logo), a neon "STEAL THE DATA. **DON'T GET CAUGHT.**" tagline in HTML, and Play / Continue (when a checkpoint exists) / Controls / Settings buttons.
- [ ] Controls screen showing the scheme for the detected device (keyboard, touch or gamepad).
- [ ] Pause menu: Resume, Restart from checkpoint, Settings, Quit to title. Auto-pause on `visibilitychange`.
- [ ] Settings (saved): quality tier, look sensitivity, invert Y, music volume, SFX volume, show vision cones (on/off, accessibility), reduced motion (no camera shake or slow-mo), large HUD text.
- [ ] `audio.js` finished: synthwave ambient loop (Web Audio oscillators + filter + simple sequencer), tension layer that fades in with the alert level, all SFX from earlier phases, master/music/SFX gains.
- [ ] Focus states and keyboard navigation for every menu; buttons at least 44×44 px on touch.

**Acceptance:** the title → play → pause → settings → resume flow works with keyboard
only, mouse only, touch only and gamepad only. Settings persist across reloads.

> **Prompt:** Do Phase 8 from PLAN.md: title screen with the cover art, pause and settings
> menus, and the full synthesized audio. Test menu navigation for each input type.

## Phase 9 — Mobile and performance pass

- [ ] Profile with `?debug` at each quality tier; get draw calls and frame time inside the §4 budgets.
- [ ] Safe-area insets (`env(safe-area-inset-*)`) for HUD and touch controls on notched phones.
- [ ] Fullscreen button where the Fullscreen API exists (not iOS Safari); hide the address bar where possible.
- [ ] Recover from WebGL context loss (rebuild renderer + level), with a friendly fallback message when WebGL is unavailable.
- [ ] Throttle the render loop when the tab is hidden; free GPU resources on quit to title.
- [ ] Test matrix in the smoke test: desktop 1280×720, iPhone 13 landscape, Pixel 7 landscape, iPad landscape.

**Acceptance:** no console errors on any viewport; low quality holds ≥ 30 fps in headless
Chromium with 4× CPU throttling (CDP `Emulation.setCPUThrottlingRate`).

> **Prompt:** Do Phase 9 from PLAN.md: mobile and performance pass. Report frame times and
> draw calls per tier and device profile before and after.

## Phase 10 — Polish and release

- [ ] Juice: door open/close easing, keycard and computer glow pulses, screen-space vignette tied to the alert level, a short intro camera sweep over the office before control starts (skippable, and off under reduced motion).
- [ ] Short in-game text: a one-paragraph intro brief from the "client", and a results flavour line per star rating.
- [ ] Favicon and app icons generated from the cover (crop of the "Cizzo" logo) and `manifest.webmanifest` (name, icons, `display: fullscreen`, `orientation: landscape`, theme colour) for add-to-home-screen.
- [ ] README: screenshots, controls, credits, licence.
- [ ] Final run of all tests; tag `v1.0.0` and push.

**Acceptance:** a fresh player can finish the game on a phone and on a desktop without
instructions beyond the in-game controls screen.

> **Prompt:** Do Phase 10 from PLAN.md: polish, web manifest and icons, README, final test
> run, then tag v1.0.0.

---

## Out of scope for v1 (ideas for later)

Extra floors and an elevator, security cameras and hackable terminals, takedowns, a getaway
driving sequence outside, multiple heist targets or random layouts, a level editor,
leaderboards (would need a backend).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| The title wordmark imitates the GTA logo style and the name starts with "Grand Theft" | The Rockstar logo and ESRB badge are already cropped out. Keep the parody small and non-commercial, and consider a rename before promoting the game widely. |
| Bloom too slow on phones | Low tier disables it; emissive colours still read as neon. |
| iOS Safari quirks (no pointer lock, no fullscreen, audio unlock, `vibrate` missing) | Drag-to-look fallback, audio unlocked on first tap, feature-detect everything. |
| Guard AI getting stuck on furniture | Guards follow tile-centre A* paths and use a slightly smaller collision radius; tests include full patrol loops. |
| Scope creep | CLAUDE.md "Don'ts" and the Out of scope list above. |
