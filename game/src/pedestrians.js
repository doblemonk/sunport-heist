import * as THREE from '../vendor/three.min.js';

const SHIRT_COLORS = [
  0xc0392b, 0x2980b9, 0x27ae60, 0xf1c40f, 0xe67e22,
  0x8e44ad, 0x16a085, 0xecf0f1, 0xe74c3c, 0x3498db,
];

const TROUSER_COLORS = [
  0x2c3e50, 0x1a1a1a, 0x7f8c8d, 0x6e4b2a, 0x34495e, 0x5d4037,
];

const SKIN_COLORS = [
  0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xd9a066,
];

function fallbackRng() {
  return {
    next() { return 0.5; },
    range(min, max) { return (min + max) / 2; },
    int(min, max) { return Math.floor((min + max) / 2); },
    pick(list) { return list[0]; },
    shuffle(list) { return list.slice(); },
  };
}

export function createPedestrians(game) {
  const rng = game.rng || fallbackRng();
  const scene = game.scene;
  const world = game.world;
  const pedCount = (game.config && game.config.pedCount) || 24;

  let lastShot = null;

  if (game.events && typeof game.events.on === 'function') {
    game.events.on('gunshot', (data) => {
      lastShot = {
        x: data ? data.x : 0,
        z: data ? data.z : 0,
        time: game.time || 0,
      };
    });
  }

  function playerPos() {
    if (game.player && game.player.position) {
      return game.player.position;
    }
    return { x: 0, y: 0, z: 0 };
  }

  function distanceToPlayer(x, z) {
    const p = playerPos();
    const dx = x - p.x;
    const dz = z - p.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function buildWalker() {
    const shirt = rng.pick(SHIRT_COLORS);
    const trousers = rng.pick(TROUSER_COLORS);
    const skin = rng.pick(SKIN_COLORS);

    const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    const trouserMat = new THREE.MeshLambertMaterial({ color: trousers });
    const skinMat = new THREE.MeshLambertMaterial({ color: skin });

    const mesh = new THREE.Group();

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirtMat);
    body.position.y = 1.06;
    mesh.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skinMat);
    head.position.y = 1.56;
    mesh.add(head);

    function makeLeg(side) {
      const pivot = new THREE.Group();
      pivot.position.set(0.13 * side, 0.76, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.74, 0.18), trouserMat);
      leg.position.y = -0.37;
      pivot.add(leg);
      mesh.add(pivot);
      return pivot;
    }

    function makeArm(side) {
      const pivot = new THREE.Group();
      pivot.position.set(0.34 * side, 1.32, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.14), shirtMat);
      arm.position.y = -0.31;
      pivot.add(arm);
      mesh.add(pivot);
      return pivot;
    }

    const legL = makeLeg(-1);
    const legR = makeLeg(1);
    const armL = makeArm(-1);
    const armR = makeArm(1);

    const scale = rng.range(0.92, 1.06);
    mesh.scale.set(scale, scale, scale);

    return { mesh, legL, legR, armL, armR };
  }

  function spawnPed() {
    const parts = buildWalker();
    const p = playerPos();
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(12, 85);
    let x = p.x + Math.sin(angle) * dist;
    let z = p.z + Math.cos(angle) * dist;

    let heading = angle;
    if (world && typeof world.nearestRoadPoint === 'function') {
      const road = world.nearestRoadPoint(x, z);
      if (road) {
        const side = rng.next() < 0.5 ? 1 : -1;
        const perpX = Math.cos(road.heading);
        const perpZ = -Math.sin(road.heading);
        x = road.x + perpX * 5.4 * side;
        z = road.z + perpZ * 5.4 * side;
        heading = road.heading + (rng.next() < 0.5 ? 0 : Math.PI);
      }
    }

    parts.mesh.position.set(x, 0, z);
    parts.mesh.rotation.y = heading;

    const ped = {
      mesh: parts.mesh,
      position: parts.mesh.position,
      heading,
      speed: 1.5,
      state: 'walking',
      walkSpeed: 1.5,
      downTimer: 0,
      fleeTimer: 0,
      turnTimer: rng.range(3, 8),
      swing: rng.range(0, Math.PI * 2),
      legL: parts.legL,
      legR: parts.legR,
      armL: parts.armL,
      armR: parts.armR,
    };

    scene.add(parts.mesh);
    return ped;
  }

  function removePed(index, list) {
    const ped = list[index];
    if (ped && ped.mesh && scene) {
      scene.remove(ped.mesh);
    }
    list.splice(index, 1);
  }

  const list = [];
  for (let i = 0; i < pedCount; i++) {
    list.push(spawnPed());
  }

  function nearest(x, z, maxDist) {
    const limit = maxDist === undefined || maxDist === null ? Infinity : maxDist;
    let best = null;
    let bestDist = limit;
    for (const ped of list) {
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
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.3;
    ped.legL.rotation.x = 0;
    ped.legR.rotation.x = 0;
    ped.armL.rotation.x = 0;
    ped.armR.rotation.x = 0;
  }

  function fleeFrom(ped, threatX, threatZ) {
    const dx = ped.position.x - threatX;
    const dz = ped.position.z - threatZ;
    ped.heading = Math.atan2(dx, dz);
    ped.state = 'fleeing';
    ped.fleeTimer = 2.5;
    ped.speed = 4;
  }

  function update(dt) {
    if (game.state !== 'playing') return;
    if (!dt || dt <= 0) dt = 0.016;

    while (list.length < pedCount) {
      list.push(spawnPed());
    }

    for (let i = list.length - 1; i >= 0; i--) {
      const ped = list[i];

      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          if (distanceToPlayer(ped.position.x, ped.position.z) > 60) {
            removePed(i, list);
            list.push(spawnPed());
          } else {
            ped.state = 'walking';
            ped.speed = ped.walkSpeed;
            ped.downTimer = 0;
            ped.heading = rng.range(0, Math.PI * 2);
            ped.turnTimer = rng.range(3, 8);
            ped.mesh.rotation.x = 0;
            ped.mesh.position.y = 0;
            ped.mesh.rotation.y = ped.heading;
          }
        }
        continue;
      }

      if (distanceToPlayer(ped.position.x, ped.position.z) > 160) {
        removePed(i, list);
        list.push(spawnPed());
        continue;
      }

      if (ped.state === 'fleeing') {
        ped.fleeTimer -= dt;
        if (ped.fleeTimer <= 0) {
          ped.state = 'walking';
          ped.speed = ped.walkSpeed;
          ped.fleeTimer = 0;
        }
      } else {
        let threatX = null;
        let threatZ = null;

        if (lastShot) {
          const dx = ped.position.x - lastShot.x;
          const dz = ped.position.z - lastShot.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < 28 && (game.time || 0) - lastShot.time < 6) {
            threatX = lastShot.x;
            threatZ = lastShot.z;
          }
        }

        if (threatX === null && game.player && game.player.car) {
          const car = game.player.car;
          const carSpeed = car.speed || 0;
          if (Math.abs(carSpeed) > 8) {
            const dx = ped.position.x - car.position.x;
            const dz = ped.position.z - car.position.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < 12) {
              threatX = car.position.x;
              threatZ = car.position.z;
            }
          }
        }

        if (threatX !== null) {
          fleeFrom(ped, threatX, threatZ);
        }
      }

      if (ped.state === 'walking') {
        ped.speed = ped.walkSpeed;
        ped.turnTimer -= dt;
        if (ped.turnTimer <= 0) {
          ped.turnTimer = rng.range(4, 9);
          if (world && typeof world.nearestRoadPoint === 'function') {
            const road = world.nearestRoadPoint(ped.position.x, ped.position.z);
            if (road) {
              const roll = rng.next();
              if (roll < 0.6) {
                ped.heading = road.heading;
              } else if (roll < 0.8) {
                ped.heading = road.heading + (rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
              }
              if (rng.next() < 0.5) {
                ped.heading += Math.PI;
              }
            }
          }
        }
      } else if (ped.state === 'fleeing') {
        ped.speed = 4;
      }

      const step = ped.speed * dt;
      let moveX = Math.sin(ped.heading) * step;
      let moveZ = Math.cos(ped.heading) * step;

      if (world && typeof world.isBlocked === 'function') {
        const aheadX = ped.position.x + Math.sin(ped.heading) * 1.0;
        const aheadZ = ped.position.z + Math.cos(ped.heading) * 1.0;
        if (world.isBlocked(aheadX, aheadZ, 0.5)) {
          ped.heading += Math.PI / 2 + rng.range(-0.25, 0.25);
          moveX = Math.sin(ped.heading) * step;
          moveZ = Math.cos(ped.heading) * step;
          const ahead2X = ped.position.x + Math.sin(ped.heading) * 1.0;
          const ahead2Z = ped.position.z + Math.cos(ped.heading) * 1.0;
          if (world.isBlocked(ahead2X, ahead2Z, 0.5)) {
            moveX = 0;
            moveZ = 0;
          }
        }
      }

      ped.position.x += moveX;
      ped.position.z += moveZ;
      ped.mesh.rotation.y = ped.heading;

      const strideRate = ped.state === 'fleeing' ? 11 : 6;
      const amplitude = ped.state === 'fleeing' ? 0.85 : 0.5;
      ped.swing += dt * strideRate;
      const swingValue = Math.sin(ped.swing) * amplitude;
      ped.legL.rotation.x = swingValue;
      ped.legR.rotation.x = -swingValue;
      ped.armL.rotation.x = -swingValue;
      ped.armR.rotation.x = swingValue;
    }

    while (list.length < pedCount) {
      list.push(spawnPed());
    }
  }

  return {
    list,
    nearest,
    knockDown,
    update,
  };
}
