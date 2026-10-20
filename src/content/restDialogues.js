/**
 * 营火分支对话树 —— 全部区域（W-B2 数据外移）。
 *
 * 树上**不带营火名**（W-B4 切片2）：这座火叫什么只有 `content/restPointNames.js` 那一格说了算。
 * 这里曾经每棵树抄一份 `title` 当对话标题，于是玩家站在枢纽火边看到提示写"世界之锚休息点"、
 * 一秒后开出来的对话标题写"世界之锚营火"，而 `magic` 抄的还是早已废弃的区名 '魔法遗境'。
 * 两份都是合法字符串，加载期与内容校验都没意见 —— 只有玩家看得出这座火有两个名字。
 *
 * 搬前分四层：`RestDialogue.js` 的基础树 + `RestDialogueExtras.js` +
 * `RestDialogueExtras2.js` + `RestDialoguePopCulture(Wave2/3/4).js`，
 * 每层都是 `structuredClone(base)` 之后 `nodes[nodeId] = node` 再往 `start.choices`
 * 里插几条。合并顺序会真的改变玩家看到的选项顺序（hub 那一层用的是 `splice(2, 0, …)`），
 * 所以"增量表 + 追加"这种形状搬不动它 —— 直接把**合并以后的整棵树**放在这里，
 * 一棵树一处改，`registry.js` 在加载期校验区域 id、节点形状与 `next` 的落点。
 */
export const REST_DIALOGUES = {
  hub: {
    nodes: {
      start: {
        mood: "calm",
        text: 'rest_dlg_hub_start_text',
        choices: [
          { label: 'rest_dlg_label_rest_upgrade', action: "rest" },
          { label: 'rest_dlg_hub_start_c2', next: "origin" },
          { label: 'rest_dlg_hub_start_c3', next: "gallery" },
          { label: 'rest_dlg_hub_start_c4', next: "style" },
          { label: 'rest_dlg_hub_start_c5', next: "rematch", minChapter: 2 },
          { label: 'rest_dlg_hub_start_c6', next: "quest" },
          { label: 'rest_dlg_hub_start_c7', next: "walker", minChapter: 2 },
          { label: 'rest_dlg_hub_start_c8', next: "dungeon" },
          { label: 'rest_dlg_hub_start_c9', next: "side" },
          { label: 'rest_dlg_hub_start_c10', next: "echoes" },
          { label: 'rest_dlg_hub_start_c11', next: "triad" },
          { label: 'rest_dlg_hub_start_c12', next: "wave4" },
        ],
      },
      origin: {
        mood: "calm",
        text: 'rest_dlg_hub_origin_text',
        choices: [
          { label: 'rest_dlg_hub_origin_c1', action: "rest" },
          { label: 'rest_dlg_hub_origin_c2', next: "start" },
          { label: 'rest_dlg_hub_origin_c3', next: "souls" },
        ],
      },
      souls: {
        text: 'rest_dlg_hub_souls_text',
        journal: { id: "rest-hub-souls", title: 'rest_dlg_hub_souls_jt', text: 'rest_dlg_hub_souls_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      walker: {
        mood: "warn",
        text: 'rest_dlg_hub_walker_text',
        choices: [
          { label: 'rest_dlg_hub_walker_c1', action: "rest" },
        ],
      },
      quest: {
        text: null,
        choices: [
          { label: 'rest_dlg_hub_quest_c1', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      gallery: {
        text: 'rest_dlg_hub_gallery_text',
        journal: { id: "rest-hub-gallery", title: 'rest_dlg_hub_gallery_jt', text: 'rest_dlg_hub_gallery_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      style: {
        text: 'rest_dlg_hub_style_text',
        choices: [
          { label: 'rest_dlg_hub_style_c1', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      rematch: {
        mood: "warn",
        text: 'rest_dlg_hub_rematch_text',
        journal: { id: "rest-hub-rematch", title: 'rest_dlg_hub_rematch_jt', text: 'rest_dlg_hub_rematch_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
        minChapter: 2,
      },
      dungeon: {
        text: 'rest_dlg_hub_dungeon_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      side: {
        text: 'rest_dlg_hub_side_text',
        journal: { id: "rest-hub-side", title: 'rest_dlg_hub_side_jt', text: 'rest_dlg_hub_side_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      echoes: {
        text: 'rest_dlg_hub_echoes_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      triad: {
        text: 'rest_dlg_hub_triad_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      wave4: {
        text: 'rest_dlg_hub_wave4_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
    },
  },
  fantasy: {
    nodes: {
      start: {
        text: 'rest_dlg_fantasy_start_text',
        choices: [
          { label: 'rest_dlg_label_rest_upgrade', action: "rest" },
          { label: 'rest_dlg_fantasy_start_c2', next: "deep" },
          { label: 'rest_dlg_fantasy_start_c3', next: "tip" },
          { label: 'rest_dlg_fantasy_start_c4', next: "boss1" },
          { label: 'rest_dlg_fantasy_start_c5', next: "wisp" },
          { label: 'rest_dlg_fantasy_start_c6', next: "journal" },
          { label: 'rest_dlg_fantasy_start_c7', next: "streak" },
          { label: 'rest_dlg_fantasy_start_c8', next: "lotr" },
          { label: 'rest_dlg_fantasy_start_c9', next: "western" },
          { label: 'rest_dlg_fantasy_start_c10', next: "duel" },
          { label: 'rest_dlg_fantasy_start_c11', next: "rails" },
          { label: 'rest_dlg_fantasy_start_c12', next: "samurai" },
        ],
      },
      deep: {
        text: 'rest_dlg_fantasy_deep_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      tip: {
        mood: "warn",
        text: 'rest_dlg_fantasy_tip_text',
        choices: [
          { label: 'rest_dlg_fantasy_tip_c1', action: "rest" },
        ],
      },
      boss1: {
        mood: "warn",
        text: 'rest_dlg_fantasy_boss1_text',
        journal: { id: "rest-fantasy-boss1", title: 'rest_dlg_fantasy_boss1_jt', text: 'rest_dlg_fantasy_boss1_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      wisp: {
        text: 'rest_dlg_fantasy_wisp_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      journal: {
        text: 'rest_dlg_fantasy_journal_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      streak: {
        text: 'rest_dlg_fantasy_streak_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      lotr: {
        text: 'rest_dlg_fantasy_lotr_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      western: {
        text: 'rest_dlg_fantasy_western_text',
        journal: { id: "rest-fantasy-western", title: 'rest_dlg_fantasy_western_jt', text: 'rest_dlg_fantasy_western_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      duel: { text: 'rest_dlg_fantasy_duel_text', choices: [
  { label: 'rest_dlg_label_rest', action: "rest" },
] },
      rails: { text: 'rest_dlg_fantasy_rails_text', choices: [
  { label: 'rest_dlg_label_rest', action: "rest" },
] },
      samurai: {
        text: 'rest_dlg_fantasy_samurai_text',
        journal: { id: "rest-fantasy-samurai", title: 'rest_dlg_fantasy_samurai_jt', text: 'rest_dlg_fantasy_samurai_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
    },
  },
  magic: {
    nodes: {
      start: {
        text: 'rest_dlg_magic_start_text',
        choices: [
          { label: 'rest_dlg_label_rest_upgrade', action: "rest" },
          { label: 'rest_dlg_magic_start_c2', next: "spell" },
          { label: 'rest_dlg_magic_start_c3', next: "lib" },
          { label: 'rest_dlg_magic_start_c4', next: "boss2", minChapter: 2 },
          { label: 'rest_dlg_magic_start_c5', next: "cg" },
          { label: 'rest_dlg_magic_start_c6', next: "codex" },
          { label: 'rest_dlg_magic_start_c7', next: "skills" },
          { label: 'rest_dlg_magic_start_c8', next: "wizard" },
          { label: 'rest_dlg_magic_start_c9', next: "broom" },
          { label: 'rest_dlg_magic_start_c10', next: "nine" },
          { label: 'rest_dlg_magic_start_c11', next: "patronus" },
          { label: 'rest_dlg_magic_start_c12', next: "triwizard" },
          { label: 'rest_dlg_magic_start_c13', next: "cyber" },
        ],
      },
      spell: {
        text: 'rest_dlg_magic_spell_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      lib: {
        text: 'rest_dlg_magic_lib_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      boss2: {
        mood: "warn",
        text: 'rest_dlg_magic_boss2_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      cg: {
        text: 'rest_dlg_magic_cg_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      codex: {
        text: 'rest_dlg_magic_codex_text',
        journal: { id: "rest-magic-codex", title: 'rest_dlg_magic_codex_jt', text: 'rest_dlg_magic_codex_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      skills: {
        text: 'rest_dlg_magic_skills_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      wizard: {
        text: 'rest_dlg_magic_wizard_text',
        journal: { id: "rest-magic-wizard", title: 'rest_dlg_magic_wizard_jt', text: 'rest_dlg_magic_wizard_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      broom: {
        text: 'rest_dlg_magic_broom_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      nine: {
        text: 'rest_dlg_magic_nine_text',
        journal: { id: "rest-magic-nine", title: 'rest_dlg_magic_nine_jt', text: 'rest_dlg_magic_nine_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      patronus: { text: 'rest_dlg_magic_patronus_text', choices: [
  { label: 'rest_dlg_label_rest', action: "rest" },
] },
      triwizard: { text: 'rest_dlg_magic_triwizard_text', choices: [
  { label: 'rest_dlg_label_rest', action: "rest" },
] },
      cyber: {
        text: 'rest_dlg_magic_cyber_text',
        journal: { id: "rest-magic-cyber", title: 'rest_dlg_magic_cyber_jt', text: 'rest_dlg_magic_cyber_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
    },
  },
  space: {
    nodes: {
      start: {
        text: 'rest_dlg_space_start_text',
        choices: [
          { label: 'rest_dlg_label_rest_upgrade', action: "rest" },
          { label: 'rest_dlg_space_start_c2', next: "well" },
          { label: 'rest_dlg_space_start_c3', next: "rift" },
          { label: 'rest_dlg_space_start_c4', next: "boss3", minChapter: 3 },
          { label: 'rest_dlg_space_start_c5', next: "photo" },
          { label: 'rest_dlg_space_start_c6', next: "rematch", minChapter: 3 },
          { label: 'rest_dlg_space_start_c7', next: "interstellar" },
          { label: 'rest_dlg_space_start_c8', next: "stay" },
          { label: 'rest_dlg_space_start_c9', next: "wormhole" },
          { label: 'rest_dlg_space_start_c10', next: "brand" },
          { label: 'rest_dlg_space_start_c11', next: "love" },
          { label: 'rest_dlg_space_start_c12', next: "scifi" },
          { label: 'rest_dlg_space_start_c13', next: "ai" },
          { label: 'rest_dlg_space_start_c14', next: "jump" },
          { label: 'rest_dlg_space_start_c15', next: "starport" },
        ],
      },
      well: {
        mood: "warn",
        text: 'rest_dlg_space_well_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      rift: {
        text: 'rest_dlg_space_rift_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      boss3: {
        text: 'rest_dlg_space_boss3_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      photo: {
        text: 'rest_dlg_space_photo_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      rematch: {
        mood: "warn",
        text: 'rest_dlg_space_rematch_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
        minChapter: 3,
      },
      interstellar: {
        text: 'rest_dlg_space_interstellar_text',
        journal: { id: "rest-space-inter", title: 'rest_dlg_space_interstellar_jt', text: 'rest_dlg_space_interstellar_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      stay: {
        text: 'rest_dlg_space_stay_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      wormhole: {
        text: 'rest_dlg_space_wormhole_text',
        journal: { id: "rest-space-wormhole", title: 'rest_dlg_space_wormhole_jt', text: 'rest_dlg_space_wormhole_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      brand: {
        text: 'rest_dlg_space_brand_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      love: {
        text: 'rest_dlg_space_love_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      scifi: {
        text: 'rest_dlg_space_scifi_text',
        journal: { id: "rest-space-scifi", title: 'rest_dlg_space_scifi_jt', text: 'rest_dlg_space_scifi_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      ai: {
        text: 'rest_dlg_space_ai_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      jump: { text: 'rest_dlg_space_jump_text', choices: [
  { label: 'rest_dlg_label_rest', action: "rest" },
] },
      starport: {
        text: 'rest_dlg_space_starport_text',
        journal: { id: "rest-space-starport", title: 'rest_dlg_space_starport_jt', text: 'rest_dlg_space_starport_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
    },
  },
  void: {
    nodes: {
      start: {
        text: 'rest_dlg_void_start_text',
        choices: [
          { label: 'rest_dlg_label_rest_upgrade', action: "rest" },
          { label: 'rest_dlg_void_start_c2', next: "stop" },
          { label: 'rest_dlg_void_start_c3', next: "hidden" },
          { label: 'rest_dlg_void_start_c4', next: "exec" },
          { label: 'rest_dlg_void_start_c5', next: "skip" },
          { label: 'rest_dlg_void_start_c6', next: "memory" },
          { label: 'rest_dlg_void_start_c7', next: "death" },
          { label: 'rest_dlg_void_start_c8', next: "upside" },
          { label: 'rest_dlg_void_start_c9', next: "radio" },
          { label: 'rest_dlg_void_start_c10', next: "arcade" },
          { label: 'rest_dlg_void_start_c11', next: "bike" },
          { label: 'rest_dlg_void_start_c12', next: "vecna" },
          { label: 'rest_dlg_void_start_c13', next: "lab" },
          { label: 'rest_dlg_void_start_c14', next: "cosmic" },
        ],
      },
      stop: {
        mood: "warn",
        text: 'rest_dlg_void_stop_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      hidden: {
        text: 'rest_dlg_void_hidden_text',
        journal: { id: "rest-void-hidden", title: 'rest_dlg_void_hidden_jt', text: 'rest_dlg_void_hidden_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      exec: {
        text: 'rest_dlg_void_exec_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      skip: {
        text: 'rest_dlg_void_skip_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      memory: {
        text: 'rest_dlg_void_memory_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      death: {
        text: 'rest_dlg_void_death_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      upside: {
        text: 'rest_dlg_void_upside_text',
        journal: { id: "rest-void-upside", title: 'rest_dlg_void_upside_jt', text: 'rest_dlg_void_upside_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      radio: {
        text: 'rest_dlg_void_radio_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      arcade: {
        text: 'rest_dlg_void_arcade_text',
        journal: { id: "rest-void-arcade", title: 'rest_dlg_void_arcade_jt', text: 'rest_dlg_void_arcade_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      bike: {
        text: 'rest_dlg_void_bike_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      vecna: {
        mood: "warn",
        text: 'rest_dlg_void_vecna_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      lab: {
        text: 'rest_dlg_void_lab_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      cosmic: {
        mood: "warn",
        text: 'rest_dlg_void_cosmic_text',
        journal: { id: "rest-void-cosmic", title: 'rest_dlg_void_cosmic_jt', text: 'rest_dlg_void_cosmic_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
    },
  },
  abyss: {
    nodes: {
      start: {
        mood: "warn",
        text: 'rest_dlg_abyss_start_text',
        choices: [
          { label: 'rest_dlg_label_rest_upgrade', action: "rest" },
          { label: 'rest_dlg_abyss_start_c2', next: "end" },
          { label: 'rest_dlg_abyss_start_c3', next: "rerun" },
          { label: 'rest_dlg_abyss_start_c4', next: "boss5", minChapter: 5 },
          { label: 'rest_dlg_abyss_start_c5', next: "achieve" },
          { label: 'rest_dlg_abyss_start_c6', next: "legend", minChapter: 5 },
          { label: 'rest_dlg_abyss_start_c7', next: "credits", minChapter: 5 },
          { label: 'rest_dlg_abyss_start_c8', next: "gangster" },
          { label: 'rest_dlg_abyss_start_c9', next: "speakeasy" },
          { label: 'rest_dlg_abyss_start_c10', next: "dock" },
        ],
      },
      end: {
        text: 'rest_dlg_abyss_end_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      rerun: {
        text: 'rest_dlg_abyss_rerun_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      boss5: {
        mood: "warn",
        text: 'rest_dlg_abyss_boss5_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      achieve: {
        text: 'rest_dlg_abyss_achieve_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
      },
      legend: {
        mood: "warn",
        text: 'rest_dlg_abyss_legend_text',
        journal: { id: "rest-abyss-legend", title: 'rest_dlg_abyss_legend_jt', text: 'rest_dlg_abyss_legend_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
        minChapter: 5,
      },
      credits: {
        text: 'rest_dlg_abyss_credits_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
        ],
        minChapter: 5,
      },
      gangster: {
        mood: "warn",
        text: 'rest_dlg_abyss_gangster_text',
        journal: { id: "rest-abyss-gangster", title: 'rest_dlg_abyss_gangster_jt', text: 'rest_dlg_abyss_gangster_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      speakeasy: { text: 'rest_dlg_abyss_speakeasy_text', choices: [
  { label: 'rest_dlg_label_rest', action: "rest" },
] },
      dock: { text: 'rest_dlg_abyss_dock_text', choices: [
  { label: 'rest_dlg_label_rest', action: "rest" },
] },
    },
  },
  gloom: {
    nodes: {
      start: {
        text: 'rest_dlg_gloom_start_text',
        choices: [
          { label: 'rest_dlg_label_rest_upgrade', action: "rest" },
          { label: 'rest_dlg_gloom_start_c2', next: "deep" },
          { label: 'rest_dlg_gloom_start_c3', next: "moss" },
          { label: 'rest_dlg_gloom_start_c4', next: "wraith" },
          { label: 'rest_dlg_gloom_start_c5', next: "lantern" },
          { label: 'rest_dlg_gloom_start_c6', next: "mist" },
          { label: 'rest_dlg_label_side_quest', next: "side" },
          { label: 'rest_dlg_gloom_start_c8', next: "ancient" },
        ],
      },
      deep: {
        text: 'rest_dlg_gloom_deep_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      moss: {
        text: 'rest_dlg_gloom_moss_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      wraith: {
        mood: "warn",
        text: 'rest_dlg_gloom_wraith_text',
        journal: { id: "rest-gloom-wraith", title: 'rest_dlg_gloom_wraith_jt', text: 'rest_dlg_gloom_wraith_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      lantern: {
        text: 'rest_dlg_gloom_lantern_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      mist: {
        text: 'rest_dlg_gloom_mist_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      side: {
        text: 'rest_dlg_gloom_side_text',
        journal: { id: "rest-gloom-side", title: 'rest_dlg_gloom_side_jt', text: 'rest_dlg_gloom_side_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      ancient: {
        text: 'rest_dlg_gloom_ancient_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
    },
  },
  radiant: {
    nodes: {
      start: {
        text: 'rest_dlg_radiant_start_text',
        choices: [
          { label: 'rest_dlg_label_rest_upgrade', action: "rest" },
          { label: 'rest_dlg_radiant_start_c2', next: "deep" },
          { label: 'rest_dlg_radiant_start_c3', next: "blessing" },
          { label: 'rest_dlg_radiant_start_c4', next: "knight" },
          { label: 'rest_dlg_radiant_start_c5', next: "gold" },
          { label: 'rest_dlg_radiant_start_c6', next: "altar" },
          { label: 'rest_dlg_label_side_quest', next: "side" },
          { label: 'rest_dlg_radiant_start_c8', next: "starport" },
        ],
      },
      deep: {
        text: 'rest_dlg_radiant_deep_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      blessing: {
        text: 'rest_dlg_radiant_blessing_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      knight: {
        mood: "warn",
        text: 'rest_dlg_radiant_knight_text',
        journal: { id: "rest-radiant-knight", title: 'rest_dlg_radiant_knight_jt', text: 'rest_dlg_radiant_knight_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      gold: {
        text: 'rest_dlg_radiant_gold_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      altar: {
        text: 'rest_dlg_radiant_altar_text',
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      side: {
        text: 'rest_dlg_radiant_side_text',
        journal: { id: "rest-radiant-side", title: 'rest_dlg_radiant_side_jt', text: 'rest_dlg_radiant_side_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
      starport: {
        text: 'rest_dlg_radiant_starport_text',
        journal: { id: "rest-radiant-starport", title: 'rest_dlg_radiant_starport_jt', text: 'rest_dlg_radiant_starport_jx' },
        choices: [
          { label: 'rest_dlg_label_rest', action: "rest" },
          { label: 'rest_dlg_label_back', next: "start" },
        ],
      },
    },
  },
};
