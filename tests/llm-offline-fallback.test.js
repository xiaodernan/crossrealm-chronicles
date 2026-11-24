import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LLM API 关闭后的前端降级总账（W-Z519）。
 *
 * 每个调用 LLM 的消费者都必须对 `res.ok === false` / 异常给出确定性回退，
 * 否则玩家看到的是空白、永久 loading 或未捕获异常。这里逐文件钉住那条兜底腿
 * ——静态门禁不跑浏览器，但能挡住「重构时把 else 分支删掉」这种回归。
 */
const 读 = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('LLM 端点不可用时每个消费者都有确定性降级', () => {
  it('顾问面板：503 与六种 reason 各自有文案，且不会卡在 pending', () => {
    const s = 读('src/ui/AdvisorPanel.js');
    expect(s).toContain('advisor_error_offline_mode');
    expect(s).toContain('advisor_error_unavailable');
    expect(s).toContain('this._setPending(false)');
  });

  it('守夜人指路：失败回退到确定性提示并记录 unavailable', () => {
    const s = 读('src/ui/QuestAssistant.js');
    expect(s).toMatch(/qa_guide_unavailable/);
    expect(s).toMatch(/mood: 'unavailable'/);
  });

  it('Boss 余火回响 / 执笔人 / 烬火答：失败后不留下空气泡', () => {
    const verse = 读('src/game/BossVerseSystem.js');
    const epitaph = 读('src/game/DeathHintDirector.js');
    const letter = 读('src/game/KindleLetterSystem.js');
    expect(verse).toMatch(/if \(!line\)[\s\S]{0,160}?return/);
    expect(epitaph).toMatch(/\.catch\(\(\) =>/);
    expect(letter).toMatch(/reason: 'unavailable'/);
  });

  it('回声灯：失败回退到 pc_echo_ask_failed，按钮可再点', () => {
    const s = 读('src/ui/PopCultureJournalTab.js');
    expect(s).toContain('pc_echo_ask_failed');
    expect(s).toMatch(/btn\.disabled = false/);
  });

  it('片尾裁决：解析失败就什么都不加，不让片尾卡住', () => {
    const s = 读('src/cinematic/EndCreditsDirector.js');
    expect(s).toMatch(/if \(!parsed\) return/);
  });

  it('典籍叩问离线：服务端返回逐字摘录而非 503，前端不计入上游统计', () => {
    const java = 读('server/ai-service/src/main/java/com/crossrealm/chronicles/ai/lore/LoreOracleService.java');
    expect(java).toContain('oracle-bm25-offline');
    expect(java).toContain('AdvisorUnavailableException');
    const panel = 读('src/ui/AdvisorPanel.js');
    expect(panel).toContain('data.offline !== true');
  });
});
