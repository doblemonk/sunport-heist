import * as THREE_NS from '../vendor/three.min.js';
import { config } from './config.js';
import { createRng } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
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

const THREE = THREE_NS.Scene ? THREE_NS : (THREE_NS.default || window.THREE);

const listeners = {};
const events = {
  on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
  emit(name, data) { const list = listeners[name] || []; for (const fn of list) fn(data); }
};

function setState(s) {
  game.state = s;
  if (game.hud) game.hud.showScreen(s);
}

function message(text) {
  if (game.hud) game.hud.showBanner(text);
}

const game = {
  config, THREE, rng: null, scene: null, camera: null, renderer: null,
  input: null, audio: null, world: null, player: null, vehicles: null,
  traffic: null, peds: null, police: null, combat: null, missions: null,
  hud: null, minimap: null, save: null,
  state: 'title', time: 0, clockHours: 8, cash: 0, health: 100, ammo: 24,
  wanted: 0, shot: null, events, message, setState
};

game.rng = createRng(config.seed);
game.scene = new THREE.Scene();
game.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
game.camera.position.set(0, 4, -8);
game.renderer = new THREE.WebGLRenderer({ antialias: true });
game.renderer.setSize(window.innerWidth, window.innerHeight);
game.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
game.renderer.shadowMap.enabled = true;
document.body.appendChild(game.renderer.domElement);

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

const camLook = new THREE.Vector3();
let camSnap = true;

function updateCamera(dt) {
  const p = game.player;
  const driving = !!p.car;
  const anchor = driving ? p.car.position : p.position;
  const heading = driving ? p.car.heading : p.heading;
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const dist = driving ? 11 : 7, height = driving ? 4.5 : 3.2;
  const tx = anchor.x - fx * dist, ty = anchor.y + height, tz = anchor.z - fz * dist;
  if (camSnap) {
    game.camera.position.set(tx, ty, tz);
    camSnap = false;
  } else {
    const k = 1 - Math.pow(0.002, dt);
    game.camera.position.x += (tx - game.camera.position.x) * k;
    game.camera.position.y += (ty - game.camera.position.y) * k;
    game.camera.position.z += (tz - game.camera.position.z) * k;
  }
  camLook.set(anchor.x + fx * 2, anchor.y + 1.6, anchor.z + fz * 2);
  game.camera.lookAt(camLook);
}

function retryAfterBusted() {
  game.health = 100;
  game.police.clearHeat();
  if (game.player.car) game.player.exitCar();
  game.vehicles.playerCar = null;
  const s = game.world.spawnPoints.hideout;
  game.player.position.set(s.x, 0, s.z);
  game.player.heading = s.heading || 0;
  camSnap = true;
  setState('playing');
}

function startOrResume() {
  if (game.state === 'title') {
    if (game.missions.current == null) game.missions.start(0);
    setState('playing');
  } else if (game.state === 'paused') {
    setState('playing');
  } else if (game.state === 'busted') {
    retryAfterBusted();
  } else if (game.state === 'complete') {
    setState('title');
  }
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Enter') startOrResume();
  else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (game.state === 'playing') setState('paused');
    else if (game.state === 'paused') setState('playing');
  } else if (e.code === 'KeyC') {
    if (game.state === 'title' && game.save.hasSave()) {
      game.save.loadGame();
      setState('playing');
    }
  } else if (e.code === 'KeyF') {
    if (game.state === 'playing') {
      game.save.saveGame();
      message('Progress saved');
    }
  }
});

window.addEventListener('click', () => {
  if (game.state !== 'playing') startOrResume();
});

window.addEventListener('resize', () => {
  game.camera.aspect = window.innerWidth / window.innerHeight;
  game.camera.updateProjectionMatrix();
  game.renderer.setSize(window.innerWidth, window.innerHeight);
});

function placePlayer(s) {
  game.player.position.set(s.x, 0, s.z);
  game.player.heading = s.heading || 0;
}

function putPlayerInCar(kind, s) {
  const car = game.vehicles.spawn(kind, s.x, s.z, s.heading || 0);
  game.player.enterCar(car);
  game.vehicles.playerCar = car;
}

function stageShot() {
  const shot = new URLSearchParams(window.location.search).get('shot');
  game.shot = shot;
  const sp = game.world.spawnPoints;
  game.world.setTimeOfDay(config.dayStartHour);
  if (shot === 'chase') {
    placePlayer(sp.hideout);
    putPlayerInCar('sedan', sp.hideout);
    game.police.addHeat(3);
    game.missions.start(3);
    setState('playing');
    for (let i = 0; i < 30; i++) game.police.update(1 / 30);
  } else if (shot === 'drive') {
    placePlayer(sp.downtown);
    putPlayerInCar('coupe', sp.downtown);
    setState('playing');
  } else if (shot === 'mission') {
    placePlayer(sp.docks);
    game.missions.start(4);
    setState('playing');
  } else {
    placePlayer(sp.hideout);
    setState('title');
  }
}

events.on('busted', () => setState('busted'));

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (game.state === 'playing') {
    game.time += dt;
    game.clockHours = config.dayStartHour + ((game.time / 60) % (config.dayEndHour - config.dayStartHour));
    game.world.setTimeOfDay(game.clockHours);
    game.world.update(dt);
    game.player.update(dt);
    game.vehicles.update(dt);
    game.traffic.update(dt);
    game.peds.update(dt);
    game.police.update(dt);
    game.combat.update(dt);
    game.missions.update(dt);
    game.hud.update(dt);
    game.minimap.update(dt);
  }
  game.wanted = game.police.wanted;
  updateCamera(dt);
  game.input.postUpdate();
  game.renderer.render(game.scene, game.camera);
}

stageShot();
requestAnimationFrame(frame);
