/**
 * 会解析 `innerHTML` 的假 DOM（"整块重绘"那一族面板用）。
 *
 * 为什么再要一份桩，而不是扩 `fakePanelDom.js`：那一份的宿主里清单是**手工摆好**的（`fakeItem` 一项一项给），
 * 而日志抽屉这一族的形状恰恰是"每次渲染把整块 `innerHTML` 换掉，再回来给新按钮挂监听" ——
 * 手工摆清单就等于替被测方作弊：面板忘了重挂监听，桩里的监听还挂着，读数照样绿。
 * 这一份只认字符串：写进 `innerHTML` 的东西才存在，没写进去的按钮就不许被点到。
 *
 * 与浏览器对齐的三条：
 * 1. `querySelectorAll` **只看后代**，且真的按 `.类` / `#id` / `[属性]` / `[属性=值]` / `:not(...)` 筛；
 * 2. `textContent` 的读取按子节点**顺序**拼（`<strong>A</strong>B` 是 `AB` 不是 `BA`）；
 * 3. `focus()` 改的是文档那一份 `activeElement`，不是元素自己记的账。
 */

const VOID_TAGS = new Set(['br', 'img', 'input', 'hr', 'source', 'link', 'meta']);
const BOOL_ATTRS = new Set(['disabled', 'checked', 'hidden', 'readonly']);
const TOKEN_RE = /<[^>]+>|[^<]+/g;
/** 选择器里的一个条件：标签 / #id / .类 / [属性] / [属性=值] / :not(...) */
const COND_RE = /:not\(([^)]+)\)|\[([\w-]+)(?:=([^\]]*))?\]|([#.][\w-]+)|([a-zA-Z][\w-]*)/g;

const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function matchesCond(el, cond) {
  for (const m of cond.matchAll(COND_RE)) {
    const [, not, attr, rawValue, hashed, tag] = m;
    if (not !== undefined) { if (matchesCond(el, not)) return false; continue; }
    if (tag !== undefined) { if (el.tag !== tag.toLowerCase()) return false; continue; }
    if (hashed !== undefined) {
      if (hashed[0] === '#') { if (el.attrs.id !== hashed.slice(1)) return false; continue; }
      if (!el.classList.contains(hashed.slice(1))) return false;
      continue;
    }
    const value = rawValue === undefined ? undefined : rawValue.replace(/^["']|["']$/g, '');
    if (attr.startsWith('data-')) {
      const key = camel(attr.slice(5));
      if (!(key in el.dataset)) return false;
      if (value !== undefined && String(el.dataset[key]) !== value) return false;
      continue;
    }
    if (!(attr in el.attrs)) return false;
    if (value !== undefined && String(el.attrs[attr]) !== value) return false;
  }
  return true;
}

export function makeMarkupDom() {
  const doc = {
    activeElement: null,
    hosts: {},
    getElementById: (id) => doc.hosts[id] ?? null,
    createElement: (tag) => node(tag, doc),
    setActive: (el) => { doc.activeElement = el; },
  };
  doc.body = node('body', doc);
  return doc;
}

export function node(tag, doc) {
  const el = {
    tag: String(tag).toLowerCase(),
    children: [],
    attrs: {},
    dataset: {},
    listeners: {},
    style: {},
    parent: null,
    doc,
    clicks: 0,
    focusCount: 0,
    _text: '',
    _html: '',
  };
  el.classList = {
    contains: (c) => String(el.attrs.class ?? '').split(/\s+/).includes(c),
    add: (c) => { if (!el.classList.contains(c)) el.attrs.class = `${el.attrs.class ?? ''} ${c}`.trim(); },
    remove: (c) => { el.attrs.class = String(el.attrs.class ?? '').split(/\s+/).filter((x) => x && x !== c).join(' '); },
    toggle: (c, on) => {
      const want = on === undefined ? !el.classList.contains(c) : Boolean(on);
      if (want) el.classList.add(c); else el.classList.remove(c);
    },
  };
  Object.defineProperty(el, 'className', {
    get: () => el.attrs.class ?? '',
    set: (v) => { el.attrs.class = String(v); },
  });
  Object.defineProperty(el, 'id', {
    get: () => el.attrs.id ?? '',
    set: (v) => { el.attrs.id = String(v); },
  });
  /** `disabled` 在浏览器里与属性同步：设属性 = 设属性字符串，选择器 `:not([disabled])` 才筛得动 */
  Object.defineProperty(el, 'disabled', {
    get: () => 'disabled' in el.attrs,
    set: (v) => {
      if (v) el.attrs.disabled = '';
      else delete el.attrs.disabled;
    },
  });
  Object.defineProperty(el, 'textContent', {
    get: () => el._text + el.children.map((c) => c.textContent).join(''),
    set: (v) => { el.children = []; el._text = String(v); el._html = String(v); },
  });
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html,
    set: (v) => { el._html = String(v); el.children = []; el._text = ''; parse(el, String(v)); },
  });
  /** 属性四件套（与浏览器对齐）：`applyTranslations` 等真代码路径读的是 getAttribute */
  el.getAttribute = (name) => (name in el.attrs ? el.attrs[name] : null);
  el.setAttribute = (name, value) => { el.attrs[name] = String(value); };
  el.removeAttribute = (name) => { delete el.attrs[name]; };
  el.hasAttribute = (name) => name in el.attrs;
  el.addEventListener = (type, fn) => { (el.listeners[type] ??= []).push(fn); };
  el.dispatch = (type) => { (el.listeners[type] ?? []).forEach((fn) => fn({ type, target: el })); };
  /** 「玩家点了这一格」= 记一次点击 + 走挂在这格上的 click 监听（浏览器里这本来就是同一件事） */
  el.click = () => {
    if (el.disabled) return;
    el.clicks += 1;
    el.dispatch('click');
  };
  el.focus = () => { el.focusCount += 1; doc.setActive(el); };
  el.appendChild = (child) => { child.detach(); child.parent = el; el.children.push(child); return child; };
  el.prepend = (child) => { child.detach(); child.parent = el; el.children.unshift(child); return child; };
  /** 真 DOM 的 `after()`：插到"我"的后面，所以要有父节点才动得了 */
  el.after = (child) => {
    const at = el.parent?.children.indexOf(el) ?? -1;
    if (at < 0) return child;
    child.detach();
    child.parent = el.parent;
    el.parent.children.splice(at + 1, 0, child);
    return child;
  };
  el.detach = () => {
    const at = el.parent?.children.indexOf(el) ?? -1;
    if (at >= 0) el.parent.children.splice(at, 1);
    el.parent = null;
    return el;
  };
  el.querySelectorAll = (sel) => {
    const groups = String(sel).split(',').map((g) => g.trim()).filter(Boolean);
    const out = [];
    const walk = (n) => {
      for (const c of n.children) {
        if (c.tag !== '#text' && groups.some((g) => matchesCond(c, g))) out.push(c);
        walk(c);
      }
    };
    walk(el);
    return out;
  };
  el.querySelector = (sel) => el.querySelectorAll(sel)[0] ?? null;
  return el;
}

function textNode(text, doc) {
  const t = node('#text', doc);
  t._text = text;
  return t;
}

function parse(parent, html) {
  const doc = parent.doc;
  const stack = [parent];
  for (const token of html.matchAll(TOKEN_RE)) {
    const raw = token[0];
    const top = () => stack[stack.length - 1];
    if (!raw.startsWith('<')) {
      const text = raw.replace(/\s+/g, ' ');
      if (text.trim()) top().appendChild(textNode(text, doc));
      continue;
    }
    if (raw.startsWith('</')) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const open = /^<\s*([\w-]+)([^>]*)>?$/.exec(raw.trim());
    if (!open) continue;
    const el = node(open[1], doc);
    for (const a of open[2].matchAll(/([\w:-]+)(?:=(?:\s*"([^"]*)"|\s*(\S+)))?/g)) {
      const value = a[2] ?? a[3] ?? '';
      el.attrs[a[1]] = value;
      if (a[1].startsWith('data-')) el.dataset[camel(a[1].slice(5))] = value;
      else if (BOOL_ATTRS.has(a[1])) el[a[1]] = value === '' ? true : value;
      else if (a[1] === 'value' || a[1] === 'type') el[a[1]] = value;   // 浏览器把这两个暴露成属性
    }
    top().appendChild(el);
    // 空元素与自闭合标签不入栈：它们没有结束标签，压上去就会把后面所有兄弟都吞成子女
    if (!VOID_TAGS.has(el.tag) && !raw.trim().endsWith('/>')) stack.push(el);
  }
}
