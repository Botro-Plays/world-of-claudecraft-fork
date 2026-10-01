// Presentation metadata for the character-select class showcase.
//
// This is a thin, host-agnostic data module (no DOM/Three imports) so the
// drift guard in tests/charselect_class_details.test.ts can import it directly
// and cross-check it against the sim's source of truth (`CLASSES`/`ABILITIES`
// in src/sim/content/classes.ts). Keeping it separate from main.ts (which
// runs browser side-effects on import) is what makes that test possible.
//
// Starting stats, resource type, HP/mana and ability tooltips all read LIVE
// from the sim at render time; the only hand-maintained data here is the
// role/armor/weapon labels and the curated "signature" ability picks.

import type { PlayerClass } from '../sim/types';
import type { TranslationKey } from './i18n';

export interface ClassDetails {
  roleKey: TranslationKey;
  roleType: 'tank' | 'dps' | 'ranged' | 'healer' | 'hybrid';
  armorKey: TranslationKey;
  weaponsKey: TranslationKey;
}

export const CLASS_DETAILS: Record<PlayerClass, ClassDetails> = {
  warrior: {
    roleKey: 'classDetails.roles.warrior',
    roleType: 'hybrid',
    armorKey: 'classDetails.armor.chainLeatherCloth',
    weaponsKey: 'classDetails.weapons.swordsMacesAxes',
  },
  paladin: {
    roleKey: 'classDetails.roles.paladin',
    roleType: 'hybrid',
    armorKey: 'classDetails.armor.chainLeatherCloth',
    weaponsKey: 'classDetails.weapons.swordsMaces',
  },
  hunter: {
    roleKey: 'classDetails.roles.hunter',
    roleType: 'ranged',
    armorKey: 'classDetails.armor.leatherCloth',
    weaponsKey: 'classDetails.weapons.axesSwords',
  },
  rogue: {
    roleKey: 'classDetails.roles.rogue',
    roleType: 'dps',
    armorKey: 'classDetails.armor.leatherCloth',
    weaponsKey: 'classDetails.weapons.daggersSwords',
  },
  priest: {
    roleKey: 'classDetails.roles.priest',
    roleType: 'healer',
    armorKey: 'classDetails.armor.cloth',
    weaponsKey: 'classDetails.weapons.staves',
  },
  shaman: {
    roleKey: 'classDetails.roles.shaman',
    roleType: 'hybrid',
    armorKey: 'classDetails.armor.chainLeatherCloth',
    weaponsKey: 'classDetails.weapons.macesAxes',
  },
  mage: {
    roleKey: 'classDetails.roles.mage',
    roleType: 'ranged',
    armorKey: 'classDetails.armor.cloth',
    weaponsKey: 'classDetails.weapons.staves',
  },
  warlock: {
    roleKey: 'classDetails.roles.warlock',
    roleType: 'ranged',
    armorKey: 'classDetails.armor.cloth',
    weaponsKey: 'classDetails.weapons.staves',
  },
  druid: {
    roleKey: 'classDetails.roles.druid',
    roleType: 'hybrid',
    armorKey: 'classDetails.armor.leatherCloth',
    weaponsKey: 'classDetails.weapons.staves',
  },
  // PT Tempskron Fighter POC: reuse warrior's class details
  tempskron_fighter: {
    roleKey: 'classDetails.roles.warrior',
    roleType: 'hybrid',
    armorKey: 'classDetails.armor.chainLeatherCloth',
    weaponsKey: 'classDetails.weapons.swordsMacesAxes',
  },
  // PT Tempskron Mechanician POC: reuse warrior's class details
  tempskron_mechanician: {
    roleKey: 'classDetails.roles.warrior',
    roleType: 'hybrid',
    armorKey: 'classDetails.armor.chainLeatherCloth',
    weaponsKey: 'classDetails.weapons.swordsMacesAxes',
  },
  // PT Tempskron Pikeman POC: reuse warrior's class details
  tempskron_pikeman: {
    roleKey: 'classDetails.roles.warrior',
    roleType: 'hybrid',
    armorKey: 'classDetails.armor.chainLeatherCloth',
    weaponsKey: 'classDetails.weapons.swordsMacesAxes',
  },
  // PT Tempskron Archer POC: reuse warrior's class details
  tempskron_archer: {
    roleKey: 'classDetails.roles.warrior',
    roleType: 'hybrid',
    armorKey: 'classDetails.armor.chainLeatherCloth',
    weaponsKey: 'classDetails.weapons.swordsMacesAxes',
  },
  // PT Morion Knight POC: reuse warrior's class details
  morion_knight: {
    roleKey: 'classDetails.roles.warrior',
    roleType: 'hybrid',
    armorKey: 'classDetails.armor.chainLeatherCloth',
    weaponsKey: 'classDetails.weapons.swordsMacesAxes',
  },
  // PT Morion Atalanta POC: reuse warrior's class details
  morion_atalanta: {
    roleKey: 'classDetails.roles.warrior',
    roleType: 'hybrid',
    armorKey: 'classDetails.armor.chainLeatherCloth',
    weaponsKey: 'classDetails.weapons.swordsMacesAxes',
  },
  // PT Morion Priestess POC: reuse priest's class details
  morion_priestess: {
    roleKey: 'classDetails.roles.priest',
    roleType: 'healer',
    armorKey: 'classDetails.armor.cloth',
    weaponsKey: 'classDetails.weapons.staves',
  },
  // PT Morion Magician POC: reuse mage's class details
  morion_magician: {
    roleKey: 'classDetails.roles.mage',
    roleType: 'ranged',
    armorKey: 'classDetails.armor.cloth',
    weaponsKey: 'classDetails.weapons.staves',
  },
  // PT Atlanteon Assassin POC: reuse rogue's class details
  atlanteon_assassin: {
    roleKey: 'classDetails.roles.rogue',
    roleType: 'dps',
    armorKey: 'classDetails.armor.leatherCloth',
    weaponsKey: 'classDetails.weapons.daggersSwords',
  },
  // PT Atlanteon Martial Artist POC: reuse warrior's class details
  atlanteon_martial_artist: {
    roleKey: 'classDetails.roles.warrior',
    roleType: 'hybrid',
    armorKey: 'classDetails.armor.chainLeatherCloth',
    weaponsKey: 'classDetails.weapons.swordsMacesAxes',
  },
  // PT Atlanteon Shaman POC: reuse shaman's class details
  atlanteon_shaman: {
    roleKey: 'classDetails.roles.shaman',
    roleType: 'hybrid',
    armorKey: 'classDetails.armor.chainLeatherCloth',
    weaponsKey: 'classDetails.weapons.macesAxes',
  },
  // PT Morion Monk (fork-added): reuse shaman's class details
  morion_monk: {
    roleKey: 'classDetails.roles.shaman',
    roleType: 'hybrid',
    armorKey: 'classDetails.armor.chainLeatherCloth',
    weaponsKey: 'classDetails.weapons.macesAxes',
  },
};

// Three curated "signature" abilities per class, shown on the select screen.
// Each entry MUST be a real ability that the class can learn, enforced by
// tests/charselect_class_details.test.ts so this never drifts from the sim.
export const SIGNATURE_ABILITIES: Record<PlayerClass, string[]> = {
  warrior: ['charge', 'heroic_strike', 'execute'],
  paladin: ['holy_light', 'hammer_of_grace', 'divine_ascension'],
  hunter: ['pack_command', 'measured_shot', 'raptor_strike'],
  rogue: ['sinister_strike', 'eviscerate', 'evasion'],
  priest: ['smite', 'power_word_shield', 'shadow_word_pain'],
  shaman: ['lightning_bolt', 'rockbiter_weapon', 'ghost_wolf'],
  mage: ['fireball', 'frostbolt', 'polymorph'],
  warlock: ['shadow_bolt', 'corruption', 'life_tap'],
  druid: ['wrath', 'bear_form', 'rejuvenation'],
  // PT Tempskron Fighter: hallmark skills from the extracted PT kit
  tempskron_fighter: ['pt_raving', 'pt_rage_of_zecram', 'pt_berserker'],
  // PT Tempskron Mechanician
  tempskron_mechanician: ['pt_mechanic_bomb', 'pt_maximize', 'pt_metal_golem'],
  // PT Tempskron Pikeman
  tempskron_pikeman: ['pt_tornado', 'pt_chain_lance', 'pt_charging_strike'],
  // PT Tempskron Archer
  tempskron_archer: ['pt_scout_hawk', 'pt_falcon', 'pt_phoenix_shot'],
  // PT Morion Knight
  morion_knight: ['pt_brandish', 'pt_grand_cross', 'pt_sword_of_justice'],
  // PT Morion Atalanta
  morion_atalanta: ['pt_vigor_spear', 'pt_lightning_javelin', 'pt_triumph_of_valhalla'],
  // PT Morion Priestess
  morion_priestess: ['pt_healing', 'pt_holy_bolt', 'pt_resurrection'],
  // PT Morion Magician
  morion_magician: ['pt_fire_bolt', 'pt_diastrophism', 'pt_m_meteo'],
  // PT Atlanteon Assassin
  atlanteon_assassin: ['pt_wisp', 'pt_alas', 'pt_beat_up'],
  // PT Atlanteon Martial Artist
  atlanteon_martial_artist: ['pt_dbblow', 'pt_war_cry', 'pt_typhoon'],
  // PT Atlanteon Shaman
  atlanteon_shaman: ['pt_dark_wave', 'pt_haunt', 'pt_advent_midranda'],
  // PT Morion Monk (fork-added): reuse warrior's signature abilities (Phase A)
  morion_monk: ['charge', 'heroic_strike', 'execute'],
};

// Spec-card presentation for the Specialization screen. Keyed by class, then spec id:
// spec ids are NOT globally unique (paladin/priest both have "holy", shaman/druid both
// have "restoration"), so a flat spec-id map cannot cover all 27 specs. `primaryStat`
// is the attribute the spec scales with (a StatId reused for its localized itemUi.stats.*
// label; melee AP is str-driven for warrior/paladin/shaman/druid, agi-driven kits and
// ranged AP for rogue/hunter, spell power is int, see src/sim/entity.ts); `complexity`
// is an owner-tunable designer call; `examples` are 3-4 real ability ids that showcase
// the spec (each must exist in ABILITIES, belong to the class, and be offered by the
// spec; enforced by tests/charselect_class_details.test.ts). A spec absent here renders
// the basic card (icon + name + role) with no detail rows, so coverage must stay total.
export type SpecComplexity = 'low' | 'medium' | 'high';
export interface SpecCardInfo {
  primaryStat: 'str' | 'agi' | 'int' | 'spi' | 'sta';
  complexity: SpecComplexity;
  examples: string[];
}
export const SPEC_CARD_INFO: Record<PlayerClass, Record<string, SpecCardInfo>> = {
  warrior: {
    arms: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['mortal_strike', 'overpower', 'sweeping_strikes', 'execute'],
    },
    fury: {
      primaryStat: 'str',
      complexity: 'high',
      examples: ['bloodthirst', 'raging_gale', 'red_harvest', 'whirlwind'],
    },
    prot: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['shield_slam', 'revenge', 'thunder_clap', 'sunder_armor'],
    },
  },
  paladin: {
    holy: {
      primaryStat: 'int',
      complexity: 'low',
      examples: ['holy_light', 'dawns_embrace', 'radiant_chorus', 'lay_on_hands'],
    },
    protection: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['bastion_sweep', 'oath_chain', 'holy_shield', 'consecration'],
    },
    retribution: {
      primaryStat: 'str',
      complexity: 'low',
      examples: ['final_edict', 'sun_gods_verdict', 'hammer_of_wrath', 'avenging_wrath'],
    },
  },
  hunter: {
    beast_mastery: {
      primaryStat: 'agi',
      complexity: 'low',
      examples: ['pack_command', 'unleash_beast', 'bestial_wrath', 'tame_beast'],
    },
    marksmanship: {
      primaryStat: 'agi',
      complexity: 'medium',
      examples: ['measured_shot', 'aimed_shot', 'rapid_fire', 'cold_focus'],
    },
    survival: {
      primaryStat: 'agi',
      complexity: 'high',
      examples: ['bloodhook', 'raptor_strike', 'mongoose_bite', 'shrapnel_charge'],
    },
  },
  rogue: {
    assassination: {
      primaryStat: 'agi',
      complexity: 'medium',
      examples: ['cold_blood', 'ambush', 'rupture', 'deadly_poison'],
    },
    combat: {
      primaryStat: 'agi',
      complexity: 'low',
      examples: ['blade_flurry', 'sinister_strike', 'adrenaline_rush', 'eviscerate'],
    },
    subtlety: {
      primaryStat: 'agi',
      complexity: 'high',
      examples: ['hemorrhage', 'cheap_shot', 'vanish', 'sap'],
    },
  },
  priest: {
    discipline: {
      primaryStat: 'int',
      complexity: 'high',
      examples: ['power_infusion', 'power_word_shield', 'power_word_fortitude', 'smite'],
    },
    holy: {
      primaryStat: 'int',
      complexity: 'low',
      examples: ['holy_nova', 'heal', 'flash_heal', 'renew'],
    },
    shadow: {
      primaryStat: 'int',
      complexity: 'medium',
      examples: ['shadowform', 'shadow_word_pain', 'mind_blast', 'mind_flay'],
    },
  },
  shaman: {
    elemental: {
      primaryStat: 'int',
      complexity: 'medium',
      examples: ['elemental_mastery', 'lightning_bolt', 'earth_shock', 'earthquake'],
    },
    enhancement: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['stormstrike', 'rockbiter_weapon', 'galeheart_weapon', 'lightning_shield'],
    },
    restoration: {
      primaryStat: 'int',
      complexity: 'low',
      examples: ['chain_heal', 'healing_wave', 'ghost_wolf'],
    },
  },
  mage: {
    fire: {
      primaryStat: 'int',
      complexity: 'high',
      examples: ['fireball', 'pyroblast', 'combustion', 'meteor'],
    },
    frost: {
      primaryStat: 'int',
      complexity: 'medium',
      examples: ['frostbolt', 'ice_lance', 'frozen_orb', 'frost_nova'],
    },
    arcane: {
      primaryStat: 'int',
      complexity: 'high',
      examples: ['temporal_mend', 'temporal_cascade', 'temporal_rewind', 'temporal_hourglass'],
    },
  },
  warlock: {
    affliction: {
      primaryStat: 'int',
      complexity: 'high',
      examples: ['siphon_life', 'corruption', 'curse_of_agony', 'drain_life'],
    },
    demonology: {
      primaryStat: 'int',
      complexity: 'high',
      examples: ['soul_harvest', 'raise_bone_mage', 'army_of_the_dead', 'metamorphosis'],
    },
    destruction: {
      primaryStat: 'int',
      complexity: 'low',
      examples: ['conflagrate', 'immolate', 'shadowburn', 'rain_of_fire'],
    },
  },
  druid: {
    balance: {
      primaryStat: 'int',
      complexity: 'low',
      examples: ['moonkin_form', 'wrath', 'starfire', 'moonfire'],
    },
    feral: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['feral_charge', 'bear_form', 'maul', 'swipe'],
    },
    restoration: {
      primaryStat: 'int',
      complexity: 'medium',
      examples: ['swiftmend', 'rejuvenation', 'regrowth', 'healing_touch'],
    },
  },
  // PT Tempskron Fighter: extracted PT kit
  tempskron_fighter: {
    arms: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['pt_impact', 'pt_triple_impact', 'pt_avanging_crash', 'pt_d_hit'],
    },
    fury: {
      primaryStat: 'str',
      complexity: 'high',
      examples: ['pt_raving', 'pt_brutal_swing', 'pt_berserker', 'pt_b_berserker'],
    },
    prot: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['pt_melee_mastery', 'pt_concentration', 'pt_roar', 'pt_boost_health'],
    },
  },
  // PT Tempskron Mechanician: extracted PT kit
  tempskron_mechanician: {
    arms: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['pt_great_smash', 'pt_grand_smash', 'pt_r_smash', 'pt_h_sonic'],
    },
    fury: {
      primaryStat: 'str',
      complexity: 'high',
      examples: ['pt_mechanic_bomb', 'pt_maximize', 'pt_impulsion', 'pt_landminning'],
    },
    prot: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['pt_extreme_shield', 'pt_physical_absorb', 'pt_metal_armor', 'pt_metal_golem'],
    },
  },
  // PT Tempskron Pikeman: extracted PT kit
  tempskron_pikeman: {
    arms: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['pt_pike_wind', 'pt_ground_pike', 'pt_venom_spear', 'pt_d_reaper'],
    },
    fury: {
      primaryStat: 'str',
      complexity: 'high',
      examples: ['pt_critical_hit', 'pt_tornado', 'pt_chain_lance', 'pt_charging_strike'],
    },
    prot: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['pt_weapone_defence_mastery', 'pt_vanish', 'pt_shadow_master', 'pt_amplified'],
    },
  },
  // PT Tempskron Archer: extracted PT kit
  tempskron_archer: {
    arms: {
      primaryStat: 'agi',
      complexity: 'medium',
      examples: ['pt_wind_arrow', 'pt_arrow_of_rage', 'pt_bomb_shot', 'pt_e_shot'],
    },
    fury: {
      primaryStat: 'agi',
      complexity: 'high',
      examples: ['pt_avalanche', 'pt_elemental_shot', 'pt_phoenix_shot', 'pt_c_trap'],
    },
    prot: {
      primaryStat: 'agi',
      complexity: 'medium',
      examples: ['pt_shooting_mastery', 'pt_dions_eye', 'pt_evasion_mastery', 'pt_force_of_nature'],
    },
  },
  // PT Morion Knight: extracted PT kit
  morion_knight: {
    arms: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['pt_sword_blast', 'pt_brandish', 'pt_piercing', 'pt_divine_piercing'],
    },
    fury: {
      primaryStat: 'str',
      complexity: 'high',
      examples: ['pt_double_crash', 'pt_grand_cross', 'pt_sword_of_justice', 'pt_c_moon'],
    },
    prot: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['pt_holy_body', 'pt_sword_mastery', 'pt_godly_shield', 'pt_h_benedic'],
    },
  },
  // PT Morion Atalanta: extracted PT kit
  morion_atalanta: {
    arms: {
      primaryStat: 'agi',
      complexity: 'medium',
      examples: ['pt_vigor_spear', 'pt_twist_javelin', 'pt_split_javelin', 'pt_g_coup'],
    },
    fury: {
      primaryStat: 'agi',
      complexity: 'high',
      examples: ['pt_fire_javelin', 'pt_lightning_javelin', 'pt_storm_javelin', 'pt_frost_javelin'],
    },
    prot: {
      primaryStat: 'agi',
      complexity: 'medium',
      examples: ['pt_shield_strike', 'pt_throwing_mastery', 'pt_triumph_of_valhalla', 'pt_hall_of_valhalla'],
    },
  },
  // PT Morion Priestess: extracted PT kit
  morion_priestess: {
    arms: {
      primaryStat: 'int',
      complexity: 'medium',
      examples: ['pt_holy_bolt', 'pt_multispark', 'pt_divine_lightning', 'pt_chain_lightning'],
    },
    fury: {
      primaryStat: 'int',
      complexity: 'high',
      examples: ['pt_extinction', 'pt_glacial_spike', 'pt_s_impact', 'pt_p_ice'],
    },
    prot: {
      primaryStat: 'int',
      complexity: 'medium',
      examples: ['pt_healing', 'pt_grand_healing', 'pt_resurrection', 'pt_regeneration_field'],
    },
  },
  // PT Morion Magician: extracted PT kit
  morion_magician: {
    arms: {
      primaryStat: 'int',
      complexity: 'medium',
      examples: ['pt_fire_bolt', 'pt_fire_ball', 'pt_dead_ray', 'pt_flame_wave'],
    },
    fury: {
      primaryStat: 'int',
      complexity: 'high',
      examples: ['pt_agony', 'pt_watornado', 'pt_diastrophism', 'pt_m_meteo'],
    },
    prot: {
      primaryStat: 'int',
      complexity: 'medium',
      examples: ['pt_mental_mastery', 'pt_enchant_weapon', 'pt_energy_shield', 'pt_spirit_elemental'],
    },
  },
  // PT Atlanteon Assassin: extracted PT kit
  atlanteon_assassin: {
    arms: {
      primaryStat: 'agi',
      complexity: 'medium',
      examples: ['pt_stringer', 'pt_running_hit', 'pt_sore_sword', 'pt_violence_stab'],
    },
    fury: {
      primaryStat: 'agi',
      complexity: 'high',
      examples: ['pt_wisp', 'pt_beat_up', 'pt_pasting_shadow', 'pt_shadow_bomb'],
    },
    prot: {
      primaryStat: 'agi',
      complexity: 'medium',
      examples: ['pt_swordmastery', 'pt_attack_mastery', 'pt_blind', 'pt_fatal_mastery'],
    },
  },
  // PT Atlanteon Martial Artist: extracted PT kit
  atlanteon_martial_artist: {
    arms: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['pt_lowkick', 'pt_dbblow', 'pt_h_straight', 'pt_t_cannon'],
    },
    fury: {
      primaryStat: 'str',
      complexity: 'high',
      examples: ['pt_rage_up', 'pt_r_elbow', 'pt_j_heelkick', 'pt_typhoon'],
    },
    prot: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['pt_sr_mastery', 'pt_i_bulkup', 'pt_war_cry', 'pt_d_mastery'],
    },
  },
  // PT Atlanteon Shaman: extracted PT kit
  atlanteon_shaman: {
    arms: {
      primaryStat: 'int',
      complexity: 'medium',
      examples: ['pt_dark_bolt', 'pt_dark_wave', 'pt_spiritual_flare', 'pt_judgement'],
    },
    fury: {
      primaryStat: 'int',
      complexity: 'high',
      examples: ['pt_curse_lazy', 'pt_land_of_ghost', 'pt_scratch', 'pt_press_of_deity'],
    },
    prot: {
      primaryStat: 'int',
      complexity: 'medium',
      examples: ['pt_inner_peace', 'pt_haunt', 'pt_mourning_of_pray', 'pt_high_regeneration'],
    },
  },
  // PT Morion Monk (fork-added): reuse warrior's spec card info (Phase A)
  morion_monk: {
    arms: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['mortal_strike', 'overpower', 'sweeping_strikes', 'execute'],
    },
    fury: {
      primaryStat: 'str',
      complexity: 'high',
      examples: ['bloodthirst', 'raging_gale', 'red_harvest', 'whirlwind'],
    },
    prot: {
      primaryStat: 'str',
      complexity: 'medium',
      examples: ['shield_slam', 'revenge', 'thunder_clap', 'sunder_armor'],
    },
  },
};
