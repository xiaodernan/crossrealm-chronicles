/**
 * 次元回声数据表（W-B2：消灭 Wave/Extras 叠加）。
 *
 * 合并了 PopCultureHomageRegistry + Wave2/3/4 的所有回声条目。
 * 字段：
 * - id: kebab-case 稳定标识符
 * - franchise: FRANCHISE 常量（来自 franchises.js）
 * - zone: 区域 id（来自 ZoneIdentity.js）
 * - title: 显示标题
 * - desc: 描述文本
 * - trigger: 触发条件（discovery:xxx / echo:xxx）
 */
import { FRANCHISE } from './franchises.js';

export const ECHOES = [
  // ── 魔法学院母题（HP 系）──
  { id: 'echo-wizard-school', franchise: FRANCHISE.WIZARD, zone: 'magic', title: 'echo_wizard_school_title', desc: 'echo_wizard_school_desc', trigger: 'discovery:magic-castle' },
  { id: 'echo-forbidden-wood', franchise: FRANCHISE.WIZARD, zone: 'magic', title: 'echo_forbidden_wood_title', desc: 'echo_forbidden_wood_desc', trigger: 'discovery:magic-forest' },
  { id: 'echo-broom-ring', franchise: FRANCHISE.WIZARD, zone: 'magic', title: 'echo_broom_ring_title', desc: 'echo_broom_ring_desc', trigger: 'echo:broom-ring' },
  { id: 'echo-potion-lab', franchise: FRANCHISE.WIZARD, zone: 'magic', title: 'echo_potion_lab_title', desc: 'echo_potion_lab_desc', trigger: 'echo:potion-lab' },
  { id: 'echo-sorting-hall', franchise: FRANCHISE.WIZARD, zone: 'magic', title: 'echo_sorting_hall_title', desc: 'echo_sorting_hall_desc', trigger: 'echo:sorting-hall' },

  // ── 星际穿越母题 ──
  { id: 'echo-endurance', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: 'echo_endurance_title', desc: 'echo_endurance_desc', trigger: 'discovery:space-wreck' },
  { id: 'echo-tesseract', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: 'echo_tesseract_title', desc: 'echo_tesseract_desc', trigger: 'discovery:space-tesseract' },
  { id: 'echo-miller', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: 'echo_miller_title', desc: 'echo_miller_desc', trigger: 'echo:miller-hourglass' },
  { id: 'echo-murphy', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: 'echo_murphy_title', desc: 'echo_murphy_desc', trigger: 'echo:murphy-shelf' },
  { id: 'echo-docking', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: 'echo_docking_title', desc: 'echo_docking_desc', trigger: 'echo:docking-spin' },

  // ── 怪奇物语母题（逆相界 / 80 年代小镇）──
  { id: 'echo-upside-rift', franchise: FRANCHISE.UPSIDE, zone: 'void', title: 'echo_upside_rift_title', desc: 'echo_upside_rift_desc', trigger: 'echo:upside-rift' },
  { id: 'echo-radio-tower', franchise: FRANCHISE.UPSIDE, zone: 'void', title: 'echo_radio_tower_title', desc: 'echo_radio_tower_desc', trigger: 'echo:radio-tower' },
  { id: 'echo-rift-hound', franchise: FRANCHISE.UPSIDE, zone: 'void', title: 'echo_rift_hound_title', desc: 'echo_rift_hound_desc', trigger: 'echo:rift-hound' },
  { id: 'echo-neon-mall', franchise: FRANCHISE.UPSIDE, zone: 'void', title: 'echo_neon_mall_title', desc: 'echo_neon_mall_desc', trigger: 'echo:neon-mall' },
  { id: 'echo-flip-gravity', franchise: FRANCHISE.UPSIDE, zone: 'void', title: 'echo_flip_gravity_title', desc: 'echo_flip_gravity_desc', trigger: 'discovery:void-rift' },

  // ── 指环王（已有，补回声）──
  { id: 'echo-one-ring', franchise: FRANCHISE.MIDDLE_EARTH, zone: 'fantasy', title: 'wp_label_one_ring', desc: 'echo_one_ring_desc', trigger: 'discovery:fantasy-ring' },

  // ── 枢纽彩蛋墙 ──
  { id: 'echo-poster-wall', franchise: FRANCHISE.CROSSOVER, zone: 'hub', title: 'echo_poster_wall_title', desc: 'echo_poster_wall_desc', trigger: 'echo:poster-wall' },

  // ── Wave2 ──
  // 魔法学院
  { id: 'echo-nine-platform', franchise: FRANCHISE.WIZARD, zone: 'magic', title: 'echo_nine_platform_title', desc: 'echo_nine_platform_desc', trigger: 'echo:nine-platform' },
  { id: 'echo-patronus-lake', franchise: FRANCHISE.WIZARD, zone: 'magic', title: 'echo_patronus_lake_title', desc: 'echo_patronus_lake_desc', trigger: 'echo:patronus-lake' },
  { id: 'echo-triwizard', franchise: FRANCHISE.WIZARD, zone: 'magic', title: 'echo_triwizard_title', desc: 'echo_triwizard_desc', trigger: 'echo:triwizard-cup' },

  // 星际穿越
  { id: 'echo-brand-beacon', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: 'echo_brand_beacon_title', desc: 'echo_brand_beacon_desc', trigger: 'echo:brand-beacon' },
  { id: 'echo-wormhole', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: 'echo_wormhole_title', desc: 'echo_wormhole_desc', trigger: 'echo:wormhole-arch' },
  { id: 'echo-love-signal', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: 'echo_love_signal_title', desc: 'echo_love_signal_desc', trigger: 'echo:love-signal' },

  // 逆相界
  { id: 'echo-bike-trail', franchise: FRANCHISE.UPSIDE, zone: 'void', title: 'echo_bike_trail_title', desc: 'echo_bike_trail_desc', trigger: 'echo:bike-trail' },
  { id: 'echo-arcade', franchise: FRANCHISE.UPSIDE, zone: 'void', title: 'echo_arcade_title', desc: 'echo_arcade_desc', trigger: 'echo:arcade' },
  { id: 'echo-vecna-clock', franchise: FRANCHISE.UPSIDE, zone: 'void', title: 'echo_vecna_clock_title', desc: 'echo_vecna_clock_desc', trigger: 'echo:vecna-clock' },
  { id: 'echo-underground-lab', franchise: FRANCHISE.UPSIDE, zone: 'void', title: 'echo_underground_lab_title', desc: 'echo_underground_lab_desc', trigger: 'echo:underground-lab' },

  // 跨界
  { id: 'echo-full-resonance', franchise: FRANCHISE.CROSSOVER, zone: 'hub', title: 'echo_full_resonance_title', desc: 'echo_full_resonance_desc', trigger: 'echo:full-resonance' },

  // ── Wave3 ──
  // ── 边境往事（西部）──
  { id: 'echo-saloon-mirror', franchise: FRANCHISE.BORDER, zone: 'fantasy', title: 'echo_saloon_mirror_title', desc: 'echo_saloon_mirror_desc', trigger: 'echo:saloon-mirror' },
  { id: 'echo-duel-noon', franchise: FRANCHISE.BORDER, zone: 'fantasy', title: 'echo_duel_noon_title', desc: 'echo_duel_noon_desc', trigger: 'echo:duel-noon' },
  { id: 'echo-ghost-rails', franchise: FRANCHISE.BORDER, zone: 'fantasy', title: 'echo_ghost_rails_title', desc: 'echo_ghost_rails_desc', trigger: 'echo:ghost-rails' },
  { id: 'echo-border-undertaker', franchise: FRANCHISE.BORDER, zone: 'fantasy', title: 'echo_border_undertaker_title', desc: 'echo_border_undertaker_desc', trigger: 'echo:saloon-mirror' },
  { id: 'echo-border-sheriff', franchise: FRANCHISE.BORDER, zone: 'fantasy', title: 'echo_border_sheriff_title', desc: 'echo_border_sheriff_desc', trigger: 'echo:duel-noon' },
  { id: 'echo-border-signalman', franchise: FRANCHISE.BORDER, zone: 'fantasy', title: 'echo_border_signalman_title', desc: 'echo_border_signalman_desc', trigger: 'echo:ghost-rails' },

  // ── 幽冥帮派（黑帮）──
  { id: 'echo-speakeasy', franchise: FRANCHISE.FAMILY, zone: 'abyss', title: 'echo_speakeasy_title', desc: 'echo_speakeasy_desc', trigger: 'echo:speakeasy' },
  { id: 'echo-family-shrine', franchise: FRANCHISE.FAMILY, zone: 'abyss', title: 'echo_family_shrine_title', desc: 'echo_family_shrine_desc', trigger: 'echo:family-shrine' },
  { id: 'echo-dock-crates', franchise: FRANCHISE.FAMILY, zone: 'abyss', title: 'echo_dock_crates_title', desc: 'echo_dock_crates_desc', trigger: 'echo:dock-crates' },
  { id: 'echo-gangster-cuff', franchise: FRANCHISE.FAMILY, zone: 'abyss', title: 'echo_gangster_cuff_title', desc: 'echo_gangster_cuff_desc', trigger: 'echo:speakeasy' },
  { id: 'echo-gangster-lotus', franchise: FRANCHISE.FAMILY, zone: 'abyss', title: 'echo_gangster_lotus_title', desc: 'echo_gangster_lotus_desc', trigger: 'echo:family-shrine' },
  { id: 'echo-gangster-ledger', franchise: FRANCHISE.FAMILY, zone: 'abyss', title: 'echo_gangster_ledger_title', desc: 'echo_gangster_ledger_desc', trigger: 'echo:dock-crates' },

  // ── 深空纪元（科幻）──
  { id: 'echo-colony-dome', franchise: FRANCHISE.DEEPSPACE, zone: 'space', title: 'echo_colony_dome_title', desc: 'echo_colony_dome_desc', trigger: 'echo:colony-dome' },
  { id: 'echo-ai-core', franchise: FRANCHISE.DEEPSPACE, zone: 'space', title: 'echo_ai_core_title', desc: 'echo_ai_core_desc', trigger: 'echo:ai-core' },
  { id: 'echo-jump-gate', franchise: FRANCHISE.DEEPSPACE, zone: 'space', title: 'echo_jump_gate_title', desc: 'echo_jump_gate_desc', trigger: 'echo:jump-gate' },
  { id: 'echo-deepspace-nursery', franchise: FRANCHISE.DEEPSPACE, zone: 'space', title: 'echo_deepspace_nursery_title', desc: 'echo_deepspace_nursery_desc', trigger: 'echo:colony-dome' },
  { id: 'echo-deepspace-scribe', franchise: FRANCHISE.DEEPSPACE, zone: 'space', title: 'echo_deepspace_scribe_title', desc: 'echo_deepspace_scribe_desc', trigger: 'echo:ai-core' },
  { id: 'echo-deepspace-fourthgate', franchise: FRANCHISE.DEEPSPACE, zone: 'space', title: 'echo_deepspace_fourthgate_title', desc: 'echo_deepspace_fourthgate_desc', trigger: 'echo:jump-gate' },

  // ── Wave4 ──
  // 赛博霓虹 → 魔法遗境
  { id: 'echo-neon-alley', franchise: FRANCHISE.CYBER, zone: 'magic', title: 'echo_neon_alley_title', desc: 'echo_neon_alley_desc', trigger: 'echo:neon-alley' },
  { id: 'echo-chrome-clinic', franchise: FRANCHISE.CYBER, zone: 'magic', title: 'echo_chrome_clinic_title', desc: 'echo_chrome_clinic_desc', trigger: 'echo:chrome-clinic' },
  { id: 'echo-corp-spire', franchise: FRANCHISE.CYBER, zone: 'magic', title: 'echo_corp_spire_title', desc: 'echo_corp_spire_desc', trigger: 'echo:corp-spire' },

  // 武士残响 → 灰白森林
  { id: 'echo-torii-gate', franchise: FRANCHISE.SAMURAI, zone: 'fantasy', title: 'echo_torii_gate_title', desc: 'echo_torii_gate_desc', trigger: 'echo:torii-gate' },
  { id: 'echo-dojo-ruins', franchise: FRANCHISE.SAMURAI, zone: 'fantasy', title: 'echo_dojo_ruins_title', desc: 'echo_dojo_ruins_desc', trigger: 'echo:dojo-ruins' },
  { id: 'echo-sakura-blade', franchise: FRANCHISE.SAMURAI, zone: 'fantasy', title: 'echo_sakura_blade_title', desc: 'echo_sakura_blade_desc', trigger: 'echo:sakura-blade' },

  // 旧日低语 → 破碎时线
  { id: 'echo-tentacle-obelisk', franchise: FRANCHISE.COSMIC, zone: 'void', title: 'echo_tentacle_obelisk_title', desc: 'echo_tentacle_obelisk_desc', trigger: 'echo:tentacle-obelisk' },
  { id: 'echo-mad-scribe', franchise: FRANCHISE.COSMIC, zone: 'void', title: 'echo_mad_scribe_title', desc: 'echo_mad_scribe_desc', trigger: 'echo:mad-scribe' },
  { id: 'echo-spiral-well', franchise: FRANCHISE.COSMIC, zone: 'void', title: 'echo_spiral_well_title', desc: 'echo_spiral_well_desc', trigger: 'echo:spiral-well' },

  // 星港商路 → 米勒荒原
  { id: 'echo-star-cantina', franchise: FRANCHISE.STARPORT, zone: 'space', title: 'echo_star_cantina_title', desc: 'echo_star_cantina_desc', trigger: 'echo:star-cantina' },
  { id: 'echo-smuggler-dock', franchise: FRANCHISE.STARPORT, zone: 'space', title: 'echo_smuggler_dock_title', desc: 'echo_smuggler_dock_desc', trigger: 'echo:smuggler-dock' },
  { id: 'echo-holo-chart', franchise: FRANCHISE.STARPORT, zone: 'space', title: 'echo_holo_chart_title', desc: 'echo_holo_chart_desc', trigger: 'echo:holo-chart' },

  // ── Wave5（幽暗/圣域）──
  { id: 'echo-gloom-nine-stones', franchise: FRANCHISE.GLOOM, zone: 'gloom', title: 'echo_gloom_stones_title', desc: 'echo_gloom_stones_desc', trigger: 'echo:gloom-nine-stones' },
  { id: 'echo-radiant-torii', franchise: FRANCHISE.RADIANT, zone: 'radiant', title: 'echo_radiant_torii_title', desc: 'echo_radiant_torii_desc', trigger: 'echo:radiant-torii' },

  // ── Wave6（虚空/深渊）──
  { id: 'echo-void-astrolabe', franchise: FRANCHISE.VOIDMAW, zone: 'void', title: 'echo_void_astrolabe_title', desc: 'echo_void_astrolabe_desc', trigger: 'echo:void-astrolabe' },
  { id: 'echo-abyss-stele', franchise: FRANCHISE.ABYSSSALT, zone: 'abyss', title: 'echo_abyss_stele_title', desc: 'echo_abyss_stele_desc', trigger: 'echo:abyss-stele' },

  // ── Wave7（断口巡礼 / 深颚巡礼）──
  { id: 'echo-void-sundial', franchise: FRANCHISE.VOIDMAW, zone: 'void', title: 'echo_void_sundial_title', desc: 'echo_void_sundial_desc', trigger: 'echo:void-sundial' },
  { id: 'echo-void-pearl', franchise: FRANCHISE.VOIDMAW, zone: 'void', title: 'echo_void_pearl_title', desc: 'echo_void_pearl_desc', trigger: 'echo:void-pearl' },
  { id: 'echo-abyss-conch', franchise: FRANCHISE.ABYSSSALT, zone: 'abyss', title: 'echo_abyss_conch_title', desc: 'echo_abyss_conch_desc', trigger: 'echo:abyss-conch' },
  { id: 'echo-abyss-bonegate', franchise: FRANCHISE.ABYSSSALT, zone: 'abyss', title: 'echo_abyss_bonegate_title', desc: 'echo_abyss_bonegate_desc', trigger: 'echo:abyss-bonegate' },
  { id: 'echo-abyss-saltmarch', franchise: FRANCHISE.ABYSSSALT, zone: 'abyss', title: 'echo_abyss_saltmarch_title', desc: 'echo_abyss_saltmarch_desc', trigger: 'echo:abyss-stele' },
  { id: 'echo-abyss-saltbreath', franchise: FRANCHISE.ABYSSSALT, zone: 'abyss', title: 'echo_abyss_saltbreath_title', desc: 'echo_abyss_saltbreath_desc', trigger: 'echo:abyss-conch' },
  { id: 'echo-abyss-saltfeast', franchise: FRANCHISE.ABYSSSALT, zone: 'abyss', title: 'echo_abyss_saltfeast_title', desc: 'echo_abyss_saltfeast_desc', trigger: 'echo:abyss-bonegate' },

  // ── Wave8（薄暮巡礼 / 辉煌巡礼）──
  { id: 'echo-gloom-lanterns', franchise: FRANCHISE.GLOOM, zone: 'gloom', title: 'echo_gloom_lanterns_title', desc: 'echo_gloom_lanterns_desc', trigger: 'echo:gloom-lanterns' },
  { id: 'echo-gloom-wishing-tree', franchise: FRANCHISE.GLOOM, zone: 'gloom', title: 'echo_gloom_wishing_tree_title', desc: 'echo_gloom_wishing_tree_desc', trigger: 'echo:gloom-wishing-tree' },
  { id: 'echo-gloom-mossroot', franchise: FRANCHISE.GLOOM, zone: 'gloom', title: 'echo_gloom_mossroot_title', desc: 'echo_gloom_mossroot_desc', trigger: 'echo:gloom-nine-stones' },
  { id: 'echo-gloom-lamproad', franchise: FRANCHISE.GLOOM, zone: 'gloom', title: 'echo_gloom_lamproad_title', desc: 'echo_gloom_lamproad_desc', trigger: 'echo:gloom-lanterns' },
  { id: 'echo-gloom-newknot', franchise: FRANCHISE.GLOOM, zone: 'gloom', title: 'echo_gloom_newknot_title', desc: 'echo_gloom_newknot_desc', trigger: 'echo:gloom-wishing-tree' },
  { id: 'echo-radiant-banner', franchise: FRANCHISE.RADIANT, zone: 'radiant', title: 'echo_radiant_banner_title', desc: 'echo_radiant_banner_desc', trigger: 'echo:radiant-banner' },
  { id: 'echo-radiant-orb', franchise: FRANCHISE.RADIANT, zone: 'radiant', title: 'echo_radiant_orb_title', desc: 'echo_radiant_orb_desc', trigger: 'echo:radiant-orb' },
  { id: 'echo-radiant-mirrorpool', franchise: FRANCHISE.RADIANT, zone: 'radiant', title: 'echo_radiant_mirrorpool_title', desc: 'echo_radiant_mirrorpool_desc', trigger: 'echo:radiant-torii' },
  { id: 'echo-radiant-bannermender', franchise: FRANCHISE.RADIANT, zone: 'radiant', title: 'echo_radiant_bannermender_title', desc: 'echo_radiant_bannermender_desc', trigger: 'echo:radiant-banner' },
  { id: 'echo-radiant-bellfounder', franchise: FRANCHISE.RADIANT, zone: 'radiant', title: 'echo_radiant_bellfounder_title', desc: 'echo_radiant_bellfounder_desc', trigger: 'echo:radiant-orb' },

  // ── Wave11（返乡 / 归航）──
  { id: 'echo-homecoming-cairn', franchise: FRANCHISE.HOMECOMING, zone: 'gloom', title: 'echo_homecoming_cairn_title', desc: 'echo_homecoming_cairn_desc', trigger: 'echo:homecoming-cairn' },
  { id: 'echo-homecoming-bell', franchise: FRANCHISE.HOMECOMING, zone: 'radiant', title: 'echo_homecoming_bell_title', desc: 'echo_homecoming_bell_desc', trigger: 'echo:homecoming-bell' },
  { id: 'echo-homecoming-beacon', franchise: FRANCHISE.HOMECOMING, zone: 'space', title: 'echo_homecoming_beacon_title', desc: 'echo_homecoming_beacon_desc', trigger: 'echo:homecoming-beacon' },
  { id: 'echo-homecoming-tide', franchise: FRANCHISE.HOMECOMING, zone: 'abyss', title: 'echo_homecoming_tide_title', desc: 'echo_homecoming_tide_desc', trigger: 'echo:homecoming-tide' },
  { id: 'echo-homecoming-lantern', franchise: FRANCHISE.HOMECOMING, zone: 'hub', title: 'echo_homecoming_lantern_title', desc: 'echo_homecoming_lantern_desc', trigger: 'echo:homecoming-lantern' },

  // ── Wave12（星灯祭 · 灯会放归航）──
  { id: 'echo-homecoming-sky-lantern', franchise: FRANCHISE.HOMECOMING, zone: 'magic', title: 'echo_homecoming_sky_lantern_title', desc: 'echo_homecoming_sky_lantern_desc', trigger: 'echo:homecoming-sky-lantern' },
  { id: 'echo-homecoming-river-lamp', franchise: FRANCHISE.HOMECOMING, zone: 'abyss', title: 'echo_homecoming_river_lamp_title', desc: 'echo_homecoming_river_lamp_desc', trigger: 'echo:homecoming-river-lamp' },
  { id: 'echo-homecoming-paper-crane', franchise: FRANCHISE.HOMECOMING, zone: 'void', title: 'echo_homecoming_paper_crane_title', desc: 'echo_homecoming_paper_crane_desc', trigger: 'echo:homecoming-paper-crane' },
  { id: 'echo-homecoming-first-snow', franchise: FRANCHISE.HOMECOMING, zone: 'fantasy', title: 'echo_homecoming_first_snow_title', desc: 'echo_homecoming_first_snow_desc', trigger: 'echo:homecoming-first-snow' },

  // ── Wave12 尾声 · 最后一盏灯（终局专赠：与 full-resonance 同类派生式回声）──
  { id: 'echo-homecoming-last-light', franchise: FRANCHISE.HOMECOMING, zone: 'hub', title: 'echo_homecoming_last_light_title', desc: 'echo_homecoming_last_light_desc', trigger: 'echo:homecoming-last-light' },

  // ── Wave13（中洲回响 · 亡者之剑、幽谷竖琴、秘银矿）──
  { id: 'echo-broken-sword', franchise: FRANCHISE.MIDDLE_EARTH, zone: 'fantasy', title: 'echo_broken_sword_title', desc: 'echo_broken_sword_desc', trigger: 'echo:broken-sword' },
  { id: 'echo-elven-harp', franchise: FRANCHISE.MIDDLE_EARTH, zone: 'fantasy', title: 'echo_elven_harp_title', desc: 'echo_elven_harp_desc', trigger: 'echo:elven-harp' },
  { id: 'echo-mithril-shard', franchise: FRANCHISE.MIDDLE_EARTH, zone: 'fantasy', title: 'echo_mithril_shard_title', desc: 'echo_mithril_shard_desc', trigger: 'echo:mithril-shard' },
  { id: 'echo-mithril-vein', franchise: FRANCHISE.MIDDLE_EARTH, zone: 'fantasy', title: 'echo_mithril_vein_title', desc: 'echo_mithril_vein_desc', trigger: 'echo:mithril-shard' },
  { id: 'echo-grey-chant', franchise: FRANCHISE.MIDDLE_EARTH, zone: 'fantasy', title: 'echo_grey_chant_title', desc: 'echo_grey_chant_desc', trigger: 'echo:elven-harp' },

  // ── Wave14（赛博深渊 · 浮空赌场、黑市舱、天台道场）──
  { id: 'echo-floating-casino', franchise: FRANCHISE.CYBER, zone: 'magic', title: 'echo_floating_casino_title', desc: 'echo_floating_casino_desc', trigger: 'echo:floating-casino' },
  { id: 'echo-black-market-pod', franchise: FRANCHISE.CYBER, zone: 'magic', title: 'echo_black_market_pod_title', desc: 'echo_black_market_pod_desc', trigger: 'echo:black-market-pod' },
  { id: 'echo-rooftop-dojo', franchise: FRANCHISE.CYBER, zone: 'magic', title: 'echo_rooftop_dojo_title', desc: 'echo_rooftop_dojo_desc', trigger: 'echo:rooftop-dojo' },

  // ── Wave15（武士残响 · 浪人桥头、战鼓残腔、残席茶器）──
  { id: 'echo-ronin-bridge', franchise: FRANCHISE.SAMURAI, zone: 'fantasy', title: 'echo_ronin_bridge_title', desc: 'echo_ronin_bridge_desc', trigger: 'echo:ronin-bridge' },
  { id: 'echo-war-drum', franchise: FRANCHISE.SAMURAI, zone: 'fantasy', title: 'echo_war_drum_title', desc: 'echo_war_drum_desc', trigger: 'echo:war-drum' },
  { id: 'echo-tea-ware', franchise: FRANCHISE.SAMURAI, zone: 'fantasy', title: 'echo_tea_ware_title', desc: 'echo_tea_ware_desc', trigger: 'echo:tea-ware' },

  // ── Wave16（深空孔径 · 黑砂石碑 / 碎锚飞行员 / 将熄的星骸）──
  { id: 'echo-grain-obelisk', franchise: FRANCHISE.COSMIC, zone: 'void', title: 'echo_grain_obelisk_title', desc: 'echo_grain_obelisk_desc', trigger: 'echo:grain-obelisk' },
  { id: 'echo-pilot-crash', franchise: FRANCHISE.COSMIC, zone: 'void', title: 'echo_pilot_crash_title', desc: 'echo_pilot_crash_desc', trigger: 'echo:pilot-crash' },
  { id: 'echo-star-derelict', franchise: FRANCHISE.COSMIC, zone: 'void', title: 'echo_star_derelict_title', desc: 'echo_star_derelict_desc', trigger: 'echo:star-derelict' },

  // ── Wave18（voidmaw 深渊母题）：深渊合唱 / 锚与解锚 / 暗手 ──
  { id: 'echo-void-choir', franchise: FRANCHISE.VOIDMAW, zone: 'void', title: 'echo_void_choir_title', desc: 'echo_void_choir_desc', trigger: 'echo:void-choir' },
  { id: 'echo-void-anchor', franchise: FRANCHISE.VOIDMAW, zone: 'void', title: 'echo_void_anchor_title', desc: 'echo_void_anchor_desc', trigger: 'echo:void-anchor' },
  { id: 'echo-void-hand', franchise: FRANCHISE.VOIDMAW, zone: 'void', title: 'echo_void_hand_title', desc: 'echo_void_hand_desc', trigger: 'echo:void-hand' },

  // ── Wave19（STARPORT 星港）：复用既有 3 座 POI 各派一份新回声（零新网格） ──
  { id: 'echo-starport-dealmaker', franchise: FRANCHISE.STARPORT, zone: 'space', title: 'echo_starport_dealmaker_title', desc: 'echo_starport_dealmaker_desc', trigger: 'echo:star-cantina' },
  { id: 'echo-starport-rigger', franchise: FRANCHISE.STARPORT, zone: 'space', title: 'echo_starport_rigger_title', desc: 'echo_starport_rigger_desc', trigger: 'echo:smuggler-dock' },
  { id: 'echo-starport-navigator', franchise: FRANCHISE.STARPORT, zone: 'space', title: 'echo_starport_navigator_title', desc: 'echo_starport_navigator_desc', trigger: 'echo:holo-chart' },
];