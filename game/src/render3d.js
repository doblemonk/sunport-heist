// Sunport Heist — the 3D look. Low-poly procedural Three.js rendering of
// the city of Solmar: ground, buildings, cars, people, police, markers and
// the follow camera. All gameplay logic still lives in the other files;
// this file only turns their state into meshes, one frame at a time.
// World (x, y) maps to Three (x - WORLD_W/2, 0, y - WORLD_H/2), and a
// world angle a becomes rotation.y = -a, so a mesh built facing +X points
// the way the logic says it faces.
import * as THREE from 'three';
import { DISTRICTS, ROAD_HALF, ROAD_W, ROAD_X, ROAD_Y, WORLD_H, WORLD_W } from './config.js';
import { missionMarker } from './missions.js';

const CX = WORLD_W / 2;
const CZ = WORLD_H / 2;

function toX(x) { return x - CX; }
function toZ(y) { return y - CZ; }

function hash2(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const matCache = new Map();
function lambert(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}
function emissiveMat(color) {
  const key = `e:${color}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.9 }));
  }
  return matCache.get(key);
}

// The whole ground as one painted texture: districts, the sea, roads,
// dashes, crosswalks and district names, drawn once on a canvas.
function groundTexture() {
  const scale = 0.5;
  const cv = document.createElement('canvas');
  cv.width = Math.round((WORLD_W + 240) * scale);
  cv.height = Math.round(WORLD_H * scale);
  const g = cv.getContext('2d');
  g.fillStyle = '#3f9ec4';
  g.fillRect(0, 0, cv.width, cv.height);
  g.translate(120, 0);
  for (const d of DISTRICTS) {
    g.fillStyle = d.ground;
    g.fillRect(d.x0 * scale, d.y0 * scale, (d.x1 - d.x0) * scale, (d.y1 - d.y0) * scale);
  }
  g.fillStyle = '#57b6d9';
  for (let y = 40; y < WORLD_H; y += 130) g.fillRect(-110, y * scale, 85, 3);
  g.fillStyle = '#3a3f47';
  for (const rx of ROAD_X) g.fillRect((rx - ROAD_HALF) * scale, 0, ROAD_W * scale, WORLD_H * scale);
  for (const ry of ROAD_Y) g.fillRect(0, (ry - ROAD_HALF) * scale, WORLD_W * scale, ROAD_W * scale);
  g.fillStyle = '#e8d44f';
  for (const rx of ROAD_X) {
    for (let y = 20; y < WORLD_H; y += 90) g.fillRect((rx - 3) * scale, y * scale, 3, 22);
  }
  for (const ry of ROAD_Y) {
    for (let x = 20; x < WORLD_W; x += 90) g.fillRect(x * scale, (ry - 3) * scale, 22, 3);
  }
  g.fillStyle = '#e8e4da';
  for (const rx of ROAD_X) {
    for (const ry of ROAD_Y) {
      for (let k = -2; k <= 2; k += 1) {
        g.fillRect((rx + k * 18 - 6) * scale, (ry - ROAD_HALF + 6) * scale, 6, 9);
        g.fillRect((rx + k * 18 - 6) * scale, (ry + ROAD_HALF - 24) * scale, 6, 9);
      }
    }
  }
  g.font = `bold ${Math.round(34 * scale)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  for (const d of DISTRICTS) {
    g.fillStyle = d.label;
    g.globalAlpha = 0.55;
    g.fillText(d.name.toUpperCase(), ((d.x0 + d.x1) / 2) * scale, ((d.y0 + d.y1) / 2) * scale);
    g.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitSphere = new THREE.SphereGeometry(1, 10, 8);
const unitCone = new THREE.ConeGeometry(1, 1, 8);
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 10);

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}
function sphere(r, mat, x, y, z) {
  const m = new THREE.Mesh(unitSphere, mat);
  m.scale.setScalar(r);
  m.position.set(x, y, z);
  return m;
}

function buildCarMesh(car) {
  const group = new THREE.Group();
  const bodyMat = lambert(car.color);
  const body = box(52, 9, 26, bodyMat, 0, 7, 0);
  body.castShadow = true;
  group.add(body);
  const cabinMat = car.kind === 'police' ? lambert('#e8e4da') : lambert('#1f2937');
  const cabin = box(20, 8, 22, cabinMat, -2, 15, 0);
  cabin.castShadow = true;
  group.add(cabin);
  const glass = box(5, 6, 20, lambert('#9ecfe8'), 9, 14, 0);
  group.add(glass);
  const wheelMat = lambert('#14181f');
  for (const [wx, wz] of [[17, 12], [17, -12], [-17, 12], [-17, -12]]) {
    const wheel = new THREE.Mesh(unitCyl, wheelMat);
    wheel.scale.set(6, 4, 6);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 6, wz);
    group.add(wheel);
  }
  group.add(box(2, 4, 6, emissiveMat('#ffe98a'), 26, 7, 9));
  group.add(box(2, 4, 6, emissiveMat('#ffe98a'), 26, 7, -9));
  group.add(box(2, 4, 6, emissiveMat('#d94f3d'), -26, 7, 9));
  group.add(box(2, 4, 6, emissiveMat('#d94f3d'), -26, 7, -9));
  let lightL = null;
  let lightR = null;
  if (car.kind === 'police') {
    lightL = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: '#e5484d', emissive: '#e5484d', emissiveIntensity: 1 }));
    lightL.scale.set(8, 4, 9);
    lightL.position.set(-2, 21, -6);
    lightR = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: '#3d7bd9', emissive: '#3d7bd9', emissiveIntensity: 1 }));
    lightR.scale.set(8, 4, 9);
    lightR.position.set(-2, 21, 6);
    group.add(lightL);
    group.add(lightR);
  }
  group.userData = { lightL, lightR, bodyMat };
  return group;
}

function buildPersonMesh(color, kind) {
  // A low-poly person built facing +X: legs, torso, arms, head.
  const group = new THREE.Group();
  const shirt = lambert(color);
  const skin = lambert('#e8b98a');
  const dark = lambert('#2f2a26');
  const legL = box(5, 11, 5, dark, 0, 5.5, 3.5);
  const legR = box(5, 11, 5, dark, 0, 5.5, -3.5);
  const torso = box(11, 16, 13, shirt, 0, 19, 0);
  torso.castShadow = true;
  const armL = box(4, 13, 4, shirt, 0, 20, 8.5);
  const armR = box(4, 13, 4, shirt, 0, 20, -8.5);
  const head = sphere(6, skin, 2, 32, 0);
  head.castShadow = true;
  group.add(legL, legR, torso, armL, armR, head);
  if (kind === 'player') {
    const hair = sphere(5.5, lambert('#f2c14e'), 0, 35, 0);
    hair.scale.set(1, 0.7, 1);
    group.add(hair);
  } else if (kind === 'cop') {
    const hat = new THREE.Mesh(unitCyl, lambert('#16283f'));
    hat.scale.set(6.5, 3, 6.5);
    hat.position.set(2, 37, 0);
    const brim = new THREE.Mesh(unitCyl, lambert('#16283f'));
    brim.scale.set(8, 1, 8);
    brim.position.set(2, 35.5, 0);
    group.add(hat, brim);
    const badge = box(2, 3, 4, emissiveMat('#e8b93c'), 6, 24, 0);
    group.add(badge);
  } else {
    const hair = sphere(5.5, lambert('#2f2a26'), 0, 35, 0);
    hair.scale.set(1, 0.7, 1);
    group.add(hair);
  }
  group.userData = { shirt };
  return group;
}

export function createRenderer3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#87b5d6');
  scene.fog = new THREE.Fog('#87b5d6', 900, 2600);
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 6000);
  const hemi = new THREE.HemisphereLight('#bcd8ff', '#5c6656', 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2d0', 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -500;
  sun.shadow.camera.right = 500;
  sun.shadow.camera.top = 500;
  sun.shadow.camera.bottom = -500;
  sun.shadow.camera.far = 3000;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  let game = null;
  let staticGroup = null;
  const carMeshes = new Map();
  const pedMeshes = new Map();
  const copMeshes = new Map();
  const pickupMeshes = new Map();
  const bulletMeshes = [];
  let playerMesh = null;
  let markerGroup = null;
  let markerRing = null;
  let markerBeam = null;
  let camPos = new THREE.Vector3(0, 300, 400);
  let camLook = new THREE.Vector3(0, 0, 0);
  let snapped = false;

  function disposeGroup(group) {
    group.traverse((o) => {
      if (o.geometry && o.geometry !== unitBox && o.geometry !== unitSphere && o.geometry !== unitCone && o.geometry !== unitCyl) o.geometry.dispose();
    });
    scene.remove(group);
  }

  function buildStatic(world) {
    if (staticGroup) disposeGroup(staticGroup);
    staticGroup = new THREE.Group();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_W + 240, WORLD_H),
      new THREE.MeshLambertMaterial({ map: groundTexture() }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(-120, 0, 0);
    ground.receiveShadow = true;
    staticGroup.add(ground);
    // The sea, a flat blue plane west of the sand that the texture shows.
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(240, WORLD_H),
      new THREE.MeshLambertMaterial({ color: '#3f9ec4' }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(-CX - 120, -0.5, 0);
    staticGroup.add(sea);

    for (const b of world.buildings) {
      const h = b.tall ? 70 + hash2(b.x, b.y) * 70 : 18 + hash2(b.x, b.y) * 22;
      const mesh = box(b.w, h, b.h, lambert(b.color), toX(b.x + b.w / 2), h / 2, toZ(b.y + b.h / 2));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      staticGroup.add(mesh);
      const roof = box(b.w * 0.86, 3, b.h * 0.86, lambert('#e8e4da'), toX(b.x + b.w / 2), h + 1.5, toZ(b.y + b.h / 2));
      staticGroup.add(roof);
      if (b.tall) {
        const crown = box(14, 10, 14, lambert('#5f6b7a'), toX(b.x + b.w / 2), h + 8, toZ(b.y + b.h / 2));
        staticGroup.add(crown);
      }
    }
    for (const c of world.containers) {
      const mesh = box(c.w, 16, c.h, lambert(c.color), toX(c.x), 8, toZ(c.y));
      mesh.rotation.y = c.angle === 0 ? 0 : Math.PI / 2;
      mesh.castShadow = true;
      staticGroup.add(mesh);
    }
    for (const t of world.trees) {
      const trunk = new THREE.Mesh(unitCyl, lambert('#6b4a2f'));
      trunk.scale.set(3, 12, 3);
      trunk.position.set(toX(t.x), 6, toZ(t.y));
      const top = new THREE.Mesh(unitCone, lambert('#3f7a44'));
      top.scale.set(t.r * 1.4, 26, t.r * 1.4);
      top.position.set(toX(t.x), 24, toZ(t.y));
      top.castShadow = true;
      staticGroup.add(trunk, top);
    }
    for (const u of world.beachUmbrellas) {
      const pole = new THREE.Mesh(unitCyl, lambert('#e8e4da'));
      pole.scale.set(1.5, 22, 1.5);
      pole.position.set(toX(u.x), 11, toZ(u.y));
      const top = new THREE.Mesh(unitCone, lambert('#d94f3d'));
      top.scale.set(18, 10, 18);
      top.position.set(toX(u.x), 26, toZ(u.y));
      staticGroup.add(pole, top);
    }
    scene.add(staticGroup);
  }

  function setGame(nextGame) {
    game = nextGame;
    for (const m of carMeshes.values()) scene.remove(m);
    for (const m of pedMeshes.values()) scene.remove(m);
    for (const m of copMeshes.values()) scene.remove(m);
    for (const m of pickupMeshes.values()) scene.remove(m);
    for (const m of bulletMeshes) scene.remove(m);
    carMeshes.clear();
    pedMeshes.clear();
    copMeshes.clear();
    pickupMeshes.clear();
    bulletMeshes.length = 0;
    if (playerMesh) { scene.remove(playerMesh); playerMesh = null; }
    if (markerGroup) { scene.remove(markerGroup); markerGroup = null; }
    buildStatic(game.world);
    playerMesh = buildPersonMesh('#0f766e', 'player');
    scene.add(playerMesh);
    markerGroup = new THREE.Group();
    markerRing = new THREE.Mesh(new THREE.TorusGeometry(34, 3, 8, 40), emissiveMat('#e8b93c'));
    markerRing.rotation.x = Math.PI / 2;
    markerRing.position.y = 3;
    markerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(14, 14, 320, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#e8b93c', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    markerBeam.position.y = 160;
    const cone = new THREE.Mesh(unitCone, emissiveMat('#e8b93c'));
    cone.scale.set(14, 26, 14);
    cone.rotation.x = Math.PI;
    cone.position.y = 84;
    markerGroup.add(markerRing, markerBeam, cone);
    scene.add(markerGroup);
    snapped = false;
  }

  function syncPerson(mesh, obj, time, moving) {
    mesh.position.set(toX(obj.x), obj.down ? 5 : 0, toZ(obj.y));
    if (obj.down) {
      mesh.rotation.set(0, -obj.angle, Math.PI / 2);
      return;
    }
    mesh.rotation.set(0, -obj.angle, 0);
    if (moving) mesh.position.y = Math.abs(Math.sin(time * 10 + obj.x * 0.1)) * 2;
  }

  function syncCars(list, map, time) {
    const seen = new Set();
    for (const car of list) {
      seen.add(car);
      let mesh = map.get(car);
      if (!mesh) {
        mesh = buildCarMesh(car);
        map.set(car, mesh);
        scene.add(mesh);
      }
      mesh.position.set(toX(car.x), 0, toZ(car.y));
      mesh.rotation.y = -car.angle;
      if (car.kind === 'police' && mesh.userData.lightL) {
        const phase = Math.floor(time * 6) % 2 === 0;
        mesh.userData.lightL.material.emissiveIntensity = phase ? 1.6 : 0.15;
        mesh.userData.lightR.material.emissiveIntensity = phase ? 0.15 : 1.6;
      }
    }
    for (const [car, mesh] of [...map.entries()]) {
      if (!seen.has(car)) {
        scene.remove(mesh);
        map.delete(car);
      }
    }
  }

  function updateLighting(hour) {
    const night = hour >= 18 || hour < 6;
    const dusk = !night && hour >= 16;
    if (night) {
      scene.background.set('#0d1526');
      scene.fog.color.set('#0d1526');
      sun.intensity = 0.35;
      sun.color.set('#8fa8d8');
      hemi.intensity = 0.35;
    } else if (dusk) {
      scene.background.set('#e8a06a');
      scene.fog.color.set('#e8a06a');
      sun.intensity = 1.1;
      sun.color.set('#ffb070');
      hemi.intensity = 0.7;
    } else {
      scene.background.set('#87b5d6');
      scene.fog.color.set('#87b5d6');
      sun.intensity = 1.6;
      sun.color.set('#fff2d0');
      hemi.intensity = 0.9;
    }
    const sunAngle = ((hour - 6) / 12) * Math.PI;
    const px = game ? toX(game.player.x) : 0;
    const pz = game ? toZ(game.player.y) : 0;
    sun.position.set(px + Math.cos(sunAngle) * 700, night ? 300 : 500 + Math.sin(sunAngle) * 300, pz + 400);
    sun.target.position.set(px, 0, pz);
  }

  function updateCamera(dt, mode) {
    const player = game.player;
    if (mode === 'start') {
      const t = game.time * 0.05;
      const cx = toX(1350 + Math.sin(t) * 300);
      const cz = toZ(750);
      const target = new THREE.Vector3(cx, 0, cz);
      const pos = new THREE.Vector3(cx + Math.cos(t * 0.6) * 420, 240, cz + Math.sin(t * 0.6) * 420);
      if (!snapped) { camPos.copy(pos); camLook.copy(target); snapped = true; }
      camPos.lerp(pos, 1 - Math.exp(-2 * dt));
      camLook.lerp(target, 1 - Math.exp(-2 * dt));
    } else {
      const focus = new THREE.Vector3(toX(player.x), 0, toZ(player.y));
      const a = player.angle;
      const dist = player.inCar ? 260 : 195;
      const height = player.inCar ? 155 : 125;
      const desired = new THREE.Vector3(
        focus.x - Math.cos(a) * dist,
        height,
        focus.z - Math.sin(a) * dist,
      );
      const look = new THREE.Vector3(focus.x + Math.cos(a) * 60, 18, focus.z + Math.sin(a) * 60);
      if (!snapped) { camPos.copy(desired); camLook.copy(look); snapped = true; }
      const k = 1 - Math.exp(-4.5 * dt);
      camPos.lerp(desired, k);
      camLook.lerp(look, k);
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }

  return {
    setGame,
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    // World-space direction the camera looks, projected on the ground:
    // WASD moves relative to this, so W always walks away from the camera.
    cameraForward() {
      const fx = camLook.x - camPos.x;
      const fz = camLook.z - camPos.z;
      const len = Math.hypot(fx, fz) || 1;
      return { x: fx / len, y: fz / len };
    },
    // Aim angle in world coordinates for a mouse position on screen.
    aimAngle(mouseX, mouseY, width, height) {
      const ndc = new THREE.Vector2((mouseX / width) * 2 - 1, -(mouseY / height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const o = ray.ray.origin;
      const d = ray.ray.direction;
      if (Math.abs(d.y) < 1e-6) return null;
      const t = -o.y / d.y;
      if (t < 0) return null;
      const wx = o.x + d.x * t + CX;
      const wy = o.z + d.z * t + CZ;
      return Math.atan2(wy - game.player.y, wx - game.player.x);
    },
    render(dt, mode) {
      if (!game) return;
      const hour = Math.floor(game.clockMinutes / 60);
      updateLighting(hour);
      const time = game.time;
      // Player.
      playerMesh.visible = !game.player.inCar;
      if (playerMesh.visible) {
        syncPerson(playerMesh, game.player, time, game.player.moving);
        const flash = game.player.hurtTimer > 0 && Math.floor(time * 12) % 2 === 0;
        playerMesh.userData.shirt.color.set(flash ? '#ffffff' : '#0f766e');
      }
      syncCars([...game.cars, ...game.police.copCars], carMeshes, time);
      // Pedestrians and foot cops.
      const seenPeds = new Set();
      for (const ped of game.peds) {
        seenPeds.add(ped);
        let mesh = pedMeshes.get(ped);
        if (!mesh) { mesh = buildPersonMesh(ped.color, 'ped'); pedMeshes.set(ped, mesh); scene.add(mesh); }
        syncPerson(mesh, ped, time, ped.panic > 0 || ped.state === 'walk');
      }
      const seenCops = new Set();
      for (const cop of game.police.footCops) {
        seenCops.add(cop);
        let mesh = copMeshes.get(cop);
        if (!mesh) { mesh = buildPersonMesh('#1e3a5f', 'cop'); copMeshes.set(cop, mesh); scene.add(mesh); }
        syncPerson(mesh, cop, time, true);
      }
      for (const [obj, mesh] of [...copMeshes.entries()]) {
        if (!seenCops.has(obj)) { scene.remove(mesh); copMeshes.delete(obj); }
      }
      // Mission marker, packages, heist crate.
      const marker = missionMarker(game.missions, game);
      markerGroup.visible = !!marker;
      if (marker) {
        markerGroup.position.set(toX(marker.x), 0, toZ(marker.y));
        const pulse = 1 + Math.sin(time * 4) * 0.12;
        markerRing.scale.set(pulse, pulse, pulse);
        markerBeam.material.opacity = 0.13 + Math.sin(time * 4) * 0.05;
      }
      const active = game.missions.active;
      const wantPickups = [];
      if (active && active.def.type === 'collect') {
        for (const p of active.packages) if (!p.taken) wantPickups.push({ key: p, x: p.x, y: p.y, color: '#e8b93c', w: 20, h: 16 });
      }
      if (active && active.def.type === 'heist' && active.stage === 'grab') {
        wantPickups.push({ key: 'crate', x: active.def.target.x, y: active.def.target.y, color: '#4fb06a', w: 24, h: 20 });
      }
      for (const pk of game.combat.pickups) {
        wantPickups.push({ key: pk, x: pk.x, y: pk.y, color: pk.kind === 'cash' ? '#4fb06a' : '#8a5fd0', w: 18, h: 12 });
      }
      const seenPk = new Set();
      for (const pk of wantPickups) {
        seenPk.add(pk.key);
        let mesh = pickupMeshes.get(pk.key);
        if (!mesh) {
          mesh = box(pk.w, pk.h, pk.w, lambert(pk.color), 0, 0, 0);
          pickupMeshes.set(pk.key, mesh);
          scene.add(mesh);
        }
        mesh.position.set(toX(pk.x), 8 + Math.sin(time * 4 + pk.x) * 2, toZ(pk.y));
        mesh.rotation.y = time * 0.8;
      }
      for (const [key, mesh] of [...pickupMeshes.entries()]) {
        if (!seenPk.has(key)) { scene.remove(mesh); pickupMeshes.delete(key); }
      }
      // Bullets.
      while (bulletMeshes.length < game.combat.bullets.length) {
        const m = sphere(3, emissiveMat('#ffe98a'), 0, 0, 0);
        bulletMeshes.push(m);
        scene.add(m);
      }
      game.combat.bullets.forEach((b, i) => {
        bulletMeshes[i].visible = true;
        bulletMeshes[i].position.set(toX(b.x), 14, toZ(b.y));
      });
      for (let i = game.combat.bullets.length; i < bulletMeshes.length; i += 1) bulletMeshes[i].visible = false;

      updateCamera(dt, mode);
      renderer.render(scene, camera);
    },
  };
}
