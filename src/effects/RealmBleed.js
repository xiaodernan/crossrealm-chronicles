/** 位面渗漏 — 跨区瞬间的 chromatic 闪变 */
const ZONE_TINT = {
  hub: 'rgba(201,169,98,0.45)',
  fantasy: 'rgba(136,170,102,0.5)',
  magic: 'rgba(102,68,204,0.55)',
  space: 'rgba(68,136,255,0.5)',
  void: 'rgba(201,169,98,0.6)',
  abyss: 'rgba(255,34,68,0.55)',
  wild: 'rgba(120,140,180,0.35)',
};

import { on, offAll } from '../engine/EventBus.js';
import { t } from '../engine/i18n.js';

const EFFECTS_REALMBLEED = 'effects/RealmBleed';
const bleedOn = (name, handler) => on(name, handler, EFFECTS_REALMBLEED);
export class RealmBleed {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第七处） */
  dispose() {
    offAll(EFFECTS_REALMBLEED);
  }

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'realm-bleed';
    this.overlay.className = 'realm-bleed';
    document.body.appendChild(this.overlay);
    this.lastKey = 'hub';

    bleedOn('zone-changed', (e) => {
      if (e.detail.initial) return;
      // 修 B36：渗漏色按 id 取，认不出的 id（走廊、未来的新区）走中性 'wild'
      const key = ZONE_TINT[e.detail.zoneId] ? e.detail.zoneId : 'wild';
      if (key === this.lastKey) return;
      this.lastKey = key;
      this.pulse(key, e.detail.zone?.name ? t(e.detail.zone.name) : '');
    });
  }

  pulse(key, zoneName) {
    this.overlay.style.setProperty('--bleed-color', ZONE_TINT[key] ?? ZONE_TINT.wild);
    this.overlay.classList.remove('active');
    void this.overlay.offsetWidth;
    this.overlay.classList.add('active');
    window.dispatchEvent(new CustomEvent('realm-bleed', { detail: { zone: zoneName, key } }));
  }
}
