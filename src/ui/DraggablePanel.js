const STORAGE_PREFIX = 'crossrealm_drag_';

/** 让 UI 面板可拖动，位置持久化到 localStorage */
export function attachDraggable(el, options = {}) {
  if (!el) return;

  const handleSelector = options.handle ?? '.guide-head, .controls-teach-title, .panel-drag-handle';
  const handle = el.querySelector(handleSelector) ?? el;
  const storageKey = `${STORAGE_PREFIX}${options.storageKey ?? el.id ?? 'panel'}`;

  handle.classList.add('panel-drag-handle');
  handle.title = handle.title || '拖动移动面板';

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
  btn.title = '折叠/展开';
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
