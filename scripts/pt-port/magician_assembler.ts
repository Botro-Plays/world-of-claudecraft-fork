// Morion Magician GLB assembler entry point.
//
// Assembles the Priston Tale Morion Magician player character from:
//   - Body mesh:  MmbD01.smd  (Magician body; from md001.ini, the Morion
//                               "Archer" body ini in HoLogin.cpp:59,
//                               szMorArcherBodyName, used for the Magician
//                               at character creation case 3)
//   - Head mesh:  MmhD01.smd  (Magician face/hair, from szMorArcherFaceName[0]
//                               in HoLogin.cpp:72 -> Mmh-D01.inf)
//   - Skeleton:   m3.smb      (Bip01 skeleton + animation keyframes, distinct
//                               from m1/m2/m5/m6/m7/m8 — the Magician has
//                               its own dedicated motion file)
//   - Anim maps:  M3Bip.inx   (75 motions: STAND, WALK, RUN, ATTACK, SKILL, etc.)
//   - Textures:   resolved from SMD material textureNames (MmbD01, MmhD01/02/03)
//
// The Magician body ini is md001.ini (HoLogin.cpp:59, szMorArcherBodyName).
// The Magician is the fourth Morion class in the character creation order
// (HoLogin.cpp:863, case 3, JOBCODE_MAGICIAN = 7). The Magician head models
// come from szMorArcherFaceName[HairCode] in HoLogin.cpp:72. The default
// character-select face is HairCode=0, which resolves to Mmh-D01.inf ->
// MmhD01.ASE -> MmhD01.smd. The 3 hair variants use MmhD01/D02/D03.smd.
//
// MESH FILTERING: The Magician body SMD (MmbD01.smd) contains 15 objects
// spanning TWO armor tiers: 9 D01-tier objects (default armor) and 6 D03-tier
// objects (upgrade overlay). The meshObjectFilter drops the D03 objects so
// only the default-armor D01 body renders. This is the same pattern as the
// Knight (which filters A02-tier objects from MmbA01.smd).
//
// MOTION FILE: The Magician uses m3.smb / M3Bip.inx (75 motions), its own
// dedicated motion file, distinct from all other classes. The Magician head
// .inf files confirm this by referencing M3bip.in (the motion file).
//
// MORION MALE: The Magician is a Morion male character
// (BROOD_CODE_MORAYION, BROOD_CODE_MAN in sinSubMain.cpp). The asset
// prefix is 'Mm' (Morion male) + class letter 'D'.
//
// Generates 3 hair variants:
//   pt_magician.glb       - MmhD01.smd (hair style 1, default)
//   pt_magician_hair2.glb - MmhD02.smd (hair style 2)
//   pt_magician_hair3.glb - MmhD03.smd (hair style 3)
//
// Usage:
//   npx tsx scripts/pt-port/magician_assembler.ts [magicpt_client_root] [output_dir]

import { buildGlb } from './glb_assembler.ts';

const DEFAULT_CLIENT_ROOT = 'C:\\Users\\jhing\\CascadeProjects\\PT-Project\\MagicPT-Chinese\\client\\';
const DEFAULT_OUTPUT_DIR = 'public/models/creatures/';

const HAIR_VARIANTS = [
  { suffix: '', headSmd: 'MmhD01.smd' },
  { suffix: '_hair2', headSmd: 'MmhD02.smd' },
  { suffix: '_hair3', headSmd: 'MmhD03.smd' },
];

const REVERSED_CLIPS = [
  { sourceState: 'FALLSTAND', exportName: 'FALLSTAND_REVERSED' },
];

// Mesh filter: only include the D01-tier (default armor) objects from the
// Magician body SMD. The body SMD (MmbD01.smd) contains 15 objects across two
// armor tiers; the D03-tier objects are upgrade overlays that would overlap
// with the D01 default armor if included.
const MESH_OBJECT_FILTER = [
  'MbhD01',  // body high
  'MbmD01',  // body middle
  'MblD01',  // body low
  'MahD01',  // arm high
  'MamD01',  // arm middle
  'MalD01',  // arm low
  'MlhD01',  // leg high
  'MlmD01',  // leg middle
  'MllD01',  // leg low
];

async function main() {
  const clientRoot = process.argv[2] || DEFAULT_CLIENT_ROOT;
  const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;
  const charDir = clientRoot + 'char\\tmABCD\\';

  console.log('=== Morion Magician GLB Assembly ===');
  console.log(`Client root: ${clientRoot}`);
  console.log(`Output dir:  ${outputDir}`);
  console.log('');

  for (const variant of HAIR_VARIANTS) {
    const outputPath = outputDir + 'pt_magician' + variant.suffix + '.glb';
    console.log(`\n--- Hair variant: ${variant.suffix || 'default'} (${variant.headSmd}) ---`);

    await buildGlb({
      smdPath: charDir + 'MmbD01.smd',
      extraSmdPaths: [charDir + variant.headSmd],
      smbPath: charDir + 'm3.smb',
      inxPath: charDir + 'M3Bip.inx',
      bmpPath: charDir + 'MmbD01.BMP',
      outputPath,
      clientRoot,
      reversedClips: REVERSED_CLIPS,
      meshObjectFilter: MESH_OBJECT_FILTER,
    });
  }

  console.log('\nMagician GLB assembly complete (3 hair variants).');
}

main().catch((err) => {
  console.error('Magician assembly failed:', err);
  process.exit(1);
});
