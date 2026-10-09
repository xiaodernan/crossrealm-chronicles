/**
 * 构建期内容校验插件的门禁（W-B1 余项）。
 *
 * 五层，每层各管一件事：
 *
 * 1. **接线**：`vite.config.js` 真的把这个插件挂上了（按名字认，且只挂一次）。
 *    "写好了插件但没人挂"是这一族最常见的死法 —— 文件在、用例绿、构建照旧不校验。
 * 2. **判据只有一份**：`registryUrl(root)` 指向的模块 == 本文件静态 import 的那一个文件。
 *    这一条同时钉住"锚是项目根"（第一版用相对说明符，Vite 把配置打进根部临时包后
 *    `../src/…` 变成 `D:/src/…`，`npm run build` 当场 ERR_MODULE_NOT_FOUND）。
 * 3. **真仓库零错**：注册表非空（防空跑）+ `checkContent()` 返回空数组。
 * 4. **坏表真的拦得住构建**：注入会返回错误的假判据，`configResolved()` 必须 **reject**，
 *    报文里要有条数与每一条原文；好判据必须放行；且 root 真的取自配置。
 * 5. **装载器契约**：模块不导出 `checkContent` 时给可读的 TypeError。
 *
 * 限度：真装载器那一步（动态 `import()`）在本环境里跑不到 —— vitest 的模块运行器吃不消
 * 百分号编码的 id（`Failed to load url … Does the file exist?`），沙箱又起不了子进程
 * （`spawnSync … EBUSY`）。它由第 2 层的路径互证 + 纯 Node 实跑 + 真 `vite build` 读数
 * 背书（§9 ADR），不在用例里假装覆盖过。
 */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import config from '../vite.config.js';
import {
  CONTENT_CHECK_PLUGIN, CONTENT_REGISTRY_REL, contentCheckPlugin, contentErrorText,
  registryUrl, runContentCheck,
} from '../scripts/vite-plugin-content-check.mjs';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';

const ROOT = process.cwd();

describe('构建期内容校验插件', () => {
  it('`vite.config.js` 真的挂上了它，且只挂一次', () => {
    const plugins = config.plugins ?? [];
    const 命中 = plugins.filter((p) => p?.name === CONTENT_CHECK_PLUGIN);
    expect(命中.length, `plugins 里没有名为 ${CONTENT_CHECK_PLUGIN} 的插件 —— 构建期校验没有入口`).toBe(1);
    expect(typeof 命中[0].configResolved, '挂上的那一个没有 configResolved').toBe('function');
    expect(
      命中[0].buildStart,
      '不该同时挂 buildStart：dev 下它不是每条路径都被 await，会退化成一条未处理拒绝'
    ).toBeUndefined();
  });

  it('装载器指向的就是被静态 import 的那份注册表（锚是项目根，不是模块位置）', () => {
    expect(CONTENT_REGISTRY_REL).toBe('src/content/registry.js');
    const 装载器 = registryUrl(ROOT);
    expect(装载器.protocol).toBe('file:');
    expect(fileURLToPath(装载器)).toBe(
      fileURLToPath(new URL('../src/content/registry.js', import.meta.url))
    );
    // 换一个 root，锚跟着 root 走（不是相对本模块解析）
    expect(fileURLToPath(registryUrl(join(ROOT, 'src'), '../src/content/registry.js')))
      .toBe(fileURLToPath(装载器));
  });

  /**
   * 「非 ASCII 路径必须被编码」这一条，改前写成 `expect(href).toMatch(/%E5%A4%A7%E4%BD%9C/)` ——
   * 那是拿**本项目目录的名字**当证明（B104）：目录叫别的名字、或者检出到 ASCII 路径的机器上，
   * 装载器做得完全正确也照样红。分离平面实测命中的正是这一条。现在条件由本用例自己造。
   *
   * 夹具里必须有 `#`：变异臂量出来，CJK 与空格**分不开** `pathToFileURL` 与手拼
   * `new URL('file:///' + p)` —— URL 解析器也会编码它们。只有 `#` 会被解析器当成 fragment
   * 起点，把路径尾巴整段吃掉（落点截成 `D:\proj\大作 `）。"编码无损"判的正是这件事。
   */
  it('非 ASCII、空格与 # 都会被编码，而且编码无损（条件自己造，不靠项目目录碰巧叫什么）', () => {
    const 段 = '大作 #测试 目录'; // 非 ASCII + 空格 + `#`：少一个都少证一分
    expect([...段].some((c) => c.codePointAt(0) > 0x7f), '夹具退化成纯 ASCII，这条就不再证任何编码').toBe(true);
    expect(段.includes('#'), '夹具里没有 #：手拼 URL 与 pathToFileURL 就分不开').toBe(true);
    const url = registryUrl(join(process.cwd(), 段));
    expect(url.protocol).toBe('file:');
    expect(url.href, `href 里还留着原文 "${段}" —— 那就是手拼 file:// 的写法`).not.toContain(段);
    // 判据说的是"href 里不许有非 ASCII、也不许有裸空格"，这才是被编码这件事本身
    expect([...url.href].every((c) => c.codePointAt(0) <= 0x7f), `href 里还有没编码的字符：${url.href}`).toBe(true);
    expect(url.href, `href 里还有裸空格：${url.href}`).not.toContain(' ');
    // `#` 是 ASCII，上面那条管不住它 —— 它一旦漏进 href 就变成 fragment 的起点
    expect(url.hash, `有一个 # 没被编码，路径被切成 fragment：${url.href}`).toBe('');
    expect(url.href).toContain(encodeURIComponent(段));
    // 编码还得无损：构建期的消费者用 fileURLToPath 读回来，要找的模块路径必须原样对得上
    const 落点 = fileURLToPath(url).replace(/\\/g, '/');
    expect(落点.endsWith(`/${段}/${CONTENT_REGISTRY_REL}`), `落点是 ${落点}`).toBe(true);
  });

  it('真仓库当前零错，且注册表非空（防空跑）', () => {
    expect(CONTENT_TABLES.length, '注册表是空的 —— 这条断言会空转').toBeGreaterThan(0);
    expect(checkContent()).toEqual([]);
  });

  it('坏表真的拦得住构建：报文带条数，且每一条原文都在里面', async () => {
    const 假错 = ['zones[3].id: id "a-1" 与 zones[1] 重复', 'gear[0].mods: 不许是空对象', 'restDialogues["hub"]: 缺 start'];
    const plugin = contentCheckPlugin({ check: () => 假错 });
    await expect(plugin.configResolved({ root: ROOT })).rejects.toThrow(/内容表校验未通过（3 处）/);
    await expect(plugin.configResolved({ root: ROOT })).rejects.toThrow('zones[3].id');
    await expect(plugin.configResolved({ root: ROOT })).rejects.toThrow('restDialogues["hub"]: 缺 start');
    // 报文形状只有一处定义
    expect(contentErrorText(假错)).toContain('（3 处）');
    expect(contentErrorText(假错).split('\n  - ').length - 1).toBe(3);
  });

  it('好表放行，且 root 真的取自解析后的配置', async () => {
    const 收到 = [];
    const plugin = contentCheckPlugin({ check: (root) => { 收到.push(root); return []; } });
    await expect(plugin.configResolved({ root: '/某个/根' })).resolves.toBeUndefined();
    expect(收到, 'root 没从 configResolved 的 config 里取 —— 装载器就会去猜 cwd').toEqual(['/某个/根']);
    // config 缺失时回落 cwd（不抛）
    await expect(plugin.configResolved()).resolves.toBeUndefined();
    expect(收到[1]).toBe(process.cwd());
  });

  it('装载器契约：模块不导出 checkContent 时给可读的 TypeError', async () => {
    await expect(runContentCheck(ROOT, async () => ({}))).rejects.toThrow(TypeError);
    await expect(runContentCheck(ROOT, async () => ({}))).rejects.toThrow(/没有导出 checkContent/);
    // 反面：导出且返回错误时，原样交出来（装载器不替判据做判断）
    expect(await runContentCheck(ROOT, async () => ({ checkContent: () => ['x'] }))).toEqual(['x']);
  });
});
