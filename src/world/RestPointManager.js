import * as THREE from 'three';
import { ZONE_IDS } from '../content/ZoneIdentity.js';
import { REST_POINT_NAMES, restPointZoneKey } from '../content/restPointNames.js';
import { applyShadow } from '../engine/shadowPolicy.js';
import { t } from '../engine/i18n.js';

export class RestPointManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.points = [];
    /** 世界时累计（秒）：火苗抖动与自发光脉动的相位源（B118） */
    this._时相 = 0;
    /**
     * 四份**共享几何**与三份**共享材质**（W-C1 切片3c）—— 八座营火共用这一套。
     *
     * 改前每一座营火各造各的：`new THREE.CylinderGeometry(...)` 之类写在 `addRestPoint` 里 ⇒
     * 八座就是 **32 份几何 + 32 份材质**，而它们**长得一模一样**（底座 / 石圈 / 火苗 / 光环）。
     *
     * **火苗的材质必须逐座一份**：`update` 里每座各自脉动
     * （`p.flame.material.emissiveIntensity = …`）—— 共用一份就是"一座在跳，全场在跳"。
     * 那三份（底座 / 石圈 / 光环）从不被改 ⇒ 共用。
     */
    this._底座几何 = new THREE.CylinderGeometry(0.8, 1.2, 0.4, 8);
    this._石圈几何 = new THREE.TorusGeometry(0.5, 0.08, 6, 12);
    this._火苗几何 = new THREE.ConeGeometry(0.35, 0.9, 6);
    this._光环几何 = new THREE.TorusGeometry(1.4, 0.05, 8, 32);
    this._底座材质 = new THREE.MeshStandardMaterial({ color: 0x4a4035, roughness: 0.9, metalness: 0.1 });
    this._石圈材质 = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.85 });
    this._光环材质 = new THREE.MeshStandardMaterial({ color: 0xc9a962, emissive: 0x443300, emissiveIntensity: 0.5 });
  }

  /**
   * @param {number} x @param {number} z @param {string} name UI 文案（非空）
   * @param {string} id 稳定 id（`ZONE_IDS` 之一，或该营火自己的唯一名）
   */
  addRestPoint(x, z, name, id) {
    // 修 B36：id 曾经悄悄回落成显示名 —— 那等于把"目的地按什么认领"又交回文案手上。
    // 现在要么给真 id，要么在世界构建期就炸给开发者看，不留静默的第二真源。
    if (!id) throw new Error(`RestPointManager: 营火「${name}」缺少 id，快速旅行将无法认领目的地`);
    if (this.points.some((p) => p.id === id)) throw new Error(`RestPointManager: 营火 id ${id} 重复，快速旅行会跳错地方`);
    // 名字同 id 一样是必需格：对话标题、交互提示、快速旅行与图鉴都说这一格，
    // 缺了它对话标题会显示成字面的 "undefined"（W-B4 切片2）
    if (typeof name !== 'string' || !name) {
      throw new Error(`RestPointManager: 营火 ${id} 缺少显示名（对话标题与交互提示要说它叫什么）`);
    }
    const group = new THREE.Group();
    // 营火要有名（W-C2 切片17）：这一族的底座与石圈没名，组再没名就并进 `(直属scene) / (无名)`，
    // 榜上问不出"是哪一座营火在投影"。id 上面已经核过非空且不重复 ⇒ 名字天生唯一。
    group.name = `rest:${id}`;
    const base = new THREE.Mesh(
      this._底座几何,
      this._底座材质,
    );
    base.position.y = 0.2;
    applyShadow(base, 'castOnly');
    group.add(base);

    const stone = new THREE.Mesh(
      this._石圈几何,
      this._石圈材质,
    );
    stone.rotation.x = Math.PI / 2;
    stone.position.y = 0.35;
    group.add(stone);

    // 火苗的材质**逐座一份** —— 它在 `update` 里各自脉动（共用一份就是"一座在跳，全场在跳"）。
    const flame = new THREE.Mesh(
      this._火苗几何,
      new THREE.MeshStandardMaterial({
        color: 0xffaa44,
        emissive: 0xff6622,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.9,
      }),
    );
    flame.position.y = 1.0;
    flame.name = 'flame';
    group.add(flame);

    const ring = new THREE.Mesh(
      this._光环几何,
      this._光环材质,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);

    group.position.set(x, this.world.getGroundHeight(x, z), z);
    this.scene.add(group);

    const point = {
      id,
      name,
      position: new THREE.Vector3(x, 0, z),
      mesh: group,
      flame,
    };
    this.points.push(point);
    return point;
  }

  buildDefaults() {
    // 营火与它所在的位面共用一个 id（快速旅行、NPC 归属、地图标记都认它）；
    // 名字不在这儿拼，也不在任何地方再写一遍 —— 只有 `content/restPointNames.js` 那一张表
    // （W-B4 切片2：改前对话树自己抄了一份，于是站在同一座火边，提示说"世界之锚休息点"、
    //  一秒后开出来的对话标题说"世界之锚营火"，而 `magic` 抄的还是早已废弃的区名）
    this.addRestPoint(0, 55, this._expand(REST_POINT_NAMES[ZONE_IDS.HUB], ZONE_IDS.HUB), ZONE_IDS.HUB);
    this.addRestPoint(-200, 0, this._expand(REST_POINT_NAMES[ZONE_IDS.FANTASY], ZONE_IDS.FANTASY), ZONE_IDS.FANTASY);
    this.addRestPoint(0, -180, this._expand(REST_POINT_NAMES[ZONE_IDS.MAGIC], ZONE_IDS.MAGIC), ZONE_IDS.MAGIC);
    this.addRestPoint(200, 80, this._expand(REST_POINT_NAMES[ZONE_IDS.SPACE], ZONE_IDS.SPACE), ZONE_IDS.SPACE);
    this.addRestPoint(0, 210, this._expand(REST_POINT_NAMES[ZONE_IDS.VOID], ZONE_IDS.VOID), ZONE_IDS.VOID);
    this.addRestPoint(-200, 210, this._expand(REST_POINT_NAMES[ZONE_IDS.ABYSS], ZONE_IDS.ABYSS), ZONE_IDS.ABYSS);
    this.addRestPoint(180, 100, this._expand(REST_POINT_NAMES[ZONE_IDS.GLOOM], ZONE_IDS.GLOOM), ZONE_IDS.GLOOM);
    this.addRestPoint(-180, -160, this._expand(REST_POINT_NAMES[ZONE_IDS.RADIANT], ZONE_IDS.RADIANT), ZONE_IDS.RADIANT);
  }

  /**
   * 营火显示名的**唯一展开点**（W-D2 切片16i）。
   *
   * 名字表（`content/restPointNames.js`）存的是**文案键**，区名那一格用的是模板键
   * `rest_point_campfire_name`（`${zone}` 现取区域名）—— 于是"区名改口时营火跟着改"
   * 这条性质还在：两者是**同一次展开**算出来的，不是两份各自抄的。
   *
   * 展开放在 `world/` 而不是 `content/`：内容层是纯数据，不 import `engine/`。
   * 展开发生在**建营火那一刻**，世界里存的仍是显示名（与改前逐字相同）——
   * 于是"按名字认路"那条不变式（每座营火的名字互不相同）照样成立。
   */
  _expand(key, zoneId) {
    const zoneKey = restPointZoneKey(zoneId);
    return t(key, { zone: zoneKey ? t(zoneKey) : '' });
  }

  /**
   * 换语言时重算营火显示名（W-D2 切片33）。
   *
   * 名字在 `buildDefaults()` 那一刻展开成显示名存进 `point.name` —— 对话标题、
   * 交互提示、快速旅行面板、图鉴条目读的都是这一格。换语言不重建世界，只能在这里
   * 按**同一张表**（`REST_POINT_NAMES`，键就是营火 id）重新展开一遍。
   * 表里没有的 id（将来手工 `addRestPoint` 加的营火）不动 —— 那些名字本就是
   * 调用方递进来的定稿，不是键。
   * @returns {number} 重算的营火数（供门禁的分母）
   */
  refreshNames() {
    let n = 0;
    for (const p of this.points) {
      const key = REST_POINT_NAMES[p.id];
      if (!key) continue;
      p.name = this._expand(key, p.id);
      n += 1;
    }
    return n;
  }

  getNearest(pos, range = 4) {
    let best = null;
    let min = range;
    for (const p of this.points) {
      const d = Math.sqrt((pos.x - p.position.x) ** 2 + (pos.z - p.position.z) ** 2);
      if (d < min) { min = d; best = p; }
    }
    return best;
  }

  /** 营火 id 清单（图鉴筛选、成就统计都从这里取，不再各自抄一份表） */
  ids() {
    return this.points.map((p) => p.id);
  }

  /** id → 显示名。找不到返回 null，由调用方决定兜底文案（不许拿 id 冒充名字） */
  nameOf(id) {
    return this.points.find((p) => p.id === id)?.name ?? null;
  }

  update(dt) {
    this._时相 += dt;
    // 改前 `performance.now() * 0.003` = 每秒 3 弧度（B118）。实测时停那一档火苗仍抖
    // 0.279（缩放累计）/ 自发光脉动 1.356 —— 营火是玩家"安全"的视觉锚点，它比谁都跳得欢。
    const t = this._时相 * 3;
    for (const p of this.points) {
      if (p.flame) {
        p.flame.scale.y = 1 + Math.sin(t + p.position.x) * 0.15;
        p.flame.material.emissiveIntensity = 0.9 + Math.sin(t * 2) * 0.3;
      }
    }
  }

  /**
   * 拆干净：把八座营火从场景里摘掉，逐座释放火苗的材质，再释放那四份共享几何与三份共享材质。
   *
   * 为什么现在才有（W-C1 切片3c）：`Game._adopt` **拒绝**没有 `dispose()` 的子系统
   * （"假装收编"的防线），而这一层此前**没有** `dispose()` ⇒ 它从不被收编 ⇒
   * `Game.dispose()` 走完，它造的那些几何与材质**一份都不还**。
   *
   * 火苗的材质**逐座**释放（每座一份 —— 它们各自脉动），共享的那七份**只释放一次**。
   */
  dispose() {
    for (const p of this.points) {
      this.scene.remove(p.mesh);
      p.flame?.material?.dispose?.();
    }
    this.points.length = 0;
    this._底座几何?.dispose?.();
    this._石圈几何?.dispose?.();
    this._火苗几何?.dispose?.();
    this._光环几何?.dispose?.();
    this._底座材质?.dispose?.();
    this._石圈材质?.dispose?.();
    this._光环材质?.dispose?.();
  }
}
