import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { HIT } from '../content/tuning.js';

/** 一条飘字的完整寿命（秒） */
const LIFE = 0.9;

/**
 * 飘字的**种类**：每一条都带"除颜色以外还看得出差别"的冗余（W-D6 切片2）。
 *
 * 改前暴击与普通伤害**只靠颜色区分**（`hit.crit ? '#ff5566' : s.color`，两处调用点），
 * 对红绿色觉异常就等于没有区分。这里给每种 kind 三样东西：
 *   - `cls`：CSS 类，用来给**字号**拉开档（见 `style.css` 的 `.dn-*`）；
 *   - `prefix` / `suffix`：文本上的记号（治疗 `+`、暴击 `!`）。
 *
 * 于是"这一下是不是暴击"在**关掉颜色**之后仍然读得出来。
 * `kind` 认不出就抛（与 `sfx:play` / `shadowClassOf` 同一口径）——
 * 静默给个默认值等于让"写错种类名"变成"这一下悄悄显示成普通伤害"。
 */
/**
 * 飘字种类表 —— 每种带**非颜色冗余**（W-D6 切片2）。
 *
 * `label` 是**文案键**（W-D2 切片16d），不是文案本身：它是"颜色之外再给一份冗余"
 * 里的那个**词**（普通 / 暴击 / 治疗 / 低效），显示侧在需要说它时 `t()` 展开。
 * `cls` / `prefix` / `suffix` 不用翻译 —— 那是字号档与文本记号，语言无关。
 */
export const DAMAGE_KINDS = Object.freeze({
  normal: Object.freeze({ cls: 'dn-normal', prefix: '', suffix: '', label: 'damage_kind_normal' }),
  crit: Object.freeze({ cls: 'dn-crit', prefix: '', suffix: '!', label: 'damage_kind_crit' }),
  heal: Object.freeze({ cls: 'dn-heal', prefix: '+', suffix: '', label: 'damage_kind_heal' }),
  weak: Object.freeze({ cls: 'dn-weak', prefix: '', suffix: '', label: 'damage_kind_weak' }),
});

export const DAMAGE_KIND_IDS = Object.freeze(Object.keys(DAMAGE_KINDS));

/** 取一种飘字种类；认不出就抛（说得出有哪些） */
export function damageKindOf(kind) {
  const hit = DAMAGE_KINDS[kind];
  if (!hit) {
    throw new Error(`damageKindOf: 未知的飘字种类 "${kind}"，可用的是 ${DAMAGE_KIND_IDS.join(' / ')}`);
  }
  return hit;
}

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

  /**
   * @param {object} position 世界坐标
   * @param {string} text 数字本体（不含种类记号）
   * @param {string} [color] 颜色
   * @param {string} [kind] 种类，见 `DAMAGE_KINDS`；决定**非颜色冗余**（字号与前后缀）
   */
  spawn(position, text, color = '#ffcc44', kind = 'normal') {
    const k = damageKindOf(kind);
    const e = this.free.pop() ?? this._takeOldest();
    if (!e) return null;
    // `className` 每次**整体重设**而不是 `classList.add`：这一池子对象是复用的，
    // 只加不减会让上一条暴击的 `dn-crit` 留在下一条普通伤害身上 —— 那正好把
    // "非颜色冗余"变成假信息（普通伤害看起来像暴击）。
    e.div.className = `damage-number ${k.cls}`;
    e.div.textContent = `${k.prefix}${text}${k.suffix}`;
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
