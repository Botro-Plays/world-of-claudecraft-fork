// Tempskron Fighter GLB assembler entry point.
//
// Assembles the Priston Tale Tempskron Fighter player character from:
//   - Body mesh:  tmbB01.smd   (Fighter body; ArmorJobNum[1]=1 -> armor B)
//   - Head mesh:  tmh-B01.smd  (Fighter face/hair, from szModel_FighterFaceName[0][0])
//   - Skeleton:   m1.smb       (66-bone Bip01 skeleton + ALL animation keyframes,
//                               frames 0-11043, the complete motion data file)
//   - Anim maps:  M1Bip.inx    (150 motions: STAND, WALK, RUN, ATTACK, SKILL, etc.)
//   - Textures:   TmbB01.bmp (body), TmhB01/02/03.bmp (face/hair)
//
// The ArmorJobNum mapping in playsub.cpp (PT source) is:
//   {0,1,0,3,2,5,4,7,6,8,9,10}
// Job 1 (JOBCODE_FIGHTER) -> index 1 -> armor B -> body tmbB01.smd
// Job 2 (JOBCODE_MECHANICIAN) -> index 0 -> armor A -> body tmbA01.smd
//
// The Fighter head model comes from szModel_FighterFaceName[FaceCode][HairCode]
// in playmodel.h. The default character-select face is FaceCode=0, HairCode=0,
// which resolves to tmh-b01.inf -> tmh-B01.ASE -> tmh-B01.smd. The 3 hair
// variants use tmh-B01/B02/B03.smd (HairCode 0, 1, 2), all sharing the same
// face textures (TmhB01/02/03.bmp) but with different hair mesh geometry.
//
// Generates 3 hair variants for the Fighter's hair selection:
//   pt_fighter.glb       - tmh-B01.smd (hair style 1, default)
//   pt_fighter_hair2.glb - tmh-B02.smd (hair style 2)
//   pt_fighter_hair3.glb - tmh-B03.smd (hair style 3)
//
// Usage:
//   npx tsx scripts/pt-port/fighter_assembler.ts [magicpt_client_root] [output_dir]
//
// Defaults:
//   magicpt_client_root = C:\Users\jhing\CascadeProjects\PT-Project\MagicPT-Chinese\client\
//   output_dir          = public/models/creatures/

import { buildGlb } from './glb_assembler.ts';

const DEFAULT_CLIENT_ROOT = 'C:\\Users\\jhing\\CascadeProjects\\PT-Project\\MagicPT-Chinese\\client\\';
const DEFAULT_OUTPUT_DIR = 'public/models/creatures/';

// The 3 hair style head SMDs from szModel_FighterFaceName[0][0..2].
// Each is a complete head+hair mesh skinned to Bip01 Head/Spine1.
const HAIR_VARIANTS = [
  { suffix: '', headSmd: 'tmh-B01.smd' },
  { suffix: '_hair2', headSmd: 'tmh-B02.smd' },
  { suffix: '_hair3', headSmd: 'tmh-B03.smd' },
];

// With the complete m1.smb motion file, the INX state names match their actual
// visual content: STAND = standing, WALK = walking, RUN = running. No clip name
// overrides are needed. (The earlier swap was a workaround for the incomplete
// split M1-motion*.smb files which had different/missing frame data.)

async function main() {
  const clientRoot = process.argv[2] || DEFAULT_CLIENT_ROOT;
  const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;

  const charDir = clientRoot + 'char\\tmABCD\\';

  console.log('=== Tempskron Fighter GLB Assembly ===');
  console.log(`Client root: ${clientRoot}`);
  console.log(`Output dir:  ${outputDir}`);
  console.log('');

  // PT character motion data: m1.smb is the complete motion file (33MB, 66 bones,
  // frames 0-11043) containing ALL animation keyframes. The split M1-motion1..14.smb
  // files are partial extracts that only cover frames 0-7423, missing the SKILL
  // animations at frames 7424+. Using m1.smb directly gives us the full INX range.
  // No extraSmbPaths needed since m1.smb has everything.

  // Reversed clips: FALLSTAND reversed creates a jump-launch animation (crouch
  // down to spring up). The normal FALLSTAND plays forward for the landing
  // (stand up from crouched). FALLDOWN is the falling pose.
  const REVERSED_CLIPS = [
    { sourceState: 'FALLSTAND', exportName: 'FALLSTAND_REVERSED' },
  ];

  for (const variant of HAIR_VARIANTS) {
    const outputPath = outputDir + 'pt_fighter' + variant.suffix + '.glb';
    console.log(`\n--- Hair variant: ${variant.suffix || 'default'} (${variant.headSmd}) ---`);

    await buildGlb({
      smdPath: charDir + 'tmbB01.smd',         // Fighter body armor mesh (armor B)
      extraSmdPaths: [charDir + variant.headSmd], // head/face/hair mesh
      smbPath: charDir + 'm1.smb',             // complete skeleton + ALL animation keyframes
      inxPath: charDir + 'M1Bip.inx',           // animation state -> frame range mappings
      bmpPath: charDir + 'TmbB01.bmp',          // primary body texture (unused by buildGlb
                                                //   directly; textures resolve from SMD
                                                //   material textureNames)
      outputPath,
      clientRoot,
      reversedClips: REVERSED_CLIPS,
    });
  }

  console.log('\nFighter GLB assembly complete (3 hair variants).');
}

main().catch((err) => {
  console.error('Fighter assembly failed:', err);
  process.exit(1);
});
