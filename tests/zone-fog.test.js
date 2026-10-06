/**
 * 区域雾（W-C4 切片2）—— 参数表 + 过渡数学 + 运行期载体 + 三真源收口。
 *
 * ## 这份门禁钉的是什么
 * 改前雾参数的真源分裂在三处、三个时机、互相覆盖：`zones/*.js` 的
 * fogColor/fogDensity（经 WorldManager 进区时写，密度还乘了个没出处的 0.85）、
 * `WorldManager` 的 hub/corridor 硬编码、`WeatherSystem.setZone` 在 zone-changed
 * 同步链上把密度整个重写 —— 也就是说 zones 配置里的密度从没生效过。
 * 改前玩家实际看到的是：**色 = WorldManager 的表、密度 = WeatherSystem base+boost**。
 *
 * - 本表按"改前实际生效值"迁移（色取 WorldManager、密度取 WeatherSystem base），
 *   天气加成独立记账经 `ZoneFog.setWeatherBoost` 供给 —— 合成后与改前逐位一致；
 * - 覆盖率：`ZONE_IDS` 每个成员（含三格兜底）都必须有一行；
 * - 过渡数学：纯函数可单测；ZoneFog：跨区不瞬变（指数平滑）、正午零变更；
 * - 写者扫描：fog 直写只许剩 ZoneFog 一家，zones config 的死参数不得回流。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ZONE_IDS, ZONE_ORDER } from '../src/content/ZoneIdentity.js';
import {
  ZONE_ATMOSPHERE, HUB_ATMOSPHERE, zoneAtmosphereOf, daylightTint, blendAtmosphere,
} from '../src/content/zoneAtmosphere.js';
import { ZoneFog } from '../src/effects/ZoneFog.js';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/** 剥掉注释（接线扫描用，与 shadow-policy 同款） */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((ln) => { const i = ln.indexOf('//'); return i >= 0 ? ln.slice(0, i) : ln; }).join('\n');

/** 改前实际生效值（色 = WorldManager，密度 = WeatherSystem base），迁移的锚 */
const EXPECTED = {
  [ZONE_IDS.HUB]: { color: 0x7a92aa, density: 0.0038 },
  [ZONE_IDS.FANTASY]: { color: 0x4a5a48, density: 0.0038 },
  [ZONE_IDS.MAGIC]: { color: 0x2a2040, density: 0.0038 },
  [ZONE_IDS.SPACE]: { color: 0x0a1020, density: 0.0028 },
  [ZONE_IDS.VOID]: { color: 0x1a1820, density: 0.0038 },
  [ZONE_IDS.ABYSS]: { color: 0x1a0a18, density: 0.0045 },
  [ZONE_IDS.GLOOM]: { color: 0x2a2a3a, density: 0.0038 },
  [ZONE_IDS.RADIANT]: { color: 0xffd700, density: 0.0038 },
  [ZONE_IDS.CORRIDOR]: { color: 0x7a8ea6, density: 0.0038 },
  [ZONE_IDS.UNKNOWN]: { color: 0x7a8ea6, density: 0.0038 },
};

describe('参数表', () => {
  it('冻结：整表与每一行都不可改', () => {
    expect(Object.isFrozen(ZONE_ATMOSPHERE)).toBe(true);
    for (const row of Object.values(ZONE_ATMOSPHERE)) expect(Object.isFrozen(row)).toBe(true);
  });

  it('覆盖率：ZONE_IDS 的每个成员都有一行 —— 新区忘配雾是装配错误', () => {
    for (const id of Object.values(ZONE_IDS)) {   // 表键 = id 的"值"（'hub'…），不是键名
      expect(ZONE_ATMOSPHERE[id], `缺 ${id} 的雾行`).toBeDefined();
    }
  });

  it('迁移对账：每行 = 改前实际生效值（色 = WorldManager、密度 = WeatherSystem base）', () => {
    for (const [id, row] of Object.entries(EXPECTED)) {
      expect(ZONE_ATMOSPHERE[id]).toEqual(row);
    }
    expect(HUB_ATMOSPHERE).toEqual(EXPECTED[ZONE_IDS.HUB]);
  });

  it('七个真实位面的雾彼此不同 —— 表写重了等于没写', () => {
    const rows = ZONE_ORDER.map((id) => ZONE_ATMOSPHERE[id]);
    const sig = new Set(rows.map((r) => `${r.color},${r.density}`));
    expect(sig.size).toBe(ZONE_ORDER.length);
  });

  it('zoneAtmosphereOf：登记的原样返回，认不出当场抛（说得出名单）', () => {
    expect(zoneAtmosphereOf(ZONE_IDS.GLOOM)).toEqual({ color: 0x2a2a3a, density: 0.0038 });
    expect(() => zoneAtmosphereOf('neverland')).toThrow(/neverland/);
  });
});

describe('过渡数学（纯函数）', () => {
  it('daylightTint：正午（1）原色；深夜（0.55）按 0.35+0.65×daylight 压暗', () => {
    expect(daylightTint(0xff8040, 1)).toBe(0xff8040);
    const k = 0.35 + 0.65 * 0.55;
    const expectScaled = (c) => Math.round(c * k);
    expect(daylightTint(0xff8040, 0.55))
      .toBe((expectScaled(0xff) << 16) | (expectScaled(0x80) << 8) | expectScaled(0x40));
  });

  it('daylightTint：daylight=1 时不溢出通道（255 上限内）', () => {
    const out = daylightTint(0xffffff, 1);
    expect((out >> 16) & 0xff).toBe(255);
    expect(out & 0xff).toBe(255);
  });

  it('blendAtmosphere：t=0 全 a、t=1 全 b、t 超界被夹住', () => {
    const a = { color: 0x000000, density: 0.001 };
    const b = { color: 0xffffff, density: 0.005 };
    expect(blendAtmosphere(a, b, 0)).toEqual({ color: 0x000000, density: 0.001 });
    expect(blendAtmosphere(a, b, 1)).toEqual({ color: 0xffffff, density: 0.005 });
    expect(blendAtmosphere(a, b, 2)).toEqual({ color: 0xffffff, density: 0.005 });
    expect(blendAtmosphere(a, b, -1)).toEqual({ color: 0x000000, density: 0.001 });
  });

  it('blendAtmosphere：颜色按通道插值、不修改冻结入参', () => {
    const a = { color: 0x000000, density: 0.001 };
    const b = { color: 0x2000ff, density: 0.003 };
    const out = blendAtmosphere(a, b, 0.5);
    expect((out.color >> 16) & 0xff).toBe(0x10);       // 红通道：(0 + 0x20) / 2
    expect(out.color % 256).toBeCloseTo(0xff / 2, 9);  // 蓝通道 127.5 —— 返回浮点，取整归 ZoneFog 的边界
    expect(a).toEqual({ color: 0x000000, density: 0.001 });
    expect(b).toEqual({ color: 0x2000ff, density: 0.003 });
  });
});

describe('ZoneFog（运行期载体）', () => {
  const makeFog = () => new THREE.FogExp2(0x7a92aa, 0.0038);   // = Game.js 的初值

  it('枢纽正午：收敛终值 = 表行原色原密度（与改前 hub 画面逐位一致）', () => {
    const fog = makeFog();
    const zf = new ZoneFog(fog);
    for (let i = 0; i < 600; i++) zf.update(1 / 60, ZONE_IDS.HUB, 1);
    const snap = zf.update(1 / 60, ZONE_IDS.HUB, 1);
    expect(snap.color).toBe(0x7a92aa);
    expect(snap.density).toBeCloseTo(0.0038, 12);
    expect(fog.color.getHex()).toBe(0x7a92aa);
  });

  it('跨区不瞬变：一步 dt 之后雾在旧值与新目标之间，且单帧变化肉眼不可见', () => {
    const fog = makeFog();
    const zf = new ZoneFog(fog);
    for (let i = 0; i < 600; i++) zf.update(1 / 60, ZONE_IDS.HUB, 1);
    const before = fog.color.getHex();
    const after = zf.update(1 / 60, ZONE_IDS.GLOOM, 1);   // 目标 0x2a2a3a
    const diff = Math.abs(((after.color >> 16) & 0xff) - ((before >> 16) & 0xff));
    // 红通道一帧只挪了几个 8bit 刻度 —— 远没到位，也远不是跳变
    expect(diff).toBeGreaterThan(0);
    expect(diff).toBeLessThan(16);
    expect(after.color).not.toBe(0x2a2a3a);
  });

  it('收敛：连续 10 秒后贴上目标（误差 < 每通道 1 刻度）', () => {
    const fog = makeFog();
    const zf = new ZoneFog(fog);
    for (let i = 0; i < 600; i++) zf.update(1 / 60, ZONE_IDS.GLOOM, 1);
    const snap = zf.update(1 / 60, ZONE_IDS.GLOOM, 1);
    const target = EXPECTED[ZONE_IDS.GLOOM].color;
    expect(Math.abs(((snap.color >> 16) & 0xff) - ((target >> 16) & 0xff))).toBeLessThanOrEqual(1);
    expect(Math.abs(((snap.color >> 8) & 0xff) - ((target >> 8) & 0xff))).toBeLessThanOrEqual(1);
    expect(Math.abs((snap.color & 0xff) - (target & 0xff))).toBeLessThanOrEqual(1);
  });

  it('昼夜微动被平滑跟随：daylight 降 → 雾色变暗，方向一致', () => {
    const fog = makeFog();
    const zf = new ZoneFog(fog);
    for (let i = 0; i < 600; i++) zf.update(1 / 60, ZONE_IDS.HUB, 1);
    const noon = zf.update(1 / 60, ZONE_IDS.HUB, 1).color;
    const dusk = zf.update(1 / 60, ZONE_IDS.HUB, 0.6).color;
    expect(dusk).not.toBe(noon);
    expect(dusk).toBeLessThan(noon);   // 夜里更暗
  });

  it('天气加成：setWeatherBoost 后收敛密度 = 区域基础 + boost（区域账与天气账分开记）', () => {
    const fog = makeFog();
    const zf = new ZoneFog(fog);
    zf.setWeatherBoost(0.0008);        // fantasy 的 fogBoost
    for (let i = 0; i < 600; i++) zf.update(1 / 60, ZONE_IDS.FANTASY, 1);
    const snap = zf.update(1 / 60, ZONE_IDS.FANTASY, 1);
    expect(snap.density).toBeCloseTo(0.0038 + 0.0008, 9);
    // 9 位精度：600 帧后指数尾残差 = 0.0008×exp(-15) ≈ 2.4e-10，绝对值上已无意义；
    // 合成结果与改前 WeatherSystem 的覆盖写同值：改前 fantasy 密度 = 0.0038+0.0008
  });

  it('unknown / corridor 走兜底行（不抛、收敛到中性大气）', () => {
    const fog = makeFog();
    const zf = new ZoneFog(fog);
    for (let i = 0; i < 600; i++) zf.update(1 / 60, ZONE_IDS.UNKNOWN, 1);
    const snap = zf.update(1 / 60, ZONE_IDS.UNKNOWN, 1);
    // 允许 1 个 8bit 刻度的收敛误差（指数平滑的极限精度）
    expect(Math.abs(((snap.color >> 16) & 0xff) - 0x7a)).toBeLessThanOrEqual(1);
    expect(Math.abs(((snap.color >> 8) & 0xff) - 0x8e)).toBeLessThanOrEqual(1);
    expect(Math.abs((snap.color & 0xff) - 0xa6)).toBeLessThanOrEqual(1);
    expect(snap.density).toBeCloseTo(0.0038, 12);
  });
});

describe('收口门禁（写者扫描）', () => {
  const read = (...p) => stripComments(readFileSync(join(SRC, ...p), 'utf8'));

  it('Game.js：fog 只在构造时建一次，之后由 ZoneFog 每帧驱动', () => {
    const src = read('core', 'Game.js');
    expect(src).toMatch(/new ZoneFog\(this\.scene\.fog\)/);
    expect(src).toMatch(/this\.zoneFog\.update\(dt,\s*this\.world\.zoneId,\s*daylight\)/);
    expect(src).not.toMatch(/fog\.color\s*=/);
    expect(src).not.toMatch(/fog\.density\s*=/);
    expect(src.match(/scene\.fog\s*=/g)?.length).toBe(1);
  });

  it('WeatherSystem：不再直写 fog，天气加成只走 setWeatherBoost', () => {
    const src = read('world', 'WeatherSystem.js');
    expect(src).toMatch(/setWeatherBoost\(preset\.fogBoost \?\? 0\)/);
    expect(src).not.toMatch(/fog\.density\s*=/);
    expect(src).not.toMatch(/fog\.color/);
  });

  it('WorldManager：大气直写退场（身份与事件保留）', () => {
    const src = read('world', 'WorldManager.js');
    expect(src).not.toMatch(/fog\.color/);
    expect(src).not.toMatch(/fog\.density\s*=/);
  });

  it('zones/*.js 与 BaseZone：fogColor/fogDensity 死参数不得回流（真源只许是那张表）', () => {
    for (const name of ['BaseZone', 'FantasyZone', 'MagicZone', 'SpaceZone', 'VoidZone', 'AbyssZone', 'GloomZone', 'RadiantZone']) {
      expect(read('world', 'zones', `${name}.js`)).not.toMatch(/fogColor|fogDensity/);
    }
  });

  it('反面证据：那把正则认得出真在改雾的写法', () => {
    expect(/fog\.density\s*=/.test('this.scene.fog.density = 0.01;')).toBe(true);
    expect(/fog\.color/.test('this.scene.fog.color.setHex(0x123456);')).toBe(true);
  });
});
