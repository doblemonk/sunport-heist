import * as THREE from '../vendor/three.min.js';

// Solmar walkers: low-poly people strolling the sidewalks, turning at
// intersections, fleeing gunshots and fast cars, and falling down when
// punched or shot. They never raise the wanted level themselves — combat
// calls knockDown when it hits one.

const SHIRTS = [0xc0392b, 0x2e6f8e, 0x27ae60, 0xf39c12, 0x8e44ad, 0xe0e0e0, 0x16a085, 0xd35400];
const PANTS = [0x2b3242, 0x3b2f2f, 0x1f3a2d, 0x444444];
const SKINS = [0xd9a066, 0xc98d5a, 0x8d5524, 0xe8b98a, 0x6b4423];

function rngFloat(game) {
  const r = game && game.rng;
  if (typeof r === 'function') return r();
  if (r && typeof r.next === 'function') return r.next();
  if (r && typeof r.random === 'function') return r.random();
  if (r && typeof r.float === 'function') return r.float();
  return 0.5;
}

function rngRange(game, min, max) {
  return min + rngFloat(game) * (max - min);
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function makeBox(w, h, d, colour, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.85, metalness: 0.05 })
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function createPedestrians(game) {
  const cfg = game.config || {};
  const wantedCount = cfg.pedCount || 24;

  let lastShot = null;
  let lastShotAt = -1000;
  if (game.events && game.events.on) {
    game.events.on('gunshot', (e) => {
      if (!e) return;
      lastShot = { x: e.x || 0, z: e.z || 0 };
      lastShotAt = typeof game.time === 'number' ? game.time : 0;
    });
  }

  function playerPos() {
    if (game.player && game.player.position) return game.player.position;
    return { x: 0, z: 0 };
  }

  function buildPed() {
    const group = new THREE.Group();
    const shirt = SHIRTS[Math.floor(rngFloat(game) * SHIRTS.length) % SHIRTS.length];
    const pants = PANTS[Math.floor(rngFloat(game) * PANTS.length) % PANTS.length];
    const skin = SKINS[Math.floor(rngFloat(game) * SKINS.length) % SKINS.length];
    const body = makeBox(0.5, 0.62, 0.3, shirt, 0, 1.12, 0);
    const head = makeBox(0.32, 0.32, 0.3, skin, 0, 1.66, 0);
    const legL = makeBox(0.18, 0.68, 0.2, pants, -0.13, 0.4, 0);
    const legR = makeBox(0.18, 0.68, 0.2, pants, 0.13, 0.4, 0);
    const armL = makeBox(0.14, 0.55, 0.16, shirt, -0.34, 1.14, 0);
    const armR = makeBox(0.14, 0.55, 0.16, shirt, 0.34, 1.14, 0);
    legL.geometry.translate(0, -0.31, 0);
    legL.position.y = 0.74;
    legR.geometry.translate(0, -0.31, 0);
    legR.position.y = 0.74;
    armL.geometry.translate(0, -0.24, 0);
    armL.position.y = 1.4;
    armR.geometry.translate(0, -0.24, 0);
    armR.position.y = 1.4;
    group.add(body, head, legL, legR, armL, armR);
    const scale = rngRange(game, 0.92, 1.06);
    group.scale.setScalar(scale);
    return { group, legL, legR, armL, armR };
  }

  function spawnPed() {
    const p = playerPos();
    const world = game.world;
    const angle = rngFloat(game) * Math.PI * 2;
    const dist = rngRange(game, 12, 85);
    let x = p.x + Math.sin(angle) * dist;
    let z = p.z + Math.cos(angle) * dist;
    let heading = rngFloat(game) * Math.PI * 2;
    if (world && world.nearestRoadPoint) {
      const road = world.nearestRoadPoint(x, z);
      if (road) {
        // Sidewalk: a few metres to the side of the road centre line.
        const side = rngFloat(game) < 0.5 ? -1 : 1;
        const rx = Math.cos(road.heading || 0);
        const rz = -Math.sin(road.heading || 0);
        x = (road.x || x) + rx * 5.4 * side;
        z = (road.z || z) + rz * 5.4 * side;
        heading = (road.heading || 0) + (rngFloat(game) < 0.5 ? 0 : Math.PI);
      }
    }
    const parts = buildPed();
    parts.group.position.set(x, 0, z);
    parts.group.rotation.y = heading;
    if (game.scene) game.scene.add(parts.group);
    const ped = {
      mesh: parts.group,
      position: parts.group.position,
      heading,
      speed: 0,
      state: 'walk',
      walkSpeed: 1.5,
      downTimer: 0,
      fleeTimer: 0,
      turnTimer: rngRange(game, 3, 8),
      swing: rngFloat(game) * Math.PI * 2,
      legL: parts.legL,
      legR: parts.legR,
      armL: parts.armL,
      armR: parts.armR,
    };
    peds.list.push(ped);
    return ped;
  }

  function removePed(ped) {
    const i = peds.list.indexOf(ped);
    if (i >= 0) peds.list.splice(i, 1);
    if (game.scene) game.scene.remove(ped.mesh);
  }

  function standUp(ped) {
    ped.state = 'walk';
    ped.mesh.rotation.x = 0;
    ped.mesh.position.y = 0;
    ped.speed = 0;
    ped.heading = rngFloat(game) * Math.PI * 2;
    ped.mesh.rotation.y = ped.heading;
  }

  const peds = {
    list: [],

    nearest(x, z, maxDist) {
      let best = null;
      let bestD = maxDist === undefined ? Infinity : maxDist;
      for (const ped of peds.list) {
        if (ped.state === 'down') continue;
        const d = Math.hypot(ped.position.x - x, ped.position.z - z);
        if (d < bestD) {
          bestD = d;
          best = ped;
        }
      }
      return best;
    },

    knockDown(ped) {
      if (!ped || ped.state === 'down') return;
      ped.state = 'down';
      ped.speed = 0;
      ped.downTimer = rngRange(game, 3, 5);
      // Fall flat on the back.
      ped.mesh.rotation.x = -Math.PI / 2 + 0.12;
      ped.mesh.position.y = 0.35;
      ped.legL.rotation.x = 0;
      ped.legR.rotation.x = 0;
      ped.armL.rotation.x = 0;
      ped.armR.rotation.x = 0;
    },

    update(dt) {
      if (game.state && game.state !== 'playing') return;
      const p = playerPos();
      const world = game.world;
      const now = typeof game.time === 'number' ? game.time : 0;

      while (peds.list.length < wantedCount) spawnPed();

      for (let i = peds.list.length - 1; i >= 0; i--) {
        const ped = peds.list[i];
        const distToPlayer = Math.hypot(ped.position.x - p.x, ped.position.z - p.z);

        if (ped.state === 'down') {
          ped.downTimer -= dt;
          if (ped.downTimer <= 0) {
            if (distToPlayer > 60) {
              removePed(ped);
              spawnPed();
            } else {
              standUp(ped);
            }
          }
          continue;
        }

        if (distToPlayer > 160) {
          removePed(ped);
          spawnPed();
          continue;
        }

        // Flee a recent gunshot, or a fast car bearing down on them.
        let threat = null;
        if (lastShot && now - lastShotAt < 6) {
          const dShot = Math.hypot(ped.position.x - lastShot.x, ped.position.z - lastShot.z);
          if (dShot < 28) threat = lastShot;
        }
        if (!threat && game.player && game.player.car && Math.abs(game.player.car.speed || 0) > 8) {
          if (distToPlayer < 12) threat = { x: p.x, z: p.z };
        }
        if (threat) {
          ped.state = 'flee';
          ped.fleeTimer = 2.5;
          ped.heading = Math.atan2(ped.position.x - threat.x, ped.position.z - threat.z);
        } else if (ped.state === 'flee') {
          ped.fleeTimer -= dt;
          if (ped.fleeTimer <= 0) ped.state = 'walk';
        }

        if (ped.state === 'walk') {
          ped.turnTimer -= dt;
          if (ped.turnTimer <= 0) {
            ped.turnTimer = rngRange(game, 4, 9);
            if (world && world.nearestRoadPoint) {
              const road = world.nearestRoadPoint(ped.position.x, ped.position.z);
              if (road) {
                const roll = rngFloat(game);
                if (roll < 0.6) ped.heading = road.heading || 0;
                else if (roll < 0.8) ped.heading = (road.heading || 0) + Math.PI / 2;
                else ped.heading = (road.heading || 0) - Math.PI / 2;
                if (rngFloat(game) < 0.5) ped.heading += Math.PI;
              }
            } else {
              ped.heading += rngRange(game, -1.2, 1.2);
            }
          }
        }

        const speed = ped.state === 'flee' ? 4 : ped.walkSpeed;
        ped.speed = speed;
        const nx = ped.position.x + Math.sin(ped.heading) * speed * dt;
        const nz = ped.position.z + Math.cos(ped.heading) * speed * dt;
        if (world && world.isBlocked && world.isBlocked(nx, nz, 0.4)) {
          // Turn away from the wall instead of walking through it.
          ped.heading += Math.PI / 2 + rngRange(game, -0.4, 0.4);
        } else {
          ped.position.x = nx;
          ped.position.z = nz;
        }
        ped.mesh.rotation.y = ped.heading;
        ped.swing += dt * speed * 3.2;
        const swing = Math.sin(ped.swing) * (ped.state === 'flee' ? 0.85 : 0.55);
        ped.legL.rotation.x = swing;
        ped.legR.rotation.x = -swing;
        ped.armL.rotation.x = -swing * 0.8;
        ped.armR.rotation.x = swing * 0.8;
      }
    },
  };

  for (let i = 0; i < wantedCount; i++) spawnPed();

  return peds;
}
