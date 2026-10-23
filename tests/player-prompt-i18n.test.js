/**
 * PlayerController 交互提示 / 提示 toast 双表化（W-D2 切片22）。
 *
 * ## 为什么要有这道门禁
 *
 * 切片19/20/21 收掉了 POI 的标签与对话，但玩家眼前**最常亮的那一行** ——
 * `PlayerController.updatePrompt` 的交互提示 —— 还有 8 个分支是裸中文：
 * 英文玩家走到宝箱前看到「[E] 开启宝箱」、走到营火前看到「[E] 休息 / 升级」，
 * 进副本看到「[E] 击败守钥者后离开 · Boss 二阶段留意」。同文件另有三处
 * toast（视角切换两条、边界提示一条、破碎时线一条）与一枚 `keyText` 模板
 * 也是裸中文。
 *
 * 与之前几片的差别：这些出口**不在世界里，在玩家控制器里**，且每帧都会重算
 * （`updatePrompt` 每帧调一次），所以行为腿必须真造一个 `this` 去逐场景重放，
 * 不能只扫源码。
 *
 * 腿：
 * 1. 静态腿：整个文件不许再出现含中文的字符串字面量（注释与中文标识符不算）。
 * 2. 钉文案腿：14 个新键的中英原值逐字钉死。
 * 3. 行为腿：切中/切英，13 个场景（副本五支 / 营火两支 / NPC / 宝箱 /
 *    副本入口 / POI / 边界提示 / 视角切换两条 toast）逐个重放，输出必须等于
 *    钉死文案按参数展开后的样子。
 * 4. 新键不孤儿：14 个新键都在本文件里被引用。
 * 5. 键数腿：14 个新键的文案在两表里最多各两个键。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PlayerController } from '../src/player/PlayerController.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { setLanguage, t } from '../src/engine/i18n.js';
import { keyText } from '../src/content/keyHints.js';

const SRC = 'src/player/PlayerController.js';
const 源码 = readFileSync(join(process.cwd(), SRC), 'utf8');

/** 本片新建的 14 个键 → [中文原值, 英文原值]（改文案必须来改这里） */
const PIN = {
  prompt_dungeon_read_fmt: ['${interact} 阅读 — ${title}', '${interact} Read — ${title}'],
  prompt_dungeon_boss_leave: ['${interact} 击败守钥者后离开 · Boss 二阶段留意', '${interact} Defeat the keywarden to leave · Watch for the Boss phase two'],
  prompt_dungeon_room_enemies_fmt: ['${interact} 出口离开 · 本房 ${enemies} 敌 · 清空后门开', '${interact} Leave by the exit · ${enemies} enemies in this room · the door opens once cleared'],
  prompt_dungeon_leave_fmt: ['${interact} 离开 ${name}', '${interact} Leave ${name}'],
  prompt_dungeon_explore_fmt: ['探索 ${visited}/${total} 房 · 找出口环 · ${interact} 出口处离开', 'Explored ${visited}/${total} rooms · find the exit ring · ${interact} at the exit to leave'],
  prompt_rest_npc_fmt: ['${interact} 与 ${npc} 交谈 · 休息 — ${rest}', '${interact} Talk with ${npc} · Rest — ${rest}'],
  prompt_rest_plain_fmt: ['${interact} 休息 / 升级 — ${rest}', '${interact} Rest / Upgrade — ${rest}'],
  prompt_npc_talk_fmt: ['${interact} 对话 — ${name}', '${interact} Talk — ${name}'],
  prompt_chest_open: ['${interact} 开启宝箱', '${interact} Open chest'],
  toast_camera_swap: ['({cameraMode} 切换)', '({cameraMode} to switch)'],
  toast_camera_first_fmt: ['第一人称视角 ${swap}', 'First-person view ${swap}'],
  toast_camera_third_fmt: ['第三人称越肩 ${swap}', 'Third-person over-the-shoulder ${swap}'],
  toast_void_boundary: ['位面裂隙之外尚无世界 — 折返吧', 'There is no world beyond the plane rift — turn back'],
  toast_broken_timeline: ['⟲ 破碎时线：重力反转 — 行走于时环之下', '⟲ Broken timeline: gravity inverted — walking beneath the time ring'],
};
const NEW_KEYS = Object.keys(PIN);

/** 与 `engine/i18n.js` 的 interpolate 同一条式子：模板里的 `${name}` 按名替换 */
const 展开 = (模板, 参数) => 模板.replace(/\$\{(\w+)\}/g, (_, k) => 参数[k] ?? '');

const 含汉 = /[\u4e00-\u9fff]/;
const 串字面量 = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

/** 扫一份源码里的中文串字面量（注释行与中文标识符都不算） */
function 扫中文串字面量(源码) {
  const 违例 = [];
  源码.split('\n').forEach((line, i) => {
    const 行 = line.trim();
    if (行.startsWith('//') || 行.startsWith('*') || 行.startsWith('/*')) return;
    for (const m of line.matchAll(串字面量)) {
      const 串 = m[1] ?? m[2] ?? m[3] ?? '';
      if (含汉.test(串)) 违例.push((i + 1) + ': ' + 串.slice(0, 60));
    }
  });
  return 违例;
}

/** 造一个只够 updatePrompt / toggleCameraMode / hintBoundary 用的假 this */
function 造玩家(景) {
  return {
    position: { x: 0, y: 0, z: 0 },
    interactRadius: 3,
    mesh: { visible: true },
    fpWeaponGroup: null,
    rig: { setBaseFov() {} },
    shake: { setProfile() {} },
    targetPitch: 0,
    currentCameraPos: { set() {} },
    cameraMode: 'third',
    game: {
      dialog: { toast: (s) => 景.toasts.push(s) },
      restPoints: { getNearest: () => 景.rest ?? null },
      npcs: { getNearest: () => 景.npc ?? null },
      collectibles: { tryOpen: () => 景.chest ?? null },
      dungeons: 景.dungeons ?? null,
      restNpcs: { getByRestId: () => 景.restNpc ?? null },
      audio: {},
    },
    world: {
      getNearestPointOfInterest: () => 景.poi ?? null,
      bounds: 景.bounds ?? null,
    },
  };
}

const 副本 = (over) => Object.assign({
  active: { def: { name: 'dungeon_hub_catacombs_name' }, layout: {} },
  currentRoomId: 'r1',
  getEntranceNear: () => null,
}, over);

/** 13 个场景：名字 → { 造景, 期望键, 参数 }；toast 类景走 期望 toast 键 */
const 场景 = [
  ['副本-读碑', () => ({ dungeons: 副本({ getExplorationHint: () => ({ name: t('dungeon_hub_catacombs_name') }), getNearbyLore: () => ({ title: 'codex_anchor_title' }) }) }), 'prompt_dungeon_read_fmt', () => ({ title: t('codex_anchor_title') })],
  ['副本-Boss房', () => ({ dungeons: 副本({ getExplorationHint: () => ({ name: t('dungeon_hub_catacombs_name'), bossAlive: true }), getNearbyLore: () => null }) }), 'prompt_dungeon_boss_leave', () => ({})],
  ['副本-有敌房', () => ({ dungeons: 副本({ getExplorationHint: () => ({ name: t('dungeon_hub_catacombs_name'), enemies: 4 }), getNearbyLore: () => null }) }), 'prompt_dungeon_room_enemies_fmt', () => ({ enemies: 4 })],
  ['副本-出口房', () => ({ dungeons: 副本({ getExplorationHint: () => ({ name: t('dungeon_hub_catacombs_name'), isExit: true }), getNearbyLore: () => null }) }), 'prompt_dungeon_leave_fmt', () => ({ name: t('dungeon_hub_catacombs_name') })],
  ['副本-普通房', () => ({ dungeons: 副本({ getExplorationHint: () => ({ name: t('dungeon_hub_catacombs_name'), visited: 3, total: 8 }), getNearbyLore: () => null }) }), 'prompt_dungeon_explore_fmt', () => ({ visited: 3, total: 8 })],
  // W-D2 切片25：`restNpc.name` 是文案键（`content/restNpcDefs.js`），不再是显示名
  ['营火-有NPC', () => ({ rest: { id: 'hub', name: '世界之锚休息点' }, restNpc: { name: 'rest_npc_hub_name' } }), 'prompt_rest_npc_fmt', () => ({ npc: t('rest_npc_hub_name'), rest: '世界之锚休息点' })],
  ['营火-无NPC', () => ({ rest: { id: 'hub', name: '世界之锚休息点' } }), 'prompt_rest_plain_fmt', () => ({ rest: '世界之锚休息点' })],
  // W-D2 切片25：`npc.name` 也是文案键（`world/NPCManager.js` 的 NPC_DATA）
  ['NPC', () => ({ npc: { name: 'wp_label_wanderer' } }), 'prompt_npc_talk_fmt', () => ({ name: t('wp_label_wanderer') })],
  ['宝箱', () => ({ chest: { id: 'c1' } }), 'prompt_chest_open', () => ({})],
  ['副本入口', () => ({ dungeons: { active: null, getEntranceNear: () => ({ def: { name: 'dungeon_hub_catacombs_name' } }) } }), 'dungeon_enter_prompt_fmt', () => ({ name: t('dungeon_hub_catacombs_name') })],
  ['POI', () => ({ poi: { id: 'hub-anchor', label: 'wp_label_anchor' } }), null, () => ({})],
  ['边界提示', () => ({ bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, position: { x: 2, y: 0, z: 2 } }), 'toast_void_boundary', () => ({})],
];

describe('PlayerController 交互提示/提示 toast 双表化（W-D2 切片22）', () => {
  it('静态腿：整个文件不许再出现含中文的字符串字面量', () => {
    expect(扫中文串字面量(源码), '这些字面量还是裸中文').toEqual([]);
  });

  it('静态腿反向控制：人造源码必须被点名（防扫描恒绿）', () => {
    const 人造 = [
      "const a = '开启宝箱';",
      'const b = `与 ${x} 交谈`;',
      "const c = t('prompt_chest_open', { interact });",
      "// 这是一行中文注释",
      '/* 块注释也是中文 */',
      'const 右手 = boneOf(GRIP.骨标签);',
    ].join('\n');
    expect(扫中文串字面量(人造)).toEqual(["1: 开启宝箱", '2: 与 ${x} 交谈']);
  });

  it('钉文案腿：14 个新键的中英原值逐字钉死', () => {
    for (const [键, [中, 英]] of Object.entries(PIN)) {
      expect(STRINGS_ZH[键], `中文表里没有 ${键}`).toBe(中);
      expect(STRINGS_EN[键], `英文表里没有 ${键}`).toBe(英);
    }
    expect(NEW_KEYS.length, '新键数对不上 —— 切片范围变了？').toBe(14);
  });

  it('行为腿：切中/切英逐个场景重放，提示必须是钉死文案的展开句', () => {
    for (const [名字, 造景, 键, 造参数] of 场景) {
      for (const lang of ['zh', 'en']) {
        setLanguage(lang);
        const 景 = 造景();
        景.toasts = [];
        const self = 造玩家(景);
        const prompt = { classList: { add() {}, remove() {} }, textContent: '' };
        if (名字 === '边界提示') {
          PlayerController.prototype.hintBoundary.call(self, 0);
        } else {
          PlayerController.prototype.updatePrompt.call(self, prompt);
        }
        if (名字 === '边界提示') {
          const 期望 = 展开(PIN[键][lang === 'zh' ? 0 : 1], 造参数(lang));
          expect(景.toasts, `${名字}(${lang})`).toEqual([期望]);
          continue;
        }
        if (键 === null) {
          // POI 那一支在切片19 已迁，这里只要求它不出现 [MISSING:]
          expect(prompt.textContent, `${名字}(${lang})`).not.toContain('[MISSING:');
          continue;
        }
        const 表 = lang === 'zh' ? STRINGS_ZH : STRINGS_EN;
        const 期望 = 展开(表[键], Object.assign({ interact: '[E]' }, 造参数(lang)));
        expect(prompt.textContent, `${名字}(${lang})`).toBe(期望);
      }
    }
  });

  it('行为腿：视角切换两条 toast 也走双表', () => {
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      const 景 = { toasts: [] };
      const self = 造玩家(景);
      PlayerController.prototype.toggleCameraMode.call(self);
      PlayerController.prototype.toggleCameraMode.call(self);
      const 格 = lang === 'zh' ? 0 : 1;
      const swap = keyText(t('toast_camera_swap'));
      expect(景.toasts[0], `${lang} 切第一人称`).toBe(展开(PIN.toast_camera_first_fmt[格], { swap }));
      expect(景.toasts[1], `${lang} 切第三人称`).toBe(展开(PIN.toast_camera_third_fmt[格], { swap }));
    }
  });

  it('新键不孤儿：14 个新键都在 PlayerController.js 里被引用', () => {
    const 没人用 = NEW_KEYS.filter((k) => !源码.includes("'" + k + "'"));
    expect(没人用, '这些新键建了却没人引用（死键）').toEqual([]);
  });

  it('键数腿：14 个新键的文案在两表里最多两个键', () => {
    for (const [名, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      const 计数 = new Map();
      for (const v of Object.values(table)) 计数.set(v, (计数.get(v) ?? 0) + 1);
      for (const 键 of NEW_KEYS) {
        expect(计数.get(table[键]) ?? 0, `${名} 表里 "${键}" 的文案出现了 ${计数.get(table[键])} 次`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('反向控制：不在表里的假键必须被点名（防钉文案腿恒绿）', () => {
    const 假 = ['prompt_根本不存在_xyz', 'toast_也不存在_abc'];
    const 缺 = 假.filter((k) => STRINGS_ZH[k] === undefined || STRINGS_EN[k] === undefined);
    expect(缺).toEqual(假);
  });
});