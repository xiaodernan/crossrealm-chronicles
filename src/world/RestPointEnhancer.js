import * as THREE from 'three';
import { ZONE_IDS, ZONE_NAMES } from '../content/ZoneIdentity.js';
import { paletteOf } from '../content/materialPalette.js';
import { applyShadow } from '../engine/shadowPolicy.js';
import { t } from '../engine/i18n.js';

/**
 * 营火地标 —— 木牌、光柱、首次发现提示
 *
 * 木牌上的地名除枢纽外一律取**当前区名**（W-B4 切片2）。这张表以前六格全是手抄的，
 * `magic` 那一格抄的是早已废弃的 '魔法遗境' —— 于是第一次走近魔法区那座火，
 * 提示条说"发现营火 · 魔法遗境"，而同一屏脚下写着"霍格沃兹遗境营火"。
 * 枢纽那一格不取区名（'交汇枢纽'）：木牌指的是场地中央那件东西，玩家口中的名字是世界之锚。
 */
const SIGN_LABELS = {
  [ZONE_IDS.HUB]: 'wp_label_anchor',
  [ZONE_IDS.FANTASY]: ZONE_NAMES[ZONE_IDS.FANTASY],
  [ZONE_IDS.MAGIC]: ZONE_NAMES[ZONE_IDS.MAGIC],
  [ZONE_IDS.SPACE]: ZONE_NAMES[ZONE_IDS.SPACE],
  [ZONE_IDS.VOID]: ZONE_NAMES[ZONE_IDS.VOID],
  [ZONE_IDS.ABYSS]: ZONE_NAMES[ZONE_IDS.ABYSS],
  [ZONE_IDS.GLOOM]: ZONE_NAMES[ZONE_IDS.GLOOM],
  [ZONE_IDS.RADIANT]: ZONE_NAMES[ZONE_IDS.RADIANT],
};

/**
 * 木牌上的地名的**展开点**（W-D2 切片16i）。
 *
 * 区名那几格存的是**文案键**（`ZONE_NAMES` 的值），木牌要写的是玩家看到的那几个字 ——
 * 于是这里 `t()` 展开一次。
 *
 * W-D2 切片16r：枢纽那格也变成**键**了（`wp_label_anchor` = '世界之锚'）——
 * 早先它是一句字面量，于是这里要靠"是不是枢纽那格"来区分该不该展开；
 * 现在**每一格都是键**，展开口径统一成一处。
 */
const signLabelOf = (id) => {
  const 键 = SIGN_LABELS[id];
  if (!键) return null;
  return t(键);
};

export class RestPointEnhancer {
  constructor(restPoints, game) {
    this.game = game;
    this.discovered = new Set();
    /**
     * 三份**共享几何**与两份**共享材质**（W-C1 切片3c）—— 八座营火共用这一套。
     *
     * 改前每一座各造各的 ⇒ 八座就是 **24 份几何 + 24 份材质**，而它们长得一模一样
     * （木牌柱 / 牌面 / 地标光柱）。
     *
     * **光柱的材质必须逐座一份**：`update` 里每座按**自己的距离**调透明度
     * （`p.landmarkBeam.material.opacity = …`）—— 共用一份就是"一座靠近，八座一起亮"。
     * 木牌柱与牌面从不被改 ⇒ 共用。
     */
    this._柱几何 = new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6);
    this._牌面几何 = new THREE.BoxGeometry(0.9, 0.35, 0.06);
    this._光柱几何 = new THREE.CylinderGeometry(0.02, 0.12, 8, 8, 1, true);
    this._柱材质 = new THREE.MeshStandardMaterial({ color: paletteOf('wood.post'), roughness: 0.9 });
    this._牌面材质 = new THREE.MeshStandardMaterial({
      color: paletteOf('wood.door'), roughness: 0.85, emissive: 0x221100, emissiveIntensity: 0.2,
    });
    for (const p of restPoints.points) {
      this._enhance(p);
    }
  }

  _enhance(point) {
    const label = signLabelOf(point.id) ?? point.name;
    const post = new THREE.Mesh(
      this._柱几何,
      this._柱材质,
    );
    post.position.set(-0.6, 0.8, 0.3);
    applyShadow(post, 'castOnly');
    point.mesh.add(post);

    const board = new THREE.Mesh(
      this._牌面几何,
      this._牌面材质,
    );
    board.position.set(-0.6, 1.55, 0.3);
    board.rotation.y = 0.35;
    point.mesh.add(board);

    // 光柱的材质**逐座一份** —— 它按自己的距离调透明度（共用一份就是"一座靠近，八座一起亮"）
    const beam = new THREE.Mesh(
      this._光柱几何,
      new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    beam.position.y = 4.5;
    point.mesh.add(beam);
    point.landmarkBeam = beam;
    point.zoneLabel = label;
  }

  /**
   * 换语言时重算木牌地名（W-D2 切片33）。
   *
   * `zoneLabel` 在构造期展开一次（`signLabelOf(id) ?? point.name`），首次发现提示与
   * 图鉴条目的标题读的就是它。换语言不重建场景，由 `SettingsManager.applyToGame`
   * 显式叫这一遍 —— 调用顺序在 `restPoints.refreshNames()` **之后**：回退分支读
   * `point.name`，先 Name 后 label 才不会把旧语言的回退值写进去。
   * @returns {number} 重算的地名数（供门禁的分母）
   */
  refreshLabels() {
    for (const p of this.game.restPoints.points) {
      p.zoneLabel = signLabelOf(p.id) ?? p.name;
    }
    return this.game.restPoints.points.length;
  }

  update(dt, playerPos) {
    for (const p of this.game.restPoints.points) {
      const d = Math.hypot(playerPos.x - p.position.x, playerPos.z - p.position.z);
      if (p.landmarkBeam) {
        p.landmarkBeam.material.opacity = 0.05 + Math.max(0, 1 - d / 40) * 0.12;
        p.landmarkBeam.rotation.y += dt * 0.4;
      }
      if (d < 12 && !this.discovered.has(p.id)) {
        this.discovered.add(p.id);
        this.game.dialog.toast(t('rest_point_discovered', { name: p.zoneLabel ?? p.name }), 2800);
        this.game.explorationMap?.revealZone?.(p.id);
        this.game.storyJournal?.add?.({
          id: `rest-found-${p.id}`,
          category: 'campfire',
          title: p.zoneLabel ?? p.name,
          text: t('rest_point_journal_text', { name: p.name }),
          chapter: this.game.quests?.chapter ?? 1,
        });
      }
    }
  }

  toJSON() {
    return { discovered: [...this.discovered] };
  }

  fromJSON(data) {
    if (data?.discovered) this.discovered = new Set(data.discovered);
  }

  /**
   * 拆干净：把每一座营火上挂的三件装饰摘下来，逐座释放光柱的材质，再释放那三份共享几何与两份共享材质。
   *
   * 为什么现在才有（W-C1 切片3c）：`Game._adopt` **拒绝**没有 `dispose()` 的子系统
   * （"假装收编\"的防线），而这一层此前**没有** `dispose()` ⇒ 它从不被收编 ⇒
   * `Game.dispose()` 走完，它造的那些几何与材质**一份都不还**。
   *
   * 拆卸登记表按**登记的反序**执行 ⇒ 营火本体（`RestPointManager`，先登记）后拆，
   * 这一层先拆 —— 装饰还挂在营火上的时候摘得掉；等营火本体摘走场景，装饰也跟着没了，
   * 那时再摘就找不到了。
   */
  dispose() {
    for (const p of this.game?.restPoints?.points ?? []) {
      for (const child of [...(p.mesh?.children ?? [])]) {
        // 只摘**自己挂上去的三件**（木牌柱 / 牌面 / 光柱）—— 营火本体那四件不是这一层的
        if (child.geometry === this._柱几何 || child.geometry === this._牌面几何 || child.geometry === this._光柱几何) {
          p.mesh.remove(child);
        }
      }
      p.landmarkBeam?.material?.dispose?.();
    }
    this._柱几何?.dispose?.();
    this._牌面几何?.dispose?.();
    this._光柱几何?.dispose?.();
    this._柱材质?.dispose?.();
    this._牌面材质?.dispose?.();
  }
}
