// TGA to PNG converter for Priston Tale encrypted TGA files.
// PT TGA files have the first 18 bytes obfuscated:
//   bytes 0-1: 'G','8' instead of 0,0
//   bytes 2-17: each byte has i*i added (where i is the byte index)
// This module decrypts the header, parses TGA pixel data (uncompressed + RLE),
// and encodes PNG. Supports 8/16/24/32-bit true-color and grayscale.

import { PNG } from 'pngjs';

export function decryptTgaHeader(buf: Buffer): Buffer {
  const out = Buffer.from(buf);

  // PT TGA files can be encrypted once or twice. The first decryption
  // subtracts i*i from bytes 2-17 and clears the 'G8' marker at 0-1.
  // Some files are encrypted twice, so the first pass produces another
  // encrypted header. Repeat until the header looks valid (imageType
  // is one of the known TGA types) or we hit a max of 2 passes.
  for (let pass = 0; pass < 2; pass++) {
    if (out.length >= 18 && out[0] === 0x47 && out[1] === 0x38) {
      out[0] = 0x00;
      out[1] = 0x00;
      for (let i = 2; i < 18; i++) {
        out[i] = (out[i] - i * i) & 0xff;
      }
    }
    // Check if the decrypted header is valid now.
    const imageType = out[2];
    if (imageType === 0 || imageType === 1 || imageType === 2 ||
        imageType === 3 || imageType === 9 || imageType === 10 || imageType === 11) {
      break;
    }
    // If not valid and this was the first pass, try decrypting bytes 2-17
    // again (doubly-encrypted files don't have the G8 marker after the
    // first pass, but the bytes are still scrambled).
    if (pass === 0) {
      for (let i = 2; i < 18; i++) {
        out[i] = (out[i] - i * i) & 0xff;
      }
      const recheck = out[2];
      if (recheck === 0 || recheck === 1 || recheck === 2 ||
          recheck === 3 || recheck === 9 || recheck === 10 || recheck === 11) {
        break;
      }
    }
  }

  return out;
}

function decodeTgaPixel(
  src: Buffer,
  offset: number,
  pixelDepth: number,
  imageType: number,
  alphaBits: number,
  out: Uint8Array,
): boolean {
  // Grayscale (type 3 or 11)
  if (imageType === 3 || imageType === 11) {
    if (pixelDepth === 8) {
      out[0] = src[offset];
      out[1] = src[offset];
      out[2] = src[offset];
      out[3] = 255;
      return true;
    }
    if (pixelDepth === 16) {
      out[0] = src[offset];
      out[1] = src[offset];
      out[2] = src[offset];
      out[3] = src[offset + 1];
      return true;
    }
    return false;
  }

  // True-color (type 2 or 10)
  if (pixelDepth === 32) {
    out[0] = src[offset]; // BGRA
    out[1] = src[offset + 1];
    out[2] = src[offset + 2];
    out[3] = src[offset + 3];
    return true;
  }
  if (pixelDepth === 24) {
    out[0] = src[offset]; // BGR
    out[1] = src[offset + 1];
    out[2] = src[offset + 2];
    out[3] = 255;
    return true;
  }
  if (pixelDepth === 16) {
    const value = src[offset] | (src[offset + 1] << 8);
    out[0] = ((value >> 0) & 0x1f) * 255 / 31 | 0;
    out[1] = ((value >> 5) & 0x1f) * 255 / 31 | 0;
    out[2] = ((value >> 10) & 0x1f) * 255 / 31 | 0;
    out[3] = alphaBits ? (value & 0x8000 ? 255 : 0) : 255;
    return true;
  }
  return false;
}

export function tgaToPng(tgaBuf: Buffer): Buffer {
  const decrypted = decryptTgaHeader(tgaBuf);
  if (decrypted.length < 18) throw new Error('TGA too small');

  const idLength = decrypted[0];
  const colorMapType = decrypted[1];
  const imageType = decrypted[2];
  const width = decrypted[12] | (decrypted[13] << 8);
  const height = decrypted[14] | (decrypted[15] << 8);
  const pixelDepth = decrypted[16];
  const imageDescriptor = decrypted[17];
  const alphaBits = imageDescriptor & 0x0f;

  if (colorMapType !== 0 || width === 0 || height === 0) {
    throw new Error(`Unsupported TGA: colorMapType=${colorMapType}, ${width}x${height}`);
  }
  if (imageType !== 2 && imageType !== 3 && imageType !== 10 && imageType !== 11) {
    throw new Error(`Unsupported TGA imageType: ${imageType}`);
  }

  const sourceBytesPerPixel = pixelDepth / 8;
  if (sourceBytesPerPixel === 0) throw new Error(`Unsupported TGA pixelDepth: ${pixelDepth}`);

  const pixelCount = width * height;
  const dataOffset = 18 + idLength;
  if (dataOffset >= decrypted.length) throw new Error('TGA data offset beyond file');

  const png = new PNG({ width, height });
  const topOrigin = (imageDescriptor & 0x20) !== 0;
  const rightOrigin = (imageDescriptor & 0x10) !== 0;
  const compressed = imageType === 10 || imageType === 11;

  const pixel = new Uint8Array(4);
  let sourceOffset = dataOffset;
  let outputIndex = 0;

  while (outputIndex < pixelCount) {
    let packetCount = 1;
    let runLengthPacket = false;

    if (compressed) {
      if (sourceOffset >= decrypted.length) throw new Error('TGA truncated (RLE header)');
      const packetHeader = decrypted[sourceOffset++];
      packetCount = (packetHeader & 0x7f) + 1;
      runLengthPacket = (packetHeader & 0x80) !== 0;
    }

    if (outputIndex + packetCount > pixelCount) throw new Error('TGA packet exceeds image');

    if (runLengthPacket) {
      if (sourceOffset + sourceBytesPerPixel > decrypted.length) throw new Error('TGA truncated (RLE data)');
      if (!decodeTgaPixel(decrypted, sourceOffset, pixelDepth, imageType, alphaBits, pixel)) throw new Error('TGA decode failed');
      sourceOffset += sourceBytesPerPixel;
    }

    for (let p = 0; p < packetCount; p++) {
      if (!runLengthPacket) {
        if (sourceOffset + sourceBytesPerPixel > decrypted.length) throw new Error('TGA truncated (raw data)');
        if (!decodeTgaPixel(decrypted, sourceOffset, pixelDepth, imageType, alphaBits, pixel)) throw new Error('TGA decode failed');
        sourceOffset += sourceBytesPerPixel;
      }

      const srcY = Math.floor(outputIndex / width);
      const srcX = outputIndex % width;
      const targetY = topOrigin ? srcY : (height - 1 - srcY);
      const targetX = rightOrigin ? (width - 1 - srcX) : srcX;
      const pngIdx = (targetY * width + targetX) * 4;

      // TGA stores BGRA, PNG expects RGBA — swap R and B
      png.data[pngIdx] = pixel[2];     // R
      png.data[pngIdx + 1] = pixel[1]; // G
      png.data[pngIdx + 2] = pixel[0]; // B
      png.data[pngIdx + 3] = pixel[3]; // A

      outputIndex++;
    }
  }

  // PT uses edge-connected flood fill for black color key transparency
  // (same as BMP). Only black pixels connected to the texture border
  // become transparent, preserving black pixels inside the body.
  if (pixelDepth === 24 || pixelDepth === 16) {
    applyEdgeBlackAlphaKey(png, width, height, 0);
  }

  return PNG.sync.write(png);
}

// Same flood-fill as bmp_to_png.ts
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

  for (let x = 0; x < width; x++) {
    tryQueue(x, 0);
    tryQueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    tryQueue(0, y);
    tryQueue(width - 1, y);
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % width;
    const y = Math.floor(idx / width);
    png.data[idx * 4 + 3] = 0;
    tryQueue(x - 1, y);
    tryQueue(x + 1, y);
    tryQueue(x, y - 1);
    tryQueue(x, y + 1);
  }
}
