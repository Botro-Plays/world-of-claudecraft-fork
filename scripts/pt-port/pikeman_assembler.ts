// Tempskron Pikeman GLB assembler entry point.
//
// Assembles the Priston Tale Tempskron Pikeman player character from:
//   - Body mesh:  tmbC01.smd   (Pikeman body; from c001.ini, the Pikeman
//                                body ini in HoLogin.cpp:52)
//   - Head mesh:  tmh-C01.smd  (Pikeman face/hair, from szTempPikeFaceName[0]
//                                in HoLogin.cpp:64 -> tmh-c01.inf)
//   - Skeleton:   m4.smb       (Pikeman-specific motion file, 66-bone Bip01
//                               skeleton + animation keyframes. The Pikeman
//                               uses M4Bip.inx / m4.smb, NOT the Fighter's
//                               M1Bip.inx / m1.smb.)
//   - Anim maps:  M4Bip.inx    (102 motions: STAND, WALK, RUN, ATTACK, SKILL, etc.
//                               Pikeman-specific frame ranges.)
//   - Textures:   TmbC01.bmp (body), TmhC01/02/03 (face/hair)
//
// The Pikeman body ini is c001.ini (HoLogin.cpp:52, szTempPikeBodyName).
// The Pikeman head models come from szTempPikeFaceName[HairCode] in
// HoLogin.cpp:64. The default character-select face is HairCode=0, which
// resolves to tmh-c01.inf -> tmh-C01.ASE -> tmh-C01.smd. The 3 hair
// variants use tmh-C01/C02/C03.smd (HairCode 0, 1, 2), all sharing the
// same face textures but with different hair mesh geometry.
//
// MESH FILTERING: The Pikeman body SMD (TmbC01.smd) contains 9 mesh objects
// spanning TWO armor tiers: 6 C01-tier objects (TbhC01, TahC01, TbmC01,
// TamC01, TblC01, TalC01) and 3 C03-tier objects (TbhC03, TbmC03, TblC03).
// The C001.inx model groups name only the 6 C01 objects. Including the
// C03 objects causes both tiers to overlap, producing a visible hole in
// the chest and stomach. The meshObjectFilter drops the C03 objects so
// only the default-armor C01 body renders.
//
// MOTION FILE: The Pikeman uses its own motion file (m4.smb / M4Bip.inx),
// not the Fighter's (m1.smb / M1Bip.inx). The M4Bip.inx has 102 motions
// with Pikeman-specific frame ranges. Using the Fighter's motion data
// would apply wrong frame ranges to the Pikeman skeleton.
//
// Generates 3 hair variants for the Pikeman's hair selection:
//   pt_pikeman.glb       - tmh-C01.smd (hair style 1, default)
//   pt_pikeman_hair2.glb - tmh-C02.smd (hair style 2)
//   pt_pikeman_hair3.glb - tmh-C03.smd (hair style 3)
//
// Usage:
//   npx tsx scripts/pt-port/pikeman_assembler.ts [magicpt_client_root] [output_dir]
//
// Defaults:
//   magicpt_client_root = C:\Users\jhing\CascadeProjects\PT-Project\MagicPT-Chinese\client\
//   output_dir          = public/models/creatures/

import { readFileSync } from 'node:fs';
import { buildGlb } from './glb_assembler.ts';
import { parseInx } from './inx_parser.ts';

const DEFAULT_CLIENT_ROOT = 'C:\\Users\\jhing\\CascadeProjects\\PT-Project\\MagicPT-Chinese\\client\\';
const DEFAULT_OUTPUT_DIR = 'public/models/creatures/';

// The 3 hair style head SMDs for the Pikeman.
// Each is a complete head+hair mesh skinned to Bip01 Head/Spine1.
// Verified distinct from Fighter heads (tmh-B01/B02/B03.smd) and Mechanician
// heads (tmh-A01/A02/A03.smd) by the C-series hair code in HoLogin.cpp:64.
const HAIR_VARIANTS = [
  { suffix: '', headSmd: 'tmh-C01.smd' },
  { suffix: '_hair2', headSmd: 'tmh-C02.smd' },
  { suffix: '_hair3', headSmd: 'tmh-C03.smd' },
];

// Reversed clips: FALLSTAND reversed creates a jump-launch animation (crouch
// down to spring up). The normal FALLSTAND plays forward for the landing
// (stand up from crouched). FALLDOWN is the falling pose.
const REVERSED_CLIPS = [
  { sourceState: 'FALLSTAND', exportName: 'FALLSTAND_REVERSED' },
];

async function main() {
  const clientRoot = process.argv[2] || DEFAULT_CLIENT_ROOT;
  const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;

  const charDir = clientRoot + 'char\\tmABCD\\';

  console.log('=== Tempskron Pikeman GLB Assembly ===');
  console.log(`Client root: ${clientRoot}`);
  console.log(`Output dir:  ${outputDir}`);
  console.log('');

  // Read the Pikeman's INX (M4Bip.inx) to extract the model groups. The INX
  // lists the body part object names that should render for this armor tier.
  // The Pikeman body SMD contains objects from multiple armor tiers; only
  // the objects named in the model groups should be included.
  const inxBuf = readFileSync(charDir + 'M4Bip.inx');
  const inxInfo = parseInx(inxBuf);
  const meshObjectFilter = [
    ...inxInfo.highModel.names,
    ...inxInfo.defaultModel.names,
    ...inxInfo.lowModel.names,
  ];
  console.log(`Mesh filter (from M4Bip.inx model groups): ${meshObjectFilter.join(', ')}`);

  // PT character motion data: m4.smb is the Pikeman's own motion file (13.7MB,
  // 66 bones) containing the Pikeman's animation keyframes. The Pikeman uses
  // M4Bip.inx (102 motions) for its animation state -> frame range mappings.
  // This is distinct from the Fighter (m1.smb / M1Bip.inx, 160 motions) and
  // Mechanician (m2.smb / M2Bip.inx). All Tempskron classes share the Bip01
  // skeleton hierarchy, but each has its own motion file with class-specific
  // frame ranges and skill animations.

  for (const variant of HAIR_VARIANTS) {
    const outputPath = outputDir + 'pt_pikeman' + variant.suffix + '.glb';
    console.log(`\n--- Hair variant: ${variant.suffix || 'default'} (${variant.headSmd}) ---`);

    await buildGlb({
      smdPath: charDir + 'tmbC01.smd',         // Pikeman body armor mesh (from c001.ini)
      extraSmdPaths: [charDir + variant.headSmd], // head/face/hair mesh
      smbPath: charDir + 'm4.smb',             // Pikeman skeleton + animation keyframes
      inxPath: charDir + 'M4Bip.inx',           // Pikeman animation state -> frame range mappings
      bmpPath: charDir + 'TmbC01.bmp',          // primary body texture (unused by buildGlb
                                                //   directly; textures resolve from SMD
                                                //   material textureNames)
      outputPath,
      clientRoot,
      reversedClips: REVERSED_CLIPS,
      meshObjectFilter,
    });
  }

  console.log('\nPikeman GLB assembly complete (3 hair variants).');
}

main().catch((err) => {
  console.error('Pikeman assembly failed:', err);
  process.exit(1);
});
