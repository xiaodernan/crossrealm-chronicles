// 门禁：碰撞类词表（solid / platform / ghost）单一来源。
//
// engine/Collision.js 用 SOLID / PLATFORM / GHOST 三个常量定义这套词表，并内部按
// `c.kind === GHOST` 判 Ghost 碰撞体。但 world 侧两处碰撞体登记（BaseZone /
// InternalSpace）把默认 kind 硬编码成字面量 `'solid'` —— 而 WorldManager 又把 InternalSpace
// 的碰撞体原样喂进 Collision.js 的 world.addCylinder/addBox（那里 kind 认的就是这套常量）。
// 硬编码 = 词表有了第二份字面量来源：改了 Collision.js 的常量值，这两处默认会静默漂移。
// 与 KILL_SOULS / no-duplicate-tables 同一族"单一来源"纪律。
//
// 修法：两处从 engine/Collision.js import SOLID，默认 kind 用常量不再写字面量。
// 这条门禁钉死：① 两文件都 import SOLID；② 两文件不再出现硬编码的碰撞类字面量。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, '..', rel), 'utf8');

const FILES = ['src/world/zones/BaseZone.js', 'src/world/InternalSpace.js'];

describe('碰撞类词表单一来源：world 侧默认 kind 用 SOLID 常量，不硬编码', () => {
  for (const f of FILES) {
    it(`${f} 从 engine/Collision.js import SOLID`, () => {
      const src = read(f);
      expect(src).toMatch(
        /import\s*\{[^}]*\bSOLID\b[^}]*\}\s*from\s*['"][^'"]*engine\/Collision\.js['"]/
      );
    });

    it(`${f} 不含硬编码的碰撞类字面量 'solid' / 'platform' / 'ghost'`, () => {
      const src = read(f);
      expect(src).not.toMatch(/'solid'|'platform'|'ghost'/);
    });
  }
});
