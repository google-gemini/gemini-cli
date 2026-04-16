/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  NoiseFilter,
  extractFilterNodes,
  buildNodeIdSet,
  type FilterNode,
} from './noise-filter.js';
import type { HeapSnapshot } from './perfetto.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<FilterNode>): FilterNode {
  return {
    nodeId: 1,
    type: 'object',
    name: 'MyClass',
    selfSize: 256,
    edgeCount: 0,
    ...overrides,
  };
}

function makeSnapshot(
  nodes: Array<{ name: string; type?: string; selfSize?: number; id?: number }>,
): HeapSnapshot {
  const strings: string[] = [];
  const nodeArr: number[] = [];
  const typeEnum = [
    'hidden',
    'array',
    'string',
    'object',
    'code',
    'closure',
    'regexp',
    'number',
    'native',
    'synthetic',
  ];

  for (let i = 0; i < nodes.length; i++) {
    const { name, type = 'object', selfSize = 256, id } = nodes[i];
    const typeIdx = typeEnum.indexOf(type);
    let nameIdx = strings.indexOf(name);
    if (nameIdx === -1) {
      nameIdx = strings.length;
      strings.push(name);
    }
    nodeArr.push(typeIdx >= 0 ? typeIdx : 3, nameIdx, id ?? i + 1, selfSize, 0);
  }

  return {
    snapshot: {
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
        node_types: [typeEnum, 'string', 'number', 'number', 'number'],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [
          ['context', 'element', 'property'],
          'string_or_number',
          'node',
        ],
      },
      node_count: nodes.length,
      edge_count: 0,
    },
    nodes: nodeArr,
    edges: [],
    strings,
  };
}

// ---------------------------------------------------------------------------
// Layer 1 – System objects
// ---------------------------------------------------------------------------

describe('NoiseFilter.layer1_systemObjects', () => {
  let filter: NoiseFilter;
  beforeEach(() => {
    filter = new NoiseFilter();
  });

  it('filters nodes with type "native"', () => {
    expect(filter.layer1_systemObjects(makeNode({ type: 'native' }))).toBe(
      true,
    );
  });

  it('filters nodes with type "hidden"', () => {
    expect(filter.layer1_systemObjects(makeNode({ type: 'hidden' }))).toBe(
      true,
    );
  });

  it('filters nodes with type "code"', () => {
    expect(filter.layer1_systemObjects(makeNode({ type: 'code' }))).toBe(true);
  });

  it('filters nodes with type "synthetic"', () => {
    expect(filter.layer1_systemObjects(makeNode({ type: 'synthetic' }))).toBe(
      true,
    );
  });

  it('filters well-known built-in names (Array)', () => {
    expect(filter.layer1_systemObjects(makeNode({ name: 'Array' }))).toBe(true);
  });

  it('filters Map', () => {
    expect(filter.layer1_systemObjects(makeNode({ name: 'Map' }))).toBe(true);
  });

  it('filters WeakMap', () => {
    expect(filter.layer1_systemObjects(makeNode({ name: 'WeakMap' }))).toBe(
      true,
    );
  });

  it('does not filter regular object type', () => {
    expect(
      filter.layer1_systemObjects(
        makeNode({ type: 'object', name: 'MyClass' }),
      ),
    ).toBe(false);
  });

  it('does not filter user class names', () => {
    expect(
      filter.layer1_systemObjects(makeNode({ name: 'RequestHandler' })),
    ).toBe(false);
  });

  it('does not filter "closure" type', () => {
    expect(filter.layer1_systemObjects(makeNode({ type: 'closure' }))).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Layer 2 – Module cache
// ---------------------------------------------------------------------------

describe('NoiseFilter.layer2_moduleCache', () => {
  let filter: NoiseFilter;
  beforeEach(() => {
    filter = new NoiseFilter();
  });

  it('filters Module._cache', () => {
    expect(filter.layer2_moduleCache(makeNode({ name: 'Module._cache' }))).toBe(
      true,
    );
  });

  it('filters require.cache', () => {
    expect(filter.layer2_moduleCache(makeNode({ name: 'require.cache' }))).toBe(
      true,
    );
  });

  it('filters NativeModule', () => {
    expect(filter.layer2_moduleCache(makeNode({ name: 'NativeModule' }))).toBe(
      true,
    );
  });

  it('filters ContextifyScript', () => {
    expect(
      filter.layer2_moduleCache(makeNode({ name: 'ContextifyScript' })),
    ).toBe(true);
  });

  it('does not filter regular object', () => {
    expect(filter.layer2_moduleCache(makeNode({ name: 'UserService' }))).toBe(
      false,
    );
  });

  it('does not filter partial matches that are not module cache', () => {
    expect(
      filter.layer2_moduleCache(makeNode({ name: 'ModuleResolver' })),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Layer 3 – Singletons
// ---------------------------------------------------------------------------

describe('NoiseFilter.layer3_singletons', () => {
  let filter: NoiseFilter;
  beforeEach(() => {
    filter = new NoiseFilter();
  });

  it('filters process. prefix', () => {
    expect(filter.layer3_singletons(makeNode({ name: 'process.env' }))).toBe(
      true,
    );
  });

  it('filters global. prefix', () => {
    expect(filter.layer3_singletons(makeNode({ name: 'global.myThing' }))).toBe(
      true,
    );
  });

  it('filters EventEmitter.prototype', () => {
    expect(
      filter.layer3_singletons(makeNode({ name: 'EventEmitter.prototype' })),
    ).toBe(true);
  });

  it('filters Stream.prototype', () => {
    expect(
      filter.layer3_singletons(makeNode({ name: 'Stream.prototype' })),
    ).toBe(true);
  });

  it('filters Buffer.poolSize', () => {
    expect(
      filter.layer3_singletons(makeNode({ name: 'Buffer.poolSize' })),
    ).toBe(true);
  });

  it('does not filter non-singleton objects', () => {
    expect(filter.layer3_singletons(makeNode({ name: 'RequestHandler' }))).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Layer 4 – Temporal
// ---------------------------------------------------------------------------

describe('NoiseFilter.layer4_temporal', () => {
  let filter: NoiseFilter;
  beforeEach(() => {
    filter = new NoiseFilter();
  });

  it('keeps node present in both S2 and S3', () => {
    const s2 = new Set([1, 2, 3]);
    const s3 = new Set([1, 2, 3]);
    expect(filter.layer4_temporal(1, s2, s3)).toBe(false); // not filtered
  });

  it('filters node absent from S2 (short-lived)', () => {
    const s2 = new Set([2, 3]);
    const s3 = new Set([1, 2, 3]);
    expect(filter.layer4_temporal(1, s2, s3)).toBe(true);
  });

  it('filters node absent from S3 (already GCed)', () => {
    const s2 = new Set([1, 2, 3]);
    const s3 = new Set([2, 3]);
    expect(filter.layer4_temporal(1, s2, s3)).toBe(true);
  });

  it('keeps node 2 that is in both', () => {
    const s2 = new Set([2, 3]);
    const s3 = new Set([2, 3, 4]);
    expect(filter.layer4_temporal(2, s2, s3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Layer 5 – Size threshold
// ---------------------------------------------------------------------------

describe('NoiseFilter.layer5_sizeThreshold', () => {
  let filter: NoiseFilter;
  beforeEach(() => {
    filter = new NoiseFilter();
  });

  it('filters self_size < 64', () => {
    expect(filter.layer5_sizeThreshold(32)).toBe(true);
  });

  it('filters self_size == 0', () => {
    expect(filter.layer5_sizeThreshold(0)).toBe(true);
  });

  it('keeps self_size >= 64', () => {
    expect(filter.layer5_sizeThreshold(64)).toBe(false);
  });

  it('keeps self_size > 64', () => {
    expect(filter.layer5_sizeThreshold(1024)).toBe(false);
  });

  it('respects custom threshold', () => {
    expect(filter.layer5_sizeThreshold(100, 200)).toBe(true);
    expect(filter.layer5_sizeThreshold(200, 200)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Combined applyAll
// ---------------------------------------------------------------------------

describe('NoiseFilter.applyAll', () => {
  let filter: NoiseFilter;
  beforeEach(() => {
    filter = new NoiseFilter();
  });

  it('removes system objects via layer 1', () => {
    const nodes = [
      makeNode({ nodeId: 1, type: 'native', selfSize: 256 }),
      makeNode({ nodeId: 2, type: 'object', name: 'UserClass', selfSize: 256 }),
    ];
    const result = filter.applyAll(nodes);
    expect(result.map((n) => n.nodeId)).toEqual([2]);
  });

  it('removes module cache via layer 2', () => {
    const nodes = [
      makeNode({ nodeId: 1, name: 'Module._cache', selfSize: 512 }),
      makeNode({ nodeId: 2, name: 'UserClass', selfSize: 256 }),
    ];
    const result = filter.applyAll(nodes);
    expect(result.length).toBe(1);
    expect(result[0].nodeId).toBe(2);
  });

  it('removes singletons via layer 3', () => {
    const nodes = [
      makeNode({ nodeId: 1, name: 'process.env', selfSize: 512 }),
      makeNode({ nodeId: 2, name: 'UserClass', selfSize: 256 }),
    ];
    const result = filter.applyAll(nodes);
    expect(result.length).toBe(1);
  });

  it('applies temporal filter when s2Ids provided', () => {
    const s2Ids = new Set([2]);
    const nodes = [
      makeNode({ nodeId: 1, name: 'UserClass', selfSize: 256 }), // not in s2 → filtered
      makeNode({ nodeId: 2, name: 'OtherClass', selfSize: 256 }), // in s2 → kept
    ];
    const result = filter.applyAll(nodes, { s2Ids });
    expect(result.length).toBe(1);
    expect(result[0].nodeId).toBe(2);
  });

  it('removes tiny objects via layer 5', () => {
    const nodes = [
      makeNode({ nodeId: 1, selfSize: 16, name: 'TinyObj' }),
      makeNode({ nodeId: 2, selfSize: 128, name: 'LargeObj' }),
    ];
    const result = filter.applyAll(nodes);
    expect(result.length).toBe(1);
    expect(result[0].nodeId).toBe(2);
  });

  it('keeps nodes that pass all layers', () => {
    const s2Ids = new Set([1, 2]);
    const nodes = [
      makeNode({ nodeId: 1, type: 'object', name: 'GoodClass', selfSize: 512 }),
      makeNode({ nodeId: 2, type: 'closure', name: 'handler', selfSize: 128 }),
    ];
    const result = filter.applyAll(nodes, { s2Ids });
    expect(result.length).toBe(2);
  });

  it('returns empty array when all nodes are filtered', () => {
    const nodes = [
      makeNode({ nodeId: 1, type: 'native', selfSize: 256 }),
      makeNode({ nodeId: 2, name: 'Array', selfSize: 512 }),
    ];
    expect(filter.applyAll(nodes)).toEqual([]);
  });

  it('handles empty input', () => {
    expect(filter.applyAll([])).toEqual([]);
  });

  it('handles node with null/empty name', () => {
    const nodes = [
      makeNode({ nodeId: 1, name: '', type: 'object', selfSize: 256 }),
    ];
    const result = filter.applyAll(nodes);
    expect(result.length).toBe(1); // empty name passes all string-based filters
  });

  it('respects custom size threshold in context', () => {
    const nodes = [
      makeNode({ nodeId: 1, selfSize: 100, name: 'SmallObj' }),
      makeNode({ nodeId: 2, selfSize: 500, name: 'BigObj' }),
    ];
    const result = filter.applyAll(nodes, { sizeThreshold: 200 });
    expect(result.length).toBe(1);
    expect(result[0].nodeId).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// extractFilterNodes
// ---------------------------------------------------------------------------

describe('extractFilterNodes', () => {
  it('extracts nodes from a HeapSnapshot', () => {
    const snap = makeSnapshot([
      { name: 'MyClass', type: 'object', selfSize: 256, id: 10 },
      { name: 'OtherClass', type: 'closure', selfSize: 128, id: 20 },
    ]);
    const nodes = extractFilterNodes(snap);
    expect(nodes.length).toBe(2);
    expect(nodes[0].name).toBe('MyClass');
    expect(nodes[0].type).toBe('object');
    expect(nodes[0].selfSize).toBe(256);
    expect(nodes[0].nodeId).toBe(10);
  });

  it('handles empty snapshot', () => {
    const snap = makeSnapshot([]);
    expect(extractFilterNodes(snap)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildNodeIdSet
// ---------------------------------------------------------------------------

describe('buildNodeIdSet', () => {
  it('returns set of all node IDs', () => {
    const snap = makeSnapshot([
      { name: 'A', id: 5 },
      { name: 'B', id: 10 },
      { name: 'C', id: 15 },
    ]);
    const ids = buildNodeIdSet(snap);
    expect(ids.has(5)).toBe(true);
    expect(ids.has(10)).toBe(true);
    expect(ids.has(15)).toBe(true);
    expect(ids.size).toBe(3);
  });

  it('returns empty set for empty snapshot', () => {
    const snap = makeSnapshot([]);
    expect(buildNodeIdSet(snap).size).toBe(0);
  });
});
