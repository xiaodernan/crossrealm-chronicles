/**
 * 对话框自滚门禁（W-E3 切片59）—— 12 格选项在窄而矮的视口里溢出。
 *
 * 2026-11-06 真浏览器读数（headless Chrome，390×844，页面内把枢纽营火的
 * `choice_final_keep` / `choice_final_quiet` 两枚决策都补上，再 `restDialogue.start(hub)`）：
 * `.dialog-box` 高 **925px**、`top: -40.5` / `bottom: 884.5` —— 上下一起被裁；
 * 「继续探索」那一键底边 **851.5**，比视口多 7.5px。而 `#dialog-overlay` 是
 * `position: fixed` 的 flex 居中容器，文档 `scrollHeight == clientHeight == 844`，
 * **页面本身没有可滚高度** ⇒ 滚也滚不到，键盘焦点落上去也只是把按钮带出可视区外。
 *
 * 修法只用 CSS：`.dialog-box` 自己成为滚动容器（`max-height: 88vh` + `overflow-y: auto`），
 * 选项再多也只是盒子内部滚动；焦点移到下方按钮时浏览器会把它带进可视区。
 *
 * 这条是静态腿：真机读数记在 §9。反向控制把两条声明删掉，同一把尺必须点名 ——
 * 防它退化成恒真。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const 样式 = readFileSync(join(process.cwd(), 'src/style.css'), 'utf8').replace(/\r\n/g, '\n');

function 规则Of(源, 选择器) {
  const m = 源.match(new RegExp(`^${选择器.replace(/[.#]/g, (c) => `\\${c}`)} \\{([^}]*)\\}`, 'm'));
  expect(m, `style.css 里找不到 ${选择器} 规则`).not.toBeNull();
  return m[1];
}

/** 布局问题：返回空数组才算过（与 `end-credits-layout` 同一形状，反向控制才咬得住） */
function 布局问题(规则) {
  const 问 = [];
  const 高 = 规则.match(/max-height:\s*([\d.]+)vh/);
  if (!高) 问.push('对话框没有随视口收缩的 max-height（vh）—— 比视口高时上下一起被裁');
  else if (Number(高[1]) > 90) 问.push(`max-height 是 ${高[1]}vh，超过 90vh 等于没留边`);
  else if (Number(高[1]) <= 0) 问.push('max-height 必须大于 0');
  if (!/overflow-y:\s*(auto|scroll)/.test(规则)) 问.push('对话框自己不滚 —— 溢出时关闭键落在视口外且页面滚不动');
  if (/overflow:\s*hidden/.test(规则)) 问.push('对话框把溢出藏了 —— 藏起来不等于够得着');
  return 问;
}

describe('对话框自滚（W-E3 切片59）', () => {
  it('盒子自己限高并滚动：88vh + overflow-y auto', () => {
    expect(布局问题(规则Of(样式, '.dialog-box'))).toEqual([]);
  });

  it('居中容器是 fixed flex —— 滚的必须是盒子，不是文档（文档没有可滚高度）', () => {
    const 遮罩 = 规则Of(样式, '#dialog-overlay');
    expect(遮罩, '#dialog-overlay 不再是 fixed 居中容器 —— 这条前提变了，读数要重写').toContain('position: fixed');
    expect(遮罩).toContain('align-items: center');
    expect(遮罩.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/overflow-y:\s*(auto|scroll)/);
  });

  it('反向控制：删掉 max-height 与 overflow-y 必须被逐条点名', () => {
    const 旧 = 规则Of(样式, '.dialog-box')
      .replace(/max-height:\s*[\d.]+vh;?/, '')
      .replace(/overflow-y:\s*(auto|scroll);?/, '');
    expect(布局问题(旧)).toEqual([
      '对话框没有随视口收缩的 max-height（vh）—— 比视口高时上下一起被裁',
      '对话框自己不滚 —— 溢出时关闭键落在视口外且页面滚不动',
    ]);
  });
});
