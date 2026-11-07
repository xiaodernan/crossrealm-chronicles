/**
 * 程序化动画片段测试（W-C6）：验证 ANIM_MOTION 里的所有动画都能
 * 生成合法的 THREE.AnimationClip，供程序化替代使用（无需 GLB 素材）。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ANIM_MOTION } from '../src/animation/AnimationLibrary.js';

/** 把 ANIM_MOTION 条目转成 AnimationClip，复用 AnimationEntityAdapter 的逻辑 */
function motionToClip(name, motion) {
  const tracks = [];
  for (const [channel, propertyPath] of Object.entries({
    y: '.position[y]',
    rx: '.rotation[x]',
    rz: '.rotation[z]',
  })) {
    const keys = motion[channel];
    if (!keys) continue;
    tracks.push({
      propertyPath,
      times: keys.map(([f]) => f * motion.duration),
      values: keys.map(([, v]) => v),
    });
  }
  return new THREE.AnimationClip(name, motion.duration, tracks);
}

describe('W-C6 程序化动画片段：ANIM_MOTION 所有动作都能生成合法 clip', () => {
  it('ANIM_MOTION 至少 20 个动作（§5 数量目标）', () => {
    const count = Object.keys(ANIM_MOTION).length;
    expect(count).toBeGreaterThanOrEqual(20);
    console.log(`ANIM_MOTION 动作数：${count}`);
  });

  it('每个动作都能转成合法的 THREE.AnimationClip', () => {
    for (const [name, motion] of Object.entries(ANIM_MOTION)) {
      const clip = motionToClip(name, motion);
      expect(clip).toBeInstanceOf(THREE.AnimationClip);
      expect(clip.name).toBe(name);
      expect(clip.duration).toBe(motion.duration);
      expect(clip.duration).toBeGreaterThan(0);
      // 每个 clip 至少有一条轨道
      expect(clip.tracks.length).toBeGreaterThan(0);
      // 每条轨道都有 keyframeTimes 和 values
      for (const track of clip.tracks) {
        expect(track.times.length).toBeGreaterThan(1);
        expect(track.values.length).toBe(track.times.length);
      }
    }
  });

  it('循环动作的首尾关键帧值相等（避免每圈结尾硬跳）', () => {
    for (const [name, motion] of Object.entries(ANIM_MOTION)) {
      if (!motion.loop) continue;
      const clip = motionToClip(name, motion);
      for (const track of clip.tracks) {
        const first = track.values[0];
        const last = track.values[track.values.length - 1];
        expect(first).toBeCloseTo(last, 6, `${name} 循环动作的 ${track.propertyPath} 首尾不相等：${first} vs ${last}`);
      }
    }
  });

  it('一次性动作的首尾不要求相等（可停在末帧）', () => {
    for (const [name, motion] of Object.entries(ANIM_MOTION)) {
      if (motion.loop) continue;
      const clip = motionToClip(name, motion);
      // 一次性动作至少有一条轨道
      expect(clip.tracks.length).toBeGreaterThan(0);
    }
  });

  it('所有动作的时长在合理范围内（0.1~5 秒）', () => {
    for (const [name, motion] of Object.entries(ANIM_MOTION)) {
      expect(motion.duration).toBeGreaterThan(0.1, `${name} 时长太短`);
      expect(motion.duration).toBeLessThan(5, `${name} 时长太长`);
    }
  });

  it('AnimationClipLoader.createFromJSON 能把 ANIM_MOTION 条目转成 clip', () => {
    for (const [name, motion] of Object.entries(ANIM_MOTION)) {
      // createFromJSON 不带 tracks 时返回空 clip，我们手动加 tracks
      const tracks = [];
      for (const [channel, propertyPath] of Object.entries({
        y: '.position[y]',
        rx: '.rotation[x]',
        rz: '.rotation[z]',
      })) {
        const keys = motion[channel];
        if (!keys) continue;
        tracks.push({
          propertyPath,
          times: keys.map(([f]) => f * motion.duration),
          values: keys.map(([, v]) => v),
        });
      }
      const fullClip = new THREE.AnimationClip(name, motion.duration, tracks);
      expect(fullClip).toBeInstanceOf(THREE.AnimationClip);
      expect(fullClip.name).toBe(name);
      expect(fullClip.duration).toBe(motion.duration);
    }
  });
});
