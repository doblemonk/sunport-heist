// game/src/world.js — Solmar, the playable city of Sunport Heist.
// Builds the whole city once into the scene: ground, district slabs, the
// road grid, buildings, the beach, the marina, street lamps and trees,
// plus the collision and road queries every other system uses.
// Factory: createWorld(game) -> world object.
export function createWorld(game) {
  const THREE = game.THREE;
  const scene = game.scene;
  const cfg = game.config || {};
  const rng = game.rng || {
    next: () => 0.5,
    range: (a, b) => a + (b - a) * 0.5,
    int: (a, b) => Math.floor((a + b) / 2),
    pick: (list) => list[0],
    shuffle: (list) => list.slice(),
  };

  const HALF = cfg.worldSize !== undefined ? cfg.worldSize : 420;
  const ROAD_GAP = cfg.roadSpacing !== undefined ? cfg.roadSpacing : 120;
  const DAY_START = cfg.dayStartHour !== undefined ? cfg.dayStartHour : 8;
  const DAY_END = cfg.dayEndHour !== undefined ? cfg.dayEndHour : 19;

  const bounds = { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };
  const districts = cfg.districts || [];
  const colliders = [];

  // Road centre lines run from -360 to +360 in steps of 120, both axes.
  const ROAD_LINES = [];
  for (let c = -360; c <= 360; c += ROAD_GAP) ROAD_LINES.push(c);

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function addCollider(cx, cz, hw, hd) {
    colliders.push({
      left: cx - hw, right: cx + hw,
      top: cz - hd, bottom: cz + hd,
    });
  }

  // True when the point plus its radius leaves the bounds or overlaps a
  // building, the lifeguard tower or a tree.
  function isBlocked(x, z, r) {
    if (x - r < bounds.minX || x + r > bounds.maxX) return true;
    if (z - r < bounds.minZ || z + r > bounds.maxZ) return true;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (x + r > c.left && x - r < c.right &&
          z + r > c.top && z - r < c.bottom) return true;
    }
    return false;
  }

  // True when the point is on or just beside a road (within 9 of a centre line).
  function onRoad(x, z) {
    for (let i = 0; i < ROAD_LINES.length; i++) {
      const c = ROAD_LINES[i];
      if (Math.abs(x - c) <= 9 || Math.abs(z - c) <= 9) return true;
    }
    return false;
  }

  // Snap onto the nearest road. North-south roads head along +Z (heading 0);
  // east-west roads head along +X (heading a right angle).
  function nearestRoadPoint(x, z) {
    let bestNS = ROAD_LINES[0];
    let bestEW = ROAD_LINES[0];
    for (let i = 0; i < ROAD_LINES.length; i++) {
      const c = ROAD_LINES[i];
      if (Math.abs(x - c) < Math.abs(x - bestNS)) bestNS = c;
      if (Math.abs(z - c) < Math.abs(z - bestEW)) bestEW = c;
    }
    if (Math.abs(x - bestNS) <= Math.abs(z - bestEW)) {
      return { x: bestNS, z: z, heading: 0 };
    }
    return { x: x, z: bestEW, heading: Math.PI / 2 };
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

  function districtKindAt(x, z) {
    if (x < -240) return 'beach';
    if (z >= 180) return 'docks';
    if (z <= -180) return 'suburbs';
    if (x >= 120) return 'marina';
    return 'downtown';
  }

  function lambert(color) {
    return new THREE.MeshLambertMaterial({ color: color });
  }

  function addBox(w, h, d, color, x, y, z, parent) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
    mesh.position.set(x, y, z);
    (parent || scene).add(mesh);
    return mesh;
  }

  // ---- Ground: one grass plane, then a tinted slab per district. ----
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, HALF * 2),
    lambert(0x69a84f)
  );
  grass.rotation.x = -Math.PI / 2;
  scene.add(grass);

  // Slab rectangles: beach sand, downtown grey, docks tan-grey,
  // marina green, suburbs green. Slightly different heights avoid z-fighting.
  const slabs = [
    { x: -330, z: 0, w: 180, d: 840, color: 0xe8d29a, y: 0.02 }, // beach
    { x: 90, z: -300, w: 660, d: 240, color: 0x86b364, y: 0.03 }, // suburbs
    { x: -60, z: 0, w: 360, d: 360, color: 0x9a9a9a, y: 0.04 }, // downtown
    { x: 270, z: 0, w: 300, d: 360, color: 0x7fae62, y: 0.05 }, // marina
    { x: 90, z: 300, w: 660, d: 240, color: 0xb8a88f, y: 0.06 }, // docks
  ];
  for (let i = 0; i < slabs.length; i++) {
    const s = slabs[i];
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.d), lambert(s.color));
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(s.x, s.y, s.z);
    scene.add(slab);
  }

  // ---- Road grid: dark asphalt 14 wide, pale sidewalks 4 wide each side. ----
  const asphalt = lambert(0x33363b);
  const sidewalkMat = lambert(0xb9b3a4);
  for (let i = 0; i < ROAD_LINES.length; i++) {
    const c = ROAD_LINES[i];
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(14, HALF * 2), asphalt);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(c, 0.07, 0);
    scene.add(ns);
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 14), asphalt);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.07, c);
    scene.add(ew);
    for (let s = -1; s <= 1; s += 2) {
      const swNS = new THREE.Mesh(new THREE.PlaneGeometry(4, HALF * 2), sidewalkMat);
      swNS.rotation.x = -Math.PI / 2;
      swNS.position.set(c + s * 9, 0.08, 0);
      scene.add(swNS);
      const swEW = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 4), sidewalkMat);
      swEW.rotation.x = -Math.PI / 2;
      swEW.position.set(0, 0.08, c + s * 9);
      scene.add(swEW);
    }
  }

  // ---- Yellow centre dashes, one instanced mesh, skipping crossings. ----
  const dashSpots = [];
  for (let i = 0; i < ROAD_LINES.length; i++) {
    const c = ROAD_LINES[i];
    for (let p = -354; p <= 354; p += 12) {
      let nearCrossing = false;
      for (let j = 0; j < ROAD_LINES.length; j++) {
        if (Math.abs(p - ROAD_LINES[j]) < 12) { nearCrossing = true; break; }
      }
      if (nearCrossing) continue;
      dashSpots.push({ x: c, z: p, heading: 0 });
      dashSpots.push({ x: p, z: c, heading: Math.PI / 2 });
    }
  }
  const dashMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.7, 0.06, 4),
    new THREE.MeshBasicMaterial({ color: 0xf2c230 }),
    dashSpots.length
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < dashSpots.length; i++) {
    dummy.position.set(dashSpots[i].x, 0.12, dashSpots[i].z);
    dummy.rotation.set(0, dashSpots[i].heading, 0);
    dummy.updateMatrix();
    dashMesh.setMatrixAt(i, dummy.matrix);
  }
  dashMesh.instanceMatrix.needsUpdate = true;
  scene.add(dashMesh);

  // ---- Buildings on the block centres, one or two per block, never on a road. ----
  const DOWNTOWN_COLORS = [0x8d99ae, 0x6c7a89, 0xa8b0b8, 0x5d6d7e, 0x7f8c9b, 0xb0a08a];
  const MARINA_COLORS = [0xf2e8d5, 0xe8dcc8, 0xdfe9e4, 0xf5efe0, 0xcfe0d8];
  const DOCK_COLORS = [0xb5533c, 0x3f7d7a, 0xc07a2a, 0x5b7a9d, 0x8a6d4b];
  const SUBURB_COLORS = [0xe8b48a, 0xf0d0a0, 0xd8a0a0, 0xa8c8a0, 0xe8e0c8, 0xc8b8d8];

  function addBuilding(cx, cz, kind) {
    let w, d, h, palette;
    if (kind === 'downtown') {
      w = rng.range(28, 44); d = rng.range(28, 44); h = rng.range(26, 78);
      palette = DOWNTOWN_COLORS;
    } else if (kind === 'marina') {
      w = rng.range(24, 38); d = rng.range(24, 38); h = rng.range(12, 30);
      palette = MARINA_COLORS;
    } else {
      w = rng.range(16, 26); d = rng.range(16, 26); h = rng.range(6, 12);
      palette = SUBURB_COLORS;
    }
    const color = rng.pick(palette);
    addBox(w, h, d, color, cx, h / 2, cz);
    // Thin darker roof slab.
    const dark = new THREE.Color(color).multiplyScalar(0.55).getHex();
    addBox(w + 1.2, 0.9, d + 1.2, dark, cx, h + 0.45, cz);
    // A dark glass band for towers, a door for houses.
    if (kind === 'downtown') {
      addBox(w * 0.7, h * 0.5, 0.3, 0x2c3e50, cx, h * 0.55, cz + d / 2 + 0.1);
    } else {
      addBox(2.4, 3.4, 0.3, 0x4a3226, cx, 1.7, cz + d / 2 + 0.1);
    }
    addCollider(cx, cz, w / 2 + 1, d / 2 + 1);
  }

  function addContainerStack(cx, cz) {
    const w = rng.range(18, 26);
    const d = rng.range(10, 14);
    const h = rng.range(4, 9);
    const baseColor = rng.pick(DOCK_COLORS);
    addBox(w, h, d, baseColor, cx, h / 2, cz);
    const h2 = rng.range(4, 8);
    const offX = rng.range(-3, 3);
    const offZ = rng.range(-2, 2);
    addBox(w * 0.9, h2, d * 0.9, rng.pick(DOCK_COLORS), cx + offX, h + h2 / 2, cz + offZ);
    if (rng.next() < 0.5) {
      const h3 = rng.range(3, 6);
      addBox(w * 0.8, h3, d * 0.8, rng.pick(DOCK_COLORS),
        cx - offX, h + h2 + h3 / 2, cz - offZ);
    }
    addCollider(cx, cz, w / 2 + 1, d / 2 + 1);
  }

  const BLOCKS = [-300, -180, -60, 60, 180, 300];
  for (let ix = 0; ix < BLOCKS.length; ix++) {
    for (let iz = 0; iz < BLOCKS.length; iz++) {
      const bx = BLOCKS[ix];
      const bz = BLOCKS[iz];
      const kind = districtKindAt(bx, bz);
      if (kind === 'beach') continue; // the beach gets umbrellas, not buildings
      if (kind === 'marina' && bx >= 300) continue; // east marina blocks are open water
      const count = rng.int(1, 2);
      if (kind === 'docks') {
        addContainerStack(bx, bz);
        if (count === 2) addContainerStack(bx + rng.range(-24, 24), bz + rng.range(-24, 24));
        continue;
      }
      if (count === 1) {
        addBuilding(bx + rng.range(-8, 8), bz + rng.range(-8, 8), kind);
      } else {
        const alongX = rng.next() < 0.5;
        if (alongX) {
          addBuilding(bx - 26, bz + rng.range(-6, 6), kind);
          addBuilding(bx + 26, bz + rng.range(-6, 6), kind);
        } else {
          addBuilding(bx + rng.range(-6, 6), bz - 26, kind);
          addBuilding(bx + rng.range(-6, 6), bz + 26, kind);
        }
      }
    }
  }

  // ---- Palma Beach: twelve umbrellas and a lifeguard tower. ----
  const UMBRELLA_COLORS = [0xe14b4b, 0x3b7dd8];
  for (let i = 0; i < 12; i++) {
    let ux = rng.range(-405, -370);
    let uz = -360 + i * 60 + rng.range(-15, 15);
    if (onRoad(ux, uz)) uz += 14;
    if (onRoad(ux, uz)) ux = -400;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), lambert(0xd8d0c0));
    pole.position.set(ux, 1.3, uz);
    scene.add(pole);
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(2.4, 1.3, 8),
      lambert(UMBRELLA_COLORS[i % 2]));
    canopy.position.set(ux, 3.1, uz);
    scene.add(canopy);
  }

  // Lifeguard tower at (-330, 0): four legs, a cabin and a roof.
  const tower = new THREE.Group();
  tower.position.set(-330, 0, 0);
  scene.add(tower);
  const legMat = lambert(0xf0ead8);
  for (let lx = -1; lx <= 1; lx += 2) {
    for (let lz = -1; lz <= 1; lz += 2) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4, 6), legMat);
      leg.position.set(lx * 1.2, 2, lz * 1.2);
      tower.add(leg);
    }
  }
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 3.4), lambert(0xffffff));
  cabin.position.set(0, 5.2, 0);
  tower.add(cabin);
  const towerRoof = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 4), lambert(0xe14b4b));
  towerRoof.position.set(0, 6.6, 0);
  tower.add(towerRoof);
  addCollider(-330, 0, 2.5, 2.5);

  // ---- Marina: water plane, two wooden piers, three moored boats. ----
  const waterBaseY = 0.12;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 240),
    new THREE.MeshLambertMaterial({ color: 0x2f88b0 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(360, waterBaseY, -60);
  scene.add(water);
  const pierMat = lambert(0x8a6d4b);
  for (let p = 0; p < 2; p++) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(60, 0.6, 4), pierMat);
    pier.position.set(330, 0.5, p === 0 ? -120 : 0);
    scene.add(pier);
  }
  const boats = [];
  const boatSpots = [
    { x: 345, z: -120, color: 0xf0f0f0 },
    { x: 375, z: -30, color: 0xe14b4b },
    { x: 355, z: 20, color: 0x3b7dd8 },
  ];
  for (let i = 0; i < boatSpots.length; i++) {
    const spot = boatSpots[i];
    const boat = new THREE.Group();
    boat.position.set(spot.x, waterBaseY + 0.4, spot.z);
    boat.rotation.y = rng.range(-0.4, 0.4);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 3), lambert(spot.color));
    hull.position.y = 0.4;
    boat.add(hull);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 2.2), lambert(0xffffff));
    cab.position.set(-0.5, 1.9, 0);
    boat.add(cab);
    scene.add(boat);
    boats.push({ mesh: boat, phase: i * 2.1, baseY: waterBaseY + 0.4 });
  }

  // ---- Street lamps at every road crossing: pole and glowing head. ----
  const lampPoleMat = lambert(0x3a3f45);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let i = 0; i < ROAD_LINES.length; i++) {
    for (let j = 0; j < ROAD_LINES.length; j++) {
      const cx = ROAD_LINES[i] + 9.5;
      const cz = ROAD_LINES[j] + 9.5;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), lampPoleMat);
      pole.position.set(cx, 3.5, cz);
      scene.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampHeadMat);
      head.position.set(cx, 7.1, cz);
      scene.add(head);
    }
  }

  // ---- Forty-two trees: suburbs and the beach edge, never on a road,
  // never downtown or in the docks, never inside a building. ----
  const trunkMat = lambert(0x6b4a2f);
  const leafColors = [0x3f7a34, 0x4c8a3f, 0x5a9a44];
  let treesPlaced = 0;
  let treeAttempts = 0;
  while (treesPlaced < 42 && treeAttempts < 600) {
    treeAttempts++;
    let tx, tz;
    if (rng.next() < 0.6) {
      // North Suburbs.
      tx = rng.range(-230, 410);
      tz = rng.range(-410, -190);
    } else {
      // Along the beach strip.
      tx = rng.range(-410, -250);
      tz = rng.range(-410, 410);
    }
    if (onRoad(tx, tz)) continue;
    if (isBlocked(tx, tz, 2)) continue;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 3, 6), trunkMat);
    trunk.position.set(tx, 1.5, tz);
    scene.add(trunk);
    const leafR = rng.range(2.2, 3.4);
    const leaves = new THREE.Mesh(
      new THREE.ConeGeometry(leafR, rng.range(4, 6), 8),
      lambert(rng.pick(leafColors)));
    leaves.position.set(tx, 3 + leafR * 0.9, tz);
    scene.add(leaves);
    addCollider(tx, tz, 1.5, 1.5);
    treesPlaced++;
  }

  // ---- Light: directional sun with shadows, hemisphere light, fog, blue sky. ----
  const sun = new THREE.DirectionalLight(0xfff3da, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -450;
  sun.shadow.camera.right = 450;
  sun.shadow.camera.top = 450;
  sun.shadow.camera.bottom = -450;
  sun.shadow.camera.far = 1200;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.8);
  scene.add(hemi);

  scene.fog = new THREE.Fog(0x9fc7e8, 320, 950);
  scene.background = new THREE.Color(0x87bfe8);

  // ---- Time of day: sun path, warm colour, sky and fog tint. ----
  const MORNING_SUN = new THREE.Color(0xffc46b);
  const NOON_SUN = new THREE.Color(0xfff3da);
  const DUSK_SUN = new THREE.Color(0xff8a3d);
  const MORNING_SKY = new THREE.Color(0xa8c8e8);
  const NOON_SKY = new THREE.Color(0x87bfe8);
  const DUSK_SKY = new THREE.Color(0xf2a56b);
  const sunColor = new THREE.Color();
  const skyColor = new THREE.Color();

  function setTimeOfDay(hour) {
    const t = clamp((hour - DAY_START) / (DAY_END - DAY_START), 0, 1);
    // Sun travels east to west, high at noon, low at morning and dusk.
    sun.position.set((1 - 2 * t) * 350, 120 + Math.sin(Math.PI * t) * 240, 180);
    sun.target.position.set(0, 0, 0);
    if (t < 0.5) {
      sunColor.lerpColors(MORNING_SUN, NOON_SUN, t * 2);
      skyColor.lerpColors(MORNING_SKY, NOON_SKY, t * 2);
    } else {
      sunColor.lerpColors(NOON_SUN, DUSK_SUN, (t - 0.5) * 2);
      skyColor.lerpColors(NOON_SKY, DUSK_SKY, (t - 0.5) * 2);
    }
    sun.color.copy(sunColor);
    sun.intensity = 0.9 + 0.5 * Math.sin(Math.PI * t);
    hemi.intensity = 0.55 + 0.35 * Math.sin(Math.PI * t);
    hemi.color.copy(skyColor);
    scene.background.copy(skyColor);
    if (scene.fog) scene.fog.color.copy(skyColor);
  }
  setTimeOfDay(DAY_START);

  // ---- Per-frame update: the marina water swells gently, boats bob. ----
  function update(dt) {
    const t = game.time || 0;
    water.position.y = waterBaseY + Math.sin(t * 0.7) * 0.35;
    for (let i = 0; i < boats.length; i++) {
      const b = boats[i];
      b.mesh.position.y = b.baseY + Math.sin(t * 0.7 + b.phase) * 0.25;
      b.mesh.rotation.z = Math.sin(t * 0.5 + b.phase) * 0.02;
    }
  }

  return {
    bounds: bounds,
    districts: districts,
    colliders: colliders,
    isBlocked: isBlocked,
    onRoad: onRoad,
    nearestRoadPoint: nearestRoadPoint,
    spawnPoints: spawnPoints,
    setTimeOfDay: setTimeOfDay,
    update: update,
  };
}
