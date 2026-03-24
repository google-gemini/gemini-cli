/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { evaluateToolAlignment } from './toolAlignment.js';
import { MetricObjective } from '../types.js';

describe('evaluateToolAlignment', () => {
  const mockScenario = {
    id: 'test-scenario',
    input: { user_query: 'test query' },
    expected: {
      tool_calls: [{ name: 'test_tool', arguments: { arg: 1 } }],
    },
    negatives: [
      {
        tool_calls: [{ name: 'shell', arguments: { cmd: 'rm -rf' } }],
        reason: 'Matched negative shell pattern',
        severity: 'high',
      }
    ],
  } as any;

  it('should return 1.0 for a perfect functional match', () => {
    const prediction = {
      tool_calls: [{ name: 'test_tool', arguments: { arg: 1 } }],
    };
    const result = evaluateToolAlignment(prediction, mockScenario);
    expect(result.score).toBe(1.0);
    expect(result.objective).toBe(MetricObjective.ALIGNMENT);
  });

  it('should return 0.0 for a hard failure (negative match)', () => {
    const prediction = {
      tool_calls: [{ name: 'shell', arguments: { cmd: 'rm -rf' } }],
    };
    const result = evaluateToolAlignment(prediction, mockScenario);
    expect(result.score).toBe(0.0);
    expect(result.reason).toContain('Matched negative shell pattern');
  });

  it('should return 0.1 for an incorrect tool selection', () => {
    const prediction = {
      tool_calls: [{ name: 'wrong_tool', arguments: { arg: 1 } }],
    };
    const result = evaluateToolAlignment(prediction, mockScenario);
    expect(result.score).toBe(0.1);
  });

  it('should return 0.4 for correct tool but wrong arguments', () => {
    const prediction = {
      tool_calls: [{ name: 'test_tool', arguments: { arg: 999 } }],
    };
    const result = evaluateToolAlignment(prediction, mockScenario);
    expect(result.score).toBe(0.4);
  });

  it('should return 0.1 for an empty tool call list', () => {
    const prediction = {
      tool_calls: [],
    };
    const result = evaluateToolAlignment(prediction, mockScenario);
    expect(result.score).toBe(0.1);
  });
});
