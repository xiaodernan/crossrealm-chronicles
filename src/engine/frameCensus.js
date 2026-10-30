/**
 * 每帧 CPU 的**按调用点**普查（W-C2 切片19，#15 缺的那把尺子）。
 *
 * ## 为什么要有这一份
 *
 * `perf-smoke` 量的是 `window.__game.update()` 这一整口的毫秒数，它一直报森林
 * `updateAvg 15.4 / updateP95 20.4`（预算 12）—— 但"这一口 15ms"里没有结构：是敌人 AI、
 * 世界更新、HUD 画小地图，还是天气粒子，谁都不知道。计划里三处写着同一句话（"只有把森林
 * `update()` 的耗时按调用点拆开才判得动"），拆不开的根因是**根本没有这把尺子**：
 * `PerfHUD` 只有聚合帧距，`perfGauges` 九格全是人口计数，`shadowCensus` 数的是 call 不是 CPU。
 *
 * ## 名册从哪儿来：不抄表，从函数体现推
 *
 * 站点名单是拿 `game.update` 的**源码文本**扫出来的（`Function.prototype.toString()` 连注释
 * 一起交回来），不是另写一张表。这一点是故意的：抄一份表 = 下一片在 `update()` 里加一句
 * `this.新东西.update(dt)`，普查不会喊，那一笔就永远藏在"其余"里 —— 正是这个仓反复吃过亏的
 * "抄本烂在原地而门禁还绿着"（B120 / B121 / B143 同族）。
 *
 * ## 三条口径
 *
 * ① **只数根层调用**：一个已点名的调用里又进了另一个（`updateDayNight` 内部再调 `updateBloom`
 *    那一类），子的耗时已经含在父的区间里，再进合计就是双计 —— 这类进 `嵌套` 计数、不进合计。
 *    根层的"根"是**相对一帧而言**的：整帧账由 `游戏.update` 那层包装自己报（谁推的都算一帧），
 *    帧外发生的站点调用（事件回调 / 渲染循环里直接调了某个子系统）既不进整帧账也不进合计，
 *    单独记进 `帧外ms` / `帧外次数` —— 第一版把它算进合计，第一次真跑就红成"已点名比整帧还大"。
 * ② **"其余"是数出来的余数**：`其余 = Σ整帧 − Σ已点名`。它是"没被点名的那些行"的上界
 *    （函数体里的裸赋值、以及 `this.` 之外的模块函数如 `frameTick` / `scheduler.update` /
 *    `updateDof`），够不着的名字由 `扫够不着` 一并交出来 ⇒ 余数多大、里面住着谁，一眼看得见。
 * ③ **不装就零成本**：这是外部装的猴子补丁，生产代码一行都不必改，装完必须逐字还原 ——
 *    "逐字"包括**属性形状**：方法原本挂在原型上时，还原走 `delete` 而不是赋回原函数，
 *    否则实例上留一层遮住原型的影子，`hasOwnProperty` 从此不一样。
 *    代价是包装层每次调用多两个 `performance.now()` —— 这一份开销由"空桩对照"那条腿自己量出来，
 *    不靠嘴说"可以忽略"。
 *
 * ## 两种"接不上"分开处理（都不许被读成 0 笔）
 *
 * `this.padInput?.poll()` 这种**可选链**站点在某一态本来就可能是 null ⇒ 记名（`未接到`）不抛；
 * `this.world.update(...)` 这种**没有问号**的站点扫到了却接不上对象 ⇒ 是尺子坏了（`坏站点`），
 * `每帧普查` 当场抛。还有一类更隐蔽的：站点接上了、方法也被调了，但那个方法是从**每帧新建的
 * 实例**上取的（getter 返回新对象那一类），包装打在临时件上、一帧都没计到 ⇒ 交进 `零调用` 名单。
 */

/**
 * 标识符要认中文。这个仓里 `被动过()` / `归属标签()` / `合一批()` 都是真名字，
 * 而 `\w` 只认 `[A-Za-z0-9_]` —— 用 `\w` 写这把尺，中文命名的调用点会**静默扫不到**，
 * 于是"其余"那一格里凭空多出一笔没人认领的账（正是这份普查要避免的形状）。
 */
const 识 = '[\\p{L}\\p{N}_$][\\p{L}\\p{N}_$]*';
const 界 = '(?<![\\p{L}\\p{N}_$])';

/** `this` 后面跟着一串 `.名字` / `?.名字`，最后直接 `(` —— 这就是一个调用点。 */
const 站点式 = new RegExp(`${界}this((?:\\s*\\??\\s*\\.\\s*${识})+)\\s*\\(`, 'gu');

/** 任意一个调用的"头 + 尾链"：`scheduler.update(` ⇒ 头 `scheduler`、尾链 `update`。 */
const 调用头式 = new RegExp(`${界}(${识})((?:\\s*\\??\\s*\\.\\s*${识})*)\\s*\\(`, 'gu');

const 段式 = new RegExp(`\\.\\s*(${识})`, 'gu');

/** 去掉注释：`//` 到行尾、`/* … *\/` 整块。保守（不认字符串里的斜杠），漏的假阳性由"接不上就抛"兜住。 */
function 摘注释(文本) {
  return 文本
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * `String(fn)` 交回来的是"方法名 + 参数表 + 体"，方法名自己长得就是一个调用（`update() {`）——
 * 只认第一根花括号之后的东西，否则每一行都会把函数自己算成一处"够不着的调用"。
 */
function 函数体(文本) {
  const 括 = 文本.indexOf('{');
  return 摘注释(括 < 0 ? 文本 : 文本.slice(括 + 1));
}

/**
 * 从一段源码文本里扫出 `this.…(…)` 形式的调用点。
 * 注释里那些"`this.weather.update` 那一族"的说法不能被当成站点 —— 装的时候接不上对象，
 * 尺子就会自己喊坏（那是真红，但红得毫无意义）。
 */
export function 扫站点(文本) {
  const 没注释 = 函数体(文本);
  const 出 = [];
  const 见过 = new Set();
  for (const m of 没注释.matchAll(站点式)) {
    const 链 = m[1];
    const 段 = [...链.matchAll(段式)].map((x) => x[1]);
    if (!段.length) continue;
    const 方法 = 段.pop();
    const 路径 = 段.join('.');
    const 可选 = 链.includes('?');
    const 键 = `${路径 ? `${路径}.` : ''}${方法}`;
    if (见过.has(键)) continue;
    见过.add(键);
    出.push({ 键, 路径, 方法, 可选 });
  }
  return 出;
}

const 保留字 = new Set([
  'if', 'for', 'while', 'switch', 'case', 'catch', 'return', 'typeof', 'function', 'const', 'let', 'var',
  'new', 'do', 'else', 'await', 'async', 'yield', 'delete', 'void', 'in', 'of', 'try',
  'Math', 'Number', 'String', 'Boolean', 'Set', 'Map', 'Array', 'Object', 'JSON', 'Promise', 'Date',
  'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'console', 'parseFloat', 'parseInt', 'isNaN',
  'document', 'window', 'super', 'get', 'set',
]);

/**
 * 函数体里那些**不以 `this.` 起头**的调用 —— 它们注定进"其余"，所以名字要交出来，
 * 好让读的人在"其余 3.2ms"这一格旁边看见"里面住着 `frameTick` / `scheduler.update` / `updateDof`"。
 * 没有这一列，"其余"就是一个谁也说不清里面有什么的大格子；有了它，余数至少是**可解释的**。
 */
export function 扫够不着(文本) {
  const 没注释 = 函数体(文本);
  const 出 = new Set();
  for (const m of 没注释.matchAll(调用头式)) {
    const 头 = m[1];
    const 尾链 = [...(m[2] ? m[2].matchAll(段式) : [])].map((x) => x[1]);
    if (头 === 'this' || 保留字.has(头)) continue;
    if (m.index >= 4 && 没注释.slice(m.index - 4, m.index).endsWith('new ')) continue;
    出.add(尾链.length ? `${头}.${尾链.join('.')}` : 头);
  }
  return [...出].sort();
}

function 取容器(游戏, 路径) {
  let 当前 = 游戏;
  for (const 段 of 路径 ? 路径.split('.') : []) {
    if (当前 == null) return null;
    当前 = 当前[段];
  }
  return 当前;
}

/**
 * 装上普查。手势与 `shadowCensus` 同一族：**用完必须 `卸载()`**。
 * `卸载` 交出两件见证：`被人改过`（我们不在位了 —— 中途有人替换了同一个方法）与逐字还原。
 *
 * 还原是**逐字节**的这件事有个不显眼的要求：猴子补丁 `容器[方法] = 包` 会在实例上**新造一个自有
 * 属性**，把原本挂在原型上的方法遮住；直接赋回原函数虽然引用相等，`hasOwnProperty` 却变了。
 * 所以记下"装之前它是不是自有的"，卸的时候非自有的走 `delete`（切片19 第一次真跑之前想的）。
 */
export function 装普查(游戏, 站点们) {
  const 记录 = new Map();
  const 装好的 = [];
  const 未接到 = [];
  const 坏站点 = [];
  let 深度 = 0;
  let 帧中 = false;
  const 帧 = { n: 0, 泵: 0, 总: [] };

  /** 记下"装之前是自有属性还是原型上的方法" —— 还原要按这个决定赋值还是 `delete`。 */
  const 登记 = (容器, 方法, 键, 包) => {
    装好的.push({ 容器, 方法, 源: 容器[方法], 自有: Object.prototype.hasOwnProperty.call(容器, 方法), 键, 包 });
    容器[方法] = 包;
  };

  /**
   * **整帧这一格由 `游戏.update` 自己报**，不是由外面的泵帧循环报。
   *
   * 第一版是外面那句 `performance.now()` 夹住 `游戏.update()`，于是默认"只有我在推帧"。
   * 第一次真跑（`.tmp-20261030-s22/census-r1.log`）就点了 hub 站 **已点名 1981.70ms > 整帧 1956.10ms**：
   * 页自己的 rAF 循环与事件回调在两次 `evalJs` 之间也跑了 `update()`，那些帧的站点时间进了合计，
   * 而它们那一口的整帧时间没进 —— 一把假设"没人碰游戏"的尺子交出来的榜必然能超出整帧。
   * 现在帧账由 update 自己记：谁推的都是一帧，`帧数 ≥ 泵帧数` 那份差是**见证**（页自己跑了几帧），
   * 不再是隐藏的破口。重入（一帧里又调 update，本页没有）按同一帧计，不把一帧算成两帧。
   */
  if (typeof 游戏.update === 'function') {
    const 帧源 = 游戏.update;
    登记(游戏, 'update', 'update', function (...args) {
      // 重入（一帧里又调 update，本页没有这一类）：按同一帧计，不把一帧算成两帧
      if (帧中) return 帧源.apply(this, args);
      帧中 = true;
      深度 = 0;
      const t0 = performance.now();
      try {
        return 帧源.apply(this, args);
      } finally {
        帧中 = false;
        帧.n += 1;
        帧.总.push(performance.now() - t0);
      }
    });
  }

  for (const 站 of 站点们) {
    if (站.路径 === '' && 站.方法 === 'update') continue; // 整帧那一格已经记过了
    const 容器 = 取容器(游戏, 站.路径);
    if (容器 == null || typeof 容器[站.方法] !== 'function') {
      if (站.可选) 未接到.push(站.键);
      else 坏站点.push(站.键);
      continue;
    }
    if (!记录.has(站.键)) 记录.set(站.键, { 次数: 0, 每帧: [], 嵌套: 0, 帧外次数: 0, 帧外ms: 0 });
    const 槽 = 记录.get(站.键);
    const 源 = 容器[站.方法];
    const 包 = function (...args) {
      const t0 = performance.now();
      const 是根 = 深度 === 0;
      深度 += 1;
      let 出;
      try {
        出 = 源.apply(this, args);
      } finally {
        深度 -= 1;
        const 耗 = performance.now() - t0;
        if (是根 && 帧中) {
          槽.次数 += 1;
          槽.每帧.push(耗);
        } else if (是根) {
          // 帧外：事件回调 / 渲染循环里直接调了这个站点，它不属于任何一口 update() 的账
          槽.帧外次数 += 1;
          槽.帧外ms += 耗;
        } else {
          槽.嵌套 += 1;
        }
      }
      return 出;
    };
    登记(容器, 站.方法, 站.键, 包);
  }

  const 读数 = () => {
    const 行 = [];
    let 已点名 = 0;
    let 嵌套次数 = 0;
    let 帧外ms = 0;
    let 帧外次数 = 0;
    const 零调用 = [];
    for (const [键, 槽] of 记录) {
      const 列 = 槽.每帧.slice().sort((a, b) => a - b);
      const 合 = 槽.每帧.reduce((s, n) => s + n, 0);
      已点名 += 合;
      嵌套次数 += 槽.嵌套;
      帧外ms += 槽.帧外ms;
      帧外次数 += 槽.帧外次数;
      if (槽.次数 === 0 && 槽.嵌套 === 0) 零调用.push(键);
      行.push({
        名: 键,
        次数: 槽.次数,
        合计ms: 合,
        均值ms: 槽.次数 ? 合 / 槽.次数 : 0,
        p95ms: 列.length ? 分位(列, 0.95) : 0,
        最慢ms: 列.length ? 列[列.length - 1] : 0,
        帧外ms: 槽.帧外ms,
        帧外次数: 槽.帧外次数,
      });
    }
    行.sort((a, b) => b.合计ms - a.合计ms);
    const 总 = 帧.总.reduce((s, n) => s + n, 0);
    return {
      帧数: 帧.n,
      泵帧数: 帧.泵,
      总耗时ms: 总,
      已点名ms: 已点名,
      其余ms: 总 - 已点名,
      嵌套次数,
      帧外ms,
      帧外次数,
      行,
      未接到,
      坏站点,
      零调用,
    };
  };

  /**
   * 推一帧。整帧时间由 `update` 那层包装自己记（见上面那段），这里只管数"我泵了几帧" ——
   * 于是页自己跑的帧（rAF / 事件回调）也进榜，而 `帧数 − 泵帧数` 是可见的见证而不是破口。
   */
  const 一帧 = () => {
    帧.泵 += 1;
    游戏.update();
    return 帧.总[帧.总.length - 1];
  };

  const 卸载 = () => {
    const 被人改过 = [];
    for (const { 容器, 方法, 源, 自有, 包, 键 } of 装好的) {
      if (容器[方法] !== 包) 被人改过.push(键);
      // 装之前不是自有属性（方法在原型上）⇒ 还原必须是 `delete`，赋回原函数会留下一层遮住原型的影子
      if (自有) 容器[方法] = 源;
      else delete 容器[方法];
    }
    return { 被人改过, 还原数: 装好的.length };
  };

  return { 一帧, 读数, 卸载, 站点数: 记录.size, 装好数: 装好的.length };
}

/** 与 `perf-smoke` 同一把尺：升序后取下标 `floor(n × q)`，不插值。 */
function 分位(升序列, q) {
  return 升序列[Math.min(升序列.length - 1, Math.floor(升序列.length * q))];
}

/**
 * 一次到位的普查：现推站点 → 装 → 推 `帧数` 帧 → 读数 → 卸（异常也保证卸）。
 * 给测试与页面用；`perf-smoke` 要分批推帧，所以它拿的是 `扫站点` + `装普查`。
 */
export function 每帧普查(游戏, 帧数 = 60) {
  // 文本一次取好，站点与"够不着"都从它推 —— 装完补丁之后 `String(游戏.update)` 就是包装层的内脏了
  const 文本 = String(游戏.update);
  const 站点们 = 扫站点(文本);
  const 手 = 装普查(游戏, 站点们);
  const 首 = 手.读数();
  if (首.坏站点.length) {
    手.卸载();
    throw new Error(`普查接不上对象：${首.坏站点.join(' / ')} —— 站点是从 update() 的函数体扫出来的，`
      + '接不上就是尺子坏了，不把这一格读成 0 笔');
  }
  let 卸;
  try {
    for (let i = 0; i < 帧数; i += 1) 手.一帧();
  } finally {
    卸 = 手.卸载();
  }
  const 出 = 手.读数();
  出.站点总数 = 站点们.length;
  出.站点数 = 手.站点数;
  出.装好数 = 卸.还原数;
  出.被人改过 = 卸.被人改过;
  出.还原数 = 卸.还原数;
  出.够不着 = 扫够不着(文本);
  return 出;
}
