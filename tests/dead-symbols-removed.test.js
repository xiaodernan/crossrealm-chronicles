// 门禁：三个"全仓零引用"的死符号删掉后不得回潮（切片14）。
//
// 一次性全仓扫描（.tmp-20261022-export-scan/scan.cjs，按名字在全仓出现次数切分）发现它们
// 在全仓**只出现一次**（= 只有定义行，从未被 import / 调用 / 命名引用）：
//   - content/difficulty.js: DIFFICULTY_TIER_IDS —— `Object.keys(DIFFICULTY_TIERS)`，
//     与手写的权威名单 DIFFICULTY_IDS 是同一批值的**第二份推导**；注册表不变式
//     checkDifficultyTable 钉的是"表键 == DIFFICULTY_IDS"，从不读它。删它 = 去冗余 + 守同源。
//   - game/Difficulty.js: getDifficulty —— 返回 currentTier；活着的兄弟是 getDifficultyId
//     （tests/difficulty.test.js 在用），它自己全仓零调用。
//   - world/dungeonAssets.js: sharedPlane —— 几何工厂族一员，族里其它成员有人读，它没有。
// 删后这条门禁把三格钉死，并反向确认各自"活着的兄弟/权威名单"仍在。
import { describe, it, expect } from 'vitest';
import * as difficulty from '../src/content/difficulty.js';
import * as gameDifficulty from '../src/game/Difficulty.js';
import * as dungeonAssets from '../src/world/dungeonAssets.js';

describe('三个全仓零引用的死符号不得回潮', () => {
  it('difficulty.DIFFICULTY_TIER_IDS 已移除（权威名单是 DIFFICULTY_IDS，不留第二份推导）', () => {
    expect(difficulty.DIFFICULTY_TIER_IDS).toBeUndefined();
    expect(difficulty.DIFFICULTY_IDS).toEqual(['story', 'standard', 'brutal']);
  });

  it('gameDifficulty.getDifficulty 已移除（活着的兄弟是 getDifficultyId）', () => {
    expect(gameDifficulty.getDifficulty).toBeUndefined();
    expect(typeof gameDifficulty.getDifficultyId).toBe('function');
  });

  it('dungeonAssets.sharedPlane 已移除（无人用的几何工厂成员）', () => {
    expect(dungeonAssets.sharedPlane).toBeUndefined();
  });
});
