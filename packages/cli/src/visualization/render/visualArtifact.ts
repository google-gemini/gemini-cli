/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile } from 'node:fs/promises';
import { writeSync } from 'node:fs';
import { detectTerminalCaps } from '../caps/detect.js';
import { encodeKitty } from '../encode/kitty.js';
import { encodeIterm2 } from '../encode/iterm2.js';
import { encodeSixel } from '../encode/sixel.js';
import { encodeAscii } from '../encode/ascii.js';
import type { RenderResult } from '../types.js';
import chalk from 'chalk';
import sharp from 'sharp';

const DEFAULT_ASCII_COLUMNS = 80;
const MIN_ASCII_COLUMNS = 48;
const MAX_ASCII_COLUMNS = 140;
const MIN_ASCII_STABILIZER_ROWS = 8;
const MAX_ASCII_STABILIZER_ROWS = 20;
const ASCII_PREVIEW_RAMP_DARK = ' .:-=+*#%@';
const ASCII_PREVIEW_RAMP_LIGHT = '@%#*+=-:. ';
const DEFAULT_ASCII_PREVIEW_ROWS = 32;
const MIN_ASCII_PREVIEW_ROWS = 12;
const MAX_ASCII_PREVIEW_ROWS = 52;

function sanitizeAsciiColumns(columns: number): number {
  if (!Number.isFinite(columns) || columns <= 0) {
    return DEFAULT_ASCII_COLUMNS;
  }

  const rounded = Math.floor(columns);
  return Math.max(MIN_ASCII_COLUMNS, Math.min(MAX_ASCII_COLUMNS, rounded));
}

function getAsciiStabilizerRows(rows: number): number {
  if (!Number.isFinite(rows) || rows <= 0) {
    return MIN_ASCII_STABILIZER_ROWS;
  }

  const rounded = Math.floor(rows);
  // Keep enough trailing space so Ink redraws do not overwrite the diagram.
  const proportional = Math.ceil(rounded * 0.45);
  return Math.max(
    MIN_ASCII_STABILIZER_ROWS,
    Math.min(MAX_ASCII_STABILIZER_ROWS, proportional),
  );
}

function encodeAsciiWithStabilizer(
  spec: string,
  columns: number,
  rows: number,
): string {
  const safeColumns = sanitizeAsciiColumns(columns);
  const ascii = encodeAscii(spec, safeColumns);
  const stabilizer = '\n'.repeat(getAsciiStabilizerRows(rows));
  return `${ascii}${stabilizer}`;
}

async function renderPngAsciiPreview(
  pngPath: string,
  columns: number,
): Promise<string> {
  const safeColumns = sanitizeAsciiColumns(columns);
  const image = sharp(pngPath).grayscale().ensureAlpha();
  const meta = await image.metadata();
  const sourceWidth = meta.width ?? safeColumns;
  const sourceHeight = meta.height ?? DEFAULT_ASCII_PREVIEW_ROWS;
  const targetRows = Math.max(
    MIN_ASCII_PREVIEW_ROWS,
    Math.min(
      MAX_ASCII_PREVIEW_ROWS,
      Math.round((sourceHeight / Math.max(sourceWidth, 1)) * safeColumns * 0.55),
    ),
  );

  const { data, info } = await image
    .resize({
      width: safeColumns,
      height: targetRows,
      fit: 'fill',
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let totalBrightness = 0;
  let visiblePixels = 0;

  for (let i = 0; i < data.length; i += info.channels) {
    const alpha = info.channels >= 2 ? data[i + info.channels - 1] : 255;
    if (alpha < 16) {
      continue;
    }
    totalBrightness += data[i];
    visiblePixels += 1;
  }

  const averageBrightness =
    visiblePixels > 0 ? totalBrightness / visiblePixels : 127;
  const ramp =
    averageBrightness < 128 ? ASCII_PREVIEW_RAMP_DARK : ASCII_PREVIEW_RAMP_LIGHT;

  const lines: string[] = [];
  for (let y = 0; y < info.height; y++) {
    let line = '';
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const gray = data[idx];
      const alpha = info.channels >= 2 ? data[idx + info.channels - 1] : 255;
      if (alpha < 16) {
        line += ' ';
        continue;
      }

      const rampIndex = Math.round((gray / 255) * (ramp.length - 1));
      line += ramp[rampIndex] ?? ' ';
    }
    lines.push(line.replace(/\s+$/g, ''));
  }

  return lines.join('\n');
}

export interface VisualArtifactOptions {
  /** Original Mermaid spec; needed for Mermaid ASCII fallback path */
  spec?: string;
  /** Override terminal protocol detection */
  forceProtocol?: 'kitty' | 'iterm2' | 'sixel' | 'ascii';
  /** Show cache/protocol info line above the diagram */
  showMeta?: boolean;
  /** Add trailing blank rows when printing raw ASCII directly to stdout */
  stabilizeAscii?: boolean;
  /** Original render type, used to select the right ASCII fallback */
  diagramType?: 'mermaid' | 'html';
}

/**
 * Render a VisualArtifact to the terminal.
 * Detects terminal capabilities and picks the best encoder automatically.
 */
export async function renderVisualArtifact(
  result: RenderResult,
  options: VisualArtifactOptions = {},
): Promise<string | void> {
  const caps = detectTerminalCaps();
  const protocol = options.forceProtocol ?? caps.protocol;

  if (options.showMeta !== false) {
    const cacheLabel = result.fromCache
      ? chalk.green('● cache hit')
      : chalk.yellow('◎ rendered');
    const protocolLabel = chalk.cyan(protocol.toUpperCase());
    writeSync(
      2,
      `  ${cacheLabel}  ${protocolLabel}  ${result.widthPx}×${result.heightPx}px\n`,
    );
  }

  // ASCII path: we do not need to read the PNG at all.
  if (protocol === 'ascii') {
    if (options.diagramType === 'html') {
      return renderPngAsciiPreview(result.pngPath, caps.columns);
    }

    if (!options.spec) {
      writeSync(
        2,
        chalk.yellow(
          '  ⚠ ASCII fallback - no spec provided, showing PNG path instead.\n',
        ),
      );
      return `  PNG: ${result.pngPath}\n`;
    }

    if (options.stabilizeAscii === false) {
      return encodeAscii(options.spec, sanitizeAsciiColumns(caps.columns));
    }

    return encodeAsciiWithStabilizer(options.spec, caps.columns, caps.rows);
  }

  // Graphic protocol paths: read the PNG from disk.
  try {
    const pngBuffer = await readFile(result.pngPath);

    let output = '';
    switch (protocol) {
      case 'kitty': {
        output = encodeKitty(pngBuffer, caps.columns, caps.rows);
        break;
      }
      case 'iterm2': {
        output = encodeIterm2(pngBuffer, caps.columns, caps.rows);
        break;
      }
      case 'sixel': {
        output = await encodeSixel(pngBuffer, caps.columns, caps.rows);
        break;
      }
      default: {
        output = `  PNG saved to: ${result.pngPath}\n`;
      }
    }

    return output;
  } catch (error) {
    // If any graphic protocol fails, fall back to ASCII.
    writeSync(
      2,
      chalk.yellow(
        `  ⚠ Graphics fallback failed, defaulting to ASCII mode: ${error}\n`,
      ),
    );
    if (options.spec) {
      if (options.diagramType === 'html') {
        return renderPngAsciiPreview(result.pngPath, caps.columns);
      }
      if (options.stabilizeAscii === false) {
        return encodeAscii(options.spec, sanitizeAsciiColumns(caps.columns));
      }
      return encodeAsciiWithStabilizer(options.spec, caps.columns, caps.rows);
    }
    return `  PNG: ${result.pngPath}\n`;
  }
}
