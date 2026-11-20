import * as THREE from '../vendor/three.min.js';

const FALLBACK_SPECS = {
  sedan: { topSpeed: 28, accel: 14, brake: 24, reverseSpeed: 10, steering: 1.9 },
  coupe: { topSpeed: 34, accel: 17, brake: 24, reverseSpeed: 10, steering: 2.1 },
  taxi: { topSpeed: 28, accel: 14, brake: 24, reverseSpeed: 10, steering: 1.9 },
  truck: { topSpeed: 22, accel: 9, brake: 18, reverseSpeed: 8, steering: 1.4 },
  cruiser: { topSpeed: 36, accel: 18, brake: 26, reverseSpeed: 10, steering: 2.0 },
};

const KNOWN_KINDS = ['sedan', 'coupe', 'taxi', 'truck', 'cruiser'];
const WHEEL_RADIUS = 0.42;

function normaliseKind(kind) {
  return KNOWN_KINDS.includes(kind) ? kind : 'sedan';
}

function bodyMaterial(colour) {
  return new THREE.MeshLambertMaterial({ color: colour });
}

function glassMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.25, metalness: 0.6 });
}

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function buildCarMesh(kind, colour) {
  const k = normaliseKind(kind);
  const paint = colour === undefined || colour === null ? 0x888888 : colour;
  const group = new THREE.Group();
  const bodyMat = bodyMaterial(paint);
  const glassMat = glassMaterial();
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const isTruck = k === 'truck';
  const isCoupe = k === 'coupe';

  const bodyLength = isTruck ? 5.2 : isCoupe ? 4.0 : 4.4;
  const bodyWidth = isTruck ? 2.1 : 2.0;
  const bodyHeight = isTruck ? 0.8 : 0.7;
  const bodyY = isTruck ? 0.75 : 0.8;

  if (isTruck) {
    // Low bed floor running the full length, cab up front, open bed behind it.
    group.add(box(bodyWidth, 0.45, bodyLength, bodyMat, 0, 0.62, 0));
    // Bed side walls and tailgate, leaving the bed open on top.
    group.add(box(0.12, 0.5, 2.6, bodyMat, -bodyWidth / 2 + 0.06, 1.05, -1.2));
    group.add(box(0.12, 0.5, 2.6, bodyMat, bodyWidth / 2 - 0.06, 1.05, -1.2));
    group.add(box(bodyWidth, 0.5, 0.12, bodyMat, 0, 1.05, -2.54));
    // Front cab, slightly forward of centre, with a dark glass windshield.
    group.add(box(1.9, 1.0, 1.7, bodyMat, 0, 1.3, 1.55));
    group.add(box(1.7, 0.55, 0.08, glassMat, 0, 1.45, 2.42));
  } else {
    group.add(box(bodyWidth, bodyHeight, bodyLength, bodyMat, 0, bodyY, 0));
    // Cabin slightly rear of centre, in dark glass.
    const cabinLength = isCoupe ? 1.8 : 2.2;
    group.add(box(1.7, 0.6, cabinLength, glassMat, 0, bodyY + bodyHeight / 2 + 0.28, -0.3));
  }

  // Four cylinder wheels with hubs, axle along local X.
  const wheels = [];
  const wheelZ = isTruck ? 1.7 : bodyLength / 2 - 0.55;
  const wheelX = bodyWidth / 2 - 0.05;
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0x999999 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.32, 14), tyreMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * wheelX, WHEEL_RADIUS, sz * wheelZ);
      wheel.castShadow = true;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 10), hubMat);
      wheel.add(hub);
      group.add(wheel);
      wheels.push(wheel);
    }
  }
  group.userData.wheels = wheels;

  // Headlights facing local forward (+Z), taillights facing backward.
  const frontZ = bodyLength / 2 + 0.01;
  const backZ = -bodyLength / 2 - 0.01;
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xcc2222 });
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMat);
    head.position.set(sx * 0.65, 0.85, frontZ);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tail.position.set(sx * 0.65, 0.85, backZ);
    group.add(tail);
  }

  if (k === 'taxi') {
    // Yellow taxi sign on top of the cabin.
    const signMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    const signY = bodyY + bodyHeight / 2 + 0.6 + 0.1;
    group.add(box(0.8, 0.2, 0.4, signMat, 0, signY, -0.3));
  }

  if (k === 'cruiser') {
    // Black roof bar with blue and red flashing boxes.
    const barY = bodyY + bodyHeight / 2 + 0.6 + 0.08;
    group.add(box(1.3, 0.12, 0.34, darkMat, 0, barY, -0.3));
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2244ff });
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    group.add(box(0.42, 0.22, 0.3, blueMat, -0.38, barY + 0.16, -0.3));
    group.add(box(0.42, 0.22, 0.3, redMat, 0.38, barY + 0.16, -0.3));
  }

  return group;
}

export function createVehicles(game) {
  const config = game.config || {};
  const scene = game.scene;
  const world = game.world;
  const rng = game.rng || {
    next: () => 0.5,
    range: (min, max) => min + 0.5 * (max - min),
    int: (min, max) => Math.floor(min + 0.5 * (max - min + 1)),
    pick: (list) => list[0],
    shuffle: (list) => list.slice(),
  };
  const paintList = config.carColors && config.carColors.length ? config.carColors : [0xff0000, 0x888888];

  function specsFor(kind) {
    const k = normaliseKind(kind);
    const base = FALLBACK_SPECS[k];
    const over = config.carSpecs && config.carSpecs[k];
    if (!over) return { ...base };
    if (Array.isArray(over)) {
      return {
        topSpeed: over[0] !== undefined ? over[0] : base.topSpeed,
        accel: over[1] !== undefined ? over[1] : base.accel,
        brake: over[2] !== undefined ? over[2] : base.brake,
        reverseSpeed: over[3] !== undefined ? over[3] : base.reverseSpeed,
        steering: over[4] !== undefined ? over[4] : base.steering,
      };
    }
    return {
      topSpeed: over.topSpeed !== undefined ? over.topSpeed : base.topSpeed,
      accel: over.accel !== undefined ? over.accel : base.accel,
      brake: over.brake !== undefined ? over.brake : base.brake,
      reverseSpeed: over.reverseSpeed !== undefined ? over.reverseSpeed : base.reverseSpeed,
      steering: over.steering !== undefined ? over.steering : base.steering,
    };
  }

  const vehicles = {
    list: [],
    playerCar: null,

    spawn(kind, x, z, heading, colour) {
      const k = normaliseKind(kind);
      const paint = colour === undefined || colour === null ? rng.pick(paintList) : colour;
      const mesh = buildCarMesh(k, paint);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = heading || 0;
      scene.add(mesh);
      const car = {
        kind: k,
        mesh,
        position: mesh.position,
        heading: heading || 0,
        speed: 0,
        colour: paint,
        specs: specsFor(k),
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
        player.car = null;
        if (player.exitCar) player.exitCar();
        if (game.audio && game.audio.engine) game.audio.engine(0);
        return true;
      }
      if (!player.onFoot) return false;
      const car = vehicles.nearest(player.position.x, player.position.z, 3.5);
      if (!car) return false;
      vehicles.playerCar = car;
      if (player.enterCar) player.enterCar(car);
      if (game.police && game.police.addHeat) {
        game.police.addHeat(game.police.HEAT_STEAL || 1);
      }
      if (game.message) game.message('Car stolen! The heat is on!');
      return true;
    },

    update(dt) {
      const audio = game.audio;
      if (game.state !== 'playing') {
        if (audio && audio.engine) audio.engine(0);
        return;
      }
      const car = vehicles.playerCar;
      if (!car) {
        if (audio && audio.engine) audio.engine(0);
        return;
      }
      const input = game.input;
      const specs = car.specs;
      const accelKey = input && input.down && (input.down('KeyW') || input.down('ArrowUp'));
      const brakeKey = input && input.down && (input.down('KeyS') || input.down('ArrowDown'));
      const leftKey = input && input.down && (input.down('KeyA') || input.down('ArrowLeft'));
      const rightKey = input && input.down && (input.down('KeyD') || input.down('ArrowRight'));

      // Steering grip rises with speed up to full grip at 9 units per second,
      // and reverses when the car moves backward.
      const grip = Math.min(1, Math.abs(car.speed) / 9);
      const steer = (leftKey ? 1 : 0) - (rightKey ? 1 : 0);
      const reverse = car.speed < 0 ? -1 : 1;
      car.heading += steer * specs.steering * grip * reverse * dt;

      // Speed eases with acceleration, braking and rolling drag.
      if (accelKey) car.speed += specs.accel * dt;
      if (brakeKey) car.speed -= (car.speed > 0.5 ? specs.brake : specs.accel) * dt;
      if (!accelKey && !brakeKey) car.speed -= car.speed * 0.8 * dt;
      car.speed -= car.speed * 0.15 * dt;
      if (car.speed > specs.topSpeed) car.speed = specs.topSpeed;
      if (car.speed < -specs.reverseSpeed) car.speed = -specs.reverseSpeed;
      if (Math.abs(car.speed) < 0.02 && !accelKey && !brakeKey) car.speed = 0;

      // Move along the heading; slide along one axis at reduced speed when
      // the way ahead is blocked, and stop if both axes are blocked.
      const stepX = Math.sin(car.heading) * car.speed * dt;
      const stepZ = Math.cos(car.heading) * car.speed * dt;
      const nx = car.position.x + stepX;
      const nz = car.position.z + stepZ;
      const blocked = world && world.isBlocked ? world.isBlocked : null;
      const radius = 1.2;
      if (!blocked || !blocked(nx, nz, radius)) {
        car.position.x = nx;
        car.position.z = nz;
      } else if (!blocked(nx, car.position.z, radius)) {
        car.position.x = car.position.x + stepX * 0.5;
      } else if (!blocked(car.position.x, nz, radius)) {
        car.position.z = car.position.z + stepZ * 0.5;
      } else {
        car.speed = 0;
      }

      // Clamp to the world bounds.
      if (world && world.bounds) {
        const b = world.bounds;
        if (car.position.x < b.minX) car.position.x = b.minX;
        if (car.position.x > b.maxX) car.position.x = b.maxX;
        if (car.position.z < b.minZ) car.position.z = b.minZ;
        if (car.position.z > b.maxZ) car.position.z = b.maxZ;
      }

      car.mesh.rotation.y = car.heading;
      const wheels = car.mesh.userData.wheels || [];
      const spin = (car.speed * dt) / WHEEL_RADIUS;
      for (const wheel of wheels) wheel.rotation.x += spin;
      if (audio && audio.engine) {
        audio.engine(Math.min(1, Math.abs(car.speed) / specs.topSpeed));
      }
    },
  };

  // Ten parked drivable cars at game start: two near each of the hideout,
  // downtown, the beach, the suburbs and the docks, snapped onto the
  // nearest road with that road's heading and a random colour.
  const parkKinds = ['sedan', 'coupe', 'taxi'];
  const parkSpots = [];
  if (world && world.spawnPoints) {
    for (const name of ['hideout', 'downtown', 'beach', 'suburbs', 'docks']) {
      const spot = world.spawnPoints[name];
      if (spot) parkSpots.push(spot);
    }
  }
  for (const spot of parkSpots) {
    for (let i = 0; i < 2; i++) {
      const jx = spot.x + rng.range(-10, 10);
      const jz = spot.z + rng.range(-10, 10);
      let px = jx;
      let pz = jz;
      let heading = spot.heading || 0;
      if (world && world.nearestRoadPoint) {
        const road = world.nearestRoadPoint(jx, jz);
        if (road) {
          px = road.x;
          pz = road.z;
          heading = road.heading;
        }
      }
      vehicles.spawn(rng.pick(parkKinds), px, pz, heading, undefined);
    }
  }

  return vehicles;
}
