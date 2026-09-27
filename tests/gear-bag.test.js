/**
 * 背包与自选穿戴（W-B5 切片4）。
 *
 * 用户拍板的两条规则写在最前面，用例全部围绕它们：
 * 1. **拾取 = 都进包**（换下的那件也进包），只有**包满**才折魂 —— 折魂是显式兜底，不是常态；
 * 2. **面板宿主 = 升级面板的第四个"装备"页签**，不新建独立面板。
 *
 * 四层，各防一件事：
 * 1. 数据层：容量与槽名两张表都进了注册表，写错开机红（0 格 = 永远捡不起来；少一个槽名 = 那一行永远空白）；
 * 2. 账本层：进包、取出、穿、卸、存读档 —— 第二本包账就是 B36 那一族，所以这四条入口一个都不许少；
 * 3. 拾取那一段：三条路（换上进包 / 不换进包 / 包满折魂）走的都是**真的** `Game.prototype.pickUpGear`
 *    —— 假 Game 里自己重写一遍拼装，测的就不是生产代码了（与 `gear-drop` 同一条纪律）；
 * 4. 面板静态门禁：页签 ↔ 区块双向、UI 不许抄容量字面量、不许绕过那两个入口自己摆弄 `.bag`。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GEAR_BAG, GEAR_SLOTS, GEAR_SLOT_NAMES, bagIsFull, isGearInstance, soulValue, gearLabel,
} from '../src/content/gear.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { PlayerStats } from '../src/game/PlayerStats.js';
import { Game } from '../src/core/Game.js';

globalThis.window = { dispatchEvent() {} };
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

const SRC = join(process.cwd(), 'src');
const read = (p) => readFileSync(join(SRC, p), 'utf8');
const PANEL = read('ui/UpgradePanel.js');
const HTML = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

/** 一件"实例数据"：`affixes` 必须是数组，稀有度必须撑得住词缀的 minRarity */
const inst = (base, rarity = 'common', affixes = []) => ({ base, rarity, affixes });
const fullBag = (s) => { while (!s.bagFull) s.bagAdd(inst('ash-charm')); };
const mutate = (kind, fn) => checkContent(CONTENT_TABLES.map((t) => (
  t.kind === kind ? { ...t, table: fn(structuredClone(t.table)) } : t)));

/** 真拾取：只借 `pickUpGear` 那一段，宿主只给它真正读到的两格（账 + 提示） */
const pick = (game, instance) => Game.prototype.pickUpGear.call(game, instance);
const host = () => ({
  stats: new PlayerStats(),
  dialog: { toasts: [], toast(t) { this.toasts.push(t); } },
});

/* ------------------------------------------------------------------ *
 * 一、数据层：容量与槽名两张表
 * ------------------------------------------------------------------ */

describe('一、容量与槽名：写错开机就红', () => {
  it('容量是 20 格（这是产品数值，写死在表上：改它是一次平衡决定，不是随手一改的字面量）', () => {
    expect(GEAR_BAG.capacity).toBe(20);
    expect(Number.isInteger(GEAR_BAG.capacity) && GEAR_BAG.capacity > 0).toBe(true);
  });

  it('判满只有一处：非数组也算满（宁可"装不下"，也不往没账的东西里塞）', () => {
    const s = new PlayerStats();
    expect(bagIsFull([])).toBe(false);
    expect(bagIsFull(s.bag)).toBe(false);
    expect(bagIsFull(new Array(GEAR_BAG.capacity))).toBe(true);
    expect(bagIsFull(null)).toBe(true);
    expect(bagIsFull('nope')).toBe(true);
  });

  it('两张新表都进了注册表（gearBag / gearSlotNames）', () => {
    const kinds = CONTENT_TABLES.map((t) => t.kind);
    expect(kinds, 'gearBag 没登记').toContain('gearBag');
    expect(kinds, 'gearSlotNames 没登记').toContain('gearSlotNames');
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });

  it('拒绝侧：容量写 0（= 永远捡不起来）、写 101、槽名少一格或多一格 —— 都要红', () => {
    expect(mutate('gearBag', (t) => { t.capacity = 0; return t; }).join('\n'))
      .toMatch(/gearBag\["capacity"\]: 至少 1/);
    expect(mutate('gearBag', (t) => { t.capacity = 101; return t; }).join('\n'))
      .toMatch(/gearBag\["capacity"\]: 至多 100/);
    expect(mutate('gearBag', (t) => { t.capacity = 1.5; return t; }).join('\n'))
      .toMatch(/gearBag\["capacity"\]: 期望整数/);
    expect(mutate('gearSlotNames', (t) => { delete t.sigil; return t; }).join('\n'))
      .toMatch(/gearSlotNames: 缺 "sigil"/);
    expect(mutate('gearSlotNames', (t) => { t.ghost = '幽灵格'; return t; }).join('\n'))
      .toMatch(/gearSlotNames: "ghost" 不是任何槽位/);
  });

  it('槽名与槽位表双向对上：每一个槽都有中文名，每一个中文名都属于某个槽', () => {
    expect(Object.keys(GEAR_SLOT_NAMES).sort()).toEqual([...GEAR_SLOTS].sort());
    for (const [slot, name] of Object.entries(GEAR_SLOT_NAMES)) {
      expect(name, `${slot} 的中文名是空的（界面上那一行会是空白）`).not.toBe('');
    }
  });
});

/* ------------------------------------------------------------------ *
 * 二、包账本：四个入口 + 存读档
 * ------------------------------------------------------------------ */

describe('二、包账本：进、出、穿、卸、存读档', () => {
  it('进包的是克隆：改调用方自己那个对象，不许把包里那件一起改了', () => {
    const s = new PlayerStats();
    const raw = inst('ash-charm', 'rare', ['twin-fang']);
    expect(s.bagAdd(raw)).toBe(true);
    raw.rarity = 'common';
    expect(s.bag[0].rarity).toBe('rare');
    expect(s.bagCount).toBe(1);
    expect(s.bagCapacity).toBe(GEAR_BAG.capacity);
  });

  it('坏件拒收且不进包（不是"丢进去再说"，也不静默扩容）', () => {
    const s = new PlayerStats();
    expect(s.bagAdd({ base: 'nope', rarity: 'common', affixes: [] })).toBe(false);
    expect(s.bagAdd(null)).toBe(false);
    expect(s.bagAdd('ash-charm')).toBe(false);
    expect(s.bagCount).toBe(0);
    expect(isGearInstance({ base: 'ash-charm', rarity: 'common' })).toBe(false);
  });

  it('满则拒收：塞到容量为止，第容量+1 件 false，包里仍是容量件', () => {
    const s = new PlayerStats();
    for (let i = 0; i < GEAR_BAG.capacity; i++) expect(s.bagAdd(inst('ash-charm'))).toBe(true);
    expect(s.bagFull).toBe(true);
    expect(s.bagAdd(inst('ash-charm'))).toBe(false);
    expect(s.bagCount).toBe(GEAR_BAG.capacity);
    expect(s.bag.length).toBe(GEAR_BAG.capacity);
  });

  it('取出第几格：越界与非整数返回 null，取走之后计数当场少一格', () => {
    const s = new PlayerStats();
    s.bagAdd(inst('ash-charm'));
    s.bagAdd(inst('quill-sigil', 'uncommon', ['arcane-lens']));
    expect(s.bagTake(-1)).toBeNull();
    expect(s.bagTake(9)).toBeNull();
    expect(s.bagTake(1.5)).toBeNull();
    const taken = s.bagTake(0);
    expect(taken).toMatchObject({ base: 'ash-charm' });
    expect(s.bagCount).toBe(1);
    expect(s.bagTake(0)).toMatchObject({ base: 'quill-sigil' });
    expect(s.bagCount).toBe(0);
    expect(s.bagTake(0)).toBeNull();
  });

  it('穿上包里那件：被换下的回到刚腾出来的那一格，包的件数不变', () => {
    const s = new PlayerStats();
    const worn = inst('ash-charm');                 // 天生 +1 vigor
    const spare = inst('oath-charm', 'rare');       // +1 vigor +1 endurance，严格更好
    s.equip('charm', worn);
    s.bagAdd(spare);
    const before = s.bagCount;
    const r = s.wearFromBag(0);
    expect(r).toMatchObject({ slot: 'charm', instance: spare, replaced: worn });
    expect(s.gear.charm).toMatchObject({ base: 'oath-charm' });
    expect(s.bag[0]).toMatchObject({ base: 'ash-charm' });
    expect(s.bagCount).toBe(before);
    expect(s.endurance, '穿上的那几点当场生效（同一本账）').toBe(2);
  });

  it('包满时穿：先取后穿的次序保证"换下的那件"永远回得去（不存在卡在中间的状态）', () => {
    const s = new PlayerStats();
    s.equip('charm', inst('tide-charm'));
    fullBag(s);
    s.bag[0] = inst('oath-charm', 'rare');      // 把要穿的那件摆在包首（这一格测的是"穿"，不是"进包"）
    const before = s.bagCount;
    const r = s.wearFromBag(0);
    expect(r.replaced).toMatchObject({ base: 'tide-charm' });
    expect(s.gear.charm).toMatchObject({ base: 'oath-charm' });
    expect(s.bagCount).toBe(before);
    expect(s.bagFull).toBe(true);
    expect(s.bag.at(-1), '换下的那件必须在包里').toMatchObject({ base: 'tide-charm' });
    expect(s.wearFromBag(999)).toBe(false);
    expect(s.wearFromBag(-1)).toBe(false);
  });

  it('卸下：有格就进包并返回那件；包满就 false，身上那件原样不动', () => {
    const s = new PlayerStats();
    const worn = inst('quill-sigil', 'uncommon');
    s.equip('sigil', worn);
    const prev = s.storeFromSlot('sigil');
    expect(prev).toMatchObject({ base: 'quill-sigil' });
    expect(s.gear.sigil).toBeNull();
    expect(s.bagCount).toBe(1);

    const s2 = new PlayerStats();
    s2.equip('charm', inst('ash-charm'));
    fullBag(s2);
    expect(s2.storeFromSlot('charm')).toBe(false);
    expect(s2.gear.charm, '包满时身上那件不许被动').toMatchObject({ base: 'ash-charm' });
    expect(s2.bagCount).toBe(GEAR_BAG.capacity);
  });

  it('卸下未知槽位是程序写错了，直接抛（不静默吞掉）', () => {
    const s = new PlayerStats();
    expect(() => s.storeFromSlot('ghost')).toThrow(/未知的装备槽/);
    expect(() => s.storeFromSlot(undefined)).toThrow(/未知的装备槽/);
  });

  it('存档带上包，读档还原；坏件只丢它自己，不连累同包的合法件', () => {
    const s = new PlayerStats();
    s.bagAdd(inst('ash-charm'));
    s.bagAdd(inst('war-sigil', 'epic', ['archmagistone']));
    const saved = s.toJSON();
    expect(saved.bag).toHaveLength(2);

    const back = new PlayerStats();
    back.fromJSON(saved);
    expect(back.bag).toMatchObject(saved.bag);
    expect(back.bag).not.toBe(saved.bag);          // 不共享引用

    const dirty = structuredClone(saved);
    dirty.bag.push({ base: 'nope', rarity: 'common', affixes: [] });
    dirty.bag.push(null);
    const back2 = new PlayerStats();
    back2.fromJSON(dirty);
    expect(back2.bagCount).toBe(2);

    const missing = structuredClone(saved);
    delete missing.bag;
    const back3 = new PlayerStats();
    back3.fromJSON(missing);
    expect(back3.bag).toEqual([]);
    expect(back3.toJSON().bag).toEqual([]);
  });

  it('容量只挡新增：读档时已有的超量件一件都不许凭空消失', () => {
    const saved = new PlayerStats().toJSON();
    saved.bag = Array.from({ length: GEAR_BAG.capacity + 5 }, () => inst('ash-charm'));
    const s = new PlayerStats();
    s.fromJSON(saved);
    expect(s.bagCount).toBe(GEAR_BAG.capacity + 5);
    expect(s.bagFull, '已经装着的照样算满，新增照样拒收').toBe(true);
    expect(s.bagAdd(inst('ash-charm'))).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * 三、拾取：三条路都走真的 Game.prototype.pickUpGear
 * ------------------------------------------------------------------ */

describe('三、拾取：都进包，满了才折魂', () => {
  it('槽是空的 → 直接穿上，包一件不动', () => {
    const g = host();
    const choice = pick(g, inst('ash-charm'));
    expect(choice.action).toBe('equip');
    expect(g.stats.gear.charm).toMatchObject({ base: 'ash-charm' });
    expect(g.stats.bagCount).toBe(0);
    expect(g.dialog.toasts.at(-1)).toBe(`穿上：${gearLabel(inst('ash-charm'))}`);
  });

  it('严格更好 → 换上，**换下的那件进包**，一魂不折', () => {
    const g = host();
    const old = inst('ash-charm');
    const fresh = inst('oath-charm', 'rare');
    g.stats.equip('charm', old);
    pick(g, fresh);
    expect(g.stats.gear.charm).toMatchObject({ base: 'oath-charm' });
    expect(g.stats.bag).toHaveLength(1);
    expect(g.stats.bag[0]).toMatchObject({ base: 'ash-charm' });
    expect(g.stats.souls, '包有格子时一个魂都不许折').toBe(0);
    expect(g.dialog.toasts.at(-1)).toContain('进了背包');
  });

  it('不更好 → 不换，那件进包，提示里的格数来自 bagCount/bagCapacity', () => {
    const g = host();
    const worn = inst('oath-charm', 'epic', ['bulwark-oath']);
    const worse = inst('ash-charm');
    g.stats.equip('charm', worn);
    const choice = pick(g, worse);
    expect(choice.action).toBe('dust');
    expect(g.stats.gear.charm, '身上的没被换掉').toMatchObject({ base: 'oath-charm' });
    expect(g.stats.bag).toHaveLength(1);
    expect(g.stats.souls).toBe(0);
    expect(g.dialog.toasts.at(-1))
      .toBe(`拾取：${gearLabel(worse)} —— 放进背包（${g.stats.bagCount}/${g.stats.bagCapacity}）`);
  });

  it('包满 + 不更好 → 折魂，且明说"背包已满"', () => {
    const g = host();
    g.stats.equip('charm', inst('oath-charm', 'epic', ['bulwark-oath']));
    fullBag(g.stats);
    const worse = inst('ash-charm');
    pick(g, worse);
    expect(g.stats.souls).toBe(soulValue('common'));
    expect(g.stats.bagCount).toBe(GEAR_BAG.capacity);
    expect(g.dialog.toasts.at(-1)).toContain('背包已满');
    expect(g.dialog.toasts.at(-1)).toContain('魂');
  });

  it('包满 + 严格更好 → 换上，旧的折魂（这是唯一一条"换下的不在包里"的路，必须说得出理由）', () => {
    const g = host();
    const old = inst('ash-charm');
    g.stats.equip('charm', old);
    fullBag(g.stats);
    const fresh = inst('oath-charm', 'rare');
    pick(g, fresh);
    expect(g.stats.gear.charm).toMatchObject({ base: 'oath-charm' });
    expect(g.stats.bagCount).toBe(GEAR_BAG.capacity);
    expect(g.stats.souls).toBe(soulValue('common'));
    expect(g.dialog.toasts.at(-1)).toContain('背包已满');
    expect(g.dialog.toasts.at(-1)).toContain('换上');
  });

  it('非法实例什么都不做（返回 null，账与提示都不动）', () => {
    const g = host();
    expect(pick(g, { base: 'nope', rarity: 'common', affixes: [] })).toBeNull();
    expect(pick(g, null)).toBeNull();
    expect(g.stats.bagCount).toBe(0);
    expect(g.dialog.toasts).toEqual([]);
    expect(g.stats.souls).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * 四、面板静态门禁：页签、抄字面量、第二本包账
 * ------------------------------------------------------------------ */

describe('四、装备页签：静态门禁', () => {
  it('index.html 的页签与区块双向成对：少了任一半点不出那个页', () => {
    expect(HTML, 'index.html 里没有 tab-gear').toMatch(/id="tab-gear"/);
    expect(HTML, 'index.html 里没有 upgrade-gear-section').toMatch(/id="upgrade-gear-section"/);
    expect(HTML, '背包清单那三格缺一个').toMatch(/id="gear-slots"/);
    expect(HTML).toMatch(/id="gear-bag"/);
    expect(HTML).toMatch(/id="gear-bag-count"/);

    for (const m of HTML.matchAll(/id="(tab-[\w-]+)"/g)) {
      const name = m[1].replace(/^tab-/, '');
      expect(HTML, `${m[1]} 没有对应的区块`).toContain(`id="upgrade-${name}-section"`);
    }
    // 面板这一侧：四个页签都在切，gear 那一格调 renderGear
    expect(PANEL).toMatch(/tab-gear/);
    expect(PANEL).toMatch(/upgrade-gear-section/);
    expect(PANEL).toMatch(/this\.renderGear\(\)/);
  });

  it('UI 不许抄容量：面板里没有 20 这个字面量，格数一律问 bagCount/bagCapacity', () => {
    expect(PANEL, '面板里出现了手抄的 20').not.toMatch(/\b20\b/);
    expect(PANEL).toMatch(/bagCapacity/);
    expect(PANEL).toMatch(/bagCount/);
    expect(PANEL, 'N/CAPACITY 那一句必须来自账本').toContain('${s.bagCount}/${s.bagCapacity}');
  });

  it('面板不许自建第二本包账：只许经 storeFromSlot / wearFromBag 两个入口，且不许写 .bag', () => {
    expect(PANEL).toMatch(/storeFromSlot/);
    expect(PANEL).toMatch(/wearFromBag/);
    expect(PANEL, '面板绕过入口直接写包').not.toMatch(/\.bag\s*=/);
    expect(PANEL, '面板直接改动包里的元素').not.toMatch(/\.(push|pop|shift|unshift|splice|sort|reverse)\(/);
    expect(PANEL, '面板自己摆弄身上那两格（那是 PlayerStats 的账）').not.toMatch(/\bstats\.(gear|equip|unequip)\b/);
  });

  it('槽名与件名都问表：面板里没有手写的中文槽名，也没有第二处拼装', () => {
    expect(PANEL).toMatch(/GEAR_SLOT_NAMES/);
    expect(PANEL).toMatch(/gearLabel/);
    expect(PANEL, '槽名被抄进了面板（表改了这里不跟）').not.toContain('护符');
    expect(PANEL, '槽名被抄进了面板（表改了这里不跟）').not.toContain('印记');
    expect(PANEL, '件名在面板里被自己拼了一遍').not.toMatch(/稀有·|凡品·|史诗·/);
  });
});
