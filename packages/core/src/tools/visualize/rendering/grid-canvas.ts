/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DiagramNode, DiagramEdge } from '../types.js';

interface Cell {
  char: string;
  color?: string;
}

export class GridCanvas {
  private grid: Cell[][];
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.grid = [];
    for (let y = 0; y < height; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < width; x++) {
        row.push({ char: ' ' });
      }
      this.grid.push(row);
    }
  }

  private setCell(x: number, y: number, char: string, color?: string): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return;
    }
    this.grid[y][x] = { char, color };
  }

  private setCellIfEmpty(
    x: number,
    y: number,
    char: string,
    color?: string,
  ): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return;
    }
    if (this.grid[y][x].char === ' ') {
      this.grid[y][x] = { char, color };
    }
  }

  drawNode(node: DiagramNode): void {
    const { x, y, width, height, label } = node;

    // Top border
    this.setCell(x, y, '┌');
    for (let i = 1; i < width - 1; i++) {
      this.setCell(x + i, y, '─');
    }
    this.setCell(x + width - 1, y, '┐');

    // Bottom border
    this.setCell(x, y + height - 1, '└');
    for (let i = 1; i < width - 1; i++) {
      this.setCell(x + i, y + height - 1, '─');
    }
    this.setCell(x + width - 1, y + height - 1, '┘');

    // Side borders
    for (let row = 1; row < height - 1; row++) {
      this.setCell(x, y + row, '│');
      this.setCell(x + width - 1, y + row, '│');
    }

    // Label centered in the middle row
    const midRow = y + Math.floor(height / 2);
    const innerWidth = width - 2;
    const labelTruncated =
      label.length > innerWidth ? label.slice(0, innerWidth) : label;
    const padLeft = Math.floor((innerWidth - labelTruncated.length) / 2);

    for (let i = 0; i < labelTruncated.length; i++) {
      this.setCell(x + 1 + padLeft + i, midRow, labelTruncated[i]);
    }
  }

  drawEdge(edge: DiagramEdge): void {
    const { sourceX, sourceY, targetX, targetY, label, style } = edge;
    const hChar = style === 'dotted' ? '┄' : '─';
    const vChar = '│';

    const dx = targetX - sourceX;
    const dy = targetY - sourceY;

    if (dy === 0) {
      // Horizontal edge
      const dir = dx > 0 ? 1 : -1;
      for (let x = sourceX; dir > 0 ? x < targetX : x > targetX; x += dir) {
        this.setCellIfEmpty(x, sourceY, hChar);
      }
      this.setCellIfEmpty(targetX, targetY, dx > 0 ? '→' : '←');
    } else if (dx === 0) {
      // Vertical edge
      const dir = dy > 0 ? 1 : -1;
      for (let y = sourceY; dir > 0 ? y < targetY : y > targetY; y += dir) {
        this.setCellIfEmpty(sourceX, y, vChar);
      }
      this.setCellIfEmpty(targetX, targetY, dy > 0 ? '↓' : '↑');
    } else {
      // L-shaped: horizontal first, then vertical
      const hDir = dx > 0 ? 1 : -1;
      const vDir = dy > 0 ? 1 : -1;

      // Horizontal segment
      for (let x = sourceX; hDir > 0 ? x < targetX : x > targetX; x += hDir) {
        this.setCellIfEmpty(x, sourceY, hChar);
      }

      // Corner
      let corner: string;
      if (hDir > 0 && vDir > 0) {
        corner = '┐';
      } else if (hDir < 0 && vDir > 0) {
        corner = '┌';
      } else if (hDir > 0 && vDir < 0) {
        corner = '┘';
      } else {
        corner = '└';
      }
      this.setCellIfEmpty(targetX, sourceY, corner);

      // Vertical segment
      for (
        let y = sourceY + vDir;
        vDir > 0 ? y < targetY : y > targetY;
        y += vDir
      ) {
        this.setCellIfEmpty(targetX, y, vChar);
      }

      // Arrow head
      this.setCellIfEmpty(targetX, targetY, vDir > 0 ? '↓' : '↑');
    }

    // Place edge label at midpoint (overwrites edge chars but not node chars)
    if (label) {
      const midX = Math.round((sourceX + targetX) / 2);
      const midY = Math.round((sourceY + targetY) / 2);
      for (let i = 0; i < label.length; i++) {
        this.setCell(midX + i, midY, label[i]);
      }
    }
  }

  toString(): string {
    return this.grid
      .map((row) => row.map((cell) => cell.char).join(''))
      .join('\n');
  }

  toColoredLines(): Cell[][] {
    return this.grid;
  }
}
