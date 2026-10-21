/**
 * 无头 harness 的读数完整性判定（W-C2 切片6b，#165）—— `npm run perf` 与 `npm run e2e` 共用的
 * "这一轮的数到底是不是数"。
 *
 * ## 为什么单独一个文件（以及为什么它不叫 perf-*）
 *
 * `perf-smoke.mjs` 与 `e2e-clear.mjs` 都是**导入即执行**的（顶层就起 vite 与 Chrome），门禁不能
 * import 它们 —— 那是 W-D4 切片3 立下的分家。所以"什么算一个交出来的读数"这条判据住在这里，
 * 两个脚本与门禁问的是**同一个判**（`src/engine/drawCallBudget.js` 之于上限表是同一条纪律）。
 * 切片6c 把 e2e-clear 也接进来之后，名字里的 `perf-` 就成了谎话 —— 它守的是"任何一条用 CDP
 * 驱动无头页的门禁"，两把尺一旦分家，下一次红的就是其中一把。
 *
 * ## 这一片在补的那半个洞
 *
 * 预算表比的是 `枢纽.updateAvgMs > 预算.updateAvgMs` 这样的**大于**式。NaN 不参与大于：
 * `NaN > 40` 是 false，于是"页面里那 240 帧的账根本没交出来"这一轮会**绿**。
 * 2026-10-21 的阴影普查（`.tmp-wc2s6/`）在同一条腿上真撞上过一次：hub 那一站的 ms 腿抛错，
 * 整站的物件名册差点被一起丢掉 —— 差别只在于那一次是**我写的 try 把它吞了**，
 * 而这把尺子吞的时候连一句红都不报。
 *
 * 所以这里只问一件事：**每一站、每一列都得是有限正数，站点集合得与名单逐格对齐**，
 * 外加四条"这一轮连的是不是我自己起的那个页、那个页中途有没有被换掉"的归属判据。
 * 它不问"好不好的数"（那是预算表的事），也不给任何容差 —— 容差会变成下一次红之后
 * 被放宽的那个数。
 */

/** 有限正数：0 与 NaN 与 Infinity 都不是"量到了" */
export const 是有限正数 = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** draw call 腿的三列（也是 `perf-smoke` 往页面里那句话要的三个字段） */
export const DRAW列 = Object.freeze(['整帧', '本体', '阴影']);

/** CPU 腿的三列（每列都得是有限正数，否则预算表的 `>` 会绿在空尺上） */
export const CPU列 = Object.freeze(['updateAvgMs', 'updateP95Ms', 'frameAvgMs']);

/**
 * draw call 腿：一站交出来的东西得长什么样。
 *
 * 三条各自的理由：
 * - **整数**：`renderer.info.render.calls` / `.triangles` 只会给整数。读到非整数（含 NaN）
 *   说明这句话压根没跑到，或跑到的是别的页。
 * - **正数**：0 不是"很好"，是"没量到"。三列里任何一列为 0 都让那一站的分母失去意义。
 * - **差值自洽**：阴影列在页面里就是 `整帧 − 本体`。脚本这边再算一次、比一遍，为的是把
 *   "那一列的算法"钉住 —— 将来有人把它改成第三趟取账，这里会红，而不是让两列悄悄同源。
 */
export function draw读数问题(站id, r) {
  const 问 = [];
  if (!r || typeof r !== 'object') {
    return [`站点 ${站id} 没交出读数对象（拿到 ${JSON.stringify(r)}）`];
  }
  for (const 列 of DRAW列) {
    const v = r[列];
    if (!Number.isInteger(v)) {
      问.push(`站点 ${站id} 的 "${列}" 列不是整数（读到 ${String(v)}）—— info.render.calls 只会给整数，非整数=这一趟没跑到`);
    } else if (!(v > 0)) {
      问.push(列 === '阴影'
        ? `站点 ${站id} 的阴影趟读到 ${v}（整帧 ${r.整帧} / 本体 ${r.本体}）—— 关阴影没有减少任何 call，两列分家就是假的`
        : `站点 ${站id} 的 "${列}" 列读到 ${v} —— 0 不是"达标"，是没量到`);
    }
  }
  if (Number.isInteger(r.整帧) && Number.isInteger(r.本体) && Number.isInteger(r.阴影)
    && r.阴影 !== r.整帧 - r.本体) {
    问.push(`站点 ${站id} 的三列不自洽：阴影 ${r.阴影} ≠ 整帧 ${r.整帧} − 本体 ${r.本体} —— 两列不再是同一帧的差值`);
  }
  if (!Number.isInteger(r.三角面) || !(r.三角面 > 0)) {
    问.push(`站点 ${站id} 的 tri 读到 ${String(r.三角面)} —— 画了 call 却没画面，这一站的取账落在空场景上`);
  }
  return 问;
}

/**
 * CPU 腿：一站的推帧计时得交出什么。
 *
 * `应有帧数` 由脚本里的批数 × 每批帧推出来（不是这里写死的数）。帧数不够 = 有一批没回来，
 * 而那一批的缺席只会让 `均值` 变小或变 NaN，预算表的 `>` 永远抓不到它。
 */
export function cpu读数问题(名字, r, 应有帧数) {
  const 问 = [];
  if (!r || typeof r !== 'object') {
    return [`站点 ${名字} 没交出 CPU 腿读数对象（拿到 ${JSON.stringify(r)}）`];
  }
  if (r.frames !== 应有帧数) {
    问.push(`站点 ${名字} 交出 ${String(r.frames)} 帧，应有 ${应有帧数} 帧 —— 有一批计时没回来，均值是在缺样的样本上算的`);
  }
  for (const 列 of CPU列) {
    if (!是有限正数(r[列])) {
      问.push(`站点 ${名字} 的 "${列}" 读到 ${String(r[列])} —— 非有限正数过不了预算表的">"（NaN > 40 是 false），那一格会绿在空尺上`);
    }
  }
  return 问;
}

/**
 * 名册覆盖：交出来的站点集合必须与名单**逐格**相等。
 *
 * 少一站 = 那一站被静默跳过（与"上限表缺站"同罪，但那条查的是表，这一条查的是**这一轮真跑了**）；
 * 多一站 = 脚本自己发明了一站，名册不再是唯一答案；顺序也钉 —— 日志与读数得与上限一一对得上，
 * 否则"逐站上限"会被贴到别人的读数上。
 */
export function 覆盖问题(名单, 读数) {
  const 交 = 读数.map((r) => r?.站);
  const 问 = [];
  const 少 = [...名单].filter((id) => !交.includes(id));
  const 多 = 交.filter((id) => !名单.includes(id));
  const 重 = 交.filter((id, i) => id !== undefined && 交.indexOf(id) !== i);
  if (少.length) 问.push(`名册里有这一站却没交出读数：${少.join(', ')} —— 那一站被静默跳过（= 静默放开）`);
  if (多.length) 问.push(`交出了名册外的站点读数：${多.join(', ')} —— 站点名单的唯一真源是名册`);
  if (重.length) 问.push(`同一站交出多份读数：${[...new Set(重)].join(', ')} —— 逐站上限会被贴到错的那一份上`);
  if (!问.length && 交.join(',') !== [...名单].join(',')) {
    问.push(`站点顺序与名册不一致：交出 ${交.join(',')} / 名册 ${[...名单].join(',')} —— 逐站上限是按站贴的，顺序漂了就贴错地方`);
  }
  return 问;
}

/**
 * CDP 口的形状：Chrome 自己报出来的那一行里必须有的东西。
 *
 * 判定放在这里（而不是只写在脚本里）是为了让门禁能**喂真字符串**验它：
 * 一条从不被坏输入走过的解析，等于一条没测过的解析。
 */
export const DEVTOOLS行 = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser\/(\S+)/;

/** 从 Chrome 的 stderr/stdout 全文里取口；取不到就返回 null（由调用方决定怎么红） */
export function 解析CDP口(全文) {
  const 匹 = DEVTOOLS行.exec(String(全文 ?? ''));
  if (!匹) return null;
  const 口 = Number(匹[1]);
  if (!Number.isInteger(口) || !(口 > 0) || 口 > 65535) return null;
  return { 口, 浏览器ws: `ws://127.0.0.1:${口}/devtools/browser/${匹[2]}` };
}

/**
 * 页归属：`/json/list` 里挑的是**第一个** `type === 'page'`，同一台浏览器里可能有别人开的页。
 *
 * 前缀带尾斜杠不是排版洁癖：端口是数字，`http://127.0.0.1:5199` 能匹配上 `51990` 那台服务的页
 * —— 数字前缀没有边界，尾斜杠就是那道边界。
 */
export function 页地址问题(页地址, 端口) {
  const 文 = String(页地址 ?? '');
  const 期望 = `http://127.0.0.1:${端口}/`;
  if (文.startsWith(期望)) return [];
  return [`连到的页不是本进程的页：location.href=${文.slice(0, 160) || '(空)'}（应以 ${期望} 开头）`];
}

/**
 * 通道自证：`exceptions.length === 0` 有两种成因 —— 页面真没抛，与事件通道一条都没送。
 * 前者是达标，后者是空尺，读出来是同一个 0。
 *
 * `Runtime.enable` 一定 flush 现存执行上下文，所以"执行上下文 ≥ 1"是一个**正面**见证
 * （数的是必然会来的东西），不是又一个"没看到坏东西"。
 */
export function 通道问题(通道) {
  const 条 = 通道?.执行上下文;
  if (Number.isInteger(条) && 条 > 0) return [];
  return [`CDP 事件通道一条事件都没送（执行上下文 ${String(条)} 条）—— 后面那句 exceptions=0 不作数：通道断了与页面没抛错读出来是同一个 0`];
}

/**
 * 中途全量重载 = 这一轮的读数**不作数**（W-C2 切片6d，#167）。
 *
 * 症状见过两次（2026-10-22）：另一路会话在跑批期间往 `src/` 里写了一下 ⇒ vite 发 full reload ⇒
 * 页面里的 `window.__game` 变回 undefined ⇒ 下一句 `evalJs` 红成
 * `TypeError: Cannot read properties of undefined (reading 'player')`。
 * **红得像是代码坏了**，而实际是这一轮的量被换掉了 —— 归因错一次的代价是把别人的提交回滚了
 * 或者把自己的好改动"修"一遍。
 *
 * 判据用一个已经在数的数：执行上下文的条数。一页活到底，它不会自己再涨（本仓没有 worker，
 * 也没有 iframe）；**动了就说明页被重建过**（重建会先把旧上下文销毁，所以条数也可能变小 ——
 * 只防"变多"是半个判据）。所以这里要的是"测量开始前的条数"与"现在的条数"相等。
 *
 * `基线 === null` 是**还没取到基线**（这一轮在见证之前就死了），不作判、也不假装判过 ——
 * 其他任何非整数都算这条作废判据自己没喂到数，点名拒绝。
 */
export function 重载问题(基线, 结束) {
  if (基线 === null) return [];
  if (!Number.isInteger(基线)) {
    return [`基线条数不是整数（读到 ${String(基线)}）—— 这条作废判据自己被喂了个空尺`];
  }
  const 差 = 结束 - 基线;
  if (差 === 0) return [];
  return [`测量期间页面的执行上下文从 ${基线} 条变成 ${结束} 条（差 ${差}）—— 页在中途被重建过（最常见的原因：有人在这轮跑的时候往 src/ 写了一下，vite 发了全量重载）。这轮的每一个读数都不是从同一个页里读出来的，**这一轮不作数**`];
}
