/**
 * 难度三档的门禁（W-E1 切片1 + 切片2 设置接线）。
 *
 * 七层，每层各管一件事：
 *
 * 1. **表的形状**：三档、kebab id、label/desc 非空、乘子键集合 == `DIFFICULTY_KEYS`、
 *    逐格有限正数。这些是 `checkDifficultyTable` 自己报的（注册表的 invariant 槽位），
 *    这里逐条喂坏表证明它**真的会报**（六条规则各一条反向）。
 * 2. **出厂档零变更**：`standard` 逐格 === 1，且 `setDifficulty('standard')` 之后
 *    `difficultyMultiplier(k) === 1` 对每个 k 成立 —— 这是"接上难度系统"与"没接"逐字节相同的保证。
 * 3. **认不出就抛 / 脏值回落**：两条路分开（代码里写死的 id 该抛，玩家可写的存储该回落），
 *    合成一条等于让存储里的脏值也能把游戏拦在启动前。
 * 4. **接线**：注册表里真有 `kind: 'difficulty'` 这一条、它的 invariant 就是
 *    `checkDifficultyTable`、把表改坏之后 `checkContent()` 咬得住（不是只被本文件直接调）。
 * 5. **每一格都有人读**：扫 `src/`，`difficultyMultiplier('<key>')` 的**键集合必须恰好等于**
 *    `DIFFICULTY_KEYS` —— 少一个（表里加了假旋钮）红，多一个（代码用了表里没有的键）也红。
 *    这条是本片"乘子表不许长没人读的格子"那句话的落点。
 * 6. **三个咽喉各自真的生效**：`enemyHp`（`EnemyManager.spawnAt`）、
 *    `damageTaken`（`CombatController.takeDamage`）、`souls`（`PlayerStats.addSouls`）——
 *    各用真代码跑一遍三档，读数逐档比。
 * 7. **设置接线**（切片2）：面板选项从 `difficultyOptions()` 现推（HTML 不抄第二份）、
 *    `change` 走 `set` + `applyToGame`、落地写入口全仓只有 `SettingsManager.applyToGame`
 *    一处；壳页那格 select 与两张 strings 表的键都在场。没有这一层，"难度三档"
 *    就只是一张没人能选中的表。
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIFFICULTY_IDS, DIFFICULTY_KEYS, DIFFICULTY_TIERS, DEFAULT_DIFFICULTY,
  assertDifficultyTable, checkDifficultyTable, difficultyOf, normalizeDifficulty,
} from '../src/content/difficulty.js';
import {
  difficultyMultiplier, difficultyOptions, getDifficultyId, resetDifficulty, setDifficulty,
} from '../src/game/Difficulty.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { SettingsManager } from '../src/core/SettingsManager.js';
import { SettingsPanel } from '../src/ui/SettingsPanel.js';
import { EnemyManager } from '../src/combat/EnemyManager.js';
import { CombatController } from '../src/combat/CombatController.js';
import { PlayerStats } from '../src/game/PlayerStats.js';
import { ENEMY_ROSTER } from '../src/content/enemies.js';
import { makePlayer } from './helpers/playerHarness.js';
import { t } from '../src/engine/i18n.js';

const ROOT = process.cwd();

beforeAll(() => {
  const handlers = new Map();
  globalThis.window = {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
    },
    dispatchEvent(event) {
      handlers.get(event.type)?.forEach((fn) => fn(event));
      return true;
    },
  };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
});

afterEach(() => { resetDifficulty(); });

/** 表的一份可变深拷贝（用于喂坏表；真表是 deepFreeze 过的） */
const cloneTable = () => JSON.parse(JSON.stringify(DIFFICULTY_TIERS));

describe('难度表：形状与六条不变式', () => {
  it('三档齐、id 是 kebab-case、label/desc 非空、乘子逐格有限正数', () => {
    expect(Object.keys(DIFFICULTY_TIERS).sort()).toEqual([...DIFFICULTY_IDS].sort());
    expect(DIFFICULTY_IDS.length).toBe(3);
    for (const id of DIFFICULTY_IDS) {
      expect(id).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
      expect(DIFFICULTY_TIERS[id].label.trim()).not.toBe('');
      expect(DIFFICULTY_TIERS[id].desc.trim()).not.toBe('');
      expect(Object.keys(DIFFICULTY_TIERS[id].multipliers).sort()).toEqual([...DIFFICULTY_KEYS].sort());
      for (const k of DIFFICULTY_KEYS) {
        const v = DIFFICULTY_TIERS[id].multipliers[k];
        expect(Number.isFinite(v) && v > 0, `${id}.${k} = ${v}`).toBe(true);
      }
    }
    expect(checkDifficultyTable()).toEqual([]);
  });

  it('出厂档逐格为 1（零变更的结构保证）', () => {
    expect(DEFAULT_DIFFICULTY).toBe('standard');
    for (const k of DIFFICULTY_KEYS) expect(DIFFICULTY_TIERS.standard.multipliers[k]).toBe(1);
  });

  it('六条不变式各自咬得住（逐条喂坏表）', () => {
    const 坏 = (mutate) => { const t = cloneTable(); mutate(t); return checkDifficultyTable(t); };

    // ① 档位集合对不上（多一格 / 少一格）
    expect(坏((t) => { t.standrad = { label: 'x', desc: 'y', multipliers: { enemyHp: 1, damageTaken: 1, souls: 1 } }; })
      .some((e) => e.includes('档位集合'))).toBe(true);
    expect(坏((t) => { delete t.brutal; }).some((e) => e.includes('档位集合'))).toBe(true);

    // ② 乘子集合对不上（缺一格 / 多一格）
    expect(坏((t) => { delete t.brutal.multipliers.souls; }).some((e) => e.includes('乘子集合'))).toBe(true);
    expect(坏((t) => { t.brutal.multipliers.luck = 2; }).some((e) => e.includes('乘子集合'))).toBe(true);

    // ③ 乘子不是有限正数
    expect(坏((t) => { t.brutal.multipliers.enemyHp = 0; }).some((e) => e.includes('有限正数'))).toBe(true);
    expect(坏((t) => { t.brutal.multipliers.enemyHp = Number.NaN; }).some((e) => e.includes('有限正数'))).toBe(true);

    // ④ 空 label / 空 desc
    expect(坏((t) => { t.story.label = '  '; }).some((e) => e.includes('label 是空的'))).toBe(true);
    expect(坏((t) => { t.story.desc = ''; }).some((e) => e.includes('desc 是空的'))).toBe(true);

    // ⑤ 出厂档不是全 1
    expect(坏((t) => { t.standard.multipliers.enemyHp = 1.1; }).some((e) => e.includes('而不是 1'))).toBe(true);

    // ⑥ 档位序走反（越往后越轻松）
    expect(坏((t) => { t.brutal.multipliers.enemyHp = 0.5; }).some((e) => e.includes('走反了'))).toBe(true);
    expect(坏((t) => { t.brutal.multipliers.souls = 2; }).some((e) => e.includes('走反了'))).toBe(true);

    // 一次报全部错：同时踩三条时三条都在（不是遇到第一条就抛）
    const 多条 = 坏((t) => { t.story.label = ''; t.brutal.multipliers.souls = 9; t.standard.multipliers.damageTaken = 2; });
    expect(多条.length).toBeGreaterThanOrEqual(3);
    expect(() => assertDifficultyTable(cloneTable())).not.toThrow();
    expect(() => assertDifficultyTable({ story: {} })).toThrow(/难度表校验未通过/);
  });
});

describe('难度：认不出就抛 / 脏值回落（两条路分开）', () => {
  it('`difficultyOf` 与 `difficultyMultiplier` 认不出当场抛', () => {
    expect(() => difficultyOf('nope')).toThrow(/未知难度/);
    expect(() => difficultyMultiplier('nope')).toThrow(/未知难度乘子/);
    expect(() => difficultyMultiplier('enemyHP')).toThrow(/未知难度乘子/); // 大小写也是另一个键
  });

  it('`normalizeDifficulty` / `setDifficulty` 对脏值回落出厂档，不抛', () => {
    expect(normalizeDifficulty('nope')).toBe(DEFAULT_DIFFICULTY);
    expect(normalizeDifficulty(undefined)).toBe(DEFAULT_DIFFICULTY);
    expect(normalizeDifficulty(null)).toBe(DEFAULT_DIFFICULTY);
    expect(setDifficulty('nope')).toBe(DEFAULT_DIFFICULTY);
    expect(getDifficultyId()).toBe(DEFAULT_DIFFICULTY);
  });

  it('面板选项从名册现推（不是 HTML 里抄的第二份）', () => {
    expect(difficultyOptions().map((o) => o.id)).toEqual(DIFFICULTY_IDS);
    for (const o of difficultyOptions()) {
      // W-D2 切片16v：档位名与说明存的是**文案键** —— 比展开后那一句
      expect(o.label).toBe(t(DIFFICULTY_TIERS[o.id].label));
      expect(o.desc).toBe(t(DIFFICULTY_TIERS[o.id].desc));
    }
  });
});

describe('难度表接在注册表上（不是只被本文件直接调）', () => {
  it('注册表里真有这一条，且它的 invariant 就是 checkDifficultyTable', () => {
    const entry = CONTENT_TABLES.find((t) => t.kind === 'difficulty');
    expect(entry, '注册表里没有 difficulty 这一条 —— 它就不会被 checkContent 看见').toBeTruthy();
    expect(entry.shape).toBe('index');
    expect(entry.table).toBe(DIFFICULTY_TIERS);
    expect(entry.invariant).toBe(checkDifficultyTable);
    expect(checkContent()).toEqual([]);
  });

  it('把表改坏之后 `checkContent()` 咬得住（门禁真的挂在槽位上）', () => {
    const broken = cloneTable();
    broken.brutal.multipliers.enemyHp = 0.1; // 比 story 还脆 = 档位序走反
    const tables = CONTENT_TABLES.map((t) => (t.kind === 'difficulty' ? { ...t, table: broken } : t));
    const errs = checkContent(tables).join('\n');
    expect(errs, '改坏的难度表在 checkContent 里没有报错 —— 条目挂空了').toMatch(/走反了/);
  });
});

describe('每一格乘子都得有人读（扫 src/ 逐个点名）', () => {
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (name.endsWith('.js')) out.push(full);
    }
    return out;
  };

  it('`difficultyMultiplier(\'键\')` 的键集合恰好等于 DIFFICULTY_KEYS', () => {
    const 用到 = new Map(); // key → 文件列表
    for (const file of walk(join(ROOT, 'src'))) {
      const code = readFileSync(file, 'utf8');
      for (const m of code.matchAll(/difficultyMultiplier\(\s*'([^']+)'\s*\)/g)) {
        const rel = file.replace(/\\/g, '/').split('/src/')[1];
        if (!用到.has(m[1])) 用到.set(m[1], []);
        用到.get(m[1]).push(rel);
      }
    }
    const keys = [...用到.keys()].sort();
    expect(keys, '表里加了一格没人读的乘子（面板上会多一个假旋钮），或者代码用了表里没有的键')
      .toEqual([...DIFFICULTY_KEYS].sort());
    // 三个咽喉各一处，逐格点名（防"三格挤在同一个文件里"这种看起来有覆盖的写法）
    expect(用到.get('enemyHp')).toContain('combat/EnemyManager.js');
    expect(用到.get('damageTaken')).toContain('combat/CombatController.js');
    expect(用到.get('souls')).toContain('game/PlayerStats.js');
  });
});

describe('三个咽喉各自真的生效（三档读数逐档比）', () => {
  it('enemyHp：出生那一瞬间的血量按档缩放（真 spawnAt 路径）', () => {
    const host = Object.create(EnemyManager.prototype);
    host.spawn = (cfg) => cfg;
    const at = (tier, type) => {
      setDifficulty(tier);
      return EnemyManager.prototype.spawnAt.call(host, type, 1, 2).hp;
    };
    const base = ENEMY_ROSTER.soldier.hp;
    expect(at('standard', 'soldier')).toBe(base);
    expect(at('story', 'soldier')).toBe(Math.round(base * 0.8));
    expect(at('brutal', 'soldier')).toBe(Math.round(base * 1.3));
    // 名字与坐标不受影响（乘子只管那一格）
    // W-D2 切片16s：名册的 `name` 是**文案键**，出生那一刻展开 —— 比的是展开后那一句
    const cfg = (setDifficulty('story'), EnemyManager.prototype.spawnAt.call(host, 'golem', 7, 8));
    expect(cfg.name).toBe(t(ENEMY_ROSTER.golem.name));
    expect(cfg.x).toBe(7); expect(cfg.z).toBe(8);
    // `posture` 刻意不乘（见 spawnAt 注释）
    expect(cfg.posture).toBe(ENEMY_ROSTER.golem.posture);
  });

  it('damageTaken：玩家受击走真 takeDamage，三档扣血逐档递增', () => {
    const makeCombat = () => {
      const manager = { enemies: [], getAliveEnemies: () => [] };
      // `CombatController` 构造期会往 `player.scene` 里挂挥砍组（W-A1 的特效生命周期），
      // 而 locomotion 夹具不带场景 —— 补一个真空场景即可，本用例不碰特效。
      const player = makePlayer();
      player.scene = new THREE.Scene();
      const c = new CombatController(player, manager, { toast() {} }, null, null, null);
      c.rng = () => 0.99; // 不暴击：比的是确定的数
      return c;
    };
    const 扣 = (tier) => { setDifficulty(tier); const c = makeCombat(); c.takeDamage(20); return 100 - c.hp; };
    const std = 扣('standard');
    expect(std).toBe(20);
    expect(扣('story')).toBeLessThan(std);
    expect(扣('brutal')).toBeGreaterThan(std);
    // 乘在结算之前：无敌帧照旧吞掉整笔（乘子不该绕过它）
    setDifficulty('brutal');
    const c = makeCombat();
    c.invincible = true;
    c.takeDamage(20);
    expect(c.hp).toBe(100);
  });

  it('souls：收入按档缩放，扣账不参与', () => {
    const 得 = (tier, n) => { setDifficulty(tier); const s = new PlayerStats(); s.addSouls(n); return s.souls; };
    expect(得('standard', 10)).toBe(10);
    expect(得('story', 10)).toBe(13); // 10 × 1.25
    expect(得('brutal', 10)).toBe(8); // 10 × 0.8
    // 扣账（负数）不乘：叙事档 ×1.25 乘到扣账上会变成"更容易的档扣得更多"
    setDifficulty('story');
    const s = new PlayerStats();
    s.addSouls(-10);
    expect(s.souls).toBe(-10);
  });
});

describe('设置接线：面板从名册现推、写入口只有 applyToGame 一处（W-E1 切片2）', () => {
  /** 假设置管理器：不碰 localStorage（node 里没有它），但 data 与 applyToGame 都是真的 */
  const 假设置 = (difficulty = DEFAULT_DIFFICULTY) => {
    const mgr = new SettingsManager();
    mgr.data = { ...mgr.data, difficulty };
    mgr.save = () => {};
    return mgr;
  };
  const 假game = () => ({ audio: null, renderer: null, composer: null });

  it('DEFAULTS 里有 difficulty 一格，出厂就是 standard', () => {
    const mgr = new SettingsManager();
    expect(mgr.defaults.difficulty, 'DEFAULTS 里没有 difficulty 一格 —— 读档永远拿不到它')
      .toBe(DEFAULT_DIFFICULTY);
    expect(mgr.get('difficulty')).toBe(DEFAULT_DIFFICULTY);
  });

  it('applyToGame 把存档里的档位推进运行时（写入口只有这一处）', () => {
    假设置('brutal').applyToGame(假game());
    expect(getDifficultyId()).toBe('brutal');
    expect(difficultyMultiplier('enemyHp')).toBe(1.3);
  });

  it('存储里的脏档回落出厂，不抛（一行手改的 localStorage 不该炸开机）', () => {
    expect(() => 假设置('nightmare').applyToGame(假game())).not.toThrow();
    expect(getDifficultyId()).toBe(DEFAULT_DIFFICULTY);
  });

  it('面板：选项从 difficultyOptions() 现推，change 走 set + applyToGame（假 DOM 真点）', () => {
    const ORIGINAL_DOC = globalThis.document;
    const opts = [];
    const sel = {
      value: DEFAULT_DIFFICULTY,
      listeners: {},
      appendChild: (o) => opts.push(o),
      addEventListener: (type, fn) => { (sel.listeners[type] ??= []).push(fn); },
      dispatchEvent: (e) => { sel.listeners[e.type]?.forEach((fn) => fn({ target: sel })); return true; },
    };
    globalThis.document = {
      getElementById: (id) => (id === 'set-difficulty' ? sel : null),
      createElement: () => ({}),
    };
    try {
      const settings = 假设置();
      const game = { settings };
      new SettingsPanel(game);
      expect(opts.map((o) => o.value), '选项不是从名册现推的 —— 面板抄了第二份名单')
        .toEqual(DIFFICULTY_IDS);
      expect(opts.map((o) => o.textContent)).toEqual(DIFFICULTY_IDS.map((id) => t(DIFFICULTY_TIERS[id].label)));
      expect(sel.value, '面板没回显当前档').toBe(DEFAULT_DIFFICULTY);
      sel.value = 'story';
      sel.dispatchEvent({ type: 'change' });
      expect(settings.get('difficulty'), 'change 没有写进设置').toBe('story');
      expect(getDifficultyId(), 'change 没有落地到运行时').toBe('story');
    } finally {
      globalThis.document = ORIGINAL_DOC;
    }
  });

  it('写入口全仓只有 SettingsManager 一处（`setDifficulty(` 的调用点计数）', () => {
    const srcDir = join(ROOT, 'src');
    const walk = (dir, out = []) => {
      for (const n of readdirSync(dir)) {
        const full = join(dir, n);
        if (statSync(full).isDirectory()) walk(full, out);
        // 反斜杠归一后再比：Windows 上 join 出来的是 `\`，直接 endsWith('game/…') 一个都排不掉
        else if (n.endsWith('.js') && !full.replace(/\\/g, '/').endsWith('game/Difficulty.js')) out.push(full);
      }
      return out;
    };
    const 调用点 = [];
    for (const file of walk(srcDir)) {
      const text = readFileSync(file, 'utf8');
      for (const line of text.split('\n')) {
        // 左边界防 `resetDifficulty(` 的子串误命中；import 行不算调用点
        if (/(?<![A-Za-z])setDifficulty\(/.test(line) && !line.includes('import ')) {
          调用点.push(`${file.slice(srcDir.length + 1).replace(/\\/g, '/')}: ${line.trim()}`);
        }
      }
    }
    expect(调用点, 'setDifficulty 的调用点不是恰好一处 —— 换档有多条路可走').toHaveLength(1);
    expect(调用点[0]).toContain('core/SettingsManager.js');
  });

  it('壳页与文案：index.html 有那格 select，两张 strings 表都有键', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).toContain('id="set-difficulty"');
    expect(html).toContain('data-i18n="settings_difficulty"');
    const zh = readFileSync(join(ROOT, 'src', 'content', 'strings.zh.js'), 'utf8');
    const en = readFileSync(join(ROOT, 'src', 'content', 'strings.en.js'), 'utf8');
    expect(zh).toContain("settings_difficulty:");
    expect(en).toContain("settings_difficulty:");
  });
});
