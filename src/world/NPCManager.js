import * as THREE from 'three';
import { NPC_CHAPTER_LINES } from '../game/LoreFragments.js';
import { keyText } from '../ui/keyHints.js';
import { t } from '../engine/i18n.js';
import { applyShadow } from '../engine/shadowPolicy.js';

export const NPC_DATA = [
  // `name` 是**文案键**（W-D2 切片25）：三个消费点（对话框说话人 / 日志条目标题 / 交互提示）
  // 都在播出那一刻 `t()` 展开。三格全部**复用既有键**而不新开 —— 「同一份文案最多两个键」
  // 是 `tests/i18n.test.js` 的硬上限，而这三串名字在表里已经有活键了：
  //   · 位面流浪者 = `wp_label_wanderer`（同一角色的地图路点标签，主线目标标题也是这一格）；
  //   · 精灵嗷侣 = `rest_npc_fantasy_name`、宇航员回声 = `rest_npc_space_name`
  //     （后两个与营火常驻 NPC **同名同配色**：body 0x3a5a40 / 0x8899aa，就是同一个人）。
  // 新开第三格会让门禁当场红，而复用让「这个人叫什么」全仓只有一处住址。
  {
    id: 'wanderer',
    name: 'wp_label_wanderer',
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
    name: 'rest_npc_fantasy_name',
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
    name: 'rest_npc_space_name',
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
 * 池子里的那一格 → 玩家真正读到的那一句。
 *
 * 两个池子（`npc.lines` 与 `NPC_CHAPTER_LINES`）现在**都是文案键**（W-D2 切片14 收口），
 * 所以这里只剩两段展开：`t()` 把键换成当前语言那一句，`keyText()` 把 `{动作}` 换成当前键名。
 * 两段都要，顺序不能反：同一句话接下来有三个去处（对话框 / 日志条目 / `npc-talk` 事件），
 * 日志存的是定稿，改绑之后回头翻不该看到字面占位。
 *
 * 抽成一个函数是为了让门禁调的与运行时调的是**同一处**：B119 的病根正是"池子里装的是什么"
 * 这件事没有单一出口 —— 切片12 把一段正文也送进了 `t()`，30/30 句章节台词念成 `[MISSING: …]`。
 * 现在口径由 `tests/key-hint-outlets.test.js` 双向钉住：池子每一格都必须是**已登记的键**，
 * 且逐句走真 `talk()` 之后一个字都不许留 `[MISSING`。
 */
export function npcLine(key) {
  return keyText(t(key));
}

export class NPCManager {
  constructor(scene, world, dialog, game = null) {
    this.scene = scene;
    this.world = world;
    this.dialog = dialog;
    this.game = game;
    this.npcs = [];
    this.lineIndex = {};
    /**
     * 两份**共享几何**与一份**共享材质**（W-C1 切片3d）—— 三个 NPC 共用这一套。
     *
     * 改前每一个 NPC 各造两份几何（胶囊体 / 标记球）⇒ **三个就是 6 份几何**，
     * 而它们**长得一模一样**；标记球那枚材质（`0x44ffaa`，人人一样）也是各造一份。
     *
     * **身体的材质逐个一份** —— 每个人的颜色不一样（`data.color`），那是他的身份。
     */
    this._身体几何 = new THREE.CapsuleGeometry(0.38, 1.0, 8, 16);
    this._标记几何 = new THREE.SphereGeometry(0.15, 8, 8);
    this._标记材质 = new THREE.MeshBasicMaterial({ color: 0x44ffaa });
    this.build();
  }

  build() {
    for (const data of NPC_DATA) {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.75 });
      const body = new THREE.Mesh(this._身体几何, mat);
      body.position.y = 1.2;
      applyShadow(body, 'actor');
      group.add(body);

      const marker = new THREE.Mesh(this._标记几何, this._标记材质);
      marker.position.y = 2.5;
      group.add(marker);

      const y = this.world.getGroundHeight(data.x, data.z);
      group.position.set(data.x, y, data.z);
      // 逐个点名（id 是内容表里的唯一键）：NPC 只有几个，榜上分开不炸行
      group.name = `npc:${data.id}`;
      this.scene.add(group);

      // `material` 挂在这一条上：`dispose()` 要逐个释放它（身体材质是逐人一份的）
      this.npcs.push({ ...data, mesh: group, material: mat, position: new THREE.Vector3(data.x, y, data.z) });
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
    // 两个池子**同一个口径**：装的都是文案键（W-D2 切片14 把正文搬进双表之后）。
    // B119 的教训留在这里：`NPC_CHAPTER_LINES` 曾经装的是成段正文，与 `npc.lines` 混着
    // 送进 `t()` ⇒ 整句话被当键名查、回 `[MISSING: …]` 并念给玩家听；而对话框、日志、
    // `npc-talk` 三处**同时**收到同一份坏字，所以旧用例比"三处一样"时一路绿。
    const line = npcLine(pool[idx]);
    this.dialog.show(t(npc.name), line);
    this.lineIndex[npc.id]++;
    window.dispatchEvent(new CustomEvent('npc-talk', { detail: { id: npc.id, line, chapter } }));
    this.game?.storyJournal?.add({
      id: `npc-${npc.id}-ch${chapter}-${idx}`,
      category: 'npc',
      title: t(npc.name),
      text: line,
      chapter,
    });
  }

  update(dt) {
    for (const n of this.npcs) {
      n.mesh.rotation.y += dt * 0.4;
    }
  }

  /**
   * 拆干净：把三个人从场景里摘掉，逐个释放身体的材质，再释放那两份共享几何与一份共享材质。
   *
   * 为什么现在才有（W-C1 切片3d）：`Game._adopt` **拒绝**没有 `dispose()` 的子系统
   * （"假装收编"的防线），而这一层此前**没有** `dispose()` ⇒ 它从不被收编 ⇒
   * `Game.dispose()` 走完，它造的那些几何与材质**一份都不还**。
   *
   * 身体的材质**逐个**释放（颜色是每个人的身份，不能共用），标记球那份共用 ⇒ 只释放一次。
   */
  dispose() {
    for (const n of this.npcs) {
      this.scene.remove(n.mesh);
      n.material?.dispose?.();
    }
    this.npcs.length = 0;
    this._身体几何?.dispose?.();
    this._标记几何?.dispose?.();
    this._标记材质?.dispose?.();
  }
}
