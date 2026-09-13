// Tempskron Mechanician GLB assembler entry point.
//
// Assembles the Priston Tale Tempskron Mechanician player character from:
//   - Body mesh:  tmbA01.smd   (Mechanician body; ArmorJobNum[2]=0 -> armor A)
//   - Head mesh:  tmh-A01.smd  (Mechanician face/hair, from szModel_FighterFaceName[0][0])
//   - Skeleton:   m1.smb       (66-bone Bip01 skeleton + ALL animation keyframes,
//                               frames 0-11043, the complete motion data file)
//   - Anim maps:  M1Bip.inx    (150 motions: STAND, WALK, RUN, ATTACK, SKILL, etc.)
//   - Textures:   TmbA01.bmp (body), TmhA01/02/03 (face/hair)
//
// The ArmorJobNum mapping in playsub.cpp (PT source) is:
//   {0,1,0,3,2,5,4,7,6,8,9,10}
// Job 2 (JOBCODE_MECHANICIAN) -> index 0 -> armor A -> body tmbA01.smd
//
// The Mechanician head model comes from szModel_FighterFaceName[FaceCode][HairCode]
// in playmodel.h. The default character-select face is FaceCode=0, HairCode=0,
// which resolves to tmh-a01.inf -> tmh-A01.ASE -> tmh-A01.smd. The 3 hair
// variants use tmh-A01/A02/A03.smd (HairCode 0, 1, 2), all sharing the same
// face textures but with different hair mesh geometry.
//
// Generates 3 hair variants for the Mechanician's hair selection:
//   pt_mechanician.glb       - tmh-A01.smd (hair style 1, default)
//   pt_mechanician_hair2.glb - tmh-A02.smd (hair style 2)
//   pt_mechanician_hair3.glb - tmh-A03.smd (hair style 3)
//
// Usage:
//   npx tsx scripts/pt-port/mechanician_assembler.ts [magicpt_client_root] [output_dir]
//
// Defaults:
//   magicpt_client_root = C:\Users\jhing\CascadeProjects\PT-Project\MagicPT-Chinese\client\
//   output_dir          = public/models/creatures/

import { buildGlb } from './glb_assembler.ts';

const DEFAULT_CLIENT_ROOT = 'C:\\Users\\jhing\\CascadeProjects\\PT-Project\\MagicPT-Chinese\\client\\';
const DEFAULT_OUTPUT_DIR = 'public/models/creatures/';

// The 3 hair style head SMDs for the Mechanician.
// Each is a complete head+hair mesh skinned to Bip01 Head/Spine1.
// Verified distinct from Fighter heads (tmh-B01/B02/B03.smd) by MD5 hash.
const HAIR_VARIANTS = [
  { suffix: '', headSmd: 'tmh-A01.smd' },
  { suffix: '_hair2', headSmd: 'tmh-A02.smd' },
  { suffix: '_hair3', headSmd: 'tmh-A03.smd' },
];

// With the complete m1.smb motion file, the INX state names match their actual
// visual content: STAND = standing, WALK = walking, RUN = running. No clip name
// overrides are needed. The Mechanician shares the same m1.smb and M1Bip.inx
// as the Fighter (both are Tempskron classes using the Bip01 skeleton).

// Reversed clips: FALLSTAND reversed creates a jump-launch animation (crouch
// down to spring up). The normal FALLSTAND plays forward for the landing
// (stand up from crouched). FALLDOWN is the falling pose.
// Same as Fighter since both share the same motion data.
const REVERSED_CLIPS = [
  { sourceState: 'FALLSTAND', exportName: 'FALLSTAND_REVERSED' },
];

async function main() {
  const clientRoot = process.argv[2] || DEFAULT_CLIENT_ROOT;
  const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;

  const charDir = clientRoot + 'char\\tmABCD\\';

  console.log('=== Tempskron Mechanician GLB Assembly ===');
  console.log(`Client root: ${clientRoot}`);
  console.log(`Output dir:  ${outputDir}`);
  console.log('');

  // PT character motion data: m1.smb is the complete motion file (33MB, 66 bones,
  // frames 0-11043) containing ALL animation keyframes. Shared with the Fighter
  // (both are Tempskron classes using the same Bip01 skeleton). The split
  // M1-motion1..14.smb files are partial extracts that only cover frames 0-7423,
  // missing the SKILL animations at frames 7424+. Using m1.smb directly gives
  // us the full INX range. No extraSmbPaths needed since m1.smb has everything.

  for (const variant of HAIR_VARIANTS) {
    const outputPath = outputDir + 'pt_mechanician' + variant.suffix + '.glb';
    console.log(`\n--- Hair variant: ${variant.suffix || 'default'} (${variant.headSmd}) ---`);

    await buildGlb({
      smdPath: charDir + 'tmbA01.smd',         // Mechanician body armor mesh (armor A)
      extraSmdPaths: [charDir + variant.headSmd], // head/face/hair mesh
      smbPath: charDir + 'm1.smb',             // complete skeleton + ALL animation keyframes
      inxPath: charDir + 'M1Bip.inx',           // animation state -> frame range mappings
      bmpPath: charDir + 'TmbA01.bmp',          // primary body texture (unused by buildGlb
                                                //   directly; textures resolve from SMD
                                                //   material textureNames)
      outputPath,
      clientRoot,
      reversedClips: REVERSED_CLIPS,
    });
  }

  console.log('\nMechanician GLB assembly complete (3 hair variants).');
}

main().catch((err) => {
  console.error('Mechanician assembly failed:', err);
  process.exit(1);
});
