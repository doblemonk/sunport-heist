import * as THREE from '../vendor/three.min.js';
import { buildCarMesh } from './vehicles.js';

// Ambient Solmar traffic: cars that cruise the roads in right-hand lanes,
// slow for the vehicle ahead, turn at intersections, and respawn near the
// player when they drift too far away. Built with buildCarMesh so every
// car on the road looks like a car the player can steal.

const KINDS = ['sedan', 'sedan', 'coupe', 'taxi', 'sedan', 'truck'];

function rngFloat(game) {
  const r = game && game.rng;
  if (typeof r === 'function') return r();
  if (r && typeof r.next === 'function') return r.next();
  if (r && typeof r.random === 'function') return r.random();
  if (r && typeof r.float === 'function') return r.float();
  return 0.5;
}

function rngRange(game, min, max) {
  return min + rngFloat(game) * (max - min);
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createTraffic(game) {
  const cfg = game.config || {};
  const wantedCount = cfg.trafficCount || 14;
  const colours = cfg.carColors || [0xc0392b, 0x2e6f8e, 0xe0e0e0, 0x222831, 0xf7c948, 0x7d3c98];

  function playerPos() {
    if (game.player && game.player.position) return game.player.position;
    return { x: 0, z: 0 };
  }

  function roadPointNear(cx, cz, minDist, maxDist) {
    const world = game.world;
    const angle = rngFloat(game) * Math.PI * 2;
    const dist = rngRange(game, minDist, maxDist);
    const x = cx + Math.sin(angle) * dist;
    const z = cz + Math.cos(angle) * dist;
    if (world && world.nearestRoadPoint) {
      const p = world.nearestRoadPoint(x, z);
      if (p) return p;
    }
    return { x, z, heading: angle };
  }

  function spawnCar() {
    const p = playerPos();
    const road = roadPointNear(p.x, p.z, 25, 110);
    const kind = KINDS[Math.floor(rngFloat(game) * KINDS.length) % KINDS.length];
    const colour = colours[Math.floor(rngFloat(game) * colours.length) % colours.length];
    const mesh = buildCarMesh(kind, colour);
    // Right-hand lane: offset to the right of the road direction.
    const rx = Math.cos(road.heading || 0);
    const rz = -Math.sin(road.heading || 0);
    mesh.position.set((road.x || 0) + rx * 2.3, 0, (road.z || 0) + rz * 2.3);
    mesh.rotation.y = road.heading || 0;
    if (game.scene) game.scene.add(mesh);
    const car = {
      kind,
      mesh,
      position: mesh.position,
      heading: road.heading || 0,
      targetHeading: road.heading || 0,
      speed: rngRange(game, 5, 9),
      cruise: rngRange(game, 7, 11),
      turnTimer: rngRange(game, 3, 9),
    };
    traffic.cars.push(car);
    return car;
  }

  function removeCar(car) {
    const i = traffic.cars.indexOf(car);
    if (i >= 0) traffic.cars.splice(i, 1);
    if (game.scene) game.scene.remove(car.mesh);
  }

  const traffic = {
    cars: [],

    update(dt) {
      if (game.state && game.state !== 'playing') return;
      const p = playerPos();
      const world = game.world;

      // Top the fleet back up to trafficCount, near the player.
      while (traffic.cars.length < wantedCount) spawnCar();

      for (let i = traffic.cars.length - 1; i >= 0; i--) {
        const car = traffic.cars[i];
        const distToPlayer = Math.hypot(car.position.x - p.x, car.position.z - p.z);
        if (distToPlayer > 210) {
          removeCar(car);
          spawnCar();
          continue;
        }

        // Slow or stop when a vehicle is ahead within 8 metres.
        let blockedAhead = false;
        const fx = Math.sin(car.heading);
        const fz = Math.cos(car.heading);
        const others = traffic.cars;
        for (let j = 0; j < others.length; j++) {
          if (j === i) continue;
          const o = others[j];
          const dx = o.position.x - car.position.x;
          const dz = o.position.z - car.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 8 && d > 0.01 && (dx * fx + dz * fz) / d > 0.45 && Math.abs(dx * fz - dz * fx) < 2.4) {
            blockedAhead = true;
            break;
          }
        }
        if (!blockedAhead && game.vehicles && game.vehicles.playerCar) {
          const pc = game.vehicles.playerCar;
          const dx = pc.position.x - car.position.x;
          const dz = pc.position.z - car.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 8 && d > 0.01 && (dx * fx + dz * fz) / d > 0.45 && Math.abs(dx * fz - dz * fx) < 2.4) {
            blockedAhead = true;
          }
        }

        // Follow the road. Off the road, steer back to its centre line;
        // on it, keep the road heading, with an occasional turn.
        let road = null;
        if (world && world.nearestRoadPoint) road = world.nearestRoadPoint(car.position.x, car.position.z);
        const onRoad = world && world.onRoad ? world.onRoad(car.position.x, car.position.z) : true;
        car.turnTimer -= dt;
        if (road) {
          if (!onRoad) {
            car.targetHeading = road.heading || 0;
          } else if (car.turnTimer <= 0) {
            car.turnTimer = rngRange(game, 4, 10);
            const roll = rngFloat(game);
            if (roll < 0.28) car.targetHeading = (road.heading || 0) + Math.PI / 2;
            else if (roll < 0.56) car.targetHeading = (road.heading || 0) - Math.PI / 2;
            else car.targetHeading = road.heading || 0;
          }
        }

        const targetSpeed = blockedAhead ? 0 : car.cruise;
        car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.6);
        if (Math.abs(car.speed) < 0.05 && targetSpeed === 0) car.speed = 0;

        // Ease the heading toward the target heading.
        const diff = wrapAngle(car.targetHeading - car.heading);
        car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));

        const nx = car.position.x + Math.sin(car.heading) * car.speed * dt;
        const nz = car.position.z + Math.cos(car.heading) * car.speed * dt;
        if (world && world.isBlocked && world.isBlocked(nx, nz, 1.1)) {
          // A building is in the way: turn away and slow down.
          car.targetHeading = car.heading + Math.PI / 2;
          car.speed *= 0.4;
        } else {
          car.position.x = nx;
          car.position.z = nz;
        }
        car.mesh.rotation.y = car.heading;
        const wheels = car.mesh.userData && car.mesh.userData.wheels;
        if (wheels) {
          for (const w of wheels) w.rotation.x += (car.speed * dt) / 0.36;
        }
      }
    },
  };

  // Seed the roads before the first frame so the city never looks empty.
  for (let i = 0; i < wantedCount; i++) spawnCar();

  return traffic;
}
