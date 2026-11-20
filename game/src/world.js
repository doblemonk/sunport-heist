// Sunport Heist — the city of Solmar.
// Builds the whole playable city into the scene from the config: ground
// coloured by district, a road grid with markings and sidewalks,
// low-poly buildings, the beach, the marina water, lamps, trees and
// the sun. Collision is kept as plain rectangles, tested by isBlocked,
// so driving, walking and the AI never need the meshes themselves.

import { CONFIG } from './config.js';
import { createRNG } from './random.js';

const ROAD_WIDTH = 14;
const SIDEWALK_WIDTH = 4;

// Ground colours per district kind.
const GROUND_COLORS = {
  beach: 0xd9c08a,
  downtown: 0x6a6f75,
  docks: 0x7a7568,
  marina: 0x7fae7a,
  suburbs: 0x6fae62,
};

// Building palettes per district kind.
const BUILDING_COLORS = {
  downtown: [0x8fa3b8, 0xb8a88f, 0x7d8ea3, 0xa3b8c9, 0x9a8f7d, 0xc9b8a3],
  marina: [0xe8ddc9, 0xc9d6e8, 0xe8c9a3, 0xd6e8d6, 0xf0e8d8],
  suburbs: [0xe8b8a3, 0xa3c9e8, 0xe8d6a3, 0xc9a3b8, 0xb8d6a3, 0xe8e8e8],
  docks: [0xb8542e, 0x2e6fb7, 0x3a7d44, 0xc9a32e, 0x7a4a8a, 0x8a5a2e],
  beach: [0xe8ddc9, 0xf0e8d8],
};

export function createWorld(game) {
  const THREE = game.THREE;
  const scene = game.scene;
  const rng = game.rng || createRNG(CONFIG.seed);
  const half = CONFIG.worldSize;
  const spacing = CONFIG.roadSpacing;
  const districts = CONFIG.districts;

  // Road centrelines, in world units, on both axes.
  const roadLines = [];
  for (let v = -half + 60; v <= half - 60; v += spacing) roadLines.push(v);

  const colliders = [];
  function addCollider(cx, cz, w, d) {
    colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
  }

  function districtAt(x, z) {
    for (const d of districts) {
      if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
    }
    return districts[0];
  }

  function flat(color, x, z, w, d, y) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // ---- Ground: grass everywhere, then a tinted slab per district. ----
  flat(0x5d9e52, 0, 0, half * 2, half * 2, 0);
  for (const d of districts) {
    const cx = (d.x0 + d.x1) / 2;
    const cz = (d.z0 + d.z1) / 2;
    flat(GROUND_COLORS[d.kind] || 0x6fae62, cx, cz, d.x1 - d.x0, d.z1 - d.z0, 0.01);
  }

  // ---- Roads, sidewalks and lane markings. ----
  for (const v of roadLines) {
    flat(0x2f3338, v, 0, ROAD_WIDTH, half * 2, 0.03); // north-south road
    flat(0x2f3338, 0, v, half * 2, ROAD_WIDTH, 0.03); // east-west road
    const sw = ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2;
    flat(0x9aa0a6, v - sw, 0, SIDEWALK_WIDTH, half * 2, 0.02);
    flat(0x9aa0a6, v + sw, 0, SIDEWALK_WIDTH, half * 2, 0.02);
    flat(0x9aa0a6, 0, v - sw, half * 2, SIDEWALK_WIDTH, 0.02);
    flat(0x9aa0a6, 0, v + sw, half * 2, SIDEWALK_WIDTH, 0.02);
  }

  // Centre dashes as one instanced mesh, skipping road crossings.
  const dashGeo = new THREE.PlaneGeometry(0.35, 5);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  const dashSpots = [];
  for (const v of roadLines) {
    for (let s = -half + 20; s <= half - 20; s += 16) {
      const nearCrossing = roadLines.some((c) => Math.abs(s - c) < 12);
      if (nearCrossing) continue;
      dashSpots.push({ x: v, z: s, vertical: true });
      dashSpots.push({ x: s, z: v, vertical: false });
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashSpots.length);
  const dummy = new THREE.Object3D();
  dashSpots.forEach((spot, i) => {
    dummy.position.set(spot.x, 0.05, spot.z);
    dummy.rotation.set(-Math.PI / 2, 0, spot.vertical ? 0 : Math.PI / 2);
    dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  });
  dashes.instanceMatrix.needsUpdate = true;
  scene.add(dashes);

  // ---- Buildings, one or two per city block, never on a road. ----
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const blockCentres = [-300, -180, -60, 60, 180, 300];
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });

  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      const district = districtAt(bx, bz);
      // The beach gets umbrellas, not buildings; the marina's east
      // blocks are open water.
      if (district.kind === 'beach') continue;
      if (district.kind === 'marina' && bx >= 300 && bz >= -180 && bz <= 60) continue;

      const palette = BUILDING_COLORS[district.kind] || BUILDING_COLORS.suburbs;
      const count = district.kind === 'docks' || district.kind === 'suburbs' ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const jx = k === 0 ? -14 : 16;
        const jz = k === 0 ? -10 : 14;
        const cx = bx + jx + rng.range(-6, 6);
        const cz = bz + jz + rng.range(-6, 6);
        let w, d, h;
        if (district.kind === 'downtown') {
          w = rng.range(28, 44); d = rng.range(28, 44); h = rng.range(26, 78);
        } else if (district.kind === 'marina') {
          w = rng.range(24, 38); d = rng.range(24, 38); h = rng.range(12, 30);
        } else if (district.kind === 'docks') {
          // Stacked shipping containers.
          w = rng.range(18, 26); d = rng.range(10, 14); h = rng.range(4, 9);
        } else {
          w = rng.range(16, 26); d = rng.range(16, 26); h = rng.range(6, 12);
        }
        const mat = new THREE.MeshLambertMaterial({ color: rng.pick(palette) });
        const building = new THREE.Mesh(boxGeo, mat);
        building.scale.set(w, h, d);
        building.position.set(cx, h / 2, cz);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        // A thin darker roof slab, so blocks read as buildings from above.
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w * 0.92, 1, d * 0.92);
        roof.position.set(cx, h + 0.5, cz);
        scene.add(roof);
        addCollider(cx, cz, w + 1, d + 1);
      }
    }
  }

  // ---- Palma Beach: umbrellas and a lifeguard tower. ----
  const umbrellaMat = new THREE.MeshLambertMaterial({ color: 0xe85d3d });
  const umbrellaMat2 = new THREE.MeshLambertMaterial({ color: 0x2e9db7 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x8a7a5a });
  for (let i = 0; i < 12; i++) {
    const ux = -390 + rng.range(0, 120);
    const uz = -360 + i * 62 + rng.range(-14, 14);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 6), poleMat);
    pole.position.set(ux, 1.7, uz);
    scene.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(3.2, 1.4, 8),
      i % 2 === 0 ? umbrellaMat : umbrellaMat2,
    );
    top.position.set(ux, 4, uz);
    top.castShadow = true;
    scene.add(top);
  }
  const tower = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xf0e8d8 }));
  tower.scale.set(4, 7, 4);
  tower.position.set(-330, 3.5, 0);
  tower.castShadow = true;
  scene.add(tower);
  addCollider(-330, 0, 5, 5);

  // ---- Marina water, piers and moored boats. ----
  const waterMat = new THREE.MeshLambertMaterial({
    color: 0x2a7fb8, transparent: true, opacity: 0.92,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(120, 240), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(360, 0.06, -60);
  water.receiveShadow = true;
  scene.add(water);
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
  for (const pz of [-120, 0]) {
    const pier = new THREE.Mesh(boxGeo, pierMat);
    pier.scale.set(46, 1, 6);
    pier.position.set(322, 0.6, pz);
    pier.castShadow = true;
    scene.add(pier);
  }
  const boatMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const boatMat2 = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  [[350, -140], [375, -40], [350, 20]].forEach(([bx, bz], i) => {
    const boat = new THREE.Mesh(boxGeo, i % 2 === 0 ? boatMat : boatMat2);
    boat.scale.set(10, 2.5, 4);
    boat.position.set(bx, 0.6, bz);
    boat.rotation.y = rng.range(-0.3, 0.3);
    scene.add(boat);
  });

  // ---- Street lamps at the road crossings. ----
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a3 });
  for (const vx of roadLines) {
    for (const vz of roadLines) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 6), lampPoleMat);
      pole.position.set(vx + 9, 3.5, vz + 9);
      scene.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampHeadMat);
      head.position.set(vx + 9, 7.1, vz + 9);
      scene.add(head);
    }
  }

  // ---- Trees, mostly in the suburbs and along the beach. ----
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2e });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x43a047 });
  for (let i = 0; i < 42; i++) {
    const tx = rng.range(-380, 380);
    const tz = rng.range(-380, 380);
    if (onRoad(tx, tz)) continue;
    const district = districtAt(tx, tz);
    if (district.kind === 'downtown' || district.kind === 'docks') continue;
    if (isBlocked(tx, tz, 3)) continue;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 3, 6), trunkMat);
    trunk.position.set(tx, 1.5, tz);
    trunk.castShadow = true;
    scene.add(trunk);
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(rng.range(2.2, 3.4), 8, 6),
      i % 2 === 0 ? leafMat : leafMat2,
    );
    leaves.position.set(tx, 4.6, tz);
    leaves.castShadow = true;
    scene.add(leaves);
    addCollider(tx, tz, 1.2, 1.2);
  }

  // ---- Light, sky and fog. ----
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -460;
  sun.shadow.camera.right = 460;
  sun.shadow.camera.top = 460;
  sun.shadow.camera.bottom = -460;
  sun.shadow.camera.far = 1200;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.7);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0x9fc3e0, 260, 950);
  scene.background = new THREE.Color(0x87bfe8);

  const morningSun = new THREE.Color(0xffd9a0);
  const noonSun = new THREE.Color(0xfff6e0);
  const duskSun = new THREE.Color(0xff8a4a);
  const morningSky = new THREE.Color(0x9cc3e0);
  const noonSky = new THREE.Color(0x7ec0ee);
  const duskSky = new THREE.Color(0xf2a35e);

  function setTimeOfDay(hours) {
    const h = Math.max(0, Math.min(24, hours));
    const p = Math.max(0, Math.min(1, (h - CONFIG.dayStartHour) / (CONFIG.dayEndHour - CONFIG.dayStartHour)));
    const angle = Math.PI * p;
    sun.position.set(Math.cos(angle) * 380, 120 + Math.sin(angle) * 260, 140);
    const sunColor = new THREE.Color();
    const skyColor = new THREE.Color();
    if (p < 0.5) {
      sunColor.lerpColors(morningSun, noonSun, p * 2);
      skyColor.lerpColors(morningSky, noonSky, p * 2);
    } else {
      sunColor.lerpColors(noonSun, duskSun, (p - 0.5) * 2);
      skyColor.lerpColors(noonSky, duskSky, (p - 0.5) * 2);
    }
    sun.color.copy(sunColor);
    sun.intensity = 0.9 + Math.sin(angle) * 0.5;
    hemi.intensity = 0.55 + Math.sin(angle) * 0.25;
    scene.background.copy(skyColor);
    if (scene.fog) scene.fog.color.copy(skyColor);
  }
  setTimeOfDay(CONFIG.dayStartHour);

  // ---- Queries used by the player, traffic, peds and missions. ----
  function nearestLine(value) {
    let best = roadLines[0];
    let bestDist = Math.abs(value - best);
    for (const line of roadLines) {
      const dist = Math.abs(value - line);
      if (dist < bestDist) { best = line; bestDist = dist; }
    }
    return { line: best, dist: bestDist };
  }

  function isBlocked(x, z, radius) {
    const r = radius || 0;
    if (x - r < -half || x + r > half || z - r < -half || z + r > half) return true;
    for (const c of colliders) {
      if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true;
    }
    return false;
  }

  function onRoad(x, z) {
    const dx = nearestLine(x).dist;
    const dz = nearestLine(z).dist;
    return Math.min(dx, dz) <= ROAD_WIDTH / 2 + 2;
  }

  function nearestRoadPoint(x, z) {
    const nx = nearestLine(x);
    const nz = nearestLine(z);
    if (nx.dist <= nz.dist) {
      // Snap onto the north-south road: drive along Z, heading 0 (+Z).
      return { x: nx.line, z, heading: 0 };
    }
    // Snap onto the east-west road: drive along X, heading PI/2 (+X).
    return { x, z: nz.line, heading: Math.PI / 2 };
  }

  // Named spawn points, all on roads or open ground in their district.
  const spawnPoints = {
    hideout: { x: 0, z: 0, heading: 0 },
    marina: { x: 240, z: -60, heading: Math.PI / 2 },
    docks: { x: 0, z: 300, heading: 0 },
    beach: { x: -360, z: 0, heading: Math.PI / 2 },
    suburbs: { x: 120, z: -300, heading: 0 },
    downtown: { x: 120, z: 120, heading: Math.PI },
    vault: { x: 0, z: -120, heading: Math.PI / 2 },
    beachDrops: [
      { x: -360, z: -240, heading: 0 },
      { x: -360, z: 0, heading: 0 },
      { x: -360, z: 240, heading: 0 },
    ],
    goldCoupe: { x: 240, z: 120, heading: Math.PI / 2 },
    cashCrate: { x: -120, z: 240, heading: 0 },
  };

  return {
    bounds: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    districts,
    colliders,
    isBlocked,
    onRoad,
    nearestRoadPoint,
    spawnPoints,
    setTimeOfDay,

    // Only the water moves: a slow swell under the boats and piers.
    update(dt) {
      const t = game.time || 0;
      water.position.y = 0.06 + Math.sin(t * 0.7) * 0.04;
    },
  };
}
