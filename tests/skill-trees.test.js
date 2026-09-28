/**
 * 技能树的三条流派（W-B6 切片1）。
 *
 * 这一片把"技能树"从 `game/WeaponSkillTree.js` 里的一个 155 行类搬成
 * `content/skillTrees.js` 的一张表（W-B1 的纪律：跨块共享的纯数据住在最底层），
 * 并把**原先两处 `['sword','staff']` 手抄**换成一份流派清单。要钉死的是四件事：
 *
 * 1. **数量**：§5 写着"3 条 × 10+ 节点"，所以要数的是**每一流的可加点节点**，
 *    不是"表里一共有几行" —— 后者把叙事技算进去就永远达标。
 * 2. **树的形状**：有根、无环、有"两条支脉汇合"的节点。少了最后一样，技能树其实是直线。
 * 3. **`effect` 的每一格都真的有人读**：这是 B68 那一族（表里有、没人读）在技能树上的版本 ——
 *    把 `melee` 拼成 `meele` 不会报错，只会让玩家花掉的技能点什么也不变。白名单
 *    （`SKILL_EFFECT_CONSUMERS`）逐格写明"谁在哪读它"，这里去源码里核对那句话仍然成立。
 * 4. **门槛是活的**：修前 `m-mana` 那一格写的是 `quest: 'spells'`，而 ① 判定函数从来不读
 *    `quest`，② `'spells'` 不是任何一张任务表里的 id（那条任务叫 `learn-spell`）——
 *    "看起来有门、其实敞着"。接活之后要有正反两侧读数。
 *
 * 另外配一组"坏表必须被咬住"的探针：注册表不变式写错了不会有人发现，除非有人喂它坏数据。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  SKILL_BRANCHES, SKILL_BRANCH_IDS, SKILL_TREES, SKILL_EFFECT_CONSUMERS, SKILL_EFFECT_KEYS,
  nodesOf, purchasableNodes, skillById, isGrant,
} from '../src/content/skillTrees.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { WeaponSkillTree } from '../src/game/WeaponSkillTree.js';
import { getStoryLockReason } from '../src/game/StoryWeaponSkills.js';
import { installWindowShim } from './helpers/enemyHarness.js';

installWindowShim();

const ROOT = process.cwd();
const 全部节点 = () => SKILL_BRANCH_IDS.flatMap((b) => nodesOf(b));

/** 老存档里可能存着的那八个 id（W-B6 之前就存在的节点） */
const 老八 = ['s-blade', 's-combo', 's-riposte', 's-finisher', 'm-arcane', 'm-charge', 'm-mana', 'm-transform'];

/** 把技能树那张注册表条目换成一份（可能是坏的）表，再整仓校验一遍 */
const withTrees = (table) => checkContent(CONTENT_TABLES.map((e) => (e.kind === 'skillTrees' ? { ...e, table } : e)));
const 克隆 = () => JSON.parse(JSON.stringify(SKILL_TREES));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (readdirSync(dir, { withFileTypes: true }).find((d) => d.name === name)?.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe('W-B6 切片1：三条流派的数量目标与身份', () => {
  it('§5 的口径是"每一流 ≥10 个可加点节点" —— 数的是可加点那一份，不含叙事技', () => {
    expect(SKILL_BRANCH_IDS).toEqual(['sword', 'staff', 'realm']);
    expect(SKILL_BRANCHES.map((b) => b.id), 'ID 清单与流派行是同一份，不是两处手抄').toEqual(SKILL_BRANCH_IDS);
    for (const b of SKILL_BRANCH_IDS) {
      const n = nodesOf(b).filter((x) => !isGrant(x));
      expect(n.length, `流派 "${b}" 只有 ${n.length} 个可加点节点`).toBeGreaterThanOrEqual(10);
    }
    expect(purchasableNodes().length, '可加点节点总数').toBeGreaterThanOrEqual(30);
  });

  it('id 全仓唯一，且老存档里那八个 id 一个都没丢（丢一个就是读档后点不亮的格）', () => {
    const ids = 全部节点().map((n) => n.id);
    expect(new Set(ids).size, '有 id 撞了 —— 存档只存 id').toBe(ids.length);
    for (const id of 老八) {
      expect(skillById(id), `老存档里的 "${id}" 在新表里找不到`).toBeTruthy();
    }
  });

  it('每棵树都是连得起来的 DAG：有根、无环、有一条"两条支脉汇合"的节点', () => {
    for (const b of SKILL_BRANCH_IDS) {
      const nodes = nodesOf(b).filter((n) => !isGrant(n));
      const ids = new Set(nodes.map((n) => n.id));
      expect(nodes.some((n) => (n.reqs ?? []).length === 0), `"${b}" 一个根节点都没有`).toBe(true);
      expect(
        nodes.some((n) => (n.reqs ?? []).length >= 2),
        `"${b}" 没有"两条支脉汇合"的节点 —— 少了它，这棵树其实是一条直线`,
      ).toBe(true);
      const 被需要 = new Set(nodes.flatMap((n) => n.reqs ?? []));
      expect(nodes.some((n) => !被需要.has(n.id)), `"${b}" 没有叶子节点`).toBe(true);
      // 可达性：从根出发能剥完（等价于无环 + 前置都在树内）
      const done = new Set();
      let moved = true;
      while (moved) {
        moved = false;
        for (const n of nodes) {
          if (done.has(n.id)) continue;
          if ((n.reqs ?? []).every((r) => done.has(r))) { done.add(n.id); moved = true; }
        }
      }
      expect(done.size, `"${b}" 里有节点从根走不到（多半是环）`).toBe(ids.size);
    }
  });

  it('叙事技（grant）是白送的：cost 0、不写 lock、都有故事文本', () => {
    const grants = 全部节点().filter(isGrant);
    expect(grants.length, '一个叙事技都没有').toBeGreaterThanOrEqual(6);
    for (const g of grants) {
      expect(g.cost, `${g.id} 是叙事技却要 ${g.cost} 点`).toBe(0);
      expect(g.lock, `${g.id} 同时写了 grant 与 lock`).toBeUndefined();
      expect(g.lore, `${g.id} 解锁时会写进日志，但没有 lore`).toBeTruthy();
    }
    for (const b of SKILL_BRANCH_IDS) {
      expect(nodesOf(b).filter(isGrant).length, `"${b}" 一条叙事技都没有`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('W-B6 切片1：effect 的每一格都真的有人读（B68 那一族在技能树上的版本）', () => {
  it('节点用到的键都在白名单里，白名单里的键也都被用到了（双向，没有多余条目）', () => {
    const 用到 = new Set(全部节点().flatMap((n) => Object.keys(n.effect ?? {})));
    for (const k of 用到) {
      expect(SKILL_EFFECT_KEYS, `effect 用了 "${k}"，但它不在消费者白名单里`).toContain(k);
    }
    for (const k of SKILL_EFFECT_KEYS) {
      expect(用到.has(k), `白名单里的 "${k}" 没有任何节点在用（是条死条目）`).toBe(true);
      expect(SKILL_EFFECT_CONSUMERS[k]?.where, `"${k}" 没有写"谁在读它"`).toBeTruthy();
    }
  });

  it('去源码里核对白名单那句话仍然成立：每一格都有 `sk.<键>` 或 `skillMods?.<键>` 在读', () => {
    const src = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(f, 'utf8')).join('\n');
    const 野 = [];
    for (const k of SKILL_EFFECT_KEYS) {
      if (!src.includes(`sk.${k}`) && !src.includes(`skillMods?.${k}`)) 野.push(k);
    }
    expect(
      野,
      `这些 effect 键在 src/ 里没有任何一处读它 —— 玩家的技能点会白花：${野.join('、')}`
        + `（白名单上写着：${野.map((k) => `${k} → ${SKILL_EFFECT_CONSUMERS[k].where}`).join('；')}）`,
    ).toEqual([]);
  });
});

describe('W-B6 切片1：注册表不变式真的咬得住（坏表探针）', () => {
  it('真表本身零错误', () => {
    expect(checkContent()).toEqual([]);
    const entry = CONTENT_TABLES.find((t) => t.kind === 'skillTrees');
    expect(entry, 'skillTrees 那张表没进 CONTENT_TABLES').toBeTruthy();
    expect(entry.value.minLength, '每一流 ≥10 个节点这条要写进注册表，否则没人替它数').toBe(10);
  });

  const 臂 = [
    ['跨流派 id 撞车', (t) => { t.staff[0].id = 's-blade'; }, /重了/],
    ['effect 键拼错（meele）', (t) => { t.sword[0].effect = { meele: 0.1 }; }, /不在消费者白名单/],
    ['effect 值是 0', (t) => { t.sword[0].effect = { melee: 0 }; }, /非 0 的数/],
    ['effect 是空对象', (t) => { t.sword[0].effect = {}; }, /effect 是空的/],
    ['reqs 指向本树没有的 id', (t) => { t.sword[1].reqs = ['s-nope']; }, /不在同一棵树里/],
    ['reqs 指向自己', (t) => { t.sword[0].reqs = ['s-blade']; }, /指向了自己/],
    ['reqs 连成环', (t) => { t.sword[0].reqs = ['s-edge']; }, /连成一个环/],
    ['grant 与 lock 同时写', (t) => { const n = t.sword.find((x) => x.lock); n.grant = { boss: 'archmagus' }; }, /同时写了 grant 与 lock/],
    ['可加点节点 cost 写成 0', (t) => { t.sword[0].cost = 0; }, /必须是正整数/],
    ['整条流派缺席', (t) => { delete t.realm; }, /缺流派 "realm"/],
  ];
  for (const [名, mutate, 期望] of 臂) {
    it(`${名} → 红`, () => {
      const t = 克隆();
      mutate(t);
      const errs = withTrees(t);
      expect(errs.some((e) => 期望.test(e)), `没咬住（错误：${JSON.stringify(errs.slice(0, 3))}）`).toBe(true);
    });
  }
});

describe('W-B6 切片1：门槛是活的（m-mana 那格从"看起来有门"接活）', () => {
  const game = (spellCasts, chapter = 2, fragment = 99) => ({
    quests: { chapter, stats: { spellCasts } },
    // 可加点节点现在也带 `lore`（原 STORY_SKILL_META 那一份并过来了），解锁时会写日志
    storyJournal: { getCounts: () => ({ fragment }), addSilent() {} },
  });

  it('法力泉涌的门读的是"施放法术次数"：不够时拦下、够了放行', () => {
    expect(getStoryLockReason(game(3), 'm-mana')).toMatch(/施放法术/);
    expect(getStoryLockReason(game(8), 'm-mana')).toBeNull();
  });

  it('拦得住也放得开：`canUnlock` 跟着同一个判定走（不是只画在界面上）', () => {
    const t = new WeaponSkillTree({}, { toast() {} }, game(3));
    t.addPoint(10);
    t.unlock('m-arcane', 'staff');
    const mana = nodesOf('staff').find((n) => n.id === 'm-mana');
    expect(t.canUnlock(mana), '施法次数不够时不该能点').toBe(false);
    t.game = game(8);
    expect(t.canUnlock({ ...mana, reqs: ['m-arcane'] }), '够了就该能点').toBe(true);
  });

  it('每一格 lock 都有人读：把 `lock` 的每种形状各造一条读数', () => {
    expect(getStoryLockReason(game(99, 2), 'm-arcane'), '章节达标就该放行').toBeNull();
    expect(getStoryLockReason(game(99, 2, 0), 's-combo')).toMatch(/叙事碎片/);
    expect(getStoryLockReason({ quests: { chapter: 1, stats: {} } }, 'm-transform')).toMatch(/需 Chapter 4/);
  });
});

describe('W-B6 切片1：状态机（三分支 / reqs 数组 / 叙事技白送 / 存档往返）', () => {
  const 全通 = {
    quests: { chapter: 5, stats: { bossDefeated: true, boss2Defeated: true, boss3Defeated: true, voidBossDefeated: true, chaosBossDefeated: true, spellCasts: 99 } },
    storyJournal: { getCounts: () => ({ fragment: 99 }), addSilent() {} },
  };

  it('reqs 是数组：汇合节点缺任意一条支脉都点不亮', () => {
    const t = new WeaponSkillTree({}, { toast() {} }, 全通);
    t.addPoint(99);
    for (const id of ['s-blade', 's-combo', 's-tempo', 's-reach', 's-realmedge', 's-echo', 's-riposte', 's-guardbreak']) {
      t.unlock(id, 'sword');
    }
    const ann = nodesOf('sword').find((n) => n.id === 's-annihilate');
    expect(t.canUnlock(ann), '缺 s-finisher 时不该能点').toBe(false);
    t.unlock('s-finisher', 'sword');
    expect(t.canUnlock({ ...ann, reqs: ['s-guardbreak', 's-finisher'] }), '两条支脉齐了就该能点').toBe(true);
  });

  it('叙事技由 boss/chapter 自动白送，且不扣技能点', () => {
    const t = new WeaponSkillTree({}, { toast() {} }, 全通);
    t.addPoint(3);
    const 送 = t.tryNarrativeUnlocks(全通);
    expect(送).toBe(true);
    const grants = 全部节点().filter(isGrant);
    for (const g of grants) expect(t.unlocked.has(g.id), `${g.id} 没被白送`).toBe(true);
    expect(t.skillPoints, '白送不该动技能点').toBe(3);
    expect(t.tryNarrativeUnlocks(全通), '第二次调用不该再送一遍').toBe(false);
  });

  it('getModifiers 把三条流派的加成加在一起；存档往返只靠 id', () => {
    const t = new WeaponSkillTree({}, { toast() {} }, 全通);
    t.addPoint(99);
    t.unlock('s-blade', 'sword');
    t.unlock('r-attune', 'realm');
    t.unlock('m-focus', 'staff');
    const m = t.getModifiers();
    expect(m.melee).toBeCloseTo(0.08);
    expect(m.spell).toBeCloseTo(0.08);
    expect(m.mana).toBe(15);
    const back = new WeaponSkillTree({}, { toast() {} }, null);
    back.fromJSON(JSON.parse(JSON.stringify(t.toJSON())));
    expect([...back.unlocked].sort()).toEqual([...t.unlocked].sort());
    expect(back.skillPoints).toBe(t.skillPoints);
  });

  it('三条流派的清单来自一份真源：面板/日志不必再手抄 `[\'sword\',\'staff\']`', () => {
    // 要抓的形状是**把流派 id 排成一个数组字面量**（手抄清单），而不是"某个文件里出现过 'staff'"
    // —— 注释里解释这件事时本来就会出现单个 id，那样的门禁会被自己的文档绊倒
    const 手抄 = /\[[^\]]*'sword'[^\]]*'staff'[^\]]*\]|\[[^\]]*'staff'[^\]]*'sword'[^\]]*\]/;
    for (const f of ['src/ui/UpgradePanel.js', 'src/ui/WeaponSkillJournalTab.js', 'src/game/WeaponSkillTree.js']) {
      const s = readFileSync(join(ROOT, f), 'utf8');
      expect(手抄.test(s), `${f} 里还手抄着流派清单（sword/staff 排成一个数组字面量）—— 加第四条流派时它会静默漏掉`).toBe(false);
    }
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html.includes('sword-skills') || html.includes('staff-skills'), 'index.html 还在手抄流派容器').toBe(false);
  });
});

describe('W-B6 切片1：营火面板的流派行是按表生成的（"少一整棵树"不会再静默发生）', () => {
  it('三条流派都画得出来，且点得动：点一格 → 解锁 → 重画后那一格变成"已解锁"', async () => {
    const { UpgradePanel } = await import('../src/ui/UpgradePanel.js');
    const { makeMarkupDom } = await import('./helpers/fakeMarkupDom.js');
    const 真文档 = globalThis.document;
    const doc = makeMarkupDom();
    globalThis.document = doc;
    try {
      const host = doc.createElement('div');
      host.id = 'upgrade-panel';
      host.innerHTML = '<div id="upgrade-skills-section" class="hidden"></div>';
      doc.hosts['upgrade-panel'] = host;
      doc.hosts['upgrade-skills-section'] = host.querySelector('#upgrade-skills-section');

      const ws = new WeaponSkillTree({}, { toast() {} }, null);
      ws.addPoint(99);
      const panel = Object.create(UpgradePanel.prototype);
      panel.panel = host;
      // 真 refresh 会碰十几个 DOM 节点，这里只保留与技能页签有关的那一段（重画）
      panel.refresh = () => { for (const b of SKILL_BRANCH_IDS) panel.renderSkills(b, ws); };

      panel._ensureSkillBranches();
      for (const b of SKILL_BRANCH_IDS) panel.renderSkills(b, ws);

      const 容器 = host.querySelectorAll('[data-skill-branch]');
      expect(容器.length, '面板上的流派容器数与 SKILL_BRANCHES 对不上').toBe(SKILL_BRANCH_IDS.length);
      for (const b of SKILL_BRANCH_IDS) {
        const el = host.querySelector(`[data-skill-branch="${b}"]`);
        expect(el, `"${b}" 这一格容器没被建出来`).toBeTruthy();
        const 该行 = nodesOf(b);
        expect(el.querySelectorAll('.skill-btn').length, `"${b}" 画出来的格子数不对`).toBe(该行.length);
        expect(
          el.querySelectorAll('.skill-btn.narrative').length,
          `"${b}" 的叙事技没画在同一行里 —— 玩家看不到"击败 Boss 解锁"那几格`,
        ).toBe(该行.filter((n) => n.grant).length);
      }

      // 点得动：realm 的第一格（根节点、cost 1）点了之后应当真进账
      const 第一格 = host.querySelector('[data-skill-branch="realm"]')?.querySelectorAll('.skill-btn:not([disabled])')[0] ?? null;
      expect(第一格, 'realm 一个能点的格子都没有（点不动 = 只能看）').toBeTruthy();
      const id = 第一格.dataset.id;
      expect(ws.unlocked.has(id)).toBe(false);
      第一格.click();
      expect(ws.unlocked.has(id), `点了 "${id}" 但没解锁`).toBe(true);
      const 重画的 = host.querySelector('[data-skill-branch="realm"]')?.querySelector(`[data-id="${id}"]`);
      expect(重画的.classList.contains('owned'), '解锁之后那一格没有重画成 owned').toBe(true);
    } finally {
      globalThis.document = 真文档;
    }
  });

  it('叙事技那一栏读的是节点自己的 `grant`（字段搬过家之后还读旧名字的读取方）', async () => {
    const { UpgradePanel } = await import('../src/ui/UpgradePanel.js');
    const { makeMarkupDom } = await import('./helpers/fakeMarkupDom.js');
    const 真文档 = globalThis.document;
    const doc = makeMarkupDom();
    globalThis.document = doc;
    try {
      const 叙事 = SKILL_BRANCH_IDS.flatMap((b) => nodesOf(b)).filter((n) => n.grant);
      const body = doc.createElement('div');
      body.id = 'upgrade-lore-body';
      doc.hosts['upgrade-lore-body'] = body;

      const ws = new WeaponSkillTree({}, { toast() {} }, null);
      const panel = Object.create(UpgradePanel.prototype);
      panel.game = { quests: { chapter: 3 }, storyJournal: { getCounts: () => ({ fragment: 1 }) } };

      expect(
        () => panel.renderLore(ws),
        '叙事技那一栏读不到门槛字段（读的仍是搬家前的名字）就会让整块 refresh 抛异常 —— 面板直接白掉',
      ).not.toThrow();

      const 文 = body.textContent;
      expect((文.match(/需击败 Boss/g) ?? []).length, 'Boss 门的叙事技没写出门槛').toBe(叙事.filter((n) => n.grant.boss).length);
      expect((文.match(/需 Chapter \d+/g) ?? []).length, '章节门的叙事技没写出门槛').toBe(叙事.filter((n) => n.grant.chapter).length);
      expect(文, '简介行没把叙事技的总数写出来').toContain(`叙事技能 0/${叙事.length}`);
    } finally {
      globalThis.document = 真文档;
    }
  });
});
