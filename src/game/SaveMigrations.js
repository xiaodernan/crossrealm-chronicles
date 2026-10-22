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
  { key: 'crossrealm_save_v13', version: 13 },
  { key: 'crossrealm_save_v12', version: 12 },
  { key: 'crossrealm_save_v11', version: 11 },
  { key: 'crossrealm_save_v10', version: 10 },
  { key: 'crossrealm_save_v9', version: 9 },
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
 * 按插入点把**旧下标**折算成**新下标**（W-E3 切片9/10）。
 *
 * 插入点的含义：「新步插在旧序列的第 p 位**之前**」⇒ 旧下标 ≥ p 的每一步都往后挪一位。
 * 于是新下标 = 旧下标 + (那些 ≤ 旧下标的插入点的个数)。
 *
 * 为什么把这条折算**收成一个函数**：插一步要一条折算、插三步要三条折算 ——
 * 各写一遍就是三份可能互相漂开的算式（"插点 ≤ 还是 < 旧下标"这种差一位的错误，
 * 症状是老存档落到**相邻**那一步上 ⇒ 静默丢一段内容）。
 */
function 偏移后(旧下标, 插入点) {
  return 旧下标 + 插入点.filter((p) => p <= 旧下标).length;
}

/**
 * v7 → v8：**主线加长一步**（W-E3 切片9），主线那 32 步的下标是**存档语义**
 * （`quests.index` 就是这条序列的下标）⇒ 在中间插一步，后面每一步的下标全部 +1。
 *
 * ## 为什么必须是迁移，而不是"读档侧兜底"
 *
 * `quests.index` 是**位置**，不是 id。改前那份 24 号位是 `void-boss`（破碎时线的执政官），
 * 改后 24 号位变成了新插的 `void-hunt`（怨影肃清）—— 若不迁移，老存档读进来会
 * **跳过**新插的那一步，直接落到执政官身上 ⇒ 玩家永远看不到那一步，
 * 而存档看起来"完全正常"（没有报错、没有坏档提示）⇒ **静默丢一段内容**。
 *
 * ## 插入点是**历史事实**，写死在这里
 *
 * `V8_INSERT_POINTS = [24]` 记的是"v8 这一版把新步插在了第 24 位"这一件**发生过的事**。
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
export const V8_INSERT_POINTS = [24];

function migrateV7toV8(d) {
  const quests = d.quests ?? {};
  const idx = Number(quests.index);
  if (Number.isInteger(idx)) quests.index = 偏移后(idx, V8_INSERT_POINTS);
  return d;
}

/**
 * v8 → v9：**主线再长三步**（W-E3 切片10）。
 *
 * 这一跳插了三步（`hexer-hunt` / `crawler-hunt` / `knight-hunt`）⇒ 插入点是**三个数**，
 * 而不是一个 ⇒ 折算走上面那个共用的 `偏移后`（老下标 ≥ 某个插点的都往后挪）。
 *
 * 三个插点的口径（**旧序列**的下标）：
 * - 13 —— 在 `level` 之前（`hexer-hunt`）
 * - 25 —— 在 `void-boss` 之前（`crawler-hunt`）
 * - 29 —— 在 `skills` 之前（`knight-hunt`）
 *
 * 同样：插点是**历史事实**（写死在这里，由门禁对着那份冻结的 v8 名单核对），
 * **不能**从当前主线表反推 —— 表会再变，而迁移必须永远按当初那件事算。
 */
export const V9_INSERT_POINTS = [13, 25, 29];

function migrateV8toV9(d) {
  const quests = d.quests ?? {};
  const idx = Number(quests.index);
  if (Number.isInteger(idx)) quests.index = 偏移后(idx, V9_INSERT_POINTS);
  return d;
}

/**
 * v9 → v10：**主线走进两座非试炼副本**（W-E3 切片12）。
 *
 * 这一跳插了两步（`void-casket` 断时之匣 / `abyss-maw` 深渊之颚）—— 它们是
 * **主线**第一次指向**非试炼**的副本（断时之匣在破碎时线，深渊之颚在混沌边境）。
 *
 * 插入点（**旧序列**的下标）：
 * - 27 —— 在 `void-boss` 之前（`void-casket`）
 * - 33 —— 在 `chaos-boss` 之前（`abyss-maw`）
 *
 * 插点是**历史事实**（写死在这里，由门禁对着那份冻结的 v9 名单核对），
 * **不能**从当前主线表反推 —— 表会再变，而迁移必须永远按当初那件事算。
 */
export const V10_INSERT_POINTS = [27, 33];

function migrateV9toV10(d) {
  const quests = d.quests ?? {};
  const idx = Number(quests.index);
  if (Number.isInteger(idx)) quests.index = 偏移后(idx, V10_INSERT_POINTS);
  return d;
}

/**
 * v10 → v11：**主线把剩下四座副本也走一遍**（W-E3 切片13）。
 *
 * 这一跳插了四步（`hub-catacombs` 枢纽地下墓穴 / `forest-shrine` 古树神龛 /
 * `gloom-mist-crypt` 幽暗迷雾墓穴 / `radiant-dawn-hall` 晨曦圣殿）⇒ 至此
 * **主线把九座副本全走了一遍**。
 *
 * 插入点（**旧序列**的下标）：
 * - 2 —— 在 `soldiers` 之前（`hub-catacombs`）
 * - 10 —— 在 `talk-wanderer` 之前（`forest-shrine`）
 * - 35 —— 在 `chaos-boss` 之前（`gloom-mist-crypt`）
 * - 36 —— 在 `dungeon-rerun` 之前（`radiant-dawn-hall`）
 *
 * **一次插四处**（而不是分四片插四跳）：存档链已经六跳了，每加一步主线就多一跳 ⇒
 * 一次多插几处，链才长得慢。
 */
export const V11_INSERT_POINTS = [2, 10, 35, 36];

function migrateV10toV11(d) {
  const quests = d.quests ?? {};
  const idx = Number(quests.index);
  if (Number.isInteger(idx)) quests.index = 偏移后(idx, V11_INSERT_POINTS);
  return d;
}

/**
 * v11 → v12：**主线加五步"发现"**（W-E3 切片14）。
 *
 * 这一跳插了五步（`fantasy-ruins` / `magic-forest` / `space-wreck` / `gloom-moss` /
 * `radiant-altar`）—— 每一位面一处**地标**（世界里本来就有的 POI ⇒ 玩家是真的在探索，
 * 不是在点任务框）。
 *
 * **为什么是"发现"而不是再堆副本步**：切片13 之后主线里已经有九座副本（主线时长已经
 * 由副本撑住）⇒ 再堆副本步 = 同一批副本走两遍，不会让故事更长 ⇒ 要加就加**别的种类**
 * 的段落（这里是"探索"）。
 *
 * 插入点（**旧序列**的下标）：
 * - 5 —— 在 `boss` 之前（`fantasy-ruins`）
 * - 16 —— 在 `level` 之前（`magic-forest`）
 * - 22 —— 在 `boss3` 之前（`space-wreck`）
 * - 38 —— 在 `chaos-boss` 之前（`gloom-moss`）
 * - 40 —— 在 `dungeon-rerun` 之前（`radiant-altar`）
 */
export const V12_INSERT_POINTS = [5, 16, 22, 38, 40];

function migrateV11toV12(d) {
  const quests = d.quests ?? {};
  const idx = Number(quests.index);
  if (Number.isInteger(idx)) quests.index = 偏移后(idx, V12_INSERT_POINTS);
  return d;
}

/**
 * v12 → v13：**主线加三步"别的种类"的段落**（W-E3 切片15）。
 *
 * 这一跳插了三步 —— 切片14 的尾巴写着"下一片优先加**别的种类**（对话 / 抉择）"：
 * - `elf-scout`（**对话** —— 与暗夜斥候交谈；三位 NPC 里他还没被主线用过）
 * - `radiant-hunt`（**清剿** —— 辉煌圣域的原生爬兽；那座位面还没有清剿步）
 * - `chests-all`（**收集** —— 八个箱子全找齐；散在七座区里）
 *
 * 插入点（**旧序列**的下标）：
 * - 6 —— 在 `boss` 之前（`elf-scout`）
 * - 45 —— 在 `dungeon-rerun` 之前（`radiant-hunt`）
 * - 46 —— 在 `infinity` 之前（`chests-all`）
 */
export const V13_INSERT_POINTS = [6, 45, 46];

function migrateV12toV13(d) {
  const quests = d.quests ?? {};
  const idx = Number(quests.index);
  if (Number.isInteger(idx)) quests.index = 偏移后(idx, V13_INSERT_POINTS);
  return d;
}

export const MIGRATIONS = {
  1: ensureV4Shape, 2: ensureV4Shape, 3: ensureV4Shape,
  4: migrateV4toV5,
  5: migrateV5toV6,
  6: migrateV6toV7,
  7: migrateV7toV8,
  8: migrateV8toV9,
  9: migrateV9toV10,
  10: migrateV10toV11,
  11: migrateV11toV12,
  12: migrateV12toV13,
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
