import { UI_HOTKEYS, UI_HOTKEY_LABELS } from '../content/hotkeys.js';
import {
  GAMEPAD_BINDINGS, KEY_BINDINGS, KEY_ACTION_LABELS, PAD_ONLY_ACTION_LABELS, UI_GAMEPAD_BINDINGS,
  buildBindingTables, padButtonOwner, padCellButtonName, padOnlyPadActions, padScopeOf,
} from '../content/keybinds.js';
import { keyLabel, padButtonLabel, padStickLabel, MOUSE_LABELS } from '../content/keyLabels.js';
import { PAD_TUNING, padTuning } from '../content/keybinds.js';
import { SHADOW_QUALITY_SIZES, normalizeShadowQuality } from '../engine/shadowPolicy.js';
import { MSAA_SAMPLES, normalizeMsaaSamples } from '../engine/aaPolicy.js';
import { SSAO_QUALITY_NAMES, normalizeSsaoQuality } from '../engine/ssaoSettings.js';
import { PRESET_NAMES } from '../engine/graphicsPresets.js';
import { LANGUAGES } from '../engine/i18n.js';
import { colorVisionOptions } from '../game/ColorVision.js';
import { difficultyOptions } from '../game/Difficulty.js';
import { LOOK_SENSITIVITY, normalizeLookSensitivity } from '../engine/lookSensitivity.js';
import { focusFirstItem, preserveFocus, restoreParkedFocus } from './FocusNav.js';

/** 驼峰边界：`analogRange` → `analog-range`（滑杆 id 的连字符写法就从键名推） */
const CAMEL_EDGE = /[A-Z]/g;

/**
 * 一根手感旋钮在壳页里的那一格叫什么：id 从 `PAD_TUNING` 的**键名**推出来（连字符写法）。
 *
 * 为什么不留一张 `key → id` 的手抄表：那张表与旋钮表是两份，加一格旋钮就得同步两处，
 * 而漏掉的那一处不会报错 —— 面板照开，只是那一格永远拖不动（`knob()` 找不到元素就安静返回）。
 * 所以 id 只有一个来源，测试也照着它反查壳页（双向：表里有的必须画得出、画出来的必须在表里）。
 */
export const padKnobId = (key) => `set-${key.replace(CAMEL_EDGE, (m) => `-${m.toLowerCase()}`)}`;

/**
 * 动作的人话名：键盘侧标签表优先，只有手柄有的那格（`confirm`）查"手柄专属"那张，
 * 两张都没有就老实退回动作名。toast 里点名"谁和谁换了"用的就是这个名字 ——
 * 给玩家看 `parry` 不等于给玩家看事实（B47 那一族：显示与行为分家）。
 */
const actionLabel = (action) => KEY_ACTION_LABELS[action] ?? PAD_ONLY_ACTION_LABELS[action] ?? action;

export class SettingsPanel {
  constructor(game) {
    this.game = game;
    this.panel = document.getElementById('settings-panel');
    this.open = false;
    /** 正在等玩家按下一个键的动作名（null = 没在等） */
    this.capturing = null;
    /** 正在等玩家按下一个手柄键的动作名（与键盘那半互斥，同一时刻只等一件事） */
    this.capturingPad = null;
    this._onCaptureKey = (e) => this.captureKey(e);
    this._onCapturePad = (name) => this.capturePadButton(name);
    document.getElementById('settings-close')?.addEventListener('click', () => this.hide());
    this.bindControls();
    this.bindKeybinds();
  }

  bindControls() {
    const s = this.game.settings;
    const bind = (id, key, parse = Number) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        s.set(key, parse(el.value));
        s.applyToGame(this.game);
      });
    };
    bind('set-master-vol', 'masterVolume', Number);
    bind('set-sfx-vol', 'sfxVolume', Number);
    bind('set-bloom', 'bloomStrength', Number);
    bind('set-pixel', 'pixelRatio', Number);
    bind('set-lod', 'enemyLodDistance', Number);
    // 鼠标镜头灵敏度（W-D6 切片7）：一根滑杆，倍率不是绝对值。
    // min/max/step 从 `LOOK_SENSITIVITY` 灌进来、不抄进 HTML —— 抄了就会漏：
    // 改了量程而 HTML 不动，玩家拖到头会被 `normalizeLookSensitivity` 当成脏值悄悄夹回去。
    const look = document.getElementById('set-look-sensitivity');
    if (look) {
      look.min = String(LOOK_SENSITIVITY.scaleMin);
      look.max = String(LOOK_SENSITIVITY.scaleMax);
      look.step = String(LOOK_SENSITIVITY.scaleStep);
      look.value = String(normalizeLookSensitivity(s.get('lookSensitivity')));
      look.addEventListener('input', () => {
        s.set('lookSensitivity', normalizeLookSensitivity(Number(look.value)));
        s.applyToGame(this.game);
      });
    }
    // 手感旋钮（切片15 起三根，切片21 再加三根）。滑杆的 min/max/step 由 `PAD_TUNING` 灌进来、
    // 名单也从那里现推：
    // 1. "滑到头的那个值"与"桥认的那个值"必须是同一份，否则玩家拖到底会被当成脏数据悄悄回落；
    // 2. "这一格画没画"也不能由面板抄一份名单 —— 抄了就会漏抄，漏抄的表现不是报错而是拖不动。
    const knob = (key) => {
      const el = document.getElementById(padKnobId(key));
      if (!el) return;
      const spec = PAD_TUNING[key];
      el.min = String(spec.min);
      el.max = String(spec.max);
      el.step = String(spec.step);
      el.addEventListener('input', () => {
        s.set('padTuning', padTuning({ ...s.get('padTuning'), [key]: Number(el.value) }));
        s.applyToGame(this.game);
      });
    };
    for (const key of Object.keys(PAD_TUNING)) knob(key);
    const sh = document.getElementById('set-shadows');
    sh?.addEventListener('change', () => {
      s.set('shadows', sh.checked);
      s.applyToGame(this.game);
    });
    // 字幕开关（W-D6 切片8）：与阴影同一副骨架（checkbox + change + set + applyToGame）。
    // 只认 `checked` 的布尔，不走 `bind()` 的 `Number` —— 那不是数值滑杆，
    // 而存储里一个 `"0"` 会被 Number 成 0（看着像关，其实是真的关，只是路径不同）。
    const cap = document.getElementById('set-captions');
    cap?.addEventListener('change', () => {
      s.set('captions', cap.checked === true);
      s.applyToGame(this.game);
    });
    // 阴影精度档（W-C3 切片2）：三档下拉。选项**从名册现推**而不是在 HTML 里抄一份 ——
    // 抄了就会漏：名册加一档，面板上没有那一格，玩家永远选不到，也没有任何报错。
    const sq = document.getElementById('set-shadow-quality');
    if (sq) {
      for (const size of SHADOW_QUALITY_SIZES) {
        const opt = document.createElement('option');
        opt.value = String(size);
        opt.textContent = `${size}`;
        sq.appendChild(opt);
      }
      sq.addEventListener('change', () => {
        s.set('shadowQuality', Number(sq.value));
        s.applyToGame(this.game);
      });
    }
    // 抗锯齿档（W-C4 切片1）：与阴影精度档同一套纪律 —— 选项从名册现推，
    // 名册改了面板自动跟上；落地只走 `applyToGame`，面板不直接碰 composer
    const ms = document.getElementById('set-msaa');
    if (ms) {
      for (const n of MSAA_SAMPLES) {
        const opt = document.createElement('option');
        opt.value = String(n);
        opt.textContent = n === 0 ? '关' : `${n}x`;
        ms.appendChild(opt);
      }
      ms.addEventListener('change', () => {
        s.set('msaaSamples', Number(ms.value));
        s.applyToGame(this.game);
      });
    }
    // 画质预设（W-D3 切片1）：低/中/高三档一键切换。选项从名册现推，
    // 选了之后一次性把 shadowQuality / msaaSamples / ssaoQuality / pixelRatio / bloomStrength / enemyLodDistance 推到目标值。
    // 玩家仍可微调单格 —— 预设只负责"推过去"，不负责锁死。
    const gp = document.getElementById('set-graphics-preset');
    if (gp) {
      for (const name of PRESET_NAMES) {
        const opt = document.createElement('option');
        opt.value = name;
        // 显示给玩家的档位名：首字母大写（low → Low）
        opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        gp.appendChild(opt);
      }
      gp.addEventListener('change', () => {
        s.applyGraphicsPreset(gp.value, this.game);
        // 重新渲染键位区（各画质格的值变了，虽然它们不在键位区，但保持一致性）
        this.refreshKeybinds();
      });
    }
    // 语言切换（W-D2 切片2）：选项从 `LANGUAGES` 现推（加一门语言只改那一处），
    // 落地走 `applyToGame` —— 它内部先 `setLanguage` 再走查 DOM（`applyTranslations`），
    // 所以"换语言"只需要写这一格，DOM 文案与 JS 侧 `t()` 同步跟着走。
    const lang = document.getElementById('set-language');
    if (lang) {
      for (const { code, label } of LANGUAGES) {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = label;
        lang.appendChild(opt);
      }
      lang.value = s.get('language');
      lang.addEventListener('change', () => {
        s.set('language', lang.value);
        s.applyToGame(this.game);
      });
    }
    // 难度档（W-E1 切片2）：与语言档同一套纪律 —— 选项从名册现推（`difficultyOptions()`，
    // HTML 不抄第二份：抄了就会漏，漏一格的表现是"那一档在面板里选不到"而不是报错），
    // 落地只走 applyToGame（换档的写入口只有 `setDifficulty` 一个，面板不直接碰运行时）。
    const diff = document.getElementById('set-difficulty');
    if (diff) {
      for (const { id, label } of difficultyOptions()) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = label;
        diff.appendChild(opt);
      }
      diff.value = s.get('difficulty');
      diff.addEventListener('change', () => {
        s.set('difficulty', diff.value);
        s.applyToGame(this.game);
      });
    }

    // 色觉档（W-D6 切片3）：与难度档同一套纪律 —— 选项从名册现推（`colorVisionOptions()`，
    // HTML 不抄第二份），落地只走 applyToGame（写入口只有 `setColorVision` 一个，
    // 面板不直接碰运行时）。换档对场上掉落的重涂在 `LootSystem.update` 里。
    const cv = document.getElementById('set-colorvision');
    if (cv) {
      for (const { id, label } of colorVisionOptions()) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = label;
        cv.appendChild(opt);
      }
      cv.value = s.get('colorVision');
      cv.addEventListener('change', () => {
        s.set('colorVision', cv.value);
        s.applyToGame(this.game);
      });
    }
    // SSAO 档（W-C4 切片5）：与抗锯齿档同一套纪律 —— 选项从名册现推（HTML 不抄第二份），
    // 落地只走 applyToGame（挂/摘/换档收口在 setSsaoQuality），面板不直接碰 composer
    const ssao = document.getElementById('set-ssao');
    if (ssao) {
      for (const name of SSAO_QUALITY_NAMES) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = { off: '关', low: '低', medium: '中', high: '高' }[name] ?? name;
        ssao.appendChild(opt);
      }
      ssao.addEventListener('change', () => {
        s.set('ssaoQuality', ssao.value);
        s.applyToGame(this.game);
      });
    }    /* 震动（切片17）：走的还是"写设置 → `applyToGame`"那一条，面板自己不碰马达 ——
     * 否则"这一格开关到底管着谁"就有两个答案，而关掉的开关漏出一次震动是最难查的那种bug */
    const vib = document.getElementById('set-vibration');
    vib?.addEventListener('change', () => {
      s.set('vibration', vib.checked);
      s.applyToGame(this.game);
    });
  }

  /**
   * 键位区：委托监听只挂一次，重绘只换行内容 —— 每行各挂一个监听器的那种写法，
   * 面板开合十次就留下十倍的僵尸监听（W-B 的台账正是为此而设）。
   */
  bindKeybinds() {
    const host = document.getElementById('set-keybinds');
    if (!host) return;
    host.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('[data-keybind],[data-padbind],#keybind-reset');
      if (!btn) return;
      if (btn.id === 'keybind-reset') {
        this.setCapturing(null);
        this.setPadCapturing(null);
        // 三格覆盖包一起清：只清键盘那半的话，"恢复默认键位"之后手柄仍是改过的；
        // 少清界面那格同理 —— 玩家按"恢复默认"期待的是回到出厂，不是"两张表里的一张"
        this.game.settings.set('keybinds', {});
        this.game.settings.set('gamepadBinds', {});
        this.game.settings.set('gamepadUiBinds', {});
        this.game.rebuildHotkeys();
        return this.refreshKeybinds();
      }
      if (btn.dataset.padbind) {
        const action = btn.dataset.padbind;
        this.setPadCapturing(this.capturingPad === action ? null : action);   // 再点一次取消
        return this.refreshKeybinds();
      }
      const action = btn.dataset.keybind;
      this.setCapturing(this.capturing === action ? null : action);   // 再点一次取消
      this.refreshKeybinds();
    });
  }

  captureKey(e) {
    e.preventDefault();
    e.stopPropagation();          // 别让它同时被 Game 记成一次真实按下
    const action = this.capturing;
    this.setCapturing(null);
    if (!action) return;
    const overrides = { ...(this.game.settings.get('keybinds') ?? {}), [action]: e.code };
    try {
      // 与 Game.rebuildHotkeys 同一条校验：面板放过的组合必须恰好是游戏会接受的
      buildBindingTables(overrides, UI_HOTKEYS, this._padOverrides(), this._uiPadOverrides());
    } catch {
      this.game.dialog?.toast(`该键位无效或已被别的动作占用：${keyLabel(e.code)}`);
      return this.refreshKeybinds();
    }
    this.game.settings.set('keybinds', overrides);
    this.game.rebuildHotkeys();
    this.refreshKeybinds();
  }

  _padOverrides() {
    return this.game.settings.get('gamepadBinds') ?? {};
  }

  /** 界面态那张表的覆盖包（切片23）：与战斗那格分两格存，理由见 `SettingsManager` */
  _uiPadOverrides() {
    return this.game.settings.get('gamepadUiBinds') ?? {};
  }

  /**
   * 手柄捕获的落点：桥在"按下并松手"那一帧把按钮名交上来。
   *
   * 与键盘那条同一纪律 —— 先校验再写盘，校验不过只 toast 一句、表原样不动，
   * 于是"面板放过的组合"与"游戏接受的组合"永远是同一批（切片5 的 B47 就是这么来的）。
   *
   * `action` 是**条目自己的动作名**（切片23）：面板给的那格写的就是它，所以这里能直接问
   * `padScopeOf` 该落进哪一格覆盖包。以前写的是"行的动作名"，于是 `pauseMenu` 那一格
   * 落成 `{escape: ...}` —— 两张表都不认识 `escape`，玩家点那颗 Start 必然只得到"无效"（B54）。
   *
   * **按下已被占用的按钮 = 交换**（切片31）。出厂战斗表 16 格把 16 枚按钮认领满，
   * 一枚空槽都不剩：只许"改到没人要的按钮"等于手柄改绑整片按不动（每一次捕获都回一句占用）。
   * 交换把前主人搬进捕获动作原来那枚按钮，两条不变式同时守住：一枚按钮一个主人（B51），
   * 每个动作仍有出口（B61 —— "没有按钮的动作"就是"这条路从来没被定义"）。
   * 为什么不是"抢过来"（前主人失去按钮）：那正是这一片要消灭的形状。
   * 换不成仍然拒：前主人是摇杆格（移动那四格）时让它改绑单键是场减法，校验会抛，照旧只 toast。
   */
  capturePadButton(name) {
    const action = this.capturingPad;
    this.setPadCapturing(null);
    if (!action) return;
    const ui = padScopeOf(action) === 'ui';
    const key = ui ? 'gamepadUiBinds' : 'gamepadBinds';
    const table = (ui ? this.game.uiPadTable : this.game.padTable)
      ?? (ui ? UI_GAMEPAD_BINDINGS : GAMEPAD_BINDINGS);
    const overrides = { ...(ui ? this._uiPadOverrides() : this._padOverrides()), [action]: name };
    const owner = padButtonOwner(table, name);
    // 主人就是自己 = 把这一格按回它原来那枚，不该顺手把别人也搬一次
    const partner = owner && owner !== action ? owner : null;
    // 前主人拿的是**捕获动作现在**占着的那枚（不是它自己的旧值 —— 它的旧值就是 `name`，
    // 那样写等于两格都指向同一枚按钮，校验会把整包拒掉）
    const mine = padCellButtonName(table, action);
    if (partner) overrides[partner] = mine;
    const keyboard = this.game.settings.get('keybinds') ?? {};
    try {
      buildBindingTables(keyboard, UI_HOTKEYS,
        ui ? this._padOverrides() : overrides,
        ui ? overrides : this._uiPadOverrides());
    } catch {
      // 换不成（前主人是摇杆格那种）就一格都不写：半个交换比不换更难查
      const why = owner
        ? `${padButtonLabel(name)} 归${actionLabel(owner)}，而那一格的出口挂在摇杆上，让不出这一枚按钮`
        : `${padButtonLabel(name)} 不是这张表认得的按钮`;
      this.game.dialog?.toast(`该手柄按键无效或已被别的动作占用：${why}`);
      return this.refreshKeybinds();
    }
    this.game.settings.set(key, overrides);
    this.game.rebuildHotkeys();
    if (partner) {
      this.game.dialog?.toast(`已与"${actionLabel(partner)}"交换：${padButtonLabel(name)} 归${actionLabel(action)}，`
        + `${padButtonLabel(mine)} 归${actionLabel(partner)}`);
    }
    this.refreshKeybinds();
  }

  /**
   * 等待按键的那一小段时间才挂监听，离开立刻摘掉（同一个函数引用 + 同一个 capture 标志，
   * 浏览器不会重复登记）。捕获用 capture 阶段 + `stopPropagation`：Game 的监听在冒泡阶段，
   * 于是这一下只用于绑定，不会被记成一次真实按键。
   */
  setCapturing(action) {
    if (action) this.setPadCapturing(null);      // 同一时刻只等一件事
    this.capturing = action;
    if (action) window.addEventListener('keydown', this._onCaptureKey, true);
    else window.removeEventListener('keydown', this._onCaptureKey, true);
  }

  /**
   * 等一枚手柄键：不挂监听，而是让桥在轮询里替我们看（手柄没有 keydown 事件，
   * 每帧读一次 `navigator.getGamepads()` 才有"现在按着什么"这件事 —— 切片1 的立片理由）。
   */
  setPadCapturing(action) {
    if (action) this.setCapturing(null);
    this.capturingPad = action;
    const pad = this.game.padInput;
    if (!pad) return;
    if (action) pad.startCapture(this._onCapturePad);
    else pad.stopCapture();
  }

  show() {
    this.open = true;
    this.panel?.classList.remove('hidden');
    document.exitPointerLock?.();
    this.refresh();
    // 先 refresh 再落焦：键位那几十格是 `refreshKeybinds()` 现拼的，早一步清单还是旧的
    focusFirstItem(this.panel);
  }

  hide() {
    this.open = false;
    this.setCapturing(null);
    this.setPadCapturing(null);   // 桥那边还留着捕获回调的话，下一次按手柄会被静默吃掉
    this.panel?.classList.add('hidden');
    // 从暂停菜单进来时菜单只是让位（切片12）：这里退回去，焦点落回当初选中那一格。
    // 从野外直接进来（`F10`）没有来路，那一格账是空的，焦点就留在原地不动。
    restoreParkedFocus();
  }

  refresh() {
    const d = this.game.settings.data;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('set-master-vol', d.masterVolume);
    set('set-sfx-vol', d.sfxVolume);
    set('set-bloom', d.bloomStrength);
    set('set-pixel', d.pixelRatio);
    set('set-lod', d.enemyLodDistance);
    // 回显的也是清洗过的值：脏档会显示成出厂那一格（与 padTuning 的回显同一纪律）
    set('set-look-sensitivity', normalizeLookSensitivity(d.lookSensitivity));
    const t = padTuning(d.padTuning);      // 回显的也是清洗过的值：脏档会显示成出厂那一格
    for (const key of Object.keys(PAD_TUNING)) set(padKnobId(key), t[key]);
    const sh = document.getElementById('set-shadows');
    if (sh) sh.checked = d.shadows;
    // 回显的也是"真的勾上才算开"：与 `applyToGame` 里 `=== true` 同一个判据（同一个取值口）。
    // 若这里改成看 `d.captions === true` 之外的形状，就会出现"框没勾、字幕却在弹"（B47 那一族）。
    const cap = document.getElementById('set-captions');
    if (cap) cap.checked = this.game.settings.get('captions') === true;
    // 回显的也是清洗过的值：脏档会显示成出厂那一格（与 `padTuning` 的回显同一纪律）
    set('set-shadow-quality', normalizeShadowQuality(d.shadowQuality));
    set('set-msaa', normalizeMsaaSamples(d.msaaSamples));
    set('set-ssao', normalizeSsaoQuality(d.ssaoQuality));
    /* 震动那一格问的是 `settings.get()`，与 `applyToGame` 用的是同一个判据（同一个取值口）：
     * 若这里改成看 `d.vibration === true`，那么一格存成 `null` 时会出现"框没勾、手柄还在震" ——
     * 显示与行为分家正是 B47 那一族的入口。 */
    const vib = document.getElementById('set-vibration');
    if (vib) vib.checked = this.game.settings.get('vibration') === true;
    this.refreshKeybinds();
  }

  refreshKeybinds() {
    const host = document.getElementById('set-keybinds');
    if (!host) return;
    const table = this.game.hotkeyTable ?? UI_HOTKEYS;
    const keys = this.game.keybindTable ?? KEY_BINDINGS;
    // 手柄表按"这一行问哪个动作"索引：`pauseMenu` 那格冒充的是热键 `escape`，所以
    // 匹配键是 `hotkey ?? action` —— 否则暂停菜单那一行的手柄列会是空的（第三真源的老路）
    const combat = Object.values(this.game.padTable ?? GAMEPAD_BINDINGS).map((e) => ({ ...e, ui: false }));
    // 界面态那张表也要问（切片20）：以前只查战斗表，于是"面板焦点上移"那四行写着 `—`，
    // 而玩家推摇杆、按十字键都真的在走格 —— 显示与行为各说各话正是 B47 那一族。
    // 两表的条目都**不抄标签**：字样一律现算（`padButtonLabel` / `padStickLabel`）。
    const ui = Object.values(this.game.uiPadTable ?? UI_GAMEPAD_BINDINGS).map((e) => ({ ...e, ui: true }));
    const pads = [...combat, ...ui];
    const padFor = (rowAction) => pads.filter((e) => (e.hotkey ?? e.action) === rowAction);
    const rows = table.map((e) => this.keybindRow(e.action, UI_HOTKEY_LABELS[e.action] ?? e.action, e, padFor(e.action)));
    rows.push('<h4 class="keybind-group">移动与战斗</h4>');
    for (const [action, binding] of Object.entries(keys)) {
      rows.push(this.keybindRow(action, KEY_ACTION_LABELS[action] ?? action, binding, padFor(action)));
    }
    /* 只有手柄有的那几格（切片25）：`confirm` 不冒充任何键盘键，所以它既不在热键表也不在游戏键表里，
     * 过去在清单上根本没有位置 —— 玩家的 A 在界面里干什么，看板上是查无此格。名单从表推
     * （`padOnlyPadActions` 与它自己那条自检同一条判据），这里一份都不抄。 */
    const only = padOnlyPadActions();
    if (only.length) {
      rows.push('<h4 class="keybind-group">界面（手柄专属）</h4>');
      for (const action of only) {
        rows.push(this.keybindRow(action, PAD_ONLY_ACTION_LABELS[action], null, padFor(action)));
      }
    }
    rows.push('<button type="button" id="keybind-reset">恢复默认键位</button>');
    // 重绘整张清单会销毁玩家正停着的那一格（切片28 / B58 的同一个形状）：
    // 点一颗手柄入口进入等待态、捕获回来之后清单就换了一批节点 —— 没有这一步，焦点掉回 `body`
    preserveFocus(host, () => {
      host.innerHTML = `<div class="keybind-row keybind-head"><span class="keybind-name">动作</span>`
        + '<span class="keybind-pad">键盘 / 鼠标</span><span class="keybind-pad">手柄</span>'
        + '<span class="keybind-hint">等价键</span></div>' + rows.join('');
    });
  }

  /**
   * 一行键位。三张表都走这里（切片5 之后游戏键也能改，切片9 连手柄那一列也能改）：
   * 只绑了鼠标的那格显示"鼠标左/右键"，把它改绑成键盘键之后鼠标那一侧自动失效 ——
   * 出口只有一个真源，不存在"两个键都在办这件事"。
   * 别名（右 Ctrl / 右 Shift）是同一条动作的等价入口，写在提示里而不是多一列按钮。
   *
   * `binding` 给 `null` 是切片25 新增的那一型：**这一格只有手柄有**（`confirm` 不冒充任何键盘
   * 键，B52 的纪律）。键盘那一格于是老老实实写 `—` 而**不给按钮** —— 给了就是 B54 的键盘侧镜像：
   * 点它 → `keybinds.confirm` → `partitionOverrides` 认不出来 → 玩家按什么都只得到"无效"。
   */
  keybindRow(action, label, binding, padEntries) {
    // "在等哪一枚"问的是**条目**的动作名（切片23）：一行可能挂着战斗与界面两条，
    // 提示只在该条目被点的那一格亮起 —— 比"整行都亮"少一桩误会（玩家会以为按了算两格）
    const waitingPad = (padEntries ?? []).some((e) => e.action === this.capturingPad);
    const shown = this.capturing === action
      ? '按下要绑定的键（再点一次取消）'
      : waitingPad
        ? '按下要绑定的手柄键，松手即绑定（再点一次取消）'
        : binding
          ? (binding.aliases ?? []).map((c) => keyLabel(c)).join(' / ')
          : '激活交给浏览器原生 Enter / 空格（这一格不冒充键盘键）';
    const keyCell = binding
      ? `<button type="button" data-keybind="${action}">${keyLabel(binding.code ?? MOUSE_LABELS[binding.mouse] ?? '未绑定')}</button>`
      // 禁用格而不是一个 `<span>`：这一列的宽度挂在按钮上（真浏览器读数里普通行的键盘格是 398px，
      // 而 span 只有 13px —— 手柄那一列会被撑到 294px，整行从此不与其它行对齐）。
      // `disabled` 又同时满足了另外两件事：`navItems` 的 `:not([disabled])` 不会把焦点交给它，
      // 而它也点不动 —— 不会写成 `keybinds.confirm` 那种表里不认识的名字（B54）
      : `<button type="button" class="keybind-key-none" disabled>—</button>`;
    return `<div class="keybind-row"><span class="keybind-name">${label}</span>`
      + keyCell
      + this.padCell(action, padEntries)
      + `<span class="keybind-hint">${shown}</span></div>`;
  }

  /**
   * 一行的手柄那一格。切片20 起**一行可以有两个上下文**的入口：战斗里 Start 开菜单，
   * 界面里 B 返回、Start 开菜单 —— 这是事实，不是冲突（同一帧只有一张表在被轮询，
   * 判据在 `Game.padUiMode()` 那一处）。四种样子：
   * - 两张表都不认领这一行 → `—`；
   * - **按钮格**（两张表都一样）→ 可点的入口，字样是这一枚按钮的标签，界面那一格带"界面"两个字；
   * - **摇杆格**（两张表都一样）→ 写死的说明：改绑要换的是"axis 对 + 方向"，与单键覆盖不是一个形状；
   * - 说明格也带着列类名 `keybind-pad`：切片20 头一版只给了 `keybind-pad-part`，于是"界面"那一格
   *   独自在行里时**不在手柄那一列上**（列宽与居中都没有，真浏览器读数里那四行的手柄格是查无此格）。
   *   合成一格时在列内部由 CSS 撤掉那个列宽，不给行加宽。
   * 两种都有时合成一格（外层 `keybind-pad-combo`）：让第五列把行尾的提示挤走是新的对不齐。
   * 按钮名过的是 `PAD_BUTTON` 枚举校验，所以这里拼进 DOM 的字样全部来自标签表 ——
   * 键盘那一侧要过正则才敢拼，这一侧连拼玩家输入的机会都没有。
   */
  padCell(action, entries) {
    const parts = (entries ?? []).map((e) => this.padChip(e));
    if (!parts.length) return '<span class="keybind-pad keybind-pad-none">—</span>';
    if (parts.length === 1) return parts[0];
    return `<span class="keybind-pad keybind-pad-combo">${parts.join('')}</span>`;
  }

  /**
   * 一条手柄条目 → 一格。**键是条目自己的动作名**（切片23，修 B54）：以前这里拼的是
   * "行的动作名"，而 `pauseMenu` 那一格冒充的热键叫 `escape` —— 于是点它之后写进覆盖包的是
   * `{escape: ...}`，两张表都不认识这个名字，玩家按任何一枚键都只得到"该手柄按键无效"。
   * 一行里可能同时有战斗与界面两条（`escape` 那行今天三条），它们的动作名互不相同。
   */
  padChip(entry) {
    const label = `${entry.ui ? '界面 ' : ''}${this.padChipLabel(entry)}`;
    const part = entry.ui ? ' keybind-pad-part' : '';
    if (entry.button !== undefined) {
      return `<button type="button" class="keybind-pad${part}" data-padbind="${entry.action}">${label}</button>`;
    }
    return `<span class="keybind-pad keybind-pad-${entry.ui ? 'part' : 'fixed'}">${label}</span>`;
  }

  /** 条目 → 字样：摇杆格问 `padStickLabel`、按钮格问 `padButtonLabel`，面板里一份算式都不抄 */
  padChipLabel(entry) {
    return entry.button === undefined ? padStickLabel(entry.dir) : padButtonLabel(entry.button);
  }
}
