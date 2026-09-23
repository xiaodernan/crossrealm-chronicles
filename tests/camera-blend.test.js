/**
 * `engine/CameraRig.js` —— 所有权交接补间（W-A5 切片1，短板 A4）。
 *
 * 痛点：进出过场 / 观看模式时，机位的写入者在一帧里从"玩家"换成"过场"，两处算出的机位
 * 差着十万八千里，于是画面硬切一下。收口方案不是"谁来插一帧过渡"（那又是要记得收尾的义务），
 * 而是让 rig 认得**所有权**：所有者不变的每一帧直接落笔（调用方自己已经做了阻尼，rig 不叠第二层）；
 * 所有者**变更**的那一帧，rig 从当前画面缓动到新目标，`commitView(dt)` 每帧推一把。
 *
 * 这里刻意只测协议，不测"好不好看"：谁能触发补间、补间能不能走完、走完后有没有残留。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraRig, DEFAULT_VIEW_OWNER } from '../src/engine/CameraRig.js';
import { CAMERA_FOV, CAMERA_BLEND } from '../src/content/tuning.js';

const mk = () => {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV.third, 1, 0.1, 100);
  const rig = new CameraRig(camera);
  return { camera, rig };
};
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const at = (rig, pos, look, opts) => rig.setView(pos, look, opts);

describe('稳定所有者：直接落笔，不叠第二层阻尼', () => {
  it('首次认领就算没有 commitView 也当场到位（既有合同靠这个）', () => {
    const { camera, rig } = mk();
    at(rig, v(1, 2, 3), v(4, 5, 6), { owner: 'player', transition: 0.5 });
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(rig.blending).toBe(false);
    expect(rig.viewOwner).toBe('player');
  });

  it('同一所有者每帧重报新机位：相机逐帧精确跟随目标，不拖尾', () => {
    const { camera, rig } = mk();
    at(rig, v(0, 0, 0), v(0, 1, 0), { owner: 'player' });
    for (let i = 1; i <= 5; i++) {
      at(rig, v(i, 0, 0), v(i, 1, 0), { owner: 'player', transition: CAMERA_BLEND.exit });
      // 没有交接 → 不该起补间；不 commitView 也应已经落位
      expect(rig.blending).toBe(false);
      expect(camera.position.x).toBe(i);
    }
  });

  it('不传 owner 落到默认所有者，且默认所有者之间也算稳定', () => {
    const { camera, rig } = mk();
    at(rig, v(2, 0, 0), v(0, 0, 0));
    expect(rig.viewOwner).toBe(DEFAULT_VIEW_OWNER);
    at(rig, v(3, 0, 0), v(0, 0, 0));                // 仍是默认所有者 → 无补间
    expect(rig.blending).toBe(false);
    expect(camera.position.x).toBe(3);
  });
});

describe('所有权交接：从当前画面缓动到新目标', () => {
  it('换所有者那一帧起补间，相机先不跳到目标', () => {
    const { camera, rig } = mk();
    at(rig, v(0, 0, 0), v(0, 1, 0), { owner: 'player' });   // 停在原点
    at(rig, v(10, 0, 0), v(10, 1, 0), { owner: 'cinematic', transition: 1 });
    expect(rig.blending).toBe(true);
    expect(rig.viewOwner).toBe('cinematic');
    expect(camera.position.x).toBe(0);                       // 一帧都没动，等 commitView 推
  });

  it('commitView 用 smoothstep 推进：过半时正好走一半，走满 dur 秒精确到位并收尾', () => {
    const { camera, rig } = mk();
    at(rig, v(0, 0, 0), v(0, 1, 0), { owner: 'player' });
    at(rig, v(10, 0, 0), v(10, 1, 0), { owner: 'cinematic', transition: 1 });
    rig.commitView(0.5);                                     // 累计 0.5s → 时间过半
    expect(camera.position.x).toBeCloseTo(5, 6);             // smoothstep(0.5) = 0.5
    rig.commitView(0.5);                                     // 累计 1.0s → 到位
    expect(camera.position.x).toBeCloseTo(10, 6);
    expect(rig.blending).toBe(false);
  });

  it('帧率无关：大步和小步跑完同样的秒数，终点一致', () => {
    const run = (dt) => {
      const { camera, rig } = mk();
      at(rig, v(0, 0, 0), v(0, 1, 0), { owner: 'player' });
      at(rig, v(10, 0, 0), v(10, 1, 0), { owner: 'cinematic', transition: 1 });
      for (let t = 0; t < 1 - 1e-9; t += dt) rig.commitView(dt);
      return camera.position.x;
    };
    expect(run(1 / 60)).toBeCloseTo(10, 6);
    expect(run(1 / 240)).toBeCloseTo(10, 6);
  });

  it('补间追的是最新目标：交接期间新所有者继续挪机位，收尾落在最后那笔', () => {
    const { camera, rig } = mk();
    at(rig, v(0, 0, 0), v(0, 1, 0), { owner: 'player' });
    at(rig, v(10, 0, 0), v(10, 1, 0), { owner: 'cinematic', transition: 1 });
    at(rig, v(20, 0, 0), v(20, 1, 0), { owner: 'cinematic' }); // 目标变了，但所有者没变 → 不重起补间
    expect(rig.blending).toBe(true);
    for (let t = 0; t < 1; t += 1 / 60) rig.commitView(1 / 60);
    expect(camera.position.x).toBeCloseTo(20, 6);
  });

  it('snap / 不给 transition 的交接：仍是硬切（把选择权交给调用方，不偷偷插值）', () => {
    const { camera, rig } = mk();
    at(rig, v(0, 0, 0), v(0, 1, 0), { owner: 'player' });
    at(rig, v(10, 0, 0), v(10, 1, 0), { owner: 'cinematic', transition: 1, snap: true });
    expect(rig.blending).toBe(false);
    expect(camera.position.x).toBe(10);

    const b = mk();
    at(b.rig, v(0, 0, 0), v(0, 1, 0), { owner: 'player' });
    at(b.rig, v(10, 0, 0), v(10, 1, 0), { owner: 'spectator' }); // 没有 transition
    expect(b.rig.blending).toBe(false);
    expect(b.camera.position.x).toBe(10);
  });
});

describe('交出相机：补间与所有权一起作废', () => {
  it('reset 之后同一位所有者重新认领算“首次”，直接落位不补间', () => {
    const { camera, rig } = mk();
    at(rig, v(0, 0, 0), v(0, 1, 0), { owner: 'player' });
    at(rig, v(10, 0, 0), v(10, 1, 0), { owner: 'cinematic', transition: 1 });
    rig.commitView(0.2);
    expect(rig.blending).toBe(true);
    rig.reset(CAMERA_FOV.third);                          // 传送 / 进副本
    expect(rig.blending).toBe(false);
    expect(rig.viewOwner).toBeNull();
    at(rig, v(50, 0, 0), v(50, 1, 0), { owner: 'player', transition: CAMERA_BLEND.exit });
    expect(rig.blending).toBe(false);                     // 没有上一位可交接
    expect(camera.position.x).toBe(50);                   // 当场到位
  });
});
