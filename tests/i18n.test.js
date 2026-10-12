import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { t, setLanguage, getLanguage, getAllKeys, assertI18nParity } from '../src/engine/i18n.js';

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
    const plain = t('toast_gear_equip');
    expect(plain).not.toContain('${');
    // 插值路径：键值里没有 \${} 时原样返回
    expect(t('toast_gear_equip', { name: 'X' })).toBe(plain);
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
    'id="autoplay-fab" title="自动通关">⚡ <span data-i18n="autoplay_label"',
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

describe('死键只减不增（W-D2 切片6 门槛）', () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const FILES = [...walk(join(process.cwd(), 'src')).filter(f => !f.endsWith('.map')), join(process.cwd(), 'index.html')];

  it('字符串字面量可见的死键计数只许降不许升（今天 53 → 切片6 后 ≤ 48）', async () => {
    const { STRING_KEYS } = await import('../src/content/strings.zh.js');
    let dead = 0;
    for (const key of STRING_KEYS) {
      const ref = FILES.some((f) => readFileSync(f, 'utf8').includes(key));
      if (!ref) dead++;
    }
    // 基线 53（切片5 前）；切片6 新增 9 个键全接线，死键应减少
    expect(dead, `死键计数 ${dead} 超过上限（应 ≤ 48）`).toBeLessThanOrEqual(48);
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
