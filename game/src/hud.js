// The HUD: cash, health, ammo, wanted stars, the clock, the district name
// and the mission objective, painted on top of the world every frame.
import { FONT, PLAYER } from './config.js';
import { districtAt } from './world.js';

export function formatClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function drawHud(ctx, game, width, height) {
  const player = game.player;
  ctx.textBaseline = 'alphabetic';
  // Top-left: cash and health.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(14, 14, 250, 86);
  ctx.fillStyle = '#4fb06a';
  ctx.font = `bold 26px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(`$${player.cash.toLocaleString('en-US')}`, 26, 44);
  ctx.fillStyle = '#e8e4da';
  ctx.font = `15px ${FONT}`;
  ctx.fillText('CASH', 26, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(26, 72, 150, 10);
  ctx.fillStyle = player.health > 40 ? '#4fb06a' : '#d94f3d';
  ctx.fillRect(26, 72, 150 * (player.health / PLAYER.maxHealth), 10);
  ctx.fillStyle = '#e8e4da';
  ctx.fillText(`HEALTH ${Math.ceil(player.health)}`, 184, 82);

  // Top-right: wanted stars and the clock.
  const stars = player.wanted;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(width - 264, 14, 250, 52);
  ctx.font = '26px ' + FONT;
  ctx.textAlign = 'right';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < stars ? '#e8b93c' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', width - 30 - i * 30, 48);
  }
  ctx.fillStyle = '#e8e4da';
  ctx.font = `bold 18px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(formatClock(game.clockMinutes), width - 250, 40);
  ctx.font = `13px ${FONT}`;
  ctx.fillText(districtAt(player.x, player.y).name, width - 250, 58);

  // Ammo and car hint, bottom-left, on two lines so nothing overlaps.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(14, height - 74, 330, 60);
  ctx.fillStyle = '#e8e4da';
  ctx.font = `bold 18px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(`AMMO ${player.ammo}`, 26, height - 50);
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = '#c9c2b4';
  ctx.fillText(player.inCar ? 'E — exit car   W/S drive   A/D steer' : 'E — steal car   J punch   K / click shoot', 26, height - 28);

  // Mission objective bar, bottom centre.
  const objective = game.objectiveText;
  if (objective) {
    ctx.font = `bold 17px ${FONT}`;
    const w = ctx.measureText(objective).width + 36;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect((width - w) / 2, height - 64, w, 34);
    ctx.fillStyle = '#e8b93c';
    ctx.textAlign = 'center';
    ctx.fillText(objective, width / 2, height - 41);
  }

  // Arrest warning.
  if (game.police.arrestProgress > 0.05) {
    ctx.fillStyle = 'rgba(217,79,61,0.85)';
    ctx.fillRect((width - 260) / 2, 90, 260, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED INCOMING — RUN!', width / 2, 113);
  }

  // Mission banner, centre-top.
  if (game.missions.bannerTimer > 0) {
    const lines = wrapText(ctx, game.missions.banner, width - 240, `bold 19px ${FONT}`);
    const h = lines.length * 26 + 24;
    ctx.fillStyle = 'rgba(20,20,30,0.82)';
    ctx.fillRect((width - Math.min(width - 200, 760)) / 2, 130, Math.min(width - 200, 760), h);
    ctx.fillStyle = '#e8b93c';
    ctx.font = `bold 19px ${FONT}`;
    ctx.textAlign = 'center';
    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, 130 + 34 + i * 26);
    });
  }

  // Story complete ribbon.
  if (game.missions.storyDone) {
    ctx.fillStyle = 'rgba(232,185,60,0.92)';
    ctx.fillRect((width - 420) / 2, height - 120, 420, 34);
    ctx.fillStyle = '#1f2937';
    ctx.font = `bold 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('DEBT PAID — SOLMAR IS YOURS, REEF', width / 2, height - 97);
  }
}

function wrapText(ctx, text, maxWidth, font) {
  ctx.font = font;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
