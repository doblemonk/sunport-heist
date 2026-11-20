import * as THREE from '../vendor/three.min.js';
import { buildCarMesh } from './vehicles.js';

const TWO_PI = Math.PI * 2;
const KINDS = ['sedan', 'sedan', 'coupe', 'taxi', 'sedan', 'truck'];
const DEFAULT_COLORS = [0xff4444, 0x4488ff, 0x44aa44, 0xffcc00, 0xf0f0e0, 0x222222];

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= TWO_PI;
  while (angle < -Math.PI) angle += TWO_PI;
  return angle;
}

export function createTraffic(game) {
  const config = game.config || {};
  const scene = game.scene;
  const world = game.world;
  const rng = game.rng;
  const count = config.trafficCount || 14;
  const colors = (config.carColors && config.carColors.length > 0)
    ? config.carColors
    : DEFAULT_COLORS;

  function next() {
    if (rng && typeof rng.next === 'function') return rng.next();
    return 0.5;
  }

  function range(min, max) {
    if (rng && typeof rng.range === 'function') return rng.range(min, max);
    return min + (max - min) * 0.5;
  }

  function pick(list) {
    if (rng && typeof rng.pick === 'function') return rng.pick(list);
    return list[Math.floor(next() * list.length) % list.length];
  }

  function playerPos() {
    if (game.player && game.player.position) return game.player.position;
    return { x: 0, y: 0, z: 0 };
  }

  function spawnCar() {
    const player = playerPos();
    const angle = range(0, TWO_PI);
    const distance = range(25, 110);
    let x = player.x + Math.sin(angle) * distance;
    let z = player.z + Math.cos(angle) * distance;

    let heading = 0;
    if (world && typeof world.nearestRoadPoint === 'function') {
      const road = world.nearestRoadPoint(x, z);
      if (road) {
        x = road.x;
        z = road.z;
        heading = road.heading || 0;
      }
    }

    // Right-hand lane: 2.3 units to the right of the road direction.
    // Forward is (sin h, cos h) in x/z, so the local right side is (cos h, -sin h).
    const rightX = Math.cos(heading);
    const rightZ = -Math.sin(heading);
    x += rightX * 2.3;
    z += rightZ * 2.3;

    const kind = pick(KINDS);
    const colour = pick(colors);
    const mesh = buildCarMesh(kind, colour);
    mesh.position.set(x, 0, z);
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
    return car;
  }

  function removeCar(index, cars) {
    const car = cars[index];
    if (car && car.mesh && scene) scene.remove(car.mesh);
    cars.splice(index, 1);
  }

  function isBlockedAhead(car, other) {
    // Is `other` in front of `car` within 8 metres, and within 2.4 units
    // to the side? Forward is (sin h, cos h), right is (cos h, -sin h).
    const dx = other.position.x - car.position.x;
    const dz = other.position.z - car.position.z;
    const forward = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    if (forward <= 0 || forward > 8) return false;
    const side = dx * Math.cos(car.heading) - dz * Math.sin(car.heading);
    return Math.abs(side) < 2.4;
  }

  const cars = [];
  for (let i = 0; i < count; i++) {
    cars.push(spawnCar());
  }

  function update(dt) {
    if (game.state !== 'playing') return;
    if (!dt || dt <= 0) dt = 0.016;
    if (dt > 0.1) dt = 0.1;

    const player = playerPos();
    const playerCar = (game.vehicles && game.vehicles.playerCar)
      ? game.vehicles.playerCar
      : null;

    // Top the count back up, and replace any car that drifted too far away.
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      const dx = car.position.x - player.x;
      const dz = car.position.z - player.z;
      if (dx * dx + dz * dz > 210 * 210) {
        removeCar(i, cars);
      }
    }
    while (cars.length < count) {
      cars.push(spawnCar());
    }

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];

      // Slow or stop for a vehicle ahead: other traffic cars, and the
      // player's car when the player is driving.
      let blockedAhead = false;
      for (let j = 0; j < cars.length; j++) {
        if (j === i) continue;
        if (isBlockedAhead(car, cars[j])) {
          blockedAhead = true;
          break;
        }
      }
      if (!blockedAhead && playerCar && playerCar !== car) {
        if (isBlockedAhead(car, playerCar)) blockedAhead = true;
      }

      // Steering: off the road, head back to the road's centre line.
      // On the road, reconsider the turn when the timer runs out.
      let onRoad = true;
      if (world && typeof world.onRoad === 'function') {
        onRoad = world.onRoad(car.position.x, car.position.z);
      }
      if (!onRoad) {
        if (world && typeof world.nearestRoadPoint === 'function') {
          const road = world.nearestRoadPoint(car.position.x, car.position.z);
          if (road) car.targetHeading = road.heading || 0;
        }
      } else {
        car.turnTimer -= dt;
        if (car.turnTimer <= 0) {
          const roll = next();
          if (roll < 0.28) {
            // Right turn.
            car.targetHeading = car.heading - Math.PI / 2;
          } else if (roll < 0.56) {
            // Left turn.
            car.targetHeading = car.heading + Math.PI / 2;
          } else {
            // Straight ahead.
            car.targetHeading = car.heading;
          }
          car.turnTimer = range(4, 10);
        }
      }

      // Speed eases toward the cruising speed, or toward zero when blocked.
      const desiredSpeed = blockedAhead ? 0 : car.cruise;
      const ease = Math.min(1, dt * 1.5);
      car.speed += (desiredSpeed - car.speed) * ease;
      if (blockedAhead && car.speed < 0.05) car.speed = 0;

      // Heading eases toward the target heading, at most 1.6 rad/s.
      const diff = wrapAngle(car.targetHeading - car.heading);
      const maxTurn = 1.6 * dt;
      if (diff > maxTurn) {
        car.heading += maxTurn;
      } else if (diff < -maxTurn) {
        car.heading -= maxTurn;
      } else {
        car.heading += diff;
      }
      car.heading = wrapAngle(car.heading);

      // Move along the heading; a building in the way means turning away
      // by a right angle and slowing to 40 percent.
      const aheadX = car.position.x + Math.sin(car.heading) * 3;
      const aheadZ = car.position.z + Math.cos(car.heading) * 3;
      if (world && typeof world.isBlocked === 'function' &&
          world.isBlocked(aheadX, aheadZ, 1.5)) {
        car.heading = wrapAngle(car.heading + Math.PI / 2);
        car.targetHeading = car.heading;
        car.speed *= 0.4;
      }
      car.position.x += Math.sin(car.heading) * car.speed * dt;
      car.position.z += Math.cos(car.heading) * car.speed * dt;

      // Mesh follows the heading, and the wheels spin with speed.
      car.mesh.rotation.y = car.heading;
      const wheels = car.mesh.userData && car.mesh.userData.wheels;
      if (wheels) {
        for (let w = 0; w < wheels.length; w++) {
          wheels[w].rotation.x += (car.speed * dt) / 0.35;
        }
      }
    }
  }

  return {
    cars: cars,
    update: update,
  };
}
