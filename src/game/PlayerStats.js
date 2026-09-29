/** RPG 成长：位面之魂、属性、等级、装备与背包（W-B5 切片1 + 切片4） */
import { GEAR_SLOTS, GEAR_BAG, bagIsFull, baseOf, gearMods, isGearInstance } from '../content/gear.js';

/** 出身点：升级与装备都在这一份之上加，所以它是"玩家还没升级也没穿装备时"的那一档 */
const BASE_STATS = { vigor: 1, endurance: 1, strength: 1, arcane: 1, mind: 0 };

export class PlayerStats {
  constructor() {
    this.level = 1;
    this.souls = 0;
    // 不与 BASE_STATS 共用引用：`levelUp` 与 `fromJSON` 都就地写它（切片4 键位那格同一课）
    this.baseStats = { ...BASE_STATS };
    /** 一件装备 = `{ base, rarity, affixes }`；空槽是 null。账本只有这一格 */
    this.gear = Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, null]));
    /** 换下 / 捡到而不穿的装备落在这里（切片4）。容量是 `GEAR_BAG.capacity`，判满只有 `bagIsFull` 一处 */
    this.bag = [];
    this._bonus = {};                            // 装备那几点的缓存，见 `gearBonus`
    this.totalKills = 0;
    this.chestsOpened = new Set();
    // W-B6 切片3：行为门槛统计
    this.kills = {};        // { type: count }
    this.skillUses = {};    // { skill: count }
    this._consumers = null;
    this._rebuildBonus();
  }

  /**
   * 五个属性名都是**读数**：出身点 + 装备给的那几点。
   *
   * 为什么折在这里而不是各消费者自己加：`SpellSystem.syncMana` 读的就是 `stats.arcane`，
   * 而 `maxHp` / `damageMult` 读的是同一批数 —— 装备若另立一条乘数，"最终伤害"就有两处生产者，
   * 相乘顺序与取整时机没有裁判（B36 那一族）。折成一处之后，升级与穿戴吃的是同一本账。
   *
   * 写的一侧（`levelUp`、`QuestAssistant` 的自动通关 cheat）落在 `baseStats` 上：
   * 存盘存的也必须是这份，否则读档时装备会被算两遍。
   */
  get vigor() { return this.baseStats.vigor + this.gearBonus('vigor'); }
  set vigor(v) { this.baseStats.vigor = v; }
  get endurance() { return this.baseStats.endurance + this.gearBonus('endurance'); }
  set endurance(v) { this.baseStats.endurance = v; }
  get strength() { return this.baseStats.strength + this.gearBonus('strength'); }
  set strength(v) { this.baseStats.strength = v; }
  get arcane() { return this.baseStats.arcane + this.gearBonus('arcane'); }
  set arcane(v) { this.baseStats.arcane = v; }
  get mind() { return this.baseStats.mind + this.gearBonus('mind'); }
  set mind(v) { this.baseStats.mind = v; }

  /**
   * 某一项属性上"装备给的那几点"，读的是缓存。
   *
   * 为什么不就地换算：`SpellSystem.update` 每帧 `syncMana`，而它读的就是 `stats.arcane` 与
   * `stats.mind` —— 每帧重新换算等于每帧新建两份对象（M4 那两条零分配门禁针对的正是这个形状）。
   * 缓存只在账本变化时重算：穿、卸、读档。
   */
  gearBonus(stat) { return this._bonus[stat] ?? 0; }

  /** 缓存本身：连续两次读必须是同一个引用，否则"读数"就在偷偷重算 */
  get gearBonusTable() { return this._bonus; }

  _rebuildBonus() {
    const out = {};
    for (const slot of GEAR_SLOTS) {
      const mods = gearMods(this.gear[slot]);      // 全仓唯一那道换算
      if (!mods) continue;
      for (const [stat, n] of Object.entries(mods)) out[stat] = (out[stat] ?? 0) + n;
    }
    this._bonus = out;
  }

  /**
   * 穿上 / 换下。返回**被换下的那一件**（空槽返回 null），实例不合表规矩返回 `false`。
   *
   * 为什么把"换下什么"交回调用方：拾取那一片（切片2）要决定旧的进包还是丢弃，而"哪件更好"
   * 的判据得读同一份 `gearMods` —— 在这里给出入口，比让调用方自己翻账本少一份真相。
   * 未知槽位直接抛（程序写错了，不是数据脏）；坏实例拒收（存档可被手写）。
   */
  equip(slot, instance) {
    if (!GEAR_SLOTS.includes(slot)) {
      throw new Error(`未知的装备槽 "${slot}"（可用：${GEAR_SLOTS.join(' / ')}）`);
    }
    if (!isGearInstance(instance)) return false;
    const previous = this.gear[slot];
    this.gear[slot] = cloneInstance(instance);
    this._rebuildBonus();
    this.pushToConsumers();
    return previous;
  }

  unequip(slot) {
    if (!GEAR_SLOTS.includes(slot)) {
      throw new Error(`未知的装备槽 "${slot}"（可用：${GEAR_SLOTS.join(' / ')}）`);
    }
    const previous = this.gear[slot];
    this.gear[slot] = null;
    if (previous) {
      this._rebuildBonus();
      this.pushToConsumers();
    }
    return previous;
  }

  /**
   * 放一件进背包。满了返回 `false`（**不静默丢弃**，也不扩容）——
   * 谁拿到 `false` 谁就要说出处置（拾取那条路折成魂、面板卸下那条路原样不动）。
   */
  bagAdd(instance) {
    if (!isGearInstance(instance)) return false;
    if (bagIsFull(this.bag)) return false;
    this.bag.push(cloneInstance(instance));
    return true;
  }

  /** 取出第几格（0 起）。下标越界 / 那一格是空的返回 null，不抛 */
  bagTake(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.bag.length) return null;
    const [taken] = this.bag.splice(index, 1);
    return taken ?? null;
  }

  /** 包里有几件（面板显示 `N / capacity` 与"满没满"读的是同一个数） */
  get bagCount() { return this.bag.length; }

  /** 包里最多能有几格（面板那句 `N / 20` 读的就是它，不许在 UI 里再抄一个 20） */
  get bagCapacity() { return GEAR_BAG.capacity; }

  get bagFull() { return bagIsFull(this.bag); }

  /**
   * 把包里第几格穿到它自己那个槽上，被换下的那件回到刚腾出来的那一格。
   *
   * 先取后穿的次序是**有意的**：取出必然腾出一个格子，所以回填换下的那件时 `bagAdd` 不可能因为
   * 满而失败 —— 不存在"穿上了但旧的没地方去"的中间态。
   * 返回 `{ slot, instance, replaced }`，那一格是空的返回 `false`。
   */
  wearFromBag(index) {
    const inst = this.bagTake(index);
    if (!inst) return false;
    const slot = baseOf(inst.base).slot;
    const replaced = this.equip(slot, inst);
    if (replaced) this.bagAdd(replaced);
    return { slot, instance: inst, replaced };
  }

  /**
   * 卸下某槽进背包。包满返回 `false` 且**身上那件原样还在**（先看满不满，再动账），
   * 所以玩家永远不会因为"想腾个格子"而丢掉穿着的装备。
   */
  storeFromSlot(slot) {
    if (!GEAR_SLOTS.includes(slot)) {
      throw new Error(`未知的装备槽 "${slot}"（可用：${GEAR_SLOTS.join(' / ')}）`);
    }
    if (bagIsFull(this.bag)) return false;
    const previous = this.unequip(slot);
    if (previous) this.bagAdd(previous);
    return previous;
  }

  /**
   * 谁读这些数，就在这里登记一次（`Game.setup` 调一次）。
   *
   * 为什么不是"调用方记得推"：升级那一步今天就是手抄了 `applyToCombat` + `syncMana` 两句，
   * 抄第二份的那一处迟早与第一份分家 —— 升级、穿戴、读档、cheat 从此都只走这一个口。
   */
  bindConsumers(consumers) {
    this._consumers = consumers;
    this.pushToConsumers();
  }

  pushToConsumers() {
    window.dispatchEvent(new CustomEvent('stats-changed', { detail: this.toJSON() }));
    const { combat, spells } = this._consumers ?? {};
    if (combat) this.applyToCombat(combat);
    if (spells) spells.syncMana();
  }

  get maxHp() { return 100 + this.vigor * 18; }
  get maxStamina() { return 100 + this.endurance * 8; }
  get damageMult() { return 1 + this.strength * 0.08; }
  get skillMult() { return 1 + this.arcane * 0.12; }

  levelUpCost() { return 80 + this.level * 45; }

  canLevelUp() { return this.souls >= this.levelUpCost(); }

  levelUp(stat) {
    if (!this.canLevelUp()) return false;
    this.souls -= this.levelUpCost();
    this.level++;
    if (stat in this.baseStats) this.baseStats[stat]++;
    this.pushToConsumers();
    return true;
  }

  addSouls(n) {
    this.souls += n;
    this.pushToConsumers();
  }

  // W-B6 切片3：行为门槛统计
  addKill(type) {
    this.kills[type] = (this.kills[type] ?? 0) + 1;
    this.totalKills++;
    this.pushToConsumers();
  }

  addSkillUse(skill) {
    this.skillUses[skill] = (this.skillUses[skill] ?? 0) + 1;
    this.pushToConsumers();
  }

  toJSON() {
    return {
      level: this.level,
      souls: this.souls,
      // 存的是**出身点**而不是含装备的读数：读档时装备还要再折一次，存读数等于把它算两遍
      vigor: this.baseStats.vigor,
      endurance: this.baseStats.endurance,
      strength: this.baseStats.strength,
      arcane: this.baseStats.arcane,
      mind: this.baseStats.mind,
      gear: Object.fromEntries(GEAR_SLOTS.map((slot) => [slot,
        this.gear[slot] ? cloneInstance(this.gear[slot]) : null])),
      bag: this.bag.map(cloneInstance),
      totalKills: this.totalKills,
      chests: [...this.chestsOpened],
      kills: this.kills,
      skillUses: this.skillUses,
    };
  }

  fromJSON(data) {
    if (!data) return;
    Object.assign(this, {
      level: data.level ?? 1,
      souls: data.souls ?? 0,
      totalKills: data.totalKills ?? 0,
      kills: data.kills ?? {},
      skillUses: data.skillUses ?? {},
    });
    for (const stat of Object.keys(BASE_STATS)) {
      this.baseStats[stat] = data[stat] ?? BASE_STATS[stat];
    }
    // 一格一件，逐件认：坏的那一件丢掉，不连累别的槽（与 `padTuning()` 逐项回落同一条纪律）
    for (const slot of GEAR_SLOTS) {
      const raw = data.gear?.[slot];
      this.gear[slot] = isGearInstance(raw) ? cloneInstance(raw) : null;
    }
    // 包同一条纪律：手写存档里混进来的坏件只丢它自己，合法的那几件一件不丢
    // （不按容量截断 —— 容量只挡**新增**，玩家已经赚到的东西不在这里凭空消失）
    this.bag = (Array.isArray(data.bag) ? data.bag : [])
      .filter(isGearInstance).map(cloneInstance);
    this._rebuildBonus();
    this.chestsOpened = new Set(data.chests ?? []);
  }

  applyToCombat(combat) {
    combat.maxHp = this.maxHp;
    combat.maxStamina = this.maxStamina;
    combat.hp = Math.min(combat.hp, combat.maxHp);
    combat.stamina = Math.min(combat.stamina, combat.maxStamina);
    combat.damageMult = this.damageMult;
    combat.skillMult = this.skillMult;
  }
}

/** 实例进账时拷一份：调用方随后改自己那个对象，不许把玩家身上穿着的那件一起改了 */
function cloneInstance(instance) {
  return { base: instance.base, rarity: instance.rarity, affixes: [...instance.affixes] };
}
