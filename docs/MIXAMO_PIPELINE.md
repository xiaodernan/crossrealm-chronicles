# Mixamo / GLB 角色管线（浏览器 + Godot）

## 1. 下载角色与动画

1. 登录 [Mixamo](https://www.mixamo.com/)
2. 选择角色：**Y Bot** 或 **X Bot**（与 Web 原型 Soldier 动作兼容）
3. 下载动画（Format: **FBX for Unity**，Skin: **With Skin** 仅首个，其余 **Without Skin**）：
   - Idle / Walking / Running
   - Sword Slash / Roll / Hit Reaction / Death

## 2. 导出为 GLB（Godot + 浏览器通用）

1. Blender 导入 FBX → 合并 Skeleton
2. **File → Export → glTF 2.0 (.glb)**
3. 勾选 **Animation**，命名动画：`Idle`, `Walk`, `Run`
4. 复制到项目：

```
godot/assets/models/player.glb    ← 优先加载（Mixamo）
godot/assets/models/Soldier.glb   ← 内置占位（npm run download:model）
```

浏览器 Demo 自动从 CDN 加载同款 Soldier.glb（`CharacterModel.js`）。

## 3. Godot 挂载

`player_model.gd` 在 Player 节点下自动：

1. 尝试 `player.glb` → `Soldier.glb`
2. 失败则程序化人形占位
3. 加载成功隐藏 Capsule 网格，播放 Idle/Walk/Run

```powershell
npm run download:model   # 下载 Soldier.glb
Launch-Godot.bat         # F5 运行
```

## 4. 导入 UE5（可选远期）

见原 UE5 步骤：`unreal/Content/ThirdParty/Mixamo/`

## 5. 对照表

| Web (Three.js) | Godot | UE5 |
|----------------|-------|-----|
| Soldier.glb Idle/Walk/Run | `player_model.gd` + AnimationPlayer | Mixamo + ABP |
| 武器挥砍 procedural | 武器 MeshInstance  tween | Sword Slash Montage |
| Ctrl 闪避 | 待接 Roll 动画 | Roll Montage |

## 6. 一键命令

```powershell
npm run download:model          # Soldier 占位 GLB
npm run import:mixamo -FbxDir "D:\Mixamo\character"   # Blender 批处理 -> player.glb
npm run install:godot-templates # 下载 Web 导出模板
npm run export:godot-web        # 输出 public/godot-export/
```

`AnimCatalog`（Godot `anim_catalog.gd` / 浏览器 `CharacterModel.js`）自动匹配：
Idle / Walk / Run / Punch / Roll

## 7. Godot AnimationTree

`player_model.gd` 使用 **AnimationNodeStateMachine**（idle/walk/run/attack/dodge），Mixamo 动画名经 `AnimCatalog` 映射后接入。

## 8. 批量重定向（可选）

UE5 **IK Retargeter** 将 Mixamo 动画重定向到 MetaHuman / 自定义骨骼。
