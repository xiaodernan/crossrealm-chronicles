// 门禁：切片15 —— 内部构建器 / 冗余别名的死导出收口，不得回潮。
//
// 全仓扫描（.tmp-20261022-export-scan/scan.cjs）+ 手工复核：
//   - content/dialogueCgPresets.js: mergeDialogueCg —— 只在模块内被调一次（:106 造
//     REST_DIALOGUE_CG），全仓无人 import 它；真出口是 REST_DIALOGUE_CG。
//   - content/bossPhases.js: BossPhaseTuning（小写命名导出）—— 同一张表在本文件被
//     `BOSS_PHASE_TUNING = BossPhaseTuning`（:204）与 `export default`（:205）二次导出，
//     外部消费者（registry.js / boss-phase-tuning.test.js）用的全是 BOSS_PHASE_TUNING，
//     小写这一份零 import —— 冗余别名。
// 收口：mergeDialogueCg 收模块内私有；BossPhaseTuning 去掉 export 关键字（const 仍在，
// BOSS_PHASE_TUNING 与 default 照旧）。这条门禁把两格钉死。
import { describe, it, expect } from 'vitest';
import * as dialogueCg from '../src/content/dialogueCgPresets.js';
import * as bossPhases from '../src/content/bossPhases.js';

describe('切片15：内部构建器 / 冗余别名的死导出收口', () => {
  it('dialogueCg.mergeDialogueCg 不再导出（真出口是 REST_DIALOGUE_CG）', () => {
    expect(dialogueCg.mergeDialogueCg).toBeUndefined();
    expect(dialogueCg.REST_DIALOGUE_CG).toBeTruthy();
  });

  it('bossPhases 不再导出小写别名 BossPhaseTuning（权威出口是 BOSS_PHASE_TUNING）', () => {
    expect(bossPhases.BossPhaseTuning).toBeUndefined();
    expect(bossPhases.BOSS_PHASE_TUNING).toBeTruthy();
  });
});
