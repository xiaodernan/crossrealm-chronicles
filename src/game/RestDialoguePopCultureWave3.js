/** 营火对话 Wave3 — 西部 / 黑帮 / 深空科幻 */
export function mergeRestDialoguePopCultureWave3(base) {
  const out = structuredClone(base);
  const add = (zone, nodeId, node) => {
    if (!out[zone]?.nodes) return;
    out[zone].nodes[nodeId] = node;
  };

  add('fantasy', 'western', {
    speaker: '精灵斥候',
    text: '「灰林边缘有旧西部回声 — 沙龙镜墙、正午决斗圈、幽灵铁道。\n\n别在 chalk 圈里恋战，太阳不会等你。」',
    journal: { id: 'rest-fantasy-western', title: '营火·边境往事', text: '灰白森林致敬西部 frontier 母题。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('fantasy', 'duel', {
    speaker: '精灵斥候',
    text: '「正午决斗圈在西侧 — 倒影永远比你快半拍。F 弹反比拔枪快。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  add('fantasy', 'rails', {
    speaker: '精灵斥候',
    text: '「幽灵铁道向东延伸 — 汽笛在雾里，火车从不到站。」',
    choices: [{ label: '休息', action: 'rest' }],
  });

  add('abyss', 'gangster', {
    speaker: '裂隙引路人',
    mood: 'warn',
    text: '「混沌边境有幽冥帮派回声 — 禁酒窖、家族圣龛、码头货仓。\n\n走私的不是酒，是位面间的魂火关税。」',
    journal: { id: 'rest-abyss-gangster', title: '营火·幽冥帮派', text: '混沌边境致敬黑帮 noir 母题。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('abyss', 'speakeasy', {
    speaker: '裂隙引路人',
    text: '「无标记的后巷有禁酒窖门 — 进去别问价，问界。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  add('abyss', 'dock', {
    speaker: '裂隙引路人',
    text: '「码头货仓的木箱烙旧纹章 — 魂火走私线仍通。」',
    choices: [{ label: '休息', action: 'rest' }],
  });

  add('space', 'scifi', {
    speaker: '宇航员回声',
    text: '「米勒荒原不只有星际方程 — 还有深空纪元：殖民穹顶、休眠 AI、跃迁门阵列。\n\n三门同相才能跃迁。」',
    journal: { id: 'rest-space-scifi', title: '营火·深空纪元', text: '米勒荒原致敬殖民/AI/跃迁科幻母题。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('space', 'ai', {
    speaker: '宇航员回声',
    text: '「休眠 AI 核心低语：任务未完成 — 它指的不是飞船，是你。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  add('space', 'jump', {
    speaker: '宇航员回声',
    text: '「跃迁门阵列在北 — 错相的人会在门里永远循环第一秒。」',
    choices: [{ label: '休息', action: 'rest' }],
  });

  add('hub', 'triad', {
    speaker: '锚火看守',
    text: '「三巨头母题已渗入各位面：\n\n· 灰林 — **边境往事**（西部）\n· 混沌 — **幽冥帮派**（黑帮）\n· 荒原 — **深空纪元**（科幻）\n\nJ → 次元回声 按系列筛选。」',
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });

  if (out.fantasy?.nodes?.start?.choices) {
    out.fantasy.nodes.start.choices.push(
      { label: '边境往事？', next: 'western' },
      { label: '决斗圈？', next: 'duel' },
      { label: '幽灵铁道？', next: 'rails' },
    );
  }
  if (out.abyss?.nodes?.start?.choices) {
    out.abyss.nodes.start.choices.push(
      { label: '幽冥帮派？', next: 'gangster' },
      { label: '禁酒窖？', next: 'speakeasy' },
      { label: '码头货仓？', next: 'dock' },
    );
  }
  if (out.space?.nodes?.start?.choices) {
    out.space.nodes.start.choices.push(
      { label: '深空纪元？', next: 'scifi' },
      { label: 'AI 核心？', next: 'ai' },
      { label: '跃迁门？', next: 'jump' },
    );
  }
  if (out.hub?.nodes?.start?.choices) {
    out.hub.nodes.start.choices.push({ label: '三巨头母题？', next: 'triad' });
  }

  return out;
}
