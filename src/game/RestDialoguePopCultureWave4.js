/** 营火对话 Wave4 */
export function mergeRestDialoguePopCultureWave4(base) {
  const out = structuredClone(base);
  const add = (zone, nodeId, node) => {
    if (!out[zone]?.nodes) return;
    out[zone].nodes[nodeId] = node;
  };

  add('magic', 'cyber', {
    speaker: '奥术旅者',
    text: '「赛博霓虹渗入遗境 — 霓虹后巷、铬合金诊所、巨企尖塔。魔药与芯片同柜。」',
    journal: { id: 'rest-magic-cyber', title: '营火·赛博霓虹', text: '魔法遗境赛博朋克母题。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('fantasy', 'samurai', {
    speaker: '精灵斥候',
    text: '「武士残响 — 鸟居、道场、樱落刃冢。最后一式用 F 弹反接。」',
    journal: { id: 'rest-fantasy-samurai', title: '营火·武士残响', text: '灰白森林武士道母题。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('void', 'cosmic', {
    speaker: '时线残影',
    mood: 'warn',
    text: '「旧日低语 — 方尖碑、抄写室、螺旋井。井底回声在数数。」',
    journal: { id: 'rest-void-cosmic', title: '营火·旧日低语', text: '破碎时线宇宙恐怖母题。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('space', 'starport', {
    speaker: '宇航员回声',
    text: '「星港商路 — 酒肆、走私码头、全息星图。航线是谈判出来的。」',
    journal: { id: 'rest-space-starport', title: '营火·星港商路', text: '米勒荒原太空歌剧母题。' },
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });
  add('hub', 'wave4', {
    speaker: '锚火看守',
    text: '「四系回声：赛博霓虹·武士残响·旧日低语·星港商路 — J 键筛选。」',
    choices: [{ label: '休息', action: 'rest' }, { label: '返回', next: 'start' }],
  });

  out.magic?.nodes?.start?.choices?.push({ label: '赛博霓虹？', next: 'cyber' });
  out.fantasy?.nodes?.start?.choices?.push({ label: '武士残响？', next: 'samurai' });
  out.void?.nodes?.start?.choices?.push({ label: '旧日低语？', next: 'cosmic' });
  out.space?.nodes?.start?.choices?.push({ label: '星港商路？', next: 'starport' });
  out.hub?.nodes?.start?.choices?.push({ label: 'Wave4 四系？', next: 'wave4' });
  return out;
}
