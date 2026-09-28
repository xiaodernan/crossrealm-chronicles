import { SaveValidator } from './SaveValidator.js';
import { CURRENT_VERSION, SAVE_KEYS, migrate, SaveVersionError } from './SaveMigrations.js';
import { statsFromJSON, statsToJSON } from '../content/objectives.js';

/** 当前写入键；其余历史键只读，迁移成功后保留 */
const KEY = SAVE_KEYS[0].key;

/** 把迁移/校验结果说成人话，交给 toast 与 console 两处 */
function report(game, message) {
  console.warn(`[save] ${message}`);
  game.dialog?.toast(message);
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
      report(game, `存档校验未通过，已跳过加载：${issues[0]}`);
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
      game.weapons.current = data.weapon;
      game.weapons.applyVisual();
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

  static save(game) {
    const data = SaveSystem.toData(game);
    const issues = SaveValidator.validate(data);
    if (issues.length) {
      // 结构不合法的档一旦落盘就会覆盖好档，宁可拒绝保存
      report(game, `保存被拒绝：${issues[0]}`);
      return false;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      report(game, `保存失败：${e?.name ?? 'Error'} ${e?.message ?? ''}`.trim());
      return false;
    }
    game.dialog?.toast('进度已保存');
    window.dispatchEvent(new CustomEvent('game-saved'));
    return true;
  }

  /**
   * 坏档隔离：改名保留而不是删除，方便事后取回；下次启动不再重复报错。
   */
  static quarantine(game, key, raw, err) {
    try {
      localStorage.setItem(`${key}:corrupt`, raw);
      localStorage.removeItem(key);
      report(game, `存档 ${key} 已损坏（${err?.message ?? '解析失败'}），原文件转移到 ${key}:corrupt`);
    } catch (e) {
      report(game, `存档 ${key} 损坏且无法隔离：${e?.message ?? ''}`);
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
      return fail(`JSON 无法解析：${err.message}`);
    }
    let result;
    try {
      result = migrate(parsed);
    } catch (err) {
      // 版本高于本构建时绝不改写文件，只提示换用更新版本
      return fail(err instanceof SaveVersionError ? err.message : `迁移失败：${err?.message ?? err}`);
    }
    if (result.applied.length) {
      report(game, `旧存档 v${result.from} 已迁移到 v${CURRENT_VERSION}（跨 ${result.applied.length} 跳）`);
    }
    if (!SaveSystem.applyData(game, result.data)) return fail('存档校验未通过');
    return { ok: true, data: result.data, from: result.from, migrated: result.applied.length > 0, reason: '' };
  }

  static load(game) {
    for (const { key, version } of SAVE_KEYS) {
      let raw;
      try {
        raw = localStorage.getItem(key);
      } catch (e) {
        report(game, `无法访问浏览器存储：${e?.message ?? e}`);
        return false;
      }
      if (!raw) continue;
      const r = SaveSystem.ingest(game, raw, { sourceKey: key });
      if (!r.ok) {
        if (r.reason) report(game, `${key} 读取失败：${r.reason}`);
        continue;
      }
      // 迁移结果立即落到当前键；旧键保留一份，回滚到旧构建时仍可读取
      if (version !== CURRENT_VERSION) localStorage.setItem(KEY, JSON.stringify(r.data));
      game.dialog?.toast('存档已加载');
      return true;
    }
    return false;
  }

  static exportFile(game) {
    const filename = `${KEY}.json`;
    const json = JSON.stringify(SaveSystem.toData(game), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    game.dialog?.toast(`已导出 ${filename}`);
  }

  static importFile(game, file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = SaveSystem.ingest(game, String(reader.result));
        if (!r.ok) {
          report(game, `导入失败：${r.reason}`);
          resolve(false);
          return;
        }
        localStorage.setItem(KEY, JSON.stringify(r.data));
        game.dialog?.toast('存档已导入并写入浏览器');
        resolve(true);
      };
      reader.onerror = () => {
        report(game, `导入失败：文件读取错误（${reader.error?.message ?? 'unknown'}）`);
        resolve(false);
      };
      reader.readAsText(file);
    });
  }
}
