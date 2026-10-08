/**
 * 中文文案表（W-D2 切片1）。
 *
 * 所有 UI 可见的中文都从这里取，逻辑文件不再出现字面量。
 * 键名按"模块_用途"命名，值是唯一真源 —— 改显示文案只改这一处。
 */

export const STRINGS_ZH = Object.freeze({
  // 通用
  common_confirm: '确认',
  common_cancel: '取消',
  common_close: '关闭',
  common_save: '保存',
  common_load: '加载',
  common_reset: '重置',

  // 设置面板
  settings_title: '设置',
  settings_language: '语言',
  settings_difficulty: '难度',
  settings_colorvision: '色觉模式',
  settings_look_sensitivity: '镜头灵敏度',
  settings_graphics: '画面',
  settings_audio: '音频',
  settings_controls: '控制',
  settings_master_volume: '主音量',
  settings_sfx_volume: '音效音量',
  settings_bloom: 'Bloom',
  settings_pixel_ratio: '渲染精度',
  settings_lod_distance: '敌人更新距离',
  settings_shadows: '阴影',
  settings_shadow_quality: '阴影精度',
  settings_msaa: '抗锯齿',
  settings_ssao: '环境光遮蔽',
  settings_graphics_preset: '画质预设',
  settings_vibration: '手柄震动',
  settings_pad_tuning: '手柄手感',
  settings_deadzone: '摇杆死区',
  settings_analog_range: '外圈量程',
  settings_look_curve: '镜头响应曲线',
  settings_look_deadzone: '镜头死区',
  settings_look_speed: '镜头转速',
  settings_sprint_threshold: '冲刺触发深度',
  settings_left_trigger: '左扳机深度（LT）',
  settings_right_trigger: '右扳机深度（RT）',
  settings_keybinds: '键位',
  settings_keybind_reset: '恢复默认键位',

  // HUD
  hud_fps: 'FPS',
  hud_zone: '区域',
  hud_chapter: '章节',
  hud_quest: '任务',
  hud_hp: '生命',
  hud_mana: '法力',
  hud_souls: '位面之魂',
  hud_level: '等级',

  // 对话与提示
  dialog_click_to_lock: '请点击画面中央再次锁定鼠标',
  toast_gear_equip: '换上',
  toast_gear_pickup: '拾取',
  toast_bag_full: '背包已满',
  toast_invalid_keybind: '该键位无效或已被别的动作占用',

  // 战斗
  combat_defeat: '击败',
  combat_victory: '胜利',
  combat_boss_start: 'Boss 战开始',
  combat_boss_defeated: 'Boss 已击败',

  // 菜单
  menu_pause: '暂停',
  menu_resume: '继续',
  menu_settings: '设置',
  menu_quit: '退出',

  // 快速旅行
  fast_travel_title: '快速旅行',
  fast_travel_unlocked: '已解锁路点',
  fast_travel_locked: '未解锁',

  // 世界地图
  world_map_title: '世界地图',
  world_map_current_zone: '当前位置',

  // 帮助手册
  help_title: '帮助',
  help_controls: '操作说明',
  help_gameplay: '游戏机制',

  // 日志
  journal_title: '日志',
  journal_quests: '任务',
  journal_cg_gallery: 'CG 图鉴',
  journal_achievements: '成就',
  journal_lore: ' lore 百科',
  journal_dungeon_runs: '副本记录',

  // 升级面板
  upgrade_title: '营火升级',
  upgrade_continue: '继续探索',

  // 自动演示
  autoplay_start: '开始自动演示',
  autoplay_stop: '停止自动演示',

  // 存档
  save_success: '游戏已保存',
  load_success: '游戏已加载',
  save_failed: '保存失败',
});

/** 键名清单（用于静态门禁：确保没有漏网之鱼） */
export const STRING_KEYS = Object.keys(STRINGS_ZH);
