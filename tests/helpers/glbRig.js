/**
 * 只读 GLB 骨架夹具（W-C6 切片8）。
 *
 * ## 为什么不走 `GLTFLoader`
 * 它在 node 里要 `self` / `Blob` / `Image`（`tests/animation-clip-loader.test.js` 钉过它的 import
 * 口径）。这里直接拆 GLB 的两个 chunk —— JSON 描述 + BIN 数据 —— 拿到与素材**字节**一致的节点
 * 层级、静止变换与关键帧。门禁因此是"对着真素材读数"，而不是"对着我抄下来的常数"，
 * 后者在素材一换（`npm run import:mixamo`）之后会一路绿灯地骗人。
 *
 * ## 只读，且不进包
 * 住在 `tests/helpers/` 下：不参与打包（`tests/bundle-size-budget.test.js` 的分母只数 `src/`），
 * 也不写任何字节。
 */
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PLAYER_GLB = 'public/assets/models/Soldier.glb';

/** GLB 头 12 字节：magic / version / length；随后是 `[chunkLength, chunkType]` + JSON 块。 */
export function readGlb(相对路径 = PLAYER_GLB, 根 = process.cwd()) {
  const buf = readFileSync(join(根, 相对路径));
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const off = 20 + jsonLen;
  const binLen = buf.readUInt32LE(off);
  const bin = buf.slice(off + 8, off + 8 + binLen);
  return { json, bin, buf };
}

/** 与 `three` 的 `PropertyBinding.sanitizeNodeName` 同一口径（骨名↔轨道名的桥就靠它）。 */
export const sanitizeNodeName = (名) => THREE.PropertyBinding.sanitizeNodeName(名);

const 分量数 = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const 组件表 = { 5126: Float32Array, 5123: Int16Array, 5121: Uint8Array, 5125: Uint32Array, 5122: Uint16Array, 5120: Int8Array, 5124: Int32Array };

/** 取 accessor 的全部元素（一条关键帧通道的时间列或值列）。 */
export function readAccessor(json, bin, index) {
  const acc = json.accessors[index];
  if (acc.sparse) throw new Error(`测试夹具不支持 sparse accessor（#${index}）`);
  const Ctor = 组件表[acc.componentType];
  if (!Ctor) throw new Error(`测试夹具不认识 componentType ${acc.componentType}`);
  const bv = json.bufferViews[acc.bufferView];
  const n = 分量数[acc.type];
  const 每项字节 = n * Ctor.BYTES_PER_ELEMENT;
  if (bv.byteStride && bv.byteStride !== 每项字节) throw new Error(`测试夹具不支持 byteStride=${bv.byteStride}（每项 ${每项字节} 字节）`);
  const start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  return new Ctor(bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + start + acc.count * 每项字节));
}

/**
 * 把 GLB 的节点表搭成一棵真层级，并**铺上每个节点的静止变换**（`translation` / `rotation` / `scale`）。
 *
 * 这一条不是可选的：Mixamo 导出的根节点带 `scale = [0.01, 0.01, 0.01]`（厘米→米的导出换算）
 * 与一个绕 X 的 −90° 静止旋转。少了它们，`GLTFLoader` 会做的那次换算在夹具里没做 ——
 * 实测整条骨链放大 100 倍、Y/Z 互换（右手世界坐标从 `0.301, 0.974, 0.195` 变成
 * `30.1, −19.5, 97.4`），于是"逐帧读数"量到的是一具放大的假骨架，"货场景里动了多少米"
 * 量的也是它。`matrix` 形式的节点这里不支持：节点用不用 `matrix` 是导出器决定的，
 * 静默忽略等于把骨架搭歪，所以直接抛。
 *
 * `asBone` ⇒ 每节用 `THREE.Bone`（`isBone` 为真），这样 `CharacterModel.load()` 里那句
 * `o.isBone` 收集在世骨骼才会看见它们。
 */
export function buildRig(json, { asBone = false } = {}) {
  const 造 = (名, n) => {
    const o = asBone ? new THREE.Bone() : new THREE.Object3D();
    o.name = 名;
    if (n.matrix) throw new Error(`测试夹具不支持 matrix 节点（${名}）—— 只认 TRS`);
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  };
  const objs = json.nodes.map((n, i) => 造(sanitizeNodeName(n.name || `node${i}`), n));
  for (const [i, n] of json.nodes.entries()) {
    for (const c of n.children || []) objs[i].add(objs[c]);
  }
  const root = new THREE.Group();
  const 被人当子节点 = new Set(json.nodes.flatMap((n) => n.children || []));
  json.nodes.forEach((n, i) => { if (!被人当子节点.has(i)) root.add(objs[i]); });
  const byName = Object.fromEntries(objs.map((o) => [o.name, o]));
  return { root, byName, 在世: new Set(Object.keys(byName)) };
}

/** 一条 clip 的时长 = 它所有通道的最后一个关键帧时刻取最大。 */
export function clipDuration(json, bin, clipName) {
  const anim = json.animations.find((a) => a.name === clipName);
  if (!anim) throw new Error(`没有这条 clip：${clipName}`);
  let 最大 = 0;
  for (const s of anim.samplers) {
    const t = readAccessor(json, bin, s.input);
    最大 = Math.max(最大, t[t.length - 1]);
  }
  return 最大;
}

/** clip 名清单（GLB 自带的那几条）。 */
export const clipNames = (json) => [...new Set(json.animations.map((a) => a.name))];

/**
 * 某条 clip 在时刻 `t` 的局部姿态：骨名 → `{ rotation, translation, scale }`。
 * 关键帧之间按分量线性取值后**归一化** —— 与 `GLTFLoader` 的 slerp 等价到肉眼不可分的程度，
 * 但少了归一化会当场失真：Mixamo 导出的四元数相邻关键帧可能反号（`q` 与 `-q` 是同一个旋转），
 * 直接线性插值会在中点得到接近零的四元数，而 `Object3D` 拿非单位四元数去更新世界矩阵会把
 * 整条子链缩放飞掉（实测左手世界偏离从真实的 0.034 米被夸大成 0.77 米）。
 */
export function clipPoseAt(json, bin, clipName, t) {
  const anim = json.animations.find((a) => a.name === clipName);
  if (!anim) throw new Error(`没有这条 clip：${clipName}`);
  const out = new Map();
  for (const ch of anim.channels) {
    const s = anim.samplers[ch.sampler];
    const times = readAccessor(json, bin, s.input);
    const values = readAccessor(json, bin, s.output);
    const n = values.length / times.length;
    const 取 = new Array(n);
    if (t <= times[0]) for (let k = 0; k < n; k++) 取[k] = values[k];
    else if (t >= times[times.length - 1]) for (let k = 0; k < n; k++) 取[k] = values[(times.length - 1) * n + k];
    else {
      let i = 0;
      while (times[i + 1] < t) i++;
      const f = (t - times[i]) / (times[i + 1] - times[i]);
      for (let k = 0; k < n; k++) 取[k] = values[i * n + k] + (values[(i + 1) * n + k] - values[i * n + k]) * f;
    }
    if (ch.target.path === 'rotation') {
      const len = Math.hypot(取[0], 取[1], 取[2], 取[3]) || 1;
      for (let k = 0; k < 4; k++) 取[k] /= len;
    }
    const 名 = sanitizeNodeName(json.nodes[ch.target.node].name || '');
    const 现 = out.get(名) || {};
    现[ch.target.path] = 取;
    out.set(名, 现);
  }
  return out;
}

/** 把某条 clip 在时刻 `t` 的局部姿态铺到骨架上（其余骨保持节点原值）。 */
export function seedPose(json, bin, rig, clipName, t) {
  for (const [名, 通道] of clipPoseAt(json, bin, clipName, t)) {
    const o = rig.byName[名];
    if (!o) continue;
    if (通道.translation) o.position.fromArray(通道.translation);
    if (通道.rotation) o.quaternion.fromArray(通道.rotation);
    if (通道.scale) o.scale.fromArray(通道.scale);
  }
  rig.root.updateMatrixWorld(true);
  return rig;
}

/** 某根骨在 `clipName` 第 0 帧的局部欧拉（XYZ 序）—— `SKELETON_REST` 的口径就来自这里。 */
export function restEulerAt(json, bin, clipName, 骨名) {
  const q = clipPoseAt(json, bin, clipName, 0).get(骨名)?.rotation;
  if (!q) return null;
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(q), 'XYZ');
  return [e.x, e.y, e.z];
}

/**
 * 把 GLB 的动画表编成真 `AnimationClip`（`rotation` → `.quaternion` 四元数轨道，
 * `translation`/`scale` → 向量轨道），与 `GLTFLoader` 落到混音器里的是同一类轨道。
 * 有了它才能证明"跨类"这件事：素材那条 clip 驱动的是**全部 49 根骨的四元数**，
 * 而本仓的骨骼片段只驱动其中 11 根的 `.rotation[x]`。
 */
export function buildClips(json, bin, byName) {
  const clips = [];
  for (const anim of json.animations) {
    const 轨道 = [];
    for (const ch of anim.channels) {
      const s = anim.samplers[ch.sampler];
      const times = readAccessor(json, bin, s.input);
      const values = readAccessor(json, bin, s.output);
      const 名 = sanitizeNodeName(json.nodes[ch.target.node].name || '');
      if (!byName[名]) continue;
      const 路径 = `${名}.${ch.target.path === 'rotation' ? 'quaternion' : ch.target.path === 'translation' ? 'position' : 'scale'}`;
      const T = ch.target.path === 'rotation' ? THREE.QuaternionKeyframeTrack
        : (ch.target.path === 'translation' || ch.target.path === 'scale') ? THREE.VectorKeyframeTrack : null;
      if (!T) continue;
      轨道.push(new T(路径, times, values));
    }
    clips.push(new THREE.AnimationClip(anim.name, -1, 轨道));
  }
  return clips;
}

/**
 * 一份"像 `GLTFLoader` 返回体"的假 gltf：骨骼节点用 `THREE.Bone`，另外挂一个带几何的网格
 * ——`load()` 里那句 `new THREE.Box3().setFromObject(model)` 只有网格会撑大包围盒，
 * 纯骨骼场景拿到的是空盒（`min.y === +Infinity`），于是 `model.position.y` 变成 `-Infinity`、
 * 所有世界坐标 NaN。真素材里那个 SkinnedMesh 就是干这个的。
 */
export function fakeGltfFromGlb(相对路径 = PLAYER_GLB, 根 = process.cwd()) {
  const { json, bin } = readGlb(相对路径, 根);
  const rig = buildRig(json, { asBone: true });
  const 占位网格 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.9, 0.35));
  占位网格.name = 'Soldier_mesh';
  占位网格.position.y = 0.95;
  rig.root.add(占位网格);
  return { json, bin, gltf: { scene: rig.root, animations: buildClips(json, bin, rig.byName) }, rig };
}

/** 世界坐标读数（返回副本，不返引用）。 */
export function worldOf(rig, 骨名) {
  const v = new THREE.Vector3();
  const o = rig.byName[骨名];
  if (!o) throw new Error(`骨架里没有这根骨：${骨名}`);
  o.getWorldPosition(v);
  return v;
}
