// SOC alert meter (0-100): rises while seen, drains after a delay, emits threshold events.
import { ALERT } from './config.js';

export function createAlert(events = {}) {
  const a = {
    value: 0,
    peak: 0,
    unseenT: 0,
    spotted: 0,
  };
  let prev = 0;

  a.update = (dt, seen, nearest) => {
    if (seen) {
      const mul = nearest < ALERT.nearDist ? ALERT.nearMul : nearest > ALERT.farDist ? ALERT.farMul : 1;
      a.value += ALERT.riseRate * mul * dt;
      a.unseenT = 0;
    } else {
      a.unseenT += dt;
      if (a.unseenT > ALERT.drainDelay) a.value -= ALERT.drainRate * dt;
    }
    a.value = Math.max(0, Math.min(ALERT.max, a.value));
    a.peak = Math.max(a.peak, a.value);
    if (prev < ALERT.suspicious && a.value >= ALERT.suspicious) { a.spotted++; events.onSpotted?.(); }
    if (prev < ALERT.alert && a.value >= ALERT.alert) events.onAlert?.();
    if (prev < ALERT.max && a.value >= ALERT.max) events.onCaught?.();
    prev = a.value;
  };

  a.level = () => (a.value >= ALERT.alert ? 2 : a.value >= ALERT.suspicious ? 1 : 0);
  a.label = () => ALERT.labels[a.level()];

  a.reset = () => {
    a.value = 0;
    a.unseenT = 0;
    prev = 0;
  };

  a.resetRun = () => {
    a.reset();
    a.peak = 0;
    a.spotted = 0;
  };

  return a;
}
