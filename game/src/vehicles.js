// Cars: how one drives, how one is stolen, and how the player's car is
// drawn. Traffic cars reuse this shape; their steering lives in traffic.js
// and the police chase lives in police.js.
import { CAR, ROAD_X, ROAD_Y, clamp, dist } from './config.js';
import { pick } from './random.js';

export const KIND_PARKED = 'parked';
export const KIND_TRAFFIC = 'traffic';
export const KIND_POLICE = 'police';
export const KIND_PLAYER = 'player';

let nextId = 1;

export function createCar(x, y, angle, color, kind) {
  return {
    id: nextId += 1,
    x, y, angle,
    speed: 0,
    color,
    kind,
    driver: kind === KIND_TRAFFIC,
    wrecked: false,
    honkTimer: 0,
  };
}

export function driveCar(car, throttle, steer, dt, world) {
  // Arcade handling: speed along the nose, steering that bites harder
  // the faster the car goes, and a handbrake slide when reversing hard.
  if (throttle > 0) car.speed += CAR.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 20) car.speed -= CAR.brake * dt;
    else car.speed += CAR.reverseAccel * throttle * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 240 * dt);
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  const steerAmount = steer * CAR.turnRate * clamp(Math.abs(car.speed) / 200, 0, 1) * dt;
  car.angle += (car.speed >= 0 ? steerAmount : -steerAmount);
  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  const next = world.moveWithCollision(car.x, car.y, dx, dy, CAR.radius);
  if (next.hit && Math.abs(car.speed) > 120) car.speed *= 0.4;
  car.x = next.x;
  car.y = next.y;
}

export function nearestCar(cars, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.wrecked) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function randomParkedSpot(random, world) {
  // Parked along a road edge: pick a road, a point along it, offset to the kerb.
  const vertical = random() < 0.5;
  if (vertical) {
    const rx = pick(random, ROAD_X);
    const y = 120 + random() * 2360;
    return { x: rx + 44, y, angle: random() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
  }
  const ry = pick(random, ROAD_Y);
  const x = 120 + random() * 3360;
  return { x, y: ry + 44, angle: random() < 0.5 ? 0 : Math.PI };
}

export function carLabel(car) {
  if (car.kind === KIND_POLICE) return 'Solmar PD cruiser';
  if (car.kind === KIND_TRAFFIC) return 'traffic car';
  return 'parked car';
}
