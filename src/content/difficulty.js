/**
 * 难度三档 —— §2.3 验收里"战斗深度：装备 + 词缀 + 稀有度、3 条技能树、难度 3 档"
 * 唯一完全没开工的一格（W-E1）。
 *
 * ## 这张表管什么、不管什么
 *
 * 它只管**三个乘子**，每个乘子都对应代码里**唯一一处咽喉**（`difficultyMultiplier(key)`
 * 的调用点由门禁逐个点名）：
 *
 * | 乘子 | 咽喉 | 语义 |
 * |------|------|------|
 * | `enemyHp` | `combat/EnemyManager.spawnAt` | 出生的那一瞬间，敌人血量乘一下 |
 * | `damageTaken` | `combat/CombatController.takeDamage` | 玩家**受到**的伤害乘一下（敌人 / Boss / 场地 / 弹体全部走这一处） |
 * | `souls` | `game/PlayerStats.addSouls` | 魂的**收入**乘一下（扣账不参与，见下） |
 *
 * 它**不**管：敌人的招式表、抗性、减伤（那四张表在 `content/tuning.js`）、Boss 的阶段参数
 * （`content/bossPhases.js`）、掉落池（`content/gear.js`）。把难度写进那些表会得到
 * "同一件事两个乘子"—— 而两个乘子相乘的先后、取整时机没有裁判，正是 B36 那一族。
 *
 * ## 为什么是乘子而不是"另一套数值"
 *
 * 另一套数值的意思是"严酷档再抄一份 12 类敌人的 hp/damage"—— 那等于把 `content/enemies.js`
 * 的名册复制三份，改一处漏两处（B36 / B45 / B62 全是这一族：抄本少的不是数值而是**身份**）。
 * 乘子只有一份真源（名册），三档只描述"差多少"。
 *
 * ## 为什么 `standard` 档必须逐格是 1
 *
 * 出厂档是 `standard`。它的每一格都等于 1，意味着**出厂行为与"没有难度系统"逐字节相同** ——
 * 这条不是靠"我记得写 1 了"，而是 `assertDifficultyTable` 的硬断言（写别的值当场抛）。
 * 有它，这张表可以在任何时刻被接进任何一处，而"接错了"的症状不会伪装成"手感变了"。
 *
 * ## `souls` 只乘收入
 *
 * `addSouls` 也被用来扣账（买升级？不，升级走 `levelUp()` 直接 `-=`）—— 但为了不留下
 * "叙事档扣得更多"这种反直觉的口子，`PlayerStats.addSouls` 只在 `n > 0` 时乘：
 * 扣账走的是别的路径，乘子也不该去碰它。
 */

/**
 * 三个乘子的**键名单**。顺序即 UI 里的展示序，也是"每一格都得有人读"那条门禁的清单 ——
 * 加一格就必须同时加一个调用点，否则 `tests/difficulty.test.js` 当场红。
 */
export const DIFFICULTY_KEYS = ['enemyHp', 'damageTaken', 'souls'];

/**
 * 档位序：**从最容易到最难**。顺序不是装饰 —— `assertDifficultyTable` 用它查三条单调性
 * （敌人血量不降、玩家受伤不降、魂收入不升）。反过来排会让"越往后越难"这句话失效，
 * 而玩家看到的只是"选了严酷反而更轻松"。
 */
export const DIFFICULTY_IDS = ['story', 'standard', 'brutal'];

/** 出厂档。它是唯一被硬性要求"逐格为 1"的那一档。 */
export const DEFAULT_DIFFICULTY = 'standard';

/**
 * 三档。键就是 id（注册表 `index` 形状），行里不再重复写一遍 id。
 *
 * 数值口径：`story` 让"看剧情"这件事成立（敌人 0.8 血、你只吃 0.6 伤害、魂多 25%）；
 * `brutal` 让"每一刀都要算"成立（敌人 1.3 血、你吃 1.5 伤害、魂少 20%）。
 * 两者都**不动敌人的招式与阶段** —— 难度改的是数值，不是内容。
 */
export const DIFFICULTY_TIERS = Object.freeze({
  story: Object.freeze({
    label: '叙事',
    desc: '敌人更脆、你挨得更轻、魂更多 —— 想先把故事走完的选这档',
    multipliers: Object.freeze({ enemyHp: 0.8, damageTaken: 0.6, souls: 1.25 }),
  }),
  standard: Object.freeze({
    label: '标准',
    desc: '出厂配置，一切按名册与阶段表原样',
    multipliers: Object.freeze({ enemyHp: 1, damageTaken: 1, souls: 1 }),
  }),
  brutal: Object.freeze({
    label: '严酷',
    desc: '敌人更硬、你挨得更狠、魂更少 —— 每一刀都要算',
    multipliers: Object.freeze({ enemyHp: 1.3, damageTaken: 1.5, souls: 0.8 }),
  }),
});

/** 注册表用的键名单（`index` 形状的表要有这一份，且要与 `DIFFICULTY_IDS` 同源） */
export const DIFFICULTY_TIER_IDS = Object.keys(DIFFICULTY_TIERS);

/**
 * 认不出的 id **当场抛**（与 `enemyRosterOf` / `sfx:play` 同一口径）。
 * 静默回落出厂档的症状是"选了个不存在的难度，玩起来像标准"，没人会去查。
 */
export function difficultyOf(id) {
  const tier = DIFFICULTY_TIERS[id];
  if (!tier) {
    throw new Error(
      `未知难度 "${id}"（可用：${DIFFICULTY_IDS.join(' / ')}）—— `
      + '静默回落会让"选了个不存在的难度"看起来像"标准档"'
    );
  }
  return tier;
}

/**
 * 存储脏值回落（与 `normalizeShadowQuality` / `padTuning` 同一先例）。
 * 与 `difficultyOf` 分两个函数：一个给"代码里写死的 id"（该抛就抛），
 * 一个给"玩家可写的存储"（脏值回落不抛）—— 合成一个等于让存储里的脏值也能把游戏拦在启动前。
 */
export function normalizeDifficulty(id) {
  return Object.prototype.hasOwnProperty.call(DIFFICULTY_TIERS, id) ? id : DEFAULT_DIFFICULTY;
}

/** 表里的 id 是不是 kebab-case（与注册表 `ID_PATTERN` 同一把尺子，这里不 import 它 —— content/ 不互相转口） */
const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * 整表不变式，**返回错误列表**（注册表的 `invariant` 槽位要的就是这个形状：
 * 一次报全部错，而不是遇到第一条就抛）。挂在注册表条目上（加载期跑一次）+ 用例直接调。
 *
 * 六条，每条对应一种"不报错的说假话"：
 * 1. **键集合恰好等于 `DIFFICULTY_IDS`** —— 多一格（拼错）会静静地永远选不到；
 *    少一格（删了 `brutal`）会让下拉里少一项而没有任何提示。
 * 2. **键是 kebab-case** —— 与全仓 id 同一把尺子。
 * 3. **`label` / `desc` 非空** —— 空标签在面板上是一格空白，玩家只能靠猜。
 * 4. **乘子逐格是有限正数，且键集合恰好等于 `DIFFICULTY_KEYS`** ——
 *    缺一格 → 那一格 `undefined`，乘出来 `NaN`，血条当场消失；多一格 → 没人读的假旋钮。
 * 5. **`standard` 逐格为 1** —— 出厂档零变更（本文件头那段话的落点）。
 * 6. **按档位序单调**（`enemyHp` 不降 / `damageTaken` 不降 / `souls` 不升）——
 *    "从最容易到最难"这句话的真身。
 *
 * 第二参有两种来路：注册表的 `invariant` 槽位递的是 `ctx`（一个对象），用例递的是
 * 一份假档位名单（数组）。两者形状不同，所以这里按 `Array.isArray` 分流 ——
 * 合成一个"要么是对象要么是数组"的参数去猜，正是 B47 那一族（同一格两种语义）。
 */
export function checkDifficultyTable(table = DIFFICULTY_TIERS, ctxOrIds = DIFFICULTY_IDS) {
  const ids = Array.isArray(ctxOrIds) ? ctxOrIds : DIFFICULTY_IDS;
  const out = [];
  const keys = Object.keys(table ?? {});
  if (keys.length !== ids.length || ids.some((id) => !keys.includes(id))) {
    out.push(
      `难度表的档位集合与 DIFFICULTY_IDS 不一致：表里是 [${keys.join(', ')}]，`
      + `名单是 [${ids.join(', ')}] —— 多一格永远选不到，少一格面板里静默少一项`
    );
  }
  for (const id of ids) {
    if (!KEBAB.test(id)) out.push(`难度 id "${id}" 不是 kebab-case`);
    const tier = table?.[id];
    if (!tier) { out.push(`难度表缺 ${id} 这一档`); continue; }
    if (typeof tier.label !== 'string' || !tier.label.trim()) out.push(`难度 ${id} 的 label 是空的`);
    if (typeof tier.desc !== 'string' || !tier.desc.trim()) out.push(`难度 ${id} 的 desc 是空的`);
    const mk = Object.keys(tier.multipliers ?? {});
    if (mk.length !== DIFFICULTY_KEYS.length || DIFFICULTY_KEYS.some((k) => !mk.includes(k))) {
      out.push(
        `难度 ${id} 的乘子集合与 DIFFICULTY_KEYS 不一致：表里是 [${mk.join(', ')}]，`
        + `名单是 [${DIFFICULTY_KEYS.join(', ')}] —— 缺一格乘出 NaN，多一格是没人读的假旋钮`
      );
    }
    for (const k of DIFFICULTY_KEYS) {
      const v = tier.multipliers?.[k];
      if (!Number.isFinite(v) || v <= 0) {
        out.push(`难度 ${id} 的 ${k} 必须是有限正数（收到 ${JSON.stringify(v)}）`);
      }
    }
  }
  // 5：出厂档逐格为 1（只在出厂档真的在表里时才查 —— 缺档已由上面那条报过）
  if (table?.[DEFAULT_DIFFICULTY]) {
    for (const k of DIFFICULTY_KEYS) {
      const v = table[DEFAULT_DIFFICULTY].multipliers?.[k];
      if (v !== 1) {
        out.push(
          `出厂档 ${DEFAULT_DIFFICULTY} 的 ${k} 是 ${v} 而不是 1 —— `
          + '"出厂行为与没有难度系统逐字节相同"这条保证就没了'
        );
      }
    }
  }
  // 6：按档位序单调
  const 单调 = { enemyHp: 1, damageTaken: 1, souls: -1 };
  for (const k of DIFFICULTY_KEYS) {
    for (let i = 1; i < ids.length; i++) {
      const a = table?.[ids[i - 1]]?.multipliers?.[k];
      const b = table?.[ids[i]]?.multipliers?.[k];
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue; // 缺格已报过，别在这里重复喊
      const ok = 单调[k] > 0 ? b >= a : b <= a;
      if (!ok) {
        out.push(
          `难度 ${ids[i]} 的 ${k}（${b}）相对 ${ids[i - 1]}（${a}）走反了 —— `
          + 'DIFFICULTY_IDS 的顺序是"从最容易到最难"，这一格却让后面的档更轻松'
        );
      }
    }
  }
  return out;
}

/** 加载期入口：有问题就抛，把**全部**错误一次说完（与 `assertContent` / `assertArenaScript` 同一条纪律） */
export function assertDifficultyTable(table = DIFFICULTY_TIERS, ids = DIFFICULTY_IDS) {
  const errors = checkDifficultyTable(table, ids);
  if (errors.length) {
    throw new Error(`难度表校验未通过（${errors.length} 处）：\n  - ${errors.join('\n  - ')}`);
  }
  return table;
}

assertDifficultyTable();
