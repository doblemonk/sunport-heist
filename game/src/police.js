// The Solmar Police Department: wanted stars, the cruisers and foot cops
// that answer them, the chase, the arrest, and the slow fade of the heat
// when the player stays out of sight.
import { CAR, WANTED, WORLD_H, WORLD_W, angleDiff, dist } from './config.js';
import { KIND_POLICE, createCar } from './vehicles.js';

export function createPolice() {
  return {
    copCars: [],
    footCops: [],
    hiddenTimer: 0,
    sirenTimer: 0,
    arrestProgress: 0,
  };
}

function spawnPointNear(player, random, distance) {
  const a = random() * Math.PI * 2;
  return {
    x: Math.max(60, Math.min(WORLD_W - 60, player.x + Math.cos(a) * distance)),
    y: Math.max(60, Math.min(WORLD_H - 60, player.y + Math.sin(a) * distance)),
  };
}

export function addWanted(player, amount, police) {
  player.wanted = Math.min(WANTED.max, player.wanted + amount);
  police.hiddenTimer = 0;
}

export function updatePolice(police, player, world, random, dt, audio) {
  const wanted = player.wanted;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;

  // Reinforcements arrive until the street holds as many cruisers and
  // foot cops as the wanted level calls for.
  const wantCars = wanted >= 2 ? Math.min(3, wanted - 1) : 0;
  const wantCops = wanted >= 1 ? Math.min(4, wanted + 1) : 0;
  while (police.copCars.length < wantCars) {
    const spot = spawnPointNear({ x: px, y: py }, random, 700);
    const car = createCar(spot.x, spot.y, Math.atan2(py - spot.y, px - spot.x), '#1f2937', KIND_POLICE);
    car.speed = 200;
    police.copCars.push(car);
  }
  while (police.footCops.length < wantCops) {
    const spot = spawnPointNear({ x: px, y: py }, random, 500);
    police.footCops.push({ x: spot.x, y: spot.y, angle: 0, speed: 200, punchTimer: 0, down: false, downTimer: 0 });
  }
  if (wanted === 0) {
    police.copCars.length = 0;
    police.footCops.length = 0;
    police.arrestProgress = 0;
    return;
  }

  // Cruisers steer at the player and ram; a hard hit slows them down.
  for (const car of police.copCars) {
    const wantAngle = Math.atan2(py - car.y, px - car.x);
    car.angle += clampTurn(angleDiff(car.angle, wantAngle), dt);
    car.speed += ((wanted >= 3 ? 520 : 430) - car.speed) * dt * 0.8;
    const dx = Math.cos(car.angle) * car.speed * dt;
    const dy = Math.sin(car.angle) * car.speed * dt;
    const next = world.moveWithCollision(car.x, car.y, dx, dy, CAR.radius);
    if (next.hit) car.speed *= 0.5;
    car.x = next.x;
    car.y = next.y;
    // Ramming the player's car damages it; ramming the player hurts them.
    if (player.inCar) {
      if (dist(car.x, car.y, player.inCar.x, player.inCar.y) < 46) {
        player.inCar.speed *= 0.7;
        car.speed *= 0.6;
      }
    } else if (dist(car.x, car.y, px, py) < 30) {
      player.health = Math.max(0, player.health - 12 * dt * 4);
    }
  }

  // Foot cops run the player down. Close in, they start an arrest; break
  // away and the arrest meter drains. A shot cop stays down, then gets up.
  let copNear = false;
  for (const cop of police.footCops) {
    if (cop.down) {
      cop.downTimer -= dt;
      continue;
    }
    const d = dist(cop.x, cop.y, px, py);
    if (d < 700) copNear = true;
    const a = Math.atan2(py - cop.y, px - cop.x);
    cop.angle = a;
    const speed = d < 60 ? 0 : cop.speed;
    const next = world.moveWithCollision(cop.x, cop.y, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt, 10);
    cop.x = next.x;
    cop.y = next.y;
    if (!player.inCar && d < 42) {
      police.arrestProgress += dt / 2.2;
      if (cop.punchTimer <= 0) {
        player.health = Math.max(0, player.health - 6);
        cop.punchTimer = 0.8;
      }
    }
    if (cop.punchTimer > 0) cop.punchTimer -= dt;
  }
  // Downed cops get back up after a while.
  for (const cop of police.footCops) {
    if (cop.down && cop.downTimer <= 0) cop.down = false;
  }
  if (!copNear && police.copCars.length === 0) police.arrestProgress = Math.max(0, police.arrestProgress - dt / 2);

  // Wanted decay: stay unseen and the heat cools off, one star at a time.
  const anyCopNear = copNear || police.copCars.some((c) => dist(c.x, c.y, px, py) < 600);
  if (!anyCopNear) {
    police.hiddenTimer += dt;
    if (police.hiddenTimer > WANTED.decayDelay) {
      police.hiddenTimer = 0;
      player.wanted = Math.max(0, player.wanted - 1);
    }
  } else {
    police.hiddenTimer = 0;
  }

  police.sirenTimer -= dt;
  if (police.sirenTimer <= 0 && wanted >= 1) {
    police.sirenTimer = 3.5;
    if (audio) audio.siren();
  }
}

function clampTurn(diff, dt) {
  const max = 2.2 * dt;
  return diff > max ? max : diff < -max ? -max : diff;
}
