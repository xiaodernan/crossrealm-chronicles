import * as THREE from 'three';
import { NPC_CHAPTER_LINES } from '../game/LoreFragments.js';
import { keyText } from '../content/keyHints.js';

const NPC_DATA = [
  {
    id: 'wanderer',
    name: '位面流浪者',
    x: 8,
    z: 62,
    color: 0x556677,
    lines: [
      '穿越者…你闻到了吗？三个位面的气息正在融合。',
      '灰白森林的守护者只是开始。霍格沃兹遗境的大奥术师更为危险。',
      '打开宝箱、在营火休息升级——这是生存的基本。',
    ],
  },
  {
    id: 'elf-scout',
    name: '精灵斥候',
    x: -160,
    z: 30,
    color: 0x3a5a40,
    lines: [
      '至尊石环在森林西侧。Boss 竞技场在更深处——做好充分准备。',
      '观察敌人红圈，在最后一瞬闪避或弹反。',
    ],
  },
  {
    id: 'astronaut-echo',
    name: '宇航员回声',
    x: 195,
    z: 95,
    color: 0x8899aa,
    lines: [
      'Endurance 号的日志说：时间在这里是圆的。',
      '五维_tesseract 藏着最后的碎片秘密…',
    ],
  },
];

export class NPCManager {
  constructor(scene, world, dialog, game = null) {
    this.scene = scene;
    this.world = world;
    this.dialog = dialog;
    this.game = game;
    this.npcs = [];
    this.lineIndex = {};
    this.build();
  }

  build() {
    for (const data of NPC_DATA) {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.75 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.0, 8, 16), mat);
      body.position.y = 1.2;
      body.castShadow = true;
      group.add(body);

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x44ffaa })
      );
      marker.position.y = 2.5;
      group.add(marker);

      const y = this.world.getGroundHeight(data.x, data.z);
      group.position.set(data.x, y, data.z);
      this.scene.add(group);

      this.npcs.push({ ...data, mesh: group, position: new THREE.Vector3(data.x, y, data.z) });
      this.lineIndex[data.id] = 0;
    }
  }

  getNearest(pos, range = 4) {
    let best = null;
    let min = range;
    for (const n of this.npcs) {
      const d = Math.sqrt((pos.x - n.position.x) ** 2 + (pos.z - n.position.z) ** 2);
      if (d < min) { min = d; best = n; }
    }
    return best;
  }

  talk(npc) {
    const chapter = this.game?.quests?.chapter ?? 1;
    const chapterLines = NPC_CHAPTER_LINES[npc.id]?.[chapter] ?? NPC_CHAPTER_LINES[npc.id]?.[1];
    const pool = chapterLines ?? npc.lines;
    const idx = this.lineIndex[npc.id] % pool.length;
    // 台词里的 `{动作}` 在**离开这一格之前**展开（W-B2 切片5）：同一句话接下来有三个去处 ——
    // 对话框、日志条目、`npc-talk` 事件。日志存的是定稿，改绑之后回头翻不该看到字面占位。
    const line = keyText(pool[idx]);
    this.dialog.show(npc.name, line);
    this.lineIndex[npc.id]++;
    window.dispatchEvent(new CustomEvent('npc-talk', { detail: { id: npc.id, line, chapter } }));
    this.game?.storyJournal?.add({
      id: `npc-${npc.id}-ch${chapter}-${idx}`,
      category: 'npc',
      title: npc.name,
      text: line,
      chapter,
    });
  }

  update(dt) {
    for (const n of this.npcs) {
      n.mesh.rotation.y += dt * 0.4;
    }
  }
}
