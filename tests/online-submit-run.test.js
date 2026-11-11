/**
 * W-X8：在线排行榜提交接线（source 断言，同 W-X6 的纪律）
 * —— Boss 击杀时由 Game.js 里那个 boss-defeated 监听器提交通关记录。
 *
 * 这里钉四件事：
 * 1) 构造函数压了 runStartedAt（缺了它 clearTimeMs 就是 NaN/undefined —— 榜上会出现脏值）；
 * 2) boss-defeated 里仍然先走 telemetry（W-X2 的接线这次不许被切错）；
 * 3) submitRun 拿到的是四字段 record（runner/bossId/clearTimeMs/chapter），
 *    且 clearTimeMs 用 Math.max(1, …) 夹住（时钟倒挂不上传负数）；
 * 4) online-services.submitRun 在 OnlineServices 里确实存在（悬空的话 import 也过、测试会更先红）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const GAME = readFileSync(join(ROOT, 'src/core/Game.js'), 'utf8');
const SERVICE = readFileSync(join(ROOT, 'src/online/OnlineServices.js'), 'utf8');

describe('runStartedAt 在构造函数压了', () => {
  it('constructor 末尾有 this.runStartedAt 赋值（online 才有意义）', () => {
    expect(GAME).toContain('this.runStartedAt =');
    expect(GAME).toContain("typeof performance !== 'undefined'");
  });
});

describe('boss-defeated 监听器', () => {
  const i = GAME.indexOf("'boss-defeated',");
  const body = GAME.slice(i, i + 1400);

  it('先走 postTelemetry（W-X2 接线不许被改错）', () => {
    expect(body).toContain('onlineServices.postTelemetry');
  });
  it('提交 submitRun，四字段 record（bossId 读事件真 payload）', () => {
    expect(body).toContain('onlineServices.submitRun({');
    expect(body).toContain('runner:');
    expect(body).toContain("const bossId = e?.detail?.bossId ?? ''");
    expect(body).toContain('clearTimeMs,');
    expect(body).toContain('chapter:');
  });
  it('clearTimeMs 夹下界（时钟倒挂不传负数），从 runStartedAt 推', () => {
    expect(body).toContain('Math.max(1,');
    expect(body).toContain('fightStart ?? this.runStartedAt ?? now');
  });
});

describe('OnlineServices.submitRun 存在', () => {
  it('submitRun(record) 定义在 class 里', () => {
    expect(SERVICE).toContain('submitRun(record)');
    expect(SERVICE).toContain("'/api/leaderboard'");
  });
});
