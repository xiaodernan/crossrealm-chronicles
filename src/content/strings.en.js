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

  // Fast Travel
  fast_travel_title: 'Fast Travel',
  fast_travel_unlocked: 'Unlocked Waypoints',
  fast_travel_locked: 'Locked',

  // World Map
  world_map_title: 'World Map',
  world_map_current_zone: 'Current Location',

  // Help Manual
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
});

/** Key list (for static gates: ensure nothing slips through) */
export const STRING_KEYS = Object.keys(STRINGS_EN);