/** 营火对话扩写层 — 合并到 RestDialogue 主树 */
export function mergeRestDialogueNodes(base) {
  const out = structuredClone(base);
  const add = (zone, nodeId, node) => {
    if (!out[zone]?.nodes) return;
    out[zone].nodes[nodeId] = node;
  };

  add('hub', 'gallery', {
    speaker: '锚火看守',
    text: '「日志 [J] 里新增了 **CG画廊** — 营火分支与 Boss 击破都会留下插画。收藏 ★ 后可在灯箱放大。」',
    journal: { id: 'rest-hub-gallery', title: '营火·CG画廊', text: 'J 键日志可查看已解锁 CG。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('hub', 'style', {
    speaker: '锚火看守',
    text: '「弹反、连击终结、处决都会累积 **战斗风格** — 右上角会闪评级。别只砍，要打得漂亮。」',
    choices: [{ label: '明白了', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('hub', 'rematch', {
    speaker: '锚火看守',
    mood: 'warn',
    text: '「击败过的 Boss 可在信标处 **再战** — 按 E 召唤。再战不会推进主线，但会补魂火与 CG。」',
    journal: { id: 'rest-hub-rematch', title: '营火·Boss再战', text: '已击败 Boss 的信标可 E 再战。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
    minChapter: 2,
  });

  if (out.hub?.nodes?.start?.choices) {
    out.hub.nodes.start.choices.splice(2, 0,
      { label: 'CG 画廊在哪？', next: 'gallery' },
      { label: '战斗风格是什么？', next: 'style' },
      { label: 'Boss 能再打吗？', next: 'rematch', minChapter: 2 },
    );
  }

  add('fantasy', 'wisp', {
    speaker: '精灵斥候',
    text: '「森林里有 **魂火萤** — 靠近会飘向营火。攒够魂火在升级面板点属性。」',
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('fantasy', 'journal', {
    speaker: '精灵斥候',
    text: '「营火对话会进日志 [J] 的 **营火** 分类。碎片在迷宫石碑 — 别漏读。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  if (out.fantasy?.nodes?.start?.choices) {
    out.fantasy.nodes.start.choices.push(
      { label: '魂火萤？', next: 'wisp' },
      { label: '日志怎么用？', next: 'journal' },
    );
  }

  add('magic', 'cg', {
    speaker: '奥术旅者',
    text: '「大奥术师击破时会解锁 **战斗 CG** — 紫焰与慢镜头，值得收藏。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  add('magic', 'codex', {
    speaker: '奥术旅者',
    text: '「禁书残页散在迷宫 — 集齐会在日志 **秘典** Tab 显示位面 lore。」',
    journal: { id: 'rest-magic-codex', title: '营火·秘典', text: 'J 键秘典 Tab 收录位面 lore。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  if (out.magic?.nodes?.start?.choices) {
    out.magic.nodes.start.choices.push(
      { label: 'CG 收藏？', next: 'cg' },
      { label: '秘典是什么？', next: 'codex' },
    );
  }

  add('space', 'photo', {
    speaker: '宇航员回声',
    text: '「荒原的引力透镜很适合拍照 — **F2** 隐藏 UI 截屏。Boss 击破慢镜头时按 Esc 可跳过。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  add('space', 'rematch', {
    speaker: '宇航员回声',
    mood: 'warn',
    text: '「奇点领主信标在东 — 击败后可 E 再战练轨道弹幕。再战 +15 魂火。」',
    choices: [{ label: '休息', action: 'rest' }],
    minChapter: 3,
  });
  if (out.space?.nodes?.start?.choices) {
    out.space.nodes.start.choices.push(
      { label: '拍照模式？', next: 'photo' },
      { label: 'Boss 再战？', next: 'rematch', minChapter: 3 },
    );
  }

  add('void', 'skip', {
    speaker: '时线残影',
    text: '「处决与终结慢镜头中按 **Esc** 可跳过 — 第一次会提示。别在教程关急着跳。」',
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('void', 'memory', {
    speaker: '时线残影',
    text: '「每次在营火选「休息」都会写入 **营火记忆** — J 键可回顾你睡过哪些火。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  if (out.void?.nodes?.start?.choices) {
    out.void.nodes.start.choices.push(
      { label: 'Esc 跳过演出？', next: 'skip' },
      { label: '营火记忆？', next: 'memory' },
    );
  }

  add('abyss', 'achieve', {
    speaker: '裂隙引路人',
    text: '「日志 [J] 的 **成就** Tab 追踪弹反、连击、Boss — 全收集有魂火奖励。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  add('abyss', 'legend', {
    speaker: '裂隙引路人',
    mood: 'warn',
    text: '「终局之后仍可再战混沌领主 — 信标 E 召唤。这是证明你仍是位面行者的最后仪式。」',
    journal: { id: 'rest-abyss-legend', title: '营火·终局仪式', text: 'Ch5 后可在信标再战混沌领主。' },
    choices: [{ label: '休息', action: 'rest' }],
    minChapter: 5,
  });
  if (out.abyss?.nodes?.start?.choices) {
    out.abyss.nodes.start.choices.push(
      { label: '成就墙？', next: 'achieve' },
      { label: '终局后再战？', next: 'legend', minChapter: 5 },
    );
  }

  return out;
}
