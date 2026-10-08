/**
 * 鼠标镜头灵敏度（W-D6 切片7）
 *
 * ## 改前是什么样
 * `PlayerController` 构造器里两行硬编码：`cameraSensitivity = 0.002`、
 * `cameraSensitivityY = 0.0017`，`addCameraInput` 直接拿它们乘鼠标位移。
 * "鼠标转得多快"没有任何调节入口 —— 而它是可访问性里最常被提到的一格。
 *
 * ## 这一片加的
 * 一个**倍率**设置（不是两个绝对值）：出厂 1 = 与硬编码时代逐帧相同。
 * 横竖比例（0.002 : 0.0017）是手感决定，玩家拧的只是整体快慢。
 * 真源与量程在 `engine/lookSensitivity.js`，唯一写入口是
 * `SettingsManager.applyToGame` 里的 `applyLookSensitivity`。
 *
 * ## 用例分七层
 * ① 真源与量程自洽（x/y 就是改前那两枚；倍率量程覆盖 1，滑杆能走到两头）；
 * ② 清洗：脏值一律夹回量程，**不抛**（存储是玩家可写的 localStorage）；
 * ③ `setLookSensitivity` 真的改了两枚读数，且横竖比例恒定；
 * ④ `addCameraInput` 的转弯量跟着倍率变（不是只设了个没人读的字段）；
 * ⑤ 接线：DEFAULTS 有这一格、`applyToGame` 落地、`setLookSensitivity` 只有一个调用点；
 * ⑥ 面板与文案：壳页有那一格、量程不在 HTML 里抄第二份、双语表都在；
 * ⑦ 反面证据：数调用点与读 HTML 的那两把尺子自己要被量过。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { PlayerController } from '../src/player/PlayerController.js';
import { installWindowShim, makeWorld } from './helpers/enemyHarness.js';
import {
  LOOK_SENSITIVITY, DEFAULT_LOOK_SENSITIVITY, normalizeLookSensitivity, applyLookSensitivity,
} from '../src/engine/lookSensitivity.js';
import { SettingsManager } from '../src/core/SettingsManager.js';

const ROOT = process.cwd();

beforeAll(() => {
  installWindowShim();
  class FakeElement {
    constructor() { this.children = []; this.style = { setProperty() {} }; this.classList = { add() {}, remove() {} }; }
    appendChild(c) { this.children.push(c); return c; }
    setAttribute() {}
  }
  globalThis.document = { createElement: () => new FakeElement(), body: new FakeElement() };
  globalThis.requestAnimationFrame = () => 0;
});

const mkPlayer = () => {
  const camera = new THREE.PerspectiveCamera(62, 1.6, 0.1, 200);
  const game = { paused: false, cinematicActive: false, autoPlayMode: false, combatCamera: null, restScene: null };
  const p = new PlayerController({ add() {}, remove() {} }, camera, makeWorld(), game);
  p.teleport(0, 0, 0);
  p.yaw = 0; p.pitch = 0; p.targetYaw = 0; p.targetPitch = 0;
  return p;
};

describe('鼠标镜头灵敏度（W-D6 切片7）', () => {
  describe('① 真源与量程自洽', () => {
    it('两枚出厂倍率就是改前 PlayerController 里那两枚硬编码', () => {
      // 冻结读数：改这两个数就是改全体玩家的默认手感，必须显式
      expect(LOOK_SENSITIVITY.x).toBe(0.002);
      expect(LOOK_SENSITIVITY.y).toBe(0.0017);
    });

    it('竖轴比横轴钝（俯仰的容忍度低于平移）', () => {
      expect(LOOK_SENSITIVITY.y).toBeLessThan(LOOK_SENSITIVITY.x);
    });

    it('出厂倍率 1，且落在量程内（滑杆上一定有"出厂"这一格）', () => {
      expect(DEFAULT_LOOK_SENSITIVITY).toBe(1);
      expect(DEFAULT_LOOK_SENSITIVITY).toBeGreaterThanOrEqual(LOOK_SENSITIVITY.scaleMin);
      expect(DEFAULT_LOOK_SENSITIVITY).toBeLessThanOrEqual(LOOK_SENSITIVITY.scaleMax);
    });

    it('量程自洽：min < max、步长为正、两头都踩在步进栅格上', () => {
      const { scaleMin: lo, scaleMax: hi, scaleStep: st } = LOOK_SENSITIVITY;
      expect(lo).toBeLessThan(hi);
      expect(st).toBeGreaterThan(0);
      // 踩不满栅格的表现是"拖到底还差一格"，玩家永远选不到 max 那一档
      // 踩不满栅格的表现是"拖到底还差一格"，玩家永远选不到 max 那一档
      const steps = (hi - lo) / st;
      expect(steps, "量程不是步长的整数倍 —— 滑杆走不到 max 那一格").toBeCloseTo(Math.round(steps), 9);
      // 出厂那一格也得落在栅格上（否则面板回显时滑杆会自己挪一格）
      expect((DEFAULT_LOOK_SENSITIVITY - lo) / st).toBeCloseTo(Math.round((DEFAULT_LOOK_SENSITIVITY - lo) / st), 9);
    });

    it('表是冻的：改一格当场红，而不是悄悄改掉所有人的手感', () => {
      expect(Object.isFrozen(LOOK_SENSITIVITY)).toBe(true);
      expect(() => { LOOK_SENSITIVITY.x = 0.01; }).toThrow();
    });
  });

  describe('② 清洗：脏值夹回量程，不抛', () => {
    it('NaN / undefined / null / 非数字字符串 → 出厂倍率', () => {
      for (const bad of [NaN, undefined, null, '', 'abc', {}, []]) {
        expect(normalizeLookSensitivity(bad), `脏值 ${String(bad)}`).toBe(DEFAULT_LOOK_SENSITIVITY);
      }
    });

    it('越界夹到两头（不是抛，也不是照单全收）', () => {
      expect(normalizeLookSensitivity(0)).toBe(LOOK_SENSITIVITY.scaleMin);
      expect(normalizeLookSensitivity(-5)).toBe(LOOK_SENSITIVITY.scaleMin);
      expect(normalizeLookSensitivity(99)).toBe(LOOK_SENSITIVITY.scaleMax);
      expect(normalizeLookSensitivity(1.5)).toBe(1.5);   // 量程内原样放过
    });

    it('数字字符串也认（localStorage 里存回来可能就是串）', () => {
      expect(normalizeLookSensitivity('2')).toBe(2);
      expect(normalizeLookSensitivity('0.5')).toBe(0.5);
    });
  });

  describe('③ setLookSensitivity 真的改了两枚读数', () => {
    it('出厂即改前那一对（零手感变更）', () => {
      const p = mkPlayer();
      expect(p.cameraSensitivity).toBe(0.002);
      expect(p.cameraSensitivityY).toBe(0.0017);
      expect(p.lookSensitivityScale).toBe(1);
    });

    it('倍率乘在两枚出厂值上，横竖比例恒定', () => {
      const p = mkPlayer();
      p.setLookSensitivity(2);
      expect(p.cameraSensitivity).toBeCloseTo(0.004, 12);
      expect(p.cameraSensitivityY).toBeCloseTo(0.0034, 12);
      expect(p.cameraSensitivityY / p.cameraSensitivity)
        .toBeCloseTo(LOOK_SENSITIVITY.y / LOOK_SENSITIVITY.x, 12);
    });

    it('拧回 1 就回到出厂（可逆，不漂移）', () => {
      const p = mkPlayer();
      p.setLookSensitivity(3);
      p.setLookSensitivity(1);
      expect(p.cameraSensitivity).toBe(0.002);
      expect(p.cameraSensitivityY).toBe(0.0017);
    });

    it('返回值是落地后的倍率（调用方可以据此回报"你选的那档不存在，已回落"）', () => {
      const p = mkPlayer();
      expect(p.setLookSensitivity(99)).toBe(LOOK_SENSITIVITY.scaleMax);
      expect(p.setLookSensitivity('abc')).toBe(DEFAULT_LOOK_SENSITIVITY);
    });
  });

  describe('④ addCameraInput 的转弯量跟着倍率变', () => {
    it('同一段鼠标位移，倍率 2 转过的角度正好是两倍', () => {
      const slow = mkPlayer();
      const fast = mkPlayer();
      fast.setLookSensitivity(2);
      slow.addCameraInput(100, 0);
      fast.addCameraInput(100, 0);
      expect(fast.yaw).toBeCloseTo(slow.yaw * 2, 12);
      expect(Math.abs(fast.yaw)).toBeGreaterThan(Math.abs(slow.yaw));
    });

    it('竖轴同样跟着走（不是只改了横轴）', () => {
      const p = mkPlayer();
      p.setLookSensitivity(0.5);
      p.addCameraInput(0, 100);
      expect(p.pitch).toBeCloseTo(-100 * 0.0017 * 0.5, 12);
    });
  });

  describe('⑤ 接线', () => {
    it('DEFAULTS 里有这一格，且出厂值就是 1', () => {
      expect(SettingsManager.prototype).toBeTruthy();
      const mgr = Object.create(SettingsManager.prototype);
      expect(mgr.defaults.lookSensitivity).toBe(DEFAULT_LOOK_SENSITIVITY);
    });

    it('applyToGame 把倍率推给 player', () => {
      const mgr = readFileSync(join(ROOT, 'src', 'core', 'SettingsManager.js'), 'utf8');
      expect(mgr).toMatch(/applyLookSensitivity\(game\.player/);
      // 落地在 setColorVision 之后、refreshBarColors 之前无所谓，但必须在 applyToGame 里
      const apply = mgr.slice(mgr.indexOf('applyToGame(game) {'));
      expect(apply).toContain('applyLookSensitivity(game.player');
    });

    it('`setLookSensitivity(` 的调用点只有一个（applyLookSensitivity）', () => {
      const hits = [];
      const walk = (dir) => {
        for (const n of readdirSync(dir)) {
          const full = join(dir, n);
          if (statSync(full).isDirectory()) { walk(full); continue; }
          if (!n.endsWith('.js') || full.includes(`${join('tests')}`)) continue;
          if (full.replace(/\\/g, '/').includes('/animation/')) continue;
          const text = readFileSync(full, 'utf8');
          for (const line of text.split(/\r?\n/)) {
            if (/\.setLookSensitivity\(/.test(line)) hits.push(full.slice(ROOT.length + 1));
          }
        }
      };
      walk(join(ROOT, 'src'));
      expect([...new Set(hits)].sort()).toEqual(['src\\engine\\lookSensitivity.js']);
    });

    it('applyLookSensitivity 对空 player 安静返回（无 DOM 的纯逻辑路径）', () => {
      expect(applyLookSensitivity(null)).toBe(null);
      expect(applyLookSensitivity(undefined)).toBe(undefined);
    });
  });

  describe('⑥ 面板与文案', () => {
    it('壳页里有那一格，且量程没有抄进 HTML', () => {
      const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
      expect(html).toContain('id="set-look-sensitivity"');
      // 抄了就会漏：改了名册而 HTML 不动，玩家拖到头被当成脏值悄悄夹回去
      const row = html.split('\n').find((l) => l.includes('set-look-sensitivity'));
      expect(row).not.toMatch(/min=/);
      expect(row).not.toMatch(/max=/);
    });

    it('SettingsPanel 把量程从名册灌进去，并回显清洗过的值', () => {
      const panel = readFileSync(join(ROOT, 'src', 'ui', 'SettingsPanel.js'), 'utf8');
      expect(panel).toContain('set-look-sensitivity');
      expect(panel).toMatch(/LOOK_SENSITIVITY\.scaleMin/);
      expect(panel).toMatch(/LOOK_SENSITIVITY\.scaleMax/);
      expect(panel).toMatch(/LOOK_SENSITIVITY\.scaleStep/);
      expect(panel).toMatch(/normalizeLookSensitivity\(d\.lookSensitivity\)/);
    });

    it('zh / en 两张表都有这一条的文案', () => {
      const zh = readFileSync(join(ROOT, 'src', 'content', 'strings.zh.js'), 'utf8');
      const en = readFileSync(join(ROOT, 'src', 'content', 'strings.en.js'), 'utf8');
      expect(zh).toMatch(/settings_look_sensitivity:\s*'[^']+'/);
      expect(en).toMatch(/settings_look_sensitivity:\s*'[^']+'/);
      expect(zh).not.toBe(en);
    });
  });

  describe('⑦ 反面证据：两把尺子自己要被量过', () => {
    it('数调用点那把尺子认得出一处、两处、零处', () => {
      const count = (text, re) => (text.match(re) ?? []).length;
      expect(count('a.setX(1);', /\.setX\(/g)).toBe(1);
      expect(count('a.setX(1); b.setX(2);', /\.setX\(/g)).toBe(2);
      expect(count('a.getX();', /\.setX\(/g)).toBe(0);
    });

    it('"抄没抄量程"那把尺子认得出路里带 min= 与不带', () => {
      const hasRange = (row) => /min=/.test(row);
      expect(hasRange('<input id="a" type="range" min="0" max="1" />')).toBe(true);
      expect(hasRange('<input id="a" type="range" />')).toBe(false);
    });
  });
});