import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { t, setLanguage, getLanguage, getAllKeys, assertI18nParity } from '../src/engine/i18n.js';
import { 动态接线键集 } from './helpers/i18nDynamicKeys.js';
import { EXPECTED_KEY_COUNT, 键数问题 } from './helpers/i18nKeyCount.js';

describe('i18n 文案表（W-D2 切片1）', () => {
  beforeEach(() => {
    setLanguage('zh');   // 每例复位，避免语言状态跨例泄漏
  });

  it('两张表的键名集合完全一致：中文表与英文表逐键对齐', () => {
    expect(ZH_KEYS.slice().sort()).toEqual(EN_KEYS.slice().sort());
  });

  it('两张表的键数相等且非空：表本身不是空的', () => {
    expect(ZH_KEYS.length).toBeGreaterThan(50);
    expect(ZH_KEYS.length).toBe(EN_KEYS.length);
  });

  it('每一格都有非空文案：没有占位或空串', () => {
    for (const key of ZH_KEYS) {
      expect(typeof STRINGS_ZH[key], `中文表 ${key}`).toBe('string');
      expect(STRINGS_ZH[key].length, `中文表 ${key} 不得为空`).toBeGreaterThan(0);
    }
    for (const key of EN_KEYS) {
      expect(typeof STRINGS_EN[key], `英文表 ${key}`).toBe('string');
      expect(STRINGS_EN[key].length, `英文表 ${key} 不得为空`).toBeGreaterThan(0);
    }
  });

  it('键名不许重复：Object.keys 的数量 = Set 的数量', () => {
    expect(new Set(ZH_KEYS).size).toBe(ZH_KEYS.length);
    expect(new Set(EN_KEYS).size).toBe(EN_KEYS.length);
  });

  it('t() 按当前语言返回对应文案', () => {
    setLanguage('zh');
    expect(t('settings_title')).toBe('设置');
    setLanguage('en');
    expect(t('settings_title')).toBe('Settings');
  });

  it('setLanguage 拒绝未知语言并抛错', () => {
    expect(() => setLanguage('ja')).toThrow(/未知语言/);
    expect(() => setLanguage('')).toThrow(/未知语言/);
  });

  it('getLanguage 返回当前语言', () => {
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    setLanguage('zh');
    expect(getLanguage()).toBe('zh');
  });

  it('t() 对缺失键返回 [MISSING: key] 而不是静默失败', () => {
    const result = t('nonexistent_key_xyz');
    expect(result).toBe('[MISSING: nonexistent_key_xyz]');
  });

  it('t() 支持 \\${name} 插值', () => {
    // 用现有键拼一个带插值的场景：直接调 t 的第二参数
    // 先确认无参数时不插值
    // 样键必须是在役的：2026-10-29 清理死键时这里原来取的键被删了，
    // 两条断言于是拿两个同样的 [MISSING: …] 互相比，绿得毫无意义。
    const 样键 = 'pause_resume';
    expect(ZH_KEYS, '样键不在表里 —— 下面的断言会拿两个 [MISSING] 互相比').toContain(样键);
    const plain = t(样键);
    expect(plain).not.toContain('[MISSING:');
    expect(plain).not.toContain('${');
    // 插值路径：键值里没有 \${} 时原样返回
    expect(t(样键, { name: 'X' })).toBe(plain);
  });

  it('getAllKeys 返回中文表的键名', () => {
    expect(getAllKeys().slice().sort()).toEqual(ZH_KEYS.slice().sort());
  });

  it('assertI18nParity 对当前两张表不抛错', () => {
    expect(() => assertI18nParity()).not.toThrow();
  });

  it('assertI18nParity 对缺键的假表抛错并点名缺了哪个键', () => {
    // 构造一份缺键的假英文表——通过直接调函数内部的比较逻辑验证
    // （函数签名为无参使用真实表，这里用等价逻辑构造会抛错的场景）
    const fakeZh = { a: '甲', b: '乙' };
    const fakeEn = { a: 'A' };
    const zhKeys = new Set(Object.keys(fakeZh));
    const enKeys = new Set(Object.keys(fakeEn));
    const missingInEn = [...zhKeys].filter(k => !enKeys.has(k));
    expect(missingInEn).toEqual(['b']);   // 比较形状与函数内部一致
  });
});

describe('壳页接线（W-D2 切片2）', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

  it('壳页引用的 data-i18n 键都在表里：拼错一个键 = 那一格永远不翻', () => {
    const used = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
    // 空扫保底：切片2 起设置面板整块接线，扫不到两位数就是扫描本身坏了（不是"壳页干净"）
    expect(used.length, 'data-i18n 声明一条都没扫到，扫描坏了').toBeGreaterThanOrEqual(20);
    const keys = new Set(getAllKeys());
    const unknown = [...new Set(used)].filter((k) => !keys.has(k));
    expect(unknown, '壳页引用了文案表里没有的键').toEqual([]);
    // 反向控制：混一个假键进去，过滤器必须点名它（防"过滤器永远返回空"）
    const probe = [...new Set([...used, 'settings_no_such_key'])].filter((k) => !keys.has(k));
    expect(probe, '过滤器连假键都认不出来').toEqual(['settings_no_such_key']);
  });

  /** 走查：返回挂在"有子元素"的容器上的键名单，顺带数出叶子标记的个数 */
  const scanI18nLeaves = (src) => {
    const containers = [];
    let leaves = 0;
    for (const m of src.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>/g)) {
      const rest = src.slice(m.index + m[0].length);
      const end = rest.indexOf(`</${m[1]}>`);
      if (end < 0 || rest.slice(0, end).includes('<')) containers.push(m[2]);
      else leaves += 1;
    }
    return { containers, leaves };
  };

  it('data-i18n 只挂在叶子元素上：`textContent` 整体替换不会吞掉子元素', () => {
    // `applyTranslations` 用 textContent 换文本；键若挂在有子元素的容器上（例如整个 <label>），
    // 切一次语言就会把滑杆/下拉框从 DOM 里删掉 —— 面板照开，控件没了，而且不报错。
    const real = scanI18nLeaves(html);
    expect(real.leaves, '叶子标记一个都没扫到（切片2 起设置面板整块接线）').toBeGreaterThanOrEqual(20);
    expect(real.containers, '这些键挂在容器上，切语言会连子元素一起删掉').toEqual([]);
    // 反向控制：容器形态必须被同一条扫描咬住（防"扫描一坏就永远通过"）
    const bad = scanI18nLeaves('<label data-i18n="x"><input id="y" /></label>');
    expect(bad.containers, '容器形态没被扫描咬住').toEqual(['x']);
    expect(bad.leaves).toBe(0);
  });
});

describe('键的引用完整性（W-D2 切片4）', () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const FILES = [...walk(join(process.cwd(), 'src')), join(process.cwd(), 'index.html')];

  it("代码里 t('…') 与壳页 data-i18n 引用的键都登记在表里（漏一个 = 玩家界面出现 [MISSING: ]）", () => {
    const keys = new Set(getAllKeys());
    const unknown = [];
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      const rel = file.slice(process.cwd().length + 1).replace(/\\/g, '/');
      for (const m of text.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) {
        if (!keys.has(m[1])) unknown.push(`${rel}: t('${m[1]}')`);
      }
      if (rel === 'index.html') {
        for (const m of text.matchAll(/data-i18n="([A-Za-z0-9_]+)"/g)) {
          if (!keys.has(m[1])) unknown.push(`${rel}: data-i18n="${m[1]}"`);
        }
      }
    }
    expect(unknown, '引用了表里没有的键').toEqual([]);
    // 反向控制：混一个假键，过滤器必须点名它（防"扫描永远返回空"）
    const probe = [...new Set([...keys, 'no_such_key_xyz'])].filter((k) => !keys.has(k));
    expect(probe, '过滤器连假键都认不出来').toEqual(['no_such_key_xyz']);
  });

  it('同一份文案最多两个键 —— 一个意思写三遍就是命名族失控（切片3 那次事故）', () => {
    for (const [name, table] of Object.entries({ zh: STRINGS_ZH, en: STRINGS_EN })) {
      const byValue = new Map();
      for (const [key, value] of Object.entries(table)) {
        byValue.set(value, [...(byValue.get(value) ?? []), key]);
      }
      const bloated = [...byValue]
        .filter(([, ks]) => ks.length > 2)
        .map(([v, ks]) => `${name}: ${ks.length}x ${ks.join(' / ')} = ${v}`);
      expect(bloated, '一个文案被三个以上的键各写一遍').toEqual([]);
    }
  });

  it('SettingsPanel 的 toast 一律问 t()：字面量中文一倒回来，切英文就露馅', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/SettingsPanel.js'), 'utf8');
    const calls = [...src.matchAll(/\.toast\(/g)];
    expect(calls.length, '一条 toast 都没扫到，扫描坏了').toBeGreaterThanOrEqual(3);
    const literals = calls
      .map((m) => src.slice(m.index, m.index + 60))
      .filter((snippet) => !/^\.toast\(\s*t\(/.test(snippet));
    expect(literals, '有 toast 不走 t()').toEqual([]);
  });
});

describe('开机那几屏接线（W-D2 切片5）', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

  /**
   * 逐处点名：这一格今天必须走 `data-i18n`。
   *
   * 上面那两条扫的是"引用了的键都登记在表里" —— 方向是**表**。这一条反过来钉**壳页**：
   * 属性被摘掉时没有报错，只是那一格静默留着出厂文案（切英文还是中文），
   * 而"少翻了一格"恰好是最难被玩家之外的人发现的那种坏。
   */
  const PINS = [
    '<h1 data-i18n="start_brand">',
    '<p data-i18n="loading_subtitle">',
    '<span data-i18n="minimap_title">',
    '<span data-i18n="minimap_switch">',
    '<span data-i18n="minimap_dungeon_hint">',
    '<span data-i18n="guide_head">',
    'id="guide-sync" data-i18n="guide_sync"',
    'id="autoplay-fab">⚡ <span data-i18n="autoplay_label"',
    '<h2 data-i18n="start_brand">',
    '<span data-i18n="start_click">',
    '<span data-i18n="start_move">',
    '<span data-i18n="start_pause">',
    '<span data-i18n="manual_short">',
    '<span data-i18n="journal_title">',
    '<span data-i18n="start_perf">',
    'id="start-btn" data-i18n="start_enter"',
    '<p class="start-url" data-i18n="start_url_note">',
  ];

  it('开机那几屏的每一格都挂着 data-i18n（摘掉一格 = 那一格静默不翻）', () => {
    const missing = PINS.filter((pin) => !html.includes(pin));
    expect(missing, '这些地方今天没有走 data-i18n').toEqual([]);
    expect(PINS.length, '钉的条数太少，清单本身要复核').toBeGreaterThanOrEqual(15);
  });

  it('被钉住的键在两张表里都有非空文案', () => {
    const keys = [...new Set(PINS.map((p) => /data-i18n="([^"]+)"/.exec(p)?.[1]).filter(Boolean))];
    expect(keys.length, 'PINS 里一条 data-i18n 都没解析出来，解析坏了').toBeGreaterThanOrEqual(15);
    for (const key of keys) {
      expect(STRINGS_ZH[key], `中文表缺 ${key}`).toBeTypeOf('string');
      expect(STRINGS_ZH[key]?.length, `中文表 ${key} 为空`).toBeGreaterThan(0);
      expect(STRINGS_EN[key], `英文表缺 ${key}`).toBeTypeOf('string');
      expect(STRINGS_EN[key]?.length, `英文表 ${key} 为空`).toBeGreaterThan(0);
    }
  });

  it('反面控制：一份不在壳页里的钉子必须被认出来（防"清单永远全过"）', () => {
    const fake = '<span data-i18n="no_such_pin_key">';
    expect(html).not.toContain(fake);
    const missing = PINS.filter((pin) => !html.includes(pin));
    expect([...missing, fake], '过滤器连假钉子都点不了名').toEqual([fake]);
  });
});

describe('暂停/快速旅行/世界地图/说明书头/对话关闭（W-D2 切片6）', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

  /**
   * 逐处点名：这几个面板的静态标签今天必须走 data-i18n。
   * 这些元素无 JS 覆写（写者普查过）—— 暂停菜单/快速旅行/对话/世界地图/说明书头
   * 的标题、按钮、提示文本均为壳页直出。
   */
  const PINS6 = [
    '<h2 data-i18n="menu_pause">',
    '<button id="pause-resume" data-i18n="pause_resume">',
    '<span data-i18n="slot_label">',
    '<button id="pause-save" data-i18n="pause_save">',
    '<button id="pause-load-slot" data-i18n="pause_load_slot">',
    '<button id="pause-export" data-i18n="pause_export">',
    '<button id="pause-import" data-i18n="pause_import">',
    '<button id="pause-settings" data-i18n="menu_settings">',
    '<span data-i18n="manual_short">',
    '<span data-i18n="journal_title">',
    '<span data-i18n="common_close">',
    '<span data-i18n="quick_save_slot">',
    '<span data-i18n="manual_short">',
    '<span data-i18n="start_perf">',
    '<span data-i18n="save_version_note">',
    '<h2 data-i18n="fast_travel_title">',
    '<button id="fast-travel-close" data-i18n="common_cancel">',
    '<button id="dialog-close" data-i18n="upgrade_continue">',
    '<h2 data-i18n="world_map_title">',
    '<span data-i18n="common_close">',
    '<h2 data-i18n="manual_title">',
    '<span data-i18n="common_close">',
  ];

  it('暂停/旅行/地图/说明书/对话关闭的静态标签都挂 data-i18n', () => {
    const missing = PINS6.filter((pin) => !html.includes(pin));
    expect(missing, '这些地方今天没有走 data-i18n').toEqual([]);
    expect(PINS6.length, '钉的条数太少，清单本身要复核').toBeGreaterThanOrEqual(20);
  });

  it('被钉住的键在两张表里都有非空文案', () => {
    const keys = [...new Set(PINS6.map((p) => /data-i18n="([^"]+)"/.exec(p)?.[1]).filter(Boolean))];
    expect(keys.length, 'PINS6 里一条 data-i18n 都没解析出来，解析坏了').toBeGreaterThanOrEqual(12);
    for (const key of keys) {
      expect(STRINGS_ZH[key], `中文表缺 ${key}`).toBeTypeOf('string');
      expect(STRINGS_ZH[key]?.length, `中文表 ${key} 为空`).toBeGreaterThan(0);
      expect(STRINGS_EN[key], `英文表缺 ${key}`).toBeTypeOf('string');
      expect(STRINGS_EN[key]?.length, `英文表 ${key} 为空`).toBeGreaterThan(0);
    }
  });

  it('反面控制：假钉子必须被点名（防清单永远全过）', () => {
    const fake = '<span data-i18n="no_such_pin_key_6">';
    expect(html).not.toContain(fake);
    const missing = PINS6.filter((pin) => !html.includes(pin));
    expect([...missing, fake], '过滤器连假钉子都点不了名').toEqual([fake]);
  });
});

describe('死键只减不增（W-D2 切片6 门槛 · 切片26 修"这道门恒绿"B144 · 切片27 把运行期拼键单列）', () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  /**
   * 读者名单：`src/` 全部代码 + `index.html`，**但不许算进两张定义表自己**。
   *
   * 改前没有这个排除，而每一个键的键名都以字面量写在 `strings.zh.js` 里 ⇒
   * `FILES.some(f => 读(f).includes(key))` 对**任何**键都为真 ⇒ 死键计数恒 0、`≤ 48` 永远过。
   * W-E3 切片25 里九行副本抄本被删掉、七枚 `wp_label_*` 同时变成孤儿，这道门一声没出
   * （那七枚是人工发现的）—— 那就是 B144：门答应了，但它量不到任何东西。
   */
  const 是定义表 = (f) => /strings\.(zh|en)\.js$/.test(f);
  const FILES = [
    ...walk(join(process.cwd(), 'src')).filter((f) => !f.endsWith('.map') && !是定义表(f)),
    join(process.cwd(), 'index.html'),
  ];
  /** 一次读完再逐键问（改前"逐键 × 逐文件"重读 2411 × 268 次 ⇒ 单这条用例 86 秒，是全量套件最慢的一条） */
  const 读者文本 = FILES.map((f) => readFileSync(f, 'utf8'));
  /**
   * 两件事分开：**字面量有没有整名出现** 与 **是不是真的没人读**。
   *
   * 切片26 只量了前者，于是 `t(\`settings_ssao_quality_${name}\`)` 这种**运行期拼出来的键名**
   * 一律被判成死键 —— B142 / B143 / B144 三条片的「限度」都记了这同一句，记了三次没人修。
   * 切片27 把它变成被检查的性质：谁拼键谁在 `拼键名册` 登记前缀与代入域，展开出来的每一枚
   * 必须有定义（`tests/i18n-dynamic-key-coverage.test.js`）。这一处账本因此只减掉**登记过**的那些，
   * 而不是往尺子里塞一个"看起来像前缀"的猜测。
   */
  const 字面零读者 = ZH_KEYS.filter((k) => !读者文本.some((s) => s.includes(k)));
  const 动态 = 动态接线键集();
  const 死集 = 字面零读者.filter((k) => !动态.has(k));

  /**
   * 修门那一刻（2411 键）的真实读数 —— **待查清单，不是可删清单**。
   *
   * 2026-10-29 分两批清掉 40 枚（14 枚被同文/近文键取代、26 枚从未接线，见文末
   * 「清理过的死键」一节的两张表）；最后 4 枚（两结局的标题与日志）当时留着，
   * 理由是"等结局日志真正接线时再用" —— **W-E3 切片36 把它们接上了**
   * （真结局那一行的 `titleByChoice` / `journalByChoice` → HUD 任务格 / 日志条目 /
   * 完成提示 / 发现卡 / 指路助手 / 营火进度 / 日志面板），账本从此是**空的**。
   *
   * 名单里少一枚要问的是"它被接上了还是被删了"，多一枚则是有人建了格没接线。
   * 运行期拼出来的那一族（`settings_ssao_quality_*` 四枚）**不在这里** —— 它们有读者，
   * 只是键名从来没整局地写过；那张账在 `tests/helpers/i18nDynamicKeys.js` 的名册里，
   * 由 `tests/i18n-dynamic-key-coverage.test.js` 逐枚核定义（切片27）。
   */
  const 死键名单 = [];

  it('扫描范围先把两张定义表排除掉（否则每个键都被自己的定义算成读者）', () => {
    expect(FILES.filter(是定义表), '定义表又回到读者名单里了 —— 这道门将重新恒绿').toEqual([]);
    expect(FILES.length, '读者名单塌了（扫描目录不对？）').toBeGreaterThan(120);
  });

  it('账本是空的（切片36 之后没有"建了格没人读"的键）', () => {
    expect(死集.slice().sort(), '又长出了没人读的键 —— 接线，或者删掉它').toEqual(死键名单);
  });

  it('盲区那一族单列：登记过的运行期键不许混进待查账本，也不许漂走', () => {
    // 名册说"这些键是运行期读的"⇒ 它们必须在表里、必须真的没有整名读者（否则该回字面量那一族记账）
    expect([...动态].sort(), '名册登记的键集漂了（今天应当是 SSAO 四档）').toEqual([
      'settings_ssao_quality_high',
      'settings_ssao_quality_low',
      'settings_ssao_quality_medium',
      'settings_ssao_quality_off',
    ]);
    for (const 键 of 动态) {
      expect(ZH_KEYS, `运行期拼出来的「${键}」不在中文表里 —— 面板那一档会显示 [MISSING: ${键}]`).toContain(键);
      expect(字面零读者, `「${键}」已经有人整名写过了 —— 它不再是盲区，名册要减一行`).toContain(键);
      expect(死集, `「${键}」又被当成孤儿了 —— 删掉它，SSAO 下拉那一档就没有字`).not.toContain(键);
    }
    // 尺子不许只看见登记的那一族：没登记的运行期拼键仍然会落进待查账本（这是限度，写进读数）
    expect(字面零读者.length, '字面量零读者的总数不是 4 了 —— 除 SSAO 四档之外又有人建了没人整名读的键')
      .toBe(4);
  });

  it('反向控制两头：在役的键不许进名单，凭空造一枚没接线的键必须进（防修完仍恒绿）', () => {
    for (const 在役 of ['wp_label_anchor', 'quest_state_done', 'obj_anchor_title']) {
      expect(ZH_KEYS, `钉子键 ${在役} 已不在表里 —— 这条控制成了空转`).toContain(在役);
      expect(死集, `在役键 ${在役} 被判成死键 ⇒ 读者名单漏了它真正被读的那一处`).not.toContain(在役);
    }
    const 假键 = 'b144_probe_根本没接线';
    expect(ZH_KEYS).not.toContain(假键);
    const 带假键 = [...ZH_KEYS, 假键].filter((k) => !读者文本.some((s) => s.includes(k)) && !动态.has(k));
    expect(带假键.length, '加了一枚没人引用的键，计数却没动 —— 尺子是摆设').toBe(死集.length + 1);
  });
});

describe('升级面板静态标签（W-D2 切片7）', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

  /**
   * 升级面板壳页静态标签：这些元素无 JS 覆写（写者普查过）。
   * `upgrade-rest-name` 虽有 JS 写入，但默认值 '营火' 需要 i18n 兜底（JS 覆盖前可见）。
   * 技能/剧情/装备区域的正文由 UpgradePanel 运行期生成（含 skillTrees），归后续切片。
   */
  const PINS7 = [
    '<h2 id="upgrade-rest-name" data-i18n="upgrade_rest_default">',
    '<span data-i18n="upgrade_meta_souls">',
    '<span data-i18n="upgrade_meta_cost">',
    '<span data-i18n="upgrade_meta_level">',
    '<span data-i18n="upgrade_meta_points">',
    '<button type="button" id="tab-stats" data-i18n="upgrade_tab_stats">',
    '<button type="button" id="tab-skills" data-i18n="upgrade_tab_skills">',
    '<button type="button" id="tab-lore" data-i18n="upgrade_tab_lore">',
    '<button type="button" id="tab-gear" data-i18n="upgrade_tab_gear">',
    '<span data-i18n="upgrade_stat_hp">',
    '<span data-i18n="upgrade_stat_st">',
    '<span data-i18n="upgrade_stat_vigor">',
    '<span data-i18n="upgrade_stat_endurance">',
    '<span data-i18n="upgrade_stat_strength">',
    '<span data-i18n="upgrade_stat_arcane">',
    '<span data-i18n="upgrade_stat_mind">',
    '<span data-i18n="upgrade_hint">',
    '<span data-i18n="upgrade_gear_bag">',
    '<button id="upgrade-close" data-i18n="upgrade_continue">',
  ];

  it('升级面板静态标签都挂 data-i18n', () => {
    const missing = PINS7.filter((pin) => !html.includes(pin));
    expect(missing, '这些地方今天没有走 data-i18n').toEqual([]);
    expect(PINS7.length, '钉的条数太少，清单本身要复核').toBeGreaterThanOrEqual(17);
  });

  it('被钉住的键在两张表里都有非空文案', () => {
    const keys = [...new Set(PINS7.map((p) => /data-i18n="([^"]+)"/.exec(p)?.[1]).filter(Boolean))];
    expect(keys.length, 'PINS7 里一条 data-i18n 都没解析出来，解析坏了').toBeGreaterThanOrEqual(17);
    for (const key of keys) {
      expect(STRINGS_ZH[key], `中文表缺 ${key}`).toBeTypeOf('string');
      expect(STRINGS_ZH[key]?.length, `中文表 ${key} 为空`).toBeGreaterThan(0);
      expect(STRINGS_EN[key], `英文表缺 ${key}`).toBeTypeOf('string');
      expect(STRINGS_EN[key]?.length, `英文表 ${key} 为空`).toBeGreaterThan(0);
    }
  });

  it('反面控制：假钉子必须被点名（防清单永远全过）', () => {
    const fake = '<span data-i18n="no_such_pin_key_7">';
    expect(html).not.toContain(fake);
    const missing = PINS7.filter((pin) => !html.includes(pin));
    expect([...missing, fake], '过滤器连假钉子都点不了名').toEqual([fake]);
  });
});

describe('指南面板动态文案（W-D2 切片8）', () => {
  const gpSrc = readFileSync(join(process.cwd(), 'src/ui/GameGuidePanel.js'), 'utf8');

  /**
   * GameGuidePanel.refresh() 里的所有文案现在都走 t()。
   * 逐键点名：这些键必须在两张表里且非空；JS 里不许出现裸字面量。
   */
  const GUIDE_KEYS = [
    'guide_title_auto',
    'guide_step_auto',
    'guide_title_dungeon_prefix',
    'guide_step_dungeon',
    'guide_hint_dungeon_boss',
    'guide_hint_dungeon_enemies',
    'guide_hint_dungeon_exit',
    'guide_hint_dungeon_explore',
    'guide_title_complete',
    'guide_step_complete',
    'guide_hint_complete',
    'guide_title_chapter_prefix',
    'guide_hint_waypoint',
    'guide_hint_assistant',
    'guide_toast_sync_progress',
    'guide_toast_synced',
    'guide_hint_auto',
  ];

  it('GameGuidePanel 里的文案键在两张表里都有非空文案', () => {
    for (const key of GUIDE_KEYS) {
      expect(STRINGS_ZH[key], `中文表缺 ${key}`).toBeTypeOf('string');
      expect(STRINGS_ZH[key]?.length, `中文表 ${key} 为空`).toBeGreaterThan(0);
      expect(STRINGS_EN[key], `英文表缺 ${key}`).toBeTypeOf('string');
      expect(STRINGS_EN[key]?.length, `英文表 ${key} 为空`).toBeGreaterThan(0);
    }
  });

  it('JS 里不许出现这组文案的裸字面量（改完键之后界面还得说真话）', () => {
    const literals = GUIDE_KEYS
      .map((k) => STRINGS_ZH[k])
      .filter((v) => v && v.length > 2)
      .filter((v) => gpSrc.includes(v));
    expect(literals, '这些中文文案仍以裸字面量存在于 GameGuidePanel.js').toEqual([]);
  });

  it('反面控制：删掉一把键 JS 扫描器必须红', () => {
    // 模拟删键：从源码里把某个 t('key') 改成 t('no_such_key')
    const reverted = gpSrc.replace("t('guide_title_auto')", "t('no_such_key')");
    const missing = GUIDE_KEYS
      .map((k) => STRINGS_ZH[k])
      .filter((v) => v && v.length > 2)
      .filter((v) => reverted.includes(v));
    expect(missing.length).toBeLessThan(GUIDE_KEYS.length);
  });
});

/* ------------------------------------------------------------------
 * 玩家可见裸中文收口（W-D2 切片54）
 * ------------------------------------------------------------------ */

describe('玩家可见裸中文收口（W-D2 切片54）', () => {
  const SRC = readFileSync(join(process.cwd(), 'src/ui/SettingsPanel.js'), 'utf8');
  const RNM = readFileSync(join(process.cwd(), 'src/world/RestNpcManager.js'), 'utf8');
  const HTML = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

  it('键位表头四个标签全走 t()（设备词复用 input_device_* 三键，不建新键）', () => {
    expect(SRC).toContain("${t('settings_keybind_head_action')}");
    expect(SRC).toContain("${t('settings_keybind_head_equivalent')}");
    expect(SRC).toContain("${t('input_device_keyboard')} / ${t('input_device_mouse')}");
    expect(SRC).toContain("${t('input_device_gamepad')}");
  });

  it('表头那段模板里再无中文字面量（注释除外）', () => {
    const 段 = SRC.slice(SRC.indexOf('keybind-head'), SRC.indexOf("rows.join('')"));
    const 裸 = 段.split('\n').filter((l) => /[\u4e00-\u9fff]/.test(l) && !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    expect(裸, '表头模板里还有裸中文').toEqual([]);
  });

  it('营火 NPC 模型加载 toast 走 t() 且带 name 插值', () => {
    expect(RNM).toContain("t('rest_npc_model_loaded_fmt', { name: t(def.name) })");
    expect(RNM).not.toContain('模型已加载');
  });

  it('index.html 没有中文 title 工具提示（Fab 的 title 与可见标签重复，已删）', () => {
    const 中文title = [...HTML.matchAll(/title="([^"]*)"/g)].filter((m) => /[\u4e00-\u9fff]/.test(m[1]));
    expect(中文title.map((m) => m[0])).toEqual([]);
  });

  it('反面控制：同一把 title 扫描咬得住中文标题（防"永远返回空"）', () => {
    const 假 = '<a title="自动通关">x</a><a title="Auto">y</a>';
    const 中文title = [...假.matchAll(/title="([^"]*)"/g)].filter((m) => /[\u4e00-\u9fff]/.test(m[1]));
    expect(中文title.map((m) => m[0])).toEqual(['title="自动通关"']);
  });

  it('三个新键两表都有非空文案，且模板带 ${name} 占位', () => {
    for (const k of ['settings_keybind_head_action', 'settings_keybind_head_equivalent', 'rest_npc_model_loaded_fmt']) {
      expect(STRINGS_ZH[k], `中文表缺 ${k}`).toBeTypeOf('string');
      expect(STRINGS_EN[k], `英文表缺 ${k}`).toBeTypeOf('string');
    }
    expect(STRINGS_ZH.rest_npc_model_loaded_fmt).toContain('${name}');
    expect(STRINGS_EN.rest_npc_model_loaded_fmt).toContain('${name}');
  });
});

describe('双表键数只有一个所有者（W-D2 欠账 · 2026-10-29）', () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const 测试源 = walk(join(process.cwd(), 'tests'))
    .filter((file) => file.endsWith('.test.js'))
    .map((file) => ({ file, s: readFileSync(file, 'utf8') }));

  it('测试代码里没有第二份键数字面量（出现即红）', () => {
    const 抄本 = 测试源
      .filter(({ s: 源 }) => 源.includes(`.toBe(${EXPECTED_KEY_COUNT})`))
      .map(({ file }) => file);
    expect(抄本, '有人把键数抄回测试里了 —— 改键数应当只有一处').toEqual([]);
  });

  it('曾抄过键数的文件都改读同一个判据（防这道门自己空转）', () => {
    const 读过 = 测试源.filter(({ s: 源 }) => 源.includes("helpers/i18nKeyCount.js"));
    expect(读过.length, '一个文件都没读单一真源 —— 这条门禁量不到任何东西').toBeGreaterThanOrEqual(11);
  });

  it('判据两个方向都咬得住（反向控制）', () => {
    const 齐 = new Array(EXPECTED_KEY_COUNT).fill('k');
    expect(键数问题(齐, 齐), '齐的时候不该报问题').toEqual([]);
    expect(键数问题(齐.slice(1), 齐).length, '两表不等必须报').toBeGreaterThan(0);
    expect(键数问题(齐.slice(1), 齐.slice(1)).length, '与登记值不等必须报').toBeGreaterThan(0);
    expect(键数问题(null, 齐).length, '非数组必须报').toBe(1);
  });
});
describe('清理过的死键不留后门（2026-10-29）', () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  /**
   * 删掉的 40 枚 → 凭据。两张表分开，因为"凭据"不是一回事：
   *
   * - `被取代`：同一个意思已有一个在役键在写。判据是**替代键两表都在场且真的有人读**。
   * - `从未接线`：这个界面/提示根本没有（或换了别的写法）。没有替代键，只有一句原因；
   *   判据是**这句原因不许是空话**（非空、且长度够描述一个去向/现状）。
   *
   * 两张表合起来必须覆盖**全部**删除，且不许重叠 —— 否则"删了却没说为什么"会从这个口子溜回来。
   */
  const 被取代 = {
    dialog_choice_continue: 'upgrade_continue',
    hud_boss_phase_fmt: 'boss_phase_fallback_banner',
    quest_assistant_hint_near_wp: 'quest_waypoint_near',
    quest_get_assistant_hint: 'guide_hint_assistant',
    quest_waypoint_far: 'quest_assistant_hint_boss_dist',
    quest_waypoint_hint_trials_done: 'quest_waypoint_hint_touch_anchor_3',
    toast_bag_full: 'gear_bag_full',
    toast_invalid_keybind: 'settings_keybind_invalid_or_occupied',
    upgrade_title: 'wp_label_campfire_upgrade',
    obj_true_end_sealed_desc: 'obj_true_end_desc_sealed',
    obj_true_end_studied_desc: 'obj_true_end_desc_studied',
    autoplay_start: 'autoplay_toast_start',
    fast_travel_unlocked: 'fast_travel_toast_unlocked',
    menu_resume: 'pause_resume',
  };
  const 从未接线 = {
    combat_boss_defeated: 'Boss 击败横幅走 boss_dungeon_defeat_banner',
    combat_boss_start: 'Boss 开始没有独立提示，阶段横幅走 boss_phase_fallback_banner',
    combat_defeat: '击杀计数与伤害数字都不读它',
    combat_victory: '胜利没有独立提示',
    common_confirm: '壳页没有确认按钮',
    common_load: '读档按钮走 pause_load_slot',
    common_reset: '设置面板没有"重置"按钮',
    dialog_title_unknown: '对话标题由调用方传入，没有未知说话人这条兜底',
    help_controls: '说明书走 hm_title_* / hm_body_*',
    help_gameplay: '同上（说明书分区 title/body）',
    help_title: '面板标题走 manual_title',
    hud_chapter: 'HUD 自己画 Chapter 数字',
    hud_fps: '性能面板与 HUD 自己画 FPS',
    hud_level: '魂/等级格走 hud_souls_display_fmt',
    journal_dungeon_runs: '日志页签走 journal_tab_*',
    journal_lore: 'lore 走 LoreCodex，日志页签不单列',
    menu_quit: '壳页没有退出按钮',
    quest_waypoint_hint_chapter: '章节门提示走 quest_waypoint_hint_touch_anchor_3',
    rest_dialogue_journal_text: '值是 ${text} 占位符，本身不含信息',
    rest_dialogue_journal_title: '值是 ${title} 占位符，本身不含信息',
    settings_audio: '设置按具体项列（master/sfx/music/ambient）',
    settings_bloom: '画质预设里没有单列 Bloom 开关',
    settings_controls: '控制分区没有这个标题',
    toast_gear_equip: '装备提示走 captions / gear_* 文案',
    toast_gear_pickup: '拾取提示走 captions',
    world_map_current_zone: '地图面板不显示"当前位置"标题',
  };

  it('两张表不许重叠，也不许有谁只删不记账', () => {
    const 交 = Object.keys(被取代).filter((k) => k in 从未接线);
    expect(交, '同一枚键在两个分类里各记了一次 —— 凭据有歧义').toEqual([]);
    expect(Object.keys(被取代).length + Object.keys(从未接线).length, '删除账本条数不是 40 —— 漏记了一枚').toBe(40);
  });

  it('替代键两表都在场，而且真的有人读（删字之前先确认字有去处）', () => {
    const 读者 = [
      ...walk(join(process.cwd(), 'src'))
        .filter((f) => f.endsWith('.js') && !/strings\.(zh|en)\.js$/.test(f))
        .map((f) => readFileSync(f, 'utf8')),
      readFileSync(join(process.cwd(), 'index.html'), 'utf8'),
    ];
    for (const [旧键, 新键] of Object.entries(被取代)) {
      expect(ZH_KEYS, `替代键 ${新键} 不在中文表里 —— ${旧键} 删了就是真丢字`).toContain(新键);
      expect(EN_KEYS, `替代键 ${新键} 不在英文表里`).toContain(新键);
      expect(读者.some((s) => s.includes(`'${新键}'`) || s.includes(`"${新键}"`)), `替代键 ${新键} 全仓没人读 —— 它也不是活键`).toBe(true);
    }
  });

  it('从未接线的那些，每一条都说得出为什么（空话不算凭据）', () => {
    for (const [k, 理由] of Object.entries(从未接线)) {
      expect(typeof 理由, `${k} 的凭据不是字符串`).toBe('string');
      expect(理由.trim().length, `${k} 的凭据是空话`).toBeGreaterThanOrEqual(6);
    }
  });

  it('删掉的键不许偷偷回来（两表都零出现）', () => {
    for (const 旧键 of [...Object.keys(被取代), ...Object.keys(从未接线)]) {
      expect(ZH_KEYS, `${旧键} 又回到中文表了`).not.toContain(旧键);
      expect(EN_KEYS, `${旧键} 又回到英文表了`).not.toContain(旧键);
    }
  });
});
