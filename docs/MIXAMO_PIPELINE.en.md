# Mixamo / GLB Character Pipeline (Browser + Godot)

> English mirror of `MIXAMO_PIPELINE.md`.

## 1. Download characters and animations

1. Sign in at [Mixamo](https://www.mixamo.com/)
2. Pick a character: **Y Bot** or **X Bot** (matches the web prototype’s Soldier rig)
3. Download animations (Format: **FBX for Unity** — **With Skin** only for the first, **Without Skin** for the rest):
   - Idle / Walking / Running
   - Sword Slash / Roll / Hit Reaction / Death

## 2. Export as GLB (Godot + browser)

1. Import FBX into Blender → merge the skeleton
2. **File → Export → glTF 2.0 (.glb)**
3. Check **Animation**; name the clips `Idle`, `Walk`, `Run`
4. Copy into the project:

```
godot/assets/models/player.glb    ← preferred (Mixamo)
godot/assets/models/Soldier.glb   ← built-in placeholder (npm run download:model)
```

The browser demo pulls the same Soldier.glb from a CDN (`CharacterModel.js`).

## 3. Godot mounting

`player_model.gd` under the Player node automatically:

1. Tries `player.glb` → `Soldier.glb`
2. Falls back to a procedural humanoid placeholder on failure
3. Hides the capsule mesh on success and plays Idle/Walk/Run

```powershell
npm run download:model   # fetch Soldier.glb
Launch-Godot.bat         # F5 run
```

## 4. Import to UE5 (optional, long-term)

See the original UE5 steps: `unreal/Content/ThirdParty/Mixamo/`

## 5. Cross-engine mapping

| Web (Three.js) | Godot | UE5 |
|----------------|-------|-----|
| Soldier.glb Idle/Walk/Run | `player_model.gd` + AnimationPlayer | Mixamo + ABP |
| Procedural weapon slash | Weapon MeshInstance tween | Sword Slash Montage |
| Ctrl dodge | Roll animation to be wired | Roll Montage |

## 6. One-shot commands

```powershell
npm run download:model          # placeholder Soldier GLB
npm run import:mixamo -FbxDir "D:\Mixamo\character"   # Blender batch -> player.glb
npm run install:godot-templates # web export templates
npm run export:godot-web        # writes public/godot-export/
```

`AnimCatalog` (Godot `anim_catalog.gd` / browser `CharacterModel.js`) auto-matches:
Idle / Walk / Run / Punch / Roll

## 7. Godot AnimationTree

`player_model.gd` uses an **AnimationNodeStateMachine** (idle/walk/run/attack/dodge);
Mixamo clip names pass through `AnimCatalog` before splicing in.

## 8. Batch retargeting (optional)

UE5 **IK Retargeter** retargets Mixamo animations onto MetaHuman / custom skeletons.
