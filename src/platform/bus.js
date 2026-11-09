/**
 * 跨实例总线（Bus）—— Spring Cloud Bus **协议面**的**内化**。
 *
 * ## 要补的缺口：一台"服务"其实同时跑着好几个人
 *
 * 同一个标签页应用可以开第二遍。两个标签页 = **同一个服务的两个实例共用一块存储**，
 * 而改前全仓对这件事一无所知（普查读数：`BroadcastChannel` 命中 **0** 处、`storage`
 * 事件监听 **0** 处），写同一批 localStorage 键的位点却有 8 处
 * （`SaveSystem.save` / `load` 的迁移回写 / `quarantine` / `importFile`、
 * `SettingsManager` 落盘、`ContextualTutorial` 的 seen 集合、`DraggablePanel` 的两处）。
 *
 * 症状不是报错，是**两边各说一套**：B 标签页存了档，A 标签页的槽位读数还停在早上那份，
 * 而且没有任何一句话说明发生过这件事；A 标签页下发了一个旋钮（B165 的配置中心），
 * B 继续用旧值跑 —— 于是"同一个构建、同一份配置"这件事在浏览器里其实是假的。
 *
 * ## 借 Spring Cloud Bus 的哪几个契约
 *
 * | 契约 | 在这里的落法 |
 * |------|--------------|
 * | **一条广播目的地**（`spring.cloud.bus.destination`） | 总线名（就是 BroadcastChannel 的 name） |
 * | **实例身份**（`spring.cloud.bus.id`） | `实例身份()`：每标签页一个，落在 sessionStorage 里 ⇒ 重新加载**不换身份**（同一张标签页 = 同一个实例） |
 * | **本地事件 vs 远程事件**（`RefreshEvent` / `RefreshRemoteApplicationEvent`） | `下发(文档, { 来源 })`：来源是"远程"的那一次**不再广播出去** —— 否则两个实例来回广播 = 广播风暴 |
 * | **事件类型白名单**（`@RemoteApplicationEventScan`） | 题名册：没登记的题，**自己发**当场抛，**外面来**的当场拒收并记账 |
 * | **传输可换**（Rabbit / Kafka / Redis） | BroadcastChannel → `storage` 事件 → `local`（只记账不投递），用的哪一条由 `读数().传送` 交回 |
 * | **@BusEndpoint 的可视性** | `账()`：谁发的、什么题、第几序号、成没成、第几次 |
 *
 * ## 五条纪律
 *
 * 1. **一个实例的订阅者收不到这个实例自己发的消息**。这是 BroadcastChannel 的语义，
 *    也是 Bus 的语义（本地动作由本地那条路自己负责：配置是刚 `下发` 的、存档是刚 `save` 的，
 *    都已经在原地做过事了）。把它做成"能收到自己"就会二次生效 —— 二次生效在配置那一条上
 *    表现为版本号每收一次涨一格，在存档那一条上表现为"自己存档自己提示被别人写了"。
 * 2. **不合形状的外来消息不许喂给订阅者**：来路不明的东西（别的页面用了同一个通道名、
 *    开发者手写的 storage 键）要么被拒收并记账，要么根本进不到回调那一层。
 * 3. **一位订阅者炸了不带走别的订阅者**（B166 的同族）：回调逐个包住，失败进账并交给
 *    上报出口；派发这一侧永远不抛。
 * 4. **自己发错 = 抛，外来不合 = 记账丢弃**：拼错的题名、不合校验的载荷是自己代码里的
 *    bug，要当场炸在开发者脸上；从通道里飘进来的东西不归自己管，但要留下名字。
 *    这两种搞成一样，要么启动期就崩在别人的脏数据上，要么 bug 静默飘过去。
 * 5. **本模块不开计时器、不读钟**：没有 `setTimeout`、没有 `Date.now()`、没有
 *    `performance.now()`。消息的先后用**每实例单调序号**表达（这也是 Bus 的做法：
 *    序号跳了就是丢了，看得见、但不假装能补回）。
 *
 * 至于"具体有哪几道题、每道题的载荷长什么样"，本模块**一概不知道** —— 那份名册由各个
 * 主人模块递进来（`platform/config.js` 递配置刷新，`game/SaveSystem.js` 递存档写入）。
 * 写在这里就是"两份真源"，与 B165 纪律 1 同一件事。
 */

/** 默认总线名（真接 Spring Cloud Bus 时它就是那条 destination） */
export const 默认总线名 = 'crossrealm';

/** 账的上限：一个每秒刷消息的对端不许把账刷成自己那一色 */
export const 账上限 = 50;

/** 身份在 sessionStorage 里的键 */
export const 身份键 = 'crossrealm.instance';

/** 结果值（ASCII 固定枚举：进存档、进诊断、进门禁判据，不能是中文描述句） */
export const 结果集 = Object.freeze([
  'sent', 'received', 'unknown-topic', 'bad-envelope', 'bad-payload',
  'self-echo', 'send-failed', 'subscriber-failure', 'gap',
]);

let 本机身份 = null;
let 造身份序号 = 0;

/** 造一个实例身份：优先用平台自带的 UUID，没有就退化到"时间戳 + 进程内序号 + 随机" */
function 新身份() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  造身份序号 += 1;
  return `inst-${Math.random().toString(36).slice(2, 10)}-${造身份序号}`;
}

/**
 * 本标签页的实例身份（第一次调用时定下来，之后每次回同一个值）。
 *
 * 落 sessionStorage 而不是每次都新造：重新加载一张标签页在 Bus 的口径里**还是同一个实例**
 * （同一张页、同一个 origin、同一份 sessionStorage）；新开的标签页拿到的才是另一个身份。
 * 没有 sessionStorage 的环境（node / 隐私模式被禁）就只在内存里记住这一份。
 */
export function 实例身份() {
  if (本机身份) return 本机身份;
  let 存的 = null;
  try { 存的 = globalThis.sessionStorage?.getItem?.(身份键) ?? null; } catch { 存的 = null; }
  本机身份 = typeof 存的 === 'string' && 存的.length > 0 ? 存的 : 新身份();
  try {
    if (存的 !== 本机身份) globalThis.sessionStorage?.setItem?.(身份键, 本机身份);
  } catch { /* 存不下不影响身份本身 */ }
  return 本机身份;
}

/**
 * 把内存里那一份缓存清掉（交回新值就同时把它写进 sessionStorage）。
 *
 * 传 `null` 是**只清进程内那一格**，存储里那份不动 —— 因为"清缓存"要模拟的是页面重载
 * （内存清了、sessionStorage 还在，于是身份该是同一个）。顺手把存储也删掉的话，
 * 这个钩子就变成"换一个人"，那条重载用例量的就不再是它声称的性质了。
 * 真要连存储一起作废，显式 `sessionStorage.removeItem(身份键)`。
 */
export function 换实例身份(新值 = null) {
  本机身份 = 新值;
  if (新值) {
    try { globalThis.sessionStorage?.setItem?.(身份键, 新值); } catch { /* 存不下也不影响这一份内存值 */ }
  }
  return 本机身份;
}

/**
 * 默认的传输：按能力降级，用的哪一条由 `读数().传送` 交回。
 *
 * - `broadcast-channel` —— 现代浏览器与 node 都有；原生**不回声给发送方**，纪律 1 免费拿到。
 * - `storage-event` —— 没有 BroadcastChannel 时的路：往一个固定键写 JSON，别的标签页收到
 *   `storage` 事件（浏览器同样不给写的那一页发）。代价是存储里留一个键（有界：一条）。
 * - `local` —— 两样都没有（单测、非浏览器宿主）：只记账不投递。这一条**不假装工作**，
 *   它把"跨实例这件事现在做不到"交回读数，而不是静默降级成"看起来在广播"。
 */
function 默认传送(名, 交回) {
  if (typeof globalThis.BroadcastChannel === 'function') {
    try {
      const 通道 = new globalThis.BroadcastChannel(名);
      通道.onmessage = (事件) => 交回(事件.data);
      return {
        名: 'broadcast-channel',
        发送: (条) => 通道.postMessage(条),
        关: () => 通道.close(),
      };
    } catch { /* Safari 隐私模式等：继续往下走 storage-event */ }
  }
  const 有窗口 = typeof globalThis.window?.addEventListener === 'function';
  const 有存储 = typeof globalThis.localStorage?.setItem === 'function';
  if (有窗口 && 有存储) {
    const 键 = `crossrealm.bus.${名}`;
    const 处理 = (事件) => {
      if (事件?.key !== 键 || typeof 事件.newValue !== 'string') return;
      let 条;
      try { 条 = JSON.parse(事件.newValue); } catch { return; }
      交回(条);
    };
    globalThis.window.addEventListener('storage', 处理);
    return {
      名: 'storage-event',
      发送: (条) => { globalThis.localStorage.setItem(键, JSON.stringify(条)); },
      关: () => {
        globalThis.window.removeEventListener('storage', 处理);
        try { globalThis.localStorage.removeItem(键); } catch { /* 清不掉也不影响退订 */ }
      },
    };
  }
  return { 名: 'local', 发送: () => {}, 关: () => {} };
}

/**
 * 建一条总线。
 *
 * @param {object} 选
 * @param {string} 选.名 总线名（= BroadcastChannel 的 name）
 * @param {Array<{题:string, 校验?:Function, 说明:string}>} 选.名册 题名册（各主人递进来的）
 * @param {string} 选.身份 本实例身份（缺省取 `实例身份()`）
 * @param {Function} 选.传送 测试缝：`(名, 交回) => { 名, 发送, 关 }`；不传走默认降级链
 * @param {Function} 选.上报 订阅者炸了 / 外来消息拒收时交给宿主的出口（不传就只进账）
 */
export function 建总线({ 名 = 默认总线名, 名册: 名册项 = [], 身份, 传送, 上报 } = {}) {
  const 题表 = new Map();
  for (const 项 of 名册项) {
    if (!项 || typeof 项.题 !== 'string' || 项.题.length === 0) {
      throw new Error('建总线: 名册里有一条没有题名 —— 不知道它是什么，就不许它进名册');
    }
    if (题表.has(项.题)) throw new Error(`建总线: 题「${项.题}」在名册里出现了两次 —— 两条校验会各说一套`);
    题表.set(项.题, 项);
  }
  const 订阅表 = new Map();          // 题 -> Set<回调>
  const 本机 = 身份 ?? 实例身份();
  const 账 = [];
  const 最近序号 = new Map();         // 发出方 -> 收到的最后一个序号
  let 发出序号 = 0;
  let 已关 = false;

  /** 同一种事占一行，次数累加（与 B166 的死信账同一个形状：刷屏的不许挤掉别人） */
  function 记账(方向, 题, 发出方, 结果, 摘要, 序号 = null) {
    const 指纹 = `${方向}|${题}|${发出方 ?? ''}|${结果}|${摘要}`;
    const 命中 = 账.find((条) => 条.指纹 === 指纹);
    if (命中) { 命中.次数 += 1; 命中.最近序号 = 序号; return 命中; }
    const 条 = { 指纹, 方向, 题, 发出方: 发出方 ?? null, 结果, 摘要, 序号, 最近序号: 序号, 次数: 1 };
    账.push(条);
    while (账.length > 账上限) 账.shift();
    return 条;
  }

  function 形状不合(条) {
    if (!条 || typeof 条 !== 'object' || Array.isArray(条)) return '不是对象';
    if (typeof 条.topic !== 'string' || 条.topic.length === 0) return '缺 topic';
    if (typeof 条.sender !== 'string' || 条.sender.length === 0) return '缺 sender';
    if (!Number.isInteger(条.seq) || 条.seq < 0) return 'seq 不是非负整数';
    return null;
  }

  /** 传输层交回来的那一条（唯一入口：BroadcastChannel 的 onmessage、storage 事件、测试注入都走这里） */
  function 投递(条) {
    if (已关) return;
    const 坏 = 形状不合(条);
    if (坏) { 记账('in', String(条?.topic ?? '(无名)'), null, 'bad-envelope', 坏, 条?.seq ?? null); return; }
    if (条.sender === 本机) { 记账('in', 条.topic, 条.sender, 'self-echo', '本实例自己发的，纪律 1 不吃回声', 条.seq); return; }
    const 项 = 题表.get(条.topic);
    if (!项) { 记账('in', 条.topic, 条.sender, 'unknown-topic', '题不在名册里 —— 别的应用或拼错的键', 条.seq); return; }
    const 前 = 最近序号.get(条.sender);
    最近序号.set(条.sender, 条.seq);
    if (typeof 前 === 'number' && 条.seq > 前 + 1) {
      记账('in', 条.topic, 条.sender, 'gap', `序号从 ${前} 跳到 ${条.seq}：中间丢了 ${条.seq - 前 - 1} 条`, 条.seq);
    }
    if (项.校验 && !项.校验(条.payload)) {
      记账('in', 条.topic, 条.sender, 'bad-payload', 项.说明 ?? '载荷不合那道题的校验', 条.seq);
      return;
    }
    记账('in', 条.topic, 条.sender, 'received', '', 条.seq);
    const 回调们 = 订阅表.get(条.topic);
    if (!回调们 || 回调们.size === 0) return;
    const 消息 = { 题: 条.topic, 发出方: 条.sender, 序号: 条.seq, 载荷: 条.payload };
    let 首个错 = null;
    for (const 回调 of [...回调们]) {
      try {
        回调(消息, 自己);
      } catch (错) {
        if (!首个错) 首个错 = 错;
        try {
          上报?.({ 描述: `总线订阅者「${条.topic}」炸了：${错?.message ?? 错}`, 错误: 错, 题: 条.topic, 发出方: 条.sender });
        } catch { /* 上报这一侧自己炸了也不许带走派发 */ }
      }
    }
    if (首个错) 记账('in', 条.topic, 条.sender, 'subscriber-failure', String(首个错?.message ?? 首个错), 条.seq);
  }

  // 传输排在 `自己` **之后**建：注入的假传输可能在构造期就同步交回一条消息，
  // 那时 `投递` 得已经看得见 `自己`（排在前面就是 TDZ，症状是"消息进来了但没人收到"）。
  const 自己 = {
    名() { return 名; },
    身份() { return 本机; },
    传送名() { return 传输?.名 ?? '(注入的传输没报名字)'; },

    /**
     * 广播一条。序号在发送**之前**就发下来：送失败也占号 —— 对端看到的序号缺口是真的丢了，
     * 而不是"没丢但号不连"。
     * @returns {number} 本实例的序号
     */
    发布(题, 载荷) {
      if (已关) throw new Error(`建总线: 总线已关，不许再发「${题}」`);
      const 项 = 题表.get(题);
      if (!项) {
        throw new Error(`建总线: 题「${题}」不在名册里 —— 自己发错要当场炸，不要飘进通道里让别人去猜`);
      }
      if (项.校验 && !项.校验(载荷)) {
        throw new Error(`建总线: 题「${题}」的载荷不合它自己的校验（${项.说明 ?? '无名册说明'}）`);
      }
      发出序号 += 1;
      const 条 = { topic: 题, sender: 本机, seq: 发出序号, payload: 载荷 };
      try {
        传输.发送(条);
        记账('out', 题, 本机, 'sent', '', 发出序号);
      } catch (错) {
        记账('out', 题, 本机, 'send-failed', String(错?.message ?? 错), 发出序号);
      }
      return 发出序号;
    },

    /** 订阅一道题，返回退订函数（与 B165 的 `订阅` 同一个出口形状） */
    订阅(题, 回调) {
      if (已关) throw new Error(`建总线: 总线已关，订阅「${题}」永远不会被叫醒 —— 这不是"先订阅后建通道"，这是漏了接线`);
      if (!题表.has(题)) {
        throw new Error(`建总线: 题「${题}」不在名册里 —— 拼错了却永远不会收到，比当场报错难查得多`);
      }
      if (typeof 回调 !== 'function') throw new Error('建总线: 订阅者得是个函数');
      if (!订阅表.has(题)) 订阅表.set(题, new Set());
      const 集 = 订阅表.get(题);
      集.add(回调);
      return () => { 集.delete(回调); };
    },

    订阅数(题) {
      if (题 !== undefined) return 订阅表.get(题)?.size ?? 0;
      let 总 = 0;
      for (const 集 of 订阅表.values()) 总 += 集.size;
      return 总;
    },

    /** 名册（诊断用）：有哪几道题、每道题的说明 —— 不含订阅者 */
    名册() {
      return 名册项.map((项) => ({ 题: 项.题, 说明: 项.说明 }));
    },

    /** 账的一份副本：同一种事一行，带次数 */
    账() {
      return 账.map((条) => ({ ...条 }));
    },

    清账() {
      const 清 = 账.length;
      账.length = 0;
      return 清;
    },

    /** 一句话读数：给诊断面板与门禁用（数字都是从账里推的，不另起一本计数器） */
    读数() {
      const 数 = (结果) => 账.filter((条) => 条.结果 === 结果).reduce((累, 条) => 累 + 条.次数, 0);
      return {
        传送: 自己.传送名(),
        身份: 本机,
        名,
        发出: 数('sent'),
        送出失败: 数('send-failed'),
        收到: 数('received') + 数('subscriber-failure'),
        拒收: 数('unknown-topic') + 数('bad-envelope') + 数('bad-payload') + 数('self-echo'),
        回调故障: 数('subscriber-failure'),
        缺口: 数('gap'),
        订阅数: 自己.订阅数(),
        已关,
      };
    },

    /** 关掉通道并清空订阅（`dispose` 是给 teardown 登记表用的同一个出口） */
    关() {
      if (已关) return false;
      已关 = true;
      订阅表.clear();
      try { 传输.关?.(); } catch { /* 关不掉也不该把拆卸流程打断 */ }
      return true;
    },

    dispose() { return 自己.关(); },
  };

  const 交回 = (条) => { try { 投递(条); } catch { /* 兜住：投递这一侧任何意外都不许冒到通道回调里 */ } };
  const 传输 = 传送 ? 传送(名, 交回) : 默认传送(名, 交回);

  return 自己;
}
