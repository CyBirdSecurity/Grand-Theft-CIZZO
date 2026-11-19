// Over-the-shoulder orbit camera with pitch clamp, smoothing and wall pull-in.
import * as THREE from 'three';
import { CAMERA } from './config.js';
import { tileAt, worldToTile } from './level/map.js';

const DEG = Math.PI / 180;

export function createCameraRig(camera, collision, settings) {
  const rig = {
    yaw: 0,
    pitch: CAMERA.pitchDefault * DEG,
    dist: CAMERA.distance,
    mode: 'follow', // 'follow' | 'free' | 'scripted'
    shake: 0,
  };
  const pivot = new THREE.Vector3();
  const head = new THREE.Vector3();
  const want = new THREE.Vector3();
  const smoothPivot = new THREE.Vector3();
  let snapped = false;
  let autoPitch = rig.pitch;
  const castDir = (pitch, out) => out.set(Math.sin(rig.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(rig.yaw) * Math.cos(pitch));

  function isTight(x, z) {
    const { c, r } = worldToTile(x, z);
    const solid = (ch) => ch === '#' || ch === 'g' || ch === 'r';
    return (solid(tileAt(c, r - 1)) && solid(tileAt(c, r + 1))) || (solid(tileAt(c - 1, r)) && solid(tileAt(c + 1, r)));
  }

  /** Only pitch is free: yaw is locked behind the player (horizontal look turns the character). */
  rig.applyLook = (look) => {
    const sens = settings.lookSens;
    rig.pitch += look.dy * sens * (settings.invertY ? -1 : 1);
    rig.pitch = Math.max(CAMERA.pitchMin * DEG, Math.min(CAMERA.pitchMax * DEG, rig.pitch));
  };

  rig.snapBehind = (facing) => {
    rig.yaw = facing + Math.PI;
    rig.pitch = CAMERA.pitchDefault * DEG;
    autoPitch = rig.pitch;
    snapped = false;
  };

  rig.follow = (dt, target, crouched, facing) => {
    // swing the camera to stay directly behind the character
    let dy = facing + Math.PI - rig.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    rig.yaw += dy * (1 - Math.exp(-CAMERA.yawFollowRate * dt));
    head.set(target.x, crouched ? 1.1 : CAMERA.height, target.z);
    if (!snapped) { smoothPivot.copy(head); snapped = true; }
    smoothPivot.lerp(head, 1 - Math.exp(-CAMERA.followRate * dt));

    const dir = new THREE.Vector3();
    const right = new THREE.Vector3(Math.cos(rig.yaw), 0, -Math.sin(rig.yaw));
    pivot.copy(smoothPivot).addScaledVector(right, CAMERA.shoulder);
    // keep the shoulder offset itself out of walls
    const ts = collision.segmentCast(smoothPivot, pivot, 0.15);
    if (ts < 1) pivot.lerpVectors(smoothPivot, pivot, Math.max(0, ts - 0.05));

    const desired = isTight(target.x, target.z) ? CAMERA.tightDistance : CAMERA.distance;
    // If a wall sits right behind the player, lift the camera over it instead of zooming
    // into the back of the head (walls are 3 m tall and the ceiling is see-through from above).
    let usePitch = rig.pitch;
    let bestT = -1;
    for (const p of [rig.pitch, 0.7, 0.95, 1.15, 1.3, 1.42]) {
      if (p < rig.pitch) continue;
      castDir(p, dir);
      want.copy(pivot).addScaledVector(dir, desired);
      const tp = collision.segmentCast(pivot, want, CAMERA.pad);
      if (tp > bestT + 0.05) { bestT = tp; usePitch = p; }
      if (tp > 0.85) break;
    }
    autoPitch += (usePitch - autoPitch) * (1 - Math.exp(-6 * dt));
    if (autoPitch < rig.pitch) autoPitch = rig.pitch;
    castDir(autoPitch, dir);
    want.copy(pivot).addScaledVector(dir, desired);
    const t = collision.segmentCast(pivot, want, CAMERA.pad);
    const allowed = Math.max(CAMERA.minDistance, desired * t - 0.05);
    const rate = allowed < rig.dist ? CAMERA.pullInRate : CAMERA.easeOutRate;
    rig.dist += (allowed - rig.dist) * (1 - Math.exp(-rate * dt));
    if (rig.dist > allowed) rig.dist = Math.min(rig.dist, allowed + 0.02);

    camera.position.copy(pivot).addScaledVector(dir, rig.dist);
    camera.lookAt(pivot);
    if (rig.shake > 0 && !settings.reducedMotion) {
      camera.position.x += (Math.random() - 0.5) * rig.shake;
      camera.position.y += (Math.random() - 0.5) * rig.shake;
    }
    rig.shake = Math.max(0, rig.shake - dt * 0.6);
  };

  // ---- debug free-fly ----
  const freePos = new THREE.Vector3();
  let freeYaw = 0;
  let freePitch = 0;
  rig.enterFree = () => {
    rig.mode = 'free';
    freePos.copy(camera.position);
    freeYaw = rig.yaw;
    freePitch = -rig.pitch;
  };
  rig.updateFree = (dt, input, keys) => {
    freeYaw -= input.look.dx;
    freePitch = Math.max(-1.5, Math.min(1.5, freePitch - input.look.dy));
    const fwd = new THREE.Vector3(-Math.sin(freeYaw) * Math.cos(freePitch), Math.sin(freePitch), -Math.cos(freeYaw) * Math.cos(freePitch));
    const right = new THREE.Vector3(Math.cos(freeYaw), 0, -Math.sin(freeYaw));
    const sp = 8 * dt;
    freePos.addScaledVector(fwd, input.move.y * sp).addScaledVector(right, input.move.x * sp);
    if (keys.up) freePos.y += sp;
    if (keys.down) freePos.y -= sp;
    camera.position.copy(freePos);
    camera.lookAt(freePos.clone().add(fwd));
  };
  rig.setFree = (pos, look) => {
    rig.mode = 'free';
    freePos.copy(pos);
    const d = look.clone().sub(pos).normalize();
    freeYaw = Math.atan2(-d.x, -d.z);
    freePitch = Math.asin(d.y);
    camera.position.copy(pos);
    camera.lookAt(look);
  };

  return rig;
}
