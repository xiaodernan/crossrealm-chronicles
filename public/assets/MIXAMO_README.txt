Mixamo 动画包 — 浏览器版

1. 打开 https://www.mixamo.com 选角色
2. 下载以下动画（FBX）到项目 mixamo_inbox/ 文件夹：
   - Idle（第一个选 With Skin）
   - Walking, Running, Sword Slash, Cross Punch
   - Heavy Sword Slash, Roll, Hit Reaction, Blocking
   （其余选 Without Skin）

3. 安装 Blender 4.x 后运行：
   npm run import:mixamo

4. 脚本会生成：
   - godot/assets/models/player.glb
   - public/assets/models/player.glb  ← 浏览器自动优先加载

5. 刷新游戏 Ctrl+F5

营火 NPC（6 个休息点）:
  npm run import:rest-npcs:open
  详见 public/assets/models/rest/README.txt

若无 Mixamo，游戏会使用 Soldier.glb 占位动画。
