// Sunport Heist — HUD
// Owns every on-screen readout and overlay: cash, health, ammo, wanted
// stars, clock, objective line, centre banner, context hint and the
// title / playing / paused / busted / complete screens.

export function createHud(game) {
  const el = (id) => document.getElementById(id);
  const cashEl = el('hud-cash');
  const healthFill = el('hud-health-fill');
  const healthNum = el('hud-health-num');
  const ammoEl = el('hud-ammo');
  const starsEl = el('hud-stars');
  const clockEl = el('hud-clock');
  const objectiveEl = el('hud-objective');
  const timerEl = el('hud-timer');
  const bannerEl = el('hud-banner');
  const hintEl = el('hud-hint');

  const screens = {};
  ['title', 'playing', 'paused', 'busted', 'complete'].forEach((name) => {
    const node = el('screen-' + name);
    if (node) screens[name] = node;
  });

  let bannerTimer = null;
  let objectiveText = '';

  function formatCash(value) {
    const n = Math.max(0, Math.floor(value || 0));
    return '$' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatClock(hours) {
    const h = Math.floor(((hours || 0) % 24 + 24) % 24);
    const m = Math.floor((((hours || 0) % 1 + 1) % 1) * 60);
    const pad = (v) => (v < 10 ? '0' + v : '' + v);
    return pad(h) + ':' + pad(m);
  }

  function formatTimer(seconds) {
    const total = Math.max(0, Math.ceil(seconds || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + (s < 10 ? '0' + s : '' + s);
  }

  function renderStars(wanted) {
    const level = Math.max(0, Math.min(5, Math.round(wanted || 0)));
    let out = '';
    for (let i = 0; i < 5; i++) {
      out += i < level ? '★' : '☆';
    }
    return out;
  }

  function drivingNow() {
    if (game.player && game.player.car) return true;
    if (game.player && typeof game.player.onFoot !== 'undefined') return !game.player.onFoot;
    if (game.vehicles && game.vehicles.playerCar) return true;
    return false;
  }

  function update(dt) {
    if (cashEl) cashEl.textContent = formatCash(game.cash);

    const health = Math.max(0, Math.min(100, game.health == null ? 100 : game.health));
    if (healthFill) healthFill.style.width = health + '%';
    if (healthNum) healthNum.textContent = String(Math.round(health));

    if (ammoEl) ammoEl.textContent = String(Math.max(0, game.ammo || 0));
    if (starsEl) {
      starsEl.textContent = renderStars(game.wanted);
      starsEl.classList.toggle('wanted-hot', (game.wanted || 0) >= 3);
    }
    if (clockEl) clockEl.textContent = formatClock(game.clockHours);

    if (objectiveEl) {
      const fromMissions =
        game.missions && typeof game.missions.objectiveText === 'function'
          ? game.missions.objectiveText()
          : game.missions && game.missions.current && game.missions.current.name
            ? game.missions.current.name
            : '';
      const text = objectiveText || fromMissions;
      if (objectiveEl.textContent !== text) objectiveEl.textContent = text;
    }

    if (timerEl) {
      const current = game.missions && game.missions.current ? game.missions.current : null;
      const remaining = current != null
        ? (current.remaining ?? current.timeLeft ?? current.timeRemaining ?? current.remainingTime ?? current.countdown)
        : null;
      const fallback = game.missions != null
        ? (game.missions.remaining ?? game.missions.timeLeft ?? game.missions.timeRemaining)
        : null;
      const value = remaining != null ? remaining : fallback;
      timerEl.textContent = value == null ? '' : formatTimer(value);
    }

    if (hintEl) {
      hintEl.textContent = drivingNow()
        ? 'W A S D drive  •  SPACE brake  •  E exit car'
        : 'W A S D move  •  SHIFT run  •  E enter car  •  CLICK shoot  •  F save';
    }
  }

  function showScreen(name) {
    Object.keys(screens).forEach((key) => {
      screens[key].style.display = key === name ? 'flex' : 'none';
    });
    const hud = el('hud');
    if (hud) hud.style.display = name === 'playing' ? 'block' : 'none';
  }

  function showBanner(text, ms) {
    if (!bannerEl) return;
    bannerEl.textContent = text || '';
    bannerEl.style.opacity = '1';
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      bannerEl.style.opacity = '0';
    }, ms == null ? 2200 : ms);
  }

  function setObjective(text) {
    objectiveText = text || '';
    if (objectiveEl) objectiveEl.textContent = objectiveText;
  }

  return { update, showScreen, showBanner, setObjective };
}
