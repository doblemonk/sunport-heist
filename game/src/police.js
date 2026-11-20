// police.js — wanted level, cruisers and foot cops for Sunport Heist.
// The wanted level lives here and is the single source of truth; every
// frame update() copies it onto game.wanted so the HUD and other systems
// always read the same number.

export function createPolice(game) {
  const THREE = game.THREE;
  const cfg = (game.config && game.config.wanted) || {};
  const MAX_STARS = cfg.maxStars || 5;
  const HEAT_STEAL = cfg.heatSteal || 1;
  const HEAT_PUNCH = cfg.heatPunchPed || 1;
  const HEAT_HIT_COP = cfg.heatHitCop || 1;
  const DECAY_SECONDS = cfg.decaySeconds || 20;
  const HIDDEN_DIST = cfg.hiddenDistance || 40;
  const BUSTED_SECONDS = cfg.bustedSeconds || 3;
  const BUSTED_RADIUS = cfg.bustedRadius || 2;

  // How many cruisers and foot cops each wanted level fields.
  // index 0 is wanted 1, index 4 is wanted 5.
  const ROSTER = [
    { cruisers: 1, cops: 1 },
    { cruisers: 1, cops: 2 },
    { cruisers: 2, cops: 2 },
    { cruisers: 3, cops: 3 },
    { cruisers: 3, cops: 3 },
  ];

  const police = {
    wanted: 0,
    cruisers: [],
    cops: [],
    addHeat,
    clearHeat,
    damageCop,
    update,
  };

  let decayTimer = 0;
  let sirenOn = false;
  let stillTimer = 0;
  let lastPlayerX = null;
  let lastPlayerZ = null;

  // Seeded randomness only: never Math.random in game code.
  function rand() {
    if (typeof game.rng === 'function') return game.rng();
    if (game.rng && typeof game.rng.next === 'function') return game.rng.next();
    if (game.rng && typeof game.rng.random === 'function') return game.rng.random();
    return 0.5;
  }
  function randRange(a, b) {
    return a + rand() * (b - a);
  }
  function pick(arr) {
    return arr[Math.floor(rand() * arr.length)];
  }

  function playerPos() {
    return game.player && game.player.position;
  }

  function setSiren(on) {
    if (on === sirenOn) return;
    sirenOn = on;
    if (game.audio && game.audio.siren) game.audio.siren(on);
  }

  function addHeat(n) {
    if (n <= 0) return;
    const before = police.wanted;
    police.wanted = Math.min(MAX_STARS, police.wanted + n);
    decayTimer = 0;
    if (police.wanted !== before && game.events) {
      game.events.emit('wantedChanged', { wanted: police.wanted });
    }
    if (police.wanted >= 1) setSiren(true);
  }

  function clearHeat() {
    police.wanted = 0;
    decayTimer = 0;
    setSiren(false);
    if (game.events) game.events.emit('wantedChanged', { wanted: 0 });
  }

  function damageCop(cop, n) {
    if (!cop || cop.falling) return;
    cop.health -= n;
    if (cop.health <= 0) {
      cop.falling = true;
      cop.fallTimer = 4;
      // Tip the cop over so the fall reads clearly on screen.
      if (cop.mesh) cop.mesh.rotation.z = Math.PI / 2;
      if (game.message) game.message('Cop down!');
    }
  }

  // --- spawning ----------------------------------------------------------

  function spawnCruiserNearPlayer() {
    const p = playerPos();
    if (!p) return null;
    const angle = randRange(0, Math.PI * 2);
    const dist = randRange(28, 45);
    let x = p.x + Math.sin(angle) * dist;
    let z = p.z + Math.cos(angle) * dist;
    let heading = 0;
    if (game.world && game.world.nearestRoadPoint) {
      const road = game.world.nearestRoadPoint(x, z);
      if (road) {
        x = road.x;
        z = road.z;
        heading = road.heading || 0;
      }
    }
    const colours = [0x1e3a8a, 0x111827, 0xe5e7eb];
    const colour = pick(colours);
    let vehicle = null;
    if (game.vehicles && game.vehicles.spawn) {
      vehicle = game.vehicles.spawn('cruiser', x, z, heading, colour);
    }
    if (!vehicle) return null;
    const cruiser = {
      vehicle,
      speed: 0,
      ramTimer: 0,
      wobble: randRange(0, Math.PI * 2),
    };
    police.cruisers.push(cruiser);
    return cruiser;
  }

  function removeCruiser(cruiser) {
    const i = police.cruisers.indexOf(cruiser);
    if (i >= 0) police.cruisers.splice(i, 1);
    const v = cruiser.vehicle;
    if (v) {
      if (game.vehicles && typeof game.vehicles.despawn === 'function') {
        game.vehicles.despawn(v);
      } else if (v.mesh && game.scene) {
        game.scene.remove(v.mesh);
      }
    }
  }

  function buildCopMesh() {
    const group = new THREE.Group();
    const navy = new THREE.MeshStandardMaterial({ color: 0x1e3a8a });
    const dark = new THREE.MeshStandardMaterial({ color: 0x111827 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc68642 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.32), navy);
    body.position.y = 1.05;
    group.add(body);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 0.36), dark);
    vest.position.y = 1.15;
    group.add(vest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
    head.position.y = 1.68;
    group.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 10), dark);
    cap.position.y = 1.86;
    group.add(cap);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xfacc15 }));
    badge.position.set(0.15, 1.25, 0.18);
    group.add(badge);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), dark);
    legL.position.set(-0.14, 0.35, 0);
    group.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.14;
    group.add(legR);
    return group;
  }

  function spawnFootCop() {
    const p = playerPos();
    if (!p) return null;
    const angle = randRange(0, Math.PI * 2);
    const dist = randRange(14, 24);
    let x = p.x + Math.sin(angle) * dist;
    let z = p.z + Math.cos(angle) * dist;
    if (game.world && game.world.isBlocked && game.world.isBlocked(x, z, 1)) {
      x = p.x + Math.sin(angle + Math.PI) * dist;
      z = p.z + Math.cos(angle + Math.PI) * dist;
    }
    const mesh = buildCopMesh();
    mesh.position.set(x, 0, z);
    if (game.scene) game.scene.add(mesh);
    const cop = { mesh, health: 100, falling: false, fallTimer: 0, speed: randRange(4.2, 5.0) };
    police.cops.push(cop);
    return cop;
  }

  function removeCop(cop) {
    const i = police.cops.indexOf(cop);
    if (i >= 0) police.cops.splice(i, 1);
    if (cop.mesh && game.scene) game.scene.remove(cop.mesh);
  }

  function syncRoster() {
    const want = police.wanted <= 0 ? { cruisers: 0, cops: 0 } : ROSTER[police.wanted - 1];
    while (police.cruisers.length < want.cruisers) {
      if (!spawnCruiserNearPlayer()) break;
    }
    while (police.cruisers.length > want.cruisers) {
      removeCruiser(police.cruisers[police.cruisers.length - 1]);
    }
    while (police.cops.length < want.cops) {
      if (!spawnFootCop()) break;
    }
    while (police.cops.length > want.cops) {
      removeCop(police.cops[police.cops.length - 1]);
    }
  }

  // --- per-frame behaviour ------------------------------------------------

  function angleTowards(from, to) {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function updateCruiser(cruiser, dt) {
    const p = playerPos();
    const v = cruiser.vehicle;
    if (!p || !v) return;
    const pos = v.position || (v.mesh && v.mesh.position);
    if (!pos) return;
    const dx = p.x - pos.x;
    const dz = p.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    let heading = v.heading !== undefined ? v.heading : targetHeading;
    const turn = angleTowards(heading, targetHeading);
    const maxTurn = 2.2 * dt;
    heading += Math.max(-maxTurn, Math.min(maxTurn, turn));
    // Ease off when nearly head-on to the player so the ram lands.
    const targetSpeed = dist > 6 ? 16 : 10;
    cruiser.speed += (targetSpeed - cruiser.speed) * Math.min(1, dt * 1.5);
    const nx = pos.x + Math.sin(heading) * cruiser.speed * dt;
    const nz = pos.z + Math.cos(heading) * cruiser.speed * dt;
    if (game.world && game.world.isBlocked && game.world.isBlocked(nx, nz, 1.6)) {
      // Blocked ahead: swing around instead of grinding into the wall.
      heading += 1.6 * dt;
      cruiser.speed *= 0.5;
    } else {
      pos.x = nx;
      pos.z = nz;
    }
    v.heading = heading;
    if (v.mesh) {
      v.mesh.position.set(pos.x, 0, pos.z);
      v.mesh.rotation.y = heading;
    }
    // Ram: on contact, hurt the player and shove their car.
    cruiser.ramTimer -= dt;
    if (dist < 3.2 && cruiser.ramTimer <= 0) {
      cruiser.ramTimer = 1;
      if (game.player && game.player.takeDamage) game.player.takeDamage(6);
      const car = game.player && game.player.car;
      if (car) {
        const cpos = car.position || (car.mesh && car.mesh.position);
        if (cpos) {
          const push = 2.5;
          cpos.x += Math.sin(heading) * push;
          cpos.z += Math.cos(heading) * push;
          if (car.mesh) car.mesh.position.set(cpos.x, 0, cpos.z);
        }
      }
      if (game.audio && game.audio.punch) game.audio.punch();
    }
  }

  function updateFootCop(cop, dt) {
    const p = playerPos();
    if (!p) return;
    if (cop.falling) {
      cop.fallTimer -= dt;
      if (cop.fallTimer <= 0) removeCop(cop);
      return;
    }
    const dx = p.x - cop.mesh.position.x;
    const dz = p.z - cop.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.4) {
      const step = cop.speed * dt;
      const nx = cop.mesh.position.x + (dx / dist) * step;
      const nz = cop.mesh.position.z + (dz / dist) * step;
      if (!game.world || !game.world.isBlocked || !game.world.isBlocked(nx, nz, 0.6)) {
        cop.mesh.position.x = nx;
        cop.mesh.position.z = nz;
      }
      cop.mesh.rotation.y = Math.atan2(dx, dz);
      // Simple leg swing so the chase reads as running.
      const swing = Math.sin((game.time || 0) * 10) * 0.4;
      if (cop.mesh.children[5]) cop.mesh.children[5].rotation.x = swing;
      if (cop.mesh.children[6]) cop.mesh.children[6].rotation.x = -swing;
    }
  }

  function update(dt) {
    // The wanted level is owned here; publish it every frame.
    game.wanted = police.wanted;
    setSiren(police.wanted >= 1);

    if (police.wanted <= 0) {
      syncRoster();
      stillTimer = 0;
      lastPlayerX = null;
      lastPlayerZ = null;
      return;
    }

    syncRoster();

    const p = playerPos();
    if (!p) return;

    for (let i = police.cruisers.length - 1; i >= 0; i--) {
      updateCruiser(police.cruisers[i], dt);
    }
    for (let i = police.cops.length - 1; i >= 0; i--) {
      updateFootCop(police.cops[i], dt);
    }

    // BUSTED: a foot cop close to a player who has barely moved.
    if (lastPlayerX === null) {
      lastPlayerX = p.x;
      lastPlayerZ = p.z;
      stillTimer = 0;
    } else {
      const moved = Math.hypot(p.x - lastPlayerX, p.z - lastPlayerZ);
      if (moved < 0.4) {
        stillTimer += dt;
      } else {
        stillTimer = 0;
        lastPlayerX = p.x;
        lastPlayerZ = p.z;
      }
    }
    if (stillTimer >= BUSTED_SECONDS) {
      for (const cop of police.cops) {
        if (cop.falling) continue;
        const d = Math.hypot(cop.mesh.position.x - p.x, cop.mesh.position.z - p.z);
        if (d <= BUSTED_RADIUS) {
          clearHeat();
          if (game.audio && game.audio.busted) game.audio.busted();
          if (game.events) game.events.emit('busted', {});
          if (game.setState) game.setState('busted');
          stillTimer = 0;
          return;
        }
      }
    }

    // Heat decay: no cop within the hidden distance for long enough.
    let nearest = Infinity;
    for (const c of police.cruisers) {
      const pos = c.vehicle && (c.vehicle.position || (c.vehicle.mesh && c.vehicle.mesh.position));
      if (pos) nearest = Math.min(nearest, Math.hypot(pos.x - p.x, pos.z - p.z));
    }
    for (const cop of police.cops) {
      if (cop.falling) continue;
      nearest = Math.min(nearest, Math.hypot(cop.mesh.position.x - p.x, cop.mesh.position.z - p.z));
    }
    if (nearest > HIDDEN_DIST) {
      decayTimer += dt;
      if (decayTimer >= DECAY_SECONDS) {
        decayTimer = 0;
        police.wanted = Math.max(0, police.wanted - 1);
        if (game.events) game.events.emit('wantedChanged', { wanted: police.wanted });
      }
    } else {
      decayTimer = 0;
    }
  }

  // Expose the heat constants other systems use for crimes, so the numbers
  // stay in one place.
  police.HEAT_STEAL = HEAT_STEAL;
  police.HEAT_PUNCH = HEAT_PUNCH;
  police.HEAT_HIT_COP = HEAT_HIT_COP;

  return police;
}
