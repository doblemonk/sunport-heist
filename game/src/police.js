// Sunport Heist — police module.
//
// Owns the wanted level (the single source of truth, published onto the
// game every frame), the police cruisers and foot cops that respond to it,
// the arrest rule and the heat decay. The 3D library comes from the game
// object, never from an import. Written fresh from rebuild-brief.md and
// rewrite-interfaces.md.

export function createPolice(game) {
  const THREE = game.THREE;
  const scene = game.scene;
  const config = game.config || {};

  // Seeded random source. If it is missing, fall back to a constant
  // one half so nothing here ever touches unseeded random.
  const rng = game.rng || {
    next() { return 0.5; },
    range(min, max) { return (min + max) / 2; },
    int(min) { return min; },
    pick(list) { return list[0]; },
    shuffle(list) { return list.slice(); },
  };

  // Wanted configuration; the defaults match the interface document.
  const wantedCfg = config.wanted || {};
  const maxStars = wantedCfg.maxStars || 5;
  const decaySeconds = wantedCfg.decaySeconds || 20;
  const hiddenDistance = wantedCfg.hiddenDistance || 40;
  const arrestSeconds = wantedCfg.arrestSeconds || 3;
  const arrestRadius = wantedCfg.arrestRadius || 2;

  // Tuning: speeds in units per second, turn in radians per second,
  // distances in units, times in seconds.
  const CRUISER_FAR_SPEED = 16, CRUISER_NEAR_SPEED = 10, CRUISER_FAR_DISTANCE = 25;
  const CRUISER_TURN_RATE = 2.2, CRUISER_RAM_DISTANCE = 3.2, CRUISER_RAM_COOLDOWN = 1;
  const CRUISER_RAM_DAMAGE = 6, CRUISER_SHOVE = 2.5;
  const CRUISER_SPAWN_MIN = 28, CRUISER_SPAWN_MAX = 45;
  const COP_SPAWN_MIN = 14, COP_SPAWN_MAX = 24;
  const COP_RUN_MIN = 4.2, COP_RUN_MAX = 5.0, COP_DOWN_TIME = 4;
  const STILL_DISTANCE = 0.4, BLOCKED_LOOKAHEAD = 4;
  const CRUISER_COLOURS = [0x1a2f6e, 0x14161a, 0xf2f0e8]; // dark blue, near-black, off-white

  // Roster per wanted level: [cruisers, cops].
  const ROSTER = [
    [0, 0], [1, 1], [1, 2], [2, 2], [3, 3], [3, 3],
  ];

  function wrapAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  function distanceToPlayer(x, z) {
    const p = game.player.position;
    return Math.hypot(p.x - x, p.z - z);
  }

  function emit(name, data) {
    if (game.events && typeof game.events.emit === 'function') {
      game.events.emit(name, data || {});
    }
  }

  const police = {
    wanted: 0,
    cruisers: [],
    cops: [],

    // Heat values, all one star each.
    HEAT_STEAL: wantedCfg.steal || 1,
    HEAT_PUNCH: wantedCfg.punch || 1,
    HEAT_HIT_COP: wantedCfg.hitCop || 1,

    addHeat,
    clearHeat,
    damageCop,
    update,
  };

  // Timers owned by the module, not exposed on the object.
  let decayTimer = 0;
  let stillTimer = 0;
  let lastX = null;
  let lastZ = null;

  game.wanted = 0;

  // ---- heat -------------------------------------------------------------
  function addHeat(stars) {
    const before = police.wanted;
    police.wanted = Math.min(maxStars, police.wanted + stars);
    decayTimer = 0;
    if (police.wanted !== before) emit('wantedChanged', { wanted: police.wanted });
    if (police.wanted >= 1 && game.audio) game.audio.siren(true);
    game.wanted = police.wanted;
  }

  function clearHeat() {
    police.wanted = 0;
    decayTimer = 0;
    if (game.audio) game.audio.siren(false);
    emit('wantedChanged', { wanted: 0 });
    game.wanted = 0;
  }

  // ---- foot-cop mesh ----------------------------------------------------
  // A low-poly figure in navy with a dark vest, skin head, dark cap, a
  // small yellow badge and dark legs. Limbs pivot at the hip and shoulder
  // so they can swing while the cop runs; the pivots live in the mesh
  // user data for the update step.
  function limb(geo, mat, x, y, drop) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -drop;
    pivot.add(mesh);
    return pivot;
  }

  function buildCopMesh() {
    const group = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1c2f57 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x22242a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    const yellow = new THREE.MeshLambertMaterial({ color: 0xf2c230 });
    const legGeo = new THREE.BoxGeometry(0.22, 0.8, 0.22);
    const armGeo = new THREE.BoxGeometry(0.16, 0.7, 0.16);

    const legL = limb(legGeo, dark, -0.14, 0.8, 0.4);
    const legR = limb(legGeo, dark, 0.14, 0.8, 0.4);
    const armL = limb(armGeo, navy, -0.4, 1.5, 0.35);
    const armR = limb(armGeo, navy, 0.4, 1.5, 0.35);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), navy);
    body.position.y = 1.18;
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.38), dark);
    vest.position.y = 1.2;
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.03), yellow);
    badge.position.set(-0.16, 1.32, 0.2);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skin);
    head.position.y = 1.78;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), dark);
    cap.position.y = 1.98;

    group.add(legL, legR, body, vest, badge, head, cap, armL, armR);
    Object.assign(group.userData, { legL, legR, armL, armR, swing: 0 });
    return group;
  }

  // ---- spawning ---------------------------------------------------------
  function spawnCruiser() {
    const p = game.player.position;
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(CRUISER_SPAWN_MIN, CRUISER_SPAWN_MAX);
    const spot = game.world.nearestRoadPoint(
      p.x + Math.sin(angle) * dist,
      p.z + Math.cos(angle) * dist,
    );
    let vehicle = null;
    try {
      vehicle = game.vehicles.spawn('cruiser', spot.x, spot.z, spot.heading, rng.pick(CRUISER_COLOURS));
    } catch (err) {
      vehicle = null;
    }
    // If the vehicles system cannot provide one, the roster stays short.
    if (!vehicle) return null;
    const cruiser = { vehicle, speed: 0, ramTimer: 0, wobble: rng.range(0, Math.PI * 2) };
    police.cruisers.push(cruiser);
    return cruiser;
  }

  function spawnCop() {
    const p = game.player.position;
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(COP_SPAWN_MIN, COP_SPAWN_MAX);
    let x = p.x + Math.sin(angle) * dist;
    let z = p.z + Math.cos(angle) * dist;
    // A blocked spot is moved to the opposite side of the player.
    if (game.world.isBlocked(x, z, 0.6)) {
      x = p.x - Math.sin(angle) * dist;
      z = p.z - Math.cos(angle) * dist;
    }
    const mesh = buildCopMesh();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const cop = { mesh, health: 100, falling: false, downTimer: 0,
      runSpeed: rng.range(COP_RUN_MIN, COP_RUN_MAX) };
    police.cops.push(cop);
    return cop;
  }

  // ---- removal ----------------------------------------------------------
  function removeCruiser(cruiser) {
    const vehicle = cruiser.vehicle;
    if (game.vehicles && typeof game.vehicles.despawn === 'function') {
      game.vehicles.despawn(vehicle);
    } else {
      // The vehicles module offers no despawn: pull the mesh out of the
      // scene ourselves and drop the car from the vehicle list.
      if (vehicle && vehicle.mesh) scene.remove(vehicle.mesh);
      if (game.vehicles && Array.isArray(game.vehicles.list)) {
        const at = game.vehicles.list.indexOf(vehicle);
        if (at >= 0) game.vehicles.list.splice(at, 1);
      }
    }
    const at = police.cruisers.indexOf(cruiser);
    if (at >= 0) police.cruisers.splice(at, 1);
  }

  function removeCop(cop) {
    scene.remove(cop.mesh);
    const at = police.cops.indexOf(cop);
    if (at >= 0) police.cops.splice(at, 1);
  }

  // Keep the active lists matched to the roster for the current level,
  // spawning or removing as the level changes.
  function matchRoster() {
    const roster = ROSTER[police.wanted] || ROSTER[0];
    while (police.cruisers.length < roster[0]) {
      if (!spawnCruiser()) break;
    }
    while (police.cruisers.length > roster[0]) {
      removeCruiser(police.cruisers[police.cruisers.length - 1]);
    }
    while (police.cops.length < roster[1]) spawnCop();
    while (police.cops.length > roster[1]) {
      removeCop(police.cops[police.cops.length - 1]);
    }
  }

  // ---- damage -----------------------------------------------------------
  function damageCop(cop, damage) {
    if (!cop || cop.falling) return;
    cop.health -= damage;
    if (cop.health <= 0) {
      cop.falling = true;
      cop.downTimer = COP_DOWN_TIME;
      cop.mesh.rotation.z = Math.PI / 2; // tip the mesh over onto its side
      cop.mesh.position.y = 0.3;
      if (typeof game.message === 'function') game.message('Cop down!');
    }
  }

  // ---- per-frame behaviour ----------------------------------------------
  function updateCruiser(cruiser, dt) {
    const vehicle = cruiser.vehicle;
    if (!vehicle || !vehicle.mesh) return;
    cruiser.ramTimer = Math.max(0, cruiser.ramTimer - dt);

    const p = game.player.position;
    const dx = p.x - vehicle.position.x;
    const dz = p.z - vehicle.position.z;
    const dist = Math.hypot(dx, dz);

    // Steer toward the player, turning at most 2.2 radians per second,
    // with a small random wobble so the chase does not look robotic.
    const wobble = Math.sin((game.time || 0) * 1.5 + cruiser.wobble) * 0.08;
    const desired = Math.atan2(dx, dz) + wobble;
    const maxTurn = CRUISER_TURN_RATE * dt;
    vehicle.heading += Math.max(-maxTurn, Math.min(maxTurn, wrapAngle(desired - vehicle.heading)));

    // Drive fast far away, slower up close, easing toward the target.
    const targetSpeed = dist > CRUISER_FAR_DISTANCE ? CRUISER_FAR_SPEED : CRUISER_NEAR_SPEED;
    const aheadX = vehicle.position.x + Math.sin(vehicle.heading) * BLOCKED_LOOKAHEAD;
    const aheadZ = vehicle.position.z + Math.cos(vehicle.heading) * BLOCKED_LOOKAHEAD;
    if (game.world.isBlocked(aheadX, aheadZ, 1)) {
      vehicle.heading += Math.PI; // blocked ahead: swing around
      cruiser.speed *= 0.5; // ...and halve the speed
    }
    cruiser.speed += (targetSpeed - cruiser.speed) * Math.min(1, dt * 1.5);
    vehicle.speed = cruiser.speed;

    vehicle.position.x += Math.sin(vehicle.heading) * cruiser.speed * dt;
    vehicle.position.z += Math.cos(vehicle.heading) * cruiser.speed * dt;
    const bounds = game.world.bounds;
    vehicle.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, vehicle.position.x));
    vehicle.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, vehicle.position.z));
    vehicle.mesh.rotation.y = vehicle.heading;

    const wheels = vehicle.mesh.userData && vehicle.mesh.userData.wheels;
    if (wheels) {
      for (const wheel of wheels) wheel.rotation.x += cruiser.speed * dt * 2;
    }

    // Ram: on contact, at most once a second, hurt the player, shove
    // the player's car along the cruiser's heading, and play a punch.
    if (dist < CRUISER_RAM_DISTANCE && cruiser.ramTimer <= 0) {
      cruiser.ramTimer = CRUISER_RAM_COOLDOWN;
      if (game.player.takeDamage) game.player.takeDamage(CRUISER_RAM_DAMAGE);
      const car = game.player.car;
      if (car && car.position) {
        car.position.x += Math.sin(vehicle.heading) * CRUISER_SHOVE;
        car.position.z += Math.cos(vehicle.heading) * CRUISER_SHOVE;
      }
      if (game.audio) game.audio.punch();
    }
  }

  function updateCop(cop, dt) {
    if (cop.falling) {
      cop.downTimer -= dt;
      if (cop.downTimer <= 0) removeCop(cop);
      return;
    }
    const p = game.player.position;
    const dx = p.x - cop.mesh.position.x;
    const dz = p.z - cop.mesh.position.z;
    // Run straight at the player, facing the player, legs swinging.
    cop.mesh.rotation.y = Math.atan2(dx, dz);
    cop.mesh.position.x += Math.sin(cop.mesh.rotation.y) * cop.runSpeed * dt;
    cop.mesh.position.z += Math.cos(cop.mesh.rotation.y) * cop.runSpeed * dt;
    const swing = cop.mesh.userData.swing + dt * cop.runSpeed * 2.2;
    cop.mesh.userData.swing = swing;
    const amp = 0.55;
    if (cop.mesh.userData.legL) cop.mesh.userData.legL.rotation.x = Math.sin(swing) * amp;
    if (cop.mesh.userData.legR) cop.mesh.userData.legR.rotation.x = -Math.sin(swing) * amp;
    if (cop.mesh.userData.armL) cop.mesh.userData.armL.rotation.x = -Math.sin(swing) * amp * 0.8;
    if (cop.mesh.userData.armR) cop.mesh.userData.armR.rotation.x = Math.sin(swing) * amp * 0.8;
  }

  // ---- arrest -----------------------------------------------------------
  function updateArrest(dt) {
    const p = game.player.position;
    if (lastX === null || lastZ === null) {
      lastX = p.x;
      lastZ = p.z;
      stillTimer = 0;
      return;
    }
    const moved = Math.hypot(p.x - lastX, p.z - lastZ);
    if (moved < STILL_DISTANCE) {
      stillTimer += dt;
    } else {
      // Any real movement resets the timer and records the new spot.
      stillTimer = 0;
      lastX = p.x;
      lastZ = p.z;
    }
    if (stillTimer < arrestSeconds) return;
    const close = police.cops.some((cop) => {
      if (cop.falling) return false;
      return distanceToPlayer(cop.mesh.position.x, cop.mesh.position.z) <= arrestRadius;
    });
    if (!close) return;
    clearHeat();
    if (game.audio) game.audio.busted();
    emit('busted', {});
    if (game.setState) game.setState('busted');
    stillTimer = 0;
  }

  // ---- heat decay -------------------------------------------------------
  function updateDecay(dt) {
    let nearest = Infinity;
    for (const cruiser of police.cruisers) {
      if (!cruiser.vehicle) continue;
      nearest = Math.min(nearest, distanceToPlayer(cruiser.vehicle.position.x, cruiser.vehicle.position.z));
    }
    for (const cop of police.cops) {
      if (cop.falling) continue;
      nearest = Math.min(nearest, distanceToPlayer(cop.mesh.position.x, cop.mesh.position.z));
    }
    if (nearest > hiddenDistance) {
      decayTimer += dt;
      if (decayTimer >= decaySeconds) {
        decayTimer = 0;
        police.wanted = Math.max(0, police.wanted - 1);
        emit('wantedChanged', { wanted: police.wanted });
        if (police.wanted === 0 && game.audio) game.audio.siren(false);
        game.wanted = police.wanted;
      }
    } else {
      decayTimer = 0; // any police within 40 units resets the decay timer
    }
  }

  // ---- the frame update -------------------------------------------------
  function update(dt) {
    game.wanted = police.wanted; // publish the wanted level every frame
    if (!dt || dt <= 0) return;
    if (game.state !== 'playing') return;

    matchRoster();
    if (game.audio) game.audio.siren(police.wanted >= 1);

    if (police.wanted === 0) {
      // No heat: only the roster is kept in step, and the arrest
      // tracking resets.
      stillTimer = 0;
      lastX = null;
      lastZ = null;
      return;
    }

    for (const cruiser of police.cruisers) updateCruiser(cruiser, dt);
    for (let i = police.cops.length - 1; i >= 0; i--) updateCop(police.cops[i], dt);

    updateArrest(dt);
    updateDecay(dt);
  }

  return police;
}
