/** 营火对话 Wave2 — 九分站台 / 虫洞 / 街机厅等 */
export function mergeRestDialoguePopCultureWave2(base) {
  const out = structuredClone(base);
  const add = (zone, nodeId, node) => {
    if (!out[zone]?.nodes) return;
    out[zone].nodes[nodeId] = node;
  };

  add('magic', 'nine', {
    speaker: '奥术旅者',
    text: '「九分又四分三站台 — 砖墙会在月台中央裂开。别找检票口，找「相信」的那一步。」',
    journal: { id: 'rest-magic-nine', title: '营火·九分站台', text: '魔法遗境致敬经典站台母题。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('magic', 'patronus', {
    speaker: '奥术旅者',
    text: '「护念湖镜在东岸 — 湖面映出的不是脸，是你最需要的勇气。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  add('magic', 'triwizard', {
    speaker: '奥术旅者',
    text: '「三强赛台的三只杯已空 — 龙息与迷宫的回声还在石台打转。」',
    choices: [{ label: '休息', action: 'rest' }],
  });

  add('space', 'wormhole', {
    speaker: '宇航员回声',
    text: '「虫洞拱门在荒原西侧 — 光在环里折叠。穿过它的人，年龄与记忆不同步。」',
    journal: { id: 'rest-space-wormhole', title: '营火·虫洞', text: '米勒荒原致敬虫洞母题。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('space', 'brand', {
    speaker: '宇航员回声',
    text: '「曼恩假信标在冰原上闪 — 日志写完美，脚印写谎言。别被光骗。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  add('space', 'love', {
    speaker: '宇航员回声',
    text: '「爱即坐标 — 五维_tesseract 里唯一不变的导航星是「不要放手」。」',
    choices: [{ label: '休息', action: 'rest' }],
  });

  add('void', 'arcade', {
    speaker: '时线残影',
    text: '「街机厅残影还在播 — 吃豆人与恶魔循环，投币口塞满红色孢子。」',
    journal: { id: 'rest-void-arcade', title: '营火·街机厅', text: '破碎时线致敬 80 年代街机母题。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('void', 'bike', {
    speaker: '时线残影',
    text: '「四盏单车灯在雾中排成线 — 像有人还在找失踪的朋友。别在夜里单独追。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  add('void', 'vecna', {
    speaker: '时线残影',
    mood: 'warn',
    text: '「裂相钟塔指针停在 11 点 6 分 — 每次钟声，天花板就远一点。」',
    choices: [{ label: '休息', action: 'rest' }],
  });
  add('void', 'lab', {
    speaker: '时线残影',
    text: '「地下实验室门牌 rusted shut — 门后仍有低频嗡鸣，像未关的实验。」',
    choices: [{ label: '休息', action: 'rest' }],
  });

  if (out.magic?.nodes?.start?.choices) {
    out.magic.nodes.start.choices.push(
      { label: '九分站台？', next: 'nine' },
      { label: '护念湖？', next: 'patronus' },
      { label: '三强赛台？', next: 'triwizard' },
    );
  }
  if (out.space?.nodes?.start?.choices) {
    out.space.nodes.start.choices.push(
      { label: '虫洞拱门？', next: 'wormhole' },
      { label: '曼恩信标？', next: 'brand' },
      { label: '爱即坐标？', next: 'love' },
    );
  }
  if (out.void?.nodes?.start?.choices) {
    out.void.nodes.start.choices.push(
      { label: '街机厅？', next: 'arcade' },
      { label: '单车灯串？', next: 'bike' },
      { label: '裂相钟塔？', next: 'vecna' },
      { label: '地下实验室？', next: 'lab' },
    );
  }

  return out;
}
