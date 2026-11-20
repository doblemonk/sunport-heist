// Sunport Heist — the city of Solmar: roads, buildings, beach, docks,
// marina, trees, lamps, light and the collision / road queries.
export function createWorld(game) {
  var THREE = game.THREE;
  var scene = game.scene;
  var cfg = game.config || {};
  var rng = game.rng || {
    next: function () { return 0.5; },
    range: function (a, b) { return (a + b) / 2; },
    int: function (a, b) { return Math.floor((a + b) / 2); },
    pick: function (list) { return list[0]; },
    shuffle: function (list) { return list.slice(); }
  };

  var HALF = 420;
  var SPACING = cfg.roadSpacing || 120;
  var DAY_START = cfg.dayStartHour != null ? cfg.dayStartHour : 8;
  var DAY_END = cfg.dayEndHour != null ? cfg.dayEndHour : 19;

  // Road centre lines run from -360 to +360 in steps of 120 on both axes.
  var roadLines = [];
  var v;
  for (v = -360; v <= 360; v += SPACING) roadLines.push(v);

  var colliders = [];
  function addCollider(cx, cz, hw, hd) {
    colliders.push({ left: cx - hw, top: cz - hd, right: cx + hw, bottom: cz + hd });
  }

  function isBlocked(x, z, r) {
    if (x - r < -HALF || x + r > HALF || z - r < -HALF || z + r > HALF) return true;
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      if (x + r > c.left && x - r < c.right && z + r > c.top && z - r < c.bottom) return true;
    }
    return false;
  }

  function onRoad(x, z) {
    for (var i = 0; i < roadLines.length; i++) {
      if (Math.abs(x - roadLines[i]) <= 9) return true;
      if (Math.abs(z - roadLines[i]) <= 9) return true;
    }
    return false;
  }

  function nearestRoadPoint(x, z) {
    var bestNS = roadLines[0];
    var bestEW = roadLines[0];
    var dNS = Math.abs(x - bestNS);
    var dEW = Math.abs(z - bestEW);
    for (var i = 1; i < roadLines.length; i++) {
      if (Math.abs(x - roadLines[i]) < dNS) { dNS = Math.abs(x - roadLines[i]); bestNS = roadLines[i]; }
      if (Math.abs(z - roadLines[i]) < dEW) { dEW = Math.abs(z - roadLines[i]); bestEW = roadLines[i]; }
    }
    if (dNS <= dEW) return { x: bestNS, z: z, heading: 0 };
    return { x: x, z: bestEW, heading: Math.PI / 2 };
  }

  // District kind for a point, following the tiling in the configuration:
  // beach is the west strip, suburbs the north, downtown the centre,
  // marina the east centre, docks the south.
  function districtKindAt(x, z) {
    if (x < -240) return 'beach';
    if (z >= 180) return 'docks';
    if (z < -180) return 'suburbs';
    if (x >= 120) return 'marina';
    return 'downtown';
  }

  var PALETTES = {
    downtown: [0x8a9ba8, 0x6e7f8c, 0xa8b0b8, 0x5d6d7e, 0x7f8c8d, 0x95a5a6],
    marina: [0xf5e6c8, 0xe8d5b0, 0xd9c7a7, 0xfff2d9, 0xe6c9a8],
    docks: [0xb5533c, 0x3c6e8f, 0x4e7a4e, 0xc07a2a, 0x7a5c8f],
    suburbs: [0xf2e3c6, 0xe8b4a0, 0xa8c8d8, 0xf5d5a0, 0xd8e8c8, 0xe8c8c8]
  };

  function lambert(color) {
    return new THREE.MeshLambertMaterial({ color: color });
  }
  function box(w, h, d, color, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
    m.position.set(x, y, z);
    return m;
  }

  // ---- Ground: grass plane, then one tinted slab per district. ----
  var grass = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, HALF * 2),
    lambert(0x6fa85c)
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, 0, 0);
  grass.receiveShadow = true;
  scene.add(grass);

  var DISTRICT_SLABS = [
    { x0: -420, x1: -240, z0: -420, z1: 420, color: 0xe8d8a0 }, // beach sand
    { x0: -240, x1: 420, z0: -420, z1: -180, color: 0x8fbc6b }, // suburbs green
    { x0: -240, x1: 120, z0: -180, z1: 180, color: 0x9a9a9a }, // downtown grey
    { x0: 120, x1: 420, z0: -180, z1: 180, color: 0x7fb069 }, // marina green
    { x0: -240, x1: 420, z0: 180, z1: 420, color: 0xb0a58f }  // docks tan-grey
  ];
  DISTRICT_SLABS.forEach(function (s) {
    var slab = new THREE.Mesh(
      new THREE.PlaneGeometry(s.x1 - s.x0, s.z1 - s.z0),
      lambert(s.color)
    );
    slab.rotation.x = -Math.PI / 2;
    slab.position.set((s.x0 + s.x1) / 2, 0.02, (s.z0 + s.z1) / 2);
    slab.receiveShadow = true;
    scene.add(slab);
  });

  // ---- Roads: dark asphalt 14 wide, pale sidewalks 4 wide both sides. ----
  var asphalt = lambert(0x3a3a3e);
  var sidewalkMat = lambert(0xcfc8b8);
  roadLines.forEach(function (line) {
    var ns = new THREE.Mesh(new THREE.PlaneGeometry(14, HALF * 2), asphalt);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(line, 0.03, 0);
    ns.receiveShadow = true;
    scene.add(ns);
    var ew = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 14), asphalt);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.03, line);
    ew.receiveShadow = true;
    scene.add(ew);
    // Sidewalks on both sides of each road.
    [-11, 11].forEach(function (off) {
      var swNS = new THREE.Mesh(new THREE.PlaneGeometry(4, HALF * 2), sidewalkMat);
      swNS.rotation.x = -Math.PI / 2;
      swNS.position.set(line + off, 0.035, 0);
      scene.add(swNS);
      var swEW = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 4), sidewalkMat);
      swEW.rotation.x = -Math.PI / 2;
      swEW.position.set(0, 0.035, line + off);
      scene.add(swEW);
    });
  });

  // ---- Yellow centre dashes as one instanced mesh, skipping crossings. ----
  var dashSpots = [];
  roadLines.forEach(function (line) {
    for (var p = -360; p <= 360; p += 12) {
      var nearCrossing = false;
      for (var i = 0; i < roadLines.length; i++) {
        if (Math.abs(p - roadLines[i]) < 11) { nearCrossing = true; break; }
      }
      if (nearCrossing) continue;
      dashSpots.push({ x: line, z: p, rot: 0 });
      dashSpots.push({ x: p, z: line, rot: Math.PI / 2 });
    }
  });
  var dashMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.9, 0.06, 4),
    new THREE.MeshBasicMaterial({ color: 0xf5d90a }),
    dashSpots.length
  );
  var dummy = new THREE.Object3D();
  dashSpots.forEach(function (s, i) {
    dummy.position.set(s.x, 0.06, s.z);
    dummy.rotation.set(0, s.rot, 0);
    dummy.updateMatrix();
    dashMesh.setMatrixAt(i, dummy.matrix);
  });
  dashMesh.instanceMatrix.needsUpdate = true;
  scene.add(dashMesh);

  // ---- Buildings on block centres, one or two per block, never on a road. ----
  var BLOCKS = [-300, -180, -60, 60, 180, 300];
  function addBuilding(cx, cz, w, h, d, color) {
    var group = new THREE.Group();
    var body = box(w, h, d, color, 0, h / 2, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    var roofColor = new THREE.Color(color).multiplyScalar(0.65).getHex();
    var roof = box(w + 1, 0.6, d + 1, roofColor, 0, h + 0.3, 0);
    group.add(roof);
    group.position.set(cx, 0, cz);
    scene.add(group);
    addCollider(cx, cz, w / 2 + 1, d / 2 + 1);
  }

  BLOCKS.forEach(function (bx) {
    BLOCKS.forEach(function (bz) {
      var kind = districtKindAt(bx, bz);
      if (kind === 'beach') return; // beach gets umbrellas, not buildings
      if (kind === 'marina' && bx >= 300) return; // east marina blocks are open water
      var count = rng.int(1, 2);
      for (var n = 0; n < count; n++) {
        var w, h, d, color;
        color = rng.pick(PALETTES[kind]);
        if (kind === 'downtown') {
          w = rng.range(28, 44); d = rng.range(28, 44); h = rng.range(26, 78);
        } else if (kind === 'marina') {
          w = rng.range(24, 38); d = rng.range(24, 38); h = rng.range(12, 30);
        } else if (kind === 'docks') {
          w = rng.range(18, 26); d = rng.range(10, 14); h = rng.range(4, 9);
        } else {
          w = rng.range(16, 26); d = rng.range(16, 26); h = rng.range(6, 12);
        }
        var maxOffX = Math.max(4, 52 - w / 2);
        var maxOffZ = Math.max(4, 52 - d / 2);
        var ox = n === 0 ? rng.range(-maxOffX, 0) : rng.range(0, maxOffX);
        var oz = n === 0 ? rng.range(-maxOffZ, 0) : rng.range(0, maxOffZ);
        var cx = bx + ox;
        var cz = bz + oz;
        if (kind === 'docks') {
          // Stacked shipping containers.
          var group = new THREE.Group();
          var stack = rng.int(2, 3);
          for (var s = 0; s < stack; s++) {
            var cont = box(w, h, d, rng.pick(PALETTES.docks), (s % 2) * 1.5 - 0.75, h / 2 + s * h, (s % 2) * -1 + 0.5);
            cont.castShadow = true;
            group.add(cont);
          }
          group.position.set(cx, 0, cz);
          scene.add(group);
          addCollider(cx, cz, w / 2 + 1, d / 2 + 1);
        } else {
          addBuilding(cx, cz, w, h, d, color);
        }
      }
    });
  });

  // ---- Beach: twelve umbrellas and a lifeguard tower, no buildings. ----
  var umbrellaColors = [0xd93a3a, 0x3a6fd9];
  for (var u = 0; u < 12; u++) {
    var ux = rng.range(-410, -260);
    var uz = rng.range(-400, 400);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), lambert(0xd8c8a8));
    pole.position.set(ux, 1.5, uz);
    scene.add(pole);
    var canopy = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 1.4, 8),
      lambert(umbrellaColors[u % 2])
    );
    canopy.position.set(ux, 3.6, uz);
    canopy.castShadow = true;
    scene.add(canopy);
  }
  // Lifeguard tower at (-330, 0).
  var tower = new THREE.Group();
  [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].forEach(function (off) {
    var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4, 6), lambert(0x8a6a45));
    leg.position.set(off[0], 2, off[1]);
    tower.add(leg);
  });
  tower.add(box(4.4, 0.4, 4.4, 0xd8c8a8, 0, 4.2, 0));
  tower.add(box(3.6, 2, 3.6, 0xf2f2f2, 0, 5.4, 0));
  var towerRoof = new THREE.Mesh(new THREE.ConeGeometry(3, 1.2, 4), lambert(0xd93a3a));
  towerRoof.position.set(0, 7, 0);
  towerRoof.rotation.y = Math.PI / 4;
  tower.add(towerRoof);
  tower.position.set(-330, 0, 0);
  scene.add(tower);
  addCollider(-330, 0, 2.6, 2.6);

  // ---- Marina: water plane, two wooden piers, three moored boats. ----
  var water = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 240),
    new THREE.MeshStandardMaterial({ color: 0x2e7fa8, roughness: 0.3, metalness: 0.1 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(360, 0.06, -60);
  scene.add(water);
  var pierMat = lambert(0x8a6a45);
  [[-120], [-20]].forEach(function (pz) {
    var pier = new THREE.Mesh(new THREE.BoxGeometry(52, 0.5, 4), pierMat);
    pier.position.set(326, 0.3, pz[0]);
    pier.castShadow = true;
    scene.add(pier);
  });
  [[340, -120], [385, -60], [345, -10]].forEach(function (bp) {
    var boat = new THREE.Group();
    boat.add(box(7, 1.4, 2.6, 0xf2f2f2, 0, 0.7, 0));
    var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 6), lambert(0x6a4a2a));
    mast.position.set(0, 3.5, 0);
    boat.add(mast);
    boat.add(box(0.2, 3.4, 2.2, 0xffffff, 0.4, 3.4, 0));
    boat.position.set(bp[0], 0.1, bp[1]);
    boat.rotation.y = rng.range(-0.3, 0.3);
    scene.add(boat);
  });

  // ---- Street lamps at every road crossing: pole plus glowing head. ----
  var lampPoleMat = lambert(0x444444);
  var lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  roadLines.forEach(function (lx) {
    roadLines.forEach(function (lz) {
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 5.5, 6), lampPoleMat);
      pole.position.set(lx + 11, 2.75, lz + 11);
      scene.add(pole);
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), lampHeadMat);
      head.position.set(lx + 11, 5.8, lz + 11);
      scene.add(head);
    });
  });

  // ---- Forty-two trees, mostly suburbs and beach, never on a road,
  // never downtown or docks, never inside a building. ----
  var treeCount = 0;
  var attempts = 0;
  var trunkMat = lambert(0x6a4a2a);
  var leafMats = [lambert(0x3f7a3a), lambert(0x4c8a3f), lambert(0x5a9a4a)];
  while (treeCount < 42 && attempts < 800) {
    attempts++;
    var tx, tz;
    if (rng.next() < 0.7) {
      tx = rng.range(-230, 410);
      tz = rng.range(-410, -190);
    } else {
      tx = rng.range(-410, -250);
      tz = rng.range(-410, 410);
    }
    if (onRoad(tx, tz)) continue;
    if (isBlocked(tx, tz, 2)) continue;
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 6), trunkMat);
    trunk.position.set(tx, 1.3, tz);
    trunk.castShadow = true;
    scene.add(trunk);
    var crown = new THREE.Mesh(
      new THREE.SphereGeometry(rng.range(2.2, 3.1), 8, 6),
      rng.pick(leafMats)
    );
    crown.position.set(tx, rng.range(3.6, 4.4), tz);
    crown.castShadow = true;
    scene.add(crown);
    addCollider(tx, tz, 1.6, 1.6);
    treeCount++;
  }

  // ---- Light: directional sun with shadows, hemisphere light, fog, sky. ----
  var sun = new THREE.DirectionalLight(0xffc866, 1.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -450;
  sun.shadow.camera.right = 450;
  sun.shadow.camera.top = 450;
  sun.shadow.camera.bottom = -450;
  sun.shadow.camera.far = 1200;
  scene.add(sun);
  scene.add(sun.target);

  var hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6a7a5a, 0.7);
  scene.add(hemi);

  scene.fog = new THREE.Fog(0xbfd9f2, 500, 1100);
  scene.background = new THREE.Color(0x87ceeb);

  var GOLD = new THREE.Color(0xffc866);
  var WHITE = new THREE.Color(0xffffff);
  var ORANGE = new THREE.Color(0xff8844);
  var SKY_MORNING = new THREE.Color(0xbfd9f2);
  var SKY_NOON = new THREE.Color(0x87ceeb);
  var SKY_DUSK = new THREE.Color(0xff9e66);

  function setTimeOfDay(hour) {
    var t = (hour - DAY_START) / (DAY_END - DAY_START);
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    // Sun sweeps east to west, high at noon.
    sun.position.set((1 - 2 * t) * 400, Math.sin(Math.PI * t) * 320 + 60, 160);
    sun.target.position.set(0, 0, 0);
    var sunColor = new THREE.Color();
    var skyColor = new THREE.Color();
    if (t < 0.5) {
      sunColor.lerpColors(GOLD, WHITE, t * 2);
      skyColor.lerpColors(SKY_MORNING, SKY_NOON, t * 2);
    } else {
      sunColor.lerpColors(WHITE, ORANGE, (t - 0.5) * 2);
      skyColor.lerpColors(SKY_NOON, SKY_DUSK, (t - 0.5) * 2);
    }
    sun.color.copy(sunColor);
    scene.background = skyColor;
    if (scene.fog) scene.fog.color.copy(skyColor);
  }
  setTimeOfDay(DAY_START);

  function update(dt) {
    // Gentle marina swell.
    water.position.y = 0.06 + Math.sin((game.time || 0) * 0.5) * 0.15;
  }

  return {
    bounds: { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF },
    districts: cfg.districts || [],
    colliders: colliders,
    isBlocked: isBlocked,
    onRoad: onRoad,
    nearestRoadPoint: nearestRoadPoint,
    spawnPoints: {
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
        { x: -360, z: 240, heading: 0 }
      ],
      goldCoupe: { x: 240, z: 120, heading: Math.PI / 2 },
      cashCrate: { x: -120, z: 240, heading: 0 }
    },
    setTimeOfDay: setTimeOfDay,
    update: update
  };
}
