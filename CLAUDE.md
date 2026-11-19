# Grand Theft Cizzo — Claude Code rules

A third-person, stylized low-poly neon **stealth heist game** that runs entirely in the
browser. The player breaks into the ACME Corp office at night, steals a keycard, picks the
lock on the server room, steals a computer and escapes without the SOC alert maxing out.

- **Live:** https://gtc.cybirdsecurity.com (GitHub Pages, served from `main` branch root)
- **Plan:** `PLAN.md` is the source of truth for scope and order. Work one phase at a time,
  tick its checkboxes when done, and do not start features from later phases early.

## Hard constraints

1. **No build step.** Plain JavaScript ES modules served as static files. No npm runtime
   dependencies, no bundler, no TypeScript, no JSX. `index.html` must work when served by
   any static file server.
2. **Three.js is vendored**, pinned to **r170 (`three@0.170.0`)**, in `vendor/three/`.
   Load it through the import map in `index.html` (`"three"` and `"three/addons/"`). Never
   load scripts from a CDN at runtime. Do not upgrade Three.js unless PLAN.md says to.
3. **All art and audio are generated in code.** Geometry is built from Three.js primitives;
   sounds are synthesized with the Web Audio API. The only binary asset is
   `assets/cover.jpg` (title screen). No glTF, textures, fonts or audio files unless PLAN.md
   is changed first.
4. **Client-side only.** No servers, accounts, analytics or network calls. Persistence uses
   `localStorage` via `js/save.js`, wrapped in try/catch so the game works without it.
5. **Desktop and mobile are both first-class.** Every feature must be usable with
   keyboard + mouse, touch, and gamepad. Never rely on hover, right-click or pointer lock
   being available (iOS Safari has no pointer lock).
6. **Stealth only.** The player has no attacks. Being caught restarts from the last
   checkpoint.
7. Keep `CNAME` (`gtc.cybirdsecurity.com`) and `.nojekyll` at the repo root. Never delete them.

## Project layout

```
index.html            title screen, HUD markup, canvas, import map
CNAME  .nojekyll
assets/cover.jpg
css/game.css          all UI/HUD styles (CSS custom properties for the palette)
vendor/three/         pinned Three.js build + only the addons we use
js/
  main.js             boot, game loop, scene/state switching
  config.js           tunable constants (speeds, ranges, timings, palette)
  quality.js          quality tiers + auto-detect
  input.js            unified input: keyboard/mouse, touch joystick, gamepad
  level/map.js        ASCII floor map + entity placements (data only)
  level/build.js      map → merged meshes, colliders, lights
  level/props.js      low-poly prop factories (desk, chair, server rack, plant…)
  materials.js        shared neon/toon materials
  collision.js        2D (XZ) circle-vs-AABB collision + grid raycast
  player.js           character mesh, movement, crouch, carry state
  character.js        skinned humanoid looks (player, guards, workers) + procedural animation
  body.js             blended-shape SDF -> seamless skinned mesh (surface nets)
  camera.js           third-person orbit camera with wall avoidance
  guards.js           patrol / suspicious / alert AI, vision cones
  workers.js          ambient night-shift office workers seated at desks
  alert.js            SOC alert meter
  interact.js         interaction prompts + interactables registry
  lockpick.js         sweet-spot lockpick minigame (DOM overlay)
  missions.js         objective state machine + checkpoints
  hud.js              objective text, alert meter, prompts, minimap, toasts
  menus.js            title, pause, settings, results screens
  audio.js            Web Audio synth: sfx + ambient music
  save.js             settings + best results in localStorage
tests/smoke.mjs       Playwright smoke test (desktop + phone)
tools/vendor-three.sh fetches the pinned Three.js files into vendor/
```

## Code conventions

- ES modules, `const`/`let`, no globals except a `window.__GTC` debug handle.
- One responsibility per module. Each gameplay module exports `create…()` returning an object
  with `update(dt)` and, where relevant, `reset()` / `dispose()`.
- All tunable numbers live in `js/config.js`. No magic numbers in gameplay code.
- Units: **1 unit = 1 metre**. Y is up. The floor is at `y = 0`. The level is a single floor,
  so gameplay collision and line of sight are 2D on the XZ plane.
- `dt` is in seconds and clamped to `0.05` in the main loop.
- Reuse geometries and materials. Merge static level geometry
  (`BufferGeometryUtils.mergeGeometries`), and use `InstancedMesh` for repeated props.
- No `console.log` left in committed code, except behind `config.DEBUG`.
- `?debug` in the URL turns on: FPS / draw-call overlay, collider wireframes, guard vision
  rays, and the `window.__GTC` handle used by tests.

## Visual style

Stylized low-poly, night-time office lit by neon, matching the cover art's synthwave
sunset palette. Flat-shaded `MeshStandardMaterial` / `MeshLambertMaterial`, emissive neon
strips, bloom post-processing on medium/high quality.

| Token | Hex | Use |
|---|---|---|
| `--night` | `#0b0820` | background, fog, UI panels |
| `--violet` | `#2a1b5c` | walls, floors |
| `--purple` | `#7b2ff7` | neon strips, UI accents |
| `--magenta` | `#ff3ea5` | player accents, the "Cizzo" brand colour, alert high |
| `--cyan` | `#22d3ee` | interactables, objective markers, keycard |
| `--sunset` | `#ff8a3d` | warm lamps, guard flashlights / vision cones |
| `--ink` | `#f5f0ff` | UI text |

## How to run and test

```bash
python3 -m http.server 8080          # then open http://localhost:8080/?debug
node tests/smoke.mjs                 # requires the server above to be running
```

- Playwright is pre-installed in Claude Code cloud sessions (`require('playwright')`, run
  `chromium.launch()` with no options). Do **not** run `playwright install`.
- `tests/smoke.mjs` loads the page at a desktop (1280×720) and a phone (iPhone 13,
  landscape) viewport, starts the game, simulates input for a few seconds, fails on any
  console error or uncaught exception, and writes screenshots to `tests/out/`
  (gitignored).
- Gameplay tests drive the game through `window.__GTC` (e.g. `__GTC.teleport(x, z)`,
  `__GTC.missions.state`, `__GTC.alert.value`), available only with `?debug`.

## Definition of done (every phase)

1. All checkboxes for the phase in `PLAN.md` are done and ticked.
2. `node tests/smoke.mjs` passes with zero console errors on desktop and phone.
3. You looked at the desktop and phone screenshots and they match the phase's acceptance
   criteria.
4. Desktop runs at 60 fps in headless Chromium at high quality. Draw calls stay under the
   budget in PLAN.md.
5. You committed with a message naming the phase (e.g. `Phase 3: player controller`) and
   pushed.

## Don'ts

- Don't add the Rockstar logo, the ESRB badge, or GTA names, places or characters.
- Don't add combat, vehicles, extra floors or online features. They are out of scope for v1.
- Don't add dependencies or a build step to "make things easier".
- Don't skip or weaken the smoke test to make it pass.
