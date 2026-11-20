import * as THREE from '../vendor/three.min.js';
import { buildCarMesh } from './vehicles.js';

// Ambient traffic: cars cruising the road grid in right-hand lanes,
// slowing for the vehicle ahead, turning at intersections, and
// respawning near the player when they drift too far away.

const TWO_PI = Math.PI * 2;
const KINDS = ['sedan', 'sedan', 'coupe', 'taxi', 'sedan', 'truck'];

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= TWO_PI;
  while (angle < -Math.PI) angle += TWO_PI;
  return angle;
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function createTraffic(game) {
  const config = game.config || {};
  const scene = game.scene;
  const world = game.world;

  // Seeded random source; fall back to a constant one half when absent.
  const source = game.rng || null;
  const rng = {
    next() {
      return source && typeof source.next === 'function' ? source.next() : 0.5;
    },
    range(min, max) {
      if (source && typeof source.range === 'function') return source.range(min, max);
      return min + (max - min) * 0.5;
    },
    int(min, max) {
      if (source && typeof source.int === 'function') return source.int(min, max);
      return Math.floor(min + (max - min + 1) * 0.5);
    },
    pick(list) {
      if (source && typeof source.pick === 'function') return source.pick(list);
      return list[Math.floor(list.length * 0.5)];
    },
  };

  const trafficCount = config.trafficCount || 14;
  const paint = Array.isArray(config.carColors) && config.carColors.length > 0
    ? config.carColors
    : [0x888888];

  const cars = [];

  function playerPosition() {
    if (game.player && game.player.position) return game.player.position;
    return { x: 0, y: 0, z: 0 };
  }

  function spawnCar() {
    const playerPos = playerPosition();
    const angle = rng.range(0, TWO_PI);
    const distance = rng.range(25, 110);
    const x = playerPos.x + Math.cos(angle) * distance;
    const z = playerPos.z + Math.sin(angle) * distance;

    let road = null;
    if (world && typeof world.nearestRoadPoint === 'function') {
      road = world.nearestRoadPoint(x, z);
    }
    const roadX = road ? road.x : x;
    const roadZ = road ? road.z : z;
    const heading = road ? road.heading : 0;

    // Right-hand lane: 2.3 units to the right of the road direction.
    // Local right for a heading is (cos h, -sin h) in x/z.
    const px = roadX + Math.cos(heading) * 2.3;
    const pz = roadZ - Math.sin(heading) * 2.3;

    const kind = rng.pick(KINDS);
    const colour = rng.pick(paint);
    const mesh = buildCarMesh(kind, colour);
    mesh.position.set(px, 0, pz);
    mesh.rotation.y = heading;
    if (scene) scene.add(mesh);

    const car = {
      kind,
      mesh,
      position: mesh.position,
      heading,
      targetHeading: heading,
      speed: rng.range(5, 9),
      cruise: rng.range(7, 11),
      turnTimer: rng.range(3, 9),
    };
    cars.push(car);
    return car;
  }

  function removeCar(index) {
    const car = cars[index];
    if (!car) return;
    if (scene && car.mesh) scene.remove(car.mesh);
    cars.splice(index, 1);
  }

  function isBlockedAhead(car) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    const px = car.position.x;
    const pz = car.position.z;

    const candidates = [];
    for (let i = 0; i < cars.length; i++) {
      if (cars[i] !== car) candidates.push(cars[i]);
    }
    if (game.vehicles && game.vehicles.playerCar) {
      candidates.push(game.vehicles.playerCar);
    }

    for (let i = 0; i < candidates.length; i++) {
      const other = candidates[i];
      if (!other || !other.position) continue;
      const dx = other.position.x - px;
      const dz = other.position.z - pz;
      const ahead = dx * fx + dz * fz;
      if (ahead <= 0 || ahead > 8) continue;
      const side = dx * rx + dz * rz;
      if (Math.abs(side) < 2.4) return true;
    }
    return false;
  }

  function update(dt) {
    if (!game || game.state !== 'playing') return;
    if (!dt || dt <= 0) return;
    const step = Math.min(dt, 0.1);
    const playerPos = playerPosition();

    // Keep the count topped up.
    while (cars.length < trafficCount) spawnCar();

    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];

      // Drifted too far: remove and replace near the player.
      const dxp = car.position.x - playerPos.x;
      const dzp = car.position.z - playerPos.z;
      if (dxp * dxp + dzp * dzp > 210 * 210) {
        removeCar(i);
        spawnCar();
        continue;
      }

      const blockedAhead = isBlockedAhead(car);

      // Steering: off the road, steer back to the centre line.
      let onRoad = true;
      let road = null;
      if (world && typeof world.onRoad === 'function') {
        onRoad = world.onRoad(car.position.x, car.position.z);
      }
      if (world && typeof world.nearestRoadPoint === 'function') {
        road = world.nearestRoadPoint(car.position.x, car.position.z);
      }

      if (!onRoad) {
        if (road) car.targetHeading = road.heading;
      } else {
        car.turnTimer -= step;
        if (car.turnTimer <= 0) {
          const roll = rng.next();
          const base = road ? road.heading : car.heading;
          if (roll < 0.28) {
            car.targetHeading = base + Math.PI / 2;
          } else if (roll < 0.56) {
            car.targetHeading = base - Math.PI / 2;
          } else {
            car.targetHeading = base;
          }
          car.turnTimer = rng.range(4, 10);
        }
      }

      // Speed eases toward cruising speed, or toward zero when blocked.
      const targetSpeed = blockedAhead ? 0 : car.cruise;
      if (car.speed < targetSpeed) {
        car.speed = Math.min(targetSpeed, car.speed + 4 * step);
      } else if (car.speed > targetSpeed) {
        car.speed = Math.max(targetSpeed, car.speed - 8 * step);
      }

      // Heading eases toward the target heading, at most 1.6 rad/s.
      const diff = wrapAngle(car.targetHeading - car.heading);
      const maxTurn = 1.6 * step;
      car.heading += clamp(diff, -maxTurn, maxTurn);

      // Move along the heading.
      const nextX = car.position.x + Math.sin(car.heading) * car.speed * step;
      const nextZ = car.position.z + Math.cos(car.heading) * car.speed * step;

      let blocked = false;
      if (world && typeof world.isBlocked === 'function') {
        const aheadX = car.position.x + Math.sin(car.heading) * 3;
        const aheadZ = car.position.z + Math.cos(car.heading) * 3;
        blocked = world.isBlocked(aheadX, aheadZ, 1.2);
      }

      if (blocked) {
        // Turn away by a right angle and slow to 40 percent.
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
        const spin = (car.speed * step) / 0.35;
        for (let w = 0; w < wheels.length; w++) {
          wheels[w].rotation.x += spin;
        }
      }
    }
  }

  // The city starts with a full set of traffic cars.
  for (let i = 0; i < trafficCount; i++) spawnCar();

  return { cars, update };
}
