/**
 * §1.2 C3「通关时长」那条读数里的**数**必须与内容表一致（W-E3 切片8）。
 *
 * ## 为什么要有这道门禁
 *
 * §1.2 那一行是**看板上的当前状态**（"通关时长约 1 小时量级"）——
 * 冷启动的会话照着它判断"还差多少内容"。而它写着的是**数**（主线 32 步 / 支线 38 条 /
 * 副本 9 座 / 回声 49 条）⇒ 那些数会**过期**：今天加了内容，读数不动，下一个人
 * 就照着一个过期的数排活（那是"过时的记录"变成"假陈述"的那一步）。
 *
 * §9 的 ADR 是**历史日志**（那里记着"当时 1 小时量级"是真的，不许改）——
 * 这道门禁只扫 **§1.2 那一行**。
 *
 * ## 口径
 *
 * 读数里那四个数必须**逐个等于**内容表的实数：内容长大 ⇒ 读数必须跟着改 ⇒ 当场红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAINLINE } from '../src/content/objectives.js';
import { SIDE_QUESTS_ALL } from '../src/content/sideQuests.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { ECHOES } from '../src/content/echoes.js';
import { ZONE_ORDER } from '../src/content/ZoneIdentity.js';

const ROOT = process.cwd();
const 读 = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** §1.2 那一行（C3） */
function c3行() {
  const s = 读('docs/MASTER_PLAN.md');
  const 行 = s.split(/\r?\n/).find((l) => l.startsWith('| C3 |'));
  expect(行, '§1.2 那一行不见了（C3 读数被删了？）').toBeTruthy();
  return 行;
}

describe('① 读数里的数 = 内容表的实数', () => {
  it('主线步数 / 分区专属支线 / 副本 / 回声 四个数都对得上', () => {
    const 行 = c3行();
    const 分区支线 = SIDE_QUESTS_ALL.filter((q) => ZONE_ORDER.includes(q.zone)).length;
    const 实数 = {
      '主线 55 步': MAINLINE.length === 55,
      '分区专属支线 38': 分区支线 === 38,
      '副本 9': DUNGEON_DEFS.length === 9,
      '回声 49': ECHOES.length === 49,
    };
    for (const [片段, 对] of Object.entries(实数)) {
      expect(对, `内容表变了，但 §1.2 的 C3 读数里那个数没跟着改（找 "${片段}"）`).toBe(true);
      expect(行, `§1.2 的 C3 读数里没有 "${片段}" —— 读数与内容表脱节了`).toContain(片段);
    }
  });

  it('读数里**多写**的数也不许有（不许出现内容表之外的数）', () => {
    // 读数里出现的"内容规模"类数字：主线 N 步 / 支线 N 条 / 副本 N 座 / 回声 N 条
    const 行 = c3行();
    const 数 = (re) => {
      const m = 行.match(re);
      return m ? Number(m[1]) : null;
    };
    const 读到的 = {
      主线: 数(/主线 (\d+) 步/),
      支线: 数(/分区专属支线 (\d+)/),
      副本: 数(/副本 (\d+) 座/),
      回声: 数(/回声 (\d+) 条/),
    };
    const 分区支线 = SIDE_QUESTS_ALL.filter((q) => ZONE_ORDER.includes(q.zone)).length;
    expect(读到的.主线, '读数里没有主线步数').toBe(MAINLINE.length);
    expect(读到的.支线, '读数里没有分区专属支线数').toBe(分区支线);
    expect(读到的.副本, '读数里没有副本数').toBe(DUNGEON_DEFS.length);
    expect(读到的.回声, '读数里没有回声数').toBe(ECHOES.length);
  });
});

describe('② 读数说的是**哪一段**时长', () => {
  it('主线与全清分开写（只写一个总数就看不出缺口在哪一段）', () => {
    const 行 = c3行();
    expect(行, 'C3 读数没有区分"主线"与"全清"').toContain('主线');
    expect(行, 'C3 读数没有点名"全清"').toContain('全清');
    expect(行, 'C3 读数没有点名缺口在主线').toContain('缺口在**主线**');
  });

  it('主线那 55 步的下标是存档语义 —— 读数里说清了"要加长主线得先有存档迁移"', () => {
    const 行 = c3行();
    // 点名的是**存档里的那个字段**（`quests.index`）—— 迁移改的就是它
    expect(行, 'C3 读数没提主线插步的存档语义').toContain('quests.index');
    expect(行, 'C3 读数没提"存档迁移"这条前提').toContain('存档迁移');
  });
});
