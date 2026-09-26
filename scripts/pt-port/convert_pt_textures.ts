// Convert PT textures referenced by a generated field module to PNG.
//
// Reads the texture manifest from the generated module, finds each texture
// file in the PT texture directory, and converts it using the existing
// bmp_to_png / tga_to_png converters (which handle the PT header obfuscation).
//
// Usage:
//   npx tsx scripts/pt-port/convert_pt_textures.ts [generatedModule] [texDir] [outDir]
//
// Defaults preserve the Ricarten invocation:
//   src/sim/pt_ricarten_field.generated.ts
//   $PT_CLIENT_DIR/Field/Ricarten
//   public/textures/pt-ricarten

import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { bmpToPng } from './bmp_to_png';
import { tgaToPng } from './tga_to_png';
import { ptClientPath } from './lib/pt_client.mjs';

const GENERATED_MODULE = process.argv[2] || 'src/sim/pt_ricarten_field.generated.ts';
const PT_CLIENT_DIR =
  process.argv[3] ||
  join(process.env.PT_CLIENT_DIR || 'E:/CascadeProjects/PT-Project/MagicPT-Chinese/client', 'Field/Ricarten');
const OUT_DIR = process.argv[4] || 'public/textures/pt-ricarten';
// argv[5]: absolute path to the field's minimap TGA (Field/map/<map>.tga).
// Converted to <outDir>/minimap-<stem>.png, matching the committed Ricarten
// asset name (minimap-village-2.png). Conversion only - no UI change.
const MINIMAP_SRC = process.argv[5];

// Read the texture manifest from the generated module.
// We parse it directly from the source to avoid importing the large module.
const generatedSrc = readFileSync(GENERATED_MODULE, 'utf8');
// Field modules export PT_TEXTURE_MANIFEST (field SMD materials); stage
// object modules export PT_STAGE_TEXTURE_MANIFEST (their own material
// tables). Either is a valid conversion source.
const manifestMatch = generatedSrc.match(/export const PT_(?:STAGE_)?TEXTURE_MANIFEST(?::[^=]+)?\s*=\s*(\[.*?\]);/s);
if (!manifestMatch) throw new Error('Could not find PT_TEXTURE_MANIFEST in generated module');
const manifest = JSON.parse(manifestMatch[1]) as { name: string; format: string; materialIndices?: number[] }[];

console.log(`Texture manifest: ${manifest.length} unique textures`);

// Build a lookup of available files in the PT client directory (case-insensitive).
const availableFiles = new Map<string, string>();
for (const file of readdirSync(PT_CLIENT_DIR)) {
  availableFiles.set(file.toLowerCase(), file);
}

// Texture names embed their authored directory (e.g. "field\custom\fbwa_0.bmp"
// referenced by the fo2 field whose own dir is Field/forest). When the
// basename is absent from the field's texture dir, resolve the embedded dir
// under the client root, case-insensitively. This only follows the authored
// path - it never invents or renames assets.
const dirListingCache = new Map<string, Map<string, string>>();
function listingFor(absDir: string): Map<string, string> {
  let m = dirListingCache.get(absDir);
  if (!m) {
    m = new Map();
    if (existsSync(absDir)) {
      for (const f of readdirSync(absDir)) m.set(f.toLowerCase(), f);
    }
    dirListingCache.set(absDir, m);
  }
  return m;
}

function resolveEmbeddedPath(texName: string): string | null {
  // Source names occasionally carry doubled separators ("field\custom\\x").
  const parts = texName.replace(/\\/g, '/').split('/').filter((p) => p !== '');
  if (parts.length < 2) return null;
  const dirParts = parts.slice(0, -1);
  const fileName = parts[parts.length - 1];
  let abs = ptClientPath('.');
  for (const part of dirParts) {
    const actual = listingFor(abs).get(part.toLowerCase());
    if (!actual) return null;
    abs = join(abs, actual);
  }
  const actualFile = listingFor(abs).get(fileName.toLowerCase());
  if (!actualFile) return null;
  // Degenerate source names can point at a directory (e.g. 'field\Sod\L').
  const resolved = join(abs, actualFile);
  return statSync(resolved).isFile() ? resolved : null;
}

mkdirSync(OUT_DIR, { recursive: true });

let converted = 0;
let failed = 0;
let notFound = 0;
let totalSize = 0;

for (const tex of manifest) {
  // PT texture names may include path prefixes (e.g. "Field\Ricarten\name.bmp").
  // Strip to just the filename for lookup.
  const fileName = basename(tex.name.replace(/\\/g, '/'));
  const lowerName = fileName.toLowerCase();
  const actualName = availableFiles.get(lowerName);

  let inPath: string;
  if (actualName) {
    inPath = join(PT_CLIENT_DIR, actualName);
  } else {
    // Category-A resolution: the name's own authored directory.
    const embedded = resolveEmbeddedPath(tex.name);
    if (!embedded) {
      console.log(`  NOT FOUND: ${tex.name}`);
      notFound++;
      continue;
    }
    inPath = embedded;
  }
  const outName = basename(lowerName, extname(lowerName)) + '.png';
  const outPath = join(OUT_DIR, outName);

  try {
    const buf = readFileSync(inPath);
    // PT materials can reference PNGs directly (e.g. Iron/axe.png) - pass
    // them through; only BMP/TGA need decoding.
    const png = lowerName.endsWith('.png')
      ? buf
      : lowerName.endsWith('.tga')
        ? tgaToPng(buf)
        : bmpToPng(buf);
    writeFileSync(outPath, png);
    converted++;
    totalSize += png.length;
    console.log(`  OK: ${actualName} -> ${outName} (${png.length} bytes)`);
  } catch (e) {
    console.log(`  FAIL: ${actualName} - ${(e as Error).message}`);
    failed++;
  }
}

// Per-field minimap: authentic Field/map/<map>.tga -> minimap-<stem>.png.
let minimapStatus = 'none';
if (MINIMAP_SRC) {
  if (!existsSync(MINIMAP_SRC)) {
    minimapStatus = `not-found:${MINIMAP_SRC}`;
  } else {
    try {
      const stem = basename(MINIMAP_SRC, extname(MINIMAP_SRC)).toLowerCase();
      const png = tgaToPng(readFileSync(MINIMAP_SRC));
      writeFileSync(join(OUT_DIR, `minimap-${stem}.png`), png);
      minimapStatus = `minimap-${stem}.png (${png.length} bytes)`;
      totalSize += png.length;
    } catch (e) {
      minimapStatus = `failed:${(e as Error).message}`;
    }
  }
}

console.log('');
console.log(`Converted: ${converted}`);
console.log(`Failed: ${failed}`);
console.log(`Not found: ${notFound}`);
console.log(`Minimap: ${minimapStatus}`);
console.log(`Total output size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
