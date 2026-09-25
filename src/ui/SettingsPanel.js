import { UI_HOTKEYS, UI_HOTKEY_LABELS } from '../content/hotkeys.js';
import { GAMEPAD_BINDINGS, KEY_BINDINGS, KEY_ACTION_LABELS, buildBindingTables } from '../content/keybinds.js';
import { keyLabel, padButtonLabel, padStickLabel, MOUSE_LABELS } from '../content/keyLabels.js';
import { focusFirstItem, restoreParkedFocus } from './FocusNav.js';

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
    const sh = document.getElementById('set-shadows');
    sh?.addEventListener('change', () => {
      s.set('shadows', sh.checked);
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
        // 两格覆盖包一起清：只清键盘那半的话，"恢复默认键位"之后手柄仍是改过的
        this.game.settings.set('keybinds', {});
        this.game.settings.set('gamepadBinds', {});
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
      buildBindingTables(overrides, UI_HOTKEYS, this._padOverrides());
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

  /**
   * 手柄捕获的落点：桥在"按下并松手"那一帧把按钮名交上来。
   *
   * 与键盘那条同一纪律 —— 先校验再写盘，校验不过只 toast 一句、表原样不动，
   * 于是"面板放过的组合"与"游戏接受的组合"永远是同一批（切片5 的 B47 就是这么来的）。
   */
  capturePadButton(name) {
    const action = this.capturingPad;
    this.setPadCapturing(null);
    if (!action) return;
    const overrides = { ...this._padOverrides(), [action]: name };
    try {
      buildBindingTables(this.game.settings.get('keybinds') ?? {}, UI_HOTKEYS, overrides);
    } catch {
      this.game.dialog?.toast(`该手柄按键无效或已被别的动作占用：${padButtonLabel(name)}`);
      return this.refreshKeybinds();
    }
    this.game.settings.set('gamepadBinds', overrides);
    this.game.rebuildHotkeys();
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
    const sh = document.getElementById('set-shadows');
    if (sh) sh.checked = d.shadows;
    this.refreshKeybinds();
  }

  refreshKeybinds() {
    const host = document.getElementById('set-keybinds');
    if (!host) return;
    const table = this.game.hotkeyTable ?? UI_HOTKEYS;
    const keys = this.game.keybindTable ?? KEY_BINDINGS;
    // 手柄表按"这一行问哪个动作"索引：`pauseMenu` 那格冒充的是热键 `escape`，所以
    // 匹配键是 `hotkey ?? action` —— 否则暂停菜单那一行的手柄列会是空的（第三真源的老路）
    const pads = Object.values(this.game.padTable ?? GAMEPAD_BINDINGS);
    const padFor = (rowAction) => pads.find((e) => (e.hotkey ?? e.action) === rowAction) ?? null;
    const rows = table.map((e) => this.keybindRow(e.action, UI_HOTKEY_LABELS[e.action] ?? e.action, e, padFor(e.action)));
    rows.push('<h4 class="keybind-group">移动与战斗</h4>');
    for (const [action, binding] of Object.entries(keys)) {
      rows.push(this.keybindRow(action, KEY_ACTION_LABELS[action] ?? action, binding, padFor(action)));
    }
    rows.push('<button type="button" id="keybind-reset">恢复默认键位</button>');
    host.innerHTML = `<div class="keybind-row keybind-head"><span class="keybind-name">动作</span>`
      + '<span class="keybind-pad">键盘 / 鼠标</span><span class="keybind-pad">手柄</span>'
      + '<span class="keybind-hint">等价键</span></div>' + rows.join('');
  }

  /**
   * 一行键位。三张表都走这里（切片5 之后游戏键也能改，切片9 连手柄那一列也能改）：
   * 只绑了鼠标的那格显示"鼠标左/右键"，把它改绑成键盘键之后鼠标那一侧自动失效 ——
   * 出口只有一个真源，不存在"两个键都在办这件事"。
   * 别名（右 Ctrl / 右 Shift）是同一条动作的等价入口，写在提示里而不是多一列按钮。
   */
  keybindRow(action, label, binding, padEntry) {
    const shown = this.capturing === action
      ? '按下要绑定的键（再点一次取消）'
      : this.capturingPad === action
        ? '按下要绑定的手柄键，松手即绑定（再点一次取消）'
        : (binding.aliases ?? []).map((c) => keyLabel(c)).join(' / ');
    const out = binding.code ?? MOUSE_LABELS[binding.mouse] ?? '未绑定';
    return `<div class="keybind-row"><span class="keybind-name">${label}</span>`
      + `<button type="button" data-keybind="${action}">${keyLabel(out)}</button>`
      + this.padCell(action, padEntry)
      + `<span class="keybind-hint">${shown}</span></div>`;
  }

  /**
   * 一行的手柄那一格。三种状态：这条动作手柄上没有（`—`）、走摇杆（写死的说明，不给按钮），
   * 或者可改绑（按钮上显示当前按钮名）。
   * 按钮名过的是 `PAD_BUTTON` 枚举校验，所以这里拼进 DOM 的字样全部来自标签表 ——
   * 键盘那一侧要过正则才敢拼，这一侧连拼玩家输入的机会都没有。
   */
  padCell(action, entry) {
    if (!entry) return '<span class="keybind-pad keybind-pad-none">—</span>';
    if (entry.button === undefined) {
      return `<span class="keybind-pad keybind-pad-fixed">${padStickLabel(entry.dir)}</span>`;
    }
    return `<button type="button" class="keybind-pad" data-padbind="${action}">${padButtonLabel(entry.button)}</button>`;
  }
}
