/**
 * 存档版本链。
 *
 * 每一跳只做一件事：把上一版 schema 显式改写成下一版，改写完成后必须能通过
 * `SaveValidator.validate`。读档只接受 `CURRENT_VERSION`，其余版本一律走这里，
 * 不允许"字段缺失就当默认值凑合读"——那正是 v4 之前丢进度而无人察觉的原因。
 */
import { SaveValidator, CURRENT_VERSION } from './SaveValidator.js';

export { CURRENT_VERSION };

/** 浏览器存储键，从新到旧；旧键迁移成功后保留一份，便于回滚到旧构建 */
/** 约定：SAVE_KEYS 首项即当前写入键（tests/save-migrations.test.js 断言此不变量） */
export const SAVE_KEYS = [
  { key: 'crossrealm_save_v8', version: 8 },
  { key: 'crossrealm_save_v7', version: 7 },
  { key: 'crossrealm_save_v6', version: 6 },
  { key: 'crossrealm_save_v5', version: 5 },
  { key: 'crossrealm_save_v4', version: 4 },
];

export class SaveVersionError extends Error {}

/** v1–v3 从未有过独立 schema，只是缺字段；按 v4 的必填集合补齐后再进入版本链 */
function ensureV4Shape(d) {
  if (!d || typeof d !== 'object') throw new SaveVersionError('存档根节点不是对象');
  d.player ??= {};
  d.stats ??= {};
  d.quests ??= {};
  d.quests.stats ??= {};
  d.quests.completed ??= false;
  d.quests.index ??= 0;
  SaveValidator.normalize(d);
  return d;
}

/**
 * v4 → v5
 * - `player.yaw` / `player.pitch`：镜头轨道角此前不入档，读档后朝向恒为初始值
 * - 删除 `quests.stats.skillsUnlocked`：该值由 `weaponSkills.unlocked` 反查，入档只会过期
 * - `settings` / `spells` 成为必填对象：读档侧不再做 `??` 兜底
 */
function migrateV4toV5(d) {
  const player = (d.player ??= {});
  const { yaw = Math.PI, pitch = 0.38 } = player;
  player.yaw = Number.isFinite(yaw) ? yaw : Math.PI;
  player.pitch = Number.isFinite(pitch) ? pitch : 0.38;
  delete d.quests?.stats?.skillsUnlocked;
  d.spells = { mana: Number.isFinite(d.spells?.mana) ? d.spells.mana : 100 };
  d.settings ??= {};
  return d;
}

/**
 * v5 → v6
 * - `stats.bag`：背包（W-B5 切片4）。v5 及更早的档没有包，这一跳补一个空包进去，
 *   而不是让读档侧写 `?? []` —— 后者就是本文件开头禁止的"字段缺失就当默认值凑合读"，
 *   它会让"迁移链漏跑一跳"与"这份档本来就没包"变得无法区分。
 */
function migrateV5toV6(d) {
  const stats = (d.stats ??= {});
  if (!Array.isArray(stats.bag)) stats.bag = [];
  return d;
}

/**
 * v6 → v7
 * - `restPointEnhancer.discovered`：营火地标"发现过哪些"入档（修 B66）。
 *   v6 及更早的档里这个键根本不存在 —— 因为**写档侧从来没有写过它**，而读档侧一直在读，
 *   那行加载代码是死的：每次读档所有营火都退回"没见过"，同一句"发现营火 · X"再播一遍。
 *   旧档不补空集合，而是从它**自己已有的另一件事实**推出来：`campfireMemory.restCount` 的键
 *   就是玩家歇过的营火 id，歇过必然见过。推不出来的一部分（走近过但没歇过）确实无法还原，
 *   那部分宁可让它重播一次提示，也不在代码里假装知道。
 */
function migrateV6toV7(d) {
  const 歇过 = Object.keys(d.campfireMemory?.restCount ?? {});
  const enhancer = (d.restPointEnhancer ??= {});
  if (!Array.isArray(enhancer.discovered)) enhancer.discovered = 歇过;
  return d;
}

/**
 * v7 → v8：**主线加长一步**（W-E3 切片9），主线那 32 步的下标是**存档语义**
 * （`quests.index` 就是这条序列的下标）⇒ 在中间插一步，后面每一步的下标全部 +1。
 *
 * ## 为什么必须是迁移，而不是"读档侧兜底"
 *
 * `quests.index` 是**位置**，不是 id。改前那份 24 号位是 `void-boss`（破碎时线的执政官），
 * 改后 24 号位变成了新插的 `void-casket`（断时之匣）—— 若不迁移，老存档读进来会
 * **跳过**新插的那一步，直接落到执政官身上 ⇒ 玩家永远看不到断时之匣，
 * 而存档看起来"完全正常"（没有报错、没有坏档提示）⇒ **静默丢一段内容**。
 *
 * ## 插入点是**历史事实**，写死在这里
 *
 * `V8_INSERT_AT = 24` 记的是"v8 这一版把新步插在了第 24 位"这一件**发生过的事**。
 * 它**不能**从当前主线表反推（表会再变，而迁移必须永远按当初那件事算）；
 * 但它**可以**被门禁核：门禁断言"当前表的第 24 位就是那个新步"，
 * 于是"迁移算错位置"当场红。
 *
 * ## 越界的下标也照偏移（无妨）
 *
 * 迁移只认"整数且 ≥ 插入点"这一条，不去判断它是否落在当时那条 32 步序列的范围内 ——
 * 越界的值本来就无效（读档侧会按 `MAINLINE.length - 1` 夹住并留下一条能读懂的理由，
 * B120 那一族），而偏移与不偏移**落在同一格** ⇒ 两种做法等价，而"少一个常量"
 * 更要紧（多一个"当时那条序列有多长"的常量，就多一处可能写错的地方）。
 */
export const V8_INSERT_AT = 24;

function migrateV7toV8(d) {
  const quests = d.quests ?? {};
  const idx = Number(quests.index);
  if (Number.isInteger(idx) && idx >= V8_INSERT_AT) quests.index = idx + 1;
  return d;
}

export const MIGRATIONS = {
  1: ensureV4Shape, 2: ensureV4Shape, 3: ensureV4Shape,
  4: migrateV4toV5,
  5: migrateV5toV6,
  6: migrateV6toV7,
  7: migrateV7toV8,
};

/**
 * 把任意已知版本的存档升到当前版本。
 * @returns {{ data: object, from: number, applied: number[] }}
 */
export function migrate(input) {
  if (!input || typeof input !== 'object') throw new SaveVersionError('存档根节点不是对象');
  const data = input;
  const from = Number(data.version ?? 0);
  if (from > CURRENT_VERSION) {
    throw new SaveVersionError(`存档版本 v${from} 高于当前构建支持的 v${CURRENT_VERSION}`);
  }
  const applied = [];
  // 无版本号的历史档按 v1 处理（早期构建未写 version 字段）
  data.version = from || 1;
  while (data.version < CURRENT_VERSION) {
    const step = MIGRATIONS[data.version];
    if (!step) throw new SaveVersionError(`缺少 v${data.version} → v${data.version + 1} 的迁移`);
    step(data);
    applied.push(data.version);
    data.version += 1;
  }
  return { data, from, applied };
}
