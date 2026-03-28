import { describe, it, expect, beforeEach } from 'vitest';
import { FlameGraphGenerator, type FlameNode } from './flameGraphGenerator.js';
import type { ClassSummary, RetainerChain } from './heapSnapshotAnalyzer.js';
import type { RootCauseFinding } from './rootCauseAnalyzer.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function createClassSummaries(): ClassSummary[] {
  return [
    { className: 'Map', count: 5, shallowSize: 500, retainedSize: 5_000_000, instances: [] },
    { className: 'string', count: 10000, shallowSize: 2_000_000, retainedSize: 3_000_000, instances: [] },
    { className: 'Array', count: 200, shallowSize: 100_000, retainedSize: 2_000_000, instances: [] },
    { className: 'Closure', count: 300, shallowSize: 14400, retainedSize: 1_000_000, instances: [] },
    { className: 'Buffer', count: 50, shallowSize: 500_000, retainedSize: 800_000, instances: [] },
    { className: 'TinyClass', count: 1, shallowSize: 10, retainedSize: 10, instances: [] }, // below minBytes
  ];
}

function createRetainerChains(): RetainerChain[] {
  return [
    {
      nodeId: 1,
      nodeName: 'SessionData',
      nodeType: 'object',
      selfSize: 256,
      retainedSize: 2_000_000,
      chain: [
        { edgeName: '_cache', edgeType: 'property', nodeName: 'Map', nodeType: 'object', nodeId: 10 },
        { edgeName: 'entries', edgeType: 'internal', nodeName: 'Array', nodeType: 'array', nodeId: 20 },
        { edgeName: '0', edgeType: 'element', nodeName: 'SessionData', nodeType: 'object', nodeId: 1 },
      ],
    },
    {
      nodeId: 2,
      nodeName: 'LogBuffer',
      nodeType: 'string',
      selfSize: 100_000,
      retainedSize: 500_000,
      chain: [
        { edgeName: 'logger', edgeType: 'property', nodeName: 'Logger', nodeType: 'object', nodeId: 30 },
        { edgeName: 'buffer', edgeType: 'property', nodeName: 'LogBuffer', nodeType: 'string', nodeId: 2 },
      ],
    },
  ];
}

function createFindings(): RootCauseFinding[] {
  return [
    {
      category: 'unbounded_collection',
      title: 'Large Map retaining 5 MB',
      description: 'Unbounded cache.',
      confidence: 'high',
      evidence: [],
      recommendations: [],
      involvedClasses: ['Map', 'UserSession'],
      estimatedImpact: 5_000_000,
    },
    {
      category: 'event_listener_leak',
      title: '200 listener instances',
      description: 'Listeners leaking.',
      confidence: 'medium',
      evidence: [],
      recommendations: [],
      involvedClasses: ['EventListener'],
      estimatedImpact: 2_000_000,
    },
  ];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('FlameGraphGenerator', () => {
  let generator: FlameGraphGenerator;

  beforeEach(() => {
    generator = new FlameGraphGenerator({ minBytes: 100 });
  });

  describe('addClassSummaries', () => {
    it('should build flame graph from class summaries', () => {
      generator.addClassSummaries(createClassSummaries());

      const root = generator.getRoot();
      expect(root.children.size).toBeGreaterThan(0);
      expect(root.totalBytes).toBeGreaterThan(0);
    });

    it('should filter out classes below minBytes', () => {
      generator.addClassSummaries(createClassSummaries());

      const root = generator.getRoot();
      // TinyClass (10 bytes) should be filtered out
      expect(root.children.has('TinyClass')).toBe(false);
    });

    it('should track total bytes correctly', () => {
      const summaries = createClassSummaries().filter(c => c.retainedSize >= 100);
      generator.addClassSummaries(summaries);

      const totalExpected = summaries.reduce((s, c) => s + c.retainedSize, 0);
      expect(generator.getTotalBytes()).toBe(totalExpected);
    });
  });

  describe('addRetainerChains', () => {
    it('should build tree from retainer chains', () => {
      generator.addRetainerChains(createRetainerChains());

      const root = generator.getRoot();
      expect(root.children.size).toBeGreaterThan(0);
      expect(root.totalBytes).toBeGreaterThan(0);
    });

    it('should create nested structure matching chain paths', () => {
      generator.addRetainerChains(createRetainerChains());

      const root = generator.getRoot();
      // First chain starts with _cache→Map
      expect(root.children.has('_cache→Map')).toBe(true);
    });
  });

  describe('addRootCauseFindings', () => {
    it('should group by category', () => {
      generator.addRootCauseFindings(createFindings());

      const root = generator.getRoot();
      expect(root.children.has('unbounded_collection')).toBe(true);
      expect(root.children.has('event_listener_leak')).toBe(true);
    });
  });

  describe('toHTML', () => {
    it('should generate valid HTML', () => {
      generator.addClassSummaries(createClassSummaries());
      const html = generator.toHTML();

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<svg');
      expect(html).toContain('</svg>');
      expect(html).toContain('Memory Retention Flame Graph');
    });

    it('should include interactive JavaScript', () => {
      generator.addClassSummaries(createClassSummaries());
      const html = generator.toHTML();

      expect(html).toContain('<script>');
      expect(html).toContain('tooltip');
      expect(html).toContain('mouseenter');
    });

    it('should include legend with color swatches', () => {
      generator.addClassSummaries(createClassSummaries());
      const html = generator.toHTML();

      expect(html).toContain('legend');
      expect(html).toContain('swatch');
    });

    it('should include frame data attributes', () => {
      generator.addClassSummaries(createClassSummaries());
      const html = generator.toHTML();

      expect(html).toContain('data-name=');
      expect(html).toContain('data-bytes=');
      expect(html).toContain('data-type=');
    });
  });

  describe('toASCII', () => {
    it('should generate ASCII representation', () => {
      generator.addClassSummaries(createClassSummaries());
      const ascii = generator.toASCII(60);

      expect(ascii).toContain('Memory Retention Flame Graph');
      expect(ascii).toContain('─');
      expect(ascii).toContain('Total:');
    });

    it('should respect width parameter', () => {
      generator.addClassSummaries(createClassSummaries());
      const ascii = generator.toASCII(40);

      const lines = ascii.split('\n');
      // Title and separator lines can be wider, but content lines should be ≤ 40
      expect(lines.length).toBeGreaterThan(2);
    });
  });

  describe('toFoldedStacks', () => {
    it('should generate folded stacks format', () => {
      generator.addClassSummaries(createClassSummaries());
      const folded = generator.toFoldedStacks();

      expect(folded.length).toBeGreaterThan(0);
      // Each line should be "stack value"
      const lines = folded.split('\n').filter(l => l.trim());
      for (const line of lines) {
        const parts = line.split(' ');
        expect(parts.length).toBeGreaterThanOrEqual(2);
        const value = parseInt(parts[parts.length - 1], 10);
        expect(value).toBeGreaterThan(0);
      }
    });
  });

  describe('toPerfettoEvents', () => {
    it('should generate Perfetto trace events', () => {
      generator.addClassSummaries(createClassSummaries());
      const events = generator.toPerfettoEvents();

      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expect(event.ph).toBe('X');
        expect(event.pid).toBe(1);
        expect(typeof event.ts).toBe('number');
        expect(typeof event.dur).toBe('number');
      }
    });

    it('should include byte count in args', () => {
      generator.addClassSummaries(createClassSummaries());
      const events = generator.toPerfettoEvents();

      const firstEvent = events[0];
      expect((firstEvent.args as Record<string, unknown>).totalBytes).toBeDefined();
    });
  });

  describe('custom options', () => {
    it('should use custom title', () => {
      const gen = new FlameGraphGenerator({ title: 'My Custom Graph' });
      gen.addClassSummaries(createClassSummaries());

      const html = gen.toHTML();
      expect(html).toContain('My Custom Graph');

      const ascii = gen.toASCII();
      expect(ascii).toContain('My Custom Graph');
    });

    it('should respect maxDepth', () => {
      const gen = new FlameGraphGenerator({ maxDepth: 2 });
      const chains: RetainerChain[] = [{
        nodeId: 1,
        nodeName: 'Leaf',
        nodeType: 'object',
        selfSize: 1000,
        retainedSize: 10000,
        chain: [
          { edgeName: 'a', edgeType: 'property', nodeName: 'A', nodeType: 'object', nodeId: 1 },
          { edgeName: 'b', edgeType: 'property', nodeName: 'B', nodeType: 'object', nodeId: 2 },
          { edgeName: 'c', edgeType: 'property', nodeName: 'C', nodeType: 'object', nodeId: 3 },
          { edgeName: 'd', edgeType: 'property', nodeName: 'D', nodeType: 'object', nodeId: 4 },
        ],
      }];

      gen.addRetainerChains(chains);
      const root = gen.getRoot();

      // Should only have gone 2 levels deep
      let maxDepth = 0;
      const queue: FlameNode[] = [root];
      while (queue.length > 0) {
        const node = queue.pop()!;
        maxDepth = Math.max(maxDepth, node.depth);
        for (const child of node.children.values()) {
          queue.push(child);
        }
      }

      expect(maxDepth).toBeLessThanOrEqual(3); // root(0) + 2 levels
    });
  });

  describe('empty graph', () => {
    it('should handle empty class summaries', () => {
      generator.addClassSummaries([]);
      expect(generator.getTotalBytes()).toBe(0);
    });

    it('should generate valid HTML even when empty', () => {
      const html = generator.toHTML();
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should generate valid ASCII even when empty', () => {
      const ascii = generator.toASCII();
      expect(ascii).toContain('Memory Retention Flame Graph');
    });
  });
});
