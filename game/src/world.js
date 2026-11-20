// Sunport Heist — world.js
// The whole playable city of Solmar: ground, districts, roads, buildings,
// beach, marina, lamps, trees, sun and sky, plus the collision and road
// queries every other system uses. Written fresh from the rebuild brief
// and the interface document.

export function createWorld(game) {
  const THREE = game.THREE;
  const scene = game.scene;
  const config = game.config || {};
  const rng = game.rng || {
    next: () => 0.5,
    range: (a, b) => (a + b) / 2,
    int: (a, b) => Math.floor((a + b) / 2),
    pick: (list) => list[0],
    shuffle: (list) => list.slice(),
  };

  // Playable half-extent. The config stores the full size when it is
  // larger than the half-extent, otherwise the half-extent itself.
  const half = config.worldSize
    ? (config.worldSize > 420 ? config.worldSize / 2 : config.worldSize)
    : 420;
  const spacing = config.roadSpacing || 120;
  const dayStart = typeof config.dayStartHour === 'number' ? config.dayStartHour : 8;
  const dayEnd = typeof config.dayEndHour === 'number' ? config.dayEndHour : 19;

  const colliders = [];

  // Road centre lines run from -360 to +360 in steps of the road spacing.
  const roadLines = [];
  for (let c = -3 * spacing; c <= 3 * spacing; c += spacing) roadLines.push(c);
  const roadEnd = 3 * spacing;

  // ---- small builders -------------------------------------------------

  function lambert(color) {
    return new THREE.MeshLambertMaterial({ color });
  }

  function box(w, h, d, color, x, y, z, parent) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (parent || scene).add(mesh);
    return mesh;
  }

  function flat(w, d, color, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lambert(color));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function darker(color, factor) {
    return new THREE.Color(color).multiplyScalar(factor);
  }

  function addCollider(x, z, w, d, pad) {
    const p = pad === undefined ? 1 : pad;
    colliders.push({
      left: x - w / 2 - p,
      right: x + w / 2 + p,
      top: z - d / 2 - p,
      bottom: z + d / 2 + p,
    });
  }

  function insideCollider(x, z, pad) {
    const p = pad || 0;
    for (const c of colliders) {
      if (x > c.left - p && x < c.right + p && z > c.top - p && z < c.bottom + p) return true;
    }
    return false;
  }

  // ---- queries ---------------------------------------------------------

  function isBlocked(x, z, radius) {
    const r = radius || 0;
    if (x - r < -half || x + r > half || z - r < -half || z + r > half) return true;
    for (const c of colliders) {
      if (x + r > c.left && x - r < c.right && z + r > c.top && z - r < c.bottom) return true;
    }
    return false;
  }

  function onRoad(x, z) {
    for (const c of roadLines) {
      if (Math.abs(x - c) <= 9 || Math.abs(z - c) <= 9) return true;
    }
    return false;
  }

  function nearestRoadPoint(x, z) {
    let bestV = roadLines[0];
    let bestH = roadLines[0];
    let distV = Math.abs(x - roadLines[0]);
    let distH = Math.abs(z - roadLines[0]);
    for (const c of roadLines) {
      if (Math.abs(x - c) < distV) { distV = Math.abs(x - c); bestV = c; }
      if (Math.abs(z - c) < distH) { distH = Math.abs(z - c); bestH = c; }
    }
    const clamp = (v) => Math.max(-roadEnd, Math.min(roadEnd, v));
    if (distV <= distH) return { x: bestV, z: clamp(z), heading: 0 };
    return { x: clamp(x), z: bestH, heading: Math.PI / 2 };
  }

  // ---- districts --------------------------------------------------------

  const PALETTES = {
    beach: [0xd9c28a, 0xe8d5a0, 0xc9b078],
    downtown: [0x7d8aa0, 0x9aa3ad, 0x6b7a8c, 0xb0a58e, 0x8c7f70, 0x5f6f7d, 0xa8b0b8],
    docks: [0xc0392b, 0x2471a3, 0x229954, 0xd4ac0d, 0x7d3c98, 0xca6f1e, 0x2e86c1],
    marina: [0xe8dcc0, 0xd9b48a, 0xc98f6b, 0xf0e6d2, 0xb5c4a8, 0xe0cfa8],
    suburbs: [0xe8c9a0, 0xd9a066, 0xf0e0c0, 0xc9d6a8, 0xe0a0a0, 0xa8c8d8, 0xd8b890],
  };

  const SLAB_COLORS = {
    beach: 0xd9c28a,
    downtown: 0x8a8f96,
    docks: 0xa89a80,
    marina: 0x6f9e5a,
    suburbs: 0x7fae62,
  };

  // Known layout, used only when a district entry carries no rectangle.
  const FALLBACK_RECTS = {
    beach: { x0: -420, x1: -240, z0: -420, z1: 420 },
    suburbs: { x0: -240, x1: 420, z0: -420, z1: -180 },
    downtown: { x0: -240, x1: 120, z0: -180, z1: 180 },
    marina: { x0: 120, x1: 420, z0: -180, z1: 180 },
    docks: { x0: -240, x1: 420, z0: 180, z1: 420 },
  };

  function kindOf(d) {
    if (!d) return '';
    const raw = String(d.kind || d.type || d.name || '').toLowerCase();
    if (raw.includes('beach')) return 'beach';
    if (raw.includes('downtown')) return 'downtown';
    if (raw.includes('dock')) return 'docks';
    if (raw.includes('marina')) return 'marina';
    if (raw.includes('suburb')) return 'suburbs';
    return raw;
  }

  function rectOf(d) {
    if (!d) return null;
    const num = (v) => (typeof v === 'number' ? v : undefined);
    let x0 = num(d.x0); if (x0 === undefined) x0 = num(d.minX);
    if (x0 === undefined) x0 = num(d.xMin);
    if (x0 === undefined) x0 = num(d.left);
    let x1 = num(d.x1); if (x1 === undefined) x1 = num(d.maxX);
    if (x1 === undefined) x1 = num(d.xMax);
    if (x1 === undefined) x1 = num(d.right);
    let z0 = num(d.z0); if (z0 === undefined) z0 = num(d.minZ);
    if (z0 === undefined) z0 = num(d.zMin);
    if (z0 === undefined) z0 = num(d.top);
    let z1 = num(d.z1); if (z1 === undefined) z1 = num(d.maxZ);
    if (z1 === undefined) z1 = num(d.zMax);
    if (z1 === undefined) z1 = num(d.bottom);
    if (x0 !== undefined && x1 !== undefined && z0 !== undefined && z1 !== undefined) {
      return { x0, x1, z0, z1 };
    }
    if (typeof d.x === 'number' && typeof d.w === 'number' &&
        typeof d.z === 'number' && typeof d.h === 'number') {
      return { x0: d.x, x1: d.x + d.w, z0: d.z, z1: d.z + d.h };
    }
    return null;
  }

  function districtAt(x, z) {
    const list = config.districts || [];
    for (const d of list) {
      const r = rectOf(d);
      if (r && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return d;
    }
    if (x < -240) return { kind: 'beach' };
    if (z < -180) return { kind: 'suburbs' };
    if (z >= 180) return { kind: 'docks' };
    if (x >= 120) return { kind: 'marina' };
    return { kind: 'downtown' };
  }

  function paletteOf(d) {
    if (d && (d.palette || d.colors || d.buildingColors)) {
      return d.palette || d.colors || d.buildingColors;
    }
    return PALETTES[kindOf(d)] || PALETTES.downtown;
  }

  function slabColorOf(d) {
    if (d && typeof d.ground === 'number') return d.ground;
    if (d && typeof d.groundColor === 'number') return d.groundColor;
    if (d && typeof d.color === 'number') return d.color;
    return SLAB_COLORS[kindOf(d)] || 0x7fae62;
  }

  // ---- ground and district slabs ---------------------------------------

  flat(half * 2, half * 2, 0x5d8a48, 0, 0, 0);

  for (const d of config.districts || []) {
    const r = rectOf(d) || FALLBACK_RECTS[kindOf(d)];
    if (!r) continue;
    flat(r.x1 - r.x0, r.z1 - r.z0, slabColorOf(d),
      (r.x0 + r.x1) / 2, 0.01, (r.z0 + r.z1) / 2);
  }

  // ---- road grid --------------------------------------------------------

  const asphalt = lambert(0x33363b);
  const sidewalkMat = lambert(0xb9b3a4);

  function roadPlane(w, d, x, z, mat) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  for (const c of roadLines) {
    // North-south road with a pale sidewalk on both sides.
    roadPlane(14, roadEnd * 2, c, 0, asphalt);
    roadPlane(4, roadEnd * 2, c - 9, 0, sidewalkMat);
    roadPlane(4, roadEnd * 2, c + 9, 0, sidewalkMat);
    // East-west road with a pale sidewalk on both sides.
    roadPlane(roadEnd * 2, 14, 0, c, asphalt);
    roadPlane(roadEnd * 2, 4, 0, c - 9, sidewalkMat);
    roadPlane(roadEnd * 2, 4, 0, c + 9, sidewalkMat);
  }

  // Yellow centre dashes as one instanced mesh, skipping the crossings.
  const dashSpots = [];
  for (const c of roadLines) {
    for (let a = -roadEnd; a <= roadEnd; a += 12) {
      let nearCrossing = false;
      for (const o of roadLines) {
        if (Math.abs(a - o) < 12) { nearCrossing = true; break; }
      }
      if (nearCrossing) continue;
      dashSpots.push({ x: c, z: a, alongZ: true });
      dashSpots.push({ x: a, z: c, alongZ: false });
    }
  }
  const dashGeo = new THREE.BoxGeometry(0.7, 0.12, 5);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xe8c832 });
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashSpots.length);
  const dummy = new THREE.Object3D();
  dashSpots.forEach((s, i) => {
    dummy.position.set(s.x, 0.05, s.z);
    dummy.rotation.set(0, s.alongZ ? 0 : Math.PI / 2, 0);
    dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  });
  dashes.instanceMatrix.needsUpdate = true;
  scene.add(dashes);

  // ---- buildings ---------------------------------------------------------

  function buildOne(x, z, kind, palette) {
    let w;
    let d;
    let h;
    if (kind === 'downtown') {
      w = rng.range(28, 44);
      d = rng.range(28, 44);
      h = rng.range(26, 78);
    } else if (kind === 'marina') {
      w = rng.range(24, 38);
      d = rng.range(24, 38);
      h = rng.range(12, 30);
    } else if (kind === 'docks') {
      w = rng.range(18, 26);
      d = rng.range(10, 14);
      h = rng.range(4, 9);
    } else if (kind === 'suburbs') {
      w = rng.range(16, 26);
      d = rng.range(16, 26);
      h = rng.range(6, 12);
    } else {
      w = rng.range(20, 30);
      d = rng.range(20, 30);
      h = rng.range(10, 20);
    }
    const color = rng.pick(palette);
    box(w, h, d, color, x, h / 2, z);
    let topY = h;
    // The docks stack a second container on top of the first.
    if (kind === 'docks' && rng.next() < 0.55) {
      const h2 = rng.range(4, 7);
      box(w * 0.85, h2, d * 0.9, rng.pick(palette),
        x + rng.range(-1, 1), h + h2 / 2, z + rng.range(-0.5, 0.5));
      topY = h + h2;
    }
    // A thin darker roof slab on every building.
    box(w + 1.2, 1, d + 1.2, darker(color, 0.55), x, topY + 0.5, z);
    addCollider(x, z, w, d);
  }

  const blockCentres = [-300, -180, -60, 60, 180, 300];
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      const district = districtAt(bx, bz);
      const kind = kindOf(district);
      // The beach gets umbrellas instead of buildings.
      if (kind === 'beach') continue;
      // The marina's east blocks are open water, with no buildings.
      if (kind === 'marina' && bx >= 300) continue;
      const palette = paletteOf(district);
      const count = rng.int(1, 2);
      const horizontal = rng.next() < 0.5;
      for (let i = 0; i < count; i++) {
        const off = count === 1 ? 0 : (i === 0 ? -26 : 26);
        const x = horizontal ? bx + off : bx;
        const z = horizontal ? bz : bz + off;
        buildOne(x, z, kind, palette);
      }
    }
  }

  // ---- beach: umbrellas and the lifeguard tower -------------------------

  const umbrellaColors = [0xd23b2e, 0x2e6fd2];
  for (let i = 0; i < 12; i++) {
    let x = -360;
    let z = 0;
    let tries = 0;
    do {
      x = rng.range(-410, -255);
      z = rng.range(-400, 400);
      tries++;
    } while (tries < 60 && (onRoad(x, z) || insideCollider(x, z, 6)));
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 2.8, 6), lambert(0xe8e0cc));
    pole.position.set(x, 1.4, z);
    scene.add(pole);
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(3.6, 1.8, 10), lambert(rng.pick(umbrellaColors)));
    canopy.position.set(x, 3.6, z);
    canopy.castShadow = true;
    scene.add(canopy);
  }

  // Lifeguard tower at x -330, z 0.
  const towerX = -330;
  const towerZ = 0;
  for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    box(0.5, 5, 0.5, 0xffffff, towerX + lx, 2.5, towerZ + lz);
  }
  box(5.5, 0.5, 5.5, 0xe8e0cc, towerX, 5.2, towerZ);
  box(4.2, 2.6, 4.2, 0xd23b2e, towerX, 6.8, towerZ);
  box(5, 0.4, 5, 0x8a2a20, towerX, 8.3, towerZ);
  addCollider(towerX, towerZ, 6, 6);

  // ---- marina: water, piers and moored boats ----------------------------

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 240),
    new THREE.MeshStandardMaterial({ color: 0x2e7fa8, roughness: 0.35, metalness: 0.1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(360, 0.05, -60);
  water.receiveShadow = true;
  scene.add(water);

  box(90, 1, 6, 0x8a6b45, 355, 0.6, -120);
  box(90, 1, 6, 0x8a6b45, 355, 0.6, 30);

  const boatSpots = [[345, -100], [375, -45], [350, 15]];
  for (const [bx, bz] of boatSpots) {
    box(11, 2, 4.5, 0xf0ead8, bx, 1, bz);
    box(5, 2, 3, 0x3a6ea8, bx, 2.8, bz);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 6, 6), lambert(0x6b4a2a));
    mast.position.set(bx, 4.5, bz);
    mast.castShadow = true;
    scene.add(mast);
  }

  // ---- street lamps at every road crossing -------------------------------

  for (const cx of roadLines) {
    for (const cz of roadLines) {
      const lx = cx + 9.5;
      const lz = cz + 9.5;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 7, 6), lambert(0x3a3f45));
      pole.position.set(lx, 3.5, lz);
      pole.castShadow = true;
      scene.add(pole);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
      head.position.set(lx, 7.3, lz);
      scene.add(head);
    }
  }

  // ---- trees: forty-two, mostly suburbs and beach -----------------------

  let treesPlaced = 0;
  let treeGuard = 0;
  while (treesPlaced < 42 && treeGuard++ < 3000) {
    let x;
    let z;
    if (treesPlaced < 24) {
      // North Suburbs.
      x = rng.range(-230, 410);
      z = rng.range(-410, -190);
    } else {
      // Palma Beach.
      x = rng.range(-410, -250);
      z = rng.range(-410, 410);
    }
    if (onRoad(x, z)) continue;
    if (insideCollider(x, z, 4)) continue;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.6, 3, 6), lambert(0x6b4a2a));
    trunk.position.set(x, 1.5, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(rng.range(2.2, 3.4), 8, 6), lambert(0x3f7a34));
    crown.position.set(x, 4.6, z);
    crown.castShadow = true;
    scene.add(crown);
    addCollider(x, z, 5, 5);
    treesPlaced++;
  }

  // ---- light: sun, hemisphere, fog and sky ------------------------------

  const sun = new THREE.DirectionalLight(0xffd9a0, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -450;
  sun.shadow.camera.right = 450;
  sun.shadow.camera.top = 450;
  sun.shadow.camera.bottom = -450;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 1400;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5d7a4a, 0.7);
  scene.add(hemi);

  scene.fog = new THREE.Fog(0x9fc3e8, 500, 1400);
  scene.background = new THREE.Color(0x87b5e0);

  const gold = new THREE.Color(0xffc46b);
  const noonWhite = new THREE.Color(0xfff2df);
  const duskOrange = new THREE.Color(0xff7a2e);
  const skyMorning = new THREE.Color(0xa8c8e8);
  const skyNoon = new THREE.Color(0x6fb0e8);
  const skyDusk = new THREE.Color(0xe88a5a);
  const fogMorning = new THREE.Color(0xb8cfe0);
  const fogNoon = new THREE.Color(0x9fc3e8);
  const fogDusk = new THREE.Color(0xe89a6a);

  function setTimeOfDay(hour) {
    const span = Math.max(1, dayEnd - dayStart);
    const t = Math.max(0, Math.min(1, (hour - dayStart) / span));
    // Morning sun rises in the east, crosses overhead at noon,
    // and sets in the west at dusk.
    const angle = Math.PI * t;
    sun.position.set(Math.cos(angle) * 380, Math.sin(angle) * 320 + 60, 180);
    const sunCol = new THREE.Color();
    const skyCol = new THREE.Color();
    const fogCol = new THREE.Color();
    if (t < 0.5) {
      sunCol.lerpColors(gold, noonWhite, t * 2);
      skyCol.lerpColors(skyMorning, skyNoon, t * 2);
      fogCol.lerpColors(fogMorning, fogNoon, t * 2);
    } else {
      sunCol.lerpColors(noonWhite, duskOrange, (t - 0.5) * 2);
      skyCol.lerpColors(skyNoon, skyDusk, (t - 0.5) * 2);
      fogCol.lerpColors(fogNoon, fogDusk, (t - 0.5) * 2);
    }
    sun.color.copy(sunCol);
    sun.intensity = 0.9 + Math.sin(Math.PI * t) * 0.5;
    hemi.intensity = 0.55 + Math.sin(Math.PI * t) * 0.25;
    if (scene.background && scene.background.isColor) scene.background.copy(skyCol);
    if (scene.fog) scene.fog.color.copy(fogCol);
  }

  setTimeOfDay(dayStart);

  // ---- spawn points -------------------------------------------------------

  const beachDrops = [
    { x: -360, z: -240, heading: 0 },
    { x: -360, z: 0, heading: 0 },
    { x: -360, z: 240, heading: 0 },
  ];
  const spawnPoints = {
    hideout: { x: 0, z: 0, heading: 0 },
    marina: { x: 240, z: -60, heading: Math.PI / 2 },
    docks: { x: 0, z: 300, heading: 0 },
    beach: { x: -360, z: 0, heading: Math.PI / 2 },
    suburbs: { x: 120, z: -300, heading: 0 },
    downtown: { x: 120, z: 120, heading: Math.PI },
    vault: { x: 0, z: -120, heading: Math.PI / 2 },
    beachDrops,
    beachDrop1: beachDrops[0],
    beachDrop2: beachDrops[1],
    beachDrop3: beachDrops[2],
    goldCoupe: { x: 240, z: 120, heading: Math.PI / 2 },
    cashCrate: { x: -120, z: 240, heading: 0 },
  };

  // ---- per-frame update ---------------------------------------------------

  function update(dt) {
    const t = game.time || 0;
    water.position.y = 0.05 + Math.sin(t * 0.6) * 0.25;
  }

  return {
    bounds: {
      minX: -half, maxX: half, minZ: -half, maxZ: half,
      x0: -half, x1: half, z0: -half, z1: half,
      left: -half, right: half, top: -half, bottom: half,
    },
    districts: config.districts || [],
    colliders,
    isBlocked,
    onRoad,
    nearestRoadPoint,
    spawnPoints,
    setTimeOfDay,
    update,
  };
}
