// Sunport Heist — boot, main loop, camera, screens and screenshot staging.
// Entry point: builds every system on one shared `game` object, then runs the
// frame loop. Nothing here is exported; the game is driven by the loop below.

import * as THREE from '../vendor/three.min.js';
import { CONFIG } from './config.js';
import { createRNG, hashSeed } from './random.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createSave } from './save.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
if (shotName) document.documentElement.classList.add('shot');
const urlSeed = params.get('seed');

function fail(message) {
  window.sunportError = message;
  const banner = document.getElementById('hud-banner');
  if (banner) {
    banner.textContent = message;
    banner.classList.add('on');
  }
  console.error(message);
}

try {
  boot();
} catch (err) {
  fail('Sunport Heist failed to start: ' + (err && err.message ? err.message : String(err)));
}

function boot() {
  const host = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfd9e8, 180, 900);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);

  // The one shared object every system reads from. Systems are built in the
  // order below and only touch each other inside update(), once all exist.
  const game = {
    config: CONFIG,
    rng: null,
    scene,
    camera,
    renderer,
    input: null,
    audio: null,
    world: null,
    player: null,
    vehicles: null,
    traffic: null,
    peds: null,
    police: null,
    combat: null,
    missions: null,
    hud: null,
    minimap: null,
    save: null,
    state: 'title',
    time: 0,
    clockHours: CONFIG.dayStartHour,
    cash: 0,
    health: 100,
    ammo: 12,
    wanted: 0,
    shot: shotName,
    THREE,
    events: null,
    message: null,
    setState: null,
  };

  const listeners = {};
  game.events = {
    on(name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
    },
    emit(name, data) {
      (listeners[name] || []).forEach((fn) => {
        try { fn(data); } catch (err) { console.error(err); }
      });
    },
  };

  const seed = shotName ? hashSeed(shotName) : (urlSeed ? Number(urlSeed) : CONFIG.seed);
  game.rng = createRNG(seed);
  game.input = createInput(game);
  game.audio = createAudio(game);
  game.world = createWorld(game);
  game.player = createPlayer(game);
  game.vehicles = createVehicles(game);
  game.traffic = createTraffic(game);
  game.peds = createPedestrians(game);
  game.police = createPolice(game);
  game.combat = createCombat(game);
  game.missions = createMissions(game);
  game.hud = createHud(game);
  game.minimap = createMinimap(game);
  game.save = createSave(game);

  game.message = (text, ms) => game.hud.showBanner(text, ms);

  // ---- screens / state machine ----
  const screens = {
    title: document.getElementById('screen-title'),
    pause: document.getElementById('screen-pause'),
    busted: document.getElementById('screen-busted'),
    complete: document.getElementById('screen-complete'),
  };
  const hudRoot = document.getElementById('hud');
  let bustedMission = -1;

  function showOnly(name) {
    Object.entries(screens).forEach(([key, el]) => el.classList.toggle('on', key === name));
    hudRoot.classList.toggle('on', name === 'playing' || name === 'pause' || name === 'busted');
    if (game.hud && game.hud.showScreen) game.hud.showScreen(name);
  }

  function respawnAfterBust() {
    const lost = Math.min(200, Math.floor(game.cash * 0.1));
    game.cash = Math.max(0, game.cash - lost);
    game.health = 100;
    game.wanted = 0;
    if (game.police.clearHeat) game.police.clearHeat();
    const hideout = game.world.spawnPoints.hideout;
    game.player.position.set(hideout.x, 0, hideout.z);
    game.player.heading = hideout.heading || 0;
    if (game.player.car && game.player.exitCar) game.player.exitCar();
    if (game.player.heal) game.player.heal(100);
    if (bustedMission >= 0 && game.missions.start) game.missions.start(bustedMission);
    game.message('Busted! Lost $' + lost + ' — back at the hideout.', 4000);
  }

  game.setState = (next) => {
    // Guard: entering 'busted' runs respawnAfterBust() (cash penalty) —
    // police.js both emits 'busted' (listener below) and calls setState
    // directly, so without this the penalty is deducted twice.
    if (next === 'busted' && game.state === 'busted') return;
    const prev = game.state;
    game.state = next;
    if (next === 'busted') {
      bustedMission = game.missions.current ? game.missions.current.index : -1;
      if (game.audio.busted) game.audio.busted();
      respawnAfterBust();
    }
    if (next === 'playing' && prev === 'title' && game.audio.ensure) {
      game.audio.ensure();
      if (game.audio.startMusic) game.audio.startMusic();
    }
    if (next === 'complete' && game.audio.missionDone) game.audio.missionDone();
    showOnly(next === 'playing' ? 'playing' : next === 'paused' ? 'pause' : next);
  };

  game.events.on('busted', () => game.setState('busted'));
  game.events.on('missionComplete', (data) => {
    const idx = data && typeof data.index === 'number' ? data.index
      : (game.missions.current ? game.missions.current.index : -1);
    if (idx >= 5) {
      game.setState('complete');
    } else if (game.audio.missionDone) {
      game.audio.missionDone();
    }
  });
  game.events.on('wantedChanged', (level) => {
    game.wanted = (level && typeof level.wanted === 'number') ? level.wanted
      : (typeof level === 'number' ? level : 0);
  });

  // ---- keyboard: screens, pause, save, mute, continue ----
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (game.state === 'playing') game.setState('paused');
      else if (game.state === 'paused') game.setState('playing');
      return;
    }
    if (e.code === 'KeyM') {
      if (game.audio.setMuted) game.audio.setMuted(!game.audio.muted);
      game.message(game.audio.muted ? 'Sound muted' : 'Sound on', 1500);
      return;
    }
    if (e.code === 'KeyF' && game.state === 'playing') {
      try {
        game.save.saveGame();
        game.message('Progress saved', 2000);
      } catch (err) { game.message('Save failed', 2000); }
      return;
    }
    if (e.code === 'KeyC' && game.state === 'title') {
      if (game.save.hasSave && game.save.hasSave()) {
        try {
          const data = game.save.loadGame();
          if (!data) { game.message('Saved game could not be loaded', 2500); return; }
          if (typeof data.cash === 'number') game.cash = data.cash;
          if (typeof data.health === 'number') game.health = data.health;
          if (typeof data.ammo === 'number') game.ammo = data.ammo;
          if (typeof data.clockHours === 'number') game.clockHours = data.clockHours;
          if (typeof data.x === 'number' && typeof data.z === 'number') {
            game.player.position.set(data.x, 0, data.z);
          }
          if (typeof data.heading === 'number') game.player.heading = data.heading;
          // Police owns the wanted level (its update overwrites game.wanted
          // every frame), so restore it through the police module.
          if (game.police.clearHeat) game.police.clearHeat();
          if (typeof data.wanted === 'number' && data.wanted > 0 && game.police.addHeat) {
            game.police.addHeat(data.wanted);
          }
          if (typeof data.mission === 'number' && data.mission >= 0 && game.missions.start) {
            game.missions.start(data.mission);
          }
          game.setState('playing');
          game.message('Welcome back to Solmar', 2500);
        } catch (err) { game.message('Saved game could not be loaded', 2500); }
      } else {
        game.message('No saved game yet', 2000);
      }
      return;
    }
    if (e.code === 'Enter') startOrResume();
  });
  renderer.domElement.addEventListener('click', () => {
    if (game.state !== 'playing') startOrResume();
  });

  function startOrResume() {
    if (game.state === 'title') {
      // Fresh game: start mission 1. (Continue loads its saved mission
      // itself and calls setState directly, so it never comes through here.)
      if (game.missions.start) game.missions.start(0);
      game.setState('playing');
    } else if (game.state === 'paused' || game.state === 'busted') {
      game.setState('playing');
    } else if (game.state === 'complete') {
      game.setState('title');
    }
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- per-frame system updates ----
  const live = [
    game.world, game.player, game.vehicles, game.traffic, game.peds,
    game.police, game.combat, game.missions, game.hud, game.minimap,
  ];

  function stepWorld(dt) {
    game.time += dt;
    game.clockHours += dt / 120;
    if (game.clockHours >= CONFIG.dayEndHour) game.clockHours = CONFIG.dayStartHour;
    for (const sys of live) {
      if (sys && sys.update) sys.update(dt);
    }
    if (game.input.postUpdate) game.input.postUpdate();
  }

  // ---- third-person camera ----
  const camTarget = new THREE.Vector3();
  const camGoal = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let orbitAngle = 0.6;
  let camSet = false;

  function updateCamera(dt, orbit, snap) {
    const p = game.player.position;
    if (orbit) {
      // In shot mode the scene is frozen after staging: hold the orbit
      // angle at its staged value so captures are deterministic.
      if (!frozen && !snap) orbitAngle += dt * 0.03;
      camGoal.set(Math.sin(orbitAngle) * 300, 130, Math.cos(orbitAngle) * 300);
      camLook.set(0, 10, 0);
    } else {
      const driving = !game.player.onFoot && game.player.car;
      const back = driving ? 13 : 8.5;
      const height = driving ? 5.5 : 4;
      const h = game.player.heading;
      camGoal.set(p.x - Math.sin(h) * back, height, p.z - Math.cos(h) * back);
      camLook.set(p.x + Math.sin(h) * 5, 1.6, p.z + Math.cos(h) * 5);
    }
    if (snap || !camSet) {
      // Snap: put the camera exactly on its goal so the frozen frame
      // no longer depends on how far the lerp had converged.
      camera.position.copy(camGoal);
      camSet = true;
    } else {
      const k = Math.min(1, dt * (orbit ? 1.2 : 4.5));
      camera.position.lerp(camGoal, k);
    }
    if (snap) camTarget.copy(camLook);
    else camTarget.lerp(camLook, Math.min(1, dt * 6));
    camera.lookAt(camTarget);
  }

  // ---- screenshot staging ----
  let frozen = false;
  if (shotName) stageShot(shotName);

  function stageShot(name) {
    const sp = game.world.spawnPoints;
    const downtown = sp.downtown;
    const docks = sp.docks;
    if (name === 'start') {
      game.clockHours = 9.5;
      game.state = 'title';
      showOnly('title');
    } else if (name === 'drive') {
      game.clockHours = 10;
      const car = game.vehicles.spawn('sedan', downtown.x, downtown.z, downtown.heading || 0, 0x3a6ea5);
      game.player.position.set(downtown.x, 0, downtown.z);
      game.player.heading = downtown.heading || 0;
      if (game.player.enterCar) game.player.enterCar(car);
      game.setState('playing');
    } else if (name === 'mission') {
      game.clockHours = 14;
      if (game.missions.start) game.missions.start(4); // Dock Heist
      const crate = sp.cashCrate || docks;
      game.player.position.set(crate.x + 4, 0, crate.z + 4);
      game.player.heading = Math.atan2(docks.x - crate.x, docks.z - crate.z);
      if (game.combat.spawnPickup) {
        try { game.combat.spawnPickup('cash', crate.x, crate.z); } catch (err) { /* pickup is decorative here */ }
      }
      if (game.police.addHeat) game.police.addHeat(1);
      game.setState('playing');
    } else if (name === 'chase') {
      game.clockHours = 17;
      if (game.missions.start) game.missions.start(3); // Getaway Driver
      const car = game.vehicles.spawn('sedan', downtown.x, downtown.z, downtown.heading || 0, 0xc0392b);
      game.player.position.set(downtown.x, 0, downtown.z);
      game.player.heading = downtown.heading || 0;
      if (game.player.enterCar) game.player.enterCar(car);
      if (game.police.addHeat) game.police.addHeat(3);
      game.setState('playing');
    }
    // Advance the staged scene exactly 120 fixed steps so the shot is stable
    // and repeatable, with scripted forward driving where the scene drives.
    const drives = name === 'drive' || name === 'chase';
    for (let i = 0; i < 120; i++) {
      stepWorld(1 / 60);
      if (drives && game.player.car) {
        const h = game.player.heading;
        const move = 11 * (1 / 60);
        game.player.position.x += Math.sin(h) * move;
        game.player.position.z += Math.cos(h) * move;
        const car = game.player.car;
        if (car.position) {
          car.position.x = game.player.position.x;
          car.position.z = game.player.position.z;
        }
      }
      updateCamera(1 / 60, name === 'start');
    }
    // Park any cruisers the heat drew in right behind the getaway car.
    if (name === 'chase' && game.police.cruisers) {
      const h = game.player.heading;
      game.police.cruisers.slice(0, 2).forEach((cruiser, i) => {
        const pos = cruiser.position || (cruiser.mesh && cruiser.mesh.position);
        if (!pos) return;
        const back = 12 + i * 8;
        const side = i === 0 ? -4 : 4;
        pos.set(
          game.player.position.x - Math.sin(h) * back + Math.cos(h) * side,
          0,
          game.player.position.z - Math.cos(h) * back - Math.sin(h) * side,
        );
      });
    }
    // Freeze the staged frame exactly as staged: snap the camera onto
    // its final goal (no lerp left to converge over later frames), then
    // re-sync the displayed wanted level from the police module — the
    // single source of truth — and repaint the HUD once, so the frozen
    // frame shows the staged heat even though no later frame runs
    // hud.update.
    updateCamera(0, name === 'start', true);
    if (game.police) game.wanted = game.police.wanted;
    if (game.hud && game.hud.update) game.hud.update(0);
    frozen = true;
  }

  // ---- main loop ----
  let last = performance.now();
  let ready = false;
  showOnly(game.state === 'title' ? 'title' : game.state === 'playing' ? 'playing' : null);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!frozen && game.state === 'playing') stepWorld(dt);
    if (game.world.setTimeOfDay) game.world.setTimeOfDay(game.clockHours);
    if (!frozen) updateCamera(dt, game.state === 'title');
    if (game.audio.engine) {
      const speed = game.player.speed || 0;
      game.audio.engine(game.player.car ? Math.min(1, speed / 30) : 0);
    }
    if (game.audio.siren) game.audio.siren(game.wanted > 0 && game.state === 'playing');
    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      window.sunportReady = true;
      window.sunportGame = game;
    }
  }
  requestAnimationFrame(frame);
}
