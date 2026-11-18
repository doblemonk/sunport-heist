// Pedestrians: Solmar's walkers. They stroll the sidewalks, cross at the
// lights, chat in pairs on the beach, and run when they hear a gunshot or
// see a car coming at them. A few carry cash; shoving one is a crime, and
// the city notices.
import { PED_COLORS, WORLD_H, WORLD_W, dist } from './config.js';
import { pick, range } from './random.js';

const PED_COUNT = 42;

export function createPedestrians(random, world) {
  const peds = [];
  for (let i = 0; i < PED_COUNT; i += 1) {
    const spot = world.nearestRoadPoint(150 + random() * 3300, 150 + random() * 2300);
    const x = spot.x + range(random, -90, 90);
    const y = spot.y + range(random, -90, 90);
    peds.push({
      x, y,
      angle: random() * Math.PI * 2,
      speed: range(random, 40, 80),
      color: pick(random, PED_COLORS),
      state: 'walk',
      panic: 0,
      targetX: x,
      targetY: y,
      retarget: random() * 4,
      down: false,
      downTimer: 0,
      cash: Math.floor(range(random, 5, 60)),
    });
  }
  return peds;
}

function pickTarget(ped, world, random) {
  const spot = world.nearestRoadPoint(ped.x, ped.y);
  ped.targetX = spot.x + range(random, -260, 260);
  ped.targetY = spot.y + range(random, -260, 260);
  ped.targetX = Math.max(40, Math.min(WORLD_W - 40, ped.targetX));
  ped.targetY = Math.max(40, Math.min(WORLD_H - 40, ped.targetY));
}

export function updatePedestrians(peds, player, cars, gunshot, world, random, dt) {
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  for (const ped of peds) {
    if (ped.down) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) ped.down = false;
      continue;
    }
    if (ped.panic > 0) ped.panic -= dt;
    // Panic: a gunshot, or the player barrelling toward them in a car.
    if (gunshot && dist(ped.x, ped.y, px, py) < 500) ped.panic = 2.5;
    const nearCar = player.inCar && dist(ped.x, ped.y, px, py) < 120 && Math.abs(player.inCar.speed) > 150;
    if (nearCar) ped.panic = 1.5;
    const speed = ped.panic > 0 ? 240 : ped.speed;
    ped.retarget -= dt;
    if (ped.retarget <= 0 || dist(ped.x, ped.y, ped.targetX, ped.targetY) < 24) {
      if (ped.panic > 0) {
        // Flee away from the player.
        const a = Math.atan2(ped.y - py, ped.x - px);
        ped.targetX = ped.x + Math.cos(a) * 300;
        ped.targetY = ped.y + Math.sin(a) * 300;
      } else {
        pickTarget(ped, world, random);
      }
      ped.retarget = 3 + random() * 4;
    }
    const a = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
    ped.angle = a;
    const next = world.moveWithCollision(ped.x, ped.y, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt, 10);
    ped.x = next.x;
    ped.y = next.y;
    // A car hitting a pedestrian knocks them down and is a serious crime.
    for (const car of cars) {
      if (car.wrecked) continue;
      if (Math.abs(car.speed) > 100 && dist(ped.x, ped.y, car.x, car.y) < 30) {
        ped.down = true;
        ped.downTimer = 6;
        ped.hitBy = car === player.inCar ? 'player' : car.kind;
      }
    }
  }
}
