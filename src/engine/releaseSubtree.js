/**
 * 释放一棵子树里**属于它自己**的几何与材质（W-C1 切片3e）。
 *
 * ## 为什么要有这一个
 *
 * 「谁造的资源谁释放」这条纪律在动手前只能靠**逐个子系统手写** `dispose()` 兑现 ——
 * 而手写就会写出四十几份形状各异的遍历（有的要摘点光、有的要退池子、有的要连共享库一起算）。
 * 于是这里收成**一个**释放器：谁要拆自己那一棵，就调它。
 *
 * ## 归属的判据：`userData.shared`
 *
 * **共享库造出来的资源是进程生命周期的** —— 它们在别的系统里也用着，
 * 释放了就等于把别人的东西砸了（症状是"某个还在用的模型忽然没了纹理"）。
 *
 * 判据写成**一个标记**而不是某个库私有的集合，是为了让**新增共享库**时只要照这个标记走，
 * 释放器就认得它 —— 不必再改这一个文件：
 *
 * - `world/dungeonAssets.js` 的共享几何与共享材质已经带这个标记（`userData.shared = true`）；
 * - `assets/TextureLibrary.js` 的 `sharedMaterial()` 从本片起也带这个标记。
 *
 * **带标记的一律不释放**；没带标记的默认是**它自己的**，释放。
 */

/** 这一份资源是不是共享库造的（共享库造的不由使用方释放） */
export function isSharedResource(x) {
  return x?.userData?.shared === true;
}

/**
 * 释放一棵子树：把子节点摘下来，把**没带共享标记**的几何与材质 `dispose()` 掉。
 *
 * @param {THREE.Object3D} root 树根（它自己身上的资源也会被释放）
 * @returns {{ geometries: number, materials: number }} 释放了多少份（给门禁对账用）
 */
export function releaseSubtree(root) {
  let geometries = 0;
  let materials = 0;

  const 释放材质 = (m) => {
    if (!m || isSharedResource(m)) return;
    m.dispose?.();
    materials += 1;
  };

  const 释放网格 = (o) => {
    if (o.geometry && !isSharedResource(o.geometry)) {
      o.geometry.dispose?.();
      geometries += 1;
    }
    const m = o.material;
    if (Array.isArray(m)) m.forEach(释放材质);
    else 释放材质(m);
  };

  释放网格(root);
  for (const child of [...root.children]) {
    root.remove(child);
    child.traverse(释放网格);
  }

  return { geometries, materials };
}
