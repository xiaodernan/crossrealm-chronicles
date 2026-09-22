/** Mixamo 营火 NPC 手势动画 — 坐姿 / 挥手 / 交谈 */
export const REST_NPC_GESTURES = {
  wave: {
    clipNames: ['wave', 'Waving', 'Hand Wave', 'Wave Hip Hop Dance', 'Acknowledging'],
    duration: 1.8,
    loop: false,
    fallback: 'procedural_wave',
  },
  sit: {
    clipNames: ['sit', 'Sitting', 'Sitting Idle', 'Sit To Stand', 'Seated Idle'],
    duration: 999,
    loop: true,
    fallback: 'procedural_sit',
  },
  sitTalk: {
    clipNames: ['sit', 'Sitting', 'Talking', 'Idle'],
    duration: 999,
    loop: true,
    fallback: 'procedural_sit_talk',
  },
  greet: {
    clipNames: ['wave', 'Waving', 'Salute', 'Bow', 'Acknowledging'],
    duration: 2.2,
    loop: false,
    fallback: 'procedural_wave',
  },
  point: {
    clipNames: ['Pointing', 'Point', 'Agreeing'],
    duration: 1.5,
    loop: false,
    fallback: 'procedural_point',
  },
};

/** 各营火 NPC 默认姿态与手势策略 */
export const REST_NPC_POSE_POLICY = {
  hub: { defaultPose: 'stand', onDialogue: 'stand', onGreet: 'wave', onRestChoice: 'point' },
  fantasy: { defaultPose: 'sit', onDialogue: 'sitTalk', onGreet: 'wave', onRestChoice: 'sit' },
  magic: { defaultPose: 'float', onDialogue: 'stand', onGreet: 'wave', onRestChoice: 'point' },
  space: { defaultPose: 'stand', onDialogue: 'stand', onGreet: 'greet', onRestChoice: 'wave' },
  void: { defaultPose: 'ghost', onDialogue: 'stand', onGreet: 'wave', onRestChoice: 'point' },
  abyss: { defaultPose: 'stand', onDialogue: 'stand', onGreet: 'greet', onRestChoice: 'point' },
};

/** Mixamo 收件箱 — 手势 FBX 建议文件名 */
export const REST_GESTURE_FBX_HINTS = [
  'Sitting.fbx',
  'Sitting Idle.fbx',
  'Waving.fbx',
  'Acknowledging.fbx',
  'Standing Thumbs Up.fbx',
  'Talking.fbx',
];
