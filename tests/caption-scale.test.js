/**
 * 字幕字号门禁（W-D6 切片67）—— 开关之后的第二格：看得见还不够，得看得清。
 *
 * ## 这一片补的是什么
 * `settings_captions` 只决定"要不要写"，字号却一直是样式里的两个常量。视力较弱、
 * 坐得远、在电视上玩的玩家，开了字幕仍然读不清；嫌挡画面的玩家也没有"小一点"的出口。
 *
 * ## 形状
 * 三档 `small / medium / large`（0.85 / 1 / 1.3），出厂 `medium` 逐像素不变。
 * 倍率只改容器上的 CSS 变量 `--caption-scale`，正文 0.85rem 与关键线索 0.95rem
 * 各自乘它 —— 两档的层次不能被抹平。写入口只有 `SettingsManager.applyToGame`。
 *
 * ## 用例分五层
 * 1. 名册与出厂；2. 脏值回落；3. CSS 真乘变量（不是写死三组 fontSize）；
 * 4. Captions 真写变量、脏档回落；5. 设置层 / 面板 / 双表接线与写入口唯一。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CAPTION_SCALES, CAPTION_SCALE_IDS, DEFAULT_CAPTION_SCALE,
  normalizeCaptionScale, captionScaleOf, captionScaleOptions,
} from '../src/engine/captionScale.js';
import { Captions } from '../src/ui/Captions.js';
import { SettingsManager } from '../src/core/SettingsManager.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

const 读 = (p) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

let real;
beforeEach(() => {
  const store = new Map();
  real = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
});
afterEach(() => { globalThis.localStorage = real; delete globalThis.document; });

/** 够 Captions 用的假 DOM：这一片额外需要 style.setProperty（字号变量写在容器上） */
const 假DOM = () => {
  const mk = (tag) => ({
    tagName: tag, className: '', textContent: '', children: [], _attrs: {}, parentNode: null,
    style: {
      _props: {},
      setProperty(k, v) { this._props[k] = v; },
      getPropertyValue(k) { return this._props[k] ?? ''; },
    },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    remove() {
      const p = this.parentNode;
      if (!p) return;
      const i = p.children.indexOf(this);
      if (i >= 0) p.children.splice(i, 1);
      this.parentNode = null;
    },
  });
  const body = mk('body');
  return { document: { createElement: mk, body, getElementById: () => null }, body };
};

const 造字幕 = (settings) => {
  const { document, body } = 假DOM();
  globalThis.document = document;
  const c = new Captions({ settings });
  return { c, body };
};

describe('字幕字号（W-D6 切片67）', () => {
  it('名册与出厂：小 / 中 / 大，出厂 medium = 1 逐像素不变', () => {
    expect([...CAPTION_SCALE_IDS]).toEqual(['small', 'medium', 'large']);
    expect(CAPTION_SCALES).toEqual({ small: 0.85, medium: 1, large: 1.3 });
    expect(DEFAULT_CAPTION_SCALE).toBe('medium');
    expect(captionScaleOf('medium')).toBe(1);
    expect(captionScaleOf('large')).toBe(1.3);
    expect(Object.isFrozen(CAPTION_SCALES)).toBe(true);
  });

  it('脏值回落出厂、不抛；认不出的档按 1 算', () => {
    for (const bad of [null, undefined, '', 'MEDIUM', 1, 1.3, {}, [], true]) {
      expect(normalizeCaptionScale(bad), `${JSON.stringify(bad)} 没回落出厂`).toBe('medium');
      expect(captionScaleOf(bad), `${JSON.stringify(bad)} 没按出厂倍率算`).toBe(1);
    }
    expect(captionScaleOptions()).toEqual([...CAPTION_SCALE_IDS]);
  });

  it('CSS 真乘变量：两档基准各自乘 --caption-scale，不是写死三组字号', () => {
    const css = 读('src/style.css');
    expect(css, '正文没有乘字号变量').toContain('font-size: calc(0.85rem * var(--caption-scale, 1));');
    expect(css, '关键线索没有乘字号变量').toContain('font-size: calc(0.95rem * var(--caption-scale, 1));');
    // 容器上要有出厂兜底：在没有 setScale 的极简环境里也按 1 画
    expect(css).toMatch(/#captions\s*\{[\s\S]*?--caption-scale:\s*1\s*;/);
    // 反面证据：两条规则里不许再有裸露的旧字号常量（否则大档只改到一半）
    const 块 = (名) => (css.match(new RegExp('\\.' + 名 + '\\s*\\{[^}]*\\}')) ?? [''])[0];
    const 正文 = 块('caption');
    const 关键 = 块('caption-critical');
    expect(正文.length, '.caption 规则没找到').toBeGreaterThan(0);
    expect(关键.length, '.caption-critical 规则没找到').toBeGreaterThan(0);
    expect(正文, '正文里还有写死的旧字号').not.toMatch(/font-size:\s*0\.85rem;/);
    expect(关键, '关键线索里还有写死的旧字号').not.toMatch(/font-size:\s*0\.95rem;/);
  });

  it('Captions：构造按设置落地、setScale 真写变量、脏档回落 medium', () => {
    const settings = { get: (k) => (k === 'captionScale' ? 'large' : undefined) };
    const { c, body } = 造字幕(settings);
    expect(c.scale).toBe('large');
    expect(c.el.style.getPropertyValue('--caption-scale')).toBe('1.3');
    expect(body.children).toContain(c.el);

    expect(c.setScale('small')).toBe('small');
    expect(c.el.style.getPropertyValue('--caption-scale')).toBe('0.85');
    expect(c.setScale('nope')).toBe('medium');
    expect(c.el.style.getPropertyValue('--caption-scale')).toBe('1');

    // 新画的行不各自写字号 —— 它们继承容器的变量（逐行写会在切档时漏掉旧行）
    c.setEnabled(true);
    const line = c.show('pickup');
    expect(line.el.style._props).toEqual({});
  });

  it('设置层与面板：DEFAULTS / applyToGame 落地 / 选项现推 / 四条键在双表', () => {
    expect(new SettingsManager().get('captionScale')).toBe('medium');

    const s = new SettingsManager();
    const { c } = 造字幕(s);
    const game = { settings: s, captions: c };
    s.applyToGame(game);
    expect(c.scale, 'applyToGame 没有把出厂档落地').toBe('medium');
    s.set('captionScale', 'large');
    s.applyToGame(game);
    expect(c.scale).toBe('large');
    expect(c.el.style.getPropertyValue('--caption-scale')).toBe('1.3');
    s.set('captionScale', 'nope');
    s.applyToGame(game);
    expect(c.scale, '存储里的脏档没有被 Captions 清洗').toBe('medium');

    // 写入口唯一：全仓 `captions?.setScale(` 只许出现在 SettingsManager
    const 写点 = [];
    for (const f of walk(join(process.cwd(), 'src')).filter((p) => p.endsWith('.js'))) {
      const 相对 = f.slice(process.cwd().length + 1).replace(/\\/g, '/');
      读(相对).split('\n').forEach((行, i) => {
        if (行.includes('captions?.setScale(')) 写点.push(`${相对}:${i + 1}`);
      });
    }
    expect(写点.map((x) => x.split(':')[0]), '面板绕过了 applyToGame 直接改字号').toEqual(['src/core/SettingsManager.js']);

    const 壳 = 读('index.html');
    expect(壳, '设置面板没有字幕大小这一行').toContain('id="set-caption-size"');
    expect(壳).toContain('data-i18n="settings_caption_size"');
    const 面板 = 读('src/ui/SettingsPanel.js');
    expect(面板, '面板没有从名册取选项').toContain('captionScaleOptions()');
    expect(面板, '文案键没有在 t() 现场拼').toContain('t(`settings_caption_${id}`)');
    expect(面板, '刷新时没有回显清洗过的值').toContain("set('set-caption-size', normalizeCaptionScale(d.captionScale))");

    const 文案 = CAPTION_SCALE_IDS.map((id) => `settings_caption_${id}`);
    expect(new Set(文案).size).toBe(文案.length);
    for (const [名, 表] of [['中文', STRINGS_ZH], ['英文', STRINGS_EN]]) {
      expect(表.settings_caption_size, `${名}表缺 settings_caption_size`).toBeTruthy();
      for (const key of 文案) expect(表[key], `${名}表缺 ${key}`).toBeTruthy();
    }
    expect(STRINGS_ZH.settings_caption_small).not.toBe(STRINGS_ZH.settings_caption_large);
    expect(STRINGS_EN.settings_caption_small).not.toBe(STRINGS_EN.settings_caption_large);
  });
});
