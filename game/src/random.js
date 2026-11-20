// Sunport Heist — deterministic randomness.
// Every bit of chance in the game comes from here, so a run can be
// replayed exactly from its seed. No unseeded chance anywhere in the game.

import { CONFIG } from './config.js';

// A small, fast seeded generator (mulberry32). The state is kept in a
// closure, so two generators made from the same seed produce the same
// sequence and never interfere with each other.
export function createRNG(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    // A float in [0, 1).
    next,

    // A float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },

    // An integer in [min, max], both ends inclusive.
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },

    // One element chosen from a non-empty array.
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },

    // A shuffled copy of the array; the input is left untouched.
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
  };
}

// Turns a string into an unsigned 32-bit seed (FNV-1a), so names such
// as a district or a save slot can seed their own generator.
export function hashSeed(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// The game's shared generator, built from the config seed. Systems
// that want their own independent stream should call createRNG with
// hashSeed of their own name instead of sharing this one.
export const rng = createRNG(CONFIG.seed);
