# Mixamo FBX -> player.glb (Blender 3.x+)
# Usage:
#   blender --background --python scripts/blender_mixamo_to_glb.py -- "path/to/mixamo_fbx" "godot/assets/models/player.glb"
#
# Put first FBX with skin (With Skin), others Without Skin. Name files:
#   idle.fbx walk.fbx run.fbx punch.fbx roll.fbx

import bpy
import sys
import os

argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--") + 1:]
else:
    argv = []

if len(argv) < 2:
    print("Usage: blender --background --python blender_mixamo_to_glb.py -- <fbx_dir_or_first.fbx> <out.glb>")
    sys.exit(1)

src = argv[0]
out_glb = os.path.abspath(argv[1])

ANIM_MAP = {
    "idle": ["idle", "mixamo", "tpose"],
    "walk": ["walk", "walking"],
    "run": ["run", "running"],
    "attack1": ["punch", "slash", "sword", "cross punch"],
    "attack2": ["slash2", "combo2", "sword slash 2"],
    "attack3": ["slash3", "combo3", "finisher"],
    "heavy": ["heavy", "charged", "heavy sword"],
    "dodge": ["roll", "dodge", "rolling"],
    "hit": ["hit", "reaction", "stagger", "get hit"],
    "block": ["block", "guard", "defend", "blocking"],
    "parry": ["parry", "riposte", "counter"],
}

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

def import_fbx(path):
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=True)
    return list(bpy.context.selected_objects)

def rename_actions():
    for action in bpy.data.actions:
        low = action.name.lower()
        for target, keys in ANIM_MAP.items():
            if any(k in low for k in keys):
                action.name = target
                break

def main():
    clear_scene()
    files = []
    if os.path.isdir(src):
        files = sorted([os.path.join(src, f) for f in os.listdir(src) if f.lower().endswith(".fbx")])
    else:
        files = [src]
        d = os.path.dirname(src)
        if os.path.isdir(d):
            files = sorted([os.path.join(d, f) for f in os.listdir(d) if f.lower().endswith(".fbx")])

    if not files:
        print("No FBX found")
        sys.exit(2)

    import_fbx(files[0])
    for extra in files[1:]:
        before = set(bpy.data.actions.keys())
        import_fbx(extra)
        for name in bpy.data.actions.keys():
            if name not in before:
                pass

    rename_actions()
    os.makedirs(os.path.dirname(out_glb), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format="GLB",
        export_animations=True,
        export_skins=True,
        export_all_influences=False,
        use_selection=False,
    )
    print("Exported:", out_glb)
    print("Actions:", [a.name for a in bpy.data.actions])

if __name__ == "__main__":
    main()
