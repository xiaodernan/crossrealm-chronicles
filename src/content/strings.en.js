/**
 * English string table (W-D2 Slice 1).
 *
 * All UI-visible text comes from here; logic files contain no literals.
 * Keys follow "module_purpose" naming, values are the single source of truth.
 */
export const STRINGS_EN = Object.freeze({
  // Common
  common_confirm: 'Confirm',
  common_cancel: 'Cancel',
  common_close: 'Close',
  common_save: 'Save',
  common_load: 'Load',
  common_reset: 'Reset',
  common_ui: 'UI',

  // Settings panel
  settings_title: 'Settings',
  settings_language: 'Language',
  settings_difficulty: 'Difficulty',
  settings_accessibility: 'Accessibility',
  settings_colorvision: 'Color Vision',
  settings_captions: 'Captions (audio cues)',
  caption_gear_drop: 'Drop: ${rarity}',
  caption_pickup: 'Picked up',
  caption_execution: 'Execution',
  settings_look_sensitivity: 'Look Sensitivity',
  settings_graphics: 'Graphics',
  settings_audio: 'Audio',
  settings_controls: 'Controls',
  settings_master_volume: 'Master Volume',
  settings_sfx_volume: 'SFX Volume',
  settings_bloom: 'Bloom',
  settings_pixel_ratio: 'Render Scale',
  settings_lod_distance: 'Enemy LOD Distance',
  settings_shadows: 'Shadows',
  settings_shadow_quality: 'Shadow Quality',
  settings_msaa: 'Anti-Aliasing',
  settings_msaa_off: 'Off',
  settings_ssao: 'Ambient Occlusion',
  settings_graphics_preset: 'Quality Preset',
  settings_vibration: 'Controller Vibration',
  settings_pad_tuning: 'Controller Feel',
  settings_deadzone: 'Stick Deadzone',
  settings_analog_range: 'Outer Range',
  settings_look_curve: 'Look Sensitivity Curve',
  settings_look_deadzone: 'Look Deadzone',
  settings_look_speed: 'Look Speed',
  settings_sprint_threshold: 'Sprint Threshold',
  settings_left_trigger: 'Left Trigger Depth (LT)',
  settings_right_trigger: 'Right Trigger Depth (RT)',
  settings_keybinds: 'Keybinds',
  settings_keybind_reset: 'Reset Keybinds',
  settings_keybind_confirm_label: 'Press key to bind (click again to cancel)',
  settings_keybind_pad_confirm_label: 'Press controller button to bind (click again to cancel)',
  settings_keybind_confirm_hint_browser: 'Activation uses browser native Enter / Space (this slot does not impersonate keyboard)',
  settings_keybind_invalid_or_occupied: 'Key unavailable or already bound: ${key}',
  settings_keybind_swapped_with: 'Swapped with "${partnerName}": ${myButton} now ${myAction}, ${theirButton} now ${partnerName}',
  settings_keybind_pad_invalid: 'Gamepad button unavailable or already bound: ${why}',
  settings_keybind_group_movement_combat: 'Movement & Combat',
  settings_keybind_group_ui_controller: 'UI (Controller Only)',
  settings_ssao_quality_off: 'Off',
  settings_ssao_quality_low: 'Low',
  settings_ssao_quality_medium: 'Medium',
  settings_ssao_quality_high: 'High',

  // HUD
  hud_fps: 'FPS',
  hud_zone: 'Zone',
  hud_chapter: 'Chapter',
  hud_quest: 'Quest',
  hud_hp: 'HP',
  hud_mana: 'Mana',
  hud_souls: 'Planar Souls',
  hud_level: 'Level',

  // Dialog & Toasts
  dialog_click_to_lock: 'Click center of screen to lock mouse',
  toast_gear_equip: 'Equip',
  toast_gear_pickup: 'Pick up',
  toast_bag_full: 'Bag full',
  toast_invalid_keybind: 'Invalid keybind or already in use',

  // Combat
  combat_defeat: 'Defeat',
  combat_victory: 'Victory',
  combat_boss_start: 'Boss Fight Start',
  combat_boss_defeated: 'Boss Defeated',

  // Menu
  menu_pause: 'Pause',
  menu_resume: 'Resume',
  menu_settings: 'Settings',
  menu_quit: 'Quit',

  // Pause Menu (W-D2 slice 6)
  pause_resume: 'Resume Game',
  slot_label: 'Save slot',
  pause_save: 'Save game',
  pause_load_slot: 'Load selected slot',
  pause_export: 'Export JSON',
  pause_import: 'Import JSON',
  quick_save_slot: 'Quick save/load (main slot)',
  save_version_note: 'Save v7 (old saves auto-migrated)',

  // Fast Travel
  fast_travel_title: 'Fast Travel',
  fast_travel_unlocked: 'Unlocked Waypoints',
  fast_travel_locked: 'Locked',

  // World Map
  world_map_title: 'World Map · Fog of War',
  world_map_current_zone: 'Current Location',

  // Manual
  manual_title: 'Crossrealm Chronicles · Manual',
  help_title: 'Help',
  help_controls: 'Controls',
  help_gameplay: 'Gameplay',

  // Journal
  journal_title: 'Journal',
  journal_quests: 'Quests',
  journal_cg_gallery: 'CG Gallery',
  journal_achievements: 'Achievements',
  journal_lore: 'Lore Codex',
  journal_dungeon_runs: 'Dungeon Runs',

  // Upgrade Panel
  upgrade_title: 'Campfire Upgrade',
  upgrade_continue: 'Continue Exploring',

  // Upgrade Panel static labels (W-D2 slice 7)
  upgrade_tab_stats: 'Stats',
  upgrade_tab_skills: 'Weapon Skills',
  upgrade_tab_lore: 'Narrative Skills',
  upgrade_tab_gear: 'Gear',
  upgrade_stat_hp: 'Max HP',
  upgrade_stat_st: 'Max Stamina',
  upgrade_stat_vigor: 'Vigor',
  upgrade_stat_endurance: 'Endurance',
  upgrade_stat_strength: 'Strength',
  upgrade_stat_arcane: 'Arcane',
  upgrade_stat_mind: 'Mind',
  upgrade_hint: 'Fully restores after upgrade',
  upgrade_gear_bag: 'Bag',
  upgrade_meta_souls: 'Plane Souls',
  upgrade_meta_cost: 'Upgrade Cost',
  upgrade_meta_level: 'Lv.',
  upgrade_meta_points: 'Skill Points',
  upgrade_rest_default: 'Campfire',

  // Auto Play
  autoplay_start: 'Start Auto Play',
  autoplay_stop: 'Stop Auto Play',

  // Save/Load
  save_success: 'Game saved',
  load_success: 'Game loaded',
  save_failed: 'Save failed',
  settings_keybind_pad_invalid_reason_owner: '${button} belongs to ${owner} and that cell exits through the stick, so it cannot hand this button over',
  settings_keybind_pad_invalid_reason_unknown: '${button} is not a button this table recognizes',

  // Boot screens (W-D2 slice 5: loading / minimap title / guide panel / start screen)
  start_brand: 'Crossrealm Chronicles',
  loading_subtitle: 'Planes are converging…',
  minimap_title: 'Map',
  minimap_switch: 'Switch',
  minimap_dungeon_hint: 'Shows the maze inside dungeons',
  guide_head: 'What to do next · draggable',
  guide_sync: 'Sync Quest',
  autoplay_label: 'Auto-run',
  start_click: 'Click to start · locks the mouse',
  start_move: 'Move',
  start_pause: 'Pause',
  manual_short: 'Manual',
  start_perf: 'Perf panel',
  start_enter: 'Click to enter the game',
  start_url_note: 'Open http://localhost:5173 (run npm run dev first)',

  // Guide panel dynamic texts (W-D2 slice 8: GameGuidePanel three elements)
  guide_title_auto: '⚡ Auto-run in progress',
  guide_step_auto: 'Your character is pathing…',
  guide_title_dungeon_prefix: '🗺 ',
  guide_step_dungeon: 'Explored {visited}/{total} rooms · Cleared {cleared}/{total}',
  guide_hint_dungeon_boss: '⚔ Maze Keykeeper — defeat to unlock exit portal',
  guide_hint_dungeon_enemies: '⚔ Current room {enemies} enemies — clear to open doors',
  guide_hint_dungeon_exit: '▶ Keykeeper down — exit portal {interact} to leave',
  guide_hint_dungeon_explore: '▶ Delve deeper · watch for glowing stelae {interact} for lore',
  guide_title_complete: '🎉 Main quest complete',
  guide_step_complete: 'Freely explore five zones · Minimap {minimap} shows Boss 💀',
  guide_hint_complete: 'Press {autoPlay} to replay auto-run',
  guide_title_chapter_prefix: 'Ch{chapter} · ',
  guide_hint_waypoint: '▶ Head to: {label}{hint}',
  guide_hint_assistant: 'Plane Assistant: {hint}',

  // Toast (guide panel sync / auto-play)
  guide_toast_sync_progress: 'Advanced {n} quests',
  guide_toast_synced: 'Quests synced to latest',

  // Guide panel auto-play hint
  guide_hint_auto: '{escape} to stop · watch your character move',

  // HUD runtime texts / template defaults (W-D2 slice 9)
  // Placeholders use ${name} (matches the repo i18n `interpolate` contract; single braces are not interpolated).
  hud_zone_name_default: 'Nexus',
  hud_zone_subtitle_default: 'Plane Center',
  hud_souls_display_fmt: 'Souls ${souls} · Lv.${level}',
  hud_discovery_fmt: 'Logs ${count} · Fragments ${fr}/8 · Map ${pct}%',
  hud_skill_points_fmt: 'Skill Points ${points}',
  hud_weapon_default: '⚔ Planeslong Sword',
  hud_camera_mode_first: 'First Person',
  hud_camera_mode_third: 'Third Person',
  hud_boss_name_default: 'Shadowguard',
  hud_boss_phase_fmt: 'Phase ${phase}',
  hud_spell_1: 'True Fire',
  hud_spell_2: 'Xuan Ice',
  hud_spell_3: 'Gravity',
  hud_spell_4: 'Avatar',
  hud_toast_new_discovery: 'New Discovery: ${title}',
  hud_toast_lore_fragment: '📜 Lore Fragment: ${title}',
  hud_quest_empty_title: 'Endless Exploration',
  hud_quest_empty_progress: 'Freely explore the world',
  hud_combo_executable: '⚡ Executable',
  hud_combo_count: 'Combo x${count}',
  hud_subtitle_planar_bleed: 'Planar Bleed · ${zone}',
  hud_boss_phase_1: 'Phase I',
  hud_boss_phase_2: 'Phase II',
  hud_boss_phase_3: 'Phase III',
  hud_toast_rerun: 'Abyss Rerun — new random layout generated',
  hud_subtitle_time_stop: '⏳ Time Stop — charged spells can interrupt',
  hud_map_anchor_hub: 'Hub',
  hud_map_anchor_forest: 'Forest',
  hud_map_anchor_magic: 'Magic',
  hud_map_anchor_space: 'Space',
  hud_map_anchor_timeline: 'Timeline',
  hud_map_anchor_chaos: 'Chaos',
  hud_map_anchor_ruin: 'Ruins',
  hud_map_anchor_library: 'Library',
  hud_map_anchor_rift: 'Rift',
  hud_map_anchor_shrine: 'Shrine',
  hud_map_anchor_tomb: 'Tomb',
  hud_journal_empty: 'No records in this category — explore the world, read stelae, talk to NPCs',
  hud_journal_hint: 'Recorded ${count} entries · ~${total}+ discoverable in total',
  hud_journal_back: '← Back to journal list',
  hud_journal_close_hint: 'Press ${zonePanel} to close',

  // Additional: HUD quest/journal titles (slice 9 completion)
  hud_quest_in_progress: 'In Progress',
  hud_journal_title: 'Crossrealm Journal · ${journal} to close',

  // Dialog System (W-D2 slice 10)
  // Dialog.js generic
  dialog_title_unknown: 'Unknown',
  dialog_toast_chapter_required: 'Chapter ${chapter} required to ask this.',
  dialog_toast_rest_heal: 'Campfire warmth +5 souls',
  dialog_toast_npc_farewell: '${name}: "May fire guide your path."',
  dialog_choice_continue: 'Continue Exploring',

  // RestDialogue.js
  rest_dialogue_main_complete: 'Main quest complete — freely explore, or press ${autoPlay} for auto-run.',
  rest_dialogue_progress_fmt: 'Current: ${title}\n${progress}\n\n${hint}',
  rest_dialogue_journal_title: '${title}',
  rest_dialogue_journal_text: '${text}',

  // NPCManager.js lines (per NPC)
  npc_wanderer_0: 'Traveler... do you smell it? Three planes\' breaths are converging.',
  npc_wanderer_1: 'The Greywood Guardian is only the start. The Archmagus of Hogwarts Legacy is far more dangerous.',
  npc_wanderer_2: 'Open chests, rest at campfires to upgrade — the basics of survival.',
  npc_scout_0: 'The Sovereign Ring lies west of the forest. The Boss arena lies deeper — come prepared.',
  npc_scout_1: 'Watch the enemy\'s red circle, dodge or parry at the last instant.',
  npc_astronaut_0: 'Endurance log states: time is a circle here.',
  npc_astronaut_1: 'The 5D tesseract hides the last fragment secret...',

  // QuestSystem.js progress / hints
  quest_progress_all_complete: 'All quests complete — endless exploration mode',
  quest_progress_hits: '${current} / ${target} hits',
  quest_progress_spells: '${current} / ${target} casts',
  quest_progress_dungeon: '${dungeon_done}',
  quest_progress_mind: 'Upgrade campfire "Mind" to ${target}',
  quest_progress_charged: '${current} / ${target} charged casts',
  quest_progress_skills: '${current} / ${target} skills',
  quest_progress_dungeon_rerun: '${rerun_done}',
  quest_progress_chests: '${current} / ${target} chests',
  quest_progress_npc: '${npc_done}',
  quest_progress_level: 'Rest at campfire to reach Lv.${target}',
  quest_progress_discovery: '${discovery_done}',
  quest_progress_touch_done: 'Touch done — if no jump, click bottom-right "Sync Quest"',
  quest_assistant_hint_all_done: 'All clear. Press ${questTracker} to open assistant for full auto-run demo.',
  quest_assistant_hint_step_done: 'Step done, click assistant "Sync Quest Progress"',
  quest_assistant_hint_boss_dist: 'Enter the red circle on map skull to activate Boss · ${progress}',
  quest_assistant_hint_step_done_2: 'Step done — press U → Sync Quest Progress',
  quest_assistant_hint_near_wp: 'Approaching · ${label}',
  quest_waypoint_hint_chapter: 'Chapter ${chapter} required to touch anchor.',
  quest_waypoint_hint_boss3: 'Defeat Singularity Herald first',
  quest_waypoint_hint_dungeon: 'Clear the dungeon',
  quest_waypoint_hint_trials_done: 'Touch anchor after three trials done',
  quest_waypoint_hint_void_boss: 'Defeat Void Chronarch',
  quest_waypoint_hint_skills: 'Unlock 3 weapon skills at campfire',
  quest_waypoint_hint_chaos_boss: 'Defeat Chaos Overlord',
  quest_waypoint_hint_touch_anchor: 'Touch World Anchor after collecting fragments',
  quest_waypoint_hint_touch_anchor_2: 'Touch anchor when conditions met',
  quest_waypoint_hint_touch_anchor_3: 'Touch anchor after trials complete',
  quest_toast_chapter_announce: '${announce}',
  quest_toast_task_complete: 'Quest complete: ${title}',
  quest_get_assistant_hint: 'Plane Assistant: ${hint}',
  quest_title_all_done: 'All clear. Press ${questTracker} to open assistant for full auto-run demo.',
  quest_waypoint_far: 'Enter red circle on map skull to activate Boss · ${progress}',
  quest_waypoint_near: 'Approaching · ${label}',

  // Directions (QuestSystem.js getWaypointHint)
  dir_north: 'N',
  dir_northeast: 'NE',
  dir_east: 'E',
  dir_southeast: 'SE',
  dir_south: 'S',
  dir_southwest: 'SW',
  dir_west: 'W',
  dir_northwest: 'NW',

  // DialogCGRenderer.js
  dialog_cg_caption_parry: '${parry} Parry',
});

/** Key list (for static gates: ensure nothing slips through) */
export const STRING_KEYS = Object.keys(STRINGS_EN);