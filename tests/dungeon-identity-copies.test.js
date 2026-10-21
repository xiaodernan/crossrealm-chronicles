/**
 * 地下城身份的其余手抄本各归其表 —— W-B10 切片3c。
 *
 * ## 这一片修的是哪一句话
 *
 * 「哪几座副本算三界试炼的那一关」在动手之前有**五条各自成立的算式**：
 *
 * | # | 位置 | 它在算什么 |
 * |---|------|-----------|
 * | 1 | `content/objectives.js` `CONDITIONS.checkAllDungeons` | 飞升门（真门）—— 三枚字面量 `.has()` |
 * | 2 | `game/ExplorationMap.js:16` | 新档开局点亮哪几座 —— 同一串字面量 |
 * | 3 | `game/ExplorationMap.js:123` | 旧档缺 `dungeonRevealed` 时的兜底 —— **同一条事实第二次抄** |
 * | 4 | `ui/QuestAssistant.js:196` | 助手清单里那一步 `ids: [...]` + 文案"三座地下城" |
 * | 5 | `game/QuestSystem.js:40` | 指路用的局部 `DUNGEON_IDS` = `MAINLINE.filter(type==='dungeon')` |
 *
 * 五条今天**恰好同值**，而没有任何一条纽带把它们绑在一起。同值不是等价：
 * 名册从 5 座长到 7 座那天（W-B9），跟着动的只有 `dungeons.js`。
 * 现在这句话由行上的 `trial` 说一次，`TRIAL_DUNGEON_IDS` 是它唯一的推导，五个读者都问这一份。
 *
 * ## 第二条：世界地图上那几个副本点
 *
 * `ui/WorldMapPanel.js` 自己养过一张五行表（`{ x: -190, z: 25, t: '遗城', id: 'ruin-crypt' }`）：
 * 坐标逐格等于表里的 `entrance`、简称是全名的手写缩写，而**行数是五、名册是七** ——
 * 新增的两座在地图上没有点（普查 `.tmp-20261002/wb10s3c-census.mjs`：表 7 行 / 面板 5 行，
 * 差集正是 `gloom-mist-crypt` / `radiant-dawn-hall`）。面板现在直接遍历 `DUNGEON_DEFS`。
 *
 * ## 用例分六层
 *
 * ① 推导账（`trial` → 清单，含"清单不许是空集"这条反身判据）
 * ② 飞升门的真值表（逐座清空/漏一座/多清非试炼座/没打第三 Boss）
 * ③ 开局点亮（新建图、读档兜底、存档优先）
 * ④ 指路读同一份（`QuestSystem` 那条 case）
 * ⑤ 世界地图**真渲染**（假 canvas 录 `fillText` / `arc`）
 * ⑥ 绝迹与反向对照（把旧写法贴回去，门禁必须点名）
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { installWindowShim } from './helpers/enemyHarness.js';
import { fakeDoc } from './helpers/fakePanelDom.js';
import { DUNGEON_DEFS, DUNGEON_IDS, TRIAL_DUNGEON_IDS } from '../src/content/dungeons.js';
import { CONDITIONS, MAINLINE, emptyStats } from '../src/content/objectives.js';
import { CONTENT_TABLES, checkDungeons, checkFields } from '../src/content/registry.js';
import { ExplorationMap } from '../src/game/ExplorationMap.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { QuestAssistant } from '../src/ui/QuestAssistant.js';
import { t } from '../src/engine/i18n.js';
import { WorldMapPanel } from '../src/ui/WorldMapPanel.js';
import { 串抄, 抄本表, 试炼三座, 旧面板表, 门抄, 滤抄 } from './helpers/wb10s3c-copies.js';

beforeAll(installWindowShim);

const ROOT = process.cwd();
const readSrc = (rel) => readFileSync(join(ROOT, 'src', rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * 三份历史读数（`试炼三座` / `旧面板表` / `抄本表`，连同两把通用尺）住在
 * `tests/helpers/wb10s3c-copies.js`，与誊写对账脚本 `.tmp-20261002/wb10s3c-oldfrag.mjs` 共用同一份字节 ——
 * 那些字节是从 `git show e5ce526:src/<文件>` 誊下来的，誊错了这条反向对照就永远为真，
 * 所以不能让它有两份抄本（这一片修的就是"同一句话有五份抄本"，测试自己不能先犯）。
 */

describe('① 推导账：`trial` 是那句话唯一的一次陈述', () => {
  it('试炼清单 == 动手之前四条抄本共同写着的三枚 id，逐格同序', () => {
    expect(TRIAL_DUNGEON_IDS).toEqual(试炼三座);
  });

  it('清单由表推导，不是第二份手抄（把 `trial` 逐格读出来，结果一致）', () => {
    expect(DUNGEON_DEFS.filter((d) => d.trial).map((d) => d.id)).toEqual(TRIAL_DUNGEON_IDS);
    expect(DUNGEON_DEFS.filter((d) => !d.trial).map((d) => d.id))
      .toEqual(DUNGEON_IDS.filter((id) => !TRIAL_DUNGEON_IDS.includes(id)));
  });

  it('每一行都**显式**写了 `trial`（省略即默认不是试炼，那种默认最贵）', () => {
    const 没写 = DUNGEON_DEFS.filter((d) => !('trial' in d)).map((d) => d.id);
    expect(没写, `这些行没写 trial：${没写.join('、')}`).toEqual([]);
    expect(DUNGEON_DEFS.filter((d) => d.trial !== true && d.trial !== false)).toEqual([]);
  });

  it('清单不许是空集：空表会让飞升门恒真', () => {
    // `every` 在空数组上返回真 —— 全改成 `trial: false` 的症状不是报错，是"零座副本清空即可飞升"
    expect(TRIAL_DUNGEON_IDS.length).toBeGreaterThan(0);
    const 全false = DUNGEON_DEFS.map((d) => ({ ...d, trial: false }));
    expect(checkDungeons(全false).join('\n')).toContain('三界试炼成了空集');
  });

  it('试炼清单与主线行（`type: "dungeon"` 的 `dungeonId`）双向对齐 —— 两条算式只剩一条', () => {
    const 主线指的 = MAINLINE.filter((r) => r.type === 'dungeon').map((r) => r.dungeonId);
    expect([...主线指的].sort()).toEqual([...TRIAL_DUNGEON_IDS].sort());
    for (const id of 主线指的) {
      expect(DUNGEON_DEFS.find((d) => d.id === id)?.trial, `"${id}" 有主线步却不是试炼座`).toBe(true);
    }
  });

  it('注册表认得这两格，且**缺格当场点名**（不是靠读取处的兜底）', () => {
    const entry = CONTENT_TABLES.find((t) => t.kind === 'dungeons');
    expect(Object.keys(entry.row)).toEqual(expect.arrayContaining(['trial', 'mapLabel']));
    // 判据走被加载的校验器，不走"我看一眼 spec 里有没有这个键"：
    // `required` 的默认值才是"必填"这件事的实现，spec 里根本不写 required。
    const ctx = { ids: new Map() };
    const 原行 = DUNGEON_DEFS[0];
    const 少一格 = (key) => { const c = { ...原行 }; delete c[key]; return c; };
    expect(checkFields(少一格('trial'), entry.row, 'dungeons[0]', ctx))
      .toEqual(['dungeons[0].trial: 缺少必填字段']);
    expect(checkFields(少一格('mapLabel'), entry.row, 'dungeons[0]', ctx))
      .toEqual(['dungeons[0].mapLabel: 缺少必填字段']);
    // 写错类型也一样红：`trial: 'yes'` 会被读取处当成真（非空字符串），
    // 注册表把这种"看起来是布尔的字符串"挡在开机那一刻
    expect(checkFields({ ...原行, trial: 'yes' }, entry.row, 'dungeons[0]', ctx))
      .toEqual(['dungeons[0].trial: 期望布尔，实际 string "yes"']);
    expect(checkFields(原行, entry.row, 'dungeons[0]', ctx)).toEqual([]);
  });
});

describe('② 飞升门：真值表逐格走', () => {
  const 摆 = (清空的副本, boss3 = true) => {
    const s = emptyStats();
    s.boss3Defeated = boss3;
    for (const id of 清空的副本) s.dungeonsCleared.add(id);
    return { stats: s };
  };

  it('三座齐 + 第三 Boss 已败 → 门开', () => {
    expect(CONDITIONS.checkAllDungeons(摆(试炼三座))).toBe(true);
  });

  it('漏掉任意一座 → 门关（逐座各试一次，不是"少一座大概会红"）', () => {
    for (const 缺 of 试炼三座) {
      const 其余 = 试炼三座.filter((id) => id !== 缺);
      expect(CONDITIONS.checkAllDungeons(摆(其余)), `没清 "${缺}" 也算过了`).toBe(false);
    }
  });

  it('多清非试炼的可选副本不能顶替试炼座', () => {
    const 可选 = DUNGEON_IDS.filter((id) => !试炼三座.includes(id));
    expect(CONDITIONS.checkAllDungeons(摆(可选))).toBe(false);
    expect(CONDITIONS.checkAllDungeons(摆([...试炼三座.slice(0, 2), ...可选]))).toBe(false);
  });

  it('三座清了但第三只 Boss 没打 → 门关（切片3 修的那一格没退回去）', () => {
    expect(CONDITIONS.checkAllDungeons(摆(试炼三座, false))).toBe(false);
  });

  it('名字乱码不影响判定：门只认 id', () => {
    const 改名 = DUNGEON_DEFS.map((d) => ({ ...d, name: '×'.repeat(4), mapLabel: '×', exterior: { ...d.exterior, label: '×' } }));
    expect(改名.filter((d) => d.trial).map((d) => d.id)).toEqual(试炼三座);
    expect(CONDITIONS.checkAllDungeons(摆(试炼三座))).toBe(true);
  });
});

describe('③ 开局点亮：新建图 / 读档兜底 / 存档优先', () => {
  it('新档点亮的就是试炼那几座，其余几座要先走过去揭开', () => {
    const em = new ExplorationMap({});
    expect([...em.dungeonRevealed].sort()).toEqual([...TRIAL_DUNGEON_IDS].sort());
    const 没点 = DUNGEON_IDS.filter((id) => !em.dungeonRevealed.has(id));
    expect(没点.sort()).toEqual(DUNGEON_IDS.filter((id) => !TRIAL_DUNGEON_IDS.includes(id)).sort());
    expect(没点.length, '名册与点亮清单一样长 —— 那"可选副本要探索才发现"这条没了').toBeGreaterThan(0);
  });

  it('旧档缺 `dungeonRevealed` 时兜底用的是**同一份**推导（不是第二次手抄）', () => {
    const em = new ExplorationMap({});
    em.fromJSON({ revealed: [...em.revealed], zoneRevealed: [], poiRevealed: [] });
    expect([...em.dungeonRevealed].sort()).toEqual([...TRIAL_DUNGEON_IDS].sort());
  });

  it('存档里有就用存档的：兜底不许盖掉玩家自己的进度', () => {
    const em = new ExplorationMap({});
    em.fromJSON({ revealed: [...em.revealed], dungeonRevealed: ['forest-shrine'] });
    expect([...em.dungeonRevealed]).toEqual(['forest-shrine']);
  });

  it('写出去的档与读回来的档同一份账（推导变了也不会在这里再造一条）', () => {
    const em = new ExplorationMap({});
    const 往返 = new ExplorationMap({});
    往返.fromJSON(JSON.parse(JSON.stringify(em.toJSON())));
    expect([...往返.dungeonRevealed].sort()).toEqual([...em.dungeonRevealed].sort());
  });
});

describe('④ 指路与助手清单读同一份', () => {
  const ascensionRow = MAINLINE.find((r) => r.condition === 'checkAllDungeons');

  it('试炼三座清了 + Boss3 已败 → 箭头指向世界之锚（不再要求清可选副本）', () => {
    const qs = new QuestSystem({ toast() {}, play() {} });
    qs.stats.boss3Defeated = true;
    for (const id of 试炼三座) qs.stats.dungeonsCleared.add(id);
    const w = qs._resolveInteractWaypoint(ascensionRow);
    expect(w.hint, `门已经开了，指路却卡在「${w.hint}」`).toBe('三界试炼完成后触摸锚点');
  });

  it('漏一座 → 指向那一座的入口（坐标由副本表给，不是面板/系统里再抄一份）', () => {
    const qs = new QuestSystem({ toast() {}, play() {} });
    qs.stats.boss3Defeated = true;
    for (const id of 试炼三座.slice(0, 2)) qs.stats.dungeonsCleared.add(id);
    const 缺 = 试炼三座[2];
    const w = qs._resolveInteractWaypoint(ascensionRow);
    expect(w.hint).toBe('清空地下城');
    const def = DUNGEON_DEFS.find((d) => d.id === 缺);
    expect({ x: w.x, z: w.z }).toEqual({ x: def.entrance.x, z: def.entrance.z });
  });

  it('可选副本清空与否都不改指路 —— 这一条钉住"指路读的是试炼清单而不是全名册"', () => {
    const qs = new QuestSystem({ toast() {}, play() {} });
    qs.stats.boss3Defeated = true;
    for (const id of 试炼三座) qs.stats.dungeonsCleared.add(id);
    const 基线 = qs._resolveInteractWaypoint(ascensionRow).hint;
    for (const id of DUNGEON_IDS.filter((i) => !试炼三座.includes(i))) qs.stats.dungeonsCleared.add(id);
    expect(qs._resolveInteractWaypoint(ascensionRow).hint).toBe(基线);
  });

  it('助手面板那一步的清单就是推导出来的那份（跑的是在役的 `_buildDemoSteps`，不是另抄的表）', () => {
    // 这张步表是实例方法里的字面量数组；方法体只读模块级常量、不碰 `this`，
    // 所以借原型调用就能拿到**被打包进游戏的那一份**（构造它要 DOM，那是另一件事）。
    const steps = QuestAssistant.prototype._buildDemoSteps.call({});
    expect(Array.isArray(steps), '_buildDemoSteps 不再返回数组：这条用例的落脚点变了').toBe(true);
    const 步 = steps.find((s) => s.action === 'dungeons');
    expect(步, `助手步表（共 ${steps.length} 步）里没有 action 为 'dungeons' 的那一步`).toBeTruthy();
    expect(步.ids).toEqual(TRIAL_DUNGEON_IDS);
    // 文案跟着清单走：以前写着"三座地下城"，名册长到第七座那天它也不会改口。
    // 光比 `${length} 座地下城` 抓不到退回去写死的中文数词（三 == 3），所以另一条要认数字格式。
    // W-D2 切片16i：标签是**文案键**，座数由 `params.n` 现取 —— 派生关系仍在。
    expect(步.label).toBe('demo_step_dungeons');
    expect(步.params?.n, '座数没有从清单现取（写死的话名册长到第七座那天就不改口了）').toBe(步.ids.length);
    expect(t(步.label, 步.params)).toBe(`${步.ids.length} 座地下城`);
    expect(t(步.label, 步.params).match(/^\d+ 座/), `「${t(步.label, 步.params)}」把座数写成了字，不再由清单说`).toBeTruthy();
  });
});

describe('⑤ 世界地图真渲染：点位与文字都来自副本表', () => {
  /**
   * `WorldMapPanel` 的构造与 `show()` 只摸三样 DOM：两个 `getElementById` 和
   * `document.exitPointerLock?.()`。`fakeDoc` 对没挂上的宿主返回 null —— 面板自己
   * 对每一处都写了可选链，所以**不需要**造一棵假 DOM 树，也不需要绕过它的入口方法。
   */
  function 装文档(canvas) {
    globalThis.document = fakeDoc({ 'world-map-canvas': canvas });
  }
  afterEach(() => { delete globalThis.document; });

  /** 只记录调用痕迹的 ctx —— '#bb77ff' 的圆与 '#ddd' 的字只有那条副本循环会写，够定位 */
  function 假画布() {
    const 文本 = [];
    const 圆 = [];
    const ctx = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
      beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {},
      setLineDash() {}, fillRect() {}, strokeRect() {}, arc(x, y, r) { 圆.push({ x, y, r, fillStyle: ctx.fillStyle, font: ctx.font }); },
      fillText(t, x, y) { 文本.push({ t, x, y, fillStyle: ctx.fillStyle, font: ctx.font }); },
      save() {}, restore() {},
    };
    const canvas = {
      clientWidth: 720, clientHeight: 520, width: 0, height: 0,
      getContext: () => ctx,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      addEventListener() {},
    };
    return { ctx, canvas, 文本, 圆 };
  }

  /** 跑**在役的那条路径**：构造 → `show()` → `draw()`，一步都不自己拼 */
  function 跑一次面板() {
    const { canvas, 文本, 圆 } = 假画布();
    装文档(canvas);
    const em = new ExplorationMap({});
    em.revealed.fill(1); // 全开雾：这一条要量的是"名册里每座都有点"，不是揭开进度
    const panel = new WorldMapPanel({
      explorationMap: em,
      dungeons: { active: false },
      world: { getZoneMapData: () => [] },
      restPoints: { points: [] },
      quests: { getQuestWaypoint: () => null, chapter: 1 },
      mapMarkers: { markers: [] },
      player: { position: { x: 0, z: 0 } },
      dialog: { toast() {} },
    });
    panel.show();
    expect(panel.open, 'show() 没把面板打开：那 draw() 直接 return，这一臂什么都没渲染').toBe(true);
    return {
      紫点: 圆.filter((c) => c.fillStyle === '#bb77ff'),
      标签: 文本.filter((t) => t.fillStyle === '#ddd'),
      panel, em,
    };
  }

  it('每座副本各一个点、各一枚标签，坐标就是表里的 entrance', () => {
    const { 紫点, 标签, panel } = 跑一次面板();
    expect(紫点.length, `地图上有 ${紫点.length} 个副本点，名册有 ${DUNGEON_DEFS.length} 座`).toBe(DUNGEON_DEFS.length);
    expect(标签.map((l) => l.t)).toEqual(DUNGEON_DEFS.map((d) => t(d.mapLabel)));
    // 落点拿面板自己算出的 `_cx/_cy/_scale` 对：改错投影的人在这里红，而不是在我抄的常数里红
    expect(紫点.length).toBe(标签.length);
    紫点.forEach((c, i) => {
      const d = DUNGEON_DEFS[i];
      expect(c.x, `${d.id} 的点没落在 entrance.x 上`).toBeCloseTo(panel._cx + d.entrance.x * panel._scale, 6);
      expect(c.y, `${d.id} 的点没落在 entrance.z 上`).toBeCloseTo(panel._cy + d.entrance.z * panel._scale, 6);
      expect(Number.isFinite(c.x) && Number.isFinite(c.y), `${d.id} 的点算出了 NaN`).toBe(true);
    });
    // 半径与字体也是这一族点的身份（面板里另有 Boss 圈 #r=8、营火 #r=4）：改坏了图上就混成别的标记
    expect([...new Set(紫点.map((c) => c.r))]).toEqual([5]);
  });

  it('旧面板表里那五座逐格对得上（推导 == 抄本），而第 6、7 座是抄本里没有的', () => {
    const { 标签, 紫点 } = 跑一次面板();
    expect(紫点.length, '点数与标签数不是同一族').toBe(标签.length);
    // 每枚字都贴在它那一座上（`fillText(label, 点x + 7, 点y + 3)`）：
    // 拿抄本里的坐标去图上找点，再要求有一枚字落在那个偏移上 —— 旧写法是 `d.x`，改坏了这里会红
    for (const r of 旧面板表) {
      const def = DUNGEON_DEFS.find((d) => d.id === r.id);
      expect(def, `名册里已经没有 "${r.id}" 了（抄本对账的前提变了）`).toBeTruthy();
      expect({ x: def.entrance.x, z: def.entrance.z }, `${r.id} 的 entrance 与旧抄本的坐标不再是同一个点`)
        .toEqual({ x: r.x, z: r.z });
      const 落 = 标签.find((l) => l.t === r.t);
      expect(落, `旧简称 "${r.t}"（${r.id}）在推导出来的标签里找不到了`).toBeTruthy();
      const 座 = 紫点.find((c) => c.x === 落.x - 7 && c.y === 落.y - 3);
      expect(座, `"${r.t}" 这枚字旁边 ${JSON.stringify({ dx: 7, dy: 3 })} 处没有它的点`).toBeTruthy();
    }
    const 新增 = DUNGEON_DEFS.filter((d) => !旧面板表.some((r) => r.id === d.id));
    // 抄本里没有的那些：W-B9 加过两座（gloom-mist-crypt / radiant-dawn-hall），
    // W-B10 切片7 又加了两座（破碎时线 / 混沌边境 —— 那两位面原先一座副本都没有）。
    expect(新增.map((d) => d.id)).toEqual(['gloom-mist-crypt', 'radiant-dawn-hall', 'void-broken-casket', 'abyss-deep-maw']);
    expect(标签.length - 旧面板表.length, '抄本那五行之外并没有多出那几座：新增的座还是没点上').toBe(新增.length);
    for (const d of 新增) {
      expect(标签.map((l) => l.t), `名册里的 "${d.id}" 在地图上仍然没有标签`).toContain(t(d.mapLabel));
    }
  });

  it('名册临时多一座 → 地图上真的多一个点（会长证据：走的是同一条循环，不是我又算一遍）', () => {
    const 探针 = {
      id: 'probe-extra', name: '探针座', trial: false,
      // W-D2 切片16v：`mapLabel` 存的是**文案键** —— 探针也得给真键（给字面量的话
      // 面板上画出来的是 "[MISSING: 探针]"，这条用例就测不到"多一个点"了）
      mapLabel: 'dungeon_gloom_mist_crypt_map_label',
      theme: 0x111111, accent: 0x222222, gridW: 3, gridH: 3, origin: { x: 0, y: 0, z: 0 },
      entrance: { x: 12, z: 34 }, exterior: { x: 12, z: 34, label: '探针口' },
    };
    const 基线 = 跑一次面板();
    const 原样 = DUNGEON_DEFS.slice();
    DUNGEON_DEFS.push(探针);
    try {
      const 加后 = 跑一次面板();
      expect(加后.紫点.length, '加了名册没加点：面板还在遍历它自己那张表').toBe(基线.紫点.length + 1);
      expect(加后.标签.map((l) => l.t)).toEqual([...基线.标签.map((l) => l.t), t('dungeon_gloom_mist_crypt_map_label')]);
      expect(加后.紫点.some((c) => Number.isFinite(c.x) && c.r === 5), '新加那座的点没画出来').toBe(true);
    } finally {
      DUNGEON_DEFS.length = 0;
      DUNGEON_DEFS.push(...原样);
    }
    // 还原要**当场证实**：泄漏一行到后面任何用例（尤其 ⑥ 的源码扫描与注册表全表校验）都是假绿
    expect(DUNGEON_DEFS.map((d) => d.id)).toEqual(原样.map((d) => d.id));
    expect(跑一次面板().紫点.length).toBe(基线.紫点.length);
  });
});

describe('⑥ 绝迹：五处手抄与那张私有表都不许长回来', () => {
  const 扫 = (rel) => stripComments(readSrc(rel));

  /**
   * 每一处抄本各有一把自己的尺（`抄本表` 在 `tests/helpers/wb10s3c-copies.js`，与誊写对账脚本共用）——
   * 不是一把通用正则扫所有文件：五处的**拼法本来就不同**（成串数组 / `.has()` 链 /
   * `MAINLINE.filter` / 私有表字面量），一把尺子只认其中一种拼法，对另外几种的"扫到 0"就是白扫。
   */
  for (const 抄 of 抄本表) {
    it(`${抄.标题}：那种写法在役源码里已经绝迹`, () => {
      expect(抄.尺(扫(抄.文件)), `${抄.文件} 里又出现「${抄.标题}」那种手抄`).toBe(false);
    });
    it(`${抄.标题}：同一把尺子在动手之前的字节上量得到（尺子是活的）`, () => {
      // "扫到 0"只有在这把尺子确实认得旧写法时才是证据 —— 否则它只是在读空集
      expect(抄.尺(stripComments(抄.旧字节)), `旧字节都量不到，这条绝迹用例是空的：${抄.标题}`).toBe(true);
      // 绝迹之外还得**换了读者**：文件不读推导清单，就是把抄本挪去了别处写。
      // 数的是"除 import 之外还有没有一处"：只看名字在不在，一条悬着的 import 也算"认到了"——
      // 臂 A10 把在役那处读改回现算之后，`TRIAL_DUNGEON_IDS` 在这个文件里就只剩 import 那一次。
      const 处 = 扫(抄.文件).split(抄.认领).length - 1;
      expect(处, `${抄.文件} 只把 ${抄.认领} import 进来却没读它（全文 ${处} 次，含 import 那一行），那条事实没有唯一来源了`)
        .toBeGreaterThanOrEqual(2);
    });
  }

  it('旧面板表里那五座的简称与 id，一个都不许再出现在世界地图源码里', () => {
    const s = 扫('ui/WorldMapPanel.js');
    for (const r of 旧面板表) {
      expect(s.includes(`'${r.id}'`), `面板里又写死了 "${r.id}"`).toBe(false);
      expect(s.includes(`'${r.t}'`), `面板里又写死了简称 "${r.t}"`).toBe(false);
    }
    expect(s).toContain('DUNGEON_DEFS');
    expect(s).toContain('d.mapLabel');
  });

  it('整仓扫得到：没有任何一处把试炼那几座**再算一遍**（三种旧拼法各一把尺）', () => {
    // 判据必须是"成串 / 成链 / 成算式"而不是"提到过"：`objectives.js` 的每个主线行各写自己的 `dungeonId`、
    // 遭遇表/台词表各以一座为键 —— 那些是引用，不是抄本。把引用也算成抄本，这条门禁就只能禁止整张表。
    const walk = (dir) => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : (n.endsWith('.js') ? [p] : []);
    });
    const 全体 = walk(join(ROOT, 'src'));
    expect(全体.length, 'src/ 里一个文件都没扫到：这三把尺会在空集上恒真').toBeGreaterThan(20);

    const 读 = (f) => stripComments(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
    // 豁免按**身份**认领（声明 `DUNGEON_DEFS` 的那一份），不按路径写死：
    // 名册搬家时豁免跟着走，而"只许有一份"由下面那条钉住 —— 豁免不是一张随便加的白名单。
    const 定义处 = 全体.filter((f) => /export const DUNGEON_DEFS\b/.test(读(f)));
    expect(定义处.length, `声明副本名册的文件应有且只有一份，实到 ${定义处.length} 份`).toBe(1);

    // 三把尺各认一种拼法，逐个点名，不给"其中一把今天没读者"留地方：
    // 串抄 = 成串的 id 数组；门抄 = 逐座 `.has()` 的判据；滤抄 = 从主线行现算那份清单（不写 id，前两把对它是瞎的）。
    const 尺表 = [
      { 名: '成串的 id 数组', 判: (s) => 串抄.test(s) },
      { 名: '逐座 .has() 的飞升门', 判: 门抄 },
      { 名: '从主线行现算的试炼清单', 判: (s) => 滤抄.test(s) },
    ];
    const 命中 = [];
    for (const f of 全体) {
      if (f === 定义处[0]) continue;
      const s = 读(f);
      const rel = f.slice(join(ROOT, 'src').length + 1).replace(/\\/g, '/');
      for (const 尺 of 尺表) if (尺.判(s)) 命中.push(`${rel}:${尺.名}`);
    }
    expect(命中, `手抄的三种拼法又长回来了：${命中.join('、')}`).toEqual([]);

    // 尺子的分母与活性：三种旧拼法各被对应那把尺抓到，而**名册自己**会被串抄抓到（所以才需要上面那条豁免）
    expect(串抄.test("this.dungeonRevealed = new Set(['ruin-crypt', 'forbidden-library', 'five-dim-rift']);")).toBe(true);
    expect(门抄("    && state.stats.dungeonsCleared?.has('ruin-crypt')\n    && state.stats.dungeonsCleared?.has('forbidden-library'),")).toBe(true);
    expect(滤抄.test("const DUNGEON_IDS = MAINLINE.filter((r) => r.type === 'dungeon').map((r) => r.dungeonId);")).toBe(true);
    // 退回时不一定会写回具名 const —— 行内、不带括号参数都得认得，否则这把尺只认得它自己的旧样本
    expect(滤抄.test("        for (const id of MAINLINE.filter(r => r.type === 'dungeon')) {")).toBe(true);
    expect(串抄.test(读(定义处[0])), '连名册都扫不到，说明这把尺的形状和真表不一样（豁免是在护谁？）').toBe(true);
    // 单座引用不许被误伤：这一句是 `objectives.js` 里每一个主线行都在做的事
    expect(串抄.test("    dungeonId: 'ruin-crypt',"), '把单行引用也算成抄本：这条门禁会禁止正常的内容行').toBe(false);
    expect(门抄("    && state.stats.dungeonsCleared?.has('ruin-crypt'),")).toBe(false);
    // 逐行读一个 type 字段是主线表消费者的日常（`QuestSystem:359`、注册表那条整表规则都在做），不是"现算清单"
    expect(滤抄.test("    if (q.type === 'dungeon' && !this.stats.dungeonsCleared.has(q.dungeonId)) {")).toBe(false);
    expect(滤抄.test("      if (row?.type === 'dungeon' && !row.dungeonId) {")).toBe(false);
  });
});
