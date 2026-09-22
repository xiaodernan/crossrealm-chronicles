import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SaveValidator } from '../src/game/SaveValidator.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = join(root, 'tests/save_v4_fixture.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const issues = SaveValidator.validate(fixture);
if (issues.length) {
  console.error('Browser SaveValidator FAILED:');
  issues.forEach((i) => console.error(' -', i));
  process.exit(1);
}
console.log('Browser SaveValidator: OK');

const broken = structuredClone(fixture);
broken.quests.stats.kills = 0;
SaveValidator.normalize(broken);
if (typeof broken.quests.stats.kills !== 'object') {
  console.error('normalize kills failed');
  process.exit(1);
}
console.log('SaveValidator.normalize: OK');

const godotCandidates = [
  process.env.GODOT,
  'C:\\Users\\18414\\AppData\\Local\\Microsoft\\WinGet\\Packages\\GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe\\Godot_v4.6.3-stable_win64.exe',
].filter(Boolean);

let godotExe = godotCandidates.find((p) => existsSync(p));
if (godotExe) {
  const r = spawnSync(godotExe, [
    '--headless',
    '--path', join(root, 'godot'),
    '--script', 'res://scripts/validate_save_cli.gd',
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stdout || r.stderr);
    process.exit(r.status ?? 1);
  }
  console.log(String(r.stdout || '').trim() || 'Godot SaveValidator: OK');
} else {
  console.warn('Godot not found — skip Godot validator (set GODOT env)');
}

console.log('Save parity check: all passed');
process.exit(0);
