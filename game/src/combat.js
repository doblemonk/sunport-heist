import * as THREE from '../vendor/three.min.js';

export function createCombat(g) {
  const cfg = (g.config && g.config.pickups) || {};
  const REACH = cfg.punchReach || 2.2;
  const PUNCH_CD = cfg.punchCooldown || 0.45;
  const FIRE_CD = cfg.fireCooldown || 0.25;
  const B_SPEED = cfg.bulletSpeed || 60;
  const B_RANGE = cfg.bulletRange || 70;
  const PICK_R = cfg.pickupRadius || 2;
  const CASH_AMT = cfg.cashAmount || 100;
  const AMMO_AMT = cfg.ammoAmount || 12;
  const COP_DMG = cfg.copDamage || 34;
  const BULLET_Y = 1.2;

  const bullets = [];
  const pickups = [];
  let punchCd = 0;
  let fireCd = 0;

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPt = new THREE.Vector3();
  const bulletGeo = new THREE.BoxGeometry(0.12, 0.12, 0.7);
  const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffd94d });

  function heat(n) {
    if (g.police && g.police.addHeat) g.police.addHeat(n);
  }

  function heatVal(kind) {
    const pol = g.police || {};
    const w = (g.config && g.config.wanted) || {};
    if (kind === 'punch') {
      if (pol.HEAT_PUNCH != null) return pol.HEAT_PUNCH;
      return w.punchPed || w.punchPedHeat || 1;
    }
    if (pol.HEAT_HIT_COP != null) return pol.HEAT_HIT_COP;
    return w.hitCop || w.hitCopHeat || 1;
  }

  function aimPoint() {
    const p = g.player;
    const mx = g.input && g.input.mouseX;
    const my = g.input && g.input.mouseY;
    if (mx == null || my == null || !g.camera) {
      return { x: p.position.x + Math.sin(p.heading), z: p.position.z + Math.cos(p.heading) };
    }
    ndc.set((mx / window.innerWidth) * 2 - 1, -(my / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, g.camera);
    if (ray.ray.intersectPlane(ground, hitPt)) return { x: hitPt.x, z: hitPt.z };
    return { x: p.position.x, z: p.position.z };
  }

  function punch() {
    const p = g.player;
    const w = g.peds && g.peds.nearest ? g.peds.nearest(p.position.x, p.position.z, REACH) : null;
    if (w) {
      g.peds.knockDown(w);
      heat(heatVal('punch'));
    }
    if (g.audio && g.audio.punch) g.audio.punch();
  }

  function fireBullet(x, z, dx, dz) {
    const mesh = new THREE.Mesh(bulletGeo, bulletMat);
    mesh.position.set(x, BULLET_Y, z);
    mesh.rotation.y = Math.atan2(dx, dz);
    g.scene.add(mesh);
    bullets.push({ mesh, x, z, dx, dz, left: B_RANGE });
  }

  // One K press costs exactly 1 ammo in total: the player system already
  // charges 1 ammo and fires its own shot sound/event for KeyK, so the
  // combat projectile for KeyK must NOT charge again (a tap cost 2 ammo
  // before this split). Mouse clicks are combat-only, so they charge here.
  function shoot(charge) {
    if (g.ammo <= 0) return false;
    if (charge) g.ammo -= 1;
    const p = g.player;
    const t = aimPoint();
    let dx = t.x - p.position.x;
    let dz = t.z - p.position.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    fireBullet(p.position.x + dx, p.position.z + dz, dx, dz);
    if (g.events) g.events.emit('gunshot', { x: p.position.x, z: p.position.z });
    if (g.audio && g.audio.gunshot) g.audio.gunshot();
    return true;
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.dx * B_SPEED * dt;
      b.z += b.dz * B_SPEED * dt;
      b.left -= B_SPEED * dt;
      b.mesh.position.set(b.x, BULLET_Y, b.z);
      let dead = b.left <= 0;
      if (!dead && g.world && g.world.isBlocked(b.x, b.z, 0.3)) dead = true;
      if (!dead && g.police) {
        for (const cop of g.police.cops) {
          if (cop.falling) continue;
          const cp = cop.mesh.position;
          if (Math.hypot(b.x - cp.x, b.z - cp.z) < 1.2) {
            g.police.damageCop(cop, COP_DMG);
            heat(heatVal('hitCop'));
            dead = true;
            break;
          }
        }
      }
      if (!dead && g.peds) {
        for (const w of g.peds.list) {
          if (w.state === 'down') continue;
          if (Math.hypot(b.x - w.position.x, b.z - w.position.z) < 1.1) {
            g.peds.knockDown(w);
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        g.scene.remove(b.mesh);
        bullets.splice(i, 1);
      }
    }
  }

  function pickupMesh(type) {
    const grp = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.35, 0.5),
      new THREE.MeshLambertMaterial({ color: type === 'ammo' ? 0xff8c1a : 0x2fae4e })
    );
    box.position.y = 0.4;
    grp.add(box);
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.36),
      new THREE.MeshLambertMaterial({ color: type === 'ammo' ? 0x333333 : 0xd8f7c0 })
    );
    lid.position.y = 0.62;
    grp.add(lid);
    return grp;
  }

  function spawnPickup(type, x, z) {
    const mesh = pickupMesh(type);
    mesh.position.set(x, 0, z);
    g.scene.add(mesh);
    const pk = { type, mesh, x, z };
    pickups.push(pk);
    return pk;
  }

  function updatePickups(dt) {
    const p = g.player.position;
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pk = pickups[i];
      pk.mesh.rotation.y += dt * 1.5;
      if (Math.hypot(p.x - pk.x, p.z - pk.z) < PICK_R) {
        if (pk.type === 'ammo') {
          g.ammo += AMMO_AMT;
          if (g.message) g.message('+' + AMMO_AMT + ' ammo');
        } else {
          g.cash += CASH_AMT;
          if (g.message) g.message('+$' + CASH_AMT);
        }
        if (g.audio && g.audio.pickup) g.audio.pickup();
        g.scene.remove(pk.mesh);
        pickups.splice(i, 1);
      }
    }
  }

  function update(dt) {
    if (g.state !== 'playing') return;
    punchCd -= dt;
    fireCd -= dt;
    if (g.player.onFoot) {
      if (g.input.down('KeyJ') && punchCd <= 0) {
        punchCd = PUNCH_CD;
        punch();
      }
      if (g.input.down('KeyK') && fireCd <= 0) {
        if (shoot(false)) fireCd = FIRE_CD;
      } else if (g.input.clicked && fireCd <= 0) {
        if (shoot(true)) fireCd = FIRE_CD;
      }
    }
    updateBullets(dt);
    updatePickups(dt);
  }

  return { spawnPickup, update };
}
