// PT map test harness: development-only loading of the converted map
// packages under generated/pt-maps/<id>/.
//
// What this does:
//   - enumerates every package through its manifest.json (no hardcoded list,
//     so the 72-map set is whatever the conversion emitted),
//   - lazily imports the selected package's field.generated.ts (and
//     stage_objects.generated.ts when the package has one),
//   - installs it as the active PT-band map through setActivePtMap(),
//   - teleports the player to the first authored start point, or an honest
//     TEST-ONLY fallback when the manifest has none.
//
// What this does NOT do:
//   - register map ids in any production table, portal, or zone routing,
//   - touch the committed Ricarten binding (the default stays until a dev
//     map is installed, and /ptmap off restores it),
//   - substitute Ricarten data for another map: a package with no stage
//     objects, no minimap texture, or conversion warnings says so in the
//     dev log instead of borrowing anything from village-2.
//
// Everything in this module is dev-harness only; the sole import path is the
// dynamic import inside pt_map_dev_command.ts guarded by import.meta.env.DEV.

import { PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z } from '../sim/pt_band';
import {
  createPtField,
  makePtBandTransform,
  makePtContinentTransform,
  ptFieldFitsContinent,
  type PtFieldGateLink,
  type PtFieldModule,
  type PtMapDescriptor,
  type PtStageObjectsModule,
  type PtWarpGateLink,
} from '../sim/pt_field';
import { activePtMapDescriptor, setActivePtMap } from '../sim/pt_field_active';
import { ptRicartenSpawnY } from '../sim/pt_ricarten_field';
import type { Entity } from '../sim/types';
import { ptMapLinksForField, ptMapLinksGraph } from './pt_map_links';
import type { PtDevHud } from './pt_ricarten_dev_command';

// ---------------------------------------------------------------------------
// Package registry (compile-time globs over generated/pt-maps)
// ---------------------------------------------------------------------------

interface PtDevMapManifest {
  manifest?: {
    id?: string;
    fieldIndex?: number;
    mapName?: string;
    state?: string;
    minimap?: string | null;
    centerPos?: number[];
    startPoints?: number[][];
    textureOutDir?: string;
    stageObjects?: { files?: string[]; missing?: string[]; out?: string } | null;
    water?: { rule?: string } | null;
    gates?: { targetIndex: number; targetId?: string | null; x: number; z: number; y: number }[];
    warpGates?: {
      x: number; z: number; y: number; size: number; height: number;
      limitLevel?: number; specialEffect?: number;
      exits?: { targetIndex: number; targetId?: string | null; x: number; z: number; y: number }[];
    }[];
    posWarpOut?: { x: number; y: number; z: number } | null;
    limitLevel?: number;
  };
  status?: string;
  warnings?: unknown[];
  errors?: unknown[];
  field?: { vertices?: number; faces?: number };
  stageObjects?: number;
}

const GLOB_ROOT = '../../generated/pt-maps/';

const MANIFESTS = import.meta.glob('../../generated/pt-maps/*/manifest.json', {
  eager: true,
  import: 'default',
}) as Record<string, PtDevMapManifest>;

const FIELD_LOADERS = import.meta.glob(
  '../../generated/pt-maps/*/field.generated.ts',
) as Record<string, () => Promise<PtFieldModule>>;

const STAGE_LOADERS = import.meta.glob(
  '../../generated/pt-maps/*/stage_objects.generated.ts',
) as Record<string, () => Promise<PtStageObjectsModule>>;

function manifestPath(id: string): string {
  return `${GLOB_ROOT}${id}/manifest.json`;
}

function fieldPath(id: string): string {
  return `${GLOB_ROOT}${id}/field.generated.ts`;
}

function stagePath(id: string): string {
  return `${GLOB_ROOT}${id}/stage_objects.generated.ts`;
}

// ---------------------------------------------------------------------------
// Enumeration (/ptmaps)
// ---------------------------------------------------------------------------

export interface PtDevMapInfo {
  id: string;
  fieldIndex: number;
  mapName: string;
  state: string;
  verts: number;
  faces: number;
  stageObjectFiles: number;
  hasStageModule: boolean;
  startCount: number;
  minimap: string | null;
  warningCount: number;
}

/** Every converted package, sorted by id. Reads manifests only. */
export function listPtDevMaps(): PtDevMapInfo[] {
  const out: PtDevMapInfo[] = [];
  for (const [path, m] of Object.entries(MANIFESTS)) {
    const id = m.manifest?.id ?? path.match(/pt-maps\/([^/]+)\//)?.[1] ?? '?';
    out.push({
      id,
      fieldIndex: m.manifest?.fieldIndex ?? -1,
      mapName: m.manifest?.mapName ?? '?',
      state: m.manifest?.state ?? '?',
      verts: m.field?.vertices ?? -1,
      faces: m.field?.faces ?? -1,
      stageObjectFiles: m.manifest?.stageObjects?.files?.length ?? 0,
      hasStageModule: stagePath(id) in STAGE_LOADERS,
      startCount: m.manifest?.startPoints?.length ?? 0,
      minimap: m.manifest?.minimap ?? null,
      warningCount: m.warnings?.length ?? 0,
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function manifestFor(id: string): PtDevMapManifest | null {
  return MANIFESTS[manifestPath(id)] ?? null;
}

/**
 * Every registered field's authored FieldGate records (manifest data,
 * verbatim). Phantom conversion artifacts are excluded by registration
 * index: the source engine registers fields 0-69 only (the conditional
 * custom slot is index 70 and never emitted a package), so stale manifests
 * carrying fieldIndex >= 70 are not part of the field graph.
 */
export function ptDevFieldGates(): {
  id: string;
  fieldIndex: number;
  gates: PtFieldGateLink[];
}[] {
  const out: { id: string; fieldIndex: number; gates: PtFieldGateLink[] }[] = [];
  for (const [path, m] of Object.entries(MANIFESTS)) {
    const fieldIndex = m.manifest?.fieldIndex ?? -1;
    if (fieldIndex < 0 || fieldIndex >= 70) continue;
    const id = m.manifest?.id ?? path.match(/pt-maps\/([^/]+)\//)?.[1] ?? '?';
    out.push({
      id,
      fieldIndex,
      gates: (m.manifest?.gates ?? []).map((g) => ({
        targetIndex: g.targetIndex,
        targetId: g.targetId ?? null,
        x: g.x,
        z: g.z,
        y: g.y,
      })),
    });
  }
  return out;
}

function manifestWarpGates(m: PtDevMapManifest): PtWarpGateLink[] {
  return (m.manifest?.warpGates ?? []).map((g) => ({
    x: g.x,
    z: g.z,
    y: g.y,
    size: g.size,
    height: g.height,
    limitLevel: g.limitLevel ?? 0,
    specialEffect: g.specialEffect ?? 0,
    exits: (g.exits ?? []).map((e) => ({
      targetIndex: e.targetIndex,
      targetId: e.targetId ?? null,
      x: e.x,
      z: e.z,
      y: e.y,
    })),
  }));
}

/**
 * Every registered field's authored warp data (manifest data, verbatim):
 * the WarpGate triggers, the field's PosWarpOut point, and its level
 * limit. The warp runtime consults the destination side (posWarpOut /
 * limitLevel) by field index, so the whole table is exported rather than
 * just the active map's descriptor. Same phantom exclusion as
 * ptDevFieldGates.
 */
export function ptDevWarpFields(): {
  id: string;
  fieldIndex: number;
  warpGates: PtWarpGateLink[];
  posWarpOut: { x: number; y: number; z: number } | null;
  limitLevel: number;
}[] {
  const out: {
    id: string; fieldIndex: number; warpGates: PtWarpGateLink[];
    posWarpOut: { x: number; y: number; z: number } | null; limitLevel: number;
  }[] = [];
  for (const [path, m] of Object.entries(MANIFESTS)) {
    const fieldIndex = m.manifest?.fieldIndex ?? -1;
    if (fieldIndex < 0 || fieldIndex >= 70) continue;
    const id = m.manifest?.id ?? path.match(/pt-maps\/([^/]+)\//)?.[1] ?? '?';
    out.push({
      id,
      fieldIndex,
      warpGates: manifestWarpGates(m),
      posWarpOut: m.manifest?.posWarpOut ?? null,
      limitLevel: m.manifest?.limitLevel ?? 0,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Loading (/ptmap <id>)
// ---------------------------------------------------------------------------

function textureBaseFor(m: PtDevMapManifest, id: string): string {
  const outDir = m.manifest?.textureOutDir ?? '';
  // 'public/textures/pt-<id>' -> '/textures/pt-<id>/'
  const stripped = outDir.replace(/^public\/?/, '');
  return stripped ? `/${stripped}/` : `/textures/pt-${id}/`;
}

export interface PtDevSpawn {
  x: number;
  y: number;
  z: number;
  ptX: number;
  ptZ: number;
  kind: 'start' | 'center' | 'fallback';
}

/**
 * Resolve a spawn inside the map's own data: authored start points first,
 * then the manifest center, then (TEST-ONLY) the centroid of the first
 * walkable triangle, which always has a floor under it. Returns null only
 * for a package with zero walkable faces, which cannot spawn a player.
 */
export function resolvePtDevSpawn(
  field: PtFieldModule,
  transform: PtMapDescriptor['transform'],
  m: PtDevMapManifest,
): PtDevSpawn | null {
  const ptField = createPtField(field, transform);
  const candidates: { pt: number[]; kind: PtDevSpawn['kind'] }[] = [];
  for (const p of m.manifest?.startPoints ?? []) candidates.push({ pt: p, kind: 'start' });
  if (m.manifest?.centerPos) candidates.push({ pt: m.manifest.centerPos, kind: 'center' });

  for (const c of candidates) {
    const x = transform.ptXToWoC(c.pt[0]);
    const z = transform.ptZToWoC(c.pt[1]);
    const y = ptField.groundHeight(x, z);
    if (Number.isFinite(y)) return { x, y, z, ptX: c.pt[0], ptZ: c.pt[1], kind: c.kind };
  }

  // TEST-ONLY fallback: the centroid of the first walkable face. It is not an
  // authored spawn, only a guaranteed walkable point for inspection.
  const walkFaces = field.PT_WALKABLE_FACES();
  if (walkFaces.length < 3) return null;
  const vertices = field.PT_VERTICES();
  const a = walkFaces[0] * 3;
  const b = walkFaces[1] * 3;
  const c = walkFaces[2] * 3;
  const ptX = (vertices[a] + vertices[b] + vertices[c]) / 3;
  const ptZ = (vertices[a + 2] + vertices[b + 2] + vertices[c + 2]) / 3;
  const x = transform.ptXToWoC(ptX);
  const z = transform.ptZToWoC(ptZ);
  const y = ptField.groundHeight(x, z);
  if (!Number.isFinite(y)) return null;
  return { x, y, z, ptX, ptZ, kind: 'fallback' };
}

export interface PtDevLoadedMap {
  descriptor: PtMapDescriptor;
  manifest: PtDevMapManifest;
  spawn: PtDevSpawn | null;
}

/** Lazy-load a generated package into a descriptor. Throws on unknown id. */
export async function loadPtDevMap(id: string): Promise<PtDevLoadedMap> {
  // Ricarten is the one package whose modules live outside generated/pt-maps
  // (its field is the committed src/sim/pt_ricarten_field.generated.ts, its
  // stage objects src/render/pt_stage_objects.generated.ts - the golden
  // reference outputs). Its package dir carries only manifest.json, so the
  // two loaders fall back to the committed modules for that one id.
  const loadField =
    FIELD_LOADERS[fieldPath(id)] ??
    (id === 'ricarten'
      ? () => import('../sim/pt_ricarten_field.generated')
      : undefined);
  const m = manifestFor(id);
  if (!loadField || !m) {
    throw new Error(`no generated package '${id}' (see /ptmaps)`);
  }
  const field = await loadField();
  const loadStage =
    STAGE_LOADERS[stagePath(id)] ??
    (id === 'ricarten'
      ? () => import('../render/pt_stage_objects.generated')
      : undefined);
  const stageObjects = loadStage ? await loadStage() : null;
  // Maps whose authored bounds land inside the widened band share the
  // Ricarten-anchored continent transform, so adjacent fields keep their
  // authored relative positions and FieldGate boundaries are physically
  // walkable - including against the production Ricarten binding, which
  // lives in the same frame. Fields that would fall outside the band
  // (warp-only islands like dc1) keep the per-map band transform: they are
  // never floor-adjacent to a shared-frame field, so no seam can break.
  const transform = ptFieldFitsContinent(field.PT_BOUNDS)
    ? makePtContinentTransform()
    : makePtBandTransform(field.PT_BOUNDS);
  const descriptor: PtMapDescriptor = {
    id,
    field,
    transform,
    textureBase: textureBaseFor(m, id),
    stageObjects,
    oceanRing: false,
    fieldGates: (m.manifest?.gates ?? []).map((g) => ({
      targetIndex: g.targetIndex,
      targetId: g.targetId ?? null,
      x: g.x,
      z: g.z,
      y: g.y,
    })) satisfies PtFieldGateLink[],
    warpGates: manifestWarpGates(m),
    posWarpOut: m.manifest?.posWarpOut ?? null,
    limitLevel: m.manifest?.limitLevel ?? 0,
  };
  return { descriptor, manifest: m, spawn: resolvePtDevSpawn(field, transform, m) };
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

const LOG_INFO = '#8fd0ff';
const LOG_WARN = '#ffd37a';
const LOG_ERR = '#ff6a6a';

function teleportPlayer(player: Entity, x: number, y: number, z: number): void {
  player.pos.x = x;
  player.pos.y = y;
  player.pos.z = z;
  player.prevPos.x = x;
  player.prevPos.y = y;
  player.prevPos.z = z;
}

function listMaps(hud: PtDevHud): void {
  const maps = listPtDevMaps();
  hud.log(`[dev] ${maps.length} generated PT map packages (inspection only, none registered):`, LOG_INFO);
  for (const m of maps) {
    hud.log(
      `  ${m.id} | field#${m.fieldIndex} | ${m.verts}v/${m.faces}f` +
        ` | obj:${m.hasStageModule ? m.stageObjectFiles : 'none'}` +
        ` | starts:${m.startCount} | minimap:${m.minimap ? 'declared' : 'none'}` +
        ` | warnings:${m.warningCount}`,
      LOG_INFO,
    );
  }
  hud.log('[dev] load one with /ptmap <id>; restore Ricarten with /ptmap off', LOG_INFO);
}

function logMapInfo(hud: PtDevHud, loaded: PtDevLoadedMap): void {
  const { manifest: m, descriptor, spawn } = loaded;
  const inner = m.manifest ?? {};
  const stageNote = descriptor.stageObjects
    ? `${inner.stageObjects?.files?.length ?? descriptor.stageObjects.PT_STAGE_OBJECTS.length} objects`
    : 'none in package';
  const minimapNote = inner.minimap
    ? `declared (${inner.minimap}) - not converted, panel shows void`
    : 'none declared';
  hud.log(
    `[dev] /ptmap ${descriptor.id}: ${inner.mapName ?? '?'} (field #${inner.fieldIndex ?? '?'}, ${inner.state ?? '?'})`,
    LOG_INFO,
  );
  hud.log(
    `[dev] terrain ${m.field?.vertices ?? descriptor.field.PT_N_VERTEX}v / ${m.field?.faces ?? descriptor.field.PT_N_FACE}f` +
      ` | stage: ${stageNote} | starts: ${inner.startPoints?.length ?? 0}` +
      ` | minimap: ${minimapNote} | warnings: ${m.warnings?.length ?? 0}`,
    LOG_INFO,
  );
  if ((inner.stageObjects?.missing?.length ?? 0) > 0) {
    hud.log(`[dev] stage files missing from conversion: ${inner.stageObjects!.missing!.join(', ')}`, LOG_WARN);
  }
  for (const w of m.warnings ?? []) {
    hud.log(`[dev] conversion warning: ${typeof w === 'string' ? w : JSON.stringify(w)}`, LOG_WARN);
  }
  if (spawn) {
    const tag =
      spawn.kind === 'start'
        ? 'authored start'
        : spawn.kind === 'center'
          ? 'manifest center (no authored start)'
          : 'TEST-ONLY fallback (first walkable face - not an authored spawn)';
    hud.log(
      `[dev] spawn ${tag}: PT(${spawn.ptX.toFixed(0)}, ${spawn.ptZ.toFixed(0)}) -> WoC(${spawn.x.toFixed(1)}, ${spawn.y.toFixed(1)}, ${spawn.z.toFixed(1)})`,
      spawn.kind === 'fallback' ? LOG_WARN : LOG_INFO,
    );
  } else {
    hud.log(`[dev] ${descriptor.id}: no walkable surface found; player NOT teleported`, LOG_ERR);
  }
  hud.log('[dev] minimap unavailable for dev maps (only village-2 has a converted map texture)', LOG_WARN);
  hud.log('[dev] /ptmap off restores Ricarten', LOG_INFO);
}

// ---------------------------------------------------------------------------
// /ptmaplinks - the field's source-authentic connection inventory
// ---------------------------------------------------------------------------

const SE_LABEL = ['immediate', 'delayed', 'wing-ui'] as const;

function listMapLinks(hud: PtDevHud, arg: string | undefined): void {
  const g = ptMapLinksGraph();
  if (!g) {
    hud.log('[dev] maplinks graph missing; run `node scripts/pt-port/pt_map.mjs maplinks`', LOG_ERR);
    return;
  }

  let ref: number | string | undefined;
  if (arg !== undefined) {
    ref = /^\d+$/.test(arg) ? Number(arg) : arg;
    if (!ptMapLinksForField(ref)) {
      hud.log(`[dev] no registered field '${arg}' (id or fieldIndex)`, LOG_WARN);
      return;
    }
  } else {
    const active = activePtMapDescriptor();
    const byId = active ? ptMapLinksForField(active.id) : null;
    ref = byId?.field.fieldIndex ?? 'ricarten';
    if (!byId) {
      hud.log(`[dev] active map not a PT field; showing ricarten (use /ptmaplinks <id|index>)`, LOG_WARN);
    }
  }

  const links = ptMapLinksForField(ref);
  if (!links) return;
  const f = links.field;
  hud.log(
    `[dev] ${f.id ?? '?'} | field#${f.fieldIndex} | ${f.displayName ?? f.mapName ?? '?'} | state=${f.state ?? '?'}` +
      ` | level>=${f.limitLevel} | reachability=${f.reachability} (component ${f.component})`,
    LOG_INFO,
  );
  if (f.posWarpOut) {
    hud.log(`[dev]   PosWarpOut: (${f.posWarpOut.x}, ${f.posWarpOut.y}, ${f.posWarpOut.z})`, LOG_INFO);
  } else {
    hud.log(`[dev]   PosWarpOut: none (wing warps cannot arrive here)`, LOG_INFO);
  }

  if (links.fieldGates.length === 0) {
    hud.log('[dev]   FIELD_GATE: none', LOG_INFO);
  }
  for (const e of links.fieldGates) {
    const dir = e.authoredIn === f.fieldIndex ? 'authored here' : 'reciprocal (AddGate2)';
    hud.log(
      `[dev]   FIELD_GATE -> ${e.otherId ?? `field#${e.other}`} @ (${e.x}, ${e.z}, ${e.y}) [${dir}]${e.dead ? ' DEAD (point outside both footprints)' : ''}`,
      e.dead ? LOG_WARN : LOG_INFO,
    );
  }

  if (links.warpGates.length === 0) hud.log('[dev]   WARP_GATE: none here', LOG_INFO);
  for (const w of links.warpGates) {
    const exits = w.exits.map((e) => `${e.toId ?? `field#${e.to}`}(${e.x},${e.z})`).join(' ');
    hud.log(
      `[dev]   WARP_GATE @ (${w.x}, ${w.z}, ${w.y}) r=${w.size} h=${w.height} lv>=${w.limitLevel} SE=${w.specialEffect} (${SE_LABEL[w.specialEffect] ?? '?'}) -> ${w.exits.length ? exits : 'no exits'}`,
      LOG_INFO,
    );
  }
  for (const w of links.warpInbound) {
    hud.log(
      `[dev]   WARP_IN <- ${w.fromFieldId ?? `field#${w.fromField}`} @ (${w.exit.x}, ${w.exit.z}, ${w.exit.y})`,
      LOG_INFO,
    );
  }

  if (links.wingDestinations) {
    hud.log('[dev]   WARP_UI (wing map opens here; destinations):', LOG_INFO);
    for (const d of links.wingDestinations) {
      hud.log(
        `[dev]     icon ${d.icon}: ${d.name ?? '?'} -> ${d.fieldId ?? `field#${d.fieldIndex}`} lv>=${d.requiredLevel}`,
        LOG_INFO,
      );
    }
    const ha = g.wingWarp.haGate;
    hud.log(`[dev]     castle wing: ${ha.name ?? '?'} -> ${ha.fieldId ?? `field#${ha.fieldIndex}`} (Bless Castle clan only)`, LOG_INFO);
  }

  hud.log('[dev]   global teleports (usable anywhere the item/NPC is):', LOG_INFO);
  hud.log(
    `[dev]     NPC teleport: ${g.npcTeleport.destinations.map((d) => `${d.fieldId ?? d.fieldIndex}(${d.cost}c)`).join(' ')} | dungeon->dun-7 castle->castle war->dun-5(server) fall->fall-game`,
    LOG_INFO,
  );
  hud.log(
    `[dev]     ether cores: ${g.etherCore.map((d) => `${d.fieldId ?? d.fieldIndex}`).join(' ')} | teleport-core scrolls: ${g.teleportCore.length} destinations`,
    LOG_INFO,
  );
  for (const t of links.serverInbound) {
    hud.log(`[dev]   SERVER <- ${t.kind}${t.x !== undefined ? ` @ (${t.x}, ${t.z})` : ''} [${t.source}]`, LOG_WARN);
  }
}

/** The async body behind pt_map_dev_command's DEV-gated dynamic import. */
export async function execPtMapDevCommand(
  raw: string,
  hud: PtDevHud,
  player: Entity | undefined,
): Promise<void> {
  const args = raw.trim().split(/\s+/);

  if (/^\/ptmaps$/i.test(args[0])) {
    listMaps(hud);
    return;
  }

  if (/^\/ptmaplinks$/i.test(args[0])) {
    listMapLinks(hud, args[1]?.toLowerCase());
    return;
  }

  const id = args[1]?.toLowerCase();
  if (!id) {
    hud.log('[dev] usage: /ptmap <id> | /ptmap off | /ptmaps', LOG_WARN);
    return;
  }

  if (id === 'off' || id === 'exit') {
    setActivePtMap(null);
    if (player) {
      const y = ptRicartenSpawnY(PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z);
      teleportPlayer(player, PT_RICARTEN_SPAWN_X, y, PT_RICARTEN_SPAWN_Z);
    }
    hud.log('[dev] PT dev map cleared; Ricarten binding restored', LOG_INFO);
    return;
  }

  hud.log(`[dev] loading generated/pt-maps/${id}/ ...`, LOG_INFO);
  let loaded: PtDevLoadedMap;
  try {
    loaded = await loadPtDevMap(id);
  } catch (err) {
    hud.log(`[dev] ${err instanceof Error ? err.message : String(err)}`, LOG_ERR);
    return;
  }
  setActivePtMap(loaded.descriptor);
  logMapInfo(hud, loaded);
  if (loaded.spawn && player) {
    teleportPlayer(player, loaded.spawn.x, loaded.spawn.y, loaded.spawn.z);
  } else if (!player) {
    hud.log('[dev] no player entity; map installed but spawn skipped', LOG_WARN);
  }
}
