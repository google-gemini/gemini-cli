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

  /**
   * Draw a tree fork: one parent to multiple children (TD layout).
   * Pattern:
   *     │          (vertical from parent)
   *  ┌──┴──┐       (horizontal bar with junction)
   *  │     │       (verticals down to each child)
   */
  drawTreeFork(
    parentCenterX: number,
    parentBottomY: number,
    childCenters: Array<{ x: number; topY: number }>,
  ): void {
    if (childCenters.length === 0) return;

    if (childCenters.length === 1) {
      // Single child: straight vertical line
      const child = childCenters[0];
      for (let y = parentBottomY; y <= child.topY; y++) {
        this.setCellIfEmpty(parentCenterX, y, '│');
      }
      return;
    }

    // Multiple children: fork pattern
    const sortedChildren = [...childCenters].sort((a, b) => a.x - b.x);
    const leftX = sortedChildren[0].x;
    const rightX = sortedChildren[sortedChildren.length - 1].x;

    // Y position for the horizontal bar (midpoint between parent and children)
    const barY =
      parentBottomY + Math.floor((sortedChildren[0].topY - parentBottomY) / 2);

    // Vertical from parent down to bar
    for (let y = parentBottomY; y < barY; y++) {
      this.setCellIfEmpty(parentCenterX, y, '│');
    }

    // Horizontal bar
    for (let x = leftX; x <= rightX; x++) {
      this.setCellIfEmpty(x, barY, '─');
    }

    // Junction where parent meets the bar
    if (parentCenterX >= leftX && parentCenterX <= rightX) {
      this.setCell(parentCenterX, barY, '┬');
    }

    // Left end
    this.setCell(leftX, barY, '├');
    // Right end
    this.setCell(rightX, barY, '┤');

    // Corners: if parent center is at left or right edge
    if (parentCenterX === leftX) {
      this.setCell(leftX, barY, '┬');
    }
    if (parentCenterX === rightX) {
      this.setCell(rightX, barY, '┬');
    }

    // Verticals from bar down to each child
    for (const child of sortedChildren) {
      // Junction on the bar where child drops
      const current = this.grid[barY]?.[child.x]?.char;
      if (current === '─') {
        this.setCell(child.x, barY, '┬');
      } else if (current === '├') {
        this.setCell(child.x, barY, '┌');
      } else if (current === '┤') {
        this.setCell(child.x, barY, '┐');
      }

      for (let y = barY + 1; y <= child.topY; y++) {
        this.setCellIfEmpty(child.x, y, '│');
      }
    }
  }

  /**
   * Draw a horizontal fan-out: one parent to multiple children (LR layout).
   * Pattern:
   *  ──┬── child1
   *    ├── child2
   *    └── child3
   */
  drawHorizontalFork(
    parentRightX: number,
    parentCenterY: number,
    childEntries: Array<{ leftX: number; y: number }>,
  ): void {
    if (childEntries.length === 0) return;

    if (childEntries.length === 1) {
      // Single child: straight horizontal line
      const child = childEntries[0];
      for (let x = parentRightX; x <= child.leftX; x++) {
        this.setCellIfEmpty(x, parentCenterY, '─');
      }
      this.setCellIfEmpty(child.leftX, child.y, '→');
      return;
    }

    const sorted = [...childEntries].sort((a, b) => a.y - b.y);
    const topY = sorted[0].y;
    const bottomY = sorted[sorted.length - 1].y;

    // Horizontal from parent to trunk
    const trunkX = parentRightX + 1;
    this.setCellIfEmpty(parentRightX, parentCenterY, '─');

    // Vertical trunk
    for (let y = topY; y <= bottomY; y++) {
      this.setCellIfEmpty(trunkX, y, '│');
    }

    // Branches to each child
    for (let i = 0; i < sorted.length; i++) {
      const child = sorted[i];
      // Junction on trunk
      if (i === 0) {
        this.setCell(trunkX, child.y, '┌');
      } else if (i === sorted.length - 1) {
        this.setCell(trunkX, child.y, '└');
      } else {
        this.setCell(trunkX, child.y, '├');
      }

      // Horizontal from trunk to child
      for (let x = trunkX + 1; x <= child.leftX; x++) {
        this.setCellIfEmpty(x, child.y, '─');
      }
    }
  }

  drawEdge(edge: DiagramEdge): void {
    const { sourceX, sourceY, targetX, targetY, label, style } = edge;
    const hChar = style === 'dotted' ? '┄' : '─';
    const vChar = '│';

    const dx = targetX - sourceX;
    const dy = targetY - sourceY;

    if (dx === 0 && dy === 0) {
      return;
    } else if (dy === 0) {
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
      this.setCellIfEmpty(targetX, targetY, vChar);
    } else if (Math.abs(dy) > Math.abs(dx)) {
      // Primarily vertical: Z-shape
      const vDir = dy > 0 ? 1 : -1;
      const hDir = dx > 0 ? 1 : -1;
      const midY = Math.round((sourceY + targetY) / 2);

      for (let y = sourceY; vDir > 0 ? y < midY : y > midY; y += vDir) {
        this.setCellIfEmpty(sourceX, y, vChar);
      }
      this.setCellIfEmpty(sourceX, midY, hDir > 0 ? '└' : '┘');
      for (
        let x = sourceX + hDir;
        hDir > 0 ? x < targetX : x > targetX;
        x += hDir
      ) {
        this.setCellIfEmpty(x, midY, hChar);
      }
      this.setCellIfEmpty(targetX, midY, hDir > 0 ? '┐' : '┌');
      for (
        let y = midY + vDir;
        vDir > 0 ? y < targetY : y > targetY;
        y += vDir
      ) {
        this.setCellIfEmpty(targetX, y, vChar);
      }
      this.setCellIfEmpty(targetX, targetY, vChar);
    } else {
      // Primarily horizontal: L-shape
      const hDir = dx > 0 ? 1 : -1;
      const vDir = dy > 0 ? 1 : -1;

      for (let y = sourceY; vDir > 0 ? y < targetY : y > targetY; y += vDir) {
        this.setCellIfEmpty(sourceX, y, vChar);
      }
      this.setCellIfEmpty(
        sourceX,
        targetY,
        hDir > 0 && vDir > 0
          ? '└'
          : hDir < 0 && vDir > 0
            ? '┘'
            : hDir > 0 && vDir < 0
              ? '┌'
              : '┐',
      );
      for (
        let x = sourceX + hDir;
        hDir > 0 ? x < targetX : x > targetX;
        x += hDir
      ) {
        this.setCellIfEmpty(x, targetY, hChar);
      }
      this.setCellIfEmpty(targetX, targetY, hDir > 0 ? '→' : '←');
    }

    // Place edge label at midpoint
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
      .map((row) =>
        row
          .map((cell) => cell.char)
          .join('')
          .trimEnd(),
      )
      .join('\n');
  }

  toColoredLines(): Cell[][] {
    return this.grid;
  }
}
