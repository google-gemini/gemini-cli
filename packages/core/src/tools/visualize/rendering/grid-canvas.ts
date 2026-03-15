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

/**
 * Generic grid-based canvas for rendering diagrams with box-drawing characters.
 *
 * Edge routing strategy:
 * - Occupied cells (nodes, previous edges) tracked in an obstacle set
 * - Each edge is routed using Manhattan routing (H-V or V-H) with obstacle avoidance
 * - If the direct path is blocked, the router tries offset channels (above/below/left/right)
 */
export class GridCanvas {
  private grid: Cell[][];
  private occupied: Set<string>; // "x,y" keys for cells occupied by nodes
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.grid = [];
    this.occupied = new Set();
    for (let y = 0; y < height; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < width; x++) {
        row.push({ char: ' ' });
      }
      this.grid.push(row);
    }
  }

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  private setCell(x: number, y: number, char: string): void {
    if (!this.inBounds(x, y)) return;
    this.grid[y][x] = { char };
  }

  private setCellIfEmpty(x: number, y: number, char: string): void {
    if (!this.inBounds(x, y)) return;
    if (this.grid[y][x].char === ' ') {
      this.grid[y][x] = { char };
    }
  }

  private isOccupied(x: number, y: number): boolean {
    return this.occupied.has(this.key(x, y));
  }

  drawNode(node: DiagramNode): void {
    const { x, y, width, height, label } = node;

    // Mark all node cells as occupied for edge routing
    for (let ny = y; ny < y + height; ny++) {
      for (let nx = x; nx < x + width; nx++) {
        this.occupied.add(this.key(nx, ny));
      }
    }

    // Top border
    this.setCell(x, y, '┌');
    for (let i = 1; i < width - 1; i++) this.setCell(x + i, y, '─');
    this.setCell(x + width - 1, y, '┐');

    // Bottom border
    this.setCell(x, y + height - 1, '└');
    for (let i = 1; i < width - 1; i++)
      this.setCell(x + i, y + height - 1, '─');
    this.setCell(x + width - 1, y + height - 1, '┘');

    // Side borders
    for (let row = 1; row < height - 1; row++) {
      this.setCell(x, y + row, '│');
      this.setCell(x + width - 1, y + row, '│');
    }

    // Label centered
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
   * Draw a linked-list style node with 3 compartments: prev | data | next
   * ┌────┬──────┬────┐
   * │prev│  10  │next│
   * └────┴──────┴────┘
   */
  drawLinkedListNode(node: DiagramNode): void {
    const { x, y, label } = node;
    const dataWidth = Math.max(label.length + 2, 4);
    const compWidth = 4; // prev/next compartment width
    const totalWidth = compWidth + 1 + dataWidth + 1 + compWidth;
    const height = 3;

    // Mark occupied
    for (let ny = y; ny < y + height; ny++) {
      for (let nx = x; nx < x + totalWidth; nx++) {
        this.occupied.add(this.key(nx, ny));
      }
    }

    // Top border: ┌────┬──────┬────┐
    this.setCell(x, y, '┌');
    for (let i = 1; i < compWidth; i++) this.setCell(x + i, y, '─');
    this.setCell(x + compWidth, y, '┬');
    for (let i = 1; i < dataWidth; i++) this.setCell(x + compWidth + i, y, '─');
    this.setCell(x + compWidth + dataWidth, y, '┬');
    for (let i = 1; i < compWidth; i++)
      this.setCell(x + compWidth + dataWidth + i, y, '─');
    this.setCell(x + totalWidth - 1, y, '┐');

    // Middle row: │prev│  10  │next│
    const midY = y + 1;
    this.setCell(x, midY, '│');
    // "prev" centered in left compartment
    this.setCell(x + 1, midY, ' ');
    this.setCell(x + 2, midY, '◀');
    this.setCell(x + 3, midY, ' ');
    this.setCell(x + compWidth, midY, '│');
    // data label centered
    const padLeft = Math.floor((dataWidth - label.length) / 2);
    for (let i = 0; i < dataWidth; i++) {
      const ch =
        i >= padLeft && i < padLeft + label.length ? label[i - padLeft] : ' ';
      this.setCell(x + compWidth + 1 + i - 1, midY, ch);
    }
    this.setCell(x + compWidth + dataWidth, midY, '│');
    // "next" centered in right compartment
    this.setCell(x + compWidth + dataWidth + 1, midY, ' ');
    this.setCell(x + compWidth + dataWidth + 2, midY, '▶');
    this.setCell(x + compWidth + dataWidth + 3, midY, ' ');
    this.setCell(x + totalWidth - 1, midY, '│');

    // Bottom border: └────┴──────┴────┘
    const botY = y + 2;
    this.setCell(x, botY, '└');
    for (let i = 1; i < compWidth; i++) this.setCell(x + i, botY, '─');
    this.setCell(x + compWidth, botY, '┴');
    for (let i = 1; i < dataWidth; i++)
      this.setCell(x + compWidth + i, botY, '─');
    this.setCell(x + compWidth + dataWidth, botY, '┴');
    for (let i = 1; i < compWidth; i++)
      this.setCell(x + compWidth + dataWidth + i, botY, '─');
    this.setCell(x + totalWidth - 1, botY, '┘');
  }

  /**
   * Get the actual width of a linked-list node (for layout purposes).
   */
  static linkedListNodeWidth(label: string): number {
    const dataWidth = Math.max(label.length + 2, 4);
    return 4 + 1 + dataWidth + 1 + 4; // compWidth + separator + data + separator + compWidth
  }

  /**
   * Draw a tree fork: one parent to multiple children (TD layout).
   *        │
   *    ┌───┴───┐
   *    │       │
   */
  drawTreeFork(
    parentCenterX: number,
    parentBottomY: number,
    childCenters: Array<{ x: number; topY: number }>,
  ): void {
    if (childCenters.length === 0) return;

    if (childCenters.length === 1) {
      const child = childCenters[0];
      for (let y = parentBottomY; y <= child.topY; y++) {
        this.setCellIfEmpty(parentCenterX, y, '│');
      }
      return;
    }

    const sorted = [...childCenters].sort((a, b) => a.x - b.x);
    const leftX = sorted[0].x;
    const rightX = sorted[sorted.length - 1].x;
    const barY = parentBottomY + 1;

    // Stem from parent to bar
    this.setCellIfEmpty(parentCenterX, parentBottomY, '│');

    // Horizontal bar
    for (let x = leftX; x <= rightX; x++) this.setCell(x, barY, '─');

    // Junction where stem meets bar
    this.setCell(parentCenterX, barY, '┴');

    // Corners
    this.setCell(leftX, barY, '┌');
    this.setCell(rightX, barY, '┐');

    // If parent center is at an edge
    if (parentCenterX === leftX) this.setCell(leftX, barY, '├');
    else if (parentCenterX === rightX) this.setCell(rightX, barY, '┤');

    // Drops to each child
    for (const child of sorted) {
      const current = this.grid[barY]?.[child.x]?.char;
      if (current === '─') this.setCell(child.x, barY, '┬');

      for (let y = barY + 1; y <= child.topY; y++) {
        this.setCellIfEmpty(child.x, y, '│');
      }
    }
  }

  /**
   * Draw a horizontal fan-out: one parent to multiple children (LR layout).
   *  ─┬── child1
   *   ├── child2
   *   └── child3
   */
  drawHorizontalFork(
    parentRightX: number,
    parentCenterY: number,
    childEntries: Array<{ leftX: number; y: number }>,
  ): void {
    if (childEntries.length === 0) return;

    if (childEntries.length === 1) {
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
    const trunkX = parentRightX + 1;

    this.setCellIfEmpty(parentRightX, parentCenterY, '─');

    // Vertical trunk
    for (let y = topY; y <= bottomY; y++) this.setCellIfEmpty(trunkX, y, '│');

    // Branches
    for (let i = 0; i < sorted.length; i++) {
      const child = sorted[i];
      if (i === 0) this.setCell(trunkX, child.y, '┌');
      else if (i === sorted.length - 1) this.setCell(trunkX, child.y, '└');
      else this.setCell(trunkX, child.y, '├');

      for (let x = trunkX + 1; x <= child.leftX; x++) {
        this.setCellIfEmpty(x, child.y, '─');
      }
    }
  }

  /**
   * Draw a bidirectional edge pair as two parallel horizontal lines.
   *  ──→  (forward, above center)
   *  ←──  (backward, below center)
   */
  drawBidiHorizontal(
    leftNodeRightX: number,
    rightNodeLeftX: number,
    topY: number,
    bottomY: number,
  ): void {
    // Center the arrows in the gap between nodes
    const gap = rightNodeLeftX - leftNodeRightX;
    const startX = leftNodeRightX + 1;
    const endX = rightNodeLeftX - 1;

    if (gap < 3) {
      // Too narrow, just draw minimal
      this.setCellIfEmpty(leftNodeRightX, topY, '→');
      this.setCellIfEmpty(rightNodeLeftX, bottomY, '←');
      return;
    }

    // Forward arrow (top): ──→
    for (let x = startX; x < endX; x++) {
      this.setCellIfEmpty(x, topY, '─');
    }
    this.setCellIfEmpty(endX, topY, '→');

    // Backward arrow (bottom): ←──
    this.setCellIfEmpty(startX, bottomY, '←');
    for (let x = startX + 1; x <= endX; x++) {
      this.setCellIfEmpty(x, bottomY, '─');
    }
  }

  /**
   * Draw bidirectional edges between linked-list nodes.
   * Forward arrow exits from "next" compartment, backward enters "prev" compartment.
   */
  drawLinkedListBidi(
    leftNodeRightX: number,
    rightNodeLeftX: number,
    centerY: number,
  ): void {
    // Forward arrow (top line, from next to node): ──→
    const topY = centerY - 1;
    for (let x = leftNodeRightX; x < rightNodeLeftX; x++) {
      this.setCellIfEmpty(x, topY, '─');
    }
    this.setCellIfEmpty(rightNodeLeftX, topY, '→');

    // Backward arrow (bottom line, from node to prev): ←──
    const botY = centerY + 1;
    this.setCellIfEmpty(leftNodeRightX, botY, '←');
    for (let x = leftNodeRightX + 1; x <= rightNodeLeftX; x++) {
      this.setCellIfEmpty(x, botY, '─');
    }
  }

  /**
   * Draw a bidirectional edge pair as two parallel vertical lines.
   *  │ │
   *  ↓ ↑
   */
  drawBidiVertical(
    topNodeBottomY: number,
    bottomNodeTopY: number,
    leftX: number,
    rightX: number,
  ): void {
    // Forward (left): ↓
    for (let y = topNodeBottomY; y < bottomNodeTopY; y++) {
      this.setCellIfEmpty(leftX, y, '│');
    }
    this.setCellIfEmpty(leftX, bottomNodeTopY, '↓');

    // Backward (right): ↑
    this.setCellIfEmpty(rightX, topNodeBottomY, '↑');
    for (let y = topNodeBottomY + 1; y <= bottomNodeTopY; y++) {
      this.setCellIfEmpty(rightX, y, '│');
    }
  }

  /**
   * Generic edge routing with obstacle avoidance.
   * Routes using Manhattan paths (horizontal + vertical segments).
   * Avoids cells occupied by nodes.
   */
  drawEdge(edge: DiagramEdge): void {
    const { sourceX, sourceY, targetX, targetY, label, style } = edge;
    const hChar = style === 'dotted' ? '┄' : '─';

    const dx = targetX - sourceX;
    const dy = targetY - sourceY;

    if (dx === 0 && dy === 0) return;

    // Try to find a clear Manhattan path
    const path = this.findManhattanPath(sourceX, sourceY, targetX, targetY);

    if (path.length >= 2) {
      this.drawPath(path, hChar);
    }

    // Place edge label at midpoint
    if (label && path.length >= 2) {
      const midIdx = Math.floor(path.length / 2);
      const mid = path[midIdx];
      for (let i = 0; i < label.length; i++) {
        if (this.inBounds(mid.x + i, mid.y)) {
          this.setCell(mid.x + i, mid.y, label[i]);
        }
      }
    }
  }

  /**
   * Find a Manhattan path from (sx,sy) to (tx,ty) that avoids occupied cells.
   * Tries multiple strategies:
   * 1. Direct H-V or V-H path
   * 2. Offset channel routing (go around obstacles)
   */
  private findManhattanPath(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
  ): Array<{ x: number; y: number }> {
    const dx = tx - sx;
    const dy = ty - sy;

    // Strategy 1: Straight line (same axis)
    if (dy === 0) {
      if (!this.isPathBlockedH(sx, tx, sy)) {
        return this.hPath(sx, tx, sy);
      }
      // Find clear channel above or below
      for (let offset = 1; offset < this.height; offset++) {
        for (const dir of [-1, 1]) {
          const channelY = sy + offset * dir;
          if (!this.inBounds(0, channelY)) continue;
          if (
            !this.isOccupied(sx, channelY) &&
            !this.isOccupied(tx, channelY) &&
            !this.isPathBlockedH(sx, tx, channelY)
          ) {
            // Route: down to channel, horizontal, up to target
            return [
              ...this.vPath(sy, channelY, sx),
              ...this.hPath(sx, tx, channelY).slice(1),
              ...this.vPath(channelY, ty, tx).slice(1),
            ];
          }
        }
      }
    }

    if (dx === 0) {
      if (!this.isPathBlockedV(sy, ty, sx)) {
        return this.vPath(sy, ty, sx);
      }
      for (let offset = 1; offset < this.width; offset++) {
        for (const dir of [-1, 1]) {
          const channelX = sx + offset * dir;
          if (!this.inBounds(channelX, 0)) continue;
          if (
            !this.isOccupied(channelX, sy) &&
            !this.isOccupied(channelX, ty) &&
            !this.isPathBlockedV(sy, ty, channelX)
          ) {
            return [
              ...this.hPath(sx, channelX, sy),
              ...this.vPath(sy, ty, channelX).slice(1),
              ...this.hPath(channelX, tx, ty).slice(1),
            ];
          }
        }
      }
    }

    // Strategy 2: L-shape (H then V, or V then H)
    // Try V-H first if primarily vertical, H-V if primarily horizontal
    if (Math.abs(dy) >= Math.abs(dx)) {
      // V then H
      if (
        !this.isPathBlockedV(sy, ty, sx) &&
        !this.isPathBlockedH(sx, tx, ty)
      ) {
        return [...this.vPath(sy, ty, sx), ...this.hPath(sx, tx, ty).slice(1)];
      }
      // H then V
      if (
        !this.isPathBlockedH(sx, tx, sy) &&
        !this.isPathBlockedV(sy, ty, tx)
      ) {
        return [...this.hPath(sx, tx, sy), ...this.vPath(sy, ty, tx).slice(1)];
      }
    } else {
      // H then V
      if (
        !this.isPathBlockedH(sx, tx, sy) &&
        !this.isPathBlockedV(sy, ty, tx)
      ) {
        return [...this.hPath(sx, tx, sy), ...this.vPath(sy, ty, tx).slice(1)];
      }
      // V then H
      if (
        !this.isPathBlockedV(sy, ty, sx) &&
        !this.isPathBlockedH(sx, tx, ty)
      ) {
        return [...this.vPath(sy, ty, sx), ...this.hPath(sx, tx, ty).slice(1)];
      }
    }

    // Strategy 3: Z-shape through midpoint
    const midY = Math.round((sy + ty) / 2);
    const midX = Math.round((sx + tx) / 2);

    if (Math.abs(dy) >= Math.abs(dx)) {
      // V-H-V through midY
      return [
        ...this.vPath(sy, midY, sx),
        ...this.hPath(sx, tx, midY).slice(1),
        ...this.vPath(midY, ty, tx).slice(1),
      ];
    } else {
      // H-V-H through midX
      return [
        ...this.hPath(sx, midX, sy),
        ...this.vPath(sy, ty, midX).slice(1),
        ...this.hPath(midX, tx, ty).slice(1),
      ];
    }
  }

  private hPath(
    x1: number,
    x2: number,
    y: number,
  ): Array<{ x: number; y: number }> {
    const path: Array<{ x: number; y: number }> = [];
    const dir = x2 > x1 ? 1 : -1;
    for (let x = x1; dir > 0 ? x <= x2 : x >= x2; x += dir) {
      path.push({ x, y });
    }
    return path;
  }

  private vPath(
    y1: number,
    y2: number,
    x: number,
  ): Array<{ x: number; y: number }> {
    const path: Array<{ x: number; y: number }> = [];
    const dir = y2 > y1 ? 1 : -1;
    for (let y = y1; dir > 0 ? y <= y2 : y >= y2; y += dir) {
      path.push({ x, y });
    }
    return path;
  }

  private isPathBlockedH(x1: number, x2: number, y: number): boolean {
    const dir = x2 > x1 ? 1 : -1;
    // Skip endpoints (they're at node borders)
    for (let x = x1 + dir; dir > 0 ? x < x2 : x > x2; x += dir) {
      if (this.isOccupied(x, y)) return true;
    }
    return false;
  }

  private isPathBlockedV(y1: number, y2: number, x: number): boolean {
    const dir = y2 > y1 ? 1 : -1;
    for (let y = y1 + dir; dir > 0 ? y < y2 : y > y2; y += dir) {
      if (this.isOccupied(x, y)) return true;
    }
    return false;
  }

  /**
   * Render a sequence of grid points as connected segments with box-drawing chars.
   */
  private drawPath(path: Array<{ x: number; y: number }>, hChar: string): void {
    if (path.length < 2) return;

    for (let i = 0; i < path.length; i++) {
      const curr = path[i];
      const prev = i > 0 ? path[i - 1] : null;
      const next = i < path.length - 1 ? path[i + 1] : null;

      const fromDir = prev
        ? { dx: curr.x - prev.x, dy: curr.y - prev.y }
        : null;
      const toDir = next ? { dx: next.x - curr.x, dy: next.y - curr.y } : null;

      let char: string;

      if (!fromDir && toDir) {
        // Start point - draw appropriate character
        if (toDir.dx !== 0) char = hChar;
        else char = '│';
      } else if (fromDir && !toDir) {
        // End point - arrow or terminus
        if (fromDir.dx > 0) char = '→';
        else if (fromDir.dx < 0) char = '←';
        else if (fromDir.dy > 0) char = '│';
        else char = '│';
      } else if (fromDir && toDir) {
        // Middle point
        const isCorner =
          (fromDir.dx !== 0 && toDir.dy !== 0) ||
          (fromDir.dy !== 0 && toDir.dx !== 0);

        if (isCorner) {
          // Determine corner type from directions
          const goRight = fromDir.dx > 0 || toDir.dx > 0;
          const goLeft = fromDir.dx < 0 || toDir.dx < 0;
          const goDown = fromDir.dy > 0 || toDir.dy > 0;
          const goUp = fromDir.dy < 0 || toDir.dy < 0;

          if (goRight && goDown) char = '┌';
          else if (goLeft && goDown) char = '┐';
          else if (goRight && goUp) char = '└';
          else if (goLeft && goUp) char = '┘';
          else char = '+';
        } else if (fromDir.dy !== 0) {
          char = '│';
        } else {
          char = hChar;
        }
      } else {
        continue;
      }

      this.setCellIfEmpty(curr.x, curr.y, char);
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
