/**
 * Boss 显名的单源门禁（"同一个身份、多个字面量"家族 —— 横向对比同类出口才看得见）。
 *
 * 病灶：`bossRoster.js` 是自己声明的"它叫什么"唯一真源，但同一只 Boss 的显示名在
 * 过场标题、击败横幅、目标/航点/日志、营火对话里被抄成了字面量。抄着抄着就分叉：
 * `singularity-herald` 名册叫「引力化身·奇点领主」，过场用全名，而击败横幅/目标/航点/
 * 日志/营火却写成短名「奇点领主」—— 同一只 Boss 在两张台口两个名字，且没有任何闸门会响。
 *
 * 本门禁把规矩钉死：
 * - **身份台口**（过场标题、击败横幅）必须用名册全名；
 * - **省地方的口子**（目标标题 / 航点标签 / 日志 / 营火选择）必须用名册登记的 `shortName`，
 *   没登记短名的就用全名 —— 即"短名也只有一个出处"；
 * - 上述内容表里不许再出现等于名册全名/短名的字面量（静态扫描，`bossRoster.js` 自己与
 *   Boss 子类的构造期默认名除外 —— 后者由 `content-registry.test.js` 单独核对）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOSS_ROSTER, bossById } from '../src/content/bossRoster.js';
import { BOSS_DEFEAT_LINES } from '../src/content/bossDialogue.js';
import { BOSS_CINEMATICS } from '../src/cinematic/CinematicManager.js';
import { OBJECTIVES } from '../src/content/objectives.js';
import { REST_DIALOGUES } from '../src/content/restDialogues.js';
import { t } from '../src/engine/i18n.js';

const ROOT = process.cwd();
const WORLD_IDS = BOSS_ROSTER.map((b) => b.id);
const shortOf = (id) => bossById(id)?.shortName ?? bossById(id)?.name;

/** 这些"内容/界面表"里不许出现名册全名/短名的字面量 */
const SCANNED = [
  'src/content/bossDialogue.js',
  'src/content/objectives.js',
  'src/content/restDialogues.js',
  'src/game/StoryJournal.js',
  'src/ui/QuestAssistant.js',
];

describe('Boss 显名单源（名册是"它叫什么"的唯一真源）', () => {
  it('过场标题：每只世界 Boss 都用名册全名', () => {
    for (const id of WORLD_IDS) {
      expect(BOSS_CINEMATICS[id]?.title, `${id} 没有过场配置`).toBeTruthy();
      expect(BOSS_CINEMATICS[id].title, `${id} 过场标题 ≠ 名册全名`).toBe(bossById(id).name);
    }
  });

  it('击败横幅标题：每只世界 Boss 都用名册全名', () => {
    for (const id of WORLD_IDS) {
      expect(BOSS_DEFEAT_LINES[id]?.title, `${id} 没有击败横幅`).toBeTruthy();
      // W-D2 切片16u：横幅标题是名册的**键**（`nameKey`）—— 展开后必须与名册全名逐字相等
      expect(t(BOSS_DEFEAT_LINES[id].title), `${id} 击败横幅标题 ≠ 名册全名`).toBe(bossById(id).name);
    }
  });

  it('目标/航点：需要短名的口子只许用名册登记的 shortName', () => {
    for (const o of OBJECTIVES) {
      if (!o.bossId) continue;
      const expected = shortOf(o.bossId);
      // W-D2 切片16j：目标标题与航点标签都是**名册登记的短名键** ——
      // 展开之后必须与名册登记的短名逐字相等。
      expect(t(o.title), `目标 ${o.id} 标题`).toBe(expected);
      if (o.waypoint) {
        expect(o.waypoint.label, `目标 ${o.id} 航点标签没接名册的短名键`)
          .toBe(bossById(o.bossId).shortNameKey);
        expect(t(o.waypoint.label), `目标 ${o.id} 航点标签展开后与名册短名不同`)
          .toBe(expected);
      }
    }
  });

  it('营火对话不许出现登记了短名的 Boss 的全名（省地方的口子就用短名）', () => {
    const labels = [];
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.choices)) for (const c of node.choices) labels.push(c.label);
      for (const v of Object.values(node)) walk(v);
    };
    walk(REST_DIALOGUES);
    for (const id of WORLD_IDS) {
      if (!bossById(id)?.shortName) continue;   // 没登记短名的 Boss 不在此列
      expect(labels.some((l) => l.includes(bossById(id).name)),
        `营火对话里出现了 ${id} 的全名「${bossById(id).name}」—— 省地方的口子该用短名`).toBe(false);
    }
  });

  it('内容表里不许再有等于名册全名/短名的字面量（静态扫描）', () => {
    const offenders = [];
    for (const rel of SCANNED) {
      const code = readFileSync(join(ROOT, rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const b of BOSS_ROSTER) {
        const names = [b.name, b.shortName].filter(Boolean);
        for (const n of names) {
          const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(`['"\`]${esc}['"\`]`).test(code)) offenders.push(`${rel} 里有字面量「${n}」`);
        }
      }
    }
    expect(offenders, `这些显示名该从名册读，别抄字面量：\n${offenders.join('\n')}`).toEqual([]);
  });

  // 分隔守卫：名册非空，上面各循环不许空转成"干净"
  it('分隔守卫：世界名册非空且五只齐全', () => {
    expect(WORLD_IDS.slice().sort())
      .toEqual(['archmagus', 'chaos-overlord', 'shadow-warden', 'singularity-herald', 'void-chronarch']);
  });
});
