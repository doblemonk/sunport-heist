import * as THREE from '../vendor/three.min.js';

const KNOWN_KINDS = ['sedan', 'coupe', 'taxi', 'truck', 'cruiser'];

const FALLBACK_SPECS = {
  sedan: { topSpeed: 28, acceleration: 14, braking: 24, reverseSpeed: 10, steering: 1.9 },
  coupe: { topSpeed: 34, acceleration: 17, braking: 24, reverseSpeed: 10, steering: 2.1 },
  taxi: { topSpeed: 28, acceleration: 14, braking: 24, reverseSpeed: 10, steering: 1.9 },
  truck: { topSpeed: 22, acceleration: 9, braking: 18, reverseSpeed: 8, steering: 1.4 },
  cruiser: { topSpeed: 36, acceleration: 18, braking: 26, reverseSpeed: 10, steering: 2.0 },
};

const GREY = 0x888888;
const GLASS = 0x18222e;
const WHEEL_RADIUS = 0.36;

function normaliseKind(kind) {
  return KNOWN_KINDS.indexOf(kind) >= 0 ? kind : 'sedan';
}

function box(w, h, d, colour, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6, metalness: 0.2 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function makeWheel(x, z) {
  const wheel = new THREE.Mesh(
    new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.26, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.1 }),
  );
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(x, WHEEL_RADIUS, z);
  wheel.castShadow = true;
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.3, 10),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4, metalness: 0.6 }),
  );
  wheel.add(hub);
  return wheel;
}

export function buildCarMesh(kind, colour) {
  const k = normaliseKind(kind);
  const paint = colour === undefined || colour === null ? GREY : colour;
  const group = new THREE.Group();

  // Main body, low and long. Forward is local +Z.
  group.add(box(1.9, 0.55, 4.2, paint, 0, 0.62, 0));

  if (k === 'truck') {
    // Front cab and an open bed instead of a closed cabin.
    group.add(box(1.9, 0.95, 1.3, paint, 0, 1.0, 1.35));
    group.add(box(1.6, 0.45, 1.0, GLASS, 0, 1.15, 1.45));
    group.add(box(1.9, 0.28, 2.5, paint, 0, 0.68, -0.85));
    group.add(box(0.08, 0.42, 2.5, paint, -0.91, 0.95, -0.85));
    group.add(box(0.08, 0.42, 2.5, paint, 0.91, 0.95, -0.85));
    group.add(box(1.9, 0.42, 0.08, paint, 0, 0.95, -2.06));
  } else {
    // Cabin slightly rear of centre, in dark glass.
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.5, 2.1),
      new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.2, metalness: 0.6 }),
    );
    cabin.position.set(0, 1.12, -0.25);
    cabin.castShadow = true;
    group.add(cabin);
  }

  const wheels = [
    makeWheel(-0.95, 1.35),
    makeWheel(0.95, 1.35),
    makeWheel(-0.95, -1.35),
    makeWheel(0.95, -1.35),
  ];
  for (const wheel of wheels) group.add(wheel);
  group.userData.wheels = wheels;

  // Headlights facing forward, taillights facing backward.
  const lamp = new THREE.MeshStandardMaterial({
    color: 0xfff6c0, roughness: 0.3, metalness: 0.1, emissive: 0xfff2a0, emissiveIntensity: 0.6,
  });
  for (const x of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), lamp);
    head.position.set(x, 0.62, 2.12);
    group.add(head);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.18, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.3, emissive: 0xaa1111, emissiveIntensity: 0.5 }),
    );
    tail.position.set(x, 0.62, -2.12);
    group.add(tail);
  }

  if (k === 'taxi') {
    group.add(box(0.8, 0.2, 0.4, 0xffd400, 0, 1.47, -0.25));
  }

  if (k === 'cruiser') {
    group.add(box(1.3, 0.14, 0.45, 0x111111, 0, 1.44, -0.25));
    group.add(box(0.5, 0.18, 0.4, 0x2244ff, -0.32, 1.58, -0.25));
    group.add(box(0.5, 0.18, 0.4, 0xff2222, 0.32, 1.58, -0.25));
  }

  return group;
}

function specsFrom(raw, fallback) {
  if (!raw) return { ...fallback };
  if (Array.isArray(raw)) {
    return {
      topSpeed: raw[0] !== undefined ? raw[0] : fallback.topSpeed,
      acceleration: raw[1] !== undefined ? raw[1] : fallback.acceleration,
      braking: raw[2] !== undefined ? raw[2] : fallback.braking,
      reverseSpeed: raw[3] !== undefined ? raw[3] : fallback.reverseSpeed,
      steering: raw[4] !== undefined ? raw[4] : fallback.steering,
    };
  }
  return {
    topSpeed: raw.topSpeed !== undefined ? raw.topSpeed : (raw.maxSpeed !== undefined ? raw.maxSpeed : fallback.topSpeed),
    acceleration: raw.acceleration !== undefined ? raw.acceleration : (raw.accel !== undefined ? raw.accel : fallback.acceleration),
    braking: raw.braking !== undefined ? raw.braking : (raw.brake !== undefined ? raw.brake : fallback.braking),
    reverseSpeed: raw.reverseSpeed !== undefined ? raw.reverseSpeed : (raw.reverse !== undefined ? raw.reverse : fallback.reverseSpeed),
    steering: raw.steering !== undefined ? raw.steering : (raw.steer !== undefined ? raw.steer : fallback.steering),
  };
}

export function createVehicles(game) {
  const config = (game && game.config) || {};
  const carSpecs = config.carSpecs || {};
  const paintList = Array.isArray(config.carColors) && config.carColors.length > 0
    ? config.carColors
    : [GREY];

  // Seeded random source; fall back to a constant one half when it is missing.
  const rng = (game && game.rng) || null;
  const next = () => (rng && typeof rng.next === 'function' ? rng.next() : 0.5);
  const range = (min, max) => (rng && typeof rng.range === 'function'
    ? rng.range(min, max) : min + (max - min) * 0.5);
  const pick = (list) => {
    if (!list || list.length === 0) return undefined;
    if (rng && typeof rng.pick === 'function') return rng.pick(list);
    return list[Math.floor(next() * list.length)];
  };

  const vehicles = {
    list: [],
    playerCar: null,

    spawn(kind, x, z, heading, colour) {
      const k = normaliseKind(kind);
      const paint = colour === undefined || colour === null ? pick(paintList) : colour;
      const mesh = buildCarMesh(k, paint);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = heading || 0;
      if (game.scene) game.scene.add(mesh);
      const car = {
        kind: k,
        mesh,
        position: mesh.position,
        heading: heading || 0,
        speed: 0,
        colour: paint,
        color: paint,
        specs: specsFrom(carSpecs[k], FALLBACK_SPECS[k]),
      };
      vehicles.list.push(car);
      return car;
    },

    nearest(x, z, maxDist) {
      const limit = maxDist === undefined || maxDist === null ? Infinity : maxDist;
      let best = null;
      let bestD = limit;
      for (const car of vehicles.list) {
        const dx = car.position.x - x;
        const dz = car.position.z - z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      return best;
    },

    tryEnterOrExit() {
      const player = game.player;
      if (!player) return false;

      if (vehicles.playerCar) {
        const car = vehicles.playerCar;
        // Step out to the car's right side, 2.4 units clear of the body.
        const rx = Math.cos(car.heading);
        const rz = -Math.sin(car.heading);
        player.position.set(car.position.x + rx * 2.4, 0, car.position.z + rz * 2.4);
        player.heading = car.heading;
        vehicles.playerCar = null;
        if (typeof player.exitCar === 'function') player.exitCar();
        if (game.audio && typeof game.audio.engine === 'function') game.audio.engine(0);
        return true;
      }

      if (!player.onFoot && player.car) return false;
      const car = vehicles.nearest(player.position.x, player.position.z, 3.5);
      if (!car) return false;
      vehicles.playerCar = car;
      if (typeof player.enterCar === 'function') player.enterCar(car);
      const heat = game.police && typeof game.police.HEAT_STEAL === 'number'
        ? game.police.HEAT_STEAL
        : (config.wanted && config.wanted.stealCarHeat !== undefined
          ? config.wanted.stealCarHeat
          : (config.wanted && config.wanted.stealCar !== undefined ? config.wanted.stealCar : 1));
      if (game.police && typeof game.police.addHeat === 'function') game.police.addHeat(heat);
      if (typeof game.message === 'function') game.message('Car stolen! Heat is on!');
      return true;
    },

    update(dt) {
      if (!game.audio || typeof game.audio.engine !== 'function') {
        // No audio system: still drive, just silently.
      }
      const silenceEngine = () => {
        if (game.audio && typeof game.audio.engine === 'function') game.audio.engine(0);
      };
      if (game.state !== 'playing') {
        silenceEngine();
        return;
      }
      const car = vehicles.playerCar;
      if (!car) {
        silenceEngine();
        return;
      }

      const input = game.input;
      const down = (code) => !!(input && typeof input.down === 'function' && input.down(code));
      const specs = car.specs;
      let speed = car.speed;

      const accel = down('KeyW') || down('ArrowUp');
      const brake = down('KeyS') || down('ArrowDown');
      const left = down('KeyA') || down('ArrowLeft');
      const right = down('KeyD') || down('ArrowRight');

      if (accel) {
        speed += specs.acceleration * dt;
      } else if (brake) {
        if (speed > 0) speed -= specs.braking * dt;
        else speed -= specs.acceleration * dt;
      } else {
        // Rolling drag eases the car to a stop.
        const drag = 8 * dt;
        if (speed > 0) speed = Math.max(0, speed - drag);
        else if (speed < 0) speed = Math.min(0, speed + drag);
      }
      speed = Math.max(-specs.reverseSpeed, Math.min(specs.topSpeed, speed));
      if (!accel && !brake && Math.abs(speed) < 0.05) speed = 0;

      // Steering grip rises with speed, full at 9 units per second,
      // and reverses when the car moves backward.
      const grip = Math.min(1, Math.abs(speed) / 9);
      const steerDir = speed < 0 ? -1 : 1;
      if (left) car.heading += specs.steering * grip * dt * steerDir;
      if (right) car.heading -= specs.steering * grip * dt * steerDir;

      const world = game.world;
      const oldX = car.position.x;
      const oldZ = car.position.z;
      const stepX = Math.sin(car.heading) * speed * dt;
      const stepZ = Math.cos(car.heading) * speed * dt;
      const newX = oldX + stepX;
      const newZ = oldZ + stepZ;
      const blocked = (x, z) => !!(world && typeof world.isBlocked === 'function' && world.isBlocked(x, z, 1.2));

      if (!blocked(newX, newZ)) {
        car.position.x = newX;
        car.position.z = newZ;
      } else if (!blocked(newX, oldZ)) {
        // Slide along X only, at reduced speed.
        car.position.x = newX;
        speed *= 0.5;
      } else if (!blocked(oldX, newZ)) {
        // Slide along Z only, at reduced speed.
        car.position.z = newZ;
        speed *= 0.5;
      } else {
        speed = 0;
      }
      car.speed = speed;

      // Clamp to the world bounds.
      const bounds = (world && world.bounds) || null;
      let minX = -420;
      let maxX = 420;
      let minZ = -420;
      let maxZ = 420;
      if (bounds) {
        if (bounds.minX !== undefined) minX = bounds.minX;
        if (bounds.maxX !== undefined) maxX = bounds.maxX;
        if (bounds.minZ !== undefined) minZ = bounds.minZ;
        if (bounds.maxZ !== undefined) maxZ = bounds.maxZ;
        if (bounds.min !== undefined) { minX = bounds.min; minZ = bounds.min; }
        if (bounds.max !== undefined) { maxX = bounds.max; maxZ = bounds.max; }
      }
      car.position.x = Math.max(minX, Math.min(maxX, car.position.x));
      car.position.z = Math.max(minZ, Math.min(maxZ, car.position.z));

      car.mesh.rotation.y = car.heading;
      const wheels = (car.mesh.userData && car.mesh.userData.wheels) || [];
      for (const wheel of wheels) {
        wheel.rotation.x += (speed * dt) / WHEEL_RADIUS;
      }

      // Keep the player riding in the car.
      if (game.player && game.player.position) {
        game.player.position.set(car.position.x, 0, car.position.z);
        game.player.heading = car.heading;
      }

      if (game.audio && typeof game.audio.engine === 'function') {
        game.audio.engine(Math.min(1, Math.abs(speed) / specs.topSpeed));
      }
    },
  };

  // Initial placement: ten parked drivable cars, two near each of five
  // districts, snapped onto the nearest road with that road's heading.
  const spawnPoints = (game.world && game.world.spawnPoints) || {};
  const spots = [
    spawnPoints.hideout || { x: 0, z: 0 },
    spawnPoints.downtown || { x: 120, z: 120 },
    spawnPoints.beach || { x: -360, z: 0 },
    spawnPoints.suburbs || { x: 120, z: -300 },
    spawnPoints.docks || { x: 0, z: 300 },
  ];
  const parkedKinds = ['sedan', 'coupe', 'taxi'];
  for (const spot of spots) {
    for (let i = 0; i < 2; i++) {
      const cx = spot.x + range(-15, 15);
      const cz = spot.z + range(-15, 15);
      let px = cx;
      let pz = cz;
      let heading = 0;
      if (game.world && typeof game.world.nearestRoadPoint === 'function') {
        const road = game.world.nearestRoadPoint(cx, cz);
        if (road) {
          px = road.x;
          pz = road.z;
          heading = road.heading || 0;
        }
      }
      vehicles.spawn(pick(parkedKinds), px, pz, heading, pick(paintList));
    }
  }

  return vehicles;
}
