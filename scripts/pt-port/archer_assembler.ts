// Tempskron Archer GLB assembler entry point.
//
// Assembles the Priston Tale Tempskron Archer player character from:
//   - Body mesh:  tfbD01.smd   (Archer body; from d001.ini, the Archer
//                                body ini in HoLogin.cpp:51)
//   - Head mesh:  Tfh-D01.smd  (Archer face/hair, from szTempArcherFaceName[0]
//                                in HoLogin.cpp:65 -> tfh-D01.inf)
//   - Skeleton:   m2.smb       (Archer-specific motion file, 67-bone Bip01
//                               skeleton + animation keyframes. The Archer
//                               uses M2Bip.inx / m2.smb, NOT the Fighter's
//                               M1Bip.inx / m1.smb.)
//   - Anim maps:  M2Bip.inx    (108 motions: STAND, WALK, RUN, ATTACK, SKILL, etc.
//                               Archer-specific frame ranges.)
//   - Textures:   TfbD01.bmp (body), TfhD01/02/03 (face/hair, TGA)
//
// The Archer body ini is d001.ini (HoLogin.cpp:51, szTempArcherBodyName).
// The Archer head models come from szTempArcherFaceName[HairCode] in
// HoLogin.cpp:65. The default character-select face is HairCode=0, which
// resolves to tfh-D01.inf -> tfh-D01.ASE -> Tfh-D01.smd. The 3 hair
// variants use Tfh-D01/D02/D03.smd (HairCode 0, 1, 2), all sharing the
// same face textures but with different hair mesh geometry.
//
// MESH FILTERING: The Archer body SMD (tfbD01.smd) contains only 3 objects
// (TBHD01, TBMD01, TBLD01), exactly matching the D001.inx model groups.
// No mesh filter is needed (unlike the Pikeman, whose body SMD contained
// multiple armor tiers).
//
// MOTION FILE: The Archer uses its own motion file (m2.smb / M2Bip.inx),
// not the Fighter's (m1.smb / M1Bip.inx). The M2Bip.inx has 108 motions
// with Archer-specific frame ranges. The Archer skeleton has 67 bones
// (distinct from Fighter's 66 and Pikeman's 58), including hair bones
// (Bip-hair01-15), bow bones (Bip in01-04, in-cro, in-bow), and tail bones
// (Bip01 Tailba1-6). Using the Fighter's motion data would apply wrong
// frame ranges to the Archer skeleton.
//
// FEMALE CHARACTER: The Archer is female (BROOD_CODE_WOMAN, GetSex returns
// 2 in sinSubMain.cpp:4087-4092). The asset prefix is 'tf' (Tempskron Female)
// instead of the male 'tm' prefix used by Fighter/Mechanician/Pikeman.
//
// Generates 3 hair variants for the Archer's hair selection:
//   pt_archer.glb       - Tfh-D01.smd (hair style 1, default)
//   pt_archer_hair2.glb - Tfh-D02.smd (hair style 2)
//   pt_archer_hair3.glb - Tfh-D03.smd (hair style 3)
//
// Usage:
//   npx tsx scripts/pt-port/archer_assembler.ts [magicpt_client_root] [output_dir]
//
// Defaults:
//   magicpt_client_root = C:\Users\jhing\CascadeProjects\PT-Project\MagicPT-Chinese\client\
//   output_dir          = public/models/creatures/

import { buildGlb } from './glb_assembler.ts';

const DEFAULT_CLIENT_ROOT = 'C:\\Users\\jhing\\CascadeProjects\\PT-Project\\MagicPT-Chinese\\client\\';
const DEFAULT_OUTPUT_DIR = 'public/models/creatures/';

// The 3 hair style head SMDs for the Archer.
// Each is a complete head+hair mesh skinned to Bip01 Head/Spine1.
// Verified distinct from Fighter heads (tmh-B01/B02/B03.smd), Mechanician
// heads (tmh-A01/A02/A03.smd), and Pikeman heads (tmh-C01/C02/C03.smd) by
// the D-series hair code in HoLogin.cpp:65.
const HAIR_VARIANTS = [
  { suffix: '', headSmd: 'Tfh-D01.smd' },
  { suffix: '_hair2', headSmd: 'Tfh-D02.smd' },
  { suffix: '_hair3', headSmd: 'Tfh-D03.smd' },
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

  console.log('=== Tempskron Archer GLB Assembly ===');
  console.log(`Client root: ${clientRoot}`);
  console.log(`Output dir:  ${outputDir}`);
  console.log('');

  // PT character motion data: m2.smb is the Archer's own motion file (14.4MB,
  // 67 bones) containing the Archer's animation keyframes. The Archer uses
  // M2Bip.inx (108 motions) for its animation state -> frame range mappings.
  // This is distinct from the Fighter (m1.smb / M1Bip.inx, 150 motions, 66
  // bones) and Pikeman (m4.smb / M4Bip.inx, 102 motions, 58 bones). All
  // Tempskron classes share the Bip01 skeleton hierarchy, but each has its
  // own motion file with class-specific frame ranges and skill animations.
  // The Archer skeleton includes female-specific hair bones (Bip-hair01-15),
  // bow weapon bones (Bip in01-04, in-cro, in-bow), and tail bones.

  for (const variant of HAIR_VARIANTS) {
    const outputPath = outputDir + 'pt_archer' + variant.suffix + '.glb';
    console.log(`\n--- Hair variant: ${variant.suffix || 'default'} (${variant.headSmd}) ---`);

    await buildGlb({
      smdPath: charDir + 'tfbD01.smd',         // Archer body armor mesh (from d001.ini)
      extraSmdPaths: [charDir + variant.headSmd], // head/face/hair mesh
      smbPath: charDir + 'm2.smb',             // Archer skeleton + animation keyframes
      inxPath: charDir + 'M2Bip.inx',           // Archer animation state -> frame range mappings
      bmpPath: charDir + 'TfbD01.bmp',          // primary body texture (unused by buildGlb
                                                //   directly; textures resolve from SMD
                                                //   material textureNames)
      outputPath,
      clientRoot,
      reversedClips: REVERSED_CLIPS,
    });
  }

  console.log('\nArcher GLB assembly complete (3 hair variants).');
}

main().catch((err) => {
  console.error('Archer assembly failed:', err);
  process.exit(1);
});
