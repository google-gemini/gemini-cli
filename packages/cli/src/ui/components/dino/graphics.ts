/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TREX_POSES_DATA } from './trex-poses-data.js';
import { PTERODACTYL_DATA } from './pterodactyl-data.js';

// Lookup table for 2x2 block characters based on 4 bits: (TL, TR, BL, BR)
// Index = (TL << 3) | (TR << 2) | (BL << 1) | BR
const BLOCK_LOOKUP = [
  ' ',
  '▗',
  '▖',
  '▄',
  '▝',
  '▐',
  '▞',
  '▟',
  '▘',
  '▚',
  '▌',
  '▙',
  '▀',
  '▜',
  '▛',
  '█',
];

class QuadrantCanvas {
  width: number;
  height: number;
  pixels: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height).fill(0);
  }

  clear() {
    this.pixels.fill(0);
  }

  set(x: number, y: number, value: number = 1) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.pixels[Math.floor(y) * this.width + Math.floor(x)] = value;
    }
  }

  get(x: number, y: number): number {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      return this.pixels[y * this.width + x];
    }
    return 0;
  }

  toString(): string {
    let output = '';
    for (let y = 0; y < this.height; y += 2) {
      for (let x = 0; x < this.width; x += 2) {
        const tl = this.get(x, y) ? 1 : 0;
        const tr = this.get(x + 1, y) ? 1 : 0;
        const bl = this.get(x, y + 1) ? 1 : 0;
        const br = this.get(x + 1, y + 1) ? 1 : 0;
        const index = (tl << 3) | (tr << 2) | (bl << 1) | br;
        output += BLOCK_LOOKUP[index];
      }
      output += '\n';
    }
    return output.trimEnd();
  }
}

// Mock context to maintain API compatibility with DinoGame.tsx
export class MockContext {
  canvas: QuadrantCanvas;
  constructor(canvas: QuadrantCanvas) {
    this.canvas = canvas;
  }
  fillRect(x: number, y: number, w: number, h: number) {
    // Only supports 1x1 fillRect for now as used in game
    if (w === 1 && h === 1) {
      this.canvas.set(x, y, 1);
    } else {
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
          this.canvas.set(x + i, y + j, 1);
        }
      }
    }
  }
  clearRect(x: number, y: number, w: number, h: number) {
    // Only used for full clear in game right now
    if (
      x === 0 &&
      y === 0 &&
      w === this.canvas.width &&
      h === this.canvas.height
    ) {
      this.canvas.clear();
    }
  }
}

export class GraphicsEngine {
  canvas: QuadrantCanvas;
  ctx: MockContext;
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas = new QuadrantCanvas(width, height);
    this.ctx = new MockContext(this.canvas);
  }

  clear() {
    this.canvas.clear();
  }

  toString(): string {
    return this.canvas.toString();
  }
}

export interface Sprite {
  width: number;
  height: number;
  data: Uint8Array; // RGBA data
}

export function loadDinoSprite(): Promise<Sprite> {
  return Promise.resolve({
    width: 132,
    height: 23,
    data: TREX_POSES_DATA,
  });
}

export function loadPterodactylSprite(): Promise<Sprite> {
  return Promise.resolve({
    width: 21,
    height: 13,
    data: PTERODACTYL_DATA,
  });
}

export function drawSprite(
  ctx: MockContext,
  sprite: Sprite,
  x: number,
  y: number,
  srcX: number = 0,
  srcY: number = 0,
  srcW: number = sprite.width,
  srcH: number = sprite.height,
) {
  for (let sy = 0; sy < srcH; sy++) {
    for (let sx = 0; sx < srcW; sx++) {
      // Ensure we don't read outside sprite bounds
      if (srcX + sx >= sprite.width || srcY + sy >= sprite.height) continue;

      const idx = (sprite.width * (srcY + sy) + (srcX + sx)) << 2;
      const r = sprite.data[idx];
      // const g = sprite.data[idx + 1];
      // const b = sprite.data[idx + 2];
      const a = sprite.data[idx + 3];

      // Draw if it's opaque enough AND dark enough (black on transparent/white)
      if (a > 128 && r < 128) {
        ctx.fillRect(Math.floor(x + sx), Math.floor(y + sy), 1, 1);
      }
    }
  }
}

export function drawBooleanSprite(
  ctx: MockContext,
  sprite: boolean[][],
  x: number,
  y: number,
) {
  for (let dy = 0; dy < sprite.length; dy++) {
    for (let dx = 0; dx < sprite[dy].length; dx++) {
      if (sprite[dy][dx]) {
        ctx.fillRect(Math.floor(x + dx), Math.floor(y + dy), 1, 1);
      }
    }
  }
}

// Keep these for obstacles for now
export const CACTUS_SMALL = [
  [false, false, true, false, false],
  [false, true, true, false, false],
  [false, true, true, false, false],
  [true, true, true, true, false],
  [true, true, true, true, false],
  [false, true, true, true, true],
  [false, true, true, true, true],
  [false, false, true, false, false],
  [false, false, true, false, false],
];

export const CACTUS_LARGE = [
  [false, false, true, true, false, false],
  [false, true, true, true, false, false],
  [false, true, true, true, false, false],
  [true, true, true, true, false, false],
  [true, true, true, true, true, false],
  [true, true, true, true, true, false],
  [true, true, true, true, true, true],
  [false, true, true, true, true, true],
  [false, true, true, true, true, true],
  [false, false, true, true, false, false],
  [false, false, true, true, false, false],
  [false, false, true, true, false, false],
];

export const PTERODACTYL = [
  [
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    true,
    false,
  ],
  [
    false,
    false,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    true,
    true,
    true,
  ],
  [true, true, true, true, true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true, true, false, false, false],
  [false, true, true, true, true, true, true, true, false, false, false, false],
  [
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
  ],
  [
    false,
    false,
    false,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
  ],
];

export const CLOUD = [
  [false, false, false, true, true, true, false, false, false, false, false],
  [false, true, true, true, true, true, true, true, true, false, false],
  [true, true, true, true, true, true, true, true, true, true, true],
  [false, false, false, false, false, false, false, false, false, false, false],
];
