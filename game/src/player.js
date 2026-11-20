import * as THREE from '../vendor/three.min.js';

// Player on foot: Rafi "Reef" Marlowe.
// Walks with WASD / arrows, runs with Shift, punches with J, shoots
// with K or a mouse click, enters / exits cars with E (via vehicles).
// The game object owns the shared totals (health, ammo, cash, wanted)
// and the state; this module only reads them and updates them in place.

function fallbackRng() {
  return {
    next: function () { return 0.5; },
    range: function (a, b) { return a + (b - a) * 0.5; },
    int: function (a, b) { return a; },
    pick: function (list) { return list[0]; },
    shuffle: function (list) { return list.slice(); },
  };
}

function clamp(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

export function createPlayer(game) {
  const config = game.config || {};
  const rng = game.rng || fallbackRng();
  const walkSpeed = config.playerWalkSpeed || 4;
  const runSpeed = config.playerRunSpeed || 8;
  const radius = 0.5;

  // --- Low-poly visible character -------------------------------------
  const shirt = rng.pick([0x2e8b8b, 0x3a7d44, 0xc96f2e, 0x4a6fa5, 0x8b2e4a]);
  const trousers = rng.pick([0x2b2f36, 0x3d3a2e, 0x2e3a4a]);
  const skin = 0xd9a066;
  const bodyMat = new THREE.MeshLambertMaterial({ color: shirt });
  const legMat = new THREE.MeshLambertMaterial({ color: trousers });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x1c1410 });

  const mesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.32), bodyMat);
  body.position.y = 1.19;
  mesh.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skinMat);
  head.position.y = 1.72;
  mesh.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.34), hairMat);
  hair.position.y = 1.92;
  mesh.add(hair);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.36), bodyMat);
  cap.position.y = 1.86;
  mesh.add(cap);

  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.14 * side, 0.86, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.84, 0.22), legMat);
    leg.position.y = -0.42;
    pivot.add(leg);
    mesh.add(pivot);
    return pivot;
  }

  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.36 * side, 1.48, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), skinMat);
    arm.position.y = -0.31;
    pivot.add(arm);
    mesh.add(pivot);
    return pivot;
  }

  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // --- Starting position: the hideout, from the world if it has one ---
  let startX = 0;
  let startZ = 0;
  let startHeading = 0;
  if (game.world && game.world.spawnPoints && game.world.spawnPoints.hideout) {
    const hideout = game.world.spawnPoints.hideout;
    startX = hideout.x || 0;
    startZ = hideout.z || 0;
    startHeading = hideout.heading || 0;
  }

  const position = new THREE.Vector3(startX, 0, startZ);
  mesh.position.copy(position);
  mesh.rotation.y = startHeading;
  if (game.scene) game.scene.add(mesh);

  let swing = 0;
  let punchTimer = 0;
  let shootTimer = 0;
  const tracers = [];

  function aimPoint() {
    // Prefer a cursor aim point if the input system exposes one,
    // otherwise aim straight ahead of the player.
    const input = game.input || {};
    if (input.aimX !== undefined && input.aimZ !== undefined) {
      return { x: input.aimX, z: input.aimZ };
    }
    if (input.mouseWorldX !== undefined && input.mouseWorldZ !== undefined) {
      return { x: input.mouseWorldX, z: input.mouseWorldZ };
    }
    if (game.shot && game.shot.x !== undefined && game.shot.z !== undefined) {
      return { x: game.shot.x, z: game.shot.z };
    }
    const reach = 24;
    return {
      x: position.x + Math.sin(player.heading) * reach,
      z: position.z + Math.cos(player.heading) * reach,
    };
  }

  function fireTracer(target) {
    if (!game.scene) return;
    const from = { x: position.x, y: 1.35, z: position.z };
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const tracer = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, len),
      new THREE.MeshBasicMaterial({ color: 0xffe9a3 })
    );
    tracer.position.set(from.x + dx / 2, from.y, from.z + dz / 2);
    tracer.rotation.y = Math.atan2(dx, dz);
    game.scene.add(tracer);
    tracers.push({ mesh: tracer, life: 0.09 });
  }

  function updateTracers(dt) {
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        if (game.scene) game.scene.remove(tracers[i].mesh);
        tracers.splice(i, 1);
      }
    }
  }

  function tryPunch() {
    if (game.audio && typeof game.audio.punch === 'function') game.audio.punch();
    let hit = null;
    if (game.peds && typeof game.peds.nearest === 'function') {
      hit = game.peds.nearest(position.x, position.z, 2);
    }
    if (hit) {
      if (typeof game.peds.knockDown === 'function') game.peds.knockDown(hit);
      if (game.police && typeof game.police.addHeat === 'function') {
        const heat = game.police.HEAT_PUNCH || 1;
        game.police.addHeat(heat);
      }
      if (typeof game.message === 'function') game.message('Pedestrian down — heat is on');
    }
  }

  function tryShoot() {
    if (game.ammo !== undefined && game.ammo <= 0) {
      if (typeof game.message === 'function') game.message('Out of ammo');
      return;
    }
    if (game.ammo !== undefined) game.ammo -= 1;
    const target = aimPoint();
    if (game.combat && typeof game.combat.shoot === 'function') {
      game.combat.shoot(position.x, position.z, target.x, target.z);
    } else {
      fireTracer(target);
    }
    if (game.events && typeof game.events.emit === 'function') {
      game.events.emit('gunshot', { x: target.x, z: target.z });
    }
    if (game.audio && typeof game.audio.gunshot === 'function') game.audio.gunshot();
    else if (game.audio && typeof game.audio.shoot === 'function') game.audio.shoot();
  }

  const player = {
    position,
    heading: startHeading,
    speed: 0,
    onFoot: true,
    car: null,
    mesh,
    legL,
    legR,
    armL,
    armR,

    enterCar(car) {
      player.car = car || null;
      player.onFoot = false;
      player.speed = 0;
      if (car && car.position) position.copy(car.position);
      mesh.visible = false;
    },

    exitCar() {
      const car = player.car;
      player.car = null;
      player.onFoot = true;
      player.speed = 0;
      if (car && car.position) {
        const rightX = Math.cos(car.heading || 0);
        const rightZ = -Math.sin(car.heading || 0);
        position.set(car.position.x + rightX * 2.4, 0, car.position.z + rightZ * 2.4);
        player.heading = car.heading || 0;
      }
      mesh.position.copy(position);
      mesh.rotation.y = player.heading;
      mesh.visible = true;
    },

    takeDamage(n) {
      if (game.health === undefined) game.health = 100;
      game.health = Math.max(0, game.health - n);
      if (game.health <= 0) {
        if (game.audio && typeof game.audio.busted === 'function') game.audio.busted();
        if (game.events && typeof game.events.emit === 'function') {
          game.events.emit('busted', {});
        }
        if (typeof game.setState === 'function') game.setState('busted');
      }
    },

    heal(n) {
      if (game.health === undefined) game.health = 100;
      game.health = Math.min(100, game.health + n);
    },

    update(dt) {
      if (punchTimer > 0) punchTimer -= dt;
      if (shootTimer > 0) shootTimer -= dt;
      updateTracers(dt);
      if (game.state !== 'playing') return;

      // In a car the player rides along with it; driving is vehicles' job.
      if (!player.onFoot) {
        if (player.car && player.car.position) {
          position.copy(player.car.position);
          player.heading = player.car.heading || player.heading;
        }
        mesh.position.copy(position);
        mesh.visible = false;
        player.speed = player.car ? (player.car.speed || 0) : 0;
        return;
      }
      mesh.visible = true;

      const input = game.input;
      const down = input && typeof input.down === 'function'
        ? function (key) { return input.down(key); }
        : function () { return false; };

      let dx = 0;
      let dz = 0;
      if (down('KeyW') || down('ArrowUp')) dz -= 1;
      if (down('KeyS') || down('ArrowDown')) dz += 1;
      if (down('KeyA') || down('ArrowLeft')) dx -= 1;
      if (down('KeyD') || down('ArrowRight')) dx += 1;

      const moving = dx !== 0 || dz !== 0;
      const running = down('ShiftLeft') || down('ShiftRight');
      const targetSpeed = moving ? (running ? runSpeed : walkSpeed) : 0;
      player.speed = targetSpeed;

      if (moving) {
        const len = Math.sqrt(dx * dx + dz * dz);
        dx /= len;
        dz /= len;
        player.heading = Math.atan2(dx, dz);
        const stepX = dx * player.speed * dt;
        const stepZ = dz * player.speed * dt;
        const blocked = game.world && typeof game.world.isBlocked === 'function'
          ? function (x, z) { return game.world.isBlocked(x, z, radius); }
          : function () { return false; };
        const nextX = position.x + stepX;
        const nextZ = position.z + stepZ;
        if (!blocked(nextX, nextZ)) {
          position.x = nextX;
          position.z = nextZ;
        } else if (!blocked(nextX, position.z)) {
          position.x = nextX;
        } else if (!blocked(position.x, nextZ)) {
          position.z = nextZ;
        }
        swing += dt * player.speed * 1.9;
      }

      // Walk / run limb swing, easing back to neutral when standing still.
      const swingAmp = moving ? (running ? 0.75 : 0.55) : 0;
      const s = Math.sin(swing) * swingAmp;
      legL.rotation.x = s;
      legR.rotation.x = -s;
      armL.rotation.x = -s * 0.8;
      armR.rotation.x = s * 0.8;

      mesh.position.copy(position);
      mesh.rotation.y = player.heading;

      if (down('KeyJ') && punchTimer <= 0) {
        punchTimer = 0.45;
        tryPunch();
      }
      // Clicking fires too. The input system tracks the mouse as
      // input.mouse.down (there is no down('Mouse0') key code), so
      // read that alongside the key codes. input.mouse.clicked is a
      // latch that catches quick clicks between frames, so consume
      // it here: one click fires exactly once.
      const mouse = input.mouse || {};
      let clicking = down('Mouse0') || down('MouseLeft') || down('Click') ||
        mouse.down === true;
      if (mouse.clicked === true) {
        clicking = true;
        mouse.clicked = false;
      }
      if ((down('KeyK') || clicking) && shootTimer <= 0) {
        shootTimer = 0.25;
        tryShoot();
      }
    },
  };

  return player;
}
