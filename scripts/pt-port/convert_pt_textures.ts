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

import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { bmpToPng } from './bmp_to_png';
import { tgaToPng } from './tga_to_png';

const GENERATED_MODULE = process.argv[2] || 'src/sim/pt_ricarten_field.generated.ts';
const PT_CLIENT_DIR =
  process.argv[3] ||
  join(process.env.PT_CLIENT_DIR || 'E:/CascadeProjects/PT-Project/MagicPT-Chinese/client', 'Field/Ricarten');
const OUT_DIR = process.argv[4] || 'public/textures/pt-ricarten';

// Read the texture manifest from the generated module.
// We parse it directly from the source to avoid importing the large module.
const generatedSrc = readFileSync(GENERATED_MODULE, 'utf8');
const manifestMatch = generatedSrc.match(/export const PT_TEXTURE_MANIFEST = (\[.*?\]);/s);
if (!manifestMatch) throw new Error('Could not find PT_TEXTURE_MANIFEST in generated module');
const manifest = JSON.parse(manifestMatch[1]) as { name: string; format: string; materialIndices: number[] }[];

console.log(`Texture manifest: ${manifest.length} unique textures`);

// Build a lookup of available files in the PT client directory (case-insensitive).
const availableFiles = new Map<string, string>();
for (const file of readdirSync(PT_CLIENT_DIR)) {
  availableFiles.set(file.toLowerCase(), file);
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

  if (!actualName) {
    console.log(`  NOT FOUND: ${tex.name}`);
    notFound++;
    continue;
  }

  const inPath = join(PT_CLIENT_DIR, actualName);
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

console.log('');
console.log(`Converted: ${converted}`);
console.log(`Failed: ${failed}`);
console.log(`Not found: ${notFound}`);
console.log(`Total output size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
