/**
 * 副本表 = 五座迷宫身份的唯一真源 —— W-B10 切片3a。
 *
 * ## 这一片要修的是什么
 *
 * `DUNGEON_DEFS` 今天写在 `world/DungeonManager.js` 的第 7 行，是那个模块的私有 const。位置带来两件事：
 *
 * 1. **别的表认领不了副本 id**。切片3b 要给每座副本配一张遭遇表，而注册表的 `keyRef` 只能指向
 *    `content/` 里的表 —— 指向 `world/` 就是让数据层去依赖渲染层。
 * 2. **同一件事在第二处手抄**。`game/QuestSystem.js` 自己抄了一份三行的地下城路点表
 *    （`'ruin-crypt': { x: -190, z: 25, label: '灰白遗城' }`），坐标与名字都是副本表里已有的格子。
 *    表里挪一次门口，指路那一页不会跟着动，也没有任何一处会红。
 *
 * 顺带按普查删掉一个**没人读的字段**：`themeType` 写 5 处、读 0 处（读数
 * `.tmp-20260930/wb10s1-census.out` M1）。五座各声称自己的"母题敌人"是谁，而迷宫里实际出什么怪
 * 由 `MazeLayout` 写死的三元式决定 —— 那一格是许愿，不是数据。
 *
 * ## 用例分五层
 *
 * 1. **数据忠实**：新表逐格 = 搬动之前在役的那份 const（`git show 144a8f7:src/world/DungeonManager.js`），
 *    且 `themeType` 是**唯一**被删掉的格子。
 * 2. **死字段清零**：`themeType` 在 `src/` 的代码里出现 0 次，同一把尺子在旧表上量得到 5 次（反面证据）。
 * 3. **真读者**：副本的几何与门口物件真按表起 —— 逐座跑 `ProceduralDungeonGenerator.generate`，
 *    并把 `buildEntranceMarkers` / `buildExteriorShells` 接到假场景上量落点。
 * 4. **指路**：QuestSystem 给的地下城路点由表推导，逐格 = 切片3a 动手之前那份手抄三行；认不出就抛。
 * 5. **注册表接线**：kind 挂上了，且双向都验（真表零错、五类坏表各红各的那一条）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DUNGEON_DEFS, DUNGEON_IDS, dungeonDefOf } from '../src/content/dungeons.js';
import { CONTENT_TABLES, checkContent, checkDungeons, checkTable } from '../src/content/registry.js';
import { MAINLINE } from '../src/content/objectives.js';
import { DUNGEON_BOSS_LINES } from '../src/content/bossDialogue.js';
import { ProceduralDungeonGenerator } from '../src/world/ProceduralDungeonGenerator.js';
import { BOSS_SPAN } from '../src/world/dungeonDimensions.js';
import { DungeonManager } from '../src/world/DungeonManager.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { installWindowShim } from './helpers/enemyHarness.js';
import { t } from '../src/engine/i18n.js';

beforeAll(installWindowShim);

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
/** 源文件是 CRLF：不剥 `\r`，跨行正则的 `.` 会带着 `\r` 咬不合，"没扫到"就会伪装成"没有" */
const readSrc = (rel) => readFileSync(join(ROOT, 'src', rel), 'utf8').replace(/\r\n/g, '\n');
/** 剥注释保代码：本文件的缺席门禁扫的是"代码里还写不写这一格"，而说明文字里恰好抄着那个字段名 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * 切片3a 动手之前**在役**的那份 const，逐格抄自
 * `git show 144a8f7:src/world/DungeonManager.js`（核查脚本 `.tmp-20260930/wb10s3a-golden.mjs`：
 * 5 座逐格相等，差异只有 `themeType` 被删）。
 *
 * 这是冻结的 golden，不从 `DUNGEON_DEFS` 自己推 —— 拿被检对象当基线等于什么都没钉住。
 */
const OLD_DEFS = [
  {
    id: 'ruin-crypt',
    name: '灰白遗城',
    themeType: 'soldier',
    trial: true,
    stage: 0,
    mapLabel: '遗城',
    theme: 0x4a5048,
    accent: 0xc9a962,
    gridW: 6,
    gridH: 6,
    origin: { x: 5000, y: 120, z: 5000 },
    entrance: { x: -190, z: 25 },
    exterior: { x: -190, z: 25, label: '灰白遗城入口' },
  },
  {
    id: 'forbidden-library',
    name: '禁书图书馆',
    themeType: 'golem',
    trial: true,
    stage: 1,
    mapLabel: '图书馆',
    theme: 0x2a2040,
    accent: 0xaa66ff,
    gridW: 5,
    gridH: 6,
    origin: { x: 5000, y: 120, z: 6500 },
    entrance: { x: -35, z: -200 },
    exterior: { x: -35, z: -200, label: '图书馆侧门' },
  },
  {
    id: 'five-dim-rift',
    name: '五维裂隙',
    themeType: 'drone',
    trial: true,
    stage: 2,
    mapLabel: '裂隙',
    theme: 0x0a1830,
    accent: 0x66ccff,
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 8000 },
    entrance: { x: 175, z: 95 },
    exterior: { x: 175, z: 95, label: '裂隙观测站' },
  },
  {
    id: 'forest-shrine',
    name: '古树神龛',
    themeType: 'soldier',
    trial: false,
    stage: 1,
    mapLabel: '神龛',
    theme: 0x2a3828,
    accent: 0x88cc66,
    gridW: 4,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 9500 },
    entrance: { x: -230, z: -15 },
    exterior: { x: -230, z: -15, label: '神龛石门' },
  },
  {
    id: 'hub-catacombs',
    name: '枢纽地下墓穴',
    themeType: 'elite',
    trial: false,
    stage: 0,
    mapLabel: '墓穴',
    theme: 0x3a3530,
    accent: 0xffaa44,
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 80, z: 11000 },
    entrance: { x: 28, z: 72 },
    exterior: { x: 28, z: 72, label: '墓穴阶梯' },
  },
  {
    id: 'gloom-mist-crypt',
    name: '幽暗迷雾墓穴',
    themeType: 'wraith',
    trial: false,
    stage: 5,
    mapLabel: '迷雾墓穴',
    theme: 0x2a2a3a,
    accent: 0x6a6a8a,
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 12500 },
    entrance: { x: 200, z: 170 },
    exterior: { x: 200, z: 170, label: '迷雾墓穴入口' },
  },
  {
    id: 'radiant-dawn-hall',
    name: '晨曦圣殿',
    themeType: 'crawler',
    trial: false,
    stage: 6,
    mapLabel: '晨曦圣殿',
    theme: 0xfff8d0,
    accent: 0xffcc00,
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 14000 },
    entrance: { x: -180, z: -95 },
    exterior: { x: -180, z: -95, label: '晨曦圣殿大门' },
  },
];

/**
 * 切片3a 动手之前 `game/QuestSystem.js` 里那份手抄的三行地下城路点，逐格抄自
 * `git show 144a8f7:src/game/QuestSystem.js`（核查脚本 `.tmp-20260930/wb10s3a-waypoints.mjs`）。
 * 现在这三个值都由副本表推导，这一份留着就是为了钉住"推导出来的和抄的一样"。
 */
const OLD_WAYPOINTS = {
  'ruin-crypt': { x: -190, z: 25, label: '灰白遗城' },
  'forbidden-library': { x: -35, z: -200, label: '禁书图书馆' },
  'five-dim-rift': { x: 175, z: 95, label: '五维裂隙' },
};

/**
 * 切片3c 起，允许新表比这份 golden **多出来**的格子只有这三格 —— 且每一格都在
 * 下面那条用例里点名了自己的读者（`trial` → 飞升门/指路/开局点亮/助手清单，
 * `mapLabel` → 世界地图的那个字，`stage` → 敌人成长档位）。
 * 豁免不是空白放行：多一格又没人读，就是下一个 `themeType`。
 */
const 新增格 = ['trial', 'mapLabel', 'stage'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}
const FILES = walk(SRC);

describe('① 数据忠实：新表逐格 = 搬动之前在役的那份 const', () => {
  it('五座、同序、同 id（顺序就是载入顺序，UI 列表按它排）', () => {
    expect(DUNGEON_DEFS).toHaveLength(OLD_DEFS.length);
    expect(DUNGEON_DEFS.map((d) => d.id)).toEqual(OLD_DEFS.map((d) => d.id));
    expect(DUNGEON_IDS).toEqual(DUNGEON_DEFS.map((d) => d.id));
  });

  it('除 `themeType` 之外逐格相等，且被删掉的只有那一格', () => {
    const 差 = [];
    OLD_DEFS.forEach((旧, i) => {
      const 新 = DUNGEON_DEFS[i];
      const 旧键 = Object.keys(旧);
      const 新键 = Object.keys(新);
      for (const k of 旧键) {
        if (k === 'themeType') continue;
        // W-D2 切片16v：name / mapLabel / exterior.label 三格存的是**文案键** ——
        // 旧抄本记的是"它叫什么"（中文），所以要比**展开后**的那一句，而不是键本身。
        if (k === 'name' || k === 'mapLabel' || k === 'exterior') {
          const 旧值 = k === 'exterior' ? 旧[k].label : 旧[k];
          const 新值 = k === 'exterior' ? 新[k]?.label : 新[k];
          if (t(新值) !== 旧值) 差.push(`${旧.id}.${k}: 旧 "${旧值}" ≠ 新 "${t(新值)}"`);
          continue;
        }
        const a = JSON.stringify(旧[k]);
        const b = JSON.stringify(新[k]);
        if (a !== b) 差.push(`${旧.id}.${k}: 旧 ${a} ≠ 新 ${b}`);
      }
      const 多 = 新键.filter((k) => !旧键.includes(k) && !新增格.includes(k));
      if (多.length) 差.push(`${旧.id} 多出格子：${多.join('、')}`);
      const 少 = 旧键.filter((k) => k !== 'themeType' && !新键.includes(k));
      if (少.length) 差.push(`${旧.id} 少了格子：${少.join('、')}`);
    });
    expect(差, `搬动搬坏了：\n  ${差.join('\n  ')}`).toEqual([]);
    // 反面证据：旧表确实写了 7 格 themeType（原 5 座 + W-B9 新增 2 座），而新表一格都没有 —— "删掉了"不是"从来没写过"
    expect(OLD_DEFS.filter((r) => 'themeType' in r)).toHaveLength(7);
    expect(DUNGEON_DEFS.filter((r) => 'themeType' in r)).toEqual([]);
    // 反面证据：新表每行都有 trial / stage / mapLabel
    expect(DUNGEON_DEFS.filter((r) => 'trial' in r)).toHaveLength(7);
    expect(DUNGEON_DEFS.filter((r) => 'stage' in r)).toHaveLength(7);
    expect(DUNGEON_DEFS.filter((r) => 'mapLabel' in r)).toHaveLength(7);
  });

  it('切片3c 新增的三格都在，且**只有**这三格是新的', () => {
    // 这一条把上面那个例外清单钉成"有名字、有理由、有归属"的三条陈述：
    // 豁免不是一条 `continue`，而是一格必须有读者、有声明、有对账 —— 否则它就长成下一个 `themeType`。
    for (const d of DUNGEON_DEFS) {
      expect(typeof d.trial, `${d.id} 的 trial 不是显式布尔`).toBe('boolean');
      expect(typeof d.mapLabel, `${d.id} 没有 mapLabel`).toBe('string');
      expect(d.mapLabel.length, `${d.id} 的 mapLabel 是空的`).toBeGreaterThan(0);
      expect(Number.isInteger(d.stage), `${d.id} 的 stage 不是整数`).toBe(true);
      expect(d.stage).toBeGreaterThanOrEqual(0);
    }
    // `trial` 恰好是主线那三座（这一份是冻结的历史读数：切片3c 动手之前四个抄本都是这三枚 id）
    expect(DUNGEON_DEFS.filter((d) => d.trial).map((d) => d.id))
      .toEqual(['ruin-crypt', 'forbidden-library', 'five-dim-rift']);
    // 两个读者各认领一格：地图上的点读 `mapLabel`，飞升门读 `trial` 推导出的那份清单
    expect(readSrc('ui/WorldMapPanel.js')).toContain('d.mapLabel');
    expect(readSrc('content/objectives.js')).toContain('TRIAL_DUNGEON_IDS');
  });
});

describe('② 死字段清零：读 0 处的格子真的不再被写', () => {
  /** 同一把尺子：扫代码（剥注释）里的 `themeType:` 赋值 */
  const 数themeType = (text) => (stripComments(text).match(/\bthemeType\s*:/g) ?? []).length;

  it('`src/` 全树 0 处', () => {
    const 命中 = [];
    for (const f of FILES) {
      const n = 数themeType(readFileSync(f, 'utf8'));
      if (n) 命中.push(`${relative(SRC, f).replaceAll('\\', '/')}:${n}`);
    }
    expect(命中, `这些文件还在写 themeType：${命中.join('、')}`).toEqual([]);
  });

  it('反面证据：这把尺子在旧表上量得到 7 次（扫到 0 不是因为尺子坏了）', () => {
    const 旧源码 = `const DUNGEON_DEFS = [\n${OLD_DEFS.map((r) => `  { id: '${r.id}', themeType: '${r.themeType}' },`).join('\n')}\n];`;
    expect(数themeType(旧源码)).toBe(7);
    // 注释里提到字段名不算命中 —— 本文件的说明文字里就写着它
    expect(数themeType('/* themeType 是死字段 */ const a = 1;\n// themeType: 旧值')).toBe(0);
  });

  it('扫描集自证：真的扫到了当前源码树（空集就会一路绿灯）', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(180);
    const 相对 = FILES.map((f) => relative(SRC, f).replaceAll('\\', '/'));
    for (const probe of ['content/dungeons.js', 'world/DungeonManager.js', 'game/QuestSystem.js']) {
      expect(相对, `扫描集里没有 ${probe}`).toContain(probe);
    }
  });
});

describe('③ 真读者：几何与门口物件都按表起', () => {
  it('逐座跑生成器：迷宫规模、母题配色、名字都得名册说了算', () => {
    for (const def of DUNGEON_DEFS) {
      for (const seed of [1, 999]) {
        const layout = ProceduralDungeonGenerator.generate(def, seed);
        expect(layout.gridW, `${def.id} 的宽度`).toBe(def.gridW);
        expect(layout.gridH, `${def.id} 的高度`).toBe(def.gridH);
        // 一间房 ≠ 一格了（切片5d）：Boss 场把 `BOSS_SPAN × BOSS_SPAN` 格并成一间，
        // 块内另外三格连同它们的怪与文献一起从名单里退出 —— 所以房间数是格数减那个跨距，
        // 这一枚减数由 `BOSS_SPAN` 说话，不写 25/36 这种按座数各抄一份的死数。
        expect(layout.rooms, `${def.id} 的房间数（${def.gridW}×${def.gridH} 格里有一块 ${BOSS_SPAN}×${BOSS_SPAN} 的场）`)
          .toHaveLength(def.gridW * def.gridH - (BOSS_SPAN * BOSS_SPAN - 1));
        expect(layout.theme, `${def.id} 的母题色`).toBe(def.theme);
        expect(layout.accent, `${def.id} 的点缀色`).toBe(def.accent);
        expect(layout.name, `${def.id} 的名字（HUD 与过场都显示它）`).toBe(def.name);
      }
    }
  });

  it('`buildEntranceMarkers` 立的红环正好在表里的 entrance 上', () => {
    const added = [];
    const 假 = {
      scene: { add: (o) => added.push(o) },
      world: { getGroundHeight: () => 7 },
      exteriorGroup: { add: () => {} },
    };
    DungeonManager.prototype.buildEntranceMarkers.call(假);
    expect(added, '一个入口标记都没立（假场景没接上）').toHaveLength(DUNGEON_DEFS.length);
    added.forEach((g, i) => {
      const def = DUNGEON_DEFS[i];
      expect([g.position.x, g.position.z], `${def.id} 的入口环不在 entrance 上`)
        .toEqual([def.entrance.x, def.entrance.z]);
      expect(g.position.y, `${def.id} 的环没贴地`).toBe(7);
    });
  });

  it('`buildExteriorShells` 立的壳在 exterior 上，且带着副本 id（交互要点它认领）', () => {
    const shells = [];
    const 假 = {
      scene: { add: () => {} },
      world: { getGroundHeight: () => 3 },
      exteriorGroup: { add: (o) => shells.push(o) },
    };
    DungeonManager.prototype.buildExteriorShells.call(假);
    expect(shells).toHaveLength(DUNGEON_DEFS.length);
    shells.forEach((g, i) => {
      const def = DUNGEON_DEFS[i];
      expect([g.position.x, g.position.z], `${def.id} 的外壳不在 exterior 上`)
        .toEqual([def.exterior.x, def.exterior.z]);
      expect(g.userData.dungeonId).toBe(def.id);
    });
  });

  it('五座互不相同：配色、点缀、名字、门口牌子（撞了就是界面上少一座副本）', () => {
    for (const 字段 of ['theme', 'accent']) {
      expect(new Set(DUNGEON_DEFS.map((d) => d[字段])).size).toBe(DUNGEON_DEFS.length);
    }
    for (const 字段 of ['name', 'exterior.label']) {
      const 取 = (d) => (字段.includes('.') ? d[字段.split('.')[0]][字段.split('.')[1]] : d[字段]);
      expect(new Set(DUNGEON_DEFS.map(取)).size, `${字段} 有两座撞了`).toBe(DUNGEON_DEFS.length);
    }
  });
});

describe('④ 指路：路点由表推导，认不出就抛', () => {
  const 副本步 = MAINLINE.filter((r) => r.type === 'dungeon');

  it('主线指的三座 == 切片3a 之前那份手抄三行，逐格', () => {
    expect(副本步.map((r) => r.dungeonId).sort()).toEqual(Object.keys(OLD_WAYPOINTS).sort());
    for (const row of 副本步) {
      const def = dungeonDefOf(row.dungeonId);
      // QuestSystem 的路点是 `{ entrance.x, entrance.z, name }`（与旧抄本同一形状同一值）
      expect([def.entrance.x, def.entrance.z, t(def.name)], `${row.id} 指的入口与旧抄本对不上`)
        .toEqual([OLD_WAYPOINTS[row.dungeonId].x, OLD_WAYPOINTS[row.dungeonId].z, OLD_WAYPOINTS[row.dungeonId].label]);
    }
  });

  it('当前步是副本任务时，`getQuestWaypoint` 真的指向那座副本的门口', () => {
    const dialog = { toast() {}, play() {} };
    for (const row of 副本步) {
      const probe = new QuestSystem(dialog);
      probe.questIndex = MAINLINE.indexOf(row);
      const wp = probe.getQuestWaypoint();
      expect(wp, `${row.id} 这一 step 没有路点`).toBeTruthy();
      expect([wp.x, wp.z, t(wp.label)], `${row.id} 指错了入口`)
        .toEqual([OLD_WAYPOINTS[row.dungeonId].x, OLD_WAYPOINTS[row.dungeonId].z, OLD_WAYPOINTS[row.dungeonId].label]);
      // 清完这座就不该再指它（判据读的是同一张表的 id）
      probe.stats.dungeonsCleared.add(row.dungeonId);
      const 清完 = probe.getQuestWaypoint();
      expect([清完.x, 清完.z], `${row.id} 清完了还在指老地方`)
        .not.toEqual([OLD_WAYPOINTS[row.dungeonId].x, OLD_WAYPOINTS[row.dungeonId].z]);
    }
  });

  it('三界试炼那一步逐座指未清的副本，顺序就是表的顺序', () => {
    const probe = new QuestSystem({ toast() {}, play() {} });
    probe.questIndex = MAINLINE.findIndex((r) => r.condition === 'checkAllDungeons');
    expect(probe.current.condition).toBe('checkAllDungeons');
    probe.stats.boss3Defeated = true;
    const 指的 = [];
    for (const id of DUNGEON_IDS.filter((x) => OLD_WAYPOINTS[x])) {
      指的.push(probe.getQuestWaypoint());
      probe.stats.dungeonsCleared.add(id);
    }
    expect(指的.map((w) => t(w.label))).toEqual(['灰白遗城', '禁书图书馆', '五维裂隙']);
    for (const [w, id] of 指的.map((w, i) => [w, DUNGEON_IDS.filter((x) => OLD_WAYPOINTS[x])[i]])) {
      expect([w.x, w.z], `${id} 指错了入口坐标`).toEqual([OLD_WAYPOINTS[id].x, OLD_WAYPOINTS[id].z]);
      expect(w.hint, `${id} 的提示不该是别的事`).toBe('清空地下城');
    }
    const 全清 = probe.getQuestWaypoint();
    expect(全清.hint).toContain('三界试炼完成后');
  });

  it('认不出的副本 id 当场抛，不静默落到别座', () => {
    expect(() => dungeonDefOf('ruin-crypts')).toThrow(/副本表里没有/);
    expect(() => dungeonDefOf('')).toThrow(/副本表里没有/);
    expect(() => dungeonDefOf('遗城')).toThrow(/可用：ruin-crypt/);
    expect(t(dungeonDefOf('hub-catacombs').name)).toBe('枢纽地下墓穴');
  });

  it('QuestSystem 里那份手抄地下城路点表没了，改为现问副本表', () => {
    const 源码 = stripComments(readSrc('game/QuestSystem.js'));
    expect(源码, 'DUNGEON_WAYPOINTS 那份手抄表又回来了').not.toMatch(/\bDUNGEON_WAYPOINTS\b/);
    expect(源码).toMatch(/dungeonDefOf\(/);
    expect(readSrc('game/QuestSystem.js')).toContain("from '../content/dungeons.js'");
    // 反面证据：这三行坐标在剥注释后的 QuestSystem 里只可能来自表，不该再以字面量出现
    const 抄回 = Object.values(OLD_WAYPOINTS)
      .filter((w) => new RegExp(`x:\\s*${w.x},\\s*z:\\s*${w.z}`).test(源码))
      .map((w) => w.label);
    expect(抄回, `这些入口坐标又被手抄了一遍：${抄回.join('、')}`).toEqual([]);
  });

  it('DungeonManager 不再自带那份 const，改为读 `content/dungeons.js`', () => {
    const 源码 = stripComments(readSrc('world/DungeonManager.js'));
    expect(源码, '副本表又变成模块私有的了').not.toMatch(/^\s*(?:export )?const DUNGEON_DEFS\s*=\s*\[/m);
    expect(readSrc('world/DungeonManager.js')).toContain("import { DUNGEON_DEFS } from '../content/dungeons.js'");
    expect(源码.match(/for \(const def of DUNGEON_DEFS\)/g).length, '三个读取口少了一个').toBeGreaterThanOrEqual(3);
  });
});

describe('⑤ 注册表接线：kind 挂上了，且双向都验', () => {
  const entry = CONTENT_TABLES.find((t) => t.kind === 'dungeons');

  it('dungeons 在 CONTENT_TABLES 里，且检的就是 `DUNGEON_DEFS` 这一个对象（不是副本）', () => {
    expect(entry, '副本表没进注册表 —— 开机断链那一格又空了').toBeTruthy();
    expect(entry.shape).toBe('rows');
    expect(entry.table).toBe(DUNGEON_DEFS);
    expect(entry.invariant).toBe(checkDungeons);
  });

  it('真表零错误（`assertContent()` 在加载期已经断过一次，这里是可读的复证）', () => {
    expect(checkContent()).toEqual([]);
    expect(checkDungeons(DUNGEON_DEFS)).toEqual([]);
  });

  it('五张改坏的表各红各的那一条；改回来的合法表零错', () => {
    const 坏 = {
      配色撞车: (r) => r.map((d, i) => (i === 4 ? { ...d, theme: r[0].theme } : d)),
      名字撞车: (r) => r.map((d, i) => (i === 4 ? { ...d, name: r[0].name } : d)),
      牌子撞车: (r) => r.map((d, i) => (i === 4 ? { ...d, exterior: { ...d.exterior, label: r[0].exterior.label } } : d)),
      门口分家: (r) => r.map((d, i) => (i === 2 ? { ...d, entrance: { ...d.entrance, x: d.entrance.x + 5 } } : d)),
      规模写零: (r) => r.map((d, i) => (i === 0 ? { ...d, gridW: 0 } : d)),
    };
    const 咬得住 = {
      配色撞车: /theme.*撞了/,
      名字撞车: /name.*撞了/,
      牌子撞车: /exterior\.label.*撞了/,
      门口分家: /entrance .* 与 exterior .* 不同点/,
      规模写零: /gridW.*至少 3/,
    };
    for (const [name, mutate] of Object.entries(坏)) {
      const tables = CONTENT_TABLES.map((t) => (t.kind === 'dungeons' ? { ...t, table: mutate(DUNGEON_DEFS) } : t));
      const errs = checkContent(tables).join('\n');
      expect(errs, `「${name}」这张坏表没被咬住（引擎在空转）`).toMatch(咬得住[name]);
    }
    // 合法侧的同形改动：只挪一座的入口（entrance 跟着 exterior 一起挪），必须零错
    const 合法 = CONTENT_TABLES.map((t) => (t.kind === 'dungeons'
      ? { ...t, table: DUNGEON_DEFS.map((d, i) => (i === 0
        ? { ...d, entrance: { x: -180, z: 30 }, exterior: { x: -180, z: 30, label: d.exterior.label } }
        : d)) }
      : t));
    expect(checkContent(合法), '合法改动也报错 = 校验器在乱咬').toEqual([]);
  });

  it('副本 id 现在能被别的表认领：台词表的键与任务行的 `dungeonId` 都指向这张表', () => {
    const 台词 = CONTENT_TABLES.find((t) => t.kind === 'dungeonBossLines');
    expect(台词.keyRef).toEqual({ of: 'dungeons' });
    const 坏台词 = CONTENT_TABLES.map((t) => (t.kind === 'dungeonBossLines'
      ? { ...t, table: { ...DUNGEON_BOSS_LINES, 'ruin-cryt': DUNGEON_BOSS_LINES['ruin-crypt'] } }
      : t));
    expect(checkContent(坏台词).join('\n'), '键写漏一个字母的副本台词没被咬住').toMatch(/不在 dungeons 里/);

    const 任务 = CONTENT_TABLES.find((t) => t.kind === 'objectives');
    expect(任务.row.dungeonId).toEqual({ t: 'ref', of: 'dungeons', required: false });
    const 野id = CONTENT_TABLES.map((t) => (t.kind === 'objectives'
      ? { ...t, table: t.table.map((r) => (r.type === 'dungeon' ? { ...r, dungeonId: 'no-such-dungeon' } : r)) }
      : t));
    expect(checkContent(野id).join('\n'), '任务指到一座不存在的副本却没红').toMatch(/no-such-dungeon.*不在 dungeons 里/);
    const 缺格 = CONTENT_TABLES.map((t) => (t.kind === 'objectives'
      ? { ...t, table: t.table.map((r) => (r.type === 'dungeon' ? { ...r, dungeonId: undefined } : r)) }
      : t));
    expect(checkContent(缺格).join('\n'), 'type 是 dungeon 却没写 dungeonId，注册表不该说话').toMatch(/type 是 dungeon 却没写 dungeonId/);
  });

  it('单独调 `checkTable` 也认得副本表 —— `ref` 是字段的属性，不是调用方的礼节', () => {
    // 切片3a 给任务行加了 `dungeonId: { t: 'ref', of: 'dungeons' }`。这一支原来会踩空：
    // `TYPES.ref` 直接读 `ctx.ids`，不带 ctx 的调用当场 TypeError —— "这张表断没断链"
    // 取决于调用方记得传什么。`tests/mainline-table.test.js` 那条走的就是这一支。
    const 任务 = CONTENT_TABLES.find((t) => t.kind === 'objectives');
    expect(checkTable(任务), '不带 ctx 调 checkTable，真表就该零错').toEqual([]);
    const 野 = 任务.table.map((r) => (r.type === 'dungeon' ? { ...r, dungeonId: 'no-such-dungeon' } : r));
    expect(() => checkTable({ ...任务, table: 野 })).not.toThrow();
    expect(checkTable({ ...任务, table: 野 }).join('\n'), '断链没被单独一次调用查出来').toMatch(/不在 dungeons 里/);
  });

  it('不变式直调也说同一套话（注册表接线不是唯一入口）', () => {    const 两座撞色 = [
      { id: 'a', name: 'A', theme: 1, accent: 2, gridW: 5, gridH: 5, origin: { x: 0, y: 0, z: 0 }, entrance: { x: 1, z: 1 }, exterior: { x: 1, z: 1, label: 'A门' } },
      { id: 'b', name: 'B', theme: 1, accent: 3, gridW: 5, gridH: 5, origin: { x: 0, y: 0, z: 0 }, entrance: { x: 2, z: 2 }, exterior: { x: 2, z: 2, label: 'B门' } },
    ];
    expect(checkDungeons(两座撞色).join('\n')).toMatch(/theme.*撞了/);
    expect(checkDungeons([]), '空表不该说话').toEqual([]);
  });
});
