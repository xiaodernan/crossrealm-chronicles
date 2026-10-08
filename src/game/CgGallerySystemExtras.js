import { on, offAll } from '../engine/EventBus.js';

const GAME_CGGALLERYSYSTEMEXTRAS = 'game/CgGallerySystemExtras';
const cgExtrasOn = (name, handler) => on(name, handler, GAME_CGGALLERYSYSTEMEXTRAS);

/** CG 画廊 bonus 解锁扩写 — 挂到 CgGallerySystem */
export function attachCgGalleryExtras(cgGallery) {
  cgExtrasOn('combat-style-changed', (e) => {
    if ((e.detail?.score ?? 0) >= 700) cgGallery.unlock('bonus:style-ss', 'style:ss');
  });
  cgExtrasOn('boss-rematch-started', () => {
    cgGallery.unlock('bonus:rematch', 'boss-rematch');
  });
  cgExtrasOn('codex-unlocked', () => {
    const stats = cgGallery.game.loreCodex?.getStats();
    if (stats && stats.percent >= 100) cgGallery.unlock('bonus:codex-full', 'codex:full');
  });
  cgExtrasOn('photo-mode-changed', (e) => {
    if (e.detail?.active) cgGallery.unlock('bonus:photo', 'photo-mode');
  });
  cgExtrasOn('campfire-memory-updated', (e) => {
    if ((e.detail?.zones ?? 0) >= 6) cgGallery.unlock('bonus:campfire-all', 'campfire:all');
  });
  return { dispose() { offAll(GAME_CGGALLERYSYSTEMEXTRAS); } };
}
