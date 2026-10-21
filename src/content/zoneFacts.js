/**
 * 位面事实的生产者 —— 分区支线读的那四样，各自由谁产（W-B12 切片5）。
 *
 * ## 这一层存在的理由
 *
 * 分区支线（`side-zone-<区>` / `side-wisp-<区>`）的判据只读**四样位面事实**，
 * 而这四样的**生产者**分住在四张表里：
 *
 * | 事实 | 谁产 | 表 |
 * |---|---|---|
 * | 该区收了几枚萤火 | 漂浮魂火出生点 | `content/wispSpots.js` |
 * | 在那座火边歇过几次 | 营火（id = 区 id） | `content/restPointNames.js` |
 * | 认过那块火牌 | **同一座营火**（木牌的 id 就是营火的 id = 区 id） | 同上 |
 * | 看过那张门口插画 | 对话 CG 预设的 `<区>:start` | `content/dialogueCgPresets.js` |
 *
 * 四张表**都在内容层**，所以"某座区的那一样事实有没有生产者"这件事**在开机校验里查得到**。
 * 这是 W-B3 切片6/7 那条「判据闭包」尾巴在**位面维度**上的落点 ——
 * 切片6/7 核的是"判据读的那一格**还在不在**"，而这一层核的是更靠下的一格：
 * **"那一格在这一座区里有没有人写"**。
 *
 * ## 病根（W-B12 切片5 实测）
 *
 * 萤火出生点表原先住在 `world/SoulWispManager.js`（纯数据写在逻辑文件里），
 * 而它**只有 hub / fantasy / magic / space / void / abyss 六档** ——
 * **gloom 与 radiant 一枚都没有**（那两座区是 W-B9 切片1 后加的，萤火表没跟着长）。
 * 分区支线却覆盖全部七座真实位面，于是 `side-wisp-gloom` 与 `side-wisp-radiant`
 * 的判据（`collectedInZone(zone) >= 2`）**永远是 0 >= 2** ——
 * 玩家看到进度条上**两个永远填不满的空格**，而没有任何报错、没有任何日志。
 *
 * 表搬进内容层之后，这件事才**可查** —— 而这一层就是查它的那道门。
 */
import { WISP_SPOTS } from './wispSpots.js';
import { REST_POINT_NAMES } from './restPointNames.js';
import { REST_DIALOGUE_CG } from './dialogueCgPresets.js';
import { STAT_EVENTS } from './objectives.js';
import { SIDE_QUESTS_ZONE } from './sideQuests.js';

/**
 * 分区支线"拾遗一座"要**收齐两枚**萤火 —— 所以一位面至少要两枚萤火，
 * 少一枚那条支线就永远完成不了。
 */
export const WISPS_PER_ZONE = 2;

/**
 * 位面事实闭包：**凡是有分区支线的位面，那四样事实都得有生产者**。
 *
 * @param {Array<{zone:string}>} questTable 分区支线名单
 * @param {{萤火表?:Array, 营火表?:Record<string,string>, 插画表?:Record<string,object>}} [表]
 *   三张生产表的**注入口** —— 默认是生产用的那三份。用例要证明"门禁会咬"就得能造假表，
 *   而改共享模块里的对象会污染同进程的后续用例（那三张表里只有 `WISP_SPOTS` 的**数组**被冻结，
 *   里面的行对象没有 —— 改它们能"跑"，但那是在生产数据上做实验）。
 * @returns {string[]} 错误清单（空数组 = 闭包成立）
 */
export function checkZoneFactProducers(questTable = SIDE_QUESTS_ZONE, 表 = {}) {
  const out = [];
  const 萤火表 = 表.萤火表 ?? WISP_SPOTS;
  const 营火表 = 表.营火表 ?? REST_POINT_NAMES;
  const 插画表 = 表.插画表 ?? REST_DIALOGUE_CG;
  const 位面 = [...new Set((questTable ?? []).map((q) => q?.zone).filter(Boolean))].sort();

  for (const zone of 位面) {
    // ① 萤火：分区支线"拾遗一座"要收齐两枚
    const 萤 = 萤火表.filter((s) => s.zone === zone);
    if (萤.length < WISPS_PER_ZONE) {
      out.push(`位面 "${zone}" 只有 ${萤.length} 枚漂浮魂火 —— 分区支线要收齐 ${WISPS_PER_ZONE} 枚，`
        + '少一枚那条支线就永远完成不了（玩家看到的是进度条上一个填不满的空格）');
    }

    // ② 营火（火牌与营火同源：木牌的 id 就是营火的 id = 区 id）
    if (!营火表[zone]) {
      out.push(`位面 "${zone}" 没有营火 —— 分区支线要"在那座火边歇过三次"，`
        + '那座火不在 ⇒ 那条支线永远完成不了');
    }

    // ③ 门口插画
    if (!插画表[`${zone}:start`]) {
      out.push(`位面 "${zone}" 没有 "<区>:start" 那一格对话 CG —— 分区支线要"看过那张门口插画"，`
        + '那一格不在 ⇒ 那条支线永远完成不了');
    }

    // ④ 清剿数（W-B12 切片7）：第三样位面事实的生产者是 `enemy-defeated` 事件里的 `zone`。
    // 那一格**必须有人写** —— 没人写它，那条"清剿"支线就永远差最后一步。
    // （"那位面到底有没有敌人可杀"是**运行期**那一问，由 `tests/enemy-spawns-table.test.js`
    //   真造一个世界来核 —— 内容层没有世界，算不出区位。）
    if (!清剿数有生产者()) {
      out.push('清剿数（`stats.zoneKills`）没有生产者 —— `enemy-defeated` 事件的记账函数'
        + '必须写它（`zoneKills[区位] += 1`），不然每位面那条"清剿"支线永远差最后一步');
    }
  }

  return out;
}

/**
 * 清剿数那一格有没有人写 —— **从记账函数的源码里抠**（与 `questFacts.js` 同一套口径：
 * 事实是**推导**出来的，不是手抄一份名单）。
 */
function 清剿数有生产者() {
  const 记账 = STAT_EVENTS?.['enemy-defeated'];
  if (typeof 记账 !== 'function') return false;
  return /(?<![\w$.])s\.zoneKills\b/.test(记账.toString());
}
