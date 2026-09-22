/** 营火对话 — 魔法学院 / 星际 / 逆相界致敬分支 */
import { mergeRestDialoguePopCultureWave2 } from './RestDialoguePopCultureWave2.js';
import { mergeRestDialoguePopCultureWave3 } from './RestDialoguePopCultureWave3.js';
import { mergeRestDialoguePopCultureWave4 } from './RestDialoguePopCultureWave4.js';

export function mergeRestDialoguePopCulture(base) {
  return mergeRestDialoguePopCultureWave4(
    mergeRestDialoguePopCultureWave3(
      mergeRestDialoguePopCultureWave2(_mergeRestDialoguePopCultureBase(base))
    )
  );
}

function _mergeRestDialoguePopCultureBase(base) {
  const out = structuredClone(base);
  const add = (zone, nodeId, node) => {
    if (!out[zone]?.nodes) return;
    out[zone].nodes[nodeId] = node;
  };

  add('magic', 'wizard', {
    speaker: '奥术旅者',
    text: '「悬浮咒术学院 — 蜡烛会自己飞，楼梯爱换方向。别在禁林里追会发光的眼睛。」',
    journal: { id: 'rest-magic-wizard', title: '营火·咒术学院', text: '魔法遗境致敬魔法学院母题。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('magic', 'broom', {
    speaker: '奥术旅者',
    text: '「飞天环赛看台还在 — 三根金环。没人骑扫帚了，但魂火萤仍会绕着环飞。」',
    choices: [{ label: '休息', action: 'rest' }],
  });

  add('space', 'interstellar', {
    speaker: '宇航员回声',
    text: '「坚韧号的日志、米勒的沙漏、墨菲的书架 — 都是同一条方程的不同项。\n\n爱能跨越时间，但翻滚不能。」',
    journal: { id: 'rest-space-inter', title: '营火·星际方程', text: '米勒荒原致敬星际穿越母题。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('space', 'stay', {
    speaker: '宇航员回声',
    text: '「书架上有人用引力写字 — 像在说 Stay。别问我那是谁，问五维_tesseract。」',
    choices: [{ label: '休息', action: 'rest' }],
  });

  add('void', 'upside', {
    speaker: '时线残影',
    text: '「逆相界裂口在时线北边 — 红色孢子、旧电台、80 年代霓虹。\n\n裂隙猎犬的爪印别在夜里追。」',
    journal: { id: 'rest-void-upside', title: '营火·逆相界', text: '破碎时线致敬 80 年代逆相界母题。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('void', 'radio', {
    speaker: '时线残影',
    text: '「广播塔还在播 1983 年的歌 — 你听见的是 SOS，不是怀旧。」',
    choices: [{ label: '休息', action: 'rest' }],
  });

  add('fantasy', 'lotr', {
    speaker: '精灵斥候',
    text: '「至尊石环的铭文改了词 — One Realm to bind them all。指环已碎，石环仍在。」',
    choices: [{ label: '休息', action: 'rest' }],
  });

  add('hub', 'echoes', {
    speaker: '锚火看守',
    text: '「枢纽东侧有 **位面海报墙** — 六张褪色海报。\n\nJ 键 → **次元回声** 记录你共鸣过的致敬点。」',
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });

  if (out.magic?.nodes?.start?.choices) {
    out.magic.nodes.start.choices.push(
      { label: '咒术学院？', next: 'wizard' },
      { label: '飞天环赛？', next: 'broom' },
    );
  }
  if (out.space?.nodes?.start?.choices) {
    out.space.nodes.start.choices.push(
      { label: '星际方程？', next: 'interstellar' },
      { label: 'Stay 书架？', next: 'stay' },
    );
  }
  if (out.void?.nodes?.start?.choices) {
    out.void.nodes.start.choices.push(
      { label: '逆相界？', next: 'upside' },
      { label: '旧电台？', next: 'radio' },
    );
  }
  if (out.fantasy?.nodes?.start?.choices) {
    out.fantasy.nodes.start.choices.push({ label: '石环铭文？', next: 'lotr' });
  }
  if (out.hub?.nodes?.start?.choices) {
    out.hub.nodes.start.choices.push({ label: '次元回声？', next: 'echoes' });
  }

  return out;
}
