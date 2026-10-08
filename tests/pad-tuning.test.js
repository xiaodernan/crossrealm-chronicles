/**
 * 手柄手感的滑杆（W-A7 切片15 的三根：死区 / 外圈量程 / 镜头响应曲线；切片21 再加三根：
 * 镜头死区 / 镜头转速 / 冲刺触发深度；切片22 补扳机那一根，切片32 把它拆成 LT / RT 两根）。
 *
 * 这一片的风险是四件事，各自要有一层用例：
 * 1. **一份范围**：滑杆能拖到的值与桥肯认的值必须是同一份（`PAD_TUNING`），否则玩家拖到
 *    头会发现"明明动了却什么都没变"（值被当脏数据悄悄回落）；
 * 2. **一处写入口**：手档进桥只有 `SettingsManager.applyToGame` 一条路，桥自己只读
 *    `this.tuning`；出厂对象 `PAD` 一动不动（就地改它等于改了全仓默认，"恢复默认"回不来）；
 * 3. **坏档逐项回落**：存储是玩家可写的，把 `lookCurve` 写成 `"abc"` 不该把死区与量程一起废掉，
 *    更不该把 `NaN` 乘进每帧的舵量里；
 * 4. **一格旋钮只有一个名字**（切片21）：表里的键名、桥读的字段名、壳页那根的 id 是同一件事的
 *    三面 —— 名单一旦在面板里手抄一遍，加一格就会漏抄，而漏抄的表现不是报错，是"那一格永远拖不动"。
 *    所以 id 从键名**推**（`padKnobId`），壳页与表互查（双向），出厂值还必须正落在滑杆的格子上
 *    （`type=range` 会把值吸到 `min + n×step`，不在格子上的出厂值就是"显示 0.14 而存着 0.15"）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  PAD, PAD_TUNING, padTuning, GAMEPAD_BINDINGS, codeFor,
} from '../src/content/keybinds.js';
import { GamepadInput } from '../src/engine/GamepadInput.js';
import { SettingsManager } from '../src/core/SettingsManager.js';
import { SettingsPanel, padKnobId } from '../src/ui/SettingsPanel.js';
import { makePlayer, runFrames } from './helpers/playerHarness.js';

const SRC = join(process.cwd(), 'src');

/** 表里每一格的出厂值：`padTuning()` 该给的就是这一份（用例不抄数字，抄了就得跟着加格改） */
const factoryTuning = () => Object.fromEntries(Object.keys(PAD_TUNING).map((k) => [k, PAD[k]]));

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const full = join(dir, n);
  if (statSync(full).isDirectory()) return walk(full);
  return /\.js$/.test(n) ? [full] : [];
});

const FILES = walk(SRC).map((f) => ({
  name: f.slice(SRC.length + 1).replace(/\\/g, '/'),
  source: readFileSync(f, 'utf8'),
}));

const sourceOf = (name) => {
  const found = FILES.find((f) => f.name === name);
  expect(found, `${name} 不在了`).toBeTruthy();
  return found.source;
};

/**
 * 取源码里每一处 `fn(...)` 的**顶层**实参（函数定义本身跳过）。
 *
 * 为什么不是一句 `matchAll(/fn\(([^)]*)\)/)`：切片32 之后调用长这样 ——
 * `_pressed(buttons[i], prev, padPressDepth(this.tuning, i), factor)`。`[^)]*` 会停在
 * `padPressDepth(this.tuning, i` 那个括号上，于是"参数个数"这条门禁数到 4 个**逗号切出来的碎片**
 * 照样绿：真的少喂一个参数它看不见。数参数就得正确配对括号，否则这条门禁是假的。
 */
function callArgs(src, fn) {
  const out = [];
  for (let i = src.indexOf(`${fn}(`); i >= 0; i = src.indexOf(`${fn}(`, i + 1)) {
    if (src.slice(Math.max(0, i - 12), i).includes('function')) continue;
    let end = -1;
    for (let j = i + fn.length, depth = 0; j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')' && --depth === 0) { end = j; break; }
    }
    expect(end, `${fn}(...) 有一处括号没闭合，静态门禁读不了`).toBeGreaterThan(i);
    const parts = [];
    let depth = 0, cur = '';
    for (const c of src.slice(i + fn.length + 1, end)) {
      if ('([{'.includes(c)) depth++;
      if (')]}'.includes(c)) depth--;
      if (c === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += c;
    }
    if (cur.trim()) parts.push(cur.trim());
    out.push(parts);
  }
  return out;
}

const FACTORY = { ...PAD };

afterEach(() => {
  // 出厂对象必须一动没动：任何一处就地改 `PAD` 都会在这里现形
  expect(PAD).toEqual(FACTORY);
});

/* ------------------------------------------------------ 那一小段清洗 */

describe('padTuning：出厂 + 玩家档 → 桥用的那一组值', () => {
  it('什么都不给就是出厂值，而且值取自 `PAD`（不另抄一份数字）', () => {
    expect(padTuning()).toEqual(factoryTuning());
    expect(Object.keys(padTuning()).sort()).toEqual(Object.keys(PAD_TUNING).sort());
  });

  it('表里每一格都在 `PAD` 里有同名出厂值（键名打错的表现不是报错，是那一格永远是 undefined）', () => {
    for (const [key, spec] of Object.entries(PAD_TUNING)) {
      expect(PAD[key], `PAD.${key} 不在了`).toBeTypeOf('number');
      for (const bound of ['min', 'max']) {
        expect(spec[bound], `${key}.${bound} 不是数`).toBeTypeOf('number');
      }
      expect(spec.min, key).toBeLessThan(spec.max);
      expect(spec.step, key).toBeGreaterThan(0);
    }
  });

  it('出厂值落在自己的范围内，而且**正落在滑杆的格子上**（`type=range` 会把值吸到 min+n×step）', () => {
    for (const [key, spec] of Object.entries(PAD_TUNING)) {
      const def = PAD[key];
      expect(def, `${key} 出厂值出界了（出厂即脏档）`).toBeGreaterThanOrEqual(spec.min);
      expect(def, `${key} 出厂值出界了`).toBeLessThanOrEqual(spec.max);
      // 不在格子上：滑杆显示的是被吸过的那一格，而存储里是出厂值 —— 回显与行为分家（B47 一族）
      const n = (def - spec.min) / spec.step;
      expect(Math.abs(n - Math.round(n)), `${key} 出厂值 ${def} 不在 step ${spec.step} 的格子上`)
        .toBeLessThan(1e-9);
      // 两端也必须在格子上：否则"拖到头"写回来的值与滑杆显示的不是同一个数
      for (const bound of ['min', 'max']) {
        const k = (spec[bound] - spec.min) / spec.step;
        expect(Math.abs(k - Math.round(k)), `${key}.${bound} 不在格子上`).toBeLessThan(1e-9);
      }
    }
  });

  it('扳机那两格的下界不许是 0：门槛 0 时"碰都没碰"也算按下，而且永远松不开', () => {
    // 范围是这张表**唯一**说得上话的地方：清洗只按范围救档，所以"下界写错"这种脏表
    // 不会有人报错 —— `value >= 0` 恒真，扳机那一格就从旋钮变成了卡死的开关。
    // 迟滞救不了它：`0 × factor` 还是 0。所以每一枚扳机的下界都得钉在 0 之上
    for (const key of ['leftTriggerDepth', 'rightTriggerDepth']) {
      const spec = PAD_TUNING[key];
      expect(spec, `${key} 不在表里：LT 与 RT 各有各的深度是切片32 的立论`).toBeTruthy();
      expect(spec.min, `${key}.min 是 0 = 桥每帧都当玩家按着这一枚扳机`).toBeGreaterThan(0);
      expect(padTuning({ [key]: 0 })[key], '0 这一档出界，清洗该落回出厂值').toBe(PAD[key]);
    }
  });

  it('扳机那两档的**量程两端仍然必须是合法档**：0.2 一碰就走、1 推到底才算', () => {
    // 这一条不查表查什么，查的是"老档里的值今天还算不算"：清洗只按范围救档，把上限从 1 收窄
    // 到 0.4 不会报错，但玩家存储里那一档 `0.7`（钝到只有推到底才起手）当场变成脏值，下一次
    // 开机就被刷回出厂 0.5 —— 玩家什么都没做，手感自己变了（探针里"改一个数字而全套仍绿"的那条）。
    // 两端都得钉住：下界 0 由上一条管，这里管"整根扳机行程还够不够得着"
    for (const key of ['leftTriggerDepth', 'rightTriggerDepth']) {
      const spec = PAD_TUNING[key];
      expect(spec.min, `${key}.min：0.2 是切片22 定下的"一碰就走"那一档`).toBe(0.2);
      expect(spec.max, `${key}.max：收到 1 以下就没有"非推到底不算"这一档了`).toBe(1);
      expect(spec.step, `${key}.step：0.05 是面板上的档位间距`).toBe(0.05);
      for (const v of [0.2, 0.35, 0.5, 0.7, 1]) {
        expect(padTuning({ [key]: v })[key], `${key} 的 ${v} 这一档不再合法 = 老档被改写`)
          .toBe(v);
      }
    }
  });

  it('老档里那一根 `pressThreshold` 拆给两枚扳机：玩家调过的手感不该在拆分那天早上被抹掉', () => {
    // 存储是玩家可写的、也是**跨版本**的：切片32 之前只有一根扳机深度，拧过的档同时管着两根
    // 手指。拆成两格之后若只认新键，那一档就静静躺在存储里没人读，而两格回出厂 0.5 ——
    // 玩家看到的是"我调细的扳机今天早上一夜之间变钝了"（与 B47 同一族：写的账与读的账分家）
    expect(padTuning({ pressThreshold: 0.3 }))
      .toEqual({ ...factoryTuning(), leftTriggerDepth: 0.3, rightTriggerDepth: 0.3 });
    // 已经拧过的新一格赢，另一格仍从老档接位（玩家只拖了 LT，RT 该保持他原来那一档）
    expect(padTuning({ pressThreshold: 0.3, leftTriggerDepth: 0.8 }))
      .toEqual({ ...factoryTuning(), leftTriggerDepth: 0.8, rightTriggerDepth: 0.3 });
  });

  it('老档出界或是脏值：两枚扳机各回出厂，不把脏值搬进新家', () => {
    for (const bad of [0, 1.5, -3, 'abc', null, NaN]) {
      const got = padTuning({ pressThreshold: bad });
      expect(got.leftTriggerDepth, String(bad)).toBe(PAD.leftTriggerDepth);
      expect(got.rightTriggerDepth, String(bad)).toBe(PAD.rightTriggerDepth);
    }
  });

  it('`pressThreshold` 不再是一格旋钮：一根拖了什么都不改的滑杆就是说谎', () => {
    // 留着它的后果不是"多一格无害"，是面板照旧画一根、桥已经不读 —— 玩家拖它会有反馈
    // （写进存储）而行为一个字不变，正是切片21 那条"滑杆真的改行为"要防的东西。
    // 但 `PAD.pressThreshold` 要留着：那十四枚数字键仍需一个唯一入口深度（见 `padPressDepth`）
    expect(PAD_TUNING.pressThreshold, '表里还留着它 = 第二根扳机滑杆').toBeUndefined();
    expect('pressThreshold' in padTuning(), '清洗结果里还留着它 = 第二个扳机真源').toBe(false);
    expect(PAD.pressThreshold, '数字键那一档的深度没了：`_pressed` 会拿到 undefined').toBeTypeOf('number');
  });

  it('合法值原样通过（含两端边界）：每一格都各自验一次', () => {
    expect(padTuning({ deadzone: 0.4, analogRange: 0.6, lookCurve: 3 }))
      .toEqual({ ...factoryTuning(), deadzone: 0.4, analogRange: 0.6, lookCurve: 3 });
    expect(padTuning({ deadzone: 0 }).deadzone).toBe(0);   // 0 是允许档（不留漂移余量）
    for (const [key, spec] of Object.entries(PAD_TUNING)) {
      for (const v of [spec.min, spec.max, PAD[key]]) {
        expect(padTuning({ [key]: v })[key], `${key} 的 ${v} 被当脏数据了`).toBe(v);
      }
    }
  });

  it('坏值逐项回落出厂：只有一格脏，其余两格仍然是玩家要的', () => {
    const got = padTuning({ deadzone: 'abc', analogRange: 5, lookCurve: PAD.lookCurve });
    expect(got.deadzone).toBe(PAD.deadzone);
    expect(got.analogRange).toBe(PAD.analogRange);
    expect(got.lookCurve).toBe(PAD.lookCurve);
    for (const bad of [null, undefined, NaN, -1, {}, [], '0.3']) {
      expect(Number.isFinite(Number(bad) ) ? padTuning({ deadzone: bad }).deadzone : PAD.deadzone,
        String(bad)).toBe(Number.isFinite(Number(bad)) && Number(bad) >= 0 && Number(bad) <= 0.4 ? Number(bad) : PAD.deadzone);
    }
  });

  it('不写回 `PAD`：清洗过脏档之后出厂值仍然在（"恢复默认"回得来）', () => {
    padTuning({ deadzone: 99, analogRange: -3, lookCurve: 'x' });
    expect(PAD.deadzone).toBe(FACTORY.deadzone);
    expect(PAD.analogRange).toBe(FACTORY.analogRange);
    expect(PAD.lookCurve).toBe(FACTORY.lookCurve);
  });
});

/* ---------------------------------------------------------- 桥用它 */

const makePad = () => ({
  connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
});

const mkBridge = (tuning = null) => {
  const pad = makePad();
  const bridge = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, () => [pad]);
  if (tuning) bridge.setTuning(tuning);
  return { bridge, pad };
};

/**
 * 一枚只看扳机的桥：`leftTrigger`（LT，物理 6）绑一个电平动作，出口给死一个键码，
 * 于是"这一推算不算按下了"就读 `keys.ShiftLeft` —— 扳机在标准映射里既当轴又当键，
 * 用例别去猜桥内部那格，读它对外的唯一出口。
 */
const mkTriggerBridge = (tuning) => {
  const pad = makePad();
  const keys = {};
  const bridge = new GamepadInput(
    { keys },
    { hold: { action: 'hold', mode: 'level', button: 'leftTrigger' } },
    () => [pad],
    () => ({ code: 'ShiftLeft' }),
  );
  bridge.setTuning(tuning);
  const lt = (value) => { pad.buttons[6].value = value; pad.buttons[6].pressed = value >= 1; };
  return { bridge, keys, lt };
};

describe('GamepadInput：两根杆都只认这一份手档', () => {
  it('出厂档下与切片2/8 的算式逐字一致（回归锚点，防止清洗顺手改了公式）', () => {
    const { bridge, pad } = mkBridge();
    pad.axes[2] = 1;                                   // 右杆满舵
    pad.axes[0] = 1;                                   // 左杆满推
    bridge.poll();
    expect(bridge.move.mag).toBeCloseTo(1, 6);
    expect(bridge.look.x).toBeCloseTo(PAD.lookPixelsPerSecond, 6);
  });

  it('死区抬高一档：同一推量变小、方向码同时不亮（两条路共用同一个死区）', () => {
    const { bridge, pad } = mkBridge({ deadzone: 0.35 });
    pad.axes[0] = 0.3;                                 // 出厂死区之上、新手档之下：这一推该没了
    bridge.poll();
    expect(bridge.move.mag).toBe(0);
    expect(bridge._slots.some((s) => s.dirName && s.down), '方向码亮着而 mag 是 0 = 自相矛盾的一帧')
      .toBe(false);
  });

  it('量程调低：够不到 1.0 的行程也能推满速（切片8 那块物理余量的玩家档）', () => {
    const { bridge, pad } = mkBridge({ analogRange: 0.7 });
    pad.axes[0] = 0.7;
    bridge.poll();
    expect(bridge.move.mag).toBeCloseTo(1, 6);
  });

  it('镜头曲线改陡：半舵的舵量按新曲线走，满舵仍然是满舵（端点不弯）', () => {
    const { bridge: flat, pad: p1 } = mkBridge({ lookCurve: 1 });
    p1.axes[2] = 0.5;
    flat.poll();
    const { bridge: curved, pad: p2 } = mkBridge({ lookCurve: 2 });
    p2.axes[2] = 0.5;
    curved.poll();
    // 同一个 t 过一次各自的曲线：curve=1 是线性，curve=2 是 t²（比值就是 t 本身）
    const t = flat.look.x / PAD.lookPixelsPerSecond;
    expect(curved.look.x / PAD.lookPixelsPerSecond).toBeCloseTo(t ** 2, 6);
    p2.axes[2] = 1;
    curved.poll();
    expect(curved.look.x).toBeCloseTo(PAD.lookPixelsPerSecond, 6);
  });

  it('镜头那一档死区**只管镜头**：同一推量下走路照走、镜头不转（两格各拧各的）', () => {
    const { bridge, pad } = mkBridge({ lookDeadzone: 0.3 });
    pad.axes[0] = 0.3;                                  // 左杆：走路（出厂死区 0.2 → 该有速度）
    pad.axes[2] = 0.3;                                  // 右杆：镜头（新手档 0.3 → 正好还没出死区）
    bridge.poll();
    expect(bridge.move.mag).toBeGreaterThan(0);
    expect(bridge.look.x).toBe(0);
    expect(bridge.look.y).toBe(0);
    // 反手验一次：把镜头死区调回出厂，同一推量就该转了（否则"没转"可能是别的原因）
    const back = mkBridge({ lookDeadzone: PAD.lookDeadzone });
    back.pad.axes[2] = 0.3;
    back.bridge.poll();
    expect(Math.hypot(back.bridge.look.x, back.bridge.look.y)).toBeGreaterThan(0);
  });

  it('镜头转速一格就管转速：满推的点数跟着滑杆走，出厂那格仍然是 `PAD.lookPixelsPerSecond`', () => {
    for (const v of [400, 2600, PAD.lookPixelsPerSecond]) {
      const { bridge, pad } = mkBridge({ lookPixelsPerSecond: v, lookCurve: 1 });
      pad.axes[2] = 1;
      bridge.poll();
      expect(bridge.look.x, `满推 ${v}`).toBeCloseTo(v, 6);
    }
    // 方向与大小分家：转速改了，朝哪儿不该改（曲线也只改快慢）。镜头那条**不翻 y 符号** ——
    // 翻符号的是移动（"前"是 -y），别把两条杆当成同一件事
    const a = mkBridge({ lookPixelsPerSecond: 2600 });
    a.pad.axes[3] = -1;                                 // 右杆 y 轴向下为正 → 推上
    a.bridge.poll();
    expect(a.bridge.look.x).toBe(0);
    expect(a.bridge.look.y).toBeCloseTo(-2600, 6);
  });

  it('冲刺触发深度：同一推量在两个档下分别是"跑"和"走"（判定长在桥的 `move.sprint`）', () => {
    const push = 0.6;                                   // 重映射后 t=(0.6-0.2)/(0.92-0.2)≈0.588
    const soft = mkBridge({ moveSprintThreshold: 0.5 });
    soft.pad.axes[1] = -push;
    soft.bridge.poll();
    const stiff = mkBridge({ moveSprintThreshold: 0.9 });
    stiff.pad.axes[1] = -push;
    stiff.bridge.poll();
    expect(soft.bridge.move.mag).toBeCloseTo(stiff.bridge.move.mag, 9);   // 走路速度不该被这格改了
    expect(soft.bridge.move.sprint).toBe(true);
    expect(stiff.bridge.move.sprint).toBe(false);
  });

  it('静止与死区里都不许凭空"想跑"：每一档门槛下 `mag` 为 0 时 `sprint` 必为假', () => {
    for (const threshold of [0.3, 0.5, 0.9, 1]) {
      const { bridge, pad } = mkBridge({ moveSprintThreshold: threshold });
      pad.axes[1] = -0.1;                               // 出厂死区 0.2 之下：这一推等于没推
      bridge.poll();
      expect(bridge.move.mag, String(threshold)).toBe(0);
      expect(bridge.move.sprint, `门槛 ${threshold} 下静止算想跑`).toBe(false);
    }
  });

  it('门槛是**闭**区间：推到量程尽头那一档（重映射后正好 1）在门槛 1 下就算想跑', () => {
    const { bridge, pad } = mkBridge({ moveSprintThreshold: 1 });
    pad.axes[1] = -PAD.analogRange;                    // 两个操作数与桥里那条式子完全相同 → `t` 恰为 1
    bridge.poll();
    expect(bridge.move.mag).toBe(1);
    expect(bridge.move.sprint, '写成严格大于就是"永远差一格"').toBe(true);
    const near = mkBridge({ moveSprintThreshold: 1 });
    near.pad.axes[1] = -PAD.analogRange * 0.99;
    near.bridge.poll();
    expect(near.bridge.move.sprint).toBe(false);
  });

  it('吃的是**重映射之后**的行程：物理上差一点到底（0.85）已经算满推（切片8 那块余量的账）', () => {
    const { bridge, pad } = mkBridge({});              // 出厂：门槛 0.9、外圈量程 0.92
    pad.axes[1] = -0.85;
    bridge.poll();
    expect(bridge.move.mag).toBeCloseTo(0.9028, 4);
    expect(bridge.move.sprint, '拿原始模长比门槛，这一推就会翻成"没到"').toBe(true);
  });

  it('一枚扳机一档深度：同一 0.6 那一推在两个档下分别是"按下了"和"没按"', () => {
    for (const [press, want] of [[0.5, true], [0.6, true], [0.65, false], [0.9, false], [0.2, true]]) {
      const { bridge, keys, lt } = mkTriggerBridge({ leftTriggerDepth: press });
      lt(0.6);
      bridge.poll();
      expect(!!keys.ShiftLeft, `门槛 ${press}、扳机 0.6`).toBe(want);
    }
    // 端点算"按下"（`>=` 不是 `>`）：门槛拧到多深，推到多深就该算按下
    const edge = mkTriggerBridge({ leftTriggerDepth: 0.8 });
    edge.lt(0.8);
    edge.bridge.poll();
    expect(edge.keys.ShiftLeft).toBe(true);
  });

  it('迟滞是**这一格的**系数：门槛 0.9 时退到 0.65 仍算按着、0.6 才放（固定下沿会在低门限档反过来）', () => {
    const { bridge, keys, lt } = mkTriggerBridge({ leftTriggerDepth: 0.9 });
    lt(0.95);
    bridge.poll();
    expect(keys.ShiftLeft).toBe(true);
    lt(0.65);                                          // 0.9×0.7=0.63 之上：还在迟滞带里
    bridge.poll();
    expect(keys.ShiftLeft, '停在迟滞带里不该反复触发').toBe(true);
    lt(0.6);                                           // 退到线下才算松
    bridge.poll();
    expect(keys.ShiftLeft).toBe(false);
    // 反手验一次"为什么不能写绝对下沿"：门限拧到 0.2 时，绝对 0.35 会**高于**进入门限，
    // 一碰就再也松不开。系数那一档下 0.2×0.7=0.14，0.2 还按着、0.1 才放
    const soft = mkTriggerBridge({ leftTriggerDepth: 0.2 });
    soft.lt(0.2);
    soft.bridge.poll();
    expect(soft.keys.ShiftLeft).toBe(true);
    soft.lt(0.15);
    soft.bridge.poll();
    expect(soft.keys.ShiftLeft, '固定下沿 0.35 会让这一档变成"一碰就松不开"').toBe(true);
    soft.lt(0.1);
    soft.bridge.poll();
    expect(soft.keys.ShiftLeft).toBe(false);
  });

  it('数字按钮（只有 `pressed` 没有模拟量）在最深那一档也算按下：门槛别把手柄变成哑巴', () => {
    const { bridge, keys, lt } = mkTriggerBridge({ leftTriggerDepth: 1 });
    lt(1);                                              // 数字键的形状：`pressed` 为真，桥合成 value 1
    bridge.poll();
    expect(keys.ShiftLeft, '门槛 1.0 = 按到底才算，数字键按到底就是 1').toBe(true);
    lt(0);
    bridge.poll();
    expect(keys.ShiftLeft).toBe(false);
  });

  it('捕获那一路也问同一格手档：门槛拧深之后"半按扳机"不该被当成玩家按下了这一枚', () => {
    const pad = makePad();
    const found = [];
    const bridge = new GamepadInput(
      { keys: {} },
      { hold: { action: 'hold', mode: 'level', button: 'leftTrigger' } },
      () => [pad],
      () => ({ code: 'ShiftLeft' }),
    );
    bridge.setTuning({ leftTriggerDepth: 0.9 });
    bridge.startCapture((name) => found.push(name));
    pad.buttons[6].value = 0.6;                         // 半按：这一档下不该算按下
    bridge.poll();
    pad.buttons[6].value = 0;                           // 松手：捕获看的是"按下并松手"那一下
    bridge.poll();
    expect(found, '半按不该被捕获').toEqual([]);
    pad.buttons[6].value = 0.95;                        // 够深的那一下
    bridge.poll();
    pad.buttons[6].value = 0;
    bridge.poll();
    expect(found).toEqual(['leftTrigger']);
  });

  it('捕获结束那一腿也用扳机自己的迟滞线：退到 0.9×0.7 以下才算松手（借摇杆那一格差一截）', () => {
    // 变异台抓到的洞（T6）：把 `PAD.triggerReleaseFactor` 手滑成 `PAD.navStickReleaseFactor`，
    // 上面那条"按下/松手"的用例照样全绿 —— 因为它一路退到 0，两条线谁都不影响结论。
    // 所以要停在**两条线之间**那一格：0.9×0.7=0.63 与 0.9×0.6=0.54
    const pad = makePad();
    const found = [];
    const bridge = new GamepadInput(
      { keys: {} },
      { hold: { action: 'hold', mode: 'level', button: 'leftTrigger' } },
      () => [pad],
      () => ({ code: 'ShiftLeft' }),
    );
    bridge.setTuning({ leftTriggerDepth: 0.9 });
    bridge.startCapture((name) => found.push(name));
    pad.buttons[6].value = 0.95;
    bridge.poll();                                        // 按下：捕获开始等松手
    pad.buttons[6].value = 0.68;                          // 还在迟滞带里（> 0.63）：不该提前结束
    bridge.poll();
    expect(found).toEqual([]);
    pad.buttons[6].value = 0.58;                          // 退到线下：这一下才算松完
    bridge.poll();
    expect(found, '借了摇杆那一格（×0.6 → 0.54）会把这一下当成"还没松手"，改键界面就此卡住')
      .toEqual(['leftTrigger']);
  });

  it('扳机那两档拧到任一头都不与走路串门：只改扳机，`mag` 与 `sprint` 一个字不动', () => {
    const push = 0.7;                                   // 越过出厂死区的一推
    const a = mkBridge();
    a.pad.axes[0] = push;
    a.bridge.poll();
    // 两头各来一次、两枚扳机各来一次：这四份档都不该碰到移动那条重映射式
    for (const tuning of [{ leftTriggerDepth: 0.2 }, { leftTriggerDepth: 1 },
      { rightTriggerDepth: 0.2 }, { rightTriggerDepth: 1 }]) {
      const b = mkBridge(tuning);
      b.pad.axes[0] = push;
      b.bridge.poll();
      expect(b.bridge.move, JSON.stringify(tuning)).toEqual(a.bridge.move);
    }
  });

  /* ---------------- 两根扳机两个数（W-A7 切片32）----------------
   * 现场：`pressThreshold` 一格同时管着 LT 与 RT，可这两枚干的不是同一件事 ——
   * RT 是重击（`edge`，玩家要的是"一碰就走"），LT 是蓄力法术（`level`，切片30 之后它真的有
   * 消费者，而且那一推的**深度**决定蓄力起不起手，切片30 的 P6 读数量过）。一根旋钮逼着玩家
   * 在两样手感之间取一个折中：拧浅了走路时手指压着扳机就起手蓄力，拧深了重击按不动。
   * 所以这一片的中心不是"多一根滑杆"，是**一枚物理按钮一个主人**在手档这一侧的对应物。 */

  /**
   * 真表上的两枚扳机：LT=`spell1`（level，出口 `Digit1`）、RT=`attackHeavy`（edge，出口是**鼠标右键**）。
   * 用真表而不是手搓两格：这一片要证的正是"哪一档管哪一枚"，手搓会把这件事写死在夹具里 ——
   * 出厂表以后把扳机挪去别的动作，夹具不会红，而玩家会看到"我拧的滑杆管的是别人"。
   */
  function mkTriggers(tuning) {
    const pad = makePad();
    const keys = {};
    const mouseDown = { left: false, right: false };
    const bridge = new GamepadInput({ keys, mouseDown }, GAMEPAD_BINDINGS, () => [pad]);
    bridge.setTuning(tuning);
    const hold = (i, v) => { pad.buttons[i].value = v; pad.buttons[i].pressed = v >= 1; };
    // 每次 poll 之前把键盘侧那两格清掉：`_grab` 借的格子上面的用例读的就是"这一帧亮没亮"
    const step = () => {
      delete keys[codeFor('spell1')];
      mouseDown.right = false;
      bridge.poll();
      return { spell: !!keys[codeFor('spell1')], heavy: mouseDown.right === true };
    };
    return { pad, keys, mouseDown, bridge, lt: (v) => hold(6, v), rt: (v) => hold(7, v), step };
  }

  /** 两枚扳机都当 `level` 用：迟滞要观察"还按着没有"，`edge` 只给一帧，读不出线在哪 */
  function mkTwoLevelTriggers(tuning) {
    const pad = makePad();
    const keys = {};
    const bridge = new GamepadInput({ keys }, {
      ltHold: { action: 'ltHold', mode: 'level', button: 'leftTrigger' },
      rtHold: { action: 'rtHold', mode: 'level', button: 'rightTrigger' },
    }, () => [pad], (slot) => ({ code: slot.action === 'ltHold' ? 'KeyT' : 'KeyR' }));
    bridge.setTuning(tuning);
    const hold = (i, v) => { pad.buttons[i].value = v; pad.buttons[i].pressed = v >= 1; };
    return {
      keys, bridge,
      lt: (v) => hold(6, v), rt: (v) => hold(7, v),
      step: () => { bridge.poll(); return { lt: !!keys.KeyT, rt: !!keys.KeyR }; },
    };
  }

  describe('两根扳机两个数（切片32：重击与蓄力法术要的不是同一种按法）', () => {
    it('出厂两格相等，而且算出来的迟滞仍然是切片22 那一对 0.5 / 0.35（没拧过的玩家手感一字不变）', () => {
      expect(PAD.leftTriggerDepth, '拆格不该顺手改默认手感').toBe(0.5);
      expect(PAD.rightTriggerDepth).toBe(0.5);
      expect(PAD.leftTriggerDepth * PAD.triggerReleaseFactor).toBe(0.35);
      expect(PAD.rightTriggerDepth * PAD.triggerReleaseFactor).toBe(0.35);
    });

    it('RT 拧浅、LT 拧深：同一 0.35 那一推只出重击，蓄力法术不起手', () => {
      const r = mkTriggers({ rightTriggerDepth: 0.3, leftTriggerDepth: 0.7 });
      r.rt(0.35);
      r.lt(0.35);
      expect(r.step(), 'RT 在 0.3 档下 0.35 该出手').toEqual({ spell: false, heavy: true });
      r.rt(0);
      r.lt(0.75);
      expect(r.step(), 'LT 在 0.7 档下要推到 0.75 才算按住').toEqual({ spell: true, heavy: false });
    });

    it('反手一对：同一份档反过来拧，0.35 那一推就变成"蓄力起手、重击没按"', () => {
      // 上面那条若把两枚按钮的档接反（LT 读成 RT 的那格），只有一条断言会红 —— 这条把方向钉死
      const r = mkTriggers({ rightTriggerDepth: 0.7, leftTriggerDepth: 0.3 });
      r.rt(0.35);
      r.lt(0.35);
      expect(r.step()).toEqual({ spell: true, heavy: false });
    });

    it('迟滞各跟各的档：同一处回落只松开拧浅的那枚，另一枚还在按着', () => {
      const r = mkTwoLevelTriggers({ leftTriggerDepth: 0.9, rightTriggerDepth: 0.4 });
      r.lt(0.95); r.rt(0.95);
      expect(r.step()).toEqual({ lt: true, rt: true });
      r.lt(0.65); r.rt(0.65);                          // 两枚都退到 0.65
      expect(r.step(), '0.65 在 LT 的 0.9×0.7=0.63 之上、也在 RT 的 0.4×0.7=0.28 之上')
        .toEqual({ lt: true, rt: true });
      r.lt(0.6); r.rt(0.3);
      expect(r.step(), '只有 LT 退到自己的线以下：RT 的下沿是 0.28，还远着呢')
        .toEqual({ lt: false, rt: true });
      r.rt(0.2);
      expect(r.step(), 'RT 退到 0.28 以下才算松').toEqual({ lt: false, rt: false });
    });

    it('捕获那一路也按各自那枚的深度：同一 0.4 在浅档被抓到、在深档不算按下', () => {
      const pad = makePad();
      const found = [];
      const bridge = new GamepadInput({ keys: {} }, {
        ltHold: { action: 'ltHold', mode: 'level', button: 'leftTrigger' },
        rtHold: { action: 'rtHold', mode: 'edge', button: 'rightTrigger' },
      }, () => [pad], () => null);
      bridge.setTuning({ leftTriggerDepth: 0.9, rightTriggerDepth: 0.3 });
      bridge.startCapture((name) => found.push(name));
      // 0.4 这一推是**挑过的**：在 RT 自己那档 0.3 之上、在出厂那档 0.5 之下 —— 拿 0.5 来推就
      // 分不出"读的是这一枚的深度"还是"读的是全局那一档"（变异探针 M3 就这么绿过去的）
      pad.buttons[7].value = 0.4;                      // RT 浅档：0.4 够深
      bridge.poll();
      pad.buttons[7].value = 0;
      bridge.poll();
      expect(found, 'RT 那一枚在自己的档上算按下，该被抓到').toEqual(['rightTrigger']);
      bridge.startCapture((name) => found.push(name));
      pad.buttons[6].value = 0.4;                      // LT 深档：同一推量不算碰过
      bridge.poll();
      pad.buttons[6].value = 0;
      bridge.poll();
      expect(found, '半按深档的 LT 不该被捕获成一次改键').toEqual(['rightTrigger']);
    });

    it('数字键不吃扳机那两格：两枚扳机都拧到底，A 键照样跳', () => {
      // 拆格的代价如果落在数字键上，表现是"扳机拧深之后手柄变成哑巴"—— 那是比没旋钮糟得多
      const r = mkTriggers({ leftTriggerDepth: 1, rightTriggerDepth: 1 });
      const a = r.pad.buttons[0];
      a.pressed = true; a.value = 1;
      r.bridge.poll();
      expect(r.keys[codeFor('jump')], 'A 是数字键：它的"深度"不是玩家那两格').toBe(true);
    });

    it('桥读的是"这一枚按钮的深度"，不是全局那一格', () => {
      const bridge = sourceOf('engine/GamepadInput.js');
      expect(bridge, '桥里还在读 `tuning.pressThreshold`：LT/RT 拆格之后它会变成 undefined，'
        + '而 `undefined` 参与比较只会永远为假 —— 表现是扳机按不动').not.toMatch(/tuning\.pressThreshold/);
      expect(bridge, '`_pressed` 的门限参数不再问 `padPressDepth`：哪一枚吃哪一档又要各写一遍')
        .toMatch(/_pressed\([^)]*padPressDepth\(this\.tuning,/);
    });
  });

  it('拔手之后 `sprint` 跟着清：留着就是"松手还在跑"（与 `mag` 同一本账）', () => {
    const pad = makePad();
    const bridge = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, () => [pad]);
    pad.axes[1] = -1;
    bridge.poll();
    expect(bridge.move.sprint).toBe(true);
    pad.connected = false;                              // 直接拔掉：走 `releaseAll` 那一条
    bridge.poll();
    expect(bridge.active).toBe(false);
    expect(bridge.move.sprint).toBe(false);
    expect(bridge.move.mag).toBe(0);
  });

  it('手档是一只复用对象：反复换档不换引用，也不在每帧新建', () => {
    const { bridge } = mkBridge();
    const before = bridge.tuning;
    for (let i = 0; i < 5; i += 1) bridge.setTuning({ deadzone: 0.1 + i / 100 });
    expect(bridge.tuning).toBe(before);
    expect(bridge.tuning.deadzone).toBeCloseTo(0.14, 6);
  });

  it('坏档不会把 NaN 乘进舵量：桥里看到的永远是数', () => {
    const { bridge, pad } = mkBridge({ deadzone: 'abc', analogRange: null, lookCurve: {} });
    pad.axes[0] = 0.8;
    pad.axes[2] = 0.8;
    bridge.poll();
    expect(Number.isFinite(bridge.move.mag)).toBe(true);
    expect(Number.isFinite(bridge.look.x)).toBe(true);
    expect(bridge.tuning).toEqual(padTuning());
  });
});

/* ------------------------------------------------- 存储与面板那三格 */

describe('设置那一格：范围只有一个真源、写进桥只有一条路', () => {
  const real = { localStorage: globalThis.localStorage, window: globalThis.window };
  const install = (values) => {
    const store = new Map(Object.entries(values ?? {}));
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
    globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
    return store;
  };
  afterEach(() => {
    globalThis.localStorage = real.localStorage;
    globalThis.window = real.window;
  });

  it('出厂档直接取自 `PAD`：DEFAULTS 里没有第二份数字', () => {
    install();
    const s = new SettingsManager();
    expect(s.get('padTuning')).toEqual(factoryTuning());
  });

  it('老档缺新格（切片21 加出来的三格）：缺的那几格落到出厂值，玩家拧过的原样保留', () => {
    const store = install();
    store.set('crossrealm_settings', JSON.stringify({
      version: 2, values: { padTuning: { deadzone: 0.06, analogRange: 0.66, lookCurve: 2.2 } },
    }));
    const s = new SettingsManager();
    expect(s.get('padTuning')).toEqual({
      ...factoryTuning(), deadzone: 0.06, analogRange: 0.66, lookCurve: 2.2,
    });
  });

  it('切片32 之前的老档（只有一根 `pressThreshold`）：桥读到的两枚扳机都是那一档', () => {
    // 走的是**真路径**：存储 → `SettingsManager` → `applyToGame` → 桥。救档那条规矩住在
    // `padTuning` 里，而面板回显与推给桥用的是同一个清洗口，所以这里对了两头就都对了
    const store = install();
    store.set('crossrealm_settings', JSON.stringify({
      version: 2, values: { padTuning: { deadzone: 0.1, pressThreshold: 0.25 } },
    }));
    const seen = [];
    new SettingsManager().applyToGame({
      padInput: { setTuning: (raw) => seen.push({ ...padTuning(raw) }) },
    });
    expect(seen[0], '老档那根扳机深度没拆给两枚扳机').toEqual({
      ...factoryTuning(), deadzone: 0.1, leftTriggerDepth: 0.25, rightTriggerDepth: 0.25,
    });
  });

  it('老键在**开机那一步**就没有了：留在包里它就是第二根扳机旋钮', () => {
    // 浅合并会先把"没拧过"抹成出厂值，再靠 `padTuning` 认出老档就来不及了 —— 所以清洗挂在读档。
    // 这一条钉的是那个顺序：读档之后 `pressThreshold` 必须已经不在了，而它那一档已经在两枚新格里
    const store = install();
    store.set('crossrealm_settings', JSON.stringify({
      version: 2, values: { padTuning: { pressThreshold: 0.25, deadzone: 'abc' } },
    }));
    const bag = new SettingsManager().get('padTuning');
    expect('pressThreshold' in bag, '老键还在：下一次 `save()` 会把它原样写回磁盘').toBe(false);
    expect(bag.leftTriggerDepth).toBe(0.25);
    expect(bag.deadzone, '脏值也在读档时回落，不把 "abc" 留在包里等下一次救').toBe(PAD.deadzone);
  });

  it('读档浅拷贝：就地改一次 `data.padTuning` 不许污染出厂默认（切片4 同一课）', () => {
    install();
    const s = new SettingsManager();
    s.data.padTuning.deadzone = 0.39;
    expect(new SettingsManager().get('padTuning').deadzone).toBe(PAD.deadzone);
  });

  it('`applyToGame` 是手档进桥的唯一写入口', () => {
    install();
    const s = new SettingsManager();
    s.set('padTuning', { deadzone: 0.3, analogRange: 0.85, lookCurve: 2 });
    const seen = [];
    s.applyToGame({ padInput: { setTuning: (raw) => seen.push({ ...padTuning(raw) }) } });
    expect(seen).toEqual([{ ...factoryTuning(), deadzone: 0.3, analogRange: 0.85, lookCurve: 2 }]);
  });

  it('桥不在（早期启动 / 没插手柄）也不炸', () => {
    install();
    const s = new SettingsManager();
    expect(() => s.applyToGame({})).not.toThrow();
  });

  it('脏档经面板回显时显示的是清洗后的那一格（不是把 "abc" 摆给玩家看）', () => {
    const store = install();
    store.set('crossrealm_settings', JSON.stringify({
      version: 2, values: { padTuning: { deadzone: 'abc', analogRange: 0.8, lookCurve: 1.2 } },
    }));
    const shown = {};
    const el = (id) => ({
      id, min: '', max: '', step: '', value: '', checked: false,
      listeners: {},
      addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
      fire(type) { (this.listeners[type] ?? []).forEach((fn) => fn({ target: this })); },
    });
    // 滑杆名单从表推（与面板同一个 `padKnobId`）：这里若手抄，加一格就得回来补一次
    const knobs = Object.fromEntries(Object.keys(PAD_TUNING)
      .map((k) => [padKnobId(k), el(padKnobId(k))]));
    const doc = {
      getElementById: (id) => knobs[id] ?? null,
      addEventListener: () => {}, removeEventListener: () => {},
      querySelectorAll: () => [],
    };
    const realDoc = globalThis.document;
    const realWindow = globalThis.window;
    globalThis.document = doc;
    globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
    try {
      const applied = [];
      const game = {
        settings: new SettingsManager(),
        padInput: { setTuning: (raw) => applied.push(padTuning(raw)) },
        dialog: { toast: () => {} },
      };
      new SettingsPanel(game);                          // 构造期就绑滑杆并灌范围
      game.settings.applyToGame(game);
      for (const id of Object.keys(knobs)) {
        expect(knobs[id].min, id).not.toBe('');
        expect(knobs[id].max, id).not.toBe('');
        expect(knobs[id].step, id).not.toBe('');
      }
      // refresh 走的是清洗过的值：坏的那一格显示出厂、另外两格显示玩家的
      knobs['set-deadzone'].value = '';
      shown.deadzone = knobs['set-deadzone'];
      game.settingsPanel = { show() {}, hide() {}, refresh() {} };
      const panel = new SettingsPanel(game);
      panel.refresh();
      expect(Number(knobs['set-deadzone'].value)).toBe(PAD.deadzone);
      expect(Number(knobs['set-analog-range'].value)).toBe(0.8);
      expect(applied.at(-1)).toEqual(padTuning({ deadzone: PAD.deadzone, analogRange: 0.8, lookCurve: 1.2 }));
      void shown;
    } finally {
      globalThis.document = realDoc;
      globalThis.window = realWindow;
    }
  });

  it('拖一根滑杆：写进设置、推给桥，且不把另外两根顺手改回去', () => {
    install();
    const slider = {
      value: String(PAD.deadzone), min: '', max: '', step: '',
      listeners: {},
      addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
      fire(type) { (this.listeners[type] ?? []).forEach((fn) => fn({ target: this })); },
    };
    const realDoc = globalThis.document;
    const realWindow = globalThis.window;
    globalThis.document = { getElementById: (id) => (id === 'set-deadzone' ? slider : null) };
    globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
    try {
      const game = {
        settings: new SettingsManager(),
        padInput: { setTuning: () => {} },
        dialog: { toast: () => {} },
      };
      game.settingsPanel = { show() {}, hide() {} };
      const panel = new SettingsPanel(game);
      void panel;
      slider.value = '0.05';
      slider.fire('input');
      expect(game.settings.get('padTuning')).toEqual({ ...factoryTuning(), deadzone: 0.05 });
    } finally {
      globalThis.document = realDoc;
      globalThis.window = realWindow;
    }
  });
});

/* ------------------------------------------------------- 静态门禁 */

describe('静态门禁：一处范围、一处写入口、桥只读自己的手档', () => {
/**
 * 同样"量程由表灌进壳页"但**不属于手柄手感**的滑杆（W-D6 切片7 起：鼠标镜头灵敏度）。
 *
 * 为什么显式点名而不是放宽那条扫描：这一族名单多一格就得在这里点一次名，
 * 否则"壳页里多一个没人认的旋钮"就不再报错 —— 而那正是这条不变式要防的事
 * （漏一格 = 拖不动，多一格 = 没人认，两者都不会抛，只会静静地不合预期）。
 */
const TABLE_FED_SLIDERS = Object.freeze(['set-look-sensitivity']);

  it('滑杆的范围只写在 `PAD_TUNING`：壳页里那些"旋钮格"不许带 min/max/step，而且与表**双向**对上', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    const free = [];                                   // 没写范围的滑杆 = 由表灌范围的那一格
    for (const m of html.matchAll(/<input id="([^"]+)" type="range"([^>]*?)\/>/g)) {
      if (!/\b(min|max|step)=/.test(m[2])) free.push(m[1]);
    }
    const fromTable = [...Object.keys(PAD_TUNING).map(padKnobId), ...TABLE_FED_SLIDERS];
    expect([...free].sort(), '壳页与 `PAD_TUNING` 不再是同一份名单（漏一格 = 拖不动，多一格 = 没人认）')
      .toEqual([...fromTable].sort());
    // 每一格都真的有一行 `<label>名称 <input .../></label>`：没有名字的滑杆玩家不知道它管什么。
    // 名字可以直接写在标签里，也可以包在 i18n 的 `<span data-i18n>` 里（W-D2 切片2 起）——
    // 两种形态都必须真的带名字。
    const NAMED_SLIDER = /<label>(?:<span[^>]*>)?[^<\s][^<]*?(?:<\/span>)?\s*<input/;
    for (const id of fromTable) {
      const line = html.split('\n').find((l) => l.includes(`id="${id}"`));
      expect(line, `${id} 不在了`).toBeTruthy();
      expect(line, `${id} 那一行没有中文名`).toMatch(NAMED_SLIDER);
    }
    // 反向控制：把死区那一格的名字掏空（span 里什么都不剩），这条扫描必须立刻红 —— 防"正则一坏就永远通过"
    const hollow = html.replace(/(<span data-i18n="settings_deadzone">)[^<]+/, '$1');
    expect(hollow, '掏空那一格的替换没生效（反向控制的前提）').not.toBe(html);
    const hollowLine = hollow.split('\n').find((l) => l.includes('id="set-deadzone"'));
    expect(hollowLine, '掏空之后那一行找不到了').toBeTruthy();
    expect(hollowLine, '名字空了这条扫描却没红').not.toMatch(NAMED_SLIDER);
  });

  it('手档进桥只有一条路：`setTuning(` 的定义在桥里，唯一的调用点在 `SettingsManager`', () => {
    const calls = FILES.filter((f) => /\.setTuning\(/.test(f.source)).map((f) => f.name);
    expect(calls).toEqual(['core/SettingsManager.js']);
    const bridge = sourceOf('engine/GamepadInput.js');
    expect(bridge).toMatch(/\n {2}setTuning\(raw = \{\}\)\s*\{/);
    expect((bridge.match(/padTuning\(/g) || []).length, '清洗至少要走一次（默认 + 换档）').toBeGreaterThanOrEqual(2);
  });

  it('旋钮的读取点只问手档：`PAD.<旋钮名>` 在 `src/` 里只许出现在出厂表自己那一格', () => {
    // 这一条是切片21 的重点。热路径绕过手档 = 玩家滑杆白拖，而"白拖"不会报错：
    // 表现是"我明明调了，手感没变"（B47 那一族：显示与行为各说各话）。
    for (const key of Object.keys(PAD_TUNING)) {
      const re = new RegExp(`PAD\\.${key}\\b`);
      const readers = FILES.filter((f) => f.name !== 'content/keybinds.js' && re.test(f.source)).map((f) => f.name);
      expect(readers, `这些地方还在读出厂值 PAD.${key}（手档改了它们不跟）`).toEqual([]);
    }
  });

  it('桥里每一格旋钮都真的读了自己的手档字段（"没读常量"不等于"读了手档"）', () => {
    const bridge = sourceOf('engine/GamepadInput.js');
    const keybinds = sourceOf('content/keybinds.js');
    /* 扳机那两格是**唯一**经 `padPressDepth` 读的：桥按按钮序号扫一遍，"哪一枚吃哪一档"若写在桥里
     * 就是三个调用点各分叉一次。除此之外的每一格仍要桥自己 `this.tuning.<key>` 直读 ——
     * 名单写死在这里，以后加一格想走"间接读"这条后门，得先在这里挂号，不能悄悄走。 */
    const viaDepthResolver = ['leftTriggerDepth', 'rightTriggerDepth'];
    for (const key of Object.keys(PAD_TUNING)) {
      if (viaDepthResolver.includes(key)) {
        expect(keybinds, `${key} 没被 padPressDepth 读：拆格白拆了`).toMatch(new RegExp(`tuning\\.${key}\\b`));
        expect(bridge, '桥没把整份手档交给 `padPressDepth`：它读的还是别的那一格')
          .toContain('padPressDepth(this.tuning, ');
        continue;
      }
      expect(bridge, `桥里没有 this.tuning.${key}`).toContain(`this.tuning.${key}`);
    }
    // `_analogMagnitude` 不许再留出厂默认参数：那是在手档之外藏的第二个值，漏传一格不会报错
    expect(bridge).toMatch(/function _analogMagnitude\(mag, deadzone, range\)/);
  });

  it('扳机那两档只有一条判据：`_pressed(` 每个调用点喂满四个参数，第三参数问 `padPressDepth`', () => {
    // 切片21 那条"helper 不许自带出厂值"的规矩搬到扳机上：这里少喂一个参数不会报错 ——
    // `undefined` 参与比较只会永远为假，表现是"扳机按不动"，而按不动的排查方向是手柄，不是桥
    const bridge = sourceOf('engine/GamepadInput.js');
    const calls = callArgs(bridge, '_pressed');
    expect(calls.length, '桥里一个 `_pressed` 调用点也没有').toBeGreaterThanOrEqual(4);
    for (const args of calls) {
      expect(args, `_pressed(${args.join(', ')}) 的参数不足四个`).toHaveLength(4);
      // 深度必须是"这一枚按钮的深度"：又是全局那一格的话，LT / RT 重新变成一个旋钮
      expect(args[2], `_pressed 第三参数不是 padPressDepth(...)：${args[2]}`)
        .toMatch(/^padPressDepth\(this\.tuning, .+\)$/);
    }
    // 迟滞确实是"这一格的系数倍"，不是又一个绝对值：式子只许长这样
    expect(bridge).toContain('press * factor');
    expect(bridge, '松开那一格又写回绝对值了：门限拧低时它会高于进入门限').not.toMatch(/wasDown \? 0\./);
    // 定义里不许留默认参数：那等于在调用方之外藏第二个值，漏喂时不会报错，只会悄悄用默认那档
    expect(bridge, '_pressed 的定义里不许有带默认值的参数').toMatch(/function _pressed\(btn, wasDown, press, factor\) \{/);
  });

  it('`releaseThreshold` 那一格真的没了：出厂表里没有它，`src/` 里也没人读它', () => {
    // 一个已经删掉的字段留在表里 = 面板与行为会各自指着不同的"那一格"（B47 那一族）。
    // 表里没定义 + 源码没人读，两头一起钉，才不许它悄悄回来当第二个真源
    expect(PAD.releaseThreshold, '出厂表里还留着 `releaseThreshold`：迟滞现在是扳机那两档的系数').toBeUndefined();
    const readers = FILES.filter((f) => /PAD\.releaseThreshold\b/.test(f.source)).map((f) => f.name);
    expect(readers, '这些地方还在读一个已经不存在的字段（读到的永远是 undefined）').toEqual([]);
  });

  it('一格旋钮只有一个名字：面板不抄滑杆名单，id 从键名推', () => {
    const panel = sourceOf('ui/SettingsPanel.js');
    expect(panel, '面板里手抄了一格滑杆 id：加旋钮时会漏抄，而漏抄的表现是"拖不动"不是报错')
      .not.toMatch(/knob\('set-/);
    expect(panel, '面板没按 `PAD_TUNING` 画滑杆').toContain('for (const key of Object.keys(PAD_TUNING)) knob(key);');
    expect(panel, '回显没按 `PAD_TUNING` 走').toContain('for (const key of Object.keys(PAD_TUNING)) set(padKnobId(key), t[key]);');
    // 切片15 那三根的 id 一个字没改：玩家档、壳页、说明书都指着它们
    expect(['deadzone', 'analogRange', 'lookCurve'].map(padKnobId))
      .toEqual(['set-deadzone', 'set-analog-range', 'set-look-curve']);
  });

  it('桥是最后建起来的消费者：手档必须在它建好之后再走一次 applyToGame', () => {
    // 少了这一次，开机读到的手档会静静躺在存储里 —— 玩家要打开设置面板再关掉才生效
    const game = sourceOf('core/Game.js');
    const made = game.indexOf('this.padInput = new GamepadInput(');
    expect(made).toBeGreaterThanOrEqual(0);
    // 位置要贴着桥的构造：往后翻整个文件去找"某一次 applyToGame"不叫证明桥拿到了手档。
    // 窗口 700 → 1200 是因为切片17 的震动登记（`new Rumble` + `setImpactSink`）插在中间 ——
    // 贴着桥是这条门禁的本意，中间多一段初始化不算破约；但**再远就不行了**，所以仍然有上限
    const window = game.slice(made, made + 1200);
    expect(window, '桥建好之后没人把设置推给它（手档会在开机时丢掉）')
      .toContain('this.settings.applyToGame(this);');
  });

  it('滑杆写进存储之前先过 `padTuning`：脏值不许先落盘再指望读的时候救', () => {
    const panel = sourceOf('ui/SettingsPanel.js');
    expect((panel.match(/s\.set\('padTuning', padTuning\(/g) || []).length).toBe(1);
  });

  it('三根滑杆之后仍然在 `nav` 清单里走得到（切片11 的焦点覆盖到它们）', () => {
    // 面板收焦点那条门禁在 `focus-nav` 里逐行查；这里只钉住"手档滑杆也走 `navItems` 那条选择器"
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toMatch(/<input id="set-deadzone" type="range" \/>/);
    expect(html).toMatch(/id="settings-panel" class="overlay-panel/);
  });
});

/* ------------------------------------- 端到端：改档之后真的手感不同 */

describe('真玩家身上：同一舵量，改档前后走得不一样的就是那两米', () => {
  const walked = (tuning, push = 1) => {
    const pad = makePad();
    const bridge = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, () => [pad]);
    bridge.setTuning(tuning);
    const p = makePlayer({});
    pad.axes[0] = 0;
    pad.axes[1] = -push;                               // 向前推 push 那么多
    const dt = 1 / 60;
    let x = 0;
    let z = 0;
    for (let i = 0; i < 60; i += 1) {
      bridge.poll();
      const keys = {};
      for (const [code, down] of Object.entries(bridge.keys ?? {})) keys[code] = down;
      runFrames(p, dt, dt, keys, bridge.move);
      x = p.position.x; z = p.position.z;
    }
    return { x: +x.toFixed(2), z: +z.toFixed(2), mag: bridge.move.mag };
  };

  it('出厂档：满推一秒会进入疾走那一档（`moveSprintThreshold` 说的就是"推到底"）', () => {
    const got = walked({});
    expect(got.mag).toBeCloseTo(1, 6);
    expect(Math.abs(got.z)).toBeGreaterThan(20);
  });

  it('冲刺触发深度拧松一档：同一推量从"走"变成"跑"（滑杆改的是位移，不只是数字）', () => {
    const push = 0.65;                        // 重映射后 ≈0.606：出厂门槛 0.9 之下 → 走
    const strict = walked({}, push);
    const loose = walked({ moveSprintThreshold: 0.5 }, push);
    expect(strict.mag).toBeGreaterThan(0);
    expect(strict.mag).toBeCloseTo(loose.mag, 9);        // 走路那一档不该被这格碰
    // 疾走倍率 1.85：留一半余量（起步那几帧还在加速）
    expect(Math.abs(loose.z)).toBeGreaterThan(Math.abs(strict.z) * 1.4);
  });

  it('死区抬高一档之后，同一推量走得更慢；而满推仍然满速（下沿变了，端点没变）', () => {
    const full = walked({}, 0.5);
    const soft = walked({ deadzone: 0.3 }, 0.5);
    expect(Math.abs(soft.z)).toBeLessThan(Math.abs(full.z));
    // 端点不弯：满推在两种死区下都到疾走那一档
    expect(Math.abs(walked({ deadzone: 0.3 }).z)).toBeCloseTo(Math.abs(walked({}).z), 1);
  });

  it('量程调到 0.7：推七成就算推到底（够不到头的人也能冲刺）', () => {
    const pad = makePad();
    const a = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, () => [pad]);
    const b = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, () => [pad]);
    b.setTuning({ analogRange: 0.7 });
    pad.axes[1] = -0.7;
    pad.axes[0] = 0;
    a.poll();
    b.poll();
    expect(a.move.mag).toBeLessThan(1);
    expect(b.move.mag).toBeCloseTo(1, 6);
  });
});
