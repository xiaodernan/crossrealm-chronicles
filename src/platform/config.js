/**
 * 配置中心（Config Center）—— Spring Cloud Config **协议面**的**内化**。
 *
 * ## 要补的缺口：旋钮的值写死在代码里
 *
 * 仓里有一批**运行期可调**的旋钮：舱壁的失败阈值与冷却秒、追踪器的保留帧数与每帧跨度上限。
 * 它们今天全写在**构造调用**里（`建舱壁组({ 失败阈值: 3 })`）—— 改一个数就要改代码、
 * 就要重新构建、就要发一次版。真接一台 Config Server 时，这些数该**下发**。
 *
 * ## 借 Spring Cloud 的哪几个契约
 *
 * | 契约 | 在这里的落法 |
 * |------|--------------|
 * | **文档形状（Config Server）** | `{ name, profiles, label, version, propertySources: [{ name, source }] }` |
 * | **propertySources 的优先级** | **靠前的 source 覆盖靠后的**（Spring 的排序：最前面的优先级最高） |
 * | **拉取 / 下发** | 客户端能吃一份文档（`下发`），也能把自己的现状**原样导出**成那份形状（`导出`） |
 * | **刷新事件（RefreshEvent）** | 订阅者：值一变就被叫醒（`订阅`），退订有出口（返回退订函数） |
 *
 * ## 三条纪律
 *
 * 1. **旋钮的缺省与校验住在它的主人手里**（`bulkhead.js` 管舱壁那几个、`tracing.js` 管追踪器
 *    那几个）—— 配置中心只认**名册**（键 / 缺省 / 校验 / 说明），不自己抄一份值。
 *    抄一份就是"两份真源"，值早晚会分家。
 * 2. **未知键当场拒**：名册里没有的键不静默吞掉，也不当"以后再说"—— 错点名出来。
 *    值不合该键的校验同样拒（**不替它猜一个"差不多的值"**）。
 * 3. **键是 ASCII 点号路径**（形如 `应用.子系统.旋钮名`）：这是 Config Server 的键形状，
 *    将来真接一台服务端，前端这一层不改。**具体有哪几个键、每个键叫什么，本模块一概不知道**
 *    —— 那份名册由各个主人模块递进来（写在这里就是"两份真源"，纪律 1 说的正是这件事）。
 */

/** 默认应用名（真接 Config Server 时它就是 `spring.application.name`） */
export const 默认应用名 = 'crossrealm';

/**
 * 名册里的一条旋钮。
 * @typedef {object} 可调项
 * @property {string} 可调项.键 点号路径（Config Server 的键形状）
 * @property {any} 可调项.缺省 缺省值（主人给的）
 * @property {Function} 可调项.校验 (值) => boolean 值合不合格
 * @property {string} 可调项.说明 人话（出错时点名用）
 */

/** 整数且 ≥ 0 */
export const 正整数 = (值) => Number.isInteger(值) && 值 >= 0;
/** 整数且 ≥ 1 */
export const 正整数至少一 = (值) => Number.isInteger(值) && 值 >= 1;

/**
 * 校验一份 Config Server 形状的文档 —— **判据住生产代码**，测试只喂坏数据。
 *
 * @param {object} 文档 待校验的文档
 * @param {object} 选
 * @param {string} 选.应用名 本客户端的应用名（文档的 `name` 必须与它一致）
 * @param {Array<可调项>} 选.名册 可调项名册（未知键当场拒）
 * @returns {{成: boolean, 原因: string|null, 值: object}} `值` = 合并后的有效值（成时才可信）
 */
export function 校验文档(文档, { 应用名 = 默认应用名, 名册 = [] } = {}) {
  const 拒绝 = (原因) => ({ 成: false, 原因, 值: {} });
  if (!文档 || typeof 文档 !== 'object' || Array.isArray(文档)) {
    return 拒绝('文档不是一个对象');
  }
  if (typeof 文档.name !== 'string' || 文档.name.length === 0) {
    return 拒绝('文档缺 name（那是应用名）');
  }
  if (文档.name !== 应用名) {
    return 拒绝(`文档的 name 是「${文档.name}」，本客户端的应用名是「${应用名}」—— 别把别的应用的配置吃进来`);
  }
  if (文档.propertySources !== undefined && !Array.isArray(文档.propertySources)) {
    return 拒绝('propertySources 必须是数组');
  }
  const 源们 = 文档.propertySources ?? [];
  for (const 源 of 源们) {
    if (!源 || typeof 源 !== 'object' || Array.isArray(源)) {
      return 拒绝('propertySources 里有一条不是对象');
    }
    if (源.source !== undefined && (typeof 源.source !== 'object' || 源.source === null || Array.isArray(源.source))) {
      return 拒绝(`propertySources 里的「${源.name ?? '无名源'}」的 source 不是一个键值对象`);
    }
  }

  // 合并：**靠前的 source 优先级最高**（Spring 的排序），所以先到先得。
  const 名册表 = new Map(名册.map((项) => [项.键, 项]));
  const 值 = {};
  for (const 源 of 源们) {
    for (const [键, 值项] of Object.entries(源.source ?? {})) {
      if (Object.prototype.hasOwnProperty.call(值, 键)) continue; // 前面的 source 已经说了算
      const 项 = 名册表.get(键);
      if (!项) {
        return 拒绝(`键「${键}」不在名册里 —— 不知道它是什么，就不许它生效`);
      }
      let 合格 = false;
      try { 合格 = Boolean(项.校验(值项)); } catch { 合格 = false; }
      if (!合格) {
        return 拒绝(`键「${键}」的值不合它的校验（${项.说明}）`);
      }
      值[键] = 值项;
    }
  }
  return { 成: true, 原因: null, 值 };
}

/**
 * 建一个配置客户端。
 *
 * @param {object} 选
 * @param {Array<可调项>} 选.名册 可调项名册（各主人给的）
 * @param {string} 选.应用名
 * @param {Array<string>} 选.档案 profiles（文档形状里的字段）
 * @param {string} 选.标签 label（文档形状里的字段）
 */
export function 建配置({ 名册: 名册项 = [], 应用名 = 默认应用名, 档案 = ['default'], 标签 = 'main' } = {}) {
  const 名册表 = new Map(名册项.map((项) => [项.键, 项]));
  const 键集 = new Set(名册表.keys());
  let 值 = Object.create(null);   // 当前生效的值
  let 版本 = 0;
  const 订阅者 = new Set();

  /** 名册给的缺省（唯一的缺省来源） */
  const 缺省值 = (键) => (名册表.get(键)?.缺省);

  const 自己 = {
    应用名,
    档案,
    标签,

    /** 当前生效的值（没下发的键走名册里的缺省） */
    取(键, 缺省 = 缺省值(键)) {
      if (Object.prototype.hasOwnProperty.call(值, 键)) return 值[键];
      return 缺省;
    },

    /** 当前版本号（每成功下发一次 +1） */
    版本() {
      return 版本;
    },

    /** 名册（诊断用）：键、缺省、人话说明 —— 不含值 */
    名册() {
      return 名册项.map((项) => ({ 键: 项.键, 缺省: 项.缺省, 说明: 项.说明 }));
    },

    /** 当前生效的值（一份副本，外部改不到内部账） */
    读数() {
      const 出 = {};
      for (const 键 of 键集) 出[键] = 自己.取(键);
      return 出;
    },

    /**
     * 吃一份 Config Server 形状的文档。
     * @returns {{成: boolean, 原因: string|null, 版本: number}}
     */
    下发(文档) {
      const 判 = 校验文档(文档, { 应用名, 名册: 名册项 });
      if (!判.成) return { 成: false, 原因: 判.原因, 版本 };
      值 = Object.assign(Object.create(null), 判.值);
      版本 += 1;
      // 刷新事件：值变了就把订阅者叫醒（Spring 的 RefreshEvent）。
      for (const 回调 of [...订阅者]) {
        try { 回调(自己); } catch { /* 一个订阅者炸了不许带走别人 */ }
      }
      return { 成: true, 原因: null, 版本 };
    },

    /**
     * 订阅刷新。返回一个**退订函数**（Spring 的 `RefreshEventListener` 也得有退出口）。
     */
    订阅(回调) {
      if (typeof 回调 !== 'function') throw new Error('订阅者得是个函数');
      订阅者.add(回调);
      return () => { 订阅者.delete(回调); };
    },

    /** 订阅者个数（诊断用） */
    订阅数() {
      return 订阅者.size;
    },

    /** 导出：把自己现状写成 Config Server 的文档形状（导出的东西反过来能吃回去） */
    导出() {
      const source = {};
      for (const 键 of 键集) source[键] = 自己.取(键);
      return {
        name: 应用名,
        profiles: [...档案],
        label: 标签,
        version: String(版本),
        state: null,
        propertySources: [
          { name: `memory:./config/${应用名}.yml`, source },
        ],
      };
    },

    /** 恢复成名册里的缺省（版本 +1，订阅者照样被叫醒） */
    清空() {
      值 = Object.create(null);
      版本 += 1;
      for (const 回调 of [...订阅者]) {
        try { 回调(自己); } catch { /* 同上 */ }
      }
      return 版本;
    },
  };

  return 自己;
}
