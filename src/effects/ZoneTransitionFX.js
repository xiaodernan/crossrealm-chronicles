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
      // 分支取 id（修 B36），显示名只当文案用
      const zone = e.detail.zoneId;
      if (zone === this.lastZone) return;
      this.play(zone, e.detail.zone?.name ?? '');
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
