/**
 * HUD 状态条配色的门禁（W-D6 切片4；切片6 扩到五条）。
 *
 * ## 这一片解决什么
 * 切片3 把色盲档接上了掉落物的档位色，但玩家看得最多的三条颜色 —— 血条（红）、
 * 精力条（金）、法力条（蓝紫）—— 一直在 `style.css` 里写死，而"红 vs 金"正是
 * 红绿色盲最难分的一对。开关切了，最该变的地方没变。
 *
 * ## 用例分七层
 * ① **映射只有一份**：`BAR_SEMANTIC` 五条、键是 CSS 类名、值是语义色板里有的语义；
 * ② **出厂档零视觉变更**：默认档读出来的亮端与改前 `style.css` 里那一枚逐字相同，
 *     且 CSS 里 `var()` 的**回落值**就是那一枚（没有 JS 的那一帧也与改前相同）；
 * ③ **四个档真的不一样**：每条条在四个档下四枚不同的亮端（否则那个档位对这条条是空转的）；
 * ④ **暗端不随档位动**：色盲破坏的是色相分辨，明度阶梯要留着；
 * ⑤ **写状态条变量的地方只有一个**：扫 `src/`，写 `--bar-*` 的只有 `barTheme.js`；
 * ⑥ **接线**：`HUD` 构造时就落地、`SettingsManager.applyToGame` 在 `setColorVision`
 *     之后调 `refreshBarColors`（顺序反了会涂上一档的颜色）；
 * ⑦ **我的血 vs 它的血**（切片6 新钉的一条）：`boss-hp` 与 `hp` 在任何一档下都不同色。
 *     切片4 曾以"分居屏幕两端"为由把这两条留在表外 —— 那条理由只对默认档成立。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COLOR_MODES, semanticColor } from '../src/content/semanticColors.js';
import {
  BAR_SEMANTIC, BAR_SHADE, BAR_BRIGHT_DEFAULT, barBright, barThemeVars,
} from '../src/ui/barTheme.js';
import { resetColorVision, setColorVision } from '../src/game/ColorVision.js';

const ROOT = process.cwd();

afterEach(() => { resetColorVision(); });

/* ------------------------------------------------------------------ *
 * ① 映射只有一份
 * ------------------------------------------------------------------ */

describe('① 映射：五条状态条、五个语义，键是 CSS 类名', () => {
  it('正好五条，且语义都在色板里', () => {
    expect(Object.keys(BAR_SEMANTIC).sort()).toEqual(['boss-hp', 'hp', 'mana', 'po', 'st']);
    for (const semantic of Object.values(BAR_SEMANTIC)) {
      expect(() => semanticColor(semantic)).not.toThrow();
    }
  });

  it('五个语义互不重复（两条条共用一个语义就会在换档时一起变，玩家分不清哪条是哪条）', () => {
    expect(new Set(Object.values(BAR_SEMANTIC)).size).toBe(Object.keys(BAR_SEMANTIC).length);
  });

  it('每条条都有一条暗端（渐变是两停，缺一半那一端就掉回透明）', () => {
    for (const bar of Object.keys(BAR_SEMANTIC)) {
      expect(BAR_SHADE[bar], `${bar} 没有暗端`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('认不出的条名当场抛（静默 undefined 会让渐变少一停）', () => {
    // `roll-cd` 是 HUD 里真实存在的另一条 `.bar-fill`，它**故意**不在表里：
    // 翻滚冷却是叠加在精力条上的一层罩子，不是一条独立的状态条。
    expect(() => barBright('roll-cd')).toThrow(/未知的状态条/);
    expect(() => barBright('boss-name')).toThrow(/未知的状态条/);
  });
});

/* ------------------------------------------------------------------ *
 * ② 出厂档零视觉变更
 * ------------------------------------------------------------------ */

describe('② 出厂档零视觉变更：默认档就是改前 CSS 里那一枚', () => {
  it('五条条的默认亮端与改前在役值逐字相同', () => {
    expect(BAR_BRIGHT_DEFAULT).toEqual({
      hp: '#cc4444', st: '#c9a962', mana: '#8866cc', 'boss-hp': '#ff3333', po: '#8888ff',
    });
  });

  it('CSS 里 var() 的回落值与改前那一枚逐字相同（没有 JS 的那一帧也与改前相同）', () => {
    const css = readFileSync(join(ROOT, 'src', 'style.css'), 'utf8');
    for (const [bar, want] of Object.entries(BAR_BRIGHT_DEFAULT)) {
      expect(css, `${bar} 的回落值没了`).toContain(`var(--bar-${bar}, ${want})`);
    }
    for (const [bar, want] of Object.entries(BAR_SHADE)) {
      expect(css, `${bar} 的暗端回落值没了`).toContain(`var(--bar-${bar}-shade, ${want})`);
    }
  });

  it('五条条的 CSS 规则都改成读变量了（漏一条那一档就永远是旧色）', () => {
    const css = readFileSync(join(ROOT, 'src', 'style.css'), 'utf8');
    for (const bar of Object.keys(BAR_SEMANTIC)) {
      const re = new RegExp(
        `\\.bar-fill\\.${bar}\\s*\\{[^}]*linear-gradient\\(90deg,\\s*var\\(--bar-${bar}-shade[^)]*\\),\\s*var\\(--bar-${bar}[^)]*\\)\\)`,
      );
      expect(re.test(css), `.bar-fill.${bar} 还在写死颜色`).toBe(true);
    }
  });

  it('barThemeVars 一次给出亮端与暗端，十个变量一个不少', () => {
    expect(barThemeVars('default')).toEqual({
      '--bar-hp': '#cc4444', '--bar-hp-shade': '#8b2020',
      '--bar-st': '#c9a962', '--bar-st-shade': '#8b6914',
      '--bar-mana': '#8866cc', '--bar-mana-shade': '#224488',
      '--bar-boss-hp': '#ff3333', '--bar-boss-hp-shade': '#661111',
      '--bar-po': '#8888ff', '--bar-po-shade': '#444488',
    });
  });
});

/* ------------------------------------------------------------------ *
 * ③ 四个档真的不一样 / ④ 暗端不动
 * ------------------------------------------------------------------ */

describe('③④ 换档真的换色，且只换色相', () => {
  it('每条条在四个档下四枚互不相同的亮端', () => {
    for (const bar of Object.keys(BAR_SEMANTIC)) {
      const seen = new Set(COLOR_MODES.map((m) => barBright(bar, m)));
      expect(seen.size, `${bar} 在四个档下没有四枚不同的亮端 —— 有档位对这条条是空转的`)
        .toBe(COLOR_MODES.length);
    }
  });

  it('换档后每条条的亮端都等于色板上那一格', () => {
    for (const [bar, semantic] of Object.entries(BAR_SEMANTIC)) {
      for (const mode of COLOR_MODES) {
        expect(barBright(bar, mode)).toBe(`#${semanticColor(semantic, mode).toString(16).padStart(6, '0')}`);
      }
    }
  });

  it('暗端四个档下逐字不变（明度阶梯要留着，色盲破坏的是色相）', () => {
    for (const mode of COLOR_MODES) {
      for (const [bar, want] of Object.entries(BAR_SHADE)) {
        expect(barThemeVars(mode)[`--bar-${bar}-shade`], `${bar}@${mode} 的暗端动了`).toBe(want);
      }
    }
  });

  it('血条与精力条在红绿色盲档下不再同色（这一片要修的就是那一对）', () => {
    expect(barBright('hp', 'default')).not.toBe(barBright('st', 'default'));
    for (const mode of ['deuteranopia', 'protanopia']) {
      expect(barBright('hp', mode) === barBright('st', mode), `${mode} 档下血条与精力条仍同色`).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ *
 * ⑦ 我的血 vs 它的血（切片6）
 * ------------------------------------------------------------------ */

describe('⑦ Boss 血条与玩家血条：任何一档下都不许撞色', () => {
  it('四条档下两枚亮端都不同', () => {
    for (const mode of COLOR_MODES) {
      expect(barBright('boss-hp', mode) === barBright('hp', mode),
        `${mode} 档下 Boss 血与玩家血同色 —— 那时只剩位置可分`).toBe(false);
    }
  });

  it('语义层也钉着这一对（DISTINCT_IN_ANY_MODE 里有 threat）', () => {
    // 门禁两层：bar-theme 这一层管"条"，semantic-colors 那一层管"语义"。
    // 两层都红才算真出事，只红一层说明有一条路绕过了另一条。
    for (const mode of COLOR_MODES) {
      expect(semanticColor('threat', mode)).not.toBe(semanticColor('danger', mode));
    }
  });

  it('架势条在蓝黄色盲档下也不再是原来那枚（tritanopia 最吃亏的一格）', () => {
    expect(barBright('po', 'default')).toBe('#8888ff');
    expect(barBright('po', 'tritanopia')).not.toBe('#8888ff');
  });
});

/* ------------------------------------------------------------------ *
 * ⑤ 写状态条变量的地方只有一个
 * ------------------------------------------------------------------ */

describe('⑤ 写状态条颜色的地方只有 barTheme.js', () => {
  const SRC = join(ROOT, 'src');
  const walk = (dir, out = []) => {
    for (const n of readdirSync(dir)) {
      const full = join(dir, n);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (n.endsWith('.js')) out.push(full);
    }
    return out;
  };
  const CODE = walk(SRC).filter((f) => !f.replace(/\\/g, '/').includes('/animation/'));
  const rel = (f) => f.slice(SRC.length + 1).replaceAll('\\', '/');

  it('提得到 `--bar-` 这个名字的只有 barTheme.js 与 style.css（写者与读者各一处）', () => {
    // 写者把变量名拼出来（`--bar-${bar}`），所以按字面量数不到那一行；
    // 改数"谁提得到这一族名字"：多一个文件就是多一条落地路径或第二份回落值。
    const 提到 = [...new Set(CODE.flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      return text.includes('--bar-') ? [rel(f)] : [];
    }))].sort();
    expect(提到).toEqual(['ui/barTheme.js']);
    const css = readFileSync(join(ROOT, 'src', 'style.css'), 'utf8');
    expect(css).toContain('--bar-');
  });

  it('`barBright(` / `barThemeVars(` 的读者只有 barTheme.js 自己（HUD 只转发）', () => {
    const 读者 = CODE.flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      return text.split(/\r?\n/).flatMap((line, i) => (
        /barBright\(|barThemeVars\(/.test(line) ? [rel(f)] : []
      ));
    });
    expect([...new Set(读者)].sort()).toEqual(['ui/barTheme.js']);
  });
});

/* ------------------------------------------------------------------ *
 * ⑥ 接线
 * ------------------------------------------------------------------ */

describe('⑥ 接线：开机落地一次，换档再落地一次', () => {
  it('HUD 构造时就落地（开机就落到存档里那一档，不等玩家第一次受伤）', () => {
    const hud = readFileSync(join(ROOT, 'src', 'ui', 'HUD.js'), 'utf8');
    expect(hud).toMatch(/this\.refreshBarColors\(\);/);
    expect(hud).toMatch(/applyBarTheme/);
  });

  it('applyToGame 在 setColorVision 之后调 refreshBarColors（顺序反了会涂上一档的颜色）', () => {
    const mgr = readFileSync(join(ROOT, 'src', 'core', 'SettingsManager.js'), 'utf8');
    const 落档 = mgr.indexOf("setColorVision(this.get('colorVision'));");
    const 落色 = mgr.indexOf('refreshBarColors');
    expect(落档, 'applyToGame 里没有 setColorVision').toBeGreaterThan(-1);
    expect(落色, 'applyToGame 里没有 refreshBarColors').toBeGreaterThan(落档);
  });

  it('换档改变 applyBarTheme 的落点：四个档写出四套不同的变量', () => {
    const 亮端 = COLOR_MODES.map((m) => { setColorVision(m); return barThemeVars()['--bar-hp']; });
    expect(new Set(亮端).size).toBe(COLOR_MODES.length);
  });

  it('Boss 血条的变量也随档位变（它不是写死的那一枚了）', () => {
    const 亮端 = COLOR_MODES.map((m) => { setColorVision(m); return barThemeVars()['--bar-boss-hp']; });
    expect(new Set(亮端).size).toBe(COLOR_MODES.length);
  });
});