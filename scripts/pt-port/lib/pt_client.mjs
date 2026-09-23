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

export function ptClientDir() {
  return process.env.PT_CLIENT_DIR || PT_CLIENT_DEFAULT;
}

export function ptSourceDir() {
  return process.env.PT_SOURCE_DIR || PT_SOURCE_DEFAULT;
}

// Resolve a manifest-relative path (e.g. 'Field/Ricarten/village-2.smd')
// inside the PT client tree.
export function ptClientPath(rel) {
  return join(ptClientDir(), rel);
}

export function ptClientExists(rel) {
  return existsSync(ptClientPath(rel));
}
