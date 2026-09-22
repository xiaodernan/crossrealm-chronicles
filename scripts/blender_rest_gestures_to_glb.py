import bpy, sys, os

argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--") + 1:]

src, out_dir = argv[0], os.path.abspath(argv[1])
os.makedirs(out_dir, exist_ok=True)

GESTURE_MAP = {
    "wave": ["wave", "waving", "acknowledging", "salute"],
    "sit": ["sit", "sitting", "seated"],
    "talk": ["talk", "talking"],
}

def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

def import_dir(folder):
    for f in sorted(os.listdir(folder)):
        if not f.lower().endswith(".fbx"):
            continue
        low = f.lower()
        target = "gesture"
        for name, keys in GESTURE_MAP.items():
            if any(k in low for k in keys):
                target = name
                break
        clear()
        bpy.ops.import_scene.fbx(filepath=os.path.join(folder, f), automatic_bone_orientation=True)
        for action in bpy.data.actions:
            action.name = target
        out = os.path.join(out_dir, f"{target}.glb")
        bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animations=True)
        print("Wrote", out)

import_dir(src)
