import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SaveValidator } from '../src/game/SaveValidator.js';
import { migrate } from '../src/game/SaveMigrations.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = join(root, 'tests/save_v4_fixture.json');
/**
 * v4 夹具先升到当前版本再验——`SaveValidator.validate` 的前置条件就是
 * "已通过 migrate() 升到 CURRENT_VERSION"（见它自己的注释），直接验 v4 夹具
 * 只会量出"版本不是 21"这一条，永远不可能绿。
 */
const fixture = migrate(JSON.parse(readFileSync(fixturePath, 'utf8'))).data;

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
  // Godot 二进制在、但这个检出里没有 `godot/` 工程目录（浏览器主线仓）——
  // 强行报 "Invalid project path" 不是该侧校验的失败，是它根本没得跑。
  const godotProject = join(root, 'godot');
  if (!existsSync(godotProject)) {
    console.warn('Godot validator skipped: no godot/ project in this checkout (browser-only repo)');
  } else {
  const r = spawnSync(godotExe, [
    '--headless',
    '--path', godotProject,
    '--script', 'res://scripts/validate_save_cli.gd',
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stdout || r.stderr);
    process.exit(r.status ?? 1);
  }
  console.log(String(r.stdout || '').trim() || 'Godot SaveValidator: OK');
  }
} else {
  console.warn('Godot not found — skip Godot validator (set GODOT env)');
}

console.log('Save parity check: all passed');
process.exit(0);
