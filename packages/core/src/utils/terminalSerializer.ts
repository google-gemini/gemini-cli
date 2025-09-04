/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IBufferCell, Terminal } from '@xterm/headless';

const enum Attribute {
  inverse = 1,
  bold = 2,
  italic = 4,
  underline = 8,
  dim = 16,
}

const enum ColorMode {
  DEFAULT = 0,
  PALETTE = 1,
  RGB = 2,
}

class Cell {
  private readonly attributes: number = 0;
  fg = 0;
  bg = 0;

  constructor(
    private readonly cell: IBufferCell | null,
    private readonly x: number,
    private readonly y: number,
    private readonly cursorX: number,
    private readonly cursorY: number,
  ) {
    if (!cell) {
      return;
    }

    if (cell.isInverse()) {
      this.attributes += Attribute.inverse;
    }
    if (cell.isBold()) {
      this.attributes += Attribute.bold;
    }
    if (cell.isItalic()) {
      this.attributes += Attribute.italic;
    }
    if (cell.isUnderline()) {
      this.attributes += Attribute.underline;
    }
    if (cell.isDim()) {
      this.attributes += Attribute.dim;
    }

    const fgColorMode = cell.getFgColorMode();
    const bgColorMode = cell.getBgColorMode();

    if (fgColorMode === ColorMode.DEFAULT) {
      this.fg = -1;
    } else if (fgColorMode === ColorMode.RGB) {
      const color = cell.getFgColor();
      this.fg = color;
    } else {
      this.fg = cell.getFgColor();
    }

    if (bgColorMode === ColorMode.DEFAULT) {
      this.bg = -1;
    } else if (bgColorMode === ColorMode.RGB) {
      const color = cell.getBgColor();
      this.bg = color;
    } else {
      this.bg = cell.getBgColor();
    }
  }

  isCursor(): boolean {
    return this.x === this.cursorX && this.y === this.cursorY;
  }

  getChars(): string {
    return this.cell?.getChars() || ' ';
  }

  isAttribute(attribute: Attribute): boolean {
    return (this.attributes & attribute) !== 0;
  }

  equals(other: Cell): boolean {
    return (
      this.attributes === other.attributes &&
      this.fg === other.fg &&
      this.bg === other.bg
    );
  }
}

function sgr(values: Array<string | number>): string {
  return `\x1b[${values.join(';')}m`;
}

export function serializeTerminalToString(terminal: Terminal): string {
  const buffer = terminal.buffer.active;
  const cursorX = buffer.cursorX;
  const cursorY = buffer.cursorY;

  let result = '';
  let lastCell = new Cell(null, -1, -1, cursorX, cursorY);

  for (let y = 0; y < terminal.rows; y++) {
    const line = buffer.getLine(buffer.viewportY + y);
    if (!line) {
      result += '\n';
      continue;
    }

    for (let x = 0; x < terminal.cols; x++) {
      const cellData = line.getCell(x);
      const cell = new Cell(cellData || null, x, y, cursorX, cursorY);

      if (!cell.equals(lastCell)) {
        const codes: Array<string | number> = [0];
        if (cell.isAttribute(Attribute.inverse) || cell.isCursor()) {
          codes.push(7);
        }
        if (cell.isAttribute(Attribute.bold)) {
          codes.push(1);
        }
        if (cell.isAttribute(Attribute.italic)) {
          codes.push(3);
        }
        if (cell.isAttribute(Attribute.underline)) {
          codes.push(4);
        }
        if (cell.isAttribute(Attribute.dim)) {
          codes.push(2);
        }

        if (cell.fg !== -1) {
          if (cell.fg > 255) {
            const r = (cell.fg >> 16) & 255;
            const g = (cell.fg >> 8) & 255;
            const b = cell.fg & 255;
            codes.push(38, 2, r, g, b);
          } else {
            codes.push(38, 5, cell.fg);
          }
        }
        if (cell.bg !== -1) {
          if (cell.bg > 255) {
            const r = (cell.bg >> 16) & 255;
            const g = (cell.bg >> 8) & 255;
            const b = cell.bg & 255;
            codes.push(48, 2, r, g, b);
          } else {
            codes.push(48, 5, cell.bg);
          }
        }
        result += sgr(codes);
      }

      result += cell.getChars();
      lastCell = cell;
    }

    if (!line.isWrapped) {
      result += '\n';
    }
  }

  return result;
}
