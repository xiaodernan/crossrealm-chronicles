import { Game } from './core/Game.js';

function showBootError(msg) {
  const loading = document.getElementById('loading');
  const err = document.getElementById('boot-error');
  const start = document.getElementById('start-screen');
  loading?.classList.add('hidden');
  start?.classList.remove('hidden');
  if (err) {
    err.textContent = msg;
    err.classList.remove('hidden');
  }
}

function bindStartScreen(game) {
  const start = document.getElementById('start-screen');
  const btn = document.getElementById('start-btn');
  if (!start || !btn) return;

  const enter = () => {
    start.classList.add('hidden');
    const canvas = game.renderer?.domElement;
    if (canvas?.requestPointerLock) {
      canvas.requestPointerLock().catch(() => {
        game.dialog?.toast?.('请点击画面中央再次锁定鼠标', 3500);
      });
    }
  };

  btn.addEventListener('click', enter);
  start.addEventListener('click', (e) => {
    if (e.target === start) enter();
  });
}

async function boot() {
  const loading = document.getElementById('loading');
  const start = document.getElementById('start-screen');

  if (window.location.protocol === 'file:') {
    showBootError('不能直接双击打开 HTML。\n请在项目目录运行 npm run dev，然后访问 http://localhost:5173');
    return;
  }

  /* 内容表校验（W-B1 切片2）：`content/registry.js` 在模块顶层跑 `assertContent()`，
   * 所以"能不能进这个模块"就是"表过不过"。刻意用**动态 import** 而不是文件顶上那句
   * 静态 import —— 静态 import 的求值发生在 `main.js` 正文之前，错表那条 Error 只会
   * 成为控制台里一条 uncaught，页面什么都不显示（真机读数 S1 量到的正是这个：
   * 加载遮罩永远转圈、`#boot-error` 空着、等到 30 秒超时）。放进 try 之后同一条 Error
   * 落到 `showBootError`：错表仍然在 `new Game()` 之前红，而且红得看得见。 */
  try {
    await import('./content/registry.js');
  } catch (e) {
    console.error(e);
    // 直接用它自己那句话（`assertContent` 已经把路径与全部错列好了），前缀反而会重复一遍
    showBootError(String(e?.message ?? e));
    return;
  }

  let game;
  try {
    game = new Game(document.body);
  } catch (e) {
    console.error(e);
    showBootError(`游戏初始化失败：${e?.message ?? e}\n请按 F12 查看控制台详情。`);
    return;
  }

  try {
    await game.player.modelReady;
  } catch (e) {
    console.warn('角色模型加载失败，使用占位体', e);
  }

  loading?.classList.add('hidden');
  start?.classList.remove('hidden');
  bindStartScreen(game);
  game.run();

  if (import.meta.env.DEV) window.__game = game;
}

boot().catch((e) => {
  console.error(e);
  showBootError(String(e?.message ?? e));
});
