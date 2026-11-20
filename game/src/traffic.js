import * as THREE from '../vendor/three.min.js';
import { buildCarMesh } from './vehicles.js';

// Traffic — ambient cars cruising the roads of Solmar.
//
// Cars drive in the right-hand lane, slow for the vehicle ahead, turn at
// intersections, steer back to the centre line when they drift off the
// road, and respawn near the player when they wander too far away. Every
// car is built with the vehicles module's car-mesh builder, so traffic
// looks exactly like the cars the player can steal.
//
// Heading convention: heading 0 drives along positive Z, heading PI/2
// drives along positive X, so the forward vector is (sin h, cos h) and
// the right-hand side vector is (cos h, -sin h).

const TWO_PI = Math.PI * 2;
const START_COUNT = 14;
const SPAWN_MIN_DIST = 25;
const SPAWN_MAX_DIST = 110;
const DESPAWN_DIST = 210;
const LANE_OFFSET = 2.3;
const BLOCKED_AHEAD_DIST = 8;
const BLOCKED_AHEAD_SIDE = 2.4;
const TURN_RATE = 1.6;
const RIGHT_TURN_CHANCE = 0.28;
const LEFT_TURN_CHANCE = 0.28;
const WHEEL_RADIUS = 0.35;

// Wrap an angle into the range -PI..PI so heading differences take the
// shortest way around.
function wrapAngle(angle) {
  while (angle > Math.PI) angle -= TWO_PI;
  while (angle < -Math.PI) angle += TWO_PI;
  return angle;
}

export function createTraffic(game) {
  const config = game.config || {};
  const scene = game.scene;
  const world = game.world;
  const rng = game.rng || null;

  // Seeded random helpers. Never use the language's built-in unseeded
  // random function; if the game's random source is missing, a constant
  // one half stands in for every draw so the module still runs.
  function rnd() {
    if (rng && typeof rng.next === 'function') return rng.next();
    return 0.5;
  }

  function range(min, max) {
    if (rng && typeof rng.range === 'function') return rng.range(min, max);
    return min + rnd() * (max - min);
  }

  function pick(list) {
    if (rng && typeof rng.pick === 'function') return rng.pick(list);
    return list[Math.floor(rnd() * list.length)];
  }

  const paintList = config.carColors || [
    0xcc2222, 0x2244cc, 0x22aa44, 0xddcc22, 0xf0ead8,
    0x1a1a1a, 0x888888, 0xff7722, 0x8844cc, 0x229999,
    0xcc5500, 0x334466, 0xcccccc, 0xbb88dd, 0x88cc88,
  ];
  const targetCount = config.trafficCount || START_COUNT;
  const kinds = ['sedan', 'sedan', 'coupe', 'taxi', 'sedan', 'truck'];

  const cars = [];

  function playerPosition() {
    if (game.player && game.player.position) return game.player.position;
    return { x: 0, y: 0, z: 0 };
  }

  // Spawn one car on a road near the player, in the right-hand lane.
  function spawnCar() {
    const player = playerPosition();
    const angle = range(0, TWO_PI);
    const dist = range(SPAWN_MIN_DIST, SPAWN_MAX_DIST);
    const x = player.x + Math.cos(angle) * dist;
    const z = player.z + Math.sin(angle) * dist;

    // Snap onto the nearest road and take that road's heading.
    let roadX = x;
    let roadZ = z;
    let heading = 0;
    if (world && typeof world.nearestRoadPoint === 'function') {
      const road = world.nearestRoadPoint(x, z);
      if (road) {
        roadX = road.x;
        roadZ = road.z;
        heading = road.heading || 0;
      }
    }

    // Offset to the right of the road direction: the right-hand lane.
    const rightX = Math.cos(heading);
    const rightZ = -Math.sin(heading);
    const px = roadX + rightX * LANE_OFFSET;
    const pz = roadZ + rightZ * LANE_OFFSET;

    const kind = pick(kinds);
    const colour = pick(paintList);
    const mesh = buildCarMesh(kind, colour);
    mesh.position.set(px, 0, pz);
    mesh.rotation.y = heading;
    if (scene) scene.add(mesh);

    const car = {
      kind: kind,
      mesh: mesh,
      position: mesh.position,
      heading: heading,
      targetHeading: heading,
      speed: range(5, 9),
      cruise: range(7, 11),
      turnTimer: range(3, 9),
    };
    cars.push(car);
    return car;
  }

  function removeCar(index) {
    const car = cars[index];
    if (!car) return;
    cars.splice(index, 1);
    if (scene && car.mesh) scene.remove(car.mesh);
  }

  // True when another vehicle sits ahead of this car: in front of it
  // within 8 metres and within 2.4 units to the side. Checks the other
  // traffic cars and the car the player is driving.
  function blockedAhead(car) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);

    function aheadOf(pos) {
      const dx = pos.x - car.position.x;
      const dz = pos.z - car.position.z;
      const ahead = dx * fx + dz * fz;
      if (ahead <= 0 || ahead > BLOCKED_AHEAD_DIST) return false;
      const side = dx * rx + dz * rz;
      return Math.abs(side) < BLOCKED_AHEAD_SIDE;
    }

    for (let i = 0; i < cars.length; i++) {
      if (cars[i] === car) continue;
      if (aheadOf(cars[i].position)) return true;
    }

    const driven = game.vehicles && game.vehicles.playerCar;
    if (driven && driven.position && aheadOf(driven.position)) return true;
    return false;
  }

  function update(dt) {
    if (!game || game.state !== 'playing') return;
    if (!dt || dt <= 0) return;
    if (dt > 0.1) dt = 0.1;

    const player = playerPosition();

    // Cars that drifted too far from the player are removed and replaced.
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      const dx = car.position.x - player.x;
      const dz = car.position.z - player.z;
      if (dx * dx + dz * dz > DESPAWN_DIST * DESPAWN_DIST) {
        removeCar(i);
        spawnCar();
      }
    }

    // Keep the count topped up to the starting number.
    while (cars.length < targetCount) spawnCar();

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];

      // Off the road: steer back toward the road's centre line.
      let onRoad = true;
      if (world && typeof world.onRoad === 'function') {
        onRoad = world.onRoad(car.position.x, car.position.z);
      }
      if (!onRoad && world && typeof world.nearestRoadPoint === 'function') {
        const road = world.nearestRoadPoint(car.position.x, car.position.z);
        if (road) {
          const dx = road.x - car.position.x;
          const dz = road.z - car.position.z;
          car.targetHeading = Math.atan2(dx, dz);
        }
      }

      // On the road, when the turn timer runs out, pick a new direction:
      // about 28% right turn, 28% left turn, the rest straight ahead.
      if (onRoad) {
        car.turnTimer -= dt;
        if (car.turnTimer <= 0) {
          const roll = rnd();
          if (roll < RIGHT_TURN_CHANCE) {
            car.targetHeading = car.targetHeading + Math.PI / 2;
          } else if (roll < RIGHT_TURN_CHANCE + LEFT_TURN_CHANCE) {
            car.targetHeading = car.targetHeading - Math.PI / 2;
          }
          car.turnTimer = range(4, 10);
        }
      }

      // Slow or stop when another vehicle is ahead.
      const blocked = blockedAhead(car);

      // Speed eases toward the cruising speed, or toward zero when
      // blocked ahead.
      const targetSpeed = blocked ? 0 : car.cruise;
      const ease = Math.min(1, dt * 1.8);
      car.speed += (targetSpeed - car.speed) * ease;
      if (car.speed < 0.01 && targetSpeed === 0) car.speed = 0;

      // Heading eases toward the target heading, at most 1.6 rad/s.
      const diff = wrapAngle(car.targetHeading - car.heading);
      const maxTurn = TURN_RATE * dt;
      if (diff > maxTurn) car.heading += maxTurn;
      else if (diff < -maxTurn) car.heading -= maxTurn;
      else car.heading = car.targetHeading;

      // A building in the way: turn away by a right angle and slow
      // to 40 percent, instead of driving into it.
      let wayBlocked = false;
      if (world && typeof world.isBlocked === 'function') {
        const probeX = car.position.x + Math.sin(car.heading) * 2.5;
        const probeZ = car.position.z + Math.cos(car.heading) * 2.5;
        wayBlocked = world.isBlocked(probeX, probeZ, 1.2);
      }
      if (wayBlocked) {
        car.targetHeading = car.heading + Math.PI / 2;
        car.speed = car.speed * 0.4;
      } else {
        // Move along the heading.
        car.position.x += Math.sin(car.heading) * car.speed * dt;
        car.position.z += Math.cos(car.heading) * car.speed * dt;
      }

      // Mesh turns to the heading and the wheels spin with speed.
      car.mesh.rotation.y = car.heading;
      const wheels = car.mesh.userData && car.mesh.userData.wheels;
      if (wheels) {
        for (let w = 0; w < wheels.length; w++) {
          wheels[w].rotation.x += (car.speed * dt) / WHEEL_RADIUS;
        }
      }
    }
  }

  // The city starts with 14 traffic cars.
  for (let i = 0; i < targetCount; i++) spawnCar();

  // THREE is imported from the vendored file; keep the reference so the
  // import stays live even though the mesh builder owns the geometry.
  void THREE;

  return {
    cars: cars,
    update: update,
  };
}
