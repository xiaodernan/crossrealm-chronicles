/**
 * 任务引用的 id —— 那些 id **必须真有生产者**（W-B1 切片7）。
 *
 * ## 这一格为什么最要害
 *
 * 主线的一步读的是**一个具体的 id**（"摸一下世界之锚" / "和位面流浪者说话"）。
 * 那个 id 要是**没有人生产**（没有那个 POI、没有那次 `discovery` 派发、没有那位 NPC），
 * 这一步就**永远过不去** ⇒ 主线在那一格断掉 ⇒ **游戏通不了**。
 *
 * 而它**一句错都不报**：`objectiveDone` 对认不出的东西返回 `false`，
 * `conditionHolds` 对认不出的条件名也返回 `false`（"宁可卡住一步，也不放过一个没验过的门"）——
 * 那是**故意**的保守，可它同时意味着"卡住"这件事**没人查**。
 *
 * 次元回声那一族是同一形状、只是轻一些：回声的 `trigger`（`discovery:xxx` / `echo:xxx`）
 * 没有人派发 ⇒ 那条回声**永远不解锁** ⇒ 图鉴里少一条、日志里少一段（游戏仍能通关）。
 *
 * ## 已经有的三道防线，与本片补的那一道
 *
 * | 引用 | 谁核 | 状态 |
 * |---|---|---|
 * | `dungeonId` | 注册表 `t: 'ref', of: 'dungeons'` | ✅ 内容层，开机红 |
 * | `bossId` | 注册表 `t: 'ref', of: 'bosses'` | ✅ 本片补上（原先是 `t: 'id'`，只查形状） |
 * | `enemyType` | 注册表 `t: 'ref', of: 'enemyRoster'` | ✅ 本片补上（原先是 `t: 'string'`） |
 * | `targetId`（interact / discovery / npc）+ 回声 `trigger` | **本片** | 🔶 生产者在**世界层**（POI / `discovery` 事件 / NPC 定义 / `fireEcho` 派发点），内容层够不着 ⇒ 判据与执行分家 |
 *
 * ## 为什么只能分家
 *
 * 判据要回答的是"那个 id 有没有人生产"，而生产者分布在三个地方：
 * **POI**（世界构建期注册）、**`discovery` 事件**（世界层的派发点）、
 * **NPC**（`NPCManager` 的定义表）、**`fireEcho`**（致敬层的派发点）。
 * 这四样都在 `world/` 层，而 `content/` **不许向上够**（`tests/content-boundary.test.js` 钉着）。所以：
 *
 * - **判据**（本文件，纯函数）：给定"生产者集合"，回答"每一行的引用有没有落空"。
 * - **执行**（`tests/objective-target-refs.test.js`，Node 侧）：真造一个世界拿 POI 名单、
 *   扫 `src/` 拿 `discovery` / `fireEcho` 派发点与 NPC 名单，然后把几份交给判据。
 */

/**
 * @typedef {object} TargetProducers
 * @property {Set<string>|string[]} poiIds 世界上注册过的 POI id（摸一下就进 `discoveries`）
 * @property {Set<string>|string[]} discoveryIds `discovery` 事件派发过的 id
 * @property {Set<string>|string[]} npcIds NPC 名单里的 id
 * @property {Set<string>|string[]} echoTriggers `pop-culture-echo` 事件派发过的 trigger 键
 */

/** 归一：Set / 数组都收 */
const 集 = (v) => (v instanceof Set ? v : new Set(v ?? []));

/**
 * 主线目标引用的闭包检查。
 *
 * @param {Array<object>} table 主线表（`content/objectives.js` 的 `OBJECTIVES`）
 * @param {TargetProducers} 生产者 三份生产者名单
 * @returns {string[]} 错误清单（空数组 = 闭包成立）
 */
export function checkObjectiveTargets(table, 生产者) {
  const out = [];
  const poi = 集(生产者?.poiIds);
  const 发现 = 集(生产者?.discoveryIds);
  const npc = 集(生产者?.npcIds);

  for (const [i, row] of (table ?? []).entries()) {
    const at = `objectives[${i}]("${row?.id ?? '(无 id)'}")`;
    if (row?.type === 'interact' || row?.type === 'discovery') {
      if (!row.targetId) {
        out.push(`${at}: ${row.type} 这一步必须写 targetId（它要摸的那一个具体的东西）`);
        continue;
      }
      if (!poi.has(row.targetId) && !发现.has(row.targetId)) {
        out.push(`${at}: targetId "${row.targetId}" 没有任何生产者`
          + '（既不是世界里注册过的 POI，也没有 `discovery` 事件派发过它）'
          + ' —— 这一步永远过不去，主线在这里断掉');
      }
    }
    if (row?.type === 'npc') {
      if (!row.targetId) {
        out.push(`${at}: npc 这一步必须写 targetId（要找的那一位）`);
        continue;
      }
      if (!npc.has(row.targetId)) {
        out.push(`${at}: targetId "${row.targetId}" 不是任何一位 NPC`
          + ' —— 这一步永远过不去，主线在这里断掉');
      }
    }
  }
  return out;
}

/**
 * 次元回声 `trigger` 的闭包检查。
 *
 * `trigger` 有三种形状：
 * - `discovery:<id>` —— 靠 `discovery` 事件解锁（那条 id 必须有人派发）
 * - `echo:<id>` —— 靠 `pop-culture-echo` 事件解锁（那个 trigger 键必须有人 `fireEcho`
 *   **或**有人 `tryUnlock` —— 后者是**派生**解锁，`echo:full-resonance` 就是
 *   "全部回声都共鸣了"，它没有派发点，由 `PopCultureEchoSystem.tryUnlock` 的
 *   `stats.percent >= 100` 分支自己放出来）
 *
 * 两种都落空 ⇒ 那条回声**永远不解锁**（图鉴少一条、日志少一段；游戏仍能通关）。
 *
 * @param {Array<{id?:string, trigger?:string}>} table 回声表（`content/echoes.js` 的 `ECHOES`）
 * @param {TargetProducers} 生产者
 * @returns {string[]} 错误清单（空数组 = 闭包成立）
 */
export function checkEchoTriggers(table, 生产者) {
  const out = [];
  const 发现 = 集(生产者?.discoveryIds);
  const echo触发 = 集(生产者?.echoTriggers);

  for (const [i, row] of (table ?? []).entries()) {
    const at = `echoes[${i}]("${row?.id ?? '(无 id)'}")`;
    const t = row?.trigger;
    if (typeof t !== 'string' || t === '') {
      out.push(`${at}: 必须写 trigger（这一条靠什么解锁）`);
      continue;
    }
    if (t.startsWith('discovery:')) {
      const id = t.slice('discovery:'.length);
      if (!发现.has(id)) {
        out.push(`${at}: trigger "${t}" 的那个 id 没有任何 discovery 派发点 —— 这条回声永远不解锁`);
      }
    } else if (t.startsWith('echo:')) {
      if (!echo触发.has(t)) {
        out.push(`${at}: trigger "${t}" 没有任何 fireEcho 派发点 —— 这条回声永远不解锁`);
      }
    } else {
      out.push(`${at}: trigger "${t}" 的形状不认识（只认 "discovery:<id>" 与 "echo:<id>"）`);
    }
  }
  return out;
}
