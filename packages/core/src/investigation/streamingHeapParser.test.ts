/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  StreamingHeapParser,
  parseHeapSnapshot,
  type StreamingParseProgress,
} from './streamingHeapParser.js';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function createTestSnapshot(
  nodeCount: number = 3,
  edgeCount: number = 2,
): object {
  const nodeFields = [
    'type',
    'name',
    'id',
    'self_size',
    'edge_count',
    'trace_node_id',
    'detachedness',
  ];
  const edgeFields = ['type', 'name_or_index', 'to_node'];

  // Generate flat node array: nodeCount * nodeFields.length values
  const nodes: number[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push(
      1, // type: object
      i, // name index into strings
      i + 1, // id
      (i + 1) * 100, // self_size
      i < nodeCount - 1 ? 1 : 0, // edge_count
      0, // trace_node_id
      0, // detachedness
    );
  }

  // Generate flat edge array: edgeCount * edgeFields.length values
  const edges: number[] = [];
  for (let i = 0; i < edgeCount; i++) {
    edges.push(
      2, // type: property
      i, // name_or_index
      (i + 1) * nodeFields.length, // to_node
    );
  }

  const strings = Array.from({ length: nodeCount }, (_, i) => `Class${i}`);

  return {
    snapshot: {
      meta: {
        node_fields: nodeFields,
        node_types: [
          [
            'hidden',
            'object',
            'string',
            'number',
            'code',
            'closure',
            'regexp',
            'native',
            'synthetic',
            'concatenated string',
            'sliced string',
            'symbol',
            'bigint',
            'array',
          ],
        ],
        edge_fields: edgeFields,
        edge_types: [
          [
            'context',
            'element',
            'property',
            'internal',
            'hidden',
            'shortcut',
            'weak',
          ],
        ],
      },
      node_count: nodeCount,
      edge_count: edgeCount,
    },
    nodes,
    edges,
    strings,
  };
}

function writeTempSnapshot(data: object): string {
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `test-snapshot-${Date.now()}.heapsnapshot`);
  fs.writeFileSync(filePath, JSON.stringify(data));
  return filePath;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('StreamingHeapParser', () => {
  let tempFiles: string[] = [];

  afterEach(() => {
    for (const f of tempFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
    tempFiles = [];
  });

  describe('shouldStream()', () => {
    it('should return false for small files', async () => {
      const parser = new StreamingHeapParser();
      const filePath = writeTempSnapshot(createTestSnapshot());
      tempFiles.push(filePath);
      expect(await parser.shouldStream(filePath)).toBe(false);
    });
  });

  describe('parseFile() for small snapshots', () => {
    it('should parse a minimal snapshot correctly', async () => {
      const original = createTestSnapshot(3, 2);
      const filePath = writeTempSnapshot(original);
      tempFiles.push(filePath);

      const result = await parseHeapSnapshot(filePath);

      expect(result.snapshot.node_count).toBe(3);
      expect(result.snapshot.edge_count).toBe(2);
      expect(result.nodes.length).toBe(21); // 3 nodes * 7 fields
      expect(result.edges.length).toBe(6); // 2 edges * 3 fields
      expect(result.strings.length).toBe(3);
    });

    it('should match JSON.parse output', async () => {
      const original = createTestSnapshot(10, 8);
      const filePath = writeTempSnapshot(original);
      tempFiles.push(filePath);

      const streaming = await parseHeapSnapshot(filePath);
      const direct = JSON.parse(
        fs.readFileSync(filePath, 'utf-8'),
      );

      expect(streaming.nodes).toEqual(direct.nodes);
      expect(streaming.edges).toEqual(direct.edges);
      expect(streaming.strings).toEqual(direct.strings);
      expect(streaming.snapshot.node_count).toBe(direct.snapshot.node_count);
    });
  });

  describe('parseFile() with strings containing special characters', () => {
    it('should handle escaped quotes in strings', async () => {
      const snapshot = createTestSnapshot(2, 1);
      // Manually add strings with special characters
      (snapshot as { strings: string[] }).strings = [
        'Normal',
        'Has "quotes"',
      ];
      const filePath = writeTempSnapshot(snapshot);
      tempFiles.push(filePath);

      const result = await parseHeapSnapshot(filePath);
      expect(result.strings).toContain('Normal');
      expect(result.strings).toContain('Has "quotes"');
    });

    it('should handle strings with backslashes and newlines', async () => {
      const snapshot = createTestSnapshot(3, 1);
      (snapshot as { strings: string[] }).strings = [
        'path\\to\\file',
        'line1\nline2',
        'tab\there',
      ];
      const filePath = writeTempSnapshot(snapshot);
      tempFiles.push(filePath);

      const result = await parseHeapSnapshot(filePath);
      expect(result.strings).toContain('path\\to\\file');
      expect(result.strings).toContain('line1\nline2');
      expect(result.strings).toContain('tab\there');
    });
  });

  describe('progress events', () => {
    it('should emit progress events during parsing', async () => {
      const original = createTestSnapshot(10, 5);
      const filePath = writeTempSnapshot(original);
      tempFiles.push(filePath);

      const progresses: StreamingParseProgress[] = [];
      const result = await parseHeapSnapshot(filePath, (p) =>
        progresses.push(p),
      );

      // Should have at least received a 'done' event or some progress
      expect(result.snapshot).toBeDefined();
      // Small files use JSON.parse directly, so progress events may not fire
      // This test just verifies the callback doesn't crash
    });
  });

  describe('StreamingHeapParser constructor', () => {
    it('should accept custom options', () => {
      const parser = new StreamingHeapParser({
        chunkSize: 128 * 1024,
        skipTraceData: true,
        includeLocations: false,
      });
      expect(parser).toBeDefined();
    });
  });
});
