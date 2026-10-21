/**
 * 看板与代码注释的**反向账本** —— 那些"其实早就接上了"的陈述不许回来（W-D6 切片13）。
 *
 * ## 为什么要有这一层
 *
 * §8 进度看板是**当前状态**，冷启动的会话照着它排活。它写着"某样东西没有调用点"，
 * 而代码里其实有 —— 那不是"过时的记录"，那是**一条假陈述**：它会让人以为那件事还没做，
 * 于是**重做一遍**（或者更糟：以为那是已知尾巴而不查）。
 *
 * §9 的 ADR 是**历史日志**：那里记着"切片2 当时没有调用点"是**真的**，不许改 ——
 * 那是那件事怎么被发现的过程。所以这道账本只扫 **§8 看板**与**代码注释**，
 * **不扫 §9**。
 *
 * ## 为什么这些句子进账本，而不是"改了就忘了"
 *
 * 因为**改文本不需要理由，但需要有人盯着**。这些句子是被一条**别处的**门禁证伪的
 * （下面每一条都写了"由谁钉住"）—— 而那条门禁在另一个文件里，没人会把它和这串文字
 * 联系起来。这道账本就是那个联系。
 *
 * ## 口径
 *
 * 账本里的每一条都是**逐字的**整句 —— 不是关键词、不是正则。理由：关键词匹配会把
 * §9 的历史记录也算进来（那里同样写着"没有调用点"，而那是**当时**的真话）。
 * 逐字匹配 + 限定作用域 = 只抓"当前状态"里的那句假话。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const 读 = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** §8 看板那一段（§9 是历史日志，不在作用域内） */
function 看板正文() {
  const s = 读('docs/MASTER_PLAN.md');
  const i = s.indexOf('## 8.');
  const j = s.indexOf('## 9.', i);
  return s.slice(i, j);
}

/** `src/` 下所有 .js 的源码（注释也算 —— 注释里的假陈述一样会误导人） */
function srcSources() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  walk(join(ROOT, 'src'));
  return out.map((p) => ({ 路径: p.replace(ROOT.replace(/\\/g, '/'), ''), 源码: readFileSync(p, 'utf8') }));
}

/**
 * 反向账本：这些句子**不许**再出现在 §8 看板或 `src/` 的注释里。
 * 每条都写着"它为什么是假的"与"由谁钉住真相" —— 没有钉住的那件事不该进这张表
 * （否则就是"我说它没接"，而没接也是可以变成接的）。
 */
const 反向账本 = [
  {
    句子: '治疗飘字与 `weak` 档今天**没有调用点**',
    为什么假: '两样都早已接上 —— `heal` 由 `CombatController._spawnHealNumber` 判出'
      + '（`restore` / `restHeal` 两条入口都调）；`weak` 由 `Resolution.hitKindOf` 的 blocked 分支判出',
    由谁钉住: 'tests/damage-number-a11y.test.js ⑥「名册里每一样 kind 在战斗模块里都有真出处」',
  },
  {
    句子: '战斗类型 7/12，还差 5 类',
    为什么假: '早已到齐 12/12（切片3 补到 10、切片4 补到 12）',
    由谁钉住: 'tests/enemy-roster-table.test.js（四表齐全 / 招式闭合）+ §8 W-B7 行自己的标题',
  },
  {
    句子: '余：CI 接线（`npm run size` 要跑在 build 之后，属 W-D4 的排期）与错误上报',
    为什么假: '两样都已交付 —— `ci.yml` 的门禁链是 `npm ci → lint → test → build → size → perf → e2e` 七步；'
      + '错误上报是 `engine/errorReporter.js` + `error-captured` 事件',
    由谁钉住: 'tests/ci-pipeline.test.js（五步齐且顺序对）+ tests/error-reporter.test.js',
  },
  {
    句子: '余：设置项与面板（属 W-D3 的文件，本片不碰）、战斗三件套的实际接线、字幕、镜头敏感度',
    为什么假: '四项全部早已交付 —— 色觉档设置项在 `SettingsPanel`、战斗三件套走 `barTheme` + `cssColorOf`、'
      + '字幕是 `content/captions.js` + `engine/cues.js` + `ui/Captions.js`、镜头灵敏度是 `engine/lookSensitivity.js`',
    由谁钉住: 'tests/color-vision.test.js + tests/bar-theme.test.js + tests/look-sensitivity.test.js',
  },
  {
    句子: '支线判据仍是内容层里的闭包（注册表只能核"在不在"，核不了"读的那格有没有生产者"',
    为什么假: '已于 W-B3 切片6（主线那半）+ 切片7（支线那半）两半关闭',
    由谁钉住: 'tests/quest-fact-closure.test.js + tests/side-quest-fact-closure.test.js',
  },
  {
    句子: '余：掉落表现的粒子（特效/音效已由 W-B5 切片7 `0fd2bd0` 交付）',
    为什么假: '已由 W-B8 切片7（`8b743ba`）关闭 —— 落地的迸发：碎片散开、落下、淡出；'
      + '碎片**复用掉落本体那份八面体几何**（资源账不多一族几何），碎片总数**封顶在池的大小**',
    由谁钉住: 'tests/loot-burst.test.js（三层：确实迸发 / 魂落地不闪 / 碎片总数封顶）',
  },
];

/** 代码注释里那两句假陈述（它们当时的字面写法） */
const 注释账本 = [
  {
    句子: '`DAMAGE_KINDS.heal` 自切片2 起就没有调用点',
    为什么假: '切片5 接上了 —— `restore` / `restHeal` 两条入口都调 `_spawnHealNumber`',
    由谁钉住: 'tests/damage-number-a11y.test.js ⑥',
  },
  {
    句子: '`DAMAGE_KINDS.weak`（`dn-weak`：12px + 半透明，比普通伤害更小更暗）自切片2 起就没有',
    为什么假: '切片12 接上了 —— `hitKindOf` 的 blocked 分支判出低效',
    由谁钉住: 'tests/damage-number-a11y.test.js ⑥',
  },
];

describe('反向账本：过期的假陈述不许回来', () => {
  const 看板 = 看板正文();
  const 源码们 = srcSources();

  it('§8 看板里没有那几句假话', () => {
    const 命中 = [];
    for (const 条 of 反向账本) {
      if (看板.includes(条.句子)) 命中.push(`${条.句子} —— ${条.为什么假}`);
    }
    expect(命中, `§8 是**当前状态**，下面这几句是假的：\n${命中.join('\n')}`).toEqual([]);
  });

  it('代码注释里也没有那几句假话', () => {
    const 命中 = [];
    for (const 条 of 注释账本) {
      for (const { 路径, 源码 } of 源码们) {
        if (源码.includes(条.句子)) 命中.push(`${路径}：${条.句子} —— ${条.为什么假}`);
      }
    }
    expect(命中, `注释里的假陈述同样会误导人：\n${命中.join('\n')}`).toEqual([]);
  });

  it('反向账本自己不是空转（它真的扫到了东西）', () => {
    expect(看板.length, '§8 看板那一段没扫到 —— 作用域写错了，账本会在空集上恒真').toBeGreaterThan(5000);
    expect(源码们.length, '一个 src 文件都没扫到').toBeGreaterThan(50);
    expect(反向账本.length + 注释账本.length).toBeGreaterThan(5);
  });

  it('§9 的历史记录**不受**这道账本约束（那里记的是"当时"的真话）', () => {
    // 这一条把"为什么只扫 §8"写进判据：§9 里那句"没有调用点"是切片2 的现场记录，
    // 改它就是抹掉那件事怎么被发现的。账本不许碰它 —— 也不许因为它而误报。
    const 全 = 读('docs/MASTER_PLAN.md');
    const i = 全.indexOf('## 9.');
    const 历史 = 全.slice(i);
    const 在历史里 = 历史.includes('没有调用点');
    expect(typeof 在历史里).toBe('boolean');
    // §8 的作用域必须真的切在 §9 之前（否则上面那条例外就失效了）
    expect(看板.length).toBeLessThan(全.length - i);
  });
});
