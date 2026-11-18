// Sunport Heist — shared tuning and city constants.
// Every number the rest of the game reads lives here, so balancing the
// chase, the traffic and the missions means editing one file.
export const WORLD_W = 3600;
export const WORLD_H = 2600;
export const ROAD_W = 120;
export const ROAD_HALF = ROAD_W / 2;

// Road centrelines. The city is a grid; blocks between roads hold buildings.
export const ROAD_X = [350, 850, 1350, 1850, 2350, 2850];
export const ROAD_Y = [300, 750, 1200, 1650, 2100];

export const PLAYER = {
  walkSpeed: 230,
  runSpeed: 330,
  radius: 14,
  maxHealth: 100,
  punchDamage: 25,
  punchRange: 36,
  punchCooldown: 0.35,
};

export const CAR = {
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 180,
  turnRate: 2.6,
  radius: 20,
};

export const WANTED = {
  max: 5,
  decayDelay: 8,
  decayStep: 5,
  stealGain: 1,
  assaultGain: 1,
  killGain: 2,
};

export const DISTRICTS = [
  { name: 'Palma Beach', x0: 0, y0: 0, x1: 620, y1: 2600, ground: '#e8c98a', label: '#b98d4f' },
  { name: 'Downtown Solmar', x0: 620, y0: 0, x1: 2100, y1: 1350, ground: '#9aa38f', label: '#5c6656' },
  { name: 'Old Docks', x0: 2100, y0: 1350, x1: 3600, y1: 2600, ground: '#8d8578', label: '#5f584c' },
  { name: 'Marina Hills', x0: 620, y0: 1350, x1: 2100, y1: 2600, ground: '#a8b08a', label: '#6d7a52' },
  { name: 'North Suburbs', x0: 2100, y0: 0, x1: 3600, y1: 1350, ground: '#a3b18a', label: '#67784f' },
];

export const CAR_COLORS = [
  '#d94f3d', '#3d7bd9', '#e8b93c', '#4fb06a', '#8a5fd0',
  '#e8e4da', '#2f3542', '#e07b39', '#39c0c8', '#c83d7a',
];

export const PED_COLORS = [
  '#f2c14e', '#7ec8e3', '#e27d60', '#a3d9a5', '#d9a5e3',
  '#f4f1ea', '#e8a13c', '#6a8caf',
];

// Starting spots the game reuses for missions, parking and spawns.
export const SPOTS = {
  hideout: { x: 1350, y: 1650, label: 'Hideout' },
  beach: { x: 350, y: 1200, label: 'Palma Beach' },
  downtown: { x: 1350, y: 750, label: 'Downtown' },
  docks: { x: 2850, y: 2100, label: 'Old Docks' },
  suburbs: { x: 2350, y: 300, label: 'North Suburbs' },
  marina: { x: 850, y: 2100, label: 'Marina Hills' },
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const SAVE_KEY = 'sunport-heist.save.v1';

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
export function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
