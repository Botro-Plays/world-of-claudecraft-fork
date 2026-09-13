#!/usr/bin/env node
// Inspect a GLB file: list animations, meshes, and texture presence.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('Usage: node inspect_glb.mjs <file.glb>'); process.exit(1); }

const buf = readFileSync(file);
// GLB header: magic (4) + version (4) + length (4)
const magic = buf.readUInt32LE(0);
if (magic !== 0x46546c67) { console.error('Not a GLB file'); process.exit(1); }

const length = buf.readUInt32LE(8);
let offset = 12;
let jsonChunk = null;

while (offset < length) {
  const chunkLength = buf.readUInt32LE(offset);
  const chunkType = buf.readUInt32LE(offset + 4);
  if (chunkType === 0x4e4f534a) { // JSON
    jsonChunk = JSON.parse(buf.toString('utf8', offset + 8, offset + 8 + chunkLength));
  }
  offset += 8 + chunkLength;
  if (chunkLength % 4 !== 0) offset += 4 - (chunkLength % 4); // pad to 4 bytes
}

if (!jsonChunk) { console.error('No JSON chunk found'); process.exit(1); }

const animations = jsonChunk.animations || [];
const meshes = jsonChunk.meshes || [];
const materials = jsonChunk.materials || [];
const textures = jsonChunk.textures || [];
const images = jsonChunk.images || [];

console.log(`File: ${file}`);
console.log(`Meshes: ${meshes.length}`);
console.log(`Materials: ${materials.length}`);
console.log(`Textures: ${textures.length}`);
console.log(`Images: ${images.length}`);
console.log(`Animations: ${animations.length}`);
if (animations.length > 0) {
  animations.forEach(a => {
    console.log(`  ${a.name}: ${a.channels.length} channels`);
  });
} else {
  console.log('  (no animations)');
}
if (materials.length > 0) {
  materials.forEach((m, i) => {
    const hasTex = m.pbrMetallicRoughness?.baseColorTexture;
    console.log(`  Material ${i}: ${m.name || '(unnamed)'} ${hasTex ? '[textured]' : '[NO TEXTURE]'}`);
  });
}
