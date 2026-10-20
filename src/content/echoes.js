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

  // ── 幽冥帮派（黑帮）──
  { id: 'echo-speakeasy', franchise: FRANCHISE.FAMILY, zone: 'abyss', title: 'echo_speakeasy_title', desc: 'echo_speakeasy_desc', trigger: 'echo:speakeasy' },
  { id: 'echo-family-shrine', franchise: FRANCHISE.FAMILY, zone: 'abyss', title: 'echo_family_shrine_title', desc: 'echo_family_shrine_desc', trigger: 'echo:family-shrine' },
  { id: 'echo-dock-crates', franchise: FRANCHISE.FAMILY, zone: 'abyss', title: 'echo_dock_crates_title', desc: 'echo_dock_crates_desc', trigger: 'echo:dock-crates' },

  // ── 深空纪元（科幻）──
  { id: 'echo-colony-dome', franchise: FRANCHISE.DEEPSPACE, zone: 'space', title: 'echo_colony_dome_title', desc: 'echo_colony_dome_desc', trigger: 'echo:colony-dome' },
  { id: 'echo-ai-core', franchise: FRANCHISE.DEEPSPACE, zone: 'space', title: 'echo_ai_core_title', desc: 'echo_ai_core_desc', trigger: 'echo:ai-core' },
  { id: 'echo-jump-gate', franchise: FRANCHISE.DEEPSPACE, zone: 'space', title: 'echo_jump_gate_title', desc: 'echo_jump_gate_desc', trigger: 'echo:jump-gate' },

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
];
