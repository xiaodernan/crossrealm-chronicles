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
