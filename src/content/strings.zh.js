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
  common_ui: '界面',

  // 设置面板
  settings_title: '设置',
  settings_language: '语言',
  settings_difficulty: '难度',
  settings_accessibility: '辅助功能',
  settings_colorvision: '色觉模式',
  settings_captions: '字幕（音频线索可视化）',
  caption_gear_drop: '掉落：${rarity}',
  caption_pickup: '已拾取',
  caption_execution: '处决',
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
  settings_msaa_off: '关',
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
  settings_keybind_confirm_label: '按下要绑定的键（再点一次取消）',
  settings_keybind_pad_confirm_label: '按下要绑定的手柄键，松手即绑定（再点一次取消）',
  settings_keybind_confirm_hint_browser: '激活交给浏览器原生 Enter / 空格（这一格不冒充键盘键）',
  settings_keybind_invalid_or_occupied: '该键位无效或已被别的动作占用：${key}',
  settings_keybind_swapped_with: '已与"${partnerName}"交换：${myButton} 归${myAction}，${theirButton} 归${partnerName}',
  settings_keybind_pad_invalid: '该手柄按键无效或已被别的动作占用：${why}',
  settings_keybind_group_movement_combat: '移动与战斗',
  settings_keybind_group_ui_controller: '界面（手柄专属）',
  settings_ssao_quality_off: '关',
  settings_ssao_quality_low: '低',
  settings_ssao_quality_medium: '中',
  settings_ssao_quality_high: '高',

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

  // 暂停菜单（W-D2 切片6）
  pause_resume: '继续游戏',
  slot_label: '存档槽',
  pause_save: '保存进度',
  pause_load_slot: '读取所选槽',
  pause_export: '导出 JSON',
  pause_import: '导入 JSON',
  quick_save_slot: '快捷存读（主槽）',
  save_version_note: '存档 v7（旧档自动迁移）',

  // 快速旅行
  fast_travel_title: '快速旅行',
  fast_travel_unlocked: '已解锁路点',
  fast_travel_locked: '未解锁',

  // 世界地图
  world_map_title: '位面全图 · 迷雾探索',
  world_map_current_zone: '当前位置',

  // 说明书
  manual_title: '跨界纪元 · 说明书',
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

  // 升级面板静态标签（W-D2 切片7）
  upgrade_tab_stats: '属性',
  upgrade_tab_skills: '武器技能',
  upgrade_tab_lore: '剧情技能',
  upgrade_tab_gear: '装备',
  upgrade_stat_hp: '生命上限',
  upgrade_stat_st: '精力上限',
  upgrade_stat_vigor: '活力',
  upgrade_stat_endurance: '耐力',
  upgrade_stat_strength: '力量',
  upgrade_stat_arcane: '奥术',
  upgrade_stat_mind: '心智',
  upgrade_hint: '升级后完全恢复',
  upgrade_gear_bag: '背包',
  upgrade_meta_souls: '位面之魂',
  upgrade_meta_cost: '升级需',
  upgrade_meta_level: 'Lv.',
  upgrade_meta_points: '技能点',
  upgrade_rest_default: '营火',

  // 自动演示
  autoplay_start: '开始自动演示',
  autoplay_stop: '停止自动演示',

  // 存档
  save_success: '游戏已保存',
  load_success: '游戏已加载',
  save_failed: '保存失败',
  settings_keybind_pad_invalid_reason_owner: '${button} 归${owner}，而那一格的出口挂在摇杆上，让不出这一枚按钮',
  settings_keybind_pad_invalid_reason_unknown: '${button} 不是这张表认得的按钮',

  // 开机那几屏（W-D2 切片5：加载屏 / 小地图标题 / 指南面板 / 开始屏）
  start_brand: '跨界纪元',
  loading_subtitle: '位面正在汇聚…',
  minimap_title: '地图',
  minimap_switch: '切换',
  minimap_dungeon_hint: '地下城内显示迷宫',
  guide_head: '现在该做什么 · 可拖动',
  guide_sync: '同步任务',
  autoplay_label: '自动通关',
  start_click: '点击开始 · 锁定鼠标',
  start_move: '移动',
  start_pause: '暂停',
  manual_short: '说明书',
  start_perf: '性能面板',
  start_enter: '点击进入游戏',
  start_url_note: '请使用 http://localhost:5173 访问（需先运行 npm run dev）',
});

/** 键名清单（用于静态门禁：确保没有漏网之鱼） */
export const STRING_KEYS = Object.keys(STRINGS_ZH);