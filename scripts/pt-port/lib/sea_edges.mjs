// Sea-edge analysis for the connected PT world (Phase 6G, maplinks.json).
//
// Ricarten's renderer-side ocean extension (the horizon ring + deep-sea
// blocker in src/render/pt_terrain.ts) exists because that field's authored
// sea surface runs right up to the map boundary: past the edge is void,
// and the sky dome's below-horizon imagery shows through the translucent
// water as a pale shoreline rim and exposes the rectangular map corner.
//
// Other fields share that condition only where a bounds edge faces void
// AND carries water to it. "Faces void" here means not covered by a
// FieldGate neighbor: active+standby is the only co-render pair, and the
// gate scan is the only path that installs a neighbor, so an edge abutting
// a non-gate field (overlapping authored bounds, e.g. SeaA vs fore-3) or a
// dead gate never renders that field next door - it faces void.
//
//   1. walk each bounds edge at EDGE_STEP intervals; a sample is "exposed"
//      when no gate-neighbor's authored bounds contain the point;
//   2. merge contiguous exposed runs into sectors;
//   3. a sector becomes a sea edge when water-surface vertices (faces whose
//      material passes the field's water rule) sit within WATER_MARGIN;
//   4. per sector emit the sea level (median water-vert Y), the dominant
//      boundary-water material index, its authored UV density (uv per PT
//      unit, median across sector faces), and `reach`: the outward corridor
//      depth capped at the nearest neighbor footprint so a strip can never
//      overlay a co-rendered field's terrain.
//
// Everything below is derived from the shipped .smd - nothing is authored.

import { waterMaterialSet } from './stage_smd.mjs';

// PT units between coverage/corridor samples along a bounds edge.
const EDGE_STEP = 200;
// A point on the edge counts as covered when a neighbor's bounds contain it
// within this many PT units (abutting fields share edge coordinates up to
// float jitter between independent parses).
const EDGE_COVER_TOL = 8;
// Water vertices this close to an exposed sector count as boundary water.
const WATER_MARGIN = 600;
// A sector needs at least this much boundary water (about one face) before
// it earns a sea strip - keeps stray vertex pokes from spawning geometry.
const MIN_WATER_VERTS = 3;
// Strip reach: Ricarten's ring runs 4000 WoC yards past the edge (beyond
// every fog far plane), which is ~111k PT units at PT_SCALE 0.036.
const MAX_REACH = 112000;
// Corridor margin: a strip ends this many PT units before a neighbor's
// bounds so it can never z-fight or overlay the co-rendered field.
const CORRIDOR_MARGIN = 400;
// Corridors shallower than this produce no strip - a ~20yd ribbon of water
// wedged between two fields reads as clutter, not sea.
const MIN_REACH = 600;

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Exposed edge sectors of `b` not covered by any of `others`' bounds.
 * others = bounds of the field's non-dead FieldGate neighbors (the only
 * fields that can ever render beside it).
 * Returns { minX: [[z0,z1],...], maxX: [...], minZ: [[x0,x1],...], maxZ }.
 */
export function exposedEdgeSectors(b, others) {
  const covered = (x, z) =>
    others.some(
      (o) =>
        x >= o.minX - EDGE_COVER_TOL && x <= o.maxX + EDGE_COVER_TOL &&
        z >= o.minZ - EDGE_COVER_TOL && z <= o.maxZ + EDGE_COVER_TOL,
    );
  const out = { minX: [], maxX: [], minZ: [], maxZ: [] };
  const scan = (edge, alongFrom, alongTo, at) => {
    let runStart = null;
    for (let t = alongFrom; t <= alongTo + EDGE_STEP / 2; t += EDGE_STEP) {
      const tt = Math.min(t, alongTo);
      const [x, z] = at(tt);
      const open = !covered(x, z);
      if (open && runStart === null) runStart = tt;
      if (!open && runStart !== null) {
        out[edge].push([runStart, tt]);
        runStart = null;
      }
    }
    if (runStart !== null) out[edge].push([runStart, alongTo]);
    return out[edge];
  };
  scan('minX', b.minZ, b.maxZ, (z) => [b.minX, z]);
  scan('maxX', b.minZ, b.maxZ, (z) => [b.maxX, z]);
  scan('minZ', b.minX, b.maxX, (x) => [x, b.minZ]);
  scan('maxZ', b.minX, b.maxX, (x) => [x, b.maxZ]);
  return out;
}

// 2D ray-vs-AABB: distance from point p along unit dir (dx,dz) to the first
// entry into rect b, or Infinity when the ray misses.
function rayToBounds(px, pz, dx, dz, b) {
  let tNear = -Infinity, tFar = Infinity;
  if (dx === 0) {
    if (px <= b.minX || px >= b.maxX) return Infinity;
  } else {
    let t0 = (b.minX - px) / dx, t1 = (b.maxX - px) / dx;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tNear = Math.max(tNear, t0); tFar = Math.min(tFar, t1);
  }
  if (dz === 0) {
    if (pz <= b.minZ || pz >= b.maxZ) return Infinity;
  } else {
    let t0 = (b.minZ - pz) / dz, t1 = (b.maxZ - pz) / dz;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tNear = Math.max(tNear, t0); tFar = Math.min(tFar, t1);
  }
  if (tFar < Math.max(tNear, 0)) return Infinity;
  return Math.max(tNear, 0);
}

/**
 * Sea spec for one field, or null when no void-facing edge carries water.
 * smd: parseSmd() output; water: manifest water rule; b: field bounds;
 * others: bounds of the field's non-dead FieldGate neighbors.
 */
export function analyzeFieldSea(smd, water, b, others) {
  const sectors = exposedEdgeSectors(b, others);
  if (!Object.values(sectors).some((s) => s.length)) return null;

  const waterMats = waterMaterialSet(smd.materials, water);
  if (!waterMats.size) return null;

  const { vertices, faceA, faceB, faceC, faceMat, texLinkU, texLinkV } = smd;
  const waterFaces = [];
  for (let f = 0; f < smd.nFace; f++) {
    const mi = faceMat[f];
    if (!waterMats.has(mi)) continue;
    const vs = [faceA[f], faceB[f], faceC[f]].map((vi) => ({
      x: vertices[vi * 3],
      y: vertices[vi * 3 + 1],
      z: vertices[vi * 3 + 2],
    }));
    waterFaces.push({ vs, mi, f });
  }
  if (!waterFaces.length) return null;

  const outward = { minX: [-1, 0], maxX: [1, 0], minZ: [0, -1], maxZ: [0, 1] };

  const edges = [];
  const pushSector = (edge, from, to) => {
    const near = [];
    for (const wf of waterFaces) {
      let hit = false;
      for (const v of wf.vs) {
        const dEdge =
          edge === 'minX' ? v.x - b.minX :
          edge === 'maxX' ? b.maxX - v.x :
          edge === 'minZ' ? v.z - b.minZ : b.maxZ - v.z;
        const along = edge === 'minX' || edge === 'maxX' ? v.z : v.x;
        if (dEdge <= WATER_MARGIN && along >= from - WATER_MARGIN && along <= to + WATER_MARGIN) {
          hit = true;
          break;
        }
      }
      if (hit) near.push(wf);
    }
    if (near.length * 3 < MIN_WATER_VERTS) return;

    // Corridor depth: the closest neighbor footprint down-range of this
    // sector's outward normal. Strips must end before a co-rendered field.
    const [dx, dz] = outward[edge];
    const edgeVal = edge === 'minX' ? b.minX : edge === 'maxX' ? b.maxX : edge === 'minZ' ? b.minZ : b.maxZ;
    let reach = MAX_REACH;
    for (let t = from; t <= to + EDGE_STEP / 2; t += EDGE_STEP) {
      const tt = Math.min(t, to);
      const px = edge === 'minX' || edge === 'maxX' ? edgeVal : tt;
      const pz = edge === 'minX' || edge === 'maxX' ? tt : edgeVal;
      for (const o of others) {
        const d = rayToBounds(px, pz, dx, dz, o);
        if (d < reach) reach = d;
      }
    }
    reach = Math.floor(reach - CORRIDOR_MARGIN);
    if (reach < MIN_REACH) return;

    const byMat = new Map();
    for (const wf of near) byMat.set(wf.mi, (byMat.get(wf.mi) ?? 0) + 1);
    const matIdx = [...byMat.entries()].sort((a, b2) => b2[1] - a[1])[0][0];
    const level = median(near.flatMap((wf) => wf.vs.map((v) => v.y)));

    // Authored UV density: per face of the dominant material, |du| and |dv|
    // per PT unit across the face's XZ extent (texLinkU/V hold the face's
    // three corner uvs).
    const us = [];
    const vsD = [];
    for (const wf of near) {
      if (wf.mi !== matIdx) continue;
      const t = smd.faceTexLinkIdx[wf.f];
      if (t < 0) continue;
      const u = [texLinkU[t * 3], texLinkU[t * 3 + 1], texLinkU[t * 3 + 2]];
      const v = [texLinkV[t * 3], texLinkV[t * 3 + 1], texLinkV[t * 3 + 2]];
      const du = Math.max(...u) - Math.min(...u);
      const dv = Math.max(...v) - Math.min(...v);
      let maxSpan = 0;
      for (let i = 0; i < 3; i++) {
        const a = wf.vs[i], c = wf.vs[(i + 1) % 3];
        maxSpan = Math.max(maxSpan, Math.hypot(a.x - c.x, a.z - c.z));
      }
      if (du > 0 && maxSpan > 0) us.push(du / maxSpan);
      if (dv > 0 && maxSpan > 0) vsD.push(dv / maxSpan);
    }
    edges.push({
      edge,
      from: +from.toFixed(1),
      to: +to.toFixed(1),
      reach,
      level: +level.toFixed(1),
      materialIndex: matIdx,
      uScale: +(median(us) ?? 0.0017).toFixed(6),
      vScale: +(median(vsD) ?? 0.0017).toFixed(6),
    });
  };

  for (const [edge, segs] of Object.entries(sectors)) {
    for (const [from, to] of segs) pushSector(edge, from, to);
  }
  return edges.length ? { edges } : null;
}
