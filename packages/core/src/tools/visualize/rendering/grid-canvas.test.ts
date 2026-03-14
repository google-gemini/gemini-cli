/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { GridCanvas } from './grid-canvas.js';
import type { DiagramNode, DiagramEdge } from '../types.js';

function makeNode(overrides: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id: 'A',
    label: 'Hello',
    shape: 'rect',
    x: 0,
    y: 0,
    width: 10,
    height: 3,
    ...overrides,
  };
}

function makeEdge(overrides: Partial<DiagramEdge> = {}): DiagramEdge {
  return {
    source: 'A',
    target: 'B',
    style: 'solid',
    sourceX: 0,
    sourceY: 0,
    targetX: 10,
    targetY: 0,
    ...overrides,
  };
}

describe('GridCanvas', () => {
  it('should render a single rect node with borders and label', () => {
    const canvas = new GridCanvas(12, 5);
    canvas.drawNode(makeNode({ x: 1, y: 1, width: 10, height: 3 }));
    const output = canvas.toString();

    expect(output).toContain('┌');
    expect(output).toContain('┐');
    expect(output).toContain('└');
    expect(output).toContain('┘');
    expect(output).toContain('Hello');
  });

  it('should render a horizontal edge with arrow', () => {
    const canvas = new GridCanvas(15, 1);
    canvas.drawEdge(
      makeEdge({ sourceX: 0, sourceY: 0, targetX: 10, targetY: 0 }),
    );
    const output = canvas.toString();

    expect(output).toContain('─');
    expect(output).toContain('→');
  });

  it('should render an edge with a label', () => {
    const canvas = new GridCanvas(20, 1);
    canvas.drawEdge(
      makeEdge({
        sourceX: 0,
        sourceY: 0,
        targetX: 18,
        targetY: 0,
        label: 'yes',
      }),
    );
    const output = canvas.toString();

    expect(output).toContain('yes');
  });

  it('should have correct dimensions', () => {
    const canvas = new GridCanvas(40, 10);
    const lines = canvas.toString().split('\n');

    expect(lines).toHaveLength(10);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it('should render two nodes with an edge between them', () => {
    const canvas = new GridCanvas(30, 3);
    const nodeA = makeNode({
      id: 'A',
      label: 'A',
      x: 0,
      y: 0,
      width: 5,
      height: 3,
    });
    const nodeB = makeNode({
      id: 'B',
      label: 'B',
      x: 20,
      y: 0,
      width: 5,
      height: 3,
    });
    canvas.drawNode(nodeA);
    canvas.drawNode(nodeB);
    canvas.drawEdge(
      makeEdge({
        sourceX: 5,
        sourceY: 1,
        targetX: 19,
        targetY: 1,
      }),
    );
    const output = canvas.toString();

    // Both nodes present
    expect(output).toContain('A');
    expect(output).toContain('B');
    // Edge present
    expect(output).toContain('→');
  });

  it('should not overwrite node cells with edge characters', () => {
    const canvas = new GridCanvas(30, 3);
    const node = makeNode({
      id: 'A',
      label: 'Start',
      x: 0,
      y: 0,
      width: 9,
      height: 3,
    });
    canvas.drawNode(node);

    // Draw an edge that passes through the node area
    canvas.drawEdge(
      makeEdge({
        sourceX: 0,
        sourceY: 1,
        targetX: 20,
        targetY: 1,
      }),
    );
    const output = canvas.toString();
    const lines = output.split('\n');

    // The node's top border should still be intact
    expect(lines[0].startsWith('┌')).toBe(true);
    // The node label row should still contain the label
    expect(lines[1]).toContain('Start');
    // The node's border characters should not be overwritten
    expect(lines[1][0]).toBe('│');
    expect(lines[1][8]).toBe('│');
  });
});
