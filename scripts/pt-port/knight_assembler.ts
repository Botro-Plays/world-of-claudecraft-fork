// Morion Knight GLB assembler entry point.
//
// Assembles the Priston Tale Morion Knight player character from:
//   - Body mesh:  MmbA01.smd  (Knight body; from ma001.ini, the Morion Knight
//                               body ini in HoLogin.cpp:56, szMorMechBodyName)
//   - Head mesh:  MmhA01.smd  (Knight face/hair, from szMorMechFaceName[0]
//                               in HoLogin.cpp:69 -> Mmh-A01.inf)
//   - Skeleton:   m1.smb      (66-bone Bip01 skeleton + animation keyframes,
//                               shared with Fighter/Mechanician/Pikeman)
//   - Anim maps:  M1Bip.inx   (150 motions: STAND, WALK, RUN, ATTACK, SKILL, etc.
//                               shared with Fighter/Mechanician/Pikeman)
//   - Textures:   MmbA01.bmp (body), MmhA01/02/03 (face/hair)
//
// The Knight body ini is ma001.ini (HoLogin.cpp:56, szMorMechBodyName). The
// Knight is the first Morion class in the character creation order
// (HoLogin.cpp:1915, JOBCODE_KNIGHT = 6). The Knight head models come from
// szMorMechFaceName[HairCode] in HoLogin.cpp:69. The default character-select
// face is HairCode=0, which resolves to Mmh-A01.inf -> MmhA01.ASE ->
// MmhA01.smd. The 3 hair variants use MmhA01/A02/A03.smd (HairCode 0, 1, 2),
// all sharing the same face textures but with different hair mesh geometry.
//
// MESH FILTERING: The Knight body SMD (MmbA01.smd) contains 15 mesh objects
// spanning TWO armor tiers: 9 A01-tier objects (MbhA01, MbmA01, MblA01, MahA01,
// MamA01, MalA01, MlhA01, MlmA01, MllA01) and 6 A02-tier objects (MahA02,
// MamA02, MalA02, MlhA02, MlmA02, MllA02). The A02 tier is an upgrade overlay
// with different arms and legs. Including both tiers causes overlapping
// geometry. The meshObjectFilter drops the A02 objects so only the
// default-armor A01 body renders.
//
// MOTION FILE: The Knight shares the same motion file (m1.smb / M1Bip.inx)
// as the Fighter, Mechanician, and Pikeman (all are male classes using the
// Bip01 skeleton). The M1Bip.inx has 150 motions with frame ranges shared
// across these classes. The Knight head .inf files reference M1bip.in (the
// motion file), confirming the shared skeleton.
//
// MORION MALE: The Knight is a Morion male character (BROOD_CODE_MORAYION,
// BROOD_CODE_MAN in playsub.cpp). The asset prefix is 'Mm' (Morion male)
// instead of the Tempskron 'tm' (Tempskron male) or 'tf' (Tempskron female).
//
// Generates 3 hair variants for the Knight's hair selection:
//   pt_knight.glb       - MmhA01.smd (hair style 1, default)
//   pt_knight_hair2.glb - MmhA02.smd (hair style 2)
//   pt_knight_hair3.glb - MmhA03.smd (hair style 3)
//
// Usage:
//   npx tsx scripts/pt-port/knight_assembler.ts [magicpt_client_root] [output_dir]
//
// Defaults:
//   magicpt_client_root = C:\Users\jhing\CascadeProjects\PT-Project\MagicPT-Chinese\client\
//   output_dir          = public/models/creatures/

import { buildGlb } from './glb_assembler.ts';

const DEFAULT_CLIENT_ROOT = 'C:\\Users\\jhing\\CascadeProjects\\PT-Project\\MagicPT-Chinese\\client\\';
const DEFAULT_OUTPUT_DIR = 'public/models/creatures/';

// The 3 hair style head SMDs for the Knight.
// Each is a complete head+hair mesh skinned to Bip01 Head/Spine1.
// Verified distinct from Fighter heads (tmh-B01/B02/B03.smd), Mechanician
// heads (tmh-A01/A02/A03.smd), Pikeman heads (tmh-C01/C02/C03.smd), and
// Archer heads (Tfh-D01/D02/D03.smd) by the Morion male 'Mmh-A' prefix in
// HoLogin.cpp:69 (szMorMechFaceName).
const HAIR_VARIANTS = [
  { suffix: '', headSmd: 'MmhA01.smd' },
  { suffix: '_hair2', headSmd: 'MmhA02.smd' },
  { suffix: '_hair3', headSmd: 'MmhA03.smd' },
];

// Reversed clips: FALLSTAND reversed creates a jump-launch animation (crouch
// down to spring up). The normal FALLSTAND plays forward for the landing
// (stand up from crouched). FALLDOWN is the falling pose.
const REVERSED_CLIPS = [
  { sourceState: 'FALLSTAND', exportName: 'FALLSTAND_REVERSED' },
];

// Mesh filter: only include the A01-tier (default armor) objects from the
// Knight body SMD. The body SMD (MmbA01.smd) contains 15 objects across two
// armor tiers; the A02-tier objects are upgrade overlays that would overlap
// with the A01 default armor if included.
const MESH_OBJECT_FILTER = [
  'MbhA01',  // body high
  'MbmA01',  // body middle
  'MblA01',  // body low
  'MahA01',  // arm high
  'MamA01',  // arm middle
  'MalA01',  // arm low
  'MlhA01',  // leg high
  'MlmA01',  // leg middle
  'MllA01',  // leg low
];

async function main() {
  const clientRoot = process.argv[2] || DEFAULT_CLIENT_ROOT;
  const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;

  const charDir = clientRoot + 'char\\tmABCD\\';

  console.log('=== Morion Knight GLB Assembly ===');
  console.log(`Client root: ${clientRoot}`);
  console.log(`Output dir:  ${outputDir}`);
  console.log('');

  // PT character motion data: m1.smb is the shared motion file (33MB, 66 bones,
  // frames 0-11043) containing ALL animation keyframes for the Bip01 skeleton.
  // The Knight shares this with the Fighter, Mechanician, and Pikeman (all male
  // classes). The Knight uses M1Bip.inx (150 motions) for its animation state ->
  // frame range mappings. The Knight head .inf files confirm this by
  // referencing M1bip.in (the motion file).

  for (const variant of HAIR_VARIANTS) {
    const outputPath = outputDir + 'pt_knight' + variant.suffix + '.glb';
    console.log(`\n--- Hair variant: ${variant.suffix || 'default'} (${variant.headSmd}) ---`);

    await buildGlb({
      smdPath: charDir + 'MmbA01.smd',          // Knight body armor mesh (from ma001.ini)
      extraSmdPaths: [charDir + variant.headSmd], // head/face/hair mesh
      smbPath: charDir + 'm1.smb',              // shared skeleton + animation keyframes
      inxPath: charDir + 'M1Bip.inx',            // shared animation state -> frame range mappings
      bmpPath: charDir + 'MmbA01.bmp',          // primary body texture (unused by buildGlb
                                                //   directly; textures resolve from SMD
                                                //   material textureNames)
      outputPath,
      clientRoot,
      reversedClips: REVERSED_CLIPS,
      meshObjectFilter: MESH_OBJECT_FILTER,
    });
  }

  console.log('\nKnight GLB assembly complete (3 hair variants).');
}

main().catch((err) => {
  console.error('Knight assembly failed:', err);
  process.exit(1);
});
