// pedestrians.js — the walkers of Solmar.
// Low-poly people strolling the sidewalks, turning at intersections,
// fleeing gunshots and fast cars, and falling down when punched or shot.

import * as THREE from '../vendor/three.min.js';

const SHIRT_COLORS = [
  0xd94f3d, 0x3d7bd9, 0x3fae5a, 0xe0b93c, 0xe07b2e,
  0x8a5fd6, 0x2ea8a0, 0xe8e4da, 0xc94f7c, 0x5a6b7a,
];
const TROUSER_COLORS = [0x2e3a4d, 0x3a3a3a, 0x4a3226, 0x5a5a5a, 0x22303f];
const SKIN_COLORS = [0xe8b88a, 0xc98d5f, 0x8a5a34, 0xf0c8a0, 0x6e4423];

const WALK_SPEED = 1.5;
const FLEE_SPEED = 4;
const FLEE_TIME = 2.5;
const SHOT_FLEE_DIST = 28;
const SHOT_FLEE_AGE = 6;
const CAR_FLEE_DIST = 12;
const CAR_FLEE_SPEED = 8;
const DESPAWN_DIST = 160;
const STAND_UP_DIST = 60;
const SPAWN_MIN_DIST = 12;
const SPAWN_MAX_DIST = 85;
const SIDEWALK_OFFSET = 5.4;
const LOOKAHEAD = 0.9;

function fallbackRng() {
  return {
    next() { return 0.5; },
    range(min, max) { return (min + max) / 2; },
    int(min, max) { return min; },
    pick(list) { return list[0]; },
    shuffle(list) { return list.slice(); },
  };
}

export function createPedestrians(game) {
  const rng = game.rng || fallbackRng();
  const scene = game.scene;
  const world = game.world;
  const player = game.player;
  const config = game.config || {};
  const targetCount = typeof config.pedCount === 'number' ? config.pedCount : 24;

  // The most recent gunshot, so nearby walkers can flee from it.
  let lastShot = null;
  if (game.events && typeof game.events.on === 'function') {
    game.events.on('gunshot', (data) => {
      if (!data) return;
      lastShot = { x: data.x || 0, z: data.z || 0, time: game.time || 0 };
    });
  }

  const list = [];

  function buildLimb(parent, width, height, depth, material, pivotX, pivotY) {
    const pivot = new THREE.Group();
    pivot.position.set(pivotX, pivotY, 0);
    const limb = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    limb.position.y = -height / 2;
    pivot.add(limb);
    parent.add(pivot);
    return pivot;
  }

  function spawnWalker() {
    const px = player.position.x;
    const pz = player.position.z;

    // Pick a spot on a sidewalk near a road, some distance from the player.
    let x = px;
    let z = pz;
    let heading = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      const angle = rng.range(0, Math.PI * 2);
      const dist = rng.range(SPAWN_MIN_DIST, SPAWN_MAX_DIST);
      const sx = px + Math.cos(angle) * dist;
      const sz = pz + Math.sin(angle) * dist;
      const road = world.nearestRoadPoint(sx, sz);
      // Step sideways off the road's centre line onto the sidewalk.
      const side = rng.pick([-1, 1]);
      const perpX = Math.cos(road.heading);
      const perpZ = -Math.sin(road.heading);
      x = road.x + perpX * SIDEWALK_OFFSET * side;
      z = road.z + perpZ * SIDEWALK_OFFSET * side;
      // Face along the road, in either direction.
      heading = road.heading + (rng.next() < 0.5 ? 0 : Math.PI);
      x = Math.max(-415, Math.min(415, x));
      z = Math.max(-415, Math.min(415, z));
      if (!world.isBlocked(x, z, 0.5)) break;
    }

    // A low-poly person: body box, head box, two legs, two arms.
    const shirtMat = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRT_COLORS) });
    const trouserMat = new THREE.MeshLambertMaterial({ color: rng.pick(TROUSER_COLORS) });
    const skinMat = new THREE.MeshLambertMaterial({ color: rng.pick(SKIN_COLORS) });

    const mesh = new THREE.Group();

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.28), shirtMat);
    body.position.y = 0.73;
    mesh.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), skinMat);
    head.position.y = 1.15;
    mesh.add(head);

    // Legs pivot at the hip, arms pivot at the shoulder, so they can swing.
    const legL = buildLimb(mesh, 0.16, 0.46, 0.16, trouserMat, -0.13, 0.46);
    const legR = buildLimb(mesh, 0.16, 0.46, 0.16, trouserMat, 0.13, 0.46);
    const armL = buildLimb(mesh, 0.12, 0.44, 0.12, shirtMat, -0.32, 0.96);
    const armR = buildLimb(mesh, 0.12, 0.44, 0.12, shirtMat, 0.32, 0.96);

    mesh.scale.setScalar(rng.range(0.92, 1.06));
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);

    const walker = {
      mesh,
      position: mesh.position,
      heading,
      speed: WALK_SPEED,
      state: 'walking',
      walkSpeed: WALK_SPEED,
      downTimer: 0,
      fleeTimer: 0,
      turnTimer: rng.range(2, 6),
      swing: rng.range(0, Math.PI * 2),
      legL,
      legR,
      armL,
      armR,
    };
    list.push(walker);
    return walker;
  }

  function removeWalker(walker) {
    const i = list.indexOf(walker);
    if (i >= 0) list.splice(i, 1);
    scene.remove(walker.mesh);
  }

  function replaceWalker(walker) {
    removeWalker(walker);
    spawnWalker();
  }

  function nearest(x, z, maxDist) {
    const limit = typeof maxDist === 'number' ? maxDist : Infinity;
    let best = null;
    let bestDist = limit;
    for (const walker of list) {
      if (walker.state === 'down') continue;
      const d = Math.hypot(walker.position.x - x, walker.position.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = walker;
      }
    }
    return best;
  }

  function knockDown(walker) {
    if (!walker || walker.state === 'down') return;
    walker.state = 'down';
    walker.speed = 0;
    walker.downTimer = rng.range(3, 5);
    walker.fleeTimer = 0;
    walker.swing = 0;
    // Limbs go neutral as the walker goes down.
    walker.legL.rotation.x = 0;
    walker.legR.rotation.x = 0;
    walker.armL.rotation.x = 0;
    walker.armR.rotation.x = 0;
    // Tipped flat on its back, lifted slightly off the ground.
    walker.mesh.rotation.x = -Math.PI / 2;
    walker.mesh.position.y = 0.25;
  }

  function update(dt) {
    if (!game || game.state !== 'playing') return;
    const px = player.position.x;
    const pz = player.position.z;
    const car = player.car || null;

    for (let i = list.length - 1; i >= 0; i--) {
      const walker = list[i];
      const distToPlayer = Math.hypot(walker.position.x - px, walker.position.z - pz);

      // A walker on the ground counts its timer down.
      if (walker.state === 'down') {
        walker.downTimer -= dt;
        if (walker.downTimer <= 0) {
          if (distToPlayer > STAND_UP_DIST) {
            replaceWalker(walker);
          } else {
            // Stands back up with a fresh random heading.
            walker.state = 'walking';
            walker.speed = walker.walkSpeed;
            walker.heading = rng.range(0, Math.PI * 2);
            walker.turnTimer = rng.range(2, 6);
            walker.swing = 0;
            walker.mesh.rotation.x = 0;
            walker.mesh.position.y = 0;
            walker.mesh.rotation.y = walker.heading;
          }
        }
        continue;
      }

      // Too far from the player: swap in a fresh walker nearer by.
      if (distToPlayer > DESPAWN_DIST) {
        replaceWalker(walker);
        continue;
      }

      // Flee from a recent nearby gunshot, or from the player's fast car.
      let threatX = null;
      let threatZ = null;
      if (lastShot && (game.time - lastShot.time) <= SHOT_FLEE_AGE) {
        const shotDist = Math.hypot(walker.position.x - lastShot.x, walker.position.z - lastShot.z);
        if (shotDist <= SHOT_FLEE_DIST) {
          threatX = lastShot.x;
          threatZ = lastShot.z;
        }
      }
      if (threatX === null && car && car.speed > CAR_FLEE_SPEED) {
        const carDist = Math.hypot(walker.position.x - car.position.x, walker.position.z - car.position.z);
        if (carDist <= CAR_FLEE_DIST) {
          threatX = car.position.x;
          threatZ = car.position.z;
        }
      }
      if (threatX !== null) {
        walker.state = 'fleeing';
        walker.fleeTimer = FLEE_TIME;
        // Run directly away from the threat.
        walker.heading = Math.atan2(walker.position.x - threatX, walker.position.z - threatZ);
      }

      if (walker.state === 'fleeing') {
        walker.fleeTimer -= dt;
        walker.speed = FLEE_SPEED;
        if (walker.fleeTimer <= 0) {
          walker.state = 'walking';
          walker.speed = walker.walkSpeed;
          walker.turnTimer = rng.range(2, 5);
        }
      } else {
        // Walking: re-align to the road when the turn timer runs out.
        walker.speed = walker.walkSpeed;
        walker.turnTimer -= dt;
        if (walker.turnTimer <= 0) {
          const road = world.nearestRoadPoint(walker.position.x, walker.position.z);
          const roll = rng.next();
          let newHeading;
          if (roll < 0.6) {
            // Six times in ten: take the road's heading.
            newHeading = road.heading;
          } else if (roll < 0.8) {
            // Two times in ten: turn a right angle either way.
            newHeading = road.heading + rng.pick([-1, 1]) * (Math.PI / 2);
          } else {
            // Otherwise: keep the current heading.
            newHeading = walker.heading;
          }
          // Half the time, flip around.
          if (rng.next() < 0.5) newHeading += Math.PI;
          walker.heading = newHeading;
          walker.turnTimer = rng.range(4, 9);
        }
      }

      // Step forward, unless the way ahead is blocked.
      const forwardX = Math.sin(walker.heading);
      const forwardZ = Math.cos(walker.heading);
      const aheadX = walker.position.x + forwardX * LOOKAHEAD;
      const aheadZ = walker.position.z + forwardZ * LOOKAHEAD;
      if (world.isBlocked(aheadX, aheadZ, 0.4)) {
        // Turn away by a right angle plus a small random amount.
        walker.heading += rng.pick([-1, 1]) * (Math.PI / 2) + rng.range(-0.35, 0.35);
      } else {
        walker.position.x += forwardX * walker.speed * dt;
        walker.position.z += forwardZ * walker.speed * dt;
      }
      walker.mesh.rotation.y = walker.heading;

      // Limbs swing with the stride, wider while fleeing.
      const fleeing = walker.state === 'fleeing';
      const amplitude = fleeing ? 0.7 : 0.45;
      walker.swing += dt * walker.speed * (fleeing ? 3.0 : 2.4);
      const swing = Math.sin(walker.swing);
      walker.legL.rotation.x = swing * amplitude;
      walker.legR.rotation.x = -swing * amplitude;
      walker.armL.rotation.x = -swing * amplitude * 0.8;
      walker.armR.rotation.x = swing * amplitude * 0.8;
    }

    // Keep the city topped up with walkers.
    while (list.length < targetCount) spawnWalker();
  }

  // The city starts with a full crowd.
  for (let i = 0; i < targetCount; i++) spawnWalker();

  return { list, nearest, knockDown, update };
}
