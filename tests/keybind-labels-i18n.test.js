/**
 * 键位 / 热键 / 手柄显示名的双表门禁（W-D2 切片18）。
 *
 * 病灶：六张标签表（`keyLabels` 的键码/鼠标/手柄按钮三张 + `hotkeys` 的热键名 +
 * `keybinds` 的游戏键名与手柄专属名）的值直接是**裸中文**—— 英文玩家在设置面板、
 * HUD 提示、编辑器提示里看到的都是中文，且没有任何门禁会响。这是 W-D2 余项里
 * 点名的一族（hotkeys + keybinds 97 处）。
 *
 * 口径（与切片16b / 切片17 同族）：
 * - 表里存的全是**文案键**，播出时 `t()` 展开（函数出口 `keyLabel` / `mouseLabel` /
 *   `padButtonLabel` / `padStickLabel` 内部展开； SettingsPanel 的三处表格出口现算）；
 * - 迁移原值逐字钉死 —— 换的是住址，不是玩家读到的字；
 * - 静态腿：六张表的表体里不许再出现裸中文；
 * - 行为腿：四个出口函数在中英两种语言下都返回展开句。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KEY_LABELS, MOUSE_LABELS, PAD_BUTTON_LABELS,
  keyLabel, mouseLabel, padButtonLabel, padStickLabel,
} from '../src/content/keyLabels.js';
import { UI_HOTKEY_LABELS } from '../src/content/hotkeys.js';
import { KEY_ACTION_LABELS, PAD_ONLY_ACTION_LABELS } from '../src/content/keybinds.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { t, setLanguage, getLanguage } from '../src/engine/i18n.js';

const ZH = new Set(ZH_KEYS);
const EN = new Set(EN_KEYS);

/** 六张表 → （文件，导出名）。表体从 `export const X = {` 取到第一个 `};` */
const 六张表 = [
  ['src/content/keyLabels.js', 'KEY_LABELS'],
  ['src/content/keyLabels.js', 'MOUSE_LABELS'],
  ['src/content/keyLabels.js', 'PAD_BUTTON_LABELS'],
  ['src/content/hotkeys.js', 'UI_HOTKEY_LABELS'],
  ['src/content/keybinds.js', 'KEY_ACTION_LABELS'],
  ['src/content/keybinds.js', 'PAD_ONLY_ACTION_LABELS'],
];

const 表块 = (file, name) => {
  const 源码 = readFileSync(join(process.cwd(), file), 'utf8');
  const 起点 = 源码.indexOf(`export const ${name} = {`);
  expect(起点, `${file} 里找不到 ${name}`).toBeGreaterThan(-1);
  return 源码.slice(起点, 源码.indexOf('};', 起点));
};

/** 同一把尺子：一张表里所有没在两表登记的键 */
const 缺登记 = (表) => {
  const 缺 = [];
  for (const [动作, 键] of Object.entries(表)) {
    if (!ZH.has(键)) 缺.push(`中文表缺 "${键}"（${动作}）`);
    if (!EN.has(键)) 缺.push(`英文表缺 "${键}"（${动作}）`);
  }
  return 缺;
};

/** 迁移前的原值（逐字钉死：换的是住址，不是玩家读到的字） */
const 原值 = {
  key_label_escape: 'Esc', key_label_tab: 'Tab', key_label_space: '空格',
  key_label_backquote: '`',
  key_label_control_left: '左 Ctrl', key_label_control_right: '右 Ctrl',
  key_label_shift_left: '左 Shift', key_label_shift_right: '右 Shift',
  key_label_arrow_up: '↑', key_label_arrow_down: '↓',
  key_label_arrow_left: '←', key_label_arrow_right: '→',
  mouse_label_left: '鼠标左键', mouse_label_right: '鼠标右键',
  pad_button_label_a: 'A', pad_button_label_b: 'B', pad_button_label_x: 'X', pad_button_label_y: 'Y',
  pad_button_label_left_bumper: 'LB', pad_button_label_right_bumper: 'RB',
  pad_button_label_left_trigger: 'LT', pad_button_label_right_trigger: 'RT',
  pad_button_label_start: 'Start',
  pad_button_label_left_stick: '左摇杆按下', pad_button_label_right_stick: '右摇杆按下',
  pad_button_label_dpad_up: '十字键 ↑', pad_button_label_dpad_down: '十字键 ↓',
  pad_button_label_dpad_left: '十字键 ←', pad_button_label_dpad_right: '十字键 →',
  pad_stick_label: '左摇杆 ↑ + 十字键 ↑',
  hotkey_label_help: '帮助手册', hotkey_label_minimap: '小地图',
  hotkey_label_world_map: '世界地图', hotkey_label_camera_mode: '视角切换',
  hotkey_label_map_mark: '放置路点', hotkey_label_map_unmark: '移除路点',
  hotkey_label_zone_panel: '区域信息', hotkey_label_quest_tracker: '任务追踪',
  hotkey_label_auto_play: '自动演示',
  hotkey_label_photo_mode: '拍照模式',
  hotkey_label_session_stats: '本局统计',
  hotkey_label_load: '读取', hotkey_label_escape: '返回 / 暂停',
  hotkey_label_ui_up: '面板焦点上移', hotkey_label_ui_down: '面板焦点下移',
  hotkey_label_ui_left: '面板数值调小', hotkey_label_ui_right: '面板数值调大',
  kb_label_move_up: '前进', kb_label_move_down: '后退',
  kb_label_move_left: '左移', kb_label_move_right: '右移',
  kb_label_sprint: '冲刺', kb_label_jump: '跳跃', kb_label_roll: '翻滚',
  kb_label_skill: '战技', kb_label_lock_on: '锁定',
  kb_label_attack_light: '轻击', kb_label_attack_heavy: '重击',
  kb_label_spell1: '法术一', kb_label_spell2: '法术二',
  kb_label_spell3: '法术三', kb_label_spell4: '法术四',
  kb_label_swap_weapon: '换武器', kb_label_interact: '交互',
  kb_label_editor_cycle_template: '切换模板', kb_label_editor_toggle_grid: '切换网格',
  kb_label_editor_delete: '删除', kb_label_confirm: '界面确认',
};

afterEach(() => { setLanguage('zh'); });

describe('结构腿：六张表的值全是登记过的键', () => {
  it('每张表逐格核对中英两表，一个不缺', () => {
    for (const [file, name] of 六张表) {
      const 表 = { KEY_LABELS, MOUSE_LABELS, PAD_BUTTON_LABELS, UI_HOTKEY_LABELS, KEY_ACTION_LABELS, PAD_ONLY_ACTION_LABELS }[name];
      expect(缺登记(表), `${file} 的 ${name}`).toEqual([]);
    }
  });

  it('分母自证：六张表一共 74 格，外加一句插值句式（pad_stick_label）', () => {
    const 全部 = [
      KEY_LABELS, MOUSE_LABELS, PAD_BUTTON_LABELS,
      UI_HOTKEY_LABELS, KEY_ACTION_LABELS, PAD_ONLY_ACTION_LABELS,
    ];
    const 总数 = 全部.reduce((n, 表) => n + Object.keys(表).length, 0);
    expect(总数, '表格格子数变了：迁移漏了格，或多搬了格').toBe(74);
    // 原值钉死 = 68 格逐字 + 1 句插值句式（在行为腿里钉）：七格撞已有文案，按惯例指向已有键、不新起
    expect(Object.keys(原值).length).toBe(68);
    const 表内键 = new Set(全部.flatMap((表) => Object.values(表)));
    const 只钉在表外的 = Object.keys(原值).filter((k) => !表内键.has(k));
    expect(只钉在表外的, '原值里出现了表里没有的键').toEqual(['pad_stick_label']);
  });

  it('反向控制：同一把尺子量假键必须点名（防这条判据根本不动）', () => {
    expect(缺登记({ roll: 'kb_label_roll', jump: 'kb_label_不存在' }))
      .toEqual(['中文表缺 "kb_label_不存在"（jump）', '英文表缺 "kb_label_不存在"（jump）']);
    expect(缺登记({ roll: 'kb_label_roll' })).toEqual([]);
  });
});

describe('撞车的六格指向已有键（同一份文案最多两个键）', () => {
  it('日志 / 性能面板 / 保存 / 设置 / 弹反 / 快速旅行不新起同文案的键', () => {
    expect(UI_HOTKEY_LABELS.journal).toBe('journal_title');
    expect(UI_HOTKEY_LABELS.perfHud).toBe('start_perf');
    expect(UI_HOTKEY_LABELS.save).toBe('common_save');
    expect(UI_HOTKEY_LABELS.settings).toBe('settings_title');
    expect(KEY_ACTION_LABELS.parry).toBe('style_label_parry');
    expect(KEY_ACTION_LABELS.fastTravel).toBe('fast_travel_title');
    expect(PAD_BUTTON_LABELS.select).toBe('upgrade_back');
  });
});

describe('迁移原值钉死：换的是住址，不是玩家读到的字', () => {
  it('75 个键逐一展开，与迁移前逐字相等', () => {
    for (const [键, 原] of Object.entries(原值)) {
      if (键 === 'pad_stick_label') continue;   // 插值句在行为腿里钉
      expect(t(键), `${键} 展开后与迁移前不同`).toBe(原);
    }
  });
});

describe('静态腿：六张表的表体里不许再有裸中文', () => {
  it('剥掉注释后不含中文字符', () => {
    for (const [file, name] of 六张表) {
      const 无注释 = 表块(file, name)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(无注释, `${file} 的 ${name} 里又出现裸中文了`).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });
});

describe('静态腿：换语言要重绘键位区', () => {
  it('语言切换的 change 里，applyToGame 之后跟着 refreshKeybinds', () => {
    // 该文件工作区是 CRLF：先归一成 LF 再比形状（与 git 的 autocrlf 无关，只是别让换行符咬人）
    const 源码 = readFileSync(join(process.cwd(), 'src/ui/SettingsPanel.js'), 'utf8').replace(/\r\n/g, '\n');
    expect(源码).toContain("s.applyToGame(this.game);\n        // 键位区的动作名是 JS 现算的 t()（W-D2 切片18）");
    expect(源码).toContain('this.refreshKeybinds();');
  });
});

describe('行为腿：四个出口函数返回的是展开句', () => {
  it('中文：键码 / 鼠标 / 手柄按钮 / 摇杆句式', () => {
    expect(keyLabel('ControlLeft')).toBe('左 Ctrl');
    expect(keyLabel('Space')).toBe('空格');
    expect(keyLabel('KeyF')).toBe('F');            // 没列到的走正则，不查表
    expect(mouseLabel('left')).toBe('鼠标左键');
    expect(padButtonLabel('leftStick')).toBe('左摇杆按下');
    expect(padButtonLabel('nope')).toBe('nope');   // 未列到的原样显示，不留空白
    expect(padStickLabel('up')).toBe('左摇杆 ↑ + 十字键 ↑');
    expect(padStickLabel('nonsense')).toBe('左摇杆 ? + 十字键 ?');
  });

  it('英文：同一批出口返回英文（键真的接着两张表）', () => {
    const 原语言 = getLanguage();
    try {
      setLanguage('en');
      expect(keyLabel('ControlLeft')).toBe('Left Ctrl');
      expect(keyLabel('Space')).toBe('Space');
      expect(mouseLabel('left')).toBe('Left Mouse');
      expect(padButtonLabel('leftStick')).toBe('Left Stick Click');
      expect(padButtonLabel('dpadUp')).toBe('D-pad ↑');
      expect(padStickLabel('up')).toBe('Left stick ↑ + D-pad ↑');
      expect(t('style_label_parry')).toBe('Parry');   // 弹反那格指向既有键，不新起
      expect(t('hotkey_label_help')).toBe('Help Manual');
      expect(t('kb_label_confirm')).toBe('UI Confirm');
    } finally {
      setLanguage(原语言);
    }
  });
});