import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { HIT } from '../content/tuning.js';

/** 一条飘字的完整寿命（秒） */
const LIFE = 0.9;

/**
 * 伤害飘字 —— 定容量对象池。
 *
 * 旧实现每次命中都 `document.createElement` + 新建 `CSS2DObject` + `scene.add/remove`，
 * 再在到期时把 DOM 节点从渲染层里摘掉：一套连击能瞬间造出十几个节点，
 * 而 CSS2DRenderer 的元素表随增删反复抖动（B29）。
 * 现在构造期一次性建好 `cap` 条（创建者＝本类，销毁者＝`dispose()`），
 * 运行期只改文本/颜色/位置并切换 `visible`，不再有任何分配。
 * 池满时复用最旧的一条 —— 飘字是"最近发生了什么"，不是必须全部显示的历史。
 */
export class DamageNumbers {
  constructor(scene, cap = HIT.numberPool) {
    this.scene = scene;
    this.life = LIFE;
    /** 空闲槽与在用槽：两条数组互为镜像，任何时刻总数恒为 cap */
    this.free = [];
    this.active = [];
    for (let i = 0; i < cap; i++) {
      const div = document.createElement('div');
      div.className = 'damage-number';
      const label = new CSS2DObject(div);
      label.visible = false;
      scene.add(label);
      this.free.push({ label, div, life: 0, velocity: 0 });
    }
  }

  spawn(position, text, color = '#ffcc44') {
    const e = this.free.pop() ?? this._takeOldest();
    if (!e) return null;
    e.div.textContent = text;
    e.div.style.color = color;
    // 同一目标连续掉血会叠在同一像素上，给一点水平散布
    e.label.position.set(
      position.x + (Math.random() - 0.5) * 0.36,
      position.y + 2.2,
      position.z + (Math.random() - 0.5) * 0.36
    );
    e.label.visible = true;
    e.div.style.opacity = '1';
    e.life = this.life;
    e.velocity = 1.2 + Math.random() * 0.5;
    this.active.push(e);
    return e;
  }

  _takeOldest() {
    const e = this.active.shift();
    if (e) this._hide(e);
    return e;
  }

  _hide(e) {
    e.label.visible = false;
    e.life = 0;
  }

  /** 在用条数 —— 观察者接口，供性能 HUD 与测试读取 */
  activeCount() {
    return this.active.length;
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.active.splice(i, 1);
        this._hide(e);
        this.free.push(e);
        continue;
      }
      e.label.position.y += e.velocity * dt;
      e.div.style.opacity = (e.life / this.life).toFixed(3);
    }
  }

  /** 场景销毁/热重载路径上的显式释放：DOM 节点与渲染器元素表都要收干净 */
  dispose() {
    for (const e of [...this.free, ...this.active]) {
      this.scene.remove(e.label);
      e.div.remove();
    }
    this.free.length = 0;
    this.active.length = 0;
  }
}
