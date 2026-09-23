import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { Billboard, yawToCamera } from '../src/effects/Billboard.js';
import { EnemyManager } from '../src/combat/EnemyManager.js';
import { installWindowShim, makeWorld, makePlayerRef, v } from './helpers/enemyHarness.js';

installWindowShim();

/** 真实场景：`getWorldQuaternion` 需要父链上有可用的矩阵更新 */
const makeRealScene = () => new THREE.Scene();

/** 相机位置：锚点在原点时放在 +Z 方向 10 米处，与默认朝向一致 */
const camAt = (x, y, z) => ({ x, y, z });

/** 把物体的局部 +Z 转到世界，得到"这块牌子现在朝哪" */
function worldForward(obj) {
  obj.updateWorldMatrix(true, false);
  return new THREE.Vector3(0, 0, 1).applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()));
}

/** 把物体的局部 +Y 转到世界，得到"这块牌子有没有被扳歪" */
function worldUp(obj) {
  obj.updateWorldMatrix(true, false);
  return new THREE.Vector3(0, 1, 0).applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()));
}

const flat = (vec) => new THREE.Vector3(vec.x, 0, vec.z).normalize();

describe('yawToCamera（纯函数）', () => {
  const anchor = { x: 0, y: 0, z: 0 };

  it('相机在 +Z：返回 0（默认朝向已经正对）', () => {
    expect(yawToCamera(anchor, camAt(0, 0, 10))).toBeCloseTo(0, 6);
  });

  it('相机在 +X：返回 +π/2', () => {
    expect(yawToCamera(anchor, camAt(10, 0, 0))).toBeCloseTo(Math.PI / 2, 6);
  });

  it('相机在 -Z：返回 π', () => {
    expect(Math.abs(yawToCamera(anchor, camAt(0, 0, -10)))).toBeCloseTo(Math.PI, 6);
  });

  it('相机在 -X：返回 -π/2', () => {
    expect(yawToCamera(anchor, camAt(-10, 0, 0))).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('只看水平分量：相机高到天上也不影响结果', () => {
    expect(yawToCamera(anchor, camAt(0, 999, 10))).toBeCloseTo(0, 6);
  });

  it('相机与锚点水平重合（正上方/正下方）时返回 fallback，不跳 0', () => {
    expect(yawToCamera(anchor, camAt(0, 50, 0), 1.234)).toBe(1.234);
    expect(yawToCamera(anchor, camAt(0, -50, 0), -0.5)).toBe(-0.5);
  });

  it('锚点带偏移时结果跟着平移，不依赖世界原点', () => {
    expect(yawToCamera({ x: 100, y: 0, z: 100 }, camAt(100, 0, 110))).toBeCloseTo(0, 6);
    expect(yawToCamera({ x: 100, y: 0, z: 100 }, camAt(110, 0, 100))).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('Billboard', () => {
  let scene;
  let bar;

  beforeEach(() => {
    scene = makeRealScene();
    bar = new Billboard(scene, { name: 'hpBar', offsetY: 2.8 });
  });

  it('构造即挂进场景根，且默认不可见（没血就不该有牌子）', () => {
    expect(scene.children).toContain(bar.object3D);
    expect(bar.visible).toBe(false);
    expect(bar.object3D.parent).toBe(scene);
  });

  it('follow 把"锚点 + 离地高度"写成世界坐标', () => {
    bar.follow({ x: 3, y: 0.5, z: -4 });
    expect(bar.object3D.position.x).toBeCloseTo(3, 6);
    expect(bar.object3D.position.y).toBeCloseTo(3.3, 6);
    expect(bar.object3D.position.z).toBeCloseTo(-4, 6);
  });

  it('faceCamera 只写 rotation.y —— 抬头看天时血条不许跟着翻', () => {
    bar.follow({ x: 0, y: 0, z: 0 });
    bar.faceCamera(camAt(10, 999, 0));
    expect(bar.object3D.rotation.x).toBe(0);
    expect(bar.object3D.rotation.z).toBe(0);
    expect(bar.object3D.rotation.y).toBeCloseTo(Math.PI / 2, 6);
    // 世界朝上的方向仍是 +Y
    expect(worldUp(bar.object3D).y).toBeCloseTo(1, 6);
  });

  it('相机缺失时保持上一帧朝向（没有相机就没有朝向依据，不是朝向原点）', () => {
    bar.follow({ x: 0, y: 0, z: 0 });
    bar.faceCamera(camAt(10, 0, 0));
    const before = bar.yaw;
    bar.faceCamera(null);
    bar.faceCamera(undefined);
    expect(bar.yaw).toBe(before);
    expect(bar.object3D.rotation.y).toBeCloseTo(before, 6);
  });

  it('相机移到正上方时退回上一帧朝向，不甩一下', () => {
    bar.follow({ x: 0, y: 0, z: 0 });
    bar.faceCamera(camAt(10, 0, 0));
    const before = bar.yaw;
    bar.faceCamera(camAt(0, 80, 0));
    expect(bar.yaw).toBe(before);
  });

  it('setVisible 生效', () => {
    bar.setVisible(true);
    expect(bar.visible).toBe(true);
    bar.setVisible(false);
    expect(bar.visible).toBe(false);
  });

  it('add 进来的子对象能按名字取回', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'hpFill';
    bar.add(mesh);
    expect(bar.object3D.getObjectByName('hpFill')).toBe(mesh);
  });

  it('dispose 从场景摘除、释放几何与材质，且幂等', () => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial();
    const gd = vi_spy(geo, 'dispose');
    const md = vi_spy(mat, 'dispose');
    bar.add(new THREE.Mesh(geo, mat));
    bar.dispose();
    expect(scene.children).not.toContain(bar.object3D);
    expect(gd.calls).toBe(1);
    expect(md.calls).toBe(1);
    bar.dispose();
    expect(gd.calls).toBe(1);   // 第二次不该再释放
    expect(md.calls).toBe(1);
  });

  it('dispose 之后 follow / faceCamera 变成安全空操作', () => {
    bar.follow({ x: 1, y: 0, z: 1 });
    const pos = bar.object3D.position.clone();
    bar.dispose();
    expect(() => {
      bar.follow({ x: 9, y: 9, z: 9 });
      bar.faceCamera(camAt(5, 0, 0));
    }).not.toThrow();
    expect(bar.object3D.position.equals(pos)).toBe(true);
  });
});

/** 极简 spy：不引入 vitest 的 mock 语法，直接数调用次数 */
function vi_spy(obj, key) {
  const spy = { calls: 0 };
  const orig = obj[key].bind(obj);
  obj[key] = () => { spy.calls += 1; return orig(); };
  return spy;
}

describe('世界空间 UI 的静态契约（防回归）', () => {
  const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');
  /** 剥掉注释与字符串，只看真正的代码 */
  const code = (p) => read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');

  it('Enemy 提供统一的身体可见性出口与每帧跟随接口', () => {
    const src = code('src/combat/Enemy.js');
    expect(src).toMatch(/setBodyVisible\s*\(/);
    expect(src).toMatch(/updateWorldUi\s*\(/);
    expect(src).toMatch(/hpBarSpec\s*\(/);
  });

  it('Enemy 内只有 setBodyVisible 一处写 this.mesh.visible', () => {
    const src = code('src/combat/Enemy.js');
    const hits = src.match(/this\.mesh\.visible\s*=/g) ?? [];
    expect(hits.length).toBe(1);
  });

  it('距离剔除必须走 setBodyVisible —— 单写 mesh.visible 会把血条留在空中', () => {
    const src = code('src/core/PerformanceManager.js');
    expect(src).toMatch(/setBodyVisible\s*\(/);
    expect(src).not.toMatch(/\.mesh\.visible\s*=/);
  });

  it('combat/ 内不得出现"某个敌人实例.mesh.visible ="（绕过统一出口）', () => {
    const offenders = [];
    for (const name of readdirSync(join(process.cwd(), 'src/combat'))) {
      if (!name.endsWith('.js')) continue;
      const src = code(`src/combat/${name}`);
      const re = /([A-Za-z_$][\w$]*)\.mesh\.visible\s*=/g;
      let m;
      while ((m = re.exec(src))) {
        // `this.mesh.visible` 就是 setBodyVisible 自己那一处，允许
        if (m[1] === 'this') continue;
        offenders.push(`${name}: ${m[0].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('血条与锁定标记不在任何 createMesh 的返回子树里（六处实现逐一体检）', () => {
    for (const name of ['Enemy', 'Boss', 'ChaosBoss', 'MagicBoss', 'SpaceBoss', 'VoidBoss']) {
      const src = code(`src/combat/${name}.js`);
      // createMesh 体内不得再出现 PlaneGeometry 的血条（构造已收进 _buildHpBar）
      const body = src.slice(src.indexOf('createMesh'));
      const end = body.indexOf('\n  }', body.indexOf('return group'));
      const seg = body.slice(0, end > 0 ? end : body.length);
      expect(seg.includes("name = 'hpBar'"), `${name}.createMesh 仍自建血条`).toBe(false);
    }
  });

  it('每个敌人类都声明了自己的 hpBarSpec（规格可以不同，构造路径必须同一处）', () => {
    expect(code('src/combat/Enemy.js')).toMatch(/hpBarSpec\s*\(\)\s*\{/);
    for (const name of ['Boss', 'ChaosBoss', 'MagicBoss', 'SpaceBoss', 'VoidBoss']) {
      expect(code(`src/combat/${name}.js`), `${name} 未声明 hpBarSpec`).toMatch(/hpBarSpec\s*\(\)\s*\{/);
    }
  });
});

describe('敌人世界空间 UI（W-A3 回归）', () => {
  let scene;
  let manager;
  let enemy;

  const CAM = camAt(0, 1.7, 12);

  beforeEach(() => {
    scene = makeRealScene();
    manager = new EnemyManager(scene, makeWorld(), null);
    enemy = manager.spawn({
      name: '测试兵', type: 'soldier', x: 0, z: 0,
      hp: 100, posture: 60, damage: 10, speed: 5,
      respawn: false, canAttack: false,
    });
  });

  const tick = (camera = CAM) => manager.update(1 / 60, v(0, 0), makePlayerRef(), null, { camera });

  it('血条与锁定标记挂在场景根，不在敌人身体子树里', () => {
    expect(enemy.mesh.getObjectByName('hpBar')).toBeUndefined();
    expect(enemy.mesh.getObjectByName('lockMarker')).toBeUndefined();
    expect(enemy.hpBar.object3D.parent).toBe(scene);
    expect(enemy.lockMarker.object3D.parent).toBe(scene);
  });

  it('敌人转身 90° 后血条世界朝向不变 —— 这是本条缺陷的核心回归', () => {
    enemy.takeDamage(30);
    tick();
    const before = worldForward(enemy.hpBar.object3D);

    // 只改身体姿态、不动锚点：这样"朝向变了没有"只可能由身体旋转引起。
    // （若走整帧 tick，敌人会位移，锚点一挪朝向本来就会变几个千分点，断言就失去分辨力）
    enemy.mesh.rotation.y = Math.PI / 2;
    enemy.updateWorldUi(CAM);
    const after = worldForward(enemy.hpBar.object3D);

    expect(after.dot(before)).toBeCloseTo(1, 9);
    // 并且确实朝着相机 —— 从**血条自己的位置**看向相机（敌人已经位移过，不能拿原点当锚点）
    const p = enemy.hpBar.object3D.position;
    const toCam = flat(new THREE.Vector3(CAM.x - p.x, 0, CAM.z - p.z));
    expect(flat(after).dot(toCam)).toBeCloseTo(1, 6);
  });

  it('血条朝向只由锚点与相机决定：锚点不动时，身体怎么转都不影响', () => {
    enemy.takeDamage(30);
    enemy.position.set(2, 0, 3);
    enemy.updateWorldUi(CAM);
    const a = worldForward(enemy.hpBar.object3D);
    for (const yaw of [0.4, 1.7, -2.9, Math.PI]) {
      enemy.mesh.rotation.y = yaw;
      enemy.updateWorldUi(CAM);
      expect(worldForward(enemy.hpBar.object3D).dot(a)).toBeCloseTo(1, 9);
    }
  });

  it('敌人悬浮摆动（rotation.z）后血条不歪', () => {
    enemy.takeDamage(30);
    enemy.mesh.rotation.z = 0.5;      // wobble 写的就是这个
    tick();
    expect(worldUp(enemy.hpBar.object3D).y).toBeCloseTo(1, 6);
    expect(enemy.hpBar.object3D.rotation.z).toBe(0);
  });

  it('血条位置跟随敌人世界坐标（含离地高度）', () => {
    enemy.takeDamage(30);
    enemy.position.set(5, 0, -3);
    tick();
    expect(enemy.hpBar.object3D.position.x).toBeCloseTo(5, 6);
    expect(enemy.hpBar.object3D.position.z).toBeCloseTo(-3, 6);
    expect(enemy.hpBar.object3D.position.y).toBeCloseTo(enemy.hpBarSpec().offsetY, 6);
  });

  it('满血不显示血条，掉血后显示，回满又收起', () => {
    tick();
    expect(enemy.hpBar.visible).toBe(false);
    enemy.takeDamage(20);
    tick();
    expect(enemy.hpBar.visible).toBe(true);
    enemy.hp = enemy.maxHp;
    enemy.updateHpBar();
    tick();
    expect(enemy.hpBar.visible).toBe(false);
  });

  it('血条左对齐收缩：宽度按比例、左端不动', () => {
    enemy.takeDamage(50);
    enemy.updateHpBar();
    const fill = enemy.hpBar.object3D.getObjectByName('hpFill');
    const spec = enemy.hpBarSpec();
    const fullWidth = spec.width * (spec.fillScale ?? 0.983);
    expect(fill.scale.x).toBeCloseTo(0.5, 6);
    // 左边缘 = position.x - 半宽 = -fullWidth/2（与满血时一致）
    expect(fill.position.x - fullWidth * fill.scale.x / 2).toBeCloseTo(-fullWidth / 2, 6);
  });

  it('死亡后血条与锁定标记一起收掉（身体藏了，牌子不许留在天上）', () => {
    enemy.takeDamage(30);
    enemy.setLocked(true);
    tick();
    expect(enemy.hpBar.visible).toBe(true);
    expect(enemy.lockMarker.visible).toBe(true);

    enemy.die();
    expect(enemy.mesh.visible).toBe(false);
    expect(enemy.hpBar.visible).toBe(false);
    expect(enemy.lockMarker.visible).toBe(false);
  });

  it('距离剔除把身体藏了，血条也必须一起收（W-A3 引入的回归点）', () => {
    enemy.takeDamage(30);
    enemy.setLocked(true);
    tick();
    expect(enemy.hpBar.visible).toBe(true);

    // 模拟 PerformanceManager 的睡眠路径
    enemy.setBodyVisible(false);
    expect(enemy.hpBar.visible).toBe(false);
    expect(enemy.lockMarker.visible).toBe(false);

    // 回到近处：血条重新出现，锁定状态由管理器重新同步
    enemy.setBodyVisible(true);
    enemy.setLocked(true);
    tick();
    expect(enemy.hpBar.visible).toBe(true);
    expect(enemy.lockMarker.visible).toBe(true);
  });

  it('身体不可见时 setLocked(true) 不会点亮锁定标记', () => {
    enemy.setBodyVisible(false);
    enemy.setLocked(true);
    expect(enemy.lockMarker.visible).toBe(false);
  });

  it('重生后血条按满血收起，锁定标记复位', () => {
    enemy.takeDamage(999);
    expect(enemy.alive).toBe(false);
    expect(enemy.hpBar.visible).toBe(false);
    // 本用例生成时给了 respawn:false（要单独验证移动与招式），所以直接走重生入口
    enemy.respawnEnemy();
    expect(enemy.alive).toBe(true);
    expect(enemy.mesh.visible).toBe(true);
    expect(enemy.hpBar.visible).toBe(false);
    expect(enemy.lockMarker.visible).toBe(false);
  });

  it('dispose 之后场景里不残留血条 / 锁定标记 / 预警圈', () => {
    enemy.takeDamage(30);
    enemy.showTelegraph();
    tick();
    const ui = [enemy.hpBar.object3D, enemy.lockMarker.object3D, enemy.telegraph];
    for (const o of ui) expect(scene.children).toContain(o);

    enemy.dispose();
    for (const o of ui) expect(scene.children).not.toContain(o);
    expect(enemy.hpBar).toBe(null);
    expect(enemy.lockMarker).toBe(null);
    expect(enemy.telegraph).toBe(null);
  });

  it('预警圈挂场景根并跟随敌人 —— 地面圈不再被悬浮摆动扳歪', () => {
    enemy.showTelegraph();
    enemy.mesh.rotation.z = 0.5;
    enemy.position.set(7, 0, 2);
    tick();
    expect(enemy.telegraph.parent).toBe(scene);
    expect(enemy.telegraph.position.x).toBeCloseTo(7, 6);
    // 预警圈自己不参与公告板：group 不写 rotation，环仍是平的
    expect(enemy.telegraph.rotation.y).toBe(0);
    expect(enemy.teleParts.ring.rotation.x).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('Boss 家族沿用同一套血条构造：规格不同、机制相同', () => {
    const boss = manager.spawnBoss({
      name: '测试 Boss', bossId: 'test-boss', x: 20, z: 20,
      hp: 500, posture: 90, damage: 20, respawn: false,
    });
    const spec = boss.hpBarSpec();
    expect(spec.width).toBeGreaterThan(enemy.hpBarSpec().width);
    expect(spec.offsetY).toBeGreaterThan(enemy.hpBarSpec().offsetY);
    // 构造路径与普通敌人一致：场景根 + 不在身体子树里
    expect(boss.mesh.getObjectByName('hpBar')).toBeUndefined();
    expect(boss.hpBar.object3D.parent).toBe(scene);
    boss.takeDamage(100);
    boss.updateWorldUi(CAM);
    expect(boss.hpBar.visible).toBe(true);
    expect(worldForward(boss.hpBar.object3D).dot(flat(new THREE.Vector3(CAM.x - 20, 0, CAM.z - 20)))).toBeCloseTo(1, 6);
  });

  it('四种位面 Boss 的规格各自独立（颜色 / 离地高度不串味）', () => {
    const magic = manager.spawnMagicBoss({ name: '魔法 Boss', bossId: 'b2', x: 40, z: 40, hp: 400, respawn: false });
    const space = manager.spawnSpaceBoss({ name: '星际 Boss', bossId: 'b3', x: 60, z: 60, hp: 400, respawn: false });
    const voidB = manager.spawnVoidBoss({ name: '时线 Boss', bossId: 'b4', x: 80, z: 80, hp: 400, respawn: false });
    const chaos = manager.spawnChaosBoss({ name: '混沌 Boss', bossId: 'b5', x: 100, z: 100, hp: 400, respawn: false });
    const colors = [magic, space, voidB, chaos].map((b) => b.hpBarSpec().color);
    expect(new Set(colors).size).toBe(4);
    for (const b of [magic, space, voidB, chaos]) {
      expect(b.mesh.getObjectByName('hpBar')).toBeUndefined();
      expect(b.hpBar.object3D.parent).toBe(scene);
    }
    // 离地高度各自不同：血条不该埋进不同体型的身体里
    expect(new Set([magic, space, voidB, chaos].map((b) => b.hpBarSpec().offsetY)).size).toBeGreaterThan(1);
  });
});
