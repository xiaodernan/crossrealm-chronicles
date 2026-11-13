/**
 * 星尘铭文（W-Z29）：每个母题毕业时在成就墙上留下的一行「残章」。
 *
 * 结构：{ franchise（FRANCHISE id）, ach（解锁签）, themeKey（母题显示名键）}，
 * 文本走 strings 双表（`ach_ept_<franchise>`）；解锁成就照常判定，本表只负责这句「成语」。
 * themeKey 是「字面量」键名 —— 不拼模板，拼不出门禁盲区。
 */
export const ECHO_EPITAPHS = [
  { franchise: 'wizard', ach: 'echo-wizard-6', key: 'ach_ept_wizard', themeKey: 'franchise_wizard_label' },
  { franchise: 'interstellar', ach: 'echo-space-6', key: 'ach_ept_interstellar', themeKey: 'franchise_interstellar_label' },
  { franchise: 'upside', ach: 'echo-upside-6', key: 'ach_ept_upside', themeKey: 'franchise_upside_label' },
  { franchise: 'border', ach: 'echo-western-6', key: 'ach_ept_border', themeKey: 'franchise_border_label' },
  { franchise: 'family', ach: 'echo-gangster-6', key: 'ach_ept_family', themeKey: 'franchise_family_label' },
  { franchise: 'deepspace', ach: 'echo-scifi-6', key: 'ach_ept_deepspace', themeKey: 'franchise_deepspace_label' },
  { franchise: 'cyber', ach: 'echo-cyber-6', key: 'ach_ept_cyber', themeKey: 'franchise_cyber_label' },
  { franchise: 'samurai', ach: 'echo-samurai-6', key: 'ach_ept_samurai', themeKey: 'franchise_samurai_label' },
  { franchise: 'cosmic', ach: 'echo-cosmic-6', key: 'ach_ept_cosmic', themeKey: 'franchise_cosmic_label' },
  { franchise: 'starport', ach: 'echo-starport-6', key: 'ach_ept_starport', themeKey: 'franchise_starport_label' },
  { franchise: 'gloom', ach: 'echo-gloom-6', key: 'ach_ept_gloom', themeKey: 'franchise_gloom_label' },
  { franchise: 'radiant', ach: 'echo-radiant-6', key: 'ach_ept_radiant', themeKey: 'franchise_radiant_label' },
  { franchise: 'voidmaw', ach: 'echo-voidmaw-6', key: 'ach_ept_voidmaw', themeKey: 'franchise_voidmaw_label' },
  { franchise: 'abysssalt', ach: 'echo-abysssalt-6', key: 'ach_ept_abysssalt', themeKey: 'franchise_abysssalt_label' },
  { franchise: 'middle-earth', ach: 'echo-middle-earth-6', key: 'ach_ept_middle_earth', themeKey: 'franchise_middle_earth_label' },
  { franchise: 'homecoming', ach: 'echo-homecoming-master', key: 'ach_ept_homecoming', themeKey: 'franchise_homecoming_label' },
  { franchise: 'crossover', ach: 'echo-crossover', key: 'ach_ept_crossover', themeKey: 'franchise_crossover_label' },
];
