[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/doblemonk/sunport-heist/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/doblemonk/sunport-heist/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Sunport Heist

An open-world crime game in the coastal city of **Solmar**. You are Rafi "Reef"
Marlowe, and you owe Lena Voss one last debt. The only way to pay it is to run
the jobs nobody else in Solmar will touch — steal cars, dodge the Solmar PD,
and pull off six jobs, from a first delivery to the Sunport vault itself.

The game runs entirely from static files in `game/`, with no build step and no
network requests. Open it with `node serve.ts` and play at
http://localhost:8080 in desktop Chrome.

## How to play

Explore Solmar on foot or by car. Walk up to a parked car and take it, earn
cash from jobs and street pickups, and stay out of the police's reach. Getting
busted costs you the smaller of $200 or ten percent of your cash, and sends you
back to the hideout with the current job restarted. Finish all six missions to
complete the story. Progress can be saved and continued later.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move on foot / drive |
| Shift | Run |
| E | Enter / exit a car |
| F | Punch |
| Mouse + click | Aim and shoot |
| Space | Handbrake |
| P or Esc | Pause / resume |
| F (while playing) | Save progress |
| M | Mute / unmute |
| C (title screen) | Continue a saved game |
| Enter / click | Start, resume, or retry |

## The city

Solmar stretches about 840 metres across, with a road grid, beaches, docks,
and hills, and a day cycle that runs from 08:00 to 19:00. Its five districts:

- **Palma Beach** — the sunny shoreline, pickup drops and the first jobs.
- **Downtown Solmar** — dense streets, the best cars, and the most police.
- **Old Docks** — warehouses, crates, and the Dock Heist.
- **Marina Hills** — quiet hills above the marina, good for losing a tail.
- **North Suburbs** — wide streets and the hideout.

## Wanted level

Crime draws heat. Stealing a car, punching a pedestrian, or hitting a cop each
raise your wanted level by one star, up to five. Police cruisers and officers
respond harder as the stars climb. Stay out of sight — roughly 40 metres — and
the heat cools down after about 20 seconds. Get caught within arm's reach of a
cop for 3 seconds and you are busted.

## Missions

Six jobs, each with a timer and a payout:

1. **First Delivery** — 120 s, $300
2. **Hot Wheels** — 180 s, $500
3. **Beach Pickup** — 150 s, $400
4. **Getaway Driver** — 180 s, $600
5. **Dock Heist** — 240 s, $1,500
6. **The Sunport Heist** — 300 s, $5,000

Follow the marker on the map and the objective line on the HUD. Cash and ammo
pickups are scattered around the city — cash is worth $25–$100, ammo crates
give 12 rounds.

## HUD and minimap

The HUD shows cash, health, ammo, the wanted stars, the in-game clock, and the
current objective, plus banner messages for jobs, saves, and busts. The round
minimap in the bottom-right corner shows the streets, the player, traffic,
police, and the mission marker.

## Sound

All sound is synthesised live with the Web Audio API — no audio files. Engine
hum follows your speed, sirens wail while you are wanted, and gunshots,
punches, pickups, cash, and mission stingers are all generated in code. A
small procedural music loop plays while you drive the city.

## Screenshots

`screenshots/` holds four renders of the game itself, taken in the browser:

- `1-cover.jpg` — a police chase during the Getaway Driver job (the cover)
- `2-drive.jpg` — driving a sedan downtown
- `3-mission.jpg` — the Dock Heist in progress at the Old Docks
- `4-start.jpg` — the title screen over the city

They are staged with the `?shot=` query (`chase`, `drive`, `mission`, `start`)
so each one is repeatable from the same seed.

## Files

- `game/index.html` — the page, HUD, and screens
- `game/src/main.js` — boot, loop, camera, screens, shot staging
- `game/src/config.js` — tuning: city, speeds, wanted rules, missions
- `game/src/rng.js` — seeded random generator
- `game/src/world.js` — city, districts, roads, buildings, day cycle
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — synthesised sound and music
- `game/src/player.js` — Rafi on foot and behind the wheel
- `game/src/vehicles.js` — cars, spawning, entering and exiting
- `game/src/traffic.js` — ambient traffic
- `game/src/peds.js` — pedestrians
- `game/src/police.js` — wanted level, cruisers, cops, busts
- `game/src/combat.js` — punching, shooting, bullets, pickups
- `game/src/missions.js` — the six jobs, markers, timers
- `game/src/hud.js` — HUD and screens
- `game/src/minimap.js` — the round minimap
- `game/src/save.js` — save / load (localStorage key `sunport-heist-save-v1`)
- `game/vendor/three.min.js` — vendored Three.js
- `main.ts` — the make.fun entrypoint, writes `dossier.json`
- `serve.ts` — tiny static server for local play
- `shots.json` — the four staged screenshots
- `screenshots/` — the four screenshots
