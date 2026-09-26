/**
 * 仓库边界与「不得拿显示名当逻辑」的静态门禁。
 *
 * 这几条扫描针对的是同一类故障（B36 / B35）：**运行期不会有任何报错**。
 * 把回声目录的 `zone` 写成 `'魔法遗境'`、给某个区域增强器补一段按中文区名找区的代码，
 * 游戏照跑不误 —— 前者让图鉴与成就静默变空，后者让整段氛围强化静默变成 no-op。
 * 所以这里扫的是源码本身：先剥掉字符串以外的注释，再要求这些写法在 `src/` 下出现 0 次。
 *
 * 行注释里的反例（`// 以前是 name.includes('霍格')`）不算命中 —— 那是修 B36 时留下的
 * 说明文字，剥注释正是为了区分「注释里提到」与「代码里真在这么判断」。
 *
 * 数据表自身的自洽（母题门槛对得上目录条数、分桶统计真跑得起来）在
 * `tests/franchise-identity.test.js`；区域身份的行为契约在 `tests/zone-identity.test.js`。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { ZONE_NAMES } from '../src/content/ZoneIdentity.js';

/** 回归门禁：简历联动子系统（工程栈 / 足球面板）不得再进入游戏代码 */
const FORBIDDEN = [
  'DevStack', 'devstack', 'FootballPanel', 'KafkaEventHub', 'RedisCacheDirector',
  'RedisStructuresDirector', 'SentinelDirector', 'RagAgentAssistant',
  'SeckillLuaDirector', 'CronTaskDirector', 'ResumeBootstrapDirector',
  'SeataTransactionDirector', 'WebSocketDirector', 'DevStackLiveBridge',
];

const SRC = join(process.cwd(), 'src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const FILES = walk(SRC);

/**
 * 逐行剥注释，**保持行号与原文件一一对应**（整体正则替换会把注释后面的代码并进上一行，
 * 那样报出来的行号与源码就对不上了）。字符串内部的 `//` 不当注释。
 */
function stripComments(text) {
  let inBlock = false;
  return text.split('\n').map((line) => {
    let out = '';
    let quote = null;
    let i = 0;
    while (i < line.length) {
      const c = line[i];
      const n = line[i + 1];
      if (inBlock) {
        if (c === '*' && n === '/') { inBlock = false; i += 2; } else i += 1;
        continue;
      }
      if (quote) {
        out += c;
        if (c === '\\') { out += n ?? ''; i += 2; continue; }
        if (c === quote) quote = null;
        i += 1;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') { quote = c; out += c; i += 1; continue; }
      if (c === '/' && n === '/') break;
      if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
      out += c;
      i += 1;
    }
    return out;
  }).join('\n');
}

const CODE = new Map(FILES.map((f) => [f, stripComments(readFileSync(f, 'utf8'))]));

/** 命中记录：`file` 用相对路径，避免不同目录下的同名文件混成一堆 */
function scan(re, res) {
  const hits = [];
  for (const [f, code] of CODE) {
    code.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(re)) {
        if (res(m)) hits.push({ file: relative(SRC, f).replaceAll('\\', '/'), line: i + 1, text: line.trim() });
      }
    });
  }
  return hits;
}

const show = (hits) => hits.map((h) => `${h.file}:${h.line}: ${h.text.slice(0, 78)}`);

describe('内容边界', () => {
  /**
   * 扫描集自检。
   *
   * 静态扫描最容易犯的错是假绿：目录解析跑偏、`src/` 挪了位置，扫到空集就一路绿灯。
   * 这里确认两个本轮新建的模块真在扫描集里，文件总数也还对得上。
   */
  it('扫描集覆盖当前源码树', () => {
    for (const probe of ['content/ZoneIdentity.js', 'content/franchises.js']) {
      expect(existsSync(join(SRC, probe)), `磁盘上缺少 ${probe}`).toBe(true);
      expect(FILES.some((f) => relative(SRC, f).replaceAll('\\', '/') === probe), `扫描集里没有 ${probe}`).toBe(true);
    }
    expect(FILES.length).toBeGreaterThanOrEqual(180);
  });

  it('src/ 内不含工程栈与足球面板引用', () => {
    const offenders = [];
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      for (const token of FORBIDDEN) {
        if (text.includes(token)) offenders.push(`${file}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /*
   * ── 显示名不得参与判定（修 B36）──
   *
   * 两类运算都盖：`x.includes('中文')` 这类**匹配**，与 `=== / !== / case '中文'`
   * 这类**相等判定**（后者是 `zoneName === '混沌边境'` 的写法，改一行文案就整段失效）。
   * B36 记的 57 处已经清零，所以这里不留存量清单 —— 任何新站点直接变红。
   */
  const CJK = /[\u4e00-\u9fff]/;
  const NAME_MATCH = /\.(?:includes|indexOf|lastIndexOf|startsWith|endsWith|search|match)\s*\(\s*(['"`])([^'"`]*)\1/g;
  const NAME_COMPARE = /(?:[=!]==?)\s*(['"`])([^'"`]*)['"`]|(?:['"`])([^'"`]*)['"`]\s*(?:[=!]==?)|\bcase\s+(['"`])([^'"`]*)['"`]/g;
  const cjk = (m) => CJK.test(m[2] ?? m[3] ?? m[5] ?? '');

  it('src/ 内没有按中文显示名做的逻辑判定', () => {
    const hits = [...scan(NAME_MATCH, cjk), ...scan(NAME_COMPARE, cjk)];
    expect(show(hits)).toEqual([]);
  });

  /** 曾经写成 `subtitle.includes('哈利')`：整段强化静默不跑，比崩溃更难查 */
  const ZONE_BY_NAME = /\.zones\.find\(\s*\(?(\w+)\)?\s*=>\s*\1\.(?:name|subtitle|info\??\.name)\s*\??\.\s*includes/g;

  it('src/ 内没有按中文显示名查找区域的写法', () => {
    expect(show(scan(ZONE_BY_NAME, () => true))).toEqual([]);
  });

  /*
   * ── 回声目录：`zone` / `franchise` 两个字段存的都是 id ──
   *
   * 目录里 49 条回声，`zone` 必须是 ZONE_IDS 的值、`franchise` 必须写 `FRANCHISE.*`
   * 常量；写成中文字面量的那一刻起，图鉴筛选与成就分桶就开始漏。
   *
   * W-B2 切片3：目录本体从 `game/PopCultureHomageRegistry*.js`（四层）搬进
   * `content/echoes.js`（一张表），扫描范围跟着换 —— 门禁认的是**那张表**，不是那批文件名。
   * 区域 id 那一组直接从 `ZoneIdentity.js` 取，不再在本文件里抄第二份清单。
   */
  const echoFiles = FILES.filter((f) => /(^|\/)echoes\.js$/.test(relative(SRC, f).replaceAll('\\', '/')));
  // 区域 id 的清单从真源取，不再在本文件里抄第二份（`ZONE_NAMES` 的键就是那批 id）
  const ZONE_FIELDS = new Set(Object.keys(ZONE_NAMES));

  it('回声目录的每条 zone 都是区域 id、每条 franchise 都是常量引用', () => {
    const offenders = [];
    let zones = 0;
    let franchises = 0;
    for (const f of echoFiles) {
      const code = CODE.get(f);
      for (const m of code.matchAll(/\bzone:\s*(['"`])([^'"`]*)\1/g)) {
        zones += 1;
        if (!ZONE_FIELDS.has(m[2])) offenders.push(`${basename(f)}: zone='${m[2]}'`);
      }
      for (const m of code.matchAll(/\bfranchise:\s*([^,}]+)/g)) {
        franchises += 1;
        if (!/^FRANCHISE\.[A-Z_]+$/.test(m[1].trim())) offenders.push(`${basename(f)}: franchise=${m[1].trim()}`);
      }
    }
    // 扫不到东西 = 门禁自己失效了，比漏报更危险
    expect(zones, '一条回声都没扫到').toBeGreaterThanOrEqual(30);
    expect(franchises, '一条母题登记都没扫到').toBeGreaterThanOrEqual(30);
    expect(offenders).toEqual([]);
  });
});
