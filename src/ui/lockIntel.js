/**
 * 锁定条上的战斗情报（W-G1 切片1）。
 *
 * ## 这一片补的是什么
 *
 * W-F1 把图鉴做成了**只读档案**：能看见每种敌人长什么样、血量多少、怕什么 ——
 * 但那是"翻书翻出来的"，与正在打的这一只没有关系。图鉴进度因此没有玩法回报：
 * 研究满一整页，战斗里一点感觉都没有。
 *
 * 这一片把那条线接上：**锁定一只敌人时，HUD 直接把它的属性相性写在名字下面** ——
 * 但只有**研究过**（≥ 5 杀）的那些才给。
 *
 * ## 为什么门槛是"已研究"而不是"见过"
 *
 * 见过一次只能说明"我认得它长什么样"，不能说明"我知道它怕冰"。
 * 五只这个数来自 `BESTIARY_TIERS` 的 `studied` 档 —— **不在这里另抄一个数**：
 * 门槛用档位下标表达（`INTEL_TIER_INDEX`），档位阈值改了这里自动跟着走。
 *
 * ## 为什么情报从 `entryOf` 来而不是自己查表
 *
 * `BestiarySystem.entryOf(type)` 已经把"这一类的相性"算好了，而且是那套符号约定
 * （负数 = 更吃这一系）的**唯一解释处**。这里再查一次 `ENEMY_RESIST` 等于开第二份解释，
 * 两份迟早对不上。所以本模块只做一件事：**把记录翻译成 UI 能直接写的三段文本素材**。
 */
import { bestiaryAffinity, BESTIARY_TIERS } from '../content/bestiary.js';

/**
 * 情报门槛：`BESTIARY_TIERS` 里的下标。
 * 0 = sighted（见过）/ 1 = studied（研究过）/ 2 = mastered（精通）。
 * 用下标而不是写死 5：档位阈值是内容，改在那里改。
 */
export const INTEL_TIER_INDEX = 1;

/**
 * 门槛的**击杀数**，供"还没解锁"那一句现算文案用（"研究 ${n} 次解锁"）。
 *
 * 同样不写死：它是上面那个下标在档位表里的取值。改档位阈值 → 这一句跟着变，
 * 而 HUD 与文案都不需要动。
 */
export const INTEL_KILLS = BESTIARY_TIERS[INTEL_TIER_INDEX].kills;

/**
 * 把一条图鉴记录翻译成锁定条要的三段素材。
 *
 * 返回 `{ known, weak, resist }`：
 * - `known` 为假时 `weak`/`resist` 都是 null（UI 显示"未知"那一句）；
 * - `weak` / `resist` 各是 `{ id, label, pct }` 或 null —— `pct` 是**正整数百分比**，
 *   符号已经在字段名里表达完了（"怕 25%"而不是"怕 -25%"）；
 *   `label` 是**文案键**（`bestiary_elem_*`），和 `BESTIARY_ELEMENTS` 同名字段同义，
 *   由 UI 在写 DOM 的那一刻 `t()` 展开 —— 这里不展开，否则换语言时这一格会是旧语言。
 *
 * 没有 `entry`（不是名册里的类型，比如 Boss 的 `type` 是 `'boss'`）时也回 `known:false`
 * —— 那条路不该在 HUD 上抛错，锁定条是每帧都在画的东西。
 */
export function lockIntelOf(entry) {
  if (!entry || !Number.isFinite(entry.tierIndex) || entry.tierIndex < INTEL_TIER_INDEX) {
    return { known: false, weak: null, resist: null };
  }
  const { weak, resist } = entry.affinity ?? bestiaryAffinity(entry.type);
  return {
    known: true,
    weak: weak ? { id: weak.id, label: weak.label, pct: Math.round(Math.abs(weak.value) * 100) } : null,
    resist: resist ? { id: resist.id, label: resist.label, pct: Math.round(resist.value * 100) } : null,
  };
}
