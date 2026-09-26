import { authoredLettersById } from '../sim/content/letters';
import { DELVES, DUNGEONS, MOBS, NPCS, QUESTS, ZONES } from '../sim/data';

// English world-entity names + narratives (mobs, NPCs, quests, zones, dungeons).
//
// This module is the SINGLE English source for those entities: makeEnglishWorldEntities()
// reads the canonical sim data and shapes it into the `en` slice that src/ui/i18n.catalog
// spreads into the authoritative nested `en` (imported there as `worldNames.en`). The
// build then overlays each per-locale flat overlay (src/ui/i18n.locales/<lang>.ts) onto
// that `en` to produce the dense resolved table.
//
// Non-English entity names are NOT here. The flatten migration inlined every entity key into the
// flat overlays, which left this module's non-English datasets dead (zero runtime
// consumers - tEntity resolves through the resolved table, not this object). A later cleanup
// removed those dead datasets along with the `{} as WorldEntityTranslations` casts that
// faked es_ES->es / fr_CA->fr_FR dialect inheritance here; dialect inheritance is now a
// declared-base merge in the build resolver (scripts/i18n_build.mjs). Only `.en` is
// consumed, so this object carries only `en`.

const MOB_IDS = [
  'yumi_cat',
  'forest_wolf',
  'old_greyjaw',
  'wild_boar',
  'webwood_spider',
  'mudfin_murloc',
  'tunnel_rat',
  'vale_bandit',
  'restless_bones',
  'gorrak',
  'mire_prowler',
  'deepfen_murloc',
  'mire_widow',
  'mirefen_broodmother',
  'drowned_dead',
  'fen_troll',
  'grubjaw',
  'gravecaller_cultist',
  'gravecaller_summoner',
  'gravecaller_mender',
  'deacon_voss',
  'training_dummy',
  // The rest of the Highwatch practice row (sim/content/practice_dummies.ts).
  'friendly_player_dummy',
  'normal_boss_dummy',
  'heroic_boss_dummy',
  // The Eastbrook hub's own level-5 practice targets (sim/content/practice_dummies.ts).
  'hub_training_dummy',
  'hub_healing_dummy',
  'ridge_stalker',
  'deeprock_kobold',
  'thornpeak_ogre',
  'ogre_crusher',
  'warlord_drogmar',
  'stormcrag_elemental',
  'shardlord_kazzix',
  'wyrmcult_zealot',
  'wyrmcult_necromancer',
  'boneclad_revenant',
  'crypt_shambler',
  'hollow_acolyte',
  'bonechill_widow',
  'sexton_marrow',
  'morthen',
  'bastion_revenant',
  'tidebound_acolyte',
  'drowned_thrall',
  'knight_commander_olen',
  'vael_the_mistcaller',
  'sanctum_boneguard',
  'sanctum_drakonid',
  'raised_bonewalker',
  'korgath_the_bound',
  'grand_necromancer_velkhar',
  'korzul_the_gravewyrm',
  'bog_bloat',
  'fallen_captain_aldren',
  'corrupted_priest_malric',
  'deathstalker_voss',
  'vision_aldren_warrior',
  'vision_malric_mage',
  'vision_deathstalker_voss',
  'bound_guardian',
  'nythraxis_skeleton_warrior',
  'nythraxis_heroic_warrior_add',
  'nythraxis_heroic_priest_add',
  'nythraxis_heroic_rogue_add',
  'nythraxis_scourge_of_thornpeak',
  'nythraxis_bone_spike',
  'ignivar_herald_of_the_last_flame',
  'ignivar_heart_of_the_end',
  'ignivar_ember_sentinel',
  'ignivar_crucible_warden',
  'ignivar_cinder_artificer',
  'varkhul_forgefather_of_the_last_flame',
  // Ignivar raid approach: the downed forge automaton packs (DUNGEON_MOBS).
  'derelict_mech',
  // Collapsed Reliquary delve mobs
  'reliquary_ledger_wraith',
  'reliquary_funeral_ringer',
  'reliquary_gravecall_acolyte',
  'reliquary_bonewalker',
  'reliquary_saintless_effigy',
  'deacon_varric',
  'acolyte_tessa',
  // Drowned Litany delve mobs (Mirefen Marsh)
  'drowned_cantor',
  'reedbound_acolyte',
  'deepfen_spearjaw',
  'mirefen_widowling',
  'spider_egg_sac',
  // Quest-dedupe pass (zones 1 to 3): the Broodmother clutch and the new elites.
  'spider_egg',
  'widow_hatchling',
  'drowned_warlord',
  'brakka_wallbreaker',
  'threnos_first_voice',
  'grave_silt_bulwark',
  'sump_troll_devourer',
  'choir_thrall',
  'sister_nhalia_drowned_canticle',
  'edda_reedhand',
  'tolling_bell',
  // Thornpeak Heights world boss + its summoned adds
  'thunzharr_waking_peak',
  'thunzharr_stormling',
  // Ambient Highwatch Stables horse (zone 3)
  'stable_horse',
  // Procedural Rift creature pool (src/sim/content/rift/mobs.ts). Dev/endless
  // content; English names come from the MOBS table like every other id here.
  'rift_spawnling',
  'rift_bonewalker',
  'rift_frost_revenant',
  'rift_rime_elemental',
  'rift_ember_fiend',
  'rift_magma_brute',
  'rift_venom_weaver',
  'rift_thornback',
  'rift_boneclad',
  'rift_marrow_troll',
  'rift_void_acolyte',
  'rift_dread_stalker',
  'rift_storm_caller',
  'rift_stormscale',
  'rift_tide_thrall',
  'rift_deep_lurker',
  'rift_stone_ogre',
  'rift_boss_frost',
  'rift_boss_ember',
  'rift_boss_venom',
  'rift_boss_necro',
  'rift_boss_brute',
  'rift_boss_arcane',
  'rift_boss_storm',
  'rift_boss_tide',
  // the Veiled Hollow
  'glimmerwisp',
  'duskwisp',
  'veiled_stag',
  'veiled_doe',
  'gleamstag',
  'sporeling_gatherer',
  'corrupted_sporeling',
  'mushroom_pixie',
  'treant_elder',
  'ancient_guardian',
  'waking_warden',
  'old_marrowshell',
  'aurelhorn',
  'snowdrift_wolf',
  'ice_wisp',
  'rime_elemental',
  'fen_sprite',
  'frostmane_yeti',
  'terrace_howler',
  'apprentice_wren',
  'emberwing_drake',
  'ashbone_raider',
  'ashbone_warcaller',
  'dune_troll',
  'cindraleth_maw_matriarch',
  'dragonkin_egg',
  'dragonkin_whelp',
  'dragonkin_broodguard',
  'drakemaw_broodlord',
  'gilded_stag',
  'gloam_fox',
  'orchard_treant',
  'the_meredark',
  'harvest_sprite',
  'mere_lurker',
  'bogtoad',
  'drowsy_croaker',
  'lily_wisp',
  'willow_sprite',
  'moonfleece_grazer',
  'gloam_strider',
  'nightkin_stargazer',
  'barrow_king',
  'barrow_wight',
  'widowsilk_spinner',
  'wood_wraith',
  'gravenbark_shambler',
  'pale_huntsman',
  'gravedigger_mosley',
  'tide_scuttler',
  'thicket_boar',
  'canopy_weaver',
  'idol_guardian',
  'castaway_navigator',
  'topiary_stag',
  'topiary_wolf',
  'hedge_gnome',
  'hedge_knight',
  'the_topiary_bull',
  'moor_ram',
  'gale_wisp',
  'shoal_scuttler',
  'downs_bandit',
  'wreck_thief',
  'the_wreck_warden',
  'drowned_deckhand',
  'riftspawn',
  'breach_wretch',
  'void_stalker',
  'sundered_horror',
  'fisher_bram',
  // The Proving Shore (tutorial island, src/sim/content/proving_shore.ts).
  'training_effigy',
  'shore_scuttler',
  'mister_crabs',
  // The Infernal Citadel set-piece (src/sim/content/rift/infernal_citadel.ts).
  'rift_hellguard',
  'rift_pact_acolyte',
  'rift_boss_ritualist',
  'rift_boss_pitlord',
  // The Wildheart Basin jungle dungeon (src/sim/content/wildheart.ts).
  'wildheart_stalker',
  'wildheart_ravager',
  'wildheart_hexcaller',
  'wildheart_beastmaster',
  'wildheart_high_priest',
  // PT connected-world field mobs: the hand-placed proof pair plus the
  // generated Phase 6H-1 catalog (src/sim/content/pt_mobs.ts). Names stay
  // in the source zh strings; zh_TW rows carry traditional conversions.

  'pt_10_minig',
  'pt_11_imp',
  'pt_12_doral',
  'pt_12_mutantplant',
  'pt_14_hobgoblin',
  'pt_14_northgoblin',
  'pt_15_mutantrabie',
  'pt_16_mutanttree',
  'pt_17_hauntingmaple',
  'pt_17_hauntingplant',
  'pt_18_corrupt',
  'pt_18_skeleton',
  'pt_19_zombie',
  'pt_21_cokris',
  'pt_22_beedog',
  'pt_23_mephit',
  'pt_25_minigsilver',
  'pt_27_scorpion',
  'pt_28_devilishtree',
  'pt_28_plantlord',
  'pt_30_leech',
  'pt_31_decoy',
  'pt_32_ghoul',
  'pt_33_cyclops',
  'pt_34_web',
  'pt_35_armoredbettle',
  'pt_36_buma',
  'pt_37_skeletonarcher',
  'pt_38_crypt',
  'pt_40_bargon',
  'pt_43_mightygoblin',
  'pt_44_skeletonranger',
  'pt_47_cyclopsknight',
  'pt_48_hungky',
  'pt_49_skeletonwarrior',
  'pt_49_vampiricbat',
  'pt_4_hopy',
  'pt_4_rabie',
  'pt_4_tobie',
  'pt_50_evilsnail',
  'pt_50_greven',
  'pt_52_direbee',
  'pt_52_muffin',
  'pt_53_titan',
  'pt_54_mudygolem',
  'pt_54_skeletonknight',
  'pt_55_sandlem',
  'pt_56_avelisk-s',
  'pt_57_mirekeeper',
  'pt_59_headcutter',
  'pt_5_cuepy',
  'pt_5_mush',
  'pt_5_mushroomghost',
  'pt_5_zeldy',
  'pt_60_evilplant',
  'pt_60_solidsnail',
  'pt_61_avelisk-l',
  'pt_62_beevil',
  'pt_62_thorncrawler',
  'pt_64_mummy',
  'pt_65_darkknight',
  'pt_66_slaughter',
  'pt_67_illusionknight',
  'pt_67_nightmare',
  'pt_69_doomguard',
  'pt_69_figon',
  'pt_69_naz',
  'pt_6_arma',
  'pt_70_avelisklord',
  'pt_71_witch',
  'pt_72_heavygoblin',
  'pt_73_stonegiant',
  'pt_74_stonegolem',
  'pt_7_sen',
  'pt_86_kinghopy',
  'pt_8_egan',
  'pt_8_ghost',
  'pt_8_orbit',
  'pt_bargon',
  'pt_boss_135_death_knight',
  'pt_boss_140_draxos',
  'pt_boss_145_bguardian',
  'pt_boss_150_greedy',
  'pt_c_100_monzombi',
  'pt_c_105_moncyclops',
  'pt_c_110_beetle',
  'pt_c_115_skeletonknight',
  'pt_c_120_illusionknight',
  'pt_c_125_navelriskstf',
  'pt_c_128_rguard',
  'pt_c_129_mountain',
  'pt_c_130_towergolem',
  'pt_c_131_dmystery',
  'pt_c_134_inferno',
  'pt_c_135_redeye',
  'pt_c_136_billy',
  'pt_c_137_lizard_soldier',
  'pt_c_140_crios',
  'pt_c_142_bonehound',
  'pt_c_144_shogoth',
  'pt_c_150_web',
  'pt_c_160_s_ar',
  'pt_c_162_s_fi',
  'pt_c_165_s_pa',
  'pt_c_166_s_meca',
  'pt_c_167_s_pr',
  'pt_c_168_s_atal',
  'pt_c_170_s_kn',
  'pt_c_172_s_magi',
  'pt_c_175_tulla',
  'pt_c_176_lizard_papa',
  'pt_c_178_lizard_elder',
  'pt_c_180_bigmama',
  'pt_c_200_monmokova',
  'pt_c_204_wlord',
  'pt_c_208_boitata',
  'pt_c_95_goblinchief',
  'pt_event_100_strawberry_bear',
  'pt_event_85_apple_bear',
  'pt_event_90_banana_bear',
  'pt_event_95_maracuja_bear',
  'pt_heartoffire_8',
  'pt_hopy',
  'pt_hp_72_great_greven',
  'pt_hp_73_omu',
  'pt_hp_76_stingray',
  'pt_hp_79_m_lord',
  'pt_hp_80_lizardfolk',
  'pt_hp_82_strider',
  'pt_hp_85_spider',
  'pt_hy1_156_dey',
  'pt_hy1_157_gurkob',
  'pt_hy1_158_faugn',
  'pt_hy1_159_yagditha',
  'pt_hy1_160_wlord',
  'pt_ice_8',
  'pt_kd1_131ltechnician',
  'pt_kd1_132lengineer',
  'pt_kd1_133itechnician',
  'pt_kd1_134isoldier',
  'pt_kd1_135ielite',
  'pt_kd2_136lguardian',
  'pt_kd2_137ibomber',
  'pt_kd2_138_acero',
  'pt_kd2_139_chalybs',
  'pt_kd2_140_nihil',
  'pt_landofnurwn_1',
  'pt_landofnurwn_2',
  'pt_landofnurwn_3',
  'pt_landofnurwn_4',
  'pt_landofnurwn_5',
  'pt_landofnurwn_6',
  'pt_landofnurwn_7',
  'pt_ms1_100_darkmage',
  'pt_ms1_101_darkphalanx',
  'pt_ms1_96_fireworm',
  'pt_ms1_97_chimera',
  'pt_ms1_98_hellhound',
  'pt_ms1_99_darkguard',
  'pt_ms2_102_seto',
  'pt_ms2_103_kingspider',
  'pt_ms2_105_templeguard',
  'pt_ms2_106_bloodyknight',
  'pt_ms3_141_koon',
  'pt_ms3_142_marionette',
  'pt_ms3_143_lizard_soldier',
  'pt_ms3_144_sathla',
  'pt_ms3_145_monmokova',
  'pt_sd1_72_sliver',
  'pt_sd1_75_succubus',
  'pt_sd1_77_dawlin',
  'pt_sd1_79_stygian',
  'pt_sd1_85_typhoon',
  'pt_sd2_100_ratoo',
  'pt_sd2_75_dusk',
  'pt_sd2_79_shadow',
  'pt_sd2_82_incubus',
  'pt_sd2_83_omicron',
  'pt_sd3_125_mimic',
  'pt_sd3_126_niken',
  'pt_sd3_127_kingbat',
  'pt_sd3_128_goblinshaman',
  'pt_sd3_130_hest',
  'pt_ta1_105_d_ar',
  'pt_ta1_106_d_fi',
  'pt_ta1_107_d_meca',
  'pt_ta1_108_d_pa',
  'pt_ta1_111_hobogolem',
  'pt_ta2_110_deadkinghopy',
  'pt_ta2_111_d_atal',
  'pt_ta2_112_d_kn',
  'pt_ta2_113_d_pr',
  'pt_ta2_114_d_magi',
  'pt_ta2_116_gorgon',
  'pt_ta3_120_kakoa',
  'pt_ta3_121_nazsenior',
  'pt_ta3_122_ruca',
  'pt_ta3_123_sprin',
  'pt_ta3_124_igolation',
  'pt_ta3_125_undeadmaple',
  'pt_ta3_126_xetan',
  'pt_tl1_100_grotesque',
  'pt_tl1_81_ironguard',
  'pt_tl1_82_avelin',
  'pt_tl1_83_chaingolem',
  'pt_tl1_84_hypermachine',
  'pt_tl1_84_rampage',
  'pt_tl1_85_deadzone',
  'pt_tl1_85_vampiricmachine',
  'pt_tl1_87_darkspecter',
  'pt_tl2_100_ironfist',
  'pt_tl2_87_morgon',
  'pt_tl2_87_runicguardian',
  'pt_tl2_88_metron',
  'pt_tl2_88_sadness',
  'pt_tl2_89_d-machine',
  'pt_tl2_89_mountain',
  'pt_tl2_92_omega',
  'pt_tl3_146_undeadstalker',
  'pt_tl3_147_morgon',
  'pt_tl3_148_ignis',
  'pt_tl3_149_najan',
  'pt_tl3_150_midranda',
  'pt_xd1_100_chaoscara',
  'pt_xd1_88_mystic',
  'pt_xd1_91_coldeye',
  'pt_xd1_92_frozen',
  'pt_xd1_93_icegoblin',
  'pt_xd1_94_frost',
  'pt_xd1_95_icegolem',
  'pt_xd2_100_devilbird',
  'pt_xd2_96_cyclopswarrior',
  'pt_xd2_97_turtlecannon',
  'pt_xd2_98_incubussummer',
  'pt_xd2_99_blizzardgiant',
  'pt_xd3_121_iceworm',
  'pt_xd3_122_minebat',
  'pt_xd3_123_minegolem',
  'pt_xd3_124_sealcrasher',
  'pt_xd3_125_tarantulika',
  'pt_xd3_126_undeadmanager',
  'pt_xd4_151_royalmummy',
  'pt_xd4_152_lena',
  'pt_xd4_153_bknight',
  'pt_xd4_154_iceserpent',
  'pt_xd4_155_boitata',
] as const;

const NPC_IDS = [
  'the_merchant',
  'marshal_redbrook',
  'trader_wilkes',
  'apothecary_lin',
  'brother_aldric',
  'smith_haldren',
  'fisherman_brandt',
  'foreman_odell',
  'stablemaster_marla', // the stablemaster: teaches riding lessons (Highwatch, zone 3)
  'warden_fenwick',
  'brother_aldric_fen',
  'provisioner_hale',
  'herbalist_yara',
  'scout_maren',
  'captain_thessaly',
  'brother_aldric_highwatch',
  'scout_maren_highwatch',
  'quartermaster_bree',
  'armorer_hode',
  'heroic_quartermaster', // Heroic Marks vendor (Highwatch, zone 3)
  'fury', // Honor Quartermaster and WARFARE vendor (Eastbrook, zone 1)
  'warmarshal_draven_kole', // Master of the Warfare Stores, the WARFARE vendor (Highwatch, zone 3)
  'loremaster_caddis',
  'auctioneer_voss', // second World Market auctioneer (Highwatch, zone 3)
  'bursar_fernando', // Gilded Strongbox banker (Eastbrook, zone 1)
  'card_master', // Card Duel minigame queue desk (Eastbrook, zone 1)
  'bursar_petra_vell', // Gilded Strongbox banker (Fenbridge, zone 2)
  'bursar_aldous_crane', // Gilded Strongbox banker (Highwatch, zone 3)
  'brother_aldric_raid', // dynamically-spawned raid turn-in NPC (Crypt of Nythraxis)
  'archivist_maelin_emberward', // dev-only Ignivar raid historian
  'archivist_maelin_ember_projection', // Maelin's instanced raid checkpoint projection
  'crucible_quartermaster', // Ignivar raid sigil-redemption vendor (Halls of the First Tempering)
  'brother_halven', // Collapsed Reliquary delve board NPC
  'brother_halven_marsh', // Drowned Litany delve board NPC (same character, marsh camp)
  'spirit_healer', // the graveyard angel (spawned at every graveyard + dungeon entry)
  'chronicler_saul', // Book of Deeds Chronicler (Eastbrook, zone 1)
  'chronicler_osric_fenn', // Book of Deeds Chronicler (Fenbridge, zone 2)
  'chronicler_edda_hartwell', // Book of Deeds Chronicler (Highwatch, zone 3)
  // Eldershine, the Veiled Hollow
  'keeper_saelwyn',
  'loremother_bryn',
  'provisioner_fenna',
  'wardsmith_orun',
  'archivist_tullo',
  'huntsman_deral',
  // Icemantle, the Frostveil Reach
  'warden_kaldra',
  'hearthkeeper_maeve',
  'scout_einna',
  'aurorist_veyla',
  'trapper_brosk',
  // Wyrmwatch, the Drakelands
  'gatecaptain_brannoc',
  'quartermaster_sela',
  'scout_yerrin',
  // Lanternmere, the Amberfall
  'reeve_ottoline',
  'waywatcher_sorrel',
  'ferrymaster_caddow',
  'orchardist_pomeline',
  // Bridgemere, the Willowfen
  'waykeeper_pell',
  'bridgewright_alden',
  'netter_maris',
  'mother_sedge',
  // Moonrest, the Nightbloom
  'lamplighter_sorrel',
  'lira_dewsong',
  'weaver_amelle',
  'astronomer_cassian',
  // Gibbetmere, the Wraithwood
  'lampman_cobb',
  'sexton_marrow',
  'widow_tansy',
  'vicar_creel',
  // Drifthaven, the Palmreach
  'strandwatcher_pell',
  'salvage_boss_ryna',
  'pearlmother_isha',
  'hermit_okku',
  // Hedgewick, the Evergarden
  'gatewarden_pell',
  'head_gardener_amaranth',
  'wickmother_sorrel',
  'gardener_yew',
  // Wickharbor, the Galecrest
  'watcher_maren',
  'harbormaster_odile',
  'keeper_bram',
  'salvager_edda',
  // Gullhaven, the Farshore redoubt
  'warden_coalfast',
  'riftwatch_ollun',
  'quartermaster_edda',
  'mender_saul',
  'bellkeeper_tam',
  'fisher_nell',
  'riftwright_maelis', // the Rift Forge (Gullhaven, Farshore)
  'forgemistress_darva', // crafting-station master: forge (Eastbrook, zone 1)
  'cook_marlow', // crafting-station master: kitchens (Eastbrook, zone 1)
  'weaver_ottilie', // crafting-station master: loom (Eastbrook, zone 1)
  'tinker_gizzel', // crafting-station master: toolworks (Eastbrook, zone 1)
  'tanner_hesk', // crafting-station master: tannery (Fenbridge, zone 2)
  'alchemist_verane', // crafting-station master: apothecary (Highwatch, zone 3)
  // The farmer NPCs (the farming go-live), one per farming hub, in the same
  // tier order as the corresponding FARM_PATCHES rows.
  'farmer_jessica', // Eastbrook allotments (zone 1, tier 1)
  'farmer_teasel', // Fenbridge raised beds (zone 2, tier 2)
  'farmer_hollis', // Highwatch terraces (zone 3, tier 3)
  'farmer_verbena', // the Evergarden parterre (tier 4)
  // the Proving Shore (tutorial island) + its Eastbrook-spawn greeter
  'wayfarer_bryn',
  'instructor_maren',
  'quartermaster_finch',
  'ferryman_odo',
  'bursar_wick',
  'warden_tam',
  'overseer_pell',
  'drillmaster_rook',
  'tidewarden_nel',
  // the Eastbrook quay's sparring master (content/practice_dummies.ts)
  'drillmaster_hale',
] as const;

const QUEST_IDS = [
  'q_prof_intro',
  'q_farm_intro',
  'q_wolves',
  'q_greyjaw',
  'q_boars',
  'q_spiders',
  'q_murlocs',
  'q_mine',
  'q_bones',
  'q_supplies',
  'q_whispers',
  'q_names_of_the_dead',
  'q_silence_the_call',
  'q_rite',
  'q_hollow',
  'q_sexton',
  'q_gravecallers_trail',
  'q_divine_tome',
  'q_bandits',
  'q_ringleader',
  'q_fenbridge_muster',
  'q_prowlers',
  'q_prowler_pelts',
  'q_fen_supplies',
  'q_deepfen',
  'q_idols',
  'q_aldrics_fallen_star',
  'q_deepfen_purge',
  'q_widows',
  'q_broodmother',
  'q_drowned',
  'q_drowned_censers',
  'q_no_rest',
  'q_rite_of_redemption',
  'q_trolls',
  'q_troll_fetishes',
  'q_grubjaw',
  'q_cult_camp',
  'q_summoners',
  'q_deacon',
  'q_bastion_door',
  'q_olen',
  'q_mistcaller',
  'q_highwatch_summons',
  'q_stalkers',
  'q_stalker_pelts',
  'q_stalkers_return',
  'q_stalker_cloaks',
  'q_old_cragmaw',
  'q_kobold_tunnels',
  'q_glowing_wax',
  'q_ogre_edges',
  'q_ogre_totems',
  'q_ogre_bounty',
  'q_crushers',
  'q_drogmar',
  'q_elementals',
  'q_shard_cores',
  'q_kazzix',
  'q_zealots',
  'q_cult_orders',
  'q_necromancers',
  'q_revenants',
  'q_revenant_vanguard',
  'q_wyrm_sigils',
  'q_breaking_the_seal',
  'q_voice_below',
  'q_sanctum_gate',
  'q_korgath',
  'q_velkhar',
  'q_gravewyrm',
  'q_the_codfather',
  'q_nythraxis_restless_dead',
  'q_nythraxis_graves',
  'q_nythraxis_sealed_crypt',
  'q_nythraxis_bound_guardian',
  'q_nythraxis_scourges_end',
  'q_ignivar_echoes_in_iron',
  'q_ignivar_heralds_heart',
  'q_ignivar_the_forgefather',
  'q_forgefathers_requiem',
  'q_requiem_at_the_forge',
  'q_mogger',
  'q_prof_attune_smith',
  'q_prof_attune_outfitter',
  'q_prof_attune_apothecary',
  'q_prof_attune_bombardier',
  'q_prof_amends_smith',
  'q_prof_amends_outfitter',
  'q_prof_amends_apothecary',
  'q_prof_amends_bombardier',
  'q_prof_workorder_forge',
  'q_prof_workorder_kitchens',
  'q_prof_workorder_kitchens_wheat',
  'q_prof_workorder_kitchens_rice',
  'q_prof_workorder_loom',
  'q_prof_workorder_toolworks',
  'q_prof_workorder_tannery',
  'q_prof_workorder_apothecary',
  'q_riding_lessons',
  // the Veiled Hollow
  'q_veil_thinned',
  'q_gleaming_antlers',
  'q_wisp_lights',
  'q_calming_the_deep',
  'q_spore_hearts',
  'q_monument_tour',
  'q_grove_menace',
  'q_shards_of_starfall',
  'q_treant_accord',
  'q_spore_tide',
  'q_sunken_court',
  'q_wardens_echoes',
  'q_waking_warden',
  'q_seal_restored',
  'q_hollow_the_huntsman',
  'q_hollow_old_marrowshell',
  'q_hollow_first_of_the_herd',
  'q_prof_hobby_switch',
  // the Frostveil Reach
  'q_fv_snowline_report',
  'q_fv_wolves_at_the_door',
  'q_fv_winter_pelts',
  'q_fv_ember_caches',
  'q_fv_lights_over_steps',
  'q_fv_silent_trapline',
  'q_fv_aurora_motes',
  'q_fv_rime_unbound',
  'q_fv_sprung_traps',
  'q_fv_howl_above',
  'q_fv_seeing_wren_home',
  'q_fv_frostmane_tyrant',
  // the Drakelands
  'q_dk_ash_on_the_wind',
  'q_dk_trolls_on_the_road',
  'q_dk_scorched_stores',
  'q_dk_banners_over_the_dunes',
  'q_dk_watcher_at_the_wargate',
  'q_dk_marrow_and_ash',
  'q_dk_scales_of_the_maw',
  'q_dk_matriarch_of_the_maw',
  // the Amberfall
  'q_af_goldmelt_road',
  'q_af_foxes_in_the_lamplight',
  'q_af_lanterns_on_the_water',
  'q_af_orchard_call',
  'q_af_amber_from_the_herd',
  'q_af_what_took_the_moorings',
  'q_af_sprites_and_spigots',
  'q_af_the_meredark',
  // the Willowfen
  'q_wf_across_the_fenway',
  'q_wf_rope_chewers',
  'q_wf_eels_for_the_smokehouse',
  'q_wf_mind_the_moorings',
  'q_wf_witch_of_willowweep',
  'q_wf_toll_and_tangle',
  'q_wf_wisplight_charms',
  'q_wf_croakers_hush',
  // the Nightbloom
  'q_nb_road_of_lanterns',
  'q_nb_striders_in_the_dark',
  'q_nb_wool_by_moonlight',
  'q_nb_night_gardens',
  'q_nb_eyes_on_the_vigil',
  'q_nb_charts_of_the_stones',
  'q_nb_restless_mounds',
  'q_nb_the_barrow_king',
  // the Wraithwood
  'q_ww_bells_of_gallowmere',
  'q_ww_silk_in_the_eaves',
  'q_ww_widows_skeins',
  'q_ww_candles_at_the_bounds',
  'q_ww_the_last_vicar',
  'q_ww_wraiths_of_the_tarn',
  'q_ww_what_the_bark_holds',
  'q_ww_walking_mosley_home',
  'q_ww_horn_of_the_huntsman',
  // the Palmreach
  'q_pr_down_to_drifthaven',
  'q_pr_wreck_line_cargo',
  'q_pr_scuttler_cull',
  'q_pr_boars_in_the_gardens',
  'q_pr_the_man_who_went_in',
  'q_pr_canopy_silk',
  'q_pr_the_lost_navigator',
  'q_pr_what_the_drums_guard',
  'q_pr_idol_guardian',
  // the Evergarden
  'q_eg_gate_report',
  'q_eg_hungry_shapes',
  'q_eg_stolen_shears',
  'q_eg_who_trims_the_hedges',
  'q_eg_gnomes_in_the_green',
  'q_eg_bloom_clippings',
  'q_eg_four_statues',
  'q_eg_bull_of_the_court',
  // the Farshore
  'q_fs_bell_at_the_landing',
  'q_fs_hold_the_riftfields',
  'q_fs_steel_for_the_redoubt',
  'q_fs_the_three_bells',
  'q_fs_song_before_the_break',
  'q_fs_moss_and_mending',
  'q_fs_bram_come_home',
  'q_fs_stalkers_off_the_light',
  'q_fs_the_great_break',
  // the Proving Shore (tutorial island)
  'q_ps_the_gauntlet',
  'q_ps_strike_true',
  'q_ps_hone_the_edge',
  'q_ps_shell_and_claw',
  'q_ps_mother_of_pearl',
  'q_ps_the_wreck_line',
  'q_ps_pouch_and_purse',
  'q_ps_the_signpost',
  'q_ps_the_long_walk',
  'q_ps_set_sail',
  // the Galecrest
  'q_gc_down_the_windway',
  'q_gc_wool_off_the_downs',
  'q_gc_scuttlers_in_the_pots',
  'q_gc_keeper_of_the_flame',
  'q_gc_lanterns_on_the_shear',
  'q_gc_wind_against_the_wick',
  'q_gc_the_far_shore',
  'q_gc_dead_mens_cargo',
  'q_gc_the_wreck_warden',
  // the Eastbrook hub dummy lesson (content/practice_dummies.ts)
  'q_hub_know_your_numbers',
  'q_hub_healing_numbers',
] as const;

const ZONE_IDS = [
  'eastbrook_vale',
  'mirefen_marsh',
  'thornpeak_heights',
  'veiled_hollow',
  'drakelands',
  'frostveil',
  'amberfall',
  'willowfen',
  'nightbloom',
  'wraithwood',
  'palmreach',
  'evergarden',
  'galecrest',
  'farshore_isle',
  'proving_shore',
] as const;
const DUNGEON_IDS = [
  'hollow_crypt',
  'sunken_bastion',
  'gravewyrm_sanctum',
  'nythraxis_crypt',
  'nythraxis_boss_arena',
  'ignivar_forge_lift',
  'ignivar_forge_approach',
  'ignivar_raid_arena',
  'ignivar_molten_assembly',
  'ignivar_inner_crucible',
  'wildheart_basin',
  'the_last_keep',
  'dawnhold_castle',
] as const;
const DELVE_IDS = ['collapsed_reliquary', 'drowned_litany'] as const;
// Ravenpost authored letters (src/sim/content/letters.ts): the welcome letter
// plus every quest thank-you letter, keyed by letterId.
const LETTER_IDS = [
  'ravenpost_welcome',
  'letter_q_wolves',
  'letter_q_greyjaw',
  'letter_q_hollow',
  'heroic_marks_reward',
  // The absent-participant Wyrmfall Core delivery (Masterwrought phase 04,
  // WYRMFALL_CORE_LETTER in src/sim/content/letters.ts).
  'wyrmfall_core_reward',
  // Guild trend letters (Professions 2.0), one per canonical adjacent
  // pair in CRAFT_RING order (GUILD_TREND_LETTERS in src/sim/content/letters.ts).
  'guild_trend_engineering_alchemy',
  'guild_trend_alchemy_cooking',
  'guild_trend_cooking_leatherworking',
  'guild_trend_leatherworking_tailoring',
  'guild_trend_tailoring_inscription',
  'guild_trend_inscription_enchanting',
  'guild_trend_enchanting_jewelcrafting',
  'guild_trend_jewelcrafting_weaponcrafting',
  'guild_trend_weaponcrafting_armorcrafting',
  'guild_trend_armorcrafting_engineering',
  // The one-time mastery reset notice (Professions 2.0,
  // MASTERY_RESET_LETTER in src/sim/content/letters.ts).
  'mastery_reset_notice',
  // Master tier-milestone letters (Professions 2.0), one per anchor
  // master per tier 1..5 (MASTER_TIER_LETTERS in src/sim/content/letters.ts).
  'prof_tier_weaponcrafting_armorcrafting_1',
  'prof_tier_weaponcrafting_armorcrafting_2',
  'prof_tier_weaponcrafting_armorcrafting_3',
  'prof_tier_weaponcrafting_armorcrafting_4',
  'prof_tier_weaponcrafting_armorcrafting_5',
  'prof_tier_leatherworking_tailoring_1',
  'prof_tier_leatherworking_tailoring_2',
  'prof_tier_leatherworking_tailoring_3',
  'prof_tier_leatherworking_tailoring_4',
  'prof_tier_leatherworking_tailoring_5',
  'prof_tier_alchemy_cooking_1',
  'prof_tier_alchemy_cooking_2',
  'prof_tier_alchemy_cooking_3',
  'prof_tier_alchemy_cooking_4',
  'prof_tier_alchemy_cooking_5',
  'prof_tier_engineering_alchemy_1',
  'prof_tier_engineering_alchemy_2',
  'prof_tier_engineering_alchemy_3',
  'prof_tier_engineering_alchemy_4',
  'prof_tier_engineering_alchemy_5',
  // $WOC Exchange custody letters (the server-side marketplace,
  // WOC_MARKET_*_LETTER in src/sim/content/letters.ts).
  'woc_market_delivery',
  'woc_market_return',
  'woc_market_sold',
] as const;

type MobId = (typeof MOB_IDS)[number];
type NpcId = (typeof NPC_IDS)[number];
type QuestId = (typeof QUEST_IDS)[number];
type ZoneId = (typeof ZONE_IDS)[number];
type DungeonId = (typeof DUNGEON_IDS)[number];
type DelveId = (typeof DELVE_IDS)[number];
type LetterId = (typeof LETTER_IDS)[number];

type MobTranslations = Record<MobId, { name: string }>;
type NpcTranslations = Record<NpcId, { name: string; title: string; greeting: string }>;
type QuestTranslation = {
  title: string;
  text: string;
  completion: string;
  objectives: Record<number, { label: string }>;
};
type QuestTranslations = Record<QuestId, QuestTranslation>;
type ZoneTranslations = Record<
  ZoneId,
  { name: string; welcome: string; pois: Record<number, { label: string }> }
>;
type DungeonTranslations = Record<
  DungeonId,
  { name: string; enterText: string; leaveText: string }
>;
type DelveTranslations = Record<DelveId, { name: string; enterText: string; leaveText: string }>;
type LetterTranslations = Record<LetterId, { sender: string; subject: string; body: string }>;

type WorldEntityTranslations = {
  worldContent: {
    corpseName: string;
    dungeonExitName: string;
    dungeonPartyWarning: string;
    dungeonInstanceBusy: string;
    delveLockedChestInteract: string;
    delveRewardChestInteract: string;
    delveSurfaceExitInteract: string;
    delveReliquaryInteract: string;
    delveRiteShrineBellInteract: string;
    delveRiteShrineCandleInteract: string;
    delveRiteShrineReedInteract: string;
    delveRiteShrineSkullInteract: string;
    mailboxName: string;
    noticeboardName: string;
    farmPatchName: string;
    realmBuilderMonumentName: string;
  };
  entities: {
    mobs: MobTranslations;
    npcs: NpcTranslations;
    quests: QuestTranslations;
    zones: ZoneTranslations;
    dungeons: DungeonTranslations;
    delves: DelveTranslations;
    letters: LetterTranslations;
  };
};

function normalizeSourceText(text: string): string {
  return text
    .replace(/\$N/g, '{playerName}')
    .replace(/\$C/g, '{className}')
    .replace(/\u2014/g, '-');
}

function orderedValues<T>(ids: readonly string[], source: Record<string, T>): T[] {
  return ids.map((id) => {
    const value = source[id];
    if (!value) throw new Error(`Missing world entity source entry for ${id}`);
    return value;
  });
}

function makeEnglishWorldEntities(): WorldEntityTranslations {
  const mobs = {} as MobTranslations;
  orderedValues(MOB_IDS, MOBS).forEach((mob) => {
    mobs[mob.id as MobId] = { name: mob.name };
  });

  const npcs = {} as NpcTranslations;
  orderedValues(NPC_IDS, NPCS).forEach((npc) => {
    npcs[npc.id as NpcId] = {
      name: npc.name,
      title: npc.title,
      greeting: normalizeSourceText(npc.greeting),
    };
  });

  const quests = {} as QuestTranslations;
  orderedValues(QUEST_IDS, QUESTS).forEach((quest) => {
    const objectiveRecord = {} as Record<number, { label: string }>;
    quest.objectives.forEach((objective, objectiveIndex) => {
      objectiveRecord[objectiveIndex] = { label: objective.label };
    });
    quests[quest.id as QuestId] = {
      title: quest.name,
      text: normalizeSourceText(quest.text),
      completion: normalizeSourceText(quest.completionText),
      objectives: objectiveRecord,
    };
  });

  const zones = {} as ZoneTranslations;
  ZONES.forEach((zone) => {
    const poiRecord = {} as Record<number, { label: string }>;
    zone.pois.forEach((poi, index) => {
      poiRecord[index] = { label: poi.label };
    });
    zones[zone.id as ZoneId] = {
      name: zone.name,
      welcome: normalizeSourceText(zone.welcome),
      pois: poiRecord,
    };
  });

  const dungeons = {} as DungeonTranslations;
  orderedValues(DUNGEON_IDS, DUNGEONS).forEach((dungeon) => {
    dungeons[dungeon.id as DungeonId] = {
      name: dungeon.name,
      enterText: normalizeSourceText(dungeon.enterText),
      leaveText: normalizeSourceText(dungeon.leaveText),
    };
  });

  const delves = {} as DelveTranslations;
  orderedValues(DELVE_IDS, DELVES).forEach((delve) => {
    delves[delve.id as DelveId] = {
      name: delve.name,
      enterText: normalizeSourceText(delve.enterText),
      leaveText: normalizeSourceText(delve.leaveText),
    };
  });

  // The one shared letter map (src/sim/content/letters.ts authoredLettersById),
  // the same source entity_i18n.ts answers knownLetterId from; LETTER_IDS above
  // fixes the ORDER and orderedValues throws for an id it lacks.
  const lettersById = authoredLettersById();
  const letters = {} as LetterTranslations;
  orderedValues(LETTER_IDS, lettersById).forEach((letter) => {
    letters[letter.letterId as LetterId] = {
      sender: letter.senderName,
      subject: normalizeSourceText(letter.subject),
      body: normalizeSourceText(letter.body),
    };
  });

  return {
    worldContent: {
      corpseName: '{name} (corpse)',
      dungeonExitName: '{name} Exit',
      dungeonPartyWarning: '{name} is meant for a full party of {count}. Tread carefully.',
      dungeonInstanceBusy: 'All instances of {name} are busy. Try again soon.',
      delveLockedChestInteract: 'Press F to pick the lock',
      delveRewardChestInteract: 'Press F to claim spoils',
      delveSurfaceExitInteract: 'Press F to climb',
      delveReliquaryInteract: 'Drowned Reliquary: Press F to begin the rite',
      delveRiteShrineBellInteract: 'Bell Shrine: Press F to ring it',
      delveRiteShrineCandleInteract: 'Candle Shrine: Press F to touch it',
      delveRiteShrineReedInteract: 'Reed Shrine: Press F to touch it',
      delveRiteShrineSkullInteract: 'Skull Shrine: Press F to touch it',
      mailboxName: 'Mailbox',
      noticeboardName: 'Notice Board',
      farmPatchName: 'Garden Beds',
      realmBuilderMonumentName: 'Realm Builder Monument',
    },
    entities: { mobs, npcs, quests, zones, dungeons, delves, letters },
  };
}

// Only `.en` is consumed (by src/ui/i18n.catalog); non-English entity names live in the
// flat per-locale overlays, and dialect inheritance is a declared-base merge in the
// build resolver. So this object intentionally carries English only.
export const worldEntityText = {
  en: makeEnglishWorldEntities(),
};
