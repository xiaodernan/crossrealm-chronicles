/** 区域切换全屏过渡 */
export class ZoneTransitionFX {
  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'zone-transition-fx';
    this.el.className = 'zone-transition-fx hidden';
    document.body.appendChild(this.el);
    this.timer = 0;
    this.lastZone = 'hub';
    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener('zone-changed', (e) => {
      const name = e.detail.zone?.name ?? '';
      let zone = 'hub';
      if (name.includes('森林') || name.includes('灰白')) zone = 'fantasy';
      else if (name.includes('魔法') || name.includes('霍格')) zone = 'magic';
      else if (name.includes('米勒') || name.includes('星际')) zone = 'space';
      else if (name.includes('时线') || name.includes('破碎')) zone = 'void';
      else if (name.includes('混沌') || name.includes('边境')) zone = 'abyss';
      if (zone === this.lastZone) return;
      this.play(zone, name);
      this.lastZone = zone;
    });
  }

  play(zone, label) {
    const colors = {
      hub: 'rgba(201,169,98,0.35)',
      fantasy: 'rgba(120,180,100,0.4)',
      magic: 'rgba(140,80,220,0.45)',
      space: 'rgba(80,140,255,0.4)',
      void: 'rgba(200,180,120,0.45)',
      abyss: 'rgba(255,40,80,0.5)',
    };
    this.el.style.background = `radial-gradient(circle, ${colors[zone] ?? colors.hub}, transparent 70%)`;
    this.el.innerHTML = `<div class="ztf-label">${label}</div>`;
    this.el.classList.remove('hidden');
    this.timer = 1.4;
    this.game.audio?.zoneEnter?.();
  }

  update(dt) {
    if (this.timer <= 0) return;
    this.timer -= dt;
    if (this.timer <= 0) this.el.classList.add('hidden');
  }
}
