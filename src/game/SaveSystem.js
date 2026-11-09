import { SaveValidator } from './SaveValidator.js';
import { CURRENT_VERSION, SAVE_KEYS, migrate, SaveVersionError } from './SaveMigrations.js';
import { statsFromJSON, statsToJSON } from '../content/objectives.js';
import { t } from '../engine/i18n.js';

/** 当前写入键；其余历史键只读，迁移成功后保留 */
const KEY = SAVE_KEYS[0].key;

/**
 * 存档槽（W-D3 切片2）：槽 0 沿用**旧键**（`SAVE_KEYS` 首项），老玩家的档不用搬家、
 * 开机自动读档的路径一字不改；槽 1 起在键名上带 `_slotN` 后缀。
 * 槽位选择的面板是切片3 的事，这一片先把账做对：编址、互不覆盖、元数据读数。
 */
export const SAVE_SLOTS = 3;

/**
 * 槽位 → 存储键。越界的槽位**当场抛**：静默绕回别的键，后果是"存槽二把槽一覆盖了"。
 */
export function slotKey(slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SAVE_SLOTS) {
    throw new Error(`SaveSystem: 槽位必须是 0..${SAVE_SLOTS - 1} 的整数，收到 "${slot}" —— 静默落到别的键就是覆盖别人的档`);
  }
  return slot === 0 ? KEY : `${KEY}_slot${slot}`;
}

/** 存档写入那道题的名字（ASCII：它进总线、进账、进门禁判据，不进文案表） */
export const 存档题 = 'save-written';

/**
 * 存档系统递给自己的题名册条目（B167）—— 与 `配置总线题` 同一个分工：题在这里报名，
 * `bus.js` 一份都不抄。
 *
 * **载荷里没有存档内容**：别的实例要的是"这一格刚被人写过，我屏幕上那份读数已经不新鲜了"，
 * 不是那一份档本身。把档搬进总线等于把玩家的全部进度复制进另一条通道，
 * 而它换来的信息只有"该重新读一次了"。
 */
export const 存档总线题 = {
  题: 存档题,
  校验: (载荷) => Number.isInteger(载荷?.slot)
    && 载荷.slot >= 0 && 载荷.slot < SAVE_SLOTS
    && Number.isInteger(载荷?.version) && 载荷.version >= 1
    && Number.isInteger(载荷?.time) && 载荷.time >= 0,
  说明: `载荷要带 { slot: 0..${SAVE_SLOTS - 1} 的整数, version: 存档版本号, time: 落盘毫秒 }（三格都是写档那一步本来就有的数）`,
};

/**
 * 把"这一格刚被写过"广播出去。
 *
 * 包一层 try/catch 是因为**主次不能颠倒**：存档落盘已经成功了，附带的那一句通知不能反过来
 * 把保存判成失败（总线已关、题没登记、对端名册漂了 —— 都是通知的事，不是玩家进度的事）。
 * 失败也不是静默的：交给错误账，`kind: 'bus'`。
 */
function 广播存档(game, 载荷) {
  try {
    game.总线?.发布?.(存档题, 载荷);
  } catch (错) {
    game.errorReporter?.record?.({
      kind: 'bus',
      message: String(错?.message ?? 错),
      stack: 错?.stack ?? null,
      source: 'game/SaveSystem.js',
    });
  }
}

/** 把迁移/校验结果说成人话，交给 toast 与 console 两处 */
function report(game, message) {
  console.warn(`[save] ${message}`);
  game.dialog?.toast(message);
}

/**
 * B168：被栅栏令牌拦下来那一条路 —— **不写内容、不广播**，只留一行账；玩家当面按的那一次
 * （`手动`）才说一句。自动保存不许吭声：对面要是每秒刷同一格，toast 就变成刷屏，
 * 而刷屏的提示和没有提示是同一件事。
 *
 * 诊断句是 ASCII：它进错误账、进门禁判据，不进文案表（与 `存档题` 同一个规矩）。
 */
function 拒绝落盘(game, slot, 判, 手动) {
  try {
    game.errorReporter?.record?.({
      kind: 'lease',
      message: `save slot=${slot} not written: lease=${判?.因 ?? 'no-lease'} view=${判?.视图} record=${判?.令牌}`,
      stack: null,
      source: 'game/SaveSystem.js',
    });
  } catch { /* 诊断出口自己炸了不许把"没写"变成"抛异常" */ }
  if (手动) game.dialog?.toast(t('save_fenced_fmt', { slot: slot + 1 }));
  return false;
}

/**
 * 落盘前的第一问（纪律 2 的前半）：这一格此刻轮到我写吗。
 * 没有租约 = 单实例页或最小宿主（测试里那种），直接放行，行为与 B168 之前一字不差。
 *
 * 分成"问"和"占坑"两步而不是一个整块，是因为**导入那一路在两步之间还有一次 ingest**：
 * 顺序反了（先 ingest 再问），一次被拦下的导入就已经把文件内容写进了内存 ——
 * 屏幕上放着新档、盘上还是别人那一份，比拒得狠更糟。
 */
function 问门(game, key, 手动) {
  if (!game.租约) return { 成: true, 判: null };
  const 判 = game.租约.可写(key, { 手动 });
  return { 成: 判.成, 判 };
}

/**
 * 落盘前的第二问（纪律 2 的后半）：占坑（**比较后写**）→ 写内容。
 * `期望` 用 `问门` 那一次读到的记录令牌，把"读了再写"变成"对得上号才写"：
 * 两步之间真被别的标签页插了一笔（纪律 6 那个窗口），这里当场让路，而不是把一个
 * 从没核对过的读数盖下去。
 * `no-storage` 不拦内容那一步：记录写不上，落盘大概率也写不上，而那一堵墙自有调用方的
 * try/catch 与 `save_failed` 那句接住（纪律 3）。
 */
function 占坑并落盘(game, key, 判, 时刻, 手动, slot, 写) {
  if (!game.租约) return 写();
  const 坑 = game.租约.抢占(key, 时刻, { 期望: 判?.令牌 });
  if (!坑.成 && 坑.因 === 'contended') return 拒绝落盘(game, slot, 坑, 手动);
  return 写();
}

/**
 * 迁移回写也是**写**：改前它是整条读档路上唯一一处不问"这一格此刻在谁手上"就落盘的写。
 * 拦住就**只跳过回写**，读档本身照成 —— 内存里那份已经是迁移后的好档，下次开机再迁一遍是
 * 幂等的（旧键保留一份本来就是设计）。把"回写被拦"升成"读档失败"才是真的坏事。
 */
function 迁移回写(game, key, data) {
  const 门 = 问门(game, key, false);
  if (!门.成) { 拒绝落盘(game, 0, 门.判, false); return; }
  占坑并落盘(game, key, 门.判, data?.time ?? null, false, 0, () => localStorage.setItem(key, JSON.stringify(data)));
}

export class SaveSystem {
  static toData(game) {
    return {
      version: CURRENT_VERSION,
      time: Date.now(),
      player: {
        x: game.player.position.x,
        y: game.player.position.y,
        z: game.player.position.z,
        yaw: game.player.yaw,
        pitch: game.player.pitch,
        hp: game.player.combat.hp,
        stamina: game.player.combat.stamina,
      },
      stats: game.stats.toJSON(),
      spells: { mana: game.spells?.mana ?? 100 },
      dungeons: { cleared: [...(game.dungeons?.cleared ?? [])] },
      weapon: game.weapons?.current ?? 'sword',
      weaponSkills: game.weaponSkills?.toJSON?.(),
      soulWisps: game.soulWisps?.toJSON?.() ?? [],
      achievements: game.achievements?.toJSON?.(),
      journal: game.storyJournal?.toJSON?.(),
      storyDirector: game.storyDirector?.toJSON?.(),
      exploration: game.explorationMap?.toJSON?.(),
      mapMarkers: game.mapMarkers?.toJSON?.(),
      restDialogue: game.restDialogue?.toJSON?.(),
      // 营火地标（`发现营火 · X` 那一句只播一次的记账）—— v7 起入档。
      // 读档侧 `applyData` 早就在读这个键了（`data.restPointEnhancer`），**却从来没人写过它**：
      // 那行加载代码是死的，于是每次读档所有营火都退回"没见过"，同一句提示会再播一遍（B66）。
      restPointEnhancer: game.restPointEnhancer?.toJSON?.(),
      combatTutorial: game.combatTutorial?.toJSON?.(),
      worldAmbient: game.worldAmbient?.toJSON?.(),
      cgGallery: game.cgGallery?.toJSON?.(),
      cgGalleryAchievements: game.cgGalleryAchievements?.toJSON?.(),
      combatCinematicSkip: game.combatCinematicSkip?.toJSON?.(),
      campfireMemory: game.campfireMemory?.toJSON?.(),
      loreCodex: game.loreCodex?.toJSON?.(),
      combatStyle: game.combatStyle?.toJSON?.(),
      bossRematch: game.bossRematch?.toJSON?.(),
      dungeonRuns: game.dungeonRuns?.toJSON?.(),
      deathHints: game.deathHints?.toJSON?.(),
      bossApproach: game.bossApproach?.toJSON?.(),
      soulStreak: game.soulStreak?.toJSON?.(),
      sideQuests: game.sideQuests?.toJSON?.(),
      popCulture: game.popCulture?.toJSON?.(),
      settings: { ...(game.settings?.data ?? {}) },
      fastTravel: game.fastTravel?.unlocked ?? false,
      quests: {
        index: game.quests.questIndex,
        // W-E3 切片38：**这一步的 id** 也入档 —— 下标只是**今天这张表**里的位置，
        // 表里插一步，同一个下标就指向另一件事（于是每一次插步都得配一条迁移去挪老档）。
        // 记下 id 之后，读档先认 id、认不出才回落下标 ⇒ 以后插步不必再写迁移。
        currentId: game.quests.current?.id ?? null,
        completed: game.quests.completed,
        chapter: game.quests.chapter,
        // 账本形状由 `content/objectives.js` 推（W-B3 切片2）：这里以前逐格手抄十四行，
        // 于是判据读一格、存档抄一格，漏抄的那格读档后回到初始值 —— 不报错，只是那一步要重做
        stats: statsToJSON(game.quests.stats),
      },
    };
  }

  /**
   * 把已迁移到当前版本的存档写回游戏。
   * 前置条件：`data` 必须已通过 `migrate()` 升到 CURRENT_VERSION；此处不再兼容旧字段。
   * @returns {boolean} 校验未通过时返回 false（问题清单已经由 `validate` 打印）
   */
  static applyData(game, data) {
    if (!data) return false;
    const issues = SaveValidator.validate(data);
    if (issues.length) {
      report(game, t('save_apply_validation_failed_fmt', { issue: issues[0] }));
      return false;
    }
    game.stats.fromJSON(data.stats);
    game.stats.pushToConsumers();      // 推送只有这一处：改前读档靠调用方各推，实测行为没变（见切片1 的记录）
    game.player.combat.hp = data.player.hp;
    game.player.combat.stamina = data.player.stamina;
    game.player.teleport(data.player.x, data.player.y, data.player.z, {
      yaw: data.player.yaw,
      pitch: data.player.pitch,
    });
    game.spells.mana = data.spells.mana;
    if (game.dungeons && data.dungeons?.cleared) {
      game.dungeons.cleared = new Set(data.dungeons.cleared);
    }
    if (game.weapons && data.weapon) {
      // 走 setCurrent 而不是直接写 current（W-D2 切片35）：它顺带派发 weapon-changed，
      // HUD 的武器显示格才跟着读档结果改口（改前那一格留着旧武器的名字）
      game.weapons.setCurrent(data.weapon);
    }
    if (game.weaponSkills && data.weaponSkills) game.weaponSkills.fromJSON(data.weaponSkills);
    if (game.soulWisps && data.soulWisps) game.soulWisps.fromJSON(data.soulWisps);
    if (game.achievements && data.achievements) game.achievements.fromJSON(data.achievements);
    if (game.storyJournal && data.journal) game.storyJournal.fromJSON(data.journal);
    if (game.storyDirector && data.storyDirector) game.storyDirector.fromJSON(data.storyDirector);
    if (game.explorationMap && data.exploration) game.explorationMap.fromJSON(data.exploration);
    if (game.mapMarkers && data.mapMarkers) game.mapMarkers.fromJSON(data.mapMarkers);
    if (game.restDialogue && data.restDialogue) game.restDialogue.fromJSON(data.restDialogue);
    if (game.combatTutorial && data.combatTutorial) game.combatTutorial.fromJSON(data.combatTutorial);
    if (game.worldAmbient && data.worldAmbient) game.worldAmbient.fromJSON(data.worldAmbient);
    if (game.restPointEnhancer && data.restPointEnhancer) game.restPointEnhancer.fromJSON(data.restPointEnhancer);
    if (game.cgGallery && data.cgGallery) game.cgGallery.fromJSON(data.cgGallery);
    if (game.cgGalleryAchievements && data.cgGalleryAchievements) game.cgGalleryAchievements.fromJSON(data.cgGalleryAchievements);
    if (game.combatCinematicSkip && data.combatCinematicSkip) game.combatCinematicSkip.fromJSON(data.combatCinematicSkip);
    if (game.campfireMemory && data.campfireMemory) game.campfireMemory.fromJSON(data.campfireMemory);
    if (game.loreCodex && data.loreCodex) game.loreCodex.fromJSON(data.loreCodex);
    if (game.combatStyle && data.combatStyle) game.combatStyle.fromJSON(data.combatStyle);
    if (game.bossRematch && data.bossRematch) {
      game.bossRematch.fromJSON(data.bossRematch);
      game.bossRematch.syncFromQuests?.();
    }
    if (game.dungeonRuns && data.dungeonRuns) game.dungeonRuns.fromJSON(data.dungeonRuns);
    if (game.deathHints && data.deathHints) game.deathHints.fromJSON(data.deathHints);
    if (game.bossApproach && data.bossApproach) game.bossApproach.fromJSON(data.bossApproach);
    if (game.soulStreak && data.soulStreak) game.soulStreak.fromJSON(data.soulStreak);
    if (game.sideQuests && data.sideQuests) game.sideQuests.fromJSON(data.sideQuests);
    if (game.popCulture && data.popCulture) game.popCulture.fromJSON(data.popCulture);
    if (game.settings && data.settings) {
      Object.assign(game.settings.data, data.settings);
      game.settings.applyToGame(game);
    }
    if (game.fastTravel && data.fastTravel) game.fastTravel.unlocked = data.fastTravel;
    // 落点与章节由 `QuestSystem.restoreFromSave` 向表核对（W-B3 切片4）：
    // 这里以前是 `questIndex = data.quests.index` 加一句 `index > 8 ? 2 : 1` 猜章节 ——
    // 前者让一份越界的档把玩家放进"没有当前任务"的状态而不报错，后者是门控位置的抄本
    game.quests.restoreFromSave(data.quests);
    // 账本的形状、Set 的复原、读数不取磁盘那份 —— 全在 `content/objectives.js`（W-B3 切片2）。
    // 以前这里手抄了一遍形状：三个 Set 各一行、`kills` 的类型兜底、两个 bool 的缺省值，
    // 而判据读的是 `emptyStats()` 那一格 —— 两边各写各的，少抄的那格只是"回到初始值"，不报错
    game.quests.stats = statsFromJSON(data.quests.stats);
    // v5 起战技数不入档：它是 weaponSkills 的派生值，读档后以真实解锁集合为准
    game.quests.stats.skillsUnlocked = game.weaponSkills?.unlocked?.size ?? 0;
    game.quests.syncProgress();
    game.quests.notifyUpdate();
    window.dispatchEvent(new CustomEvent('stats-changed', { detail: game.stats.toJSON() }));
    return true;
  }

  /**
   * 落盘。`手动` = 玩家当面按的那一下（快捷键 / 暂停菜单）：被租约拦住要说一句，
   * 而同一份冲突再按一次就让路。自动保存不带它 —— 那一路只管写，不说话。
   */
  static save(game, slot = 0, { 手动 = false } = {}) {
    const key = slotKey(slot);
    const data = SaveSystem.toData(game);
    const issues = SaveValidator.validate(data);
    if (issues.length) {
      // 结构不合法的档一旦落盘就会覆盖好档，宁可拒绝保存
      report(game, t('save_rejected_fmt', { issue: issues[0] }));
      return false;
    }
    const 门 = 问门(game, key, 手动);
    if (!门.成) return 拒绝落盘(game, slot, 门.判, 手动);
    return 占坑并落盘(game, key, 门.判, data.time, 手动, slot, () => {
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (e) {
        report(game, t('save_failed', { name: e?.name ?? 'Error', message: e?.message ?? '' }).trim());
        return false;
      }
      game.dialog?.toast(slot === 0 ? t('save_success') : t('save_success_slot_fmt', { slot: slot + 1 }));
      // B167：别的标签页此刻正拿着同一格存档的旧读数 —— 通知它们，但不搬存档内容本身。
      广播存档(game, { slot, version: data.version, time: data.time });
      window.dispatchEvent(new CustomEvent('game-saved'));
      return true;
    });
  }

  /**
   * 坏档隔离：改名保留而不是删除，方便事后取回；下次启动不再重复报错。
   */
  static quarantine(game, key, raw, err) {
    try {
      localStorage.setItem(`${key}:corrupt`, raw);
      localStorage.removeItem(key);
      report(game, t('save_corrupt_fmt', { key, reason: err?.message ?? t('save_parse_fallback') }));
    } catch (e) {
      report(game, t('save_corrupt_unquarantined_fmt', { key, message: e?.message ?? '' }));
    }
  }

  /**
   * 单段存档文本 → 解析 → 迁移 → 应用。读档与导入共用这一条路径，避免两套校验。
   * @returns {{ ok: boolean, data: object|null, from: number, migrated: boolean, reason: string }}
   */
  static ingest(game, raw, { sourceKey = null } = {}) {
    const fail = (reason) => ({ ok: false, data: null, from: 0, migrated: false, reason });
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      if (sourceKey) SaveSystem.quarantine(game, sourceKey, raw, err);
      return fail(t('save_json_parse_failed_fmt', { message: err.message }));
    }
    let result;
    try {
      result = migrate(parsed);
    } catch (err) {
      // 版本高于本构建时绝不改写文件，只提示换用更新版本
      return fail(err instanceof SaveVersionError ? err.message : t('save_migrate_failed_fmt', { message: err?.message ?? err }));
    }
    if (result.applied.length) {
      report(game, t('save_migrated_fmt', { from: result.from, to: CURRENT_VERSION, jumps: result.applied.length }));
    }
    if (!SaveSystem.applyData(game, result.data)) return fail(t('save_validation_failed'));
    return { ok: true, data: result.data, from: result.from, migrated: result.applied.length > 0, reason: '' };
  }

  /**
   * 读档。槽 0 保留**版本回退链**（`SAVE_KEYS` 逐键试：旧版本键里的档迁移后落回当前键），
   * 那是单槽时代留下的兼容路；副槽没有历史包袱，只读自己的那一格。
   */
  static load(game, slot = 0) {
    if (slot !== 0) {
      const key = slotKey(slot);
      let raw;
      try {
        raw = localStorage.getItem(key);
      } catch (e) {
        report(game, t('save_storage_unavailable_fmt', { message: e?.message ?? e }));
        return false;
      }
      if (!raw) return false;
      const r = SaveSystem.ingest(game, raw, { sourceKey: key });
      if (!r.ok) {
        if (r.reason) report(game, t('save_read_failed_fmt', { key, reason: r.reason }));
        return false;
      }
      // B168 纪律 1：读档成功那一刻 = 本实例的内存状态**就是**这一格 ⇒ 记下视图。
      // 少了这一步，下一次保存只会读到 `never-seen`（"这份内容不是从那格推出来的"）而放行，
      // 可那一格明明是刚从那里读出来的 —— 拦不住的正是要拦的那一种写。
      game.租约?.观测?.(key);
      game.dialog?.toast(t('load_success'));
      return true;
    }
    for (const { key, version } of SAVE_KEYS) {
      let raw;
      try {
        raw = localStorage.getItem(key);
      } catch (e) {
        report(game, t('save_storage_unavailable_fmt', { message: e?.message ?? e }));
        return false;
      }
      if (!raw) continue;
      const r = SaveSystem.ingest(game, raw, { sourceKey: key });
      if (!r.ok) {
        if (r.reason) report(game, t('save_read_failed_fmt', { key, reason: r.reason }));
        continue;
      }
      game.租约?.观测?.(key);
      // 迁移结果立即落到当前键；旧键保留一份，回滚到旧构建时仍可读取
      if (version !== CURRENT_VERSION) 迁移回写(game, KEY, r.data);
      game.dialog?.toast(t('load_success'));
      return true;
    }
    return false;
  }

  /**
   * 槽位列表读数：给未来的槽位面板用。只解析 `version` / `time` 两个元数据格，
   * 不走迁移也不碰游戏状态 —— 列表永远安全，读档才应用。
   */
  static listSlots() {
    return Array.from({ length: SAVE_SLOTS }, (_, slot) => {
      const key = slotKey(slot);
      let raw = null;
      try {
        raw = localStorage.getItem(key);
      } catch {
        raw = null;
      }
      if (!raw) return { slot, key, exists: false, version: null, time: null };
      try {
        const parsed = JSON.parse(raw);
        return { slot, key, exists: true, version: parsed?.version ?? null, time: parsed?.time ?? null };
      } catch {
        return { slot, key, exists: true, version: null, time: null, corrupt: true };
      }
    });
  }

  static exportFile(game, slot = 0) {
    const filename = `${slotKey(slot)}.json`;
    const json = JSON.stringify(SaveSystem.toData(game), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    game.dialog?.toast(t('save_exported_fmt', { filename }));
  }

  static importFile(game, file, slot = 0, { 手动 = false } = {}) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const key = slotKey(slot);
        // B168：**先问门，再 ingest**。顺序反了（先 ingest 再问）就把"要写的内容"当成
        // "这一格的最新读数"，门永远开得下来；更糟的是一次被拦下的导入已经把文件写进了
        // 内存 —— 屏幕上放着新档、盘上还是别人那一份。
        const 门 = 问门(game, key, 手动);
        if (!门.成) {
          拒绝落盘(game, slot, 门.判, 手动);
          resolve(false);
          return;
        }
        const r = SaveSystem.ingest(game, String(reader.result));
        if (!r.ok) {
          report(game, t('save_import_failed_fmt', { reason: r.reason }));
          resolve(false);
          return;
        }
        // 视图由 `抢占` 自己推到新令牌，这里不需要额外的 `观测`。
        占坑并落盘(game, key, 门.判, r.data?.time ?? null, 手动, slot, () => {
          localStorage.setItem(key, JSON.stringify(r.data));
          广播存档(game, { slot, version: r.data.version, time: r.data.time });
          game.dialog?.toast(t('save_imported'));
          resolve(true);
        });
      };
      reader.onerror = () => {
        report(game, t('save_import_read_failed_fmt', { message: reader.error?.message ?? 'unknown' }));
        resolve(false);
      };
      reader.readAsText(file);
    });
  }
}
