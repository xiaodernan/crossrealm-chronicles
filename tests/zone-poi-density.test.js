/**
 * 区域探索密度门禁 —— 防「看着很大、里面很空」。
 *
 * 实测（改前）：七座真实区域的 POI 数极不均衡——
 *   fantasy 7 / magic 6 / space 4 / void 4，而 abyss 2 / gloom 2 / radiant 2。
 * 后三座（其中 gloom/radiant 是 W-B9 后加的）里，大量回声设定只在图鉴里有描述、
 * 地面上**没有落脚点**；radiant 甚至一个 discovery 都没有。
 *
 * 钉住三件事：
 *  ① 每座真实区域的 Zone 文件里 `addPOI(` 调用数 ≥ MIN_POIS；
 *  ② 每个 POI 的 label 键在双表里都存在且非空；
 *  ③ 跨区 discovery id 不重复（同一个 id 在两张表里会让"发现过"互相污染）。
 *
 * 变异判据：删掉任一 POI → ①红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { ZONE_ORDER } from '../src/content/ZoneIdentity.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

/** 与旧区同档的下限：旧区 4-7 个，这里要求至少 4 个。 */
const MIN_POIS = 4;

const FILE_OF = {
  fantasy: 'FantasyZone.js',
  magic: 'MagicZone.js',
  space: 'SpaceZone.js',
  void: 'VoidZone.js',
  abyss: 'AbyssZone.js',
  gloom: 'GloomZone.js',
  radiant: 'RadiantZone.js',
};

const readZone = (zone) => readFileSync(`src/world/zones/${FILE_OF[zone]}`, 'utf8');

describe('每座真实区域的探索点密度', () => {
  it(`每个区至少 ${MIN_POIS} 个 addPOI（后加区域不许再只有 2 个）`, () => {
    const thin = ZONE_ORDER.filter((z) => (readZone(z).match(/addPOI\(/g) ?? []).length < MIN_POIS);
    expect(thin, `探索点过少：${thin.join(', ')}`).toEqual([]);
  });

  it('每个 POI 的 label 键在双表里都存在且非空', () => {
    const missing = [];
    for (const zone of ZONE_ORDER) {
      const src = readZone(zone);
      const re = /addPOI\(\s*\{[^}]*\},\s*'([a-z0-9_]+)'/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        const key = m[1];
        if (!String(STRINGS_ZH[key] ?? '').trim() || !String(STRINGS_EN[key] ?? '').trim()) {
          missing.push(`${zone}:${key}`);
        }
      }
    }
    expect(missing, `POI 标签缺文案：${missing.join(', ')}`).toEqual([]);
  });

  it('跨区 discovery id 不重复', () => {
    const seen = new Map();
    const dup = [];
    for (const zone of ZONE_ORDER) {
      const src = readZone(zone);
      // 只数 discovery 的 id（`detail: { id: … }`）；POI 配置里的 `{ id, color }` 是同一个
      // 发现的另一处落笔，不是第二个发现。
      const re = /detail:\s*\{\s*id:\s*'([a-z0-9-]+)'/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        const id = m[1];
        if (seen.has(id)) dup.push(`${id}（${seen.get(id)} 与 ${zone}）`);
        else seen.set(id, zone);
      }
    }
    expect(dup, `discovery id 重复：${dup.join(', ')}`).toEqual([]);
  });

  it('反向控制：七个区文件都存在（防止判据扫到空集假绿）', () => {
    const files = readdirSync('src/world/zones');
    for (const z of ZONE_ORDER) expect(files).toContain(FILE_OF[z]);
  });
});
