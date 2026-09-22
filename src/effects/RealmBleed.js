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

export class RealmBleed {
  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'realm-bleed';
    this.overlay.className = 'realm-bleed';
    document.body.appendChild(this.overlay);
    this.lastKey = 'hub';

    window.addEventListener('zone-changed', (e) => {
      if (e.detail.initial) return;
      const name = e.detail.zone?.name ?? '';
      const key = this.zoneKey(name);
      if (key === this.lastKey) return;
      this.lastKey = key;
      this.pulse(key, name);
    });
  }

  zoneKey(name) {
    if (name.includes('森林') || name.includes('灰白')) return 'fantasy';
    if (name.includes('魔法') || name.includes('霍格')) return 'magic';
    if (name.includes('米勒') || name.includes('星际')) return 'space';
    if (name.includes('时线') || name.includes('破碎')) return 'void';
    if (name.includes('混沌') || name.includes('边境')) return 'abyss';
    if (name.includes('枢纽') || name.includes('锚')) return 'hub';
    return 'wild';
  }

  pulse(key, zoneName) {
    this.overlay.style.setProperty('--bleed-color', ZONE_TINT[key] ?? ZONE_TINT.wild);
    this.overlay.classList.remove('active');
    void this.overlay.offsetWidth;
    this.overlay.classList.add('active');
    window.dispatchEvent(new CustomEvent('realm-bleed', { detail: { zone: zoneName, key } }));
  }
}
