// Morion Atalanta GLB assembler entry point.
//
// Assembles the Priston Tale Morion Atalanta player character from:
//   - Body mesh:  MfbB01.smd  (Atalanta body; from mb001.ini, the Morion
//                               "Fighter" body ini in HoLogin.cpp:57,
//                               szMorFighterBodyName, used for the Atalanta
//                               at character creation case 1)
//   - Head mesh:  MfhB01.smd  (Atalanta face/hair, from szMorFighterFaceName[0]
//                               in HoLogin.cpp:70 -> Mfh-B01.inf)
//   - Skeleton:   m2.smb      (67-bone Bip01 skeleton + animation keyframes,
//                               shared with the Archer. The Atalanta uses
//                               M2Bip.inx / m2.smb, NOT the Knight's
//                               M1Bip.inx / m1.smb.)
//   - Anim maps:  M2Bip.inx   (108 motions: STAND, WALK, RUN, ATTACK, SKILL, etc.
//                               shared with the Archer, distinct from the
//                               male m1.smb / M1Bip.inx set.)
//   - Textures:   resolved from SMD material textureNames (MfbB01, MfhB01/02/03)
//
// The Atalanta body ini is mb001.ini (HoLogin.cpp:57, szMorFighterBodyName).
// The Atalanta is the second Morion class in the character creation order
// (HoLogin.cpp:855, case 1, JOBCODE_ATALANTA = 5). The Atalanta head models
// come from szMorFighterFaceName[HairCode] in HoLogin.cpp:70. The default
// character-select face is HairCode=0, which resolves to Mfh-B01.inf ->
// MfhB01.ASE -> MfhB01.smd. The 3 hair variants use MfhB01/B02/B03.smd
// (HairCode 0, 1, 2), all sharing the same face textures but with different
// hair mesh geometry.
//
// MESH FILTERING: The Atalanta body SMD (MfbB01.smd) contains only 3 objects
// (MBHB01, MBMB01, MBLB01), exactly matching the mB001.inx model groups.
// No mesh filter is needed (unlike the Knight, whose body SMD contained
// multiple armor tiers).
//
// MOTION FILE: The Atalanta uses the same motion file (m2.smb / M2Bip.inx)
// as the Archer. Both are female classes using the female Bip01 skeleton
// (67 bones, distinct from the male m1.smb's 66 bones). The M2Bip.inx has
// 108 motions with frame ranges shared with the Archer. The Atalanta head
// .inf files confirm this by referencing M2bip.in (the motion file).
// Using the male m1.smb would apply wrong frame ranges and bone counts.
//
// MORION FEMALE: The Atalanta is a Morion female character
// (BROOD_CODE_MORAYION, BROOD_CODE_WOMAN in sinSubMain.cpp). The asset
// prefix is 'Mf' (Morion female) instead of the Morion male 'Mm' (Knight)
// or the Tempskron 'tf' (Tempskron female, Archer).
//
// Generates 3 hair variants for the Atalanta's hair selection:
//   pt_atalanta.glb       - MfhB01.smd (hair style 1, default)
//   pt_atalanta_hair2.glb - MfhB02.smd (hair style 2)
//   pt_atalanta_hair3.glb - MfhB03.smd (hair style 3)
//
// Usage:
//   npx tsx scripts/pt-port/atalanta_assembler.ts [magicpt_client_root] [output_dir]
//
// Defaults:
//   magicpt_client_root = C:\Users\jhing\CascadeProjects\PT-Project\MagicPT-Chinese\client\
//   output_dir          = public/models/creatures/

import { buildGlb } from './glb_assembler.ts';

const DEFAULT_CLIENT_ROOT = 'C:\\Users\\jhing\\CascadeProjects\\PT-Project\\MagicPT-Chinese\\client\\';
const DEFAULT_OUTPUT_DIR = 'public/models/creatures/';

// The 3 hair style head SMDs for the Atalanta.
// Each is a complete head+hair mesh skinned to Bip01 Head/Spine1.
// Verified distinct from Knight heads (MmhA01/A02/A03.smd, Morion male),
// Archer heads (Tfh-D01/D02/D03.smd, Tempskron female), and Fighter heads
// (tmh-B01/B02/B03.smd, Tempskron male) by the Morion female 'MfhB' prefix
// in HoLogin.cpp:70 (szMorFighterFaceName).
const HAIR_VARIANTS = [
  { suffix: '', headSmd: 'MfhB01.smd' },
  { suffix: '_hair2', headSmd: 'MfhB02.smd' },
  { suffix: '_hair3', headSmd: 'MfhB03.smd' },
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

  console.log('=== Morion Atalanta GLB Assembly ===');
  console.log(`Client root: ${clientRoot}`);
  console.log(`Output dir:  ${outputDir}`);
  console.log('');

  // PT character motion data: m2.smb is the shared female motion file (14.4MB,
  // 67 bones) containing the animation keyframes for the female Bip01
  // skeleton. The Atalanta shares this with the Archer (both female classes).
  // The Atalanta uses M2Bip.inx (108 motions) for its animation state ->
  // frame range mappings. This is distinct from the Knight (m1.smb /
  // M1Bip.inx, 150 motions, 66 bones, male skeleton). All Morion classes
  // share the Bip01 skeleton hierarchy, but male and female classes use
  // different motion files with sex-specific frame ranges and bone counts.

  for (const variant of HAIR_VARIANTS) {
    const outputPath = outputDir + 'pt_atalanta' + variant.suffix + '.glb';
    console.log(`\n--- Hair variant: ${variant.suffix || 'default'} (${variant.headSmd}) ---`);

    await buildGlb({
      smdPath: charDir + 'MfbB01.smd',          // Atalanta body armor mesh (from mb001.ini)
      extraSmdPaths: [charDir + variant.headSmd], // head/face/hair mesh
      smbPath: charDir + 'm2.smb',              // shared female skeleton + animation keyframes
      inxPath: charDir + 'M2Bip.inx',            // shared female animation state -> frame range mappings
      bmpPath: charDir + 'MfbB01.bmp',          // primary body texture (unused by buildGlb
                                                //   directly; textures resolve from SMD
                                                //   material textureNames)
      outputPath,
      clientRoot,
      reversedClips: REVERSED_CLIPS,
    });
  }

  console.log('\nAtalanta GLB assembly complete (3 hair variants).');
}

main().catch((err) => {
  console.error('Atalanta assembly failed:', err);
  process.exit(1);
});
