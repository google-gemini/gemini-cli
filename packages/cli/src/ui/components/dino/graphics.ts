/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TREX_POSES_DATA } from './trex-poses-data.js';
import { PTERODACTYL_DATA } from './pterodactyl-data.js';
import { CLOUD_DATA } from './cloud-data.js';
import { TREX_DUCK_LEFT_DATA } from './trex-duck-left-data.js';
import { TREX_DUCK_RIGHT_DATA } from './trex-duck-right-data.js';
import { OBSTACLE_LARGE_SPRITE_DATA } from './obstacle-large-sprite-data.js';
import { OBSTACLE_SMALL_SPRITE_DATA } from './obstacle-small-sprite-data.js';
import { HORIZON_DATA } from './horizon-data.js';
import { GAME_OVER_SPRITE_DATA } from './game-over-sprite-data.js';
import { shortAsciiLogo, longAsciiLogo, tinyAsciiLogo } from '../AsciiArt.js';

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

export const COLOR_DEFAULT = 1;
export const COLOR_GRAY = 2;

const GRADIENT_STOPS = [
  { r: 71, g: 150, b: 228 }, // #4796E4
  { r: 132, g: 122, b: 206 }, // #847ACE
  { r: 195, g: 103, b: 127 }, // #C3677F
];
const GRADIENT_STEPS = 32;
const GRADIENT_START_IDX = 10;

const GRADIENT_ANSI: string[] = [];
for (let i = 0; i < GRADIENT_STEPS; i++) {
  const t = i / (GRADIENT_STEPS - 1);
  let r;
  let g;
  let b;
  if (t < 0.5) {
    const t2 = t * 2;
    r = Math.round(
      GRADIENT_STOPS[0].r + (GRADIENT_STOPS[1].r - GRADIENT_STOPS[0].r) * t2,
    );
    g = Math.round(
      GRADIENT_STOPS[0].g + (GRADIENT_STOPS[1].g - GRADIENT_STOPS[0].g) * t2,
    );
    b = Math.round(
      GRADIENT_STOPS[0].b + (GRADIENT_STOPS[1].b - GRADIENT_STOPS[0].b) * t2,
    );
  } else {
    const t2 = (t - 0.5) * 2;
    r = Math.round(
      GRADIENT_STOPS[1].r + (GRADIENT_STOPS[2].r - GRADIENT_STOPS[1].r) * t2,
    );
    g = Math.round(
      GRADIENT_STOPS[1].g + (GRADIENT_STOPS[2].g - GRADIENT_STOPS[1].g) * t2,
    );
    b = Math.round(
      GRADIENT_STOPS[1].b + (GRADIENT_STOPS[2].b - GRADIENT_STOPS[1].b) * t2,
    );
  }
  GRADIENT_ANSI.push(`\x1b[38;2;${r};${g};${b}m`);
}

export function getGradientColor(t: number): number {
  const clampedT = Math.max(0, Math.min(1, t));
  const idx = Math.floor(clampedT * (GRADIENT_STEPS - 1));
  return GRADIENT_START_IDX + idx;
}

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

  set(x: number, y: number, color: number = COLOR_DEFAULT) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.pixels[Math.floor(y) * this.width + Math.floor(x)] = color;
    }
  }

  get(x: number, y: number): number {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      return this.pixels[y * this.width + x];
    }
    return 0;
  }

  toLines(minY: number = 0, maxY: number = this.height): string[] {
    const lines: string[] = [];

    // Allow 1/2 line scrolling (1 dot) by not forcing startY to be even.
    const startY = Math.max(0, Math.floor(minY));
    const endY = Math.min(this.height, maxY);

    for (let y = startY; y < endY; y += 2) {
      let line = '';
      let currentColor = 0; // 0=none/reset

      for (let x = 0; x < this.width; x += 2) {
        const p1 = this.get(x, y);
        const p2 = this.get(x + 1, y);
        const p3 = this.get(x, y + 1);
        const p4 = this.get(x + 1, y + 1);

        let color = 0;
        // Find most frequent non-zero color
        const colors = [p1, p2, p3, p4].filter((c) => c > 0);
        if (colors.length > 0) {
          let maxCount = 0;
          for (const c of colors) {
            let count = 0;
            for (const other of colors) {
              if (other === c) count++;
            }
            if (count > maxCount) {
              maxCount = count;
              color = c;
            } else if (count === maxCount) {
              // Tie-breaker: prefer larger index (e.g. gradient over default/gray)
              if (c > color) color = c;
            }
          }
        }

        const tl = p1 > 0 ? 1 : 0;
        const tr = p2 > 0 ? 1 : 0;
        const bl = p3 > 0 ? 1 : 0;
        const br = p4 > 0 ? 1 : 0;
        const index = (tl << 3) | (tr << 2) | (bl << 1) | br;
        const char = BLOCK_LOOKUP[index];

        if (color !== currentColor) {
          if (color === COLOR_DEFAULT) line += '\x1b[39m';
          // Reset to default foreground
          else if (color === COLOR_GRAY) line += '\x1b[90m';
          // Bright Black (Gray)
          else if (
            color >= GRADIENT_START_IDX &&
            color < GRADIENT_START_IDX + GRADIENT_STEPS
          ) {
            line += GRADIENT_ANSI[color - GRADIENT_START_IDX];
          } else if (color === 0) line += '\x1b[39m'; // Reset for empty space if we were colored
          currentColor = color === 0 ? 0 : color;
        }

        line += char;
      }
      // Ensure reset at end of line
      if (currentColor !== 0) {
        line += '\x1b[39m';
      }
      lines.push(line);
    }
    return lines;
  }
}

// Mock context to maintain API compatibility with DinoGame.tsx
export class MockContext {
  canvas: QuadrantCanvas;
  constructor(canvas: QuadrantCanvas) {
    this.canvas = canvas;
  }
  setPixel(x: number, y: number, color: number = COLOR_DEFAULT) {
    this.canvas.set(x, y, color);
  }
  fillRect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: number = COLOR_DEFAULT,
  ) {
    if (w === 1 && h === 1) {
      this.canvas.set(x, y, color);
    } else {
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
          this.canvas.set(x + i, y + j, color);
        }
      }
    }
  }
  clearRect(x: number, y: number, w: number, h: number) {
    if (w === 1 && h === 1) {
      this.canvas.set(x, y, 0);
    } else if (
      x === 0 &&
      y === 0 &&
      w === this.canvas.width &&
      h === this.canvas.height
    ) {
      this.canvas.clear();
    } else {
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
          this.canvas.set(x + i, y + j, 0);
        }
      }
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

  toLines(minY?: number, maxY?: number): string[] {
    return this.canvas.toLines(minY, maxY);
  }

  toString(minY?: number, maxY?: number): string {
    return this.canvas.toLines(minY, maxY).join('\n');
  }
}

export interface Sprite {
  width: number;
  height: number;
  data: Uint8Array; // RGBA data
}

function parseSprite(ascii: string): Sprite {
  const lines = ascii.split('\n');
  // Trim empty start/end lines if they exist (often happens with `\n...` templates)
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

  if (lines.length === 0) {
    return { width: 0, height: 0, data: new Uint8Array(0) };
  }

  const height = lines.length;
  const width = Math.max(...lines.map((l) => l.length));
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const line = lines[y];
    for (let x = 0; x < width; x++) {
      const char = line[x] || ' ';
      const idx = (width * y + x) * 4;
      if (char === '█') {
        // Solid (black/dark)
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 255;
      } else if (char === '░') {
        // White/Light
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = 255;
      } else {
        // Transparent
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }

  return { width, height, data };
}

export function loadDinoSprite(): Promise<Sprite> {
  return Promise.resolve(parseSprite(TREX_POSES_DATA));
}

export function loadPterodactylSprite(): Promise<Sprite> {
  return Promise.resolve(parseSprite(PTERODACTYL_DATA));
}

export function loadCloudSprite(): Promise<Sprite> {
  return Promise.resolve(parseSprite(CLOUD_DATA));
}

export function loadDinoDuckLeftSprite(): Promise<Sprite> {
  return Promise.resolve(parseSprite(TREX_DUCK_LEFT_DATA));
}

export function loadDinoDuckRightSprite(): Promise<Sprite> {
  return Promise.resolve(parseSprite(TREX_DUCK_RIGHT_DATA));
}

export function loadObstacleLargeSprite(): Promise<Sprite> {
  return Promise.resolve(parseSprite(OBSTACLE_LARGE_SPRITE_DATA));
}

export function loadObstacleSmallSprite(): Promise<Sprite> {
  return Promise.resolve(parseSprite(OBSTACLE_SMALL_SPRITE_DATA));
}

export function loadHorizonSprite(): Promise<Sprite> {
  return Promise.resolve(parseSprite(HORIZON_DATA));
}

export function loadGameOverSprite(): Promise<Sprite> {
  return Promise.resolve(parseSprite(GAME_OVER_SPRITE_DATA));
}

export function loadShortAsciiLogo(): Promise<Sprite> {
  return Promise.resolve(parseSprite(shortAsciiLogo));
}

export function loadLongAsciiLogo(): Promise<Sprite> {
  return Promise.resolve(parseSprite(longAsciiLogo));
}

export function loadTinyAsciiLogo(): Promise<Sprite> {
  return Promise.resolve(parseSprite(tinyAsciiLogo));
}

export const DIGIT_WIDTH = 20;
export const DIGIT_HEIGHT = 12;
export const DIGIT_Y = 0;
export const HI_TEXT_RECT = { x: 200, y: 0, w: 40, h: 12 }; // "HI" together

export const LETTER_WIDTH = 23;
export const LETTER_HEIGHT = 13;
export const LETTER_Y = 13;
// Indices into the packed "GAMEOVER" sprite strip
export const GAME_OVER_INDICES = [0, 1, 2, 3, -1, 4, 5, 6, 7];

export const CACTUS_LARGE_DEFINITIONS = [
  { x: 0, y: 0, w: 25, h: 26 },
  { x: 25, y: 0, w: 25, h: 26 },
  { x: 50, y: 0, w: 25, h: 26 },
  { x: 75, y: 0, w: 25, h: 26 },
  { x: 100, y: 0, w: 50, h: 26 },
];

export const CACTUS_SMALL_DEFINITIONS = [
  { x: 0, y: 0, w: 17, h: 18 },
  { x: 17, y: 0, w: 17, h: 18 },
  { x: 34, y: 0, w: 17, h: 18 },
  { x: 51, y: 0, w: 17, h: 18 },
  { x: 68, y: 0, w: 17, h: 18 },
  { x: 85, y: 0, w: 17, h: 18 },
];

export function drawSprite(
  ctx: MockContext,
  sprite: Sprite,
  x: number,
  y: number,
  srcX: number = 0,
  srcY: number = 0,
  srcW: number = sprite.width,
  srcH: number = sprite.height,
  color: number = COLOR_DEFAULT,
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

      // Draw if it's opaque enough
      if (a > 128) {
        if (r < 128) {
          // Dark -> draw
          ctx.setPixel(Math.floor(x + sx), Math.floor(y + sy), color);
        } else {
          // Light -> clear (border)
          ctx.setPixel(Math.floor(x + sx), Math.floor(y + sy), 0);
        }
      }
    }
  }
}

export function drawSpriteGradient(
  ctx: MockContext,
  sprite: Sprite,
  x: number,
  y: number,
) {
  for (let sy = 0; sy < sprite.height; sy++) {
    for (let sx = 0; sx < sprite.width; sx++) {
      const idx = (sprite.width * sy + sx) << 2;
      const r = sprite.data[idx];
      const a = sprite.data[idx + 3];

      if (a > 128) {
        if (r < 128) {
          // Dark -> draw with gradient
          const t = sx / (sprite.width - 1);
          const color = getGradientColor(t);
          ctx.setPixel(Math.floor(x + sx), Math.floor(y + sy), color);
        } else {
          // Light -> clear
          ctx.setPixel(Math.floor(x + sx), Math.floor(y + sy), 0);
        }
      }
    }
  }
}

export function drawBooleanSprite(
  ctx: MockContext,
  sprite: boolean[][],
  x: number,
  y: number,
  color: number = COLOR_DEFAULT,
) {
  for (let dy = 0; dy < sprite.length; dy++) {
    for (let dx = 0; dx < sprite[dy].length; dx++) {
      if (sprite[dy][dx]) {
        ctx.setPixel(Math.floor(x + dx), Math.floor(y + dy), color);
      }
    }
  }
}

// Keep these for obstacles for now
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

function isPixelCollidable(sprite: Sprite, x: number, y: number): boolean {
  // Ensure coordinates are within bounds
  if (x < 0 || x >= sprite.width || y < 0 || y >= sprite.height) return false;
  const idx = (sprite.width * Math.floor(y) + Math.floor(x)) << 2;
  // Collidable pixels are opaque (a > 128) AND dark (r < 128)
  // This matches '█' (r=0, a=255) and excludes '░' (r=255, a=255)
  return sprite.data[idx + 3] > 128 && sprite.data[idx] < 128;
}

export function checkCollision(
  s1: Sprite,
  x1: number,
  y1: number,
  w1: number,
  h1: number,
  srcX1: number,
  srcY1: number,
  s2: Sprite,
  x2: number,
  y2: number,
  w2: number,
  h2: number,
  srcX2: number,
  srcY2: number,
): boolean {
  // 1. Calculate intersection rectangle in world coordinates
  const left = Math.max(x1, x2);
  const right = Math.min(x1 + w1, x2 + w2);
  const top = Math.max(y1, y2);
  const bottom = Math.min(y1 + h1, y2 + h2);

  // 2. If no intersection, return false (broad phase should have caught this, but good for safety)
  if (left >= right || top >= bottom) return false;

  // 3. Iterate over intersection area
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      // 4. Convert world coords to sprite local source coords
      const sx1 = srcX1 + (x - x1);
      const sy1 = srcY1 + (y - y1);
      const sx2 = srcX2 + (x - x2);
      const sy2 = srcY2 + (y - y2);

      // 5. Check if both pixels are collidable (solid '█')
      if (isPixelCollidable(s1, sx1, sy1) && isPixelCollidable(s2, sx2, sy2)) {
        return true;
      }
    }
  }

  return false;
}
