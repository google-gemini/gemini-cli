/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { deflateSync } from 'node:zlib';

// Minimal BMP -> PNG conversion for clipboard images.
//
// On WSL2 the Windows clipboard often shows up on the Linux side as
// image/bmp only, and the Gemini API does not accept BMP. Rather than
// pulling in an image library for this one case, this handles the BMP
// flavour that clipboard sources actually produce: uncompressed
// (BI_RGB) 24-bit or 32-bit bitmaps with a BITMAPINFOHEADER (or newer)
// DIB header. Anything else throws, and the caller treats that as
// "no usable image" and moves on.

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

// CRC32 (PNG flavour) lookup table, built once.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // bytes 10-12 stay 0 (compression, filter, interlace)

  // One filter byte (0 = none) in front of every row.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function convertBmpToPng(bmp: Buffer): Buffer {
  if (bmp.length < 54 || bmp.toString('ascii', 0, 2) !== 'BM') {
    throw new Error('Not a BMP file');
  }

  const pixelOffset = bmp.readUInt32LE(10);
  const dibSize = bmp.readUInt32LE(14);
  if (dibSize < 40) {
    throw new Error(`Unsupported DIB header size: ${dibSize}`);
  }

  const width = bmp.readInt32LE(18);
  const signedHeight = bmp.readInt32LE(22);
  const bitCount = bmp.readUInt16LE(28);
  const compression = bmp.readUInt32LE(30);
  if (compression !== 0) {
    throw new Error(`Compressed BMPs are not supported (${compression})`);
  }
  if (bitCount !== 24 && bitCount !== 32) {
    throw new Error(`Unsupported BMP bit depth: ${bitCount}`);
  }
  if (width <= 0 || signedHeight === 0) {
    throw new Error(`Invalid BMP dimensions: ${width}x${signedHeight}`);
  }

  // Negative height means rows are stored top-down instead of bottom-up.
  const topDown = signedHeight < 0;
  const height = Math.abs(signedHeight);
  const bytesPerPixel = bitCount / 8;
  // BMP rows are padded to a multiple of 4 bytes.
  const rowSize = Math.floor((bitCount * width + 31) / 32) * 4;
  if (bmp.length < pixelOffset + rowSize * height) {
    throw new Error('BMP data is truncated');
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = topDown ? y : height - 1 - y;
    const srcStart = pixelOffset + srcRow * rowSize;
    const dstStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      const src = srcStart + x * bytesPerPixel;
      const dst = dstStart + x * 4;
      // BMP stores pixels as BGR(A), PNG wants RGBA.
      rgba[dst] = bmp[src + 2];
      rgba[dst + 1] = bmp[src + 1];
      rgba[dst + 2] = bmp[src];
      rgba[dst + 3] = bitCount === 32 ? bmp[src + 3] : 255;
    }
  }

  if (bitCount === 32) {
    // A lot of clipboard BMPs leave the alpha byte at 0 even though the
    // image is fully opaque. If every alpha is 0, treat it as opaque
    // instead of producing an invisible PNG.
    let allZero = true;
    for (let i = 3; i < rgba.length; i += 4) {
      if (rgba[i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) {
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
    }
  }

  return encodePng(width, height, rgba);
}
