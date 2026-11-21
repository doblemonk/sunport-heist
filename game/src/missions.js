// Sunport Heist — missions: the six story jobs, markers, timers, rewards.
export function createMissions(game) {
  const FALLBACK = [
    { name: 'First Delivery', time: 120, cash: 300, ammo: 12 },
    { name: 'Hot Wheels', time: 180, cash: 500, ammo: 12 },
    { name: 'Beach Pickup', time: 150, cash: 400, ammo: 12 },
    { name: 'Getaway Driver', time: 180, cash: 600, ammo: 12 },
    { name: 'Dock Heist', time: 240, cash: 1500, ammo: 12 },
    { name: 'The Sunport Heist', time: 300, cash: 5000, ammo: 24 }
  ];
  const SPOTS = {
    hideout: { x: 0, z: 0 }, marina: { x: 240, z: -60 }, docks: { x: 0, z: 300 },
    beach: { x: -360, z: 0 }, suburbs: { x: 120, z: -300 }, downtown: { x: 120, z: 120 },
    vault: { x: 0, z: -120 }, goldCoupe: { x: 240, z: 120 }, cashCrate: { x: -120, z: 240 }
  };
  const DROP_SPOTS = [{ x: -360, z: -240 }, { x: -360, z: 0 }, { x: -360, z: 240 }];

  function num(...vs) { for (const v of vs) if (typeof v === 'number' && isFinite(v)) return v; return 0; }
  const raw = game.config && Array.isArray(game.config.missions) && game.config.missions.length ? game.config.missions : FALLBACK;
  const defs = raw.map((m, i) => {
    const f = FALLBACK[i] || FALLBACK[0];
    return {
      name: m.name || m.title || f.name,
      time: num(m.time, m.timeLimit, m.limit, m.seconds, m.duration, f.time),
      cash: num(m.cash, m.reward, m.payout, m.money, f.cash),
      ammo: num(m.ammo, m.bullets, f.ammo)
    };
  });

  let idx = -1, current = null, timeLeft = 0, stage = 0, dropsGot = 0, lastT = 0;
  let carrying = false, lootTaken = false, waitingRetry = false, retryCooldown = 0;
  let goldCar = null, crate = null;

  // Yellow marker cone floating over the current objective.
  let marker = null;
  if (game.THREE && game.scene) {
    marker = new game.THREE.Mesh(
      new game.THREE.ConeGeometry(1.4, 3, 4),
      new game.THREE.MeshBasicMaterial({ color: 0xffd400 }));
    marker.rotation.x = Math.PI;
    marker.position.set(0, 6, 0);
    marker.visible = false;
    game.scene.add(marker);
  }

  function say(t) { if (game.message) game.message(t); }
  function emit(n, d) { if (game.events && game.events.emit) game.events.emit(n, d || {}); }
  function sp(name) {
    const s = game.world && game.world.spawnPoints;
    if (s && s[name]) return s[name];
    return SPOTS[name] || { x: 0, z: 0 };
  }
  function drops() {
    const s = game.world && game.world.spawnPoints;
    if (s) {
      if (Array.isArray(s.beachDrops) && s.beachDrops.length) return s.beachDrops;
      if (Array.isArray(s.drops) && s.drops.length) return s.drops;
      const ds = [s.beachDrop1, s.beachDrop2, s.beachDrop3, s.drop1, s.drop2, s.drop3].filter(Boolean);
      if (ds.length) return ds;
    }
    return DROP_SPOTS;
  }
  function pt(p) { return { x: (p && p.x) || 0, y: 0, z: (p && p.z) || 0 }; }
  function near(p, r) {
    const dx = (game.player ? game.player.position.x : 0) - p.x;
    const dz = (game.player ? game.player.position.z : 0) - p.z;
    return dx * dx + dz * dz <= r * r;
  }
  function wanted() {
    if (game.police && typeof game.police.wanted === 'number') return game.police.wanted;
    return typeof game.wanted === 'number' ? game.wanted : 0;
  }
  function setWanted(n) {
    const w = wanted();
    if (n > w && game.police && game.police.addHeat) game.police.addHeat(n - w);
    else if (n === 0 && w > 0 && game.police && game.police.clearHeat) game.police.clearHeat();
  }
  function drivingGold() {
    if (!goldCar) return false;
    const c = (game.player && game.player.car) || (game.vehicles && game.vehicles.playerCar);
    return c === goldCar;
  }
  function spawnCoupe() {
    if (goldCar || !game.vehicles || !game.vehicles.spawn) return;
    const p = sp('goldCoupe');
    try { goldCar = game.vehicles.spawn('coupe', p.x, p.z, p.heading || Math.PI / 2, 0xffd700); }
    catch (e) { goldCar = null; }
    if (!goldCar && Array.isArray(game.vehicles.list)) {
      let best = null, bd = 400;
      for (const c of game.vehicles.list) {
        if (c.kind !== 'coupe' || !c.position) continue;
        const dx = c.position.x - p.x, dz = c.position.z - p.z, dd = dx * dx + dz * dz;
        if (dd < bd) { bd = dd; best = c; }
      }
      if (best) goldCar = best;
    }
  }
  function hideCrate() { if (crate && crate.mesh) crate.mesh.visible = false; crate = null; }
  function spawnCrate() {
    hideCrate();
    if (!game.combat || !game.combat.spawnPickup) return;
    const p = sp('cashCrate');
    const tries = [
      () => game.combat.spawnPickup('cash', p.x, p.z),
      () => game.combat.spawnPickup(p.x, p.z, 'cash'),
      () => game.combat.spawnPickup('cash', p)
    ];
    for (const t of tries) { try { crate = t(); if (crate) return; } catch (e) {} }
    crate = null;
  }
  function crateTaken() {
    if (!crate) return false;
    if (crate.taken || crate.collected || crate.pickedUp) return true;
    if (crate.mesh && crate.mesh.visible === false) return true;
    return crate.visible === false;
  }
  function targetPos() {
    if (!current) return pt(sp('hideout'));
    if (idx === 0) return pt(sp('marina'));
    if (idx === 1) return stage === 0
      ? (goldCar && goldCar.position ? pt(goldCar.position) : pt(sp('goldCoupe')))
      : pt(sp('docks'));
    if (idx === 2) { const ds = drops(); return pt(ds[Math.min(dropsGot, ds.length - 1)]); }
    if (idx === 3) return pt(sp('hideout'));
    if (idx === 4) return carrying ? pt(sp('hideout')) : pt(sp('cashCrate'));
    return lootTaken ? pt(sp('hideout')) : pt(sp('vault'));
  }
  function objective() {
    if (!current) return '';
    if (idx === 0) return 'Deliver the package to Marina Hills';
    if (idx === 1) return stage === 0 ? 'Take the gold coupe' : 'Deliver the coupe to the Old Docks';
    if (idx === 2) return 'Collect the beach drops (' + dropsGot + '/3)';
    if (idx === 3) return 'Lose the heat, then return to the Hideout';
    if (idx === 4) return carrying ? 'Bring the crate home — stay under 3 stars' : 'Grab the cash crate in the container yard';
    return lootTaken ? 'Get the loot back to the Hideout' : 'Hit the downtown vault';
  }
  function sync() {
    if (!current) return;
    current.timeLeft = Math.max(0, timeLeft);
    current.time = current.timeLeft;
    current.remaining = current.timeLeft;
    current.stage = stage;
    current.objective = objective();
    current.target = targetPos();
    current.waitingRetry = waitingRetry;
    targetPos.x = current.target.x; targetPos.y = 0; targetPos.z = current.target.z;
  }
  function resetStage() {
    stage = 0; dropsGot = 0; carrying = false; lootTaken = false;
    if (idx === 3) setWanted(2);
    if (idx === 4) spawnCrate();
  }
  function retry(msg) {
    timeLeft = defs[idx].time;
    waitingRetry = true;
    retryCooldown = 0;
    resetStage();
    say(msg);
    emit('missionFailed', { index: idx, name: defs[idx].name });
    sync();
  }
  function start(i) {
    if (typeof i === 'number') idx = i;
    else if (current) {
      timeLeft = defs[idx].time; waitingRetry = false; retryCooldown = 0;
      resetStage();
      say('Retrying: ' + defs[idx].name);
      sync();
      return;
    } else idx = idx < 0 ? 0 : idx + 1;
    if (idx < 0 || idx >= defs.length) { current = null; return; }
    const d = defs[idx];
    timeLeft = d.time; waitingRetry = false; retryCooldown = 0;
    resetStage();
    current = { index: idx, name: d.name, title: d.name, timeLimit: d.time, timeLeft: d.time, time: d.time, remaining: d.time, cash: d.cash, reward: d.cash, ammo: d.ammo, bullets: d.ammo, stage: 0, objective: '', target: null, active: true, done: false, waitingRetry: false };
    if (idx === 1) spawnCoupe();
    say('New job: ' + d.name + ' — ' + objective());
    sync();
  }
  function complete() {
    const d = defs[idx];
    game.cash = (game.cash || 0) + d.cash;
    game.ammo = (game.ammo || 0) + d.ammo;
    say('Job done: ' + d.name + ' +$' + d.cash + ' +' + d.ammo + ' bullets');
    emit('missionComplete', { index: idx, name: d.name, cash: d.cash, ammo: d.ammo });
    const last = idx >= defs.length - 1;
    if (current) { current.done = true; current.active = false; }
    current = null;
    if (last) {
      say('The debt is paid. You walk free.');
      if (game.setState) game.setState('complete');
      return;
    }
    start();
  }
  function update(dt) {
    if (!current) { if (marker) marker.visible = false; return; }
    if (marker) {
      const t = targetPos();
      marker.visible = game.state === 'playing';
      marker.position.set(t.x, 5.5 + Math.sin((game.time || 0) * 2) * 0.6, t.z);
      marker.rotation.y = (game.time || 0) * 1.5;
    }
    if (game.state !== 'playing') return;
    const now = game.time || 0;
    let step = typeof dt === 'number' && dt > 0 ? dt : 0;
    if (!step && lastT) step = Math.max(0, Math.min(0.5, now - lastT));
    lastT = now;
    if (retryCooldown > 0) retryCooldown -= step;
    if (waitingRetry) {
      if (near(targetPos(), 6)) {
        waitingRetry = false; retryCooldown = 2; resetStage();
        say('Try again — ' + defs[idx].name + ' (' + Math.round(defs[idx].time) + 's)');
      }
      sync(); return;
    }
    timeLeft -= step;
    if (timeLeft <= 0) { retry("Time's up! Get back to the marker to try again."); return; }
    if (retryCooldown > 0) { sync(); return; }
    if (idx === 0) { if (near(sp('marina'), 6)) complete(); }
    else if (idx === 1) {
      if (stage === 0 && drivingGold()) { stage = 1; say('Coupe taken — deliver it to the Old Docks'); }
      else if (stage === 1 && drivingGold() && near(sp('docks'), 6)) complete();
    } else if (idx === 2) {
      const ds = drops();
      if (dropsGot < ds.length && near(ds[dropsGot], 5)) {
        dropsGot++;
        say(dropsGot >= ds.length ? 'All drops collected' : 'Drop ' + dropsGot + ' of ' + ds.length + ' collected');
        if (dropsGot >= ds.length) complete();
      }
    } else if (idx === 3) { if (wanted() === 0 && near(sp('hideout'), 6)) complete(); }
    else if (idx === 4) {
      if (!carrying && (crateTaken() || near(sp('cashCrate'), 4))) {
        carrying = true; hideCrate();
        say('Crate grabbed — bring it home under 3 stars');
      } else if (carrying) {
        if (wanted() >= 3) retry('Too much heat! Lose the cops and grab the crate again.');
        else if (near(sp('hideout'), 6)) complete();
      }
    } else if (idx === 5) {
      if (!lootTaken && near(sp('vault'), 6)) {
        lootTaken = true; setWanted(4);
        say('Vault loot grabbed — 4 stars! Get back to the Hideout');
      } else if (lootTaken && near(sp('hideout'), 6)) complete();
    }
    sync();
  }

  return {
    get current() { return current; },
    start: start,
    update: update,
    markerPos: targetPos
  };
}
