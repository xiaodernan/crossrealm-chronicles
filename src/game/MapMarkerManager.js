/** 全屏地图自定义路点 */
import { t } from '../engine/i18n.js';

export class MapMarkerManager {
  constructor(game) {
    this.game = game;
    this.markers = [];
    this.activeId = null;
    this.maxMarkers = 8;
  }

  add(x, z, label) {
    if (this.markers.length >= this.maxMarkers) {
      this.markers.shift();
    }
    const id = `mk-${Date.now()}`;
    const marker = {
      id,
      x: Math.round(x),
      z: Math.round(z),
      // 默认路点名也是**文案键**（W-D2 切片16f）—— 存进存档的是这句话本身，
      // 所以它必须随语言走：换一个语言，旧档里的默认路点名也得跟着。
      label: label ?? t('map_marker_default_name', { n: this.markers.length + 1 }),
      color: '#66ddff',
    };
    this.markers.push(marker);
    this.activeId = id;
    this.game.dialog.toast(t('map_marker_added', { label: marker.label, x: marker.x, z: marker.z }));
    window.dispatchEvent(new CustomEvent('map-marker-changed'));
    return marker;
  }

  removeNearest(x, z, range = 25) {
    let best = null;
    let min = range;
    for (const m of this.markers) {
      const d = Math.hypot(m.x - x, m.z - z);
      if (d < min) { min = d; best = m; }
    }
    if (best) this.remove(best.id);
    return best;
  }

  remove(id) {
    this.markers = this.markers.filter((m) => m.id !== id);
    if (this.activeId === id) this.activeId = this.markers[0]?.id ?? null;
    window.dispatchEvent(new CustomEvent('map-marker-changed'));
  }

  clearAll() {
    this.markers = [];
    this.activeId = null;
    window.dispatchEvent(new CustomEvent('map-marker-changed'));
  }

  getActive() {
    return this.markers.find((m) => m.id === this.activeId) ?? null;
  }

  cycleActive() {
    if (!this.markers.length) return null;
    const idx = this.markers.findIndex((m) => m.id === this.activeId);
    const next = this.markers[(idx + 1) % this.markers.length];
    this.activeId = next.id;
    this.game.dialog.toast(t('map_marker_navigating', { label: next.label }));
    return next;
  }

  toJSON() {
    return { markers: this.markers, activeId: this.activeId };
  }

  fromJSON(data) {
    if (!data) return;
    this.markers = data.markers ?? [];
    this.activeId = data.activeId ?? this.markers[0]?.id ?? null;
  }
}
