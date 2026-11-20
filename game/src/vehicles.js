import * as THREE from '../vendor/three.min.js';

// Sunport Heist — vehicles (cars): meshes, parked cars, stealing, driving.
// Forward is local +Z. The group carries its wheels in userData.wheels
// so traffic and other systems can spin them.

// Slower generic fallback specs, overlaid by config.carSpecs when present.
// Fields: top speed, acceleration, braking, reverse speed, steering.
const FALLBACK_SPECS = {
  sedan: { topSpeed: 28, acceleration: 14, braking: 24, reverseSpeed: 10, steering: 1.9 },
  coupe: { topSpeed: 34, acceleration: 17, braking: 24, reverseSpeed: 10, steering: 2.1 },
  taxi: { topSpeed: 28, acceleration: 14, braking: 24, reverseSpeed: 10, steering: 1.9 },
  truck: { topSpeed: 22, acceleration: 9, braking: 18, reverseSpeed: 8, steering: 1.4 },
  cruiser: { topSpeed: 36, acceleration: 18, braking: 26, reverseSpeed: 10, steering: 2.0 },
};

const FALLBACK_COLOURS = [
  0xff4444, 0x4488ff, 0x44cc66, 0xffcc33, 0xf2ede4, 0x1a1a1a,
  0x888888, 0xff8833, 0xaa55cc, 0x33bbbb, 0xcc6622, 0x334455,
  0xcccccc, 0xcc99ff, 0x99cc99,
];

const KNOWN_KINDS = ['sedan', 'coupe', 'taxi', 'truck', 'cruiser'];

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalKind(kind) {
  if (KNOWN_KINDS.indexOf(kind) !== -1) return kind;
  return 'sedan';
}

// Build a low-poly car mesh for a kind and colour. Unknown kind builds
// as a sedan; a missing colour defaults to grey.
export function buildCarMesh(kind, colour) {
  const type = normalKind(kind);
  const paint = colour === undefined || colour === null ? 0x808080 : colour;

  const group = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color: paint });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2530 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0x999999 });

  function box(width, height, depth, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  // Main body: long along local Z, forward is +Z.
  box(2.0, 0.55, 4.4, bodyMat, 0, 0.62, 0);

  if (type === 'truck') {
    // Front cab plus an open bed behind it.
    box(1.9, 0.95, 1.3, bodyMat, 0, 1.05, 1.35);
    box(1.7, 0.5, 1.1, glassMat, 0, 1.15, 1.35);
    // Open bed: floor and low walls, no roof.
    box(1.9, 0.18, 2.4, darkMat, 0, 0.82, -0.9);
    box(0.12, 0.5, 2.4, bodyMat, -0.95, 1.05, -0.9);
    box(0.12, 0.5, 2.4, bodyMat, 0.95, 1.05, -0.9);
    box(1.9, 0.5, 0.12, bodyMat, 0, 1.05, -2.05);
  } else {
    // Cabin slightly rear of centre, in dark glass.
    box(1.7, 0.5, 2.0, glassMat, 0, 1.12, -0.35);
    box(1.74, 0.08, 2.04, bodyMat, 0, 0.92, -0.35);
  }

  // Four cylinder wheels with hubs, axle along local X.
  const wheels = [];
  const wheelSpots = [
    [-0.95, 1.45], [0.95, 1.45],
    [-0.95, -1.45], [0.95, -1.45],
  ];
  for (let i = 0; i < wheelSpots.length; i++) {
    const spot = wheelSpots[i];
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12), tyreMat
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(spot[0], 0.35, spot[1]);
    group.add(wheel);
    wheels.push(wheel);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.32, 8), hubMat
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.set(spot[0], 0.35, spot[1]);
    group.add(hub);
  }
  group.userData.wheels = wheels;

  // Headlights facing local forward (+Z), taillights facing backward.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  box(0.35, 0.18, 0.08, lightMat, -0.6, 0.65, 2.22);
  box(0.35, 0.18, 0.08, lightMat, 0.6, 0.65, 2.22);
  box(0.35, 0.18, 0.08, tailMat, -0.6, 0.65, -2.22);
  box(0.35, 0.18, 0.08, tailMat, 0.6, 0.65, -2.22);

  if (type === 'taxi') {
    // Yellow taxi sign on top of the cabin.
    const signMat = new THREE.MeshLambertMaterial({ color: 0xffcc00 });
    box(0.9, 0.22, 0.4, signMat, 0, 1.48, -0.35);
  }

  if (type === 'cruiser') {
    // Black roof bar with blue and red flashing boxes.
    const barMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    box(1.6, 0.12, 0.35, barMat, 0, 1.42, -0.35);
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2244ff });
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    box(0.5, 0.2, 0.3, blueMat, -0.45, 1.55, -0.35);
    box(0.5, 0.2, 0.3, redMat, 0.45, 1.55, -0.35);
  }

  return group;
}

export function createVehicles(game) {
  const config = game.config || {};
  const scene = game.scene;
  const rng = game.rng || null;
  const world = game.world || null;

  // Seeded random helpers; fall back to a constant one half when the
  // game's random source is missing, never the built-in unseeded random.
  function rnd() {
    if (rng && typeof rng.next === 'function') return rng.next();
    return 0.5;
  }
  function range(min, max) {
    if (rng && typeof rng.range === 'function') return rng.range(min, max);
    return min + (max - min) * 0.5;
  }
  function pick(list) {
    if (!list || list.length === 0) return undefined;
    if (rng && typeof rng.pick === 'function') return rng.pick(list);
    return list[Math.floor(rnd() * list.length)];
  }

  function paintList() {
    if (Array.isArray(config.carColors) && config.carColors.length > 0) {
      return config.carColors;
    }
    return FALLBACK_COLOURS;
  }

  function specsFor(kind) {
    const type = normalKind(kind);
    const base = FALLBACK_SPECS[type];
    const spec = {
      topSpeed: base.topSpeed,
      acceleration: base.acceleration,
      braking: base.braking,
      reverseSpeed: base.reverseSpeed,
      steering: base.steering,
    };
    const fromConfig = config.carSpecs && config.carSpecs[type];
    if (fromConfig) {
      if (typeof fromConfig.topSpeed === 'number') spec.topSpeed = fromConfig.topSpeed;
      if (typeof fromConfig.maxSpeed === 'number') spec.topSpeed = fromConfig.maxSpeed;
      if (typeof fromConfig.top === 'number') spec.topSpeed = fromConfig.top;
      if (typeof fromConfig.acceleration === 'number') spec.acceleration = fromConfig.acceleration;
      if (typeof fromConfig.accel === 'number') spec.acceleration = fromConfig.accel;
      if (typeof fromConfig.braking === 'number') spec.braking = fromConfig.braking;
      if (typeof fromConfig.brake === 'number') spec.braking = fromConfig.brake;
      if (typeof fromConfig.reverseSpeed === 'number') spec.reverseSpeed = fromConfig.reverseSpeed;
      if (typeof fromConfig.reverse === 'number') spec.reverseSpeed = fromConfig.reverse;
      if (typeof fromConfig.steering === 'number') spec.steering = fromConfig.steering;
      if (typeof fromConfig.steer === 'number') spec.steering = fromConfig.steer;
    }
    return spec;
  }

  function cityBounds() {
    const b = world && world.bounds;
    if (b) {
      if (typeof b.minX === 'number' && typeof b.maxX === 'number') {
        return { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
      }
      if (typeof b.min === 'number' && typeof b.max === 'number') {
        return { minX: b.min, maxX: b.max, minZ: b.min, maxZ: b.max };
      }
      if (typeof b.left === 'number' && typeof b.right === 'number') {
        return { minX: b.left, maxX: b.right, minZ: b.top, maxZ: b.bottom };
      }
    }
    return { minX: -420, maxX: 420, minZ: -420, maxZ: 420 };
  }

  function snapToRoad(x, z) {
    if (world && typeof world.nearestRoadPoint === 'function') {
      const point = world.nearestRoadPoint(x, z);
      if (point && typeof point.x === 'number' && typeof point.z === 'number') {
        return { x: point.x, z: point.z, heading: point.heading || 0 };
      }
    }
    return { x: x, z: z, heading: 0 };
  }

  function stealHeat() {
    if (game.police && typeof game.police.HEAT_STEAL === 'number') {
      return game.police.HEAT_STEAL;
    }
    const wanted = config.wanted || {};
    if (typeof wanted.stealCarHeat === 'number') return wanted.stealCarHeat;
    if (typeof wanted.stealCar === 'number') return wanted.stealCar;
    return 1;
  }

  // Edge state for the E key. The main loop's own E wiring never fires
  // tryEnterOrExit (verified live: holding E leaves the player on foot
  // while P/J/K/F all work through the same input), so this module
  // owns the E edge itself — one press toggles enter/exit exactly once.
  let prevEDown = false;

  const vehicles = {
    list: [],
    playerCar: null,

    spawn(kind, x, z, heading, colour) {
      const type = normalKind(kind);
      const paint = colour === undefined || colour === null ? pick(paintList()) : colour;
      const mesh = buildCarMesh(type, paint);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = heading || 0;
      if (scene) scene.add(mesh);
      const car = {
        kind: type,
        mesh: mesh,
        position: mesh.position,
        heading: heading || 0,
        speed: 0,
        colour: paint,
        specs: specsFor(type),
      };
      vehicles.list.push(car);
      return car;
    },

    nearest(x, z, maxDist) {
      const limit = maxDist === undefined || maxDist === null ? Infinity : maxDist;
      let best = null;
      let bestDist = limit;
      for (let i = 0; i < vehicles.list.length; i++) {
        const car = vehicles.list[i];
        const dx = car.position.x - x;
        const dz = car.position.z - z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= bestDist) {
          best = car;
          bestDist = dist;
        }
      }
      return best;
    },

    tryEnterOrExit() {
      const player = game.player;
      if (!player) return false;

      // Exit whichever car the player is riding: the one this module
      // tracked (vehicles.playerCar) or one another system put the
      // player in directly (player.car, e.g. a staged shot scene) —
      // the driving update already accepts both, the exit must too.
      const driven = vehicles.playerCar || player.car;
      if (driven) {
        const car = driven;
        // Step out to the car's right side, 2.4 units clear of the body.
        const rightX = Math.cos(car.heading);
        const rightZ = -Math.sin(car.heading);
        player.position.set(
          car.position.x + rightX * 2.4,
          0,
          car.position.z + rightZ * 2.4
        );
        player.heading = car.heading;
        vehicles.playerCar = null;
        if (typeof player.exitCar === 'function') player.exitCar();
        if (game.audio && typeof game.audio.engine === 'function') {
          game.audio.engine(0);
        }
        return true;
      }

      if (player.onFoot === false) return false;
      const car = vehicles.nearest(player.position.x, player.position.z, 3.5);
      if (!car) return false;
      vehicles.playerCar = car;
      if (typeof player.enterCar === 'function') player.enterCar(car);
      if (game.police && typeof game.police.addHeat === 'function') {
        game.police.addHeat(stealHeat());
      }
      if (typeof game.message === 'function') {
        game.message('car taken, heat is on');
      }
      return true;
    },

    update(dt) {
      // E toggles enter/exit on the rising edge (see prevEDown above).
      // Checked first so it works both on foot and while driving.
      if (game.input && typeof game.input.down === 'function') {
        const eDown = game.input.down('KeyE');
        if (game.state === 'playing' && eDown && !prevEDown) {
          vehicles.tryEnterOrExit();
        }
        prevEDown = eDown;
      }

      const car = vehicles.playerCar ||
        (game.player && game.player.car ? game.player.car : null);
      if (!car) {
        if (game.audio && typeof game.audio.engine === 'function') {
          game.audio.engine(0);
        }
        return;
      }
      if (game.state !== 'playing') {
        if (game.audio && typeof game.audio.engine === 'function') {
          game.audio.engine(0);
        }
        return;
      }
      if (!game.input || typeof game.input.down !== 'function') return;

      const specs = car.specs || specsFor(car.kind);
      const forward = game.input.down('KeyW') || game.input.down('ArrowUp');
      const back = game.input.down('KeyS') || game.input.down('ArrowDown');
      const left = game.input.down('KeyA') || game.input.down('ArrowLeft');
      const right = game.input.down('KeyD') || game.input.down('ArrowRight');

      // Steering grip rises with speed, full grip at 9, and reverses
      // when the car moves backward.
      const grip = clamp(Math.abs(car.speed) / 9, 0, 1);
      const steerDir = car.speed < 0 ? -1 : 1;
      const steer = (left ? 1 : 0) - (right ? 1 : 0);
      car.heading += steer * specs.steering * grip * steerDir * dt;

      // Speed eases with acceleration, braking and rolling drag, and
      // clamps between the reverse speed and the top speed.
      if (forward) {
        car.speed += specs.acceleration * dt;
      } else if (back) {
        if (car.speed > 0.5) {
          car.speed -= specs.braking * dt;
        } else {
          car.speed -= specs.acceleration * 0.7 * dt;
        }
      } else {
        const drag = 6 * dt;
        if (Math.abs(car.speed) <= drag) {
          car.speed = 0;
        } else {
          car.speed -= Math.sign(car.speed) * drag;
        }
        car.speed -= car.speed * 0.4 * dt;
      }
      car.speed = clamp(car.speed, -specs.reverseSpeed, specs.topSpeed);

      // Move along the heading; when blocked ahead, try sliding along
      // one axis only at reduced speed, otherwise stop.
      const stepX = Math.sin(car.heading) * car.speed * dt;
      const stepZ = Math.cos(car.heading) * car.speed * dt;
      const nextX = car.position.x + stepX;
      const nextZ = car.position.z + stepZ;
      const blocked = world && typeof world.isBlocked === 'function'
        ? function (x, z) { return world.isBlocked(x, z, 1.4); }
        : function () { return false; };
      if (!blocked(nextX, nextZ)) {
        car.position.x = nextX;
        car.position.z = nextZ;
      } else if (!blocked(nextX, car.position.z)) {
        car.position.x = nextX;
        car.speed *= 0.6;
      } else if (!blocked(car.position.x, nextZ)) {
        car.position.z = nextZ;
        car.speed *= 0.6;
      } else {
        car.speed = 0;
      }

      // Clamp to the world bounds.
      const bounds = cityBounds();
      car.position.x = clamp(car.position.x, bounds.minX + 2, bounds.maxX - 2);
      car.position.z = clamp(car.position.z, bounds.minZ + 2, bounds.maxZ - 2);

      // Mesh turns to the heading and the wheels spin with speed.
      car.mesh.rotation.y = car.heading;
      const wheels = car.mesh.userData && car.mesh.userData.wheels;
      if (wheels) {
        for (let i = 0; i < wheels.length; i++) {
          wheels[i].rotateX((car.speed * dt) / 0.35);
        }
      }

      // Engine sound follows speed as a fraction of top speed.
      if (game.audio && typeof game.audio.engine === 'function') {
        const level = specs.topSpeed > 0
          ? clamp(Math.abs(car.speed) / specs.topSpeed, 0, 1)
          : 0;
        game.audio.engine(level);
      }
    },
  };

  // Initial placement: ten parked drivable cars — two near each of the
  // hideout, downtown, the beach, the suburbs and the docks — in the
  // sedan, coupe and taxi kinds, snapped to the nearest road with that
  // road's heading and a random colour. The gold coupe is not among
  // them; missions own that car.
  const spawnPoints = (world && world.spawnPoints) || {};
  const homeSpots = [
    (spawnPoints.hideout || { x: 0, z: 0 }),
    (spawnPoints.downtown || { x: 120, z: 120 }),
    (spawnPoints.beach || { x: -360, z: 0 }),
    (spawnPoints.suburbs || { x: 120, z: -300 }),
    (spawnPoints.docks || { x: 0, z: 300 }),
  ];
  const parkedKinds = ['sedan', 'coupe', 'taxi'];
  for (let s = 0; s < homeSpots.length; s++) {
    const spot = homeSpots[s];
    for (let i = 0; i < 2; i++) {
      const near = snapToRoad(
        spot.x + range(-16, 16),
        spot.z + range(-16, 16)
      );
      vehicles.spawn(pick(parkedKinds), near.x, near.z, near.heading);
    }
  }

  return vehicles;
}
