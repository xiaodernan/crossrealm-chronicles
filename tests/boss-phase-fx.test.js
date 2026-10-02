/**
 * Boss 阶段切换演出接线门禁（W-B8 切片4）。
 *
 * 切片3 落了四重联动（闪光/粒子/震屏/音效），但验证时发现三处是"写了没人读"：
 * 震屏强度恒定（`this.sm` 在 Director 上不存在）、粒子更新无人驱动、若干死变量。
 * 这一片修掉它们，这里钉住"修好了"的那几条线 —— 全部扫源码，不起 DOM：
 * UI Director 的行为级断言在 node 环境下只能读到"声明了"，读不到"动起来"，
 * 而"动起来"的那一半（闪光淡出、粒子飞散）只能在真浏览器里看。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
/** 剥掉注释后再判 —— 注释里提到方法名不算真在调它 */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const DIR = code('ui/BossPhaseDirector.js');

describe('W-B8 切片4：阶段切换四重联动接线', () => {
  it('onPhase 把 detail.phase 交给演出入口（不交就永远是 P2 那一档的强度）', () => {
    expect(DIR).toMatch(/_playPhaseTransitionFX\(cfg\.color[^,]*,[^,]*,\s*detail\.phase\)/);
  });

  it('震屏强度按传入的 phase 分档，不读 Director 上不存在的 `this.sm`', () => {
    expect(DIR).toMatch(/_getPhaseShakeIntensity\(phase[^)]*\)/);
    expect(DIR).not.toMatch(/this\.sm\?\.phase/);
  });

  it('闪光走 scheduler，不用 requestAnimationFrame / setTimeout（B39 那条线）', () => {
    expect(DIR).toMatch(/scheduler\.after\(0,/);
    expect(DIR).toMatch(/scheduler\.after\(0\.12,/);
    expect(DIR).not.toMatch(/requestAnimationFrame/);
    expect(DIR).not.toMatch(/setTimeout\(/);
  });

  it('粒子生成后有销毁配对（只生不灭 = 显存泄漏，W-C1 那一族）', () => {
    expect(DIR).toMatch(/_spawnPhaseParticles\(/);
    expect(DIR).toMatch(/_destroyPhaseParticles\(\)/);
    expect(DIR).toMatch(/geometry\.dispose\(\)/);
    expect(DIR).toMatch(/material\.dispose\(\)/);
  });

  it('粒子更新有人驱动：Director 有 update(dt)，主循环调它', () => {
    expect(DIR).toMatch(/update\(dt\)\s*\{\s*\n?\s*this\._updatePhaseParticles\(dt\)/);
    const game = code('core/Game.js');
    expect(game).toMatch(/this\.bossPhaseDirector\?\.update\(dt\)/);
  });

  it('四重效果齐了：闪光 + 粒子 + 震屏 + 音效，一处都不少', () => {
    const start = DIR.indexOf('_playPhaseTransitionFX(color');
    const end = DIR.indexOf('\n  _getPhaseShakeIntensity(', start);
    const fx = DIR.slice(start, end === -1 ? undefined : end);
    expect(fx).toMatch(/phaseFlashEl/);
    expect(fx).toMatch(/_spawnPhaseParticles\(this\.game/);
    expect(fx).toMatch(/addShake\(phaseShake\)/);
    expect(fx).toMatch(/game-audio-sfx/);
    expect(fx).toMatch(/sfx:\s*'bossPhase'/);
  });

  it('门禁自证：把演出入口调用摘掉，上面那条"四重齐了"就咬不住', () => {
    const stripped = DIR.replace(/this\._playPhaseTransitionFX\(/g, 'this._playPhaseTransitionFX_REMOVED(');
    expect(stripped).not.toMatch(/this\._playPhaseTransitionFX\(cfg\.color/);
    expect(DIR).toMatch(/this\._playPhaseTransitionFX\(cfg\.color/);
  });
});
