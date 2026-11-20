// Sunport Heist — HUD: cash, health, ammo, wanted stars, clock,
// objectives, banners and full-screen overlays. Built fresh from the
// design brief: cash and health top-left, wanted stars and clock
// top-right, ammo and driving hints bottom-left, the live objective
// bottom-centre, banners centre-screen, screens for title, pause,
// busted and complete. Plain DOM over the canvas, dark translucent
// panels, white text, system font, no external fonts or requests.

export function createHud(game) {
  const body = document.body;

  // The page also ships a static HUD (#hud, with its own cash, health,
  // ammo, wanted and clock panels plus a #minimap placeholder) and
  // static title / pause / busted / complete screens. This module owns
  // the HUD, so those duplicates are hidden — here and on every update,
  // in case the main loop re-shows a static screen on a state change.
  // (Verified live: with them visible the two HUDs overlap at every
  // corner and the static circular #minimap dims and covers the live one.)
  const staticNodes = [];
  ['hud', 'screen-title', 'screen-pause', 'screen-busted', 'screen-complete']
    .forEach(function (id) {
      const node = document.getElementById(id);
      if (node) staticNodes.push(node);
    });
  function hideStaticHud() {
    for (let i = 0; i < staticNodes.length; i++) {
      if (staticNodes[i].style.display !== 'none') {
        staticNodes[i].style.display = 'none';
      }
    }
  }
  hideStaticHud();

  function el(tag, parent, css) {
    const node = document.createElement(tag);
    node.style.cssText = css;
    parent.appendChild(node);
    return node;
  }

  const panel =
    'background:rgba(0,0,0,0.55);border-radius:8px;padding:8px 12px;' +
    'color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';

  const root = el('div', body,
    'position:fixed;inset:0;pointer-events:none;z-index:10;' +
    'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;');

  const topLeft = el('div', root,
    'position:absolute;top:12px;left:12px;' + panel);
  const cashEl = el('div', topLeft,
    'font-size:22px;font-weight:700;letter-spacing:0.5px;');
  const healthLabel = el('div', topLeft,
    'font-size:11px;opacity:0.8;margin:6px 0 3px;');
  healthLabel.textContent = 'HEALTH';
  const healthBar = el('div', topLeft,
    'width:160px;height:12px;background:rgba(255,255,255,0.25);border-radius:6px;overflow:hidden;');
  const healthFill = el('div', healthBar,
    'height:100%;width:100%;background:#e5484d;border-radius:6px;');

  const topRight = el('div', root,
    'position:absolute;top:12px;right:12px;text-align:right;' + panel);
  const starsEl = el('div', topRight,
    'font-size:22px;letter-spacing:3px;color:#ffd60a;');
  const clockEl = el('div', topRight,
    'font-size:18px;font-weight:600;margin-top:2px;');

  const bottomLeft = el('div', root,
    'position:absolute;left:12px;bottom:12px;' + panel);
  const ammoEl = el('div', bottomLeft,
    'font-size:18px;font-weight:700;');
  const hintsEl = el('div', bottomLeft,
    'font-size:12px;opacity:0.85;margin-top:4px;line-height:1.5;');

  const objectiveEl = el('div', root,
    'position:absolute;left:50%;bottom:12px;transform:translateX(-50%);' +
    'text-align:center;max-width:46vw;' + panel);
  const objectiveName = el('div', objectiveEl,
    'font-size:13px;font-weight:700;letter-spacing:0.5px;color:#ffd60a;');
  const objectiveText = el('div', objectiveEl,
    'font-size:15px;margin-top:2px;');

  const bannerEl = el('div', root,
    'position:absolute;left:50%;top:22%;transform:translateX(-50%);' +
    'font-size:26px;font-weight:700;text-align:center;' +
    'text-shadow:0 2px 8px rgba(0,0,0,0.8);opacity:0;' +
    'transition:opacity 0.4s;white-space:nowrap;');

  const screenEl = el('div', root,
    'position:absolute;inset:0;display:none;align-items:center;justify-content:center;' +
    'flex-direction:column;text-align:center;background:rgba(0,0,0,0.6);' +
    'pointer-events:auto;');
  const screenTitle = el('div', screenEl,
    'font-size:44px;font-weight:800;letter-spacing:2px;');
  const screenText = el('div', screenEl,
    'font-size:18px;margin-top:14px;max-width:560px;line-height:1.5;opacity:0.92;');
  const screenHint = el('div', screenEl,
    'font-size:15px;margin-top:26px;opacity:0.75;');

  let bannerTimer = 0;
  let shownScreen = '';

  function showBanner(text) {
    if (!text) return;
    bannerEl.textContent = text;
    bannerEl.style.opacity = '1';
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { bannerEl.style.opacity = '0'; }, 3000);
  }

  const screens = {
    title: ['SUNPORT HEIST', 'Rafi "Reef" Marlowe owes Lena Voss one last debt. Six jobs stand between him and freedom in Solmar.', 'Press Enter to start — C continues a saved game'],
    paused: ['PAUSED', 'Take a breath. Solmar waits.', 'Press Enter to resume'],
    // The main loop asks for this screen as 'pause', not 'paused' —
    // without the alias it fell through to the bare fallback text.
    pause: ['PAUSED', 'Take a breath. Solmar waits.', 'Press Enter to resume'],
    busted: ['BUSTED', 'The cops caught up with you. The heat is off — but the debt is not.', 'Press Enter to try again'],
    complete: ['THE SUNPORT HEIST', 'The vault is empty, the debt is paid. Rafi walks free.', 'Press Enter to play again'],
  };

  function showScreen(name) {
    if (!name || name === 'playing') {
      if (shownScreen !== '') {
        screenEl.style.display = 'none';
        shownScreen = '';
      }
      return;
    }
    if (shownScreen === name) return;
    shownScreen = name;
    const info = screens[name] || [name.toUpperCase(), '', 'Press Enter to continue'];
    screenTitle.textContent = info[0];
    screenText.textContent = info[1];
    screenHint.textContent = info[2];
    screenEl.style.display = 'flex';
  }

  function formatClock(hours) {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function formatTimer(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function update(_dt) {
    hideStaticHud();
    cashEl.textContent = '$' + Math.floor(game.cash || 0);
    const health = Math.max(0, Math.min(100, game.health || 0));
    healthFill.style.width = health + '%';
    healthFill.style.background = health > 50 ? '#3ddc84' : health > 25 ? '#ffb020' : '#e5484d';

    const wanted = Math.max(0, Math.min(5, game.wanted || 0));
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < wanted ? '\u2605' : '\u2606';
    starsEl.textContent = stars;
    clockEl.textContent = formatClock(game.clockHours != null ? game.clockHours : 8);

    ammoEl.textContent = 'Ammo: ' + (game.ammo || 0);
    const driving = game.player && game.player.car;
    hintsEl.textContent = driving
      ? 'WASD drive  •  E exit car'
      : 'WASD walk  •  Shift run  •  E enter car  •  J punch  •  K shoot';

    const mission = game.missions && game.missions.current;
    if (mission) {
      objectiveName.textContent = mission.name || 'MISSION';
      const objective = mission.objective || mission.objectiveText || mission.text || '';
      const timer = mission.timer != null ? mission.timer
        : mission.timeLeft != null ? mission.timeLeft : mission.remaining;
      objectiveText.textContent = timer != null
        ? objective + '  •  ' + formatTimer(timer)
        : objective;
    } else {
      objectiveName.textContent = 'SOLMAR';
      objectiveText.textContent = 'Free roam — follow the yellow marker to the next job.';
    }

    showScreen(game.state);
  }

  // Other systems call game.message(text) to flash a banner.
  game.message = showBanner;
  showScreen(game.state);
  update(0); // paint the values once now: the main loop only calls
  // update while playing, so without this the title screen would
  // show the panels' empty defaults (no cash, red health bar).

  return { showBanner, showScreen, update };
}
