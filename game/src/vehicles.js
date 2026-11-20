import * as THREE from '../vendor/three.min.js';

// Solmar cars: low-poly bodies, cabins, cylinder wheels and headlights.
// buildCarMesh is a pure builder — traffic imports it for ambient cars
// without registering them as drivable. createVehicles owns the drivable
// list and the car the player is currently driving.

const FALLBACK_SPECS = {
  sedan: { topSpeed: 28, acceleration: 14, braking: 24, reverseSpeed: 10, steering: 1.9 },
  coupe: { topSpeed: 34, acceleration: 17, braking: 24, reverseSpeed: 10, steering: 2.1 },
  taxi: { topSpeed: 28, acceleration: 14, braking: 24, reverseSpeed: 10, steering: 1.9 },
  truck: { topSpeed: 22, acceleration: 9, braking: 18, reverseSpeed: 8, steering: 1.4 },
  cruiser: { topSpeed: 36, acceleration: 18, braking: 26, reverseSpeed: 10, steering: 2.0 },
};

const DIMS = {
  sedan: { len: 4.2, wid: 1.9, bodyH: 0.7, cabinLen: 2.1, cabinWid: 1.65 },
  coupe: { len: 4.0, wid: 1.85, bodyH: 0.62, cabinLen: 1.8, cabinWid: 1.6 },
  taxi: { len: 4.2, wid: 1.9, bodyH: 0.7, cabinLen: 2.1, cabinWid: 1.65 },
  truck: { len: 5.2, wid: 2.1, bodyH: 0.9, cabinLen: 1.4, cabinWid: 1.9 },
  cruiser: { len: 4.4, wid: 1.95, bodyH: 0.72, cabinLen: 2.1, cabinWid: 1.65 },
};

function box(w, h, d, colour, x, y, z, opts) {
  const mat = new THREE.MeshStandardMaterial({
    color: colour,
    roughness: (opts && opts.roughness !== undefined) ? opts.roughness : 0.5,
    metalness: (opts && opts.metalness !== undefined) ? opts.metalness : 0.35,
    emissive: (opts && opts.emissive !== undefined) ? opts.emissive : 0x000000,
    emissiveIntensity: (opts && opts.emissiveIntensity !== undefined) ? opts.emissiveIntensity : 1,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function buildCarMesh(kind, colour) {
  const k = DIMS[kind] ? kind : 'sedan';
  const d = DIMS[k];
  const paint = colour === undefined || colour === null ? 0x8a8f98 : colour;
  const group = new THREE.Group();

  const body = box(d.len, d.bodyH, d.wid, paint, 0, 0.55, 0);
  group.add(body);

  // Cabin sits slightly rear of centre; a truck gets a front cab and a bed.
  const cabinZ = k === 'truck' ? d.len / 2 - 0.9 : -0.25;
  const cabin = box(d.cabinLen, 0.62, d.cabinWid, 0x1a2530, 0, 1.18, cabinZ, { roughness: 0.25, metalness: 0.6 });
  group.add(cabin);
  if (k === 'truck') {
    group.add(box(2.4, 0.5, d.wid - 0.2, 0x2a2f36, -0.9, 0.95, 0, { roughness: 0.8, metalness: 0.1 }));
  }

  // Four cylinder wheels, axle along X.
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.28, 8);
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xb8bec8, roughness: 0.35, metalness: 0.7 });
  const wheelZ = d.len / 2 - 0.85;
  const wheelX = d.wid / 2 - 0.05;
  const spots = [
    [-wheelX, wheelZ], [wheelX, wheelZ],
    [-wheelX, -wheelZ], [wheelX, -wheelZ],
  ];
  for (const [wx, wz] of spots) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.copy(wheel.position);
    group.add(wheel, hub);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;

  // Headlights face local +Z (forward) and taillights face -Z.
  const lightZ = d.len / 2 + 0.01;
  group.add(box(0.34, 0.16, 0.06, 0xfff2b0, -0.55, 0.6, lightZ, { emissive: 0xffe9a0, emissiveIntensity: 1.4, roughness: 0.3 }));
  group.add(box(0.34, 0.16, 0.06, 0xfff2b0, 0.55, 0.6, lightZ, { emissive: 0xffe9a0, emissiveIntensity: 1.4, roughness: 0.3 }));
  group.add(box(0.3, 0.14, 0.06, 0xaa1111, -0.55, 0.6, -lightZ, { emissive: 0xcc0000, emissiveIntensity: 0.9, roughness: 0.3 }));
  group.add(box(0.3, 0.14, 0.06, 0xaa1111, 0.55, 0.6, -lightZ, { emissive: 0xcc0000, emissiveIntensity: 0.9, roughness: 0.3 }));

  if (k === 'taxi') {
    group.add(box(0.7, 0.18, 0.4, 0xf7c948, 0, 1.62, -0.25, { emissive: 0xcc9900, emissiveIntensity: 0.5 }));
  }
  if (k === 'cruiser') {
    group.add(box(1.1, 0.14, 0.4, 0x111111, 0, 1.56, -0.25));
    group.add(box(0.45, 0.12, 0.42, 0x2244ff, -0.28, 1.66, -0.25, { emissive: 0x2244ff, emissiveIntensity: 1.6 }));
    group.add(box(0.45, 0.12, 0.42, 0xff2222, 0.28, 1.66, -0.25, { emissive: 0xff2222, emissiveIntensity: 1.6 }));
  }

  return group;
}

function rngFloat(game) {
  const r = game && game.rng;
  if (typeof r === 'function') return r();
  if (r && typeof r.next === 'function') return r.next();
  if (r && typeof r.random === 'function') return r.random();
  if (r && typeof r.float === 'function') return r.float();
  return 0.5;
}

export function createVehicles(game) {
  const cfg = game.config || {};
  const specs = cfg.carSpecs || {};
  const colours = cfg.carColors || [0xc0392b, 0x2e6f8e, 0xe0e0e0, 0x222831, 0xf7c948, 0x7d3c98];

  function specFor(kind) {
    const base = FALLBACK_SPECS[kind] || FALLBACK_SPECS.sedan;
    const over = specs[kind] || {};
    return {
      topSpeed: over.topSpeed !== undefined ? over.topSpeed : base.topSpeed,
      acceleration: over.acceleration !== undefined ? over.acceleration : base.acceleration,
      braking: over.braking !== undefined ? over.braking : base.braking,
      reverseSpeed: over.reverseSpeed !== undefined ? over.reverseSpeed : base.reverseSpeed,
      steering: over.steering !== undefined ? over.steering : base.steering,
    };
  }

  function stealHeat() {
    const w = cfg.wanted || {};
    if (w.stealHeat !== undefined) return w.stealHeat;
    if (cfg.stealHeat !== undefined) return cfg.stealHeat;
    if (w.heatSteal !== undefined) return w.heatSteal;
    return 1;
  }

  const vehicles = {
    list: [],
    playerCar: null,

    spawn(kind, x, z, heading, colour) {
      const k = FALLBACK_SPECS[kind] ? kind : 'sedan';
      const paint = colour === undefined || colour === null
        ? colours[Math.floor(rngFloat(game) * colours.length) % colours.length]
        : colour;
      const mesh = buildCarMesh(k, paint);
      mesh.position.set(x || 0, 0, z || 0);
      mesh.rotation.y = heading || 0;
      if (game.scene) game.scene.add(mesh);
      const car = {
        kind: k,
        mesh,
        position: mesh.position,
        heading: heading || 0,
        speed: 0,
        colour: paint,
        specs: specFor(k),
      };
      vehicles.list.push(car);
      return car;
    },

    nearest(x, z, maxDist) {
      let best = null;
      let bestD = maxDist === undefined ? Infinity : maxDist;
      for (const car of vehicles.list) {
        const d = Math.hypot(car.position.x - x, car.position.z - z);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      return best;
    },

    tryEnterOrExit() {
      const player = game.player;
      if (!player) return false;
      if (vehicles.playerCar) {
        const car = vehicles.playerCar;
        // Step out to the car's right side, clear of the body.
        const rx = Math.cos(car.heading);
        const rz = -Math.sin(car.heading);
        player.position.set(car.position.x + rx * 2.4, 0, car.position.z + rz * 2.4);
        player.heading = car.heading;
        vehicles.playerCar = null;
        player.exitCar();
        if (game.audio && game.audio.engine) game.audio.engine(0);
        return true;
      }
      const car = vehicles.nearest(player.position.x, player.position.z, 3.5);
      if (!car) return false;
      vehicles.playerCar = car;
      player.enterCar(car);
      if (game.police && game.police.addHeat) game.police.addHeat(stealHeat());
      if (game.message) game.message('Car taken — the heat is on!');
      return true;
    },

    update(dt) {
      const car = vehicles.playerCar;
      if (!car) {
        if (game.audio && game.audio.engine) game.audio.engine(0);
        return;
      }
      if (game.state && game.state !== 'playing') return;
      const input = game.input;
      if (!input) return;
      const down = (code) => (input.down ? input.down(code) : false);
      const spec = car.specs;

      const accelIn = down('KeyW') || down('ArrowUp');
      const brakeIn = down('KeyS') || down('ArrowDown');
      const steerIn = (down('KeyA') || down('ArrowLeft') ? 1 : 0) - (down('KeyD') || down('ArrowRight') ? 1 : 0);

      if (accelIn) {
        car.speed += spec.acceleration * dt;
      } else if (brakeIn) {
        if (car.speed > 0.5) car.speed -= spec.braking * dt;
        else car.speed -= spec.acceleration * 0.7 * dt;
      } else {
        // Rolling drag plus a gentle stop when no pedal is pressed.
        car.speed -= car.speed * 0.9 * dt;
        if (Math.abs(car.speed) < 0.15) car.speed = 0;
      }
      car.speed = Math.max(-spec.reverseSpeed, Math.min(spec.topSpeed, car.speed));

      if (steerIn !== 0 && Math.abs(car.speed) > 0.2) {
        const grip = Math.min(1, Math.abs(car.speed) / 9);
        car.heading += steerIn * spec.steering * grip * dt * (car.speed >= 0 ? 1 : -1);
      }

      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const nx = car.position.x + fx * car.speed * dt;
      const nz = car.position.z + fz * car.speed * dt;
      const world = game.world;
      if (world && world.isBlocked) {
        if (!world.isBlocked(nx, nz, 1.1)) {
          car.position.x = nx;
          car.position.z = nz;
        } else if (!world.isBlocked(car.position.x + fx * car.speed * dt, car.position.z, 1.1)) {
          // Slide along the wall on the X axis only.
          car.position.x += fx * car.speed * dt;
          car.speed *= 0.4;
        } else if (!world.isBlocked(car.position.x, car.position.z + fz * car.speed * dt, 1.1)) {
          car.position.z += fz * car.speed * dt;
          car.speed *= 0.4;
        } else {
          car.speed = 0;
        }
      } else {
        car.position.x = nx;
        car.position.z = nz;
      }

      if (world && world.bounds) {
        const b = world.bounds;
        car.position.x = Math.max(b.minX, Math.min(b.maxX, car.position.x));
        car.position.z = Math.max(b.minZ, Math.min(b.maxZ, car.position.z));
      }

      car.mesh.rotation.y = car.heading;
      const wheels = car.mesh.userData && car.mesh.userData.wheels;
      if (wheels) {
        for (const w of wheels) w.rotation.x += (car.speed * dt) / 0.36;
      }

      if (game.audio && game.audio.engine) {
        game.audio.engine(Math.min(1, Math.abs(car.speed) / spec.topSpeed) * 0.9);
      }
    },
  };

  // Parked drivable cars at game start, so the player can walk up and
  // steal one immediately: two near each of the hideout, downtown,
  // beach, suburbs and docks, snapped onto the nearest road. No gold
  // coupe here — missions own that car.
  const parkedKinds = ['sedan', 'coupe', 'taxi'];
  const parkedAnchors = [
    { x: 12, z: 8 }, { x: -14, z: -10 },       // hideout
    { x: 120, z: 132 }, { x: 96, z: 108 },    // downtown
    { x: -348, z: 24 }, { x: -336, z: -36 },  // beach
    { x: 132, z: -288 }, { x: 108, z: -312 }, // suburbs
    { x: 12, z: 288 }, { x: -24, z: 312 },    // docks
  ];
  for (const a of parkedAnchors) {
    const jx = a.x + (rngFloat(game) - 0.5) * 24;
    const jz = a.z + (rngFloat(game) - 0.5) * 24;
    let px = jx;
    let pz = jz;
    let heading = rngFloat(game) * Math.PI * 2;
    if (game.world && game.world.nearestRoadPoint) {
      const p = game.world.nearestRoadPoint(jx, jz);
      if (p) {
        px = p.x;
        pz = p.z;
        heading = p.heading;
      }
    }
    const kind = parkedKinds[Math.floor(rngFloat(game) * parkedKinds.length) % parkedKinds.length];
    const colour = colours[Math.floor(rngFloat(game) * colours.length) % colours.length];
    vehicles.spawn(kind, px, pz, heading, colour);
  }

  return vehicles;
}
