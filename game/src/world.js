// The city of Solmar: its road grid, its buildings, its beach and docks,
// and the collision tests that keep people and cars out of the walls.
// Drawing lives here too, because the city is one picture: ground, roads,
// blocks, roofs, the sea and the container yard.
import { DISTRICTS, ROAD_HALF, ROAD_W, ROAD_X, ROAD_Y, WORLD_H, WORLD_W, clamp } from './config.js';
import { pick, range } from './random.js';

const ROOF_COLORS = ['#c96f4a', '#7a8ba0', '#b0a284', '#8a6f9e', '#5f8a6e', '#a85f5f', '#6e7f8a'];
const CONTAINER_COLORS = ['#c94f3d', '#3d7bd9', '#e8b93c', '#4fb06a', '#8a5fd0'];

function roadAt(x, y) {
  for (const rx of ROAD_X) if (Math.abs(x - rx) < ROAD_HALF) return true;
  for (const ry of ROAD_Y) if (Math.abs(y - ry) < ROAD_HALF) return true;
  return false;
}

function onRoadX(x) {
  for (const rx of ROAD_X) if (Math.abs(x - rx) < ROAD_HALF) return rx;
  return null;
}

function onRoadY(y) {
  for (const ry of ROAD_Y) if (Math.abs(y - ry) < ROAD_HALF) return ry;
  return null;
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[1];
}

export function createWorld(random) {
  const buildings = [];
  const trees = [];
  const containers = [];
  const beachUmbrellas = [];

  // Buildings fill every block between roads, leaving a sidewalk margin.
  const xs = [0, ...ROAD_X, WORLD_W];
  const ys = [0, ...ROAD_Y, WORLD_H];
  for (let bi = 0; bi < xs.length - 1; bi += 1) {
    for (let bj = 0; bj < ys.length - 1; bj += 1) {
      const x0 = xs[bi] + ROAD_HALF + 14;
      const x1 = xs[bi + 1] - ROAD_HALF - 14;
      const y0 = ys[bj] + ROAD_HALF + 14;
      const y1 = ys[bj + 1] - ROAD_HALF - 14;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      // The beach strip stays open sand; the docks stay a container yard.
      if (x0 < 620) continue;
      if (x0 > 2400 && y0 > 1500) continue;
      const count = 1 + Math.floor(random() * 3);
      for (let k = 0; k < count; k += 1) {
        const w = range(random, 90, Math.min(220, x1 - x0));
        const h = range(random, 80, Math.min(190, y1 - y0));
        const x = range(random, x0, Math.max(x0 + 1, x1 - w));
        const y = range(random, y0, Math.max(y0 + 1, y1 - h));
        buildings.push({
          x, y, w, h,
          color: pick(random, ROOF_COLORS),
          tall: random() < 0.3,
          windows: 2 + Math.floor(random() * 4),
        });
      }
      // A tree or two per block, kept off the roads.
      for (let k = 0; k < 2; k += 1) {
        trees.push({ x: range(random, x0, x1), y: range(random, y0, y1), r: range(random, 10, 16) });
      }
    }
  }

  // Container yard in the Old Docks, kept off the roads that cross it.
  let placed = 0;
  let tries = 0;
  while (placed < 26 && tries < 200) {
    tries += 1;
    const cx = range(random, 2450, 3350);
    const cy = range(random, 1650, 2450);
    if (roadAt(cx, cy)) continue;
    containers.push({
      x: cx,
      y: cy,
      w: 110, h: 34,
      color: pick(random, CONTAINER_COLORS),
      angle: random() < 0.5 ? 0 : Math.PI / 2,
    });
    placed += 1;
  }

  // Beach umbrellas along the Palma shore.
  for (let i = 0; i < 14; i += 1) {
    beachUmbrellas.push({ x: range(random, 90, 480), y: range(random, 120, 2480) });
  }

  function collides(x, y, radius) {
    if (x < radius || y < radius || x > WORLD_W - radius || y > WORLD_H - radius) return true;
    for (const b of buildings) {
      if (x + radius > b.x && x - radius < b.x + b.w && y + radius > b.y && y - radius < b.y + b.h) return true;
    }
    for (const c of containers) {
      const hw = c.angle === 0 ? c.w / 2 : c.h / 2;
      const hh = c.angle === 0 ? c.h / 2 : c.w / 2;
      if (x + radius > c.x - hw && x - radius < c.x + hw && y + radius > c.y - hh && y - radius < c.y + hh) return true;
    }
    return false;
  }

  // Slide along a wall instead of sticking: try the full step, then each axis alone.
  function moveWithCollision(x, y, dx, dy, radius) {
    if (!collides(x + dx, y + dy, radius)) return { x: x + dx, y: y + dy, hit: false };
    if (!collides(x + dx, y, radius)) return { x: x + dx, y, hit: true };
    if (!collides(x, y + dy, radius)) return { x, y: y + dy, hit: true };
    return { x, y, hit: true };
  }

  function nearestRoadPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const rx of ROAD_X) {
      const d = Math.abs(x - rx);
      if (d < bestD) { bestD = d; best = { x: rx, y, axis: 'v' }; }
    }
    for (const ry of ROAD_Y) {
      const d = Math.abs(y - ry);
      if (d < bestD) { bestD = d; best = { x, y: ry, axis: 'h' }; }
    }
    return best;
  }

  function drawGround(ctx, cam, hour) {
    // District ground.
    for (const d of DISTRICTS) {
      ctx.fillStyle = d.ground;
      ctx.fillRect(d.x0 - cam.x, d.y0 - cam.y, d.x1 - d.x0, d.y1 - d.y0);
    }
    // The sea along the west edge, past the sand.
    ctx.fillStyle = '#3f9ec4';
    ctx.fillRect(-cam.x - 220, -cam.y, 220, WORLD_H);
    ctx.fillStyle = '#57b6d9';
    for (let y = 40; y < WORLD_H; y += 130) {
      ctx.fillRect(-cam.x - 200, y - cam.y, 170, 6);
    }
    // District labels painted on the ground.
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const d of DISTRICTS) {
      ctx.fillStyle = d.label;
      ctx.globalAlpha = 0.55;
      ctx.fillText(d.name.toUpperCase(), (d.x0 + d.x1) / 2 - cam.x, (d.y0 + d.y1) / 2 - cam.y);
      ctx.globalAlpha = 1;
    }
    // Roads.
    ctx.fillStyle = '#3a3f47';
    for (const rx of ROAD_X) ctx.fillRect(rx - ROAD_HALF - cam.x, -cam.y, ROAD_W, WORLD_H);
    for (const ry of ROAD_Y) ctx.fillRect(-cam.x, ry - ROAD_HALF - cam.y, WORLD_W, ROAD_W);
    // Centre dashes.
    ctx.fillStyle = '#e8d44f';
    for (const rx of ROAD_X) {
      for (let y = 20; y < WORLD_H; y += 90) ctx.fillRect(rx - 3 - cam.x, y - cam.y, 6, 44);
    }
    for (const ry of ROAD_Y) {
      for (let x = 20; x < WORLD_W; x += 90) ctx.fillRect(x - cam.x, ry - 3 - cam.y, 44, 6);
    }
    // Crosswalks at every intersection.
    ctx.fillStyle = '#e8e4da';
    for (const rx of ROAD_X) {
      for (const ry of ROAD_Y) {
        for (let k = -2; k <= 2; k += 1) {
          ctx.fillRect(rx + k * 18 - 6 - cam.x, ry - ROAD_HALF + 6 - cam.y, 12, 18);
          ctx.fillRect(rx + k * 18 - 6 - cam.x, ry + ROAD_HALF - 24 - cam.y, 12, 18);
        }
      }
    }
    // Beach umbrellas.
    for (const u of beachUmbrellas) {
      ctx.fillStyle = '#e8e4da';
      ctx.beginPath();
      ctx.arc(u.x - cam.x, u.y - cam.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d94f3d';
      ctx.beginPath();
      ctx.arc(u.x - cam.x, u.y - cam.y, 16, 0, Math.PI);
      ctx.fill();
    }
    // Containers.
    for (const c of containers) {
      ctx.save();
      ctx.translate(c.x - cam.x, c.y - cam.y);
      ctx.rotate(c.angle);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.strokeRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
    // Trees.
    for (const t of trees) {
      ctx.fillStyle = '#3f7a44';
      ctx.beginPath();
      ctx.arc(t.x - cam.x, t.y - cam.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5da85f';
      ctx.beginPath();
      ctx.arc(t.x - 3 - cam.x, t.y - 3 - cam.y, t.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Buildings with roofs, shade and windows.
    for (const b of buildings) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + 8 - cam.x, b.y + 10 - cam.y, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - cam.x, b.y - cam.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x - cam.x, b.y - cam.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      const cols = Math.max(1, Math.floor(b.w / 34));
      for (let i = 0; i < b.windows; i += 1) {
        const wx = b.x + 12 + (i % cols) * 34;
        const wy = b.y + 12 + Math.floor(i / cols) * 30;
        if (wx + 16 < b.x + b.w && wy + 12 < b.y + b.h) ctx.fillRect(wx - cam.x, wy - cam.y, 16, 12);
      }
      if (b.tall) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(b.x + 6 - cam.x, b.y + 6 - cam.y, b.w - 12, 10);
      }
    }
    // Night tint handled by the caller through `hour`; a warm dusk wash here.
    if (hour >= 18 || hour < 6) {
      ctx.fillStyle = 'rgba(20, 30, 80, 0.28)';
      ctx.fillRect(-cam.x, -cam.y, WORLD_W, WORLD_H);
    } else if (hour >= 16) {
      ctx.fillStyle = 'rgba(255, 140, 60, 0.10)';
      ctx.fillRect(-cam.x, -cam.y, WORLD_W, WORLD_H);
    }
  }

  return {
    buildings, trees, containers, beachUmbrellas,
    collides, moveWithCollision, nearestRoadPoint,
    roadAt, onRoadX, onRoadY, districtAt, drawGround,
  };
}

export function clampToWorld(x, y) {
  return { x: clamp(x, 20, WORLD_W - 20), y: clamp(y, 20, WORLD_H - 20) };
}
