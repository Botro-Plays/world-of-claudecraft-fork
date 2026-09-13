// Morion Priestess GLB assembler entry point.
//
// Assembles the Priston Tale Morion Priestess player character from:
//   - Body mesh:  MfbC01.smd  (Priestess body; from mc001.ini, the Morion
//                               "Pike" body ini in HoLogin.cpp:58,
//                               szMorPikeBodyName, used for the Priestess
//                               at character creation case 2)
//   - Head mesh:  MfhC01.smd  (Priestess face/hair, from szMorPikeFaceName[0]
//                               in HoLogin.cpp:71 -> Mfh-C01.inf)
//   - Skeleton:   m5.smb      (Bip01 skeleton + animation keyframes, distinct
//                               from m1/m2/m3/m6/m7/m8 — the Priestess has
//                               its own dedicated motion file)
//   - Anim maps:  M5Bip.inx   (75 motions: STAND, WALK, RUN, ATTACK, SKILL, etc.)
//   - Textures:   resolved from SMD material textureNames (MfbC01, MfhC01/02/03)
//
// The Priestess body ini is mc001.ini (HoLogin.cpp:58, szMorPikeBodyName).
// The Priestess is the third Morion class in the character creation order
// (HoLogin.cpp:858, case 2, JOBCODE_PRIESTESS = 8). The Priestess head models
// come from szMorPikeFaceName[HairCode] in HoLogin.cpp:71. The default
// character-select face is HairCode=0, which resolves to Mfh-C01.inf ->
// MfhC01.ASE -> MfhC01.smd. The 3 hair variants use MfhC01/C02/C03.smd.
//
// MESH FILTERING: The Priestess body SMD (MfbC01.smd) contains only 3 objects
// (matching the mc001.inx model groups). No mesh filter is needed.
//
// MOTION FILE: The Priestess uses m5.smb / M5Bip.inx (75 motions), its own
// dedicated motion file, distinct from all other classes. The Priestess
// head .inf files confirm this by referencing M5bip.in (the motion file).
//
// MORION FEMALE: The Priestess is a Morion female character
// (BROOD_CODE_MORAYION, BROOD_CODE_WOMAN in sinSubMain.cpp). The asset
// prefix is 'Mf' (Morion female) + class letter 'C'.
//
// Generates 3 hair variants:
//   pt_priestess.glb       - MfhC01.smd (hair style 1, default)
//   pt_priestess_hair2.glb - MfhC02.smd (hair style 2)
//   pt_priestess_hair3.glb - MfhC03.smd (hair style 3)
//
// Usage:
//   npx tsx scripts/pt-port/priestess_assembler.ts [magicpt_client_root] [output_dir]

import { buildGlb } from './glb_assembler.ts';

const DEFAULT_CLIENT_ROOT = 'C:\\Users\\jhing\\CascadeProjects\\PT-Project\\MagicPT-Chinese\\client\\';
const DEFAULT_OUTPUT_DIR = 'public/models/creatures/';

const HAIR_VARIANTS = [
  { suffix: '', headSmd: 'MfhC01.smd' },
  { suffix: '_hair2', headSmd: 'MfhC02.smd' },
  { suffix: '_hair3', headSmd: 'MfhC03.smd' },
];

const REVERSED_CLIPS = [
  { sourceState: 'FALLSTAND', exportName: 'FALLSTAND_REVERSED' },
];

async function main() {
  const clientRoot = process.argv[2] || DEFAULT_CLIENT_ROOT;
  const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;
  const charDir = clientRoot + 'char\\tmABCD\\';

  console.log('=== Morion Priestess GLB Assembly ===');
  console.log(`Client root: ${clientRoot}`);
  console.log(`Output dir:  ${outputDir}`);
  console.log('');

  for (const variant of HAIR_VARIANTS) {
    const outputPath = outputDir + 'pt_priestess' + variant.suffix + '.glb';
    console.log(`\n--- Hair variant: ${variant.suffix || 'default'} (${variant.headSmd}) ---`);

    await buildGlb({
      smdPath: charDir + 'MfbC01.smd',
      extraSmdPaths: [charDir + variant.headSmd],
      smbPath: charDir + 'm5.smb',
      inxPath: charDir + 'M5Bip.inx',
      bmpPath: charDir + 'MfbC01.bmp',
      outputPath,
      clientRoot,
      reversedClips: REVERSED_CLIPS,
    });
  }

  console.log('\nPriestess GLB assembly complete (3 hair variants).');
}

main().catch((err) => {
  console.error('Priestess assembly failed:', err);
  process.exit(1);
});
