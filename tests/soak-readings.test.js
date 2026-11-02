/**
 * 稳定性浸泡门禁的门禁 —— W-E2 切片2。
 *
 * `npm run soak` 起真游戏推 108,000 帧（三十分钟游戏时间），在热身圈之后取基线、
 * 游玩之后再取终局，判"`renderer.info` 三项零增长 + 零未捕获异常"（§1.4）。
 * 与 `perf-smoke` / `e2e-clear` 同一条分家纪律：执行端导入即执行、**不导出东西**，
 * 判据住在 `scripts/soak-readings.mjs`（无副作用，`npm test` 里能直接喂真假两种输入）。
 *
 * 本文件钉四类东西：
 * ① 接线：脚本在、npm script 在、判据模块被真的调用（只 import 不调用等于没门禁）；
 * ② 验收线的值：三列是哪三列、默认三十分钟、抽帧渲染不许变稀、异常预算是 0；
 * ③ 判据的正反两面：好读数不冤、每一种坏读数各自点名（否则"零增长"可以永远绿在空跑上）；
 * ④ 执行侧的确定性来源：固定步长、真 update、站点与坐标不抄、重载作废排在算越线之前。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SOAK_COLUMNS, SOAK_FPS, SOAK_DEFAULTS, SOAK_BUDGETS,
  parseSoakArgs, planSoak, snapshotProblem, growthProblem, programFamilyProblem, journeyProblem,
} from '../scripts/soak-readings.mjs';

const ROOT = process.cwd();
const 脚本路径 = join(ROOT, 'scripts', 'soak.mjs');
const 脚本源 = existsSync(脚本路径) ? readFileSync(脚本路径, 'utf8') : '';
const 判据源 = readFileSync(join(ROOT, 'scripts', 'soak-readings.mjs'), 'utf8');

const 名单 = ['a', 'b', 'c'];
const 五场 = ['p', 'q', 'r', 's', 't'];
const 好计划 = planSoak({ minutes: 30, laps: 3, stations: 名单, arenas: 五场 });
const 好快照 = { geometries: 120, textures: 340, programs: 41 };
const 好实际 = {
  游玩帧: 好计划.游玩帧,
  热身帧: 好计划.热身帧,
  站访问: { a: 3, b: 3, c: 3 },
  场访问: 3 * 五场.length,
  击杀: 4,
  异常: 0,
};

describe('接线（W-E2 切片2）', () => {
  it('脚本在，npm script 接上了', () => {
    expect(existsSync(脚本路径), 'soak.mjs 不在了').toBe(true);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.soak, 'package.json 里没有 "soak" 脚本').toBe('node scripts/soak.mjs');
  });

  it('判据与执行分家：可执行脚本不许导出东西，判据模块不许有副作用', () => {
    expect(脚本源, 'soak.mjs 又导出了东西（单测里会跑起浏览器）').not.toMatch(/^export /m);
    for (const 名 of ['SOAK_COLUMNS', 'parseSoakArgs', 'planSoak', 'snapshotProblem', 'growthProblem', 'programFamilyProblem', 'journeyProblem']) {
      expect(脚本源, `脚本没有从判据模块取 ${名}`)
        .toMatch(new RegExp(`import \\{[^}]*${名}[^}]*\\} from '\\./soak-readings\\.mjs'`));
    }
    // 复用 harness 的归属判据（口 / 页 / 通道 / 重载），不在本脚本里另写一份
    for (const 名 of ['解析CDP口', '页地址问题', '通道问题', '重载问题']) {
      expect(脚本源, `脚本没有复用 harness 判据 ${名}`)
        .toMatch(new RegExp(`import \\{[^}]*${名}[^}]*\\} from '\\./harness-readings\\.mjs'`));
    }
    expect(判据源, '判据模块里出现了 spawn 调用').not.toMatch(/\bspawn(Sync)?\s*\(/);
    expect(判据源, '判据模块里出现了 process.exit 调用').not.toMatch(/^\s*process\.exit\(/m);
    expect(判据源, '判据模块里出现了 fetch 调用').not.toMatch(/\bfetch\s*\(/);
    expect(判据源, '判据模块自己 import 了执行侧依赖').not.toMatch(/^\s*import .*from '(node:)?(child_process|fs|path|os|net|http)'/m);
    expect(判据源, '判据模块里有顶层 await（import 它就会真的跑起来）').not.toMatch(/^\s*await /m);
  });

  it('脚本真的在问这些判（调用点，不是词面）', () => {
    expect(脚本源).toContain('参数 = parseSoakArgs(process.argv.slice(2));');
    expect(脚本源).toContain('const 计划 = planSoak({ minutes: 参数.minutes, laps: 参数.laps, stations: 站点, arenas: 场名 });');
    expect(脚本源, '快照没有过形状判据').toContain('const 问 = snapshotProblem(名, s);');
    expect(脚本源, '基线/终局的增长判定没有调用（programs 要按族复核）').toContain('...growthProblem(基线, 终局, 程序族),');
    // 程序族的三处接线：页侧交键、基线交键、终局交键 + 族读数进日志（只改判据不接线＝放宽不生效）
    expect(脚本源, '页侧没交出程序键').toContain('程序键: () => 程序表()');
    expect(脚本源, '基线没交出程序键列表（族判据无从复核）').toContain('程序键: 程序基线键.slice(),');
    expect(脚本源, '终局程序键没交给判据').toContain("终局: await evalJs('window.__soak.程序键()')");
    expect(脚本源, '程序族读数没打进日志').toContain('同族场景构成变体 ${族读.豁免数} 条 / 新族 ${族读.未归数} 条');
    expect(脚本源, '终局复读的增长判定没有调用').toContain('...growthProblem(终局, 终局复读).map(');
    expect(脚本源, '行程对账没有调用').toContain('...journeyProblem(计划, {');
    // 参数坏掉必须**当场退 2**，不许带着默认值开跑（--minute=2 会占住机器半小时）
    expect(脚本源).toContain('console.error(`soak: ${e.message}`);');
    expect(脚本源.indexOf('参数 = parseSoakArgs'), '参数解析排在起 vite 之后').toBeLessThan(脚本源.indexOf('const vite = spawn('));
  });

  it('退出码三档：0 通过 / 1 越线 / 2 环境作废', () => {
    expect(脚本源).toContain('setTimeout(() => process.exit(failures), 300);');
    expect(脚本源, '越线没有记 1').toContain('failures = 1;');
    expect(脚本源, '环境/作废没有记 2').toContain('failures = 2;');
    expect(脚本源, '墙钟保险没有退 2').toMatch(/墙钟超过[\s\S]{0,220}process\.exit\(2\)/);
    expect(脚本源, '墙钟保险没有上限值').toContain('参数.wallLimitMinutes * 60 * 1000');
  });

  it('页内不答话要点名退回，而不是挂到墙钟 —— 每个 CDP 调用都有上限', () => {
    /**
     * 2026-10-31 校准8 撞到过一种沉默的坏：Chrome 活着、`/json/list` 答话、vite 正常发模块，
     * 但 `Runtime.evaluate` 一条都不回（渲染进程主线程卡死）。没有超时，整轮就挂在"等读数"上，
     * 白白占着机器直到墙钟保险。在途调用必须带着 reject 一支，页关掉时也要全部点名。
     */
    expect(脚本源).toContain('const send = (method, params = {}, timeoutMs = 300000) => new Promise((res, rej) => {');
    expect(脚本源).toContain('`CDP ${method} ${Math.round(timeoutMs / 1000)} 秒没有回应');
    expect(脚本源, '在途表只剩 resolve 一支，超时/断连都点不了名').toContain('pending.set(id, { res, rej, 钟 });');
    expect(脚本源, '页关掉后在途调用会永远等').toContain("p.rej(new Error('CDP 通道被关闭（页 / 渲染进程走了）'));");
    expect(脚本源, '开机探针没有自己的上限（卡死会占满整段开机窗口）')
      .toContain("!!window.__game.world', 60000)");
  });
});

describe('验收线的值（§1.4 那句话的三列 + 三十分钟）', () => {
  it('三列就是 renderer.info 的三本账，顺序固定', () => {
    expect(SOAK_COLUMNS).toEqual(['geometries', 'textures', 'programs']);
    expect(Object.isFrozen(SOAK_COLUMNS), '三列名单被改坏了（少了哪一列，哪一列就永远绿）').toBe(true);
  });

  it('默认是验收句子的三十分钟，抽帧渲染只许更密', () => {
    expect(SOAK_FPS, '固定步长的分母被改了（1 秒游戏时间不再是 60 帧）').toBe(60);
    expect(SOAK_DEFAULTS.minutes, '默认游玩时长短于验收线').toBeGreaterThanOrEqual(30);
    expect(SOAK_DEFAULTS.laps, '圈数少于 2 没有复现性').toBeGreaterThanOrEqual(2);
    expect(SOAK_DEFAULTS.renderEvery, '抽帧间隔变稀了（泄漏样本变少，判定变钝）').toBeLessThanOrEqual(240);
    expect(SOAK_DEFAULTS.renderEvery).toBeGreaterThan(0);
    expect(SOAK_BUDGETS.exceptions, '未捕获异常的预算被放松了').toBe(0);
    expect(SOAK_BUDGETS.minKills, '一整轮一只都不杀也能过（走路循环抓不到战斗资源）').toBeGreaterThanOrEqual(1);
  });

  it('三十分钟 = 108,000 帧，计划数与固定步长同源', () => {
    expect(好计划.游玩帧).toBe(30 * 60 * SOAK_FPS);
    expect(好计划.热身帧).toBe(好计划.圈帧);
    expect(好计划.游玩帧).toBe(好计划.圈帧 * 好计划.laps);
  });
});

describe('参数解析：坏参数当场抛，绝不静默回落', () => {
  it('默认值与合法覆盖', () => {
    const 默 = parseSoakArgs([]);
    expect(默.minutes).toBe(SOAK_DEFAULTS.minutes);
    expect(默.laps).toBe(SOAK_DEFAULTS.laps);
    const 校 = parseSoakArgs(['--minutes=2', '--laps=2', '--render-every=120', '--batch-frames=450']);
    expect(校.minutes).toBe(2);
    expect(校.laps).toBe(2);
    expect(校.renderEvery).toBe(120);
    expect(校.batchFrames).toBe(450);
    // 墙钟保险默认从游玩时长推（2 分钟 → 16 分钟上限），不是另抄一个常数
    expect(校.wallLimitMinutes).toBe(2 * 3 + 10);
    expect(parseSoakArgs(['--wall-limit-minutes=5']).wallLimitMinutes).toBe(5);
  });

  it('少一个 s 的 `--minute=2` 必须报错，而不是回落到三十分钟', () => {
    const 坏 = [
      ['--minute=2', /不认识的参数/],
      ['--minutes 2', /看不懂的参数/],
      ['--minutes=2.5', /看不懂的参数/],
      ['--Minutes=2', /看不懂的参数/],
      ['--minutes=-1', /看不懂的参数/],
      ['--minutes=0', /必须是正整数/],
      ['--minutes=', /看不懂的参数/],
      ['', /看不懂的参数/],
    ];
    for (const [文, 期] of 坏) {
      expect(() => parseSoakArgs([文]), `"${文}" 竟然被收下了`).toThrow(期);
    }
    expect(() => parseSoakArgs(['--laps=1']), '一圈也被收下了（没有复现性）').toThrow(/至少要两圈/);
    expect(() => parseSoakArgs(['--laps=0'])).toThrow(/必须是正整数/);
  });
});

describe('行程计划：数字全从 minutes × 60 × FPS 推出来', () => {
  it('三十分钟 / 三圈 / 八站五场：每站 4125 帧，每场 600 帧', () => {
    const 八站 = ['hub', 'fantasy', 'magic', 'gloom', 'radiant', 'void', 'abyss', 'frost'];
    const 计 = planSoak({ minutes: 30, laps: 3, stations: 八站, arenas: 五场 });
    expect(计.圈帧).toBe(36000);
    expect(计.场帧).toBe(600);
    expect(计.站帧).toEqual(八站.map(() => 4125));
    expect(计.游玩帧).toBe(108000);
    expect(Object.isFrozen(计), '计划能被执行端改写（跑一半改计划 = 对账失去分母）').toBe(true);
  });

  it('短轮次（校准两分钟）：Boss 场至少 60 帧，余数给最后一站', () => {
    const 校 = planSoak({ minutes: 2, laps: 2, stations: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], arenas: 五场 });
    expect(校.圈帧).toBe(3600);
    expect(校.场帧).toBe(60);
    expect(校.站帧.slice(0, -1)).toEqual([412, 412, 412, 412, 412, 412, 412]);
    expect(校.站帧.at(-1)).toBe(3300 - 412 * 7);
    expect(校.站帧.reduce((s, n) => s + n, 0) + 校.场帧 * 五场.length).toBe(校.圈帧);
  });

  it('守恒对每一种形状都成立（站帧之和 + 场帧 × 场数 = 圈帧）', () => {
    for (const [minutes, laps, 站数, 场数] of [[30, 3, 8, 5], [2, 2, 8, 5], [7, 4, 8, 0], [120, 5, 8, 5], [30, 6, 8, 5]]) {
      const 站 = Array.from({ length: 站数 }, (_, i) => `s${i}`);
      const 场 = Array.from({ length: 场数 }, (_, i) => `a${i}`);
      const 计 = planSoak({ minutes, laps, stations: 站, arenas: 场 });
      expect(计.站帧.every((n) => n >= 1), `每站帧数出现非正数：${计.站帧}`).toBe(true);
      expect(计.站帧.reduce((s, n) => s + n, 0) + 计.场帧 * 场数,
        `minutes=${minutes} laps=${laps} 站=${站数} 场=${场数} 的圈预算不守恒`).toBe(计.圈帧);
      expect(计.游玩帧).toBe(计.圈帧 * laps);
    }
  });

  it('一圈都摊不到一帧时当场抛，而不是排出个零帧行程', () => {
    const 站 = Array.from({ length: 2000 }, (_, i) => `s${i}`);
    expect(() => planSoak({ minutes: 1, laps: 2, stations: 站, arenas: 五场 })).toThrow(/每站摊不到一帧/);
    expect(() => planSoak({ minutes: 0, laps: 2, stations: 名单, arenas: 五场 })).toThrow(/minutes 必须是正整数/);
    expect(() => planSoak({ minutes: 30, laps: 1, stations: 名单, arenas: 五场 })).toThrow(/laps 必须 ≥ 2/);
    expect(() => planSoak({ minutes: 30, laps: 3, stations: [], arenas: 五场 })).toThrow(/站点名单是空的/);
    expect(() => planSoak({ minutes: 30, laps: 3, stations: 名单, arenas: null })).toThrow(/不是数组/);
  });
});

describe('快照形状：不是一次测量就点名', () => {
  it('正面控制：好快照什么都不报', () => {
    expect(snapshotProblem('基线', 好快照)).toEqual([]);
    expect(snapshotProblem('基线', { ...好快照, geometries: 0 }), '0 是合法的读数（资源确实可能一件都没有）').toEqual([]);
  });

  it('每一列读到 NaN / 负数 / 小数 / 缺失 ⇒ 点名那一列', () => {
    for (const 列 of SOAK_COLUMNS) {
      for (const [值, 形状] of [[NaN, 'NaN'], [-1, '负数'], [1.5, '小数'], [undefined, '缺失']]) {
        const 问 = snapshotProblem('终局', { ...好快照, [列]: 值 });
        expect(问.join('\n'), `${列} 读到 ${形状} 没有点名`).toContain(`"${列}"`);
        expect(问.join('\n')).toContain('这不是一次测量');
      }
    }
    expect(snapshotProblem('基线', null)[0]).toMatch(/基线 没交出快照/);
    expect(snapshotProblem('基线', undefined)[0]).toMatch(/没交出快照/);
  });
});

describe('三项零增长：只判增长，多一条就点名', () => {
  it('正面控制：持平与缩减都放行（释放是合法路径）', () => {
    expect(growthProblem(好快照, { ...好快照 })).toEqual([]);
    expect(growthProblem(好快照, { ...好快照, textures: 300 }), '资源缩减被判成了泄漏').toEqual([]);
  });

  it('任何一列增长 ⇒ 点名那一列、说出差多少', () => {
    for (const 列 of SOAK_COLUMNS) {
      const 问 = growthProblem(好快照, { ...好快照, [列]: 好快照[列] + 3 });
      expect(问.join('\n'), `${列} 增长没有被点名`).toContain(`"${列}" 从`);
      expect(问.join('\n'), '差值不是从喂进来的两个数推的').toContain('（+3）');
      expect(问.join('\n')).toContain('三项零增长是验收线');
    }
  });

  it('任一头不是快照 ⇒ 先报形状，不拿 NaN 当"没涨"', () => {
    expect(growthProblem(null, 好快照).join('\n')).toMatch(/基线 没交出快照/);
    expect(growthProblem(好快照, undefined).join('\n')).toMatch(/终局 没交出快照/);
    expect(growthProblem(好快照, { ...好快照, programs: NaN }).join('\n')).toMatch(/"programs" 读到 NaN/);
  });
});

describe('程序族：键只差一个场景构成位的是兄弟，不是新族', () => {
  // 按 three 的真实键形状造数据：物理材质带 define（键长 55，numPointLights 在第 36 位），
  // basic/line 族没有 define（键长 53，同一位挪到第 34 位）—— 所以族判据不能按固定下标认。
  const 造键 = (格数, 改动, 族 = 'physical') => {
    const 段 = Array.from({ length: 格数 }, () => '0');
    段[0] = 族;
    for (const [位, 值] of Object.entries(改动)) 段[Number(位)] = String(值);
    return 段.join(',');
  };
  const 物理基 = 造键(55, { 36: 34, 52: 134147 });
  const 物理兄弟 = 造键(55, { 36: 35, 52: 134147 });
  const 基本基 = 造键(53, { 34: 34, 50: 1027 }, 'basic');
  const 基本兄弟 = 造键(53, { 34: 35, 50: 1027 }, 'basic');

  it('正面控制：只差光照条数一位的两族键都算同族（物理第 36 位 / basic 第 34 位）', () => {
    for (const [基, 兄弟] of [[物理基, 物理兄弟], [基本基, 基本兄弟]]) {
      const 读 = programFamilyProblem([基], [基, 兄弟]);
      expect(读.新键, '新键没有被数出来').toBe(1);
      expect(读.豁免数, `键 ${兄弟.slice(0, 40)}… 没被认成兄弟`).toBe(1);
      expect(读.未归数).toBe(0);
      expect(读.豁免[0].位, '豁免没有点名差异位').toBe(基 === 物理基 ? 36 : 34);
    }
    expect(programFamilyProblem([物理基], [物理基])).toMatchObject({ 新键: 0, 豁免数: 0, 未归数: 0 });
  });

  it('反面控制：差两位 / 差的不是整数 / 整数超界 / 键长不同 ⇒ 都点名成新族', () => {
    const 差两位 = 造键(55, { 20: 1, 36: 35, 52: 134147 });
    const 非整数 = 造键(55, { 36: 'highp', 52: 134147 });
    const 超界整数 = 造键(55, { 36: 900, 52: 134147 });
    const 短键 = 造键(53, { 36: 35, 52: 134147 });
    for (const [名, 键] of [['差两位', 差两位], ['差的不是整数', 非整数], ['整数超界', 超界整数], ['键长不同', 短键]]) {
      const 读 = programFamilyProblem([物理基], [物理基, 键]);
      expect(读.豁免数, `${名} 被族判据放行了`).toBe(0);
      expect(读.未归数, `${名} 没有被点名`).toBe(1);
    }
  });

  it('growthProblem 接线：兄弟键放行、新族照红、键列表与条数对不上照红', () => {
    // 键列表的长度就是 programs 的条数（growthProblem 会核对这两格，少一条按读数不完整处理）
    const 基快照 = { ...好快照, programs: 1 };
    const 终快照 = { ...好快照, programs: 2 };
    expect(growthProblem(基快照, 终快照, { 基线: [物理基], 终局: [物理基, 物理兄弟] }),
      '只差一档光照的兄弟键被当成了泄漏').toEqual([]);
    expect(growthProblem(基快照, 终快照, { 基线: [物理基], 终局: [物理基, 造键(55, { 20: 1, 36: 35, 52: 134147 })] }).join('\n'))
      .toMatch(/新族|没有同族/);
    expect(growthProblem(基快照, 终快照, { 基线: [物理基], 终局: [物理基] }).join('\n'),
      '键列表和 programs 条数对不上还放行了').toMatch(/键列表与条数对不上/);
    // 不传族读数时维持原来的严格语义：多一条就红（放宽只在显式复核时发生）
    expect(growthProblem(基快照, 终快照).join('\n')).toContain('三项零增长是验收线');
    // 族判据只关 programs；几何/贴图涨了照样红
    expect(growthProblem({ ...基快照, textures: 10 }, { ...终快照, textures: 11 },
      { 基线: [物理基], 终局: [物理基, 物理兄弟] }).join('\n')).toContain('"textures" 从');
  });
});

describe('行程对账：没跑满的那一轮不许叫"零增长"', () => {
  it('正面控制：计划说的事都做了，什么都不报', () => {
    expect(journeyProblem(好计划, 好实际)).toEqual([]);
  });

  it('少推帧 / 热身没跑完 ⇒ 点名帧数与计划', () => {
    expect(journeyProblem(好计划, { ...好实际, 游玩帧: 好计划.游玩帧 - 1 }).join('\n'))
      .toContain(`游玩段推了 ${好计划.游玩帧 - 1} 帧，计划 ${好计划.游玩帧} 帧`);
    expect(journeyProblem(好计划, { ...好实际, 热身帧: 0 }).join('\n')).toMatch(/热身段推了 0 帧/);
    expect(journeyProblem(好计划, { ...好实际, 游玩帧: undefined }).join('\n'), 'undefined 帧没有被点名')
      .toMatch(/游玩段推了 undefined 帧/);
  });

  it('少一站 / 多一站 / 某站只去了两次 ⇒ 逐站点名', () => {
    expect(journeyProblem(好计划, { ...好实际, 站访问: { a: 3, b: 3 } }).join('\n')).toContain('站点 "c" 被访问 undefined 次，计划 3 次');
    expect(journeyProblem(好计划, { ...好实际, 站访问: { a: 3, b: 3, c: 3, zzz: 1 } }).join('\n'))
      .toContain('计划外出现站点访问：zzz');
    expect(journeyProblem(好计划, { ...好实际, 站访问: { a: 3, b: 3, c: 2 } }).join('\n'))
      .toContain('站点 "c" 被访问 2 次，计划 3 次');
  });

  it('Boss 场停留次数 / 击杀 / 异常三条各自点名', () => {
    expect(journeyProblem(好计划, { ...好实际, 场访问: 好实际.场访问 - 1 }).join('\n'))
      .toContain(`Boss 场停留 ${好实际.场访问 - 1} 次，计划 ${好实际.场访问} 次`);
    expect(journeyProblem(好计划, { ...好实际, 击杀: 0 }).join('\n')).toMatch(/整轮只击杀 0 只/);
    expect(journeyProblem(好计划, { ...好实际, 异常: 1 }).join('\n')).toMatch(/未捕获异常 1 条（预算 0）/);
    expect(journeyProblem(好计划, { ...好实际, 击杀: '很多' }).join('\n')).toMatch(/只击杀 很多 只/);
  });
});

/**
 * ## 执行侧的确定性（脚本那一段）
 *
 * 读数有没有意义，一半在判据、一半在"量的是什么"。下面几条钉的是后者：
 * 固定步长（否则机器快慢进读数）、真 `update()`（不是渲染空转）、站点与坐标从表里来
 * （抄一份坐标 = 区域一搬家就量错地方）、热身先于基线（首圈的一次性加载不许记成泄漏）。
 */
const 接线 = {
  固定步长: (s) => s.includes('window.__game.clock.getDelta = () => 1 / 60'),
  真推帧: (s) => /\bg\.update\(\)/.test(s) && /\bg\.render\(\)/.test(s) && s.includes('const g = window.__game;'),
  站点不抄: (s) => s.includes('const 站点 = PERF_BUDGETS.drawCalls.stationIds;')
    && s.includes('const 配方 = PERF_BUDGETS.drawCalls.recipe;')
    && !/stationIds\s*=\s*\[/.test(s),
  Boss场现读: (s) => s.includes('enemyManager.arenas') && s.includes('Boss 场清单是空的'),
  移动见证: (s) => s.includes('行走见证') && s.includes('位移 < 0.5') && s.includes('移动没被驱动起来'),
  热身先于基线: (s) => {
    const 热 = s.indexOf("await 跑一圈('热身')");
    const 基 = s.indexOf("const 基线 = 快照读('基线'");
    const 游 = s.indexOf('for (let 圈 = 1; 圈 <= 计划.laps; 圈 += 1)');
    return 热 >= 0 && 基 >= 0 && 游 >= 0 && 热 < 基 && 基 < 游;
  },
  基线不稳就作废: (s) => s.includes('const 基线漂 = growthProblem(基线, 基线复读);')
    && s.includes('热身圈不足以把资源账推到稳态')
    && s.search(/基线漂[\s\S]{0,400}e\.读数作废 = true;/) >= 0,
  重载作废在越线之前: (s) => {
    const 重 = s.indexOf('const 重问 = 重载问题(基线上下文, 通道.执行上下文);');
    const 越 = s.indexOf('const 越线 = [');
    return 重 >= 0 && 越 >= 0 && 重 < 越;
  },
  异常进对账: (s) => s.includes('异常: exceptions.length'),
};

describe('执行侧的确定性（脚本真的在跑游戏，不是在读常数）', () => {
  it('七条接线腿在真源码上全过', () => {
    for (const [名, 尺] of Object.entries(接线)) {
      expect(尺(脚本源), `接线腿"${名}"在真源码上不过`).toBe(true);
    }
  });

  it('反向控制：每一处拆法都被对应的腿抓住（自证这些腿不是空转）', () => {
    const 坏 = {
      步长不钉: 脚本源.replace('window.__game.clock.getDelta = () => 1 / 60', ''),
      只渲染不推帧: 脚本源.replaceAll('g.update();', ';'),
      站点抄一份: 脚本源.replace('const 站点 = PERF_BUDGETS.drawCalls.stationIds;', "const 站点 = ['hub', 'fantasy'];"),
      场不现读: 脚本源.replace(/enemyManager\.arenas/g, '[]'),
      移动见证删掉: 脚本源.replace(/位移 < 0\.5/g, 'false'),
      基线提到热身之前: 脚本源.replace('await 跑一圈(\'热身\');', ''),
      重载判据删掉: 脚本源.replace('const 重问 = 重载问题(基线上下文, 通道.执行上下文);', 'const 重问 = [];'),
    };
    expect(接线.固定步长(坏.步长不钉), '步长不钉了，腿却仍判为真').toBe(false);
    expect(接线.真推帧(坏.只渲染不推帧), '不推 update 了，腿却仍判为真').toBe(false);
    expect(接线.站点不抄(坏.站点抄一份), '站点被抄成字面量，腿却仍判为真').toBe(false);
    expect(接线.Boss场现读(坏.场不现读), 'Boss 场不再现读，腿却仍判为真').toBe(false);
    expect(接线.移动见证(坏.移动见证删掉), '移动见证被废，腿却仍判为真').toBe(false);
    expect(接线.热身先于基线(坏.基线提到热身之前), '热身圈被删，腿却仍判为"顺序对"').toBe(false);
    expect(接线.重载作废在越线之前(坏.重载判据删掉), '重载判据被换成常量，腿却仍判为真').toBe(false);
    // 控制的控制：每一处只坏在它自己那一格上
    expect(接线.真推帧(坏.步长不钉)).toBe(true);
    expect(接线.固定步长(坏.重载判据删掉)).toBe(true);
    expect(接线.异常进对账(坏.站点抄一份)).toBe(true);
  });

  it('攻击锁存必须写进 player.combat.mouseDown（game.combat 是幻影字段）', () => {
    // B84 那一课：`game.combat` 从没被赋值过，读它得到 undefined。
    // 一句宽容的 `if (g.combat && g.combat.mouseDown) 点击` 会让整轮一次都不攻击 ——
    // 路线上少了战斗资源，而"零增长"照样绿。真锁存在 player.combat.mouseDown 上（Game.js:892）。
    expect(脚本源).toContain("g.player.combat.mouseDown['left'] = true");
    expect(脚本源, '按 g.combat 出招：锁存写不进去，整轮一次都不攻击').not.toMatch(/\bg\.combat\b/);
  });

  it('挡路的教学模态要像玩家一样点掉（不点就是整批帧在暂停里空转）', () => {
    /**
     * 2026-10-28 校准：首次「连击终结」会弹 ContextualTutorial → dialog.show()，
     * 而 `canPlay` 里的 `!dialog.open` 那一格把整个世界停住。探针读数：dialog.open=true
     * 之后敌血 / 精力 / 距离一动不动，8 站 × 2 圈的击杀恒 0 —— 那不是"没打死"，是"没在玩"。
     * 修法是驱动每 30 帧点一次关闭键（走 `#dialog-close` 的 click，不是 `dialog.hide()`：
     * 教学自己的 onClose 挂在那枚按钮上，绕过去它就不再排下一条）。
     */
    expect(脚本源, '驱动没有点掉教学模态的函数').toMatch(/const 清弹窗 = \(\) => \{/);
    expect(脚本源, '点的是 hide() 而不是那枚按钮：教学自己的 onClose 挂不上').toContain("document.getElementById('dialog-close')");
    expect(脚本源, '站点循环里没有定期清弹窗').toMatch(/if \(内 % 30 === 0\) 清弹窗\(\);/);
    expect(脚本源, 'Boss 场循环里没有定期清弹窗').toMatch(/if \(k % 30 === 0\) 清弹窗\(\);/);
    // 落定 / 静置复读也要清：否则基线/终局的 90 + 240 帧全在暂停里，读数是一张停住的画面
    expect((脚本源.match(/if \(i % 30 === 0\) 清弹窗\(\);/g) ?? []).length, '静置帧里没有清弹窗').toBe(2);
    // 弹窗计数要能读到（否则下次又只能靠探针猜"这一轮到底在不在玩"）
    expect(脚本源, '进度里没有弹窗计数').toMatch(/弹窗: 状态\.弹窗/);
  });

  it('传送到站后先推一帧再核区（currentZone 只在 WorldManager.update 里重算）', () => {
    /**
     * `PlayerController.teleport()` 只搬坐标；`world.currentZone` 要等 `WorldManager.update`
     * 才按新位置重算。核对排在推帧之前 ⇒ 第一站就红成"坐标与世界分家了"（2026-10-28 修）。
     */
    const 体 = 脚本源.slice(脚本源.indexOf('const 定位到 = (id) => {'), 脚本源.indexOf('const 开站 = (id) => {'));
    expect(体, '找不到 定位到 的函数体').toBeTruthy();
    const 推 = 体.indexOf('g.update();');
    const 核 = 体.indexOf('g.world.currentZone');
    expect(推, '核对前没有推帧：读到的 currentZone 还是上一站').toBeGreaterThan(0);
    expect(推 < 核, '推帧排在核对之后，等于没推').toBe(true);
  });

  it('三项涨了要指得到是谁：入画溯源挂在 renderBufferDirect 上，基线取在热身之后', () => {
    /**
     * renderer.info 只给条数。2026-10-29 校准里游玩段 geometries +10 / programs +1，
     * 站级日志只指到 fantasy 与 magic，指不到具体是哪个对象 —— 所以记录每一次首次入画
     * （uuid + 对象名 + 材质 + 游帧），基线取一份 key 集，终局差出"基线之后新入画的"。
     */
    expect(脚本源, '溯源没挂在 draw 路径上（上传只发生在 renderBufferDirect 里）')
      .toContain('g.renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {');
    expect(脚本源).toContain('const 原缓冲 = g.renderer.renderBufferDirect.bind(g.renderer);');
    const 基 = 脚本源.indexOf("await evalJs('window.__soak.取溯源基线()')");
    const 游 = 脚本源.indexOf('for (let 圈 = 1; 圈 <= 计划.laps; 圈 += 1)');
    expect(基, '溯源基线没取').toBeGreaterThan(0);
    expect(基 < 游, '溯源基线取在游玩之后（新入画的会被当成基线里就有）').toBe(true);
    const 漂 = 脚本源.indexOf('热身圈不足以把资源账推到稳态');
    expect(漂, '溯源基线取在基线漂检查之前（静置复读里才入画的一次性加载会被记成泄漏）').toBeLessThan(基);
    expect(脚本源).toContain("await evalJs('window.__soak.溯源新增()')");
    expect(脚本源, '溯源结果没有打进日志').toMatch(/基线之后新入画[\s\S]{0,200}renderer\.info/);
    // "涨了又走"（处决环/碎片）与"留下了"要分得开：dispose 要记在条目上，
    // 留下来的逐条打，走了的按"类型|材质"聚一行 —— 否则前 40 条被碎片占满，留下的看不见
    expect(脚本源, '没有跟踪 dispose：短命特效会被记成泄漏').toContain('geometry.dispose = () => { 条.销毁 = true; 原销毁(); };');
    expect(脚本源, '留下的没有单列（碎片会把列表占满）').toContain('const 留下 = 新几何.filter((条) => !条.销毁)');
    expect(脚本源, '仍在 数的是留下之前的筛选结果').toContain('仍在: 留下.length');
    // 留下的要认领得出"谁挂上来的"：对象类型 + parent 链 + 顶点数 + 终局时还在不在场上。
    // 2026-10-31 校准10：留下的 3 条只报类型（telegraph / Points），Points 归谁无从下嘴。
    expect(脚本源, '父链没记（留下的对象认不出归属系统）').toContain('父链: 父链(object),');
    expect(脚本源, '没有记顶点数（同名 Points 分不出是哪一族）').toContain("挂点: (geometry.attributes && geometry.attributes.position) ? geometry.attributes.position.count : -1,");
    expect(脚本源, '没有终身局复查对象还在不在场景上').toContain('还在场景: 条.对象参 ? 在场景上(条.对象参) : false,');
    expect(脚本源, '父链/可见/在场景没打进日志').toMatch(/还在场景=\$\{条\.还在场景\}[\s\S]{0,120}父链=\$\{条\.父链\}/);
    expect(脚本源).toContain('几何: 留下.slice(0, 40),');
    expect(脚本源, '走了的没有按类型聚合').toContain('走了: [...走了].sort((a, b) => b[1] - a[1]),');
    expect(脚本源, '日志没有把走了的聚合成一行').toContain('for (const [键, 数] of 溯源.走了) console.log(`  + 入画后已销毁 ×${数} ${键}`);');
    // 新程序的来头：缓存键是逗号分隔的参数表，跟同长度的基线键逐位比，差在哪几位就是哪个开关
    expect(脚本源, '新程序没有跟基线键逐位差分').toContain('const 最近差分 = (新键) => {');
    expect(脚本源, '差分只跟同长度的键比').toContain('if (基分.length !== 新.length) continue;');
    expect(脚本源, '差分没打进日志').toContain('最像的基线差 ${差.差.length} 位');
    // 缓存键只说出参数差，说不出"谁把它带到世界里"。2026-10-31 校准11 的 +1 程序差 1 位在
    // 能力掩码上（flatShading 的近邻 vs doubleSided 的新件），两个不同材质互相当了"最像"——
    // 所以还要记下程序首次编译时的现场：哪一帧、正在画哪个对象/材质、从哪条路径编出来。
    expect(脚本源, '没有在 draw 路径上记"当前渲染对象"（程序编译发生在 renderBufferDirect 里）')
      .toContain('当前渲染 = { object, material };');
    expect(脚本源, '当前渲染没有在 finally 里清掉（异常后会把后面的编译记到上一个对象头上）')
      .toMatch(/当前渲染 = \{ object, material \};[\s\S]{0,200}finally \{[\s\S]{0,80}当前渲染 = null;/);
    expect(脚本源, '没有换掉 info.programs 的 push（three 里程序入账的唯一入口）').toContain('程序账.push = function (...参) {');
    expect(脚本源, '程序首编没记帧/对象/材质').toMatch(/程序新增记录\.push\(\{[\s\S]{0,600}侧面: 材 && 材\.side !== undefined \? String\(材\.side\) : '\?',/);
    expect(脚本源, '程序首编没有记来路栈').toMatch(/程序新增记录\.push\(\{[\s\S]{0,900}栈: String\(new Error\(\)\.stack \|\| ''\)\.split\('\\\\n'\)\.slice\(1, 6\)\.join\(' \| '\),/);
    expect(脚本源, '程序首编没有跟新程序一起交出来').toContain('程序新增: 程序新增记录.slice(0, 20),');
    expect(脚本源, '程序首编没打进日志').toContain('程序首编 帧=${条.帧} 对象=${条.对象}');
    // 留下的仍指不到"谁挂上来的"时，看场景树上的新增及其创建栈
    expect(脚本源, '没有包 Object3D.prototype.add 记场景新增').toContain('const 原场景加 = 场景原型.add;');
    // 栈在驱动模板字面量里：`split('\n')` 一个反斜杠会被模板字面量求值成真换行，
    // 注入页面的代码就断在单引号里（2026-10-31 校准8：SyntaxError @页内:50:53）
    expect(脚本源).toMatch(/场景新增记录\.push\(\{[\s\S]{0,200}栈: String\(new Error\(\)\.stack \|\| ''\)\.split\('\\\\n'\)\.slice\(1, 5\)\.join\(' \| '\),/);
    expect(脚本源, '追踪开 没在溯源基线处打开（开机挂上去的会被记成游玩段新增）').toMatch(/取溯源基线 = \(\) => \{[\s\S]{0,200}追踪开 = true;/);
    expect(脚本源).toContain('场景新增: 场景新增记录.slice(0, 40),');
    expect(脚本源, '场景新增没打进日志').toContain('基线之后场景树上新挂 ${溯源.场景新增数} 件');
    // 程序缓存键里带光源条数（校准12：唯一差位是 numPointLights 34→35）。光照构成一变，
    // 所有受光材质按新键重编一次 —— 所以"哪盏灯来了/走了"要单独记账，否则 +1 程序只是个数字。
    expect(脚本源, '没有可见光源账（程序键带 numPointLights，灯的增减是重编的源头）')
      .toMatch(/const 光账 = \(\) => \{[\s\S]{0,300}traverseVisible\([\s\S]{0,120}o\.isLight/);
    expect(脚本源, '光源基线没在溯源基线处取').toContain('光基线 = 光账();');
    expect(脚本源, '开站没记当时的光源数（光源变化落不到具体哪一站）').toContain('状态.站光[id] = 光账().length;');
    expect(脚本源, '每站光源数没交出来').toContain('站光: { ...状态.站光 },');
    expect(脚本源, '溯源没交光照基线/终局数').toContain('光照基线数: (光基线 || []).length,');
    expect(脚本源, '没有按 uuid 差分新增光源').toContain('const 基线光id = new Set((光基线 || []).map((o) => o.uuid));');
    expect(脚本源, '新增/缺失光源没有交出来').toContain('少了光: (光基线 || []).filter((o) => !今id.has(o.uuid)).slice(0, 20),');
    // 首绘会把隐藏件翻成可见 —— 若连灯一起翻，基线里就多出游玩中从不共存的光照构成，
    // 之后正常游玩里的每一次材质首编都可能撞上"新键"。翻了几盏要读数，判定才有依据。
    expect(脚本源, '首绘没有数翻出来的灯').toContain('const 光翻 = 翻回.filter((o) => o.isLight).length;');
    expect(脚本源, '首绘的光照读数没打进日志').toContain('光照 ${首绘?.光照 ?? \'?\'} 盏，其中翻出来的灯 ${首绘?.光翻 ?? 0} 盏');
    expect(脚本源, '光源变化没打进日志').toContain('可见光源 基线 ${溯源.光照基线数} → 终局 ${溯源.光照数}');
    expect(脚本源, '新光源没有逐盏点名').toContain('+ 新可见光源 ${o.型} 名=${o.名} 强度=${o.强} 父链=${o.父链}');
    expect(脚本源, '离开的光源没有逐盏点名').toContain('- 不再可见 ${o.型} 名=${o.名} 父链=${o.父链}');
    // 终局的灯账与基线一致，程序账却可能多一条：一次性特效灯让某次首编落在 35 盏的键上。
    // 所以要在**每次真渲染前**对一遍光源 uuid 集，把这类窗口记成帧 —— 否则只看得见终局差 0。
    expect(脚本源, '渲染入口没有逐帧对光源账（一次性灯窗口记不下来）').toContain('g.renderer.render = (...参) => {');
    expect(脚本源, '光变迁没记帧/前后/来去').toContain('帧: 状态.游帧, 前: 光上次.size, 后: 今.length,');
    expect(脚本源, '光变迁没交出来').toContain('光变迁: 光变迁.slice(0, 30),');
    expect(脚本源, '光变迁没打进日志').toContain('光照变迁 帧=${c.帧} 可见灯 ${c.前}→${c.后} 盏');
  });

  it('基线取在"全场都画过一遍"之后 —— 镜头没转到不算泄漏', () => {
    /**
     * 2026-10-29 校准：热身之后三圈 geometries +13 / programs +2，入画溯源指到的全是
     * 开机就在场景里的静物（fantasy 的锥/环、magic 的柱/球）——热身圈的镜头没看见它们，
     * 首次入画才上传。判定若听命于当圈镜头朝向，红绿不可复现。基线落定带一次全景首绘：
     * 六轴向 170° 大锥各画一帧，隐藏件临时翻成可见再翻回去。
     */
    expect(脚本源, '基线落定没有带首绘').toContain("await evalJs('window.__soak.落定(true)')");
    // 预警圈是按需建的 —— 首绘必须把这条创建路径走一遍，否则 30 分钟里第一只预警
    // 新造的几何/程序会被判成增长（2026-10-31 校准10：残留 +2 正是两只 Boss 的预警圈）
    expect(脚本源, '首绘没有把预警圈的创建路径走一遍').toContain('e.showTelegraph();');
    expect(脚本源, '首绘亮过的预警圈没有收起').toContain('try { e.clearTelegraph(); } catch (err) { /* 同上 */ }');
    expect(脚本源, '首绘的预警圈放在第一轮真画之前（不然等于没画）')
      .toMatch(/起过预警\.push\(e\);[\s\S]{0,6000}const 一轮 = 画一轮\(\);/);
    expect(脚本源, '预警圈读数没打进日志').toContain('${首绘?.预警 ?? \'?\'} 只敌人亮过预警圈');
    expect(脚本源, '终局落定也带首绘（会把游玩段新造的东西洗成基线）')
      .toMatch(/快照读\('终局', await evalJs\('window\.__soak\.落定\(\)'\)\)/);
    expect(脚本源).toContain('const 落定 = (要首绘 = false) => {');
    expect(脚本源).toContain('if (要首绘) 全场首绘();');
    expect(脚本源).toContain('相.fov = 170;');
    expect(脚本源, '首绘没有真画场景').toContain('g.renderer.render(g.scene, 相);');
    // 六向大锥从枢纽打出去，远处的敌人未必进锥：2026-10-31 校准13 的 +1 程序正是
    // 咒师长袍（DoubleSide 不透明 Standard）—— 游玩第一圈才首编，说明基线没画到这一族。
    // 按类型各挑一只贴近补画，并把"补画让程序账多出几条"记下来当判据。
    expect(脚本源, '没有按类型贴近补画（远处敌人进不了六向大锥）').toContain('const 画一轮 = () => {');
    expect(脚本源, '贴近补画的机位没推到敌人跟前').toContain('相.position.set(p.x + 6, p.y + 3, p.z + 6);');
    expect(脚本源, '补画没有按类型各挑一只（同族重复画不算覆盖）').toContain('if (!e || !e.mesh) continue;');
    expect(脚本源, '同族里没有优先挑可见的那只（对象池里的隐身件一个 draw call 都画不出来）')
      .toContain('const 前选 = 本型.get(e.type);');
    expect(脚本源, '同族全是隐身件时没有临时翻出来（visible 是继承的，只翻 mesh 自己不够）')
      .toContain('if (o.visible === false) {');
    expect(脚本源, '临时翻出来的件没翻回去（游玩段会画到本该隐身的敌人）').toContain('for (const o of 翻起) o.visible = false;');
    expect(脚本源, '补画没有记这一下画出多少 draw call（0 就是根本没画到）')
      .toContain('const 呼 = g.renderer.info.render.calls - 呼前;');
    expect(脚本源, '贴近补画没有跟六向渲染排在同一轮里（两批都要落在同一档光照键上）')
      .toMatch(/for \(const \[dx, dy, dz\] of 向\)[\s\S]{0,400}const 本型 = new Map\(\);/);
    expect(脚本源, '补画新增的程序数没记').toContain('return { 近画: 画数, 近画型: 本型.size, 程序: 程序表().length - 起前, 添账, 灯数 };');
    expect(脚本源, '补画读数没打进日志').toContain('按类型贴近补画 ${首绘?.近画 ?? \'?\'} 只');
    // 光照构成是程序缓存键的一位：区域灯（WorldEffects.setZone）让 numPointLights 在 34↔35
    // 之间来回，首绘只在枢纽画过 34 盏那一档。2026-10-31 校准15：咒师长袍的 35 盏变体直到
    // 游玩段才首编（programs +1，键差 [36] "34"→"35"）。所以第二轮补一盏把两档都画进基线。
    expect(脚本源, '没有补灯画第二档光照构成').toContain('const 备灯 = 样灯.clone();');
    expect(脚本源, '补的灯不是零强度（会改变游玩前画面）且或投影（多一档阴影键）').toContain('备灯.intensity = 0;');
    expect(脚本源, '补的灯没进场景（不进场景就不在任何渲染的光照构成里）').toContain('g.scene.add(备灯);');
    expect(脚本源, '补的灯没摘掉（光账会多一盏，终局读数跟着变）')
      .toMatch(/g\.scene\.add\(备灯\);[\s\S]{0,200}} finally \{\s*g\.scene\.remove\(备灯\);/);
    expect(脚本源, '第二轮没有重画同一批（只补灯不画等于没补）').toContain('二轮 = 画一轮();');
    expect(脚本源, '第二轮新增的程序数没记').toContain('补灯, 二轮程序: 二轮 ? 二轮.程序 : 0,');
    expect(脚本源, '补灯读数没打进日志').toContain('补灯第二轮 ${首绘?.补灯 ?');
    // 只看"差 1 位"太晚：把咒师长袍材质手里的程序键的灯数与掩码两格直接记下来，
    // 才看得出它到底画过哪几档（2026-10-31 校准18：两轮补画的按类新增全"无"仍缺 35 盏变体）。
    expect(脚本源, '长袍材质手里的程序键没记（灯数与掩码各是哪一档）')
      .toContain("袍键.push('灯' + (段[36] ?? '?') + '/掩' + (段[52] ?? '?'));");
    expect(脚本源, '长袍程序键没打进日志').toContain("${(首绘?.袍键 ?? []).join(' ') || '读不到'}");
    // 2026-11-02 校准18–20 一直显示"读不到"：three r172 的 materialProperties.programs 是 Map，
    // `for...of` 拿到的是 [键, program] 数组 ⇒ `k.split` 抛进 catch、袍程序恒 −2。必须迭代 keys()。
    expect(脚本源, '长袍程序键又按 Map 条目迭代了（`k` 会是 [键, program]，split 必抛、读数永 −2）')
      .toContain('for (const k of 属.programs.keys()) {');
    // 2026-10-31 校准16：第二轮漏了咒师长袍 —— 上一轮的贴近机位没归位，第二轮从敌人跟前
    // 发散六向大锥，画的不是"枢纽看全场景"那一批。每轮开头必须把机位放回枢纽。
    expect(脚本源, '每轮开画前没把机位放回枢纽（第二轮画的是上一轮最后一只敌人的跟前）')
      .toMatch(/const 画一轮 = \(\) => \{[\s\S]{0,400}相\.position\.copy\(心\);/);
    expect(脚本源, '补画没有按类记"补出了几条程序、身体是不是隐着的、画了几个 draw call"（漏一族时无从下嘴）')
      .toContain('添账.push({ 型: e.type, 数: 程序表().length - 前, 显, 呼 });');
    expect(脚本源, '按类新增没交出来').toContain('一轮添账: 一轮.添账, 二轮添账: 二轮 ? 二轮.添账 : [],');
    expect(脚本源, '按类新增没打进日志').toContain('第一轮按类新增 ${账(首绘?.一轮添账)}');
    // 弹体几何是共享的一份，第一次开火才上传 —— 基线不走过这条创建路径，游玩段的 +1
    // 就会被当成泄漏（2026-10-31 校准14：游帧 5900 的 81 点 SphereGeometry 正是它）。
    expect(脚本源, '首绘没有预热弹体（共享几何到第一次开火才上传）').toContain('弹管.spawn(弹起, 心.clone(), 0);');
    expect(脚本源, '预热的弹体没有回收（留一发在场上会干扰游玩段）').toContain('弹管._recycle(弹管.projectiles.length - 1);');
    expect(脚本源, '弹体预热读数没打进日志').toContain('弹体预热 ${首绘?.弹预热 ? \'已发一发\' : \'跳过\'}');
    expect(脚本源, '第二轮排在弹体回收之后（预热那发要在两轮里都画得到）')
      .toMatch(/二轮 = 画一轮\(\);[\s\S]{0,600}弹管\._recycle\(弹管\.projectiles\.length - 1\);/);
    expect(脚本源, '首绘没有覆盖上下左右前后六个方向').toContain('const 向 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];');
    expect(脚本源, '隐藏件翻成可见后没翻回去（游玩段会画到对象池里的死件）')
      .toContain('for (const o of 翻回) o.visible = false;');
    const 首 = 脚本源.indexOf("await evalJs('window.__soak.落定(true)')");
    const 溯 = 脚本源.indexOf("await evalJs('window.__soak.取溯源基线()')");
    expect(首, '溯源基线取在首绘之前（首绘会把自己刚上传的记成游玩段的新入画）').toBeLessThan(溯);
  });

  it('同一轮只许有一个页：通道计数器只有一份、声明在 try 外面', () => {    expect((脚本源.match(/^\s*const 通道 = /gm) ?? []).length, '通道计数器有两份（catch 里的归因会永远沉默）').toBe(1);
    expect((脚本源.match(/^\s*let 基线上下文 = /gm) ?? []).length).toBe(1);
    expect(脚本源.search(/^\s*const 通道 = /m), '计数器声明在 try 里面（catch 看不见）')
      .toBeLessThan(脚本源.indexOf('let failures = 0;'));
    // 收尾必须拔整棵树：只 kill 主进程会留下 renderer 把 dev 口/临时目录钉住
    expect(脚本源).toMatch(/spawnSync\('taskkill', \['\/PID', String\(子进程\.pid\), '\/T', '\/F'\]/);
    expect(脚本源.indexOf('spawnSync'), '拔树排在删临时目录之后').toBeLessThan(脚本源.indexOf('rmSync(profileDir'));
  });
});
