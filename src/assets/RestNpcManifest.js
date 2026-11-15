/** 营火 NPC Mixamo 模型路径与动画配置 */
import { assetUrl } from './assetBase.js';

export const REST_NPC_MODELS = {
  hub: {
    glb: [assetUrl('/assets/models/rest/hub_keeper.glb'), assetUrl('/assets/models/rest/shared_idle.glb'), assetUrl('/assets/models/Soldier.glb')],
    scale: 0.95,
    rotY: Math.PI,
    idleAnim: ['idle', 'Idle', 'mixamo.com'],
    talkAnim: ['idle', 'Idle'],
    sit: false,
  },
  fantasy: {
    glb: [assetUrl('/assets/models/rest/elf_scout.glb'), assetUrl('/assets/models/rest/shared_sit.glb'), assetUrl('/assets/models/Soldier.glb')],
    scale: 0.92,
    rotY: Math.PI,
    idleAnim: ['idle', 'Idle'],
    talkAnim: ['idle', 'Idle'],
    sit: true,
  },
  magic: {
    glb: [assetUrl('/assets/models/rest/mage_wanderer.glb'), assetUrl('/assets/models/rest/shared_idle.glb'), assetUrl('/assets/models/Soldier.glb')],
    scale: 0.98,
    rotY: Math.PI * 0.5,
    idleAnim: ['idle', 'Idle'],
    talkAnim: ['idle', 'Idle'],
    sit: false,
    float: true,
  },
  space: {
    glb: [assetUrl('/assets/models/rest/astronaut.glb'), assetUrl('/assets/models/rest/shared_idle.glb'), assetUrl('/assets/models/Soldier.glb')],
    scale: 1.0,
    rotY: Math.PI,
    idleAnim: ['idle', 'Idle'],
    talkAnim: ['idle', 'Idle'],
    sit: false,
    helmet: true,
  },
  void: {
    glb: [assetUrl('/assets/models/rest/time_ghost.glb'), assetUrl('/assets/models/rest/shared_idle.glb'), assetUrl('/assets/models/Soldier.glb')],
    scale: 1.02,
    rotY: Math.PI * 1.2,
    idleAnim: ['idle', 'Idle'],
    talkAnim: ['idle', 'Idle'],
    sit: false,
    ghost: true,
  },
  abyss: {
    glb: [assetUrl('/assets/models/rest/chaos_guide.glb'), assetUrl('/assets/models/rest/shared_idle.glb'), assetUrl('/assets/models/Soldier.glb')],
    scale: 1.05,
    rotY: Math.PI * 0.85,
    idleAnim: ['idle', 'Idle'],
    talkAnim: ['idle', 'Idle'],
    sit: false,
  },
};

export const REST_NPC_MIXAMO_INBOX = {
  hub: 'Y Bot (With Skin) + Sitting Idle or Idle',
  fantasy: 'Mutant (With Skin) + Sitting',
  magic: 'Kaya (With Skin) + Floating or Idle',
  space: 'Remy (With Skin) + Idle',
  void: 'Vampire A Lusth (With Skin) + Idle',
  abyss: 'Warrok (With Skin) + Idle',
};
