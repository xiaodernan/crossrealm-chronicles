/** 营火对话第二波扩写 */
export function mergeRestDialogueWave2(base) {
  const out = structuredClone(base);
  const add = (zone, nodeId, node) => {
    if (!out[zone]?.nodes) return;
    out[zone].nodes[nodeId] = node;
  };

  add('hub', 'dungeon', {
    speaker: '锚火看守',
    text: '「五座地下城散落各位面 — 日志 [J] 的 **地下城** Tab 会记你的清空记录。」',
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('hub', 'side', {
    speaker: '锚火看守',
    text: '「除了主线，还有 **支线** — 魂火萤、风格试炼、CG 收集。完成自动奖魂火。」',
    journal: { id: 'rest-hub-side', title: '营火·支线', text: 'J 键支线 Tab 查看可选目标。' },
    choices: [{ label: '休息', action: 'rest' }],
  });
  if (out.hub?.nodes?.start?.choices) {
    out.hub.nodes.start.choices.push(
      { label: '地下城记录？', next: 'dungeon' },
      { label: '有支线吗？', next: 'side' },
    );
  }

  add('fantasy', 'streak', {
    speaker: '精灵斥候',
    text: '「短时间连杀会触发 **魂火连击** — 屏幕 toast 提示额外魂火。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  if (out.fantasy?.nodes?.start?.choices) {
    out.fantasy.nodes.start.choices.push({ label: '连杀奖励？', next: 'streak' });
  }

  add('magic', 'skills', {
    speaker: '奥术旅者',
    text: '「日志 [J] 的 **流派** Tab 可预览剑/杖技能树 — 营火升级面板里加点。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  if (out.magic?.nodes?.start?.choices) {
    out.magic.nodes.start.choices.push({ label: '技能树在哪看？', next: 'skills' });
  }

  add('void', 'death', {
    speaker: '时线残影',
    text: '「倒下后会在枢纽重生 — 系统会给 **操作提示**，别重复犯同一错。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  if (out.void?.nodes?.start?.choices) {
    out.void.nodes.start.choices.push({ label: '死了怎么办？', next: 'death' });
  }

  add('abyss', 'credits', {
    speaker: '裂隙引路人',
    text: '「Ch5 通关后有 **滚动字幕** — 可按 Esc 跳过。你的旅程会被记录。」',
    choices: [{ label: '休息', action: 'rest' }],
    minChapter: 5,
  });
  if (out.abyss?.nodes?.start?.choices) {
    out.abyss.nodes.start.choices.push({ label: '通关之后？', next: 'credits', minChapter: 5 });
  }

  return out;
}
