import * as THREE from '../vendor/three.min.js';

const SHIRT_COLORS = [0xd94f3d, 0x3d7bd9, 0x3dd94f, 0xd9c23d, 0x8e44ad, 0x16a085, 0xe67e22, 0xecf0f1, 0x2c3e50, 0xc0392b, 0x3498db, 0xf1c40f];
const TROUSER_COLORS = [0x2c3e50, 0x34495e, 0x5d6d7e, 0x7b3f00, 0x1a1a1a, 0x4a6741, 0x6c3483, 0x7e5109];
const SKIN_COLORS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xa67b5b];

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
  const pedCount = config.pedCount || 24;

  const list = [];
  let lastShot = { x: 0, z: 0, time: -1000 };

  if (game.events && typeof game.events.on === 'function') {
    game.events.on('gunshot', (data) => {
      if (!data) return;
      lastShot = { x: data.x || 0, z: data.z || 0, time: game.time || 0 };
    });
  }

  function playerPos() {
    if (game.player && game.player.position) return game.player.position;
    return { x: 0, y: 0, z: 0 };
  }

  function makeLimb(width, height, depth, color, pivotY, offsetY) {
    const pivot = new THREE.Group();
    pivot.position.y = pivotY;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.y = offsetY;
    pivot.add(mesh);
    return pivot;
  }

  function spawnPedestrian() {
    const p = playerPos();
    const angle = rng.range(0, Math.PI * 2);
    const distance = rng.range(12, 85);
    let x = p.x + Math.cos(angle) * distance;
    let z = p.z + Math.sin(angle) * distance;

    let roadHeading = angle;
    if (world && typeof world.nearestRoadPoint === 'function') {
      const road = world.nearestRoadPoint(x, z);
      if (road) {
        roadHeading = road.heading || 0;
        const side = rng.next() < 0.5 ? 1 : -1;
        const perpX = Math.cos(roadHeading);
        const perpZ = -Math.sin(roadHeading);
        x = road.x + perpX * 5.4 * side;
        z = road.z + perpZ * 5.4 * side;
      }
    }

    const heading = roadHeading + (rng.next() < 0.5 ? 0 : Math.PI);
    const shirt = rng.pick(SHIRT_COLORS);
    const trousers = rng.pick(TROUSER_COLORS);
    const skin = rng.pick(SKIN_COLORS);

    const mesh = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.65, 0.3),
      new THREE.MeshLambertMaterial({ color: shirt })
    );
    body.position.y = 0.95;
    mesh.add(body);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.34, 0.34),
      new THREE.MeshLambertMaterial({ color: skin })
    );
    head.position.y = 1.45;
    mesh.add(head);

    const legL = makeLimb(0.18, 0.55, 0.18, trousers, 0.62, -0.27);
    legL.position.x = -0.14;
    mesh.add(legL);

    const legR = makeLimb(0.18, 0.55, 0.18, trousers, 0.62, -0.27);
    legR.position.x = 0.14;
    mesh.add(legR);

    const armL = makeLimb(0.14, 0.55, 0.14, shirt, 1.22, -0.27);
    armL.position.x = -0.33;
    mesh.add(armL);

    const armR = makeLimb(0.14, 0.55, 0.14, shirt, 1.22, -0.27);
    armR.position.x = 0.33;
    mesh.add(armR);

    const scale = rng.range(0.92, 1.06);
    mesh.scale.setScalar(scale);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    if (scene) scene.add(mesh);

    const ped = {
      mesh,
      position: mesh.position,
      heading,
      speed: 1.5,
      state: 'walking',
      walkSpeed: 1.5,
      downTimer: 0,
      fleeTimer: 0,
      turnTimer: rng.range(2, 6),
      swing: rng.range(0, Math.PI * 2),
      legL,
      legR,
      armL,
      armR,
    };
    list.push(ped);
    return ped;
  }

  function removePedestrian(index) {
    const ped = list[index];
    if (!ped) return;
    if (scene && ped.mesh) scene.remove(ped.mesh);
    list.splice(index, 1);
  }

  function nearest(x, z, maxDist) {
    const max = maxDist === undefined || maxDist === null ? Infinity : maxDist;
    let best = null;
    let bestDist = max;
    for (let i = 0; i < list.length; i++) {
      const ped = list[i];
      if (ped.state === 'down') continue;
      const dx = ped.position.x - x;
      const dz = ped.position.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestDist) {
        bestDist = d;
        best = ped;
      }
    }
    return best;
  }

  function knockDown(ped) {
    if (!ped || ped.state === 'down') return;
    ped.state = 'down';
    ped.speed = 0;
    ped.downTimer = rng.range(3, 5);
    ped.fleeTimer = 0;
    ped.swing = 0;
    ped.legL.rotation.x = 0;
    ped.legR.rotation.x = 0;
    ped.armL.rotation.x = 0;
    ped.armR.rotation.x = 0;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.3;
  }

  function update(dt) {
    if (game.state !== 'playing') return;
    if (!dt || dt <= 0) dt = 0.016;
    if (dt > 0.1) dt = 0.1;

    while (list.length < pedCount) spawnPedestrian();

    const p = playerPos();
    const now = game.time || 0;
    const car = game.player ? game.player.car : null;
    const carSpeed = car ? car.speed || 0 : 0;

    for (let i = list.length - 1; i >= 0; i--) {
      const ped = list[i];
      const dxPlayer = ped.position.x - p.x;
      const dzPlayer = ped.position.z - p.z;
      const distPlayer = Math.sqrt(dxPlayer * dxPlayer + dzPlayer * dzPlayer);

      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          if (distPlayer > 60) {
            removePedestrian(i);
            spawnPedestrian();
          } else {
            ped.state = 'walking';
            ped.speed = ped.walkSpeed;
            ped.heading = rng.range(0, Math.PI * 2);
            ped.turnTimer = rng.range(1, 4);
            ped.mesh.rotation.x = 0;
            ped.mesh.rotation.y = ped.heading;
            ped.mesh.position.y = 0;
          }
        }
        continue;
      }

      if (distPlayer > 160) {
        removePedestrian(i);
        spawnPedestrian();
        continue;
      }

      let threatX = 0;
      let threatZ = 0;
      let threatened = false;

      const shotDx = ped.position.x - lastShot.x;
      const shotDz = ped.position.z - lastShot.z;
      const shotDist = Math.sqrt(shotDx * shotDx + shotDz * shotDz);
      if (now - lastShot.time < 6 && shotDist < 28) {
        threatX = lastShot.x;
        threatZ = lastShot.z;
        threatened = true;
      }

      if (!threatened && car && carSpeed > 8 && distPlayer < 12) {
        threatX = p.x;
        threatZ = p.z;
        threatened = true;
      }

      if (threatened) {
        if (ped.state !== 'fleeing') {
          ped.state = 'fleeing';
          ped.fleeTimer = 2.5;
          const awayX = ped.position.x - threatX;
          const awayZ = ped.position.z - threatZ;
          if (awayX !== 0 || awayZ !== 0) {
            ped.heading = Math.atan2(awayX, awayZ);
          }
        }
      }

      if (ped.state === 'fleeing') {
        ped.fleeTimer -= dt;
        ped.speed = 4;
        if (ped.fleeTimer <= 0) {
          ped.state = 'walking';
          ped.speed = ped.walkSpeed;
        }
      } else {
        ped.speed = ped.walkSpeed;
        ped.turnTimer -= dt;
        if (ped.turnTimer <= 0) {
          ped.turnTimer = rng.range(2, 6);
          let roadHeading = ped.heading;
          if (world && typeof world.nearestRoadPoint === 'function') {
            const road = world.nearestRoadPoint(ped.position.x, ped.position.z);
            if (road) roadHeading = road.heading || 0;
          }
          const roll = rng.next();
          if (roll < 0.6) {
            ped.heading = roadHeading;
          } else if (roll < 0.8) {
            ped.heading = roadHeading + (rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
          }
          if (rng.next() < 0.5) ped.heading += Math.PI;
        }
      }

      const aheadX = ped.position.x + Math.sin(ped.heading) * ped.speed * dt;
      const aheadZ = ped.position.z + Math.cos(ped.heading) * ped.speed * dt;
      if (world && typeof world.isBlocked === 'function' && world.isBlocked(aheadX, aheadZ, 0.5)) {
        ped.heading += (rng.next() < 0.5 ? 1 : -1) * (Math.PI / 2) + rng.range(-0.25, 0.25);
      } else {
        ped.position.x = aheadX;
        ped.position.z = aheadZ;
      }

      ped.mesh.rotation.y = ped.heading;
      ped.mesh.position.y = 0;
      ped.swing += dt * ped.speed * 3.5;
      const amp = ped.state === 'fleeing' ? 0.85 : 0.5;
      const s = Math.sin(ped.swing);
      ped.legL.rotation.x = s * amp;
      ped.legR.rotation.x = -s * amp;
      ped.armL.rotation.x = -s * amp * 0.8;
      ped.armR.rotation.x = s * amp * 0.8;
    }

    while (list.length < pedCount) spawnPedestrian();
  }

  for (let i = 0; i < pedCount; i++) spawnPedestrian();

  return { list, nearest, knockDown, update };
}
