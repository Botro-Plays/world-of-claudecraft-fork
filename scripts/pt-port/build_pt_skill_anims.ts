// PT per-skill animation donor builder.
//
// Sources (all authentic MagicPT-Chinese client data):
//   - char/tmABCD/m{1..8}.smb     - skeleton + ALL keyframes (one per rig family)
//   - char/tmABCD/M{1..8}Bip.inx  - motion table; SKILL rows carry a
//                                 SkillCodeList of indexes into the global
//                                 SkillDataCode[] table (PT-Source/fileread.cpp),
//                                 which is how PT binds each skill to its
//                                 authored motion. character.cpp: when a skill
//                                 plays CHRMOTION_STATE_SKILL the client walks
//                                 SKILL rows and keeps the rows whose
//                                 SkillCodeList names the skill's play code.
//   - generated/pt-maps/pt_skill_catalog.generated.ts - pt_* id join
//
// A skill can appear on several rows (per-weapon-family variants selected by
// ItemCodeList at runtime, random among them when no filter applies) and one
// row can serve several skills (shared buff/raise gestures). This pass wires
// the FIRST row per skill; variant pools are a documented follow-up.
// Skills with no SKILL row (e.g. Raving) play their normal weapon swing in
// PT too, so they get no attackByAbility entry.
//
// Each row's EventFrame (DWORD[4], clip-relative 160-tick units at 30fps)
// marks where the skill's effect actually fires inside the motion - the bolt
// leaves the hand mid-swing, not at frame 0. We export the FIRST nonzero
// event as a release offset in seconds so the sim can defer the projectile /
// damage to the authored hit frame, exactly like PT does (character.cpp
// fires the skill's effect when the running motion reaches EventFrame).
//
// Outputs:
//   public/models/creatures/pt_m{1..8}_skill_anims.glb - mesh-free donor GLBs
//     (skeleton + named clips only; merged into each body rig's clip pool via
//     VisualDef.animUrls)
//   generated/pt-maps/pt_skill_anims.generated.ts - per-class
//     { pt ability id -> clip name } + donor url
//
// Usage:
//   npx tsx scripts/pt-port/build_pt_skill_anims.ts [magicpt_root]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseInx } from './inx_parser.ts';
import { buildSkeletonAnimGlb } from './glb_assembler.ts';
import {
  PT_SKILL_CATALOG,
  PT_SKILL_ORDER,
} from '../../generated/pt-maps/pt_skill_catalog.generated.ts';

const DEFAULT_MAGICPT_ROOT = 'D:\\From Luis Cezar Matias - Chinese MagicPT\\';

// PT motion timebase (mirrors glb_assembler.ts): one animation frame is 160
// SMB ticks at 30 fps, so an EventFrame value converts to wall seconds via
// /4800.
const TICKS_PER_FRAME = 160;
const FPS = 30;

// Class -> shared PT motion file (char/tmABCD/m{n}.smb + M{n}Bip.inx).
// Fighter/Mechanician/Knight share m1; Archer/Atalanta share m2. The Morion
// Monk is a fork-added class with no PT skills - it is not listed.
const CLASS_MOTION_FILE: Record<string, number> = {
  tempskron_fighter: 1,
  tempskron_mechanician: 1,
  morion_knight: 1,
  tempskron_archer: 2,
  morion_atalanta: 2,
  morion_magician: 3,
  tempskron_pikeman: 4,
  morion_priestess: 5,
  atlanteon_assassin: 6,
  atlanteon_shaman: 7,
  atlanteon_martial_artist: 8,
};

interface CatalogRow {
  id: string;
  code: string;
  class: string;
  name: string;
  func: string;
  hand: string;
}
const CATALOG = PT_SKILL_CATALOG as unknown as Record<string, CatalogRow>;

// ---------------------------------------------------------------------------
// SkillDataCode[] (PT-Source/fileread.cpp): index -> { name, SKILL_PLAY_* }
// ---------------------------------------------------------------------------

function parseSkillDataCode(filereadPath: string): { name: string; play: string }[] {
  const src = readFileSync(filereadPath, 'latin1');
  const start = src.indexOf('SkillDataCode[]');
  if (start < 0) throw new Error('SkillDataCode[] not found in fileread.cpp');
  const block = src.slice(start, src.indexOf('};', start));
  const re = /\{\s*"([^"]*)"\s*,\s*([A-Za-z_0-9]+|0)\s*\}/g;
  const table: { name: string; play: string }[] = [];
  let m;
  while ((m = re.exec(block))) table.push({ name: m[1], play: m[2] });
  return table;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Verified SkillDataCode short-name -> pt_* id aliases for rows whose play
// code AND short name both diverge from the catalog row:
//   GODSBLESS/SKILL_PLAY_GODS_BLESS      -> SKILL_GOD_BLESS (pt_god_bless)
//   BoneSmash/SKILL_PLAY_BONE_SMASH      -> SKILL_BONE_CRASH (pt_bone_crash)
//   ColumnOfWater/SKILL_PLAY_COLUMN_OF_WATER -> SKILL_WATORNADO (pt_watornado)
//   RisingSlash/SKILL_PLAY_RISING_SLASH  -> SKILL_RISING_SHASH (pt_rising_shash)
//   GhostyNail/SKILL_PLAY_PHANTOM_NAIL   -> SKILL_CHOSTY_NAIL (pt_chosty_nail)
//   DIVINEPIERCING2/3                    -> follow-up swing motions of
//                                         pt_divine_piercing's 3-hit combo
const SKILL_DATA_ALIASES: Record<string, string> = {
  GODSBLESS: 'pt_god_bless',
  BoneSmash: 'pt_bone_crash',
  ColumnOfWater: 'pt_watornado',
  RisingSlash: 'pt_rising_shash',
  GhostyNail: 'pt_chosty_nail',
  DIVINEPIERCING2: 'pt_divine_piercing',
  DIVINEPIERCING3: 'pt_divine_piercing',
};

// Resolve a SkillDataCode entry to a pt_* catalog row. Primary key is the
// play code (SKILL_PLAY_X -> catalog code SKILL_X); several entries diverge
// (SKILL_PLAY_INERTIA vs SKILL_CURSE_LAZY, SKILL_PLAY_CRIMSON_KNIGHT vs
// SKILL_RECALL_BLOODYKNIGHT), so the normalized short name is the fallback,
// matched against the catalog's display name and SkillFunction name.
const byCode = new Map<string, CatalogRow>();
const byNorm = new Map<string, CatalogRow>();
for (const row of Object.values(CATALOG)) {
  byCode.set(row.code, row);
  byNorm.set(norm(row.name), row);
  byNorm.set(norm(row.func.replace(/^F_/, '')), row);
}

function resolvePtId(entry: { name: string; play: string }): string | null {
  if (SKILL_DATA_ALIASES[entry.name]) return SKILL_DATA_ALIASES[entry.name];
  const viaPlay = 'SKILL_' + entry.play.replace(/^SKILL_PLAY_/, '');
  if (byCode.has(viaPlay)) return byCode.get(viaPlay)!.id;
  const n = norm(entry.name);
  if (byNorm.has(n)) return byNorm.get(n)!.id;
  return null;
}

async function main() {
  const magicRoot = process.argv[2] || DEFAULT_MAGICPT_ROOT;
  const charDir = magicRoot + 'Client\\char\\tmABCD\\';
  const table = parseSkillDataCode(magicRoot + 'PT-Source\\fileread.cpp');
  console.log(`SkillDataCode: ${table.length} entries`);

  // Per class: ptId -> clip name. Clip names are SKILL_<PTID-upper-minus-pt_>.
  const classClips = new Map<string, Record<string, string>>();
  // Flat ptId -> release offset in seconds (the row's first nonzero
  // EventFrame), clamped to the clip's duration. The sim emits the skill's
  // projectile/damage when the gesture reaches this point.
  const releaseSec = new Map<string, number>();
  const clipNameOf = (ptId: string) => 'SKILL_' + ptId.slice(3).toUpperCase();

  const unresolved: string[] = [];
  const files = [...new Set(Object.values(CLASS_MOTION_FILE))];
  for (const n of files) {
    const inx = parseInx(readFileSync(charDir + `M${n}Bip.inx`));
    const seenFrames = new Set<string>();
    const usedPtIds = new Set<string>(); // first row per skill wins
    const rows: { motionIndex: number; ptIds: string[] }[] = [];

    inx.motions.forEach((motion, i) => {
      if (motion.stateName !== 'SKILL' || motion.skillCodes.length === 0) return;
      const key = `${motion.startFrame}-${motion.endFrame}`;
      if (seenFrames.has(key)) return; // literal duplicate row
      seenFrames.add(key);

      const ptIds: string[] = [];
      for (const code of motion.skillCodes) {
        const entry = table[code];
        if (!entry || entry.play === '0') continue; // passive row, no play code
        const ptId = resolvePtId(entry);
        if (!ptId) {
          unresolved.push(`M${n} row ${i}: ${entry.name} (${entry.play})`);
          continue;
        }
        // Later rows naming an already-mapped skill are its per-weapon
        // variants (PT picks among them by equipped ItemCodeList).
        if (!usedPtIds.has(ptId)) ptIds.push(ptId);
      }
      for (const ptId of ptIds) usedPtIds.add(ptId);
      rows.push({ motionIndex: i, ptIds });
    });

    // Emit one donor clip per unique row, named after its first skill.
    const wanted = new Map<number, string>();
    const clipBindings: { ptId: string; clip: string }[] = [];
    for (const row of rows) {
      if (row.ptIds.length === 0) continue;
      const clip = clipNameOf(row.ptIds[0]);
      wanted.set(row.motionIndex, clip);
      // EventFrame is clip-relative: the skill's hit fires this far into the
      // gesture. A zero/absent event means "fire at once" (no release entry).
      const motion = inx.motions[row.motionIndex];
      const eventTick = motion.eventFrames.find((v) => v > 0) ?? 0;
      if (eventTick > 0) {
        const clipSec = (motion.endFrame - motion.startFrame) / FPS;
        const sec = Math.min(eventTick / TICKS_PER_FRAME / FPS, clipSec);
        for (const ptId of row.ptIds) releaseSec.set(ptId, Math.round(sec * 100) / 100);
      }
      for (const ptId of row.ptIds) clipBindings.push({ ptId, clip });
    }

    // Assign bindings to classes via the catalog row's class field, but ONLY
    // for classes actually using this motion file.
    const classesHere = Object.entries(CLASS_MOTION_FILE)
      .filter(([, m]) => m === n)
      .map(([cls]) => cls);
    for (const { ptId, clip } of clipBindings) {
      const cls = CATALOG[ptId]?.class;
      if (!cls || !classesHere.includes(cls)) continue;
      if (!classClips.has(cls)) classClips.set(cls, {});
      classClips.get(cls)![ptId] = clip;
    }

    await buildSkeletonAnimGlb({
      smbPath: charDir + `m${n}.smb`,
      inxPath: charDir + `M${n}Bip.inx`,
      outputPath: `public/models/creatures/pt_m${n}_skill_anims.glb`,
      clipNameFor: (_motion, i) => wanted.get(i) ?? null,
    });
    console.log(`  m${n}: ${wanted.size} skill clips for [${classesHere.join(', ')}]`);
  }

  if (unresolved.length) {
    console.log('\nUnresolved SkillDataCode entries (skipped):');
    for (const u of unresolved) console.log('  ' + u);
  }

  // Coverage report: every kit skill vs mapped clip.
  const missing: string[] = [];
  for (const [cls, ids] of Object.entries(PT_SKILL_ORDER)) {
    const clips = classClips.get(cls) ?? {};
    for (const id of ids as string[]) {
      const row = CATALOG[id];
      if (!row || row.hand === 'passive') continue;
      if (!clips[id]) missing.push(`${cls}:${id} (${row.name})`);
    }
  }
  console.log(`\nUnmapped active skills (fall back to ATTACK swing): ${missing.length}`);
  for (const m of missing) console.log('  ' + m);

  // Write generated map.
  const out: Record<string, { donor: string; clips: Record<string, string> }> = {};
  for (const [cls, m] of Object.entries(CLASS_MOTION_FILE)) {
    out[cls] = {
      donor: `models/creatures/pt_m${m}_skill_anims.glb`,
      clips: classClips.get(cls) ?? {},
    };
  }
  const ts = `// GENERATED by scripts/pt-port/build_pt_skill_anims.ts, do not edit by hand.
// Per-skill animation clips resolved from the authentic MagicPT INX
// SkillCodeList bindings: each pt_* ability id maps to a named clip inside
// the class's shared motion donor GLB (skeleton-only, merged onto the body
// rig through VisualDef.animUrls).
export const PT_SKILL_ANIMS = ${JSON.stringify(out, null, 2)} as const;

// Seconds into the skill clip where PT's EventFrame fires the effect (bolt
// launch / hit) - the sim defers the cast's outcome to this release point so
// the gesture visibly leads it. Skills absent here release immediately.
export const PT_SKILL_RELEASE_SEC = ${JSON.stringify(Object.fromEntries([...releaseSec.entries()].sort()), null, 2)} as const;
`;
  const outPath = 'generated/pt-maps/pt_skill_anims.generated.ts';
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, ts);
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
