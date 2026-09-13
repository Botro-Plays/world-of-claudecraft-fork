// Atlanteon Martial Artist GLB assembler entry point.
//
// Assembles the Priston Tale Martial Artist player character from:
//   - Body mesh:  TfbF01.smd  (Martial Artist body; from f001.ini, the
//                               Tempskron "Martial" body ini in
//                               HoLogin.cpp:54, szTempMartialBodyName)
//   - Head mesh:  TfhF01.smd  (Martial Artist face/hair, from
//                               szTempMartialFaceName[0] in HoLogin.cpp:67
//                               -> tfh-F01.inf)
//   - Skeleton:   m8.smb      (Bip01 skeleton + animation keyframes, distinct
//                               from m1/m2/m3/m5/m6/m7 — the Martial Artist
//                               has its own dedicated motion file)
//   - Anim maps:  M8Bip.inx   (91 motions: STAND, WALK, RUN, ATTACK, SKILL, etc.)
//   - Textures:   resolved from SMD material textureNames (TfbF01, TfhF01/02/03)
//
// The Martial Artist body ini is f001.ini (HoLogin.cpp:54,
// szTempMartialBodyName). The Martial Artist is the sixth and final Tempskron
// class in the character creation order (HoLogin.cpp:832, case 5,
// JOBCODE_MARTIALARTIST = 11). In the Botro fork, the Martial Artist is
// reassigned to the Atlanteon tribe. The Martial Artist head models come
// from szTempMartialFaceName[HairCode] in HoLogin.cpp:67. The default
// character-select face is HairCode=0, which resolves to tfh-F01.inf ->
// TfhF01.ASE -> TfhF01.smd. The 3 hair variants use TfhF01/F02/F03.smd.
//
// MESH FILTERING: The Martial Artist body SMD (TfbF01.smd) contains only 1
// object (TfbF01), the simplest body structure of any PT class. No mesh
// filter is needed.
//
// MOTION FILE: The Martial Artist uses m8.smb / M8Bip.inx (91 motions), its
// own dedicated motion file, distinct from all other classes. The Martial
// Artist head .inf files confirm this by referencing M8bip.in (the motion
// file).
//
// TEMPSKRON FEMALE: The Martial Artist is a Tempskron female character in
// the MagicPT source (BROOD_CODE_TEMPSKRON, BROOD_CODE_WOMAN in
// sinSubMain.cpp). The asset prefix is 'Tf' (Tempskron female) + class
// letter 'F'. In the Botro fork, the tribe is Atlanteon.
//
// Generates 3 hair variants:
//   pt_martial_artist.glb       - TfhF01.smd (hair style 1, default)
//   pt_martial_artist_hair2.glb - TfhF02.smd (hair style 2)
//   pt_martial_artist_hair3.glb - TfhF03.smd (hair style 3)
//
// Usage:
//   npx tsx scripts/pt-port/martial_artist_assembler.ts [magicpt_client_root] [output_dir]

import { buildGlb } from './glb_assembler.ts';

const DEFAULT_CLIENT_ROOT = 'C:\\Users\\jhing\\CascadeProjects\\PT-Project\\MagicPT-Chinese\\client\\';
const DEFAULT_OUTPUT_DIR = 'public/models/creatures/';

const HAIR_VARIANTS = [
  { suffix: '', headSmd: 'TfhF01.smd' },
  { suffix: '_hair2', headSmd: 'TfhF02.smd' },
  { suffix: '_hair3', headSmd: 'TfhF03.smd' },
];

const REVERSED_CLIPS = [
  { sourceState: 'FALLSTAND', exportName: 'FALLSTAND_REVERSED' },
];

async function main() {
  const clientRoot = process.argv[2] || DEFAULT_CLIENT_ROOT;
  const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;
  const charDir = clientRoot + 'char\\tmABCD\\';

  console.log('=== Atlanteon Martial Artist GLB Assembly ===');
  console.log(`Client root: ${clientRoot}`);
  console.log(`Output dir:  ${outputDir}`);
  console.log('');

  for (const variant of HAIR_VARIANTS) {
    const outputPath = outputDir + 'pt_martial_artist' + variant.suffix + '.glb';
    console.log(`\n--- Hair variant: ${variant.suffix || 'default'} (${variant.headSmd}) ---`);

    await buildGlb({
      smdPath: charDir + 'TfbF01.smd',
      extraSmdPaths: [charDir + variant.headSmd],
      smbPath: charDir + 'm8.smb',
      inxPath: charDir + 'M8Bip.inx',
      outputPath,
      clientRoot,
      reversedClips: REVERSED_CLIPS,
    });
  }

  console.log('\nMartial Artist GLB assembly complete (3 hair variants).');
}

main().catch((err) => {
  console.error('Martial Artist assembly failed:', err);
  process.exit(1);
});
