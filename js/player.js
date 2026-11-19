// Cizzo: camera-relative movement, crouch toggle, carry state, noise radius, footsteps.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { createCharacter, blobShadow, CIZZO } from './character.js';

export function createPlayer({ scene, collision, audio, settings }) {
  const char = createCharacter(CIZZO);
  const shadow = blobShadow(0.45);
  scene.add(char.root, shadow);

  const p = {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    facing: 0,
    crouched: false,
    carrying: false,
    hasKeycard: false,
    kneeling: false,
    speed: 0,
    noise: 0,
    frozen: false,
    char,
    get root() { return char.root; },
  };
  let stride = 0;

  p.teleport = (x, z, facing = p.facing) => {
    p.pos.x = x;
    p.pos.z = z;
    p.vel.x = p.vel.z = 0;
    p.facing = facing;
    collision.resolveCircle(p.pos, PLAYER.radius);
    sync();
  };

  p.reset = ({ x, z, facing, hasKeycard }) => {
    p.crouched = false;
    p.carrying = false;
    p.kneeling = false;
    p.hasKeycard = !!hasKeycard;
    p.teleport(x, z, facing);
  };

  /** Direction the player faces as a unit vector on XZ. */
  p.forward = () => ({ x: Math.sin(p.facing), z: Math.cos(p.facing) });

  function sync() {
    char.root.position.set(p.pos.x, 0, p.pos.z);
    char.root.rotation.y = p.facing;
    shadow.position.x = p.pos.x;
    shadow.position.z = p.pos.z;
  }

  p.update = (dt, input, controllable) => {
    const st = input.state;
    let turn = 0;
    let my = 0;
    if (controllable && !p.frozen) {
      if (st.crouchPressed && !p.carrying) p.crouched = !p.crouched;
      turn = st.move.x;
      my = st.move.y;
      // the camera is locked behind the player: looking left/right turns the character
      p.facing -= st.look.dx * settings.lookSens;
      p.facing -= turn * PLAYER.keyTurnSpeed * dt;
      p.facing = Math.atan2(Math.sin(p.facing), Math.cos(p.facing));
    }
    if (p.carrying) p.crouched = false;
    const max = p.carrying ? PLAYER.carrySpeed : p.crouched ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
    // movement is relative to the way the character faces; backing up is slower
    const speedAlong = my * max * (my < 0 ? PLAYER.backwardMul : 1);
    const wx = Math.sin(p.facing) * speedAlong;
    const wz = Math.cos(p.facing) * speedAlong;
    const k = 1 - Math.exp(-PLAYER.accel * dt);
    p.vel.x += (wx - p.vel.x) * k;
    p.vel.z += (wz - p.vel.z) * k;

    const ox = p.pos.x;
    const oz = p.pos.z;
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    collision.resolveCircle(p.pos, PLAYER.radius);
    const moved = Math.hypot(p.pos.x - ox, p.pos.z - oz);
    p.speed = dt > 0 ? moved / dt : 0;
    if (dt > 0) {
      // keep velocity consistent with what collision allowed (wall sliding)
      p.vel.x = (p.pos.x - ox) / dt;
      p.vel.z = (p.pos.z - oz) / dt;
    }

    const moving = p.speed > PLAYER.moveThreshold;
    p.noise = moving ? (p.carrying ? PLAYER.noiseCarry : p.crouched ? PLAYER.noiseCrouch : PLAYER.noiseWalk) : 0;

    if (moving) {
      stride += moved;
      const len = p.crouched ? PLAYER.strideCrouch : PLAYER.strideWalk;
      if (stride > len) {
        stride = 0;
        audio.footstep(p.crouched);
      }
    }

    char.animate(dt, { speed: p.speed, crouch: p.crouched, carry: p.carrying, kneel: p.kneeling });
    sync();
  };

  /** Attach / detach a carried object (the computer) to the arms. */
  p.carry = (obj) => {
    p.carrying = true;
    p.crouched = false;
    char.carryAnchor.add(obj);
    obj.position.set(0, -0.1, 0);
    obj.rotation.set(0, Math.PI / 2, 0);
  };

  p.worldHead = () => new THREE.Vector3(p.pos.x, p.crouched ? 1.0 : 1.6, p.pos.z);

  sync();
  return p;
}
