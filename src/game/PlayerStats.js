/** RPG 成长：位面之魂、属性、等级 */
export class PlayerStats {
  constructor() {
    this.level = 1;
    this.souls = 0;
    this.vigor = 1;
    this.endurance = 1;
    this.strength = 1;
    this.arcane = 1;
    this.mind = 0;
    this.totalKills = 0;
    this.chestsOpened = new Set();
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
    if (stat === 'vigor') this.vigor++;
    else if (stat === 'endurance') this.endurance++;
    else if (stat === 'strength') this.strength++;
    else if (stat === 'arcane') this.arcane++;
    else if (stat === 'mind') this.mind++;
    window.dispatchEvent(new CustomEvent('stats-changed', { detail: this.toJSON() }));
    return true;
  }

  addSouls(n) {
    this.souls += n;
    window.dispatchEvent(new CustomEvent('stats-changed', { detail: this.toJSON() }));
  }

  toJSON() {
    return {
      level: this.level,
      souls: this.souls,
      vigor: this.vigor,
      endurance: this.endurance,
      strength: this.strength,
      arcane: this.arcane,
      mind: this.mind,
      totalKills: this.totalKills,
      chests: [...this.chestsOpened],
    };
  }

  fromJSON(data) {
    if (!data) return;
    Object.assign(this, {
      level: data.level ?? 1,
      souls: data.souls ?? 0,
      vigor: data.vigor ?? 1,
      endurance: data.endurance ?? 1,
      strength: data.strength ?? 1,
      arcane: data.arcane ?? 1,
      mind: data.mind ?? 0,
      totalKills: data.totalKills ?? 0,
    });
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
