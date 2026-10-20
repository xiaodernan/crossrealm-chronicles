/**
 * 区名对账 —— W-B4 切片3：一个位面的名字只有一个现在时。
 *
 * 病灶（实测，改前）：`content/ZoneIdentity.js` 的 `ZONE_NAMES[MAGIC]` 早已是 '霍格沃兹遗境'，
 * 而 `src/` 的**非注释代码里还有 20 处 '魔法遗境'**（15 个文件）—— 说明书、任务助手的面板行、
 * 过场字幕、Boss 接近播报、营地日志、CG 说明、世界装饰与枢纽指路牌的 label…
 * 玩家于是同时读到两个名字：HUD / 区域提示说"霍格沃兹遗境"，翻开说明书说"魔法遗境"。
 * 而 `LEGACY_NAME_TO_ID` 让这两个名字**同时**解析成 `magic`，所以旧名不会自己消失。
 *
 * 这一片不做"禁止中文文案"（那是 B36 的病，早已收口），只做一件事：
 * **废弃名名单从两张表现成的事实推导**（`keys(LEGACY_NAME_TO_ID) - values(ZONE_NAMES)`），
 * 于是扫描线不抄任何名字，将来再改区名时它自动认识新的废弃名。
 *
 * 豁免只有一处：定义那张映射表自己的文件。豁免配了可达性见证（第 3 条）——
 * 那张表确实有读者（`zoneIdOf` 的旧数据回退分支），所以它不是 hiding place。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ZONE_IDS, ZONE_ORDER, ZONE_NAMES, LEGACY_NAME_TO_ID, zoneIdOf } from '../src/content/ZoneIdentity.js';
import { t } from '../src/engine/i18n.js';

const ROOT = process.cwd();
const srcText = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
}
const SRC_FILES = walk(join(ROOT, 'src')).sort();

/** 定义着那张旧名映射表的文件 —— 它是唯一豁免，豁免的理由由第 3 条当场可查 */
const DEFINING_FILE = 'src/content/ZoneIdentity.js';

/**
 * 废弃区名：曾经是区名（在映射表里）、现在不是（不在 `ZONE_NAMES` 的值里）
 *
 * W-D2 切片16i 之后 `ZONE_NAMES` 的值是**文案键**（`zone_name_*`），
 * 所以"现行名"要取**展开后**的那一份（`t(键)`）—— 否则每个区名都会被当成废弃名，
 * 这条门禁当场变成"全仓都写着废弃名"。
 */
function legacyZoneNames() {
  const current = new Set(Object.values(ZONE_NAMES).map((k) => t(k)));
  return Object.keys(LEGACY_NAME_TO_ID).filter((n) => !current.has(n));
}

/** 行首注释（`//` / `*` / `/*`）不算：它们是史料，不是玩家读到的文案 */
const isProseLine = (line) => {
  const t = line.trimStart();
  return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
};

/** 判据本体：一个文件里哪些**非注释行**写着废弃区名 */
function legacyHitsIn(rel, names) {
  return srcText(rel).split('\n')
    .map((line, i) => ({ n: i + 1, line }))
    .filter(({ line }) => isProseLine(line) && names.some((nm) => line.includes(nm)))
    .map(({ n, line }) => `${rel}:${n}: ${line.trim().slice(0, 60)}`);
}

describe('废弃区名门禁：名单由两张表推导，扫描线一个名字都不抄', () => {
  const names = legacyZoneNames();

  it('控制组：名单是推导出来的，而且非空（今天的实物病例就是它）', () => {
    expect(names.length, '两张表一推导就该至少剩一个废弃名（否则这条门禁在空转）').toBeGreaterThan(0);
    expect(names).toContain('魔法遗境');
    // 反向：登记成现行名的那些，一个都不许进名单（否则门禁会去查今天正在用的字）
    for (const used of Object.values(ZONE_NAMES).map((k) => t(k))) {
      expect(names, `现行区名 "${used}" 不该被当成废弃名`).not.toContain(used);
    }
  });

  it('分母在册：扫的是真源码，不是空集合', () => {
    expect(SRC_FILES.length, '一个 src 文件都没扫到 —— 这条门禁不能算通过').toBeGreaterThan(100);
    expect(SRC_FILES).toContain(DEFINING_FILE);
    expect(SRC_FILES).toContain('src/ui/HelpManual.js');
  });

  it('`src/` 的非注释代码里不许再写废弃区名（豁免只有定义那张表的文件）', () => {
    const 漏网 = [];
    for (const rel of SRC_FILES) {
      if (rel === DEFINING_FILE) continue;
      漏网.push(...legacyHitsIn(rel, names));
    }
    expect(漏网, `这些地方还在对玩家说一个世界里不存在的区名：\n${漏网.join('\n')}`).toEqual([]);
  });

  it('判据本身两向都验：同一条喂人造文本必须命中，注释行放过', () => {
    const 人造 = ['const t = "向南踏入魔法遗境";', '// 旧名魔法遗境的史料', ' * 魔法遗境', 'const ok = "霍格沃兹遗境";'];
    const got = 人造.map((l, i) => ({ n: i + 1, line: l }))
      .filter(({ line }) => isProseLine(line) && names.some((nm) => line.includes(nm)));
    expect(got.map((g) => g.n), '只该抓到最后两行里的那一条文案行').toEqual([1]);
  });
});

describe('豁免的可达性：那张旧名表确实有读者，不是留着当藏身处', () => {
  it('`zoneIdOf` 仍把旧名解析成同一个 id（存档/旧数据的回退分支）', () => {
    expect(LEGACY_NAME_TO_ID['魔法遗境']).toBe(ZONE_IDS.MAGIC);
    expect(zoneIdOf({ info: { name: '魔法遗境' } })).toBe(ZONE_IDS.MAGIC);
    expect(zoneIdOf({ info: { name: '霍格沃兹遗境' } })).toBe(ZONE_IDS.MAGIC);
  });

  it('定义那张表的文件确实写着它（豁免的理由当场可查，不是注释里的一句声明）', () => {
    expect(srcText(DEFINING_FILE)).toMatch(/export const LEGACY_NAME_TO_ID = \{/);
  });
});

describe('改口之后：三处 label 接的是表，成段文案钉的是字面', () => {
  it('任务助手那五行"去某位面"的 label 不再抄区名', () => {
    const 源码 = srcText('src/ui/QuestAssistant.js');
    // W-D2 切片16i：区名的**显示值**住在双表里，源码里出现的是键（`zone_name_*`）
    // —— 所以这里查的是**展开后**的现行名，抄本仍然是抄本。
    const 现行名 = Object.values(ZONE_NAMES).map((k) => t(k));
    const 抄来的 = 源码.split('\n').filter((l) => /label: '[^']*'/.test(l)
      && 现行名.some((nm) => l.includes(nm)));
    expect(抄来的, `这些行又把区名抄进面板行了：\n${抄来的.join('\n')}`).toEqual([]);
    for (const zone of ZONE_ORDER) {
      expect(源码, `助手里缺了去 ${zone} 那一格，或它没接名字表`).toContain(`ZONE_NAMES[ZONE_IDS.${zone.toUpperCase()}]`);
    }
  });

  it('枢纽那五扇位面门与那圈指路牌：牌上没有文字，抄本删掉了（label 从来没人读）', () => {
    for (const rel of ['src/world/WorldDecorations.js', 'src/world/WorldManager.js']) {
      const 源码 = srcText(rel);
      expect(源码, `${rel} 里那些"牌上的区名"是死字段：读它的代码不存在`).not.toMatch(/label: '[^']*(森林|遗境|荒原|时线|边境)/);
    }
  });

  it('玩家读到的那几句钉字面：现行区名，不是等式两边一起改口', () => {
    expect(srcText('src/content/objectives.js')).toContain("desc: '击败霍格沃兹遗境深处的大奥术师。'");
    // W-D2 切片15：说明书正文进双表，`hm_body_dungeons` 那一句从 `HelpManual.js` 搬到中文表 ——
    // 钉的仍是"玩家读到的那几个字"，只是换了住址（与 CG 字幕同一处逻辑）。
    expect(srcText('src/content/strings.zh.js')).toContain('· 霍格沃兹遗境 — 禁忌图书馆');
    expect(srcText('src/cinematic/CinematicManager.js')).toContain("'霍格沃兹遗境 · 位面试炼 II'");
    // W-D2 切片13：CG 字幕进双表之后，这一句的字面从 `dialogueCgPresets.js`（那里现在存的是键）
    // 搬到了中文表 —— 钉的仍是"玩家读到的那几个字"，只是换了住址，不是把这一格删掉。
    expect(srcText('src/content/strings.zh.js')).toContain("cg_caption_magic_start: '霍格沃兹遗境倒影'");
  });

  it(`名字表本身也钉一格字面（ZONE_NAMES[MAGIC]）`, () => {
    // W-D2 切片16i：`ZONE_NAMES` 的值是**文案键**，现行名住在双表里 ——
    // 钉的仍是"玩家读到的那几个字"，只是从表里搬进了双表。
    expect(t(ZONE_NAMES[ZONE_IDS.MAGIC])).toBe('霍格沃兹遗境');
  });
});
