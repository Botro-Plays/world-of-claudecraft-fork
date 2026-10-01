import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VISUALS } from '../src/render/characters/manifest';
import { PT_SKILL_ANIMS } from '../src/sim/content/pt_skill_anims';
import {
  PT_SKILL_CATALOG,
  PT_SKILL_ORDER,
} from '../generated/pt-maps/pt_skill_catalog.generated';

// Contract for the authentic PT per-skill gestures:
// scripts/pt-port/build_pt_skill_anims.ts resolves the MagicPT INX
// SkillCodeList bindings into per-class { pt_* id -> clip name } maps and
// exports each bound motion into a mesh-free donor GLB
// (public/models/creatures/pt_m{1..8}_skill_anims.glb). manifest.ts layers
// the donor onto every player_<pt class>[ _hair2|_hair3 ] VisualDef and pins
// the map to clips.attackByAbility, so renderer playAttack(abilityId) picks
// the authored PT gesture before the generic ATTACK swing.
//
// The shared character_clipmaps gate already proves the donor clips resolve
// and bind by node name; this file pins the JOIN: every mapped id is a real
// catalog skill on that class, every shipped clip is wired, and the few
// skills with no bound SKILL row stay on the documented fallback list (PT
// itself plays their weapon swing, so the ATTACK fallback is correct).

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

interface GlbJson {
  animations?: { name?: string; channels?: { target?: { node?: number } }[] }[];
  nodes?: { name?: string }[];
}

function glbJsonChunk(publicPath: string): GlbJson {
  const buf = readFileSync(publicPath);
  expect(buf.length, `${publicPath} is not a GLB`).toBeGreaterThan(12);
  expect(buf.readUInt32LE(0), `${publicPath} magic`).toBe(GLB_MAGIC);
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    if (type === CHUNK_JSON) {
      return JSON.parse(buf.toString('utf8', offset + 8, offset + 8 + length)) as GlbJson;
    }
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  throw new Error(`${publicPath} has no JSON chunk`);
}

const sanitize = (name: string) => name.replace(/\s/g, '_').replace(/[[\].:/]/g, '');
const publicPath = (url: string) => fileURLToPath(new URL(`../public/${url}`, import.meta.url));

// Active skills whose PT client plays the normal weapon ATTACK motion (bow
// shots, spear throws, Raving's plain double swing) rather than a bound SKILL
// row - verified absent from every SkillCodeList in their class INX. They
// deliberately get no attackByAbility entry.
const PT_ATTACK_MOTION_SKILLS = new Set([
  'pt_raving',
  'pt_critical_hit',
  'pt_expansion',
  'pt_wind_arrow',
  'pt_perfect_aim',
  'pt_avalanche',
  'pt_farina',
  'pt_vigor_spear',
  'pt_fire_javelin',
  'pt_stringer',
]);

interface CatalogRow {
  id: string;
  class: string;
  hand: string;
}
const CATALOG = PT_SKILL_CATALOG as unknown as Record<string, CatalogRow>;

describe('PT per-skill animation bindings', () => {
  it('wires the donor GLB + attackByAbility on every PT class visual (incl. hair)', () => {
    for (const [cls, anims] of Object.entries(PT_SKILL_ANIMS)) {
      for (const suffix of ['', '_hair2', '_hair3']) {
        const key = `player_${cls}${suffix}`;
        const def = VISUALS[key];
        expect(def, `${key} missing from VISUALS`).toBeDefined();
        expect(def.animUrls, `${key} missing the skill donor`).toContain(anims.donor);
        expect(
          def.clips.attackByAbility,
          `${key} attackByAbility must equal the generated clip map`,
        ).toEqual(anims.clips);
      }
    }
  });

  it('ships every wired clip inside the donor GLB', () => {
    for (const [cls, anims] of Object.entries(PT_SKILL_ANIMS)) {
      const donorPath = publicPath(anims.donor);
      expect(existsSync(donorPath), `${cls}: ${anims.donor} is missing`).toBe(true);
      const names = new Set(
        (glbJsonChunk(donorPath).animations ?? []).map((a) => a.name ?? ''),
      );
      for (const [ptId, clip] of Object.entries(anims.clips)) {
        expect(names.has(clip), `${cls}: ${ptId} -> ${clip} not in ${anims.donor}`).toBe(true);
      }
    }
  });

  it('binds every donor clip to nodes the class body rig carries', () => {
    for (const [cls, anims] of Object.entries(PT_SKILL_ANIMS)) {
      const body = publicPath(VISUALS[`player_${cls}`].url);
      const rigNodes = new Set(
        (glbJsonChunk(body).nodes ?? [])
          .map((n) => n.name)
          .filter((n): n is string => !!n)
          .map(sanitize),
      );
      const json = glbJsonChunk(publicPath(anims.donor));
      const nodeName = (i: number | undefined) =>
        i === undefined ? null : (json.nodes?.[i]?.name ?? null);
      const wired = new Set(Object.values(anims.clips));
      const unbindable: string[] = [];
      for (const anim of json.animations ?? []) {
        if (!wired.has(anim.name ?? '')) continue;
        for (const ch of anim.channels ?? []) {
          const name = nodeName(ch.target?.node);
          if (name && !rigNodes.has(sanitize(name))) {
            unbindable.push(`${anim.name} -> ${name}`);
          }
        }
      }
      expect(unbindable, `${cls} donor clips target nodes the body rig lacks`).toEqual([]);
    }
  });

  it('maps only real catalog skills, on the owning class', () => {
    for (const [cls, anims] of Object.entries(PT_SKILL_ANIMS)) {
      for (const ptId of Object.keys(anims.clips)) {
        const row = CATALOG[ptId];
        expect(row, `${cls}: ${ptId} is not a catalog skill`).toBeDefined();
        expect(row.class, `${cls}: ${ptId} belongs to ${row.class}`).toBe(cls);
        expect(row.hand, `${cls}: ${ptId} is passive but wired to a motion`).not.toBe('passive');
      }
    }
  });

  it('covers every active PT skill or pins its ATTACK-motion fallback', () => {
    const unmapped: string[] = [];
    for (const [cls, ids] of Object.entries(PT_SKILL_ORDER)) {
      const clips = PT_SKILL_ANIMS[cls]?.clips ?? {};
      for (const id of ids as string[]) {
        const row = CATALOG[id];
        if (!row || row.hand === 'passive') continue;
        if (!clips[id] && !PT_ATTACK_MOTION_SKILLS.has(id)) unmapped.push(`${cls}:${id}`);
      }
    }
    expect(unmapped).toEqual([]);
  });
});
