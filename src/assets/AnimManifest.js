/** Mixamo / GLB 动画名映射 — 浏览器与 Blender 导出对齐 */
export const ANIM_MANIFEST = {
  idle: ['Idle', 'idle', 'TPose', 'mixamo.com'],
  walk: ['Walk', 'walk', 'Walking'],
  run: ['Run', 'run', 'Running'],
  attack1: ['Punch', 'Sword Slash', 'Slash', 'Cross Punch', 'attack1'],
  attack2: ['Sword Slash 2', 'Slash2', 'Combo2', 'attack2'],
  attack3: ['Finisher', 'Heavy Sword Slash', 'Slash3', 'Combo3', 'attack3'],
  heavy: ['Heavy Sword Slash', 'Heavy', 'Charged', 'heavy'],
  dodge: ['Roll', 'Dodge', 'Run To Rolling', 'Rolling'],
  hit: ['Hit', 'Reaction', 'Get Hit', 'Stagger', 'Hit Reaction', 'hit'],
  block: ['Block', 'Guard', 'Defend', 'Blocking', 'block'],
  parry: ['Parry', 'Riposte', 'Counter', 'parry'],
  skill: ['Cast', 'Skill', 'Special', 'skill'],
};

export const MIXAMO_DOWNLOAD_LIST = [
  'Idle (With Skin)',
  'Walking (Without Skin)',
  'Running (Without Skin)',
  'Sword Slash (Without Skin)',
  'Cross Punch or Sword Slash 2 (Without Skin)',
  'Heavy Sword Slash (Without Skin)',
  'Roll (Without Skin)',
  'Hit Reaction (Without Skin)',
  'Blocking (Without Skin)',
];
