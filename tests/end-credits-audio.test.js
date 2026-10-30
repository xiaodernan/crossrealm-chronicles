/**
 * 片尾主题门禁（W-E3 切片52）—— 字幕的最后一句有对应的声音。
 *
 * 切片48/50 让字幕按结局换字、窄屏不被裁，但通关那一刻的 BGM 仍是当前区域那一段：
 * 留灯和熄灯听到的是同一首。片尾是玩家停留最久的一屏，声音不跟着走，
 * 画面上的分岔就只分了一半。
 *
 * 这一片不引入音频素材，只给既有程序化 BGM 加两个音色档：
 * `credits-keep` 偏高偏亮，`credits-quiet` 偏低偏慢，老档回 `credits`。
 * 判据：`play()` 真的切到对应档，`hide()`（含跳过）真的还给当前区域。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EndCreditsDirector, creditsAudioMode } from '../src/cinematic/EndCreditsDirector.js';
import { MODE_TEMPO } from '../src/audio/AudioManager.js';
import { makeMarkupDom } from './helpers/fakeMarkupDom.js';
import { setLanguage } from '../src/engine/i18n.js';
import { factoryKeybindings, setKeybindTable } from '../src/content/keybinds.js';
import { UI_HOTKEYS, setHotkeyTable } from '../src/content/hotkeys.js';

const 音频源码 = readFileSync(join(process.cwd(), 'src/audio/AudioManager.js'), 'utf8');

afterEach(() => {
  delete globalThis.document;
  setLanguage('zh');
});

function 开演(decisions) {
  setLanguage('zh');
  setKeybindTable(factoryKeybindings());
  setHotkeyTable(UI_HOTKEYS.map((e) => ({ ...e })));
  globalThis.document = makeMarkupDom();
  const setMode = vi.fn();
  const dir = new EndCreditsDirector({
    quests: { stats: { decisions } },
    audio: { setMode, currentZone: 'hub' },
    dialog: { toast() {} },
  });
  dir.play();
  return { dir, setMode };
}

describe('片尾主题（W-E3 切片52）', () => {
  it('三种状态各选各的主题：留灯 / 熄灯 / 老档通用', () => {
    expect(creditsAudioMode({ decisions: new Set(['choice_final_keep']) })).toBe('credits-keep');
    expect(creditsAudioMode({ decisions: new Set(['choice_final_quiet']) })).toBe('credits-quiet');
    expect(creditsAudioMode({ decisions: new Set() })).toBe('credits');
  });

  it('留灯档：play 切到 credits-keep，hide 还给 hub', () => {
    const { dir, setMode } = 开演(new Set(['choice_final_keep']));
    expect(setMode).toHaveBeenNthCalledWith(1, 'credits', 'credits-keep');
    dir.hide();
    expect(setMode).toHaveBeenNthCalledWith(2, 'zone', 'hub');
  });

  it('熄灯档：play 切到 credits-quiet，hide 还给 hub', () => {
    const { dir, setMode } = 开演(new Set(['choice_final_quiet']));
    expect(setMode).toHaveBeenNthCalledWith(1, 'credits', 'credits-quiet');
    dir.hide();
    expect(setMode).toHaveBeenNthCalledWith(2, 'zone', 'hub');
  });

  it('老档：play 切到通用 credits，hide 仍还给当前区域', () => {
    const { dir, setMode } = 开演(new Set());
    expect(setMode).toHaveBeenNthCalledWith(1, 'credits', 'credits');
    dir.hide();
    expect(setMode).toHaveBeenNthCalledWith(2, 'zone', 'hub');
  });

  it('音色表真的存在：两条结局主题都有独立配方与节拍，且熄灯比留灯慢', () => {
    for (const k of ['credits', 'credits-keep', 'credits-quiet']) {
      const 裸键 = 音频源码.includes(`${k}: {`);
      const 引号键 = 音频源码.includes(`'${k}': {`);
      expect(裸键 || 引号键, k + ' 没有音色配方').toBe(true);
      expect(MODE_TEMPO[k], k + ' 没有节拍').toBeTypeOf('number');
    }
    expect(MODE_TEMPO['credits-keep']).toBeLessThan(MODE_TEMPO.credits);
    expect(MODE_TEMPO['credits-quiet']).toBeGreaterThan(MODE_TEMPO.credits);
  });
});
