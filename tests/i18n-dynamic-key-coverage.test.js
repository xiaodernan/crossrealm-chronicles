/**
 * 运行期拼出来的键名 —— 谁拼键谁登记，展开出来的每一枚必须有定义（W-E3 切片27）。
 *
 * 这一片把 B142 / B143 / B144 三条片「限度」里同一句话（运行期拼出来的键名扫不到）
 * 从"记在文档里的盲区"变成"一条被检查的性质"。它同时给出死键账本的第一批判定：
 * `settings_ssao_quality_off|low|medium|high` 四枚不是孤儿，是**运行期接线** —— 删掉它们，
 * 设置面板那一列下拉会变成 `[MISSING: …]`，而字面量尺子一声不出。
 *
 * 三组：① 扫描尺子自己（含两处反向控制）；② 名册与真实拼键处双向对齐 + 域不许是抄本；
 * ③ 展开出来的键两张表都得有（含"多一档假想名册必须报缺"）+ 与死键账本的接缝。
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { SSAO_QUALITY_NAMES, SSAO_QUALITY_PRESETS } from '../src/engine/ssaoSettings.js';
import { 扫描拼键模板, 前缀Of, 拼键名册, 动态接线键集 } from './helpers/i18nDynamicKeys.js';

const SEP = process.platform === 'win32' ? '\\' : '/';

/** 造一间假仓跑扫描器 —— 真仓一个字都不动，跑完拆掉 */
const 假仓 = (文件们) => {
  const 根 = mkdtempSync(join(tmpdir(), 'i18n-dyn-'));
  for (const [相对, 源] of 文件们) {
    const 绝对 = join(根, ...相对.split('/'));
    mkdirSync(绝对.slice(0, 绝对.lastIndexOf(SEP)), { recursive: true });
    writeFileSync(绝对, 源);
  }
  return 根;
};

describe('① 拼键扫描尺子自己不是摆设', () => {
  it('全仓的 `t(`…${…}`)` 只有登记过的那一处（分母自证）', () => {
    const 扫到 = 扫描拼键模板();
    expect(扫到.map((条) => `${条.文件} t(\`${条.模板}\`)`).sort(),
      '拼键的位置变了 —— 名册 `拼键名册` 要跟着动：这一族的键名从来不是字面量写出来的').toEqual([
      'src/ui/SettingsPanel.js t(`settings_ssao_quality_${name}`)',
    ]);
  });

  it('反向控制一：造一处新的拼键，扫描必须量到（否则它对真的那一处也是摆设）', () => {
    const 根 = 假仓([['src/ui/Fake.js', 'const 档 = 2;\nexport const 字 = t(`settings_fake_quality_${档}`);\n']]);
    try {
      const 扫到 = 扫描拼键模板(根);
      expect(扫到.length, '对新造的拼键毫无反应 —— 尺子是摆设').toBe(1);
      expect(扫到[0].文件).toBe('src/ui/Fake.js');
      expect(前缀Of(扫到[0].模板)).toBe('settings_fake_quality_');
    } finally {
      rmSync(根, { recursive: true, force: true });
    }
  });

  it('反向控制二：字面量写的 `t(\'…\')` 与不带插值的 `t(`…`)` 都不许被当成拼键', () => {
    const 根 = 假仓([
      ['src/A.js', "import { t } from './i18n.js';\nexport const a = t('pause_resume');\n"],
      ['src/B.js', "const b = t(`settings_master_volume`);\nexport default b;\n"],
    ]);
    try {
      expect(扫描拼键模板(根), '字面量键被算成拼键 ⇒ 死键账本会把"已接线"错认成"盲区"').toEqual([]);
    } finally {
      rmSync(根, { recursive: true, force: true });
    }
  });
});

describe('② 拼键名册与真实拼键处双向对齐', () => {
  const 扫到 = 扫描拼键模板();

  it('每一处真在拼的键都登记了（前缀没登记 ⇒ 展开出来的键名没人核过定义）', () => {
    const 没登记 = 扫到.filter((条) => !拼键名册.some((册) => 册.前缀 === 前缀Of(条.模板)))
      .map((条) => `${条.文件}:${条.行号} t(\`${条.模板}\`)`);
    expect(没登记, `这些拼键没进名册`).toEqual([]);
  });

  it('反向：登记了却没人这么拼 ⇒ 名册里那一条是装饰；指名写错也算', () => {
    const 真前缀 = new Set(扫到.map((条) => 前缀Of(条.模板)));
    expect(拼键名册.filter((册) => !真前缀.has(册.前缀)).map((册) => 册.前缀),
      '名册里这几条已经没有对应的拼键处了 —— 它们替那些键挡"孤儿"的凭据就没了').toEqual([]);
    for (const 册 of 拼键名册) {
      const 处 = 扫到.find((条) => 前缀Of(条.模板) === 册.前缀);
      expect(处.文件, `名册写着「${册.拼键处文件}」，实际这么拼的却是 ${处.文件} —— 指名失效`).toBe(册.拼键处文件);
    }
  });

  it('代入域不许是抄本：名册那份 == 运行期名册 == 参数表的键', () => {
    for (const 册 of 拼键名册) {
      expect(册.域.join(','), `前缀「${册.前缀}」的域是手抄的 —— 插一行参数表面板选项跟着动，名册不会`)
        .toBe(SSAO_QUALITY_NAMES.join(','));
    }
    expect(SSAO_QUALITY_NAMES.join(','), '名册与参数表已经不是同一张表了')
      .toBe(Object.keys(SSAO_QUALITY_PRESETS).join(','));
  });
});

describe('③ 拼键展开出来的键必须有定义', () => {
  const 展开 = [...动态接线键集()].sort();

  it('两张表逐枚都有这一格（缺一枚 = 面板那一档显示 [MISSING: …]）', () => {
    expect(展开, '名册展开出来的键集不对').toEqual([
      'settings_ssao_quality_high',
      'settings_ssao_quality_low',
      'settings_ssao_quality_medium',
      'settings_ssao_quality_off',
    ]);
    for (const 键 of 展开) {
      expect(ZH_KEYS, `中文表没有「${键}」—— SSAO 下拉那一档会显示 [MISSING: ${键}]`).toContain(键);
      expect(EN_KEYS, `英文表没有「${键}」—— 切英文时那一档显示 [MISSING: ${键}]`).toContain(键);
      expect(STRINGS_ZH[键].length, `「${键}」在中文表里是空串`).toBeGreaterThan(0);
      expect(STRINGS_EN[键].length, `「${键}」在英文表里是空串`).toBeGreaterThan(0);
    }
  });

  it('反向控制：多一档假想名册，必须正好报缺一枚（上面那条腿不是恒绿）', () => {
    // new Set：将来参数表真要加出第五档，这一条控制也不该因为"ultra 重复"而虚报
    const 假想 = [...new Set([...SSAO_QUALITY_NAMES, 'ultra'])].map((名) => `settings_ssao_quality_${名}`);
    expect(假想.filter((键) => !(键 in STRINGS_ZH && 键 in STRINGS_EN)),
      '加了一档没配文案的假想档却什么都没缺 —— 展开闭合那条腿是摆设').toEqual(['settings_ssao_quality_ultra']);
  });

  it('与死键账本的接缝：这四枚整名在读者范围里确实零出现，所以只能靠这一片接线', () => {
    const walk = (dir) => readdirSync(dir).flatMap((名) => {
      const p = join(dir, 名);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
    const 文本们 = [
      ...walk(join(process.cwd(), 'src')).filter((f) => !f.endsWith('.map') && !/strings\.(zh|en)\.js$/.test(f)),
      join(process.cwd(), 'index.html'),
    ].map((f) => readFileSync(f, 'utf8'));
    for (const 键 of 展开) {
      expect(文本们.filter((s) => s.includes(键)).length,
        `「${键}」已经有人整名写过了 —— 它不再是盲区，该挪回字面量那一族记账`).toBe(0);
    }
  });
});
