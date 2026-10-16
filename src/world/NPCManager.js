import * as THREE from 'three';
import { NPC_CHAPTER_LINES } from '../game/LoreFragments.js';
import { keyText } from '../content/keyHints.js';
import { t } from '../engine/i18n.js';
import { applyShadow } from '../engine/shadowPolicy.js';

const NPC_DATA = [
  {
    id: 'wanderer',
    name: '位面流浪者',
    x: 8,
    z: 62,
    color: 0x556677,
    lines: [
      'npc_wanderer_0',
      'npc_wanderer_1',
      'npc_wanderer_2',
    ],
  },
  {
    id: 'elf-scout',
    name: '精灵斥候',
    x: -160,
    z: 30,
    color: 0x3a5a40,
    lines: [
      'npc_scout_0',
      'npc_scout_1',
    ],
  },
  {
    id: 'astronaut-echo',
    name: '宇航员回声',
    x: 195,
    z: 95,
    color: 0x8899aa,
    lines: [
      'npc_astronaut_0',
      'npc_astronaut_1',
    ],
  },
];

/**
 * 池子里的那一格 → 玩家真正读到的那一句（B119）。
 *
 * `fromKeys` 说这一池存的是**文案键**（`npc_wanderer_0`）还是**已经写好的正文**
 * （`NPC_CHAPTER_LINES` 里那些中文句子）。两件事都要做，但顺序与去留不同：
 * 键要先过 `t()` 换成当前语言那一句，正文原样留下；两边最后都过 `keyText()`
 * 把 `{动作}` 展开成当前键名（同一句话接下来有三个去处：对话框 / 日志条目 / `npc-talk`
 * 事件，日志存的是定稿，改绑之后回头翻不该看到字面占位）。
 *
 * 抽成一个函数是为了让门禁调的与运行时调的是**同一处**：口径写成两遍，
 * 下一次改绑或加语言时两边就会各漂一次。
 */
export function npcLine(raw, fromKeys) {
  return keyText(fromKeys ? t(raw) : raw);
}

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
      applyShadow(body, 'actor');
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
    // 两个池子的**口径不同**，`t()` 只给其中一池（B119）：
    //  · `npc.lines` 是**文案键** —— 过 `t()` 才拿到当前语言那一句；
    //  · `NPC_CHAPTER_LINES` 是**成段正文**（`game/LoreFragments.js` 里就是中文句子，
    //    还没进双表）—— `t()` 会把整句话当键名查，回 `[MISSING: …]` 并**念给玩家听**。
    // 改前两条池子共用一句 `keyText(t(raw))`：探针实测 **30/30** 句章节台词全成了
    // `[MISSING: 宝箱里的魂火能升级属性。别忽视营火。]`，而对话框、日志、`npc-talk`
    // 三处**同时**收到同一份坏字，门禁比的是"三处一样"所以一路绿 —— 典型的"两边一起漏"。
    const line = npcLine(pool[idx], !chapterLines);
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
