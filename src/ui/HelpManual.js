/** 游戏内说明书 — 由 UI 热键表的 `help` 动作打开（F12 是浏览器控制台，不是这里的键） */
import { mergeHelpSections } from './HelpManualExtras.js';
import { focusFirstItem, parkFocus, restoreParkedFocus } from './FocusNav.js';

const SECTIONS = mergeHelpSections([
  {
    id: 'start',
    title: '快速开始',
    body: `欢迎来到《跨界纪元》浏览器 Demo。

1. 点击画面锁定鼠标，WASD 移动，Shift 冲刺
2. V 切换第一/第三人称（推荐第三人称 — 法环式轨道镜头，鼠标直接转视角）
3. 滚轮缩放镜头距离 · 镜头始终看向角色，不再「看前方地面」导致晕
2. 走到蓝色「世界之锚」按 E 接受使命
3. 东侧训练木人练习连击（左键轻击、右键重击）
4. 按 J 打开任务日志，跟随 Chapter 1→5 主线
5. 靠近营火按 E 与**常驻 NPC** 分支对话，再选「休息 / 升级」；Chapter 2 起可用 T 快速旅行
6. P 存档 · L 读档 · Esc 暂停（可导出/导入 JSON 存档，旧版会自动迁移）
7. U 位面助手 →「自动通关」：你的角色亲自跑完全流程 · Esc 停止`,
  },
  {
    id: 'combat',
    title: '战斗操作',
    body: `左键 — 轻击连击（连击增伤，高连击可终结技闪屏）
右键 — 重击 / 处决（弹反成功后）
F — 弹反（敌人红圈攻击前按下）
Ctrl — 闪避（HUD 精力条下方显示翻滚 CD）
Q — 锁定最近敌人（再按取消）
R — 位面斩（武器技能）
1–4 — 法术（长按 1/2/3 蓄力，可打断 Boss 时停）
X — 切换剑 / 杖（影响近战与法术加成）
弹反成功后可右键处决；Boss 战注意阶段提示与架势条

【Boss 通用打法】
1. 靠近 Boss 按 Q 锁定，镜头会跟随目标
2. 观察脚下红圈：圈快满时按 F 弹反 → 立刻右键处决（伤害极高）
3. 不会弹反就 Ctrl 翻滚躲开，等 Boss 收招再左键连击
4. 连击 3~5 下再重击，打满敌人头顶架势条可 stagger 硬直；**处决/Boss 击破**有慢镜头轨道锁定
5. 精力不够就拉开距离，等回满再打；快死了找营火 E 休息回满
6. R 位面斩（范围 AOE）适合小怪围殴或 Boss 硬直时补刀
7. 1~4 法术：Boss 放时停/大招时长按 1/2/3 蓄力可打断`,
  },
  {
    id: 'world',
    title: '世界与位面',
    body: `交汇枢纽 — 起点，世界之锚与训练木人
灰白森林 (西) — 影界守护者 Boss
霍格沃兹遗境 (北) — 大奥术师 Boss，Bloom 增强
米勒荒原 (东) — 奇点领主 Boss
破碎时线 (东北) — 隐藏位面，重力反转 + 时间回响
混沌边境 (西北) — 混沌领主，闪电风暴

跨区时会触发「位面渗漏」视觉 + 音效层。
地图上有 12 处「位面残响」魂火：靠近会被吸引并吸收，获得位面之魂。
Tab 打开区域面板 · M 小地图 · 发现物记入 J 日志`,
  },
  {
    id: 'dungeons',
    title: '地下城与 Boss',
    body: `三座地下城入口（紫色传送环，按 E 进入）：
· 灰白森林 — 遗迹 crypt
· 魔法遗境 — 禁忌图书馆
· 米勒荒原 — 五维裂隙

清怪后可离开并推进任务。五名 Boss 各对应一章；
时线执政官为 Chapter 4 隐藏 Boss（破碎时线深处 Z≈235）。
击败 Boss 获得大量魂火 + 2 武器技能点。
F10 打开画面设置（音量、Bloom、阴影等）`,
  },
  {
    id: 'bosses',
    title: '五 Boss 攻略',
    body: `【影界守护者】灰白森林西侧 X≈-250
· 招式慢、好弹反；锁定后绕背输出
· 阶段二会召唤影兵，先清小怪或 R 位面斩

【大奥术师】魔法遗境北侧 X≈5 Z≈-220
· 远程法术多，侧向翻滚（Ctrl）贴近再打
· 蓄力火球前摇长，可 F 弹反或蓄力 1 号法术对轰

【奇点领主】米勒荒原 X≈235 Z≈155
· 会瞬移，锁定 Q 不要丢
· 引力圈时向外滚，落地硬直时重击

【时线执政官】破碎时线 Z≈235（Ch4+，重力反转区）
· 注意行走高度变化，翻滚方向与平时相反
· 时停前会有蓝色预兆，蓄力法术可打断

【混沌领主】混沌边境 X≈-200 Z≈285（Ch5+）
· 闪电风暴降视野，贴身穿刺输出
· 二阶段狂暴，弹反窗口变短，优先翻滚`,
  },
  {
    id: 'autoplay',
    title: '自动通关',
    body: `按 U 打开位面助手 → 点「自动通关（操控你的角色）」。

你的角色会从枢纽出发，自动走路经过五区并推进全部任务。
镜头跟在背后，无需操作；Esc 随时停止。

若只想跳过走路直接完成验收，点「瞬间验收」。`,
  },
  {
    id: 'perf-hud',
    title: '性能 HUD 与存档',
    body: `F3 开关性能 HUD（开发期工具，不影响玩法）。

数值标黄 +N 表示该计数相对历史最低点净增 N；标红表示增幅超过容差——
反复进出副本后「几何体 / 纹理 / 着色器 / 场景节点」应回落到原值，只增不减即泄漏。

存档当前为 v5（crossrealm_save_v5）。P 存档 · L 读档 · Esc 暂停菜单可导出/导入 JSON。
旧的 v4 存档会在启动时显式迁移到 v5 并提示，原键保留一份以便回滚；
解析不了的存档会转移到 crossrealm_save_v5:corrupt 并弹出说明，而不是静默丢失。`,
  },
]);

export class HelpManual {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.activeSection = 'start';
    this.panel = document.getElementById('help-manual');
    this.nav = document.getElementById('help-nav');
    this.body = document.getElementById('help-body');
    this.closeBtn = document.getElementById('help-close');

    this.buildNav();
    this.closeBtn?.addEventListener('click', () => this.hide());
    this.nav?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-section]');
      if (!btn) return;
      this.showSection(btn.dataset.section);
    });
    document.getElementById('pause-manual')?.addEventListener('click', () => {
      // 与暂停菜单进设置同一条路（切片12）：下层让位但不关，退回来才落得回原来那一格
      parkFocus(this.game.pauseMenu.panel);
      this.show();
    });
  }

  buildNav() {
    if (!this.nav) return;
    this.nav.innerHTML = SECTIONS.map(
      (s) => `<button type="button" data-section="${s.id}">${s.title}</button>`
    ).join('');
  }

  showSection(id) {
    this.activeSection = id;
    const sec = SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
    this.nav?.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.section === id);
    });
    if (this.body) {
      this.body.innerHTML = `<h3>${sec.title}</h3><pre class="help-text">${sec.body}</pre>`;
    }
  }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  show() {
    this.open = true;
    this.showSection(this.activeSection);
    this.panel?.classList.remove('hidden');
    document.exitPointerLock?.();
    // 第一格是"关闭"，↓ 才进章节列表 —— 清单顺序就是 DOM 顺序，这里不另排一套
    focusFirstItem(this.panel);
  }

  hide() {
    this.open = false;
    this.panel?.classList.add('hidden');
    // 先摘掉自己再还焦点：压在下面那一层此刻才重新可见（`style.css` 那条压暗让位规则）
    restoreParkedFocus();
  }
}
