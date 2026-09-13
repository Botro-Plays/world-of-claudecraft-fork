import { readFileSync } from 'node:fs';
import { parseSmd } from './smd_parser.ts';

const buf = readFileSync('D:/From Luis Cezar Matias - Chinese MagicPT/Client/char/mount/Raptor/Raptor.smd');
const smb = parseSmd(readFileSync('D:/From Luis Cezar Matias - Chinese MagicPT/Client/char/mount/Raptor/Raptor.smb'));
const boneNames = smb.objects.map(b => b.nodeName);

const physStart = 86310;
const nV = 601;

// Hex dump first 5 physique entries (32 bytes each)
console.log('=== First 5 physique entries (32 bytes each at 86310) ===');
for (let i = 0; i < 5; i++) {
  const off = physStart + i * 32;
  const hex: string[] = [];
  const asc: string[] = [];
  for (let j = 0; j < 32; j++) {
    hex.push(buf[off + j].toString(16).padStart(2, '0'));
    asc.push(buf[off + j] >= 32 && buf[off + j] < 127 ? String.fromCharCode(buf[off + j]) : '.');
  }
  console.log('v' + i + ': ' + hex.join(' ') + '  |' + asc.join('') + '|');
}

// Check if the 32 bytes could be 8 int32 values
console.log('\n=== First 5 physique entries as int32 arrays ===');
for (let i = 0; i < 5; i++) {
  const off = physStart + i * 32;
  const vals: number[] = [];
  for (let j = 0; j < 8; j++) {
    vals.push(buf.readInt32LE(off + j * 4));
  }
  console.log('v' + i + ': [' + vals.join(', ') + ']');
}

// Check if any int32 value is in range [0, 66] (bone index)
console.log('\n=== Looking for bone indices (int32 in [0,66]) ===');
for (let j = 0; j < 8; j++) {
  let allValid = true;
  const vals = new Set<number>();
  for (let i = 0; i < nV; i++) {
    const v = buf.readInt32LE(physStart + i * 32 + j * 4);
    if (v < 0 || v > 66) { allValid = false; break; }
    vals.add(v);
  }
  if (allValid) {
    console.log('int32[' + j + ']: ALL values in [0,66]! distinct=' + vals.size);
  }
}

// Maybe the bone names are XOR-encoded or shifted
console.log('\n=== Try XOR decoding physique bytes ===');
for (const key of [0x80, 0xFF, 0x7F, 0x55, 0xAA]) {
  const decoded = Buffer.from(Array.from(buf.slice(physStart, physStart + 32)).map(b => b ^ key)).toString('ascii').replace(/[^\x20-\x7e]/g, '.');
  console.log('XOR 0x' + key.toString(16) + ': [' + decoded + ']');
}

// Check if 'Bip01' appears anywhere in the physique section
console.log('\n=== Search for Bip01 in physique section ===');
const bipBuf = Buffer.from('Bip01', 'ascii');
let found = false;
for (let i = physStart; i < physStart + 19232; i++) {
  if (buf.slice(i, i + 5).equals(bipBuf)) {
    console.log('Found Bip01 at offset ' + i + ' (physique + ' + (i - physStart) + ')');
    found = true;
  }
}
if (!found) console.log('Bip01 NOT found in physique section');

// Check first 4 bytes of each entry as uint32 (possible bone index)
console.log('\n=== First 4 bytes of each entry as uint32 ===');
const idxCounts = new Map<number, number>();
for (let i = 0; i < nV; i++) {
  const idx = buf.readUInt32LE(physStart + i * 32);
  idxCounts.set(idx, (idxCounts.get(idx) || 0) + 1);
}
const sorted = [...idxCounts.entries()].sort((a, b) => b[1] - a[1]);
console.log('Top 10 most common uint32 values:');
for (const [val, cnt] of sorted.slice(0, 10)) {
  console.log('  0x' + (val >>> 0).toString(16).padStart(8) + ' = ' + val + ': ' + cnt + ' vertices');
}
console.log('Total distinct:', idxCounts.size);

// Maybe the physique stores bone name HASHES instead of strings
// Let's compute the hash of each bone name and see if any match
console.log('\n=== Bone name hash matching ===');
// Simple hash: sum of char codes
function simpleHash(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h >>> 0;
}
const boneHashes = new Map<number, string>();
for (const name of boneNames) {
  boneHashes.set(simpleHash(name), name);
}

let hashMatches = 0;
for (let i = 0; i < nV; i++) {
  const h = buf.readUInt32LE(physStart + i * 32);
  if (boneHashes.has(h)) hashMatches++;
}
console.log('Simple hash matches: ' + hashMatches + '/' + nV);

// Also try: maybe the 32 bytes are a bone name but with different encoding
// The SMB bones are named "Bip01 XX_Baked". What if the SMD uses "Bip01 XX" (without _Baked)?
const shortBoneNames = boneNames.map(n => n.replace(/_Baked$/, ''));
const shortBoneSet = new Set(shortBoneNames);
console.log('\nShort bone names (without _Baked):', shortBoneNames.slice(0, 5).join(', '));

let shortMatches = 0;
for (let i = 0; i < nV; i++) {
  const name = buf.slice(physStart + i * 32, physStart + i * 32 + 32).toString('ascii').replace(/\0+$/, '');
  if (shortBoneSet.has(name)) shortMatches++;
}
console.log('Short bone name matches: ' + shortMatches + '/' + nV);

// What if the bone names use a different format entirely?
// Let's check what strings ARE in the physique section
console.log('\n=== All distinct non-empty strings in physique section ===');
const physStrings = new Set<string>();
for (let i = 0; i < nV; i++) {
  const name = buf.slice(physStart + i * 32, physStart + i * 32 + 32).toString('ascii').replace(/\0+$/, '').trim();
  if (name.length > 0 && name.charCodeAt(0) >= 32 && name.charCodeAt(0) < 127) {
    physStrings.add(name);
  }
}
console.log('Distinct readable strings:', physStrings.size);
if (physStrings.size > 0 && physStrings.size < 20) {
  for (const s of physStrings) console.log('  [' + s + ']');
}

// Check the remaining 2404 bytes after physique
const afterPhys = physStart + nV * 32;
console.log('\n=== Remaining ' + (buf.length - afterPhys) + ' bytes after physique (at ' + afterPhys + ') ===');
const hex: string[] = [];
const asc: string[] = [];
for (let j = 0; j < Math.min(64, buf.length - afterPhys); j++) {
  hex.push(buf[afterPhys + j].toString(16).padStart(2, '0'));
  asc.push(buf[afterPhys + j] >= 32 && buf[afterPhys + j] < 127 ? String.fromCharCode(buf[afterPhys + j]) : '.');
}
console.log(hex.join(' '));
console.log('|' + asc.join('') + '|');

// Check if the remaining 2404 bytes contain bone names
console.log('\n=== Search for Bip01 in remaining bytes ===');
for (let i = afterPhys; i < buf.length - 5; i++) {
  if (buf.slice(i, i + 5).equals(bipBuf)) {
    const name = buf.slice(i, i + 32).toString('ascii').replace(/\0+$/, '');
    console.log('Found at ' + i + ': [' + name + ']');
  }
}
