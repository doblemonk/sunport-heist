// The live minimap: the whole city shrunk into a corner, with the player,
// the cars, the cops and the mission marker moving on it in real time.
import { WORLD_H, WORLD_W } from './config.js';
import { missionMarker } from './missions.js';

const MAP_W = 210;
const MAP_H = 152;

export function drawMinimap(ctx, game, width, height) {
  const x0 = width - MAP_W - 14;
  const y0 = height - MAP_H - 14;
  const sx = MAP_W / WORLD_W;
  const sy = MAP_H / WORLD_H;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x0 - 4, y0 - 4, MAP_W + 8, MAP_H + 8);
  // Ground and roads.
  ctx.fillStyle = '#5c6656';
  ctx.fillRect(x0, y0, MAP_W, MAP_H);
  ctx.fillStyle = '#3a3f47';
  for (const rx of game.worldRoadX) ctx.fillRect(x0 + rx * sx - 2, y0, 4, MAP_H);
  for (const ry of game.worldRoadY) ctx.fillRect(x0, y0 + ry * sy - 2, MAP_W, 4);
  // Mission marker.
  const marker = missionMarker(game.missions, game);
  if (marker) {
    ctx.fillStyle = '#e8b93c';
    ctx.beginPath();
    ctx.arc(x0 + marker.x * sx, y0 + marker.y * sy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // Traffic and parked cars.
  ctx.fillStyle = '#e8e4da';
  for (const car of game.cars) {
    ctx.fillRect(x0 + car.x * sx - 2, y0 + car.y * sy - 2, 4, 4);
  }
  // Cops in blue.
  ctx.fillStyle = '#3d7bd9';
  for (const car of game.police.copCars) {
    ctx.fillRect(x0 + car.x * sx - 3, y0 + car.y * sy - 3, 6, 6);
  }
  for (const cop of game.police.footCops) {
    ctx.fillRect(x0 + cop.x * sx - 2, y0 + cop.y * sy - 2, 4, 4);
  }
  // The player, a white arrow pointing where they face.
  const px = x0 + game.player.x * sx;
  const py = y0 + game.player.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(game.player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // North arrow and label.
  ctx.fillStyle = '#e8e4da';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('N ↑', x0 + 6, y0 + 16);
  ctx.textAlign = 'right';
  ctx.fillText('SOLMAR', x0 + MAP_W - 6, y0 + 16);
}
