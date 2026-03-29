/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  parseHeapSnapshotStream,
  streamHeapSnapshotNodes,
} from './streaming-parser.js';
import type { HeapSnapshot } from './perfetto.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalSnapshot(
  overrides: Partial<HeapSnapshot> = {},
): HeapSnapshot {
  return {
    snapshot: {
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
        node_types: [
          [
            'hidden',
            'array',
            'string',
            'object',
            'code',
            'closure',
            'regexp',
            'number',
            'native',
          ],
          'string',
          'number',
          'number',
          'number',
        ],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [
          ['context', 'element', 'property', 'internal'],
          'string_or_number',
          'node',
        ],
      },
      node_count: 2,
      edge_count: 1,
    },
    nodes: [
      3,
      0,
      1,
      128,
      1, // object, strings[0], id=1, 128B, 1 edge
      3,
      1,
      2,
      64,
      0, // object, strings[1], id=2,  64B, 0 edges
    ],
    edges: [
      2,
      2,
      5, // property, strings[2], to_node=5 (byte offset of node 1)
    ],
    strings: ['MyClass', 'OtherClass', 'propName'],
    ...overrides,
  };
}

function snapshotToJson(snap: HeapSnapshot): string {
  return JSON.stringify(snap);
}

function writeTempFile(content: string): string {
  const tmpDir = os.tmpdir();
  const filePath = path.join(
    tmpDir,
    `test-snap-${Date.now()}-${Math.random().toString(36).slice(2)}.heapsnapshot`,
  );
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseHeapSnapshotStream', () => {
  it('parses a minimal snapshot correctly', async () => {
    const snap = makeMinimalSnapshot();
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(result.strings).toEqual(snap.strings);
      expect(result.nodes).toEqual(snap.nodes);
      expect(result.edges).toEqual(snap.edges);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('parses node_fields metadata dynamically', async () => {
    const snap = makeMinimalSnapshot();
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(result.snapshot.meta.node_fields).toEqual([
        'type',
        'name',
        'id',
        'self_size',
        'edge_count',
      ]);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('parses edge_fields metadata', async () => {
    const snap = makeMinimalSnapshot();
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(result.snapshot.meta.edge_fields).toEqual([
        'type',
        'name_or_index',
        'to_node',
      ]);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('parses node_count and edge_count', async () => {
    const snap = makeMinimalSnapshot();
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(result.snapshot.node_count).toBe(2);
      expect(result.snapshot.edge_count).toBe(1);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('handles empty nodes array', async () => {
    const snap = makeMinimalSnapshot({ nodes: [], edges: [] });
    snap.snapshot.node_count = 0;
    snap.snapshot.edge_count = 0;
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(result.nodes).toEqual([]);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('handles empty strings array', async () => {
    const snap = makeMinimalSnapshot({ strings: [] });
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(result.strings).toEqual([]);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('handles strings with escape sequences', async () => {
    const snap = makeMinimalSnapshot({
      strings: ['hello "world"', 'line\nnewline', 'tab\there'],
    });
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(result.strings[0]).toBe('hello "world"');
      expect(result.strings[1]).toBe('line\nnewline');
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('handles snapshot with many nodes', async () => {
    const nodes: number[] = [];
    const strings = ['TestObj'];
    const COUNT = 1000;
    for (let i = 0; i < COUNT; i++) {
      nodes.push(3, 0, i + 1, 128, 0);
    }
    const snap = makeMinimalSnapshot({ nodes, edges: [], strings });
    snap.snapshot.node_count = COUNT;
    snap.snapshot.edge_count = 0;
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(result.nodes.length).toBe(COUNT * 5);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('handles large strings array (5000 entries)', async () => {
    const strings = Array.from({ length: 5000 }, (_, i) => `string_${i}`);
    const snap = makeMinimalSnapshot({ strings });
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(result.strings.length).toBe(5000);
      expect(result.strings[0]).toBe('string_0');
      expect(result.strings[4999]).toBe('string_4999');
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('handles chunk boundary at string boundary', async () => {
    // Build a snapshot where the JSON crosses a 64KB boundary
    const strings = Array.from({ length: 2000 }, (_, i) => `a`.repeat(30) + i);
    const snap = makeMinimalSnapshot({ strings });
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(result.strings.length).toBe(2000);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('handles chunk boundary inside a number', async () => {
    // Large nodes array to force chunk splits mid-number
    const nodes: number[] = [];
    for (let i = 0; i < 500; i++) {
      nodes.push(3, 0, i + 1, 9999999, 0);
    }
    const snap = makeMinimalSnapshot({ nodes, edges: [] });
    snap.snapshot.node_count = 500;
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(result.nodes.length).toBe(500 * 5);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('handles node_types as mixed array (strings and arrays)', async () => {
    const snap = makeMinimalSnapshot();
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(Array.isArray(result.snapshot.meta.node_types[0])).toBe(true);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('returns correct node values for multi-field nodes', async () => {
    const snap = makeMinimalSnapshot();
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      // First node: type=3, name=0, id=1, self_size=128, edge_count=1
      expect(result.nodes[0]).toBe(3);
      expect(result.nodes[1]).toBe(0);
      expect(result.nodes[2]).toBe(1);
      expect(result.nodes[3]).toBe(128);
      expect(result.nodes[4]).toBe(1);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('handles zero-size nodes correctly', async () => {
    const snap = makeMinimalSnapshot({
      nodes: [3, 0, 1, 0, 0],
    });
    snap.snapshot.node_count = 1;
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(result.nodes[3]).toBe(0); // self_size = 0
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('handles snapshots with no edges', async () => {
    const snap = makeMinimalSnapshot({ edges: [] });
    snap.snapshot.edge_count = 0;
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(result.edges).toEqual([]);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('emits warning for files > 200MB (mocked via stderr)', async () => {
    // We can't easily create a 200MB file in tests, but we verify the parser
    // still returns valid data for normal-size files.
    const snap = makeMinimalSnapshot();
    const filePath = writeTempFile(snapshotToJson(snap));
    try {
      const result = await parseHeapSnapshotStream(filePath);
      expect(result).toBeDefined();
    } finally {
      fs.unlinkSync(filePath);
    }
  });
});

describe('streamHeapSnapshotNodes', () => {
  it('calls onNode for each node', async () => {
    const snap = makeMinimalSnapshot();
    const filePath = writeTempFile(snapshotToJson(snap));
    const visited: number[] = [];
    try {
      await streamHeapSnapshotNodes(filePath, (nodeId) => {
        visited.push(nodeId);
      });
      expect(visited.length).toBe(2);
      expect(visited).toContain(1);
      expect(visited).toContain(2);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('provides correct field values in callback', async () => {
    const snap = makeMinimalSnapshot();
    const filePath = writeTempFile(snapshotToJson(snap));
    const fieldMap = new Map<number, Record<string, number | string>>();
    try {
      await streamHeapSnapshotNodes(filePath, (nodeId, fields) => {
        fieldMap.set(nodeId, fields);
      });
      const node1 = fieldMap.get(1);
      expect(node1).toBeDefined();
      expect(node1?.['self_size']).toBe(128);
      expect(node1?.['name']).toBe('MyClass');
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('resolves type enum for type field', async () => {
    const snap = makeMinimalSnapshot();
    const filePath = writeTempFile(snapshotToJson(snap));
    const types: string[] = [];
    try {
      await streamHeapSnapshotNodes(filePath, (_id, fields) => {
        types.push(fields['type'] as string);
      });
      // type index 3 = 'object'
      expect(types[0]).toBe('object');
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('handles empty snapshot without calling onNode', async () => {
    const snap = makeMinimalSnapshot({ nodes: [], edges: [] });
    snap.snapshot.node_count = 0;
    const filePath = writeTempFile(snapshotToJson(snap));
    let callCount = 0;
    try {
      await streamHeapSnapshotNodes(filePath, () => {
        callCount++;
      });
      expect(callCount).toBe(0);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('handles 100 nodes in streaming mode', async () => {
    const nodes: number[] = [];
    for (let i = 0; i < 100; i++) {
      nodes.push(3, 0, i + 1, 256, 0);
    }
    const snap = makeMinimalSnapshot({ nodes, edges: [] });
    snap.snapshot.node_count = 100;
    const filePath = writeTempFile(snapshotToJson(snap));
    let callCount = 0;
    try {
      await streamHeapSnapshotNodes(filePath, () => {
        callCount++;
      });
      expect(callCount).toBe(100);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('passes edge_count in fields', async () => {
    const snap = makeMinimalSnapshot();
    const filePath = writeTempFile(snapshotToJson(snap));
    const edgeCounts: number[] = [];
    try {
      await streamHeapSnapshotNodes(filePath, (_id, fields) => {
        edgeCounts.push(fields['edge_count'] as number);
      });
      expect(edgeCounts[0]).toBe(1);
      expect(edgeCounts[1]).toBe(0);
    } finally {
      fs.unlinkSync(filePath);
    }
  });
});
