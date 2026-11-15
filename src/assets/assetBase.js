/**
 * public/ 静态资源的**部署基址**（W-Z110）。
 *
 * ## 为什么需要它
 *
 * Vite 的 `base` 只影响**构建产物里**的 ESM import 与 `<script>` 标签；
 * 运行时用绝对字面路径（`/assets/models/player.glb`）直接 fetch / load 的文件
 * 一个都不认 `base` —— 于是 Pages 把游戏部署在子路径
 * `https://xiaodernan.github.io/crossrealm-chronicles/game/` 时，
 * 所有模型 / 贴图都去主页根域 `https://xiaodernan.github.io/` 下找，
 * 实测全线 404/503（地图、角色、NPC 全部裸奔）。
 *
 * `import.meta.env.BASE_URL` 在**构建期**内联进产物：本地 dev / preview 是 `/`，
 * Pages 是 `/crossrealm-chronicles/game/` —— 两边都正确，不引入运行时判断。
 *
 * ## 用法
 * `assetUrl('textures/grass_diff.jpg')` → 本地 `/textures/grass_diff.jpg`，
 * Pages → `/crossrealm-chronicles/game/textures/grass_diff.jpg`。
 * 传入的 path 可以带或不带前导斜杠（CDN 回退用**不经过**本函数）。
 */
const RAW_BASE = import.meta.env.BASE_URL ?? '/';

export const ASSET_BASE = String(RAW_BASE).replace(/\/+$/, '');

/** @param {string} path public/ 下的资源路径（可有可无前导 `/`） */
export function assetUrl(path) {
  const clean = String(path ?? '').replace(/^\/+/, '');
  return `${ASSET_BASE}/${clean}`;
}
