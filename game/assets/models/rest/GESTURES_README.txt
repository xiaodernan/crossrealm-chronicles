# 营火 NPC 手势动画 Mixamo 导入
# ================================

在 mixamo_rest_inbox/<营火id>/ 或 shared_gestures/ 放入：

  Sitting.fbx / Sitting Idle.fbx     → 坐姿
  Waving.fbx / Acknowledging.fbx     → 挥手打招呼
  Talking.fbx                        → 坐着交谈

运行:
  npm run import:rest-gestures

导出到 public/assets/models/rest/gestures/
游戏 RestNpcGesturePlayer 会自动匹配 clip 名。

无 Mixamo 时使用 RestNpcProceduralGestures 程序化手臂动画。
