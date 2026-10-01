// Converts the authentic MagicPT client skill button bitmaps into the
// shipping 128x128 sRGB WebP set under public/ui/skills/<pt-class>/.
//
// Source: PT_SKILL_IMAGE_DIR (default D:\From Luis Cezar Matias - Chinese
// MagicPT\Client\image\Sinimage\skill) - <ClassDir>\Button\<fileName>.bmp.
// The "bmp" files are a custom container: a 14-byte obfuscation header, then a
// standard BITMAPINFOHEADER (width, height, planes=1, bpp=24) and bottom-up
// BGR pixel data at offset 54. Verified against TF14 raving.bmp: 49x46,
// stride = align4(49*3) = 148.
//
//   node scripts/pt-port/convert_pt_skill_icons.mjs
//
// Emits <id>.webp per skill plus a per-class mapping.json provenance record
// (source pack, source file, output). Re-running is idempotent; it refuses to
// write anything that fails the decode or the 15 KiB converter cap.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const catalogPath = join(repoRoot, 'generated/pt-maps/pt_skill_catalog.generated.ts');
const skillsDir = join(repoRoot, 'public/ui/skills');

const PT_IMAGE_DIR =
  process.env.PT_SKILL_IMAGE_DIR ??
  'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\image\\Sinimage\\skill';

const CLASS_DIR = {
  tempskron_fighter: 'Fighter',
  tempskron_mechanician: 'Mecha',
  tempskron_pikeman: 'Pikeman',
  tempskron_archer: 'Archer',
  morion_knight: 'Knight',
  morion_atalanta: 'Atalanta',
  morion_priestess: 'Priestess',
  morion_magician: 'Magician',
  atlanteon_assassin: 'Assassin',
  atlanteon_martial_artist: 'Martial',
  atlanteon_shaman: 'Shaman',
};

const ICON_SIZE = 128;
const SIZE_CAP = 15 * 1024;
const webpOptions = { alphaQuality: 100, smartSubsample: true, effort: 6 };

const source = readFileSync(catalogPath, 'utf8');
const blocks = [...source.matchAll(/^  (pt_[a-z0-9_]+): \{([\s\S]*?)\n  \},/gm)];
if (blocks.length !== 220) throw new Error(`expected 220 pt skills, found ${blocks.length}`);

const field = (body, name) => {
  const m = body.match(new RegExp(`${name}: "([^"]*)"`));
  return m ? m[1] : null;
};

function decodePtBitmap(bytes, label) {
  if (bytes.length < 54) throw new Error(`${label}: truncated (${bytes.length} B)`);
  const width = bytes.readInt32LE(18);
  const height = bytes.readInt32LE(22);
  const planes = bytes.readUInt16LE(26);
  const bpp = bytes.readUInt16LE(28);
  if (width <= 0 || height <= 0 || planes !== 1 || bpp !== 24) {
    throw new Error(`${label}: unexpected header ${width}x${height} planes=${planes} bpp=${bpp}`);
  }
  const stride = Math.ceil((width * 3) / 4) * 4;
  const need = 54 + stride * height;
  if (bytes.length < need) {
    throw new Error(`${label}: needs ${need} B, has ${bytes.length}`);
  }
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const srcRow = 54 + (height - 1 - y) * stride; // bottom-up
    for (let x = 0; x < width; x++) {
      const si = srcRow + x * 3;
      const di = (y * width + x) * 3;
      rgb[di] = bytes[si + 2]; // B -> R
      rgb[di + 1] = bytes[si + 1]; // G
      rgb[di + 2] = bytes[si]; // R -> B
    }
  }
  return { rgb, width, height };
}

const byClass = new Map();
let converted = 0;
for (const block of blocks) {
  const id = block[1];
  const body = block[2];
  const cls = field(body, 'class');
  const fileName = field(body, 'fileName');
  const classDir = CLASS_DIR[cls];
  if (!classDir) throw new Error(`${id}: unknown pt class "${cls}"`);
  if (!fileName) throw new Error(`${id}: no fileName in catalog`);

  const srcPath = join(PT_IMAGE_DIR, classDir, 'Button', `${fileName}.bmp`);
  if (!existsSync(srcPath)) throw new Error(`${id}: missing source ${srcPath}`);
  const { rgb, width, height } = decodePtBitmap(readFileSync(srcPath), id);

  let bytes = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .resize(ICON_SIZE, ICON_SIZE, { kernel: 'lanczos3' })
    .webp({ ...webpOptions, quality: 82 })
    .toBuffer();
  if (bytes.length > SIZE_CAP) {
    bytes = await sharp(rgb, { raw: { width, height, channels: 3 } })
      .resize(ICON_SIZE, ICON_SIZE, { kernel: 'lanczos3' })
      .webp({ ...webpOptions, quality: 75 })
      .toBuffer();
  }
  if (bytes.length > SIZE_CAP) {
    throw new Error(`${id}: ${bytes.length} B exceeds the 15 KiB converter cap`);
  }

  const outDir = join(skillsDir, cls);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${id}.webp`), bytes);
  if (!byClass.has(cls)) byClass.set(cls, []);
  byClass.get(cls).push({ abilityId: id, sourceFile: `${classDir}/Button/${fileName}.bmp` });
  converted++;
}

for (const [cls, entries] of byClass) {
  entries.sort((a, b) => a.abilityId.localeCompare(b.abilityId));
  const mapping = {
    license:
      'Priston Tale client artwork, converted for the Botro fork. The source bitmaps ship in the ' +
      'MagicPT-Chinese client image tree; provenance rows here record the exact source file per icon.',
    generatedSource: 'MagicPT-Chinese client skill button bitmaps',
    iconSize: ICON_SIZE,
    converter: 'scripts/pt-port/convert_pt_skill_icons.mjs',
    abilities: entries.map(({ abilityId, sourceFile }) => ({
      abilityId,
      sourcePack: 'magicpt_chinese_client_skill_buttons',
      sourceFile,
      output: `${abilityId}.webp`,
    })),
  };
  writeFileSync(join(skillsDir, cls, 'mapping.json'), `${JSON.stringify(mapping, null, 2)}\n`);
}

console.log(`converted ${converted} PT skill icons into ${skillsDir}`);
