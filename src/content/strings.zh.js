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

  // 指南面板动态文案（W-D2 切片8：GameGuidePanel 三元素）
  guide_title_auto: '⚡ 自动通关进行中',
  guide_step_auto: '你的角色正在跑图…',
  guide_title_dungeon_prefix: '🗺 ',
  guide_step_dungeon: '已探索 {visited}/{total} 房 · 已清空 {cleared}/{total}',
  guide_hint_dungeon_boss: '⚔ 迷宫守钥者 — 击败后出口环才可用',
  guide_hint_dungeon_enemies: '⚔ 当前房 {enemies} 个敌人 — 清空后门会开',
  guide_hint_dungeon_exit: '▶ 守钥者已倒 — 出口环 {interact} 离开',
  guide_hint_dungeon_explore: '▶ 穿门探索 · 留意发光石碑 {interact} 读叙事',
  guide_title_complete: '🎉 主线已完成',
  guide_step_complete: '自由探索五区 · 小地图 {minimap} 看 Boss 💀',
  guide_hint_complete: '按 {autoPlay} 可重跑自动通关',
  guide_title_chapter_prefix: 'Ch{chapter} · ',
  guide_hint_waypoint: '▶ 走向：{label}{hint}',
  guide_hint_assistant: '位面助手：{hint}',

  // Toast（指南面板同步/自动通关）
  guide_toast_sync_progress: '已推进 {n} 个任务',
  guide_toast_synced: '任务已同步到最新',

  // 指南面板自动通关提示
  guide_hint_auto: '{escape} 停止 · 请看屏幕中央的角色移动',

  // HUD 运行期文案 / 模板默认值（W-D2 切片9）
  // 占位符统一用 ${name}（与本仓 i18n `interpolate` 契约一致；单花括号不会被插值）。
  hud_zone_name_default: '交汇枢纽',
  hud_zone_subtitle_default: '位面中心',
  hud_souls_display_fmt: '魂 ${souls} · Lv.${level}',
  hud_discovery_fmt: '日志 ${count} · 碎片 ${fr}/8 · 地图 ${pct}%',
  hud_skill_points_fmt: '技能点 ${points}',
  hud_weapon_default: '⚔ 位面长剑',
  hud_camera_mode_first: '第一人称',
  hud_camera_mode_third: '第三人称',
  hud_boss_name_default: '影界守护者',
  hud_boss_phase_fmt: '阶段 ${phase}',
  hud_spell_1: '真火',
  hud_spell_2: '玄冰',
  hud_spell_3: '引力',
  hud_spell_4: '化身',
  hud_toast_new_discovery: '新发现：${title}',
  hud_toast_lore_fragment: '📜 叙事碎片：${title}',
  hud_quest_empty_title: '无尽探索',
  hud_quest_empty_progress: '自由探索整个世界',
  hud_combo_executable: '⚡ 可处决',
  hud_combo_count: '连击 x${count}',
  hud_subtitle_planar_bleed: '位面渗漏 · ${zone}',
  hud_boss_phase_1: '阶段 I',
  hud_boss_phase_2: '阶段 II',
  hud_boss_phase_3: '阶段 III',
  hud_toast_rerun: '深渊再探 — 新随机布局已生成',
  hud_subtitle_time_stop: '⏳ 时停中 — 蓄力法术可打断',
  hud_map_anchor_hub: '枢纽',
  hud_map_anchor_forest: '森林',
  hud_map_anchor_magic: '魔法',
  hud_map_anchor_space: '星际',
  hud_map_anchor_timeline: '时线',
  hud_map_anchor_chaos: '混沌',
  hud_map_anchor_ruin: '遗城',
  hud_map_anchor_library: '图书馆',
  hud_map_anchor_rift: '裂隙',
  hud_map_anchor_shrine: '神龛',
  hud_map_anchor_tomb: '墓穴',
  hud_journal_empty: '此类别暂无记录 — 探索世界、读石碑、对话 NPC',
  hud_journal_hint: '已记录 ${count} 条 · 全游戏可发现约 ${total}+ 处',
  hud_journal_back: '← 返回日志清单',
  hud_journal_close_hint: '按 ${zonePanel} 关闭',

  // 补充：HUD 任务/日志标题（切片9 补全）
  hud_quest_in_progress: '进行中',
  hud_journal_title: '跨界日志 · ${journal} 关闭',

  // 对话系统（W-D2 切片10）
  // Dialog.js 通用
  dialog_title_unknown: '未知',
  dialog_toast_chapter_required: '需要 Chapter ${chapter} 后再来问这个。',
  dialog_toast_rest_heal: '营火余温 +5 魂火',
  dialog_toast_npc_farewell: '${name}：「愿火护佑下一程。」',
  dialog_choice_continue: '继续探索',

  // RestDialogue.js
  rest_dialogue_main_complete: '主线已完成 — 自由探索，或按 ${autoPlay} 自动通关。',
  rest_dialogue_progress_fmt: '当前：${title}\n${progress}\n\n${hint}',
  rest_dialogue_journal_title: '${title}',
  rest_dialogue_journal_text: '${text}',

  // NPCManager.js 台词池（每条单独一键，按 NPC 分组）
  npc_wanderer_0: '穿越者…你闻到了吗？三个位面的气息正在融合。',
  npc_wanderer_1: '灰白森林的守护者只是开始。霍格沃兹遗境的大奥术师更为危险。',
  npc_wanderer_2: '打开宝箱、在营火休息升级——这是生存的基本。',
  npc_scout_0: '至尊石环在森林西侧。Boss 竞技场在更深处——做好充分准备。',
  npc_scout_1: '观察敌人红圈，在最后一瞬闪避或弹反。',
  npc_astronaut_0: 'Endurance 号的日志说：时间在这里是圆的。',
  npc_astronaut_1: '五维_tesseract 藏着最后的碎片秘密…',

  // NPCManager.js 章节台词池（`game/LoreFragments.js` 的 NPC_CHAPTER_LINES 与
  // `content/ambientLore.js` 的 NPC_LINES_POP）—— W-D2 切片14 收口。
  // 键名口径 `npc_<谁>_c<章>_<池内下标>`，致敬层追加的那几条用 `_p` 前缀（`_c4_p0`），
  // 这样"基础池 + pop 池"合并之后的顺序改了也不会串键。
  // 与上面那七条重名的两句（wanderer ch1 #0、astronaut ch1 #0）**复用旧键**，不再开第二份。
  npc_wanderer_c1_1: '触摸世界之锚后，去灰白森林找至尊石环。',
  npc_wanderer_c2_0: '宝箱里的魂火能升级属性。别忽视营火。',
  npc_wanderer_c2_1: '三座地下城还没清？迷宫里的石碑值得一读。',
  npc_wanderer_c3_0: '奇点领主会扭曲你的法术轨迹 — 靠近再打。',
  npc_wanderer_c3_1: '禁书图书馆的守页人会在二阶段加速。',
  npc_wanderer_c4_0: '时线区长按 {spell1}–{spell3} 蓄力，能打断 Boss 大招。',
  npc_wanderer_c4_1: '你读过的叙事碎片，都在日志 [{journal}] 里。',
  npc_wanderer_c5_0: '深渊再探会随机迷宫布局 — 每次都不一样。',
  npc_wanderer_c5_1: '成为无尽行者之后，位面仍会渗漏 — 留意天空。',
  npc_wanderer_c4_p0: '街机厅 CRT 还在闪 — 吃豆人与恶魔循环。',
  npc_wanderer_c4_p1: '裂相钟塔指向 11:06 — 别在钟声里抬头。',
  npc_wanderer_c5_p0: '混沌边境的禁酒窖 — 幽冥帮派谈界关税。',
  npc_wanderer_c5_p1: '深空纪元跃迁门须三门同相。',
  npc_scout_c1_0: '至尊石环在森林西侧。Boss 红圈在更深处。',
  npc_scout_c1_1: '观察敌人红圈，最后一瞬 {parry} 弹反或 {roll} 翻滚。',
  npc_scout_c2_0: '精灵遗迹有额外探索点 — 记入日志。',
  npc_scout_c2_1: '连击第三段有终结技，别只点两下。',
  npc_scout_c3_0: '古树神龛是可选迷宫，奖励额外魂火。',
  npc_scout_c3_1: '{lockOn} 锁定后 {sprint}+{lockOn} 可解除。',
  npc_scout_c4_0: '时线执政官会时停 — 蓄力法术可破。',
  npc_scout_c4_1: '破碎时线的视野会偶尔扭曲，属正常。',
  npc_scout_c5_0: '混沌边境的闪电没有预警 — 保持移动。',
  npc_scout_c5_1: '你已经走得比大多数穿越者远了。',
  npc_scout_c1_p0: '沙龙镜墙在灰林东侧 — 边境往事从裂镜开始。',
  npc_scout_c1_p1: '正午决斗圈别恋战 — 太阳不会等你。',
  npc_scout_c2_p0: '至尊石环的铭文改了词 — 指环已碎，石环仍在。',
  npc_astronaut_c1_1: '五维_tesseract 藏着碎片秘密…',
  npc_astronaut_c2_0: '米勒荒原的引力井不是自然现象。',
  npc_astronaut_c2_1: '裂隙观测站通向五维迷宫。',
  npc_astronaut_c3_0: '位面飞升意味着你不再只是访客。',
  npc_astronaut_c3_1: '蓄力引力法术可以把敌人拉进处决范围。',
  npc_astronaut_c4_0: '另一个时间线的我失败了 — 这条线靠你。',
  npc_astronaut_c4_1: '五维碑文与 tesseract 是同一谜题的两面。',
  npc_astronaut_c5_0: '混沌不是敌人，是未完成的方程。',
  npc_astronaut_c5_1: '斩裂领主之后，听枢纽的风声 — 那是庆祝。',
  npc_astronaut_c3_p0: '墨菲书架在荒原东侧 — 引力会在书页间写字。',
  npc_astronaut_c3_p1: '对接舱旋转 — 两船同速，否则金属的葬礼。',
  npc_astronaut_c3_p2: '虫洞拱门在西侧 — 光在环里折叠。',

  // 营火常驻 NPC 的说话人名 / 头衔 / 口癖（content/restNpcDefs.js，W-D2 切片15）。
  // 说话人名**只有这一份** —— `content/restDialogues.js` 里那 93 处 `speaker` 抄本已删净。
  rest_npc_hub_name: '锚火看守',
  rest_npc_hub_title: '看守 · 余温',
  rest_npc_hub_bark_0: '火不会灭，只要锚还在。',
  rest_npc_hub_bark_1: '三个位面的风，在这里交汇。',
  rest_npc_hub_bark_2: '休息前先听听风声。',
  rest_npc_fantasy_name: '精灵斥候',
  rest_npc_fantasy_title: '斥候 · 灰林',
  rest_npc_fantasy_bark_0: '森林记得每一场战争。',
  rest_npc_fantasy_bark_1: 'Boss 红圈别贪刀。',
  rest_npc_fantasy_bark_2: '连击终结能清小怪。',
  rest_npc_magic_name: '奥术旅者',
  rest_npc_magic_title: '旅者 · 遗境',
  rest_npc_magic_bark_0: '火焰里倒映着未发生的灾难。',
  rest_npc_magic_bark_1: '蓄力法术是对 Boss 的礼貌。',
  rest_npc_magic_bark_2: '禁书在迷宫深处。',
  rest_npc_space_name: '宇航员回声',
  rest_npc_space_title: '回声 · Endurance',
  rest_npc_space_bark_0: '时间在这里是圆的。',
  rest_npc_space_bark_1: '引力井会把你拉向中心。',
  rest_npc_space_bark_2: '奇点领主有三阶段。',
  rest_npc_void_name: '时线残影',
  rest_npc_void_title: '残影 · 折叠',
  rest_npc_void_bark_0: '有时火焰会倒着烧。',
  rest_npc_void_bark_1: '时停可以用蓄力打断。',
  rest_npc_void_bark_2: '隐藏 Boss 在北侧。',
  rest_npc_abyss_name: '裂隙引路人',
  rest_npc_abyss_title: '引路 · 边境',
  rest_npc_abyss_bark_0: '门越多，界越薄。',
  rest_npc_abyss_bark_1: '混沌脉冲别贴身。',
  rest_npc_abyss_bark_2: 'Ch5 后可重进迷宫。',
  rest_npc_gloom_name: '迷雾行者',
  rest_npc_gloom_title: '行者 · 幽暗',
  rest_npc_gloom_bark_0: '迷雾里只有脚印不撒谎。',
  rest_npc_gloom_bark_1: '灯笼点亮前别往深处走。',
  rest_npc_gloom_bark_2: '怨影落地后有硬直。',
  rest_npc_radiant_name: '晨曦祭司',
  rest_npc_radiant_title: '祭司 · 圣域',
  rest_npc_radiant_bark_0: '晨曦洗礼过的灵魂不惧黑暗。',
  rest_npc_radiant_bark_1: '骑士盾击后腿部无甲。',
  rest_npc_radiant_bark_2: '祭坛只在晨曦时开放。',

  // CG 画廊：筛选行的区域名 + bonus 行的说话人（game/CgGalleryRegistry.js，W-D2 切片15）。
  // 与字幕同一条口径：目录里存键，界面在播出那一刻展开（营火行的说话人取自上面那份定义）。
  cg_zone_all: '全部',
  cg_zone_hub: '枢纽',
  cg_zone_fantasy: '森林',
  cg_zone_magic: '魔法',
  cg_zone_space: '荒原',
  cg_zone_void: '时线',
  cg_zone_abyss: '混沌',
  cg_zone_combat: '战斗',
  cg_zone_dungeon: '地牢',
  cg_speaker_combat_memory: '战斗记忆',
  cg_speaker_boss: 'Boss',
  cg_speaker_explore: '探索',
  cg_speaker_prologue: '序章',
  cg_speaker_beacon: '信标',
  cg_speaker_chronicle: '纪事',
  cg_speaker_campfire: '营火',
  cg_speaker_photo: '拍照',

  // QuestSystem.js 进度文案 / 提示
  quest_progress_all_complete: '全部任务已完成 — 无尽探索模式',
  quest_progress_hits: '${current} / ${target} 命中',
  quest_progress_spells: '${current} / ${target} 次施法',
  quest_progress_dungeon: '${dungeon_done}',
  quest_progress_mind: '营火升级「心智」至 ${target}',
  quest_progress_charged: '${current} / ${target} 蓄力施法',
  quest_progress_skills: '${current} / ${target} 技能',
  quest_progress_dungeon_rerun: '${rerun_done}',
  quest_progress_chests: '${current} / ${target} 宝箱',
  quest_progress_npc: '${npc_done}',
  quest_progress_level: '在营火休息升级至 Lv.${target}',
  quest_progress_discovery: '${discovery_done}',
  quest_progress_touch_done: '已完成触摸 — 若未跳转请点右下角「同步任务」',
  quest_assistant_hint_all_done: '全部通关。按 ${questTracker} 打开助手可重跑全流程演示。',
  quest_assistant_hint_step_done: '本步已完成，点击助手「同步任务进度」',
  quest_assistant_hint_boss_dist: '走进地图骷髅标记的红圈激活 Boss · ${progress}',
  quest_assistant_hint_step_done_2: '本步已完成 — 点 U → 同步任务进度',
  quest_assistant_hint_near_wp: '已接近 · ${label}',
  quest_waypoint_hint_chapter: '需要 Chapter ${chapter} 后再来触摸。',
  quest_waypoint_hint_boss3: '先击败奇点领主',
  quest_waypoint_hint_dungeon: '清空地下城',
  quest_waypoint_hint_trials_done: '三界试炼完成后触摸锚点',
  quest_waypoint_hint_void_boss: '击败时线执政官',
  quest_waypoint_hint_skills: '营火解锁3个武器技能',
  quest_waypoint_hint_chaos_boss: '击败混沌领主',
  quest_waypoint_hint_touch_anchor: '集齐碎片后触摸世界之锚',
  quest_waypoint_hint_touch_anchor_2: '条件满足后触摸锚点',
  quest_waypoint_hint_touch_anchor_3: '三界试炼完成后触摸锚点',
  quest_toast_chapter_announce: '${announce}',
  quest_toast_task_complete: '任务完成：${title}',
  quest_get_assistant_hint: '位面助手：${hint}',
  quest_title_all_done: '全部通关。按 ${questTracker} 打开助手可重跑全流程演示。',
  quest_waypoint_far: '走进地图骷髅标记的红圈激活 Boss · ${progress}',
  quest_waypoint_near: '已接近 · ${label}',

  // 方位词（QuestSystem.js getWaypointHint 里的 dirs）
  dir_north: '北',
  dir_northeast: '东北',
  dir_east: '东',
  dir_southeast: '东南',
  dir_south: '南',
  dir_southwest: '西南',
  dir_west: '西',
  dir_northwest: '西北',

  // DialogCGRenderer.js — CG 字幕/旁白（切片13）
  // 营火对话 CG
  cg_caption_hub_start: '三界交汇 · 余温',
  cg_caption_hub_origin: '位面摩擦之火',
  cg_caption_hub_quest: '当前使命',
  cg_caption_hub_walker: '位面行者',
  cg_caption_fantasy_start: '灰白森林营火',
  cg_caption_fantasy_deep: '遗城与 Boss 环',
  cg_caption_fantasy_tip: '弹反与终结',
  cg_caption_fantasy_boss1: '影界守护者',
  cg_caption_magic_start: '霍格沃兹遗境倒影',
  cg_caption_magic_spell: '奥术牵制',
  cg_caption_magic_boss2: '大奥术师',
  cg_caption_space_start: 'Endurance 应急火',
  cg_caption_space_well: '米勒引力井',
  cg_caption_space_boss3: '奇点领主',
  cg_caption_void_start: '折叠时线',
  cg_caption_void_stop: '时停对策',
  cg_caption_void_hidden: '隐藏试炼',
  cg_caption_void_exec: '处决瞬间',
  cg_caption_abyss_start: '混沌边境',
  cg_caption_abyss_end: '终焉试炼',
  cg_caption_abyss_boss5: '裂隙领主',
  cg_caption_gloom_start: '幽暗林地营火',
  cg_caption_gloom_deep: '古老入口',
  cg_caption_gloom_wraith: '幽暗怨影',
  cg_caption_gloom_lantern: '迷雾灯笼',
  cg_caption_radiant_start: '辉煌圣域晨曦',
  cg_caption_radiant_deep: '晨曦大门',
  cg_caption_radiant_knight: '辉煌骑士',
  cg_caption_radiant_gold: '晨曦护符',
  cg_caption_hub_gallery: 'CG 画廊指引',
  cg_caption_hub_style: '战斗风格',
  cg_caption_hub_rematch: 'Boss 再战',
  cg_caption_fantasy_wisp: '魂火萤',
  cg_caption_fantasy_journal: '日志纪事',
  cg_caption_magic_cg: '奥术 CG',
  cg_caption_magic_codex: '秘典之门',
  cg_caption_space_photo: '荒原留影',
  cg_caption_space_rematch: '奇点再战',
  cg_caption_void_skip: '{escape} 跳过',
  cg_caption_void_memory: '营火记忆',
  cg_caption_abyss_achieve: '成就墙',
  cg_caption_abyss_legend: '终局仪式',
  cg_caption_hub_dungeon: '地下城纪事',
  cg_caption_hub_side: '支线委托',
  cg_caption_fantasy_streak: '连杀魂火',
  cg_caption_magic_skills: '流派技能',
  cg_caption_void_death: '重生提示',
  cg_caption_abyss_credits: '通关字幕',
  // Pop Culture CG（致敬层）
  cg_caption_magic_wizard: '咒术学院',
  cg_caption_magic_broom: '飞天环赛',
  cg_caption_space_interstellar: '星际方程',
  cg_caption_space_stay: 'Stay',
  cg_caption_void_upside: '逆相界',
  cg_caption_void_radio: '旧镇广播',
  cg_caption_fantasy_lotr: '至尊石环',
  cg_caption_hub_echoes: '次元回声',
  cg_caption_magic_nine: '九分站台',
  cg_caption_magic_patronus: '护念湖镜',
  cg_caption_space_wormhole: '虫洞拱门',
  cg_caption_void_arcade: '街机厅',
  cg_caption_void_vecna: '裂相钟塔',
  cg_caption_fantasy_western: '边境往事',
  cg_caption_fantasy_duel: '正午决斗',
  cg_caption_abyss_gangster: '幽冥帮派',
  cg_caption_space_scifi: '深空纪元',
  cg_caption_space_jump: '跃迁门',
  cg_caption_hub_triad: '三巨头',
  cg_caption_magic_cyber: '赛博霓虹',
  cg_caption_fantasy_samurai: '武士残响',
  cg_caption_void_cosmic: '旧日低语',
  cg_caption_space_starport: '星港商路',
  cg_caption_hub_wave4: 'Wave4 四系',
  // 战斗教学那两格：写的是**键名提示**（单花括号 `{动作}`，由 keyText 在播出那一刻展开）。
  // 写成 `${parry}` 会被 i18n 的插值语法抢走：`t()` 无参不替换，`keyText` 只认单花括号，
  // 于是 `$` 留在图上、键名照展 —— 实测画出 "$F 弹反"（tests/key-hint-outlets 咬住）。
  cg_caption_parry: '{parry} 弹反',
  cg_caption_lockon: '{lockOn} 锁定',
  // 幽暗林地字幕（`cg_caption_radiant_deep` 已在上面的营火字幕块里登记，不再写第二遍）
  cg_caption_misty_deep: '幽暗林地深处',

  // CgGalleryRegistry.js — 画廊目录 bonus 条目（切片13）
  cg_gallery_finisher: '连击终结',
  cg_gallery_riposte: '致命反击',
  cg_gallery_execution: '处决瞬间',
  cg_gallery_boss_shadow: '影界守护者击破',
  cg_gallery_boss_mage: '大奥术师击破',
  cg_gallery_boss_singularity: '奇点领主击破',
  cg_gallery_boss_void: '时线执政官击破',
  cg_gallery_boss_chaos: '混沌领主击破',
  cg_gallery_dungeon_clear: '迷宫清空',
  cg_gallery_world_anchor: '世界之锚觉醒',
  // bonus 五条（原在 content/cgGallery.js 里是字面量，与上面十条同一批收口）
  cg_gallery_style_ss: '战斗风格 SS',
  cg_gallery_rematch: 'Boss 再战',
  cg_gallery_codex_full: '秘典全收录',
  cg_gallery_photo: '荒原留影',
  cg_gallery_campfire_all: '六火皆憩',

  // HelpManual.js — 说明书正文（切片14）
  // 章节标题
  hm_title_start: '快速开始',
  hm_title_combat: '战斗操作',
  hm_title_world: '世界与位面',
  hm_title_dungeons: '地下城与 Boss',
  hm_title_bosses: '五 Boss 攻略',
  hm_title_autoplay: '自动通关',
  hm_title_perf_hud: '性能 HUD 与存档',

  // 章节正文（带 {action} 占位，由 keyText 在播出那一刻展开）
  hm_body_start: `欢迎来到《跨界纪元》浏览器 Demo。

1. 点击画面锁定鼠标，WASD 移动，{sprint} 冲刺
2. {cameraMode} 切换第一/第三人称（推荐第三人称 — 法环式轨道镜头，鼠标直接转视角）
3. 滚轮缩放镜头距离 · 镜头始终看向角色，不再「看前方地面」导致晕
2. 走到蓝色「世界之锚」按 {interact} 接受使命
3. 东侧训练木人练习连击（左键轻击、右键重击）
4. 按 {journal} 打开任务日志，跟随 Chapter 1→5 主线
5. 靠近营火按 {interact} 与**常驻 NPC** 分支对话，再选「休息 / 升级」；Chapter 2 起可用 {fastTravel} 快速旅行
6. {save} 存档 · {load} 读档 · {escape} 暂停（可导出/导入 JSON 存档，旧版会自动迁移）
7. {questTracker} 位面助手 →「自动通关」：你的角色亲自跑完全流程 · {escape} 停止`,

  hm_body_combat: `左键 — 轻击连击（连击增伤，高连击可终结技闪屏）
右键 — 重击 / 处决（弹反成功后）
{parry} — 弹反（敌人红圈攻击前按下）
{roll} — 闪避（HUD 精力条下方显示翻滚 CD）
{lockOn} — 锁定最近敌人（再按取消）
{skill} — 位面斩（武器技能）
{spell1}–{spell4} — 法术（长按 {spell1}/{spell2}/{spell3} 蓄力，可打断 Boss 时停）
{swapWeapon} — 切换剑 / 杖（影响近战与法术加成）
弹反成功后可右键处决；Boss 战注意阶段提示与架势条

【Boss 通用打法】
1. 靠近 Boss 按 {lockOn} 锁定，镜头会跟随目标
2. 观察脚下红圈：圈快满时按 {parry} 弹反 → 立刻右键处决（伤害极高）
3. 不会弹反就 {roll} 翻滚躲开，等 Boss 收招再左键连击
4. 连击 3~5 下再重击，打满敌人头顶架势条可 stagger 硬直；**处决/Boss 击破**有慢镜头轨道锁定
5. 精力不够就拉开距离，等回满再打；快死了找营火 {interact} 休息回满
6. {skill} 位面斩（范围 AOE）适合小怪围殴或 Boss 硬直时补刀
7. {spell1}~{spell4} 法术：Boss 放时停/大招时长按 {spell1}/{spell2}/{spell3} 蓄力可打断`,

  hm_body_world: `交汇枢纽 — 起点，世界之锚与训练木人
灰白森林 (西) — 影界守护者 Boss
霍格沃兹遗境 (北) — 大奥术师 Boss，Bloom 增强
米勒荒原 (东) — 奇点领主 Boss
破碎时线 (东北) — 隐藏位面，重力反转 + 时间回响
混沌边境 (西北) — 混沌领主，闪电风暴

跨区时会触发「位面渗漏」视觉 + 音效层。
地图上有 12 处「位面残响」魂火：靠近会被吸引并吸收，获得位面之魂。
{zonePanel} 打开区域面板 · {minimap} 小地图 · 发现物记入 {journal} 日志`,

  hm_body_dungeons: `三座地下城入口（紫色传送环，按 {interact} 进入）：
· 灰白森林 — 遗迹 crypt
· 霍格沃兹遗境 — 禁忌图书馆
· 米勒荒原 — 五维裂隙

清怪后可离开并推进任务。五名 Boss 各对应一章；
时线执政官为 Chapter 4 隐藏 Boss（破碎时线深处 Z≈235）。
击败 Boss 获得大量魂火 + 2 武器技能点。
{settings} 打开画面设置（音量、Bloom、阴影等）`,

  hm_body_bosses: `【影界守护者】灰白森林西侧 X≈-250
· 招式慢、好弹反；锁定后绕背输出
· 阶段二会召唤影兵，先清小怪或 {skill} 位面斩

【大奥术师】霍格沃兹遗境北侧 X≈5 Z≈-220
· 远程法术多，侧向翻滚（{roll}）贴近再打
· 蓄力火球前摇长，可 {parry} 弹反或蓄力 {spell1} 号法术对轰

【奇点领主】米勒荒原 X≈235 Z≈155
· 会瞬移，锁定 {lockOn} 不要丢
· 引力圈时向外滚，落地硬直时重击

【时线执政官】破碎时线 Z≈235（Ch4+，重力反转区）
· 注意行走高度变化，翻滚方向与平时相反
· 时停前会有蓝色预兆，蓄力法术可打断

【混沌领主】混沌边境 X≈-200 Z≈285（Ch5+）
· 闪电风暴降视野，贴身穿刺输出
· 二阶段狂暴，弹反窗口变短，优先翻滚`,

  hm_body_autoplay: `按 {questTracker} 打开位面助手 → 点「自动通关（操控你的角色）」。

你的角色会从枢纽出发，自动走路经过五区并推进全部任务。
镜头跟在背后，无需操作；{escape} 随时停止。

若只想跳过走路直接完成验收，点「瞬间验收」。`,

  hm_body_perf_hud: `{perfHud} 开关性能 HUD（开发期工具，不影响玩法）。

数值标黄 +N 表示该计数相对历史最低点净增 N；标红表示增幅超过容差——
反复进出副本后「几何体 / 纹理 / 着色器 / 场景节点」应回落到原值，只增不减即泄漏。

存档当前为 v6（crossrealm_save_v6）。{save} 存档 · {load} 读档 · {escape} 暂停菜单可导出/导入 JSON。
旧的 v4 / v5 存档会在启动时显式迁移到 v6 并提示，原键保留一份以便回滚；
解析不了的存档会转移到 crossrealm_save_v6:corrupt 并弹出说明，而不是静默丢失。`,

  // 扩写章节（HELP_SECTIONS_EXTRA，W-D2 切片15）
  hm_title_journal_tabs: '日志页签',
  hm_body_journal_tabs: `[{journal}] 打开跨界日志，除任务/碎片/Boss 外还有：

· CG画廊 — 营火与战斗插画，点击放大
· 成就 — 弹反、连击、Boss、探索
· 秘典 — 位面 lore 图鉴
· 营火记忆 — 休息次数与对话回顾
· 地下城 — 迷宫清空记录
· 流派 — 剑/杖技能树预览
· 支线 — 可选目标，自动奖魂火

页签按钮上显示已解锁数量。`,
  hm_title_meta_systems: '进阶系统',
  hm_body_meta_systems: `战斗风格 — 弹反/终结/处决/Boss 累积评级 C~SS
Boss 再战 — 击败后在信标按 {interact} 召唤，+5 魂火
连杀魂火 — 4.5 秒内连续击杀 ≥3 额外魂火
{photoMode} 拍照 — 隐藏 HUD 截屏
{escape} — 处决慢镜头可跳过；通关字幕也可跳过
区域切换 — 全屏过渡动画 + 区域名`,
  hm_title_pop_culture: '次元回声（致敬）',
  hm_body_pop_culture: `借母题与氛围致敬流行文化，名称已做区分（非官方授权）。

霍格沃兹遗境 — 咒术学院、飞天环赛、魔药温室
米勒荒原 — 墨菲书架、米勒沙漏、对接舱
破碎时线 — 逆相界：广播塔、裂口、霓虹、裂隙猎犬
枢纽东侧 — 位面海报墙

{journal} → 次元回声页签 · 按 {interact} 调查地图光柱 POI

Wave2：九分站台、护念湖、三强赛台、虫洞、曼恩信标、街机厅、裂相钟塔等

Wave3 三巨头母题：
· 灰白森林 — 边境往事（西部）：沙龙镜墙、正午决斗圈、幽灵铁道
· 混沌边境 — 幽冥帮派（黑帮）：禁酒窖、家族圣龛、码头货仓
· 米勒荒原 — 深空纪元（科幻）：殖民穹顶、休眠 AI、跃迁门阵列
进入对应位面有轻微视觉 overlay；POI 交互时短暂增强。

Wave4 四系：赛博霓虹（遗境）· 武士残响（灰林）· 旧日低语（时线）· 星港商路（荒原）`,
});

/** 键名清单（用于静态门禁：确保没有漏网之鱼） */
export const STRING_KEYS = Object.keys(STRINGS_ZH);