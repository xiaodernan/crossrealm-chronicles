/**
 * 装备这几张表的**声明**（W-B5 切片3 补的一条）。
 *
 * 为什么单独扫源码：`registry.js` 在加载期就跑 `assertContent()` —— 把一条声明改坏（例如摘掉
 * 池表对 `default` 的显式豁免），后果是整个模块 import 不起来，测试文件收集期就崩、
 * 0 条断言红。按本仓的纪律那种红不算证据（语法/加载错误导致的红与实现无关），
 * 所以这里用 `readFileSync` 扫声明本身：**不改坏代码也能验证防线写了出来**。
 * （切片13 的 U4、切片21 的壳页那格都是同一形状。）
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REG = readFileSync(join(process.cwd(), 'src/content/registry.js'), 'utf8');
const GEAR = readFileSync(join(process.cwd(), 'src/content/gear.js'), 'utf8');

/** 取出某一张表那一格的声明文本（到下一个 `kind:` 或数组结尾为止） */
function entryOf(kind) {
  const at = REG.indexOf(`kind: '${kind}'`);
  expect(at, `注册表里没有 kind "${kind}" 这一格`).toBeGreaterThan(-1);
  const next = REG.indexOf("\n    kind: '", at + 1);
  return REG.slice(at, next === -1 ? REG.length : next);
}

describe('装备表的声明：扫源码拿断言证据', () => {
  it('四张 gear 表都登记着，而且每格都写了自己是谁（note 不许空）', () => {
    for (const kind of ['gearRarity', 'gearBases', 'gearAffixes', 'gearDropChance', 'gearSoulValue',
      'gearRarityDisplay', 'gearNames', 'gearPools']) {
      const text = entryOf(kind);
      expect(text, `${kind} 没写 note`).toMatch(/note: '[^']/);
    }
  });

  it('池表：键引用区域表、`default` 是显式豁免、值至少一条、挂着整表规则', () => {
    const text = entryOf('gearPools');
    expect(text).toMatch(/keyRef:\s*\{\s*of:\s*'zones'\s*\}/);
    expect(text, '`default` 不再被豁免 = 出厂表在加载期就抛（断言拿不到证据，所以扫声明）')
      .toMatch(/keyAllow:\s*\[\s*GEAR_POOL_DEFAULT\s*\]/);
    expect(text).toMatch(/minLength:\s*1/);
    expect(text).toMatch(/invariant:\s*checkGearPools/);
  });

  it('折魂价与字样表都 `keyRef` 到稀有度：打错一档要红在开机，而不是"那一档折成 0 魂"', () => {
    for (const kind of ['gearSoulValue', 'gearRarityDisplay']) {
      expect(entryOf(kind), kind).toMatch(/keyRef:\s*\{\s*of:\s*'gearRarity'\s*\}/);
    }
    expect(entryOf('gearAffixes')).toMatch(/minRarity:\s*\{\s*t:\s*'ref',\s*of:\s*'gearRarity'\s*\}/);
  });

  it('每张表挂的规则都真存在，且各只有一份定义', () => {
    for (const name of ['checkGearBases', 'checkGearAffixes', 'checkGearRarity', 'checkGearNames', 'checkGearPools']) {
      expect(REG, `${name} 没定义`).toContain(`export function ${name}(`);
      expect(REG.split(`export function ${name}(`).length - 1, `${name} 定义了多份`).toBe(1);
    }
  });

  it('掉落池、兜底档名与查池函数都在数据层，别处不许再抄一份兜底', () => {
    expect(GEAR).toMatch(/export const GEAR_POOL_DEFAULT = 'default';/);
    expect(GEAR, '兜底只许写一次').toMatch(
      /export const poolForZone = \(zoneId\) => GEAR_POOLS\[zoneId\] \?\? GEAR_POOLS\[GEAR_POOL_DEFAULT\];/);
    expect((GEAR.match(/\?\? GEAR_POOLS\[GEAR_POOL_DEFAULT\]/g) ?? []).length).toBe(1);
  });
});
