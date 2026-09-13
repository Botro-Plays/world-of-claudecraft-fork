// Atlanteon Shaman GLB assembler entry point.
//
// Assembles the Priston Tale Shaman player character from:
//   - Body mesh:  MmbE01.smd  (Shaman body; from me001.ini, the Morion
//                               "Assassin" body ini in HoLogin.cpp:60,
//                               szMorAssaBodyName, used for the Shaman
//                               at character creation case 4)
//   - Head mesh:  MmhE01.smd  (Shaman face/hair, from szMorAssaFaceName[0]
//                               in HoLogin.cpp:73 -> Mmh-E01.inf)
//   - Skeleton:   m7.smb      (Bip01 skeleton + animation keyframes, distinct
//                               from m1/m2/m3/m5/m6/m8 — the Shaman has
//                               its own dedicated motion file)
//   - Anim maps:  M7Bip.inx   (82 motions: STAND, WALK, RUN, ATTACK, SKILL, etc.)
//   - Textures:   resolved from SMD material textureNames (MmbE01, MmhE01/02/03)
//
// The Shaman body ini is me001.ini (HoLogin.cpp:60, szMorAssaBodyName).
// The Shaman is the fifth Morion class in the character creation order
// (HoLogin.cpp:868, case 4, JOBCODE_SHAMAN = 10). In the Botro fork, the
// Shaman is reassigned to the Atlanteon tribe. The Shaman head models come
// from szMorAssaFaceName[HairCode] in HoLogin.cpp:73. The default
// character-select face is HairCode=0, which resolves to Mmh-E01.inf ->
// MmhE01.ASE -> MmhE01.smd. The 3 hair variants use MmhE01/E02/E03.smd.
//
// MESH FILTERING: The Shaman body SMD (MmbE01.smd) contains 4 objects
// (Mahe01, Mbhe01, Mlhe01, Mshe01), all from the E01 default tier. No mesh
// filter is needed.
//
// MOTION FILE: The Shaman uses m7.smb / M7Bip.inx (82 motions), its own
// dedicated motion file, distinct from all other classes. The Shaman head
// .inf files confirm this by referencing M7bip.in (the motion file).
//
// MORION MALE: The Shaman is a Morion male character in the MagicPT source
// (BROOD_CODE_MORAYION, BROOD_CODE_MAN in sinSubMain.cpp). The asset
// prefix is 'Mm' (Morion male) + class letter 'E'. In the Botro fork, the
// tribe is Atlanteon.
//
// Generates 3 hair variants:
//   pt_shaman.glb       - MmhE01.smd (hair style 1, default)
//   pt_shaman_hair2.glb - MmhE02.smd (hair style 2)
//   pt_shaman_hair3.glb - MmhE03.smd (hair style 3)
//
// Usage:
//   npx tsx scripts/pt-port/shaman_assembler.ts [magicpt_client_root] [output_dir]

import { buildGlb } from './glb_assembler.ts';

const DEFAULT_CLIENT_ROOT = 'C:\\Users\\jhing\\CascadeProjects\\PT-Project\\MagicPT-Chinese\\client\\';
const DEFAULT_OUTPUT_DIR = 'public/models/creatures/';

const HAIR_VARIANTS = [
  { suffix: '', headSmd: 'MmhE01.smd' },
  { suffix: '_hair2', headSmd: 'MmhE02.smd' },
  { suffix: '_hair3', headSmd: 'MmhE03.smd' },
];

const REVERSED_CLIPS = [
  { sourceState: 'FALLSTAND', exportName: 'FALLSTAND_REVERSED' },
];

async function main() {
  const clientRoot = process.argv[2] || DEFAULT_CLIENT_ROOT;
  const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;
  const charDir = clientRoot + 'char\\tmABCD\\';

  console.log('=== Atlanteon Shaman GLB Assembly ===');
  console.log(`Client root: ${clientRoot}`);
  console.log(`Output dir:  ${outputDir}`);
  console.log('');

  for (const variant of HAIR_VARIANTS) {
    const outputPath = outputDir + 'pt_shaman' + variant.suffix + '.glb';
    console.log(`\n--- Hair variant: ${variant.suffix || 'default'} (${variant.headSmd}) ---`);

    await buildGlb({
      smdPath: charDir + 'MmbE01.smd',
      extraSmdPaths: [charDir + variant.headSmd],
      smbPath: charDir + 'm7.smb',
      inxPath: charDir + 'M7Bip.inx',
      outputPath,
      clientRoot,
      reversedClips: REVERSED_CLIPS,
    });
  }

  console.log('\nShaman GLB assembly complete (3 hair variants).');
}

main().catch((err) => {
  console.error('Shaman assembly failed:', err);
  process.exit(1);
});
