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

const DEFAULT_ASCII_COLUMNS = 80;
const MIN_ASCII_COLUMNS = 48;
const MAX_ASCII_COLUMNS = 140;
const MIN_ASCII_STABILIZER_ROWS = 8;
const MAX_ASCII_STABILIZER_ROWS = 20;

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

export interface VisualArtifactOptions {
  /** Original Mermaid spec; needed for ASCII fallback path */
  spec?: string;
  /** Override terminal protocol detection */
  forceProtocol?: 'kitty' | 'iterm2' | 'sixel' | 'ascii';
  /** Show cache/protocol info line above the diagram */
  showMeta?: boolean;
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
    if (!options.spec) {
      writeSync(
        2,
        chalk.yellow(
          '  ⚠ ASCII fallback - no spec provided, showing PNG path instead.\n',
        ),
      );
      return `  PNG: ${result.pngPath}\n`;
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
      return encodeAsciiWithStabilizer(options.spec, caps.columns, caps.rows);
    }
    return `  PNG: ${result.pngPath}\n`;
  }
}
