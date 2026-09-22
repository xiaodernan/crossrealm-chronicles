/** 战斗/探索随机 bark — 致敬向（不占用主 UI） */
export const COMBAT_BARKS_POP = {
  magic: [
    '悬浮蜡烛被剑气吹歪 — 像某所学院的夜巡被打扰。',
    '禁林树影里闪过银光 — 护念？还是魂火萤？',
  ],
  space: [
    '米勒沙漏的沙子落得太快 — 这一刀可能已是七年后的回声。',
    '对接舱金属环在远处旋转 — 别在这里恋战太久。',
  ],
  void: [
    '红色孢子粘在刀锋上 — 逆相界的风从裂口渗出。',
    '远处钟塔无声地指向 11:06 — 天花板感觉更远了。',
  ],
  fantasy: [
    '沙龙镜墙裂镜一闪 — 倒影比你快半拍。',
    '正午决斗圈的 chalk 线被踩乱 — 太阳不会等你。',
  ],
  abyss: [
    '禁酒窖门缝漏光 — 幽冥帮派在远处谈关税。',
    '码头货箱碰撞 — 魂火走私线仍通。',
  ],
  space_scifi: [
    '跃迁门蓝光脉动 — 这一刀可能已是错相循环的第一秒。',
    '休眠 AI 核心嗡鸣：「任务未完成。」',
  ],
};

export function attachPopCultureCombatBarks(game) {
  let cd = 0;
  window.addEventListener('enemy-defeated', () => {
    cd -= 1;
    if (cd > 0) return;
    const zone = game.world?.currentZone?.info?.name ?? '';
    let key = null;
    if (zone.includes('霍格') || zone.includes('遗境')) key = 'magic';
    else if (zone.includes('灰白') || zone.includes('森林')) key = 'fantasy';
    else if (zone.includes('米勒') || zone.includes('荒原')) key = Math.random() > 0.5 ? 'space' : 'space_scifi';
    else if (zone.includes('时线') || zone.includes('破碎')) key = 'void';
    else if (zone.includes('混沌')) key = 'abyss';
    if (!key) return;
    const list = COMBAT_BARKS_POP[key];
    if (!list?.length || Math.random() > 0.22) return;
    cd = 4;
    game.dialog?.toast?.(list[Math.floor(Math.random() * list.length)], 2800);
  });
}
