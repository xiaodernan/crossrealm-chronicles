/**
 * 运行期拼出来的 i18n 键名 —— 共享扫描器与代入域名册（W-E3 切片27）。
 *
 * ## 为什么要有这一份
 *
 * 「死键只减不增」那把尺子是**字面量扫描**：一枚键名在任何 src 文件里出现过一次就算"有人读"。
 * 而面板的下拉选项是 `t(`settings_ssao_quality_${name}`)` 拼出来的 —— 键名从来没整局地写过，
 * 于是这种键在字面量尺子下**永远是死的**。B142 / B143 / B144 三条片的「限度」都记了同一句
 * "运行期拼出来的键名仍然扫不到"，记了三次没人修。这里把它变成一个**被检查的性质**：
 * 谁拼键，就得登记前缀与代入域，域还得从**出处**现推；展开出来的每一枚键必须两张表都有定义。
 *
 * ## 为什么域要登记而不是自动推
 *
 * 代入域是 `SSAO_QUALITY_NAMES` 那种**运行期的值**，从源码文本推不出来（推得出就等于重新实现一遍
 * 模块系统）。所以这张名册是"人写的账"，而 `tests/i18n-dynamic-key-coverage.test.js` 双向核它：
 * 拼键的那一处没登记 ⇒ 红；登记了却没人这么拼 ⇒ 也红。名册自己不空转。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SSAO_QUALITY_NAMES } from '../../src/engine/ssaoSettings.js';

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

/** 定义表自己不许算读者（与 tests/i18n.test.js 同一条口径，B144） */
const 是定义表 = (f) => /strings\.(zh|en)\.js$/.test(f);

/**
 * 全仓的 `t(`…${…}`)` 模板 —— 每处的文件、行号与模板原文。
 * `t` 前面要是词边界（行首或非 `[\w$.]`），免得把 `getX(` 或 `this.t(` 这类调用算进来。
 */
export function 扫描拼键模板(根 = process.cwd()) {
  const 壳页 = join(根, 'index.html');
  const 文件们 = [
    ...walk(join(根, 'src')).filter((f) => f.endsWith('.js') && !f.endsWith('.map') && !是定义表(f)),
    ...(existsSync(壳页) ? [壳页] : []),   // 假仓（反向控制用的临时目录）可以没有壳页
  ];
  const 出 = [];
  for (const f of 文件们) {
    readFileSync(f, 'utf8').split(/\r?\n/).forEach((行, i) => {
      for (const m of 行.matchAll(/(?:^|[^\w$.])t\(`([^`]*\$\{[^`]*)`/g)) {
        出.push({ 文件: f.slice(根.length + 1).replace(/\\/g, '/'), 行号: i + 1, 模板: m[1] });
      }
    });
  }
  return 出;
}

export const 前缀Of = (模板) => 模板.split('${')[0];

/**
 * 已登记的拼键处：前缀 ⇒ 代入域（**从出处现推，不抄第二份**），`拼键处文件` 是"谁这么拼"的指名 ——
 * 门禁拿它跟扫描结果对齐，写成 prose 或写成假地址都会红。
 */
export const 拼键名册 = [
  {
    前缀: 'settings_ssao_quality_',
    域: [...SSAO_QUALITY_NAMES],
    拼键处文件: 'src/ui/SettingsPanel.js',
  },
];

/** 名册展开出来的全部键：这些键在字面量尺子下"没人读"，其实是运行期读的 */
export const 动态接线键集 = () => new Set(拼键名册.flatMap((条) => 条.域.map((名) => `${条.前缀}${名}`)));
