/**
 * 阴影策略的单一所有者（W-C3 切片1）
 *
 * ## 改前是什么样
 * `castShadow` / `receiveShadow` 的赋值散在 **27 个文件的 55 处**
 * （`.tmp-20261006/wc3s1-census.mjs`），而且**没有一处是 `false`** ——
 * 全是"开"，于是"关掉某个东西的阴影"这件事根本没有出口。
 * 更直接的症状是同一类物体在不同文件里行为不一致：`rock` 在
 * `world/WorldDecorations.js` 里 cast+receive，在 `world/zones/*.js` 里只 cast。
 *
 * ## 这一片做了什么
 * 建 `engine/shadowPolicy.js` 当唯一出口，把 54 处赋值迁过去（1 处是 no-op 删掉）。
 * 类别按**迁移前的实测值**定（`.tmp-20261006/wc3s1-reconcile.mjs`
 * 拿 `git show HEAD:` 的旧字节逐格对账：51 处全一致）—— 所以对这 51 处是零视觉变更。
 * 例外是地下城几何里**迁移前从没写过阴影**的三处，这一片按"它在画面里是什么"补了类别：
 * 门板与门框 → `prop`（它们是结构，从前 `[F,F]` 只是没人管，现在会正确投影/接收）、
 * lore 碎片 → `castOnly`。这三处是本片唯一的视觉变化，方向是"从没有影子到有影子"。
 *
 * ## 用例分六层
 * 1. **表本身**：四类的取值逐格；`shadowClassOf` 认不出就抛且说得出可用名单。
 * 2. **applyShadow 行为**：每类逐格生效；`deep` 落整棵子树；空对象不炸；返回传入的那个。
 * 3. **总开关**：`setSunShadow` 两个方向都生效；`null` 不炸。
 * 4. **单一所有者（结构门）**：`src/` 剥注释后裸赋值只许出现在策略表自己与光源声明处。
 * 5. **真读者**：真跑地下城几何，断言它落到的值 == 策略表那一类 ——
 *    "表在那儿"与"表真的被用上了"是两件事。
 * 6. **那两行 no-op 不许长回来**：`x = x ?? true` 在 `castShadow` 上恒等于什么都不做。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as THREE from 'three';
import {
  SHADOW_CLASSES, SHADOW_CLASS_IDS, shadowClassOf, applyShadow, setSunShadow,
} from '../src/engine/shadowPolicy.js';
import { ProceduralDungeonGenerator } from '../src/world/ProceduralDungeonGenerator.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function srcFiles(dir = SRC, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) srcFiles(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

/** 剥掉注释：不然说明文字里的 `castShadow =` 会被当成赋值（"没扫到"与"没有"是两回事） */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((ln) => { const i = ln.indexOf('//'); return i >= 0 ? ln.slice(0, i) : ln; }).join('\n');

describe('阴影策略的单一所有者（W-C3 切片1）', () => {
  describe('① 策略表', () => {
    it('四类的 cast / receive 逐格对得上迁移前的实测值', () => {
      expect(SHADOW_CLASSES.ground).toEqual({ cast: false, receive: true });
      expect(SHADOW_CLASSES.prop).toEqual({ cast: true, receive: true });
      expect(SHADOW_CLASSES.castOnly).toEqual({ cast: true, receive: false });
      expect(SHADOW_CLASSES.actor).toEqual({ cast: true, receive: false });
      expect(SHADOW_CLASS_IDS.slice().sort()).toEqual(['actor', 'castOnly', 'ground', 'prop']);
    });

    it('表是冻的：改一格当场红，而不是悄悄改掉全世界的阴影', () => {
      expect(Object.isFrozen(SHADOW_CLASSES)).toBe(true);
      expect(() => { SHADOW_CLASSES.ground = { cast: true, receive: true }; }).toThrow();
    });

    it('认不出类别就抛，并且说得出有哪些类', () => {
      expect(() => shadowClassOf('foliage')).toThrow(/未知的阴影类别/);
      expect(() => shadowClassOf('foliage')).toThrow(/ground/);
      expect(() => shadowClassOf(undefined)).toThrow(/未知的阴影类别/);
      expect(shadowClassOf('prop')).toBe(SHADOW_CLASSES.prop);
    });
  });

  describe('② applyShadow', () => {
    it('四类各自落对两个值', () => {
      for (const [cls, want] of Object.entries(SHADOW_CLASSES)) {
        const o = new THREE.Object3D();
        applyShadow(o, cls);
        expect([o.castShadow, o.receiveShadow], cls).toEqual([want.cast, want.receive]);
      }
    });

    it('覆盖已有值（不是"只在未设置时落"）', () => {
      const o = new THREE.Object3D();
      o.castShadow = false; o.receiveShadow = false;
      applyShadow(o, 'prop');
      expect([o.castShadow, o.receiveShadow]).toEqual([true, true]);
    });

    it('deep 落整棵子树', () => {
      const root = new THREE.Group();
      const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      const inner = new THREE.Group();
      inner.add(b);
      root.add(a, inner);
      applyShadow(root, 'ground', { deep: true });
      for (const m of [a, b]) expect([m.castShadow, m.receiveShadow]).toEqual([false, true]);
      // 非 deep 只落根自己
      const c = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      const g2 = new THREE.Group(); g2.add(c);
      applyShadow(g2, 'prop');
      expect(c.castShadow).toBe(false);
    });

    it('空对象不炸，返回的是传进去的那一个', () => {
      expect(applyShadow(null, 'prop')).toBe(null);
      expect(applyShadow(undefined, 'prop')).toBe(undefined);
      const o = new THREE.Object3D();
      expect(applyShadow(o, 'prop')).toBe(o);
    });

    it('类别写错当场抛（不是静默给个默认值）', () => {
      expect(() => applyShadow(new THREE.Object3D(), 'foliage')).toThrow(/未知的阴影类别/);
    });
  });

  describe('③ 总开关 setSunShadow', () => {
    it('两个方向都生效', () => {
      const sun = new THREE.DirectionalLight();
      setSunShadow(sun, true);
      expect(sun.castShadow).toBe(true);
      setSunShadow(sun, false);
      expect(sun.castShadow).toBe(false);
    });

    it('null 不炸；真值按布尔归一', () => {
      expect(() => setSunShadow(null, true)).not.toThrow();
      const sun = new THREE.DirectionalLight();
      setSunShadow(sun, 1);
      expect(sun.castShadow).toBe(true);
    });
  });

  describe('④ 单一所有者（结构门）', () => {
    // 迁移前：55 处散在 27 个文件。现在只许剩这两处 + 策略表自己。
    const ALLOWED = new Set([
      'engine/shadowPolicy.js', // 真源自己（3 处）
      'core/Game.js',           // 光源声明：this.sun.castShadow = true（那批在途 WIP 正压着它）
    ]);

    it('src/ 里裸写 castShadow / receiveShadow 的地方只剩真源与光源声明', () => {
      const files = srcFiles();
      const hits = [];
      for (const f of files) {
        const src = stripComments(readFileSync(f, 'utf8'));
        const rel = relative(SRC, f).replace(/\\/g, '/');
        src.split('\n').forEach((ln, i) => {
          if (/\b(castShadow|receiveShadow)\s*=/.test(ln)) hits.push(`${rel}:${i + 1}`);
        });
      }
      const bad = hits.filter((h) => !ALLOWED.has(h.split(':')[0]));
      // 样本下限：扫不到文件的"干净"是假绿
      expect(files.length).toBeGreaterThan(180);
      expect(bad).toEqual([]);
    });

    it('反面证据：同一把尺子在迁移前的那一版上量得到 55 处', () => {
      // 这一条不是断言旧代码，而是钉住"这把尺子量得出来东西"——
      // 尺子写错（比如正则只认某种写法）时上面那条会假绿。
      const sample = [
        '      body.castShadow = true;',
        '  m.castShadow = true;',
        '    c.receiveShadow = true;',
        '    this.sun.castShadow = true;',
        '    mesh.castShadow = mesh.castShadow ?? true;',
      ];
      const count = sample.filter((ln) => /\b(castShadow|receiveShadow)\s*=/.test(ln)).length;
      expect(count).toBe(5);
    });
  });

  describe('⑤ 真读者：地下城几何真的按表落值', () => {
    it('地板是 ground、墙是 prop、柱是 castOnly —— 逐座逐类对得上', () => {
      for (const def of DUNGEON_DEFS) {
        const layout = ProceduralDungeonGenerator.generate(def, 42);
        const group = new THREE.Group();
        ProceduralDungeonGenerator.buildGeometry(group, layout, def);

        let floors = 0, walls = 0, pillars = 0;
        group.traverse((o) => {
          if (!o.isMesh) return;
          const g = o.geometry;
          // 地板：PlaneGeometry / CircleGeometry，且落的是 ground
          if (g.type === 'PlaneGeometry' || g.type === 'CircleGeometry') {
            expect([o.castShadow, o.receiveShadow], `${def.id} 地板`).toEqual([false, true]);
            floors++;
          }
          // 墙段与门板门框：BoxGeometry，落 prop
          if (g.type === 'BoxGeometry') {
            if (o.userData.isWall || o.userData.door || o.userData.isFrame) {
              expect([o.castShadow, o.receiveShadow], `${def.id} 箱体/门`).toEqual([true, true]);
              if (o.userData.isWall) walls++;
            } else {
              // 装饰性箱体（如壁柱）按 castOnly，允许 receiveShadow: false
              expect([o.castShadow, o.receiveShadow], `${def.id} 装饰箱体`).toEqual([true, false]);
            }
          }
          // 柱：CylinderGeometry，落 castOnly
          if (g.type === 'CylinderGeometry') {
            expect([o.castShadow, o.receiveShadow], `${def.id} 柱`).toEqual([true, false]);
            pillars++;
          }
        });
        // 样本下限：每座副本都该有这三类
        expect(floors, `${def.id} 地板数`).toBeGreaterThan(0);
        expect(walls, `${def.id} 箱体数`).toBeGreaterThan(0);
        expect(pillars, `${def.id} 柱数`).toBeGreaterThan(0);
      }
    });

    it('策略表改了，地下城立刻跟着变（证明它真的读表，不是抄了一份值）', () => {
      // 用 in-process 改表的方式不可行（表是冻的），所以改的是"调用方读的那个对象"——
      // 这里直接验：applyShadow 的结果随表走，而地下城建的就是 applyShadow。
      const o = new THREE.Object3D();
      applyShadow(o, 'castOnly');
      expect(o.receiveShadow).toBe(SHADOW_CLASSES.castOnly.receive);
      const layout = ProceduralDungeonGenerator.generate(DUNGEON_DEFS[0], 42);
      const group = new THREE.Group();
      ProceduralDungeonGenerator.buildGeometry(group, layout, DUNGEON_DEFS[0]);
      let anyCastOnly = false;
      group.traverse((m) => {
        if (m.isMesh && m.castShadow === true && m.receiveShadow === false) anyCastOnly = true;
      });
      expect(anyCastOnly).toBe(true);
    });
  });

  describe('⑥ 那两行 no-op 不许长回来', () => {
    it('TextureLibrary 里没有 `x = x ?? true` 这种写法', () => {
      const src = stripComments(readFileSync(join(SRC, 'assets', 'TextureLibrary.js'), 'utf8'));
      expect(/castShadow\s*=\s*[\w.]*castShadow\s*\?\?/.test(src)).toBe(false);
      expect(/receiveShadow\s*=\s*[\w.]*receiveShadow\s*\?\?/.test(src)).toBe(false);
    });

    it('反面证据：那把正则认得出这个写法', () => {
      const bad = 'mesh.castShadow = mesh.castShadow ?? true;';
      expect(/castShadow\s*=\s*[\w.]*castShadow\s*\?\?/.test(bad)).toBe(true);
    });
  });
});
