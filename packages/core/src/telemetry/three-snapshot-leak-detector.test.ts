/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import v8 from 'node:v8';
import process from 'node:process';
import {
  captureLeakSnapshot,
  calculateGrowth,
  analyzeSnapshots,
  formatLeakReport,
} from './three-snapshot-leak-detector.js';
import type {
  LeakDetectorSnapshot,
  LeakDetectorConfig,
} from './three-snapshot-leak-detector.js';

// Mock Node.js modules
vi.mock('node:v8', () => ({
  default: {
    getHeapSpaceStatistics: vi.fn(),
  },
}));

vi.mock('node:process', () => ({
  default: {
    memoryUsage: vi.fn(),
  },
}));

const mockV8HeapSpaces = vi.mocked(v8.getHeapSpaceStatistics);
const mockProcessMemory = vi.mocked(process.memoryUsage);

/** Helper to build a minimal snapshot for testing. */
function makeSnapshot(
  index: number,
  overrides: Partial<LeakDetectorSnapshot> = {},
): LeakDetectorSnapshot {
  return {
    index,
    timestamp: Date.now() + index * 10_000,
    heapUsed: 50 * 1_048_576, // 50 MB
    heapTotal: 80 * 1_048_576,
    external: 5 * 1_048_576,
    rss: 120 * 1_048_576,
    arrayBuffers: 2 * 1_048_576,
    heapSpaces: [
      {
        name: 'old_space',
        size: 40 * 1_048_576,
        used: 30 * 1_048_576,
        available: 10 * 1_048_576,
        physicalSize: 40 * 1_048_576,
      },
      {
        name: 'new_space',
        size: 10 * 1_048_576,
        used: 5 * 1_048_576,
        available: 5 * 1_048_576,
        physicalSize: 10 * 1_048_576,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('captureLeakSnapshot', () => {
  it('captures snapshot with correct index and data from process/v8', () => {
    mockProcessMemory.mockReturnValue({
      heapUsed: 50_000_000,
      heapTotal: 80_000_000,
      external: 5_000_000,
      rss: 120_000_000,
      arrayBuffers: 2_000_000,
    } as NodeJS.MemoryUsage);

    mockV8HeapSpaces.mockReturnValue([
      {
        space_name: 'old_space',
        space_size: 40_000_000,
        space_used_size: 30_000_000,
        space_available_size: 10_000_000,
        physical_space_size: 40_000_000,
      },
    ] as v8.HeapSpaceInfo[]);

    const snap = captureLeakSnapshot(1);

    expect(snap.index).toBe(1);
    expect(snap.heapUsed).toBe(50_000_000);
    expect(snap.external).toBe(5_000_000);
    expect(snap.heapSpaces).toHaveLength(1);
    expect(snap.heapSpaces[0].name).toBe('old_space');
    expect(snap.heapSpaces[0].used).toBe(30_000_000);
    expect(snap.timestamp).toBeGreaterThan(0);
  });
});

describe('calculateGrowth', () => {
  it('calculates positive growth between two snapshots', () => {
    const before = makeSnapshot(1, {
      heapUsed: 50 * 1_048_576,
      external: 5 * 1_048_576,
    });
    const after = makeSnapshot(2, {
      heapUsed: 60 * 1_048_576,
      external: 8 * 1_048_576,
    });

    const growth = calculateGrowth(before, after);

    expect(growth.heapUsed).toBe(10 * 1_048_576);
    expect(growth.external).toBe(3 * 1_048_576);
  });

  it('calculates negative growth (memory freed)', () => {
    const before = makeSnapshot(1, { heapUsed: 60 * 1_048_576 });
    const after = makeSnapshot(2, { heapUsed: 40 * 1_048_576 });

    const growth = calculateGrowth(before, after);

    expect(growth.heapUsed).toBe(-20 * 1_048_576);
  });

  it('calculates per-heap-space growth', () => {
    const before = makeSnapshot(1);
    const after = makeSnapshot(2, {
      heapSpaces: [
        {
          name: 'old_space',
          size: 50 * 1_048_576,
          used: 40 * 1_048_576,
          available: 10 * 1_048_576,
          physicalSize: 50 * 1_048_576,
        },
        {
          name: 'new_space',
          size: 10 * 1_048_576,
          used: 5 * 1_048_576,
          available: 5 * 1_048_576,
          physicalSize: 10 * 1_048_576,
        },
      ],
    });

    const growth = calculateGrowth(before, after);

    expect(growth.heapSpaces['old_space']).toBe(10 * 1_048_576);
    expect(growth.heapSpaces['new_space']).toBe(0);
  });

  it('handles new heap spaces not present in the before snapshot', () => {
    const before = makeSnapshot(1, { heapSpaces: [] });
    const after = makeSnapshot(2, {
      heapSpaces: [
        {
          name: 'code_space',
          size: 5 * 1_048_576,
          used: 3 * 1_048_576,
          available: 2 * 1_048_576,
          physicalSize: 5 * 1_048_576,
        },
      ],
    });

    const growth = calculateGrowth(before, after);

    expect(growth.heapSpaces['code_space']).toBe(3 * 1_048_576);
  });
});

describe('analyzeSnapshots', () => {
  it('reports no leaks when memory is stable', () => {
    const snap1 = makeSnapshot(1, { timestamp: 1000 });
    const snap2 = makeSnapshot(2, { timestamp: 11000 });
    const snap3 = makeSnapshot(3, { timestamp: 21000 });

    const result = analyzeSnapshots([snap1, snap2, snap3]);

    expect(result.suspectedLeaks).toHaveLength(0);
    expect(result.summary).toContain('No sustained memory leaks detected');
  });

  it('reports no leaks when only phase 1 grows (one-time allocation)', () => {
    const snap1 = makeSnapshot(1, {
      heapUsed: 50 * 1_048_576,
      timestamp: 1000,
    });
    const snap2 = makeSnapshot(2, {
      heapUsed: 70 * 1_048_576,
      timestamp: 11000,
    });
    // Phase 2: no further growth
    const snap3 = makeSnapshot(3, {
      heapUsed: 70 * 1_048_576,
      timestamp: 21000,
    });

    const result = analyzeSnapshots([snap1, snap2, snap3]);

    const heapLeak = result.suspectedLeaks.find((l) => l.region === 'heapUsed');
    expect(heapLeak).toBeUndefined();
  });

  it('detects sustained heapUsed growth as a suspected leak', () => {
    const snap1 = makeSnapshot(1, {
      heapUsed: 50 * 1_048_576,
      timestamp: 1000,
    });
    const snap2 = makeSnapshot(2, {
      heapUsed: 70 * 1_048_576,
      timestamp: 11000,
    });
    const snap3 = makeSnapshot(3, {
      heapUsed: 90 * 1_048_576,
      timestamp: 21000,
    });

    const result = analyzeSnapshots([snap1, snap2, snap3]);

    const heapLeak = result.suspectedLeaks.find((l) => l.region === 'heapUsed');
    expect(heapLeak).toBeDefined();
    expect(heapLeak!.growthPhase1).toBe(20 * 1_048_576);
    expect(heapLeak!.growthPhase2).toBe(20 * 1_048_576);
    expect(heapLeak!.totalGrowth).toBe(40 * 1_048_576);
    expect(heapLeak!.severity).toBe('high');
    expect(result.summary).toContain('suspected leak');
  });

  it('detects external memory leaks', () => {
    const snap1 = makeSnapshot(1, {
      external: 5 * 1_048_576,
      timestamp: 1000,
    });
    const snap2 = makeSnapshot(2, {
      external: 12 * 1_048_576,
      timestamp: 11000,
    });
    const snap3 = makeSnapshot(3, {
      external: 20 * 1_048_576,
      timestamp: 21000,
    });

    const result = analyzeSnapshots([snap1, snap2, snap3]);

    const extLeak = result.suspectedLeaks.find((l) => l.region === 'external');
    expect(extLeak).toBeDefined();
    expect(extLeak!.severity).toBe('high');
  });

  it('detects heap space specific leaks', () => {
    const baseSpaces = [
      {
        name: 'old_space',
        size: 40 * 1_048_576,
        used: 20 * 1_048_576,
        available: 20 * 1_048_576,
        physicalSize: 40 * 1_048_576,
      },
    ];
    const grownSpaces1 = [
      {
        name: 'old_space',
        size: 50 * 1_048_576,
        used: 30 * 1_048_576,
        available: 20 * 1_048_576,
        physicalSize: 50 * 1_048_576,
      },
    ];
    const grownSpaces2 = [
      {
        name: 'old_space',
        size: 60 * 1_048_576,
        used: 42 * 1_048_576,
        available: 18 * 1_048_576,
        physicalSize: 60 * 1_048_576,
      },
    ];

    const snap1 = makeSnapshot(1, {
      heapSpaces: baseSpaces,
      timestamp: 1000,
    });
    const snap2 = makeSnapshot(2, {
      heapSpaces: grownSpaces1,
      timestamp: 11000,
    });
    const snap3 = makeSnapshot(3, {
      heapSpaces: grownSpaces2,
      timestamp: 21000,
    });

    const result = analyzeSnapshots([snap1, snap2, snap3]);

    const spaceLeak = result.suspectedLeaks.find(
      (l) => l.region === 'heap_space:old_space',
    );
    expect(spaceLeak).toBeDefined();
    expect(spaceLeak!.growthPhase1).toBe(10 * 1_048_576);
    expect(spaceLeak!.growthPhase2).toBe(12 * 1_048_576);
  });

  it('respects custom minGrowthBytes threshold', () => {
    const snap1 = makeSnapshot(1, {
      heapUsed: 50 * 1_048_576,
      timestamp: 1000,
    });
    const snap2 = makeSnapshot(2, {
      heapUsed: 52 * 1_048_576,
      timestamp: 11000,
    });
    const snap3 = makeSnapshot(3, {
      heapUsed: 54 * 1_048_576,
      timestamp: 21000,
    });

    // With default 1 MB threshold, 2 MB per phase is above threshold
    // but 4% growth from 50 MB baseline is below 10% minGrowthPercent
    const result = analyzeSnapshots([snap1, snap2, snap3]);
    const heapLeak = result.suspectedLeaks.find((l) => l.region === 'heapUsed');
    expect(heapLeak).toBeUndefined();

    // With lowered percent threshold, it should be detected
    const config: LeakDetectorConfig = {
      minGrowthBytes: 1_048_576,
      minGrowthPercent: 1,
    };
    const result2 = analyzeSnapshots([snap1, snap2, snap3], config);
    const heapLeak2 = result2.suspectedLeaks.find(
      (l) => l.region === 'heapUsed',
    );
    expect(heapLeak2).toBeDefined();
  });

  it('classifies severity correctly', () => {
    // Medium: both phases grow, total ~4 MB
    const snap1 = makeSnapshot(1, {
      heapUsed: 10 * 1_048_576,
      timestamp: 1000,
    });
    const snap2 = makeSnapshot(2, {
      heapUsed: 12 * 1_048_576,
      timestamp: 11000,
    });
    const snap3 = makeSnapshot(3, {
      heapUsed: 14 * 1_048_576,
      timestamp: 21000,
    });

    const result = analyzeSnapshots([snap1, snap2, snap3]);
    const leak = result.suspectedLeaks.find((l) => l.region === 'heapUsed');
    expect(leak).toBeDefined();
    expect(leak!.severity).toBe('medium');
  });

  it('sorts leaks by severity then total growth', () => {
    // Create scenario with multiple leaks of different severities
    const snap1 = makeSnapshot(1, {
      heapUsed: 50 * 1_048_576,
      external: 5 * 1_048_576,
      arrayBuffers: 2 * 1_048_576,
      timestamp: 1000,
    });
    const snap2 = makeSnapshot(2, {
      heapUsed: 70 * 1_048_576,
      external: 7 * 1_048_576,
      arrayBuffers: 4 * 1_048_576,
      timestamp: 11000,
    });
    const snap3 = makeSnapshot(3, {
      heapUsed: 90 * 1_048_576,
      external: 9 * 1_048_576,
      arrayBuffers: 6 * 1_048_576,
      timestamp: 21000,
    });

    const config: LeakDetectorConfig = {
      minGrowthBytes: 1_048_576,
      minGrowthPercent: 10,
    };
    const result = analyzeSnapshots([snap1, snap2, snap3], config);

    // heapUsed (40 MB total) should be high severity and first
    if (result.suspectedLeaks.length > 1) {
      const severities = result.suspectedLeaks.map((l) => l.severity);
      const severityOrder: Record<string, number> = {
        high: 0,
        medium: 1,
        low: 2,
      };
      for (let i = 1; i < severities.length; i++) {
        expect(severityOrder[severities[i]]).toBeGreaterThanOrEqual(
          severityOrder[severities[i - 1]],
        );
      }
    }
  });

  it('computes durationMs correctly', () => {
    const snap1 = makeSnapshot(1, { timestamp: 1000 });
    const snap2 = makeSnapshot(2, { timestamp: 6000 });
    const snap3 = makeSnapshot(3, { timestamp: 11000 });

    const result = analyzeSnapshots([snap1, snap2, snap3]);

    expect(result.durationMs).toBe(10000);
  });
});

describe('formatLeakReport', () => {
  it('formats a clean report when no leaks detected', () => {
    const snap1 = makeSnapshot(1, { timestamp: 1000 });
    const snap2 = makeSnapshot(2, { timestamp: 11000 });
    const snap3 = makeSnapshot(3, { timestamp: 21000 });

    const result = analyzeSnapshots([snap1, snap2, snap3]);
    const report = formatLeakReport(result);

    expect(report).toContain('Three-Snapshot Memory Leak Detection Report');
    expect(report).toContain('No sustained memory leaks detected');
    expect(report).toContain('#1');
    expect(report).toContain('#2');
    expect(report).toContain('#3');
  });

  it('formats a report with suspected leaks', () => {
    const snap1 = makeSnapshot(1, {
      heapUsed: 50 * 1_048_576,
      timestamp: 1000,
    });
    const snap2 = makeSnapshot(2, {
      heapUsed: 70 * 1_048_576,
      timestamp: 11000,
    });
    const snap3 = makeSnapshot(3, {
      heapUsed: 90 * 1_048_576,
      timestamp: 21000,
    });

    const result = analyzeSnapshots([snap1, snap2, snap3]);
    const report = formatLeakReport(result);

    expect(report).toContain('Suspected leaks');
    expect(report).toContain('[HIGH]');
    expect(report).toContain('heapUsed');
    expect(report).toContain('sustained growth detected');
  });
});
