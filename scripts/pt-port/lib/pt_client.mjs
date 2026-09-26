// Shared PT client path resolution for the pt-port tooling.
//
// The PT source of truth is the MagicPT-Chinese checkout. Its location is
// machine-specific, so it is resolved from PT_CLIENT_DIR when set and falls
// back to the co-developer's canonical checkout path otherwise. Compiler
// output never embeds this path (generated headers carry manifest-relative
// source labels instead), keeping generated files machine-independent.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const PT_CLIENT_DEFAULT = 'E:/CascadeProjects/PT-Project/MagicPT-Chinese/client';
export const PT_SOURCE_DEFAULT = 'E:/CascadeProjects/PT-Project/MagicPT-Chinese/PT-Source';
export const PT_SERVER_DEFAULT = 'E:/CascadeProjects/PT-Project/MagicPT-Chinese/server';

export function ptClientDir() {
  return process.env.PT_CLIENT_DIR || PT_CLIENT_DEFAULT;
}

export function ptSourceDir() {
  return process.env.PT_SOURCE_DIR || PT_SOURCE_DEFAULT;
}

// The GameServer tree carries the server-side field data (.spm/.spp/.spc)
// and the monster definitions (GameServer/Monster/*.inf) that the
// population compiler reads. Same machine-specific resolution rule as the
// client tree: env override, then the canonical checkout path.
export function ptServerDir() {
  return process.env.PT_SERVER_DIR || PT_SERVER_DEFAULT;
}

// Resolve a manifest-relative path (e.g. 'Field/Ricarten/village-2.smd')
// inside the PT client tree.
export function ptClientPath(rel) {
  return join(ptClientDir(), rel);
}

export function ptClientExists(rel) {
  return existsSync(ptClientPath(rel));
}

export function ptServerPath(rel) {
  return join(ptServerDir(), rel);
}

export function ptServerExists(rel) {
  return existsSync(ptServerPath(rel));
}
