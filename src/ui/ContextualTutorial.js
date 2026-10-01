import { scheduler } from '../engine/Scheduler.js';
import { keyText } from '../content/keyHints.js';
import { ZONE_IDS, ZONE_NAMES } from '../content/ZoneIdentity.js';
import { isDungeonBossId } from '../content/bossRoster.js';

const STORAGE_KEY = 'crossrealm_contextual_tips';
/** 队列推进的计时分组 */
const TIP_TAG = 'contextual-tip';

/** 情境教程 — 首次地下城/Boss/弹反/连击等触发 */
export class ContextualTutorial {
  constructor(game) {
    this.game = game;
    this.seen = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    this.queue = [];
    this.busy = false;
    this.setupListeners();
  }

  _persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.seen]));
  }

  trigger(id, title, text, delay = 0) {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this._persist();
    this.queue.push({ title, text });
    if (!this.busy) this._drain(delay);
  }

  _drain(initialDelay = 0) {
    if (!this.queue.length) {
      this.busy = false;
      return;
    }
    this.busy = true;
    const { title, text } = this.queue.shift();
    scheduler.after(initialDelay / 1000, () => {
      // 触发时只存模板，播出时才展开：一条提示可能排队几秒，期间玩家已经改过键位
      this.game.dialog.show(title, keyText(text));
      const onClose = () => {
        document.getElementById('dialog-close')?.removeEventListener('click', onClose);
        scheduler.after(0.3, () => this._drain(400), TIP_TAG);
      };
      document.getElementById('dialog-close')?.addEventListener('click', onClose);
    }, TIP_TAG);
  }

  setupListeners() {
    window.addEventListener('dungeon-enter', (e) => {
      this.trigger(
        'first-dungeon',
        '迷宫探索',
        `${e.detail.name} — ${e.detail.rooms} 个房间、${e.detail.doors} 扇门。\n\n清剿房间敌人后门会打开；发光石碑按 [{interact}] 阅读叙事；最远的大圆房有守钥者 Boss。`,
        1200
      );
    });

    window.addEventListener('boss-start', (e) => {
      const isDungeon = isDungeonBossId(e.detail.bossId);
      this.trigger(
        isDungeon ? 'first-dungeon-boss' : 'first-open-boss',
        isDungeon ? '迷宫守钥者' : `Boss 战 — ${e.detail.name}`,
        isDungeon
          ? '守钥者会在约 45% 生命进入二阶段：更快、更狠。\n\n{lockOn} 锁定 · {parry} 在红光最后一瞬弹反 · {roll} 翻滚穿招。'
          : '观察敌人脚下红圈：扩大时按 {parry} 弹反，或 {roll} 翻滚。\n\n架势条满会踉跄 — {attackHeavy} 可处决。',
        800
      );
    });

    window.addEventListener('parry-success', () => {
      this.trigger(
        'first-parry',
        '完美弹反',
        '敌人进入长时间硬直 — 立刻 {attackHeavy} 重击处决，伤害大幅提升。',
        200
      );
    });

    window.addEventListener('combo-finisher', () => {
      this.trigger(
        'first-combo-finisher',
        '连击终结',
        '第三段连击命中会触发终结技：额外伤害与屏幕闪光。继续压制！',
        200
      );
    });

    window.addEventListener('journal-entry', (e) => {
      if (e.detail.category !== 'fragment') return;
      this.trigger(
        'first-lore-fragment',
        '叙事碎片',
        '碎片已记入探索日志 [{journal}]。收集足够碎片，你会拼凑出位面崩裂的真相。',
        600
      );
    });

    window.addEventListener('zone-changed', (e) => {
      if (e.detail.initial) return;
      const ch = this.game.quests.chapter;
      const zoneId = e.detail.zoneId;
      // 修 B42：这两条提示此前**完全没看进的是哪个区**，只按章节门控 ——
      // 第四章后随便走进一个区，就会弹出"破碎时线：重力与视野在此不稳定"。
      // 现在按区域 id 触发，标题取 `ZONE_NAMES`（显示名只有一份）
      if (zoneId === ZONE_IDS.VOID && ch >= 4 && !this.seen.has('void-zone-tip')) {
        this.trigger(
          'void-zone-tip',
          ZONE_NAMES[ZONE_IDS.VOID],
          '重力与视野在此不稳定。蓄力法术 [按住 {spell1}~{spell4}] 可打断 Boss 节奏。',
          2500
        );
      }
      if (zoneId === ZONE_IDS.ABYSS && ch >= 5 && !this.seen.has('chaos-zone-tip')) {
        this.trigger(
          'chaos-zone-tip',
          ZONE_NAMES[ZONE_IDS.ABYSS],
          '闪电会随机劈落。击败裂隙领主后，可重复挑战地下城「深渊再探」。',
          2500
        );
      }
    });
  }

  reset() {
    this.seen.clear();
    localStorage.removeItem(STORAGE_KEY);
  }
}
