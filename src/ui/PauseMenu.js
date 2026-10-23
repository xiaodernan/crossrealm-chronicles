import { SaveSystem } from '../game/SaveSystem.js';
import { focusFirstItem, parkFocus } from './FocusNav.js';
import { t } from '../engine/i18n.js';

export class PauseMenu {
  constructor(game) {
    this.game = game;
    this.panel = document.getElementById('pause-menu');
    this.open = false;
    this.slotSelect = document.getElementById('pause-slot');
    document.getElementById('pause-resume')?.addEventListener('click', () => this.hide());
    // 存 / 读 / 导出 / 导入都作用于**所选槽**（缺省槽0 = 快捷键与老玩家的旧路）。
    // 槽位的编址与隔离在 SaveSystem（W-D3 切片2），这里只负责"玩家选了哪一格"。
    document.getElementById('pause-save')?.addEventListener('click', () => {
      SaveSystem.save(this.game, this.selectedSlot());
      this.refreshSlotOptions();
    });
    document.getElementById('pause-load-slot')?.addEventListener('click', () => {
      SaveSystem.load(this.game, this.selectedSlot());
      this.refreshSlotOptions();
    });
    document.getElementById('pause-export')?.addEventListener('click', () => SaveSystem.exportFile(this.game, this.selectedSlot()));
    const fileInput = document.getElementById('pause-import-file');
    document.getElementById('pause-import')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) SaveSystem.importFile(this.game, file, this.selectedSlot());
      fileInput.value = '';
    });
    document.getElementById('pause-settings')?.addEventListener('click', () => {
      // 真栈（切片12）：下层不关，只让位。`hide()` 会连 `paused` 一起撤掉 ——
      // "暂停"从此要有两个真源（那格布尔 + 各面板 `.open` 的合取），而玩家退回来时站不回原来那一格
      parkFocus(this.panel);
      this.game.settingsPanel.show();
    });
  }

  /** 所选槽位。选择器不在或值不对时回落槽0 —— 面板坏了不能连"保存"一起坏 */
  selectedSlot() {
    const v = Number(this.slotSelect?.value);
    return Number.isInteger(v) && v >= 0 ? v : 0;
  }

  /**
   * 槽位选项从 `SaveSystem.listSlots()` 现推（B47 家族纪律：不抄第二份名单）。
   * 刷新后若玩家之前选中的槽还在，把它接回来 —— 存完档选项重排不该偷走选择。
   */
  refreshSlotOptions() {
    if (!this.slotSelect) return;
    const 之前 = this.slotSelect.value;
    this.slotSelect.textContent = '';
    for (const s of SaveSystem.listSlots()) {
      const opt = document.createElement('option');
      opt.value = String(s.slot);
      opt.textContent = s.exists
        ? t('pause_slot_filled_fmt', { slot: s.slot + 1, version: s.version ?? '?', time: this.时刻(s.time) })
        : t('pause_slot_empty_fmt', { slot: s.slot + 1 });
      this.slotSelect.appendChild(opt);
    }
    if ([...this.slotSelect.options].some((o) => o.value === 之前)) this.slotSelect.value = 之前;
  }

  时刻(t) {
    if (typeof t !== 'number') return '?';
    const d = new Date(t);
    const 补 = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${补(d.getHours())}:${补(d.getMinutes())}`;
  }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  show() {
    this.open = true;
    this.game.paused = true;
    this.panel?.classList.remove('hidden');
    document.exitPointerLock?.();
    // 一开面板就有"现在选中的是谁"：↑↓ 走出得来，Enter 立刻按得响（切片11）
    focusFirstItem(this.panel);
    // 槽位读数只在打开那一刻拉一次：暂停时存档不会自己变化
    this.refreshSlotOptions();
  }

  hide() {
    this.open = false;
    this.game.paused = false;
    this.panel?.classList.add('hidden');
  }
}
