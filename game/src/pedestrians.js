import * as THREE from '../vendor/three.min.js';

// Pedestrians: low-poly walkers strolling the sidewalks of Solmar.
// They walk the roads, turn at intersections, flee gunshots and fast
// cars, and fall down when punched or shot. A walker that stays down
// either stands back up or is replaced by a fresh walker.

const SHIRT_COLOURS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6,
  0xe67e22, 0x1abc9c, 0xecf0f1, 0xfd79a8, 0x00cec9, 0xfdcb6e, 0x6c5ce7];
const TROUSER_COLOURS = [0x2c3e50, 0x34495e, 0x5d4037, 0x1a1a2e,
  0x4a4a4a, 0x2f3640, 0x6b4226, 0x273c75];
const SKIN_COLOURS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

const WALK_SPEED = 1.5;
const FLEE_SPEED = 4;
const SPAWN_MIN = 12;
const SPAWN_MAX = 85;
const SIDEWALK_OFFSET = 5.4;
const DESPAWN_DISTANCE = 160;
const STAND_UP_DISTANCE = 60;
const GUNSHOT_RADIUS = 28;
const GUNSHOT_MEMORY = 6;
const FLEE_TIME = 2.5;
const CAR_FLEE_SPEED = 8;
const CAR_FLEE_RADIUS = 12;

function distance2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function boxMesh(w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

// A limb pivots at the hip/shoulder: the group sits at the joint and
// the box hangs below it, so rotating the group swings the limb.
function limb(x, y, mat, w, h, d, drop) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  pivot.add(boxMesh(w, h, d, mat, 0, drop, 0));
  return pivot;
}

export function createPedestrians(game) {
  const config = game.config || {};
  const scene = game.scene;
  const world = game.world;
  const rng = game.rng || {
    next: () => 0.5,
    range: (min, max) => (min + max) / 2,
    int: (min) => min,
    pick: (list) => list[0],
    shuffle: (list) => list.slice(),
  };
  const count = config.pedestrianCount || config.pedCount
    || config.pedestrians || 24;

  const list = [];
  let lastGunshot = null;

  if (game.events && typeof game.events.on === 'function') {
    game.events.on('gunshot', (data) => {
      if (!data) return;
      lastGunshot = { x: data.x || 0, z: data.z || 0, time: game.time || 0 };
    });
  }

  function makeWalkerMesh() {
    const shirtMat = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRT_COLOURS) });
    const trouserMat = new THREE.MeshLambertMaterial({ color: rng.pick(TROUSER_COLOURS) });
    const skinMat = new THREE.MeshLambertMaterial({ color: rng.pick(SKIN_COLOURS) });
    const group = new THREE.Group();
    group.add(boxMesh(0.55, 0.7, 0.32, shirtMat, 0, 1.05, 0));
    group.add(boxMesh(0.34, 0.34, 0.32, skinMat, 0, 1.58, 0));
    const leftLeg = limb(-0.14, 0.72, trouserMat, 0.2, 0.72, 0.22, -0.36);
    const rightLeg = limb(0.14, 0.72, trouserMat, 0.2, 0.72, 0.22, -0.36);
    const leftArm = limb(-0.37, 1.32, shirtMat, 0.16, 0.62, 0.18, -0.28);
    const rightArm = limb(0.37, 1.32, shirtMat, 0.16, 0.62, 0.18, -0.28);
    group.add(leftLeg, rightLeg, leftArm, rightArm);
    group.scale.setScalar(rng.range(0.92, 1.06));
    group.traverse((child) => { if (child.isMesh) child.castShadow = true; });
    return { group, leftLeg, rightLeg, leftArm, rightArm };
  }

  function spawnPedestrian() {
    const player = game.player;
    const px = player && player.position ? player.position.x : 0;
    const pz = player && player.position ? player.position.z : 0;
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(SPAWN_MIN, SPAWN_MAX);
    const sx = px + Math.cos(angle) * dist;
    const sz = pz + Math.sin(angle) * dist;
    let x = sx;
    let z = sz;
    let heading = rng.range(0, Math.PI * 2);
    let road = null;
    if (world && typeof world.nearestRoadPoint === 'function') road = world.nearestRoadPoint(sx, sz);
    if (road) {
      const side = rng.next() < 0.5 ? -1 : 1;
      const perp = road.heading + Math.PI / 2;
      x = road.x + Math.sin(perp) * SIDEWALK_OFFSET * side;
      z = road.z + Math.cos(perp) * SIDEWALK_OFFSET * side;
      heading = road.heading + (rng.next() < 0.5 ? 0 : Math.PI);
      if (world && typeof world.isBlocked === 'function' && world.isBlocked(x, z, 0.5)) {
        x = road.x;
        z = road.z;
      }
    }
    const built = makeWalkerMesh();
    const mesh = built.group;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const ped = {
      mesh, position: mesh.position, heading, speed: WALK_SPEED,
      walkSpeed: WALK_SPEED, state: 'walking', downTimer: 0, fleeTimer: 0,
      turnTimer: rng.range(2, 6), swing: rng.range(0, Math.PI * 2),
      leftLeg: built.leftLeg, rightLeg: built.rightLeg,
      leftArm: built.leftArm, rightArm: built.rightArm,
    };
    list.push(ped);
    return ped;
  }

  function removePedestrian(ped) {
    const index = list.indexOf(ped);
    if (index >= 0) list.splice(index, 1);
    if (scene) scene.remove(ped.mesh);
  }

  function resetLimbs(ped) {
    ped.leftLeg.rotation.x = 0;
    ped.rightLeg.rotation.x = 0;
    ped.leftArm.rotation.x = 0;
    ped.rightArm.rotation.x = 0;
  }

  function fleeFrom(ped, threatX, threatZ) {
    let dx = ped.position.x - threatX;
    const dz = ped.position.z - threatZ;
    if (dx === 0 && dz === 0) dx = 1;
    ped.heading = Math.atan2(dx, dz);
    ped.state = 'fleeing';
    ped.fleeTimer = FLEE_TIME;
    ped.speed = FLEE_SPEED;
  }

  function standUp(ped) {
    ped.state = 'walking';
    ped.speed = ped.walkSpeed;
    ped.heading = rng.range(0, Math.PI * 2);
    ped.mesh.rotation.x = 0;
    ped.mesh.position.y = 0;
    ped.turnTimer = rng.range(2, 6);
    resetLimbs(ped);
  }

  function nearest(x, z, maxDistance) {
    const limit = maxDistance === undefined ? Infinity : maxDistance;
    let best = null;
    let bestDist = limit;
    for (const ped of list) {
      if (ped.state === 'down') continue;
      const d = distance2D(x, z, ped.position.x, ped.position.z);
      if (d <= bestDist) { best = ped; bestDist = d; }
    }
    return best;
  }

  function knockDown(ped) {
    if (!ped || ped.state === 'down') return;
    ped.state = 'down';
    ped.speed = 0;
    ped.fleeTimer = 0;
    ped.downTimer = rng.range(3, 5);
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.45;
    resetLimbs(ped);
  }

  function update(dt) {
    if (game.state && game.state !== 'playing') return;
    if (!dt || dt <= 0) return;
    const player = game.player;
    const px = player && player.position ? player.position.x : 0;
    const pz = player && player.position ? player.position.z : 0;
    const car = player ? player.car : null;
    const now = game.time || 0;

    for (let i = list.length - 1; i >= 0; i -= 1) {
      const ped = list[i];
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          const d = distance2D(px, pz, ped.position.x, ped.position.z);
          if (d > STAND_UP_DISTANCE) { removePedestrian(ped); spawnPedestrian(); }
          else standUp(ped);
        }
        continue;
      }
      const distToPlayer = distance2D(px, pz, ped.position.x, ped.position.z);
      if (distToPlayer > DESPAWN_DISTANCE) {
        removePedestrian(ped);
        spawnPedestrian();
        continue;
      }
      if (ped.state === 'fleeing') {
        ped.fleeTimer -= dt;
        if (ped.fleeTimer <= 0) { ped.state = 'walking'; ped.speed = ped.walkSpeed; }
      }
      if (lastGunshot && now - lastGunshot.time < GUNSHOT_MEMORY) {
        const d = distance2D(lastGunshot.x, lastGunshot.z, ped.position.x, ped.position.z);
        if (d < GUNSHOT_RADIUS) fleeFrom(ped, lastGunshot.x, lastGunshot.z);
      }
      if (ped.state !== 'fleeing' && car && car.speed > CAR_FLEE_SPEED && car.position) {
        const d = distance2D(car.position.x, car.position.z, ped.position.x, ped.position.z);
        if (d < CAR_FLEE_RADIUS) fleeFrom(ped, car.position.x, car.position.z);
      }
      if (ped.state === 'walking') {
        ped.turnTimer -= dt;
        if (ped.turnTimer <= 0) {
          if (world && typeof world.nearestRoadPoint === 'function') {
            const road = world.nearestRoadPoint(ped.position.x, ped.position.z);
            if (road) {
              const roll = rng.next();
              if (roll < 0.6) ped.heading = road.heading;
              else if (roll < 0.8) ped.heading += rng.pick([-Math.PI / 2, Math.PI / 2]);
              if (rng.next() < 0.5) ped.heading += Math.PI;
            }
          }
          ped.turnTimer = rng.range(3, 7);
        }
      }
      const aheadX = ped.position.x + Math.sin(ped.heading) * 0.9;
      const aheadZ = ped.position.z + Math.cos(ped.heading) * 0.9;
      if (world && typeof world.isBlocked === 'function' && world.isBlocked(aheadX, aheadZ, 0.5)) {
        ped.heading += Math.PI / 2 + rng.range(-0.3, 0.3);
      }
      const nextX = ped.position.x + Math.sin(ped.heading) * ped.speed * dt;
      const nextZ = ped.position.z + Math.cos(ped.heading) * ped.speed * dt;
      if (!world || typeof world.isBlocked !== 'function' || !world.isBlocked(nextX, nextZ, 0.5)) {
        ped.position.x = nextX;
        ped.position.z = nextZ;
      }
      ped.mesh.rotation.y = ped.heading;
      ped.swing += dt * ped.speed * 3.5;
      const amp = ped.state === 'fleeing' ? 0.85 : 0.55;
      const swing = Math.sin(ped.swing) * amp;
      ped.leftLeg.rotation.x = swing;
      ped.rightLeg.rotation.x = -swing;
      ped.leftArm.rotation.x = -swing * 0.8;
      ped.rightArm.rotation.x = swing * 0.8;
    }
    while (list.length < count) spawnPedestrian();
  }

  for (let i = 0; i < count; i += 1) spawnPedestrian();

  return { list, nearest, knockDown, update };
}

export default createPedestrians;
