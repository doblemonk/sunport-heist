// The city of Solmar: its road grid, its buildings, its beach and docks,
// and the collision tests that keep people and cars out of the walls.
// The 3D look lives in render3d.js, which reads the data built here.
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

  return {
    buildings, trees, containers, beachUmbrellas,
    collides, moveWithCollision, nearestRoadPoint,
    roadAt, onRoadX, onRoadY, districtAt,
  };
}

export function clampToWorld(x, y) {
  return { x: clamp(x, 20, WORLD_W - 20), y: clamp(y, 20, WORLD_H - 20) };
}
