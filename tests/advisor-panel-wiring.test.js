/**
 * 星轨顾问 · 面板与装配（W-Y2 切片1，与 `tests/advisor.test.js` 互补）。
 *
 * `advisor.test.js` 钉的是**契约**：枚举全覆盖、文案两表、纯函数、请求口的 reason 映射。
 * 这一份钉的是**那些契约有没有真的接到玩家面前**：
 *
 * ① 前后端数字对齐 —— 客户端上限从 Java 源码现读出来比对，不靠注释里人抄一份；
 * ② 真 DOM 桩跑面板 —— 开/关、健康四态、一问一答、不可信文本、真取消、
 *    七种失败、换语言、DOM 长度封顶、dispose；
 * ③ 静态门禁 —— 不许 innerHTML / 自建计时器 / 运行期拼键 / 前端出现密钥；
 * ④ 五处接线 —— 壳页、层表、Game、SettingsManager、reduced-motion 样式。
 *
 * ## 为什么用真壳页建桩
 *
 * 面板的 id 全部来自 `index.html`。手写一份「看起来一样」的 DOM 等于替被测方作弊：
 * 壳页里少写一个 `id`，手摆的桩照样有，用例全绿而浏览器里取不到。
 * 所以这里把**壳页里顾问那一块原文**灌进会解析 innerHTML 的假文档。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADVISOR_LIMITS, ADVISOR_REASONS, ADVISOR_ERROR_REASONS, ADVISOR_SUGGESTIONS,
} from '../src/content/advisor.js';
import { AdvisorPanel, ERROR_KEYS } from '../src/ui/AdvisorPanel.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { t, setLanguage } from '../src/engine/i18n.js';
import { OVERLAY_LAYERS } from '../src/ui/OverlayStack.js';
import { UI_HOTKEYS, UI_HOTKEY_LABELS } from '../src/content/hotkeys.js';
import { makeMarkupDom } from './helpers/fakeMarkupDom.js';

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

/* ------------------------------------------------------------------ *
 * ① 前后端数字对齐
 * ------------------------------------------------------------------ */

describe('① 客户端上限与服务端校验对齐（跨栈读同一份数）', () => {
  const controller = 读('server/ai-service/src/main/java/com/crossrealm/chronicles/ai/AiController.java');
  const props = 读('server/ai-service/src/main/java/com/crossrealm/chronicles/ai/AiProperties.java');
  const gateway = 读('server/gateway/src/main/resources/application.yml');

  it('问题的 @Size(max=400) 与 context 的 @Size(max=8) 就是客户端那两个上限', () => {
    const q = Number(/@Size\(max\s*=\s*(\d+)\)\s*String question/.exec(controller)?.[1]);
    const c = Number(/@Size\(max\s*=\s*(\d+)\)\s*Map<String, Object> context/.exec(controller)?.[1]);
    expect(Number.isFinite(q) && q > 0, '没从 Java 源码解析出问题上限 —— 尺子瞎了').toBe(true);
    expect(Number.isFinite(c) && c > 0, '没从 Java 源码解析出上下文条数上限').toBe(true);
    expect(ADVISOR_LIMITS.questionMax).toBe(q);
    expect(ADVISOR_LIMITS.contextMaxEntries).toBe(c);
  });

  it('客户端超时容得下服务端「1 次 + 最多 N 次重试」的最坏耗时', () => {
    const seconds = Number(/Duration\.ofSeconds\((\d+)\)/.exec(props)?.[1]);
    const retries = Number(/maxRetries\s*=\s*(\d+)/.exec(props)?.[1]);
    expect(Number.isFinite(seconds) && Number.isFinite(retries), '服务端超时/重试解析失败').toBe(true);
    expect(ADVISOR_LIMITS.requestTimeoutMs).toBeGreaterThan((retries + 1) * seconds * 1000);
    expect(ADVISOR_LIMITS.healthTimeoutMs).toBeLessThan(ADVISOR_LIMITS.requestTimeoutMs);
  });

  it('网关熔断限时器不能比客户端更早放弃（reactive 缺省 1s 会吃掉每次 LLM 调用）', () => {
    const seconds = Number(/timeout-duration:\s*(\d+)s/.exec(gateway)?.[1]);
    expect(Number.isFinite(seconds) && seconds > 1, '网关没给 aiServiceBreaker 显式限时').toBe(true);
    expect(seconds * 1000).toBeGreaterThan(ADVISOR_LIMITS.requestTimeoutMs);
  });

  it('上限/原因/芯片三张表都是冻结的：内容层不许被运行期改一格', () => {
    for (const table of [ADVISOR_LIMITS, ADVISOR_REASONS, ADVISOR_SUGGESTIONS, ERROR_KEYS]) {
      expect(Object.isFrozen(table)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ *
 * ② 真 DOM 桩
 * ------------------------------------------------------------------ */

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

/** 用**真壳页**里顾问那一块建假文档：壳页漏一个 id，这里就取不到 */
function bootDoc() {
  const html = 读('index.html');
  const start = html.indexOf('<!-- W-Y2');
  const end = html.indexOf('<script type="module"', start);
  expect(start, '壳页里找不到顾问块的起点').toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const doc = makeMarkupDom();
  doc.body.innerHTML = html.slice(start, end);
  doc.getElementById = (id) => doc.body.querySelectorAll(`#${id}`)[0] ?? null;
  const input = doc.getElementById('advisor-input');
  if (input) input.value = '';
  return doc;
}

function panelHarness({ health = { ok: true, data: { configured: true, circuit: 'CLOSED' } }, answer } = {}) {
  const doc = bootDoc();
  globalThis.document = doc;
  globalThis.localStorage = fakeStorage();
  const asked = [];
  let healthCalls = 0;
  let pendingResolve = null;
  const stack = { opened: [], closed: [], open(n) { this.opened.push(n); }, close(n) { this.closed.push(n); } };
  const game = {
    overlayStack: stack,
    seasons: { getState: () => ({ id: 'ember', dayInCycle: 3 }) },
    trial: { getState: () => ({ state: 'running', layer: 2 }) },
    quests: { chapter: 2 },
    onlineServices: {
      fetchAdvisorHealth: async () => { healthCalls += 1; return health; },
      askAdvisorBackground: (q, ctx, opts) => {
        asked.push({ q, ctx, signal: opts?.signal });
        if (answer) return Promise.resolve(answer(asked.length, opts));
        return new Promise((resolve) => { pendingResolve = resolve; });
      },
    },
  };
  const panel = new AdvisorPanel(game);
  return {
    doc, panel, game, stack, asked,
    get healthCalls() { return healthCalls; },
    resolve: (v) => pendingResolve?.(v),
    cleanup: () => { panel.dispose(); delete globalThis.document; delete globalThis.localStorage; },
  };
}

const bubbles = (doc) => doc.getElementById('advisor-transcript').querySelectorAll('[data-advisor-role]');
const lastBubble = (doc) => bubbles(doc).at(-1);

describe('② 面板：真 DOM 桩跑一遍玩家会走的路', () => {
  beforeEach(() => setLanguage('zh'));
  afterEach(() => setLanguage('zh'));

  it('开 → 登记模态层 / 聚焦输入框 / 探一次健康；关 → 退层并把焦点还给 FAB', async () => {
    const h = panelHarness();
    expect(h.panel.show()).toBe(true);
    await flush();
    expect(h.stack.opened).toEqual(['advisor']);
    expect(h.doc.activeElement?.id).toBe('advisor-input');
    expect(h.healthCalls).toBe(1);
    expect(h.doc.getElementById('advisor-status-text').textContent).toBe(STRINGS_ZH.advisor_status_ready);
    expect(h.panel.hide()).toBe(true);
    expect(h.stack.closed).toEqual(['advisor']);
    expect(h.doc.activeElement?.id).toBe('advisor-fab');
    h.panel.show();                       // 重开不再打网关：离线时不反复重试
    await flush();
    expect(h.healthCalls).toBe(1);
    h.cleanup();
  });

  it('健康四态：未配置 / 调用失败 → offline；OPEN / HALF_OPEN → degraded', async () => {
    for (const [health, key] of [
      [{ ok: true, data: { configured: false } }, 'advisor_status_offline'],
      [{ ok: true, data: { configured: true, circuit: 'OPEN' } }, 'advisor_status_degraded'],
      [{ ok: true, data: { configured: true, circuit: 'HALF_OPEN' } }, 'advisor_status_degraded'],
      [{ ok: false, reason: 'network' }, 'advisor_status_offline'],
    ]) {
      const h = panelHarness({ health });
      h.panel.show();
      await flush();
      expect(h.doc.getElementById('advisor-status-text').textContent).toBe(STRINGS_ZH[key]);
      h.cleanup();
    }
  });

  it('一问一答：用户气泡 + 回答气泡 + meta + 缓存角标；上下文只带白名单标量', async () => {
    const h = panelHarness({
      answer: () => ({ ok: true, data: { answer: '先堆火伤。', model: 'gpt-6-sol', latencyMs: 1234.6, cached: true } }),
    });
    h.panel.show();
    await flush();
    h.doc.getElementById('advisor-input').value = '这一季堆什么？';
    h.doc.getElementById('advisor-form').dispatch('submit');
    await flush();
    expect(h.asked).toHaveLength(1);
    expect(h.asked[0].q).toBe('这一季堆什么？');
    // 面板只负责「全是标量」；数字转字符串是 OnlineServices 的归一化职责（那边另有测试）
    expect(h.asked[0].ctx).toEqual({
      season: 'ember', season_day: 3, trial_state: 'running', trial_layer: 2, chapter: 2,
    });
    expect(Object.values(h.asked[0].ctx).every((v) => typeof v !== 'object' && typeof v !== 'function')).toBe(true);
    const msgs = bubbles(h.doc);
    expect(msgs.map((m) => m.getAttribute('data-advisor-role'))).toEqual(['user', 'advisor']);
    expect(msgs[1].textContent).toContain('先堆火伤。');
    expect(msgs[1].querySelectorAll('.is-cached')).toHaveLength(1);
    expect(h.doc.getElementById('advisor-meta').textContent).toBe('gpt-6-sol · 1235 ms · 1/1 本地缓存');
    expect(h.doc.getElementById('advisor-typing').classList.contains('hidden')).toBe(true);
    h.cleanup();
  });

  it('上游 prompt-cache 命中：金色「上游缓存」角标 + meta 里的上游命中计数', async () => {
    const h = panelHarness({
      answer: () => ({ ok: true, data: { answer: '往有灯的地方走。', model: 'gpt-6-sol', latencyMs: 880, cached: false, upstreamCached: true } }),
    });
    h.panel.show();
    await flush();
    h.doc.getElementById('advisor-input').value = '下一站去哪？';
    h.doc.getElementById('advisor-form').dispatch('submit');
    await flush();
    const msgs = bubbles(h.doc);
    expect(msgs[1].querySelectorAll('.is-upstream-cached')).toHaveLength(1);
    expect(msgs[1].querySelectorAll('.is-cached')).toHaveLength(0);
    expect(h.doc.getElementById('advisor-meta').textContent).toContain('上游缓存');
    h.cleanup();
  });

  it('上游冷调用（未命中缓存）：无上游角标，meta 仍记一笔上游调用', async () => {
    const h = panelHarness({
      answer: () => ({ ok: true, data: { answer: '往西也行。', model: 'gpt-6-sol', latencyMs: 1500, cached: false, upstreamCached: false } }),
    });
    h.panel.show();
    await flush();
    h.panel._ask('往东还是往西？');
    await flush();
    const msgs = bubbles(h.doc);
    expect(msgs[1].querySelectorAll('.is-upstream-cached')).toHaveLength(0);
    expect(msgs[1].querySelectorAll('.is-cached')).toHaveLength(0);
    expect(h.doc.getElementById('advisor-meta').textContent).toContain('上游缓存');
    h.cleanup();
  });

  it('模型回的 <script> 只是一段字：DOM 里不出现 script / img 节点', async () => {
    const h = panelHarness({ answer: () => ({ ok: true, data: { answer: '<script>alert(1)</script><img src=x>' } }) });
    h.panel.show();
    await flush();
    h.panel._ask('说点什么');
    await flush();
    expect(lastBubble(h.doc).textContent).toBe('<script>alert(1)</script><img src=x>');
    expect(h.doc.getElementById('advisor-transcript').querySelectorAll('script')).toHaveLength(0);
    expect(h.doc.getElementById('advisor-transcript').querySelectorAll('img')).toHaveLength(0);
    h.cleanup();
  });

  it('空问题不请求；芯片上那句话就是真的发出去的问题', async () => {
    const h = panelHarness({ answer: () => ({ ok: true, data: { answer: '嗯' } }) });
    h.panel.show();
    await flush();
    expect(h.panel._ask('   ')).toBe(false);
    expect(h.asked).toHaveLength(0);
    expect(lastBubble(h.doc).textContent).toBe(STRINGS_ZH.advisor_error_blank);
    const chips = h.doc.getElementById('advisor-suggestions').querySelectorAll('[data-advisor-prompt]');
    expect(chips).toHaveLength(ADVISOR_SUGGESTIONS.length);
    chips[0].click();
    await flush();
    expect(h.asked[0].q).toBe(t(ADVISOR_SUGGESTIONS[0].key));
    expect(h.asked[0].q).toBe(STRINGS_ZH.advisor_suggestion_build);
    h.cleanup();
  });

  it('停止按钮是真 abort：请求拿到的 signal 立刻变 aborted', async () => {
    const h = panelHarness();
    h.panel.show();
    await flush();
    h.panel._ask('在吗');
    await flush();
    expect(h.panel.pending).toBe(true);
    expect(h.asked[0].signal.aborted).toBe(false);
    expect(h.panel.cancel()).toBe(true);
    expect(h.asked[0].signal.aborted).toBe(true);
    h.resolve({ ok: false, reason: ADVISOR_REASONS.CANCELLED, status: 0, data: null });
    await flush();
    expect(lastBubble(h.doc).textContent).toBe(STRINGS_ZH.advisor_error_cancelled);
    expect(h.panel.pending).toBe(false);
    h.cleanup();
  });

  it('每一种失败各有各的一句话；取消/HTTP/队列忙不改离线态', async () => {
    for (const reason of ADVISOR_ERROR_REASONS) {
      const h = panelHarness();
      h.panel.show();
      await flush();
      h.panel._handleResult({ ok: false, reason, status: 400, data: {} });
      const want = reason === ADVISOR_REASONS.HTTP
        ? t(ERROR_KEYS[reason], { status: 400 })
        : t(ERROR_KEYS[reason]);
      expect(lastBubble(h.doc).textContent, reason).toBe(want);
      expect(lastBubble(h.doc).getAttribute('data-advisor-role'), reason).toBe('error');
      if (reason === ADVISOR_REASONS.HTTP
          || reason === ADVISOR_REASONS.BUSY
          || reason === ADVISOR_REASONS.CANCELLED) {
        expect(h.panel._status, reason).not.toBe('offline');
      } else {
        expect(h.panel._status, reason).toBe('offline');
      }
      if (reason === ADVISOR_REASONS.BUSY) {
        expect(h.panel._status).toBe('degraded', '429 是"忙"，不是"不在线"');
        expect(lastBubble(h.doc).textContent).toBe(t(ERROR_KEYS[ADVISOR_REASONS.BUSY]));
      }
      h.cleanup();
    }
  });

  it('网关 503 熔断单独一句话：不是「HTTP 503」，是「顾问暂时不在」', async () => {
    const h = panelHarness();
    h.panel.show();
    await flush();
    h.panel._handleResult({ ok: false, reason: ADVISOR_REASONS.HTTP, status: 503, data: { error: 'advisor-unavailable' } });
    expect(lastBubble(h.doc).textContent).toBe(STRINGS_ZH.advisor_error_unavailable);
    expect(h.panel._status).toBe('degraded');
    h.cleanup();
  });

  it('纯文本 500（data=null）不许把失败分支炸掉：仍给出 HTTP 那句话', async () => {
    const h = panelHarness();
    h.panel.show();
    await flush();
    expect(() => h.panel._handleResult({
      ok: false, reason: ADVISOR_REASONS.HTTP, status: 500, data: null,
    })).not.toThrow();
    expect(lastBubble(h.doc).textContent).toBe(t(ERROR_KEYS[ADVISOR_REASONS.HTTP], { status: 500 }));
    expect(h.panel._status).toBe('degraded');
    h.cleanup();
  });

  it('换语言：静态格 / 状态 / 字数 / 错误气泡一起改口，模型原话不动', async () => {
    const h = panelHarness({ answer: () => ({ ok: true, data: { answer: '先堆火伤。' } }) });
    h.panel.show();
    await flush();
    h.panel._handleResult({ ok: false, reason: ADVISOR_REASONS.BLANK, status: 0, data: {} });
    h.panel._ask('在吗');
    await flush();
    setLanguage('en');
    h.panel.refreshLabels();
    expect(h.doc.getElementById('advisor-title').textContent).toBe(STRINGS_EN.advisor_title);
    expect(h.doc.getElementById('advisor-suggestions').querySelectorAll('[data-advisor-prompt]')[0].textContent)
      .toBe(STRINGS_EN.advisor_suggestion_build);
    expect(bubbles(h.doc)[0].textContent).toBe(STRINGS_EN.advisor_error_blank);
    expect(bubbles(h.doc).at(-1).textContent).toBe('先堆火伤。');
    h.cleanup();
  });

  it('DOM 长度封顶：连问 30 次，气泡不超过 historyMaxMessages', () => {
    const h = panelHarness();
    for (let i = 0; i < 30; i++) h.panel._appendMessage('user', `第 ${i} 问`);
    expect(bubbles(h.doc).length).toBe(ADVISOR_LIMITS.historyMaxMessages);
    expect(lastBubble(h.doc).textContent).toBe('第 29 问');
    h.cleanup();
  });

  it('dispose：abort 在飞请求、退模态层；之后点 FAB 不再发问', async () => {
    const h = panelHarness();
    h.panel.show();
    await flush();
    h.panel._ask('在吗');
    await flush();
    const fab = h.doc.getElementById('advisor-fab');
    h.panel.dispose();
    expect(h.asked[0].signal.aborted).toBe(true);
    expect(h.stack.closed).toEqual(['advisor']);
    const before = h.asked.length;
    fab.dispatch('click');
    await flush();
    expect(h.asked.length).toBe(before);
    delete globalThis.document;
    delete globalThis.localStorage;
  });
});

/* ------------------------------------------------------------------ *
 * ③ 静态门禁
 * ------------------------------------------------------------------ */

describe('③ 顾问不碰不安全出口', () => {
  it('面板源码没有 innerHTML / 自建计时器 / 运行期拼键', () => {
    // 注释里会**提到**这些名字（"全文件没有一处把回答拼进 innerHTML"就是在讲禁令），
    // 不先去注释等于拿禁令本身当违规证据。
    const 去注释 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const src = 去注释(读('src/ui/AdvisorPanel.js'));
    for (const bad of ['innerHTML', 'setTimeout', 'setInterval', 'requestAnimationFrame']) {
      expect(src, `顾问面板不该出现 ${bad}`).not.toContain(bad);
    }
    expect(src).not.toMatch(/t\(`/);
    expect(src).toContain('createElement');
    expect(src).toContain('textContent');
    expect(src).toContain('AbortController');
  });

  it('在线服务顾问段不自建计时器：超时只由 AbortSignal.timeout 管', () => {
    const src = 读('src/online/OnlineServices.js');
    const seg = src.slice(src.indexOf('function requestSignal'), src.indexOf('export class OnlineServices'));
    expect(seg).toContain('AbortSignal.timeout');
    expect(seg).not.toContain('setTimeout');
    for (const path of ["'/api/ai/chat'", "'/api/ai/health'", "'/api/ai/echo-hint'"]) {
      expect(src).toContain(path);
    }
  });

  it('密钥不进前端：三处客户端源码零 key / Authorization / Bearer', () => {
    const src = 读('src/online/OnlineServices.js') + 读('src/ui/AdvisorPanel.js') + 读('src/content/advisor.js');
    expect(src).not.toMatch(/LLM_API_KEY|Authorization|Bearer|sk-/);
  });

  it('三枚 _fmt 在两张表里都带占位符（换了语言也不许把数字吞掉）', () => {
    for (const key of ['advisor_error_http_fmt', 'advisor_meta_fmt', 'advisor_char_count_fmt']) {
      expect(STRINGS_ZH[key]).toContain('${');
      expect(STRINGS_EN[key]).toContain('${');
    }
  });
});

/* ------------------------------------------------------------------ *
 * ④ 五处接线
 * ------------------------------------------------------------------ */

describe('④ 壳页 / 层表 / Game / 换语言 / 样式指同一件事', () => {
  const html = 读('index.html');
  const game = 读('src/core/Game.js');
  const settings = 读('src/core/SettingsManager.js');

  it('壳页：FAB 常驻、面板默认收起、role=dialog / log、每格 data-i18n 都在表里', () => {
    expect(html).toContain('id="advisor-fab"');
    expect(html).toContain('id="advisor-panel" class="advisor-panel hidden"');
    expect(html).toContain('aria-controls="advisor-panel"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('role="log"');
    const block = html.slice(html.indexOf('<!-- W-Y2'), html.indexOf('<script type="module"'));
    const keys = [...block.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const k of keys) {
      expect(ZH_KEYS, `壳页键 ${k} 不在中文表`).toContain(k);
      expect(EN_KEYS, `壳页键 ${k} 不在英文表`).toContain(k);
    }
  });

  it('芯片名册与壳页逐字对齐（不另存一份 question 才不会说谎）', () => {
    const chips = [...html.matchAll(/data-advisor-prompt="([^"]+)"/g)].map((m) => m[1]);
    expect(chips).toEqual(ADVISOR_SUGGESTIONS.map((s) => s.key));
  });

  it('层表：advisor 挡键、吃返回键，但**不认领**焦点宿主（方向键要留给输入框光标）', () => {
    expect(OVERLAY_LAYERS.find((l) => l.layer === 'advisor')).toEqual({
      layer: 'advisor', state: 'advisorOpen', back: true, blocks: true,
    });
    expect(game).toContain('isNavCode(code)');
  });

  it('Game：F7 热键、runHotkey / runEscape / overlayState / canPlay / teardown 五处齐全', () => {
    expect(UI_HOTKEYS.find((e) => e.action === 'advisor')?.code).toBe('F7');
    expect(UI_HOTKEY_LABELS.advisor).toBe('advisor_fab');
    expect(game).toContain("case 'advisor': return this.advisorPanel.toggle();");
    expect(game).toContain("case 'advisor': return this.advisorPanel.hide();");
    expect(game).toContain('advisorOpen: this.overlayStack.toStateMap().advisorOpen');
    expect(game).toContain('!this.advisorPanel?.open');
    expect(game).toContain("this.advisorPanel = this._adopt('ui/AdvisorPanel', new AdvisorPanel(this));");
  });

  it('换语言会把面板里 JS 现算的那几格重算一遍', () => {
    expect(settings).toContain('game?.advisorPanel?.refreshLabels?.();');
  });

  it('样式有 reduced-motion 收口：动效停掉但不隐藏信息', () => {
    const css = 读('src/style.css');
    const tail = css.slice(css.indexOf('W-Y2 切片1 · 星轨顾问'));
    expect(tail).toContain('@media (prefers-reduced-motion: reduce)');
    expect(tail).toContain('animation: none !important');
    expect(tail).toContain('.advisor-msg');
  });
});
