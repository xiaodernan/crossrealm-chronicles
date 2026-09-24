import * as THREE from 'three';
import { codeFor } from '../content/keybinds.js';

/** 双武器：剑（近战）/ 杖（法术增幅）— 键位见 `content/keybinds.js` 的 `swapWeapon` */
export const WEAPONS = {
  sword: {
    id: 'sword',
    name: '位面长剑',
    meleeMult: 1.15,
    spellMult: 1,
    skillMult: 1,
    color: 0xc9a962,
  },
  staff: {
    id: 'staff',
    name: '奥术法杖',
    meleeMult: 0.85,
    spellMult: 1.35,
    skillMult: 1.2,
    color: 0x8844ff,
  },
};

export class WeaponSystem {
  constructor(player, dialog, audio) {
    this.player = player;
    this.dialog = dialog;
    this.audio = audio;
    this.current = 'sword';
    this.cooldown = 0;
    this._buildStaffMesh();
    this.applyVisual();
  }

  _buildStaffMesh() {
    const staff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 1.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x5533aa, emissive: 0x220044, emissiveIntensity: 0.5, metalness: 0.4 })
    );
    staff.position.set(0.5, 1.1, 0);
    staff.rotation.z = -0.15;
    staff.name = 'staff';
    staff.visible = false;
    this.player.mesh.add(staff);

    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xaa66ff, emissive: 0x6622aa, emissiveIntensity: 0.9 })
    );
    orb.position.set(0.5, 1.75, 0);
    orb.name = 'staffOrb';
    orb.visible = false;
    this.player.mesh.add(orb);
  }

  get weapon() { return WEAPONS[this.current]; }

  get meleeMult() { return this.weapon.meleeMult; }
  get spellMult() { return this.weapon.spellMult; }
  get skillMult() { return this.weapon.skillMult; }

  toggle() {
    if (this.cooldown > 0) return;
    this.current = this.current === 'sword' ? 'staff' : 'sword';
    this.cooldown = 0.6;
    this.applyVisual();
    this.dialog.toast(`切换武器：${this.weapon.name}`);
    this.audio?.weaponSwitch?.();
    window.dispatchEvent(new CustomEvent('weapon-changed', { detail: { weapon: this.current, name: this.weapon.name } }));
  }

  applyVisual() {
    const sword = this.player.mesh.getObjectByName('weapon');
    const staff = this.player.mesh.getObjectByName('staff');
    const orb = this.player.mesh.getObjectByName('staffOrb');
    const isStaff = this.current === 'staff';
    if (sword) sword.visible = !isStaff;
    if (staff) staff.visible = isStaff;
    if (orb) orb.visible = isStaff;
  }

  update(dt, keys) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (keys[codeFor('swapWeapon')]) {
      keys[codeFor('swapWeapon')] = false;
      this.toggle();
    }
    const orb = this.player.mesh.getObjectByName('staffOrb');
    if (orb?.visible) orb.position.y = 1.75 + Math.sin(performance.now() * 0.004) * 0.08;
  }
}
