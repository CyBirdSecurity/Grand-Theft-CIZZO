// Quality tiers: pixel ratio cap, bloom resolution, dynamic light count and antialiasing.
import { QUALITY } from './config.js';
import { isTouchDevice } from './input.js';

export const TIERS = ['low', 'medium', 'high'];

/** First-run guess: touch devices and small or software GPUs get "low". */
export function detectTier() {
  if (isTouchDevice()) return 'low';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'low';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return 'low';
    if (/intel|mali|adreno [1-5]|powervr/i.test(name)) return 'medium';
  } catch {
    return 'medium';
  }
  if (Math.min(screen.width, screen.height) < 600) return 'low';
  return 'high';
}

export function tierSettings(tier) {
  return QUALITY[tier] || QUALITY.medium;
}

export function pixelRatioFor(tier) {
  return Math.min(window.devicePixelRatio || 1, tierSettings(tier).pixelRatio);
}
