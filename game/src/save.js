// Save and load through localStorage: cash, health, ammo, the mission the
// player is on, and where they stand. A save is only ever the player's own
// progress in this browser; nothing leaves the machine.
import { SAVE_KEY } from './config.js';

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveGame(game) {
  const data = {
    version: 1,
    cash: game.player.cash,
    health: game.player.health,
    ammo: game.player.ammo,
    wanted: 0,
    missionIndex: game.missions.index,
    done: game.missions.done,
    x: game.player.x,
    y: game.player.y,
    clockMinutes: game.clockMinutes,
    savedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: then there is nothing to clear.
  }
}
