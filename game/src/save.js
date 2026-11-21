const SAVE_KEY = 'sunport-heist-save';

export function createSave(game) {
  // The missions system exposes the active job as an object (with a
  // getter-only `current` property), so the save stores its job index,
  // not the object itself — assigning an object back would never restore.
  function missionIndex() {
    const m = game.missions && game.missions.current;
    if (!m) return -1;
    if (typeof m.index === 'number') return m.index;
    return -1;
  }

  function saveGame() {
    try {
      const data = {
        cash: game.cash,
        health: game.health,
        ammo: game.ammo,
        mission: missionIndex(),
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadGame() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (typeof d.cash === 'number') game.cash = d.cash;
      if (typeof d.health === 'number') game.health = d.health;
      if (typeof d.ammo === 'number') game.ammo = d.ammo;
      // Accept the saved index; also tolerate an older save that stored
      // the mission object itself by reading its index field.
      let mi = -1;
      if (typeof d.mission === 'number') mi = d.mission;
      else if (d.mission && typeof d.mission.index === 'number') mi = d.mission.index;
      if (mi >= 0 && game.missions) game.missions.start(mi);
      return true;
    } catch (e) {
      return false;
    }
  }

  function hasSave() {
    try {
      return window.localStorage.getItem(SAVE_KEY) !== null;
    } catch (e) {
      return false;
    }
  }

  return { saveGame, loadGame, hasSave };
}
