# Sunport Heist

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/doblemonk/sunport-heist/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/doblemonk/sunport-heist/reward.svg)](https://make.fun/bounty/gta6-01)

An open-world crime game set in **Solmar**, a sun-soaked coastal city.
You are Rafi "Reef" Marlowe, a courier who owes Lena Voss one last debt.
Six jobs stand between you and freedom — and the whole city, its traffic,
its pedestrians and its police are in your way.

This is an original game: its city, characters, story, art and music are
all my own. It is a 3D low-poly open world in the spirit of the modern
era of the genre, rendered with Three.js (vendored under game/vendor/),
with a third-person follow camera, sun and shadows, and a day/night tint;
no build step and no network requests. Open `game/index.html` in a desktop
browser and it just plays.

## How to play

Serve the game (any static server works) and open it in desktop Chrome:

```sh
node serve.ts
# then open http://localhost:8080
```

### Controls

| Key | Action |
| --- | --- |
| WASD / Arrow keys | Walk, run (with Shift), drive, steer |
| E | Steal / enter the nearest car, exit the car you are driving |
| J | Punch |
| K or mouse click | Shoot the pistol (aims at the cursor) |
| Shift | Run on foot |
| P / Esc | Pause |
| F | Save progress |
| M | Mute the sound |
| Enter / click | Start, resume, try again |
| C | Continue a saved game from the title screen |

### The city

Five districts to explore on foot and by car: **Palma Beach** (sand,
sea and umbrellas), **Downtown Solmar** (towers and traffic),
**Old Docks** (the container yard), **Marina Hills** and the
**North Suburbs**. Traffic cars drive the grid, pedestrians stroll the
sidewalks and run from gunfire, and the clock runs from morning to dusk
with a day/night tint.

### Wanted level

Steal a car, punch a pedestrian or shoot a cop and the stars climb, 0 to
5. Cruisers ram you and foot cops chase you down — get caught standing
still next to one for too long and you are **BUSTED**. Break line of
sight and stay hidden and the heat cools off, one star at a time.

### Missions

Follow the yellow marker. Six story jobs, each with a timer and a cash
reward:

1. **First Delivery** — a courier run to Marina Hills.
2. **Hot Wheels** — repo a gold coupe from the North Suburbs and deliver
   it to the Old Docks.
3. **Beach Pickup** — collect three drops along Palma Beach.
4. **Getaway Driver** — lose a two-star heat, then get back to the
   Hideout.
5. **Dock Heist** — grab the cash crate in the container yard and run
   it home under three stars.
6. **The Sunport Heist** — the downtown vault, four stars, one drive
   home. Pay the debt. Walk free.

Finish a job to get paid (plus ammo). Run out of time and you can walk
back to the marker and try again. Progress — cash, health, ammo and the
next job — saves to the browser with F and continues from the title
screen with C.

### HUD and minimap

Cash and health top-left, wanted stars and the clock top-right, ammo and
driving hints bottom-left, the live objective bottom-centre, and a live
minimap bottom-right showing you, the cars, the cops and the mission
marker, with north marked.

### Sound

Every sound is synthesised with WebAudio — no audio files: a sunny
bass-and-pluck music loop, engine hum, sirens, gunshots, punches,
pickups and cash. It starts on your first key press or click.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game in
a browser, staged deterministically with URL parameters:

| Shot | Scene |
| --- | --- |
| `1-cover.jpg` | `?shot=chase` — three stars, cruisers on your tail, getaway job running |
| `2-drive.jpg` | `?shot=drive` — cruising downtown in a stolen car |
| `3-mission.jpg` | `?shot=mission` — the Dock Heist cash grab |
| `4-start.jpg` | `?shot=start` — the title screen over the city |

## Files

```
game/
  index.html        the page: one canvas, one module script
  src/
    main.js         boot, the loop, the camera, the screens, shot staging
    config.js       tuning numbers, districts, car colours, spawn spots
    random.js       seeded RNG, so scenes repeat exactly
    world.js        the city: roads, buildings, beach, docks, collision
    input.js        keyboard and mouse
    audio.js        synthesised effects and the music loop (WebAudio)
    player.js       Rafi on foot: walk, run, punch, shoot
    vehicles.js     cars: driving physics, stealing, drawing
    traffic.js      traffic AI: lanes, turns, slowing for the car ahead
    pedestrians.js  walkers: strolling, fleeing, getting knocked down
    police.js       wanted level, cruisers, foot cops, arrests, heat decay
    combat.js       fists, pistol, bullets, cash and ammo pickups
    missions.js     the six story jobs, markers, timers, rewards
    hud.js          cash, health, ammo, stars, clock, objectives, banners
    minimap.js      the live minimap
    save.js         localStorage save / load / continue
main.ts             hands the entry in: copies game/ + screenshots/ and
                    writes dossier.json (Node 22, standard library only)
serve.ts            tiny static server for local play
shots.json          the four deterministic screenshot scenes
```

## Entry

Built for the make.fun **Make GTA 6** bounty
([gta6-01](https://make.fun/bounty/gta6-01)).

## License

MIT — see `LICENSE`.
