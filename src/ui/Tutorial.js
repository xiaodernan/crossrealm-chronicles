import { scheduler } from '../engine/Scheduler.js';
import { keyText } from '../content/keyHints.js';

/** 首次进入的引导提示：整条链共用一个分组，重开引导时能整体撤销（B39） */
const TUTORIAL_TAG = 'tutorial-intro';

/**
 * 步骤文案里的键名写成 `{动作}` 令牌，在 `start()` 播出那一刻才展开 ——
 * 构造期展开会让"先建引导、后改键位"的顺序把文字冻在出厂键上。
 */
export class Tutorial {

  constructor(dialog, helpManual, game) {

    this.dialog = dialog;

    this.helpManual = helpManual;

    this.game = game;

    this.steps = [

      { text: '欢迎来到《跨界纪元》。点击画面锁定鼠标，{moveUp}{moveLeft}{moveDown}{moveRight} 移动。', delay: 3200 },

      { text: '右下角面板会告诉你「现在该做什么」— 跟着走就行。', delay: 4200 },

      { text: '按 {journal} 打开跨界日志 — 叙事碎片、NPC 对话、Boss 战都会记录。', delay: 4200 },

      { text: '已摸过世界之锚？点「同步任务」即可跳到下一步。', delay: 4200 },

      { text: '想一键体验全流程：左下角或右下角「自动通关」，或按 {autoPlay}。', delay: 4500 },

      { text: '自己玩：{lockOn} 锁定 · {attackLight} 三连击有终结技 · {parry} 弹反 · {minimap} 地图', delay: 4200 },

      { text: '按 {help} 打开完整说明书。', delay: 3500 },

    ];

    this.start();

  }



  start() {

    let i = 0;

    // 重开引导前先撤销上一条还没走完的链，否则两轮提示会交错弹（B39）
    scheduler.clear(TUTORIAL_TAG);

    const next = () => {

      if (i >= this.steps.length) {

        scheduler.after(0.8, () => {

          this.game?.quests?.syncProgress();

          this.game?.gameGuide?.refresh();

          this.dialog.toast(keyText('提示：卡任务就点「同步任务」或按 {autoPlay} 自动通关'));

        }, TUTORIAL_TAG);

        return;

      }

      const step = this.steps[i++];

      this.dialog.toast(keyText(step.text), step.delay);

      scheduler.after((step.delay + 400) / 1000, next, TUTORIAL_TAG);

    };

    scheduler.after(1.5, next, TUTORIAL_TAG);

  }

}

