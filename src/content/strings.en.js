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

  // Combat feedback (W-D2 slice 16d)
  damage_kind_normal: 'Normal',
  damage_kind_crit: 'Critical',
  damage_kind_heal: 'Heal',
  damage_kind_weak: 'Resisted',
  hit_suffix_blocked: 'Block',
  hit_suffix_backstab: 'Backstab',
  hit_suffix_crit: 'Critical',
  style_label_parry: 'Parry',
  style_label_finisher: 'Finisher',
  style_label_execution: 'Execution',
  style_label_boss: 'Boss',
  style_label_kill: 'Kill',
  style_label_break: 'Break',
  combat_lock_switch: 'Switch lock: ${name}',
  combat_lock_on: 'Locked on: ${name}',
  combat_lock_hint: ' ({lockOn} to switch)',
  combat_lock_none: 'No lockable target nearby',
  combat_lock_cleared: 'Lock released',
  combat_player_defeated: 'The traveler falls… and wakes at the World Anchor',
  combat_riposte: 'Critical strike!',
  combat_perfect_parry: 'Perfect parry!',
  combat_finisher: 'Combo finisher!',
  death_hint_prefix: 'Hint ·',
  death_hint_combo: 'Do not get greedy at high combo — save stamina to roll.',
  death_hint_boss: 'Boss fight: {lockOn} to lock, {parry} to parry the red circle or {roll} to roll.',
  death_hint_dungeon: 'In the maze, clear the small enemies before entering the boss room — watch unexplored rooms on the minimap.',
  death_hint_campfire: 'Campfire {interact} restores health; the {journal} log has boss guides and style notes.',
  death_journal_title: 'Fall #${n}',

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

  // NPCManager.js chapter line pools (NPC_CHAPTER_LINES in game/LoreFragments.js and
  // NPC_LINES_POP in content/ambientLore.js) — closed in W-D2 slice 14.
  // Key shape: npc_<who>_c<chapter>_<index in that pool>; the tribute-layer additions use
  // a `_p` prefix (`_c4_p0`) so reordering the merged pool can never swap keys.
  // The two lines that already had a key above (wanderer ch1 #0, astronaut ch1 #0) reuse it.
  npc_wanderer_c1_1: 'After touching the World Anchor, seek the Sovereign Ring in Greywood Forest.',
  npc_wanderer_c2_0: 'Soulfire from chests upgrades your stats. Do not neglect the campfires.',
  npc_wanderer_c2_1: 'Three dungeons still uncleared? The steles inside are worth reading.',
  npc_wanderer_c3_0: 'The Singularity Herald warps your spell paths — close in before you strike.',
  npc_wanderer_c3_1: 'The Pagekeeper of the Forbidden Library speeds up in its second phase.',
  npc_wanderer_c4_0: 'On the timeline, hold {spell1}–{spell3} to charge and interrupt a boss ultimate.',
  npc_wanderer_c4_1: 'Every lore fragment you have read is kept in the journal [{journal}].',
  npc_wanderer_c5_0: 'Re-entering the abyss reshuffles the maze — never the same twice.',
  npc_wanderer_c5_1: 'Even as an Endless Walker the planes still leak — watch the sky.',
  npc_wanderer_c4_p0: 'The arcade CRTs still flicker — Pac-Man and demons on loop.',
  npc_wanderer_c4_p1: 'The Vecna clock tower reads 11:06 — do not look up when it chimes.',
  npc_wanderer_c5_p0: 'The dry cellar on the chaos border — the Nether Gang haggles over plane tariffs.',
  npc_wanderer_c5_p1: 'Deep-space jump gates need all three doors in phase.',
  npc_scout_c1_0: 'The Sovereign Ring lies west of the forest. The boss red circle lies deeper in.',
  npc_scout_c1_1: 'Watch the red circle, then {parry} to parry or {roll} to roll at the last instant.',
  npc_scout_c2_0: 'The elven ruins hide extra discovery points — they go into your journal.',
  npc_scout_c2_1: 'The third combo step carries a finisher — do not stop at two hits.',
  npc_scout_c3_0: 'The ancient-tree shrine is an optional dungeon and pays extra soulfire.',
  npc_scout_c3_1: 'After {lockOn} to lock on, press {sprint}+{lockOn} to release.',
  npc_scout_c4_0: 'The Void Chronarch can stop time — a charged spell breaks it.',
  npc_scout_c4_1: 'The shattered timeline warps your view now and then. That is normal.',
  npc_scout_c5_0: 'Lightning on the chaos border gives no warning — keep moving.',
  npc_scout_c5_1: 'You have already gone farther than most travelers.',
  npc_scout_c1_p0: 'The saloon mirror wall is east of Greywood — border tales start at the cracked glass.',
  npc_scout_c1_p1: 'Do not linger in the high-noon duel ring — the sun will not wait.',
  npc_scout_c2_p0: 'The Sovereign Ring rewrote its inscription — the ring is broken, the stone circle remains.',
  npc_astronaut_c1_1: 'The 5D tesseract hides a fragment secret...',
  npc_astronaut_c2_0: 'The gravity well in the Miller Wastes is no natural thing.',
  npc_astronaut_c2_1: 'The rift observatory leads into the five-dimension maze.',
  npc_astronaut_c3_0: 'Plane ascension means you are no longer merely a visitor.',
  npc_astronaut_c3_1: 'A charged gravity spell drags enemies into execution range.',
  npc_astronaut_c4_0: 'The other timeline\'s me failed — this line is on you.',
  npc_astronaut_c4_1: 'The 5D inscription and the tesseract are two faces of one puzzle.',
  npc_astronaut_c5_0: 'Chaos is not an enemy. It is an unfinished equation.',
  npc_astronaut_c5_1: 'After you cut down the Rift Lord, listen to the wind at the hub — that is the celebration.',
  npc_astronaut_c3_p0: 'The Murph shelf is east of the wastes — gravity writes between its pages.',
  npc_astronaut_c3_p1: 'The docking bay spins — match speeds, or it is a metal funeral.',
  npc_astronaut_c3_p2: 'The wormhole arch is to the west — light folds inside the ring.',

  // Campfire resident NPC name / title / barks (content/restNpcDefs.js, W-D2 slice 15).
  // The speaker name lives HERE and only here — the 93 `speaker` copies in
  // content/restDialogues.js were deleted after a probe proved all 93 were byte-identical.
  rest_npc_hub_name: 'Anchor Fire Warden',
  rest_npc_hub_title: 'Warden · Ember Warmth',
  rest_npc_hub_bark_0: 'The fire never dies, as long as the anchor holds.',
  rest_npc_hub_bark_1: 'The winds of three planes meet here.',
  rest_npc_hub_bark_2: 'Listen to the wind before you rest.',
  rest_npc_fantasy_name: 'Elven Scout',
  rest_npc_fantasy_title: 'Scout · Greywood',
  rest_npc_fantasy_bark_0: 'The forest remembers every war.',
  rest_npc_fantasy_bark_1: 'Do not get greedy on the boss red circle.',
  rest_npc_fantasy_bark_2: 'A finisher clears the small ones.',
  rest_npc_magic_name: 'Arcane Traveler',
  rest_npc_magic_title: 'Traveler · Ruins',
  rest_npc_magic_bark_0: 'Fire mirrors disasters that have not happened yet.',
  rest_npc_magic_bark_1: 'A charged spell is courtesy toward a boss.',
  rest_npc_magic_bark_2: 'The forbidden books lie deep in the maze.',
  rest_npc_space_name: 'Astronaut Echo',
  rest_npc_space_title: 'Echo · Endurance',
  rest_npc_space_bark_0: 'Time is a circle here.',
  rest_npc_space_bark_1: 'The gravity well pulls you toward the center.',
  rest_npc_space_bark_2: 'The Singularity Herald has three phases.',
  rest_npc_void_name: 'Timeline Afterimage',
  rest_npc_void_title: 'Afterimage · Folded',
  rest_npc_void_bark_0: 'Sometimes the fire burns backwards.',
  rest_npc_void_bark_1: 'A charged cast can break the time stop.',
  rest_npc_void_bark_2: 'The hidden boss waits to the north.',
  rest_npc_abyss_name: 'Rift Guide',
  rest_npc_abyss_title: 'Guide · Border',
  rest_npc_abyss_bark_0: 'The more doors, the thinner the boundary.',
  rest_npc_abyss_bark_1: 'Do not hug the chaos pulse.',
  rest_npc_abyss_bark_2: 'You can re-enter dungeons after Ch5.',
  rest_npc_gloom_name: 'Mist Walker',
  rest_npc_gloom_title: 'Walker · Gloom',
  rest_npc_gloom_bark_0: 'In the mist, only footprints do not lie.',
  rest_npc_gloom_bark_1: 'Do not go deeper until the lanterns are lit.',
  rest_npc_gloom_bark_2: 'The wraith is open after it lands.',
  rest_npc_radiant_name: 'Dawn Priest',
  rest_npc_radiant_title: 'Priest · Sanctuary',
  rest_npc_radiant_bark_0: 'A soul washed in dawnlight does not fear the dark.',
  rest_npc_radiant_bark_1: 'The knight leaves the leg unarmored after a shield bash.',
  rest_npc_radiant_bark_2: 'The altar only opens at dawn.',

  // CG gallery: zone filter labels + bonus-row speakers (game/CgGalleryRegistry.js, W-D2 slice 15).
  // Same contract as the captions: the catalog stores keys, the UI expands at paint time
  // (campfire rows take their speaker from the definitions above).
  cg_zone_all: 'All',
  cg_zone_hub: 'Hub',
  cg_zone_fantasy: 'Forest',
  cg_zone_magic: 'Magic',
  cg_zone_space: 'Wastes',
  cg_zone_void: 'Timeline',
  cg_zone_abyss: 'Chaos',
  cg_zone_combat: 'Combat',
  cg_zone_dungeon: 'Dungeon',
  cg_speaker_combat_memory: 'Combat Memory',
  cg_speaker_boss: 'Boss',
  cg_speaker_explore: 'Exploration',
  cg_speaker_prologue: 'Prologue',
  cg_speaker_beacon: 'Beacon',
  cg_speaker_chronicle: 'Chronicle',
  cg_speaker_campfire: 'Campfire',
  cg_speaker_photo: 'Photo',

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

  // DialogCGRenderer.js — CG Captions (slice 13)
  // Campfire Dialog CG
  cg_caption_hub_start: 'Three Realms Converge · Ember Warmth',
  cg_caption_hub_origin: 'Plane Friction Fire',
  cg_caption_hub_quest: 'Current Mission',
  cg_caption_hub_walker: 'Plane Walker',
  cg_caption_fantasy_start: 'Greywood Forest Campfire',
  cg_caption_fantasy_deep: 'Ruined City & Boss Ring',
  cg_caption_fantasy_tip: 'Parry & Finisher',
  cg_caption_fantasy_boss1: 'Shadow Warden',
  cg_caption_magic_start: 'Hogwarts Legacy Reflection',
  cg_caption_magic_spell: 'Arcane Restraint',
  cg_caption_magic_boss2: 'Archmagus',
  cg_caption_space_start: 'Endurance Emergency Fire',
  cg_caption_space_well: 'Miller Gravity Well',
  cg_caption_space_boss3: 'Singularity Herald',
  cg_caption_void_start: 'Folded Timeline',
  cg_caption_void_stop: 'Time Stop Counter',
  cg_caption_void_hidden: 'Hidden Trial',
  cg_caption_void_exec: 'Execution Moment',
  cg_caption_abyss_start: 'Chaos Border',
  cg_caption_abyss_end: 'Final Trial',
  cg_caption_abyss_boss5: 'Rift Lord',
  cg_caption_gloom_start: 'Misty Forest Campfire',
  cg_caption_gloom_deep: 'Ancient Entrance',
  cg_caption_gloom_wraith: 'Misty Wraith',
  cg_caption_gloom_lantern: 'Mist Lantern',
  cg_caption_radiant_start: 'Radiant Dawn Sanctuary',
  cg_caption_radiant_deep: 'Dawn Gate',
  cg_caption_radiant_knight: 'Radiant Knight',
  cg_caption_radiant_gold: 'Dawn Charm',
  cg_caption_hub_gallery: 'CG Gallery Guide',
  cg_caption_hub_style: 'Combat Style',
  cg_caption_hub_rematch: 'Boss Rematch',
  cg_caption_fantasy_wisp: 'Soulfire Wisp',
  cg_caption_fantasy_journal: 'Journal Chronicle',
  cg_caption_magic_cg: 'Arcane CG',
  cg_caption_magic_codex: 'Codex Gate',
  cg_caption_space_photo: 'Wasteland Snapshot',
  cg_caption_space_rematch: 'Singularity Rematch',
  cg_caption_void_skip: '{escape} to Skip',
  cg_caption_void_memory: 'Campfire Memory',
  cg_caption_abyss_achieve: 'Achievement Wall',
  cg_caption_abyss_legend: 'Final Ritual',
  cg_caption_hub_dungeon: 'Dungeon Chronicle',
  cg_caption_hub_side: 'Side Quest',
  cg_caption_fantasy_streak: 'Kill Streak Soulfire',
  cg_caption_magic_skills: 'Branch Skills',
  cg_caption_void_death: 'Respawn Hint',
  cg_caption_abyss_credits: 'End Credits',
  // Pop Culture CG (Tribute Layer)
  cg_caption_magic_wizard: 'Wizard Academy',
  cg_caption_magic_broom: 'Broom Ring Race',
  cg_caption_space_interstellar: 'Interstellar Equation',
  cg_caption_space_stay: 'Stay',
  cg_caption_void_upside: 'Upside Down',
  cg_caption_void_radio: 'Old Town Radio',
  cg_caption_fantasy_lotr: 'Sovereign Ring',
  cg_caption_hub_echoes: 'Dimensional Echoes',
  cg_caption_magic_nine: 'Nine Platforms',
  cg_caption_magic_patronus: 'Patronus Lake',
  cg_caption_space_wormhole: 'Wormhole Arch',
  cg_caption_void_arcade: 'Arcade Cabinet',
  cg_caption_void_vecna: 'Vecna Clock Tower',
  cg_caption_fantasy_western: 'Border Tales',
  cg_caption_fantasy_duel: 'High Noon Duel',
  cg_caption_abyss_gangster: 'Nether Gang',
  cg_caption_space_scifi: 'Deep Space Era',
  cg_caption_space_jump: 'Jump Gate',
  cg_caption_hub_triad: 'The Triad',
  cg_caption_magic_cyber: 'Cyber Neon',
  cg_caption_fantasy_samurai: 'Samurai Echo',
  cg_caption_void_cosmic: 'Old Ones Whisper',
  cg_caption_space_starport: 'Starport Trade Route',
  cg_caption_hub_wave4: 'Wave4 Four Systems',
  // Combat tutorial: these two hold **key hints** (single-brace `{action}`, expanded by
  // keyText at paint time). Written as `${parry}` the i18n syntax wins: `t()` without params
  // does not substitute and `keyText` only knows single braces, so the `$` stayed on the
  // canvas — measured "$F Parry" (caught by tests/key-hint-outlets).
  cg_caption_parry: '{parry} Parry',
  cg_caption_lockon: '{lockOn} Lock On',
  // Misty Forest caption (`cg_caption_radiant_deep` is registered in the campfire block above)
  cg_caption_misty_deep: 'Misty Forest Depths',

  // CgGalleryRegistry.js — Gallery Catalog bonus items (slice 13)
  cg_gallery_finisher: 'Finisher Combo',
  cg_gallery_riposte: 'Riposte',
  cg_gallery_execution: 'Execution Moment',
  cg_gallery_boss_shadow: 'Shadow Warden Defeated',
  cg_gallery_boss_mage: 'Archmagus Defeated',
  cg_gallery_boss_singularity: 'Singularity Herald Defeated',
  cg_gallery_boss_void: 'Void Chronarch Defeated',
  cg_gallery_boss_chaos: 'Chaos Overlord Defeated',
  cg_gallery_dungeon_clear: 'Dungeon Cleared',
  cg_gallery_world_anchor: 'World Anchor Awakened',

  // Maze lore fragments (LORE_FRAGMENTS, slice 14)
  lore_1_title: 'Faded Stele',
  lore_1_text: '"The anchor split at the crossing of three realms; the walker must re-weld the gate with blood and fire."',
  lore_2_title: 'Soldier\'s Diary',
  lore_2_text: 'Third night. The walls move. Not a metaphor. Behind every door is wind, and in the wind is snow from another plane.',
  lore_3_title: 'Arcane Scrap',
  lore_3_text: 'The library does not store books—it stores disasters that have not yet happened.',
  lore_4_title: 'Stellar Beacon',
  lore_4_text: 'The gravity well on Miller\'s Wastes is no natural phenomenon. Someone is digging underneath.',
  lore_5_title: 'Timeline Inscription',
  lore_5_text: 'As you read this, another you has already fallen. Keep walking.',
  lore_6_title: 'Chaos Whisper',
  lore_6_text: 'The more doors, the thinner the boundary. The Boss is not a guardian—it is the crack itself.',
  lore_7_title: 'Keywarden\'s Plaque',
  lore_7_text: '"I only keep the doors. I do not ask where the traveler goes. But the maze remembers every lost soul."',
  lore_8_title: 'Hub Echo',
  lore_8_text: 'The World Anchor\'s pulse connects to every dungeon. Clear one dungeon, and the anchor glows a little brighter.',

  // Homage-layer lore fragments (W-D2 slice 16b)
  lore_pop_wizard_title: 'Spell Academy Scrap',
  lore_pop_wizard_text: '"The stairs change direction, the candles fly on their own — but soulfire does not."',
  lore_pop_inter_title: 'Endurance Log',
  lore_pop_inter_text: '"Do not go gentle into that good night — but you may rest by a campfire."',
  lore_pop_upside_title: 'Upside-Down Recording',
  lore_pop_upside_text: '"November 6, 1983 — the rift opened. Red lightning, no stars."',
  lore_pop_murphy_title: 'Gravity Handwriting',
  lore_pop_murphy_text: '"Stay — what is written on the shelves is not words, it is a handshake between dimensions."',
  lore_pop_broom_title: 'Quidditch Scorecard',
  lore_pop_broom_text: '"Third lap of the flying race — the will-o-wisp leads the broom by half a moon."',
  lore_pop_nine_title: 'Platform Scrap',
  lore_pop_nine_text: '"The brick wall cracks open in the middle of the platform — believers do not ask where the ticket gate is."',
  lore_pop_wormhole_title: 'Wormhole Note',
  lore_pop_wormhole_text: '"Those who pass through the ring age out of sync with their memories — but love does not."',
  lore_pop_arcade_title: 'Arcade Receipt',
  lore_pop_arcade_text: '"November 6, 1983 — the coin slot is packed with red spores, the game never ends."',
  lore_pop_vecna_title: 'Clock Tower Report',
  lore_pop_vecna_text: '"The hands stopped at 11:06 — every chime, the ceiling gets a little further away."',
  lore_pop_saloon_title: 'Saloon Mirror Scrap',
  lore_pop_saloon_text: '"The reflection in the cracked mirror is always half a beat ahead — before a duel, ask: who are you fighting?"',
  lore_pop_speakeasy_title: 'Speakeasy Receipt',
  lore_pop_speakeasy_text: '"Tariffs are not gold, they are soulfire — the gang manages the seam between worlds."',
  lore_pop_ai_core_title: 'AI Core Log',
  lore_pop_ai_core_text: '"Mission not complete. Objective: Plane Walker. Priority: above jump."',
  lore_pop_jump_gate_title: 'Jump Gate Manual',
  lore_pop_jump_gate_text: '"Three gates in phase. The out-of-phase one loops the first second — crueler than Miller\'s hourglass."',
  lore_pop_duel_title: 'Duel Circle Chalk',
  lore_pop_duel_text: '"The noon sun does not move, until someone draws a blade — or {parry} parries."',
  lore_pop_neon_title: 'Neon Receipt',
  lore_pop_neon_text: '"Optic 99% real — the remaining 1% is advertising."',
  lore_pop_torii_title: 'Torii Fragment',
  lore_pop_torii_text: '"Beyond the gate is not a shrine — it is a duel."',
  lore_pop_obelisk_title: 'Obelisk Rubbing',
  lore_pop_obelisk_text: '"The inscription is an angle — not a word."',
  lore_pop_cantina_title: 'Starport Menu',
  lore_pop_cantina_text: '"House specials: jump contracts, bounties, coordinates."',

  // Zone ambient events (W-D2 slice 16a: base layer / extra `_e` / homage `_p`)
  ambient_journal_title: 'Travel Notes',
  ambient_hub_0: 'The World Anchor hums low — the planes are still connected.',
  ambient_hub_1: 'A distant campfire warden is stacking firewood (there is no firewood).',
  ambient_fantasy_0: 'The Greywood has fogged up — watch the red circles.',
  ambient_fantasy_1: 'An elven whistle drifts from the treetops — the scout is patrolling.',
  ambient_fantasy_2: 'Stone doors grind somewhere toward the dungeon…',
  ambient_magic_0: 'Purple arcane motes drift down — the Archmagus is active somewhere far off.',
  ambient_magic_1: 'A faint glimmer flickers toward the Forbidden Library.',
  ambient_space_0: 'Gravity anomaly on Miller\'s Wastes — jump height slightly reduced.',
  ambient_space_1: 'Endurance log scraps tumble in the wind.',
  ambient_void_0: 'Time stuttered one frame — and you moved forward.',
  ambient_void_1: 'A timeline afterimage flickers in the distance, then is gone.',
  ambient_abyss_0: 'A chaos pulse sweeps the horizon — the rift is breathing.',
  ambient_abyss_1: 'The guide whispers: "Hurry. The boundary is thinning."',
  ambient_gloom_0: 'The fog thickened another layer — three steps ahead and you cannot see.',
  ambient_gloom_1: 'Something shifted in the branches overhead, then went still.',
  ambient_gloom_2: 'Moss glows between the roots, fading in and out, like something breathing.',
  ambient_radiant_0: 'Gold sand is pushed past your ankles by the wind, hot and fine.',
  ambient_radiant_1: 'The outline of a distant temple sways in the heat haze.',
  ambient_radiant_2: 'A very light bell toll — you cannot tell which tower it came from.',
  ambient_hub_e0: 'The CG gallery lives in the journal [{journal}] — campfire dialogues unlock illustrations.',
  ambient_hub_e1: 'Combat style rating flashes after a parry or an execution.',
  ambient_fantasy_e0: 'The Shadow Warden beacon column rises to the northeast — {interact} to fight again after defeating it.',
  ambient_fantasy_e1: 'The elven scout hums an old battle song by the campfire.',
  ambient_magic_e0: 'Arcane motes gather toward the Forbidden Library — codex entries await collection.',
  ambient_magic_e1: 'The Archmagus\'s orb tears across the sky from the castle.',
  ambient_space_e0: '{photoMode} photo mode captures the gravitational lens and beacon columns.',
  ambient_space_e1: 'The Endurance wreck resonates metallically in the wind.',
  ambient_void_e0: 'Where time folds, {escape} skips the execution slow-motion.',
  ambient_void_e1: 'Campfire memories record every single fire you slept by.',
  ambient_abyss_e0: 'The achievement wall lives in the journal [{journal}] — still collectible after the finale.',
  ambient_abyss_e1: 'The chaos pulse and the lightning are in sync — the rift is breathing.',
  ambient_magic_p0: 'Floating candles drift out of a tower window — like a night watch at some wizarding academy.',
  ambient_magic_p1: 'A unicorn\'s whisper comes from deep in the forbidden forest — or the mandrake\'s dream.',
  ambient_magic_p2: 'Platform 9¾ brickwork flickers in the fog.',
  ambient_magic_p3: 'The Black Lake mirrors a silver light — as if someone were running far away.',
  ambient_magic_p4: 'A holographic short in the neon alley — cyberpunk bleeding into the ruins.',
  ambient_space_p0: 'Toward the Murphy bookshelf, gravity twists slightly.',
  ambient_space_p1: "Miller's hourglass sand falls too fast — do not linger in a fight here.",
  ambient_space_p2: 'A metal ring turns slowly in the distance at the docking bay.',
  ambient_space_p3: 'A wormhole arch folds starlight on the west of the waste — do not stare too long.',
  ambient_space_p4: 'A Mann-style fake beacon blinks on the ice — light and lies share a frequency.',
  ambient_space_p5: 'Inside the colony dome it is an artificial dusk — outside the waste, another sky.',
  ambient_space_p6: 'A dormant AI core hums low: "Mission not complete."',
  ambient_space_p7: 'The jump gate array pulses blue — all three gates must be in phase.',
  ambient_space_p8: 'A hundred dialects in the starport tavern blend into one laugh.',
  ambient_void_p0: 'Red spores drift down — the upside-down wind leaks through the rift.',
  ambient_void_p1: 'An old-town broadcast tower blinks red in the fog.',
  ambient_void_p2: 'A Walkman tape plays backwards in the wind — you hear an SOS from 1983.',
  ambient_void_p3: 'Four bicycle lamps line up in the fog — like a night procession.',
  ambient_void_p4: 'An arcade CRT flickers green in the distance — Pac-Man is always one step behind.',
  ambient_void_p5: 'The clock tower points silently at 11:06 — the ceiling feels further away.',
  ambient_void_p6: 'The spiral well echoes a count — do not approach the wellhead.',
  ambient_fantasy_p0: 'The One Ring whispers low — One Realm to bind them all…',
  ambient_fantasy_p1: 'A turning door creaks toward the saloon mirrors — border history stirs at the Greywood edge.',
  ambient_fantasy_p2: 'The noon duel circle\'s chalk line glows in the fog — do not fight inside it.',
  ambient_fantasy_p3: 'A steam whistle from the ghost railway — the train never arrives.',
  ambient_fantasy_p4: 'A broken torii glows red in the fog — the samurai echo has not faded.',
  ambient_hub_p0: 'The poster wall is to the east — six faded plane posters waiting to resonate.',
  ambient_hub_p1: 'Three more colors joined the poster wall — western, noir, and deep-space sci-fi motifs are now in the echoes.',
  ambient_abyss_p0: 'Warm light leaks through the speakeasy door crack — the gang is negotiating border tariffs.',
  ambient_abyss_p1: 'Crates collide in the dock warehouse — the soulfire smuggling line still runs.',
  ambient_abyss_p2: 'Three family-altar candles light a black mirror — the one in it is not you.',

  // Dungeon boss intro (W-D2 slice 16c)
  boss_lore_ruin_crypt_title: 'Ruin Crypt Keeper',
  boss_lore_ruin_crypt_text: 'The tomb keeper at the bottom of the Greywhite Ruins has awoken. Defeat it, and the anchor fragment will appear.',
  boss_lore_forbidden_library_title: 'Forbidden Library Pagekeeper',
  boss_lore_forbidden_library_text: 'Ten thousand forbidden books fused into a single name. It allows no one to read the last page.',
  boss_lore_five_dim_rift_title: 'Rift Foreman',
  boss_lore_five_dim_rift_text: 'A projection of a five-dimensional being. Here it is only three-dimensional — and still deadly enough.',
  boss_lore_forest_shrine_title: 'Shrine Ancient Tree',
  boss_lore_forest_shrine_text: 'The roots entwine more than stone — they entwine the memory of a previous era.',
  boss_lore_hub_catacombs_title: 'Hub Keywarden',
  boss_lore_hub_catacombs_text: 'At the deepest point of the catacombs, the keywarden waits for the one who can walk every maze.',

  // Chapter intros (W-D2 slice 16c)
  chapter_intro_2_title: 'Chapter 2 · Endless Planes',
  chapter_intro_2_text: `After the anchor was reforged, the walls between planes thinned.

The wanderer says chests and campfires are the basics of survival; the elven scout points to deeper boss circles. Beyond the five zones, more mazes are waiting.`,
  chapter_intro_3_title: 'Chapter 3 · Plane Ascension',
  chapter_intro_3_text: `The arcane and stellar fragments are both in hand. The three dungeons are the final trials before ascension: the ruins, the library, the rift.

Learn spells 1–4, unlock weapon skills at a campfire, then face the Singularity Herald.`,
  chapter_intro_4_title: 'Chapter 4 · Broken Timeline',
  chapter_intro_4_text: `Time folds here. Head north into the Broken Timeline — a charged spell can interrupt a boss.

The Void Chronarch guards the fourth fragment. Defeat it, and you will reach the threshold of the true Plane Walker.`,
  chapter_intro_5_title: 'Chapter 5 · Chaos Border',
  chapter_intro_5_text: `Chaos is not the end, it is a sieve. Lightning strikes without warning in the northwest border.

After the Rift Lord falls, the old dungeons return with a random layout for the "abyss redive" — the last step toward becoming an Endless Walker.`,

  // Zone story hooks (W-D2 slice 16c: the single source of truth in ZONE_STORY_HOOKS)
  zone_hook_hub_toast: 'Hub: where all planes intersect. The World Anchor\'s pulse spreads from here.',
  zone_hook_hub_journal: 'Crossing Hub — the center of the planes. Every cross-plane journey leaves a footprint on the anchor.',
  zone_hook_fantasy_toast: 'Greywhite Forest: elven ruins and the One Ring. The Shadow Warden holds the west.',
  zone_hook_fantasy_journal: 'The Greywhite Forest reeks of old wars. The ring and the tower hold the Ch1 fragments.',
  zone_hook_magic_toast: 'Hogwarts Ruins: floating castles drift in the fog. The Forbidden Forest whispers you off course.',
  zone_hook_magic_journal: 'Hogwarts-style ruins. The Archmagus\'s arena lies deeper in.',
  zone_hook_space_toast: 'Miller\'s Wastes: the gravitational lens bends starlight. The Endurance wreck is still broadcasting.',
  zone_hook_space_journal: 'Time feels unreliable in the stellar zone. The five-dimensional tesseract is the core puzzle of Ch3.',
  zone_hook_void_toast: 'Broken Timeline: gravity flips without warning. A charged spell is the key to survival.',
  zone_hook_void_journal: 'Timeline rifts and five-dimensional steles meet here. The true ending of Ch4 is hidden within.',
  zone_hook_abyss_toast: 'Chaos Border: lightning falls without warning. The chaos core pulses to the northwest.',
  zone_hook_abyss_journal: 'The endgame of Ch5. The Rift Lord\'s arena is the last judgment.',

  // Dungeon entry lines and stats (W-D2 slice 16c)
  dungeon_enter_ruin_crypt: 'Ruins Maze: the stone walls remember every footstep.',
  dungeon_enter_forbidden_library: 'Forbidden Maze: behind the shelves is not books, but disasters that have not happened.',
  dungeon_enter_five_dim_rift: 'Rift Maze: geometry is not trustworthy here.',
  dungeon_enter_forest_shrine: 'Shrine Maze: the roots breathe underfoot.',
  dungeon_enter_hub_catacombs: 'Hub Catacombs: the shortest maze, the deepest keywarden.',
  dungeon_enter_stats: 'Maze ${w}×${h} · ${rooms} rooms · ${doors} doors.\nClear a room\'s enemies and its door opens; glowing stelae [{interact}] read the lore; the roundest room holds the keywarden.',
  keywarden_cleared_title: 'The Keywarden Has Fallen',
  keywarden_cleared_text: 'The exit ring lights up. You hear a sigh from deep in the hub — as if some plane finally exhaled.\n\n[{interact}] Leave the maze and continue the main line.',

  // The five bonus rows (were literals in content/cgGallery.js; same batch as the ten above)
  cg_gallery_style_ss: 'Combat Style SS',
  cg_gallery_rematch: 'Boss Rematch',
  cg_gallery_codex_full: 'Codex Complete',
  cg_gallery_photo: 'Wasteland Snapshot',
  cg_gallery_campfire_all: 'Six Fires Rested',

  // HelpManual.js — Help Manual body (slice 14)
  hm_title_start: 'Quick Start',
  hm_title_combat: 'Combat Controls',
  hm_title_world: 'World & Planes',
  hm_title_dungeons: 'Dungeons & Bosses',
  hm_title_bosses: 'Five Boss Guide',
  hm_title_autoplay: 'Auto-play',
  hm_title_perf_hud: 'Performance HUD & Save',

  hm_body_start: `Welcome to the Crossrealm Chronicles browser Demo.

1. Click the screen to lock the mouse, WASD to move, {sprint} to sprint
2. {cameraMode} to switch first/third person (recommended third person — Dark Souls style orbital camera, mouse directly turns view)
3. Mouse wheel to scale camera distance · Camera always looks at character, no more "looking at the ground in front" causing motion sickness
2. Walk to the blue "World Anchor" and press {interact} to accept the mission
3. East training dummy to practice combos (left click light hit, right click heavy hit)
4. Press {journal} to open the quest log, follow Chapter 1→5 main line
5. Approach campfire and press {interact} with **Resident NPC** for branch dialogue, then select "Rest / Upgrade"; Chapter 2 onward can use {fastTravel} fast travel
6. {save} save · {load} read · {escape} pause (can export/import JSON save, old version auto migrates)
7. {questTracker} Plane Assistant → "Auto-play" : your character personally runs the whole flow · {escape} stop`,

  hm_body_combat: `Left click — light hit combo (combo increased damage, high combo can finish tech flash screen)
Right click — heavy hit / execution (parry success after)
{parry} — parry (enemy red circle attack before pressing)
{roll} — dodge (HUD stamina bar below shows dodge CD)
{lockOn} — lock onto nearest enemy (press again to cancel)
{skill} — Plane Slash (weapon skill)
{spell1}–{spell4} — magic (long press {spell1}/{spell2}/{spell3} to charge, can interrupt Boss time stop)
{swapWeapon} — switch sword / staff (affects melee and magic bonus)
Parry success then right click to execute; Boss fight note phase hint and stance bar

【Boss General Tactics】
1. Approach Boss and press {lockOn} to lock on, camera will follow target
2. Observe red circle under feet: when circle almost full press {parry} parry → immediately right click execute (high damage)
3. Can't parry? {roll} dodge roll away, wait for Boss to finish move then left click combo
4. Combo 3~5 times then heavy hit, fill enemy top stance bar to stagger hard state；**execution/Boss break** has slow motion track lock
5. Not enough stamina? pull back, wait for full refill；dead find campfire {interact} rest to refill
6. {skill} Plane Slash (range AOE) suitable for small mobs surrounding or Boss hard state follow-up
7. {spell1}~{spell4} magic：Boss when time stop/big move long press {spell1}/{spell2}/{spell3} to charge can interrupt`,

  hm_body_world: `Exchange Hub — start point, World Anchor and Training Dummy
Greywhite Forest (West) — Shadow Warden Boss
Hogwarts Legacy Relic (North) — Great Arcanist Boss，Bloom enhanced
Miller Wasteland (East) — Singularity Lord Boss
Broken Timeline (Northeast) — hidden plane，gravity inversion + time echo
Chaos Border (Northwest) — Chaos Lord，lightning storm

Crossing area triggers "Plane Leak" visual + sound layer.
Map has 12 "Plane Echo" soul fires：approach will be attracted and absorbed，gain Plane Souls.
{zonePanel} open area panel · {minimap} mini map · discovered objects recorded in {journal} log`,

  hm_body_dungeons: `Three dungeon entrances (purple teleport ring，press {interact} to enter):
· Greywhite Forest — Ruin crypt
· Hogwarts Legacy Relic — Forbidden Library
· Miller Wasteland — Five-dimensional Rift

Clear monsters then can leave and push mission。Five Bosses each correspond to one chapter；
Timeline Executor is Chapter 4 hidden Boss（Broken Timeline deep Z≈235）。
Defeat Boss gains large amount soul fire + 2 weapon skill points.
{settings} open screen settings（volume，Bloom，shadow etc）`,

  hm_body_bosses: `【Shadow Warden】Greywhite Forest west X≈-250
· slow moves，good to parry；lock on then backstab
· Phase 2 will summon shadow soldiers，first clear small mobs or {skill} Plane Slash

【Great Arcanist】Hogwarts Legacy north X≈5 Z≈-220
· many remote magic，sidestep dodge（{roll}）approach then hit
· charge fireball windup long，can {parry} parry or charge {spell1} magic duel

【Singularity Lord】Miller Wasteland X≈235 Z≈155
· will teleport，lock on {lockOn} don't lose
· gravity circle when roll outward，landing hard state heavy hit

【Timeline Executor】Broken Timeline Z≈235（Ch4+，gravity inversion area）
· notice walking height change，roll direction opposite usual
· before time stop will have blue forewarning，charge spell can interrupt

【Chaos Lord】Chaos Border X≈-200 Z≈285（Ch5+）
· lightning storm lowers vision，close-range stab output
· Phase 2 enrage，parry window shorter，prioritize dodge roll`,

  hm_body_autoplay: `Press {questTracker} to open Plane Assistant → click "Auto-play (operate your character)"。

Your character will start from Hub，automatically walk through five zones and push all missions.
Camera follows behind，no need to operate；{escape} stop anytime。

If only want skip walking directly complete acceptance，click "Instant Acceptance".`,

  hm_body_perf_hud: `{perfHud} toggle Performance HUD（dev tool，doesn't affect gameplay）。

Value shows yellow +N means this count relative to historical lowest net increase N；red means increase exceeds tolerance——
Repeat in/out dungeons after "Geometry / Texture / Shader / Scene Node" should return to original value，only increase no decrease means leak。

Save currently v6（crossrealm_save_v6）。{save} save · {load} read · {escape} pause menu can export/import JSON。
Old v4 / v5 save will at startup explicitly migrate to v6 and hint，original key keep one for rollback；
Can't parse save will transfer to crossrealm_save_v6:corrupt and pop explanation，instead of silently lost。`,

  // Extra sections (HELP_SECTIONS_EXTRA, W-D2 slice15)
  hm_title_journal_tabs: 'Journal Tabs',
  hm_body_journal_tabs: `[{journal}] open Crossrealm Journal, besides quests/fragments/Boss there are:

· CG Gallery — campfire & combat illustrations, click to enlarge
· Achievements — parry, combo, Boss, exploration
· Codex — plane lore gallery
· Campfire Memory — rest count & dialogue review
· Dungeons — maze clear records
· Styles — sword/staff skill tree preview
· Side Quests — optional objectives, auto-reward souls

Tab buttons show unlocked count。`,
  hm_title_meta_systems: 'Meta Systems',
  hm_body_meta_systems: `Combat Style — parry/finish/execute/Boss accumulate rating C~SS
Boss Rematch — after defeat, summon at beacon with {interact}, +5 souls
Kill-streak Souls — 3+ kills within 4.5s gives extra souls
{photoMode} Photo — hide HUD screenshot
{escape} — execution slow-mo skippable; ending credits skippable
Zone Switch — fullscreen transition + zone name`,
  hm_title_pop_culture: 'Cross-echoes (Homage)',
  hm_body_pop_culture: `Homage to pop-culture through motifs & atmosphere, names deliberately differentiated (no official license).

Hogwarts Ruins — spell academy, flying-ring race, potion greenhouse
Miller Wastes — Murphy bookshelf, Miller hourglass, docking pod
Shattered Timeline — inverse realm: broadcast tower, rift, neon, rift hound
Hub east — plane poster wall

{journal} → Cross-echoes tab · press {interact} to investigate map light-pillar POI

Wave2: Nine-platform Station, Mind Lake, Triwizard Stage, Wormhole, Mann Beacon, Arcade, Phase-clock Tower, etc.

Wave3 three-franchise motifs:
· Greywhite Forest — Frontier Past (Western): salon mirror wall, noon duel circle, ghost railroad
· Chaos Frontier — Ghost Gang (mob): bootleg cellar, family shrine, dock warehouse
· Miller Wastes — Deep-space Era (sci-fi): colony dome, dormant AI, jump-gate array
Entering the corresponding plane has slight visual overlay; POI interaction briefly enhances.

Wave4 four schools: Cyber Neon (Ruins) · Samurai Echo (Forest) · Old Whisper (Timeline) · Star Port (Wastes)`,
});

/** Key list (for static gates: ensure nothing slips through) */
export const STRING_KEYS = Object.keys(STRINGS_EN);