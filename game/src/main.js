// Sunport Heist — boot, the one loop, the camera, the screens, and the
// screenshot scenes. Input is read every frame, the city advances in fixed
// 1/60 s steps, and the canvas paints what is there. The game moves between
// four screens: title, play, paused and game over.
//
// ?shot=start|chase|drive|mission (with &seed=N) stages that scene from the
// real rules instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { CAR_COLORS, ROAD_X, ROAD_Y, SPOTS, WORLD_H, WORLD_W, clamp, dist } from './config.js';
import { createRandom, pick } from './random.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER_CAR, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_SAVE, ACTION_SHOOT, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createPlayer, drawPlayer, hurtPlayer, updatePlayerOnFoot } from './player.js';
import { KIND_PARKED, createCar, drawCar, driveCar, nearestCar, randomParkedSpot } from './vehicles.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createPedestrians, drawPedestrians, updatePedestrians } from './pedestrians.js';
import { addWanted, createPolice, drawFootCop, drawPolice, updatePolice } from './police.js';
import { createCombat, drawCombat, dropPickup, tryPunch, tryShoot, updateCombat } from './combat.js';
import { MISSIONS, createMissions, currentDef, drawMissionMarker, missionMarker, updateMissions } from './missions.js';
import { drawHud } from './hud.js';
import { drawMinimap } from './minimap.js';
import { clearSave, hasSave, loadSave, saveGame } from './save.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1337;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const ctx = canvas.getContext('2d');

function buildGame(seedValue) {
  const random = createRandom(seedValue);
  const world = createWorld(random);
  const player = createPlayer(SPOTS.hideout.x, SPOTS.hideout.y);
  const cars = [];
  for (let i = 0; i < 14; i += 1) {
    const spot = randomParkedSpot(random, world);
    cars.push(createCar(spot.x, spot.y, spot.angle, pick(random, CAR_COLORS), KIND_PARKED));
  }
  const traffic = createTraffic(random, world);
  for (const car of traffic) cars.push(car);
  const peds = createPedestrians(random, world);
  const police = createPolice();
  const combat = createCombat();
  const missions = createMissions();
  // Ammo boxes stashed around the city.
  const ammoSpots = [
    { x: 850, y: 300 }, { x: 1850, y: 750 }, { x: 2850, y: 1200 },
    { x: 350, y: 2100 }, { x: 2350, y: 1650 }, { x: 1350, y: 300 },
  ];
  for (const s of ammoSpots) dropPickup(combat, s.x, s.y, 'ammo', 0);
  const game = {
    random, world, player, cars, traffic, peds, police, combat, missions,
    audio: createAudio(),
    clockMinutes: 9 * 60,
    time: 0,
    mode: 'start',
    overReason: '',
    savedNote: '',
    worldRoadX: ROAD_X,
    worldRoadY: ROAD_Y,
    objectiveText: '',
    cam: { x: 0, y: 0 },
    spawnRepoCar() {
      const car = createCar(SPOTS.suburbs.x + 60, SPOTS.suburbs.y + 40, 0, '#e8b93c', KIND_PARKED);
      cars.push(car);
      return car;
    },
  };
  return game;
}

function objectiveFor(game) {
  const def = currentDef(game.missions);
  if (!def && !game.missions.active) return game.missions.storyDone ? 'Story complete — free roam Solmar!' : '';
  if (game.missions.active) {
    const a = game.missions.active;
    const left = Math.ceil(a.timer);
    const marker = missionMarker(game.missions, game);
    return `${marker ? marker.label : a.def.title}  •  ${left}s  •  $${a.def.reward}`;
  }
  return `Next job: ${def.title} — drive to the yellow marker`;
}

function enterOrExitCar(game) {
  const player = game.player;
  if (player.inCar) {
    const car = player.inCar;
    car.speed = 0;
    player.inCar = null;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    player.angle = car.angle;
    game.audio.engine(false);
    return;
  }
  const car = nearestCar(game.cars, player.x, player.y, 64);
  if (!car) return;
  if (car.driver) {
    // Jacking a driven car: the driver bails, the law notices.
    car.driver = false;
    addWanted(player, 1, game.police);
    game.missions.banner = 'Car stolen! The driver ran — and somebody called it in.';
    game.missions.bannerTimer = 4;
  }
  player.inCar = car;
  player.x = car.x;
  player.y = car.y;
  game.audio.engine(true);
  game.audio.pickup();
}

function stepGame(game, input, dt) {
  const player = game.player;
  game.time += dt;
  game.clockMinutes += dt * 0.5;
  if (game.clockMinutes >= 24 * 60) game.clockMinutes -= 24 * 60;
  game.objectiveText = objectiveFor(game);

  const actions = input.takeActions();
  if (actions & ACTION_MUTE) {
    const muted = game.audio.toggleMute();
    game.missions.banner = muted ? 'Sound off (M to turn back on)' : 'Sound on';
    game.missions.bannerTimer = 2;
  }
  if (actions & ACTION_SAVE) {
    if (saveGame(game)) {
      game.savedNote = 'Progress saved.';
      game.missions.banner = 'Progress saved — continue any time from the title screen.';
      game.missions.bannerTimer = 3;
    }
  }
  if (actions & ACTION_PAUSE) {
    game.mode = 'paused';
    return;
  }
  if (actions & ACTION_ENTER_CAR) enterOrExitCar(game);

  // Combat, on foot only.
  if (!player.inCar) {
    if (actions & ACTION_PUNCH) tryPunch(player, game.peds, game.police, game.world, game.audio);
    const mouse = input.mouse();
    const shootPressed = (actions & ACTION_SHOOT) || mouse.down;
    if (shootPressed) {
      const aim = Math.atan2(
        mouse.y + game.cam.y - player.y,
        mouse.x + game.cam.x - player.x,
      );
      if (mouse.x !== 0 || mouse.y !== 0) player.angle = aim;
      tryShoot(game.combat, player, player.angle, game.audio);
    }
  }

  // Movement.
  if (player.inCar) {
    const car = player.inCar;
    const throttle = (input.up() ? 1 : 0) - (input.down() ? 1 : 0);
    const steer = (input.right() ? 1 : 0) - (input.left() ? 1 : 0);
    driveCar(car, throttle, steer, dt, game.world);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    game.audio.engineSpeed(Math.abs(car.speed) / 560);
  } else {
    updatePlayerOnFoot(player, input, game.world, dt);
  }

  updateTraffic(game.traffic, player, game.world, game.random, dt);
  updatePedestrians(game.peds, player, game.cars, game.combat.gunshot > 0, game.world, game.random, dt);
  // A pedestrian knocked down by the player's car counts once, as a crime.
  for (const ped of game.peds) {
    if (ped.down && ped.hitBy === 'player' && !ped.counted) {
      ped.counted = true;
      addWanted(player, 2, game.police);
    }
  }
  updateCombat(game.combat, player, game.peds, game.police, game.world, dt, game.audio);
  updatePolice(game.police, player, game.world, game.random, dt, game.audio);
  updateMissions(game.missions, game, dt);

  // Being run over by traffic hurts; being arrested ends the run.
  for (const car of game.traffic) {
    if (!player.inCar && Math.abs(car.speed) > 150 && dist(player.x, player.y, car.x, car.y) < 28) {
      hurtPlayer(player, 15);
    }
  }
  if (player.health <= 0) {
    game.mode = 'over';
    game.overReason = 'wasted';
    game.audio.engine(false);
    game.audio.fail();
  } else if (game.police.arrestProgress >= 1) {
    game.mode = 'over';
    game.overReason = 'busted';
    game.audio.engine(false);
    game.audio.fail();
  }
}

function updateCamera(game, width, height) {
  const px = game.player.x;
  const py = game.player.y;
  game.cam.x = clamp(px - width / 2, 0, WORLD_W - width);
  game.cam.y = clamp(py - height / 2, 0, WORLD_H - height);
  if (width > WORLD_W) game.cam.x = (WORLD_W - width) / 2;
  if (height > WORLD_H) game.cam.y = (WORLD_H - height) / 2;
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawWorld(game, width, height) {
  const hour = Math.floor(game.clockMinutes / 60);
  game.world.drawGround(ctx, game.cam, hour);
  drawMissionMarker(ctx, game.missions, game, game.cam, game.time);
  // Collectible packages and the heist cash crate.
  const active = game.missions.active;
  if (active && active.def.type === 'collect') {
    for (const p of active.packages) {
      if (p.taken) continue;
      const x = p.x - game.cam.x;
      const y = p.y - game.cam.y;
      ctx.fillStyle = '#e8b93c';
      ctx.fillRect(x - 10, y - 8, 20, 16);
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DROP', x, y + 4);
    }
  }
  if (active && active.def.type === 'heist' && active.stage === 'grab') {
    const x = active.def.target.x - game.cam.x;
    const y = active.def.target.y - game.cam.y;
    ctx.fillStyle = '#4fb06a';
    ctx.fillRect(x - 12, y - 10, 24, 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', x, y + 5);
  }
  for (const car of game.cars) drawCar(ctx, car, game.cam, game.time);
  drawPedestrians(ctx, game.peds, game.cam, game.time);
  drawPolice(ctx, game.police, game.cam, game.time, drawCar, drawFootCop);
  drawCombat(ctx, game.combat, game.cam, game.time);
  if (!game.player.inCar) drawPlayer(ctx, game.player, game.cam, game.time);
}

function drawScreen(game, width, height) {
  const hour = Math.floor(game.clockMinutes / 60);
  if (game.mode === 'start') {
    // A slow pan over downtown behind the title.
    game.cam.x = clamp(1200 + Math.sin(game.time * 0.05) * 300, 0, WORLD_W - width);
    game.cam.y = clamp(500, 0, WORLD_H - height);
    game.world.drawGround(ctx, game.cam, hour);
    for (const car of game.cars) drawCar(ctx, car, game.cam, game.time);
    drawPedestrians(ctx, game.peds, game.cam, game.time);
    ctx.fillStyle = 'rgba(10,14,24,0.55)';
    ctx.fillRect(0, 0, width, height);
    const cx = width / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8b93c';
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.fillText('SUNPORT HEIST', cx, height / 2 - 120);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('A sun-soaked open-world crime story in the city of Solmar', cx, height / 2 - 76);
    ctx.fillStyle = '#e8e4da';
    ctx.font = '19px system-ui, sans-serif';
    const lines = [
      'Rafi "Reef" Marlowe owes Lena Voss one last debt. Six jobs. One city. No way back but through.',
      '',
      'WASD / Arrows — walk and drive    E — steal / exit car    J — punch    K / click — shoot',
      'Shift — run    P — pause    F — save    M — mute    Follow the yellow marker to start a job.',
      '',
      'Steal cars, lose the cops, run the jobs, pay the debt.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, cx, height / 2 - 30 + i * 28));
    ctx.fillStyle = '#e8b93c';
    ctx.font = 'bold 22px system-ui, sans-serif';
    if (hasSave()) {
      ctx.fillText('Press ENTER for a new game — or press C to continue your saved game', cx, height / 2 + 170);
    } else {
      ctx.fillText('Press ENTER or click to start', cx, height / 2 + 170);
    }
    return;
  }
  updateCamera(game, width, height);
  drawWorld(game, width, height);
  drawHud(ctx, game, width, height);
  drawMinimap(ctx, game, width, height);

  if (game.mode === 'paused') {
    ctx.fillStyle = 'rgba(10,14,24,0.7)';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillText('PAUSED', width / 2, height / 2 - 40);
    ctx.fillStyle = '#e8e4da';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('P — resume      F — save progress      ENTER — resume', width / 2, height / 2 + 10);
    if (game.savedNote) {
      ctx.fillStyle = '#4fb06a';
      ctx.fillText(game.savedNote, width / 2, height / 2 + 50);
    }
  } else if (game.mode === 'over') {
    ctx.fillStyle = 'rgba(10,14,24,0.75)';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.fillStyle = game.overReason === 'busted' ? '#3d7bd9' : '#d94f3d';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText(game.overReason === 'busted' ? 'BUSTED' : 'WASTED', width / 2, height / 2 - 30);
    ctx.fillStyle = '#e8e4da';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(
      game.overReason === 'busted'
        ? 'The Solmar PD took you in. Lena Voss is not pleased.'
        : 'Solmar got the better of you this time.',
      width / 2, height / 2 + 16,
    );
    ctx.fillStyle = '#e8b93c';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(`Cash kept: $${game.player.cash.toLocaleString('en-US')} — press ENTER to try again`, width / 2, height / 2 + 60);
  }
}

function applySave(game, data) {
  game.player.cash = data.cash;
  game.player.health = data.health;
  game.player.ammo = data.ammo;
  game.player.x = data.x;
  game.player.y = data.y;
  game.missions.index = data.missionIndex;
  game.missions.done = data.done || [];
  game.clockMinutes = data.clockMinutes || 9 * 60;
  game.missions.banner = 'Welcome back, Reef. The next job is waiting at the yellow marker.';
  game.missions.bannerTimer = 5;
}

function runGame() {
  const game = buildGame(seed);
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startNew() {
    const fresh = buildGame(seed);
    Object.assign(game, fresh);
    game.mode = 'playing';
    clearSave();
    announce('Playing Sunport Heist. Follow the yellow marker.');
  }

  function continueSave() {
    const data = loadSave();
    if (!data) return;
    applySave(game, data);
    game.mode = 'playing';
    announce('Continued your saved game.');
  }

  // Continue is on KeyC, which no other action uses.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && game.mode === 'start' && hasSave() && !event.repeat) {
      continueSave();
    }
    if (event.code === 'KeyC' && game.mode === 'over' && !event.repeat) {
      startNew();
    }
    game.audio.unlock();
  });
  canvas.addEventListener('pointerdown', () => game.audio.unlock());

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (canvas.width !== Math.round(width * (window.devicePixelRatio || 1))) resize();

    if (game.mode === 'start') {
      game.time += 1 / 60;
      const actions = input.takeActions();
      if (actions & ACTION_CONFIRM) startNew();
      drawScreen(game, width, height);
      return;
    }
    if (game.mode === 'paused') {
      const actions = input.takeActions();
      if (actions & ACTION_PAUSE || actions & ACTION_CONFIRM) {
        game.mode = 'playing';
        announce('Playing.');
      } else if (actions & ACTION_SAVE) {
        if (saveGame(game)) game.savedNote = 'Progress saved.';
      }
      drawScreen(game, width, height);
      return;
    }
    if (game.mode === 'over') {
      const actions = input.takeActions();
      if (actions & ACTION_CONFIRM) startNew();
      drawScreen(game, width, height);
      return;
    }
    while (accumulator >= STEP) {
      stepGame(game, input, STEP);
      accumulator -= STEP;
      if (game.mode !== 'playing') break;
    }
    drawScreen(game, width, height);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing') game.mode = 'paused';
  });

  announce('Sunport Heist. Press Enter or click to start.');
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
}

function stageShot(name) {
  const game = buildGame(seed);
  game.mode = 'playing';
  const input = createInput(canvas);
  void input;
  if (name === 'start') {
    game.mode = 'start';
    game.time = 4;
  } else if (name === 'drive') {
    // Cruising downtown in a stolen coupe, first job marker ahead.
    const car = game.cars.find((c) => c.kind === KIND_PARKED);
    game.player.x = 1350;
    game.player.y = 750;
    game.player.inCar = car;
    car.x = 1350;
    car.y = 750;
    car.angle = 0;
    car.speed = 300;
    game.missions.banner = '';
    game.missions.bannerTimer = 0;
    for (let i = 0; i < 90; i += 1) stepGameDriveOnly(game);
  } else if (name === 'chase') {
    // Three stars, two cruisers on the tail, the getaway job running.
    // The car starts south of downtown and drives north, so it ends up
    // mid-screen with the chase behind it, clear of the banner.
    const car = game.cars.find((c) => c.kind === KIND_PARKED);
    game.player.x = 1850;
    game.player.y = 1650;
    game.player.inCar = car;
    car.x = 1850;
    car.y = 1650;
    car.angle = -Math.PI / 2;
    car.speed = 420;
    game.player.wanted = 3;
    game.player.cash = 1840;
    game.missions.index = 3;
    game.missions.active = {
      def: MISSIONS[3], timer: 142, stage: 'go', collected: 0, gotCar: false, car: null, packages: [],
    };
    game.missions.banner = 'Getaway Driver — lose the heat, then get back to the Hideout!';
    game.missions.bannerTimer = 6;
    game.objectiveText = objectiveFor(game);
    for (let i = 0; i < 80; i += 1) stepGameDriveOnly(game);
    game.objectiveText = objectiveFor(game);
  } else if (name === 'mission') {
    // On foot at the Old Docks, grabbing the heist cash with the clock running.
    game.player.x = 2850;
    game.player.y = 2050;
    game.player.cash = 940;
    game.player.ammo = 18;
    game.missions.index = 4;
    game.missions.active = {
      def: MISSIONS[4], timer: 187, stage: 'grab', collected: 0, gotCar: false, car: null, packages: [],
    };
    game.missions.banner = 'Dock Heist — grab the cash crate, then run it home!';
    game.missions.bannerTimer = 6;
    game.objectiveText = objectiveFor(game);
    for (let i = 0; i < 60; i += 1) stepGameDriveOnly(game);
    game.objectiveText = objectiveFor(game);
  } else {
    game.mode = 'start';
  }
  // Paint twice so fonts and layout settle, then signal the screenshot.
  let painted = 0;
  function paint() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (canvas.width !== Math.round(width * (window.devicePixelRatio || 1))) resize();
    drawScreen(game, width, height);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(paint);
}

// Advance traffic, pedestrians and police without player input, so a staged
// scene is alive: cars moving, cops closing in, the city mid-motion.
function stepGameDriveOnly(game) {
  const dt = STEP;
  game.time += dt;
  game.clockMinutes += dt * 0.5;
  if (game.player.inCar) {
    const car = game.player.inCar;
    car.speed = Math.min(car.speed + 120 * dt, 420);
    const dx = Math.cos(car.angle) * car.speed * dt;
    const dy = Math.sin(car.angle) * car.speed * dt;
    const next = game.world.moveWithCollision(car.x, car.y, dx, dy, 20);
    car.x = next.x;
    car.y = next.y;
    game.player.x = car.x;
    game.player.y = car.y;
    game.player.angle = car.angle;
  }
  updateTraffic(game.traffic, game.player, game.world, game.random, dt);
  updatePedestrians(game.peds, game.player, game.cars, false, game.world, game.random, dt);
  updatePolice(game.police, game.player, game.world, game.random, dt, null);
  if (game.missions.active) game.missions.active.timer -= dt;
  game.objectiveText = objectiveFor(game);
}

if (shot) stageShot(shot);
else runGame();
