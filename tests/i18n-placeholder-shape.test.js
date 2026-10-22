/**
 * 文案里的**占位符形状**（W-E3 切片19）。
 *
 * ## 这一片补的是什么
 *
 * 插值与键位提示是**两套形状**，而它们长得几乎一样：
 *
 * | 形状 | 谁展开 | 不认识它时 |
 * |---|---|---|
 * | `${name}` | `t(key, params)`（`engine/i18n.js` 的 `interpolate`） | 静默替换成空串 |
 * | `{name}` | `keyText(text)`（`content/keyHints.js`） | **当场抛**（"不是任何已登记的动作"） |
 *
 * ⇒ 于是把插值写成 `{name}` 的后果是：**玩家看到字面的 `{visited}`**，
 * 而**全套测试一路绿灯**（键在两表里、占位符两语一致、门禁都过）。
 * 这不是设想 —— 本片动手前实测到 **8 处**：六处是既有的（`guide_step_dungeon` 等
 * 引导面板的行），两处是上一两片新加的（`quest_progress_gear` / `quest_progress_choice`）。
 *
 * ## 口径
 *
 * **文案里每一个 `{name}` 都必须是已登记的键位动作**（`KEY_ACTIONS` / `PAD_ACTIONS` /
 * `UI_ACTIONS` 三张名单的并集）—— 那是 `keyText` 唯一认得的形状。
 * 不是键位动作的那个 `{name}` ⇒ 它一定是插值 ⇒ 它的形状就该是 `${name}`。
 *
 * **注释不算**（注释里说的 `{action}` 是在**描述**键位提示的形状，不是文案本身）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KEY_ACTIONS, PAD_ACTIONS } from '../src/content/keybinds.js';
import { UI_ACTIONS } from '../src/content/hotkeys.js';
import { STRINGS_ZH, STRINGS_EN } from '../src/content/strings.zh.js';
import { t } from '../src/engine/i18n.js';

/** 已登记的键位动作（`keyText` 唯一认得的那一族） */
const 键位动作 = new Set([...KEY_ACTIONS, ...PAD_ACTIONS, ...UI_ACTIONS]);

/** 文案源文件（要连注释一起看 ⇒ 直接读源码，不是读导出的表） */
const 源码 = (lang) => readFileSync(join(process.cwd(), `src/content/strings.${lang}.js`), 'utf8');

/** 去掉注释行（注释里说的 `{action}` 是在描述形状，不是文案本身） */
const 去注释 = (s) => s
  .split(/\r?\n/)
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n');

/** 找出一行里**不是**键位动作的 `{name}`（`${name}` 那种不算 —— 它前头有个 `$`） */
const 非键位占位 = (行) => {
  const 毛病 = [];
  const re = /\{([A-Za-z_]\w*)\}/g;
  let m = re.exec(行);
  while (m !== null) {
    const 前一个字符 = m.index > 0 ? 行[m.index - 1] : '';
    if (前一个字符 !== '$' && !键位动作.has(m[1])) 毛病.push(m[1]);
    m = re.exec(行);
  }
  return 毛病;
};

describe('① 文案里每一个 `{name}` 都必须是已登记的键位动作', () => {
  for (const lang of ['zh', 'en']) {
    it(lang + ' 表：没有把插值写成单花括号形状的', () => {
      const 毛病 = [];
      for (const 行 of 去注释(源码(lang)).split(/\r?\n/)) {
        const names = 非键位占位(行);
        if (!names.length) continue;
        const 键 = 行.match(/^\s*([A-Za-z_]\w*):/)?.[1] ?? '?';
        毛病.push(`${键}（${names.join(', ')}）`);
      }
      expect(毛病, '这些键里的 `{name}` 不是键位动作 ⇒ 它们是插值 ⇒ 形状该是 `${name}`').toEqual([]);
    });
  }
});

describe('② 尺子自证：真的扫到了东西', () => {
  it('已登记的键位动作不被当成毛病（控制组）', () => {
    const 行 = "  combat_lock_hint: '（{lockOn} 切换）',";
    expect(非键位占位(行)).toEqual([]);
  });

  it('不认识的 `{name}` 被当成毛病（反证：扫到 0 就一路绿灯）', () => {
    const 行 = "  whatever: '已推进 {n} 个任务',";
    expect(非键位占位(行)).toEqual(['n']);
  });

  it('`${name}` 形状不会被误判（插值是合法的）', () => {
    const 行 = "  whatever: '已推进 ${n} 个任务',";
    expect(非键位占位(行)).toEqual([]);
  });

  it('键位动作名单不是空的（否则上面三条都是空转）', () => {
    expect(键位动作.size).toBeGreaterThan(20);
  });
});

describe('③ 插值真的会被替换（运行时那一份）', () => {
  it('`${name}` 形状：传了参就替换，没传就留空（不留字面的 `${`）', () => {
    const 键 = 'quest_progress_choice';
    const 原文 = STRINGS_ZH[键] ?? STRINGS_EN[键];
    expect(原文, `两表里没有 ${键}`).toBeTruthy();
    expect(原文).toContain('${');
    const 展开 = t(键, { choice_done: '已抉择' });
    expect(展开, '占位符没被替换 ⇒ 玩家看到的是字面的 ${...}').not.toContain('${');
    expect(展开).toContain('已抉择');
  });

  it('引导面板那几行（既有的同类错）现在真的会替换', () => {
    for (const 键 of ['guide_step_dungeon', 'guide_hint_waypoint', 'guide_toast_sync_progress']) {
      const 原文 = STRINGS_ZH[键] ?? STRINGS_EN[键];
      expect(原文, `两表里没有 ${键}`).toBeTruthy();
      expect(原文, `${键} 里没有 \${...} 形状的占位符`).toContain('${');
    }
  });
});
