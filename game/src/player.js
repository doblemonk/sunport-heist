// The player on foot: Rafi "Reef" Marlowe, a courier who owes the wrong
// people money. Walks, runs, punches and shoots; driving is the car's job
// in vehicles.js, and this file hands the player over to it.
import { PLAYER, WORLD_H, WORLD_W, clamp } from './config.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    health: PLAYER.maxHealth,
    cash: 120,
    ammo: 24,
    wanted: 0,
    inCar: null,
    punchTimer: 0,
    shootTimer: 0,
    hurtTimer: 0,
    moving: false,
    busted: 0,
  };
}

export function updatePlayerOnFoot(player, input, world, dt, moveVec) {
  // moveVec, when given, is already rotated into world space (camera
  // relative); otherwise the raw WASD vector is used as-is.
  const move = moveVec || input.move();
  const speed = input.run() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  player.moving = move.x !== 0 || move.y !== 0;
  if (player.moving) {
    player.angle = Math.atan2(move.y, move.x);
    const next = world.moveWithCollision(player.x, player.y, move.x * speed * dt, move.y * speed * dt, PLAYER.radius);
    player.x = next.x;
    player.y = next.y;
  }
  player.x = clamp(player.x, 20, WORLD_W - 20);
  player.y = clamp(player.y, 20, WORLD_H - 20);
  if (player.punchTimer > 0) player.punchTimer -= dt;
  if (player.shootTimer > 0) player.shootTimer -= dt;
  if (player.hurtTimer > 0) player.hurtTimer -= dt;

  // Punching and shooting are handled by main.js, which owns the one-shot
  // action queue; this file only moves the player and cools the timers down.
  return { moved: player.moving };
}

export function hurtPlayer(player, amount) {
  if (player.hurtTimer > 0) return false;
  player.health = Math.max(0, player.health - amount);
  player.hurtTimer = 0.6;
  return true;
}
