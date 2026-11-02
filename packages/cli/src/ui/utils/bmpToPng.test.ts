/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { convertBmpToPng } from './bmpToPng.js';

// Builds the smallest BMP that still exercises the parser: a 2x2 image
// with a distinct colour per pixel, stored bottom-up like most BMPs.
// `pixels` are [r, g, b] (or [r, g, b, a]) in reading order:
// top-left, top-right, bottom-left, bottom-right.
function buildBmp(
  pixels: number[][],
  bitCount: 24 | 32 = 24,
  topDown = false,
): Buffer {
  const width = 2;
  const height = 2;
  const bytesPerPixel = bitCount / 8;
  const rowSize = Math.floor((bitCount * width + 31) / 32) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;

  const bmp = Buffer.alloc(fileSize);
  bmp.write('BM', 0, 'ascii');
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(54, 10); // pixel data offset
  bmp.writeUInt32LE(40, 14); // BITMAPINFOHEADER
  bmp.writeInt32LE(width, 18);
  bmp.writeInt32LE(topDown ? -height : height, 22);
  bmp.writeUInt16LE(1, 26); // planes
  bmp.writeUInt16LE(bitCount, 28);
  bmp.writeUInt32LE(0, 30); // BI_RGB, no compression
  bmp.writeUInt32LE(pixelDataSize, 34);

  const rows = topDown ? [0, 1] : [1, 0]; // image rows in storage order
  for (const imageRow of rows) {
    const storageRow = topDown ? imageRow : height - 1 - imageRow;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixels[imageRow * width + x];
      const offset = 54 + storageRow * rowSize + x * bytesPerPixel;
      bmp[offset] = b;
      bmp[offset + 1] = g;
      bmp[offset + 2] = r;
      if (bitCount === 32) bmp[offset + 3] = a ?? 255;
    }
  }
  return bmp;
}

// Pulls the inflated pixel rows out of a PNG produced by convertBmpToPng.
function decodePixels(png: Buffer): { width: number; height: number } & {
  rows: Buffer;
} {
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    }
    offset += 12 + length;
  }
  return { width, height, rows: inflateSync(Buffer.concat(idat)) };
}

const PIXELS = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
];

describe('convertBmpToPng', () => {
  it('converts a 24-bit BMP, flipping rows and channel order', () => {
    const { width, height, rows } = decodePixels(
      convertBmpToPng(buildBmp(PIXELS)),
    );
    expect(width).toBe(2);
    expect(height).toBe(2);

    // Rows come back top-down, RGBA, each prefixed with a filter byte.
    const stride = 2 * 4 + 1;
    const px = (x: number, y: number) => {
      const i = y * stride + 1 + x * 4;
      return [rows[i], rows[i + 1], rows[i + 2], rows[i + 3]];
    };
    expect(px(0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(1, 0)).toEqual([0, 255, 0, 255]);
    expect(px(0, 1)).toEqual([0, 0, 255, 255]);
    expect(px(1, 1)).toEqual([255, 255, 0, 255]);
  });

  it('handles top-down BMPs (negative height)', () => {
    const { rows } = decodePixels(convertBmpToPng(buildBmp(PIXELS, 24, true)));
    const stride = 2 * 4 + 1;
    expect([rows[1], rows[2], rows[3]]).toEqual([255, 0, 0]);
    expect([rows[stride + 1], rows[stride + 2], rows[stride + 3]]).toEqual([
      0, 0, 255,
    ]);
  });

  it('treats a 32-bit BMP with all-zero alpha as opaque', () => {
    const withZeroAlpha = PIXELS.map(([r, g, b]) => [r, g, b, 0]);
    const { rows } = decodePixels(convertBmpToPng(buildBmp(withZeroAlpha, 32)));
    expect(rows[4]).toBe(255); // alpha of the first pixel
  });

  it('rejects input that is not an uncompressed 24/32-bit BMP', () => {
    expect(() => convertBmpToPng(Buffer.from('not a bmp at all'))).toThrow(
      'Not a BMP file',
    );
    const eightBit = buildBmp(PIXELS);
    eightBit.writeUInt16LE(8, 28);
    expect(() => convertBmpToPng(eightBit)).toThrow('bit depth');
  });
});
