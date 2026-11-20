import * as THREE from '../vendor/three.min.js';

// Solmar on-foot player: a low-poly person built from boxes.
// Walks and runs on foot, drives when inside a car, punches and shoots
// through the combat system. P / Escape / F / M / Enter are handled by
// the main script, never here.

const SKIN = 0xd9a066;
const SHIRT = 0x2e6f8e;
const PANTS = 0x2b3242;
const HAIR = 0x1c1410;
const SHOE = 0x1a1a1a;

function makeBox(w, h, d, colour, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.85, metalness: 0.05 })
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function createPlayer(game) {
  const cfg = game.config || {};
  const walkSpeed = cfg.playerWalkSpeed || 6;
  const runSpeed = cfg.playerRunSpeed || 10;

  const group = new THREE.Group();
  const body = makeBox(0.55, 0.7, 0.32, SHIRT, 0, 1.15, 0);
  const head = makeBox(0.34, 0.34, 0.32, SKIN, 0, 1.72, 0);
  const hair = makeBox(0.36, 0.12, 0.34, HAIR, 0, 1.92, 0);
  const armL = makeBox(0.16, 0.62, 0.18, SHIRT, -0.37, 1.18, 0);
  const armR = makeBox(0.16, 0.62, 0.18, SHIRT, 0.37, 1.18, 0);
  const legL = makeBox(0.2, 0.72, 0.22, PANTS, -0.14, 0.42, 0);
  const legR = makeBox(0.2, 0.72, 0.22, PANTS, 0.14, 0.42, 0);
  const shoeL = makeBox(0.21, 0.1, 0.32, SHOE, 0, -0.7, 0.04);
  const shoeR = makeBox(0.21, 0.1, 0.32, SHOE, 0, -0.7, 0.04);
  // Pivot arms and legs at the top so the swing looks like a walk.
  armL.geometry.translate(0, -0.28, 0);
  armL.position.y = 1.46;
  armR.geometry.translate(0, -0.28, 0);
  armR.position.y = 1.46;
  legL.geometry.translate(0, -0.33, 0);
  legL.position.y = 0.78;
  legR.geometry.translate(0, -0.33, 0);
  legR.position.y = 0.78;
  // Shoes ride on the legs so they swing with the walk instead of
  // floating at the ground while the legs rotate.
  legL.add(shoeL);
  legR.add(shoeR);
  group.add(body, head, hair, armL, armR, legL, legR);
  group.position.set(0, 0, 0);
  if (game.scene) game.scene.add(group);

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundHit = new THREE.Vector3();
  const ndc = new THREE.Vector2();

  const player = {
    mesh: group,
    position: group.position,
    heading: 0,
    speed: 0,
    onFoot: true,
    car: null,
    swing: 0,

    enterCar(car) {
      player.car = car || null;
      player.onFoot = false;
      player.speed = 0;
      group.visible = false;
    },

    exitCar() {
      player.car = null;
      player.onFoot = true;
      player.speed = 0;
      group.visible = true;
    },

    takeDamage(n) {
      if (typeof game.health !== 'number') game.health = 100;
      game.health = Math.max(0, game.health - (n || 0));
      if (game.health > 0 && game.health < 30 && game.message) {
        game.message('Health low — find a health pickup!');
      }
      if (game.health <= 0 && game.message) {
        game.message('You are down! Get back on your feet.');
      }
    },

    heal(n) {
      if (typeof game.health !== 'number') game.health = 100;
      game.health = Math.min(100, game.health + (n || 0));
    },

    addAmmo(n) {
      if (typeof game.ammo !== 'number') game.ammo = 0;
      game.ammo = Math.max(0, game.ammo + (n || 0));
    },

    groundPointFromMouse() {
      const mouse = game.input && game.input.mouse;
      const camera = game.camera;
      if (!mouse || !camera) return null;
      const el = game.renderer && game.renderer.domElement;
      const w = (el && el.clientWidth) || 1280;
      const h = (el && el.clientHeight) || 720;
      let nx = mouse.x;
      let ny = mouse.y;
      // Mouse may arrive as pixels or as normalised -1..1 coordinates.
      if (Math.abs(nx) > 1.5 || Math.abs(ny) > 1.5) {
        nx = (nx / w) * 2 - 1;
        ny = -((ny / h) * 2 - 1);
      } else {
        ny = -ny;
      }
      ndc.set(nx, ny);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(groundPlane, groundHit)) {
        return { x: groundHit.x, z: groundHit.z };
      }
      return null;
    },

    update(dt) {
      if (game.state && game.state !== 'playing') return;
      const input = game.input;
      if (!input) return;

      // E enters or exits the nearest car, on foot or driving.
      if (input.pressed && input.pressed('KeyE')) {
        if (game.vehicles && game.vehicles.tryEnterOrExit) {
          game.vehicles.tryEnterOrExit();
        }
      }

      // While driving the body tracks the car and stays hidden.
      if (!player.onFoot && player.car) {
        group.position.copy(player.car.position);
        group.position.y = 0;
        group.rotation.y = player.car.heading || 0;
        player.heading = player.car.heading || 0;
        player.speed = Math.abs(player.car.speed || 0);
        return;
      }

      const down = (code) => (input.down ? input.down(code) : false);
      const fwd = (down('KeyW') || down('ArrowUp') ? 1 : 0) - (down('KeyS') || down('ArrowDown') ? 1 : 0);
      const strafe = (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0);
      const running = down('ShiftLeft') || down('ShiftRight');
      const targetSpeed = running ? runSpeed : walkSpeed;

      let mx = 0;
      let mz = 0;
      let moving = false;
      if (fwd !== 0 || strafe !== 0) {
        const len = Math.hypot(strafe, fwd) || 1;
        mx = (strafe / len) * targetSpeed * dt;
        mz = (fwd / len) * targetSpeed * dt;
        moving = true;
      }

      if (moving) {
        const world = game.world;
        const nx = group.position.x + mx;
        const nz = group.position.z + mz;
        const blocked = world && world.isBlocked ? world.isBlocked(nx, nz, 0.45) : false;
        if (!blocked) {
          group.position.x = nx;
          group.position.z = nz;
        } else {
          // Slide along a wall: try each axis on its own.
          const bx = world.isBlocked(group.position.x + mx, group.position.z, 0.45);
          const bz = world.isBlocked(group.position.x, group.position.z + mz, 0.45);
          if (!bx) group.position.x += mx;
          if (!bz) group.position.z += mz;
        }
        player.heading = Math.atan2(mx, mz);
        group.rotation.y = player.heading;
        player.speed = targetSpeed;
        player.swing += dt * targetSpeed * 1.6;
        const swing = Math.sin(player.swing) * 0.65;
        legL.rotation.x = swing;
        legR.rotation.x = -swing;
        armL.rotation.x = -swing * 0.8;
        armR.rotation.x = swing * 0.8;
        group.position.y = Math.abs(Math.sin(player.swing)) * 0.05;
      } else {
        player.speed = 0;
        legL.rotation.x *= 0.8;
        legR.rotation.x *= 0.8;
        armL.rotation.x *= 0.8;
        armR.rotation.x *= 0.8;
        group.position.y = 0;
      }

      // Keep inside the city bounds.
      if (game.world && game.world.bounds) {
        const b = game.world.bounds;
        group.position.x = Math.max(b.minX, Math.min(b.maxX, group.position.x));
        group.position.z = Math.max(b.minZ, Math.min(b.maxZ, group.position.z));
      }

      // Combat: J punches, K or a mouse click shoots.
      if (game.combat) {
        if (input.pressed && input.pressed('KeyJ')) game.combat.punch();
        const clicked = input.mouse && input.mouse.clicked;
        const kPressed = input.pressed && input.pressed('KeyK');
        if (clicked || kPressed) {
          let tx;
          let tz;
          if (clicked) {
            const pt = player.groundPointFromMouse();
            if (pt) {
              tx = pt.x;
              tz = pt.z;
            }
          }
          if (tx === undefined) {
            tx = group.position.x + Math.sin(player.heading) * 24;
            tz = group.position.z + Math.cos(player.heading) * 24;
          }
          if (game.combat.shoot) game.combat.shoot(tx, tz);
        }
      }
    },
  };

  return player;
}
