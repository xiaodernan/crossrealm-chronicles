/**
 * 敌人成长曲线 —— W-E1 切片3（"3 档难度 + 敌人成长曲线"的后半句）。
 *
 * ## 这条曲线站在哪个轴上
 *
 * 候选轴有三个，选的是**区域进度**（`ZONE_ORDER` 的下标）：
 *
 * - **玩家等级**：敌人跟着人长，"后面的区"与"前面的区"对同一个玩家是同一难度，
 *   "这个世界越走越危险"这句话就没了；且等级是玩家私有状态，同一只怪在两个存档里两个数。
 * - **副本房间数**：只有副本长得好，野外没有轴；且房间数是**规模**不是**进度**。
 * - **区域进度**：世界按 `ZONE_ORDER` 一圈圈展开（`WorldManager.build()` 就是这个顺序），
 *   下标即"玩家大概什么时候到这"。敌人强度是**地方的属性**，不是玩家的属性 ——
 *   于是"先绕路去深渊"是一个真实的（也更难的）选择，而不是被等级曲线抹平。
 *
 * 副本走同一根轴但**不按坐标反推**：副本出生点在 `(5000, …)` 的独立坐标空间里，
 * `zoneIdAt` 一律落 corridor。所以每座副本在自己的定义行上显式写 `stage`
 * （`content/dungeons.js`，注册表必填 + 域内校验）—— 那是设计决定，不是推导。
 *
 * ## 与难度乘子的关系（两个乘子相乘，与先后无关）
 *
 * `spawnAt` 的最终血量 = 名册 hp × `difficulty.enemyHp` × `growth.hp`。
 * 两个乘子都是正的有限数，乘法可交换，不存在"先乘谁"的裁判问题。
 * 语义也各占一边：**难度是玩家选的，成长是地方给的** —— 谁也不覆盖谁。
 *
 * ## 0 档必须恒等
 *
 * 出发点（灰白森林）与枢纽 / 走廊逐格 ×1 —— "接上成长曲线"与"没接"在初始区域
 * 逐字节相同。这条由 `checkEnemyGrowth` 硬断言，不靠记忆。
 *
 * ## 这一张表不管什么
 *
 * - `posture`（硬直抗性）：跟着血量缩会把"更脆"变成"更容易被打断两次"，那是另一件事；
 * - Boss：`content/bossRoster.js` 与 `DungeonManager` 自己的房间数公式，不进来；
 * - 召唤物：**收编了**（W-E1 切片4）—— 它们不走 `spawnAt`（招式表里自报户口），
 *   而是按**召唤者身上记下的档位**长（`EnemyManager._drainSummons`），与名册同一张表；
 * - 魂收入：那是难度乘子 `souls` 的轴（W-E1 切片1），成长曲线不碰 —— 两个轴各司其职。
 */

import { ZONE_IDS, ZONE_ORDER } from './ZoneIdentity.js';
import { DUNGEON_DEFS, DUNGEON_IDS } from './dungeons.js';

/**
 * 两个乘子的键名单。与 `DIFFICULTY_KEYS` 同一形状：加一格就必须同时加一个读者，
 * 否则 `tests/enemy-growth.test.js` 里"每一格都有人读"那条当场红。
 */
export const GROWTH_KEYS = ['hp', 'damage', 'souls'];

/**
 * 档位表。**index 即档位**，长度必须与 `ZONE_ORDER` 一致（每座真实区域一档，
 * 由 `checkEnemyGrowth` 钉住）—— 加一座区忘加一档，那一座的敌人会静默停在旧强度。
 *
 * 数值口径（第一版，等真人试玩校准；调曲线只改这一张表）：
 * 每档 +10% 血量、+5% 伤害。走完七档 = 血量 +60% / 伤害 +30% ——
 * 够让"绕路去深渊"成为一个能感觉到的决定，又不至于让早期一击秒人。
 */
export const ENEMY_GROWTH = Object.freeze([
  Object.freeze({ hp: 1.0, damage: 1.0, souls: 1.0 }),   // 0 
  Object.freeze({ hp: 1.1, damage: 1.05, souls: 1.25 }),   // 1 
  Object.freeze({ hp: 1.2, damage: 1.1, souls: 1.35 }),   // 2 
  Object.freeze({ hp: 1.3, damage: 1.15, souls: 1.45 }),   // 3 
  Object.freeze({ hp: 1.4, damage: 1.2, souls: 1.55 }),   // 4 
  Object.freeze({ hp: 1.5, damage: 1.25, souls: 1.65 }),   // 5 
  Object.freeze({ hp: 1.6, damage: 1.3, souls: 1.75 }),   // 6 
].map(Object.freeze));

/** 最大合法档位（副本定义行上的 `stage` 上界，注册表也照此校验） */
export const GROWTH_MAX_STAGE = ENEMY_GROWTH.length - 1;

/**
 * 取一档。**认不出就抛**（与 `enemyRosterOf` / `difficultyOf` 同一口径，B71）：
 * 静默取 0 档的症状是"越界数据看起来像初始强度"，没人会去查。
 */
export function growthAt(stage) {
  const row = ENEMY_GROWTH[stage];
  if (!Number.isInteger(stage) || !row) {
    throw new Error(
      `未知成长档位 ${JSON.stringify(stage)}（可用 0..${GROWTH_MAX_STAGE}）—— `
      + '静默取 0 档会让"数据越界"看起来像"这区本来就这个强度"'
    );
  }
  return row;
}

/**
 * 区域 id → 档位。枢纽与走廊不是战斗区（一个安全屋 + 一条通路），给 0 档；
 * **不在 `ZONE_ORDER` 里的 id 当场抛** —— 新加一座区忘配档位的症状应该是红，
 * 而不是"那座区的敌人永远停在出发强度"。
 */
export function zoneGrowthStage(zoneId) {
  if (zoneId === ZONE_IDS.HUB || zoneId === ZONE_IDS.CORRIDOR) return 0;
  const i = ZONE_ORDER.indexOf(zoneId);
  if (i < 0) {
    throw new Error(`区域 "${zoneId}" 不在 ZONE_ORDER 里 —— 新区域要配成长档位（见 content/enemyGrowth.js）`);
  }
  return i;
}

/** 副本 id → 档位（表在定义行上显式写着；由 `DUNGEON_DEFS` 现推，不抄第二份名单） */
const DUNGEON_STAGE = new Map(DUNGEON_DEFS.map((d) => [d.id, d.stage]));

/** 副本 id → 成长档位。认不出就抛（同上口径）。 */
export function dungeonGrowthStage(dungeonId) {
  const stage = DUNGEON_STAGE.get(dungeonId);
  if (!Number.isInteger(stage)) {
    throw new Error(
      `副本 "${dungeonId}" 没有可用的成长档位（收到 ${JSON.stringify(stage)}）—— `
      + `定义行上要显式写 stage（0..${GROWTH_MAX_STAGE}，注册表必填）；可用：${DUNGEON_IDS.join(' / ')}`
    );
  }
  return stage;
}

/**
 * 整表不变式，**返回错误列表**（一次报全部，不遇到第一条就抛）：
 *
 * 1. **档位数 == `ZONE_ORDER.length`** —— 每座真实区域一档；加区忘加档 =
 *    那座区的敌人静默停在旧强度（或少一档可选中途抛）。
 * 2. **0 档逐格为 1** —— 出发点区域"接上与不接一个样"（文件头那段话的落点）。
 * 3. **逐档单调不降** —— `ZONE_ORDER` 的顺序就是"越往后越难"，走反了这句话失效。
 * 4. **逐格有限正数** —— 0 或负数会让敌人出生即死或回血，NaN 让血条消失。
 */
export function checkEnemyGrowth(table = ENEMY_GROWTH) {
  const out = [];
  if (!Array.isArray(table) || table.length === 0) return ['成长曲线表必须是至少一档的数组'];
  if (table.length !== ZONE_ORDER.length) {
    out.push(
      `成长曲线档位数（${table.length}）与 ZONE_ORDER 的区域数（${ZONE_ORDER.length}）不一致 —— `
      + '每座真实区域一档：加区忘加档，那座区的敌人会静默停在旧强度'
    );
  }
  for (const [i, row] of table.entries()) {
    for (const k of GROWTH_KEYS) {
      const v = row?.[k];
      if (!Number.isFinite(v) || v <= 0) {
        out.push(`成长档位 ${i} 的 ${k} 必须是有限正数（收到 ${JSON.stringify(v)}）`);
      }
    }
    if (i === 0) {
      for (const k of GROWTH_KEYS) {
        if (row?.[k] !== 1) {
          out.push(
            `成长档位 0 的 ${k} 是 ${row?.[k]} 而不是 1 —— `
            + '"出发点区域接上与不接一个样"这条保证就没了'
          );
        }
      }
    } else {
      const prev = table[i - 1];
      for (const k of GROWTH_KEYS) {
        if (Number.isFinite(prev?.[k]) && Number.isFinite(row?.[k]) && row[k] < prev[k]) {
          out.push(
            `成长档位 ${i} 的 ${k}（${row[k]}）比 ${i - 1} 档（${prev[k]}）还低 —— `
            + 'ZONE_ORDER 的顺序是"越往后越难"，这一档却让后面更轻松'
          );
        }
      }
    }
  }
  return out;
}

/** 加载期入口：有问题就抛，把**全部**错误一次说完（与 `assertDifficultyTable` 同一条纪律） */
export function assertEnemyGrowth(table = ENEMY_GROWTH) {
  const errors = checkEnemyGrowth(table);
  if (errors.length) {
    throw new Error(`敌人成长曲线校验未通过（${errors.length} 处）：\n  - ${errors.join('\n  - ')}`);
  }
  return table;
}

assertEnemyGrowth();
