import { describe, it, expect, beforeEach } from 'vitest';
import { PerfettoExporter, type PerfettoTrace, type LeakReport } from './index.js';

describe('PerfettoExporter', () => {
  let exporter: PerfettoExporter;

  beforeEach(() => {
    exporter = new PerfettoExporter({
      processName: 'TestProcess',
      threadName: 'TestThread',
    });
  });

  describe('constructor', () => {
    it('should add process and thread metadata events', () => {
      const events = exporter.getEvents();
      const processNameEvent = events.find(e => e.ph === 'M' && e.name === 'process_name');
      const threadNameEvent = events.find(e => e.ph === 'M' && e.name === 'thread_name');

      expect(processNameEvent).toBeDefined();
      expect(processNameEvent!.args!.name).toBe('TestProcess');
      expect(threadNameEvent).toBeDefined();
      expect(threadNameEvent!.args!.name).toBe('TestThread');
    });

    it('should use default names when none provided', () => {
      const defaultExporter = new PerfettoExporter();
      const events = defaultExporter.getEvents();
      const processNameEvent = events.find(e => e.ph === 'M' && e.name === 'process_name');
      expect(processNameEvent!.args!.name).toBe('Gemini CLI Investigation');
    });
  });

  describe('exportLeakReport()', () => {
    const mockReport: LeakReport = {
      timestamp: '2026-03-27T00:00:00Z',
      snapshotSizes: [1_000_000, 1_500_000, 2_000_000] as [number, number, number],
      leakCandidates: [
        {
          className: 'LeakyBuffer',
          countInSnapshot1: 5,
          countInSnapshot2: 15,
          countInSnapshot3: 25,
          growthRate: 10,
          totalLeakedSize: 50_000,
          retainerChains: [{
            nodeId: 100,
            nodeName: 'LeakyBuffer',
            nodeType: 'object',
            selfSize: 2500,
            retainedSize: 5000,
            chain: [
              { edgeName: 'cache', edgeType: 'property', nodeName: 'Map', nodeType: 'object', nodeId: 50 },
              { edgeName: 'global', edgeType: 'property', nodeName: 'Window', nodeType: 'object', nodeId: 1 },
            ],
          }],
          confidence: 'high',
        },
      ],
      summary: 'Heap growing: 1MB → 1.5MB → 2MB',
      recommendations: ['Check LeakyBuffer lifecycle'],
    };

    it('should produce valid Perfetto trace structure', () => {
      const trace = exporter.exportLeakReport(mockReport);
      expect(trace.traceEvents).toBeInstanceOf(Array);
      expect(trace.traceEvents.length).toBeGreaterThan(0);
      expect(trace.displayTimeUnit).toBe('ms');
    });

    it('should include 3 heap snapshot capture events', () => {
      const trace = exporter.exportLeakReport(mockReport);
      const snapshotEvents = trace.traceEvents.filter(
        e => e.name?.startsWith('Heap Snapshot') && e.ph === 'X'
      );
      expect(snapshotEvents).toHaveLength(3);
    });

    it('should include memory counter events', () => {
      const trace = exporter.exportLeakReport(mockReport);
      const counterEvents = trace.traceEvents.filter(e => e.ph === 'C' && e.name === 'Heap Size');
      expect(counterEvents.length).toBe(3);
      expect(counterEvents[0].args!.heap_size_bytes).toBe(1_000_000);
      expect(counterEvents[2].args!.heap_size_bytes).toBe(2_000_000);
    });

    it('should include leak annotations', () => {
      const trace = exporter.exportLeakReport(mockReport);
      const leakEvents = trace.traceEvents.filter(e => e.name?.startsWith('LEAK:'));
      expect(leakEvents.length).toBeGreaterThan(0);
      expect(leakEvents[0].args!.confidence).toBe('high');
    });

    it('should include analysis phase event', () => {
      const trace = exporter.exportLeakReport(mockReport);
      const analysisEvent = trace.traceEvents.find(e => e.name === 'Leak Analysis');
      expect(analysisEvent).toBeDefined();
      expect(analysisEvent!.args!.candidates_found).toBe(1);
    });

    it('should include metadata', () => {
      const trace = exporter.exportLeakReport(mockReport);
      expect(trace.metadata?.source).toBe('gemini-cli-investigation');
    });

    it('should respect option to exclude memory counters', () => {
      const trace = exporter.exportLeakReport(mockReport, { includeMemoryCounters: false });
      const counterEvents = trace.traceEvents.filter(e => e.ph === 'C');
      expect(counterEvents.length).toBe(0);
    });

    it('should respect option to exclude leak annotations', () => {
      const trace = exporter.exportLeakReport(mockReport, { includeLeakAnnotations: false });
      const leakEvents = trace.traceEvents.filter(e => e.name?.startsWith('LEAK:'));
      expect(leakEvents.length).toBe(0);
    });
  });

  describe('exportClassSummaries()', () => {
    it('should create flamechart-style events for top classes', () => {
      exporter.exportClassSummaries(
        [
          { className: 'Buffer', count: 100, shallowSize: 50000, retainedSize: 80000, instances: [] },
          { className: 'String', count: 500, shallowSize: 30000, retainedSize: 35000, instances: [] },
        ],
        100000,
        'Test Distribution',
      );

      const events = exporter.getEvents();
      const classEvents = events.filter(e => e.cat === 'class');
      expect(classEvents.length).toBe(2);
      expect(classEvents[0].name).toContain('Buffer');
      expect(classEvents[1].name).toContain('String');
    });

    it('should include total heap as parent event', () => {
      exporter.exportClassSummaries(
        [{ className: 'X', count: 1, shallowSize: 100, retainedSize: 100, instances: [] }],
        1000,
      );

      const events = exporter.getEvents();
      const totalEvent = events.find(e => e.cat === 'heap');
      expect(totalEvent).toBeDefined();
      expect(totalEvent!.name).toContain('Total Heap');
    });
  });

  describe('exportCpuProfile()', () => {
    it('should convert V8 CPU profile nodes to duration events', () => {
      exporter.exportCpuProfile({
        nodes: [
          {
            id: 1,
            callFrame: { functionName: 'main', scriptId: '1', url: 'app.js', lineNumber: 1, columnNumber: 0 },
            hitCount: 10,
          },
          {
            id: 2,
            callFrame: { functionName: 'process', scriptId: '1', url: 'app.js', lineNumber: 5, columnNumber: 0 },
            hitCount: 5,
          },
        ],
        startTime: 0,
        endTime: 100000,
        samples: [1, 1, 2, 1, 2],
        timeDeltas: [1000, 1000, 2000, 1000, 1500],
      });

      const events = exporter.getEvents();
      const cpuEvents = events.filter(e => e.cat === 'cpu');
      expect(cpuEvents.length).toBe(5);
      expect(cpuEvents[0].name).toBe('main');
      expect(cpuEvents[2].name).toBe('process');
    });
  });

  describe('serialization', () => {
    it('toJSON should produce valid JSON', () => {
      const json = exporter.toJSON();
      const parsed = JSON.parse(json) as PerfettoTrace;
      expect(parsed.traceEvents).toBeInstanceOf(Array);
      expect(parsed.displayTimeUnit).toBe('ms');
    });

    it('toCompactJSON should produce smaller output than toJSON', () => {
      exporter.exportLeakReport({
        timestamp: '2026-03-27T00:00:00Z',
        snapshotSizes: [1000, 2000, 3000],
        leakCandidates: [],
        summary: 'test',
        recommendations: [],
      });

      const pretty = exporter.toJSON();
      const compact = exporter.toCompactJSON();
      expect(compact.length).toBeLessThan(pretty.length);
    });
  });
});
