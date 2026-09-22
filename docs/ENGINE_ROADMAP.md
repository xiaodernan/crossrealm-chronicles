# 引擎选型路线图

| 阶段 | 引擎 | 体积 | 用途 |
|------|------|------|------|
| **当前** | Three.js + Vite | ~50MB node_modules | 浏览器即玩、快速迭代全部玩法 |
| **推荐升级** | **Godot 4** | ~600MB | 本地 3D、导出 exe/web、团队可协作 |
| **可选远期** | UE5 | ~60GB | AAA 画质、150+ 人团队 |

**结论**：UE5 不是必须。Godot 覆盖 80% 3A 玩法需求，体积仅为 UE5 的 **1%**。

- 浏览器 Demo：`npm run dev`
- Godot：`docs/GODOT_MIGRATION.md`
- UE5（可选）：`docs/UE5_INSTALL.md`
