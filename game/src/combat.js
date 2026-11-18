// Combat: fists, the pistol, bullets, and the cash and ammo a fight leaves
// behind. Bullets fly straight, stop at walls, and hurt whoever they hit;
// a punch is short range, free, and loud enough for the law to notice.
import { PLAYER, WANTED, dist } from './config.js';
import { addWanted } from './police.js';

export function createCombat() {
  return { bullets: [], pickups: [], gunshot: 0, muzzle: 0 };
}

export function tryPunch(player, peds, police, world, audio) {
  if (player.punchTimer > 0 || player.inCar) return false;
  player.punchTimer = PLAYER.punchCooldown;
  if (audio) audio.punch();
  const reach = PLAYER.punchRange + 14;
  let hit = false;
  for (const ped of peds) {
    if (ped.down) continue;
    if (dist(player.x, player.y, ped.x, ped.y) < reach) {
      ped.down = true;
      ped.downTimer = 5;
      hit = true;
    }
  }
  for (const cop of police.footCops) {
    if (dist(player.x, player.y, cop.x, cop.y) < reach) {
      cop.x += Math.cos(player.angle) * 40;
      cop.y += Math.sin(player.angle) * 40;
      hit = true;
    }
  }
  if (hit) addWanted(player, WANTED.assaultGain, police);
  return hit;
}

export function tryShoot(combat, player, aimAngle, audio) {
  if (player.shootTimer > 0 || player.inCar) return false;
  if (player.ammo <= 0) return false;
  player.ammo -= 1;
  player.shootTimer = 0.28;
  combat.muzzle = 0.08;
  combat.gunshot = 0.4;
  combat.bullets.push({
    x: player.x + Math.cos(aimAngle) * 20,
    y: player.y + Math.sin(aimAngle) * 20,
    vx: Math.cos(aimAngle) * 900,
    vy: Math.sin(aimAngle) * 900,
    life: 0.9,
  });
  if (audio) audio.shoot();
  return true;
}

export function updateCombat(combat, player, peds, police, world, dt, audio) {
  if (combat.muzzle > 0) combat.muzzle -= dt;
  if (combat.gunshot > 0) combat.gunshot -= dt;
  for (const bullet of combat.bullets) {
    if (bullet.life <= 0) continue;
    bullet.life -= dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    if (world.collides(bullet.x, bullet.y, 2)) {
      bullet.life = 0;
      continue;
    }
    for (const ped of peds) {
      if (ped.down) continue;
      if (dist(bullet.x, bullet.y, ped.x, ped.y) < 14) {
        ped.down = true;
        ped.downTimer = 8;
        bullet.life = 0;
        addWanted(player, WANTED.killGain, police);
        dropPickup(combat, ped.x, ped.y, 'cash', ped.cash);
        break;
      }
    }
    if (bullet.life <= 0) continue;
    for (const cop of police.footCops) {
      if (dist(bullet.x, bullet.y, cop.x, cop.y) < 14) {
        cop.x += bullet.vx * 0.05;
        cop.y += bullet.vy * 0.05;
        cop.down = true;
        cop.downTimer = 8;
        bullet.life = 0;
        addWanted(player, WANTED.killGain, police);
        break;
      }
    }
    if (bullet.life <= 0) continue;
    for (const car of police.copCars) {
      if (dist(bullet.x, bullet.y, car.x, car.y) < 26) {
        car.speed *= 0.6;
        bullet.life = 0;
        break;
      }
    }
  }
  combat.bullets = combat.bullets.filter((b) => b.life > 0);
  // Pickups: walk over cash or an ammo box to take it.
  for (const pickup of combat.pickups) {
    if (pickup.taken) continue;
    if (dist(player.x, player.y, pickup.x, pickup.y) < 26 && !player.inCar) {
      pickup.taken = true;
      if (pickup.kind === 'cash') {
        player.cash += pickup.amount;
        if (audio) audio.cash();
      } else {
        player.ammo += 12;
        if (audio) audio.pickup();
      }
    }
  }
  combat.pickups = combat.pickups.filter((p) => !p.taken);
}

export function dropPickup(combat, x, y, kind, amount) {
  combat.pickups.push({ x, y, kind, amount, taken: false, bob: Math.random() * 6 });
}
