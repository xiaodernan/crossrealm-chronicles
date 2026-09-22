/** CG 画廊 bonus 解锁扩写 — 挂到 CgGallerySystem */
export function attachCgGalleryExtras(cgGallery) {
  window.addEventListener('combat-style-changed', (e) => {
    if ((e.detail?.score ?? 0) >= 700) cgGallery.unlock('bonus:style-ss', 'style:ss');
  });
  window.addEventListener('boss-rematch-started', () => {
    cgGallery.unlock('bonus:rematch', 'boss-rematch');
  });
  window.addEventListener('codex-unlocked', () => {
    const stats = cgGallery.game.loreCodex?.getStats();
    if (stats && stats.percent >= 100) cgGallery.unlock('bonus:codex-full', 'codex:full');
  });
  window.addEventListener('photo-mode-changed', (e) => {
    if (e.detail?.active) cgGallery.unlock('bonus:photo', 'photo-mode');
  });
  window.addEventListener('campfire-memory-updated', (e) => {
    if ((e.detail?.zones ?? 0) >= 6) cgGallery.unlock('bonus:campfire-all', 'campfire:all');
  });
}
