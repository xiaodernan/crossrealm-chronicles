/** 氛围台词 — 致敬向扩写 */
import { mergePopCultureAmbientWave3 } from './WorldAmbientPopCultureWave3.js';
import { mergePopCultureAmbientWave4 } from './WorldAmbientPopCultureWave4.js';

export const ZONE_EVENTS_POP_CULTURE = {
  magic: [
    { text: '悬浮蜡烛从塔楼窗口飘出 — 像某所咒术学院的夜巡。', weight: 0.6 },
    { text: '禁林深处传来独角兽的低语 — 或是曼德拉草的梦。', weight: 0.5 },
    { text: '九分又四分三站台的砖墙在雾里若隐若现。', weight: 0.45 },
    { text: '护念湖镜映出银光 — 像有人在远处奔跑。', weight: 0.4 },
  ],
  space: [
    { text: '墨菲书架的方向，引力微微扭曲。', weight: 0.5 },
    { text: '米勒沙漏的沙子落得太快 — 别在这里恋战。', weight: 0.6 },
    { text: '对接舱的金属环在远处缓慢旋转。', weight: 0.4 },
    { text: '虫洞拱门在荒原西侧折叠星光 — 别盯着看太久。', weight: 0.45 },
    { text: '曼恩假信标在冰原上闪烁 — 光与谎言同频。', weight: 0.35 },
  ],
  void: [
    { text: '红色孢子飘落 — 逆相界的风从裂口渗出。', weight: 0.7 },
    { text: '旧镇广播塔在雾中闪烁红灯。', weight: 0.5 },
    { text: 'Walkman 的磁带在风里倒放 — 你听见 1983 年的 SOS。', weight: 0.4 },
    { text: '四盏单车灯在雾中排成线 — 像夜游的队伍。', weight: 0.45 },
    { text: '街机 CRT 在远处闪绿光 — 吃豆人永远差一步。', weight: 0.4 },
    { text: '裂相钟塔无声指向 11:06 — 天花板感觉更远了。', weight: 0.35 },
  ],
  fantasy: [
    { text: '至尊石环低声吟诵 — One Realm to bind them all…', weight: 0.5 },
  ],
  hub: [
    { text: '海报墙在东侧 — 六张褪色位面海报等待共鸣。', weight: 0.4 },
  ],
};

export function mergePopCultureAmbient(base) {
  return mergePopCultureAmbientWave4(mergePopCultureAmbientWave3(_mergePopCultureAmbientBase(base)));
}

function _mergePopCultureAmbientBase(base) {
  const out = { ...base };
  for (const [z, list] of Object.entries(ZONE_EVENTS_POP_CULTURE)) {
    out[z] = [...(out[z] ?? []), ...list];
  }
  return out;
}
