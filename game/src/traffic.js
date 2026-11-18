// Traffic: the cars that fill Solmar's roads. Each one picks a road, drives
// along it in a lane, turns at intersections, and slows for the car ahead.
// They are not clever, but there are enough of them that the city feels busy.
import { CAR, CAR_COLORS, ROAD_X, ROAD_Y, WORLD_H, WORLD_W, clamp } from './config.js';
import { pick, range } from './random.js';
import { KIND_TRAFFIC, createCar } from './vehicles.js';

const TRAFFIC_COUNT = 26;

export function createTraffic(random, world) {
  const cars = [];
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const car = spawnTrafficCar(random, world);
    if (car) cars.push(car);
  }
  return cars;
}

function spawnTrafficCar(random, world) {
  const vertical = random() < 0.5;
  let x; let y; let angle;
  if (vertical) {
    x = pick(random, ROAD_X) + (random() < 0.5 ? -28 : 28);
    y = 100 + random() * (WORLD_H - 200);
    angle = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    y = pick(random, ROAD_Y) + (random() < 0.5 ? -28 : 28);
    x = 100 + random() * (WORLD_W - 200);
    angle = random() < 0.5 ? 0 : Math.PI;
  }
  const car = createCar(x, y, angle, pick(random, CAR_COLORS), KIND_TRAFFIC);
  car.speed = range(random, 140, 220);
  car.cruise = car.speed;
  car.lane = vertical ? 'v' : 'h';
  car.turnAt = null;
  return car;
}

function nearestAhead(car, cars, playerCar) {
  let best = Infinity;
  const all = playerCar ? [...cars, playerCar] : cars;
  for (const other of all) {
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (forward > 0 && forward < 130 && side < 26 && forward < best) best = forward;
  }
  return best;
}

export function updateTraffic(cars, player, world, random, dt) {
  const playerCar = player.inCar;
  for (const car of cars) {
    if (car.wrecked) continue;
    // At an intersection, sometimes turn onto the crossing road.
    const onX = world.onRoadX(car.x);
    const onY = world.onRoadY(car.y);
    if (onX !== null && onY !== null && random() < dt * 0.5) {
      const vertical = random() < 0.5;
      if (vertical) {
        car.angle = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        car.lane = 'v';
        car.x = onX + (car.angle === Math.PI / 2 ? 28 : -28);
      } else {
        car.angle = random() < 0.5 ? 0 : Math.PI;
        car.lane = 'h';
        car.y = onY + (car.angle === 0 ? 28 : -28);
      }
    }
    // Stay in the lane: nudge back toward the road centre line.
    if (car.lane === 'v') {
      const rx = world.onRoadX(car.x);
      if (rx !== null) {
        const target = rx + (car.angle === Math.PI / 2 ? 28 : -28);
        car.x += clamp(target - car.x, -1, 1) * 60 * dt;
      }
    } else {
      const ry = world.onRoadY(car.y);
      if (ry !== null) {
        const target = ry + (car.angle === 0 ? 28 : -28);
        car.y += clamp(target - car.y, -1, 1) * 60 * dt;
      }
    }
    // Slow for the car ahead; speed back up to cruising speed.
    const ahead = nearestAhead(car, cars, playerCar);
    const want = ahead < 130 ? Math.max(0, (ahead - 60) * 1.5) : car.cruise;
    car.speed += clamp(want - car.speed, -300 * dt, 200 * dt);
    const dx = Math.cos(car.angle) * car.speed * dt;
    const dy = Math.sin(car.angle) * car.speed * dt;
    const next = world.moveWithCollision(car.x, car.y, dx, dy, CAR.radius);
    if (next.hit) {
      car.speed = 0;
      car.angle += Math.PI / 2;
    }
    car.x = next.x;
    car.y = next.y;
    // Wrap back into the city if somehow pushed out.
    car.x = clamp(car.x, 40, WORLD_W - 40);
    car.y = clamp(car.y, 40, WORLD_H - 40);
  }
}

export function drawTraffic(ctx, cars, cam, time, drawCar) {
  for (const car of cars) drawCar(ctx, car, cam, time);
}
