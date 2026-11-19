# Grand Theft Cizzo

A third-person, low-poly neon **stealth heist** that runs entirely in the browser. Break into
the ACME Corp office at night, lift the keycard from the lobby security desk, pick the
server-room lock, steal the target computer and carry it out through the loading dock —
without letting the SOC alert meter hit 100%.

**Play:** https://gtc.cybirdsecurity.com

- Desktop (keyboard + mouse or gamepad) and mobile (touch, landscape)
- All geometry, lighting and audio are generated in code with Three.js r170 and the Web Audio API
- No build step, no runtime dependencies, no network calls

## Run locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080/ (add `?debug` for the FPS / draw-call overlay, `F` free-fly
camera, `O` collider wireframes and the `window.__GTC` test handle; `&noguards`, `&seed=N`
and `&quality=low|medium|high` are also available in debug mode).

## Controls

| Action | Keyboard / mouse | Touch | Gamepad |
|---|---|---|---|
| Move forward / back | W / S, ↑ / ↓ | Left joystick up / down | Left stick up / down |
| Turn (camera stays locked behind Cizzo) | A / D, ← / →, or mouse | Joystick left / right, or drag sideways on the right | Left stick left / right, or right stick |
| Look up / down | Mouse (click to capture, drag also works) | Drag up / down on the right side | Right stick up / down |
| Crouch (toggle) | C / Ctrl | Crouch button | B |
| Interact | E | Context button | A |
| Lockpick | Drag or A/D to aim, hold Space to turn | Drag the lock, hold Turn | Left stick, hold A |
| Pause | Esc / P | ⏸ | Start |

Stay out of the orange vision cones. Crouching makes you quieter and hides you behind desks,
cubicles and the security counter. Carrying the computer is slow and loud.

## Tests

```bash
node tests/map.mjs        # level data: row widths and reachability (plain Node)
node tests/smoke.mjs      # Playwright: desktop + iPhone 13 landscape, needs the server above
```

`GTC_URL` overrides the URL and `PW_CHANNEL=chrome` runs the smoke test in an installed Chrome.
Screenshots go to `tests/out/` (gitignored).

## Project layout

See [CLAUDE.md](CLAUDE.md) for the module map and conventions and [PLAN.md](PLAN.md) for the
design and build plan. Three.js is vendored in `vendor/three/` by `tools/vendor-three.sh`.

## Credits

- Game code and design: CyBird Security
- [Three.js](https://threejs.org) r170 — MIT licence (`vendor/three/LICENSE`)
- Cover art: `assets/cover.jpg`

This is a small, non-commercial parody project. It is not affiliated with or endorsed by
Rockstar Games or any other company.
