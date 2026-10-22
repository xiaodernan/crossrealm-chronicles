// 门禁：三例"活函数 + 死 export 关键字"收成模块内私有后，不得再被 export。
//
// 一次性全仓扫描（`.tmp-20261022-export-scan/scan.cjs`）发现三处：函数只在本文件内被调用、
// 外部（src + tests）零 import，却挂着 `export`。`export` 一个没人用的符号 = 假 API 面，
// 与切片11 SPELLS/WEAPONS、切片12 semanticLabelKey 同一类病灶。
//   - enemyGrowth.assertEnemyGrowth：模块加载时自调用做加载期校验，无人 import。
//   - skillTrees.isAdditiveStat：仅 curveValue 内部（:116）用。
//   - playerFSM.stateAllows：仅 sm.allows（:140）内部用。
// 收成私有后，这条门禁把它们钉死，防止"假 API 面"悄悄回潮。
import { describe, it, expect } from 'vitest';
import * as enemyGrowth from '../src/content/enemyGrowth.js';
import * as skillTrees from '../src/content/skillTrees.js';
import * as playerFSM from '../src/player/PlayerFSM.js';

describe('"活函数 + 死 export 关键字"三例收成模块内私有', () => {
  it('enemyGrowth.assertEnemyGrowth 不再导出（但加载期仍自调用校验 —— 本 import 不抛即证）', () => {
    expect(enemyGrowth.assertEnemyGrowth).toBeUndefined();
  });

  it('skillTrees.isAdditiveStat 不再导出', () => {
    expect(skillTrees.isAdditiveStat).toBeUndefined();
  });

  it('playerFSM.stateAllows 不再导出', () => {
    expect(playerFSM.stateAllows).toBeUndefined();
  });
});
