// police.js — wanted level, police cruisers, foot cops, arrests, heat decay.
// Factory: createPolice(game) returns the police object, which owns the
// wanted level as the single source of truth and publishes it onto the
// game object every frame. Cruisers and foot cops carry no position of
// their own: a cruiser's position lives on its vehicle, a cop's on its mesh.

function createPolice(game) {
  var THREE = game.THREE;
  var scene = game.scene;
  var rng = game.rng || {
    next: function () { return 0.5; },
    range: function (min, max) { return (min + max) / 2; },
    int: function (min, max) { return min; },
    pick: function (list) { return list[0]; },
    shuffle: function (list) { return list.slice(); }
  };
  var config = game.config || {};
  var wantedCfg = config.wanted || {};

  var maxStars = wantedCfg.maxStars != null ? wantedCfg.maxStars : 5;
  var decaySeconds = wantedCfg.decaySeconds != null
    ? wantedCfg.decaySeconds
    : (wantedCfg.decayDelay != null ? wantedCfg.decayDelay : 20);
  var hiddenDistance = wantedCfg.hiddenDistance != null
    ? wantedCfg.hiddenDistance
    : (wantedCfg.hideDistance != null ? wantedCfg.hideDistance : 40);
  var arrestSeconds = wantedCfg.bustedStandSeconds != null
    ? wantedCfg.bustedStandSeconds
    : (wantedCfg.standStillSeconds != null ? wantedCfg.standStillSeconds : 3);
  var arrestRadius = wantedCfg.bustedRadius != null ? wantedCfg.bustedRadius : 2;

  var heatSteal = wantedCfg.stealCarHeat != null
    ? wantedCfg.stealCarHeat
    : (wantedCfg.stealCar != null ? wantedCfg.stealCar : 1);
  var heatPunch = wantedCfg.punchPedHeat != null
    ? wantedCfg.punchPedHeat
    : (wantedCfg.punchPed != null ? wantedCfg.punchPed : 1);
  var heatHitCop = wantedCfg.hitCopHeat != null
    ? wantedCfg.hitCopHeat
    : (wantedCfg.hitCop != null ? wantedCfg.hitCop : 1);

  // How many cruisers and foot cops each wanted level fields.
  // [cruisers, cops] per level, index 0 is level zero.
  var ROSTER = [
    [0, 0],
    [1, 1],
    [1, 2],
    [2, 2],
    [3, 3],
    [3, 3]
  ];

  var CRUISER_COLORS = [0x1a3a6b, 0x14161a, 0xf0eee2];
  var RAM_RANGE = 3.2;
  var RAM_DAMAGE = 6;
  var RAM_COOLDOWN = 1;
  var RAM_SHOVE = 2.5;
  var CRUISER_TURN = 2.2;
  var CRUISER_SPEED_FAR = 16;
  var CRUISER_SPEED_NEAR = 10;
  var COP_FALL_SECONDS = 4;
  var STILL_DISTANCE = 0.4;

  var police = {
    wanted: 0,
    cruisers: [],
    cops: [],
    HEAT_STEAL: heatSteal,
    HEAT_PUNCH: heatPunch,
    HEAT_HIT_COP: heatHitCop,
    addHeat: addHeat,
    clearHeat: clearHeat,
    damageCop: damageCop,
    update: update
  };

  var decayTimer = 0;
  var stillTimer = 0;
  var lastX = null;
  var lastZ = null;

  function emitWantedChanged() {
    if (game.events && typeof game.events.emit === 'function') {
      game.events.emit('wantedChanged', { wanted: police.wanted });
    }
  }

  function setSiren(on) {
    if (game.audio && typeof game.audio.siren === 'function') {
      game.audio.siren(on);
    }
  }

  function addHeat(stars) {
    if (!stars) return;
    var before = police.wanted;
    police.wanted = Math.min(maxStars, police.wanted + stars);
    decayTimer = 0;
    if (police.wanted !== before) {
      emitWantedChanged();
    }
    if (police.wanted >= 1) {
      setSiren(true);
    }
    game.wanted = police.wanted;
  }

  function clearHeat() {
    police.wanted = 0;
    decayTimer = 0;
    setSiren(false);
    emitWantedChanged();
    game.wanted = police.wanted;
  }

  function damageCop(cop, damage) {
    if (!cop || cop.falling) return;
    cop.health -= damage;
    if (cop.health > 0) return;
    cop.falling = true;
    cop.fallTimer = COP_FALL_SECONDS;
    // Tip the mesh over onto its side.
    cop.mesh.rotation.z = Math.PI / 2;
    if (typeof game.message === 'function') {
      game.message('Cop down!');
    }
  }

  function buildCopMesh() {
    var navy = 0x1e3a5f;
    var vestDark = 0x222831;
    var skin = 0xd9a066;
    var capDark = 0x1a1d24;
    var badgeYellow = 0xffd23f;
    var legsDark = 0x232a35;

    var group = new THREE.Group();

    var body = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.8, 0.36),
      new THREE.MeshLambertMaterial({ color: navy })
    );
    body.position.y = 1.05;
    group.add(body);

    var vest = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.5, 0.4),
      new THREE.MeshLambertMaterial({ color: vestDark })
    );
    vest.position.y = 1.12;
    group.add(vest);

    var head = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.34, 0.34),
      new THREE.MeshLambertMaterial({ color: skin })
    );
    head.position.y = 1.65;
    group.add(head);

    var cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.12, 0.38),
      new THREE.MeshLambertMaterial({ color: capDark })
    );
    cap.position.y = 1.86;
    group.add(cap);

    var badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.1, 0.02),
      new THREE.MeshLambertMaterial({ color: badgeYellow })
    );
    badge.position.set(-0.14, 1.25, 0.21);
    group.add(badge);

    var legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
    var legMat = new THREE.MeshLambertMaterial({ color: legsDark });
    var legL = new THREE.Group();
    legL.position.set(-0.16, 0.7, 0);
    var legLMesh = new THREE.Mesh(legGeo, legMat);
    legLMesh.position.y = -0.35;
    legL.add(legLMesh);
    group.add(legL);
    var legR = new THREE.Group();
    legR.position.set(0.16, 0.7, 0);
    var legRMesh = new THREE.Mesh(legGeo, legMat);
    legRMesh.position.y = -0.35;
    legR.add(legRMesh);
    group.add(legR);

    group.userData.legL = legL;
    group.userData.legR = legR;
    return group;
  }

  function spawnCruiser() {
    var player = game.player;
    var vehicles = game.vehicles;
    if (!player || !vehicles || typeof vehicles.spawn !== 'function') return null;
    var angle = rng.range(0, Math.PI * 2);
    var dist = rng.range(28, 45);
    var x = player.position.x + Math.sin(angle) * dist;
    var z = player.position.z + Math.cos(angle) * dist;
    var heading = 0;
    if (game.world && typeof game.world.nearestRoadPoint === 'function') {
      var road = game.world.nearestRoadPoint(x, z);
      if (road) {
        x = road.x;
        z = road.z;
        heading = road.heading;
      }
    }
    var colour = rng.pick(CRUISER_COLORS);
    var vehicle = vehicles.spawn('cruiser', x, z, heading, colour);
    // If the vehicles system cannot provide one, the roster stays short.
    if (!vehicle) return null;
    var cruiser = {
      vehicle: vehicle,
      speed: 0,
      ramTimer: 0,
      wobble: rng.range(0, Math.PI * 2)
    };
    police.cruisers.push(cruiser);
    return cruiser;
  }

  function spawnCop() {
    var player = game.player;
    if (!player) return null;
    var angle = rng.range(0, Math.PI * 2);
    var dist = rng.range(14, 24);
    var dx = Math.sin(angle) * dist;
    var dz = Math.cos(angle) * dist;
    var x = player.position.x + dx;
    var z = player.position.z + dz;
    // If the spot is blocked, move to the opposite side of the player.
    if (game.world && typeof game.world.isBlocked === 'function' &&
        game.world.isBlocked(x, z, 1)) {
      x = player.position.x - dx;
      z = player.position.z - dz;
    }
    var mesh = buildCopMesh();
    mesh.position.set(x, 0, z);
    mesh.rotation.y = angle;
    if (scene) scene.add(mesh);
    var cop = {
      mesh: mesh,
      health: 100,
      falling: false,
      fallTimer: 0,
      speed: rng.range(4.2, 5.0)
    };
    police.cops.push(cop);
    return cop;
  }

  function removeCruiser(index) {
    var cruiser = police.cruisers[index];
    if (!cruiser) return;
    police.cruisers.splice(index, 1);
    var vehicles = game.vehicles;
    if (vehicles && typeof vehicles.despawn === 'function') {
      vehicles.despawn(cruiser.vehicle);
    } else {
      if (scene && cruiser.vehicle && cruiser.vehicle.mesh) {
        scene.remove(cruiser.vehicle.mesh);
      }
      if (vehicles && vehicles.list) {
        var at = vehicles.list.indexOf(cruiser.vehicle);
        if (at !== -1) vehicles.list.splice(at, 1);
      }
    }
  }

  function removeCop(index) {
    var cop = police.cops[index];
    if (!cop) return;
    police.cops.splice(index, 1);
    if (scene && cop.mesh) scene.remove(cop.mesh);
  }

  function matchRoster() {
    var level = Math.max(0, Math.min(maxStars, police.wanted));
    var wantCruisers = ROSTER[level][0];
    var wantCops = ROSTER[level][1];
    while (police.cruisers.length < wantCruisers) {
      if (!spawnCruiser()) break;
    }
    while (police.cruisers.length > wantCruisers) {
      removeCruiser(police.cruisers.length - 1);
    }
    while (police.cops.length < wantCops) {
      if (!spawnCop()) break;
    }
    while (police.cops.length > wantCops) {
      removeCop(police.cops.length - 1);
    }
  }

  function angleTowards(current, target, maxStep) {
    var diff = target - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (diff > maxStep) diff = maxStep;
    if (diff < -maxStep) diff = -maxStep;
    return current + diff;
  }

  function distanceToPlayer(pos) {
    var player = game.player;
    var dx = player.position.x - pos.x;
    var dz = player.position.z - pos.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function updateCruisers(dt) {
    var player = game.player;
    for (var i = 0; i < police.cruisers.length; i++) {
      var cruiser = police.cruisers[i];
      var vehicle = cruiser.vehicle;
      if (!vehicle || !vehicle.mesh) continue;
      var pos = vehicle.mesh.position;
      var dx = player.position.x - pos.x;
      var dz = player.position.z - pos.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      var desired = Math.atan2(dx, dz);
      var wobble = Math.sin(game.time * 1.5 + cruiser.wobble) * 0.08;
      vehicle.heading = angleTowards(
        vehicle.heading, desired + wobble, CRUISER_TURN * dt);
      var targetSpeed = dist > 12 ? CRUISER_SPEED_FAR : CRUISER_SPEED_NEAR;
      // If the way ahead is blocked, swing around and halve speed.
      var aheadX = pos.x + Math.sin(vehicle.heading) * 4;
      var aheadZ = pos.z + Math.cos(vehicle.heading) * 4;
      if (game.world && typeof game.world.isBlocked === 'function' &&
          game.world.isBlocked(aheadX, aheadZ, 1)) {
        vehicle.heading += Math.PI;
        cruiser.speed *= 0.5;
      }
      cruiser.speed += (targetSpeed - cruiser.speed) * Math.min(1, dt * 2);
      vehicle.speed = cruiser.speed;
      pos.x += Math.sin(vehicle.heading) * cruiser.speed * dt;
      pos.z += Math.cos(vehicle.heading) * cruiser.speed * dt;
      vehicle.mesh.rotation.y = vehicle.heading;
      if (cruiser.ramTimer > 0) cruiser.ramTimer -= dt;
      // Ram the player on contact, at most once a second.
      if (dist < RAM_RANGE && cruiser.ramTimer <= 0) {
        cruiser.ramTimer = RAM_COOLDOWN;
        if (player.takeDamage) player.takeDamage(RAM_DAMAGE);
        if (player.car && player.car.position) {
          player.car.position.x += Math.sin(vehicle.heading) * RAM_SHOVE;
          player.car.position.z += Math.cos(vehicle.heading) * RAM_SHOVE;
          if (player.car.mesh) {
            player.car.mesh.position.copy(player.car.position);
          }
        }
        if (game.audio && typeof game.audio.punch === 'function') {
          game.audio.punch();
        }
      }
    }
  }

  function updateCops(dt) {
    var player = game.player;
    for (var i = police.cops.length - 1; i >= 0; i--) {
      var cop = police.cops[i];
      if (cop.falling) {
        cop.fallTimer -= dt;
        if (cop.fallTimer <= 0) removeCop(i);
        continue;
      }
      var pos = cop.mesh.position;
      var dx = player.position.x - pos.x;
      var dz = player.position.z - pos.z;
      var heading = Math.atan2(dx, dz);
      cop.mesh.rotation.y = heading;
      pos.x += Math.sin(heading) * cop.speed * dt;
      pos.z += Math.cos(heading) * cop.speed * dt;
      var phase = game.time * 10;
      var legL = cop.mesh.userData.legL;
      var legR = cop.mesh.userData.legR;
      if (legL) legL.rotation.x = Math.sin(phase) * 0.7;
      if (legR) legR.rotation.x = -Math.sin(phase) * 0.7;
    }
  }

  function updateArrest(dt) {
    var player = game.player;
    if (lastX === null) {
      lastX = player.position.x;
      lastZ = player.position.z;
      stillTimer = 0;
      return;
    }
    var moved = Math.sqrt(
      (player.position.x - lastX) * (player.position.x - lastX) +
      (player.position.z - lastZ) * (player.position.z - lastZ));
    if (moved < STILL_DISTANCE) {
      stillTimer += dt;
    } else {
      stillTimer = 0;
      lastX = player.position.x;
      lastZ = player.position.z;
    }
    if (stillTimer < arrestSeconds) return;
    for (var i = 0; i < police.cops.length; i++) {
      var cop = police.cops[i];
      if (cop.falling) continue;
      if (distanceToPlayer(cop.mesh.position) <= arrestRadius) {
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

  function updateDecay(dt) {
    var nearest = Infinity;
    for (var i = 0; i < police.cruisers.length; i++) {
      var vehicle = police.cruisers[i].vehicle;
      if (vehicle && vehicle.mesh) {
        nearest = Math.min(nearest, distanceToPlayer(vehicle.mesh.position));
      }
    }
    for (var j = 0; j < police.cops.length; j++) {
      var cop = police.cops[j];
      if (cop.falling) continue;
      nearest = Math.min(nearest, distanceToPlayer(cop.mesh.position));
    }
    if (nearest > hiddenDistance) {
      decayTimer += dt;
      if (decayTimer >= decaySeconds && police.wanted > 0) {
        police.wanted -= 1;
        decayTimer = 0;
        emitWantedChanged();
        game.wanted = police.wanted;
      }
    } else {
      decayTimer = 0;
    }
  }

  function update(dt) {
    // The police module owns the wanted level; publish it every frame.
    game.wanted = police.wanted;
    if (game.state !== 'playing') return;
    if (!game.player || !game.player.position) return;

    setSiren(police.wanted >= 1);
    matchRoster();

    if (police.wanted === 0) {
      // No heat: only the roster is kept in step, arrest tracking resets.
      stillTimer = 0;
      lastX = null;
      lastZ = null;
      decayTimer = 0;
      return;
    }

    updateCruisers(dt);
    updateCops(dt);
    updateArrest(dt);
    updateDecay(dt);
  }

  return police;
}

export { createPolice };
