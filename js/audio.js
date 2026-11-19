// Web Audio synth: synthwave ambient loop with a tension layer, plus all sound effects.
// The AudioContext is created / resumed on the first user gesture.
import { AUDIO } from './config.js';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Am - F - C - G
const CHORDS = [
  { bass: 33, notes: [57, 60, 64] },
  { bass: 29, notes: [53, 57, 60] },
  { bass: 36, notes: [55, 60, 64] },
  { bass: 31, notes: [55, 59, 62] },
];

export function createAudio(settings) {
  let ctx = null;
  let master;
  let music;
  let sfx;
  let noiseBuf;
  let tension;
  let tensionFilter;
  let musicOn = false;
  let nextTime = 0;
  let step = 0;
  let grind = null;
  let vols = { music: settings.music, sfx: settings.sfx };

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    music = ctx.createGain();
    sfx = ctx.createGain();
    music.connect(master);
    sfx.connect(master);
    applyVolumes();

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // tension layer: detuned low saws with a fast tremolo, faded in by the alert meter
    tension = ctx.createGain();
    tension.gain.value = 0;
    tensionFilter = ctx.createBiquadFilter();
    tensionFilter.type = 'lowpass';
    tensionFilter.frequency.value = 380;
    tensionFilter.Q.value = 6;
    const trem = ctx.createGain();
    trem.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.4;
    lfo.connect(lfoAmt).connect(trem.gain);
    for (const f of [55, 55.6, 82.4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(tensionFilter);
      o.start();
    }
    lfo.start();
    tensionFilter.connect(trem).connect(tension).connect(music);
  }

  function unlock() {
    if (!ctx) init();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function applyVolumes() {
    if (!ctx) return;
    music.gain.value = vols.music * AUDIO.musicBase;
    sfx.gain.value = vols.sfx;
  }

  function setVolumes(v) {
    vols = { ...vols, ...v };
    applyVolumes();
  }

  // ---------- building blocks ----------
  function tone(type, freq, t, dur, gain, dest, { attack = 0.005, release = 0.08, freqEnd = null, filter = null, q = 1, detune = 0 } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq;
      f.Q.value = q;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(t, dur, gain, dest, { type = 'bandpass', freq = 1000, q = 1, freqEnd = null, attack = 0.002 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ---------- music ----------
  function scheduleStep(s, t) {
    const sixteenth = 60 / AUDIO.bpm / 4;
    const bar = Math.floor(s / 16) % CHORDS.length;
    const i = s % 16;
    const ch = CHORDS[bar];
    // pad on the bar
    if (i === 0) {
      for (const n of ch.notes) {
        for (const det of [-8, 7]) tone('sawtooth', midi(n), t, sixteenth * 16, 0.035, music, { attack: 0.5, release: 0.8, filter: { freq: 1100 }, detune: det });
      }
    }
    // bass: driving 8ths with an octave pop
    if (i % 2 === 0) {
      const n = ch.bass + (i % 8 === 6 ? 12 : 0);
      tone('sawtooth', midi(n), t, sixteenth * 1.8, 0.11, music, { filter: { freq: 420 }, q: 4, release: 0.05 });
    }
    // arpeggio
    const arp = [0, 1, 2, 1, 0, 2, 1, 2];
    if (i % 2 === 1 || i === 0) {
      const n = ch.notes[arp[i % 8] % 3] + 12;
      tone('square', midi(n), t, sixteenth * 0.9, 0.022, music, { filter: { freq: 2400 }, release: 0.05 });
    }
    // drums
    if (i === 0 || i === 8) tone('sine', 150, t, 0.28, 0.5, music, { freqEnd: 42, release: 0.2 });
    if (i === 4 || i === 12) noise(t, 0.18, 0.16, music, { freq: 1800, q: 0.7 });
    if (i % 2 === 0) noise(t, 0.04, 0.035, music, { type: 'highpass', freq: 7000 });
  }

  function update(alertValue) {
    if (!ctx || ctx.state !== 'running') return;
    if (musicOn) {
      const sixteenth = 60 / AUDIO.bpm / 4;
      if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
      while (nextTime < ctx.currentTime + AUDIO.lookahead) {
        scheduleStep(step, nextTime);
        step++;
        nextTime += sixteenth;
      }
    }
    const k = Math.max(0, Math.min(1, (alertValue || 0) / 100));
    tension.gain.setTargetAtTime(musicOn ? Math.pow(k, 1.3) * AUDIO.tensionMax : 0, ctx.currentTime, 0.15);
    tensionFilter.frequency.setTargetAtTime(300 + k * 900, ctx.currentTime, 0.2);
  }

  function startMusic() {
    unlock();
    if (!ctx) return;
    if (!musicOn) { musicOn = true; step = 0; nextTime = ctx.currentTime + 0.1; }
  }

  function stopMusic() {
    musicOn = false;
    stopGrind();
  }

  // ---------- sound effects ----------
  const now = () => (ctx ? ctx.currentTime : 0);
  const ok = () => ctx && ctx.state === 'running';

  const fx = {
    footstep(crouched) {
      if (!ok()) return;
      noise(now(), crouched ? 0.05 : 0.07, crouched ? 0.06 : 0.14, sfx, { freq: 300 + Math.random() * 300, q: 1.2 });
    },
    door(opening) {
      if (!ok()) return;
      const t = now();
      noise(t, 0.45, 0.12, sfx, { type: 'lowpass', freq: opening ? 400 : 1600, freqEnd: opening ? 1600 : 400, q: 3 });
      tone('sine', opening ? 90 : 70, t, 0.25, 0.12, sfx, { freqEnd: 50 });
    },
    pickup() {
      if (!ok()) return;
      const t = now();
      [880, 1320, 1760].forEach((f, i) => tone('sine', f, t + i * 0.07, 0.12, 0.18, sfx));
    },
    denied() {
      if (!ok()) return;
      const t = now();
      tone('square', 220, t, 0.1, 0.08, sfx, { filter: { freq: 1200 } });
      tone('square', 165, t + 0.12, 0.16, 0.08, sfx, { filter: { freq: 1200 } });
    },
    click() {
      if (!ok()) return;
      const t = now();
      noise(t, 0.025, 0.12, sfx, { type: 'highpass', freq: 3000 });
      tone('sine', 2400 + Math.random() * 400, t, 0.03, 0.05, sfx);
    },
    snap() {
      if (!ok()) return;
      const t = now();
      noise(t, 0.12, 0.35, sfx, { type: 'highpass', freq: 2500 });
      tone('triangle', 1800, t, 0.18, 0.15, sfx, { freqEnd: 300 });
    },
    clunk() {
      if (!ok()) return;
      const t = now();
      tone('sine', 140, t, 0.3, 0.35, sfx, { freqEnd: 55 });
      noise(t, 0.12, 0.2, sfx, { type: 'lowpass', freq: 900 });
      tone('sine', 1320, t + 0.15, 0.25, 0.08, sfx);
    },
    bark(kind) {
      if (!ok()) return;
      const t = now();
      const syl = kind === 'huh' ? [[180, 240, 0.25]] : kind === 'who' ? [[200, 190, 0.12], [210, 200, 0.12], [230, 170, 0.22]] : [[260, 250, 0.1], [300, 280, 0.12], [250, 160, 0.25]];
      let o = 0;
      for (const [f0, f1, d] of syl) {
        tone('sawtooth', f0, t + o, d, 0.09, sfx, { freqEnd: f1, filter: { type: 'bandpass', freq: 900 }, q: 3, attack: 0.02 });
        tone('sawtooth', f0 * 2, t + o, d, 0.04, sfx, { freqEnd: f1 * 2, filter: { type: 'bandpass', freq: 2200 }, q: 4, attack: 0.02 });
        o += d + 0.03;
      }
    },
    spotted() {
      if (!ok()) return;
      const t = now();
      tone('sawtooth', 440, t, 0.15, 0.1, sfx, { filter: { freq: 2000 } });
      tone('sawtooth', 660, t + 0.12, 0.25, 0.1, sfx, { filter: { freq: 2000 } });
    },
    alarm() {
      if (!ok()) return;
      const t = now();
      for (let i = 0; i < 3; i++) tone('square', 880, t + i * 0.22, 0.14, 0.07, sfx, { freqEnd: 660, filter: { freq: 2500 } });
    },
    busted() {
      if (!ok()) return;
      const t = now();
      tone('sawtooth', 520, t, 1.1, 0.16, sfx, { freqEnd: 70, filter: { freq: 1800 } });
      noise(t, 0.8, 0.15, sfx, { type: 'lowpass', freq: 2500, freqEnd: 200 });
    },
    checkpoint() {
      if (!ok()) return;
      const t = now();
      tone('sine', 660, t, 0.18, 0.15, sfx);
      tone('sine', 990, t + 0.14, 0.3, 0.15, sfx);
    },
    ui() {
      if (!ok()) return;
      tone('triangle', 1200, now(), 0.05, 0.06, sfx);
    },
    win() {
      if (!ok()) return;
      const t = now();
      [57, 60, 64, 69, 72, 76].forEach((n, i) => tone('square', midi(n + 12), t + i * 0.09, 0.3, 0.06, sfx, { filter: { freq: 3000 } }));
    },
  };

  function startGrind() {
    if (!ok() || grind) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500;
    f.Q.value = 5;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.18, now(), 0.05);
    src.connect(f).connect(g).connect(sfx);
    src.start();
    grind = { src, g, f };
  }
  function setGrind(amount) {
    if (grind) grind.f.frequency.setTargetAtTime(400 + amount * 900, now(), 0.05);
  }
  function stopGrind() {
    if (!grind) return;
    const { src, g } = grind;
    g.gain.setTargetAtTime(0.0001, now(), 0.04);
    src.stop(now() + 0.2);
    grind = null;
  }

  return { unlock, update, startMusic, stopMusic, setVolumes, startGrind, setGrind, stopGrind, ...fx, get context() { return ctx; } };
}
