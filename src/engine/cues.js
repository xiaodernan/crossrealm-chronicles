/**
 * 字幕线索的派发咽喉（W-D6 切片8）。
 *
 * ## 为什么要有这一层，而不是在调用点直接 `audio.x()`
 * 改前的形状是 gameplay 代码直接摸音频：`this.audio?.gearDrop(rank)`。
 * 这条路上**只有一个消费者**（喇叭）。字幕要的是同一件事的第二个消费者，
 * 于是只有两种接法：① 每个调用点写两行（一行播声音、一行弹字幕），
 * ② 把"发生了什么"本身变成事件，声音和字幕都去听它。
 *
 * 选 ②。选 ① 的代价不是多一行代码，而是**两行会漂移**：将来加第三种治疗来源那样的
 * 新调用点时，抄了一行漏一行不会报错，症状只是"有声音没字幕"或"有字幕没声音"，
 * 而两条路都在生产代码里，没有任何一门测试能替你发现。选 ② 之后，
 * "这个线索发什么声音"只剩 `CUE_CATALOG` 里那一格（`sound`），加线索 = 加一格 + 换一个调用。
 *
 * 附带的好处：**把音频静音的玩家也看得到字幕**。如果反过来让音频层去发字幕，
 * 静音的人就什么都没有了 —— 而那正是最需要字幕的人。
 *
 * ## 名字校验
 * `cueOf()` 对表外名字当场抛错（B71 口径）。调用点把 `'gearDrop'` 打成 `'gearDorp'`
 * 的症状是启动即炸，不是"那条字幕永远不出现"。
 */

import { emit } from './EventBus.js';
import { cueOf } from '../content/captions.js';

/**
 * 派发一条字幕线索。
 *
 * @param {string} name  `CUE_CATALOG` 里的线索 id，表外名字当场抛
 * @param {object} [data] 这条线索带的数（字幕插值与音效参数都从这里取）。
 *   例如 `emitCue('gearDrop', { rank: 2, rarity: '稀有' })`。
 *   不传就是纯信号 —— 字幕与音效都按"无参数"那一支走。
 * @returns {{ cue: string, data: object }} 真派发出去的那一份（方便测试断言，也方便链式读）
 */
export function emitCue(name, data = {}) {
  cueOf(name);   // 只为校验：认不出的名字在这里就炸，不会走到派发那一步
  const payload = { cue: name, data: data ?? {} };
  emit('game-cue', payload);
  return payload;
}
