/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseMermaid } from './mermaid-parser.js';

describe('mermaid-parser', () => {
  it('should parse simple flowchart with two nodes and one edge', async () => {
    const result = await parseMermaid(`
graph LR
  A[Start] --> B[End]
`);

    expect(result.diagramType).toBe('flowchart');
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);

    expect(result.nodes[0]).toEqual({ id: 'A', label: 'Start', shape: 'rect' });
    expect(result.nodes[1]).toEqual({ id: 'B', label: 'End', shape: 'rect' });

    expect(result.edges[0]).toMatchObject({
      source: 'A',
      target: 'B',
      style: 'solid',
    });
  });

  it('should detect diamond nodes from {}', async () => {
    const result = await parseMermaid(`
graph TD
  A[Start] --> B{Decision}
`);

    const diamondNode = result.nodes.find((n) => n.id === 'B');
    expect(diamondNode).toBeDefined();
    expect(diamondNode!.shape).toBe('diamond');
    expect(diamondNode!.label).toBe('Decision');
  });

  it('should detect rounded nodes from ()', async () => {
    const result = await parseMermaid(`
graph TD
  A(Rounded)
`);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].shape).toBe('rounded');
    expect(result.nodes[0].label).toBe('Rounded');
  });

  it('should parse edge labels -->|label|', async () => {
    const result = await parseMermaid(`
graph LR
  A --> B
  B -->|yes| C
`);

    expect(result.edges).toHaveLength(2);

    const labeledEdge = result.edges.find((e) => e.label === 'yes');
    expect(labeledEdge).toBeDefined();
    expect(labeledEdge!.source).toBe('B');
    expect(labeledEdge!.target).toBe('C');
    expect(labeledEdge!.style).toBe('solid');
  });

  it('should detect sequence diagram type', async () => {
    const result = await parseMermaid(`
sequenceDiagram
  Alice->>Bob: Hello
  Bob-->>Alice: Hi back
`);

    expect(result.diagramType).toBe('sequence');
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(2);

    expect(result.edges[0]).toMatchObject({
      source: 'Alice',
      target: 'Bob',
      label: 'Hello',
      style: 'solid',
    });

    expect(result.edges[1]).toMatchObject({
      source: 'Bob',
      target: 'Alice',
      label: 'Hi back',
      style: 'dotted',
    });
  });

  it('should handle nodes without brackets (bare id)', async () => {
    const result = await parseMermaid(`
graph LR
  A --> B
`);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toEqual({ id: 'A', label: 'A', shape: 'rect' });
    expect(result.nodes[1]).toEqual({ id: 'B', label: 'B', shape: 'rect' });
  });

  it('should detect dotted edge style from -.->', async () => {
    const result = await parseMermaid(`
graph LR
  A -.-> B
`);

    expect(result.edges[0].style).toBe('dotted');
  });

  it('should detect thick edge style from ==>', async () => {
    const result = await parseMermaid(`
graph LR
  A ==> B
`);

    expect(result.edges[0].style).toBe('thick');
  });

  it('should detect circle and stadium shapes', async () => {
    const result = await parseMermaid(`
graph LR
  A((Circle)) --> B([Stadium])
`);

    const circle = result.nodes.find((n) => n.id === 'A');
    const stadium = result.nodes.find((n) => n.id === 'B');

    expect(circle!.shape).toBe('circle');
    expect(stadium!.shape).toBe('stadium');
  });
});
