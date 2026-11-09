/**
 * 配置中心协议面（B165）—— Spring Cloud Config 的**文档形状** + **可下发的旋钮**。
 *
 * ## 这一片在钉什么
 *
 * B163 舱壁、B164 追踪器落地之后，仓里多了一批**运行期可调**的数：舱壁的失败阈值与
 * 冷却秒、追踪器的保留帧数与每帧跨度上限。它们此前全写在**构造调用**里
 * （`建舱壁组({ 失败阈值: 3 })`）—— 改一个数就要改代码、重新构建、发一次版。
 *
 * 这一片把它们变成**可下发的旋钮**：一份 Config Server 形状的文档 ⇒ 立刻生效。
 *
 * ## 五组
 *
 * ① **文档形状**：`{ name, profiles, label, version, propertySources: [{ name, source }] }`。
 *    判据 `校验文档()` 住生产代码，测试只喂坏数据：坏 name / propertySources 非数组 /
 *    source 非对象 / **未知键** / **值不合校验** —— 一律当场拒并点名。
 * ② **合并优先级**：**靠前的 source 覆盖靠后的**（Spring 的排序）。
 * ③ **客户端**：`取` / `下发` / `订阅`（退订有出口）/ `版本` / `导出`（能反过来吃回去）/
 *    `清空`。失败的下发**不改值、不涨版本、不叫醒订阅者**。
 * ④ **旋钮真的生效**：舱壁的阈值与冷却、追踪器的每帧上限与保留帧 —— 下发即刻生效，
 *    **已有的**那一位也跟着换档（不只新建的）。
 * ⑤ **接线与性质**：Game 建配置并把两份名册登记全；配置中心**自己一份值都不抄**
 *    （它连旋钮的键都不许知道 —— 键是主人的，不是它的）。
 *
 * 判据住在生产代码（`src/platform/config.js` + 两个主人模块），这里只喂坏数据。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  建配置,
  校验文档,
  默认应用名,
  正整数,
  正整数至少一,
} from '../src/platform/config.js';
import {
  建舱壁组,
  舱壁可调项,
  默认失败阈值,
  默认冷却秒,
  阈值键,
  冷却键,
  打开,
} from '../src/platform/bulkhead.js';
import {
  建追踪,
  追踪可调项,
  默认保留帧,
  默认每帧上限,
  保留帧键,
  每帧上限键,
} from '../src/platform/tracing.js';
import { tick, resetForTest } from '../src/engine/FrameBudget.js';

const ROOT = process.cwd();
const 配置源文 = readFileSync(join(ROOT, 'src/platform/config.js'), 'utf8');
const 游戏源文 = readFileSync(join(ROOT, 'src/core/Game.js'), 'utf8');

/** 一份"应用名对得上、键都在名册里"的文档 */
const 造文档 = (源 = {}, 应用名 = 默认应用名) => ({
  name: 应用名,
  profiles: ['default'],
  label: 'main',
  version: '1',
  propertySources: [{ name: 'memory:./config/x.yml', source: 源 }],
});

/** 名册：舱壁两个旋钮 + 追踪器两个旋钮（生产侧那一份） */
const 全名册 = [...舱壁可调项, ...追踪可调项];

beforeEach(() => {
  resetForTest();
});

describe('配置中心协议面（B165）', () => {
  describe('① 文档形状：坏文档当场拒并点名', () => {
    it('好文档成：值就是文档里给的那些', () => {
      const 判 = 校验文档(造文档({ [阈值键]: 5 }), { 名册: 全名册 });
      expect(判.成, `好文档被判坏了：${判.原因}`).toBe(true);
      expect(判.值).toEqual({ [阈值键]: 5 });
    });

    it('文档不是一个对象（null / 数组 / 字符串）→ 当场拒', () => {
      for (const 坏 of [null, undefined, [], 'x', 42]) {
        const 判 = 校验文档(坏, { 名册: 全名册 });
        expect(判.成, `「${JSON.stringify(坏)}」没被拒`).toBe(false);
        expect(判.原因, '拒了但没说话').toBeTruthy();
      }
    });

    it('name 缺 / 与本客户端应用名不符 → 当场拒（别把别的应用的配置吃进来）', () => {
      const 缺 = 校验文档({ propertySources: [] }, { 名册: 全名册 });
      expect(缺.成).toBe(false);
      expect(缺.原因).toContain('name');
      const 不符 = 校验文档(造文档({}, '别的应用'), { 名册: 全名册 });
      expect(不符.成).toBe(false);
      expect(不符.原因, '没点名那个应用名').toContain('别的应用');
    });

    it('propertySources 不是数组 / 里有条不是对象 / source 不是键值对象 → 当场拒', () => {
      expect(校验文档({ ...造文档({}), propertySources: {} }, { 名册: 全名册 }).成).toBe(false);
      expect(校验文档({ ...造文档({}), propertySources: ['x'] }, { 名册: 全名册 }).成).toBe(false);
      expect(校验文档({ ...造文档({}), propertySources: [null] }, { 名册: 全名册 }).成).toBe(false);
      expect(校验文档({ ...造文档({}), propertySources: [{ name: 'a', source: 'x' }] }, { 名册: 全名册 }).成).toBe(false);
      expect(校验文档({ ...造文档({}), propertySources: [{ name: 'a', source: [] }] }, { 名册: 全名册 }).成).toBe(false);
    });

    it('**未知键当场拒**并点名那个键 —— 不静默吞掉，也不当"以后再说"', () => {
      const 判 = 校验文档(造文档({ 'crossrealm.不认识.的键': 1 }), { 名册: 全名册 });
      expect(判.成, '未知键被静默吞了').toBe(false);
      expect(判.原因, '没点名那个键').toContain('crossrealm.不认识.的键');
    });

    it('**值不合该键的校验即拒**并点名那个键 —— 不替它猜一个"差不多的值"', () => {
      for (const 坏值 of [0, -1, 1.5, '3', null]) {
        const 判 = 校验文档(造文档({ [阈值键]: 坏值 }), { 名册: 全名册 });
        expect(判.成, `阈值给了「${JSON.stringify(坏值)}」却被放过了`).toBe(false);
        expect(判.原因, '没点名那个键').toContain(阈值键);
      }
      // 冷却秒允许 0（"立刻放探测"是有意义的），但不许负数
      expect(校验文档(造文档({ [冷却键]: 0 }), { 名册: 全名册 }).成).toBe(true);
      expect(校验文档(造文档({ [冷却键]: -1 }), { 名册: 全名册 }).成).toBe(false);
    });

    it('空环境（没有 propertySources）合法：值全空，不是坏文档', () => {
      const 判 = 校验文档({ name: 默认应用名 }, { 名册: 全名册 });
      expect(判.成).toBe(true);
      expect(判.值).toEqual({});
    });
  });

  describe('② 合并优先级：靠前的 source 覆盖靠后的', () => {
    it('同一个键给了两次 ⇒ 靠前的那份赢', () => {
      const 文档 = {
        name: 默认应用名,
        propertySources: [
          { name: '靠前', source: { [阈值键]: 7 } },
          { name: '靠后', source: { [阈值键]: 9 } },
        ],
      };
      const 判 = 校验文档(文档, { 名册: 全名册 });
      expect(判.成).toBe(true);
      expect(判.值[阈值键], '靠后那份盖住了靠前那份 —— 优先级反了').toBe(7);
    });

    it('靠前那份值不合法时**整份拒**（不许悄悄退到靠后的那份）', () => {
      const 文档 = {
        name: 默认应用名,
        propertySources: [
          { name: '靠前', source: { [阈值键]: -5 } },
          { name: '靠后', source: { [阈值键]: 9 } },
        ],
      };
      const 判 = 校验文档(文档, { 名册: 全名册 });
      expect(判.成, '高优先级那份是坏的，却拿低优先级那份顶上了').toBe(false);
    });

    it('靠后那份里的未知键照样拒（名册管的是整份文档，不只是头一份）', () => {
      const 文档 = {
        name: 默认应用名,
        propertySources: [
          { name: '靠前', source: { [阈值键]: 7 } },
          { name: '靠后', source: { 'crossrealm.不认识.的键': 1 } },
        ],
      };
      const 判 = 校验文档(文档, { 名册: 全名册 });
      expect(判.成).toBe(false);
      expect(判.原因).toContain('crossrealm.不认识.的键');
    });
  });

  describe('③ 客户端：取 / 下发 / 订阅 / 版本 / 导出', () => {
    it('没下发过时取到的是**名册里的缺省**（主人给的那一份）', () => {
      const 配置 = 建配置({ 名册: 全名册 });
      expect(配置.取(阈值键)).toBe(默认失败阈值);
      expect(配置.取(冷却键)).toBe(默认冷却秒);
      expect(配置.取(保留帧键)).toBe(默认保留帧);
      expect(配置.取(每帧上限键)).toBe(默认每帧上限);
      // 调用方自带的兜底只在"名册里没这个键"时才生效
      expect(配置.取('没登记的键', '兜底')).toBe('兜底');
    });

    it('下发成功 ⇒ 取到新值、版本 +1', () => {
      const 配置 = 建配置({ 名册: 全名册 });
      const 前 = 配置.版本();
      const 回 = 配置.下发(造文档({ [阈值键]: 6 }));
      expect(回.成, `下发被拒：${回.原因}`).toBe(true);
      expect(配置.取(阈值键)).toBe(6);
      expect(配置.版本(), '版本没涨').toBe(前 + 1);
    });

    it('**失败的下发不改值、不涨版本、不叫醒订阅者**', () => {
      const 配置 = 建配置({ 名册: 全名册 });
      配置.下发(造文档({ [阈值键]: 6 }));
      const 版本 = 配置.版本();
      let 被叫醒 = 0;
      配置.订阅(() => { 被叫醒 += 1; });
      const 回 = 配置.下发(造文档({ 'crossrealm.不认识.的键': 1 }));
      expect(回.成).toBe(false);
      expect(回.原因, '拒了但没说话').toBeTruthy();
      expect(配置.取(阈值键), '坏文档把值改了').toBe(6);
      expect(配置.版本(), '坏文档把版本涨了').toBe(版本);
      expect(被叫醒, '坏文档把订阅者叫醒了').toBe(0);
    });

    it('订阅者被叫醒（收到配置实例）；退订之后不再被叫醒', () => {
      const 配置 = 建配置({ 名册: 全名册 });
      const 收到 = [];
      const 退订 = 配置.订阅((c) => { 收到.push(c); });
      expect(配置.订阅数()).toBe(1);
      配置.下发(造文档({ [阈值键]: 4 }));
      expect(收到.length, '订阅者没被叫醒').toBe(1);
      expect(收到[0], '叫醒时没把配置实例交给订阅者').toBe(配置);
      退订();
      expect(配置.订阅数()).toBe(0);
      配置.下发(造文档({ [阈值键]: 5 }));
      expect(收到.length, '退订之后还被叫醒了').toBe(1);
    });

    it('一个订阅者炸了不许带走别人', () => {
      const 配置 = 建配置({ 名册: 全名册 });
      let 好的被叫醒 = 0;
      配置.订阅(() => { throw new Error('这个订阅者炸了'); });
      配置.订阅(() => { 好的被叫醒 += 1; });
      expect(() => 配置.下发(造文档({ [阈值键]: 4 }))).not.toThrow();
      expect(好的被叫醒, '前一个订阅者炸了，把后面的也带走了').toBe(1);
    });

    it('导出是 Config Server 的形状，而且**反过来能吃回去**', () => {
      const 配置 = 建配置({ 名册: 全名册 });
      配置.下发(造文档({ [阈值键]: 8, [每帧上限键]: 32 }));
      const 出 = 配置.导出();
      expect(出.name).toBe(默认应用名);
      expect(Array.isArray(出.profiles)).toBe(true);
      expect(Array.isArray(出.propertySources)).toBe(true);
      expect(出.propertySources[0].source[阈值键]).toBe(8);
      expect(出.propertySources[0].source[每帧上限键]).toBe(32);
      // 导出的文档回吃 ⇒ 值不变（导出的东西是真能吃的）
      const 回 = 配置.下发(出);
      expect(回.成, `导出的东西自己都吃不下：${回.原因}`).toBe(true);
      expect(配置.取(阈值键)).toBe(8);
      expect(配置.取(每帧上限键)).toBe(32);
    });

    it('清空 ⇒ 回名册缺省，版本照涨，订阅者照被叫醒', () => {
      const 配置 = 建配置({ 名册: 全名册 });
      配置.下发(造文档({ [阈值键]: 8 }));
      let 被叫醒 = 0;
      配置.订阅(() => { 被叫醒 += 1; });
      const 版本 = 配置.版本();
      配置.清空();
      expect(配置.取(阈值键)).toBe(默认失败阈值);
      expect(配置.版本()).toBe(版本 + 1);
      expect(被叫醒).toBe(1);
    });
  });

  describe('④ 旋钮真的生效：下发即刻换档', () => {
    it('舱壁的失败阈值：下发即生效，**已有的**那条也跟着换', () => {
      const 配置 = 建配置({ 名册: 全名册 });
      const 组 = 建舱壁组({ 配置 });
      const 炸 = () => { throw new Error('炸'); };
      // 先按缺省（3 次）跑：两次失败还闭着
      组.跑('甲', 炸, 0.016);
      组.跑('甲', 炸, 0.016);
      expect(组.名册()[0].态).not.toBe(打开);
      // 下发阈值 1 ⇒ 立刻生效
      expect(配置.下发(造文档({ [阈值键]: 1 })).成).toBe(true);
      expect(组.旋钮().失败阈值, '旋钮读数没跟着变').toBe(1);
      expect(组.名册()[0].失败阈值, '已有的那条舱壁没换档').toBe(1);
      组.跑('甲', 炸, 0.016);
      expect(组.名册()[0].态, '阈值降到 1 之后下一次失败就该断开').toBe(打开);
    });

    it('舱壁的冷却秒：下发即生效，正在冷却的那条按新秒数重计', () => {
      const 配置 = 建配置({ 名册: 全名册 });
      const 组 = 建舱壁组({ 配置 });
      const 炸 = () => { throw new Error('炸'); };
      配置.下发(造文档({ [阈值键]: 1, [冷却键]: 30 }));
      组.跑('甲', 炸, 0.016);
      expect(组.名册()[0].态).toBe(打开);
      // 冷却 30 秒 ⇒ 现在放探测还是断着
      组.跑('甲', () => '好', 0.016);
      expect(组.名册()[0].态, '冷却期内就放探测了').toBe(打开);
      // 下发冷却 0 ⇒ 立刻放探测
      expect(配置.下发(造文档({ [阈值键]: 1, [冷却键]: 0 })).成).toBe(true);
      expect(组.名册()[0].冷却秒).toBe(0);
      const 回 = 组.跑('甲', () => '好', 0.016);
      expect(回.成, '冷却秒降到 0 之后还是不放探测').toBe(true);
      expect(组.名册()[0].态).toBe('closed');
    });

    it('追踪器的每帧上限：下发即生效，下一条 span 就按新上限记', () => {
      const 配置 = 建配置({ 名册: 全名册 });
      const 追踪 = 建追踪({ 配置 });
      追踪.设开着(true);
      tick();
      追踪.开帧();
      for (let i = 0; i < 5; i++) 追踪.记('x', 1, true);
      // 读数取的是**已完成**的那一帧（面板要答"上一帧谁吃掉的"），所以先收帧再读
      追踪.收帧();
      expect(追踪.读数().跨度数, '缺省上限 256 不该只记 5 条的量').toBe(5);
      // 下发上限 2 ⇒ 下一帧只记 2 条，其余记溢出
      expect(配置.下发(造文档({ [每帧上限键]: 2 })).成).toBe(true);
      expect(追踪.旋钮().每帧上限).toBe(2);
      tick();
      追踪.开帧();
      for (let i = 0; i < 5; i++) 追踪.记('x', 1, true);
      追踪.收帧();
      const 读数 = 追踪.读数();
      expect(读数.跨度数, '新上限没生效').toBe(2);
      expect(读数.溢出).toBe(3);
    });

    it('追踪器的保留帧：下发即生效，档立刻挤掉超出的老帧', () => {
      const 配置 = 建配置({ 名册: 全名册 });
      const 追踪 = 建追踪({ 配置 });
      追踪.设开着(true);
      for (let i = 0; i < 4; i++) {
        tick();
        追踪.开帧();
        追踪.记('x', 1, true);
        追踪.收帧();
      }
      expect(追踪.导出().length, '四帧各一条子 span 加四个根').toBe(8);
      expect(配置.下发(造文档({ [保留帧键]: 1 })).成).toBe(true);
      expect(追踪.旋钮().保留帧).toBe(1);
      expect(追踪.导出().length, '保留帧降到 1 之后档没挤').toBe(2);
    });

    it('**上限旋钮一动，两帧的 span id 不许撞**（id 空间不许跟着旋钮移）', () => {
      // 早先 id 的跨距取"每帧上限 + 1" ⇒ 上限一变，整个 id 空间就跟着移，
      // 于是两帧的 span id 会撞上（撞了之后 parentId 就指错人了）。
      const 配置 = 建配置({ 名册: 全名册 });
      const 追踪 = 建追踪({ 配置 });
      追踪.设开着(true);
      tick();
      追踪.开帧();
      追踪.记('甲', 1, true);
      追踪.收帧();
      // 中途改上限（跨距跟着变的话，id 就会撞）
      expect(配置.下发(造文档({ [每帧上限键]: 4 })).成).toBe(true);
      tick();
      追踪.开帧();
      追踪.记('乙', 1, true);
      追踪.收帧();
      const 出 = 追踪.导出();
      const ids = 出.map((s) => s.id);
      expect(new Set(ids).size, '两帧的 span id 撞了').toBe(ids.length);
    });

    it('旋钮的缺省与校验住在**主人模块**里，配置中心只认名册', () => {
      expect(舱壁可调项[0].键).toBe(阈值键);
      expect(舱壁可调项[0].缺省).toBe(默认失败阈值);
      expect(舱壁可调项[1].缺省).toBe(默认冷却秒);
      expect(追踪可调项[0].缺省).toBe(默认保留帧);
      expect(追踪可调项[1].缺省).toBe(默认每帧上限);
      // 键是 ASCII 点号路径（Config Server 的键形状）
      for (const 项 of [...舱壁可调项, ...追踪可调项]) {
        expect(项.键, `键「${项.键}」不是 ASCII 点号路径`).toMatch(/^[a-z0-9]+(\.[a-z0-9-]+)+$/);
        expect(项.说明.length, `键「${项.键}」没写说明`).toBeGreaterThan(0);
      }
      // 校验函数住在主人那边：阈值至少 1，冷却至少 0
      expect(正整数至少一(1)).toBe(true);
      expect(正整数至少一(0)).toBe(false);
      expect(正整数(0)).toBe(true);
      expect(正整数(-1)).toBe(false);
    });
  });

  describe('⑤ 接线与性质', () => {
    it('Game 建配置、登记两份名册、把它交给追踪器与舱壁组', () => {
      expect(游戏源文).toMatch(/this\.配置 = 建配置\(\{[^}]*舱壁可调项[^}]*追踪可调项/);
      expect(游戏源文).toMatch(/this\.追踪 = 建追踪\(\{[^}]*配置: this\.配置/);
      expect(游戏源文).toMatch(/建舱壁组\(\{[^}]*追踪: this\.追踪[^}]*配置: this\.配置/);
    });

    it('配置必须建在追踪器与舱壁组**之前**（那两位拿它当旋钮的读数口）', () => {
      const 配置位 = 游戏源文.indexOf('this.配置 = 建配置');
      const 追踪位 = 游戏源文.indexOf('this.追踪 = 建追踪');
      const 舱壁位 = 游戏源文.indexOf('this.舱壁 = 建舱壁组');
      expect(配置位, 'Game 里没建配置').toBeGreaterThan(-1);
      expect(配置位, '配置建晚了 —— 追踪器/舱壁组拿不到旋钮的读数口').toBeLessThan(追踪位);
      expect(追踪位).toBeLessThan(舱壁位);
    });

    it('Game 不再手写那两个数（旋钮归配置中心管，构造参数只当兜底）', () => {
      expect(游戏源文).not.toMatch(/建舱壁组\(\{[^}]*失败阈值/);
      expect(游戏源文).not.toMatch(/建舱壁组\(\{[^}]*冷却秒/);
    });

    it('**配置中心自己一份值都不抄**：它连旋钮的键都不许知道', () => {
      // 键是主人的（`舱壁可调项` / `追踪可调项` 里那些），配置中心只认名册 ——
      // 它自己抄一份键就是"两份真源"，值早晚会分家。
      for (const 键 of [阈值键, 冷却键, 保留帧键, 每帧上限键]) {
        expect(配置源文, `配置中心自己写了旋钮的键「${键}」—— 两份真源`).not.toContain(键);
      }
      expect(配置源文).not.toMatch(/crossrealm\./);
    });

    it('反向控制：把下游旋钮换成"名字不认识" ⇒ 同一把尺子必须点名它', () => {
      // 判据在生产代码（`校验文档`），这里只喂坏数据。
      const 好 = 校验文档(造文档({ [阈值键]: 3 }), { 名册: 全名册 });
      expect(好.成, '好文档被判成坏的了').toBe(true);
      const 坏 = 校验文档(造文档({ [阈值键]: 3, 'crossrealm.多写的键': 1 }), { 名册: 全名册 });
      expect(坏.成, '多出来的键没被点名').toBe(false);
      expect(坏.原因).toContain('crossrealm.多写的键');
    });

    it('反向控制：名册给的值被换掉 ⇒ 校验必须点名那个键', () => {
      // 名册说"至少 1"，文档给 0 ⇒ 拒（不许拿名册的缺省顶上来）
      const 判 = 校验文档(造文档({ [阈值键]: 0 }), { 名册: 全名册 });
      expect(判.成, '0 被放过了').toBe(false);
      expect(判.原因).toContain(阈值键);
    });
  });
});
