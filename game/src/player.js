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

export function updatePlayerOnFoot(player, input, world, dt) {
  const move = input.move();
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

export function drawPlayer(ctx, player, cam, time) {
  const x = player.x - cam.x;
  const y = player.y - cam.y;
  const bob = player.moving ? Math.sin(time * 12) * 2 : 0;
  ctx.save();
  ctx.translate(x, y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 10, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(player.angle);
  // Body: teal jacket, sun-bleached hair, outstretched punch arm when swinging.
  ctx.fillStyle = player.hurtTimer > 0 && Math.floor(time * 12) % 2 === 0 ? '#ffffff' : '#0f766e';
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c14e';
  ctx.beginPath();
  ctx.arc(4, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(8, -4, 8, 3);
  ctx.fillRect(8, 1, 8, 3);
  if (player.punchTimer > 0.2) {
    ctx.strokeStyle = '#0f766e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(26, 0);
    ctx.stroke();
  }
  ctx.restore();
  // Health ring above the head when hurt.
  if (player.health < PLAYER.maxHealth) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 18, y - 28 + bob, 36, 6);
    ctx.fillStyle = player.health > 40 ? '#4fb06a' : '#d94f3d';
    ctx.fillRect(x - 17, y - 27 + bob, 34 * (player.health / PLAYER.maxHealth), 4);
  }
}
