/** 次元回声 Wave2 — 九分站台 / 虫洞 / 街机厅等母题 */
import { FRANCHISE } from '../content/franchises.js';
export const POP_CULTURE_ECHOES_WAVE2 = [
  // 魔法学院
  { id: 'echo-nine-platform', franchise: FRANCHISE.WIZARD, zone: 'magic', title: '九分又四分三站台', desc: '砖墙在月台中央裂开 — 只有「相信」的人才能穿过去。', trigger: 'echo:nine-platform' },
  { id: 'echo-patronus-lake', franchise: FRANCHISE.WIZARD, zone: 'magic', title: '护念湖镜', desc: '湖面映出的不是脸，是你最需要的勇气形状。', trigger: 'echo:patronus-lake' },
  { id: 'echo-triwizard', franchise: FRANCHISE.WIZARD, zone: 'magic', title: '三强赛台', desc: '三只高脚杯已空，龙息与迷宫的回声仍在石台打转。', trigger: 'echo:triwizard-cup' },

  // 星际穿越
  { id: 'echo-brand-beacon', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: '曼恩假信标', desc: '信标在冰原上闪烁 — 日志说「完美」，脚印说「谎言」。', trigger: 'echo:brand-beacon' },
  { id: 'echo-wormhole', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: '虫洞拱门', desc: '光在环中折叠 — 穿过它的人，年龄与记忆不同步。', trigger: 'echo:wormhole-arch' },
  { id: 'echo-love-signal', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: '爱即坐标', desc: '五维_tesseract 里，唯一不变的导航星是「不要放手」。', trigger: 'echo:love-signal' },

  // 逆相界
  { id: 'echo-bike-trail', franchise: FRANCHISE.UPSIDE, zone: 'void', title: '夜游单车灯串', desc: '四盏车灯在雾中排成线 — 像有人还在找失踪的朋友。', trigger: 'echo:bike-trail' },
  { id: 'echo-arcade', franchise: FRANCHISE.UPSIDE, zone: 'void', title: '街机厅残影', desc: '吃豆人与恶魔在 CRT 里循环 — 投币口塞满红色孢子。', trigger: 'echo:arcade' },
  { id: 'echo-vecna-clock', franchise: FRANCHISE.UPSIDE, zone: 'void', title: '裂相钟塔', desc: '指针停在 11 点 6 分 — 每次钟声，天花板就远一点。', trigger: 'echo:vecna-clock' },
  { id: 'echo-underground-lab', franchise: FRANCHISE.UPSIDE, zone: 'void', title: '地下实验室残骸', desc: '编号门牌 rusted shut — 门后仍有低频嗡鸣，像未关的实验。', trigger: 'echo:underground-lab' },

  // 跨界
  { id: 'echo-full-resonance', franchise: FRANCHISE.CROSSOVER, zone: 'hub', title: '全位面共鸣', desc: '所有回声同频 — 海报墙六色齐亮，像六个梦在同一句台词里醒来。', trigger: 'echo:full-resonance' },
];
