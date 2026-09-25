// Generic PT map compiler tests.
//
// Pins the extraction contract: the manifest-driven compiler must reproduce
// the committed Ricarten generated modules byte-for-byte (provenance) and
// deterministically (two runs -> identical output). Cases that need the
// MagicPT client tree skip when PT sources are not checked out locally -
// the generated modules are committed, so the suite still runs everywhere.
//
// The registry parser is tested on an inline field.cpp fixture so catalog
// parsing never depends on the external checkout.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildPerFaceUVs,
  buildTextureManifest,
  classifyAndBuild,
  emitModule,
  parseSmd,
  waterMaterialSet,
  type PtWaterRule,
} from '../scripts/pt-port/lib/stage_smd.mjs';
import { emitModule as emitStageModule, parsePat } from '../scripts/pt-port/lib/pat_smd.mjs';
import { ptClientPath } from '../scripts/pt-port/lib/pt_client.mjs';
import { parseFieldRegistry } from '../scripts/pt-port/lib/field_registry.mjs';

const REPO_ROOT = resolve(__dirname, '..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'scripts/pt-port/maps/ricarten.mjs');
const FIELD_OUT = resolve(REPO_ROOT, 'src/sim/pt_ricarten_field.generated.ts');
const STAGE_OUT = resolve(REPO_ROOT, 'src/render/pt_stage_objects.generated.ts');

const hasPtClient = existsSync(ptClientPath('Field/Ricarten/village-2.smd'));

interface Manifest {
  smdPath: string;
  sourceLabel?: string;
  water?: PtWaterRule;
  stageObjects?: { dir: string; files: string[] };
  minimap?: string;
  textureOutDir?: string;
}

async function loadRicarten(): Promise<Manifest> {
  return (await import(pathToFileURL(MANIFEST_PATH).href)).default as Manifest;
}

// Mirrors cmdCompile in pt_map.mjs - the pure emit path, nothing written.
function compileFieldSource(manifest: Manifest): string {
  const smd = parseSmd(readFileSync(ptClientPath(manifest.smdPath)));
  const water = waterMaterialSet(smd.materials, manifest.water);
  const built = classifyAndBuild(smd, water);
  const uvs = buildPerFaceUVs(smd);
  const textureManifest = buildTextureManifest(smd);
  // Same minimap URL derivation as pt_map.mjs compileField.
  const minimapPng = manifest.minimap && manifest.textureOutDir && existsSync(ptClientPath(manifest.minimap))
    ? `/${manifest.textureOutDir.replace(/^public\//, '')}/minimap-${manifest.minimap.split('/').pop()!.replace(/\.[^.]*$/, '').toLowerCase()}.png`
    : null;
  return emitModule(
    smd,
    built,
    uvs,
    textureManifest,
    manifest.sourceLabel ?? `client/${manifest.smdPath}`,
    { minimapPng },
  );
}

function compileStageSource(manifest: Manifest): string {
  const spec = manifest.stageObjects!;
  const objects = spec.files.map((file) =>
    parsePat(readFileSync(join(ptClientPath(spec.dir), file)), file),
  );
  const firstStem = spec.files[0].replace(/\.[^.]*$/, '');
  const label = `client/${spec.dir}/${firstStem}..${spec.files[spec.files.length - 1]} (smPAT3D, SMD Model data Ver 0.62).`;
  return emitStageModule(objects, label);
}

describe('pt-map compiler: Ricarten golden equivalence', () => {
  it.skipIf(!hasPtClient)(
    'recompiles the field module byte-identical to the committed output',
    async () => {
      const manifest = await loadRicarten();
      expect(compileFieldSource(manifest)).toBe(readFileSync(FIELD_OUT, 'utf8'));
    },
  );

  it.skipIf(!hasPtClient)(
    'recompiles the stage-objects module byte-identical to the committed output',
    async () => {
      const manifest = await loadRicarten();
      expect(compileStageSource(manifest)).toBe(readFileSync(STAGE_OUT, 'utf8'));
    },
  );

  it.skipIf(!hasPtClient)('field compile is deterministic across runs', async () => {
    const manifest = await loadRicarten();
    expect(compileFieldSource(manifest)).toBe(compileFieldSource(manifest));
  });

  it.skipIf(!hasPtClient)('stage-objects compile is deterministic across runs', async () => {
    const manifest = await loadRicarten();
    expect(compileStageSource(manifest)).toBe(compileStageSource(manifest));
  });
});

describe('pt-map compiler: water classification', () => {
  it.skipIf(!hasPtClient)(
    'translucent rule selects exactly the proven Ricarten water set',
    async () => {
      const manifest = await loadRicarten();
      const smd = parseSmd(readFileSync(ptClientPath(manifest.smdPath)));
      const water = waterMaterialSet(smd.materials, manifest.water);
      expect([...water].sort((a: number, b: number) => a - b)).toEqual([107, 140, 232]);
    },
  );

  it('rule branches behave on synthetic materials', () => {
    const materials = [
      { index: 0, transparency: 0.0, windMeshBottom: 0 },
      { index: 1, transparency: 0.29, windMeshBottom: 0x200 },
      { index: 2, transparency: 0.29, windMeshBottom: 0 }, // water-looking, no bit
      { index: 3, transparency: 0.0, windMeshBottom: 0x200 }, // bit set, opaque
    ];
    expect([...waterMaterialSet(materials, { rule: 'translucent' })].sort()).toEqual([1, 2]);
    expect([...waterMaterialSet(materials, { rule: 'script' })].sort()).toEqual([1, 3]);
    expect([...waterMaterialSet(materials, { rule: 'explicit', materials: [3] })]).toEqual([3]);
    expect([...waterMaterialSet(materials, undefined)].sort()).toEqual([1, 2]); // default
  });
});

describe('pt-map compiler: field.cpp registry parser', () => {
  const fixture = `
	int FieldLimitLevel_Table[MAX_FIELD] = { 0, 55, 70, 90, 100 };
	psField[i]->SetName("ricarten\\\\village-2.ase","village-2"); //3
	psField[i]->State			= FIELD_STATE_VILLAGE;
	psField[i]->AddStageObject("ricarten\\\\v-ani01.ASE");
	psField[i]->AddStageObject("iron\\\\i1-ani01_Bip.ASE",1);
	psField[i]->SetCenterPos(2596,-18738);
	psField[i]->AddStartPoint(2592,-18566);
	psField[i]->AddGate(psField[i+1],-8508,-10576,0);
	psField[i]->AddGate(psField[2],2275,-14828,0);
	//psField[i]->AddGate(psField[i+4],1,2,3);
	psField[i]->AddWarpGate(734,-20119,312,64,32);
	psField[i]->AddWarpOutGate(psField[i],822,-19956,254);
	psField[i]->WarpGate[psField[i]->WarpGateActiveNum].SpecialEffect = 2;
	psField[i]->AddWarpGate(2597,-18243,236,32,32);
	psField[i]->AddWarpOutGate(psField[2],198282,240400,1502);
	psField[i]->WarpGate[psField[i]->WarpGateActiveNum].LimitLevel = FieldLimitLevel_Table[i+2];
	//psField[i]->AddWarpGate(1,2,3,4,5);
	//psField[i]->AddWarpOutGate(psField[i+1],9,9,9);
	/*
	psField[i]->AddWarpGate(7,7,7,7,7);
	psField[i]->AddWarpOutGate(psField[1],8,8,8);
	*/
	psField[i]->SetName("Fall_Game\\\\fall_game.ASE",0) ; //39
	psField[i]->State = FIELD_STATE_ROOM;
	/*
	psField[i]->SetName("Stemple\\\\stemple.ASE","Stemple"); //62
	psField[i]->AddGate(psField[i+1],9,9,9);
	*/
`;

  it('parses SetName/State/objects/center/starts/gates', () => {
    const fields = parseFieldRegistry(fixture);
    expect(fields).toHaveLength(2);
    const r = fields[0];
    expect(r.fieldIndex).toBe(0);
    expect(r.authoredIndex).toBe(3);
    expect(r.asePath).toBe('ricarten/village-2.ase');
    expect(r.mapName).toBe('village-2');
    expect(r.state).toBe('FIELD_STATE_VILLAGE');
    expect(r.stageObjects).toEqual([
      { path: 'ricarten/v-ani01.ASE', bipAnimation: false },
      { path: 'iron/i1-ani01_Bip.ASE', bipAnimation: true },
    ]);
    expect(r.centerPos).toEqual([2596, -18738]);
    expect(r.startPoints).toEqual([[2592, -18566]]);
    expect(r.gates).toEqual([
      { targetIndex: 1, x: -8508, z: -10576, y: 0 },
      { targetIndex: 2, x: 2275, z: -14828, y: 0 },
    ]);
  });

  it('parses AddWarpGate/AddWarpOutGate records with exits bound to the last gate', () => {
    const fields = parseFieldRegistry(fixture);
    const r = fields[0];
    // Two live gates; the commented AddWarpGate/AddWarpOutGate lines and
    // the block-commented pair never register.
    expect(r.warpGates).toHaveLength(2);
    expect(r.warpGates[0]).toEqual({
      x: 734,
      z: -20119,
      y: 312,
      size: 64,
      height: 32,
      limitLevel: 0,
      specialEffect: 2,
      exits: [{ targetIndex: 0, x: 822, z: -19956, y: 254 }],
    });
    expect(r.warpGates[1]).toEqual({
      x: 2597,
      z: -18243,
      y: 236,
      size: 32,
      height: 32,
      // FieldLimitLevel_Table[i+2] -> table[2] -> 70.
      limitLevel: 70,
      specialEffect: 0,
      exits: [{ targetIndex: 2, x: 198282, z: 240400, y: 1502 }],
    });
  });

  it('stamps posWarpOut from the last self-targeting AddWarpOutGate', () => {
    const fields = parseFieldRegistry(fixture);
    // AddWarpOutGate(psField[i],822,-19956,254): a self-exit, so the field's
    // own PosWarpOut is set (x,y,z order per the source POINT3D).
    expect(fields[0].posWarpOut).toEqual({ x: 822, y: 254, z: -19956 });
    // A field with no self-exit keeps the ZeroMemory default.
    expect(fields[1].posWarpOut).toBeNull();
  });

  it('resolves the field-level limit from FieldLimitLevel_Table[i]', () => {
    const fields = parseFieldRegistry(fixture);
    expect(fields[0].limitLevel).toBe(0);
    expect(fields[1].limitLevel).toBe(55);
  });

  it('resolves absolute psField[N] AddGate targets against the registration table', () => {
    const fields = parseFieldRegistry(fixture);
    // AddGate(psField[2],...) names registration index 2 verbatim, not i+2.
    expect(fields[0].gates[1].targetIndex).toBe(2);
  });

  it('excludes commented-out gates and fields inside block comments', () => {
    const fields = parseFieldRegistry(fixture);
    // The //-commented AddGate never registers (2 live gates, not 3), and
    // the /* */ Stemple block never becomes a field (2 fields, not 3).
    expect(fields).toHaveLength(2);
    expect(fields[0].gates).toHaveLength(2);
    expect(fields.some((f) => /stemple/i.test(f.asePath))).toBe(false);
  });

  it('records a null minimap name for SetName(...,0)', () => {
    const fields = parseFieldRegistry(fixture);
    expect(fields[1].mapName).toBeNull();
    expect(fields[1].asePath).toBe('Fall_Game/fall_game.ASE');
  });
});
