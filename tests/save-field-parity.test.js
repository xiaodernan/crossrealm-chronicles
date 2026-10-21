/**
 * 存档字段的"写与读必须成对" —— 存档 v7（B66）
 *
 * 病灶（实测，改前）：`SaveSystem.applyData` 一直在读 `data.restPointEnhancer`，
 * 而 `toData` **从来没写过这个键**。于是那行加载代码是死的：营火地标"发现过哪些"
 * （控制 `发现营火 · X` 那一句只播一次的集合）每次读档都退回空集，同一句提示会再播一遍，
 * 日志里还会多出一条同 id 的 `rest-found-*`。
 *
 * 这一片把写的一侧补上（并升存档 v6 → v7，旧档从它**自己已有的另一件事实**推：
 * `campfireMemory.restCount` 的键就是歇过的营火，歇过必然见过），
 * 再钉一条能防整族的门禁：**读档读的顶层键，写档必须写得出**。
 * 它不是给这一个 bug 写的 —— 下一个"只加读不加写"的字段同样会被它抓住。
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SaveSystem } from '../src/game/SaveSystem.js';
import { SaveValidator, CURRENT_VERSION } from '../src/game/SaveValidator.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { installWindowShim } from './helpers/enemyHarness.js';

const ROOT = process.cwd();
const readSrc = (rel) => readFileSync(join(ROOT, 'src', rel), 'utf8').replace(/\r\n/g, '\n');
/** 判据口径与门禁一致：只数代码行（史料注释里提到某个键名不算读写） */
const codeLines = (text) => text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));

const 存档键 = 'crossrealm_save_v9';
const 存储 = new Map();

beforeAll(() => {
  installWindowShim();
  globalThis.localStorage = {
    getItem: (k) => (存储.has(k) ? 存储.get(k) : null),
    setItem: (k, v) => 存储.set(k, String(v)),
    removeItem: (k) => 存储.delete(k),
  };
});
afterEach(() => {
  存储.clear();        // 每个用例都从空存储起，免得上一格的档串到下一格
});

/** 一个够用的宿主：`toData` 只走 `?.toJSON?.()`，缺谁就少一格， validator 要求的补齐 */
function makeHost() {
  const game = {
    dialog: { toasts: [], toast(t) { this.toasts.push(t); } },
    player: {
      position: { x: 1, y: 2, z: 3 },
      yaw: 0.5, pitch: 0.2,
      combat: { hp: 100, maxHp: 118, stamina: 50 },
      teleport() {},
    },
    stats: {
      data: { bag: [], level: 1, souls: 10 },
      toJSON() { return { ...this.data }; },
      fromJSON(d) { this.data = { ...this.data, ...d }; },
      pushToConsumers() {},
    },
    quests: new QuestSystem({ toast() {} }),
    spells: { mana: 100 },
    settings: { data: {}, applyToGame() {} },
    weaponSkills: {
      unlocked: new Set(),
      toJSON: () => ({ unlocked: [] }),
      fromJSON() {},
    },
    restPointEnhancer: {
      discovered: new Set(),
      toJSON() { return { discovered: [...this.discovered] }; },
      fromJSON(d) { this.discovered = new Set(d?.discovered ?? []); },
    },
  };
  return game;
}

describe('写与读成对：整族门禁', () => {
  /** 从两份真源码里各自抽出顶层键，不抄名单 */
  function 读写两侧() {
    const 全文 = readSrc('game/SaveSystem.js');
    const 写 = codeLines(全文.slice(全文.indexOf('static toData'), 全文.indexOf('static applyData')));
    const 读 = codeLines(全文.slice(全文.indexOf('static applyData')));
    const written = new Set();
    for (const line of 写) {
      const m = /^ {6}([a-zA-Z][\w]*):/.exec(line);
      if (m) written.add(m[1]);
    }
    const read = new Set();
    for (const line of 读) {
      for (const m of line.matchAll(/\bdata\.([a-zA-Z][\w]*)/g)) read.add(m[1]);
    }
    return { written, read };
  }

  it('控制组：两侧都真抽出几十个键（判据不是在读空文件）', () => {
    const { written, read } = 读写两侧();
    expect(written.size, '写档侧一个键都没抽出来 —— 正则或切片口径错了').toBeGreaterThan(20);
    expect(read.size, '读档侧一个键都没抽出来 —— 同上').toBeGreaterThan(10);
    // 实物病例必须在册：这一条钉住"读而没有写"这一族今天确实被扫到，而不是一直为空
    expect([...read].length).toBeGreaterThan([...read].filter((k) => !written.has(k)).length);
  });

  it('读档读的顶层键，写档必须写得出（B66 就是这一条抓到）', () => {
    const { written, read } = 读写两侧();
    const 只读不写 = [...read].filter((k) => !written.has(k) && k !== 'version' && k !== 'time');
    expect(只读不写, `这些键只在读档侧出现（那行加载代码是死的）：${只读不写.join('、')}`).toEqual([]);
  });

  it('version 与 time 是唯一的例外，且它们真的由写档侧自己管', () => {
    const 写 = readSrc('game/SaveSystem.js');
    expect(写).toMatch(/version: CURRENT_VERSION/);
    expect(写).toMatch(/time: /);
  });
});

describe('走 shipped 入口：save → load 一个来回，发现状态不再丢', () => {
  it(`营火地标的 discovered 进 ${存档键}，读档后还是那两座`, () => {
    const game = makeHost();
    game.restPointEnhancer.discovered = new Set(['fantasy', 'abyss']);
    // 先直接把 toData 的结果喂给 validator：被拒时要能说出是哪一格（save() 只回 true/false）
    expect(SaveValidator.validate(SaveSystem.toData(game))).toEqual([]);
    expect(SaveSystem.save(game), '存盘被拒（见上一条的 issues）').toBe(true);
    const 原文 = globalThis.localStorage.getItem(存档键);
    expect(原文, '写档没落到当前版本的键上').toBeTruthy();
    const 落盘 = JSON.parse(原文);
    expect(落盘.version).toBe(CURRENT_VERSION);
    expect([...落盘.restPointEnhancer.discovered].sort()).toEqual(['abyss', 'fantasy']);

    // 新档读回来：把集合清空模拟"重启游戏后那些对象是新的"
    game.restPointEnhancer.discovered = new Set();
    game.quests.questIndex = 0;
    expect(SaveSystem.load(game), '读档失败').toBe(true);
    expect([...game.restPointEnhancer.discovered].sort()).toEqual(['abyss', 'fantasy']);
  });

  it('改前那一形状（只读不写）在门禁下必须红：把写侧那一行拿掉就抓得住', () => {
    // 这里不真改生产代码 —— 探针臂会把 `restPointEnhancer:` 那一行拿掉跑一次；
    // 这一格钉的是"本文件的判据能看出少了它"：少了写侧的键，读侧集合就是孤键。
    const 全文 = readSrc('game/SaveSystem.js');
    expect(全文).toMatch(/^ {6}restPointEnhancer: game\.restPointEnhancer\?\.toJSON\?\.\(\),$/m);
    const 人为删掉 = 全文.replace(/^ {6}restPointEnhancer:.*$/m, '');
    expect(人为删掉).not.toMatch(/^ {6}restPointEnhancer:/m);
    // 删掉之后"只读不写"必须不为空（判据不是靠正则碰运气）
    const 读 = codeLines(人为删掉.slice(人为删掉.indexOf('static applyData')));
    const 读到的键 = new Set();
    for (const line of 读) for (const m of line.matchAll(/\bdata\.([a-zA-Z][\w]*)/g)) 读到的键.add(m[1]);
    const 写的键 = new Set();
    const 写行 = codeLines(人为删掉.slice(人为删掉.indexOf('static toData'), 人为删掉.indexOf('static applyData')));
    for (const line of 写行) {
      const m = /^ {6}([a-zA-Z][\w]*):/.exec(line);
      if (m) 写的键.add(m[1]);
    }
    expect([...读到的键].filter((k) => !写的键.has(k) && k !== 'version' && k !== 'time'))
      .toContain('restPointEnhancer');
  });
});
