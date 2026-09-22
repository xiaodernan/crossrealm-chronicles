# Mixamo FBX dir -> single rest NPC glb
import bpy, sys, os

argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--") + 1:]
else:
    argv = []

if len(argv) < 2:
    print("Usage: blender --background --python blender_rest_npcs_to_glb.py -- <fbx_dir> <out.glb>")
    sys.exit(1)

src = argv[0]
out_glb = os.path.abspath(argv[1])

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

def import_fbx(path):
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=True)

def rename_idle():
    for action in bpy.data.actions:
        low = action.name.lower()
        if any(k in low for k in ("idle", "sit", "mixamo", "tpose")):
            action.name = "idle"
            break

clear_scene()
files = sorted([os.path.join(src, f) for f in os.listdir(src) if f.lower().endswith(".fbx")]) if os.path.isdir(src) else [src]
if not files:
    print("No FBX")
    sys.exit(2)

import_fbx(files[0])
for extra in files[1:]:
    import_fbx(extra)

rename_idle()
os.makedirs(os.path.dirname(out_glb), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', export_animations=True)
print("Wrote", out_glb)
