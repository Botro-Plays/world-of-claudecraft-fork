// Atlanteon Assassin GLB assembler entry point.
//
// Assembles the Priston Tale Assassin player character from:
//   - Body mesh:  TfbE01.smd  (Assassin body; from e001.ini, the Tempskron
//                               "Assassin" body ini in HoLogin.cpp:53,
//                               szTempAssaBodyName)
//   - Head mesh:  TfhE01.smd  (Assassin face/hair, from szTempAssaFaceName[0]
//                               in HoLogin.cpp:66 -> tfh-E01.inf)
//   - Skeleton:   m6.smb      (Bip01 skeleton + animation keyframes, distinct
//                               from m1/m2/m3/m5/m7/m8 — the Assassin has
//                               its own dedicated motion file)
//   - Anim maps:  M6Bip.inx   (88 motions: STAND, WALK, RUN, ATTACK, SKILL, etc.)
//   - Textures:   resolved from SMD material textureNames (TfbE01, TfhE01/02/03)
//
// The Assassin body ini is e001.ini (HoLogin.cpp:53, szTempAssaBodyName).
// The Assassin is the fifth Tempskron class in the character creation order
// (HoLogin.cpp:827, case 4, JOBCODE_ASSASSIN = 9). In the Botro fork, the
// Assassin is reassigned to the Atlanteon tribe. The Assassin head models
// come from szTempAssaFaceName[HairCode] in HoLogin.cpp:66. The default
// character-select face is HairCode=0, which resolves to tfh-E01.inf ->
// TfhE01.ASE -> TfhE01.smd. The 3 hair variants use TfhE01/E02/E03.smd.
//
// MESH FILTERING: The Assassin body SMD (TfbE01.smd) contains only 3 objects
// (Tbhe01, Tlhe01, Tahe01), all from the E01 default tier. No mesh filter
// is needed.
//
// MOTION FILE: The Assassin uses m6.smb / M6Bip.inx (88 motions), its own
// dedicated motion file, distinct from all other classes. The Assassin head
// .inf files confirm this by referencing M6bip.in (the motion file).
//
// TEMPSKRON FEMALE: The Assassin is a Tempskron female character in the
// MagicPT source (BROOD_CODE_TEMPSKRON, BROOD_CODE_WOMAN in sinSubMain.cpp).
// The asset prefix is 'Tf' (Tempskron female) + class letter 'E'. In the
// Botro fork, the tribe is Atlanteon.
//
// Generates 3 hair variants:
//   pt_assassin.glb       - TfhE01.smd (hair style 1, default)
//   pt_assassin_hair2.glb - TfhE02.smd (hair style 2)
//   pt_assassin_hair3.glb - TfhE03.smd (hair style 3)
//
// Usage:
//   npx tsx scripts/pt-port/assassin_assembler.ts [magicpt_client_root] [output_dir]

import { buildGlb } from './glb_assembler.ts';

const DEFAULT_CLIENT_ROOT = 'C:\\Users\\jhing\\CascadeProjects\\PT-Project\\MagicPT-Chinese\\client\\';
const DEFAULT_OUTPUT_DIR = 'public/models/creatures/';

const HAIR_VARIANTS = [
  { suffix: '', headSmd: 'TfhE01.smd' },
  { suffix: '_hair2', headSmd: 'TfhE02.smd' },
  { suffix: '_hair3', headSmd: 'TfhE03.smd' },
];

const REVERSED_CLIPS = [
  { sourceState: 'FALLSTAND', exportName: 'FALLSTAND_REVERSED' },
];

async function main() {
  const clientRoot = process.argv[2] || DEFAULT_CLIENT_ROOT;
  const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;
  const charDir = clientRoot + 'char\\tmABCD\\';

  console.log('=== Atlanteon Assassin GLB Assembly ===');
  console.log(`Client root: ${clientRoot}`);
  console.log(`Output dir:  ${outputDir}`);
  console.log('');

  for (const variant of HAIR_VARIANTS) {
    const outputPath = outputDir + 'pt_assassin' + variant.suffix + '.glb';
    console.log(`\n--- Hair variant: ${variant.suffix || 'default'} (${variant.headSmd}) ---`);

    await buildGlb({
      smdPath: charDir + 'TfbE01.smd',
      extraSmdPaths: [charDir + variant.headSmd],
      smbPath: charDir + 'm6.smb',
      inxPath: charDir + 'M6Bip.inx',
      outputPath,
      clientRoot,
      reversedClips: REVERSED_CLIPS,
    });
  }

  console.log('\nAssassin GLB assembly complete (3 hair variants).');
}

main().catch((err) => {
  console.error('Assassin assembly failed:', err);
  process.exit(1);
});
