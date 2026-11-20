// Sunport Heist — world.js (Module 1: the city of Solmar)
// Builds the whole playable city once into the scene, and provides the
// collision and road queries every other system uses. Written fresh from
// the rebuild brief and the rewrite interface document.

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// Read a rectangle out of a district object, tolerating edge field names.
function districtRect(d) {
  const x0 = d.xMin ?? d.x0 ?? d.minX ?? 0, x1 = d.xMax ?? d.x1 ?? d.maxX ?? 0;
  const z0 = d.zMin ?? d.z0 ?? d.minZ ?? 0, z1 = d.zMax ?? d.z1 ?? d.maxZ ?? 0;
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
}
function districtKind(d) { return (d.kind || d.type || d.id || '').toString().toLowerCase(); }

const DEFAULT_DISTRICTS = [
  { name: 'Palma Beach', kind: 'beach', xMin: -420, xMax: -240, zMin: -420, zMax: 420 },
  { name: 'North Suburbs', kind: 'suburbs', xMin: -240, xMax: 420, zMin: -420, zMax: -180 },
  { name: 'Downtown Solmar', kind: 'downtown', xMin: -240, xMax: 120, zMin: -180, zMax: 180 },
  { name: 'Marina Hills', kind: 'marina', xMin: 120, xMax: 420, zMin: -180, zMax: 180 },
  { name: 'Old Docks', kind: 'docks', xMin: -240, xMax: 420, zMin: 180, zMax: 420 },
];
const PALETTES = {
  downtown: [0x8a9ba8, 0x6e7f8a, 0xa8b0b8, 0x7a8fa0, 0x9aa5b1, 0x5f7080],
  marina: [0xe8c8a0, 0xf0d8b0, 0xc8d8e8, 0xe8b8a0, 0xd8c8e8, 0xb8d8c8],
  docks: [0xb85c38, 0x2e7f86, 0xc8822e, 0x7a4a3a, 0x4a7a5a, 0x8a6a2a],
  suburbs: [0xe8c8a0, 0xc8d8e8, 0xf0e0c0, 0xd8b8a0, 0xb8d0a8, 0xe8a8a0],
  beach: [0xe8d8a0, 0xf0e0b0, 0xd8c890, 0xffffff],
};
const DISTRICT_GROUND = { beach: 0xe8d8a0, downtown: 0x9aa0a6, docks: 0xb0a090, marina: 0x7fb069, suburbs: 0x8bc07a };

export function createWorld(game) {
  const config = (game && game.config) || {};
  const THREE = (game && game.THREE) || null;
  const scene = (game && game.scene) || null;
  const rng = (game && game.rng) || {
    next: () => 0.5, range: (a, b) => (a + b) / 2, int: (a, b) => Math.floor((a + b) / 2),
    pick: (l) => l[Math.floor(l.length / 2)], shuffle: (l) => l.slice(),
  };
  const seed = config.seed ?? 1337;
  void seed; // The random source is already seeded with this value by the entry point.
  // worldSize is the full width of the city (840) or its half-extent (420);
  // either way the playable rectangle is -420..420.
  let half = config.worldSize ?? 420;
  if (half > 500) half = half / 2;
  const size = half * 2;
  const roadSpacing = config.roadSpacing ?? 120;
  const dayStartHour = config.dayStartHour ?? 8;
  const dayEndHour = config.dayEndHour ?? 19;
  const districts = (config.districts && config.districts.length) ? config.districts : DEFAULT_DISTRICTS;
  // Road centre lines run from -360 to +360 in steps of 120, both axes.
  const roadLines = [];
  for (let v = -360; v <= 360; v += roadSpacing) roadLines.push(v);
  const bounds = { minX: -half, maxX: half, minZ: -half, maxZ: half };
  const colliders = [];
  function addCollider(cx, cz, hw, hd, pad) {
    const p = pad === undefined ? 0.6 : pad;
    colliders.push({ left: cx - hw - p, top: cz - hd - p, right: cx + hw + p, bottom: cz + hd + p });
  }
  function isBlocked(x, z, radius) {
    const r = radius || 0;
    if (x - r < -half || x + r > half || z - r < -half || z + r > half) return true;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (x + r > c.left && x - r < c.right && z + r > c.top && z - r < c.bottom) return true;
    }
    return false;
  }
  function onRoad(x, z) {
    for (let i = 0; i < roadLines.length; i++) {
      if (Math.abs(x - roadLines[i]) <= 9 || Math.abs(z - roadLines[i]) <= 9) return true;
    }
    return false;
  }
  function nearestRoadPoint(x, z) {
    let ns = roadLines[0], ew = roadLines[0];
    for (let i = 1; i < roadLines.length; i++) {
      if (Math.abs(x - roadLines[i]) < Math.abs(x - ns)) ns = roadLines[i];
      if (Math.abs(z - roadLines[i]) < Math.abs(z - ew)) ew = roadLines[i];
    }
    if (Math.abs(x - ns) <= Math.abs(z - ew)) return { x: ns, z: z, heading: 0 };
    return { x: x, z: ew, heading: Math.PI / 2 };
  }
  function districtAt(x, z) {
    for (let i = 0; i < districts.length; i++) {
      const r = districtRect(districts[i]);
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return districts[i];
    }
    return null;
  }
  const spawnPoints = {
    hideout: { x: 0, z: 0, heading: 0 },
    marina: { x: 240, z: -60, heading: Math.PI / 2 },
    docks: { x: 0, z: 300, heading: 0 },
    beach: { x: -360, z: 0, heading: Math.PI / 2 },
    suburbs: { x: 120, z: -300, heading: 0 },
    downtown: { x: 120, z: 120, heading: Math.PI },
    vault: { x: 0, z: -120, heading: Math.PI / 2 },
    beachDrops: [{ x: -360, z: -240, heading: 0 }, { x: -360, z: 0, heading: 0 }, { x: -360, z: 240, heading: 0 }],
    goldCoupe: { x: 240, z: 120, heading: Math.PI / 2 },
    cashCrate: { x: -120, z: 240, heading: 0 },
  };
  let sun = null, water = null;
  const waterBaseY = 0.15;
  let currentHour = dayStartHour;
  function setTimeOfDay(hour) {
    currentHour = hour;
    if (!THREE || !scene) return;
    const t = clamp((hour - dayStartHour) / (dayEndHour - dayStartHour), 0, 1);
    // Sun sweeps east to west: low at morning and dusk, high at noon.
    if (sun) sun.position.set(-Math.cos(Math.PI * t) * 420, Math.sin(Math.PI * t) * 340 + 60, 160);
    const gold = new THREE.Color(0xffd27a), noon = new THREE.Color(0xfff6e0), dusk = new THREE.Color(0xff8c4a);
    const sunColour = new THREE.Color();
    if (t < 0.5) sunColour.lerpColors(gold, noon, t * 2); else sunColour.lerpColors(noon, dusk, (t - 0.5) * 2);
    if (sun) { sun.color.copy(sunColour); sun.intensity = 0.9 + Math.sin(Math.PI * t) * 0.35; }
    const morningSky = new THREE.Color(0xffe8c0), noonSky = new THREE.Color(0x87ceeb), duskSky = new THREE.Color(0xff9a66);
    const skyColour = new THREE.Color();
    if (t < 0.5) skyColour.lerpColors(morningSky, noonSky, t * 2); else skyColour.lerpColors(noonSky, duskSky, (t - 0.5) * 2);
    if (scene.background && scene.background.isColor) scene.background.copy(skyColour);
    else scene.background = skyColour;
    if (scene.fog) scene.fog.color.copy(skyColour);
  }

  // ---- Build the city into the scene (only when the library is present).
  if (THREE && scene) {
    const lambert = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color: color }, extra || {}));
    const basic = (color) => new THREE.MeshBasicMaterial({ color: color });
    function add(geo, material, x, y, z, shadow) {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      if (shadow) { m.castShadow = true; m.receiveShadow = true; }
      scene.add(m);
      return m;
    }
    function flat(w, d, material, x, y, z) {
      const m = add(new THREE.PlaneGeometry(w, d), material, x, y, z);
      m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
      return m;
    }
    // Grass ground plane covering the whole city.
    flat(size, size, lambert(0x6fae5e), 0, 0, 0);
    // One tinted ground slab per district.
    for (let i = 0; i < districts.length; i++) {
      const r = districtRect(districts[i]);
      const kind = districtKind(districts[i]);
      flat(r.x1 - r.x0, r.z1 - r.z0, lambert(DISTRICT_GROUND[kind] ?? 0x8bc07a), (r.x0 + r.x1) / 2, 0.02 + i * 0.001, (r.z0 + r.z1) / 2);
    }
    // Road grid: dark asphalt 14 wide, pale sidewalks 4 wide both sides.
    const asphalt = lambert(0x333338), sidewalkMat = lambert(0xb8b8a8);
    for (let i = 0; i < roadLines.length; i++) {
      const line = roadLines[i];
      flat(14, size, asphalt, line, 0.04, 0);
      flat(size, 14, asphalt, 0, 0.04, line);
      for (const side of [-9, 9]) {
        flat(4, size, sidewalkMat, line + side, 0.03, 0);
        flat(size, 4, sidewalkMat, 0, 0.03, line + side);
      }
    }
    // Yellow centre dashes as one instanced mesh, skipping crossings.
    const dashSpots = [];
    for (let i = 0; i < roadLines.length; i++) {
      const line = roadLines[i];
      for (let v = -half + 8; v <= half - 8; v += 8) {
        let nearCrossing = false;
        for (let j = 0; j < roadLines.length; j++) if (Math.abs(v - roadLines[j]) < 11) { nearCrossing = true; break; }
        if (nearCrossing) continue;
        dashSpots.push({ x: line, z: v, ew: false }, { x: v, z: line, ew: true });
      }
    }
    const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.06, 3), basic(0xf0d040), dashSpots.length);
    for (let i = 0; i < dashSpots.length; i++) {
      const m = new THREE.Matrix4();
      if (dashSpots[i].ew) m.makeRotationY(Math.PI / 2);
      m.setPosition(dashSpots[i].x, 0.07, dashSpots[i].z);
      dashes.setMatrixAt(i, m);
    }
    dashes.instanceMatrix.needsUpdate = true;
    scene.add(dashes);
    // Buildings on the block centres, one or two per block, never on a road.
    const blockCentres = [-300, -180, -60, 60, 180, 300];
    for (let bi = 0; bi < blockCentres.length; bi++) {
      for (let bj = 0; bj < blockCentres.length; bj++) {
        const bx = blockCentres[bi], bz = blockCentres[bj];
        const district = districtAt(bx, bz);
        if (!district) continue;
        const kind = districtKind(district);
        if (kind === 'beach') continue; // Beach gets umbrellas instead of buildings.
        if (kind === 'marina' && bx >= 300) continue; // Marina east blocks are open water.
        const palette = district.palette || district.colors || PALETTES[kind] || PALETTES.downtown;
        const count = rng.int(1, 2);
        for (let k = 0; k < count; k++) {
          const px = bx + (count === 1 ? 0 : k === 0 ? -22 : 22);
          const pz = bz + (count === 1 ? 0 : k === 0 ? 18 : -18);
          let w, d, h;
          if (kind === 'downtown') { w = rng.range(28, 44); d = rng.range(28, 44); h = rng.range(26, 78); }
          else if (kind === 'marina') { w = rng.range(24, 38); d = rng.range(24, 38); h = rng.range(12, 30); }
          else if (kind === 'docks') { w = rng.range(18, 26); d = rng.range(10, 14); h = rng.range(4, 9); }
          else if (kind === 'suburbs') { w = rng.range(16, 26); d = rng.range(16, 26); h = rng.range(6, 12); }
          else { w = rng.range(20, 30); d = rng.range(20, 30); h = rng.range(10, 25); }
          add(new THREE.BoxGeometry(w, h, d), lambert(rng.pick(palette)), px, h / 2, pz, true);
          add(new THREE.BoxGeometry(w + 1, 0.6, d + 1), lambert(0x333333), px, h + 0.3, pz); // Thin darker roof slab.
          addCollider(px, pz, w / 2, d / 2);
          if (kind === 'docks' && rng.next() < 0.5) { // A second stacked container on some blocks.
            const cw = rng.range(10, 16), ch = rng.range(3, 5);
            add(new THREE.BoxGeometry(cw, ch, d * 0.7), lambert(rng.pick(palette)), px, h + ch / 2 + 0.6, pz, true);
          }
        }
      }
    }
    // Beach: twelve umbrellas (red and blue cones on poles), no buildings.
    for (let i = 0; i < 12; i++) {
      const ux = rng.range(-400, -270), uz = rng.range(-380, 380);
      add(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), lambert(0xd8d0c0), ux, 1.2, uz);
      add(new THREE.ConeGeometry(2.2, 1.2, 8), lambert(i % 2 === 0 ? 0xd83a2e : 0x2e6fd8), ux, 2.9, uz, true);
    }
    // Lifeguard tower at x -330, z 0.
    add(new THREE.BoxGeometry(3, 4, 3), lambert(0xf0e0c0), -330, 2, 0, true);
    add(new THREE.BoxGeometry(4, 0.4, 4), lambert(0xd83a2e), -330, 4.2, 0);
    addCollider(-330, 0, 1.5, 1.5);
    // Marina: water plane 120 by 240 at x 360, z -60, two wooden piers, three moored boats.
    water = flat(120, 240, lambert(0x2e86ab, { transparent: true, opacity: 0.85 }), 360, waterBaseY, -60);
    for (const pierZ of [-120, 0]) add(new THREE.BoxGeometry(36, 0.5, 4), lambert(0x8a6a42), 330, 0.4, pierZ, true);
    const boatHulls = [0xf0f0e8, 0xd8e8f0, 0xf0d8c8], boatSpots = [[345, -140], [375, -60], [350, 20]];
    for (let i = 0; i < 3; i++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 8), lambert(boatHulls[i]));
      hull.position.y = 0.5; boat.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 6), lambert(0x6a4a2a));
      mast.position.y = 3; boat.add(mast);
      boat.position.set(boatSpots[i][0], waterBaseY, boatSpots[i][1]);
      scene.add(boat);
    }
    // Street lamps (a pole and a glowing head) at every road crossing.
    for (let i = 0; i < roadLines.length; i++) {
      for (let j = 0; j < roadLines.length; j++) {
        const lx = roadLines[i] + 8, lz = roadLines[j] + 8;
        add(new THREE.CylinderGeometry(0.12, 0.12, 4.5, 6), lambert(0x3a3a3a), lx, 2.25, lz);
        add(new THREE.SphereGeometry(0.35, 8, 6), basic(0xffe9a0), lx, 4.6, lz);
      }
    }
    // Forty-two trees, mostly in the suburbs and along the beach, never
    // on a road, never in downtown or the docks, never inside a building.
    let treesPlaced = 0, treeAttempts = 0;
    while (treesPlaced < 42 && treeAttempts < 800) {
      treeAttempts++;
      let tx, tz;
      if (rng.next() < 0.65) { tx = rng.range(-230, 410); tz = rng.range(-410, -190); }
      else { tx = rng.range(-410, -250); tz = rng.range(-410, 410); }
      if (onRoad(tx, tz) || isBlocked(tx, tz, 1.5)) continue;
      add(new THREE.CylinderGeometry(0.25, 0.3, 1.4, 6), lambert(0x6a4a2a), tx, 0.7, tz, true);
      add(new THREE.ConeGeometry(1.8, 3.2, 8), lambert(treesPlaced % 2 === 0 ? 0x3a8a3a : 0x4aa84a), tx, 3, tz, true);
      addCollider(tx, tz, 0.9, 0.9, 0.4);
      treesPlaced++;
    }
    // The light itself: directional sun with shadows, hemisphere light,
    // fog and a blue sky background.
    sun = new THREE.DirectionalLight(0xffd27a, 1.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -450; sun.shadow.camera.right = 450;
    sun.shadow.camera.top = 450; sun.shadow.camera.bottom = -450;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 1200;
    scene.add(sun); scene.add(sun.target);
    scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.7));
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 300, 900);
  }
  // The sun starts at the morning hour.
  setTimeOfDay(dayStartHour);
  function update(dt) {
    const t = (game && typeof game.time === 'number') ? game.time : currentHour;
    if (water) water.position.y = waterBaseY + Math.sin(t * 0.6) * 0.12; // Slow swell.
    void dt;
  }
  const world = {
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
  return world;
}

export default createWorld;
