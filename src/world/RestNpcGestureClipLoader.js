import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const GESTURE_URLS = [
  '/assets/models/rest/gestures/wave.glb',
  '/assets/models/rest/gestures/sit.glb',
  '/assets/models/rest/gestures/talk.glb',
];

const _loader = new GLTFLoader();

/** 异步合并手势 GLB 到营火 NPC AnimationMixer */
export async function mergeRestNpcGestureClips(model) {
  if (!model.mixer) return 0;
  let n = 0;
  for (const url of GESTURE_URLS) {
    try {
      const gltf = await _loader.loadAsync(url);
      for (const clip of gltf.animations) {
        const action = model.mixer.clipAction(clip);
        model.actions[clip.name] = action;
        const low = clip.name.toLowerCase();
        if (low.includes('wave')) model.actions.wave = action;
        if (low.includes('sit')) model.actions.sit = action;
        if (low.includes('talk')) model.actions.talk = action;
        n += 1;
      }
    } catch { /* optional */ }
  }
  return n;
}
