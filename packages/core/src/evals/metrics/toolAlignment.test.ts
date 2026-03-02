/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { evaluateToolAlignment } from './toolAlignment.js';
import { MetricObjective, OptimizationDirection } from '../types.js';
import type { Scenario } from '../schema.js';

describe('evaluateToolAlignment', () => {
  const mockScenario: Scenario = {
    id: 'test-scenario',
    metadata: { tags: ['test'], created_at: '2026-03-02' },
    input: { user_query: 'test query' },
    expected: {
      tool_calls: [{ name: 'read_file', arguments: { file_path: 'test.ts' } }],
      rationale: 'Testing alignment',
    },
    negatives: [
      {
        tool_calls: [
          { name: 'run_shell_command', arguments: { command: 'cat test.ts' } },
        ],
        reason: 'Avoid shell',
        severity: 'high',
      },
    ],
  };

  it('should return 1.0 for a perfect match', () => {
    const prediction = {
      tool_calls: [{ name: 'read_file', arguments: { file_path: 'test.ts' } }],
    };
    const result = evaluateToolAlignment(prediction, mockScenario);
    expect(result.score).toBe(1.0);
    expect(result.objective).toBe(MetricObjective.ALIGNMENT);
    expect(result.direction).toBe(OptimizationDirection.MAXIMIZE);
    expect(result.reason).toContain('Functional Success');
  });

  it('should return 0.0 for a hard failure (negative match)', () => {
    const prediction = {
      tool_calls: [
        { name: 'run_shell_command', arguments: { command: 'cat test.ts' } },
      ],
    };
    const result = evaluateToolAlignment(prediction, mockScenario);
    expect(result.score).toBe(0.0);
    expect(result.reason).toContain('Hard Failure');
    expect(result.metadata?.['matchedNegativeReason']).toBe('Avoid shell');
  });

  it('should return 0.1 for an incorrect tool selection', () => {
    const prediction = {
      tool_calls: [
        {
          name: 'write_file',
          arguments: { file_path: 'test.ts', content: 'test' },
        },
      ],
    };
    const result = evaluateToolAlignment(prediction, mockScenario);
    expect(result.score).toBe(0.1);
    expect(result.reason).toContain('wrong tool');
  });

  it('should return 0.4 for correct tool but wrong arguments', () => {
    const prediction = {
      tool_calls: [{ name: 'read_file', arguments: { file_path: 'wrong.ts' } }],
    };
    const result = evaluateToolAlignment(prediction, mockScenario);
    expect(result.score).toBe(0.4);
    expect(result.reason).toContain('arguments are incorrect');
  });

  it('should return 0.1 for an empty tool call list', () => {
    const prediction = { tool_calls: [] };
    const result = evaluateToolAlignment(prediction, mockScenario);
    expect(result.score).toBe(0.1);
    expect(result.reason).toContain('failed to produce any tool calls');
  });
});
