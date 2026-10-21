/**
 * 漂浮魂火（残响）的出生点 —— 每座位面几枚、每一枚给多少魂火。
 *
 * ## 为什么搬进内容层（W-B12 切片5）
 *
 * 这张表原先住在 `world/SoulWispManager.js` 里 —— 那是**纯数据**（id / 区位 / 坐标 / 魂火数），
 * 按项目自己的规矩「内容（数值、文案、布局）不写在逻辑文件里」本就该在 `content/`。
 * 搬进来的**直接收益**不是洁癖：分区支线「拾遗一座」要"收齐该区两枚萤火"，
 * 而**有没有萤火是按区位判的** —— 表在 `world/` 时，内容层**够不着**它，
 * 于是"某座区一条萤火都没有 ⇒ 那条支线永远完成不了"这件事**没人能查**（见本文件末尾的病根）。
 * 表在内容层之后，注册表的整表校验就能当场点名。
 *
 * ## 病根（W-B12 切片5 实测）
 *
 * 分区支线覆盖全部七座真实位面（每位面两条：`side-zone-<区>` + `side-wisp-<区>`），
 * 而这张表原先**只有 hub / fantasy / magic / space / void / abyss 六档** ——
 * **gloom 与 radiant 一枚都没有**（那两座区是 W-B9 切片1 后加的，萤火表没跟着长）。
 * 于是 `side-wisp-gloom` 与 `side-wisp-radiant` 的判据
 * （`soulWisps.collectedInZone(zone) >= 2`）**永远是 0 >= 2** ——
 * 玩家看到进度条上**两个永远填不满的空格**，而没有任何报错、没有任何日志。
 * 本片给那两座区各补两枚（位置按各区地形实测：离营火 18~22 米、周围无碰撞体、
 * 两枚之间 36~43 米 —— 与其余六档的分布同档）。
 *
 * ## 魂火数的口径
 *
 * `souls` 是那一枚给多少魂火。其余六档的分布是：hub 8/8、fantasy 12/15、magic 12/14、
 * space 12/15、void 18/20、abyss 18/22 —— 越靠后的区给得越多。gloom 与 radiant 的
 * **成长档位在 void / abyss 之后**（`content/enemyGrowth.js` 的 `ENEMY_GROWTH` 按
 * `ZONE_ORDER` 逐区一档：gloom 第 5 档、radiant 第 6 档，是最靠后的两档），
 * 所以取那条递增带的续上：gloom 20/22、radiant 22/24。
 *
 * ## 坐标是**世界坐标**
 *
 * 与其余几档同口径（不是区位局部坐标）：`SoulWispManager.build()` 用
 * `world.getGroundHeight(spot.x, spot.z)` 现取高度，魂火浮在地面上 1.2 米。
 */
import { ZONE_IDS } from './ZoneIdentity.js';

/**
 * @typedef {object} WispSpot
 * @property {string} id 稳定 id（**不是**区位前缀 —— 区位写在 `zone` 那一格）
 * @property {string} zone 归属位面（`ZONE_IDS` 之一）
 * @property {number} x 世界坐标 x
 * @property {number} z 世界坐标 z
 * @property {number} souls 吸收这一枚给多少魂火
 */

/** @type {ReadonlyArray<WispSpot>} */
export const WISP_SPOTS = Object.freeze([
  { id: 'wisp-hub', zone: ZONE_IDS.HUB, x: -15, z: 48, souls: 8 },
  { id: 'wisp-hub2', zone: ZONE_IDS.HUB, x: 18, z: 62, souls: 8 },
  { id: 'wisp-fantasy', zone: ZONE_IDS.FANTASY, x: -175, z: 25, souls: 12 },
  { id: 'wisp-fantasy2', zone: ZONE_IDS.FANTASY, x: -230, z: -20, souls: 15 },
  { id: 'wisp-magic', zone: ZONE_IDS.MAGIC, x: -25, z: -195, souls: 12 },
  { id: 'wisp-magic2', zone: ZONE_IDS.MAGIC, x: 40, z: -170, souls: 14 },
  { id: 'wisp-space', zone: ZONE_IDS.SPACE, x: 185, z: 70, souls: 12 },
  { id: 'wisp-space2', zone: ZONE_IDS.SPACE, x: 220, z: 120, souls: 15 },
  { id: 'wisp-void', zone: ZONE_IDS.VOID, x: 10, z: 205, souls: 18 },
  { id: 'wisp-void2', zone: ZONE_IDS.VOID, x: -15, z: 235, souls: 20 },
  { id: 'wisp-abyss', zone: ZONE_IDS.ABYSS, x: -210, z: 205, souls: 18 },
  { id: 'wisp-abyss2', zone: ZONE_IDS.ABYSS, x: -185, z: 250, souls: 22 },
  // gloom / radiant（W-B12 切片5 补上）：这两座区原先一枚都没有 ⇒ 对应的分区支线永远做不完。
  { id: 'wisp-gloom', zone: ZONE_IDS.GLOOM, x: 196, z: 108, souls: 20 },
  { id: 'wisp-gloom2', zone: ZONE_IDS.GLOOM, x: 164, z: 92, souls: 22 },
  { id: 'wisp-radiant', zone: ZONE_IDS.RADIANT, x: -198, z: -172, souls: 22 },
  { id: 'wisp-radiant2', zone: ZONE_IDS.RADIANT, x: -162, z: -148, souls: 24 },
]);
