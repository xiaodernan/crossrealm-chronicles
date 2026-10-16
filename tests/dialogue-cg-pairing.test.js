/**
 * 营火对话 ↔ CG 预设 ↔ 绘制名单：三张名单得配成一对（W-B4 切片1）。
 *
 * ## 这一片要修的是什么
 *
 * 对话树（`content/restDialogues.js`）与 CG 预设（`content/dialogueCgPresets.js`）是两张各自成文的表，
 * 中间那根线（"这一节点该画哪张图"）原先只靠**运行时的兜底**来接，而三条兜底全都在说谎：
 *
 * 1. `getPreset` 找不到就退回 `{ scene: 'anchor_fire' }` —— 任何陌生的营火 id 都画成世界之锚那团火；
 * 2. `NPC 定义` 取不到就退回 `'#c9a962'`（那是锚火看守自己的配色），这份抄件散在四个文件里；
 * 3. 画廊目录取不到说话人就退回 `restId` 本身 —— 界面上写着说话人叫 `magic`。
 *
 * 症状都不是崩溃，是**说假话而看不出来**：孤儿预设 = 画廊里一行永远灰着（而 `side-cg-half` /
 * 成就 `cg-half` 读的分母正是那张目录），写错的节点名 = 玩家走到那一格只看到别的营火的画。
 *
 * ## 用例分四层
 *
 * 1. **门禁**：新条目 `restDialogueCg` 的四条 + 树↔NPC 定义的第四、五条，每条配"塞坏的要红、
 *    真表零错"两面，且全部走 shipped 的 `checkContent`（不是直接调校验函数 —— 删掉注册表里那一行
 *    也该红）。
 * 2. **名单**：每个预设的 `scene` 真有人画；致敬层与基础层两家不相交；撞名当场抛（用 mock 逼出来）。
 * 3. **真渲染**：假 canvas 上逐营火逐节点走真 `getPreset` / `render`，断言画出来的字幕就是那一条，
 *    而认不出营火时拿到的是 `null`（不是别人的画）。
 * 4. **运行时**：`RestDialogue` 递出去的配色只能来自定义表；`CgJournalTab` 让每一行画廊按
 *    自己写着的 `scene` 去画；渲染器说"没有这张图"时界面把图位收起来。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { REST_DIALOGUES } from '../src/content/restDialogues.js';
import { REST_NPC_DEFS } from '../src/content/restNpcDefs.js';
import {
  REST_DIALOGUE_CG, REST_DIALOGUE_CG_BASE, REST_DIALOGUE_CG_POP,
} from '../src/content/dialogueCgPresets.js';
import { CG_PAINTERS, CG_DEFAULT_ACCENT, DialogCGRenderer } from '../src/ui/DialogCGRenderer.js';
import { POP_CG_PAINTERS } from '../src/ui/DialogCGRendererPopCulture.js';
import { CG_GALLERY_CATALOG } from '../src/game/CgGalleryRegistry.js';
import { keyText } from '../src/content/keyHints.js';
import { t, setLanguage } from '../src/engine/i18n.js';
import { CgJournalTab } from '../src/ui/CgJournalTab.js';
import { Dialog } from '../src/ui/Dialog.js';
import { RestDialogue } from '../src/game/RestDialogue.js';
import { gameSurface } from './helpers/gameSurface.js';
import { installWindowShim } from './helpers/enemyHarness.js';
import { makeMarkupDom } from './helpers/fakeMarkupDom.js';
import { REST_POINT_NAMES } from '../src/content/restPointNames.js';

/** 走 shipped 入口：把某一张表换成种植入的，其余照原样 */
const planted = (kind, table) => checkContent(
  CONTENT_TABLES.map((t) => (t.kind === kind ? { ...t, table } : t)),
);
const cgOf = (table) => planted('restDialogueCg', table);
const treeOf = (table) => planted('restDialogues', table);

/* ------------------------------------------------------------------ *
 * 一、门禁：预设表的键必须落得进一棵真的对话树
 * ------------------------------------------------------------------ */

describe('门禁 `restDialogueCg`：四条规则各自咬得住', () => {
  const preset = { scene: 'anchor_fire', caption: '门禁自证' };

  it('控制组：真表过自己的 schema（0 条错误）—— 下面几条的红才有意义', () => {
    expect(cgOf(REST_DIALOGUE_CG)).toEqual([]);
  });

  it('规则 1：键不是 `<营火>:<节点>` 的形状要红，两种坏法各一条', () => {
    const errs = cgOf({ ...REST_DIALOGUE_CG, 'hub-no-colon': preset, 'hub:a:b': preset });
    expect(errs).toHaveLength(2);
    expect(errs.join('\n')).toMatch(/"hub-no-colon": 不是 "<营火 id>:<节点 id>" 的形状/);
    expect(errs.join('\n')).toMatch(/"hub:a:b": 不是 "<营火 id>:<节点 id>" 的形状/);
  });

  it('规则 2：营火没有对话树要红（画廊里有这一行，玩家走到哪儿都触发不了它）', () => {
    const errs = cgOf({ ...REST_DIALOGUE_CG, 'ghostfire:start': preset });
    expect(errs).toEqual([expect.stringContaining('营火 "ghostfire" 没有对话树')]);
  });

  it('规则 2：节点不在那一棵树上要红，并把可用的节点列出来', () => {
    const errs = cgOf({ ...REST_DIALOGUE_CG, 'hub:no-such-node': preset });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/hub 那棵树里没有节点 "no-such-node"/);
    expect(errs[0]).toMatch(/可用：/);   // 省一次翻表
  });

  it('规则 3：某座营火少了 `<营火>:start` 要红（那是无预设时唯一可落的那一格）', () => {
    const clone = { ...REST_DIALOGUE_CG };
    delete clone['hub:start'];
    const errs = cgOf(clone);
    expect(errs).toEqual([expect.stringContaining('hub 没有 "<营火>:start"')]);
  });

  it('规则 4：两层给了同一个键要红（spread 之后只剩后写那一层）', () => {
    // 这条读的是三张分层名单本身，不是合并后的表 —— 所以走真入口，当场改一张分层表
    const dupKey = Object.keys(REST_DIALOGUE_CG_BASE)[0];
    REST_DIALOGUE_CG_POP[dupKey] = { ...preset, caption: '致敬层抄了基础层的键' };
    try {
      const errs = cgOf(REST_DIALOGUE_CG);
      expect(errs).toHaveLength(2);   // 双向各报一次（A 与 B 撞 / B 与 A 撞），两条都带那个键
      expect(errs.every((e) => e.includes(dupKey))).toBe(true);
      // 两句的方向词都要在：只报一遍的话，"谁盖谁"就看不出来
      // （`与` 后面有一个空格 —— 生产文案 `${name}层与 ${otherName}层` 带的，别按紧凑写法比）
      expect(errs.some((e) => /基础层与\s*致敬层给了同一个键/.test(e))).toBe(true);
      expect(errs.some((e) => /致敬层与\s*基础层给了同一个键/.test(e))).toBe(true);
    } finally {
      delete REST_DIALOGUE_CG_POP[dupKey];
    }
    expect(cgOf(REST_DIALOGUE_CG), '还原没做干净 —— 这条用例正在污染真表').toEqual([]);
  });

  it('字段级：caption 空串与未知 mood 都要红（声明的字段类型真的在管这一格）', () => {
    const 空 = cgOf({ ...REST_DIALOGUE_CG, 'hub:origin': { scene: 'anchor_fire', caption: '' } });
    expect(空).toEqual([expect.stringContaining('caption: 不许是空串')]);
    const 野 = cgOf({ ...REST_DIALOGUE_CG, 'hub:origin': { scene: 'anchor_fire', caption: '甲', mood: 'angry' } });
    expect(野).toEqual([expect.stringContaining('mood')]);
    // 两条都带完整键路径（否则报了也跳不到那一格）
    expect(空[0]).toMatch(/restDialogueCg\["hub:origin"\]/);
  });

  it('注册表里那一行挣到了 `invariant` 槽位：键的形状 `keyRef` 表达不了', () => {
    const entry = CONTENT_TABLES.find((t) => t.kind === 'restDialogueCg');
    expect(entry, '注册表里没有 restDialogueCg 这一条').toBeTruthy();
    expect(typeof entry.invariant).toBe('function');
    expect(entry.shape).toBe('index');
    expect(entry.keyRef, '复合键不该有 keyRef —— 它验不了"节点得在那棵树上"').toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * 二、门禁：对话树 ↔ NPC 定义成对（第四、五条）
 * ------------------------------------------------------------------ */

describe('门禁 `restDialogues` 第四、五条：有一座树就得有一座人', () => {
  /**
   * 一棵合法小树：节点从**真表**里挑一格"选项全走 action、不指 next"的抄来 ——
   * 自己手搓字段就会在形状层先红，那条红会盖住我要看的这条。
   * 营火 id 用 `corridor`（它在 `zones` 表里，所以 `keyRef` 那一层放行，剩下的错只可能来自 invariant）。
   */
  function legalLeafNode() {
    for (const tree of Object.values(REST_DIALOGUES)) {
      for (const node of Object.values(tree.nodes)) {
        if (node.choices?.length && node.choices.every((c) => c.action && !c.next)) {
          return structuredClone(node);
        }
      }
    }
    return null;
  }

  it('控制组：真表 0 错，且树与定义两边的名单一模一样宽', () => {
    expect(treeOf(REST_DIALOGUES)).toEqual([]);
    expect(Object.keys(REST_DIALOGUES).sort()).toEqual(Object.keys(REST_NPC_DEFS).sort());
  });

  it('多一座有树没定义的营火要红（改前它拿锚火的配色说话，且不报错）', () => {
    const leaf = legalLeafNode();
    expect(leaf, '真表里找不到一处纯 action 的节点 —— 表形状变了，这条要跟着改').toBeTruthy();
    const errs = treeOf({
      ...REST_DIALOGUES,
      corridor: { nodes: { start: leaf } },
    });
    expect(errs).toEqual([expect.stringContaining('restDialogues 营火 corridor: REST_NPC_DEFS 里没有这一座')]);
  });

  it('定义里 `name` / `accent` 空了要红（对话框与画廊那一行要说的是它）', () => {
    const before = REST_NPC_DEFS.hub.accent;
    REST_NPC_DEFS.hub.accent = '';
    try {
      const errs = treeOf(REST_DIALOGUES);
      expect(errs).toEqual([expect.stringContaining('营火 hub: NPC 定义的 accent 不是非空字符串')]);
    } finally {
      REST_NPC_DEFS.hub.accent = before;
    }
    expect(treeOf(REST_DIALOGUES), '还原没做干净').toEqual([]);
  });

  it('反向也成对：有定义却把树删掉，红的是"那句愿火护佑没人说"那条', () => {
    const clone = { ...REST_DIALOGUES };
    delete clone.abyss;
    const errs = treeOf(clone);
    expect(errs).toEqual([expect.stringContaining('restNpcDefs 营火 abyss: 有 NPC 定义却没有对话树')]);
  });
});

/* ------------------------------------------------------------------ *
 * 三、名单：每个场景真有人画，两家不相交，撞名当场抛
 * ------------------------------------------------------------------ */

describe('场景 ↔ 绘制者名单', () => {
  it('64 条预设里每一个 `scene` 都有人画（缺一个就是一张永远画不出来的图）', () => {
    const missing = Object.entries(REST_DIALOGUE_CG)
      .filter(([, preset]) => !CG_PAINTERS[preset.scene])
      .map(([key, preset]) => `${key} -> ${preset.scene}`);
    expect(missing, `这些预设的 scene 名单里没有：\n${missing.join('\n')}`).toEqual([]);
  });

  it('画廊目录的每一行 scene 也有人画（含不属于任何营火的那些）', () => {
    const missing = CG_GALLERY_CATALOG
      .filter((row) => !CG_PAINTERS[row.scene])
      .map((row) => `${row.id} -> ${row.scene}`);
    expect(missing, `这些画廊行的 scene 名单里没有：\n${missing.join('\n')}`).toEqual([]);
  });

  it('致敬层那批真的并进了总名单（同一件函数对象，不是又抄一遍）', () => {
    const lost = Object.entries(POP_CG_PAINTERS).filter(([scene, fn]) => CG_PAINTERS[scene] !== fn);
    expect(lost.map(([scene]) => scene), '这些致敬层场景没并进总名单').toEqual([]);
    // 反面：总名单里属于致敬层的那些，数量与致敬层一致（一条不丢也不翻倍）
    const inTotal = Object.keys(POP_CG_PAINTERS).filter((s) => Object.hasOwn(CG_PAINTERS, s));
    expect(inTotal).toHaveLength(Object.keys(POP_CG_PAINTERS).length);
  });

  it('Wave4 那批也在致敬层名单里（改前是靠一个 mutate 的 attach 塞进去的）', () => {
    for (const scene of ['cyber_alley', 'samurai_torii', 'cosmic_obelisk', 'starport_cantina', 'wave4_grid']) {
      expect(typeof POP_CG_PAINTERS[scene], `致敬层名单里没有 ${scene}`).toBe('function');
    }
  });

  it('撞名当场抛：致敬层给了基础层已有的场景（不许静默盖掉那张图）', async () => {
    vi.resetModules();
    vi.doMock('../src/ui/DialogCGRendererPopCulture.js', () => ({
      POP_CG_PAINTERS: { anchor_fire: () => {} },   // 基础层第一个场景，故意撞
    }));
    let err = null;
    try {
      await import('../src/ui/DialogCGRenderer.js');
    } catch (e) {
      err = e;
    } finally {
      vi.doUnmock('../src/ui/DialogCGRendererPopCulture.js');
      vi.resetModules();
    }
    expect(err, '撞名却照样 import 成功 —— 那条点名没生效').toBeTruthy();
    expect(err.message).toMatch(/CG 场景「anchor_fire」有两家绘制者/);
  });

  it('撞名当场抛：Wave4 给了前面那批已有的场景', async () => {
    vi.resetModules();
    vi.doMock('../src/ui/DialogCGRendererPopCultureWave4.js', () => ({
      POP_CG_PAINTERS_WAVE4: { wizard_school: () => {} },
    }));
    let err = null;
    try {
      await import('../src/ui/DialogCGRendererPopCulture.js');
    } catch (e) {
      err = e;
    } finally {
      vi.doUnmock('../src/ui/DialogCGRendererPopCultureWave4.js');
      vi.resetModules();
    }
    expect(err, 'Wave4 撞名却没抛 —— 合并那一圈没装上').toBeTruthy();
    expect(err.message).toMatch(/Wave4 与前面那批撞名/);
  });
});

/* ------------------------------------------------------------------ *
 * 四、真渲染：逐营火逐节点走真 `getPreset` / `render`
 * ------------------------------------------------------------------ */

/**
 * 假 canvas：只记下"画了什么"，不画像素。
 *
 * 记 `fillText` 是因为字幕条是整条管线**唯一写着这一格是谁**的地方 ——
 * 拿它当读数就能问出"这一节点画到的到底是哪一格的预设"，而不必去比对图片字节。
 * 未知的方法一律吞掉（名单里的画法只用到 canvas 2D 的常规调用）。
 */
function fakeCanvasEnv() {
  const rec = { captions: [], strokeRects: 0, frames: 0 };
  const grad = { addColorStop() {} };
  const ctxImpl = {
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    fillText: (text) => { rec.captions.push(text); },
    strokeRect: () => { rec.strokeRects += 1; },
  };
  const ctx = new Proxy(ctxImpl, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: () => true,   // fillStyle / lineWidth / font / globalAlpha 都吞掉
  });
  const canvas = {
    width: 0, height: 0,
    getContext: () => ctx,
    toDataURL: () => { rec.frames += 1; return `data:fake#${rec.frames}`; },
  };
  globalThis.document = { createElement: () => canvas };
  return rec;
}

describe('真渲染：兜底不许说谎', () => {
  let rec = null;
  let r = null;
  const mount = () => { rec = fakeCanvasEnv(); r = new DialogCGRenderer(); };
  afterEach(() => { delete globalThis.document; rec = null; r = null; });

  it('逐营火逐节点：`getPreset` 永远落在**同一座**营火，绝不落到别家的画', () => {
    mount();
    const 串门 = [];
    for (const [zone, tree] of Object.entries(REST_DIALOGUES)) {
      for (const nodeId of Object.keys(tree.nodes)) {
        const preset = r.getPreset(zone, nodeId);
        if (!preset) { 串门.push(`${zone}/${nodeId}: 压根取不到预设`); continue; }
        const owner = Object.keys(REST_DIALOGUE_CG).find((k) => REST_DIALOGUE_CG[k] === preset);
        if (owner.split(':')[0] !== zone) 串门.push(`${zone}/${nodeId} -> ${owner}`);
      }
    }
    expect(串门, `这些节点画的是别的营火的图：\n${串门.join('\n')}`).toEqual([]);
  });

  it('节点没有自己的预设时，落点是**本营火**的 start（不是锚火）', () => {
    mount();
    // 先从真表里找一格"树上有、预设表里没有"的节点，找不到就说明表长变了，这条要跟着改
    const bare = Object.entries(REST_DIALOGUES)
      .flatMap(([zone, tree]) => Object.keys(tree.nodes)
        .filter((nodeId) => !REST_DIALOGUE_CG[`${zone}:${nodeId}`] && nodeId !== 'start')
        .map((nodeId) => ({ zone, nodeId })));
    expect(bare.length, '今天 77 格里有 13 格是刻意共享 start 的 —— 一格都没有说明表长变了').toBeGreaterThan(0);
    for (const { zone, nodeId } of bare) {
      expect(r.getPreset(zone, nodeId), `${zone}/${nodeId} 没落到本营火的 start`)
        .toBe(REST_DIALOGUE_CG[`${zone}:start`]);
    }
  });

  it('陌生的营火：`render` 返回 null，而不是世界之锚那团火', () => {
    mount();
    expect(r.getPreset('ghostfire', 'start')).toBe(null);
    expect(r.render('ghostfire', 'start', '#fff', 'calm')).toBe(null);
    expect(rec.frames, '没有预设却还导出了一张图 —— 那张图画的是上一格残留').toBe(0);
  });

  it('每一条预设都画得出来，字幕是**展开后**的那一句（含致敬层那 24 格）', () => {
    mount();
    const 画不出 = [];
    for (const [key, preset] of Object.entries(REST_DIALOGUE_CG)) {
      const [zone, nodeId] = key.split(':');
      rec.captions.length = 0;
      const url = r.render(zone, nodeId, '#123456', 'calm');
      if (!url) { 画不出.push(`${key}（scene=${preset.scene}）`); continue; }
      const drawn = rec.captions[rec.captions.length - 1];
      const expected = keyText(t(preset.caption));
      if (drawn !== expected) {
        画不出.push(`${key}：画上写 "${drawn}"，表展开后是 "${expected}"`);
      }
      // 画进像素的键名必须是定稿：留一个 `{escape}` 就是"改绑之后图上还写着旧键"那一类
      if (/\{[a-zA-Z]/.test(drawn)) 画不出.push(`${key}：画上写着未展开的占位 "${drawn}"`);
    }
    expect(画不出, `这些格画错或画不出来：\n${画不出.join('\n')}`).toEqual([]);
  });

  it('warn 的那圈红边两条来源都要有 —— 管线收口成一处之后不许漏', () => {
    mount();
    // 基础层那一格（void:stop 是 warn）与致敬层那一格（magic:wizard 走的是并入名单后的画法）
    for (const [zone, nodeId] of [['void', 'stop'], ['magic', 'wizard']]) {
      rec.strokeRects = 0;
      r.render(zone, nodeId, '#123456', 'warn');
      expect(rec.strokeRects, `${zone}/${nodeId} 的 warn 只罩了红、没画红边`).toBe(1);
      rec.strokeRects = 0;
      r.render(zone, nodeId, '#123456', 'calm');
      expect(rec.strokeRects, `${zone}/${nodeId} 平静态却画了红边`).toBe(0);
    }
  });

  it('缓存：同一格第二次不再重画（改键名那一轮会整体丢掉，见 W-B2 切片5）', () => {
    mount();
    const first = r.render('hub', 'origin', '#123456', 'calm');
    const frames = rec.frames;
    expect(r.render('hub', 'origin', '#123456', 'calm')).toBe(first);
    expect(rec.frames, '第二次导出了一张新图 —— 缓存没命中').toBe(frames);
    // 换了配色就又是一张：缓存键里有 accent
    r.render('hub', 'origin', '#654321', 'calm');
    expect(rec.frames).toBe(frames + 1);
  });

  it('`renderScene`：画廊里不属于任何营火的行按自己写着的 scene 画', () => {
    mount();
    const bonus = CG_GALLERY_CATALOG.filter((row) => !row.restId);
    expect(bonus.length, '目录里没有非营火行 —— 这条用例该跟着删').toBeGreaterThan(0);
    for (const row of bonus) {
      rec.captions.length = 0;
      expect(r.renderScene(row.scene, row.caption, row.accent, row.mood), `${row.id} 画不出来`).toBeTruthy();
      expect(rec.captions.at(-1), `${row.id} 的字幕对不上目录那一行`).toBe(t(row.caption));
    }
    expect(r.renderScene('no-such-scene', '甲', '#123456', 'calm')).toBe(null);
  });

  it('默认配色只在渲染器这一处：调用方不给色也画得出来', () => {
    mount();
    rec.captions.length = 0;
    expect(r.render('hub', 'start')).toBeTruthy();
    expect(CG_DEFAULT_ACCENT).toBe(REST_NPC_DEFS.hub.accent);   // 同一个值，但只此一处抄写
    expect(rec.captions.at(-1)).toBe(t(REST_DIALOGUE_CG['hub:start'].caption));
  });
});

/* ------------------------------------------------------------------ *
 * 五、画廊目录 = 预设表：一行不多，一行不少，说话人取自定义表
 * ------------------------------------------------------------------ */

describe('画廊目录与预设表同一份', () => {
  const dialogueRows = CG_GALLERY_CATALOG.filter((row) => row.unlock === 'dialogue');

  it('每一行营火对话 CG 恰好对应预设表的一个键（多一行少一行都是灰着的格子）', () => {
    expect(dialogueRows.map((row) => row.id)).toEqual(Object.keys(REST_DIALOGUE_CG));
  });

  it('每行的说话人与配色就是那一座营火的定义（不是 id、不是抄来的默认色）', () => {
    const wrong = [];
    for (const row of dialogueRows) {
      const def = REST_NPC_DEFS[row.restId];
      if (row.speaker !== def.name) wrong.push(`${row.id}: 说话人 "${row.speaker}"，定义写 "${def.name}"`);
      if (row.accent !== def.accent) wrong.push(`${row.id}: 配色 "${row.accent}"，定义写 "${def.accent}"`);
      if (row.scene !== REST_DIALOGUE_CG[row.id].scene) wrong.push(`${row.id}: scene 对不上预设`);
      if (row.zone !== row.restId) wrong.push(`${row.id}: zone "${row.zone}" 与 restId "${row.restId}" 不一致`);
    }
    expect(wrong, `画廊里这些行说的不是真话：\n${wrong.join('\n')}`).toEqual([]);
  });

  it('目录里没有一行是"画不出来的"（每一行的 scene 或 营火:节点 都能落到一张图）', () => {
    fakeCanvasEnv();   // 只要它把假 canvas 挂上 `document`；这一条不看绘制记录，只看有没有帧画出来
    try {
      const r = new DialogCGRenderer();
      const 画不出 = CG_GALLERY_CATALOG.filter((row) => (
        row.restId && row.nodeId
          ? r.render(row.restId, row.nodeId, row.accent, row.mood)
          : r.renderScene(row.scene, row.caption, row.accent, row.mood)) === null).map((row) => row.id);
      expect(画不出, `这些行解锁了也是一片空白：${画不出.join(' / ')}`).toEqual([]);
    } finally {
      delete globalThis.document;
    }
  });
});

/* ------------------------------------------------------------------ *
 * 六、运行时那一侧：不再抄默认色，也不再借别家的话说
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 六、目录存键、出口展开（W-D2 切片13）
 * ------------------------------------------------------------------ */

describe('目录存的是文案键，展开只发生在出口', () => {
  /**
   * 为什么这条要单独立：这张目录同时喂两个完全不同的出口 —— 界面上的字（卡片 / 灯箱 /
   * 解锁 toast）与**画进 CG 像素里的那一行**。改前营火行在导入期就 `t()` 成了中文、
   * bonus 行存的是键，同一张表两套口径：`CgJournalTab` 拿到什么显示什么，于是
   * `cg_gallery_finisher` 这样的裸键会被摆进玩家界面，而 `t('荒原留影')` 又会回
   * `[MISSING: 荒原留影]` 并把开发期字样画到图上。两条都**不报错**，只有横向对比看得见。
   */
  it('分母守卫：目录非空，且每一行的 caption 都是**键**（不是文案，也不是没登记的键）', () => {
    expect(CG_GALLERY_CATALOG.length).toBeGreaterThan(0);
    const 存了文案 = [];
    const 没登记 = [];
    for (const row of CG_GALLERY_CATALOG) {
      if (/[\u4e00-\u9fff]/.test(row.caption)) 存了文案.push(`${row.id}: ${row.caption}`);
      if (t(row.caption).startsWith('[MISSING')) 没登记.push(`${row.id}: ${row.caption}`);
    }
    expect(存了文案, `这些行的 caption 是文案本身而不是键：\n${存了文案.join('\n')}`).toEqual([]);
    expect(没登记, `这些行的键在双表里查不到（玩家会读到 [MISSING: …]）：\n${没登记.join('\n')}`).toEqual([]);
  });

  it('画廊卡片与灯箱给的是文案：裸键一个都不许摆到玩家面前', () => {
    const doc = makeMarkupDom();
    const prevDoc = globalThis.document;
    globalThis.document = doc;
    try {
      const row = CG_GALLERY_CATALOG.find((r) => !r.restId);
      const tab = new CgJournalTab({
        dialogCg: { render: () => 'data:r', renderScene: () => 'data:s' },
        cgGallery: {
          getStats: () => ({ unlocked: 1, total: 2, percent: 50, favorites: 0 }),
          getEntries: () => [row],
          getLockedPreview: () => [],
          favorites: new Set(),
          viewCounts: {},
          recordView() {},
        },
        hud: { journalTab: 'cg', updateJournal() {} },
      });

      const panel = doc.createElement('div');
      tab.render(panel);
      expect(panel.innerHTML).toContain(t(row.caption));      // 显示的是文案
      expect(panel.innerHTML).not.toContain(row.caption);     // 不是裸键

      tab.showLightbox(row);
      expect(tab.lightbox.querySelector('.cg-lightbox-caption').textContent).toBe(t(row.caption));
    } finally {
      globalThis.document = prevDoc;
    }
  });

  it('换语言之后画出来的字幕跟着换（语言不进缓存戳 ⇒ 复用上一语言那张图）', () => {
    const rec = fakeCanvasEnv();
    try {
      const r = new DialogCGRenderer();
      const row = CG_GALLERY_CATALOG.find((x) => !x.restId);
      setLanguage('zh');
      r.renderScene(row.scene, row.caption, row.accent, row.mood);
      const zh = rec.captions.at(-1);
      setLanguage('en');
      r.renderScene(row.scene, row.caption, row.accent, row.mood);
      const en = rec.captions.at(-1);
      expect(zh, '中文那一次就没画出来').not.toMatch(/\[MISSING/);
      expect(en, '英文那一次没画出来').not.toMatch(/\[MISSING/);
      expect(zh).not.toBe(en);
      expect(rec.frames, '第二次命中了缓存 —— 图上还留着上一个语言的字').toBe(2);
    } finally {
      setLanguage('zh');
      delete globalThis.document;
    }
  });
});

describe('运行时：对话与图都只说真话', () => {
  /** 一棵能走通的假游戏：字段形状**照 `src/core/Game.js` 长**，不多给一个 Game 没有的名字。
   *  曾经这里写作 `combat: {...}`（Game 顶层没有 `combat`，真口是 `player.combat`），
   *  于是六座营火点"休息"在浏览器里当场抛 TypeError，而这栋楼里 34 例全绿 —— 修 B63。 */
  function campfireGame(sunk) {
    return {
      quests: { chapter: 5, current: null, getProgressText: () => '', getAssistantHint: () => '' },
      audio: {},
      player: { combat: { restHeal: () => sunk.healed.push(1) } },
      upgrade: { show: (name) => sunk.upgraded.push(name) },
      dialog: {
        showChoices: (title, html, choices, meta) => sunk.metas.push(meta),
        toast: () => {},
        hide: () => sunk.closed.push(1),
      },
      storyJournal: { add: () => {} },
      stats: { addSouls: (n) => sunk.souls.push(n), toJSON: () => ({ souls: sunk.souls.reduce((a, b) => a + b, 0) }) },
      restNpcs: { getByRestId: () => null },
    };
  }

  it('逐座逐节点走真 `_showNode`：递出去的配色就是那一座的定义', () => {
    installWindowShim();
    const sunk = { metas: [], healed: [], upgraded: [], souls: [], closed: [] };
    const rd = new RestDialogue(campfireGame(sunk));
    const 错色 = [];
    for (const [zone, tree] of Object.entries(REST_DIALOGUES)) {
      rd.activeRest = { id: zone, name: `${zone} 营火` };
      for (const nodeId of Object.keys(tree.nodes)) {
        sunk.metas.length = 0;
        rd._showNode(tree, nodeId);
        const meta = sunk.metas[0];
        if (!meta) { 错色.push(`${zone}/${nodeId}: 没有递出 meta`); continue; }
        if (meta.accent !== REST_NPC_DEFS[zone].accent) {
          错色.push(`${zone}/${nodeId}: 递出 "${meta.accent}"，定义写 "${REST_NPC_DEFS[zone].accent}"`);
        }
        // 定义表 `REST_NPC_DEFS[zone].name` 在 W-D2 切片15 起存的是**文案键**，
        // 递出去的 `speaker` 由 `RestDialogue.speakerNameOf` 在出口展开成中文 —— 比较要过同一道 `t()`。
        const expectedSpeaker = t(tree.nodes[nodeId].speaker ?? REST_NPC_DEFS[zone].name);
        if (meta.speaker !== expectedSpeaker) {
          错色.push(`${zone}/${nodeId}: 说话人 "${meta.speaker}"，定义展开为 "${expectedSpeaker}"`);
        }
      }
    }
    expect(错色, `这些格递出去的话与定义表不符：\n${错色.join('\n')}`).toEqual([]);
    delete globalThis.window;
    delete globalThis.CustomEvent;
  });

  it('认不出的营火：`start` 不开对话（改前借 hub 那棵树说话），走的是回血 + 升级面板那条兜底', () => {
    installWindowShim();
    const sunk = { metas: [], healed: [], upgraded: [], souls: [], closed: [] };
    const rd = new RestDialogue(campfireGame(sunk));
    rd.start({ id: 'ghostfire', name: '陌生的火' });
    expect(sunk.metas, '借了别家的对话树').toEqual([]);
    expect(sunk.healed).toHaveLength(1);
    expect(sunk.upgraded).toEqual(['陌生的火']);
    delete globalThis.window;
    delete globalThis.CustomEvent;
  });

  it('"休息 / 升级"那一格真按下去：回血、开面板、第一次加 5 魂火（B63 —— 浏览器里六座全崩）', () => {
    installWindowShim();
    const sunk = { metas: [], healed: [], upgraded: [], souls: [], closed: [] };
    const rd = new RestDialogue(campfireGame(sunk));
    const restChoiceOf = (zone) => {
      const c = (REST_DIALOGUES[zone].nodes.start.choices ?? []).find((x) => x.action === 'rest');
      expect(c, `${zone} 的 start 那一格没有 action:'rest' 的选项了`).toBeTruthy();
      return c;
    };
    rd.start({ id: 'hub', name: REST_POINT_NAMES.hub });
    rd._pick(REST_DIALOGUES.hub, restChoiceOf('hub'), 'start');
    // 三层后果都要落地：只"没抛错"不算过 —— 当年抛错发生在 hide 之后，对话照样关得掉，
    // 所以界面上唯一能看出坏掉的地方是"血没回、面板没开"（浏览器读数：hp 停在 100 / 上限 118）
    expect(sunk.closed, '休息没把对话窗关掉').toHaveLength(1);
    expect(sunk.healed, '休息没回血').toHaveLength(1);
    expect(sunk.upgraded).toEqual([REST_POINT_NAMES.hub]);
    expect(sunk.souls, '首访营火余温没加魂火').toEqual([5]);
    // 换一座：`visited` 按营火记，所以第二座也算首访
    rd.start({ id: 'magic', name: REST_POINT_NAMES.magic });
    rd._pick(REST_DIALOGUES.magic, restChoiceOf('magic'), 'start');
    expect(sunk.healed).toHaveLength(2);
    expect(sunk.souls).toEqual([5, 5]);
    // 回老火再歇一次：回血照给，+5 魂火不重复发
    rd.start({ id: 'hub', name: REST_POINT_NAMES.hub });
    rd._pick(REST_DIALOGUES.hub, restChoiceOf('hub'), 'start');
    expect(sunk.healed).toHaveLength(3);
    expect(sunk.souls, '同一座火的首访魂火发了两次').toEqual([5, 5]);
    delete globalThis.window;
    delete globalThis.CustomEvent;
  });

  it('假 `game` 的每一格都挂得在真 `Game` 表面上：桩件不许供生产没有的字段（B63）', () => {
    const surface = gameSurface();
    const stub = campfireGame({ metas: [], healed: [], upgraded: [], souls: [], closed: [] });
    const 幻影 = Object.keys(stub).filter((k) => !surface.has(k));
    // 当年这里写的是 `combat: {...}` —— Game 顶层没这个名字，真口在 `player.combat`，
    // 于是 34 例全绿而浏览器里六座营火全崩。断言只问推导出来的表面，不抄名单。
    expect(幻影, `桩件供了 Game 没有的字段：${幻影.join(' / ')}`).toEqual([]);
    expect(surface.has('combat')).toBe(false);
    expect(stub.player.combat).toBeTruthy();
  });

  it('`CgJournalTab` 让每一行按自己写着的去画：营火行走 render，其余走 renderScene', () => {
    const called = [];
    const tab = Object.create(CgJournalTab.prototype);
    tab.game = {
      dialogCg: {
        // 桩件的形状 = 生产接口（render / renderScene 两个都在，且都返回一张图）
        render: (restId, nodeId, accent, mood) => { called.push(['render', restId, nodeId, accent, mood]); return 'data:r'; },
        renderScene: (scene, caption, accent, mood) => { called.push(['renderScene', scene, caption, accent, mood]); return 'data:s'; },
      },
    };
    const dialogueRow = CG_GALLERY_CATALOG.find((row) => row.unlock === 'dialogue');
    const bonusRow = CG_GALLERY_CATALOG.find((row) => !row.restId);
    expect([tab._urlFor(dialogueRow), tab._urlFor(bonusRow)]).toEqual(['data:r', 'data:s']);
    expect(called[0]).toEqual(['render', dialogueRow.restId, dialogueRow.nodeId, dialogueRow.accent, dialogueRow.mood]);
    // 这条是改动的正面证据：bonus 行不再被 `entry.zone` 冒充成一个营火节点
    expect(called[1]).toEqual(['renderScene', bonusRow.scene, bonusRow.caption, bonusRow.accent, bonusRow.mood]);
  });

  it('画不出来的行不把灯打开，也不给缩略图塞一张别的画', () => {
    const tab = Object.create(CgJournalTab.prototype);
    tab.game = { dialogCg: { render: () => null, renderScene: () => null } };
    const row = CG_GALLERY_CATALOG.find((r) => r.unlock === 'dialogue');
    expect(tab._urlFor(row)).toBe(null);
    tab.lightbox = null;
    tab.showLightbox(row);   // 不该抛：开灯前先看有没有图
  });

  it('渲染器说没有这张图 → 对话框把图位收起来（`cgImg.src` 不许留着上一格的图）', () => {
    const hidden = [];
    const d = Object.create(Dialog.prototype);
    d.cgRenderer = { render: () => null };
    d.cgEl = { classList: { add: (c) => hidden.push(c), remove: () => {}, toggle: () => {} } };
    d.cgImg = { src: 'data:上一格' };
    d._showCg('hub', 'origin', '#123456', 'calm');
    expect(hidden).toContain('hidden');
    expect(d.cgImg.src).toBe('');
  });
});
