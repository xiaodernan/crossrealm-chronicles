import * as THREE from 'three';
import { sampleGlobalHeight } from './TerrainHeight.js';
import { WINDING_ROUTES } from '../content/windingRoutes.js';
import { applyShadow } from '../engine/shadowPolicy.js';

/** sculpt 主地形 + 贴合地面的蜿蜒古径（贴图 + 法线） */
export class WorldTerrain {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'WorldTerrain';
    scene.add(this.group);
    this._meshes = { ground: null, paths: [], cliffs: [] };
  }

  build(texLib = null) {
    this._buildMainGround(texLib);
    this._buildWindingPaths(texLib);
    this._buildCliffs(texLib);
  }

  applyTextures(texLib) {
    if (!texLib?.ready) return;
    if (this._meshes.ground) {
      const mat = texLib.createMaterial('grass');
      this._meshes.ground.material.dispose();
      this._meshes.ground.material = mat;
    }
    for (const mesh of this._meshes.paths) {
      const mat = texLib.createMaterial('path', {
        color: new THREE.Color(mesh.userData.tint ?? 0xffffff),
      });
      mesh.material.dispose();
      mesh.material = mat;
    }
    for (const mesh of this._meshes.cliffs) {
      const mat = texLib.createMaterial('rock');
      mesh.material.dispose();
      mesh.material = mat;
    }
  }

  heightAt(x, z) {
    return sampleGlobalHeight(x, z, this.world.zones ?? []);
  }

  _zoneTintAt(x, z) {
    const hub = { r: 0.42, g: 0.44, b: 0.36 };
    let best = hub;
    let bestW = 0;
    for (const zone of this.world.zones ?? []) {
      const d = zone.distanceToCenter(x, z);
      if (d >= zone.radius) continue;
      const w = 1 - d / zone.radius;
      if (w <= bestW) continue;
      bestW = w;
      const c = new THREE.Color(zone.mapColor ?? '#556644');
      best = { r: c.r, g: c.g, b: c.b };
    }
    if (bestW < 0.15) return hub;
    return {
      r: hub.r * (1 - bestW) + best.r * bestW,
      g: hub.g * (1 - bestW) + best.g * bestW,
      b: hub.b * (1 - bestW) + best.b * bestW,
    };
  }

  _buildMainGround(texLib) {
    const w = 520;
    const d = 620;
    const segW = 96;
    const segD = 112;
    const geo = new THREE.PlaneGeometry(w, d, segW, segD);
    const pos = geo.attributes.position;
    const uvs = geo.attributes.uv;

    // 平面绕 X 轴转 -90° 摊平后，顶点局部 (lx, lz, h) 落到世界 (lx, h, -lz) —— 世界 z = -局部 y。
    // 高度与贴图坐标必须按**世界**坐标采样，否则这张地面网格在 z 上被镜像：物理侧（玩家
    // `getGroundHeight`、区域落点、蜿蜒路径带）全用世界 (x, z)，唯独这张网格用局部坐标 →
    // 玩家 / 建筑相对可见地面整体陷进去或浮出来（探针实测平均错位 5.5 米、最坏 19 米）。
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const wz = -pos.getY(i);   // 局部 y → 世界 -z
      pos.setZ(i, this.heightAt(lx, wz));
      uvs.setXY(i, (lx + w * 0.5) / 18, (wz + d * 0.5) / 18);
    }

    geo.computeVertexNormals();

    let mat;
    if (texLib?.ready) {
      mat = texLib.createMaterial('grass');
      if (mat.map) mat.map.repeat.set(48, 56);
    } else {
      const colors = [];
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i);
        const wz = -pos.getY(i);   // 与几何同一约定：局部 y → 世界 -z
        const tint = this._zoneTintAt(lx, wz);
        const slope = Math.min(1, Math.abs(this.heightAt(lx, wz)) / 14);
        const shade = 0.78 + slope * 0.12;
        colors.push(tint.r * shade, tint.g * shade, tint.b * shade);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0.06,
        envMapIntensity: 0.35,
      });
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    applyShadow(mesh, 'ground');
    this.group.add(mesh);
    this._meshes.ground = mesh;
  }

  _buildWindingPaths(texLib) {
    for (const route of WINDING_ROUTES) {
      this._buildPathRibbon(route.points, route.color, route.id === 'hub-ring' ? 5 : 7, texLib);
    }
  }

  _buildPathRibbon(points, color, width, texLib) {
    if (points.length < 2) return;
    const subdiv = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, z0] = points[i];
      const [x1, z1] = points[i + 1];
      const steps = Math.max(4, Math.floor(Math.hypot(x1 - x0, z1 - z0) / 6));
      for (let s = 0; s <= steps; s++) {
        if (i > 0 && s === 0) continue;
        const t = s / steps;
        subdiv.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
      }
    }

    const verts = [];
    const indices = [];
    const uvs = [];

    for (let i = 0; i < subdiv.length; i++) {
      const [x, z] = subdiv[i];
      const y = this.heightAt(x, z) + 0.14;
      let dx = 0;
      let dz = 1;
      if (i > 0 && i < subdiv.length - 1) {
        dx = subdiv[i + 1][0] - subdiv[i - 1][0];
        dz = subdiv[i + 1][1] - subdiv[i - 1][1];
      } else if (i === 0) {
        dx = subdiv[1][0] - subdiv[0][0];
        dz = subdiv[1][1] - subdiv[0][1];
      } else {
        dx = subdiv[i][0] - subdiv[i - 1][0];
        dz = subdiv[i][1] - subdiv[i - 1][1];
      }
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len;
      const pz = dx / len;
      verts.push(x + px * width * 0.5, y, z + pz * width * 0.5);
      verts.push(x - px * width * 0.5, y, z - pz * width * 0.5);
      uvs.push(i / 3, 0);
      uvs.push(i / 3, 1);
    }

    for (let i = 0; i < subdiv.length - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = texLib?.ready
      ? texLib.createMaterial('path', { color: new THREE.Color(color) })
      : new THREE.MeshStandardMaterial({
          color,
          roughness: 0.82,
          metalness: 0.08,
          emissive: color,
          emissiveIntensity: 0.04,
        });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.tint = color;
    applyShadow(mesh, 'ground');
    this.group.add(mesh);
    this._meshes.paths.push(mesh);
  }

  _buildCliffs(texLib) {
    const cliffMat = texLib?.ready
      ? texLib.createMaterial('rock')
      : new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.95, flatShading: true });

    const spots = [
      [-120, 25, 6, 8], [-80, -15, 5, 7], [60, -120, 7, 9], [150, 100, 6, 8],
      [-160, 200, 5, 7], [40, 200, 6, 8], [-240, -30, 8, 10],
    ];
    for (const [x, z, rw, rh] of spots) {
      const cliff = new THREE.Mesh(new THREE.ConeGeometry(rw, rh, 6), cliffMat.clone());
      cliff.position.set(x, this.heightAt(x, z) + rh * 0.35, z);
      cliff.rotation.y = Math.random() * Math.PI;
      cliff.scale.set(1.2, 1, 0.8);
      applyShadow(cliff, 'prop');
      this.group.add(cliff);
      this._meshes.cliffs.push(cliff);
    }
  }
}
