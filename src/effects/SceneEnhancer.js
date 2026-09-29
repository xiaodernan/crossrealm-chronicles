import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TextureLibrary } from '../assets/TextureLibrary.js';

/** 全局光影、环境贴图、场景材质升级 */
export class SceneEnhancer {
  constructor(game) {
    this.game = game;
  }

  async apply() {
    const { scene, renderer } = this.game;
    const texLib = await TextureLibrary.load();

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
    pmrem.dispose();

    this._upgradeProps(scene, texLib);
    this._addGroundContactLight(scene);
    this._boostHubMaterials(scene);
  }

  _boostHubMaterials(scene) {
    scene.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const em = obj.material.emissiveIntensity;
      if (em !== undefined && em > 0.5) {
        obj.material.emissiveIntensity = Math.min(1.2, em * 1.15);
      }
      if (obj.material.metalness !== undefined && obj.material.metalness > 0.5) {
        obj.material.roughness = Math.max(0.15, (obj.material.roughness ?? 0.5) * 0.85);
      }
    });
  }

  _addGroundContactLight(scene) {
    const fill = new THREE.HemisphereLight(0xc8d8f0, 0x2a3828, 0.25);
    fill.position.set(0, 80, 0);
    scene.add(fill);
  }

  _upgradeProps(scene, texLib) {
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const name = (obj.name || obj.parent?.name || '').toLowerCase();
      const geo = obj.geometry?.type ?? '';

      if (name.includes('trunk') || name.includes('pillar')) {
        texLib.applyToMesh(obj, 'rock', 0x6a5a48);
        return;
      }
      if (geo === 'ConeGeometry' && obj.material?.flatShading) {
        // flatShading 走 overrides 而不是"换完再就地改"：材质现在是共享的，
        // 就地改会把同色的所有道具一起改掉（W-C1 切片2）
        texLib.applyToMesh(obj, 'rock', 0x8a8580, { flatShading: false });
        return;
      }
      if (geo === 'CylinderGeometry' && obj.position.y > 1 && !obj.material?.emissiveIntensity) {
        texLib.applyToMesh(obj, 'rock', 0x5a5048);
      }
    });
  }
}
