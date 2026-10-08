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

  // Settings panel
  settings_title: 'Settings',
  settings_language: 'Language',
  settings_difficulty: 'Difficulty',
  settings_colorvision: 'Color Vision',
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
});

/** Key list (for static gates: ensure nothing slips through) */
export const STRING_KEYS = Object.keys(STRINGS_EN);
