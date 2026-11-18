// Missions and the story of Sunport Heist. Rafi "Reef" Marlowe owes money
// to Lena Voss, who runs the Marina Hills crew. Six jobs pay the debt off,
// one at a time: a courier run, a repo job, a beach pickup, a getaway, a
// dock heist, and the Sunport job itself. Walk or drive into the yellow
// marker to start a job; finish before the clock runs out to get paid.
import { SPOTS, dist } from './config.js';

export const MISSIONS = [
  {
    id: 'courier',
    title: 'First Delivery',
    giver: 'Lena Voss',
    briefing: 'A package for the Marina Hills crew. Get it there in 90 seconds and the debt starts shrinking.',
    type: 'goto',
    target: SPOTS.marina,
    time: 90,
    reward: 150,
  },
  {
    id: 'repo',
    title: 'Hot Wheels',
    giver: 'Lena Voss',
    briefing: 'A gold coupe in the North Suburbs belongs to a man who stopped paying. Bring it to the Old Docks.',
    type: 'repo',
    target: SPOTS.suburbs,
    deliver: SPOTS.docks,
    time: 150,
    reward: 300,
  },
  {
    id: 'pickup',
    title: 'Beach Pickup',
    giver: 'Marco Sol',
    briefing: 'Three drops washed up along Palma Beach. Collect them all before the tide — and the cops — notice.',
    type: 'collect',
    target: SPOTS.beach,
    time: 150,
    reward: 250,
  },
  {
    id: 'getaway',
    title: 'Getaway Driver',
    giver: 'Lena Voss',
    briefing: 'The crew is hot. Lose the heat, then get back to the Hideout in one piece.',
    type: 'escape',
    target: SPOTS.hideout,
    time: 180,
    reward: 400,
  },
  {
    id: 'dockheist',
    title: 'Dock Heist',
    giver: 'Marco Sol',
    briefing: 'A cash crate sits in the Old Docks container yard. Grab it on foot, then run it home. The yard is guarded.',
    type: 'heist',
    target: SPOTS.docks,
    deliver: SPOTS.hideout,
    time: 210,
    reward: 800,
  },
  {
    id: 'sunport',
    title: 'The Sunport Heist',
    giver: 'Lena Voss',
    briefing: 'The last job. The downtown vault, four stars of heat, and one drive home. Pay the debt. Walk free.',
    type: 'heist',
    target: SPOTS.downtown,
    deliver: SPOTS.hideout,
    time: 260,
    reward: 2000,
  },
];

export function createMissions() {
  return {
    index: 0,
    active: null,
    done: [],
    banner: '',
    bannerTimer: 0,
    storyDone: false,
  };
}

export function currentDef(missions) {
  return missions.index < MISSIONS.length ? MISSIONS[missions.index] : null;
}

export function missionMarker(missions, game) {
  // Where the yellow marker sits right now: the job start, or the active
  // job's current objective.
  const def = currentDef(missions);
  if (!def) return null;
  if (!missions.active) return { x: def.target.x, y: def.target.y, label: def.title };
  const a = missions.active;
  if (a.def.type === 'repo') {
    if (!a.gotCar) return { x: a.car.x, y: a.car.y, label: 'Steal the gold coupe' };
    return { x: a.def.deliver.x, y: a.def.deliver.y, label: 'Deliver to the Docks' };
  }
  if (a.def.type === 'collect') {
    const left = a.packages.find((p) => !p.taken);
    if (left) return { x: left.x, y: left.y, label: `Packages ${a.collected}/3` };
    return { x: SPOTS.hideout.x, y: SPOTS.hideout.y, label: 'Return to the Hideout' };
  }
  if (a.def.type === 'heist') {
    if (a.stage === 'grab') return { x: a.def.target.x, y: a.def.target.y, label: 'Grab the cash' };
    return { x: a.def.deliver.x, y: a.def.deliver.y, label: 'Escape to the Hideout' };
  }
  return { x: a.def.target.x, y: a.def.target.y, label: a.def.title };
}

function startMission(missions, def, game) {
  const active = { def, timer: def.time, stage: 'go', collected: 0, gotCar: false, car: null, packages: [] };
  if (def.type === 'repo') {
    // The gold coupe waits in the North Suburbs, parked and unlocked.
    active.car = game.spawnRepoCar();
  }
  if (def.type === 'collect') {
    active.packages = [
      { x: 350, y: 750, taken: false },
      { x: 300, y: 1650, taken: false },
      { x: 420, y: 2100, taken: false },
    ];
  }
  if (def.type === 'escape') {
    game.player.wanted = Math.max(game.player.wanted, 2);
  }
  missions.active = active;
  missions.banner = `${def.title} — ${def.briefing}`;
  missions.bannerTimer = 6;
  if (game.audio) game.audio.pickup();
}

function completeMission(missions, game) {
  const a = missions.active;
  game.player.cash += a.def.reward;
  game.player.ammo += 12;
  missions.done.push(a.def.id);
  missions.banner = `${a.def.title} complete! +$${a.def.reward} — Lena Voss: ${missions.index === MISSIONS.length - 1 ? 'Debt paid. Solmar is yours, Reef.' : 'One more job down.'}`;
  missions.bannerTimer = 6;
  missions.index += 1;
  missions.active = null;
  if (missions.index >= MISSIONS.length) missions.storyDone = true;
  if (game.audio) game.audio.cash();
}

function failMission(missions, game, reason) {
  missions.banner = `${missions.active.def.title} failed — ${reason}. Walk back to the marker to try again.`;
  missions.bannerTimer = 6;
  missions.active = null;
  if (game.audio) game.audio.fail();
}

export function updateMissions(missions, game, dt) {
  if (missions.bannerTimer > 0) missions.bannerTimer -= dt;
  const def = currentDef(missions);
  const px = game.player.inCar ? game.player.inCar.x : game.player.x;
  const py = game.player.inCar ? game.player.inCar.y : game.player.y;

  if (!missions.active) {
    if (!def) return;
    // Walk or drive into the marker to take the job.
    if (dist(px, py, def.target.x, def.target.y) < 90) startMission(missions, def, game);
    return;
  }

  const a = missions.active;
  a.timer -= dt;
  if (a.timer <= 0) {
    failMission(missions, game, 'out of time');
    return;
  }

  if (a.def.type === 'goto' || a.def.type === 'escape') {
    if (dist(px, py, a.def.target.x, a.def.target.y) < 90) completeMission(missions, game);
  } else if (a.def.type === 'repo') {
    if (!a.gotCar && game.player.inCar === a.car) {
      a.gotCar = true;
      missions.banner = 'Coupe taken! Now deliver it to the Old Docks.';
      missions.bannerTimer = 4;
    }
    if (a.gotCar && game.player.inCar === a.car && dist(px, py, a.def.deliver.x, a.def.deliver.y) < 100) {
      completeMission(missions, game);
    }
  } else if (a.def.type === 'collect') {
    for (const p of a.packages) {
      if (!p.taken && dist(px, py, p.x, p.y) < 40) {
        p.taken = true;
        a.collected += 1;
        if (game.audio) game.audio.pickup();
      }
    }
    if (a.collected >= 3 && dist(px, py, SPOTS.hideout.x, SPOTS.hideout.y) < 90) {
      completeMission(missions, game);
    }
  } else if (a.def.type === 'heist') {
    if (a.stage === 'grab' && !game.player.inCar && dist(px, py, a.def.target.x, a.def.target.y) < 60) {
      a.stage = 'deliver';
      game.player.wanted = Math.max(game.player.wanted, a.def.id === 'sunport' ? 4 : 3);
      missions.banner = 'Cash grabbed! The law is coming — get to the Hideout!';
      missions.bannerTimer = 5;
      if (game.audio) game.audio.siren();
    } else if (a.stage === 'deliver' && dist(px, py, a.def.deliver.x, a.def.deliver.y) < 90) {
      completeMission(missions, game);
    }
  }
}

export function drawMissionMarker(ctx, missions, game, cam, time) {
  const marker = missionMarker(missions, game);
  if (!marker) return;
  const x = marker.x - cam.x;
  const y = marker.y - cam.y;
  const pulse = 1 + Math.sin(time * 4) * 0.12;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  ctx.strokeStyle = '#e8b93c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(232,185,60,0.25)';
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b93c';
  ctx.beginPath();
  ctx.moveTo(0, -52);
  ctx.lineTo(10, -34);
  ctx.lineTo(-10, -34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#1f2937';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(marker.label, x, y - 58);
}
