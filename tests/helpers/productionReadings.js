/**
 * 门禁共用的"从生产里读数"（缺陷② 切片D）。
 *
 * 为什么要抽这一份：`terrain-continuity` 与 `player-walk-witness` 问的是**同一批**生产数字
 * （玩家的身体、走廊名册、区缘带宽）。两处各抄一份，改了一处另一处就会安静地量错口径 ——
 * 所以这里只留一条解析路径，两边都从它取。
 */
import { expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

/** 读生产源码原文（门禁靠它把判据的常数绑回声明处） */
export const readSource = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * 从声明处取一个数：全文必须**恰好命中一处**。
 * 命中 0 处或 2 处都红 —— 口径漂了比数错了更难查，宁可红给改的人看。
 */
export function soleNumber(文件, 式样, 名) {
  const 命中 = [...readSource(文件).matchAll(式样)];
  expect(
    命中.length,
    `"${名}" 在 ${文件} 里命中 ${命中.length} 处（应为 1 处）⇒ 这条门禁的判据口径漂了，` +
      '先对齐口径、再来改这条断言，不要在测试里补一个抄的数'
  ).toBe(1);
  const 数 = Number(命中[0][1]);
  expect(Number.isFinite(数), `"${名}" 从 ${文件} 里读到 "${命中[0][1]}" —— 不是个数，判据整套会静默失效`).toBe(true);
  return 数;
}

/** 玩家的身体：碰撞半径与一阶台阶高度，都由 `PlayerController` 构造期自己声明 */
export const playerRadius = () => soleNumber('src/player/PlayerController.js', /this\.colliderRadius = ([\d.]+);/g, 'colliderRadius');
export const playerStepUp = () => soleNumber('src/player/PlayerController.js', /this\.stepUp = ([\d.]+);/g, 'stepUp');
/** `moveCircle` 除脚下之外多探的那一拍（胸口）：低过这条线的摆件挡不住人 = 不算挡 */
export const chestProbe = () => soleNumber('src/engine/Collision.js', /this\.blocks\(c, y \+ ([\d.]+)\)/g, 'moveCircle 的胸口探点');

/**
 * 走廊名册：从生产的 `const CORRIDORS = [...]` 里逐行解析成 `[x1,z1,x2,z2]`。
 * 加了第六条走廊，所有按这份名册切线的门禁自动多切一刀；表形状改了 ⇒ 当场红，不许空名单跑过去。
 */
export function corridorRoster(文件 = 'src/world/TerrainHeight.js') {
  const 表 = readSource(文件).match(/const CORRIDORS = \[([\s\S]*?)\n\];/);
  expect(表, `在 ${文件} 里找不到 \`const CORRIDORS = [...]\` ⇒ 按名册切线的判据会在空名单上跑`).toBeTruthy();
  const 行 = [...表[1].matchAll(/\[\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\]/g)]
    .map((m) => m.slice(1, 5).map(Number));
  expect(行.length, `\`CORRIDORS\` 表里一条走廊都没解析出来 ⇒ 走廊横切的判据在空转`).toBeGreaterThan(0);
  return 行;
}

/** 走廊半宽：`connectionTerrain` 调用 `corridorRidge` 时传的那个数（谷底/肩峰的位置都由它定） */
export const corridorHalfWidth = () =>
  soleNumber('src/world/TerrainHeight.js', /corridorRidge\(x, z, x1, z1, x2, z2, ([\d.]+)\)/g, 'connectionTerrain 传的 halfWidth');
