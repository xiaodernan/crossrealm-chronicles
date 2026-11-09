/**
 * 写者租约（Lease）与**栅栏令牌**（fencing token）—— Spring Cloud Zookeeper / Consul 那套
 * **选主与分布式锁**语义在浏览器里的**内化**。
 *
 * ## 要补的缺口：B167 让"被别人写了"看得见，看得见之后照样丢
 *
 * 切片5 的总线把通知送到了，但**通知不挡写**。两个标签页各存一次同一格，后一次把前一次
 * 整体退回。改前实测（`A 存 ⇒ B 读并玩 ⇒ B 存 ⇒ A 再存`，同一份存储、同一条键）：
 *
 * | 字段 | B 存完 | A 再存之后 |
 * |------|--------|-----------|
 * | `stats.souls` | 9,500 | **130** |
 * | `stats.level` | 7 | **1** |
 * | `player.x`／`player.z` | 88／42 | **1／3** |
 *
 * 两次 `save()` **都返回 true**、都不报错、玩家进度没了 —— 这正是分布式里最贵的那一种错
 * （**lost update**）：写进去的内容不是"最新内容 + 我这一笔"，而是"我这份旧读数"。
 *
 * ## 借哪几个契约
 *
 * | 契约 | 在这里的落法 |
 * |------|--------------|
 * | **一把可命名的锁** | 每个存档键一条：`${存储键}:lock` —— 与 `:corrupt` 同一个后缀惯例 |
 * | **栅栏令牌**（单调递增，旧令牌写的一律拒收） | 记录里的 `token`：每占一次 +1，只增不减 |
 * | **只有持租者能写** | 写之前问一次 `可写`：**我的视图令牌**必须等于记录里的令牌 |
 * | **租约会过期，崩了的人自动让位**（TTL） | **这一片故意没有 TTL** —— 理由见纪律 5 |
 * | **锁后端可换**（ZK / Consul / Redis） | 存储注入（默认 localStorage），换后端不改调用点 |
 * | **协议面可下发**（B165） | `crossrealm.lease.enforce` 一个布尔旋钮：拦错了要能不重启就放开 |
 *
 * ## 六条纪律
 *
 * 1. **本模块唯一持有的东西是"视图"**：这个实例的内存状态是从**哪一份落盘内容**推出来的
 *    （那一份当时的令牌）。视图住在内存里（重新加载就没了，正该如此 —— 重载后的状态是
 *    重新读出来的），记录住在存储里（跨实例共享）。两边一比，就知道"我这份还新不新"。
 * 2. **先占坑再落盘**（`可写` → `抢占` → 写内容），不是反过来。反过来万一崩在中间，
 *    就成了"内容变了而令牌没变" —— 那正是别人拿着旧读数照样写得进去，也就是这一片要防的
 *    丢失本身。先占坑最坏是"白占一次坑、下次保存被自己拦住"，**误拒远比静默丢失便宜**。
 * 3. **量不到就不拦**：存储不可用（隐私模式）或记录读不出来（别人写的脏键）⇒ **放行并记账**。
 *    反过来做的代价是"玩家的保存被一个自己从没写过的坏键挡死"，那个键根本不是我们的责任。
 *    但**陈旧**这一种必须拦 —— 那是我们自己能证明的丢失，不是别人的脏数据。
 * 4. **不许释放别人的锁**：`释放` 只在记录里的持有者是自己时才删。分布式锁最经典的错就是
 *    "A 的超时把 B 刚拿的锁解了"；这里没有超时，但同一条纪律还得守着（并配一条腿）。
 * 5. **没有 TTL，也没有钟**：本模块不读 `Date.now()` / `performance.now()`，不开计时器。
 *    令牌单调递增**已经足够**拦住陈旧写者；TTL 要解决的是"崩了的人占着锁不放"，而这里的
 *    让位是**任何一次写自然发生的**（后来者占坑、令牌 +1、前者被栅栏）—— "占着不放"
 *    这件事在本设计里不存在，于是那一格不确定性（客户端与服务器时钟差）也不用引进来。
 *    `at` 只是给人看的，由调用方递进来，**不参与任何判定**。
 * 6. **`可写` 与 `抢占` 之间不许有 `await`**：localStorage 的 read-modify-write 只在
 *    **同一次同步执行**里对本标签页是原子的。一旦让出事件循环，另一个标签页的写就落在
 *    我们的读与写中间。这条不靠注释守：`抢占` 收 `期望`（就是 `可写` 那一次读到的记录令牌），
 *    对不上就当场让位（`contended`，不写记录、不推视图）—— 把"读了再写"变成**比较后写**，
 *    窗口从"不许有 await"降级成"有 await 也要被查到"。
 *    `tests/platform-lease.test.js` 有一臂专门把这两个调用隔进异步 tick，咬的就是这一格。
 *
 * 至于**是哪一批资源**（存档槽？设置键？）、**键叫什么**，本模块一概不知道 —— 它按
 * 调用方递进来的**资源名**（就是那条存储键）记账。把槽位写进这里就是两份真源，
 * 与 B165 纪律 1、B167 的题名册同一件事。
 */
import { 实例身份 } from './bus.js';

/** 锁记录的键后缀（与 `SaveSystem.quarantine` 的 `:corrupt` 同一个惯例） */
export const 锁键后缀 = ':lock';

/** 锁记录自己的格式版本（与存档内容的 `version` 无关，别混） */
export const 记录版本 = 1;

/** 账的上限：一个每秒刷保存的对端不许把账刷成自己那一色 */
export const 账上限 = 50;

/** 拦不拦这个旋钮（ASCII 点号路径，B165 的键形状） */
export const 强制键 = 'crossrealm.lease.enforce';
export const 默认强制 = true;

/**
 * 递进配置中心的名册（与 `舱壁可调项` / `追踪可调项` / `监听可调项` 同一个分工）：
 * 缺省与校验**住在这里**，配置中心只认名册。
 */
export const 租约可调项 = [
  {
    键: 强制键,
    缺省: 默认强制,
    校验: (值) => typeof 值 === 'boolean',
    说明: '陈旧写者拦不拦：布尔；关掉就回到"最后一次写赢"（B168 之前那一份行为）',
  },
];

/** 结果值（ASCII 固定枚举：进诊断、进门禁判据，不能是中文描述句） */
export const 动作集 = Object.freeze(['check', 'take', 'observe', 'release']);
export const 原因集 = Object.freeze([
  'match', 'no-record', 'never-seen', 'stale', 'override', 'enforce-off',
  'no-storage', 'bad-record', 'taken', 'contended', 'kept', 'released', 'not-owner',
]);

/** `${存储键}:lock` —— 空名当场抛：拼错了不会报错，只会"每个人都有自己的锁" */
export function 锁键(资源) {
  if (typeof 资源 !== 'string' || 资源.length === 0) {
    throw new Error(`建写者租约: 资源名得是非空字符串（那条存储键本身），收到 "${String(资源)}"`);
  }
  return `${资源}${锁键后缀}`;
}

/** 默认的存储适配器：有 localStorage 就用，没有就整个模块退化成"量不到 ⇒ 不拦" */
function 默认存储() {
  const 有 = typeof globalThis.localStorage?.setItem === 'function'
    && typeof globalThis.localStorage?.getItem === 'function';
  return 有 ? globalThis.localStorage : null;
}

/**
 * 建一条写者租约。
 *
 * @param {object} 选
 * @param {string} 选.身份 本实例身份（缺省取 `bus.js` 的 `实例身份()` —— 同一个口径才有"谁是谁"）
 * @param {object} 选.存储 测试缝：localStorage 形状 `{ getItem, setItem, removeItem }`
 * @param {object} 选.配置 配置客户端（读 `crossrealm.lease.enforce`，下发即刻换档）
 * @param {Function} 选.上报 拒绝与异常交给宿主的出口（不传就只进账）
 */
export function 建写者租约({ 身份, 存储, 配置, 上报 } = {}) {
  const 本机 = typeof 身份 === 'string' && 身份.length > 0 ? 身份 : 实例身份();
  const 存储件 = 存储 === undefined ? 默认存储() : 存储;

  /** 资源 → 本实例上一次观测到的令牌（没有这一格 = 从没读过这个资源） */
  const 视图 = new Map();
  /** 资源 → 已经拒绝过一次的那个记录令牌（"当面告诉过玩家"，手动第二次才让路） */
  const 提示过 = new Map();
  const 账 = [];

  function 记账(动作, 资源, 因, 视图令牌, 记录令牌) {
    const 指纹 = `${动作}|${资源}|${因}`;
    const 命中 = 账.find((条) => 条.指纹 === 指纹);
    if (命中) {
      命中.次数 += 1;
      命中.最近视图 = 视图令牌;
      命中.最近令牌 = 记录令牌;
      return 命中;
    }
    const 条 = {
      指纹, 动作, 资源, 因,
      视图: 视图令牌, 令牌: 记录令牌, 最近视图: 视图令牌, 最近令牌: 记录令牌, 次数: 1,
    };
    账.push(条);
    while (账.length > 账上限) 账.shift();
    return 条;
  }

  function 数(动作, ...因们) {
    return 账.filter((条) => 条.动作 === 动作 && 因们.includes(条.因))
      .reduce((累, 条) => 累 + 条.次数, 0);
  }

  /** 读那一条锁记录。三种下场：`ok` / `no-record`（没人写过）/ `no-storage`｜`bad-record`（量不到） */
  function 读记录(资源) {
    if (!存储件) return { 因: 'no-storage', 令牌: null };
    let 原文;
    try { 原文 = 存储件.getItem?.(锁键(资源)) ?? null; } catch { return { 因: 'no-storage', 令牌: null }; }
    if (原文 === null || 原文 === undefined) return { 因: 'no-record', 令牌: 0 };
    let 条;
    try { 条 = JSON.parse(原文); } catch { return { 因: 'bad-record', 令牌: null }; }
    if (!条 || typeof 条 !== 'object' || Array.isArray(条)
      || !Number.isInteger(条.token) || 条.token < 0 || typeof 条.owner !== 'string') {
      return { 因: 'bad-record', 令牌: null };
    }
    return { 因: 'ok', 记录: 条, 令牌: 条.token };
  }

  /** 写那一条锁记录（配额满、隐私模式 ⇒ 成 = false，交调用方决定怎么办，本模块不猜） */
  function 写记录(资源, 条) {
    if (!存储件) return { 成: false, 因: 'no-storage' };
    try {
      存储件.setItem?.(锁键(资源), JSON.stringify(条));
      return { 成: true, 因: 'taken' };
    } catch {
      return { 成: false, 因: 'no-storage' };
    }
  }

  const 自己 = {
    /** 拦不拦（每问一次现读旋钮 ⇒ 下发即刻换档，且已经站在"被拦"状态下的那位当场放开） */
    强制() {
      const 值 = 配置?.取?.(强制键, 默认强制);
      return 值 === undefined ? 默认强制 : Boolean(值);
    },

    /**
     * 落盘之前问一次：我这份读数还是新鲜的吗。
     *
     * @param {string} 资源 那条存储键
     * @param {object} 选 选.手动 玩家当面按的那一下（拦住要说、同一份冲突再按一次就让路）
     */
    可写(资源, { 手动 = false } = {}) {
      const 我看 = 视图.get(资源) ?? null;
      if (!自己.强制()) {
        const 条 = 记账('check', 资源, 'enforce-off', 我看, null);
        return { 成: true, 因: 'enforce-off', 视图: 我看, 令牌: null, 持有者: null, 账: 条 };
      }
      const 读 = 读记录(资源);
      if (读.因 === 'no-storage' || 读.因 === 'bad-record') {
        // 纪律 3：量不到就不拦 —— 但要把"量不到"留下名字
        const 条 = 记账('check', 资源, 读.因, 我看, null);
        return { 成: true, 因: 读.因, 视图: 我看, 令牌: null, 持有者: null, 账: 条 };
      }
      if (读.因 === 'no-record') {
        const 条 = 记账('check', 资源, 'no-record', 我看, 0);
        return { 成: true, 因: 'no-record', 视图: 我看, 令牌: 0, 持有者: null, 账: 条 };
      }
      const 当前 = 读.令牌;
      const 持有者 = 读.记录.owner;
      if (!视图.has(资源)) {
        // 从没读过这一格：这一份内容不是"从那份推出来的"，而是"要写进去的新的一份"
        // （新游戏存进某一格、把档存到另一格）—— 那是玩家的**主动**动作，不拦。
        const 条 = 记账('check', 资源, 'never-seen', null, 当前);
        return { 成: true, 因: 'never-seen', 视图: null, 令牌: 当前, 持有者, 账: 条 };
      }
      const 我看定 = 视图.get(资源);
      if (我看定 === 当前) {
        const 条 = 记账('check', 资源, 'match', 我看定, 当前);
        return { 成: true, 因: 'match', 视图: 我看定, 令牌: 当前, 持有者, 账: 条 };
      }
      // 陈旧：内存里那一份的底色已经比存储里的那一份旧
      if (手动 && 提示过.get(资源) === 当前) {
        提示过.delete(资源);
        const 条 = 记账('check', 资源, 'override', 我看定, 当前);
        return { 成: true, 因: 'override', 视图: 我看定, 令牌: 当前, 持有者, 账: 条 };
      }
      // "已经当面说过了"这一格**只有当面那一下才记**：自动保存那一列每 5 秒问一次，
      // 要是它也能把提示记上，玩家第一次当面按下就会被当成"第二次"直接放行 ——
      // 警告一次没说过，别人的档已经盖下去了。
      if (手动) 提示过.set(资源, 当前);
      const 条 = 记账('check', 资源, 'stale', 我看定, 当前);
      try {
        上报?.({ 资源, 视图: 我看定, 令牌: 当前, 持有者, 描述: `资源「${资源}」的写者租约在别人手上（视图 ${我看定} ≠ 记录 ${当前}）` });
      } catch { /* 上报出口自己炸了不许带走判定 */ }
      return { 成: false, 因: 'stale', 视图: 我看定, 令牌: 当前, 持有者, 账: 条 };
    },

    /**
     * 占坑：令牌 +1 并写下"现在我"，同时把本地视图推到那一格（纪律 2：**在落盘之前**）。
     *
     * 脏记录在这里顺手被顶掉（自愈）—— 别人写的坏 JSON 不该永远挡住这一格。
     *
     * `期望` 是 `可写` 那一次读到的记录令牌：**比较后写**（compare-and-set）。传了它而对不上，
     * 就说明 `可写` 与 `抢占` 之间确实插进了一次别人的写（纪律 6 那个窗口），当场让路、
     * 不写记录、不推视图 —— 而不是把一个从没核对过的读数盖下去。
     * 量不到的那几种（`可写` 返回 `令牌: null`）不传期望，行为回到纪律 3。
     *
     * @param {string} 资源
     * @param {number|null} 时刻 只进记录给人看，不参与判定（纪律 5）
     * @param {object} 选 选.期望 `可写` 报告的那个记录令牌（数字才参与比较）
     */
    抢占(资源, 时刻 = null, { 期望 = undefined } = {}) {
      const 前 = 读记录(资源);
      const 前令牌 = 前.因 === 'ok' ? 前.令牌 : 0;
      if (Number.isInteger(期望) && 前令牌 !== 期望) {
        const 条 = 记账('take', 资源, 'contended', 视图.get(资源) ?? null, 前令牌);
        try {
          上报?.({ 资源, 视图: 视图.get(资源) ?? null, 令牌: 前令牌, 持有者: 前.因 === 'ok' ? 前.记录.owner : null, 期望, 描述: `占坑时对不上：期望令牌 ${期望}，记录已是 ${前令牌}（可写与抢占之间被写了一次）` });
        } catch { /* 上报出口自己炸了不许带走判定 */ }
        return { 成: false, 因: 'contended', 令牌: null, 前: 前令牌, 账: 条 };
      }
      const 新令牌 = 前令牌 + 1;
      const 写 = 写记录(资源, { v: 记录版本, owner: 本机, token: 新令牌, at: 时刻 });
      if (!写.成) {
        // 记不上租约 ≠ 记不上档：内容那一步该照写（调用方的 setItem 自己会撞上同一堵墙并被
        // 它自己的错误路数接住），这里只把"占坑失败"留下名字。
        const 条 = 记账('take', 资源, 'no-storage', 视图.get(资源) ?? null, 前令牌);
        return { 成: false, 因: 'no-storage', 令牌: null, 前: 前令牌, 账: 条 };
      }
      视图.set(资源, 新令牌);
      提示过.delete(资源);
      const 条 = 记账('take', 资源, 'taken', 新令牌, 前令牌);
      return { 成: true, 因: 'taken', 令牌: 新令牌, 前: 前令牌, 账: 条 };
    },

    /**
     * 观测：本实例的内存状态现在**就是**存储里那一份（读档成功之后调用）。
     * 没有记录 ⇒ 视图记 0（第一条记录将由第一次落盘占坑产生）。
     */
    观测(资源) {
      const 读 = 读记录(资源);
      if (读.因 === 'no-storage') {
        记账('observe', 资源, 'no-storage', null, null);
        return null;
      }
      const 令 = 读.因 === 'ok' ? 读.令牌 : 0;
      视图.set(资源, 令);
      提示过.delete(资源);
      记账('observe', 资源, 读.因 === 'ok' ? 'kept' : 读.因, 令, 令);
      return 令;
    },

    /** 只读的视图（诊断与门禁用它核对"记下了没有"，不改状态） */
    视图令牌(资源) {
      return 视图.has(资源) ? 视图.get(资源) : null;
    },

    /** 存储里那一条记录（诊断用；`因` 说明量不量得到） */
    记录(资源) {
      const 读 = 读记录(资源);
      if (读.因 !== 'ok') return { 有: false, 因: 读.因, 令牌: 读.令牌, 持有者: null };
      return { 有: true, 因: 'ok', 令牌: 读.令牌, 持有者: 读.记录.owner, 时刻: 读.记录.at ?? null };
    },

    /** 释放：只有持租者删得动（纪律 4） */
    释放(资源) {
      const 读 = 读记录(资源);
      if (读.因 !== 'ok') {
        const 因 = 读.因 === 'no-record' ? 'no-record' : 读.因;
        记账('release', 资源, 因, 视图.get(资源) ?? null, 读.令牌);
        return { 成: false, 因 };
      }
      if (读.记录.owner !== 本机) {
        const 条 = 记账('release', 资源, 'not-owner', 视图.get(资源) ?? null, 读.令牌);
        try { 上报?.({ 资源, 描述: `试图释放别人（${读.记录.owner}）持有的租约「${资源}」` }); } catch { /* 同上 */ }
        return { 成: false, 因: 'not-owner', 持有者: 读.记录.owner, 账: 条 };
      }
      let 删得动 = true;
      if (存储件) {
        try { 存储件.removeItem?.(锁键(资源)); } catch { 删得动 = false; }
      } else 删得动 = false;
      视图.delete(资源);
      提示过.delete(资源);
      const 条 = 记账('release', 资源, 删得动 ? 'released' : 'no-storage', null, 读.令牌);
      return { 成: 删得动, 因: 删得动 ? 'released' : 'no-storage', 账: 条 };
    },

    /** 名册（诊断用）：有哪几条资源、各自视图与记录令牌 —— 按调用方给过的资源名排 */
    资源名册(资源们) {
      return [...new Set(资源们)].map((资源) => {
        const 读 = 自己.记录(资源);
        return { 资源, 视图: 自己.视图令牌(资源), 有记录: 读.有, 令牌: 读.令牌, 持有者: 读.持有者 };
      });
    },

    账() {
      return 账.map((条) => ({ ...条 }));
    },

    清账() {
      const 清 = 账.length;
      账.length = 0;
      return 清;
    },

    /** 一句话读数：每个数都是从账推的，不另起一本计数器（与 B167 同一个口径） */
    读数() {
      return {
        身份: 本机,
        存储: 存储件 ? 'localStorage' : 'none',
        强制: 自己.强制(),
        放行: 数('check', 'match', 'no-record', 'never-seen', 'no-storage', 'bad-record', 'override', 'enforce-off'),
        拒绝: 数('check', 'stale'),
        抢占: 数('take', 'taken'),
        占坑失败: 数('take', 'no-storage'),
        占坑让位: 数('take', 'contended'),
        观测: 数('observe', 'kept', 'no-record', 'no-storage'),
        释放: 数('release', 'released'),
        想放别人的锁: 数('release', 'not-owner'),
        资源数: 视图.size,
      };
    },

    /** 拆卸登记表用的出口：清掉本地状态（存储里那条记录**留着** —— 那是别人的读数依据） */
    关() {
      视图.clear();
      提示过.clear();
      return true;
    },

    dispose() { return 自己.关(); },
  };

  return 自己;
}
