// combat.js — bullets, melee and pickups for Sunport Heist.
// Owns every projectile and every cash/ammo pickup on the street.

export function createCombat(game) {
  const THREE = game.THREE;
  const cfg = game.config || {};
  const BULLET_SPEED = 60;
  const BULLET_LIFE = 1.5;
  const PUNCH_RANGE = 2.2;
  const PUNCH_ARC = 1.0; // radians either side of the player's heading
  const PUNCH_COOLDOWN = 0.5;
  const PICKUP_RADIUS = 1.5;
  const CASH_MIN = (cfg.pickupCash && cfg.pickupCash.min) || cfg.pickupCashMin || 25;
  const CASH_MAX = (cfg.pickupCash && cfg.pickupCash.max) || cfg.pickupCashMax || 100;
  const AMMO_AMOUNT = cfg.pickupAmmo || 12;
  const COP_DAMAGE = 34;

  const combat = {
    bullets: [],
    pickups: [],
    punch,
    shoot,
    spawnPickup,
    update,
  };

  let punchTimer = 0;
  const puffs = [];
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

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

  function playerPos() {
    return game.player && game.player.position;
  }

  function addHeat(n) {
    if (game.police && game.police.addHeat) game.police.addHeat(n);
  }

  function entityPos(e) {
    if (!e) return null;
    if (e.position) return e.position;
    if (e.mesh && e.mesh.position) return e.mesh.position;
    return null;
  }

  // Is a target inside the melee arc in front of the player?
  function inArc(targetPos) {
    const p = playerPos();
    if (!p) return false;
    const dx = targetPos.x - p.x;
    const dz = targetPos.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > PUNCH_RANGE) return false;
    const heading = game.player.heading || 0;
    const angleTo = Math.atan2(dx, dz);
    let diff = angleTo - heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) <= PUNCH_ARC;
  }

  function punch() {
    if (punchTimer > 0) return;
    punchTimer = PUNCH_COOLDOWN;
    if (game.audio && game.audio.punch) game.audio.punch();

    // Pedestrians in the arc go down and the law notices.
    if (game.peds && game.peds.list) {
      for (const ped of game.peds.list) {
        const pos = entityPos(ped);
        if (!pos || ped.down) continue;
        if (inArc(pos)) {
          if (game.peds.knockDown) game.peds.knockDown(ped);
          addHeat(1);
          maybeDropPickup(pos);
          break; // one victim per swing
        }
      }
    }
    // A cop in the arc takes damage and the heat rises.
    if (game.police && game.police.cops) {
      for (const cop of game.police.cops) {
        if (cop.falling) continue;
        const pos = entityPos(cop);
        if (!pos) continue;
        if (inArc(pos)) {
          game.police.damageCop(cop, COP_DAMAGE);
          addHeat(1);
          break;
        }
      }
    }
  }

  function mouseGroundPoint() {
    const mouse = game.input && game.input.mouse;
    const camera = game.camera;
    if (!mouse || !camera) return null;
    if (typeof mouse.x !== 'number' || typeof mouse.y !== 'number') return null;
    // Mouse is in pixels; convert to normalised device coordinates.
    const w = (game.renderer && game.renderer.domElement && game.renderer.domElement.clientWidth) || 1;
    const h = (game.renderer && game.renderer.domElement && game.renderer.domElement.clientHeight) || 1;
    const ndc = new THREE.Vector2((mouse.x / w) * 2 - 1, -(mouse.y / h) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, hit)) return hit;
    return null;
  }

  function shoot() {
    if ((game.ammo || 0) <= 0) {
      if (game.audio && game.audio.click) game.audio.click();
      return;
    }
    game.ammo = (game.ammo || 0) - 1;
    const p = playerPos();
    if (!p) return;
    const origin = new THREE.Vector3(p.x, 1.4, p.z);
    let dir;
    const aim = mouseGroundPoint();
    if (aim) {
      dir = new THREE.Vector3(aim.x - origin.x, 0, aim.z - origin.z);
      if (dir.lengthSq() < 0.01) dir.set(Math.sin(game.player.heading || 0), 0, Math.cos(game.player.heading || 0));
      dir.normalize();
    } else {
      const h = game.player.heading || 0;
      dir = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
    }
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xfde047 })
    );
    mesh.position.copy(origin);
    if (game.scene) game.scene.add(mesh);
    combat.bullets.push({
      mesh,
      vel: new THREE.Vector3(dir.x * BULLET_SPEED, 0, dir.z * BULLET_SPEED),
      life: BULLET_LIFE,
    });
    if (game.audio && game.audio.shoot) game.audio.shoot();
    if (game.events) game.events.emit('gunshot', { x: p.x, z: p.z });
  }

  function spawnPickup(kind, x, z) {
    const isCash = kind === 'cash';
    const colour = isCash ? 0x22c55e : 0xfacc15;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.3, 0.5),
      new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.35 })
    );
    mesh.position.set(x, 0.7, z);
    if (game.scene) game.scene.add(mesh);
    const pickup = { kind: isCash ? 'cash' : 'ammo', mesh, baseY: 0.7, spin: randRange(0, Math.PI * 2) };
    combat.pickups.push(pickup);
    return pickup;
  }

  function maybeDropPickup(pos) {
    // Roughly one fallen pedestrian in three leaves something behind.
    if (rand() > 0.35) return;
    spawnPickup(rand() < 0.6 ? 'cash' : 'ammo', pos.x, pos.z);
  }

  function makePuff(pos) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xd6d3d1, transparent: true, opacity: 0.8 })
    );
    mesh.position.set(pos.x, 1.2, pos.z);
    if (game.scene) game.scene.add(mesh);
    puffs.push({ mesh, life: 0.3 });
  }

  function removeBullet(bullet) {
    const i = combat.bullets.indexOf(bullet);
    if (i >= 0) combat.bullets.splice(i, 1);
    if (bullet.mesh && game.scene) game.scene.remove(bullet.mesh);
  }

  function updateBullets(dt) {
    for (let i = combat.bullets.length - 1; i >= 0; i--) {
      const b = combat.bullets[i];
      b.life -= dt;
      b.mesh.position.x += b.vel.x * dt;
      b.mesh.position.z += b.vel.z * dt;
      const bx = b.mesh.position.x;
      const bz = b.mesh.position.z;
      let dead = b.life <= 0;
      if (!dead && game.world && game.world.isBlocked && game.world.isBlocked(bx, bz, 0.3)) {
        makePuff(b.mesh.position);
        dead = true;
      }
      if (!dead && game.peds && game.peds.list) {
        for (const ped of game.peds.list) {
          if (ped.down) continue;
          const pos = entityPos(ped);
          if (!pos) continue;
          if (Math.hypot(pos.x - bx, pos.z - bz) < 1.0) {
            if (game.peds.knockDown) game.peds.knockDown(ped);
            addHeat(1);
            maybeDropPickup(pos);
            dead = true;
            break;
          }
        }
      }
      if (!dead && game.police && game.police.cops) {
        for (const cop of game.police.cops) {
          if (cop.falling) continue;
          const pos = entityPos(cop);
          if (!pos) continue;
          if (Math.hypot(pos.x - bx, pos.z - bz) < 1.0) {
            game.police.damageCop(cop, COP_DAMAGE);
            addHeat(1);
            dead = true;
            break;
          }
        }
      }
      if (dead) removeBullet(b);
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const puff = puffs[i];
      puff.life -= dt;
      puff.mesh.scale.multiplyScalar(1 + dt * 4);
      puff.mesh.material.opacity = Math.max(0, puff.life / 0.3) * 0.8;
      if (puff.life <= 0) {
        if (game.scene) game.scene.remove(puff.mesh);
        puffs.splice(i, 1);
      }
    }
  }

  function updatePickups(dt) {
    const p = playerPos();
    const t = game.time || 0;
    for (let i = combat.pickups.length - 1; i >= 0; i--) {
      const pickup = combat.pickups[i];
      pickup.spin += dt * 2;
      pickup.mesh.rotation.y = pickup.spin;
      pickup.mesh.position.y = pickup.baseY + Math.sin(t * 3 + pickup.spin) * 0.15;
      if (!p) continue;
      const d = Math.hypot(pickup.mesh.position.x - p.x, pickup.mesh.position.z - p.z);
      if (d >= PICKUP_RADIUS) continue;
      if (pickup.kind === 'cash') {
        const amount = Math.floor(randRange(CASH_MIN, CASH_MAX + 1));
        game.cash = (game.cash || 0) + amount;
        if (game.audio && game.audio.cash) game.audio.cash();
        if (game.events) game.events.emit('cashCollected', { amount });
        if (game.message) game.message('+$' + amount);
      } else {
        if (game.player && game.player.addAmmo) game.player.addAmmo(AMMO_AMOUNT);
        else game.ammo = (game.ammo || 0) + AMMO_AMOUNT;
        if (game.audio && game.audio.pickup) game.audio.pickup();
      }
      if (game.events) game.events.emit('pickup', { kind: pickup.kind });
      if (game.scene) game.scene.remove(pickup.mesh);
      combat.pickups.splice(i, 1);
    }
  }

  function update(dt) {
    if (punchTimer > 0) punchTimer -= dt;
    updateBullets(dt);
    updatePickups(dt);
  }

  return combat;
}
