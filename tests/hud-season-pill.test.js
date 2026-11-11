/**
 * HUD 赛季金印（W-V6）——在线伙伴服务在场时 HUD 常驻一枚季节徽章。
 *
 * ## 为什么补这一格的运行期门禁
 *
 * 这格出厂即 `hidden`，由 `_renderSeasonPill()` 在开机 + 每 0.5s 询问 `game.seasons`
 * 之后撩开。桩必须真的提供 `seasons.getState()`，否则测到的全是"没赛季就躲起来"那半条。
 * 也顺手钉住两条契约：
 *   1. **签名不变不碰 DOM** —— 同一天内反复 render，name 节点不会被重写；
 *   2. **来源金点** —— online 才亮金点，local 保持灰暗，title 带来源文案。
 *
 * 桩形状沿用 `tests/hud-boot.test.js`：假文档只收 innerHTML 里真的写出来的格子。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { makeMarkupDom, node } from './helpers/fakeMarkupDom.js';
import { offAll } from '../src/engine/EventBus.js';
import { HUD } from '../src/ui/HUD.js';

const HUD_TAG = 'ui/HUD';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function bootDoc() {
  const doc = makeMarkupDom();
  const html = node('html', doc);
  html.style.setProperty = (name, value) => { html.style[name] = value; };
  html.appendChild(doc.body);
  doc.documentElement = html;

  for (const id of ['hud', 'minimap-wrap', 'minimap', 'zone-panel', 'zone-banner', 'journal-panel', 'pause-journal']) {
    const el = node(id === 'minimap' ? 'canvas' : 'div', doc);
    el.id = id;
    doc.body.appendChild(el);
    doc.hosts[id] = el;
  }

  doc.getElementById = (id) => doc.hosts[id] ?? doc.body.querySelectorAll(`#${id}`)[0] ?? null;
  doc.querySelectorAll = (sel) => doc.body.querySelectorAll(sel);
  doc.querySelector = (sel) => doc.body.querySelector(sel);
  return doc;
}

/** 一份能给出"在线 radiant"读数的 seasons 桩；source 可被场景改写 */
function onlineSeasons() {
  const state = {
    season: { id: 'radiant', name: 'season_radiant_name', modifierIds: ['radiant-decree'] },
    id: 'radiant',
    modifierIds: ['radiant-decree'],
    modifiers: [],
    dayInCycle: 6,
    daysRemaining: 8,
    soulsBonusPct: 30,
    source: 'online',
    cycleDays: 28,
  };
  return { state, getState: () => state };
}

function bootGame(seasons) {
  return {
    inputDevice: { current: () => null },
    dialog: { toast: () => {} },
    quests: {
      notifyUpdate() {},
      getProgressText: () => '0/1',
    },
    seasons,
  };
}

describe('HUD 赛季金印（W-V6）', () => {
  let doc;

  beforeAll(() => {
    globalThis.localStorage = fakeStorage();
  });

  afterAll(() => {
    offAll(HUD_TAG);
    delete globalThis.document;
    delete globalThis.localStorage;
  });

  beforeEach(() => {
    offAll(HUD_TAG);
    doc = bootDoc();
    globalThis.document = doc;
  });

  it('没赛季系统的时候徽章保持 hidden，不抛', () => {
    const hud = new HUD(bootGame(undefined));
    const pill = doc.getElementById('season-pill');
    expect(pill).toBeTruthy();
    expect(pill.classList.contains('hidden')).toBe(true);
    hud.dispose?.();
  });

  it('在线 radiant：徽章撩开，名字/剩余天数/魂火加成/金点都在', () => {
    const seasons = onlineSeasons();
    const hud = new HUD(bootGame(seasons));
    const pill = doc.getElementById('season-pill');
    expect(pill.classList.contains('hidden')).toBe(false);
    expect(pill.dataset.season).toBe('radiant');
    expect(doc.getElementById('season-pill-name').textContent).toBe('辉煌残响');
    expect(doc.getElementById('season-pill-days').textContent).toContain('8');
    expect(doc.getElementById('season-pill-bonus').textContent).toContain('30');
    expect(doc.getElementById('season-pill-dot').classList.contains('is-online')).toBe(true);
    expect(pill.getAttribute('title')).toContain('在线赛季');
    hud.dispose?.();
  });

  it('来源从 online 掉回 local：金点熄灭，签名变化驱动 DOM 重写', () => {
    const seasons = onlineSeasons();
    const hud = new HUD(bootGame(seasons));
    seasons.state.source = 'local';
    hud._renderSeasonPill();
    expect(doc.getElementById('season-pill-dot').classList.contains('is-online')).toBe(false);
    expect(doc.getElementById('season-pill').getAttribute('title')).toContain('本地轮转');
    hud.dispose?.();
  });

  it('签名不变不碰 DOM：同一帧连刷两次，name 节点只写一次', () => {
    const seasons = onlineSeasons();
    const hud = new HUD(bootGame(seasons));
    const nameEl = doc.getElementById('season-pill-name');
    const before = nameEl.textContent;
    // 手动把 name 写成别的，再 render —— 签名没变，不应回写
    nameEl.textContent = '__sentinel__';
    hud._renderSeasonPill();
    expect(nameEl.textContent).toBe('__sentinel__');
    expect(hud._seasonPillSig).toBe('radiant|8|30|online');
    expect(before).toBe('辉煌残响');
    hud.dispose?.();
  });
});
