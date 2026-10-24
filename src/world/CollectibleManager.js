import * as THREE from 'three';
import { applyShadow } from '../engine/shadowPolicy.js';
import { t } from '../engine/i18n.js';
import { ITEM_NAMES } from '../content/items.js';

const CHESTS = [
  { id: 'chest-hub', x: 25, z: 70, souls: 50 },
  { id: 'chest-fantasy', x: -170, z: 50, souls: 80 },
  { id: 'chest-fantasy2', x: -240, z: -10, souls: 100, items: ['void-resonance-shard'] },
  { id: 'chest-magic', x: -40, z: -200, souls: 80 },
  { id: 'chest-magic2', x: 50, z: -160, souls: 120, items: ['void-resonance-shard'] },
  { id: 'chest-space', x: 170, z: 50, souls: 80 },
  { id: 'chest-space2', x: 210, z: 130, souls: 100, items: ['void-resonance-shard'] },
  { id: 'chest-secret', x: -30, z: -30, souls: 200 },
];

export class CollectibleManager {
  constructor(scene, world, stats, dialog) {
    this.scene = scene;
    this.world = world;
    this.stats = stats;
    this.dialog = dialog;
    this.chests = [];
    /**
     * 两份**共享几何**与两份**共享材质**（W-C1 切片3d）—— 八个宝箱共用这一套。
     *
     * 改前每一个宝箱各造两份几何（`new THREE.BoxGeometry(...)` 写在循环里）⇒
     * **八个就是 16 份几何**，而它们**长得一模一样**（箱体 / 箱盖）。
     * 材质本来就是共用的（改前就在 `build()` 里造一次），这一片只是把它们也提上来，
     * 好让 `dispose()` 找得到它们。
     */
    this._箱体几何 = new THREE.BoxGeometry(1.2, 0.8, 0.8);
    this._箱盖几何 = new THREE.BoxGeometry(1.25, 0.25, 0.85);
    this._箱体材质 = new THREE.MeshStandardMaterial({ color: 0x6a5030, roughness: 0.8, metalness: 0.3 });
    this._箱盖材质 = new THREE.MeshStandardMaterial({ color: 0x8a7040, roughness: 0.7, metalness: 0.4 });
    this.build();
  }

  build() {
    for (const c of CHESTS) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(this._箱体几何, this._箱体材质);
      body.position.y = 0.4;
      applyShadow(body, 'castOnly');
      group.add(body);
      const lid = new THREE.Mesh(this._箱盖几何, this._箱盖材质);
      lid.position.y = 0.9;
      lid.name = 'lid';
      group.add(lid);

      const glow = new THREE.PointLight(0xffcc44, 0.3, 6);
      glow.position.y = 1.2;
      group.add(glow);

      const y = this.world.getGroundHeight(c.x, c.z);
      group.position.set(c.x, y, c.z);
      this.scene.add(group);

      this.chests.push({
        ...c,
        mesh: group,
        opened: this.stats.chestsOpened.has(c.id),
      });
      if (this.stats.chestsOpened.has(c.id)) group.visible = false;
    }
  }

  tryOpen(playerPos, range = 3) {
    for (const chest of this.chests) {
      if (chest.opened) continue;
      const d = Math.sqrt((playerPos.x - chest.mesh.position.x) ** 2 + (playerPos.z - chest.mesh.position.z) ** 2);
      if (d < range) return chest;
    }
    return null;
  }

  open(chest) {
    if (chest.opened) return;
    chest.opened = true;
    this.stats.chestsOpened.add(chest.id);
    this.stats.addSouls(chest.souls);
    chest.mesh.visible = false;
    this.dialog.toast(t('chest_souls_gained', { n: chest.souls }));
    // W-D2 切片52：宝箱里的物品逐件入账（r-relic-hunter 的锁因读的就是 itemsCollected 那一格）
    for (const item of chest.items ?? []) {
      this.stats.onItemCollected(item);
      this.dialog.toast(t('chest_item_gained', { item: t(ITEM_NAMES[item] ?? item) }), 3200);
    }
    window.dispatchEvent(new CustomEvent('chest-opened', { detail: { id: chest.id } }));
  }

  getOpenedCount() {
    return this.chests.filter((c) => c.opened).length;
  }

  /**
   * 拆干净：把八个宝箱从场景里摘掉，释放那两份共享几何与两份共享材质。
   *
   * 为什么现在才有（W-C1 切片3d）：`Game._adopt` **拒绝**没有 `dispose()` 的子系统
   * （"假装收编"的防线），而这一层此前**没有** `dispose()` ⇒ 它从不被收编 ⇒
   * `Game.dispose()` 走完，它造的那些几何与材质**一份都不还**。
   */
  dispose() {
    for (const c of this.chests) {
      this.scene.remove(c.mesh);
    }
    this.chests.length = 0;
    this._箱体几何?.dispose?.();
    this._箱盖几何?.dispose?.();
    this._箱体材质?.dispose?.();
    this._箱盖材质?.dispose?.();
  }
}
