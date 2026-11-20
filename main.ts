// Sunport Heist — entrypoint for make.fun gta6-01 (Node 22, standard library only).
//
// It hands the game in: the static files under game/ beside this file, plus the
// screenshots/ folder, are copied to the output directory, and a dossier.json is
// written there with the make.fun library's buildDossier, so the judge can read
// the entry. Nothing here is installed or fetched; it only copies local files.
//
// Run it outside the grader with an output folder of your choice:
//   MAKEFUN_OUTPUT_DIR=/tmp/sunport-out node main.ts
// Inside the grader MAKEFUN_OUTPUT_DIR is unset and the output is /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');

mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// The caps come from the competition gate: the dossier text is capped at
// 160 KiB, at most 4 screenshots of at most 256 KiB each, and game/ holds at
// most 993 files totalling at most 48 MiB with no path over 1000 bytes, so the
// whole output stays inside the grader's own 1000-entry limit.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

// Sunport Heist entrypoint: copies game/ and screenshots/ to the output directory and writes dossier.json via the kit's dossier builder (vendor/makefun-game.ts).

// Sunport Heist (make.fun gta6-01, re-write 4): this entrypoint copies game/ and screenshots/ into the output directory and writes dossier.json via buildDossier from the kit's makefun-game.ts.

// Sunport Heist entrypoint: copies game/ and screenshots/ to the output dir and writes dossier.json there.
