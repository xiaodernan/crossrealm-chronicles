/**
 * §1.2「玩家可感知的短板」那六行的证据列（B1 / B3 / B4 / B6 / C1 / C2）。
 *
 * ## 这一片治什么（B149）
 * §1.2 是全仓唯一一处"冷启动会话照着它判断还差多少内容"的地方，而它当时有六行写的
 * 是**当年的读数**：B1 说 `LootSystem.js` 全文无 `rarity`/`affix`/`equip`（而
 * `content/gear.js` 早已是一张四档、十二基座、十四词缀的表），B3 说支线 7 条
 * （今天 50 条），B4 说"没有房间模板与遭遇表"（11 款模板 + 十座遭遇表都在役），
 * B6 说"区域只有 5 个"（`ZONE_ORDER` 七座），C1 说 8 张贴图（24 张），C2 说
 * "只有 UnrealBloomPass、0 个 InstancedMesh、一张 4096² 阴影图"（5 处 `addPass`、
 * 12 处 `InstancedMesh`、三档阴影）。**没有任何一条腿量过这六个格子**，所以内容一路
 * 长到今天的量级，那六行一路没人碰。
 *
 * ## 钉的形状（不是"文档不许改"，是"文档改漂了当场红"）
 * ① 六行的**数**逐个与代码一致 —— 正则锚定"名词 **N** 单位"这个写法，读不到数就抛
 *    （读到零个不算绿）。C1 的三个数现扫文件系统，不抄清单。
 * ② 形状腿：证据列必须以状态标记（✅ 已消 / 🔶 部分已消 / ⬜ 未消）开头 —— 这一条
 *    结构上就否掉了"证据 = 一个文件名"那种裸指针；短板列**逐字保留当初那句抱怨**
 *    （修文档不许等于把抱怨改掉）；行里引用的门禁文件与脚本路径**必须真的存在**。
 * ③ 残差写成数、不写成形容词：分支残差是 choice 1 / branch 1 / branchTo 5 的逐对
 *    名册；区际残差是"七座区对五条射线 ⇒ 缺 2 座"，且那两座的中心逐字不在任何终点上。
 * ④ 尺子自证：扫描范围非空、不存在的行 id 必须读不到、把陈旧陈述塞回证据列必须被点名。
 *
 * ## 不归本门管
 * C3 那行（主线 63 步 / 副本 10 座 / 支线 38 条 / 回声 49 条）由
 * `tests/content-volume-reading.test.js` 拥有，本门不重复当 owner —— 但对得上的数
 * 允许同时出现在 B3 里，两处都对着**代码**比，不是互相比。
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { GEAR_RARITY, GEAR_BASES, GEAR_AFFIXES, GEAR_POOLS, GEAR_BAG } from '../src/content/gear.js';
import { SIDE_QUESTS_ALL } from '../src/content/sideQuests.js';
import { OBJECTIVES, MAINLINE } from '../src/content/objectives.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { ROOM_TEMPLATES } from '../src/world/RoomTemplates.js';
import { WINDING_ROUTES } from '../src/content/windingRoutes.js';
import { ZONE_ORDER, zoneDescriptor, HUB_ZONE } from '../src/content/ZoneIdentity.js';
import { SHADOW_QUALITY_SIZES, DEFAULT_SHADOW_QUALITY } from '../src/engine/shadowPolicy.js';

const DOC = 'docs/MASTER_PLAN.md';
const 文档 = readFileSync(DOC, 'utf8');

/** §1.2 那一节：从标题到 §1.3 之间。塌了就抛 —— 空扫描范围不许被读成"全绿"。 */
function 节() {
  const m = /### 1\.2[\s\S]*?\n### 1\.3/.exec(文档);
  if (!m) throw new Error('找不到 §1.2 那一节（标题改名了？）—— 本门的扫描范围已塌');
  return m[0];
}

/** 取某一行的两列。行数不是 1 就抛（0 行 = 有人删了这行；2 行 = 抄重了）。 */
function 取行(id, 文本 = 节()) {
  const 行 = 文本.split(/\r?\n/).filter((l) => l.startsWith(`| ${id} | `));
  if (行.length !== 1) {
    throw new Error(`§1.2 里 "| ${id} |" 找到 ${行.length} 条（要正好 1 条）`);
  }
  const 列 = 行[0].slice(1, -1).split('|');
  if (列.length !== 3) throw new Error(`行 ${id} 不是三列（多半是格子里冒出了裸竖线）`);
  return { 短板: 列[1].trim(), 证据: 列[2].trim() };
}

/** 从文本里按锚点取一个数；取不到就抛（"取不到"绝不等于"对得上"）。 */
function 数(文本, 正则, 标签, 锚 = 正则.source) {
  const m = 正则.exec(文本);
  if (!m) throw new Error(`那一行没写「${标签}」的数（锚点 ${锚}）—— 尺子读不到东西`);
  return m[1] === undefined ? NaN : Number(m[1]);
}

/** 纯函数：状态标记在不在。给②的正腿与④的反向控制共用一份实现。 */
function 缺状态标记(文本) {
  return /^(✅|🔶|⬜)/.test(文本) ? null : '证据列没有以状态标记（✅ 已消 / 🔶 部分已消 / ⬜ 未消）开头';
}

/** 纯函数：当年那些"否定式陈述"塞回证据列时点名它们。 */
const 陈旧陈述 = [
  '全文无 `rarity`/`affix`/`equip`',
  '支线只有 **7 条**',
  '没有房间模板与遭遇表',
  '区域只有 5 个，区域之间是空白地形走廊',
  '只有 UnrealBloomPass；**0 个 InstancedMesh**',
];
function 找陈旧(文本) {
  return 陈旧陈述.filter((s) => 文本.includes(s));
}

/** 纯函数：证据列"门禁"之后引用的文件名，逐个换算成 tests/<名字>.test.js 是否真在场。 */
function 找不存在的门禁(文本) {
  const 起点 = 文本.indexOf('门禁');
  if (起点 < 0) return ['(这一行没有"门禁"二字，没有点名任何一条量它的腿)'];
  const 段 = 文本.slice(起点);
  const 引用 = [...段.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  if (引用.length === 0) return ['(门禁那一段里没有反引号包住的门名)'];
  const 坏 = [];
  for (const t of 引用) {
    const 基 = t.includes('/') ? t.split('/').pop() : `${t}.test.js`;
    if (!existsSync(join('tests', 基))) 坏.push(t);
  }
  return 坏;
}

/** 纯函数：文档里写出来的 `scripts/*.ps1` 必须真的在仓里（引用死路径 = 下一人照抄踩空）。 */
function 找不存在的脚本(文本) {
  const 引用 = [...文本.matchAll(/`((?:scripts\/)?[A-Za-z0-9_-]+\.ps1)`/g)].map((m) => m[1]);
  if (引用.length === 0) return ['(这一行没引用任何导入脚本)'];
  return 引用.filter((n) => !existsSync(n.includes('/') ? n : join('scripts', n)));
}

/** 现扫文件系统：按扩展名收 public/ 下的文件（C1 那三个数不许是手抄清单）。 */
function 扫(public目录, 扩展) {
  const 出 = [];
  const 走 = (d, 相对) => {
    for (const 名 of readdirSync(d)) {
      const p = join(d, 名);
      const r = `${相对}/${名}`;
      if (statSync(p).isDirectory()) 走(p, r);
      else if (扩展.some((e) => 名.toLowerCase().endsWith(e))) 出.push(r);
    }
  };
  走(public目录, '');
  return 出;
}
const GLB = 扫('public', ['.glb']);
const 贴图 = 扫('public/textures', ['.png', '.jpg', '.jpeg', '.webp', '.ktx2']);
const 音频 = 扫('public', ['.mp3', '.ogg', '.wav', '.m4a']);

const 射线 = WINDING_ROUTES.filter((r) => r.id !== 'hub-ring');

describe('① 六行的读数与代码/文件系统一致', () => {
  it('B1：稀有度档数、基座、词缀、掉落池、背包格数、权重与每档词缀条数', () => {
    const { 证据 } = 取行('B1');
    expect(数(证据, /稀有度 \*\*(\d+)\*\* 档/, '稀有度档数'), 'B1 那行的稀有度档数').toBe(GEAR_RARITY.length);
    expect(数(证据, /基座 \*\*(\d+)\*\* 件/, '基座数'), 'B1 那行的基座数').toBe(GEAR_BASES.length);
    expect(数(证据, /词缀 \*\*(\d+)\*\* 条/, '词缀数'), 'B1 那行的词缀数').toBe(GEAR_AFFIXES.length);
    expect(数(证据, /掉落池 \*\*(\d+)\*\* 个/, '掉落池数'), 'B1 那行的掉落池数').toBe(Object.keys(GEAR_POOLS).length);
    expect(数(证据, /背包 \*\*(\d+)\*\* 格/, '背包格数'), 'B1 那行的背包格数').toBe(GEAR_BAG.capacity);
    // 权重与"每档几条词缀"也照着表走：它们写在括号里，漂了就是文档在教错东西
    const 权 = /权重 (\d+) \/ (\d+) \/ (\d+) \/ (\d+)/.exec(证据);
    expect(权, 'B1 那行没写四档权重').not.toBeNull();
    expect(权.slice(1).map(Number), 'B1 那行的权重与 GEAR_RARITY 不符')
      .toEqual(GEAR_RARITY.map((r) => r.weight));
    const 带 = /各带 (\d+) \/ (\d+) \/ (\d+) \/ (\d+) 条词缀/.exec(证据);
    expect(带, 'B1 那行没写"每档各带几条词缀"').not.toBeNull();
    expect(带.slice(1).map(Number), 'B1 那行的每档词缀条数与 GEAR_RARITY 不符')
      .toEqual(GEAR_RARITY.map((r) => r.affixes));
  });

  it('B3：条数两格 + 分支残差六格，逐格对着 objectives 现推', () => {
    const { 证据 } = 取行('B3');
    const 分区专属 = SIDE_QUESTS_ALL.filter((q) => ZONE_ORDER.includes(q.zone)).length;
    expect(数(证据, /支线 \*\*(\d+)\*\* 条/, '支线条数'), 'B3 那行的支线条数').toBe(SIDE_QUESTS_ALL.length);
    expect(数(证据, /分区专属 \*\*(\d+)\*\* 条/, '分区专属条数'), 'B3 那行的分区专属条数').toBe(分区专属);
    expect(数(证据, /目标行 \*\*(\d+)\*\* 行/, '目标行数'), 'B3 那行的目标行数').toBe(OBJECTIVES.length);
    expect(数(证据, /主线 \*\*(\d+)\*\* 步/, '主线步数'), 'B3 那行的主线步数').toBe(MAINLINE.length);
    expect(数(证据, /门槛行 \*\*(\d+)\*\* 行/, 'requires 行数'), 'B3 那行的门槛行数')
      .toBe(OBJECTIVES.filter((r) => r.requires).length);
    expect(数(证据, /选项步 \*\*(\d+)\*\* 步/, 'choice 行数'), 'B3 那行的选项步数')
      .toBe(OBJECTIVES.filter((r) => r.type === 'choice').length);
    expect(数(证据, /分支步 \*\*(\d+)\*\* 步/, 'branch 行数'), 'B3 那行的分支步数')
      .toBe(OBJECTIVES.filter((r) => r.branch).length);
    expect(数(证据, /跳转行 \*\*(\d+)\*\* 行/, 'branchTo 行数'), 'B3 那行的跳转行数')
      .toBe(OBJECTIVES.filter((r) => r.branchTo).length);
    expect(数(证据, /章节门 \*\*(\d+)\*\* 行/, 'chapter-gate 行数'), 'B3 那行的章节门数')
      .toBe(OBJECTIVES.filter((r) => r.type === 'chapter-gate').length);
  });

  it('B4：模板款数、遭遇表座数与格子范围（"4×6"是当年那句，今天不是同一个数）', () => {
    const { 证据 } = 取行('B4');
    expect(数(证据, /模板 \*\*(\d+)\*\* 款/, '模板款数'), 'B4 那行的模板款数')
      .toBe(Object.keys(ROOM_TEMPLATES).length);
    expect(数(证据, /有遭遇 \*\*(\d+)\*\* 座/, '遭遇表座数'), 'B4 那行的遭遇表座数')
      .toBe(Object.keys(DUNGEON_ENCOUNTERS).length);
    expect(Object.keys(DUNGEON_ENCOUNTERS).length, '遭遇表座数与副本名册不同源（本行说"与 DUNGEON_DEFS 一样多"）')
      .toBe(DUNGEON_DEFS.length);
    const 宽 = /gridW 最窄 \*\*(\d+)\*\* 最宽 \*\*(\d+)\*\*/.exec(证据);
    const 高 = /gridH 最窄 \*\*(\d+)\*\* 最宽 \*\*(\d+)\*\*/.exec(证据);
    expect(宽, 'B4 那行没写 gridW 的范围').not.toBeNull();
    expect(高, 'B4 那行没写 gridH 的范围').not.toBeNull();
    const 取 = (k) => DUNGEON_DEFS.map((d) => d[k] ?? 5);
    expect(宽.slice(1).map(Number), 'B4 那行的 gridW 范围与副本表不符')
      .toEqual([Math.min(...取('gridW')), Math.max(...取('gridW'))]);
    expect(高.slice(1).map(Number), 'B4 那行的 gridH 范围与副本表不符')
      .toEqual([Math.min(...取('gridH')), Math.max(...取('gridH'))]);
  });

  it('B6：区数、路数、射线数、折点与枢纽中心', () => {
    const { 证据 } = 取行('B6');
    expect(数(证据, /分区 \*\*(\d+)\*\* 座/, '区数'), 'B6 那行的区数').toBe(ZONE_ORDER.length);
    expect(数(证据, /有路 \*\*(\d+)\*\* 条/, '路数'), 'B6 那行的路数').toBe(WINDING_ROUTES.length);
    expect(数(证据, /射线 \*\*(\d+)\*\* 条/, '射线数'), 'B6 那行的射线条数').toBe(射线.length);
    expect(数(证据, /各 (\d+) 个折点/, '折点数'), 'B6 那行的射线折点数')
      .toBe(射线[0].points.length);
    射线.forEach((r, i) => expect(r.points.length, `第 ${i} 条射线的折点数与"各 N 个折点"不符`)
      .toBe(射线[0].points.length));
    const 环 = WINDING_ROUTES.find((r) => r.id === 'hub-ring');
    expect(数(证据, /`hub-ring` (\d+) 个折点/, '环线折点数'), 'B6 那行 hub-ring 的折点数').toBe(环.points.length);
    const 心 = /从枢纽 \((-?\d+), (-?\d+)\)/.exec(证据);
    expect(心, 'B6 那行没写枢纽中心').not.toBeNull();
    expect(心.slice(1).map(Number), 'B6 那行的枢纽中心与 HUB_ZONE 不符')
      .toEqual([HUB_ZONE.center.x, HUB_ZONE.center.z]);
  });

  it('C1：三个数现扫文件系统得到，不是手抄清单', () => {
    const { 证据 } = 取行('C1');
    expect(数(证据, /模型 GLB \*\*(\d+)\*\* 枚/, 'GLB 枚数'), 'C1 那行的 GLB 枚数').toBe(GLB.length);
    expect(数(证据, /贴图 \*\*(\d+)\*\* 张/, '贴图张数'), 'C1 那行的贴图张数').toBe(贴图.length);
    expect(数(证据, /根目录 \*\*(\d+)\*\* 张/, '贴图根目录张数'), 'C1 那行的根目录贴图数')
      .toBe(贴图.filter((p) => !p.includes('/gen/')).length);
    expect(数(证据, /`textures\/gen` \*\*(\d+)\*\* 张/, 'gen 目录张数'), 'C1 那行的 gen 贴图数')
      .toBe(贴图.filter((p) => p.includes('/gen/')).length);
    expect(数(证据, /音频 \*\*(\d+)\*\* 个/, '音频个数'), 'C1 那行的音频素材数').toBe(音频.length);
    // 这一行还写着"assets/models/rest/ 里是 0 枚 GLB"（素材要玩家自己放）
    expect(GLB.filter((p) => p.includes('/models/rest/')).length,
      'C1 那行说 rest 目录 0 枚 GLB —— 有人放了素材，这一行就过期了').toBe(0);
  });

  it('C2：addPass 处数、InstancedMesh 处数与所在文件、阴影档数与出厂档', () => {
    const { 证据 } = 取行('C2');
    const 源 = readFileSync('src/core/Game.js', 'utf8');
    expect(数(证据, /有通道 \*\*(\d+)\*\* 处/, 'addPass 处数'), 'C2 那行的 addPass 处数')
      .toBe((源.match(/\.addPass\(/g) ?? []).length);
    const 各处 = [...readdirSync('src', { recursive: true })]
      .filter((p) => String(p).endsWith('.js'))
      .map((p) => [String(p).replace(/\\/g, '/'), readFileSync(join('src', String(p).replace(/\\/g, '/')), 'utf8')])
      .map(([p, s]) => [p, (s.match(/new THREE\.InstancedMesh\(/g) ?? []).length])
      .filter(([, n]) => n > 0);
    const 总 = 各处.reduce((a, [, n]) => a + n, 0);
    expect(数(证据, /实例网格 \*\*(\d+)\*\* 处/, 'InstancedMesh 处数'), 'C2 那行的 InstancedMesh 处数').toBe(总);
    expect(各处.map(([p]) => p), 'C2 那行说这 12 处"全在 world/WorldDecorations.js"，实际不止一处')
      .toEqual(['world/WorldDecorations.js']);
    expect(数(证据, /档位 \*\*(\d+)\*\* 档/, '阴影档数'), 'C2 那行的阴影档数').toBe(SHADOW_QUALITY_SIZES.length);
    expect(数(证据, /出厂档 \*\*(\d+)\*\*/, '出厂阴影档'), 'C2 那行的出厂阴影档')
      .toBe(DEFAULT_SHADOW_QUALITY);
    const 列 = /（(\d+) \/ (\d+) \/ (\d+)）/.exec(证据);
    expect(列, 'C2 那行没列出三档的尺寸').not.toBeNull();
    expect(列.slice(1).map(Number), 'C2 那行列出的三档与 SHADOW_QUALITY_SIZES 不符').toEqual([...SHADOW_QUALITY_SIZES]);
  });
});

describe('② 形状：状态标记、原始抱怨、引用可得', () => {
  it('六行的证据列都带状态标记，且都点名了至少一条门禁', () => {
    for (const id of ['B1', 'B3', 'B4', 'B6', 'C1', 'C2']) {
      const { 证据 } = 取行(id);
      expect(缺状态标记(证据), `${id} 那一行的证据列形状不对`).toBeNull();
      expect(找不存在的门禁(证据), `${id} 那一行引用的门禁文件不在场`).toEqual([]);
    }
  });

  it('六行的短板列逐字保留当初那句抱怨（修文档不等于把抱怨改掉）', () => {
    const 原文 = {
      B1: '**没有装备系统**。掉落只有一个八面体给"位面之魂"，无装备/词缀/稀有度',
      B3: '支线只有 **7 条**；主线 32 步是硬编码线性数组，**零分支**',
      B4: '地下城是 4×6 随机迷宫，房间只差配色，没有房间模板与遭遇表',
      B6: '区域只有 5 个，区域之间是空白地形走廊',
      C1: '视听：真实美术资产 **1 个 GLB（Soldier 占位）+ 8 张贴图**；音频 **全部 Web Audio 合成，0 个音频素材**，无配音',
      C2: '渲染：只有 UnrealBloomPass；**0 个 InstancedMesh**；一张 4096² 阴影图覆盖全场',
    };
    for (const [id, 抱怨] of Object.entries(原文)) {
      expect(取行(id).短板, `行 ${id} 的短板列被人改写了 —— 抱怨要留着，改的是证据`)
        .toBe(抱怨);
    }
  });

  it('证据列里没有当年那些否定式陈述，而写出来的脚本路径都得在场', () => {
    const 证据 = ['B1', 'B3', 'B4', 'B6', 'C1', 'C2'].map((id) => `${id}：${取行(id).证据}`).join('\n');
    expect(找陈旧(证据), '这些陈旧陈述回到了证据列').toEqual([]);
    expect(找不存在的脚本(取行('C1').证据), 'C1 引用了仓里不存在的导入脚本').toEqual([]);
  });
});

describe('③ 残差写成数，不写成形容词', () => {
  it('B3 的"仍是一条线"：跳转行的逐对名册与文档一字不差', () => {
    const { 证据 } = 取行('B3');
    const 段 = /本章门"：([^）]+)）/.exec(证据);
    expect(段, 'B3 那行没写"本章末步 → 本章门"那串逐对').not.toBeNull();
    expect(段[1].split('、').map((s) => s.trim()), 'B3 那行列的跳转对与 objectives 表不符')
      .toEqual(OBJECTIVES.filter((r) => r.branchTo).map((r) => `${r.id}→${r.branchTo}`));
    // 而且这五对真的只往"本章门"跳：一条路都没跳出主线
    const 门 = new Set(OBJECTIVES.filter((r) => r.type === 'chapter-gate').map((r) => r.id));
    for (const r of OBJECTIVES.filter((x) => x.branchTo)) {
      expect(门.has(r.branchTo), `跳转行 "${r.id}" 的去向 ${r.branchTo} 不是章节门 —— 文档那句"本章末步 → 本章门"是假的`)
        .toBe(true);
    }
  });

  it('B6 的缺口：七座区对五条射线 = 2 座，且那两座的中心逐字不在任何终点上', () => {
    const { 证据 } = 取行('B6');
    const 缺 = ZONE_ORDER.length - 射线.length;
    expect(数(证据, /缺口 \*\*(\d+)\*\* 座/, '缺口座数'), 'B6 那行的缺口数与"区数 − 射线数"不符').toBe(缺);
    expect(缺, '缺口不再是 2 座 —— 这一片的账要重算').toBe(2);
    const 终点 = 射线.map((r) => r.points[r.points.length - 1]);
    const 无名 = ZONE_ORDER.filter((id) => {
      const d = zoneDescriptor(id);
      if (!d) return false;
      return !终点.some(([x, z]) => x === d.center.x && z === d.center.z);
    });
    // 只有 gloom / radiant 的中心在 content 侧有声明（其余五座的中心写在 WorldManager 的字面量里）
    expect(无名, '文档点名的两座与"中心不在任何射线上"的那两座不是一批').toEqual(['gloom', 'radiant']);
    for (const id of ['gloom', 'radiant']) {
      expect(证据.includes(`${id} `) || 证据.includes(id), `B6 那行没点名缺口里的 "${id}"`).toBe(true);
    }
  });

  it('B1 的表现层残差有名字，而且那个名字今天确实不在场', () => {
    const { 证据 } = 取行('B1');
    expect(existsSync('src/ui/InventoryPanel.js'),
      'B1 那行写着 `src/ui/` 没有 `InventoryPanel.js` —— 有人建了它，这行就过期了').toBe(false);
    expect(证据, 'B1 那行没交代"面板只读 gearLabel"这一格残差').toContain('gearLabel');
  });

  it('B4 那行列出的模板名册与注册表一样长（新注册一款而文档没提，当场点名）', () => {
    const { 证据 } = 取行('B4');
    const 漏 = Object.keys(ROOM_TEMPLATES).filter((k) => {
      if (证据.includes(`\`${k}\``)) return false;
      return !(k.startsWith('corner:') && 证据.includes('`corner:*`'));
    });
    expect(漏, '这些模板没在 B4 那行出现过').toEqual([]);
  });
});

describe('④ 尺子自己', () => {
  it('扫描范围非空：六行都被读到，读不到就抛而不是给零', () => {
    const 行 = ['B1', 'B3', 'B4', 'B6', 'C1', 'C2'].map((id) => 取行(id).证据);
    expect(行.length).toBe(6);
    for (const 证据 of 行) expect(证据.length, '有一行的证据列是空的').toBeGreaterThan(100);
    expect(() => 取行('B99')).toThrow(/找到 0 条/);
  });

  it('反向控制：把陈旧陈述塞回证据列，必须被点名', () => {
    const 脏 = '未消：`LootSystem.js` 全文无 `rarity`/`affix`/`equip`，区域只有 5 个，区域之间是空白地形走廊';
    expect(找陈旧(脏), '陈旧陈述塞回去了却没被点名 —— 这条腿是摆设').toEqual(
      expect.arrayContaining(['全文无 `rarity`/`affix`/`equip`', '区域只有 5 个，区域之间是空白地形走廊']),
    );
    // 同一份检查对真文档必须一个都不报（否则上一条腿与这条用的是两套判据）
    expect(找陈旧(['B1', 'B3', 'B4', 'B6', 'C1', 'C2'].map((id) => 取行(id).证据).join('\n'))).toEqual([]);
  });

  it('反向控制：状态标记腿与门禁腿都不是恒绿', () => {
    expect(缺状态标记('`SideQuestRegistry.js` / `QuestSystem.js`')).not.toBeNull();
    expect(找不存在的门禁('门禁 `no-such-gate-at-all` / `mainline-table`')).toEqual(['no-such-gate-at-all']);
    expect(找不存在的脚本('只有 `import-no-such-thing.ps1`')).toEqual(['import-no-such-thing.ps1']);
  });
});
