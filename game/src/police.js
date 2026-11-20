// Sunport Heist — police: the wanted level, cruisers, foot cops, arrests, heat decay.
// The police module owns the wanted level and publishes it onto the game every frame.

export function createPolice(game) {
  const THREE = game.THREE;
  const config = game.config || {};
  const wantedConfig = config.wanted || {};

  const maxStars = wantedConfig.maxStars ?? 5;
  const heatSteal = wantedConfig.stealCarHeat ?? wantedConfig.stealCar ?? 1;
  const heatPunch = wantedConfig.punchPedHeat ?? wantedConfig.punchPed ?? 1;
  const heatHitCop = wantedConfig.hitCopHeat ?? wantedConfig.hitCop ?? 1;
  const decaySeconds = wantedConfig.decaySeconds ?? wantedConfig.decayDelay ?? 20;
  const hiddenDistance = wantedConfig.hiddenDistance ?? wantedConfig.hideDistance ?? 40;
  const arrestSeconds = wantedConfig.bustedStandSeconds ?? wantedConfig.standStillSeconds ?? 3;
  const arrestRadius = wantedConfig.bustedRadius ?? 2;

  // Seeded random source; fall back to a constant one half when it is missing.
  const rng = game.rng || null;
  function rand() {
    if (rng && typeof rng.next === 'function') return rng.next();
    return 0.5;
  }
  function randRange(min, max) {
    if (rng && typeof rng.range === 'function') return rng.range(min, max);
    return min + (max - min) * 0.5;
  }
  function randPick(list) {
    if (rng && typeof rng.pick === 'function') return rng.pick(list);
    return list[Math.floor(rand() * list.length)];
  }

  function wrapAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  function distanceToPlayer(position) {
    const player = game.player;
    if (!player || !position) return Infinity;
    const dx = player.position.x - position.x;
    const dz = player.position.z - position.z;
    return Math.hypot(dx, dz);
  }

  function emitWantedChanged() {
    if (game.events && typeof game.events.emit === 'function') {
      game.events.emit('wantedChanged', { wanted });
    }
  }

  function setSiren(on) {
    if (game.audio && typeof game.audio.siren === 'function') {
      game.audio.siren(on);
    }
  }

  // How many cruisers and foot cops each wanted level fields: [cruisers, cops].
  const ROSTER = [
    [0, 0],
    [1, 1],
    [1, 2],
    [2, 2],
    [3, 3],
    [3, 3],
  ];

  const CRUISER_COLORS = [0x1e3a8a, 0x111111, 0xf5f5f0];

  let wanted = 0;
  let decayTimer = 0;
  let stillTimer = 0;
  let lastX = null;
  let lastZ = null;

  const cruisers = [];
  const cops = [];

  function syncWanted() {
    police.wanted = wanted;
    game.wanted = wanted;
  }

  function addHeat(stars) {
    const before = wanted;
    wanted = Math.min(maxStars, wanted + (stars || 0));
    decayTimer = 0;
    syncWanted();
    if (wanted !== before) emitWantedChanged();
    if (wanted >= 1) setSiren(true);
  }

  function clearHeat() {
    wanted = 0;
    decayTimer = 0;
    syncWanted();
    setSiren(false);
    emitWantedChanged();
  }

  function damageCop(cop, damage) {
    if (!cop || cop.falling) return;
    cop.health -= damage;
    if (cop.health <= 0) {
      cop.falling = true;
      cop.fallTimer = 4;
      if (cop.mesh) cop.mesh.rotation.z = Math.PI / 2;
      if (typeof game.message === 'function') game.message('Cop down!');
    }
  }

  function buildCopMesh() {
    const navy = new THREE.MeshLambertMaterial({ color: 0x1e3a6e });
    const dark = new THREE.MeshLambertMaterial({ color: 0x141428 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    const badge = new THREE.MeshLambertMaterial({ color: 0xffd700 });

    const mesh = new THREE.Group();

    function makeLeg(side) {
      const pivot = new THREE.Group();
      pivot.position.set(0.13 * side, 0.52, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.16), dark);
      leg.position.y = -0.26;
      pivot.add(leg);
      return pivot;
    }

    function makeArm(side) {
      const pivot = new THREE.Group();
      pivot.position.set(0.32 * side, 1.08, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), navy);
      arm.position.y = -0.25;
      pivot.add(arm);
      return pivot;
    }

    const legL = makeLeg(-1);
    const legR = makeLeg(1);
    const armL = makeArm(-1);
    const armR = makeArm(1);
    mesh.add(legL);
    mesh.add(legR);
    mesh.add(armL);
    mesh.add(armR);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.6, 0.28), navy);
    body.position.y = 0.82;
    mesh.add(body);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.36, 0.32), dark);
    vest.position.y = 0.88;
    mesh.add(vest);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), skin);
    head.position.y = 1.28;
    mesh.add(head);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), dark);
    cap.position.y = 1.45;
    mesh.add(cap);

    const badgeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), badge);
    badgeMesh.position.set(-0.14, 0.96, 0.17);
    mesh.add(badgeMesh);

    mesh.userData.legL = legL;
    mesh.userData.legR = legR;
    mesh.userData.armL = armL;
    mesh.userData.armR = armR;
    mesh.userData.swing = 0;
    return mesh;
  }

  function spawnCop() {
    const player = game.player;
    if (!player || !game.scene) return;
    const angle = randRange(0, Math.PI * 2);
    const dist = randRange(14, 24);
    let x = player.position.x + Math.sin(angle) * dist;
    let z = player.position.z + Math.cos(angle) * dist;
    if (game.world && typeof game.world.isBlocked === 'function' && game.world.isBlocked(x, z, 1)) {
      x = player.position.x - Math.sin(angle) * dist;
      z = player.position.z - Math.cos(angle) * dist;
    }
    const mesh = buildCopMesh();
    mesh.position.set(x, 0, z);
    mesh.rotation.y = randRange(0, Math.PI * 2);
    game.scene.add(mesh);
    cops.push({
      mesh,
      health: 100,
      falling: false,
      fallTimer: 0,
      speed: randRange(4.2, 5.0),
    });
  }

  function spawnCruiser() {
    const player = game.player;
    if (!player || !game.vehicles || typeof game.vehicles.spawn !== 'function') return false;
    const angle = randRange(0, Math.PI * 2);
    const dist = randRange(28, 45);
    let x = player.position.x + Math.sin(angle) * dist;
    let z = player.position.z + Math.cos(angle) * dist;
    let heading = angle;
    if (game.world && typeof game.world.nearestRoadPoint === 'function') {
      const road = game.world.nearestRoadPoint(x, z);
      if (road) {
        x = road.x;
        z = road.z;
        heading = road.heading;
      }
    }
    const colour = randPick(CRUISER_COLORS);
    let vehicle = null;
    try {
      vehicle = game.vehicles.spawn('cruiser', x, z, heading, colour);
    } catch (err) {
      vehicle = null;
    }
    if (!vehicle) return false;
    cruisers.push({
      vehicle,
      speed: 0,
      ramTimer: 0,
      wobble: randRange(0, Math.PI * 2),
    });
    return true;
  }

  function removeCruiser(cruiser) {
    const vehicle = cruiser.vehicle;
    if (!vehicle) return;
    if (game.vehicles && typeof game.vehicles.despawn === 'function') {
      try {
        game.vehicles.despawn(vehicle);
      } catch (err) {
        // Fall through to removing the mesh directly.
        if (game.scene && vehicle.mesh) game.scene.remove(vehicle.mesh);
      }
      return;
    }
    if (game.scene && vehicle.mesh) game.scene.remove(vehicle.mesh);
    if (game.vehicles && Array.isArray(game.vehicles.list)) {
      const index = game.vehicles.list.indexOf(vehicle);
      if (index >= 0) game.vehicles.list.splice(index, 1);
    }
  }

  function removeCop(cop) {
    if (game.scene && cop.mesh) game.scene.remove(cop.mesh);
  }

  function syncRoster() {
    const target = ROSTER[Math.max(0, Math.min(maxStars, wanted))] || [0, 0];
    while (cruisers.length < target[0]) {
      if (!spawnCruiser()) break;
    }
    while (cruisers.length > target[0]) {
      removeCruiser(cruisers.pop());
    }
    while (cops.length < target[1]) spawnCop();
    while (cops.length > target[1]) {
      removeCop(cops.pop());
    }
  }

  function updateCruisers(dt) {
    const player = game.player;
    if (!player) return;
    const px = player.position.x;
    const pz = player.position.z;
    const time = game.time || 0;
    for (const cruiser of cruisers) {
      const vehicle = cruiser.vehicle;
      if (!vehicle || !vehicle.position) continue;
      const vx = vehicle.position.x;
      const vz = vehicle.position.z;
      const dx = px - vx;
      const dz = pz - vz;
      const dist = Math.hypot(dx, dz) || 0.001;

      let desired = Math.atan2(dx, dz) + Math.sin(time * 1.5 + cruiser.wobble) * 0.1;
      let turn = wrapAngle(desired - vehicle.heading);
      const maxTurn = 2.2 * dt;
      turn = Math.max(-maxTurn, Math.min(maxTurn, turn));
      vehicle.heading = wrapAngle(vehicle.heading + turn);

      const targetSpeed = dist > 12 ? 16 : 10;
      cruiser.speed += (targetSpeed - cruiser.speed) * Math.min(1, dt * 2);

      const aheadX = vehicle.position.x + Math.sin(vehicle.heading) * 4;
      const aheadZ = vehicle.position.z + Math.cos(vehicle.heading) * 4;
      if (game.world && typeof game.world.isBlocked === 'function' && game.world.isBlocked(aheadX, aheadZ, 2)) {
        vehicle.heading = wrapAngle(vehicle.heading + Math.PI);
        cruiser.speed *= 0.5;
      }

      vehicle.position.x += Math.sin(vehicle.heading) * cruiser.speed * dt;
      vehicle.position.z += Math.cos(vehicle.heading) * cruiser.speed * dt;
      vehicle.speed = cruiser.speed;
      if (vehicle.mesh) vehicle.mesh.rotation.y = vehicle.heading;

      cruiser.ramTimer -= dt;
      const ndx = px - vehicle.position.x;
      const ndz = pz - vehicle.position.z;
      if (Math.hypot(ndx, ndz) < 3.2 && cruiser.ramTimer <= 0) {
        cruiser.ramTimer = 1;
        if (typeof player.takeDamage === 'function') player.takeDamage(6);
        const car = player.car;
        if (car && car.position) {
          car.position.x += Math.sin(car.heading) * 2.5;
          car.position.z += Math.cos(car.heading) * 2.5;
        }
        if (game.audio && typeof game.audio.punch === 'function') game.audio.punch();
      }
    }
  }

  function updateCops(dt) {
    const player = game.player;
    if (!player) return;
    const px = player.position.x;
    const pz = player.position.z;
    for (let i = cops.length - 1; i >= 0; i--) {
      const cop = cops[i];
      if (cop.falling) {
        cop.fallTimer -= dt;
        if (cop.fallTimer <= 0) {
          removeCop(cop);
          cops.splice(i, 1);
        }
        continue;
      }
      const mx = cop.mesh.position.x;
      const mz = cop.mesh.position.z;
      const dx = px - mx;
      const dz = pz - mz;
      const heading = Math.atan2(dx, dz);
      cop.mesh.rotation.y = heading;
      cop.mesh.position.x += Math.sin(heading) * cop.speed * dt;
      cop.mesh.position.z += Math.cos(heading) * cop.speed * dt;
      const data = cop.mesh.userData || {};
      data.swing = (data.swing || 0) + dt * cop.speed * 2.2;
      const swing = Math.sin(data.swing) * 0.6;
      if (data.legL) data.legL.rotation.x = swing;
      if (data.legR) data.legR.rotation.x = -swing;
      if (data.armL) data.armL.rotation.x = -swing * 0.8;
      if (data.armR) data.armR.rotation.x = swing * 0.8;
    }
  }

  function update(dt) {
    dt = dt || 0;
    syncWanted();
    if (game.state && game.state !== 'playing') return;
    setSiren(wanted >= 1);
    syncRoster();

    const player = game.player;
    if (wanted === 0) {
      stillTimer = 0;
      decayTimer = 0;
      if (player) {
        lastX = player.position.x;
        lastZ = player.position.z;
      }
      return;
    }
    if (!player) return;

    updateCruisers(dt);
    updateCops(dt);

    // Arrest: standing almost still next to a standing cop for long enough.
    const px = player.position.x;
    const pz = player.position.z;
    if (lastX === null || lastZ === null) {
      lastX = px;
      lastZ = pz;
    }
    const moved = Math.hypot(px - lastX, pz - lastZ);
    if (moved < 0.4) {
      stillTimer += dt;
    } else {
      stillTimer = 0;
      lastX = px;
      lastZ = pz;
    }
    if (stillTimer >= arrestSeconds) {
      let nearCop = false;
      for (const cop of cops) {
        if (cop.falling) continue;
        if (Math.hypot(cop.mesh.position.x - px, cop.mesh.position.z - pz) <= arrestRadius) {
          nearCop = true;
          break;
        }
      }
      if (nearCop) {
        clearHeat();
        if (game.audio && typeof game.audio.busted === 'function') game.audio.busted();
        if (game.events && typeof game.events.emit === 'function') game.events.emit('busted');
        if (typeof game.setState === 'function') game.setState('busted');
        return;
      }
    }

    // Heat decay: no police nearby for long enough drops one star.
    let nearest = Infinity;
    for (const cruiser of cruisers) {
      if (cruiser.vehicle && cruiser.vehicle.position) {
        nearest = Math.min(nearest, distanceToPlayer(cruiser.vehicle.position));
      }
    }
    for (const cop of cops) {
      if (!cop.falling && cop.mesh) {
        nearest = Math.min(nearest, distanceToPlayer(cop.mesh.position));
      }
    }
    if (nearest > hiddenDistance) {
      decayTimer += dt;
      if (decayTimer >= decaySeconds) {
        decayTimer = 0;
        wanted = Math.max(0, wanted - 1);
        syncWanted();
        emitWantedChanged();
        setSiren(wanted >= 1);
      }
    } else {
      decayTimer = 0;
    }
  }

  const police = {
    wanted: 0,
    cruisers,
    cops,
    addHeat,
    clearHeat,
    damageCop,
    update,
    HEAT_STEAL: heatSteal,
    HEAT_PUNCH: heatPunch,
    HEAT_HIT_COP: heatHitCop,
  };

  game.wanted = 0;
  return police;
}
