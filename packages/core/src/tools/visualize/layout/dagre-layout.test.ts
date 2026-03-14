/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { layoutDiagram } from './dagre-layout.js';

describe('dagre-layout', () => {
  it('should give all nodes valid positions', () => {
    const result = layoutDiagram(
      [
        { id: 'A', label: 'Start', shape: 'rect' },
        { id: 'B', label: 'End', shape: 'rect' },
      ],
      [{ source: 'A', target: 'B', style: 'solid' }],
      { direction: 'LR', terminalWidth: 80 },
    );

    expect(result.nodes).toHaveLength(2);
    for (const node of result.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }
  });

  it('should place source left of target in LR layout', () => {
    const result = layoutDiagram(
      [
        { id: 'A', label: 'Start', shape: 'rect' },
        { id: 'B', label: 'End', shape: 'rect' },
      ],
      [{ source: 'A', target: 'B', style: 'solid' }],
      { direction: 'LR', terminalWidth: 80 },
    );

    const nodeA = result.nodes.find((n) => n.id === 'A')!;
    const nodeB = result.nodes.find((n) => n.id === 'B')!;

    expect(nodeA.x).toBeLessThan(nodeB.x);
  });

  it('should place source above target in TD layout', () => {
    const result = layoutDiagram(
      [
        { id: 'A', label: 'Top', shape: 'rect' },
        { id: 'B', label: 'Bottom', shape: 'rect' },
      ],
      [{ source: 'A', target: 'B', style: 'solid' }],
      { direction: 'TD', terminalWidth: 80 },
    );

    const nodeA = result.nodes.find((n) => n.id === 'A')!;
    const nodeB = result.nodes.find((n) => n.id === 'B')!;

    expect(nodeA.y).toBeLessThan(nodeB.y);
  });

  it('should handle single node with no edges', () => {
    const result = layoutDiagram(
      [{ id: 'A', label: 'Alone', shape: 'rect' }],
      [],
      { direction: 'LR', terminalWidth: 80 },
    );

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].x).toBeGreaterThanOrEqual(0);
    expect(result.nodes[0].y).toBeGreaterThanOrEqual(0);
    expect(result.nodes[0].width).toBeGreaterThan(0);
    expect(result.nodes[0].height).toBeGreaterThan(0);
    expect(result.edges).toHaveLength(0);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('should preserve edge labels and styles', () => {
    const result = layoutDiagram(
      [
        { id: 'A', label: 'Start', shape: 'rect' },
        { id: 'B', label: 'End', shape: 'rect' },
      ],
      [{ source: 'A', target: 'B', label: 'next', style: 'dotted' }],
      { direction: 'LR', terminalWidth: 80 },
    );

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].label).toBe('next');
    expect(result.edges[0].style).toBe('dotted');
  });

  it('should compute correct node dimensions', () => {
    const result = layoutDiagram(
      [{ id: 'A', label: 'Hello', shape: 'rect' }],
      [],
      { direction: 'LR', terminalWidth: 80 },
    );

    // width = 5 (label) + 4 (padding) + 2 (border) = 11
    // height = 3
    expect(result.nodes[0].width).toBe(11);
    expect(result.nodes[0].height).toBe(3);
  });
});
