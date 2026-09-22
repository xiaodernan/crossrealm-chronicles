/** Lore 扩写 — 致敬向碎片 */
import { LORE_FRAGMENTS_POP_WAVE3, mergeNpcChapterLinesWave3 } from './WorldAmbientPopCultureWave3.js';
import { LORE_FRAGMENTS_POP_WAVE4, mergeNpcChapterLinesWave4 } from './WorldAmbientPopCultureWave4.js';

export const LORE_FRAGMENTS_POP = [
  { id: 'lore-wizard', title: '咒术学院残页', text: '「楼梯会换方向，蜡烛会自己飞 — 但魂火不会。」', chapter: 2 },
  { id: 'lore-inter', title: '坚韧号副录', text: '「不要温和地走进那个良夜 — 但可以在营火边休息。」', chapter: 3 },
  { id: 'lore-upside', title: '逆相界录音', text: '「1983 年 11 月 6 日 — 裂口打开。红色闪电，没有星星。」', chapter: 4 },
  { id: 'lore-murphy', title: '引力笔迹', text: '「Stay — 写在书架上的不是字，是维度之间的握手。」', chapter: 3 },
  { id: 'lore-broom', title: '环赛记分', text: '「飞天环赛第三圈 — 鬼火领先扫帚半个月亮。」', chapter: 2 },
  { id: 'lore-nine', title: '站台残页', text: '「砖墙在月台中央裂开 — 相信的人不会问检票口在哪。」', chapter: 2 },
  { id: 'lore-wormhole', title: '虫洞副录', text: '「穿过环的人，年龄与记忆不同步 — 但爱可以。」', chapter: 3 },
  { id: 'lore-arcade', title: '街机厅收据', text: '「1983 年 11 月 6 日 — 投币口塞满红色孢子，游戏永不结束。」', chapter: 4 },
  { id: 'lore-vecna', title: '裂相钟塔报', text: '「指针停在 11:06 — 每次钟声，天花板就远一点。」', chapter: 4 },
  ...LORE_FRAGMENTS_POP_WAVE3,
  ...LORE_FRAGMENTS_POP_WAVE4,
];

export const NPC_LINES_POP = {
  'astronaut-echo': {
    3: ['墨菲书架在荒原东侧 — 引力会在书页间写字。', '对接舱旋转 — 两船同速，否则金属的葬礼。', '虫洞拱门在西侧 — 光在环里折叠。'],
  },
  'elf-scout': {
    2: ['至尊石环的铭文改了词 — 指环已碎，石环仍在。'],
  },
  wanderer: {
    4: ['街机厅 CRT 还在闪 — 吃豆人与恶魔循环。', '裂相钟塔指向 11:06 — 别在钟声里抬头。'],
  },
};

export function mergeNpcChapterLines(base) {
  return mergeNpcChapterLinesWave4(mergeNpcChapterLinesWave3(_mergeNpcChapterLinesPop(base)));
}

function _mergeNpcChapterLinesPop(base) {
  const out = structuredClone(base);
  for (const [npc, chapters] of Object.entries(NPC_LINES_POP)) {
    if (!out[npc]) out[npc] = {};
    for (const [ch, lines] of Object.entries(chapters)) {
      out[npc][ch] = [...(out[npc][ch] ?? []), ...lines];
    }
  }
  return out;
}
