// Settings, best results and the last checkpoint in localStorage.
// Every access is wrapped so the game still works when storage is blocked.
import { DEFAULT_SETTINGS } from './config.js';

const KEY = 'gtc.save.v1';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* storage unavailable */ }
}

export function createSave() {
  const data = read();
  data.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  data.best = data.best || null;
  data.checkpoint = data.checkpoint || null;
  data.flags = data.flags || {};

  return {
    get settings() { return data.settings; },
    get best() { return data.best; },
    get checkpoint() { return data.checkpoint; },
    flag(name) { return !!data.flags[name]; },
    setFlag(name) { data.flags[name] = true; write(data); },
    saveSettings(patch) {
      Object.assign(data.settings, patch);
      write(data);
    },
    saveCheckpoint(cp) {
      data.checkpoint = cp;
      write(data);
    },
    clearCheckpoint() {
      data.checkpoint = null;
      write(data);
    },
    /** Records a finished run; returns { newBestTime, newBestStars }. */
    recordResult({ time, stars }) {
      const prev = data.best || { time: null, stars: 0 };
      const newBestTime = prev.time === null || time < prev.time;
      const newBestStars = stars > prev.stars;
      data.best = { time: newBestTime ? time : prev.time, stars: Math.max(stars, prev.stars) };
      write(data);
      return { newBestTime, newBestStars };
    },
  };
}
