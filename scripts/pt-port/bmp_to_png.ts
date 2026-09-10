// BMP to PNG converter for Priston Tale encrypted BMP files.
// PT BMP files have the first 14 bytes obfuscated:
//   bytes 0-1: 'A','8' instead of 'B','M'
//   bytes 2-13: each byte has i*i added (where i is the byte index)
// This module decrypts the header, parses BMP pixel data, and encodes PNG.

import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

export function decryptBmpHeader(buf: Buffer): Buffer {
  const out = Buffer.from(buf);

  if (out.length >= 14 && out[0] === 0x41 && out[1] === 0x38) {
    out[0] = 0x42; // 'B'
    out[1] = 0x4d; // 'M'
    for (let i = 2; i < 14; i++) {
      out[i] = (out[i] - i * i) & 0xff;
    }
  }

  return out;
}

interface BmpInfo {
  width: number;
  height: number;
  bpp: number;
  dataOffset: number;
  compression: number;
  bottomUp: boolean;
}

function parseBmpHeader(buf: Buffer): BmpInfo {
  const dataOffset = buf.readUInt32LE(10);
  const rawHeight = buf.readInt32LE(22);
  const width = buf.readInt32LE(18);
  const height = Math.abs(rawHeight);
  const bpp = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);

  return { width, height, bpp, dataOffset, compression, bottomUp: rawHeight > 0 };
}

export function bmpToPng(bmpBuf: Buffer): Buffer {
  const decrypted = decryptBmpHeader(bmpBuf);
  const info = parseBmpHeader(decrypted);

  if (info.compression !== 0) {
    throw new Error(`Unsupported BMP compression: ${info.compression}`);
  }
  if (info.bpp !== 24 && info.bpp !== 32) {
    throw new Error(`Unsupported BMP bpp: ${info.bpp}`);
  }

  const { width, height, bpp, dataOffset, bottomUp } = info;
  const bytesPerPixel = bpp / 8;
  const rowSize = Math.floor((bpp * width + 31) / 32) * 4;

  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    const bmpY = bottomUp ? height - 1 - y : y;
    const rowStart = dataOffset + bmpY * rowSize;

    for (let x = 0; x < width; x++) {
      const pixOffset = rowStart + x * bytesPerPixel;
      const b = decrypted[pixOffset];
      const g = decrypted[pixOffset + 1];
      const r = decrypted[pixOffset + 2];

      const pngIdx = (y * width + x) * 4;
      png.data[pngIdx] = r;
      png.data[pngIdx + 1] = g;
      png.data[pngIdx + 2] = b;
      if (bpp === 32) {
        png.data[pngIdx + 3] = decrypted[pixOffset + 3];
      } else {
        // Default opaque; transparency applied via flood-fill below
        png.data[pngIdx + 3] = 255;
      }
    }
  }

  // PT uses edge-connected flood fill for black color key transparency.
  // Only black pixels connected to the texture border become transparent,
  // preserving black pixels inside the body texture.
  if (bpp === 24) {
    applyEdgeBlackAlphaKey(png, width, height, 0);
  }

  return PNG.sync.write(png);
}

// Flood-fill from texture edges: dark pixels (R,G,B <= threshold) connected
// to the border become transparent. Matches PT's ApplyEdgeBlackAlphaKeyBGRA.
function applyEdgeBlackAlphaKey(png: PNG, width: number, height: number, threshold: number): void {
  const limit = Math.min(threshold, 255);
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const isDark = (x: number, y: number): boolean => {
    const idx = (y * width + x) * 4;
    return png.data[idx] <= limit && png.data[idx + 1] <= limit && png.data[idx + 2] <= limit;
  };

  const tryQueue = (x: number, y: number): void => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = y * width + x;
    if (visited[i]) return;
    if (isDark(x, y)) {
      visited[i] = 1;
      queue.push(i);
    }
  };

  // Seed from all border pixels
  for (let x = 0; x < width; x++) {
    tryQueue(x, 0);
    tryQueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    tryQueue(0, y);
    tryQueue(width - 1, y);
  }

  // BFS flood fill
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % width;
    const y = Math.floor(idx / width);
    png.data[idx * 4 + 3] = 0; // make transparent
    tryQueue(x - 1, y);
    tryQueue(x + 1, y);
    tryQueue(x, y - 1);
    tryQueue(x, y + 1);
  }
}

export function convertBmpFile(bmpPath: string, pngPath: string): void {
  const bmpBuf = readFileSync(bmpPath);
  const pngBuf = bmpToPng(bmpBuf);
  writeFileSync(pngPath, pngBuf);
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('bmp_to_png.ts')) {
  const input = process.argv[2];
  const output = process.argv[3];

  if (!input || !output) {
    console.error('Usage: npx tsx scripts/pt-port/bmp_to_png.ts <input.bmp> <output.png>');
    process.exit(1);
  }

  try {
    convertBmpFile(input, output);
    console.log(`Converted ${input} -> ${output}`);
  } catch (err) {
    console.error('Conversion failed:', err);
    process.exit(1);
  }
}
