import { describe, it, expect, beforeEach } from 'vitest';
import { RootCauseAnalyzer, type RootCauseReport } from './rootCauseAnalyzer.js';
import type { ClassSummary, LeakReport, LeakCandidate } from './heapSnapshotAnalyzer.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeClassSummary(overrides: Partial<ClassSummary> & { className: string }): ClassSummary {
  return {
    count: 10,
    shallowSize: 1000,
    retainedSize: 2000,
    instances: [],
    ...overrides,
  };
}

function makeLeakCandidate(overrides: Partial<LeakCandidate> & { className: string }): LeakCandidate {
  return {
    countInSnapshot1: 5,
    countInSnapshot2: 15,
    countInSnapshot3: 25,
    growthRate: 10,
    totalLeakedSize: 50_000,
    retainerChains: [],
    confidence: 'high',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RootCauseAnalyzer', () => {
  let analyzer: RootCauseAnalyzer;

  beforeEach(() => {
    analyzer = new RootCauseAnalyzer();
  });

  describe('analyzeSnapshot()', () => {
    it('should return healthy report when no issues found', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({ className: 'Object', count: 100, shallowSize: 5000, retainedSize: 10000 }),
        makeClassSummary({ className: 'String', count: 50, shallowSize: 2000, retainedSize: 3000 }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 1000);
      expect(report.findings).toHaveLength(0);
      expect(report.healthScore).toBe(100);
      expect(report.summary).toContain('No significant memory issues');
    });

    it('should detect event listener leaks', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({ className: 'EventListener', count: 500, shallowSize: 50000, retainedSize: 200000 }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 10000);
      expect(report.findings.length).toBeGreaterThan(0);
      const listenerFinding = report.findings.find(f => f.category === 'event_listener_leak');
      expect(listenerFinding).toBeDefined();
      expect(listenerFinding!.confidence).toBe('high');
      expect(listenerFinding!.involvedClasses).toContain('EventListener');
    });

    it('should detect moderate event listener counts as medium confidence', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({ className: 'ClickHandler', count: 75, shallowSize: 7500, retainedSize: 15000 }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 5000);
      const finding = report.findings.find(f => f.category === 'event_listener_leak');
      expect(finding).toBeDefined();
      expect(finding!.confidence).toBe('medium');
    });

    it('should detect unbounded Map collections', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({
          className: 'Map',
          count: 5,
          shallowSize: 500,
          retainedSize: 5_000_000,
        }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 10000);
      const finding = report.findings.find(f => f.category === 'unbounded_collection');
      expect(finding).toBeDefined();
      expect(finding!.title).toContain('Map');
      expect(finding!.recommendations.length).toBeGreaterThan(0);
    });

    it('should detect unbounded Set collections', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({
          className: 'Set',
          count: 2,
          shallowSize: 200,
          retainedSize: 2_000_000,
        }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 10000);
      const finding = report.findings.find(f => f.category === 'unbounded_collection');
      expect(finding).toBeDefined();
    });

    it('should detect large Array accumulation', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({
          className: 'Array',
          count: 100,
          shallowSize: 10000,
          retainedSize: 10_000_000,
        }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 10000);
      const finding = report.findings.find(f =>
        f.category === 'unbounded_collection' && f.involvedClasses.includes('Array')
      );
      expect(finding).toBeDefined();
    });

    it('should detect closure capture leaks', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({
          className: '(closure)',
          count: 5000,
          shallowSize: 500000,
          retainedSize: 50_000_000,
        }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 20000);
      const finding = report.findings.find(f => f.category === 'closure_capture');
      expect(finding).toBeDefined();
      expect(finding!.confidence).toBe('high');
    });

    it('should detect string accumulation', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({
          className: 'string',
          count: 100000,
          shallowSize: 20_000_000,
          retainedSize: 20_000_000,
        }),
        makeClassSummary({
          className: 'concatenated string',
          count: 5000,
          shallowSize: 5_000_000,
          retainedSize: 5_000_000,
        }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 200000);
      const finding = report.findings.find(f => f.category === 'string_accumulation');
      expect(finding).toBeDefined();
      expect(finding!.involvedClasses).toContain('string');
    });

    it('should detect buffer accumulation', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({
          className: 'ArrayBuffer',
          count: 500,
          shallowSize: 10_000_000,
          retainedSize: 10_000_000,
        }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 10000);
      const finding = report.findings.find(f => f.category === 'buffer_accumulation');
      expect(finding).toBeDefined();
    });

    it('should detect large retained trees', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({
          className: 'AppController',
          count: 1,
          shallowSize: 500,
          retainedSize: 5_000_000, // 10000x amplification
        }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 10000);
      const finding = report.findings.find(f => f.category === 'large_retained_tree');
      expect(finding).toBeDefined();
      expect(finding!.title).toContain('AppController');
    });

    it('should detect excessive allocations', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({
          className: 'SmallWidget',
          count: 50000,
          shallowSize: 5_000_000,
          retainedSize: 5_000_000,
        }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 100000);
      const finding = report.findings.find(f => f.category === 'excessive_allocation');
      expect(finding).toBeDefined();
      expect(finding!.title).toContain('50');
    });

    it('should detect detached DOM nodes', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({
          className: 'Detached HTMLDivElement',
          count: 200,
          shallowSize: 40000,
          retainedSize: 500000,
        }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 10000);
      const finding = report.findings.find(f => f.category === 'detached_dom');
      expect(finding).toBeDefined();
      expect(finding!.confidence).toBe('high');
    });

    it('should detect timer leaks', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({
          className: 'Timeout',
          count: 150,
          shallowSize: 15000,
          retainedSize: 300000,
        }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 10000);
      const finding = report.findings.find(f => f.category === 'timer_leak');
      expect(finding).toBeDefined();
      expect(finding!.confidence).toBe('high');
    });

    it('should sort findings by confidence then impact', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({ className: 'Timeout', count: 30, retainedSize: 50000 }),
        makeClassSummary({ className: 'EventListener', count: 300, retainedSize: 200000 }),
        makeClassSummary({ className: 'Map', count: 3, shallowSize: 300, retainedSize: 3_000_000 }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 10000);
      if (report.findings.length >= 2) {
        const confidenceOrder = { high: 0, medium: 1, low: 2 };
        for (let i = 1; i < report.findings.length; i++) {
          const prev = confidenceOrder[report.findings[i - 1].confidence];
          const curr = confidenceOrder[report.findings[i].confidence];
          expect(curr).toBeGreaterThanOrEqual(prev);
        }
      }
    });

    it('should deduplicate recommendations', () => {
      // Create scenario where multiple findings generate the same recommendation
      const summaries: ClassSummary[] = [
        makeClassSummary({ className: 'EventListener', count: 100, retainedSize: 100000 }),
        makeClassSummary({ className: 'ClickHandler', count: 80, retainedSize: 80000 }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 10000);
      const uniqueRecs = new Set(report.recommendations);
      expect(report.recommendations.length).toBe(uniqueRecs.size);
    });

    it('should compute health score based on findings', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({ className: 'EventListener', count: 500, retainedSize: 200000 }),
        makeClassSummary({ className: 'Map', count: 3, shallowSize: 300, retainedSize: 3_000_000 }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 10000);
      expect(report.healthScore).toBeLessThan(100);
      expect(report.healthScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeLeakReport()', () => {
    it('should analyze leak candidates with event listener retainer chains', () => {
      const report: LeakReport = {
        timestamp: '2026-03-27T00:00:00Z',
        snapshotSizes: [1_000_000, 1_500_000, 2_000_000],
        leakCandidates: [
          makeLeakCandidate({
            className: 'RequestHandler',
            retainerChains: [{
              nodeId: 100,
              nodeName: 'RequestHandler',
              nodeType: 'object',
              selfSize: 500,
              retainedSize: 5000,
              chain: [
                { edgeName: '_events', edgeType: 'property', nodeName: 'EventEmitter', nodeType: 'object', nodeId: 50 },
                { edgeName: 'server', edgeType: 'property', nodeName: 'Server', nodeType: 'object', nodeId: 1 },
              ],
            }],
          }),
        ],
        summary: 'test',
        recommendations: [],
      };

      const result = analyzer.analyzeLeakReport(report);
      expect(result.findings.length).toBeGreaterThan(0);
      const finding = result.findings.find(f => f.category === 'event_listener_leak');
      expect(finding).toBeDefined();
    });

    it('should analyze leak candidates with cache retainer chains', () => {
      const report: LeakReport = {
        timestamp: '2026-03-27T00:00:00Z',
        snapshotSizes: [1_000_000, 1_500_000, 2_000_000],
        leakCandidates: [
          makeLeakCandidate({
            className: 'UserSession',
            retainerChains: [{
              nodeId: 100,
              nodeName: 'UserSession',
              nodeType: 'object',
              selfSize: 1000,
              retainedSize: 10000,
              chain: [
                { edgeName: 'cache', edgeType: 'property', nodeName: 'Map', nodeType: 'object', nodeId: 50 },
                { edgeName: 'sessionStore', edgeType: 'property', nodeName: 'App', nodeType: 'object', nodeId: 1 },
              ],
            }],
          }),
        ],
        summary: 'test',
        recommendations: [],
      };

      const result = analyzer.analyzeLeakReport(report);
      const finding = result.findings.find(f => f.category === 'unbounded_collection');
      expect(finding).toBeDefined();
      expect(finding!.involvedClasses).toContain('UserSession');
    });

    it('should handle leak candidates with no retainer chains', () => {
      const report: LeakReport = {
        timestamp: '2026-03-27T00:00:00Z',
        snapshotSizes: [1_000_000, 1_500_000, 2_000_000],
        leakCandidates: [
          makeLeakCandidate({ className: 'MysteryObject', retainerChains: [] }),
        ],
        summary: 'test',
        recommendations: [],
      };

      const result = analyzer.analyzeLeakReport(report);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].category).toBe('general');
    });

    it('should return empty findings for reports with no candidates', () => {
      const report: LeakReport = {
        timestamp: '2026-03-27T00:00:00Z',
        snapshotSizes: [1_000_000, 1_000_100, 1_000_200],
        leakCandidates: [],
        summary: 'No leaks',
        recommendations: [],
      };

      const result = analyzer.analyzeLeakReport(report);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('toMarkdown()', () => {
    it('should generate markdown for a report with findings', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({ className: 'EventListener', count: 500, retainedSize: 200000 }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 10000);
      const md = RootCauseAnalyzer.toMarkdown(report);

      expect(md).toContain('# Memory Investigation');
      expect(md).toContain('Health Score');
      expect(md).toContain('Findings');
      expect(md).toContain('EventListener');
    });

    it('should generate clean markdown for healthy report', () => {
      const report: RootCauseReport = {
        timestamp: '2026-03-27T00:00:00Z',
        summary: 'No significant memory issues detected.',
        findings: [],
        recommendations: [],
        healthScore: 100,
        totalEstimatedImpact: 0,
      };

      const md = RootCauseAnalyzer.toMarkdown(report);
      expect(md).toContain('No significant memory issues');
      expect(md).not.toContain('## Findings');
    });

    it('should include confidence badges in markdown', () => {
      const summaries: ClassSummary[] = [
        makeClassSummary({ className: 'Timeout', count: 200, retainedSize: 400000 }),
      ];

      const report = analyzer.analyzeSnapshot(summaries, 10000);
      const md = RootCauseAnalyzer.toMarkdown(report);

      // Should contain emoji badges
      expect(md).toMatch(/🔴|🟡|🟢/);
    });
  });
});
