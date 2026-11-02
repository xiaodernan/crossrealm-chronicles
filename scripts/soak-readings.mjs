/**
 * 稳定性浸泡（`npm run soak`）的**判据** —— W-E2 切片2。
 *
 * ## 这一片在还哪笔账
 *
 * §1.4 的稳定性验收只有一句话：「连续游玩 30 分钟，`renderer.info` 三项零增长；无未捕获异常」。
 * 它至今**没有任何机器在量**：`perf-smoke` 只看两站各 240 帧（四秒游戏时间）的价，
 * `e2e-clear` 只看主线走不走得通（而且它刻意不渲染 —— 渲染价归 perf），于是 B94 台账里
 * 那句"30 分钟长跑待真机复测"从 2026-10-06 一直挂到今天。这一片把"跑满三十分钟、
 * 资源账不涨"变成一条能红能绿的读数。
 *
 * ## 判据与执行分家（W-D4 切片3 的同一把尺）
 *
 * `scripts/soak.mjs` 是**导入即执行**的（顶层就起 vite 与 Chrome），门禁不能 import 它。
 * 所以"什么算一次合格的浸泡读数"住在这里：参数解析、行程计划、快照形状、增长判定、
 * 覆盖判定。执行端只负责把计划跑完、把数交出来，**不自己发明判据** ——
 * `perf-budgets.mjs` / `harness-readings.mjs` 之于两个 harness 是同一条纪律。
 *
 * ## 几个口径，先写死在这里
 *
 * - **零增长 = 严格大于就红**：`geometries` / `textures` / `programs`（`renderer.info.programs.length`）
 *   三项，终局比基线多一条就红。缩减不判红（可能是合法释放），日志里如实打印差值。
 *   唯一的例外是**程序族**：三条的键若与基线某条只差一个场景构成位（光照条数 / 阴影类型
 *   这类小整数），它是同一族材质在另一档光照下的兄弟，不是新族 —— 见 `programFamilyProblem`。
 *   原始条数与族数两列都打进日志，判据按族计。
 * - **热身不算游玩**：热身圈按同一条路线跑一遍，负责把"首次入画"的缓存推到稳态；
 *   基线取在热身之后。`--minutes` 量的是**热身之后**的游玩时长 —— 验收那句的主语是"游玩"。
 *   镜头覆盖不到的静物由基线落定时的一次**全场首绘**补上（六向大锥各画一帧）：
 *   `renderer.info` 记的是上传缓存，首次入画才上传，"这回镜头转到了它"不是泄漏。
 * - **覆盖自证**：帧数、每站访问次数、Boss 场停留次数、击杀数都得对上计划。
 *   否则"这一轮跑完了"只是一句日志，短样本上的零增长可以永远绿。
 * - **异常 0 条是预算**：与 perf / e2e 同一口径。
 */

/** 验收那句话里点名的三项（`renderer.info` 的三本账），顺序即日志顺序 */
export const SOAK_COLUMNS = Object.freeze(['geometries', 'textures', 'programs']);

/** 模拟游玩的固定步长：执行端把 `clock.getDelta` 钉成 1/60，一秒游戏时间 = 60 帧 */
export const SOAK_FPS = 60;

export const SOAK_DEFAULTS = Object.freeze({
  /** 热身之后的**游玩**时长（分钟）—— 验收句子的主语 */
  minutes: 30,
  /** 游玩段分几圈跑；每圈 = 全部站点 + 全部 Boss 场各停一次 */
  laps: 3,
  /**
   * 每隔多少帧真渲染一次。软渲染一帧 80–900ms（perf 台账），逐帧渲染会把 30 分钟
   * 拉成几小时；而泄漏是按"每帧/每次入画"线性攒的，抽到一千帧以上就足以判。
   */
  renderEvery: 240,
  /** 单次 CDP 调用里最多推多少帧：进度可读，卡住时能归到具体一段 */
  batchFrames: 900,
});

export const SOAK_BUDGETS = Object.freeze({
  /** 未捕获异常：0 条（与 perf-smoke / e2e 同一预算） */
  exceptions: 0,
  /** 整轮至少杀一只：证明"游玩"里有战斗，而不是一条走路循环 */
  minKills: 1,
});

const 认得的参数 = Object.freeze(['minutes', 'laps', 'render-every', 'batch-frames', 'wall-limit-minutes']);

/**
 * 参数解析。**坏参数当场抛**，绝不静默回落 —— `--minute=2`（少一个 s）回落到 30 分钟
 * 意味着一次本想跑两分钟的校准会占住机器半小时，而日志里只有一句"默认参数"。
 * 只认 `--名字=正整数`，其余形状（空格分隔、小数、负号、大写）一律拒绝。
 */
export function parseSoakArgs(argv = [], defaults = SOAK_DEFAULTS) {
  const 参数 = { ...defaults };
  for (const 原 of argv) {
    const 文 = String(原);
    const 匹 = /^--([a-z][a-z-]*)=(\d+)$/.exec(文);
    if (!匹) {
      throw new Error(`看不懂的参数 "${文}" —— 只认 --名字=正整数（--minutes 2、--minutes=2.5、--Minutes=2 都拒绝：静默回落到 ${defaults.minutes} 分钟比报错更糟）`);
    }
    const 名 = 匹[1];
    if (!认得的参数.includes(名)) {
      throw new Error(`不认识的参数 "--${名}" —— 认得的只有 ${认得的参数.map((k) => `--${k}`).join(' / ')}`);
    }
    const 值 = Number(匹[2]);
    if (!Number.isSafeInteger(值) || 值 <= 0) {
      throw new Error(`参数 "--${名}" 必须是正整数（读到 "${匹[2]}"）`);
    }
    参数[名.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = 值;
  }
  if (参数.laps < 2) {
    throw new Error(`--laps=${参数.laps} 不行：热身之后至少要两圈（一圈没有复现性，和"只跑了一次"分不开）`);
  }
  if (!Number.isSafeInteger(参数.wallLimitMinutes) || 参数.wallLimitMinutes <= 0) {
    参数.wallLimitMinutes = 参数.minutes * 3 + 10;
  }
  return 参数;
}

/**
 * 行程计划：把"跑三十分钟"拆成每一圈、每一站、每一场各推多少帧。
 *
 * 数字全从 `minutes × 60 × SOAK_FPS` 推出来，**不写第二份**。短轮次（校准用的两分钟）
 * 里 Boss 场每场至少 60 帧（一秒游戏时间，够开战与一次出手），长轮次按圈时长的 1/12 均分；
 * 站点预算吃剩下的全部，余数给最后一站 —— 于是 `站帧之和 + 场帧之和 === 圈帧` 逐圈守恒。
 *
 * `游玩帧 = 圈帧 × laps`：验收说的是"三十分钟"，而三十分钟除以圈数除不尽时，
 * 少掉的是不到一圈的零头（< laps 帧），由 `journeyProblem` 按这个计划数对账。
 */
export function planSoak({ minutes, laps, stations, arenas }) {
  if (!Number.isSafeInteger(minutes) || minutes <= 0) throw new Error(`minutes 必须是正整数（读到 ${String(minutes)}）`);
  if (!Number.isSafeInteger(laps) || laps < 2) throw new Error(`laps 必须 ≥ 2（读到 ${String(laps)}）`);
  if (!Array.isArray(stations) || stations.length === 0) throw new Error('站点名单是空的 —— 行程无从排起');
  if (!Array.isArray(arenas)) throw new Error('Boss 场名单不是数组');
  const 目标帧 = minutes * 60 * SOAK_FPS;
  const 圈帧 = Math.floor(目标帧 / laps);
  const 场帧 = arenas.length ? Math.max(60, Math.floor(圈帧 / 12 / arenas.length)) : 0;
  const 站总 = 圈帧 - 场帧 * arenas.length;
  if (站总 < stations.length) {
    throw new Error(`一圈 ${圈帧} 帧扣掉 Boss 场 ${场帧 * arenas.length} 帧之后只剩 ${站总} 帧给 ${stations.length} 站 —— 每站摊不到一帧，把 --minutes 调大`);
  }
  const 站基 = Math.floor(站总 / stations.length);
  const 站余 = 站总 - 站基 * stations.length;
  const 站帧 = stations.map((_, i) => 站基 + (i === stations.length - 1 ? 站余 : 0));
  return Object.freeze({
    minutes,
    laps,
    stations: [...stations],
    arenas: [...arenas],
    /** 热身之后、游记段的总帧数（验收的那三十分钟） */
    游玩帧: 圈帧 * laps,
    圈帧,
    站帧,
    场帧,
    /** 热身圈与游玩圈同一条路线、同样长度 */
    热身帧: 圈帧,
  });
}

/** 快照形状：三项都得是非负整数（`renderer.info` 的账只会给这个） */
export function snapshotProblem(名, 快照) {
  if (!快照 || typeof 快照 !== 'object') {
    return [`${名} 没交出快照（拿到 ${JSON.stringify(快照)}）`];
  }
  const 问 = [];
  for (const 列 of SOAK_COLUMNS) {
    const 值 = 快照[列];
    if (!Number.isSafeInteger(值) || 值 < 0) {
      问.push(`${名} 的 "${列}" 读到 ${String(值)} —— renderer.info 的三项只会给非负整数，这不是一次测量`);
    }
  }
  return 问;
}

/**
 * 程序族：**一条程序键换一档场景构成不算新族**。
 *
 * three 的程序缓存键把光照构成也编进去（numDirLights / numPointLights / … / shadowMapType）。
 * 区域灯让枢纽与魔法区差一盏点光，一次性特效灯再叠一盏 —— 同一批材质因此会在两档光照下
 * 各编一条。2026-10-31 校准18/19 的两条红都是这种兄弟键：咒师长袍（游玩帧 824）与一条
 * LineBasicMaterial（游玩帧 3426），键与基线里某条**只差一个 0..128 的整数位**。
 *
 * 族判据：新键若能在基线里找到**同长度、只差一位、且两边都是小整数**的键，就算同一族；
 * 其余一律算新族并点名。材质参数族（贴图槽、布尔开关、defines）差一位也会被抓住 ——
 * 例外只开给场景构成档位（光照条数这类有界整数），不开给材质本身。
 */
const 小整数位 = (v) => /^\d{1,3}$/.test(String(v)) && Number(v) <= 128;

export function programFamilyProblem(基线键, 终局键) {
  const 基线 = new Set(基线键 || []);
  const 新键 = (终局键 || []).filter((k) => !基线.has(k));
  const 豁免 = [];
  const 未归 = [];
  for (const 键 of 新键) {
    const 新 = String(键).split(',');
    let 兄弟 = null;
    for (const 基 of 基线) {
      const 基分 = String(基).split(',');
      if (基分.length !== 新.length) continue;
      let 位 = -1;
      let 多差 = false;
      for (let i = 0; i < 新.length; i += 1) {
        if (新[i] === 基分[i]) continue;
        if (位 >= 0) {
          多差 = true;
          break;
        }
        位 = i;
      }
      if (多差 || 位 < 0) continue;
      if (!小整数位(新[位]) || !小整数位(基分[位])) continue;
      兄弟 = { 键, 基, 位, 基值: 基分[位], 新值: 新[位] };
      break;
    }
    if (兄弟) 豁免.push(兄弟);
    else 未归.push(键);
  }
  return { 新键: 新键.length, 豁免, 豁免数: 豁免.length, 未归, 未归数: 未归.length };
}

/**
 * 三项零增长判定。**只判增长**：缩减可能是合法的释放路径，不在这里判红，
 * 但执行端会把差值（含负值）打进日志 —— "没涨"与"少了一批东西"不是同一句话。
 *
 * `程序族` 可选传 `{ 基线, 终局 }` 两份程序键列表：programs 涨了时按族复核，
 * 全是同族的场景构成兄弟才放行；键列表与条数对不上本身判红（读数不完整）。
 */
export function growthProblem(基线, 终局, 程序族 = null) {
  const 问 = [...snapshotProblem('基线', 基线), ...snapshotProblem('终局', 终局)];
  if (问.length) return 问;
  for (const 列 of SOAK_COLUMNS) {
    const 差 = 终局[列] - 基线[列];
    if (差 > 0) {
      if (列 === 'programs' && 程序族) {
        const 基键 = (程序族.基线 || []).length;
        const 终键 = (程序族.终局 || []).length;
        if (基键 !== 基线.programs || 终键 !== 终局.programs) {
          问.push(`"programs" 涨了 ${差} 条，但程序键列表与条数对不上（基线 ${基键}/${基线.programs}，终局 ${终键}/${终局.programs}）—— 读数不完整，按泄漏处理`);
          continue;
        }
        const 读 = programFamilyProblem(程序族.基线, 程序族.终局);
        if (读.未归数 > 0) {
          问.push(`"programs" 从 ${基线[列]} 增到 ${终局[列]}（+${差}），其中 ${读.未归数} 条在基线里没有同族（键不止一处差，或差的不是场景构成位）—— 三项零增长是验收线，新族一条就红`);
        }
        continue;
      }
      问.push(`"${列}" 从 ${基线[列]} 增到 ${终局[列]}（+${差}）—— 三项零增长是验收线，热身之后多一条就红`);
    }
  }
  return 问;
}

/**
 * 行程对账：计划说要做的事，这一轮是不是**真的都做了**。
 *
 * 少推帧、少去一站、少停一场、一只没杀 —— 每一条都会让"零增长"这句话失去分母：
 * 跑得越短、打得越少，资源账当然越平。这一条把它们全变成可以点名的红。
 */
export function journeyProblem(计划, 实际) {
  const 问 = [];
  const 游帧 = 实际?.游玩帧;
  if (!Number.isSafeInteger(游帧) || 游帧 !== 计划.游玩帧) {
    问.push(`游玩段推了 ${String(游帧)} 帧，计划 ${计划.游玩帧} 帧 —— 有一批没回来或被跳过，短样本上的"零增长"不算读数`);
  }
  const 热帧 = 实际?.热身帧;
  if (!Number.isSafeInteger(热帧) || 热帧 !== 计划.热身帧) {
    问.push(`热身段推了 ${String(热帧)} 帧，计划 ${计划.热身帧} 帧 —— 热身没跑完，基线不是稳态`);
  }
  for (const id of 计划.stations) {
    const 次 = 实际?.站访问?.[id];
    if (次 !== 计划.laps) {
      问.push(`站点 "${id}" 被访问 ${String(次)} 次，计划 ${计划.laps} 次 —— 有一圈被跳过或重复`);
    }
  }
  const 多 = Object.keys(实际?.站访问 ?? {}).filter((id) => !计划.stations.includes(id));
  if (多.length) {
    问.push(`计划外出现站点访问：${多.join(', ')} —— 路线不是计划里那一条`);
  }
  const 应场 = 计划.laps * 计划.arenas.length;
  if (实际?.场访问 !== 应场) {
    问.push(`Boss 场停留 ${String(实际?.场访问)} 次，计划 ${应场} 次 —— 战斗资源的覆盖面短了`);
  }
  if (!Number.isSafeInteger(实际?.击杀) || 实际.击杀 < SOAK_BUDGETS.minKills) {
    问.push(`整轮只击杀 ${String(实际?.击杀)} 只 —— 这不是"连续游玩"，走路循环抓不到战斗资源`);
  }
  if (!Number.isSafeInteger(实际?.异常) || 实际.异常 > SOAK_BUDGETS.exceptions) {
    问.push(`未捕获异常 ${String(实际?.异常)} 条（预算 ${SOAK_BUDGETS.exceptions}）`);
  }
  return 问;
}
