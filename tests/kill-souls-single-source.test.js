/**
 * 击杀魂基数表 `KILL_SOULS` 只许有一个定义（"改一处另一处不会跟着变"家族）。
 *
 * 病灶：`src/content/enemies.js` 导出 `KILL_SOULS`（并派生 `KILL_SOUL_KINDS` 供注册表对齐
 * `GEAR_DROP.byKind`），而 `src/combat/EnemyManager.js` 又**另抄了一份**字面量给
 * `killRewardSouls` 用。两份今天逐值相同，但没有任何东西押着它们一起变 —— 谁只把一处
 * （例如 boss 500 调成 600）改了，活的击杀奖励走 EnemyManager 那份、导出的名册与派生的
 * kinds 走 enemies.js 那份，于是"同一个击杀魂基数"有了两个口径，且不报错。
 *
 * 修法：EnemyManager 直接 import enemies.js 的 `KILL_SOULS`，删掉本地那份。
 * （EnemyManager 头部注释本就写着"不抄第二份基数表"—— 本片让那句话名副其实。）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { KILL_SOULS, KILL_SOUL_KINDS } from '../src/content/enemies.js';
import { GEAR_DROP } from '../src/content/gear.js';
import { killRewardSouls } from '../src/combat/EnemyManager.js';
import { growthAt } from '../src/content/enemyGrowth.js';

const ROOT = process.cwd();

/** 递归读 src 下所有 .js（去掉注释，免得注释里提到 KILL_SOULS 也算成定义） */
function srcFiles(dir = 'src') {
  const out = [];
  for (const ent of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${ent.name}`;
    if (ent.isDirectory()) out.push(...srcFiles(rel));
    else if (ent.name.endsWith('.js')) {
      const raw = readFileSync(join(ROOT, rel), 'utf8');
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      out.push({ rel, code });
    }
  }
  return out;
}

describe('KILL_SOULS 单一定义（击杀魂基数表不许有两份）', () => {
  it('全仓 src 里 KILL_SOULS 的字面量定义只有一处（import 使用不算法）', () => {
    const decls = srcFiles()
      .filter(({ code }) => /\bKILL_SOULS\s*=\s*(?:Object\.freeze\s*\()?\s*\{/.test(code))
      .map((f) => f.rel);
    // 内容表的身位：基数表住在 content/enemies.js 一处；combat/ 只许 import，不许再声明
    expect(decls).toEqual(['src/content/enemies.js']);
  });

  it('killRewardSouls 用的就是导出的那张表：0 档恒等、逐档只按 growth.souls 走', () => {
    // 这条同时是"两份在修复前逐值相同"的证据 —— 正因为相等，去副本才不改变任何读数。
    const g3 = growthAt(3);
    for (const kind of KILL_SOUL_KINDS) {
      expect(killRewardSouls(kind, 0), `${kind} 0 档应等于表值`).toBe(KILL_SOULS[kind]);
      expect(killRewardSouls(kind, 3), `${kind} 3 档 = 表值 × growth.souls`).toBe(Math.round(KILL_SOULS[kind] * g3.souls));
    }
  });

  it('未知 kind 落 normal 兜底（不许把奖励算成 NaN/0）', () => {
    expect(killRewardSouls('no-such-kind', 0)).toBe(KILL_SOULS.normal);
  });

  // 分隔守卫：kinds 非空，上面两条 for 循环不许空转成"干净"
  it('四种击杀档位都在（分隔守卫）', () => {
    expect(KILL_SOUL_KINDS.slice().sort()).toEqual(['boss', 'elite', 'golem', 'normal']);
  });

  it('击杀档位域对齐 GEAR_DROP.byKind：掉魂的每个 kind 都得有掉宝率', () => {
    // `EnemyManager.js` 头部原写"KILL_SOUL_KINDS 供注册表对齐 GEAR_DROP.byKind"，但修前它
    // 根本没有消费者（KILL_SOULS 也没进注册表）—— 那句是空头支票。真正该守的不变量是：
    // 能被 killRewardSouls 认的每个 kind，GEAR_DROP.byKind 都得给得出掉率，否则"这一档掉魂、
    // 却查不到掉宝率"会在 `spawnKill` 那条路上静默落到 `none` 兜底，且没人会发现。
    const gearKinds = Object.keys(GEAR_DROP.byKind);
    for (const kind of KILL_SOUL_KINDS) {
      expect(gearKinds, `击杀档位「${kind}」在 GEAR_DROP.byKind 里没有对应格`).toContain(kind);
    }
    // 反向：GEAR_DROP 多出来的档是"有掉宝率但不掉魂"的（dummy 训练木人 / none 名单外兜底），
    // 记死这份差集 —— 别让两张表悄悄长成同一张，也别让某一档只进一张、另一张漏登。
    expect(gearKinds.filter((k) => !KILL_SOUL_KINDS.includes(k)).sort()).toEqual(['dummy', 'none']);
  });
});
