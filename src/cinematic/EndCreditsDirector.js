import { refreshKeyText, keyText } from '../ui/keyHints.js';
import { t } from '../engine/i18n.js';

import { on, offAll } from '../engine/EventBus.js';

const CINEMATIC_ENDCREDITSDIRECTOR = 'cinematic/EndCreditsDirector';
const creditsOn = (name, handler) => on(name, handler, CINEMATIC_ENDCREDITSDIRECTOR);
/**
 * 字幕行 —— 值是**文案键**（W-D2 切片26）；空行仍然是空串（它不是一句话，是布局）。
 *
 * 一处项目名单里写死的东西在这里改成了变量：`credits_line_features` 里的 `J`
 * 是**硬编码的键位**（改拖之后它就是一句谎言），现在是 `{journal}` 占位符，
 * 由 `keyText()` 在播放那一刻现问生效表。
 */
const CREDITS = [
  'credits_line_title',
  '',
  'credits_line_engine',
  '',
  'credits_line_flavor',
  '',
  'credits_line_thanks',
  'credits_line_features',
  'credits_line_systems',
  '',
  'credits_line_fin',
];

export class EndCreditsDirector {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第七处） */
  dispose() {
    offAll(CINEMATIC_ENDCREDITSDIRECTOR);
  }

  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'end-credits';
    this.el.className = 'end-credits hidden';
    this.el.innerHTML = '<div class="end-credits-scroll"></div><button type="button" class="end-credits-skip"></button>';
    document.body.appendChild(this.el);
    this.active = false;
    this.el.querySelector('.end-credits-skip').addEventListener('click', () => this.hide());
    creditsOn('game-completed', () => this.play());
  }

  play() {
    if (this.active) return;
    this.active = true;
    const scroll = this.el.querySelector('.end-credits-scroll');
    // W-D2 切片26：每一行都是键，播出那一刻 `t()` 展开、`keyText()` 把 `{journal}` 换成当前键名。
    // 跳过按钮的 `data-ktext` 也在这里重设：它是一个属性，构造期写死的话，
    // 切语言之后再放一遍仍然是旧语言的那一句。
    const skip = this.el.querySelector('.end-credits-skip');
    skip.dataset.ktext = t('cg_caption_void_skip');
    scroll.innerHTML = CREDITS.map((l) => (l === '' ? '' : `<p>${keyText(t(l))}</p>`)).join('');
    this.el.classList.remove('hidden');
    // DOM 建一次、演出可能很久之后才放：键名到播放这一刻才问生效表
    refreshKeyText(this.el);
    this.game.dialog?.toast(t('credits_toast'), 3000);
  }

  hide() {
    this.active = false;
    this.el.classList.add('hidden');
  }

  trySkip() {
    if (!this.active) return false;
    this.hide();
    return true;
  }
}
