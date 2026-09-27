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

export const MIGRATIONS = {
  1: ensureV4Shape, 2: ensureV4Shape, 3: ensureV4Shape,
  4: migrateV4toV5,
  5: migrateV5toV6,
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
