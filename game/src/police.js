// Sunport Heist — police.js
//
// The wanted level, the police cruisers and the foot cops that answer
// it, the arrest rule and the slow cooling of the heat.
//
// This module owns the wanted level. It is the single source of truth
// for how many stars the player carries, and it publishes that number
// onto the shared game object every frame so the HUD, the minimap and
// the missions can all read the same value.
//
// Stealing a car, punching a pedestrian or hitting a cop each add one
// star, up to five. Cruisers ram the player's car. Foot cops run the
// player down on foot. Stand still beside a cop for too long and the
// player is busted. Break away from every officer for long enough and
// the heat cools off one star at a time.
//
// The police object deliberately does NOT give its cruisers or its
// foot cops a position field of their own. A cruiser's position lives
// on the vehicle it drives, and a foot cop's position lives on its
// mesh. Other systems that look for a position directly on a cruiser
// or a cop will therefore find none; keep it that way.
//
// Likewise this module removes a cruiser's mesh from the scene itself
// when its roster slot goes away. The vehicles system offers no
// despawn action, and none is added here.
//
// The random source comes from the game object. If it is missing, a
// constant one half is used as the fallback, so no call ever reaches
// for the language's built-in unseeded random function.

function createPolice(game) {
  var THREE = game.THREE;
  var scene = game.scene;
  var config = game.config || {};
  var wantedCfg = config.wanted || {};

  // ------------------------------------------------------------------
  // Tuning, read from the configuration with the documented defaults.
  // ------------------------------------------------------------------

  var MAX_STARS = wantedCfg.maxStars != null ? wantedCfg.maxStars : 5;

  var STEAL_HEAT = wantedCfg.stealCarHeat != null
    ? wantedCfg.stealCarHeat
    : (wantedCfg.stealCar != null ? wantedCfg.stealCar : 1);
  var PUNCH_HEAT = wantedCfg.punchPedHeat != null
    ? wantedCfg.punchPedHeat
    : (wantedCfg.punchPed != null ? wantedCfg.punchPed : 1);
  var HIT_COP_HEAT = wantedCfg.hitCopHeat != null
    ? wantedCfg.hitCopHeat
    : (wantedCfg.hitCop != null ? wantedCfg.hitCop : 1);

  var DECAY_SECONDS = wantedCfg.decaySeconds != null
    ? wantedCfg.decaySeconds
    : (wantedCfg.decayDelay != null ? wantedCfg.decayDelay : 20);
  var HIDDEN_DISTANCE = wantedCfg.hiddenDistance != null
    ? wantedCfg.hiddenDistance
    : (wantedCfg.hideDistance != null ? wantedCfg.hideDistance : 40);
  var BUSTED_STAND_SECONDS = wantedCfg.bustedStandSeconds != null
    ? wantedCfg.bustedStandSeconds
    : (wantedCfg.standStillSeconds != null ? wantedCfg.standStillSeconds : 3);
  var BUSTED_RADIUS = wantedCfg.bustedRadius != null
    ? wantedCfg.bustedRadius
    : 2;

  // ------------------------------------------------------------------
  // Small helpers.
  // ------------------------------------------------------------------

  // The game's seeded random source, with a constant fallback.
  var rng = game.rng || null;

  function nextRandom() {
    if (rng && typeof rng.next === 'function') {
      return rng.next();
    }
    return 0.5;
  }

  function rangeRandom(min, max) {
    if (rng && typeof rng.range === 'function') {
      return rng.range(min, max);
    }
    return min + (max - min) * 0.5;
  }

  function pickRandom(list) {
    if (!list || list.length === 0) {
      return null;
    }
    if (rng && typeof rng.pick === 'function') {
      return rng.pick(list);
    }
    return list[Math.floor(nextRandom() * list.length)];
  }

  // Wrap an angle into the range -PI to PI.
  function wrapAngle(angle) {
    while (angle > Math.PI) {
      angle -= Math.PI * 2;
    }
    while (angle < -Math.PI) {
      angle += Math.PI * 2;
    }
    return angle;
  }

  // The shortest signed turn from one heading to another.
  function angleDifference(from, to) {
    return wrapAngle(to - from);
  }

  // Flat distance between two points on the ground plane.
  function flatDistance(ax, az, bx, bz) {
    var dx = ax - bx;
    var dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // Move a value toward a target by at most step, without overshoot.
  function moveToward(value, target, step) {
    if (value < target) {
      return Math.min(target, value + step);
    }
    if (value > target) {
      return Math.max(target, value - step);
    }
    return value;
  }

  function clampNumber(value, min, max) {
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  }

  // ------------------------------------------------------------------
  // State.
  // ------------------------------------------------------------------

  // The current wanted level, zero to five stars.
  var wanted = 0;

  // Active cruisers. Each entry holds the vehicle it drives, its
  // current speed, a timer that limits how often it can ram, and a
  // random wobble value. No position field lives here on purpose.
  var cruisers = [];

  // Active foot cops. Each entry holds its mesh, its health starting
  // at 100, a flag for whether it is falling, a timer for how long it
  // stays down, and its running speed between 4.2 and 5.0. Again, no
  // position field: the position lives on the mesh.
  var cops = [];

  // How long the nearest officer has been further than the hidden
  // distance away. Reaching the decay time drops one star.
  var decayTimer = 0;

  // How long the player has stood almost still.
  var stillTimer = 0;

  // The anchor point the still timer measures movement against.
  var stillAnchorX = 0;
  var stillAnchorZ = 0;
  var stillAnchorSet = false;

  // The police object, filled in at the bottom. Kept here so the
  // publish step below can keep its wanted field live.
  var police = null;

  // ------------------------------------------------------------------
  // Roster: how many cruisers and foot cops each wanted level fields.
  // ------------------------------------------------------------------

  function rosterFor(level) {
    if (level <= 0) {
      return { cruisers: 0, cops: 0 };
    }
    if (level === 1) {
      return { cruisers: 1, cops: 1 };
    }
    if (level === 2) {
      return { cruisers: 1, cops: 2 };
    }
    if (level === 3) {
      return { cruisers: 2, cops: 2 };
    }
    // Levels four and five field the full response.
    return { cruisers: 3, cops: 3 };
  }

  // ------------------------------------------------------------------
  // Cop mesh: a low-poly officer in navy with a dark vest, a skin
  // head, a dark cap, a small yellow badge and dark legs.
  // ------------------------------------------------------------------

  function buildCopMesh() {
    var group = new THREE.Group();

    var navy = new THREE.MeshLambertMaterial({ color: 0x1c2f6b });
    var vest = new THREE.MeshLambertMaterial({ color: 0x232323 });
    var skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
    var capMat = new THREE.MeshLambertMaterial({ color: 0x14213d });
    var badgeMat = new THREE.MeshLambertMaterial({ color: 0xffd23f });
    var darkLegs = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });

    // Legs, pivoted at the hip so they can swing while running.
    var legGeo = new THREE.BoxGeometry(0.16, 0.5, 0.18);
    legGeo.translate(0, -0.25, 0);

    var legL = new THREE.Mesh(legGeo, darkLegs);
    legL.position.set(-0.11, 0.5, 0);
    group.add(legL);

    var legR = new THREE.Mesh(legGeo, darkLegs);
    legR.position.set(0.11, 0.5, 0);
    group.add(legR);

    // Torso in navy, with a dark vest plate over the chest.
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.28), navy);
    torso.position.set(0, 0.82, 0);
    group.add(torso);

    var vestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.06), vest);
    vestPlate.position.set(0, 0.84, 0.16);
    group.add(vestPlate);

    // A small yellow badge on the chest.
    var badge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.02), badgeMat);
    badge.position.set(-0.13, 0.98, 0.2);
    group.add(badge);

    // Arms, pivoted at the shoulder.
    var armGeo = new THREE.BoxGeometry(0.13, 0.52, 0.15);
    armGeo.translate(0, -0.26, 0);

    var armL = new THREE.Mesh(armGeo, navy);
    armL.position.set(-0.33, 1.08, 0);
    group.add(armL);

    var armR = new THREE.Mesh(armGeo, navy);
    armR.position.set(0.33, 1.08, 0);
    group.add(armR);

    // Skin head with a dark cap on top.
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.28), skin);
    head.position.set(0, 1.3, 0);
    group.add(head);

    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.32), capMat);
    cap.position.set(0, 1.48, 0);
    group.add(cap);

    var capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.14), capMat);
    capBrim.position.set(0, 1.44, 0.2);
    group.add(capBrim);

    // Keep the swinging limbs where the update step can find them,
    // without adding extra fields to the cop object itself.
    group.userData.legL = legL;
    group.userData.legR = legR;
    group.userData.armL = armL;
    group.userData.armR = armR;
    group.userData.swing = 0;

    return group;
  }

  // ------------------------------------------------------------------
  // Spawning.
  // ------------------------------------------------------------------

  var CRUISER_COLORS = [0x1a2f5a, 0x111111, 0xf2efe6];

  function playerPosition() {
    if (game.player && game.player.position) {
      return game.player.position;
    }
    return { x: 0, y: 0, z: 0 };
  }

  function spawnCruiser() {
    if (!game.vehicles || typeof game.vehicles.spawn !== 'function') {
      return null;
    }
    var playerPos = playerPosition();
    var angle = rangeRandom(0, Math.PI * 2);
    var distance = rangeRandom(28, 45);
    var x = playerPos.x + Math.sin(angle) * distance;
    var z = playerPos.z + Math.cos(angle) * distance;
    var heading = angle;

    // Snap the spawn point onto the nearest road, with that road's
    // heading, so cruisers always arrive on the street.
    if (game.world && typeof game.world.nearestRoadPoint === 'function') {
      var roadPoint = game.world.nearestRoadPoint(x, z);
      if (roadPoint) {
        x = roadPoint.x;
        z = roadPoint.z;
        heading = roadPoint.heading;
      }
    }

    var colour = pickRandom(CRUISER_COLORS);
    var vehicle = null;
    try {
      vehicle = game.vehicles.spawn('cruiser', x, z, heading, colour);
    } catch (err) {
      vehicle = null;
    }

    // If the vehicles system cannot provide one, the roster simply
    // stays short for this frame; the next update tries again.
    if (!vehicle) {
      return null;
    }

    var cruiser = {
      vehicle: vehicle,
      speed: 0,
      ramTimer: 0,
      wobble: rangeRandom(0, Math.PI * 2)
    };
    cruisers.push(cruiser);
    return cruiser;
  }

  function spawnCop() {
    var playerPos = playerPosition();
    var angle = rangeRandom(0, Math.PI * 2);
    var distance = rangeRandom(14, 24);
    var x = playerPos.x + Math.sin(angle) * distance;
    var z = playerPos.z + Math.cos(angle) * distance;

    // If the spot is blocked, move to the opposite side of the
    // player instead of spawning inside a building.
    if (game.world && typeof game.world.isBlocked === 'function') {
      if (game.world.isBlocked(x, z, 0.6)) {
        x = playerPos.x - Math.sin(angle) * distance;
        z = playerPos.z - Math.cos(angle) * distance;
      }
    }

    var mesh = buildCopMesh();
    mesh.position.set(x, 0, z);
    mesh.rotation.y = rangeRandom(0, Math.PI * 2);
    if (scene) {
      scene.add(mesh);
    }

    var cop = {
      mesh: mesh,
      health: 100,
      falling: false,
      fallTimer: 0,
      speed: rangeRandom(4.2, 5.0)
    };
    cops.push(cop);
    return cop;
  }

  // ------------------------------------------------------------------
  // Removal.
  // ------------------------------------------------------------------

  function removeCruiser(cruiser) {
    var index = cruisers.indexOf(cruiser);
    if (index >= 0) {
      cruisers.splice(index, 1);
    }
    if (!cruiser || !cruiser.vehicle) {
      return;
    }
    var vehicle = cruiser.vehicle;
    // If a despawn action exists, use it; otherwise take the mesh
    // out of the scene ourselves and drop the car from the list.
    if (game.vehicles && typeof game.vehicles.despawn === 'function') {
      try {
        game.vehicles.despawn(vehicle);
      } catch (err) {
        if (vehicle.mesh && scene) {
          scene.remove(vehicle.mesh);
        }
      }
    } else {
      if (vehicle.mesh && scene) {
        scene.remove(vehicle.mesh);
      }
      if (game.vehicles && game.vehicles.list) {
        var listIndex = game.vehicles.list.indexOf(vehicle);
        if (listIndex >= 0) {
          game.vehicles.list.splice(listIndex, 1);
        }
      }
    }
  }

  function removeCop(cop) {
    var index = cops.indexOf(cop);
    if (index >= 0) {
      cops.splice(index, 1);
    }
    if (cop && cop.mesh && scene) {
      scene.remove(cop.mesh);
    }
  }

  // Keep the active lists matched to the roster for the current
  // wanted level, spawning or removing as the level changes.
  function syncRoster() {
    var roster = rosterFor(wanted);

    while (cruisers.length < roster.cruisers) {
      var made = spawnCruiser();
      if (!made) {
        break;
      }
    }
    while (cruisers.length > roster.cruisers) {
      removeCruiser(cruisers[cruisers.length - 1]);
    }

    while (cops.length < roster.cops) {
      spawnCop();
    }
    while (cops.length > roster.cops) {
      removeCop(cops[cops.length - 1]);
    }
  }

  // ------------------------------------------------------------------
  // Heat.
  // ------------------------------------------------------------------

  function setSiren(on) {
    if (game.audio && typeof game.audio.siren === 'function') {
      try {
        game.audio.siren(on);
      } catch (err) {
        // A missing or unhappy audio system must never break policing.
      }
    }
  }

  function emitWantedChanged() {
    if (game.events && typeof game.events.emit === 'function') {
      game.events.emit('wantedChanged', { wanted: wanted });
    }
  }

  function publishWanted() {
    game.wanted = wanted;
    if (police) {
      police.wanted = wanted;
    }
  }

  function addHeat(stars) {
    var amount = stars || 0;
    if (amount <= 0) {
      return;
    }
    var before = wanted;
    wanted = clampNumber(wanted + amount, 0, MAX_STARS);
    decayTimer = 0;
    publishWanted();
    if (wanted !== before) {
      emitWantedChanged();
    }
    if (wanted >= 1) {
      setSiren(true);
    }
  }

  function clearHeat() {
    wanted = 0;
    decayTimer = 0;
    stillTimer = 0;
    publishWanted();
    setSiren(false);
    emitWantedChanged();
  }

  // ------------------------------------------------------------------
  // Hurting a cop.
  // ------------------------------------------------------------------

  function damageCop(cop, damage) {
    if (!cop || cop.falling) {
      return;
    }
    cop.health -= damage || 0;
    if (cop.health > 0) {
      return;
    }
    cop.health = 0;
    cop.falling = true;
    cop.fallTimer = 4;
    // Tip the mesh over onto its side and let it lie for four
    // seconds before it is removed.
    if (cop.mesh) {
      cop.mesh.rotation.z = Math.PI * 0.5;
      cop.mesh.position.y = 0.3;
    }
    if (typeof game.message === 'function') {
      game.message('Cop down!');
    }
  }

  // ------------------------------------------------------------------
  // Per-frame behaviour.
  // ------------------------------------------------------------------

  function updateCruiser(cruiser, dt, playerPos) {
    var vehicle = cruiser.vehicle;
    if (!vehicle || !vehicle.mesh) {
      return;
    }
    var pos = vehicle.position || vehicle.mesh.position;
    if (!pos) {
      return;
    }

    cruiser.ramTimer = Math.max(0, cruiser.ramTimer - dt);

    var dx = playerPos.x - pos.x;
    var dz = playerPos.z - pos.z;
    var distance = Math.sqrt(dx * dx + dz * dz);
    var targetHeading = Math.atan2(dx, dz);

    // Steer toward the player, turning at most 2.2 radians a second,
    // with a small wobble so the pursuit does not look mechanical.
    var wobble = Math.sin((game.time || 0) * 1.7 + cruiser.wobble) * 0.08;
    var turn = angleDifference(vehicle.heading, targetHeading + wobble);
    var maxTurn = 2.2 * dt;
    turn = clampNumber(turn, -maxTurn, maxTurn);
    vehicle.heading = wrapAngle(vehicle.heading + turn);

    // Drive at 16 far away and 10 up close, easing toward the target.
    var targetSpeed = distance > 15 ? 16 : 10;
    cruiser.speed = moveToward(cruiser.speed, targetSpeed, 8 * dt);

    // If the way ahead is blocked, swing around and halve the speed.
    var aheadX = pos.x + Math.sin(vehicle.heading) * 4;
    var aheadZ = pos.z + Math.cos(vehicle.heading) * 4;
    if (game.world && typeof game.world.isBlocked === 'function') {
      if (game.world.isBlocked(aheadX, aheadZ, 1.2)) {
        vehicle.heading = wrapAngle(vehicle.heading + Math.PI);
        cruiser.speed = cruiser.speed * 0.5;
      }
    }

    pos.x += Math.sin(vehicle.heading) * cruiser.speed * dt;
    pos.z += Math.cos(vehicle.heading) * cruiser.speed * dt;
    vehicle.mesh.position.x = pos.x;
    vehicle.mesh.position.z = pos.z;
    vehicle.mesh.rotation.y = vehicle.heading;

    // Spin the wheels with the speed, when the mesh carries them.
    if (vehicle.mesh.userData && vehicle.mesh.userData.wheels) {
      var wheels = vehicle.mesh.userData.wheels;
      for (var i = 0; i < wheels.length; i++) {
        wheels[i].rotation.x += cruiser.speed * dt * 0.5;
      }
    }

    // On contact within 3.2 units, at most once a second, hurt the
    // player, shove the player's car and play a punch sound.
    if (distance < 3.2 && cruiser.ramTimer <= 0) {
      cruiser.ramTimer = 1;
      if (game.player && typeof game.player.takeDamage === 'function') {
        game.player.takeDamage(6);
      }
      var car = game.player ? game.player.car : null;
      if (car && car.position) {
        car.position.x += Math.sin(vehicle.heading) * 2.5;
        car.position.z += Math.cos(vehicle.heading) * 2.5;
        if (car.mesh) {
          car.mesh.position.x = car.position.x;
          car.mesh.position.z = car.position.z;
        }
      }
      if (game.audio && typeof game.audio.punch === 'function') {
        game.audio.punch();
      }
    }
  }

  function updateCop(cop, dt, playerPos) {
    if (!cop.mesh) {
      return;
    }

    // A falling cop just counts its timer down, then is removed.
    if (cop.falling) {
      cop.fallTimer -= dt;
      if (cop.fallTimer <= 0) {
        removeCop(cop);
      }
      return;
    }

    var pos = cop.mesh.position;
    var dx = playerPos.x - pos.x;
    var dz = playerPos.z - pos.z;

    // Run straight at the player at the cop's own speed, facing the
    // player, legs swinging as it runs.
    var heading = Math.atan2(dx, dz);
    cop.mesh.rotation.y = heading;
    pos.x += Math.sin(heading) * cop.speed * dt;
    pos.z += Math.cos(heading) * cop.speed * dt;

    var userData = cop.mesh.userData || {};
    userData.swing = (userData.swing || 0) + dt * cop.speed * 2.2;
    var swing = Math.sin(userData.swing) * 0.6;
    if (userData.legL) {
      userData.legL.rotation.x = swing;
    }
    if (userData.legR) {
      userData.legR.rotation.x = -swing;
    }
    if (userData.armL) {
      userData.armL.rotation.x = -swing * 0.7;
    }
    if (userData.armR) {
      userData.armR.rotation.x = swing * 0.7;
    }
  }

  // The distance to the nearest cruiser or standing cop, or null
  // when no police are on the street at all.
  function nearestPoliceDistance(playerPos) {
    var nearest = null;
    var i;
    for (i = 0; i < cruisers.length; i++) {
      var vehicle = cruisers[i].vehicle;
      if (!vehicle) {
        continue;
      }
      var pos = vehicle.position || (vehicle.mesh && vehicle.mesh.position);
      if (!pos) {
        continue;
      }
      var d = flatDistance(playerPos.x, playerPos.z, pos.x, pos.z);
      if (nearest === null || d < nearest) {
        nearest = d;
      }
    }
    for (i = 0; i < cops.length; i++) {
      var cop = cops[i];
      if (!cop || cop.falling || !cop.mesh) {
        continue;
      }
      var copPos = cop.mesh.position;
      var cd = flatDistance(playerPos.x, playerPos.z, copPos.x, copPos.z);
      if (nearest === null || cd < nearest) {
        nearest = cd;
      }
    }
    return nearest;
  }

  function updateArrest(dt, playerPos) {
    if (!stillAnchorSet) {
      stillAnchorX = playerPos.x;
      stillAnchorZ = playerPos.z;
      stillAnchorSet = true;
      stillTimer = 0;
      return;
    }
    var moved = flatDistance(playerPos.x, playerPos.z, stillAnchorX, stillAnchorZ);
    if (moved < 0.4) {
      stillTimer += dt;
    } else {
      stillTimer = 0;
      stillAnchorX = playerPos.x;
      stillAnchorZ = playerPos.z;
    }

    if (stillTimer < BUSTED_STAND_SECONDS) {
      return;
    }

    // A standing cop within two units makes the arrest.
    for (var i = 0; i < cops.length; i++) {
      var cop = cops[i];
      if (!cop || cop.falling || !cop.mesh) {
        continue;
      }
      var copPos = cop.mesh.position;
      if (flatDistance(playerPos.x, playerPos.z, copPos.x, copPos.z) <= BUSTED_RADIUS) {
        clearHeat();
        if (game.audio && typeof game.audio.busted === 'function') {
          game.audio.busted();
        }
        if (game.events && typeof game.events.emit === 'function') {
          game.events.emit('busted', {});
        }
        if (typeof game.setState === 'function') {
          game.setState('busted');
        }
        stillTimer = 0;
        return;
      }
    }
  }

  function updateDecay(dt, playerPos) {
    var nearest = nearestPoliceDistance(playerPos);
    // No police on the street counts as nobody nearby.
    if (nearest === null || nearest > HIDDEN_DISTANCE) {
      decayTimer += dt;
    } else {
      decayTimer = 0;
      return;
    }
    if (decayTimer >= DECAY_SECONDS) {
      decayTimer = 0;
      wanted = Math.max(0, wanted - 1);
      publishWanted();
      emitWantedChanged();
      if (wanted < 1) {
        setSiren(false);
      }
    }
  }

  function update(dt) {
    publishWanted();

    // Outside play the siren stays quiet and the roster is left
    // alone; the wanted level itself is still published above.
    if (game.state && game.state !== 'playing') {
      setSiren(false);
      return;
    }

    // The siren follows whether the wanted level is one or more.
    setSiren(wanted >= 1);

    syncRoster();

    // With no wanted level, only the roster is kept in step and the
    // arrest tracking resets.
    if (wanted < 1) {
      stillTimer = 0;
      stillAnchorSet = false;
      decayTimer = 0;
      return;
    }

    var playerPos = playerPosition();

    // Cruisers first, then foot cops, each driving their own chase.
    var i;
    var cruiserSnapshot = cruisers.slice();
    for (i = 0; i < cruiserSnapshot.length; i++) {
      updateCruiser(cruiserSnapshot[i], dt, playerPos);
    }

    var copSnapshot = cops.slice();
    for (i = 0; i < copSnapshot.length; i++) {
      // A cop may have been removed mid-loop by its own fall timer,
      // so only update it while it is still on the active list.
      if (cops.indexOf(copSnapshot[i]) >= 0) {
        updateCop(copSnapshot[i], dt, playerPos);
      }
    }

    updateArrest(dt, playerPos);
    updateDecay(dt, playerPos);
    publishWanted();
  }

  police = {
    wanted: wanted,
    cruisers: cruisers,
    cops: cops,
    addHeat: addHeat,
    clearHeat: clearHeat,
    damageCop: damageCop,
    update: update,
    HEAT_STEAL: STEAL_HEAT,
    HEAT_PUNCH: PUNCH_HEAT,
    HEAT_HIT_COP: HIT_COP_HEAT
  };

  publishWanted();

  return police;
}

export { createPolice };
