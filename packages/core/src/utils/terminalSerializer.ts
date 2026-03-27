/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Terminal } from '@xterm/headless';
export interface AnsiToken {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  dim: boolean;
  inverse: boolean;
  fg: string;
  bg: string;
}

export type AnsiLine = AnsiToken[];
export type AnsiOutput = AnsiLine[];

export const enum ColorMode {
  DEFAULT = 0,
  PALETTE = 1,
  RGB = 2,
}

export function serializeTerminalToObject(
  terminal: Terminal,
  startLine?: number,
  endLine?: number,
): AnsiOutput {
  const buffer = terminal.buffer.active;
  const cursorX = buffer.cursorX;
  const cursorY = buffer.cursorY;
  const defaultFg = '';
  const defaultBg = '';

  const result: AnsiOutput = [];

  const effectiveStart = startLine ?? buffer.viewportY;
  const effectiveEnd = endLine ?? buffer.viewportY + terminal.rows;

  for (let y = effectiveStart; y < effectiveEnd; y++) {
    const line = buffer.getLine(y);
    const currentLine: AnsiLine = [];
    if (!line) {
      result.push(currentLine);
      continue;
    }

    let currentText = '';
    let currentBold = false;
    let currentItalic = false;
    let currentUnderline = false;
    let currentDim = false;
    let currentInverse = false;
    let currentFgMode = ColorMode.DEFAULT;
    let currentFgColor = -1;
    let currentBgMode = ColorMode.DEFAULT;
    let currentBgColor = -1;
    let currentFg = '';
    let currentBg = '';

    for (let x = 0; x < terminal.cols; x++) {
      const cellData = line.getCell(x);

      const isCursor = x === cursorX && y === cursorY;
      const bold = cellData ? !!cellData.isBold() : false;
      const italic = cellData ? !!cellData.isItalic() : false;
      const underline = cellData ? !!cellData.isUnderline() : false;
      const dim = cellData ? !!cellData.isDim() : false;
      const inverse = (cellData ? !!cellData.isInverse() : false) || isCursor;

      let fgMode = ColorMode.DEFAULT;
      let bgMode = ColorMode.DEFAULT;
      let fgColor = -1;
      let bgColor = -1;

      if (cellData) {
        if (cellData.isFgRGB()) fgMode = ColorMode.RGB;
        else if (cellData.isFgPalette()) fgMode = ColorMode.PALETTE;

        if (cellData.isBgRGB()) bgMode = ColorMode.RGB;
        else if (cellData.isBgPalette()) bgMode = ColorMode.PALETTE;

        if (fgMode !== ColorMode.DEFAULT) fgColor = cellData.getFgColor();
        if (bgMode !== ColorMode.DEFAULT) bgColor = cellData.getBgColor();
      }

      // Handle wide characters correctly. Wide characters take 2 cells.
      // The second cell has a width of 0 and an empty string for getChars().
      // For a regular empty cell (width=1), we output a space.
      let char = ' ';
      if (cellData) {
        if (cellData.getWidth() === 0) {
          char = '';
        } else {
          char = cellData.getChars() || ' ';
        }
      }

      if (x === 0) {
        currentText = char;
        currentBold = bold;
        currentItalic = italic;
        currentUnderline = underline;
        currentDim = dim;
        currentInverse = inverse;
        currentFgMode = fgMode;
        currentFgColor = fgColor;
        currentBgMode = bgMode;
        currentBgColor = bgColor;
        currentFg = convertColorToHex(fgColor, fgMode, defaultFg);
        currentBg = convertColorToHex(bgColor, bgMode, defaultBg);
      } else {
        if (
          currentBold !== bold ||
          currentItalic !== italic ||
          currentUnderline !== underline ||
          currentDim !== dim ||
          currentInverse !== inverse ||
          currentFgMode !== fgMode ||
          currentFgColor !== fgColor ||
          currentBgMode !== bgMode ||
          currentBgColor !== bgColor
        ) {
          if (currentText) {
            currentLine.push({
              text: currentText,
              bold: currentBold,
              italic: currentItalic,
              underline: currentUnderline,
              dim: currentDim,
              inverse: currentInverse,
              fg: currentFg,
              bg: currentBg,
            });
          }
          currentText = char;
          currentBold = bold;
          currentItalic = italic;
          currentUnderline = underline;
          currentDim = dim;
          currentInverse = inverse;

          if (currentFgMode !== fgMode || currentFgColor !== fgColor) {
            currentFg = convertColorToHex(fgColor, fgMode, defaultFg);
            currentFgMode = fgMode;
            currentFgColor = fgColor;
          }

          if (currentBgMode !== bgMode || currentBgColor !== bgColor) {
            currentBg = convertColorToHex(bgColor, bgMode, defaultBg);
            currentBgMode = bgMode;
            currentBgColor = bgColor;
          }
        } else {
          currentText += char;
        }
      }
    }

    if (currentText) {
      currentLine.push({
        text: currentText,
        bold: currentBold,
        italic: currentItalic,
        underline: currentUnderline,
        dim: currentDim,
        inverse: currentInverse,
        fg: currentFg,
        bg: currentBg,
      });
    }

    result.push(currentLine);
  }

  return result;
}

// ANSI color palette from https://en.wikipedia.org/wiki/ANSI_escape_code#8-bit
const ANSI_COLORS = [
  '#000000',
  '#800000',
  '#008000',
  '#808000',
  '#000080',
  '#800080',
  '#008080',
  '#c0c0c0',
  '#808080',
  '#ff0000',
  '#00ff00',
  '#ffff00',
  '#0000ff',
  '#ff00ff',
  '#00ffff',
  '#ffffff',
  '#000000',
  '#00005f',
  '#000087',
  '#0000af',
  '#0000d7',
  '#0000ff',
  '#005f00',
  '#005f5f',
  '#005f87',
  '#005faf',
  '#005fd7',
  '#005fff',
  '#008700',
  '#00875f',
  '#008787',
  '#0087af',
  '#0087d7',
  '#0087ff',
  '#00af00',
  '#00af5f',
  '#00af87',
  '#00afaf',
  '#00afd7',
  '#00afff',
  '#00d700',
  '#00d75f',
  '#00d787',
  '#00d7af',
  '#00d7d7',
  '#00d7ff',
  '#00ff00',
  '#00ff5f',
  '#00ff87',
  '#00ffaf',
  '#00ffd7',
  '#00ffff',
  '#5f0000',
  '#5f005f',
  '#5f0087',
  '#5f00af',
  '#5f00d7',
  '#5f00ff',
  '#5f5f00',
  '#5f5f5f',
  '#5f5f87',
  '#5f5faf',
  '#5f5fd7',
  '#5f5fff',
  '#5f8700',
  '#5f875f',
  '#5f8787',
  '#5f87af',
  '#5f87d7',
  '#5f87ff',
  '#5faf00',
  '#5faf5f',
  '#5faf87',
  '#5fafaf',
  '#5fafd7',
  '#5fafff',
  '#5fd700',
  '#5fd75f',
  '#5fd787',
  '#5fd7af',
  '#5fd7d7',
  '#5fd7ff',
  '#5fff00',
  '#5fff5f',
  '#5fff87',
  '#5fffaf',
  '#5fffd7',
  '#5fffff',
  '#870000',
  '#87005f',
  '#870087',
  '#8700af',
  '#8700d7',
  '#8700ff',
  '#875f00',
  '#875f5f',
  '#875f87',
  '#875faf',
  '#875fd7',
  '#875fff',
  '#878700',
  '#87875f',
  '#878787',
  '#8787af',
  '#8787d7',
  '#8787ff',
  '#87af00',
  '#87af5f',
  '#87af87',
  '#87afaf',
  '#87afd7',
  '#87afff',
  '#87d700',
  '#87d75f',
  '#87d787',
  '#87d7af',
  '#87d7d7',
  '#87d7ff',
  '#87ff00',
  '#87ff5f',
  '#87ff87',
  '#87ffaf',
  '#87ffd7',
  '#87ffff',
  '#af0000',
  '#af005f',
  '#af0087',
  '#af00af',
  '#af00d7',
  '#af00ff',
  '#af5f00',
  '#af5f5f',
  '#af5f87',
  '#af5faf',
  '#af5fd7',
  '#af5fff',
  '#af8700',
  '#af875f',
  '#af8787',
  '#af87af',
  '#af87d7',
  '#af87ff',
  '#afaf00',
  '#afaf5f',
  '#afaf87',
  '#afafaf',
  '#afafd7',
  '#afafff',
  '#afd700',
  '#afd75f',
  '#afd787',
  '#afd7af',
  '#afd7d7',
  '#afd7ff',
  '#afff00',
  '#afff5f',
  '#afff87',
  '#afffaf',
  '#afffd7',
  '#afffff',
  '#d70000',
  '#d7005f',
  '#d70087',
  '#d700af',
  '#d700d7',
  '#d700ff',
  '#d75f00',
  '#d75f5f',
  '#d75f87',
  '#d75faf',
  '#d75fd7',
  '#d75fff',
  '#d78700',
  '#d7875f',
  '#d78787',
  '#d787af',
  '#d787d7',
  '#d787ff',
  '#d7af00',
  '#d7af5f',
  '#d7af87',
  '#d7afaf',
  '#d7afd7',
  '#d7afff',
  '#d7d700',
  '#d7d75f',
  '#d7d787',
  '#d7d7af',
  '#d7d7d7',
  '#d7d7ff',
  '#d7ff00',
  '#d7ff5f',
  '#d7ff87',
  '#d7ffaf',
  '#d7ffd7',
  '#d7ffff',
  '#ff0000',
  '#ff005f',
  '#ff0087',
  '#ff00af',
  '#ff00d7',
  '#ff00ff',
  '#ff5f00',
  '#ff5f5f',
  '#ff5f87',
  '#ff5faf',
  '#ff5fd7',
  '#ff5fff',
  '#ff8700',
  '#ff875f',
  '#ff8787',
  '#ff87af',
  '#ff87d7',
  '#ff87ff',
  '#ffaf00',
  '#ffaf5f',
  '#ffaf87',
  '#ffafaf',
  '#ffafd7',
  '#ffafff',
  '#ffd700',
  '#ffd75f',
  '#ffd787',
  '#ffd7af',
  '#ffd7d7',
  '#ffd7ff',
  '#ffff00',
  '#ffff5f',
  '#ffff87',
  '#ffffaf',
  '#ffffd7',
  '#ffffff',
  '#080808',
  '#121212',
  '#1c1c1c',
  '#262626',
  '#303030',
  '#3a3a3a',
  '#444444',
  '#4e4e4e',
  '#585858',
  '#626262',
  '#6c6c6c',
  '#767676',
  '#808080',
  '#8a8a8a',
  '#949494',
  '#9e9e9e',
  '#a8a8a8',
  '#b2b2b2',
  '#bcbcbc',
  '#c6c6c6',
  '#d0d0d0',
  '#dadada',
  '#e4e4e4',
  '#eeeeee',
];

export function convertColorToHex(
  color: number,
  colorMode: ColorMode,
  defaultColor: string,
): string {
  if (colorMode === ColorMode.RGB) {
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    return `#${r.toString(16).padStart(2, '0')}${g
      .toString(16)
      .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  if (colorMode === ColorMode.PALETTE) {
    return ANSI_COLORS[color] || defaultColor;
  }
  return defaultColor;
}
