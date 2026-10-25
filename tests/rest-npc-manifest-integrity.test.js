/**
 * 营火 NPC 资产清单完整性门禁 —— 钉 `assets/RestNpcManifest.js` 与
 * `assets/RestNpcAnimManifest.js`。
 *
 * 这两个 manifest 被 `RestNpcAnimDirector` / `RestNpcGesturePlayer` / 模型加载读取，
 * 但此前**零直接测试**。三类可回归契约：
 * 1. **三张表键对齐**：`REST_NPC_MODELS` / `REST_NPC_MIXAMO_INBOX` /
 *    `REST_NPC_POSE_POLICY` 必须覆盖**同一组 NPC id**。少登记一张表 → 那个 NPC 的
 *    policy 为 undefined，`layer.policy.defaultPose` 直接抛（"同一套数据两份定义、
 *    改一处漏一处"那族，只有横向对比能发现）。
 * 2. **模型形状**：每个模型 glb 非空字符串数组、scale 正数、rotY 有限、idleAnim /
 *    talkAnim 非空、sit 布尔。
 * 3. **手势形状 + 令牌**：每个手势 clipNames 非空字符串数组、duration 有限数、
 *    loop 布尔、fallback 为 'procedural_' 前缀；`onDialogue`/`defaultPose` 是
 *    消费端认得的令牌（`_onDialogueOpen` 只特判 stand/sitTalk）。
 *
 * 两枚变异探针走真数据（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect } from 'vitest';
import { REST_NPC_MODELS, REST_NPC_MIXAMO_INBOX } from '../src/assets/RestNpcManifest.js';
import { REST_NPC_GESTURES, REST_NPC_POSE_POLICY } from '../src/assets/RestNpcAnimManifest.js';

const MODEL_KEYS = Object.keys(REST_NPC_MODELS).sort();
const INBOX_KEYS = Object.keys(REST_NPC_MIXAMO_INBOX).sort();
const POLICY_KEYS = Object.keys(REST_NPC_POSE_POLICY).sort();

describe('营火 NPC 清单键对齐', () => {
  it('MODELS / MIXAMO_INBOX / POSE_POLICY 键集完全相同', () => {
    expect(MODEL_KEYS).toEqual(INBOX_KEYS);
    expect(MODEL_KEYS).toEqual(POLICY_KEYS);
  });

  it('键集恰为 6 个预期 NPC', () => {
    expect(MODEL_KEYS).toEqual(['abyss', 'fantasy', 'hub', 'magic', 'space', 'void']);
  });
});

describe('REST_NPC_MODELS 形状', () => {
  for (const [id, m] of Object.entries(REST_NPC_MODELS)) {
    it(`${id} 模型字段齐全`, () => {
      expect(Array.isArray(m.glb), 'glb 数组').toBe(true);
      expect(m.glb.length, 'glb 非空').toBeGreaterThan(0);
      expect(m.glb.every((p) => typeof p === 'string' && p.startsWith('/')), 'glb 均为 / 路径').toBe(true);
      expect(typeof m.scale, 'scale 数').toBe('number');
      expect(m.scale, 'scale 正').toBeGreaterThan(0);
      expect(Number.isFinite(m.rotY), 'rotY 有限').toBe(true);
      expect(Array.isArray(m.idleAnim), 'idleAnim 数组').toBe(true);
      expect(m.idleAnim.length, 'idleAnim 非空').toBeGreaterThan(0);
      expect(Array.isArray(m.talkAnim), 'talkAnim 数组').toBe(true);
      expect(m.talkAnim.length, 'talkAnim 非空').toBeGreaterThan(0);
      expect(typeof m.sit, 'sit 布尔').toBe('boolean');
    });
  }
});

describe('REST_NPC_GESTURES 形状', () => {
  for (const [key, def] of Object.entries(REST_NPC_GESTURES)) {
    it(`${key} 手势字段齐全`, () => {
      expect(Array.isArray(def.clipNames), 'clipNames 数组').toBe(true);
      expect(def.clipNames.length, 'clipNames 非空').toBeGreaterThan(0);
      expect(def.clipNames.every((n) => typeof n === 'string' && n.length > 0), 'clipNames 均非空串').toBe(true);
      expect(Number.isFinite(def.duration), 'duration 有限数').toBe(true);
      expect(typeof def.loop, 'loop 布尔').toBe('boolean');
      expect(typeof def.fallback, 'fallback 串').toBe('string');
      expect(def.fallback.startsWith('procedural_'), 'fallback 为 procedural_ 前缀').toBe(true);
    });
  }
});

describe('REST_NPC_POSE_POLICY 令牌合法', () => {
  it('每个 onDialogue ∈ {stand, sitTalk}（_onDialogueOpen 只特判这两个）', () => {
    for (const [npc, p] of Object.entries(REST_NPC_POSE_POLICY)) {
      expect(['stand', 'sitTalk'], `${npc}.onDialogue=${p.onDialogue}`).toContain(p.onDialogue);
    }
  });

  it('每个 defaultPose ∈ 已知姿态 {stand, sit, float, ghost}', () => {
    const poses = ['stand', 'sit', 'float', 'ghost'];
    for (const [npc, p] of Object.entries(REST_NPC_POSE_POLICY)) {
      expect(poses, `${npc}.defaultPose=${p.defaultPose}`).toContain(p.defaultPose);
    }
  });

  it('defaultPose 若为手势键（sit），该手势必须存在于 GESTURES', () => {
    for (const [npc, p] of Object.entries(REST_NPC_POSE_POLICY)) {
      if (REST_NPC_GESTURES[p.defaultPose]) {
        expect(REST_NPC_GESTURES[p.defaultPose], `${npc} → ${p.defaultPose}`).toBeDefined();
      }
    }
  });
});
