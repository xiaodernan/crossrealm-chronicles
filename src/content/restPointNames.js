/**
 * 营火显示名 —— 玩家看到的那座火叫什么，全仓只有这一份（W-B4 切片2）。
 *
 * 为什么要有这个文件：营火名今天被四个界面各自要说一遍 —— 对话标题、脚下的交互提示、
 * 快速旅行面板的行、营火记忆图鉴的行。此前它们没有一个共同的源：世界里那一座的名字在
 * `world/RestPointManager.buildDefaults()` 当场拼，对话树的标题在 `content/restDialogues.js`
 * 手抄，于是**已经漂过两次**（`hub` 一个写 '世界之锚休息点' 一个写 '世界之锚营火'；
 * `magic` 那格抄的是早已废弃的区名 '魔法遗境'，而区名实为 '霍格沃兹遗境'）。
 * 漂移不报错：两边都是合法字符串，只有玩家看得出两座名字对不上。
 *
 * 现在：`world/RestPointManager` 从这张表取名字，对话标题取营火**自己**的名字
 * （`RestDialogue` 读 `activeRest.name`），图鉴与面板本来就走 `restPoints.nameOf(id)`。
 *
 * 五座位面的营火沿用"区名 + 营火"的拼法：区名改口时营火跟着改，不会再留下一座叫旧名的火
 * （`magic` 那一格正是这条拼法救回来的 —— 世界层因此从未漂过，漂的是抄本）。
 * 枢纽那座刻意不叫"交汇枢纽营火"：玩家认的是场地中央那件东西（世界之锚），不是这片地皮的名字。
 * 它的名字与其余五座不同形，是有意的文案选择，不是漏改。
 */
import { ZONE_IDS, ZONE_NAMES } from './ZoneIdentity.js';

/** @type {Record<string, string>} 营火 id（= 所在区域 id）→ 显示名 */
export const REST_POINT_NAMES = {
  [ZONE_IDS.HUB]: '世界之锚休息点',
  [ZONE_IDS.FANTASY]: `${ZONE_NAMES[ZONE_IDS.FANTASY]}营火`,
  [ZONE_IDS.MAGIC]: `${ZONE_NAMES[ZONE_IDS.MAGIC]}营火`,
  [ZONE_IDS.SPACE]: `${ZONE_NAMES[ZONE_IDS.SPACE]}营火`,
  [ZONE_IDS.VOID]: `${ZONE_NAMES[ZONE_IDS.VOID]}营火`,
  [ZONE_IDS.ABYSS]: `${ZONE_NAMES[ZONE_IDS.ABYSS]}营火`,
  [ZONE_IDS.GLOOM]: `${ZONE_NAMES[ZONE_IDS.GLOOM]}营火`,
  [ZONE_IDS.RADIANT]: `${ZONE_NAMES[ZONE_IDS.RADIANT]}营火`,
};
