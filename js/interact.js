// Interactables registry: picks the nearest valid item in front of the player and runs it.
import { INTERACT } from './config.js';

export function createInteract({ player }) {
  const items = [];
  const api = {
    current: null,
    /** item: { id, pos(): {x,z}, available(): bool, label(): string, action?(): void } */
    register(item) {
      items.push(item);
      return item;
    },
    update(input, enabled) {
      api.current = null;
      if (!enabled) return;
      const f = player.forward();
      let best = null;
      let bestD = Infinity;
      for (const it of items) {
        if (!it.available()) continue;
        const p = it.pos();
        const dx = p.x - player.pos.x;
        const dz = p.z - player.pos.z;
        const d = Math.hypot(dx, dz);
        const range = it.range ?? INTERACT.range;
        if (d > range) continue;
        if (d > INTERACT.closeRange && (dx * f.x + dz * f.z) / d < INTERACT.minDot) continue;
        if (d < bestD) { best = it; bestD = d; }
      }
      api.current = best;
      if (best && best.action && input.state.interactPressed) best.action();
    },
  };
  return api;
}
