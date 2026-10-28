/**
 * 每座副本都得有自己的那两句 —— 守钥者开场白与进入语的**覆盖率**门禁（W-E3 切片28）。
 *
 * ## 这一片查的是哪件事
 *
 * `content/dungeons.js` 的名册长到九座，而 `game/LoreFragments.js` 的 `BOSS_LORE` 与
 * `DUNGEON_ENTER_LINES` 停在五座。剩下四座（幽暗迷雾墓穴 / 晨曦圣殿 / 断时之匣 / 深渊之颚）
 * 走进 `DungeonManager` 的两条兜底：
 * - Boss 开场 ⇒ 通用名「迷宫守钥者」+ 通用正文「击败守钥者以打开出口。」；
 * - 进入语 ⇒ **空串**（对话框只剩那行迷宫统计）。
 * 两条都不抛、不红、不写字面量缺失 —— 而同四座副本的 `intro/p2/p3/defeat` 四句台词
 * 早就逐座配好了，于是玩家在一场战斗里听见特写、却在看开场时听见通用句。
 *
 * 已有的两张网为什么没接住：`tests/narrative-i18n-keys.test.js` 遍历的是
 * `Object.entries(BOSS_LORE)` —— **登记了什么**，不是**该登记的有没有登记**；
 * `tests/cg-dungeon-fallback-i18n.test.js` ④ 甚至把"四座走兜底"当成了读数钉住。
 * 缺的是从名册出发的那一方向。
 *
 * ## 三条判据的形状
 *
 * 1. **双向对齐**：名册里每一座都要有 lore 与进入语；表里也不许坐着名册没有的 id
 *    （与切片27 拼键名册同一条纪律 —— 只核一个方向，另一方向就成了幽灵行）。
 * 2. **逐座互不相同，且不等于通用兜底句**：把兜底句抄进自己的格子里，覆盖率是满了，
 *    玩家听到的还是那一句。
 * 3. **阶段台词不许复述开场句**：同一座的 `p2/p3/defeat` 与 `intro` 若有一段逐字相同，
 *    玩家在一场战斗里会听见同一句话说两遍（晨曦圣殿的 `p3` 就是这样，本片一并改掉）。
 *    这一条配一条合成控制：尺子必须在假表上量得到复读，不然"没复读"是白送的。
 *
 * 兜底本身**保留**（缺登记时它就该接住，不许炸对话框），但由 ④ 那条腿用"临时摘掉一座的
 * 登记"这种假场景钉住它今天仍然可用 —— 真实副本一座都不该走它，那是 ① 的话。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { DUNGEON_DEFS, DUNGEON_IDS } from '../src/content/dungeons.js';
import { BOSS_LORE, DUNGEON_ENTER_LINES } from '../src/game/LoreFragments.js';
import { DUNGEON_BOSS_LINES } from '../src/content/bossDialogue.js';
import { DungeonManager } from '../src/world/DungeonManager.js';
import { makeManager, makeScene, installWindowShim } from './helpers/enemyHarness.js';
import { keyText } from '../src/ui/keyHints.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { setLanguage, t } from '../src/engine/i18n.js';

beforeAll(installWindowShim);
beforeEach(() => setLanguage('zh'));

const 通用兜底名 = 'boss_name_dungeon_warden';
const 通用兜底正文 = 'dungeon_boss_fallback_text';

/** 表里的行 → 展开后的那一句（两张表都取，缺哪一侧就点名哪一侧） */
const 展开 = (键, 表) => {
  const 值 = 表[键];
  return { 键, 值: typeof 值 === 'string' ? 值 : null };
};

/**
 * 按名册出发的覆盖率 —— 方向只有一个是对的：**从副本表问两张叙事表**，
 * 而不是从表问它们自己（那正是漏四座时一声不出的那把尺子）。
 */
const 缺登记的 = (表) => DUNGEON_IDS.filter((id) => !表[id]);

describe('① 覆盖率双向对齐：名册每一座都要有自己的那两句', () => {
  it('九座逐座点名：`BOSS_LORE` 与 `DUNGEON_ENTER_LINES` 都不许缺行', () => {
    expect(缺登记的(BOSS_LORE), `这些副本没有自己的守钥者开场白：${缺登记的(BOSS_LORE).join(' / ')}`).toEqual([]);
    expect(缺登记的(DUNGEON_ENTER_LINES), `这些副本没有自己的进入语：${缺登记的(DUNGEON_ENTER_LINES).join(' / ')}`).toEqual([]);
  });

  it('反向：两张表里不许坐着名册没有的 id（幽灵行会把覆盖率算成满分）', () => {
    for (const [名, 表] of [['BOSS_LORE', BOSS_LORE], ['DUNGEON_ENTER_LINES', DUNGEON_ENTER_LINES]]) {
      const 野行 = Object.keys(表).filter((id) => !DUNGEON_IDS.includes(id));
      expect(野行, `${名} 里这些 id 不在副本名册里：${野行.join(' / ')}`).toEqual([]);
    }
  });

  it('行数正好等于座数（既不少也不多 —— 多了就是有人在写没人认领的行）', () => {
    expect(Object.keys(BOSS_LORE).length, '守钥者开场白的行数与座数脱钩了').toBe(DUNGEON_DEFS.length);
    expect(Object.keys(DUNGEON_ENTER_LINES).length, '进入语的行数与座数脱钩了').toBe(DUNGEON_DEFS.length);
  });

  it('逐座互不相同：标题、正文、进入语各自都不许有两座共用一句', () => {
    for (const 字段 of ['title', 'text']) {
      const 句 = DUNGEON_IDS.map((id) => BOSS_LORE[id][字段]);
      expect(new Set(句).size, `守钥者开场白的 ${字段} 有两座撞了`).toBe(DUNGEON_IDS.length);
    }
    const 进入 = DUNGEON_IDS.map((id) => DUNGEON_ENTER_LINES[id]);
    expect(new Set(进入).size, '进入语有两座撞了').toBe(DUNGEON_IDS.length);
  });

  it('谁都不许把通用兜底句当成自己那句（覆盖率满了，玩家听到的还是那一句）', () => {
    const 撞 = [];
    for (const id of DUNGEON_IDS) {
      const { title, text } = BOSS_LORE[id];
      if (t(title) === t(通用兜底名)) 撞.push(`${id}.title`);
      if (t(text) === t(通用兜底正文)) 撞.push(`${id}.text`);
      if (t(DUNGEON_ENTER_LINES[id]) === '') 撞.push(`${id}.enter`);
    }
    expect(撞.join(' / '), `这些格子等于兜底句或空句：${撞.join('、')}`).toBe('');
  });
});

describe('② 双表都有定义，中英各自播出干净', () => {
  it('每一枚键在中英两张表都有非空定义', () => {
    const 坏 = [];
    for (const id of DUNGEON_IDS) {
      const 枚 = { title: BOSS_LORE[id].title, text: BOSS_LORE[id].text, enter: DUNGEON_ENTER_LINES[id] };
      for (const [字段, 键] of Object.entries(枚)) {
        for (const [语言, 表] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
          const { 值 } = 展开(键, 表);
          if (值 === null || 值.trim() === '') 坏.push(`${语言} ${id}.${字段} = ${键}`);
        }
      }
    }
    expect(坏.join(' / '), `这些叙事键缺定义或是空句：${坏.join('、')}`).toBe('');
  });

  it('切到英文播出：九座都不夹 [MISSING:]，也不夹一个汉字', () => {
    setLanguage('en');
    const 坏 = [];
    for (const id of DUNGEON_IDS) {
      const 句 = [
        t(BOSS_LORE[id].title),
        t(BOSS_LORE[id].text),
        t(DUNGEON_ENTER_LINES[id]),
      ];
      for (const s of 句) {
        if (s.startsWith('[MISSING:')) 坏.push(`${id} → ${s}`);
        if (/[\u4e00-\u9fff]/.test(s)) 坏.push(`${id} 英文里夹了中文：${s}`);
      }
    }
    expect(坏.join(' / '), `英文玩家看到的是这些：${坏.join('、')}`).toBe('');
  });

  it('键名跟着 id 走：`boss_lore_<蛇形>_title/_text` 与 `dungeon_enter_<蛇形>` 一格不差', () => {
    const 蛇 = (id) => id.replaceAll('-', '_');
    const 坏 = [];
    for (const id of DUNGEON_IDS) {
      if (BOSS_LORE[id].title !== `boss_lore_${蛇(id)}_title`) 坏.push(`${id}.title = ${BOSS_LORE[id].title}`);
      if (BOSS_LORE[id].text !== `boss_lore_${蛇(id)}_text`) 坏.push(`${id}.text = ${BOSS_LORE[id].text}`);
      if (DUNGEON_ENTER_LINES[id] !== `dungeon_enter_${蛇(id)}`) 坏.push(`${id} = ${DUNGEON_ENTER_LINES[id]}`);
    }
    // 键名是**逐格写下来的字面量**（不是拼出来的）⇒ 死键尺子认得它们；这一条钉的是命名口径，
    // 而"不许改成拼接"由切片27 那张拼键名册说话。
    expect(坏.join(' / '), `这些行的键名不合口径：${坏.join('、')}`).toBe('');
  });
});

/**
 * 复读尺子（纯函数，喂真表也喂假表）：同一座里，阶段句若有一段与开场句逐字相同，
 * 玩家会在一场战斗里听见同一句话说两遍。
 *
 * 切段用 `—`：这套台词的四句都是「场景 — 守钥者做什么」的形状，前半换、后半抄是
 * 最常见的那种偷懒（晨曦圣殿的 `p3` 正是后半整段抄 `intro`）。
 */
function 找复读(四句) {
  const 段 = (s) => String(s).split('—').map((x) => x.trim()).filter((x) => x !== '');
  const 开场 = 段(四句.intro);
  const 响 = [];
  for (const 阶段 of ['p2', 'p3', 'defeat']) {
    if (!四句[阶段]) continue;
    for (const 句 of 段(四句[阶段])) {
      if (开场.includes(句)) 响.push(`${阶段}:「${句}」`);
    }
  }
  return 响;
}

describe('③ 阶段台词不复述开场句（晨曦圣殿那枚是真凭据）', () => {
  it('九座逐座量：`intro` 的每一段都不许在 `p2/p3/defeat` 里原样出现', () => {
    const 坏 = [];
    for (const id of DUNGEON_IDS) {
      const 行 = DUNGEON_BOSS_LINES[id];
      const 四句 = {
        intro: t(行.intro),
        p2: t(行.p2),
        p3: t(行.p3),
        defeat: t(行.defeat),
      };
      const 响 = 找复读(四句);
      if (响.length) 坏.push(`${id} ${响.join('、')}`);
    }
    expect(坏.join(' / '), `这些副本的阶段台词在复述开场句：${坏.join('、')}`).toBe('');
  });

  it('尺子自证：喂一份后半段照抄开场的假四句，必须量得到复读（不然③是白送的）', () => {
    const 假 = { intro: '晨光落下 — 守钥者举起钥匙。', p2: '光转成白色 — 墙上的门合上了。', p3: '光压成白线 — 守钥者举起钥匙。', defeat: '圣殿安静了。' };
    expect(找复读(假), '后半段逐字相同却量不出来 ⇒ 这把尺子是坏的').toEqual(['p3:「守钥者举起钥匙。」']);
    // 反面：前半换、后半也换 ⇒ 不许误报
    const 真改过 = { intro: '圣殿的光转成白色 — 守钥者的影子开始分裂。', p3: '圣殿的光压成一道白线 — 影子站得比它高。' };
    expect(找复读(真改过)).toEqual([]);
  });

  it('晨曦圣殿那一枚今天确实是新的（历史凭据：改前它的 p3 后半逐字等于 intro 后半）', () => {
    const 抄本 = {
      intro: '晨光从穹顶落下 — 守钥者举起枢纽之钥。',
      p3: '圣殿的金光骤然变白 — 守钥者举起枢纽之钥。',
    };
    expect(找复读(抄本).length, '旧抄本本身量不出复读 ⇒ 上面那条腿量的是空气').toBe(1);
    expect(t(DUNGEON_BOSS_LINES['radiant-dawn-hall'].p3)).not.toContain('守钥者举起枢纽之钥');
  });
});

/* ------------------------------------------------------------------ *
 * ④ 行为腿：真实一座都不走兜底，而兜底本身仍然接得住
 * ------------------------------------------------------------------ */

/** 逐座进一次场，收回「进入语那条」与「Boss 开场那条」 */
function 收集(座) {
  const 收 = [];
  const dm = new DungeonManager(makeScene(), { getGroundHeight: () => 0 },
    { show(title, text) { 收.push({ title, text }); }, toast() {} },
    makeManager(), null);
  const player = { position: new THREE.Vector3(), teleport(x, y, z) { this.position.set(x, y, z); } };
  收.length = 0;
  const dungeon = dm.dungeons.get(座);
  dm.enter(dungeon, player);
  const 进入 = 收.length ? { ...收[0] } : null;
  const def = DUNGEON_DEFS.find((d) => d.id === 座);
  const arena = dungeon.layout.rooms.find((r) => r.isBossArena);
  player.teleport(def.origin.x + arena.x, 0, def.origin.z + arena.z);
  dm.updatePlayerRoom(player.position);
  const 开场 = 收.length > 1 ? { ...收[收.length - 1] } : null;
  dm.abandonRun();
  dm.dispose?.();
  return { 进入, 开场 };
}

describe('④ 兜底：真实副本一座都不走它，而它今天仍然接得住', () => {
  it('真读数：每一座出来的标题/正文都是它自己登记的那两句', () => {
    for (const id of DUNGEON_IDS) {
      const { 进入, 开场 } = 收集(id);
      const 行 = BOSS_LORE[id];
      expect(开场.title, `${id} 的开场标题不是它自己那句`).toBe(keyText(t(行.title)));
      expect(开场.text, `${id} 的开场正文不是它自己那句`).toBe(keyText(t(行.text)));
      expect(进入.text, `${id} 的进入语没播出自己那句`).toContain(keyText(t(DUNGEON_ENTER_LINES[id])));
    }
  });

  it('反向控制：临时摘掉一座的登记 ⇒ 兜底必须接住（说明它不是死码，也说明缺登记不会炸）', () => {
    const 座 = 'ruin-crypt';
    const 原 = BOSS_LORE[座];
    const 原进入 = DUNGEON_ENTER_LINES[座];
    delete BOSS_LORE[座];
    delete DUNGEON_ENTER_LINES[座];
    try {
      const { 进入, 开场 } = 收集(座);
      expect(开场.title, '摘掉登记后没走兜底名').toBe(t(通用兜底名));
      expect(开场.text, '摘掉登记后没走兜底正文').toBe(t(通用兜底正文));
      // 进入语那条退化成只剩统计行：不抛、不空对话框、也不留一个光秃秃的换行
      expect(进入.text).not.toContain(keyText(t(原进入)));
      expect(进入.text.startsWith('\n'), '进入语为空时把段落分隔符留在了最前面').toBe(false);
    } finally {
      BOSS_LORE[座] = 原;
      DUNGEON_ENTER_LINES[座] = 原进入;
    }
    const 复原 = 收集(座);
    expect(复原.开场.title, '摘完没装回去（本条把后面的腿全污染了）').toBe(keyText(t(原.title)));
  });

  it('摘掉登记这件事当场就会红：① 那条读的是同一张对象（自证覆盖率不是恒绿的）', () => {
    const 座 = 'abyss-deep-maw';
    const 原 = DUNGEON_ENTER_LINES[座];
    delete DUNGEON_ENTER_LINES[座];
    try {
      expect(缺登记的(DUNGEON_ENTER_LINES), '摘掉一行，覆盖率却还说满 ⇒ ① 是白送的').toEqual([座]);
    } finally {
      DUNGEON_ENTER_LINES[座] = 原;
    }
    expect(缺登记的(DUNGEON_ENTER_LINES)).toEqual([]);
  });
});

afterEach(() => setLanguage('zh'));
