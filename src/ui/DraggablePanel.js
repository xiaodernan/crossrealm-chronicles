import { t } from '../engine/i18n.js';

const STORAGE_PREFIX = 'crossrealm_drag_';

/** 本模块写出去的 title 登记册（W-D2 切片39）：换语言时按册重算，没登记的既有 title 不碰 */
const DRAG_HANDLES = new Set();
const COLLAPSE_BTNS = new Set();

/** 让 UI 面板可拖动，位置持久化到 localStorage */
export function attachDraggable(el, options = {}) {
  if (!el) return;

  const handleSelector = options.handle ?? '.guide-head, .controls-teach-title, .panel-drag-handle';
  const handle = el.querySelector(handleSelector) ?? el;
  const storageKey = `${STORAGE_PREFIX}${options.storageKey ?? el.id ?? 'panel'}`;

  handle.classList.add('panel-drag-handle');
  // 只在没有 title 时写（HTML 自带 title 的面板不碰）；写过的登记在册，换语言时重算
  if (!handle.title) {
    handle.title = t('panel_drag_handle_title');
    DRAG_HANDLES.add(handle);
  }

  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      const { x, y } = JSON.parse(saved);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    } catch { /* ignore */ }
  }

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, a, input, select, textarea, kbd')) return;

    dragging = true;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');

    const rect = el.getBoundingClientRect();
    if (!el.style.left) {
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    }

    startX = e.clientX;
    startY = e.clientY;
    originLeft = parseFloat(el.style.left) || rect.left;
    originTop = parseFloat(el.style.top) || rect.top;
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const maxX = window.innerWidth - w - 4;
    const maxY = window.innerHeight - h - 4;
    const nx = Math.max(4, Math.min(maxX, originLeft + dx));
    const ny = Math.max(4, Math.min(maxY, originTop + dy));
    el.style.left = `${nx}px`;
    el.style.top = `${ny}px`;
  };

  const onPointerUp = (e) => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
    localStorage.setItem(storageKey, JSON.stringify({
      x: parseFloat(el.style.left),
      y: parseFloat(el.style.top),
    }));
  };

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);
}

const COLLAPSE_PREFIX = 'crossrealm_collapse_';

/** 面板折叠按钮 */
export function attachCollapsible(el, options = {}) {
  if (!el) return;
  const handle = el.querySelector(options.handle ?? '.panel-drag-handle, .guide-head, .controls-teach-title') ?? el;
  const storageKey = `${COLLAPSE_PREFIX}${options.storageKey ?? el.id ?? 'panel'}`;

  if (localStorage.getItem(storageKey) === '1') el.classList.add('panel-collapsed');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'panel-collapse-btn';
  btn.title = t('panel_collapse_toggle_title');
  COLLAPSE_BTNS.add(btn);
  btn.textContent = el.classList.contains('panel-collapsed') ? '+' : '−';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    el.classList.toggle('panel-collapsed');
    const collapsed = el.classList.contains('panel-collapsed');
    btn.textContent = collapsed ? '+' : '−';
    localStorage.setItem(storageKey, collapsed ? '1' : '0');
  });
  handle.appendChild(btn);
}

/**
 * 换语言时把本模块写出去的 title 重算（W-D2 切片39）。
 *
 * `attachDraggable` 的 title 是"没有才写"，HTML 自带 title 的面板不在册里、也不会被碰；
 * 折叠钮是本模块建的，title 始终归本模块。SettingsManager.applyToGame 在
 * `applyTranslations()` 之后调它 —— DOM 走查只认 `data-i18n`，够不到 title 属性。
 */
export function refreshPanelTitles() {
  for (const h of DRAG_HANDLES) h.title = t('panel_drag_handle_title');
  for (const b of COLLAPSE_BTNS) b.title = t('panel_collapse_toggle_title');
}
