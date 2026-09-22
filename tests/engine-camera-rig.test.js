/**
 * `engine/CameraRig.js` —— 相机唯一所有者。
 *
 * M3 的第一块砖要钉住的是三件事，都不是"机位好不好看"，而是所有权协议：
 *   ① FOV 偏移**按帧申领**：没人申领就自己回基准，没有任何系统需要"记得恢复"；
 *   ② 一帧之内投影矩阵最多重算一次（旧写法是导演与玩家相机各自 `updateProjectionMatrix`）；
 *   ③ 机位只有一个入口，且退出路径（跳过 / 传送 / 换副本）一定能把相机交出去。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraRig, FOV_LAYER_OVERRIDE } from '../src/engine/CameraRig.js';
import { CAMERA_FOV } from '../src/content/tuning.js';

const mk = () => {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV.third, 1, 0.1, 100);
  let writes = 0;
  const orig = camera.updateProjectionMatrix.bind(camera);
  camera.updateProjectionMatrix = () => { writes++; return orig(); };
  const rig = new CameraRig(camera);
  return { camera, rig, writes: () => writes };
};

/** 演一帧：谁申领了什么，然后主循环收尾 */
const frame = (rig, asks = []) => {
  for (const [id, delta] of asks) rig.requestFov(id, delta);
  rig.commitFov();
};

describe('FOV 增量按帧申领', () => {
  it('没人申领时严格停在基准上', () => {
    const { camera, rig } = mk();
    for (let i = 0; i < 30; i++) frame(rig);
    expect(camera.fov).toBe(CAMERA_FOV.third);
    expect(rig.fovLayers).toBe(0);
  });

  it('申领只在它的那一帧有效：下一帧没人再申领，偏移自己就没了', () => {
    const { camera, rig } = mk();
    frame(rig, [[FOV_LAYER_OVERRIDE, -11]]);
    expect(camera.fov).toBe(CAMERA_FOV.third - 11);
    frame(rig);                                   // 这一帧没人在意 FOV
    expect(camera.fov).toBe(CAMERA_FOV.third);
    expect(rig.fovLayers).toBe(0);
  });

  it('同一层的连续申领不会叠成两倍（演出每帧重报同一个量）', () => {
    const { camera, rig } = mk();
    for (let i = 0; i < 20; i++) frame(rig, [[FOV_LAYER_OVERRIDE, -8]]);
    expect(camera.fov).toBe(CAMERA_FOV.third - 8);
  });

  it('不同层才相加，并且 0 增量不占层名', () => {
    const { rig } = mk();
    frame(rig, [['a', -5], ['b', -3]]);
    expect(rig.fov()).toBe(CAMERA_FOV.third - 8);
    expect(rig.fovLayers).toBe(2);
    frame(rig, [['a', -5], ['zero', 0]]);
    expect(rig.fovLayers).toBe(1);
  });

  it('一帧最多重算一次投影矩阵', () => {
    const { rig, writes } = mk();
    frame(rig, [['a', -5], ['b', -2]]);
    expect(writes()).toBe(1);
    frame(rig, [['a', -5], ['b', -2]]);           // 数值没变 → 一次都不该重算
    expect(writes()).toBe(1);
  });

  it('切换视角只换基准：偏移由各系统按帧重新申领，所以两边互不抹除', () => {
    const { camera, rig } = mk();
    frame(rig, [[FOV_LAYER_OVERRIDE, -11]]);
    rig.setBaseFov(CAMERA_FOV.first);             // 等价于 toggleCameraMode 做的事
    frame(rig, [[FOV_LAYER_OVERRIDE, -11]]);
    expect(camera.fov).toBe(CAMERA_FOV.first - 11);
    frame(rig);                                   // 演出结束了：没人再申领，回到新基准
    expect(camera.fov).toBe(CAMERA_FOV.first);
  });

  it('最近一次层的进出留了线索：出问题时会知道是谁拉走的', () => {
    const { rig } = mk();
    frame(rig, [['combat', -11]]);
    frame(rig, [['rest', -3]]);
    expect(rig.lastFovChange()).toEqual({ gone: ['combat'], born: ['rest'] });
  });
});

describe('退出路径一定能复原', () => {
  it('revokeFov 当场收层，不等下一帧的结算', () => {
    const { camera, rig } = mk();
    frame(rig, [[FOV_LAYER_OVERRIDE, -11]]);
    rig.revokeFov(FOV_LAYER_OVERRIDE);
    expect(camera.fov).toBe(CAMERA_FOV.third);
    expect(rig.fovLayers).toBe(0);
    frame(rig);                                   // 之后的一帧也不该复活
    expect(camera.fov).toBe(CAMERA_FOV.third);
  });

  it('跳过之后，下一帧的申领仍能正常压上来（没有被"多弹一次"打坏）', () => {
    const { camera, rig } = mk();
    frame(rig, [[FOV_LAYER_OVERRIDE, -11]]);
    rig.revokeFov(FOV_LAYER_OVERRIDE);
    frame(rig, [[FOV_LAYER_OVERRIDE, -7]]);
    expect(camera.fov).toBe(CAMERA_FOV.third - 7);
  });

  it('reset 交出相机：所有偏移与基准一起归位（传送、进出副本）', () => {
    const { camera, rig } = mk();
    frame(rig, [['a', -5], ['b', -3]]);
    rig.reset(CAMERA_FOV.first);
    expect(camera.fov).toBe(CAMERA_FOV.first);
    expect(rig.fovLayers).toBe(0);
    expect(rig.lastFovChange()).toBeNull();
  });
});

describe('机位与宽高比只有一个入口', () => {
  it('setView 是唯一的落笔处，且不改调用方的向量', () => {
    const { camera, rig } = mk();
    const pos = new THREE.Vector3(1, 2, 3);
    const look = new THREE.Vector3(4, 5, 6);
    rig.setView(pos, look);
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(rig.lookPoint().toArray()).toEqual([4, 5, 6]);
    expect(pos.toArray()).toEqual([1, 2, 3]);     // 复用临时向量是安全的
    expect(look.toArray()).toEqual([4, 5, 6]);
  });

  it('宽高比只在真的变了时才重算投影（resize 不该顺手抖一次矩阵）', () => {
    const { camera, rig, writes } = mk();
    rig.setAspect(1.6);
    const after = writes();
    rig.setAspect(1.6);
    expect(writes()).toBe(after);
    expect(camera.aspect).toBeCloseTo(1.6, 10);
  });

  it('宽高比重复设置不重算投影矩阵', () => {
    const { rig, writes } = mk();
    rig.setAspect(2);
    const after = writes();
    rig.setAspect(2);
    expect(writes()).toBe(after);
    rig.setAspect(1.6);
    expect(writes()).toBe(after + 1);
  });
});
