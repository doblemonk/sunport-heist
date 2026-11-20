// Sunport Heist — save
// Persists the player's progress in localStorage under one key and reads
// it back for the title screen's Continue option. The main script wires
// F to save and C on the title screen to continue.

export function createSave(game) {
  const KEY = 'sunport-heist-save-v1';

  function missionIndex() {
    const m = game.missions;
    if (!m) return 0;
    if (typeof m.current === 'number') return m.current;
    if (m.current && typeof m.current.index === 'number') return m.current.index;
    if (typeof m.nextIndex === 'number') return m.nextIndex;
    if (typeof m.index === 'number') return m.index;
    return 0;
  }

  function playerPos() {
    const p = game.player || {};
    return {
      x: p.x != null ? p.x : p.position ? p.position.x : 0,
      z: p.z != null ? p.z : p.position ? p.position.z : 0,
      heading: p.heading != null ? p.heading : 0,
    };
  }

  function saveGame() {
    const pos = playerPos();
    const data = {
      version: 1,
      cash: game.cash || 0,
      health: game.health == null ? 100 : game.health,
      ammo: game.ammo || 0,
      mission: missionIndex(),
      x: pos.x,
      z: pos.z,
      heading: pos.heading,
      clockHours: game.clockHours == null ? 8 : game.clockHours,
      wanted: game.wanted || 0,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadGame() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function hasSave() {
    return loadGame() !== null;
  }

  function clearSave() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      // Storage unavailable; nothing to clear.
    }
  }

  function update(dt) {
    // Saving is event-driven (F key); nothing per frame.
  }

  return { saveGame, loadGame, hasSave, clearSave, update };
}
