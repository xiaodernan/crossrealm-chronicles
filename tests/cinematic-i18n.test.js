/**
 * Boss 过场文案的双表门禁（W-D2 切片17）。
 *
 * 病灶：`BOSS_CINEMATICS` 的 24 格文案（8 只 Boss × title/subtitle/lines）曾是
 * **裸中文**—— 英文玩家看到的是中文，且没有任何门禁会响（旧 i18n 门禁只扫
 * `t()` 调用与壳页 `data-i18n`，内容表里的**字段值**两处都扫不到，正是
 * `content-i18n-keys` 那道门禁补的那类洞）。
 *
 * 口径（与切片16b 日志页签同族）：
 * - 值全是键；`title` 指向名册/图鉴的**既有键**（"它叫什么"仍只有一个出处）；
 * - 迁移原值逐字钉死 —— 换的是住址，不是玩家读到的字；
 * - 静态腿：`BOSS_CINEMATICS` 块里不许再出现裸中文；
 * - 行为腿：`tryPlay` 写进 DOM 的、跨相位交给 `dialog.show` 的，都必须是
 *   `t()` 展开后的句子（`{parry}` 等占位符原样留着，`keyText` 的展开
 *   仍是 Dialog 的职责 —— 那条链有它自己的门禁）。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOSS_CINEMATICS, CinematicManager } from '../src/cinematic/CinematicManager.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { t, setLanguage, getLanguage } from '../src/engine/i18n.js';
import { installWindowShim } from './helpers/enemyHarness.js';
import { resetDofForTest } from '../src/engine/DofManager.js';

const ZH = new Set(ZH_KEYS);
const EN = new Set(EN_KEYS);

/** 迁移前的原值（逐字钉死） */
const 原副标题 = {
  'shadow-warden': '灰白森林 · 位面试炼 I',
  archmagus: '霍格沃兹遗境 · 位面试炼 II',
  'singularity-herald': '米勒荒原 · 位面试炼 III',
  'void-chronarch': '破碎时线 · 隐藏试炼',
  'chaos-overlord': '混沌边境 · 终焉试炼',
  'dungeon-ruin-crypt': '灰白遗城 · 迷宫守钥者',
  'dungeon-forbidden-library': '禁书图书馆 · 迷宫守钥者',
  'dungeon-five-dim-rift': '五维裂隙 · 迷宫守钥者',
};
const 原正文 = {
  'shadow-warden': '「踏入此域者，将承受影界之审判！」\n\n观察脚下红圈 · {parry} 弹反 · {skill} 位面斩',
  archmagus: '「奥术的本质，是吞噬一切位面的光。」\n\n躲避紫色法球 · 靠近弹反 · {spell1}–{spell4} 法术牵制',
  'singularity-herald': '「引力从不询问许可——它只索取。」\n\n三阶段引力拉扯 · 轨道弹幕 · 蓄力法术破盾',
  'void-chronarch': '「时间不是河流——是可被撕裂的布。」\n\nChapter 4 隐藏 Boss · 蓄力真火可打断时停',
  'chaos-overlord': '「四界归一，裂隙仍存——唯有斩裂混沌本身。」\n\n三阶段混沌脉冲 · 武器技能树加成 · {swapWeapon} 切换剑/杖',
  'dungeon-ruin-crypt': '「我只保管门，不询问来者去向。」\n\n45% 血二阶段 · {lockOn} 锁定 · 清空后可 [{interact}] 离开',
  'dungeon-forbidden-library': '「最后一页，不允许被读到。」',
  'dungeon-five-dim-rift': '「五维生物的投影 — 在此只有三维。」',
};

/** 同一把尺子：一条过场配置里三格各自在两张表里的登记情况 */
const 缺登记 = (cfg) => {
  const 缺 = [];
  for (const f of ['title', 'subtitle', 'lines']) {
    if (!ZH.has(cfg[f])) 缺.push(`中文表缺 "${cfg[f]}"（${f}）`);
    if (!EN.has(cfg[f])) 缺.push(`英文表缺 "${cfg[f]}"（${f}）`);
  }
  return 缺;
};

/** 过场要 DOM：按 id 取元素、记下写进去的文本（与 dof-cinematic-focus 同款夹具） */
function installDomShim() {
  class FakeElement {
    constructor() {
      this.children = [];
      this.style = { setProperty() {}, opacity: '', color: '' };
      this.classList = { add() {}, remove() {}, contains: () => false };
      this.textContent = '';
      this.innerHTML = '';
    }
    appendChild(c) { this.children.push(c); return c; }
    setAttribute() {}
  }
  const byId = new Map();
  globalThis.document = {
    createElement: () => new FakeElement(),
    body: new FakeElement(),
    getElementById: (id) => {
      if (!byId.has(id)) byId.set(id, new FakeElement());
      return byId.get(id);
    },
  };
  globalThis.requestAnimationFrame = () => 0;
}

/** 放一只 Boss 进来，收回记录器与过场本体 */
const 播放 = (bossId) => {
  const 收到 = [];
  const game = {
    cinematicActive: false,
    audio: { bossRoar() {} },
    dialog: { open: false, show: (a, b) => 收到.push([a, b]), hide() {} },
    player: { position: new THREE.Vector3(), rig: { setView() {} } },
  };
  const cine = new CinematicManager(game);
  window.dispatchEvent(new CustomEvent('boss-start', {
    detail: { bossId, position: new THREE.Vector3(0, 0, 10) },
  }));
  return { cine, 收到 };
};

beforeAll(() => { installWindowShim(); installDomShim(); });
beforeEach(() => { resetDofForTest(); });
afterEach(() => { setLanguage('zh'); });

describe('结构腿：三格两表都登记', () => {
  it('8 条过场 × 3 字段 = 24 个键值，中英两表一个不缺', () => {
    const 缺 = [];
    let 扫到 = 0;
    for (const [id, cfg] of Object.entries(BOSS_CINEMATICS)) {
      扫到 += 1;
      for (const line of 缺登记(cfg)) 缺.push(`${id}: ${line}`);
    }
    expect(扫到, '分母自证：过场条目数变了？').toBe(8);
    expect(缺).toEqual([]);
  });

  it('反向控制：同一把尺子量假键必须点名（防这条判据根本不动）', () => {
    const 假 = { title: 'boss_name_shadow', subtitle: 'cine_sub_不存在的键', lines: 'cine_lines_shadow' };
    expect(缺登记(假)).toEqual([
      '中文表缺 "cine_sub_不存在的键"（subtitle）',
      '英文表缺 "cine_sub_不存在的键"（subtitle）',
    ]);
    // 真键必须过得去 —— 量不到的尺子量真键也会"缺"
    expect(缺登记(BOSS_CINEMATICS.archmagus)).toEqual([]);
  });
});

describe('迁移原值钉死：换的是住址，不是玩家读到的字', () => {
  it('副标题八格逐字不变', () => {
    for (const [id, v] of Object.entries(原副标题)) {
      expect(t(BOSS_CINEMATICS[id].subtitle), `${id} 副标题`).toBe(v);
    }
  });

  it('正文八格逐字不变（占位符原样，留给 keyText）', () => {
    for (const [id, v] of Object.entries(原正文)) {
      expect(t(BOSS_CINEMATICS[id].lines), `${id} 正文`).toBe(v);
    }
  });

  it('标题八格展开后是名册全名 / 图鉴标题', () => {
    expect(t(BOSS_CINEMATICS['shadow-warden'].title)).toBe('影界守护者');
    expect(t(BOSS_CINEMATICS.archmagus.title)).toBe('大奥术师·萨尔林');
    expect(t(BOSS_CINEMATICS['singularity-herald'].title)).toBe('引力化身·奇点领主');
    expect(t(BOSS_CINEMATICS['void-chronarch'].title)).toBe('时线执政官');
    expect(t(BOSS_CINEMATICS['chaos-overlord'].title)).toBe('混沌裂隙领主');
    expect(t(BOSS_CINEMATICS['dungeon-ruin-crypt'].title)).toBe('遗城守墓者');
    expect(t(BOSS_CINEMATICS['dungeon-forbidden-library'].title)).toBe('禁书守页人');
    expect(t(BOSS_CINEMATICS['dungeon-five-dim-rift'].title)).toBe('裂隙监工');
  });
});

describe('静态腿：过场表里不许再有裸中文', () => {
  it('BOSS_CINEMATICS 块（注释剥掉后）不含中文字符', () => {
    const 源码 = readFileSync(join(process.cwd(), 'src/cinematic/CinematicManager.js'), 'utf8');
    const 起点 = 源码.indexOf('export const BOSS_CINEMATICS');
    const 块 = 源码.slice(起点, 源码.indexOf('\n};', 起点));
    const 无注释 = 块
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(无注释, '过场文案表里又出现裸中文了').not.toMatch(/[\u4e00-\u9fff]/);
  });
});

describe('行为腿：播出来的那一句是展开后的', () => {
  it('tryPlay 把展开句写进 DOM，dialog 相位交给 dialog.show 的也是展开句', () => {
    const { cine, 收到 } = 播放('shadow-warden');
    expect(document.getElementById('cine-title').textContent).toBe('影界守护者');
    expect(document.getElementById('cine-subtitle').textContent).toBe('灰白森林 · 位面试炼 I');
    cine.timer = 3;
    cine.update(1 / 60);
    expect(收到).toEqual([['影界守护者', 原正文['shadow-warden']]]);
    cine.dispose();
  });

  it('切到英文：同一段过场播出的是英文（键真的接着两张表）', () => {
    const 原语言 = getLanguage();
    try {
      setLanguage('en');
      const { cine, 收到 } = 播放('archmagus');
      expect(document.getElementById('cine-title').textContent).toBe('Archmagus Saloran');
      expect(document.getElementById('cine-subtitle').textContent).toBe('Hogwarts Ruins · Plane Trial II');
      cine.timer = 3;
      cine.update(1 / 60);
      expect(收到).toEqual([['Archmagus Saloran', t('cine_lines_mage')]]);
      expect(收到[0][1]).toContain('{spell1}');
      cine.dispose();
    } finally {
      setLanguage(原语言);
    }
  });
});