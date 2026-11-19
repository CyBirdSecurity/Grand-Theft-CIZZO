// Guards: waypoint patrols (A* between waypoints), PATROL / SUSPICIOUS / ALERT state machine,
// vision cones clipped by walls, flashlight cones and hearing.
import * as THREE from 'three';
import { GUARD, ALERT, PALETTE, DEBUG, DEBUG_NO_GUARDS } from './config.js';
import { GUARD_ROUTES, COLS, ROWS, tileAt, tileCenter, worldToTile, MISSION_ORDER } from './level/map.js';
import { createCharacter, blobShadow, GUARD_LOOKS } from './character.js';

const DEG = Math.PI / 180;
const HALF_FOV = (GUARD.fov / 2) * DEG;
const COS_HALF_FOV = Math.cos(HALF_FOV);
const STATE_COLORS = { PATROL: PALETTE.sunset, SUSPICIOUS: PALETTE.amber, ALERT: PALETTE.red };

const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createGuards({ scene, collision, level, audio }) {
  // ---------- pathfinding ----------
  function walkable(c, r) {
    const ch = tileAt(c, r);
    if ('.kPE'.includes(ch)) return true;
    if (ch === 'D') return true;
    if (ch === 'S') return !level.doorByKind('server').locked;
    return false;
  }

  function findPath(sc, sr, gc, gr) {
    if (!walkable(gc, gr)) {
      // nearest walkable neighbour of the goal
      let best = null;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (walkable(gc + dc, gr + dr) && (!best || Math.abs(dc) + Math.abs(dr) < best.d)) best = { c: gc + dc, r: gr + dr, d: Math.abs(dc) + Math.abs(dr) };
      }
      if (!best) return null;
      gc = best.c;
      gr = best.r;
    }
    const N = COLS * ROWS;
    const start = sr * COLS + sc;
    const goal = gr * COLS + gc;
    if (start === goal) return [];
    const g = new Float32Array(N).fill(Infinity);
    const f = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open = [start];
    g[start] = 0;
    const h = (i) => {
      const dx = Math.abs((i % COLS) - gc);
      const dz = Math.abs(Math.floor(i / COLS) - gr);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    f[start] = h(start);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open.splice(bi, 1);
      if (cur === goal) {
        const path = [];
        for (let n = goal; n !== start; n = came[n]) path.push(n);
        return path.reverse().map((i) => ({ c: i % COLS, r: Math.floor(i / COLS) }));
      }
      closed[cur] = 1;
      const cc = cur % COLS;
      const cr = Math.floor(cur / COLS);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nc = cc + dc;
          const nr = cr + dr;
          if (!walkable(nc, nr)) continue;
          if (dc && dr && (!walkable(cc + dc, cr) || !walkable(cc, cr + dr))) continue;
          // no diagonal moves through door tiles
          if (dc && dr && ('DS'.includes(tileAt(nc, nr)) || 'DS'.includes(tileAt(cc, cr)))) continue;
          const ni = nr * COLS + nc;
          if (closed[ni]) continue;
          const ng = g[cur] + (dc && dr ? 1.414 : 1);
          if (ng < g[ni]) {
            g[ni] = ng;
            f[ni] = ng + h(ni);
            came[ni] = cur;
            if (!open.includes(ni)) open.push(ni);
          }
        }
      }
    }
    return null;
  }

  const ignoreForGuards = (col) => col.doorRef && (col.doorRef.kind === 'door' || (col.doorRef.kind === 'server' && !col.doorRef.locked));

  // ---------- guard objects ----------
  const coneMats = [];
  const guards = GUARD_ROUTES.map((def, gi) => {
    const char = createCharacter(GUARD_LOOKS[gi % GUARD_LOOKS.length]);
    const shadow = blobShadow(0.42);
    scene.add(char.root, shadow);

    // flashlight beam
    // apex at the origin, opening along +Z: a uniform scale then cuts the cone short without
    // changing its spread, which is how the beam gets clipped at walls
    const beamGeo = new THREE.ConeGeometry(GUARD.beamRadius, GUARD.beamLength, 12, 1, true)
      .rotateX(-Math.PI / 2)
      .translate(0, 0, GUARD.beamLength / 2);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    beam.position.z = GUARD.beamOffset;
    char.flashlight.add(beam);

    // floor vision cone, rebuilt each frame in world space
    const n = GUARD.coneRays;
    const pos = new Float32Array((n + 2) * 3);
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(0, i + 1, i + 2);
    const coneGeo = new THREE.BufferGeometry();
    coneGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    coneGeo.setIndex(idx);
    const coneMat = new THREE.MeshBasicMaterial({ color: PALETTE.sunset, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    coneMats.push(coneMat);
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.frustumCulled = false;
    cone.renderOrder = 2;
    scene.add(cone);

    let ray = null;
    if (DEBUG) {
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      ray = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
      ray.frustumCulled = false;
      ray.visible = false;
      scene.add(ray);
    }

    return {
      def, char, shadow, cone, coneGeo, coneMat, beam, ray,
      pos: { x: 0, z: 0 },
      facing: 0,
      state: 'PATROL',
      active: true,
      wp: 0,
      dir: 1,
      pauseT: 0,
      path: [],
      pathI: 0,
      repathT: 0,
      lastKnown: null,
      lookT: 0,
      lookBase: 0,
      sees: false,
      speed: 0,
      bark: null,
      barkT: 0,
    };
  });

  let conesVisible = true;
  let debugRays = false;

  function setPath(g, x, z) {
    const s = worldToTile(g.pos.x, g.pos.z);
    const t = worldToTile(x, z);
    const tiles = findPath(s.c, s.r, t.c, t.r);
    if (!tiles) {
      g.path = [{ x, z }];
    } else {
      g.path = tiles.map((tl) => tileCenter(tl.c, tl.r));
      const goalOk = walkable(t.c, t.r);
      if (goalOk) {
        if (g.path.length) g.path[g.path.length - 1] = { x, z };
        else g.path = [{ x, z }];
      }
    }
    g.pathI = 0;
  }

  function turnToward(g, target, dt, rate = GUARD.turnRate) {
    const d = wrap(target - g.facing);
    g.facing += d * (1 - Math.exp(-rate * dt));
  }

  /** Steps along the current path; returns true when the path is done. */
  function moveAlong(g, dt, speed) {
    if (g.pathI >= g.path.length) { g.speed = 0; return true; }
    const tgt = g.path[g.pathI];
    const dx = tgt.x - g.pos.x;
    const dz = tgt.z - g.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < GUARD.waypointReach) {
      g.pathI++;
      return g.pathI >= g.path.length;
    }
    const step = Math.min(d, speed * dt);
    const ox = g.pos.x;
    const oz = g.pos.z;
    g.pos.x += (dx / d) * step;
    g.pos.z += (dz / d) * step;
    collision.resolveCircle(g.pos, GUARD.radius, ignoreForGuards);
    g.speed = Math.hypot(g.pos.x - ox, g.pos.z - oz) / Math.max(dt, 1e-4);
    turnToward(g, Math.atan2(dx, dz), dt);
    return false;
  }

  function routeTarget(g) {
    const [c, r] = g.def.route[g.wp];
    return tileCenter(c, r);
  }

  function advanceWaypoint(g) {
    const n = g.def.route.length;
    if (g.def.mode === 'loop') g.wp = (g.wp + 1) % n;
    else {
      if (g.wp + g.dir >= n || g.wp + g.dir < 0) g.dir = -g.dir;
      g.wp += g.dir;
    }
  }

  function backToPatrol(g) {
    g.state = 'PATROL';
    g.lastKnown = null;
    const t = routeTarget(g);
    setPath(g, t.x, t.z);
  }

  function say(g, text, kind) {
    g.bark = text;
    g.barkT = GUARD.barkTime;
    audio.bark(kind);
  }

  function toSuspicious(g, at) {
    if (g.state !== 'SUSPICIOUS') say(g, g.state === 'ALERT' ? 'Where did they go?' : "Who's there?", 'who');
    g.state = 'SUSPICIOUS';
    g.lastKnown = { x: at.x, z: at.z };
    g.lookT = 0;
    g.repathT = 0;
    setPath(g, at.x, at.z);
  }

  function toAlert(g, at) {
    if (g.state !== 'ALERT') say(g, 'Intruder!', 'intruder');
    g.state = 'ALERT';
    g.lastKnown = { x: at.x, z: at.z };
    g.lookT = 0;
    g.repathT = 0;
    setPath(g, at.x, at.z);
    // shout to nearby colleagues
    for (const o of guards) {
      if (o === g || !o.active || o.state !== 'PATROL') continue;
      if (Math.hypot(o.pos.x - g.pos.x, o.pos.z - g.pos.z) < 12) {
        o.state = 'SUSPICIOUS';
        o.lastKnown = { x: at.x, z: at.z };
        o.lookT = 0;
        setPath(o, at.x, at.z);
      }
    }
  }

  function canSee(g, player) {
    const dx = player.pos.x - g.pos.x;
    const dz = player.pos.z - g.pos.z;
    const dist = Math.hypot(dx, dz);
    const range = player.crouched ? GUARD.rangeCrouched : GUARD.range;
    if (dist > range) return false;
    if (dist < 0.7) return true;
    const fx = Math.sin(g.facing);
    const fz = Math.cos(g.facing);
    if ((fx * dx + fz * dz) / dist < COS_HALF_FOV) return false;
    return collision.lineOfSight(g.pos, player.pos, { crouched: player.crouched });
  }

  function updateCone(g) {
    const n = GUARD.coneRays;
    const arr = g.coneGeo.attributes.position.array;
    const y = 0.035;
    arr[0] = g.pos.x; arr[1] = y; arr[2] = g.pos.z;
    for (let i = 0; i <= n; i++) {
      const a = g.facing - HALF_FOV + (i / n) * HALF_FOV * 2;
      const d = collision.sightDistance(g.pos.x, g.pos.z, a, GUARD.range, GUARD.coneStep);
      arr[(i + 1) * 3] = g.pos.x + Math.sin(a) * d;
      arr[(i + 1) * 3 + 1] = y;
      arr[(i + 1) * 3 + 2] = g.pos.z + Math.cos(a) * d;
    }
    g.coneGeo.attributes.position.needsUpdate = true;
    g.coneMat.color.setHex(STATE_COLORS[g.state]);
    g.coneMat.opacity = g.sees ? 0.34 : g.state === 'PATROL' ? 0.17 : 0.26;
  }

  // Shorten the flashlight beam so it stops at walls, closed doors and furniture (not glass).
  const beamFrom = new THREE.Vector3();
  const beamTo = new THREE.Vector3();
  const beamDir = new THREE.Vector3();
  const passesBeam = (col) => col.kind === 'glass';
  function clipBeam(g) {
    if (!g.active) return;
    g.char.root.updateMatrixWorld(true);
    g.beam.scale.setScalar(1);
    g.beam.updateMatrixWorld();
    g.beam.getWorldPosition(beamFrom);
    beamDir.set(0, 0, 1).transformDirection(g.beam.matrixWorld);
    beamTo.copy(beamFrom).addScaledVector(beamDir, GUARD.beamLength);
    const t = collision.segmentCast(beamFrom, beamTo, 0, passesBeam);
    g.beam.scale.setScalar(Math.max(0.02, t));
  }

  function sync(g) {
    g.char.root.position.set(g.pos.x, 0, g.pos.z);
    g.char.root.rotation.y = g.facing;
    g.shadow.position.set(g.pos.x, 0.012, g.pos.z);
    g.char.root.visible = g.active;
    g.shadow.visible = g.active;
    g.cone.visible = g.active && conesVisible;
  }

  // ---------- public API ----------
  const api = {
    list: guards,
    caughtBy: null,

    reset(missionState) {
      const idx = MISSION_ORDER.indexOf(missionState);
      for (const g of guards) {
        g.active = !DEBUG_NO_GUARDS && idx >= MISSION_ORDER.indexOf(g.def.activeFrom);
        const [c0, r0] = g.def.route[0];
        const p0 = tileCenter(c0, r0);
        g.pos.x = p0.x;
        g.pos.z = p0.z;
        g.wp = 1 % g.def.route.length;
        g.dir = 1;
        g.state = 'PATROL';
        g.pauseT = 0;
        g.lastKnown = null;
        g.sees = false;
        g.bark = null;
        g.barkT = 0;
        const t = routeTarget(g);
        g.facing = angleTo(g.pos, t);
        setPath(g, t.x, t.z);
        sync(g);
      }
      api.caughtBy = null;
    },

    activateFor(missionState) {
      const idx = MISSION_ORDER.indexOf(missionState);
      for (const g of guards) {
        const should = !DEBUG_NO_GUARDS && idx >= MISSION_ORDER.indexOf(g.def.activeFrom);
        if (should && !g.active) { g.active = true; sync(g); }
      }
    },

    setConesVisible(v) {
      conesVisible = v;
      for (const g of guards) sync(g);
    },

    setDebugRays(v) {
      debugRays = v;
      for (const g of guards) if (g.ray) g.ray.visible = v && g.active;
    },

    /** Noise from the player (or lockpicking) at pos with the given radius. */
    hear(pos, radius) {
      if (radius <= 0) return;
      for (const g of guards) {
        if (!g.active || g.state === 'ALERT') continue;
        if (Math.hypot(g.pos.x - pos.x, g.pos.z - pos.z) > radius) continue;
        g.lastKnown = { x: pos.x, z: pos.z };
        if (g.state === 'PATROL') {
          say(g, 'Huh?', 'huh');
          g.state = 'SUSPICIOUS';
          g.lookT = 0;
          setPath(g, pos.x, pos.z);
          g.repathT = GUARD.repathInterval;
        } else if (g.repathT <= 0) {
          setPath(g, pos.x, pos.z);
          g.repathT = GUARD.repathInterval;
          g.lookT = 0;
        }
      }
    },

    /**
     * ctx: { player, alertValue }
     * returns { seen, nearest } where nearest is the distance of the closest guard that sees the player.
     */
    update(dt, ctx) {
      const { player, alertValue } = ctx;
      let seenAny = false;
      let nearest = Infinity;
      for (const g of guards) {
        if (!g.active) continue;
        g.sees = canSee(g, player);
        const distP = Math.hypot(player.pos.x - g.pos.x, player.pos.z - g.pos.z);
        if (g.sees) {
          seenAny = true;
          nearest = Math.min(nearest, distP);
          g.lastKnown = { x: player.pos.x, z: player.pos.z };
        }
        g.repathT -= dt;
        g.speed = 0;
        let lookYaw = 0;

        if (g.state === 'PATROL') {
          if (g.sees && alertValue >= ALERT.alert) toAlert(g, player.pos);
          else if (g.sees && alertValue >= ALERT.suspicious) toSuspicious(g, player.pos);
          else if (g.sees) {
            // noticing: stop and stare while the meter fills
            turnToward(g, angleTo(g.pos, player.pos), dt, GUARD.turnRate * 0.5);
          } else if (g.pauseT > 0) {
            g.pauseT -= dt;
            lookYaw = Math.sin(g.pauseT * 2.5) * 0.6;
            if (g.pauseT <= 0) {
              advanceWaypoint(g);
              const t = routeTarget(g);
              setPath(g, t.x, t.z);
            }
          } else if (moveAlong(g, dt, GUARD.patrolSpeed)) {
            g.pauseT = g.def.pause;
          }
        } else if (g.state === 'SUSPICIOUS') {
          if (g.sees && alertValue >= ALERT.alert) toAlert(g, player.pos);
          else {
            if (g.sees && g.repathT <= 0) { setPath(g, g.lastKnown.x, g.lastKnown.z); g.repathT = GUARD.repathInterval; }
            const done = g.pathI >= g.path.length || moveAlong(g, dt, GUARD.suspiciousSpeed);
            if (done) {
              if (g.lookT === 0) g.lookBase = g.facing;
              g.lookT += dt;
              if (g.sees) turnToward(g, angleTo(g.pos, player.pos), dt);
              else g.facing = g.lookBase + Math.sin(g.lookT * 2.1) * 1.1;
              if (g.lookT > GUARD.lookAroundTime && !g.sees) backToPatrol(g);
            }
          }
        } else if (g.state === 'ALERT') {
          if (g.sees && g.repathT <= 0) { setPath(g, player.pos.x, player.pos.z); g.repathT = GUARD.repathInterval; }
          const done = g.pathI >= g.path.length || moveAlong(g, dt, GUARD.alertSpeed);
          if (g.sees && distP < 2) turnToward(g, angleTo(g.pos, player.pos), dt);
          if (done && !g.sees) {
            if (g.lookT === 0) g.lookBase = g.facing;
            g.lookT += dt;
            g.facing = g.lookBase + Math.sin(g.lookT * 3) * 1.2;
          } else if (g.sees) g.lookT = 0;
          if (distP < GUARD.catchDistance) api.caughtBy = g;
          if (!g.sees && alertValue < ALERT.alert) toSuspicious(g, g.lastKnown || player.pos);
        }

        if (g.barkT > 0) { g.barkT -= dt; if (g.barkT <= 0) g.bark = null; }
        g.char.animate(dt, { speed: g.speed, flashlightUp: true, lookYaw });
        sync(g);
        clipBeam(g);
        if (g.cone.visible) updateCone(g);
        if (g.ray && debugRays) {
          const a = g.ray.geometry.attributes.position.array;
          a.set([g.pos.x, GUARD.eyeHeight, g.pos.z, player.pos.x, 1, player.pos.z]);
          g.ray.geometry.attributes.position.needsUpdate = true;
          g.ray.material.color.setHex(g.sees ? 0xff0000 : 0x00ff00);
        }
      }
      return { seen: seenAny, nearest };
    },
  };
  return api;
}
