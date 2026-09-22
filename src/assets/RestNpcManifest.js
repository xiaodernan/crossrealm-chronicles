/** 营火 NPC Mixamo 模型路径与动画配置 */
export const REST_NPC_MODELS = {
  hub: {
    glb: ['/assets/models/rest/hub_keeper.glb', '/assets/models/rest/shared_idle.glb', '/assets/models/Soldier.glb'],
    scale: 0.95,
    rotY: Math.PI,
    idleAnim: ['idle', 'Idle', 'mixamo.com'],
    talkAnim: ['idle', 'Idle'],
    sit: false,
  },
  fantasy: {
    glb: ['/assets/models/rest/elf_scout.glb', '/assets/models/rest/shared_sit.glb', '/assets/models/Soldier.glb'],
    scale: 0.92,
    rotY: Math.PI,
    idleAnim: ['idle', 'Idle'],
    talkAnim: ['idle', 'Idle'],
    sit: true,
  },
  magic: {
    glb: ['/assets/models/rest/mage_wanderer.glb', '/assets/models/rest/shared_idle.glb', '/assets/models/Soldier.glb'],
    scale: 0.98,
    rotY: Math.PI * 0.5,
    idleAnim: ['idle', 'Idle'],
    talkAnim: ['idle', 'Idle'],
    sit: false,
    float: true,
  },
  space: {
    glb: ['/assets/models/rest/astronaut.glb', '/assets/models/rest/shared_idle.glb', '/assets/models/Soldier.glb'],
    scale: 1.0,
    rotY: Math.PI,
    idleAnim: ['idle', 'Idle'],
    talkAnim: ['idle', 'Idle'],
    sit: false,
    helmet: true,
  },
  void: {
    glb: ['/assets/models/rest/time_ghost.glb', '/assets/models/rest/shared_idle.glb', '/assets/models/Soldier.glb'],
    scale: 1.02,
    rotY: Math.PI * 1.2,
    idleAnim: ['idle', 'Idle'],
    talkAnim: ['idle', 'Idle'],
    sit: false,
    ghost: true,
  },
  abyss: {
    glb: ['/assets/models/rest/chaos_guide.glb', '/assets/models/rest/shared_idle.glb', '/assets/models/Soldier.glb'],
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
