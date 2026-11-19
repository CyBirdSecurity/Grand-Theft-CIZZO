// Night-shift office workers sitting at their desks: typing, pausing, glancing around.
// Purely ambient: they wear headphones and don't notice the player.
import { WORKERS, tileAt, tileCenter } from './level/map.js';
import { createCharacter, blobShadow, WORKER_LOOKS } from './character.js';

export function createWorkers({ scene }) {
  const list = [];
  // Ambient characters are built one at a time after start-up so they don't delay the title.
  const spawn = (w, i) => {
    const { x, z } = tileCenter(w.c, w.r);
    const inCubicle = tileAt(w.c, w.r) === 'c';
    // chair placement mirrors the prop factories in level/props.js
    const rot = inCubicle && tileAt(w.c, w.r - 1) === 'c' ? Math.PI : 0;
    const lx = inCubicle ? 0.1 : 0.05;
    const lz = inCubicle ? 0.35 : 0.75;
    const char = createCharacter(WORKER_LOOKS[w.look % WORKER_LOOKS.length]);
    char.root.position.set(x + lx * Math.cos(rot) + lz * Math.sin(rot), 0, z - lx * Math.sin(rot) + lz * Math.cos(rot));
    char.root.rotation.y = Math.PI + rot;
    const shadow = blobShadow(0.4);
    shadow.position.set(char.root.position.x, 0.012, char.root.position.z);
    scene.add(char.root, shadow);
    const npc = { char, typing: true, timer: 2 + i * 1.3, lookYaw: 0 };
    // settle straight into the seated pose (and desynchronise the typing rhythm)
    char.animate(1 + i * 1.37, { seated: true, typing: true });
    list.push(npc);
  };
  let next = 0;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 30));
  const step = () => {
    if (next >= WORKERS.length) return;
    spawn(WORKERS[next], next);
    next++;
    idle(step);
  };
  setTimeout(step, 50);

  return {
    list,
    update(dt) {
      for (const n of list) {
        n.timer -= dt;
        if (n.timer <= 0) {
          n.typing = !n.typing || Math.random() < 0.3;
          n.lookYaw = n.typing ? 0 : (Math.random() - 0.5) * 1.2;
          n.timer = n.typing ? 4 + Math.random() * 8 : 1.5 + Math.random() * 2.5;
        }
        n.char.animate(dt, { seated: true, typing: n.typing, lookYaw: n.lookYaw });
      }
    },
  };
}
