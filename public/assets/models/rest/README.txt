# 营火 NPC Mixamo 导入 — 浏览器版
# ==================================

每个营火可放独立 Mixamo 角色 GLB，未放置时自动用 Soldier.glb 或胶囊体兜底。

## 目录结构

  mixamo_rest_inbox/hub/       → public/assets/models/rest/hub_keeper.glb
  mixamo_rest_inbox/fantasy/   → elf_scout.glb
  mixamo_rest_inbox/magic/     → mage_wanderer.glb
  mixamo_rest_inbox/space/     → astronaut.glb
  mixamo_rest_inbox/void/      → time_ghost.glb
  mixamo_rest_inbox/abyss/     → chaos_guide.glb

推荐 Mixamo 角色见 src/assets/RestNpcManifest.js → REST_NPC_MIXAMO_INBOX

## 步骤

1. 从 Mixamo 下载 FBX 到对应子文件夹（首个 With Skin，动画 Without Skin）
2. 安装 Blender 4.x
3. 运行: npm run import:rest-npcs
4. 游戏内 Ctrl+F5 — 靠近营火看 NPC 是否换模

共享动画（可选）:
  mixamo_rest_inbox/shared_idle/  → shared_idle.glb
  mixamo_rest_inbox/shared_sit/   → shared_sit.glb

无 Mixamo 时：程序 CG 插画 + 胶囊 NPC 仍完整可玩。
