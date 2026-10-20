import { scheduler } from '../engine/Scheduler.js';
import { keyText } from '../content/keyHints.js';
import { t } from '../engine/i18n.js';

/** 首次进入的引导提示：整条链共用一个分组，重开引导时能整体撤销（B39） */
const TUTORIAL_TAG = 'tutorial-intro';

/**
 * 步骤文案里的键名写成 `{动作}` 令牌，在 `start()` 播出那一刻才展开 ——
 * 构造期展开会让"先建引导、后改键位"的顺序把文字冻在出厂键上。
 *
 * 步骤的 `text` 存的是**文案键**（W-D2 切片16g），不是文案本身 ——
 * 两层占位各管各的：`t()` 取句子，`keyText()` 把 `{动作}` 换成真实键名。
 */
export class Tutorial {

  constructor(dialog, helpManual, game) {

    this.dialog = dialog;

    this.helpManual = helpManual;

    this.game = game;

    this.steps = [
      { text: 'tutorial_step_welcome', delay: 3200 },
      { text: 'tutorial_step_panel', delay: 4200 },
      { text: 'tutorial_step_journal', delay: 4200 },
      { text: 'tutorial_step_sync', delay: 4200 },
      { text: 'tutorial_step_autoplay', delay: 4500 },
      { text: 'tutorial_step_combat', delay: 4200 },
      { text: 'tutorial_step_help', delay: 3500 },
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

          this.dialog.toast(keyText(t('tutorial_final_hint')));

        }, TUTORIAL_TAG);

        return;

      }

      const step = this.steps[i++];

      this.dialog.toast(keyText(t(step.text)), step.delay);

      scheduler.after((step.delay + 400) / 1000, next, TUTORIAL_TAG);

    };

    scheduler.after(1.5, next, TUTORIAL_TAG);

  }

}

