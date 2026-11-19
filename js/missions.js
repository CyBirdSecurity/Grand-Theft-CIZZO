// Mission state machine: objective texts, completion checks and checkpoints.
import { MISSION_ORDER, OBJECTIVES, OPEN_OFFICE, CHECKPOINT_STATES, worldToTile, findTiles } from './level/map.js';

export function createMissions(events = {}) {
  const exitTile = findTiles('E')[0];
  const m = {
    state: 'INFILTRATE',
    get objective() { return OBJECTIVES[m.state]; },
    get index() { return MISSION_ORDER.indexOf(m.state); },
    atLeast(state) { return MISSION_ORDER.indexOf(m.state) >= MISSION_ORDER.indexOf(state); },
  };

  m.set = (state, { silent = false } = {}) => {
    if (m.state === state) return;
    m.state = state;
    if (silent) return;
    events.onChange?.(state);
    if (CHECKPOINT_STATES.includes(state)) events.onCheckpoint?.(state);
    if (state === 'COMPLETE') events.onComplete?.();
  };

  /** Advance from `from` only (prevents out-of-order triggers). */
  m.advance = (from, to) => {
    if (m.state === from) m.set(to);
  };

  m.update = (player) => {
    const { c, r } = worldToTile(player.pos.x, player.pos.z);
    if (m.state === 'INFILTRATE' && c >= OPEN_OFFICE.colMin && c <= OPEN_OFFICE.colMax && r >= OPEN_OFFICE.rowMin && r <= OPEN_OFFICE.rowMax) {
      m.set('GET_KEYCARD');
    }
    if (m.state === 'ESCAPE' && player.carrying && c === exitTile.c && r === exitTile.r) m.set('COMPLETE');
  };

  m.reset = (state = 'INFILTRATE') => { m.state = state; };
  return m;
}
