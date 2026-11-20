// traffic.js — ambient traffic cars for Sunport Heist.
//
// Cars cruise the road grid in right-hand lanes, slow for the vehicle
// ahead, turn at intersections, and respawn near the player when they
// drift too far away. Every car is built with the vehicles module's
// car-mesh builder, so traffic looks exactly like a car the player
// can steal. Only the shared game object is read; nothing here talks
// to another system during construction except the configuration,
// the scene, the random source and the world for initial placement.

import * as THREE from '../vendor/three.min.js';
import { createCarMesh } from './vehicles.js';

// Sedans dominate the mix; coupes, taxis and trucks are rarer.
const TRAFFIC_KINDS = ['sedan', 'sedan', 'coupe', 'taxi', 'sedan', 'truck'];

// Fallback paint list, used only if the configuration has no paint list.
const FALLBACK_PAINT = [0xcc2222, 0x2266cc, 0x22aa44, 0xeebb22, 0xf2ede4, 0x1a1a1a,
  0x888888, 0xee7722, 0x8833aa, 0x229999, 0xcc5500, 0x334455, 0xcccccc, 0xbb99dd, 0x99dd99];

const SPAWN_MIN = 25, SPAWN_MAX = 110, RESPAWN_DISTANCE = 210, LANE_OFFSET = 2.3;
const AHEAD_DISTANCE = 8, AHEAD_SIDE = 2.4, TURN_RATE = 1.6;
const WHEEL_RADIUS = 0.35, BLOCKED_RADIUS = 1.2;

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function createTraffic(game) {
  const scene = game.scene;
  const world = game.world;
  const config = game.config || {};
  const count = typeof config.trafficCount === 'number' ? config.trafficCount : 14;
  const paint = config.carColors || config.paintColors || config.carPaint || FALLBACK_PAINT;
  const cars = [];

  // Random source: the game's seeded rng, or a constant one half if missing.
  function rand() {
    return game.rng && typeof game.rng.next === 'function' ? game.rng.next() : 0.5;
  }
  function randRange(min, max) {
    return game.rng && typeof game.rng.range === 'function'
      ? game.rng.range(min, max) : min + (max - min) * rand();
  }
  function randPick(list) {
    return game.rng && typeof game.rng.pick === 'function'
      ? game.rng.pick(list) : list[Math.floor(rand() * list.length)];
  }
  function clamp(value, min, max) {
    return THREE.MathUtils.clamp(value, min, max);
  }

  // Spawn one car 25–110 units from the player, snapped onto the nearest
  // road with that road's heading, offset 2.3 units to the right of the
  // road direction (right-hand lane), in a random kind and paint colour.
  function spawnCar() {
    const player = game.player;
    const px = player && player.position ? player.position.x : 0;
    const pz = player && player.position ? player.position.z : 0;
    const angle = randRange(0, Math.PI * 2);
    const distance = randRange(SPAWN_MIN, SPAWN_MAX);
    const road = world.nearestRoadPoint(px + Math.cos(angle) * distance, pz + Math.sin(angle) * distance);
    const heading = road.heading || 0;
    const x = road.x + Math.cos(heading) * LANE_OFFSET;
    const z = road.z - Math.sin(heading) * LANE_OFFSET;
    const kind = randPick(TRAFFIC_KINDS);
    const mesh = createCarMesh(kind, randPick(paint));
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = {
      kind, mesh, position: mesh.position, heading,
      targetHeading: heading,
      speed: randRange(5, 9),
      cruiseSpeed: randRange(7, 11),
      turnTimer: randRange(3, 9),
    };
    cars.push(car);
    return car;
  }

  function removeCar(index) {
    scene.remove(cars[index].mesh);
    cars.splice(index, 1);
  }

  // True when the point (x, z) sits ahead of the car — in front of it
  // and within a car's width to the side.
  function isAheadOf(car, x, z) {
    const dx = x - car.position.x;
    const dz = z - car.position.z;
    const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    const side = dx * Math.cos(car.heading) - dz * Math.sin(car.heading);
    return ahead > 0 && ahead < AHEAD_DISTANCE && Math.abs(side) < AHEAD_SIDE;
  }

  // True when another vehicle is ahead within 8 metres: any other
  // traffic car, or the car the player is driving.
  function vehicleAhead(car) {
    for (let i = 0; i < cars.length; i++) {
      if (cars[i] !== car && isAheadOf(car, cars[i].position.x, cars[i].position.z)) return true;
    }
    const playerCar = (game.vehicles && game.vehicles.playerCar)
      || (game.player && game.player.car) || null;
    const pos = playerCar && (playerCar.position || (playerCar.mesh && playerCar.mesh.position));
    return !!(pos && isAheadOf(car, pos.x, pos.z));
  }

  function update(dt) {
    if (game.state !== 'playing') return;
    if (!dt || dt <= 0) return;
    if (dt > 0.05) dt = 0.05;
    const player = game.player;
    const px = player && player.position ? player.position.x : 0;
    const pz = player && player.position ? player.position.z : 0;

    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];

      // Too far from the player: drop it; a replacement spawns below.
      const dxPlayer = car.position.x - px;
      const dzPlayer = car.position.z - pz;
      if (dxPlayer * dxPlayer + dzPlayer * dzPlayer > RESPAWN_DISTANCE * RESPAWN_DISTANCE) {
        removeCar(i);
        continue;
      }

      if (!world.onRoad(car.position.x, car.position.z)) {
        // Off the road: steer back towards the road's centre line.
        const road = world.nearestRoadPoint(car.position.x, car.position.z);
        car.targetHeading = Math.atan2(road.x - car.position.x, road.z - car.position.z);
      } else {
        // On the road, consider turning when the timer runs out:
        // about 28% right, 28% left, the rest straight ahead.
        car.turnTimer -= dt;
        if (car.turnTimer <= 0) {
          const roll = rand();
          if (roll < 0.28) car.targetHeading = car.heading + Math.PI / 2;
          else if (roll < 0.56) car.targetHeading = car.heading - Math.PI / 2;
          else car.targetHeading = car.heading;
          car.turnTimer = randRange(4, 10);
        }
      }

      // Ease speed towards cruising speed, or towards zero when blocked.
      const targetSpeed = vehicleAhead(car) ? 0 : car.cruiseSpeed;
      if (car.speed < targetSpeed) car.speed = Math.min(targetSpeed, car.speed + 4 * dt);
      else car.speed = Math.max(targetSpeed, car.speed - 8 * dt);

      // Ease heading towards the target heading, at most 1.6 rad/s.
      const diff = wrapAngle(car.targetHeading - car.heading);
      car.heading += clamp(diff, -TURN_RATE * dt, TURN_RATE * dt);

      // Move along the heading; a building ahead means turning away
      // by a right angle and dropping to 40 percent of speed.
      const nextX = car.position.x + Math.sin(car.heading) * car.speed * dt;
      const nextZ = car.position.z + Math.cos(car.heading) * car.speed * dt;
      if (world.isBlocked(nextX, nextZ, BLOCKED_RADIUS)) {
        car.targetHeading = car.heading + Math.PI / 2;
        car.speed *= 0.4;
      } else {
        car.position.x = nextX;
        car.position.z = nextZ;
      }

      car.mesh.rotation.y = car.heading;

      // Spin the wheels with speed.
      const wheels = car.mesh.userData && car.mesh.userData.wheels;
      if (wheels) {
        for (let w = 0; w < wheels.length; w++) {
          wheels[w].rotation.x += (car.speed * dt) / WHEEL_RADIUS;
        }
      }
    }

    // Keep the city topped up at the configured traffic count.
    while (cars.length < count) spawnCar();
  }

  for (let i = 0; i < count; i++) spawnCar();

  return { cars, update };
}
