/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LLMBridge,
  type AnalysisSummary,
  type ProfileSummary,
} from './llm-bridge.js';
import type { LeakReport } from './diff-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSummary(
  overrides: Partial<AnalysisSummary> = {},
): AnalysisSummary {
  return {
    topLeakCandidates: [
      {
        constructor: 'EventEmitter',
        count: 10,
        retainedSizeDelta: 50000,
        retainerChain:
          'EventEmitter(object) --[property:listeners]--> Server(object)',
        confidence: 'high',
      },
    ],
    gcPressureLevel: 'medium',
    totalLeakedBytes: 50000,
    snapshotGrowthBytes: [10000, 40000],
    ...overrides,
  };
}

function makeLeakReport(overrides: Partial<LeakReport> = {}): LeakReport {
  return {
    candidates: [
      {
        nodeId: 42,
        constructorName: 'RequestHandler',
        count: 5,
        retainedSizeDelta: 25000,
        selfSize: 512,
        retainerChain: [
          {
            nodeId: 1,
            name: 'root',
            type: 'object',
            edgeType: '',
            edgeName: '',
          },
          {
            nodeId: 42,
            name: 'RequestHandler',
            type: 'object',
            edgeType: 'property',
            edgeName: 'handlers',
          },
        ],
        confidence: 'high',
      },
    ],
    totalLeakedBytes: 25000,
    snapshotSizes: [100000, 112500, 125000],
    analysisTimestamp: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// estimateTokenCount
// ---------------------------------------------------------------------------

describe('LLMBridge.estimateTokenCount', () => {
  let bridge: LLMBridge;
  beforeEach(() => {
    bridge = new LLMBridge();
  });

  it('returns 0 for empty string', () => {
    expect(bridge.estimateTokenCount('')).toBe(0);
  });

  it('estimates ~1 token for 4 chars', () => {
    expect(bridge.estimateTokenCount('test')).toBe(1);
  });

  it('estimates token count for longer text', () => {
    const text = 'a'.repeat(400);
    expect(bridge.estimateTokenCount(text)).toBe(100);
  });

  it('rounds up fractional tokens', () => {
    expect(bridge.estimateTokenCount('abc')).toBe(1); // ceil(3/4) = 1
  });
});

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------

describe('LLMBridge.buildPrompt', () => {
  let bridge: LLMBridge;
  beforeEach(() => {
    bridge = new LLMBridge();
  });

  it('builds a non-empty prompt', () => {
    const prompt = bridge.buildPrompt(makeSummary());
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('includes snapshot growth information', () => {
    const prompt = bridge.buildPrompt(
      makeSummary({ snapshotGrowthBytes: [5000, 20000] }),
    );
    expect(prompt).toContain('5000');
    expect(prompt).toContain('20000');
  });

  it('includes top leak candidates', () => {
    const prompt = bridge.buildPrompt(makeSummary());
    expect(prompt).toContain('EventEmitter');
  });

  it('includes retainer chain', () => {
    const prompt = bridge.buildPrompt(makeSummary());
    expect(prompt).toContain('chain:');
  });

  it('includes GC pressure level', () => {
    const prompt = bridge.buildPrompt(makeSummary({ gcPressureLevel: 'high' }));
    expect(prompt).toContain('high');
  });

  it('includes CPU hot functions when provided', () => {
    const summary = makeSummary({
      cpuHotFunctions: [{ name: 'processRequest', selfPercent: 35.2 }],
    });
    const prompt = bridge.buildPrompt(summary);
    expect(prompt).toContain('processRequest');
    expect(prompt).toContain('35.2');
  });

  it('stays under 2000 tokens even with many candidates', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      constructor: `LongConstructorName${i}ThatMightBeVerbose`,
      count: i + 1,
      retainedSizeDelta: i * 10000,
      retainerChain: `Root(object) --[property:ref${i}]--> Child${i}(object) --[property:data]--> Buffer${i}(array)`,
      confidence: 'high',
    }));
    const summary = makeSummary({ topLeakCandidates: candidates });
    const prompt = bridge.buildPrompt(summary);
    expect(bridge.estimateTokenCount(prompt)).toBeLessThanOrEqual(2000);
  });

  it('includes JSON schema in instructions', () => {
    const prompt = bridge.buildPrompt(makeSummary());
    expect(prompt).toContain('"rootCause"');
    expect(prompt).toContain('"pattern"');
    expect(prompt).toContain('"remediation"');
  });

  it('includes totalLeakedBytes', () => {
    const prompt = bridge.buildPrompt(makeSummary({ totalLeakedBytes: 99999 }));
    expect(prompt).toContain('99999');
  });

  it('omits CPU section when no cpuHotFunctions provided', () => {
    const summary = makeSummary({ cpuHotFunctions: undefined });
    const prompt = bridge.buildPrompt(summary);
    expect(prompt).not.toContain('CPU Hot Functions');
  });

  it('includes shouldExtendRetainerDepth in schema', () => {
    const prompt = bridge.buildPrompt(makeSummary());
    expect(prompt).toContain('shouldExtendRetainerDepth');
  });
});

// ---------------------------------------------------------------------------
// parseLLMResponse
// ---------------------------------------------------------------------------

describe('LLMBridge.parseLLMResponse', () => {
  let bridge: LLMBridge;
  beforeEach(() => {
    bridge = new LLMBridge();
  });

  const validResponse = JSON.stringify({
    rootCause: 'Event listeners not removed after request completion',
    pattern: 'event-listener',
    confidence: 0.9,
    remediation: 'Call emitter.removeListener() in request cleanup',
    shouldExtendRetainerDepth: false,
  });

  it('parses a valid JSON response', () => {
    const result = bridge.parseLLMResponse(validResponse);
    expect(result.rootCause).toBe(
      'Event listeners not removed after request completion',
    );
    expect(result.pattern).toBe('event-listener');
    expect(result.confidence).toBe(0.9);
    expect(result.remediation).toContain('removeListener');
    expect(result.shouldExtendRetainerDepth).toBe(false);
  });

  it('strips markdown fences', () => {
    const fenced = '```json\n' + validResponse + '\n```';
    const result = bridge.parseLLMResponse(fenced);
    expect(result.pattern).toBe('event-listener');
  });

  it('strips plain markdown fences without json tag', () => {
    const fenced = '```\n' + validResponse + '\n```';
    const result = bridge.parseLLMResponse(fenced);
    expect(result.pattern).toBe('event-listener');
  });

  it('returns safe default on invalid JSON', () => {
    const result = bridge.parseLLMResponse('not json at all');
    expect(result.pattern).toBe('unknown');
    expect(result.confidence).toBe(0);
    expect(result.rootCause).toContain('Unable to parse');
  });

  it('returns safe default on empty string', () => {
    const result = bridge.parseLLMResponse('');
    expect(result.pattern).toBe('unknown');
  });

  it('clamps confidence to [0, 1]', () => {
    const resp = JSON.stringify({
      ...JSON.parse(validResponse),
      confidence: 1.5,
    });
    const result = bridge.parseLLMResponse(resp);
    expect(result.confidence).toBe(1);
  });

  it('defaults pattern to unknown for unrecognized pattern', () => {
    const resp = JSON.stringify({
      ...JSON.parse(validResponse),
      pattern: 'alien-invasion',
    });
    const result = bridge.parseLLMResponse(resp);
    expect(result.pattern).toBe('unknown');
  });

  it('parses shouldExtendRetainerDepth true', () => {
    const resp = JSON.stringify({
      ...JSON.parse(validResponse),
      shouldExtendRetainerDepth: true,
    });
    const result = bridge.parseLLMResponse(resp);
    expect(result.shouldExtendRetainerDepth).toBe(true);
  });

  it('recognizes all valid patterns', () => {
    const patterns = [
      'event-listener',
      'closure',
      'timer',
      'detached-dom',
      'global-reference',
      'circular-reference',
      'promise-chain',
      'stream',
      'unbounded-cache',
      'unknown',
    ] as const;
    for (const pattern of patterns) {
      const resp = JSON.stringify({
        rootCause: 'x',
        pattern,
        confidence: 0.5,
        remediation: 'y',
        shouldExtendRetainerDepth: false,
      });
      const result = bridge.parseLLMResponse(resp);
      expect(result.pattern).toBe(pattern);
    }
  });
});

// ---------------------------------------------------------------------------
// buildAnalysisSummary
// ---------------------------------------------------------------------------

describe('LLMBridge.buildAnalysisSummary', () => {
  let bridge: LLMBridge;
  beforeEach(() => {
    bridge = new LLMBridge();
  });

  it('builds summary from LeakReport', () => {
    const report = makeLeakReport();
    const summary = bridge.buildAnalysisSummary(report);
    expect(summary.totalLeakedBytes).toBe(25000);
    expect(summary.topLeakCandidates.length).toBe(1);
    expect(summary.topLeakCandidates[0].constructor).toBe('RequestHandler');
  });

  it('includes retainer chain as readable string', () => {
    const report = makeLeakReport();
    const summary = bridge.buildAnalysisSummary(report);
    expect(typeof summary.topLeakCandidates[0].retainerChain).toBe('string');
    expect(summary.topLeakCandidates[0].retainerChain.length).toBeGreaterThan(
      0,
    );
  });

  it('calculates snapshot growth bytes correctly', () => {
    const report = makeLeakReport({ snapshotSizes: [100, 150, 200] });
    const summary = bridge.buildAnalysisSummary(report);
    expect(summary.snapshotGrowthBytes[0]).toBe(50); // S2-S1
    expect(summary.snapshotGrowthBytes[1]).toBe(50); // S3-S2
  });

  it('calculates gc pressure none when no growth', () => {
    const report = makeLeakReport({ snapshotSizes: [1000, 1001, 1002] });
    const summary = bridge.buildAnalysisSummary(report);
    expect(summary.gcPressureLevel).toBe('none');
  });

  it('calculates gc pressure high when 50%+ growth', () => {
    const report = makeLeakReport({ snapshotSizes: [1000, 1200, 1600] });
    const summary = bridge.buildAnalysisSummary(report);
    expect(summary.gcPressureLevel).toBe('high');
  });

  it('includes cpu hot functions when profile provided', () => {
    const report = makeLeakReport();
    const profile: ProfileSummary = {
      topBySelfTime: [{ name: 'handleRequest', percentage: 40 }],
    };
    const summary = bridge.buildAnalysisSummary(report, profile);
    expect(summary.cpuHotFunctions).toBeDefined();
    expect(summary.cpuHotFunctions![0].name).toBe('handleRequest');
  });

  it('limits topLeakCandidates to 5', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      nodeId: i,
      constructorName: `Class${i}`,
      count: 1,
      retainedSizeDelta: 100 * i,
      selfSize: 128,
      retainerChain: [],
      confidence: 'medium' as const,
    }));
    const report = makeLeakReport({ candidates });
    const summary = bridge.buildAnalysisSummary(report);
    expect(summary.topLeakCandidates.length).toBeLessThanOrEqual(5);
  });
});
