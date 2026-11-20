import * as THREE from '../vendor/three.min.js';

// Sunport Heist — vehicles (cars): low-poly car meshes, parked drivable
// cars, the car the player drives, and the driving physics. Forward is
// local positive Z. Traffic also uses the mesh builder, so every car on
// the road looks like a car the player can steal.

// Driving specifications. The configuration's per-kind numbers win;
// underneath them sits a slower generic set so a missing kind still drives.
const FALLBACK_SPECS = {
  sedan:   { topSpeed: 28, acceleration: 14, braking: 24, reverseSpeed: 10, steering: 1.9 },
  coupe:   { topSpeed: 34, acceleration: 17, braking: 24, reverseSpeed: 10, steering: 2.1 },
  taxi:    { topSpeed: 28, acceleration: 14, braking: 24, reverseSpeed: 10, steering: 1.9 },
  truck:   { topSpeed: 22, acceleration: 9,  braking: 18, reverseSpeed: 8,  steering: 1.4 },
  cruiser: { topSpeed: 36, acceleration: 18, braking: 26, reverseSpeed: 10, steering: 2.0 },
};

// Fifteen paint colours, used only when the configuration has no paint list.
const FALLBACK_PAINTS = [
  0xcc2222, 0x2266cc, 0x22aa44, 0xffcc00, 0xf2ead8,
  0x1a1a1a, 0x888888, 0xff7722, 0x8833cc, 0x229999,
  0xcc5500, 0x334455, 0xcccccc, 0xcc99ff, 0x99dd99,
];

const KNOWN_KINDS = ['sedan', 'coupe', 'taxi', 'truck', 'cruiser'];
const PARKED_KINDS = ['sedan', 'coupe', 'taxi'];
const WHEEL_RADIUS = 0.42;
const CAR_RADIUS = 1.3;
const ENTER_DISTANCE = 3.5;
const EXIT_CLEARANCE = 2.4;
const FULL_GRIP_SPEED = 9;

// Small helper: a box mesh placed at (x, y, z).
function box(width, height, depth, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// Car-mesh builder: body box, cabin box slightly rear of centre in dark
// glass (a truck gets a front cab and an open bed instead), four cylinder
// wheels with hubs, headlights facing local forward and taillights facing
// backward, a yellow taxi sign for taxis, and a black roof bar with blue
// and red flashing boxes for cruisers. The group carries its wheels in its
// user data so other systems can spin them. Unknown kind builds as a sedan;
// a missing colour defaults to grey.
export function createCarMesh(kind, color) {
  const k = KNOWN_KINDS.includes(kind) ? kind : 'sedan';
  const paint = color === undefined || color === null ? 0x888888 : color;

  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: paint });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x16222e, roughness: 0.25, metalness: 0.5 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0x9a9a9a });

  if (k === 'truck') {
    // A truck has a front cab and an open bed instead of a cabin.
    group.add(box(2.0, 0.5, 4.4, bodyMat, 0, 0.65, 0));        // bed floor
    group.add(box(1.9, 1.05, 1.5, bodyMat, 0, 1.42, 1.35));    // cab
    group.add(box(1.7, 0.65, 0.08, glassMat, 0, 1.5, 2.12));   // windshield
    group.add(box(0.12, 0.55, 2.4, bodyMat, -0.94, 1.15, -0.9)); // bed walls
    group.add(box(0.12, 0.55, 2.4, bodyMat, 0.94, 1.15, -0.9));
    group.add(box(2.0, 0.55, 0.12, bodyMat, 0, 1.15, -2.14));
  } else {
    group.add(box(2.0, 0.75, 4.4, bodyMat, 0, 0.75, 0));       // body
    group.add(box(1.7, 0.6, 2.2, glassMat, 0, 1.42, -0.35));   // cabin, rear of centre
  }

  // Four wheels. Each wheel lives in its own group so it can spin around
  // the axle (local X) as the car moves.
  const wheels = [];
  const wheelSpots = [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]];
  for (const [wx, wz] of wheelSpots) {
    const wheel = new THREE.Group();
    wheel.position.set(wx, WHEEL_RADIUS, wz);
    const tyre = new THREE.Mesh(
      new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.32, 12), tyreMat);
    tyre.rotation.z = Math.PI / 2;
    wheel.add(tyre);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8), hubMat);
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    group.add(wheel);
    wheels.push(wheel);
  }

  // Headlights face local forward (+Z); taillights face backward.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xcc1111 });
  group.add(box(0.35, 0.18, 0.08, lightMat, -0.6, 0.75, 2.21));
  group.add(box(0.35, 0.18, 0.08, lightMat, 0.6, 0.75, 2.21));
  group.add(box(0.35, 0.18, 0.08, tailMat, -0.6, 0.75, -2.21));
  group.add(box(0.35, 0.18, 0.08, tailMat, 0.6, 0.75, -2.21));

  if (k === 'taxi') {
    const signMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    group.add(box(0.9, 0.25, 0.4, signMat, 0, 1.85, -0.35));
  }

  if (k === 'cruiser') {
    group.add(box(1.2, 0.12, 0.4, darkMat, 0, 1.78, -0.35)); // roof bar
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2244ff });
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    group.add(box(0.45, 0.2, 0.36, blueMat, -0.32, 1.9, -0.35));
    group.add(box(0.45, 0.2, 0.36, redMat, 0.32, 1.9, -0.35));
  }

  group.userData.wheels = wheels;
  return group;
}

// Vehicles factory. Takes the game and returns the vehicles object.
// Quirk, preserved on purpose: this module does NOT offer a despawn action.
// The police module handles a missing despawn by removing a cruiser's mesh
// from the scene itself. Do not add one.
export function createVehicles(game) {
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

  const paints = config.carColors || config.paintColors || config.carPaints || FALLBACK_PAINTS;
  const specTable = config.carSpecs || config.cars || config.carSpec || config.vehicles || {};

  // One kind's driving specification: configuration over the generic set.
  function specFor(kind) {
    const base = FALLBACK_SPECS[kind] || FALLBACK_SPECS.sedan;
    const over = specTable[kind] || {};
    return {
      topSpeed: over.topSpeed !== undefined ? over.topSpeed : base.topSpeed,
      acceleration: over.acceleration !== undefined ? over.acceleration : base.acceleration,
      braking: over.braking !== undefined ? over.braking : base.braking,
      reverseSpeed: over.reverseSpeed !== undefined ? over.reverseSpeed : base.reverseSpeed,
      steering: over.steering !== undefined ? over.steering : base.steering,
    };
  }

  const vehicles = {
    list: [],
    playerCar: null,
    spawn,
    nearest,
    tryEnterOrExit,
    update,
  };

  // Build a car, place it, add it to the scene, record it and return it.
  // An unknown kind spawns as a sedan; a missing colour is picked at random
  // from the configuration's paint list. A new car starts at speed zero.
  function spawn(kind, x, z, heading, color) {
    const k = KNOWN_KINDS.includes(kind) ? kind : 'sedan';
    const paint = color === undefined || color === null ? rng.pick(paints) : color;
    const mesh = createCarMesh(k, paint);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = {
      kind: k,
      mesh,
      position: mesh.position,
      heading,
      speed: 0,
      color: paint,
      spec: specFor(k),
    };
    vehicles.list.push(car);
    return car;
  }

  // The closest car within maxDist of (x, z), or nothing.
  function nearest(x, z, maxDist) {
    const limit = maxDist === undefined ? Infinity : maxDist;
    let best = null;
    let bestDist = limit;
    for (const car of vehicles.list) {
      const dx = car.position.x - x;
      const dz = car.position.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  // E enters or exits a car. Returns true when it did something.
  function tryEnterOrExit() {
    const player = game.player;
    if (!player) return false;

    // Exit only when the player is genuinely driving the recorded car.
    // An arrest respawn puts the player back on foot (player.exitCar
    // clears player.car) without clearing vehicles.playerCar, leaving a
    // stale record: taking the exit branch on it would teleport the
    // player 2.4 units beside the old car instead of entering a nearby
    // one. A stale record is cleared and falls through to the enter
    // branch below.
    if (vehicles.playerCar && (player.onFoot || player.car !== vehicles.playerCar)) {
      vehicles.playerCar = null;
    }

    if (vehicles.playerCar) {
      // Step out to the car's right side, clear of the body.
      const car = vehicles.playerCar;
      const rightX = Math.cos(car.heading);
      const rightZ = -Math.sin(car.heading);
      player.position.set(
        car.position.x + rightX * EXIT_CLEARANCE,
        car.position.y,
        car.position.z + rightZ * EXIT_CLEARANCE,
      );
      player.heading = car.heading;
      vehicles.playerCar = null;
      if (player.exitCar) player.exitCar();
      if (game.audio) game.audio.engine(0);
      return true;
    }

    const car = nearest(player.position.x, player.position.z, ENTER_DISTANCE);
    if (!car) return false;
    vehicles.playerCar = car;
    if (player.enterCar) player.enterCar(car);
    const heat = (game.police && game.police.heatSteal)
      || (config.wanted && config.wanted.stealHeat)
      || 1;
    if (game.police && game.police.addHeat) game.police.addHeat(heat);
    if (game.message) game.message('Car taken — the heat is on!');
    return true;
  }

  // Drive the player's car. Only runs while the state is playing.
  function update(dt) {
    const audio = game.audio;
    if (game.state !== 'playing') {
      if (audio) audio.engine(0);
      return;
    }
    const player = game.player;
    // Stale-record guard, same as tryEnterOrExit: an arrest respawn puts
    // the player back on foot without clearing vehicles.playerCar, so a
    // recorded car the player is not actually driving must not be driven
    // from here. A stale record is cleared and falls through to the
    // no-car return below, so the car is not driven this frame.
    if (vehicles.playerCar && (!player || player.onFoot || player.car !== vehicles.playerCar)) {
      vehicles.playerCar = null;
    }
    const car = vehicles.playerCar;
    if (!car) {
      if (audio) audio.engine(0);
      return;
    }
    const spec = car.spec;
    const input = game.input;

    const forward = input && (input.down('KeyW') || input.down('ArrowUp'));
    const backward = input && (input.down('KeyS') || input.down('ArrowDown'));
    const left = input && (input.down('KeyA') || input.down('ArrowLeft'));
    const right = input && (input.down('KeyD') || input.down('ArrowRight'));

    // Speed: accelerate, brake, or reverse, with rolling drag.
    if (forward) car.speed += spec.acceleration * dt;
    if (backward) {
      if (car.speed > 0.5) car.speed -= spec.braking * dt;
      else car.speed -= spec.acceleration * 0.6 * dt;
    }
    car.speed -= car.speed * 0.25 * dt;
    if (!forward && !backward) {
      const stop = 4 * dt;
      if (Math.abs(car.speed) <= stop) car.speed = 0;
      else car.speed -= Math.sign(car.speed) * stop;
    }
    car.speed = Math.max(-spec.reverseSpeed, Math.min(spec.topSpeed, car.speed));

    // Steering: grip rises with speed up to full grip at 9 units per
    // second, and reverses when the car moves backward.
    const grip = Math.min(1, Math.abs(car.speed) / FULL_GRIP_SPEED);
    let steer = 0;
    if (left) steer += 1;
    if (right) steer -= 1;
    if (steer !== 0 && car.speed !== 0) {
      car.heading += steer * spec.steering * grip * dt * (car.speed >= 0 ? 1 : -1);
    }

    // Move along the heading. When the way ahead is blocked, try sliding
    // along one axis only at reduced speed; otherwise stop.
    const stepX = Math.sin(car.heading) * car.speed * dt;
    const stepZ = Math.cos(car.heading) * car.speed * dt;
    const blocked = world && world.isBlocked;
    const nextX = car.position.x + stepX;
    const nextZ = car.position.z + stepZ;
    if (!blocked || !blocked(nextX, nextZ, CAR_RADIUS)) {
      car.position.x = nextX;
      car.position.z = nextZ;
    } else if (!blocked(nextX, car.position.z, CAR_RADIUS)) {
      car.position.x = car.position.x + stepX * 0.5;
    } else if (!blocked(car.position.x, nextZ, CAR_RADIUS)) {
      car.position.z = car.position.z + stepZ * 0.5;
    } else {
      car.speed = 0;
    }

    // Clamp to the world bounds.
    const bounds = world && world.bounds;
    const minX = bounds ? bounds.minX : -420;
    const maxX = bounds ? bounds.maxX : 420;
    const minZ = bounds ? bounds.minZ : -420;
    const maxZ = bounds ? bounds.maxZ : 420;
    car.position.x = Math.max(minX, Math.min(maxX, car.position.x));
    car.position.z = Math.max(minZ, Math.min(maxZ, car.position.z));

    // Turn the mesh to the heading and spin the wheels with speed.
    car.mesh.rotation.y = car.heading;
    const wheels = car.mesh.userData.wheels || [];
    for (const wheel of wheels) {
      wheel.rotation.x += (car.speed * dt) / WHEEL_RADIUS;
    }

    // The engine hum follows speed as a fraction of top speed.
    if (audio) audio.engine(Math.min(1, Math.abs(car.speed) / spec.topSpeed));
  }

  // Initial placement: ten parked drivable cars — two near each of the
  // hideout, downtown, the beach, the suburbs and the docks — sedan, coupe
  // or taxi, snapped onto the nearest road with that road's heading and a
  // random colour. The gold coupe is not among them; missions own that car.
  const spawnPoints = world && world.spawnPoints;
  const bases = [
    (spawnPoints && spawnPoints.hideout) || { x: 0, z: 0 },
    (spawnPoints && spawnPoints.downtown) || { x: 120, z: 120 },
    (spawnPoints && spawnPoints.beach) || { x: -360, z: 0 },
    (spawnPoints && spawnPoints.suburbs) || { x: 120, z: -300 },
    (spawnPoints && spawnPoints.docks) || { x: 0, z: 300 },
  ];
  for (const base of bases) {
    for (let i = 0; i < 2; i++) {
      let px = base.x;
      let pz = base.z;
      let heading = base.heading || 0;
      if (world && typeof world.nearestRoadPoint === 'function') {
        const road = world.nearestRoadPoint(base.x, base.z);
        if (road) {
          px = road.x;
          pz = road.z;
          heading = road.heading || 0;
        }
      }
      const along = i === 0 ? 6 : -6;
      px += Math.sin(heading) * along;
      pz += Math.cos(heading) * along;
      spawn(rng.pick(PARKED_KINDS), px, pz, heading);
    }
  }

  return vehicles;
}
