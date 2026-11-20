// missions.js — the six story jobs of Sunport Heist and the yellow marker.
// Job 1 starts automatically when play begins (the main script calls
// start(0)). Each job pays cash and ammo on completion and starts the
// next one; the last job ends the game.

export function createMissions(game) {
  const THREE = game.THREE;
  const cfg = game.config || {};
  const REACH_DIST = 4;

  const defs = (cfg.missions || []).map((m) => ({
    name: m.name || 'Job',
    timeLimit: m.timeLimit || m.time || 180,
    cash: m.cash || m.reward || 500,
    ammo: m.ammo || m.ammoReward || 12,
  }));
  // Fallbacks so the story still runs if the config list is short.
  const FALLBACK = [
    { name: 'First Delivery', timeLimit: 180, cash: 300, ammo: 12 },
    { name: 'Hot Wheels', timeLimit: 240, cash: 500, ammo: 12 },
    { name: 'Beach Pickup', timeLimit: 240, cash: 450, ammo: 12 },
    { name: 'Getaway Driver', timeLimit: 240, cash: 600, ammo: 12 },
    { name: 'Dock Heist', timeLimit: 300, cash: 900, ammo: 24 },
    { name: 'The Sunport Heist', timeLimit: 360, cash: 2500, ammo: 24 },
  ];
  while (defs.length < 6) defs.push(FALLBACK[defs.length]);

  // --- marker: cylinder beacon, pulsing ring and a light pillar ----------
  const marker = new THREE.Group();
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 0.25, 24),
    new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.55 })
  );
  beacon.position.y = 0.15;
  marker.add(beacon);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.12, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xfde047 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  marker.add(ring);
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.45, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfacc15, transparent: true, opacity: 0.10,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  pillar.position.y = 15;
  marker.add(pillar);
  marker.visible = false;
  if (game.scene) game.scene.add(marker);

  const markerPos = new THREE.Vector3(0, 0, 0);

  const missions = {
    list: defs,
    current: null,
    marker,
    markerPos,
    objectiveText,
    start,
    update,
  };

  function point(name) {
    const sp = game.world && game.world.spawnPoints;
    if (!sp) return { x: 0, z: 0 };
    const p = sp[name];
    if (!p) return { x: 0, z: 0 };
    return { x: p.x || 0, z: p.z || 0 };
  }

  function beachDrop(i) {
    const sp = game.world && game.world.spawnPoints;
    const drops = sp && sp.beachDrops;
    if (drops && drops[i]) return { x: drops[i].x || 0, z: drops[i].z || 0 };
    const beach = point('beach');
    return { x: beach.x + i * 30, z: beach.z };
  }

  // Target position for a job at a given stage.
  function stageTarget(index, stage) {
    switch (index) {
      case 0: return point('marina');
      case 1:
        if (stage === 0) return point('goldCoupe');
        if (stage === 1) return point('goldCoupe');
        return point('docks');
      case 2: return beachDrop(stage);
      case 3: return point('hideout');
      case 4:
        if (stage === 0) return point('cashCrate');
        return point('hideout');
      case 5:
        if (stage === 0) return point('vault');
        return point('hideout');
      default: return point('hideout');
    }
  }

  function stageCount(index) {
    if (index === 1) return 3;
    if (index === 2) return 3;
    if (index === 4) return 2;
    if (index === 5) return 2;
    return 1;
  }

  function moveMarkerTo(x, z) {
    markerPos.set(x, 0, z);
    marker.position.set(x, 0, z);
    marker.visible = true;
  }

  function start(i) {
    const def = defs[i];
    if (!def) return;
    missions.current = {
      index: i,
      name: def.name,
      stage: 0,
      timeLeft: def.timeLimit,
      target: stageTarget(i, 0),
    };
    // Job 4 opens hot: the getaway starts at two stars.
    if (i === 3 && game.police && game.police.addHeat) {
      game.police.addHeat(2);
    }
    const t = missions.current.target;
    moveMarkerTo(t.x, t.z);
    if (game.message) game.message('New job: ' + def.name);
  }

  function failJob(reason) {
    const cur = missions.current;
    if (!cur) return;
    if (game.message) game.message('Job failed — ' + reason + '. Head back to the marker and try again.');
    if (game.events) game.events.emit('missionFailed', { index: cur.index, reason });
    // The job stays current with a fresh timer; the marker goes back to
    // the job's start point so the player walks back to retry.
    cur.stage = 0;
    cur.timeLeft = defs[cur.index].timeLimit;
    cur.target = stageTarget(cur.index, 0);
    moveMarkerTo(cur.target.x, cur.target.z);
  }

  function completeJob() {
    const cur = missions.current;
    if (!cur) return;
    const def = defs[cur.index];
    game.cash = (game.cash || 0) + def.cash;
    if (game.player && game.player.addAmmo) game.player.addAmmo(def.ammo);
    else game.ammo = (game.ammo || 0) + def.ammo;
    if (game.audio && game.audio.missionDone) game.audio.missionDone();
    if (game.message) game.message('Job complete: ' + def.name + '  +$' + def.cash);
    if (game.events) game.events.emit('missionComplete', { index: cur.index, cash: def.cash });
    if (cur.index === 5) {
      // The Sunport Heist pays the debt: the story is over.
      missions.current = null;
      marker.visible = false;
      if (game.setState) game.setState('complete');
      return;
    }
    start(cur.index + 1);
  }

  function objectiveText() {
    const cur = missions.current;
    if (!cur) return 'No active job.';
    switch (cur.index) {
      case 0: return 'Deliver the package to Marina Hills.';
      case 1:
        if (cur.stage === 0) return 'Find the gold coupe in the North Suburbs.';
        if (cur.stage === 1) return 'Get in the gold coupe.';
        return 'Drive the gold coupe to the Old Docks.';
      case 2: return 'Collect the beach drops along Palma Beach (' + (cur.stage + 1) + '/3).';
      case 3:
        if ((game.wanted || 0) > 0) return 'Lose the heat, then return to the Hideout.';
        return 'Heat is clear — get back to the Hideout.';
      case 4:
        if (cur.stage === 0) return 'Grab the cash crate in the container yard.';
        return 'Bring the crate home — stay under four stars.';
      case 5:
        if (cur.stage === 0) return 'Reach the downtown vault.';
        return 'Vault cash secured — drive home and finish the heist.';
      default: return cur.name;
    }
  }

  function playerInCar() {
    return !!(game.player && game.player.car);
  }

  function update(dt) {
    // Pulse the marker so it reads from across the city.
    if (marker.visible) {
      const t = game.time || 0;
      const pulse = 1 + Math.sin(t * 4) * 0.12;
      ring.scale.set(pulse, pulse, 1);
      pillar.rotation.y = t * 0.6;
      beacon.material.opacity = 0.4 + Math.sin(t * 4) * 0.15;
    }
    const cur = missions.current;
    if (!cur) return;
    const p = game.player && game.player.position;
    if (!p) return;

    cur.timeLeft -= dt;
    if (cur.timeLeft <= 0) {
      failJob('out of time');
      return;
    }

    // Job 5 fails the moment the heat hits four stars.
    if (cur.index === 4 && (game.wanted || 0) >= 4) {
      failJob('the heat hit four stars');
      return;
    }

    const t = cur.target;
    const dist = Math.hypot(p.x - t.x, p.z - t.z);

    // Job 2, stage 1 is "enter the coupe": reaching it is not enough.
    if (cur.index === 1 && cur.stage === 1) {
      if (playerInCar() && dist < 6) {
        advance();
      }
      return;
    }

    // Job 4 completes only when the heat is gone AND the player is home.
    if (cur.index === 3) {
      if ((game.wanted || 0) === 0 && dist < REACH_DIST) {
        completeJob();
      }
      return;
    }

    if (dist < REACH_DIST) {
      // Job 6: arriving at the vault turns the heat up to four stars.
      if (cur.index === 5 && cur.stage === 0 && game.police && game.police.addHeat) {
        while ((game.wanted || 0) < 4) game.police.addHeat(1);
      }
      advance();
    }
  }

  function advance() {
    const cur = missions.current;
    if (!cur) return;
    cur.stage += 1;
    if (cur.stage >= stageCount(cur.index)) {
      completeJob();
      return;
    }
    cur.target = stageTarget(cur.index, cur.stage);
    moveMarkerTo(cur.target.x, cur.target.z);
    if (game.message) game.message(objectiveText());
  }

  return missions;
}
