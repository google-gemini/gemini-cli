/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Terminal } from '@xterm/headless';

export const generateSvgForTerminal = (terminal: Terminal): string => {
  const activeBuffer = terminal.buffer.active;

  const getHexColor = (
    isRGB: boolean,
    isPalette: boolean,
    isDefault: boolean,
    colorCode: number,
  ): string | null => {
    if (isDefault) return null;
    if (isRGB) {
      return `#${colorCode.toString(16).padStart(6, '0')}`;
    }
    if (isPalette) {
      if (colorCode >= 0 && colorCode <= 15) {
        return (
          [
            '#000000',
            '#cd0000',
            '#00cd00',
            '#cdcd00',
            '#0000ee',
            '#cd00cd',
            '#00cdcd',
            '#e5e5e5',
            '#7f7f7f',
            '#ff0000',
            '#00ff00',
            '#ffff00',
            '#5c5cff',
            '#ff00ff',
            '#00ffff',
            '#ffffff',
          ][colorCode] || null
        );
      } else if (colorCode >= 16 && colorCode <= 231) {
        const v = [0, 95, 135, 175, 215, 255];
        const c = colorCode - 16;
        const b = v[c % 6];
        const g = v[Math.floor(c / 6) % 6];
        const r = v[Math.floor(c / 36) % 6];
        return `#${[r, g, b].map((x) => x?.toString(16).padStart(2, '0')).join('')}`;
      } else if (colorCode >= 232 && colorCode <= 255) {
        const gray = 8 + (colorCode - 232) * 10;
        const hex = gray.toString(16).padStart(2, '0');
        return `#${hex}${hex}${hex}`;
      }
    }
    return null;
  };

  const escapeXml = (unsafe: string): string =>
    // eslint-disable-next-line no-control-regex
    unsafe.replace(/[<>&'"\x00-\x08\x0B-\x0C\x0E-\x1F]/g, (c) => {
      switch (c) {
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '&':
          return '&amp;';
        case "'":
          return '&apos;';
        case '"':
          return '&quot;';
        default:
          return '';
      }
    });

  const charWidth = 9;
  const charHeight = 17;
  const padding = 10;

  // Find the actual number of rows with content to avoid rendering trailing blank space.
  let contentRows = terminal.rows;
  for (let y = terminal.rows - 1; y >= 0; y--) {
    const line = activeBuffer.getLine(y);
    if (line && line.translateToString(true).trim().length > 0) {
      contentRows = y + 1;
      break;
    }
  }
  if (contentRows === 0) contentRows = 1; // Minimum 1 row

  const width = terminal.cols * charWidth + padding * 2;
  const height = contentRows * charHeight + padding * 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
`;
  svg += `  <style>
`;
  svg += `    text { font-family: Consolas, "Courier New", monospace; font-size: 14px; dominant-baseline: text-before-edge; white-space: pre; }
`;
  svg += `  </style>
`;
  svg += `  <rect width="${width}" height="${height}" fill="#000000" />
`; // Terminal background
  svg += `  <g transform="translate(${padding}, ${padding})">
`;

  for (let y = 0; y < contentRows; y++) {
    const line = activeBuffer.getLine(y);
    if (!line) continue;

    let currentFgHex: string | null = null;
    let currentBgHex: string | null = null;
    let currentBlockStartCol = -1;
    let currentBlockText = '';
    let currentBlockNumCells = 0;

    const finalizeBlock = (_endCol: number) => {
      if (currentBlockStartCol !== -1) {
        if (currentBlockText.length > 0) {
          const xPos = currentBlockStartCol * charWidth;
          const yPos = y * charHeight;

          if (currentBgHex) {
            const rectWidth = currentBlockNumCells * charWidth;
            svg += `    <rect x="${xPos}" y="${yPos}" width="${rectWidth}" height="${charHeight}" fill="${currentBgHex}" />
`;
          }
          if (currentBlockText.trim().length > 0) {
            const fill = currentFgHex || '#ffffff'; // Default text color
            const textWidth = currentBlockNumCells * charWidth;
            // Use textLength to ensure the block fits exactly into its designated cells
            svg += `    <text x="${xPos}" y="${yPos + 2}" fill="${fill}" textLength="${textWidth}" lengthAdjust="spacingAndGlyphs">${escapeXml(currentBlockText)}</text>
`;
          }
        }
      }
    };

    for (let x = 0; x < line.length; x++) {
      const cell = line.getCell(x);
      if (!cell) continue;
      const cellWidth = cell.getWidth();
      if (cellWidth === 0) continue; // Skip continuation cells of wide characters

      let fgHex = getHexColor(
        cell.isFgRGB(),
        cell.isFgPalette(),
        cell.isFgDefault(),
        cell.getFgColor(),
      );
      let bgHex = getHexColor(
        cell.isBgRGB(),
        cell.isBgPalette(),
        cell.isBgDefault(),
        cell.getBgColor(),
      );

      if (cell.isInverse()) {
        const tempFgHex = fgHex;
        fgHex = bgHex || '#000000';
        bgHex = tempFgHex || '#ffffff';
      }

      let chars = cell.getChars();
      if (chars === '') chars = ' '.repeat(cellWidth);

      if (
        fgHex !== currentFgHex ||
        bgHex !== currentBgHex ||
        currentBlockStartCol === -1
      ) {
        finalizeBlock(x);
        currentFgHex = fgHex;
        currentBgHex = bgHex;
        currentBlockStartCol = x;
        currentBlockText = chars;
        currentBlockNumCells = cellWidth;
      } else {
        currentBlockText += chars;
        currentBlockNumCells += cellWidth;
      }
    }
    finalizeBlock(line.length);
  }
  svg += `  </g>\n</svg>`;
  return svg;
};
