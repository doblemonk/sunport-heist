// Sunport Heist — central tuning for the whole game.
// One plain object, so every system reads the same numbers: the city size,
// the districts, the cars, the wanted level, the missions and the pickups.
// Nothing here touches the scene or the network; it is only data.

export const CONFIG = {
  // Deterministic world seed. Every system that needs chance uses this
  // seed through the seeded generator in random.js, never unseeded chance.
  seed: 1337,

  // The city runs from -worldSize to +worldSize on both X and Z.
  worldSize: 420,

  // Roads form a grid this far apart, in world units.
  roadSpacing: 120,

  // Five districts that tile the whole city without overlapping.
  // North is negative Z (Z grows south), the beach is the west strip.
  districts: [
    { name: 'Palma Beach', kind: 'beach', x0: -420, z0: -420, x1: -240, z1: 420 },
    { name: 'North Suburbs', kind: 'suburbs', x0: -240, z0: -420, x1: 420, z1: -180 },
    { name: 'Downtown Solmar', kind: 'downtown', x0: -240, z0: -180, x1: 120, z1: 180 },
    { name: 'Marina Hills', kind: 'marina', x0: 120, z0: -180, x1: 420, z1: 180 },
    { name: 'Old Docks', kind: 'docks', x0: -240, z0: 180, x1: 420, z1: 420 },
  ],

  // Paint jobs for traffic and parked cars (hex colour numbers).
  carColors: [
    0xc0392b, 0x2e6fb7, 0x27ae60, 0xf1c40f, 0xecf0f1,
    0x1c1c22, 0x7f8c8d, 0xe67e22, 0x8e44ad, 0x16a085,
    0xd35400, 0x34495e, 0xbdc3c7, 0x9b59b6, 0x2ecc71,
  ],

  // On-foot movement, in metres per second.
  playerWalkSpeed: 6,
  playerRunSpeed: 10,

  // Driving feel per vehicle class. topSpeed and reverseSpeed are in
  // metres per second; acceleration and braking are metres per second
  // squared; steering is radians per second at full lock.
  carSpecs: {
    sedan: { topSpeed: 34, acceleration: 14, braking: 30, reverseSpeed: 10, steering: 1.9 },
    coupe: { topSpeed: 42, acceleration: 20, braking: 34, reverseSpeed: 11, steering: 2.2 },
    taxi: { topSpeed: 33, acceleration: 13, braking: 30, reverseSpeed: 10, steering: 1.9 },
    truck: { topSpeed: 26, acceleration: 9, braking: 22, reverseSpeed: 8, steering: 1.4 },
    cruiser: { topSpeed: 40, acceleration: 18, braking: 32, reverseSpeed: 11, steering: 2.1 },
  },

  // Wanted level. Heat is added by crimes and drains away when the
  // player stays out of trouble; standing still beside a cop gets you
  // caught. Aliases repeat the same values under the shorter names
  // other systems may use, so every reader agrees on the numbers.
  wanted: {
    maxStars: 5,
    stealCarHeat: 1,
    punchPedHeat: 1,
    hitCopHeat: 1,
    stealCar: 1,
    punchPed: 1,
    hitCop: 1,
    decaySeconds: 20,
    decayDelay: 20,
    hiddenDistance: 40,
    hideDistance: 40,
    bustedStandSeconds: 3,
    standStillSeconds: 3,
    bustedRadius: 2,
  },

  // The six story jobs, in order. timeLimit is seconds; cash is the
  // payout in dollars; ammo is the bullets handed over on completion.
  missions: [
    { name: 'First Delivery', timeLimit: 120, cash: 300, ammo: 12 },
    { name: 'Hot Wheels', timeLimit: 180, cash: 500, ammo: 12 },
    { name: 'Beach Pickup', timeLimit: 150, cash: 400, ammo: 12 },
    { name: 'Getaway Driver', timeLimit: 180, cash: 600, ammo: 12 },
    { name: 'Dock Heist', timeLimit: 240, cash: 1500, ammo: 12 },
    { name: 'The Sunport Heist', timeLimit: 300, cash: 5000, ammo: 24 },
  ],

  // How many pedestrians and traffic cars the city starts with.
  pedCount: 24,
  trafficCount: 14,

  // Street pickups: cash crates pay a random amount in this range,
  // ammo crates always give this many bullets.
  pickups: { cashMin: 25, cashMax: 100, ammo: 12 },

  // The playable day runs from morning to dusk.
  dayStartHour: 8,
  dayEndHour: 19,
};
