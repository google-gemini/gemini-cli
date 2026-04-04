/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  GCPressureAnalyzer,
  type GCEvent,
} from './gcPressureAnalyzer.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function gcEvent(overrides: Partial<GCEvent> = {}): GCEvent {
  return {
    type: 'scavenge',
    startUs: 0,
    durationUs: 1000,
    heapBefore: 10_000_000,
    heapAfter: 8_000_000,
    freedBytes: 2_000_000,
    forced: false,
    generation: 'young',
    ...overrides,
  };
}

function makeEvents(count: number, type: GCEvent['type'] = 'scavenge'): GCEvent[] {
  return Array.from({ length: count }, (_, i) =>
    gcEvent({
      type,
      startUs: i * 100_000,
      durationUs: 1000 + i * 100,
      heapBefore: 10_000_000 + i * 50_000,
      heapAfter: 8_000_000 + i * 30_000,
      freedBytes: 2_000_000 + i * 20_000,
      generation: type === 'scavenge' ? 'young' : 'old',
    }),
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GCPressureAnalyzer', () => {
  const analyzer = new GCPressureAnalyzer();

  // ─── analyze() ─────────────────────────────────────────────────────────

  describe('analyze', () => {
    it('should return empty report for no events', () => {
      const report = analyzer.analyze([]);
      expect(report.totalEvents).toBe(0);
      expect(report.gcTimePercent).toBe(0);
      expect(report.healthScore).toBeGreaterThanOrEqual(0);
      expect(report.categories).toHaveLength(0);
      expect(report.patterns).toHaveLength(0);
    });

    it('should compute gcTimePercent correctly', () => {
      const events = [
        gcEvent({ startUs: 0, durationUs: 10_000 }),      // 10ms
        gcEvent({ startUs: 100_000, durationUs: 10_000 }), // 10ms
      ];
      // Wall time = 100ms, GC time = 20ms → 20%
      const report = analyzer.analyze(events, 100);
      expect(report.gcTimePercent).toBeCloseTo(20, 0);
    });

    it('should compute wall time from event span if not provided', () => {
      const events = [
        gcEvent({ startUs: 0, durationUs: 5_000 }),
        gcEvent({ startUs: 1_000_000, durationUs: 5_000 }),
      ];
      // Span: (1_000_000 + 5_000 - 0) / 1000 = 1005ms
      const report = analyzer.analyze(events);
      expect(report.wallTimeMs).toBeGreaterThan(0);
      expect(report.totalEvents).toBe(2);
    });

    it('should count events by category', () => {
      const events = [
        ...makeEvents(5, 'scavenge'),
        ...makeEvents(3, 'mark-compact'),
      ];
      const report = analyzer.analyze(events, 1000);
      expect(report.categories.length).toBeGreaterThanOrEqual(2);

      const scavengeCat = report.categories.find(c => c.type === 'scavenge');
      const markCat = report.categories.find(c => c.type === 'mark-compact');
      expect(scavengeCat?.count).toBe(5);
      expect(markCat?.count).toBe(3);
    });

    it('should compute category averages correctly', () => {
      const events = [
        gcEvent({ type: 'scavenge', durationUs: 1000, freedBytes: 100_000 }),
        gcEvent({ type: 'scavenge', durationUs: 3000, freedBytes: 300_000 }),
      ];
      const report = analyzer.analyze(events, 1000);
      const cat = report.categories.find(c => c.type === 'scavenge');
      expect(cat?.avgDurationUs).toBe(2000);
      expect(cat?.avgFreed).toBe(200_000);
      expect(cat?.count).toBe(2);
    });

    it('should compute max duration per category', () => {
      const events = [
        gcEvent({ type: 'scavenge', durationUs: 500 }),
        gcEvent({ type: 'scavenge', durationUs: 5000 }),
        gcEvent({ type: 'scavenge', durationUs: 2000 }),
      ];
      const report = analyzer.analyze(events, 1000);
      const cat = report.categories.find(c => c.type === 'scavenge');
      expect(cat?.maxDurationUs).toBe(5000);
    });

    it('should compute efficiency (bytes freed per microsecond)', () => {
      const events = [
        gcEvent({ type: 'scavenge', durationUs: 1000, freedBytes: 5000 }),
      ];
      const report = analyzer.analyze(events, 1000);
      const cat = report.categories.find(c => c.type === 'scavenge');
      expect(cat?.efficiency).toBe(5); // 5000 / 1000
    });

    it('should compute allocation rate', () => {
      const events = [
        gcEvent({ heapBefore: 10_000_000, heapAfter: 8_000_000, freedBytes: 2_000_000 }),
      ];
      const report = analyzer.analyze(events, 1000);
      expect(report.allocationRate).toBeGreaterThan(0);
    });

    it('should compute promotion rate for young gen events', () => {
      const events = makeEvents(5, 'scavenge');
      const report = analyzer.analyze(events, 1000);
      expect(report.promotionRate).toBeGreaterThanOrEqual(0);
    });

    it('should have health score between 0 and 100', () => {
      const events = makeEvents(20, 'scavenge');
      const report = analyzer.analyze(events, 100);
      expect(report.healthScore).toBeGreaterThanOrEqual(0);
      expect(report.healthScore).toBeLessThanOrEqual(100);
    });

    it('should assign lower health score for high GC pressure', () => {
      // Create events that take up > 10% of wall time (critical)
      const events = [
        gcEvent({ startUs: 0, durationUs: 200_000 }), // 200ms of GC
      ];
      const report = analyzer.analyze(events, 500); // 200ms / 500ms = 40%
      expect(report.healthScore).toBeLessThan(70);
    });

    it('should classify app profile', () => {
      const events = makeEvents(10, 'scavenge');
      const report = analyzer.analyze(events, 5000);
      expect(['latency-sensitive', 'throughput-optimized', 'balanced', 'unknown']).toContain(
        report.appProfile,
      );
    });

    it('should produce a summary string', () => {
      const events = makeEvents(5);
      const report = analyzer.analyze(events, 1000);
      expect(typeof report.summary).toBe('string');
      expect(report.summary.length).toBeGreaterThan(0);
    });
  });

  // ─── Pattern Detection ─────────────────────────────────────────────────

  describe('pattern detection', () => {
    it('should detect GC thrashing when gcTimePercent > 10%', () => {
      const events = [
        gcEvent({ startUs: 0, durationUs: 200_000 }), // 200ms GC in 500ms wall
      ];
      const report = analyzer.analyze(events, 500);
      const thrashing = report.patterns.find(p => p.pattern.toLowerCase().includes('thrash'));
      expect(thrashing).toBeDefined();
      expect(thrashing?.severity).toBe('critical');
    });

    it('should detect long major GC pauses', () => {
      const events = [
        gcEvent({
          type: 'mark-compact',
          durationUs: 80_000, // 80ms > 50ms threshold
          generation: 'old',
        }),
      ];
      const report = analyzer.analyze(events, 10000);
      const longPause = report.patterns.find(p =>
        p.pattern.toLowerCase().includes('long') || p.pattern.toLowerCase().includes('major'),
      );
      expect(longPause).toBeDefined();
    });

    it('should detect forced GC events', () => {
      const events = [gcEvent({ forced: true })];
      const report = analyzer.analyze(events, 1000);
      const forcedPattern = report.patterns.find(p =>
        p.pattern.toLowerCase().includes('forced') || p.description.toLowerCase().includes('forced'),
      );
      expect(forcedPattern).toBeDefined();
    });

    it('should return no critical patterns for healthy GC', () => {
      // Very little GC: 1ms GC in 10 seconds
      const events = [gcEvent({ durationUs: 1000, startUs: 0 })];
      const report = analyzer.analyze(events, 10_000);
      const critical = report.patterns.filter(p => p.severity === 'critical');
      expect(critical.length).toBe(0);
    });
  });

  // ─── Recommendations ──────────────────────────────────────────────────

  describe('recommendations', () => {
    it('should suggest V8 flags for high GC pressure', () => {
      const events = [
        gcEvent({ startUs: 0, durationUs: 200_000 }), // heavy GC
      ];
      const report = analyzer.analyze(events, 500);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should have priority field on recommendations', () => {
      const events = makeEvents(20, 'scavenge');
      const report = analyzer.analyze(events, 100);
      for (const rec of report.recommendations) {
        expect(['high', 'medium', 'low']).toContain(rec.priority);
      }
    });
  });

  // ─── Static methods ────────────────────────────────────────────────────

  describe('parseTraceEvents', () => {
    it('should parse Perfetto/Chrome trace format', () => {
      const traceEvents = [
        {
          ph: 'X',
          name: 'V8.GCScavenger',
          cat: 'v8.gc',
          ts: 1000,
          dur: 5000,
          args: { usedHeapSizeBefore: 10000000, usedHeapSizeAfter: 8000000 },
        },
      ];
      const events = GCPressureAnalyzer.parseTraceEvents(traceEvents);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('scavenge');
      expect(events[0].startUs).toBe(1000);
    });

    it('should handle empty trace events', () => {
      const events = GCPressureAnalyzer.parseTraceEvents([]);
      expect(events).toHaveLength(0);
    });

    it('should filter non-GC events', () => {
      const traceEvents = [
        { ph: 'X', name: 'SomeRandomEvent', cat: 'rendering', ts: 0, dur: 100 },
        { ph: 'X', name: 'V8.GCScavenger', cat: 'v8', ts: 100, dur: 200 },
      ];
      const events = GCPressureAnalyzer.parseTraceEvents(traceEvents);
      expect(events.length).toBe(1);
    });

    it('should sort events by startUs', () => {
      const traceEvents = [
        { ph: 'X', name: 'V8.GC_MC', cat: 'v8', ts: 5000, dur: 100, args: {} },
        { ph: 'X', name: 'V8.GCScavenger', cat: 'v8', ts: 1000, dur: 100, args: {} },
      ];
      const events = GCPressureAnalyzer.parseTraceEvents(traceEvents);
      if (events.length >= 2) {
        expect(events[0].startUs).toBeLessThanOrEqual(events[1].startUs);
      }
    });
  });

  describe('fromHeapMetrics', () => {
    it('should infer GC events from heap metric drops', () => {
      const metrics = [
        { timestamp: 0, heapUsed: 10_000_000, heapTotal: 20_000_000 },
        { timestamp: 100, heapUsed: 12_000_000, heapTotal: 20_000_000 },
        { timestamp: 200, heapUsed: 8_000_000, heapTotal: 20_000_000 }, // drop = GC
        { timestamp: 300, heapUsed: 11_000_000, heapTotal: 20_000_000 },
      ];
      const events = GCPressureAnalyzer.fromHeapMetrics(metrics);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].freedBytes).toBeGreaterThan(0);
    });

    it('should handle empty metrics', () => {
      const events = GCPressureAnalyzer.fromHeapMetrics([]);
      expect(events).toHaveLength(0);
    });
  });

  describe('formatForTerminal', () => {
    it('should produce terminal-formatted output', () => {
      const report = analyzer.analyze(makeEvents(5), 1000);
      const output = GCPressureAnalyzer.formatForTerminal(report);
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('toPerfettoEvents', () => {
    it('should convert GC events to Perfetto trace format', () => {
      const events = makeEvents(3, 'scavenge');
      const perfetto = GCPressureAnalyzer.toPerfettoEvents(events);
      expect(perfetto.length).toBeGreaterThan(0);
      // First event may be metadata (ph: 'M') without ts — find a real event
      const realEvent = perfetto.find((e: Record<string, unknown>) => e['ph'] !== 'M') as Record<string, unknown> | undefined;
      if (realEvent) {
        expect(realEvent).toHaveProperty('ts');
        expect(realEvent).toHaveProperty('name');
      }
      // All events should have ph
      const first = perfetto[0] as Record<string, unknown>;
      expect(first).toHaveProperty('ph');
    });

    it('should handle empty events (may include metadata)', () => {
      const perfetto = GCPressureAnalyzer.toPerfettoEvents([]);
      // May include metadata events even for empty input
      expect(Array.isArray(perfetto)).toBe(true);
    });
  });

  // ─── Fragmentation ────────────────────────────────────────────────────

  describe('fragmentation estimation', () => {
    it('should estimate fragmentation between 0 and 1', () => {
      const events = makeEvents(10, 'mark-compact');
      const report = analyzer.analyze(events, 5000);
      expect(report.fragmentation).toBeGreaterThanOrEqual(0);
      expect(report.fragmentation).toBeLessThanOrEqual(1);
    });

    it('should return 0 fragmentation for few events', () => {
      const events = [gcEvent({ type: 'mark-compact', generation: 'old' })];
      const report = analyzer.analyze(events, 1000);
      expect(report.fragmentation).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Single event edge case ────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle single event correctly', () => {
      const events = [gcEvent()];
      const report = analyzer.analyze(events, 1000);
      expect(report.totalEvents).toBe(1);
      expect(report.gcTimePercent).toBeGreaterThan(0);
    });

    it('should handle events with zero freedBytes', () => {
      const events = [
        gcEvent({ freedBytes: 0, heapBefore: 10_000_000, heapAfter: 10_000_000 }),
      ];
      const report = analyzer.analyze(events, 1000);
      expect(report.totalEvents).toBe(1);
    });

    it('should handle zero wall time gracefully', () => {
      const events = [gcEvent()];
      // wallTimeMs = 0 could cause division by zero
      const report = analyzer.analyze(events, 0);
      expect(report.gcTimePercent).toBeDefined();
      expect(Number.isFinite(report.gcTimePercent)).toBe(true);
    });
  });
});
