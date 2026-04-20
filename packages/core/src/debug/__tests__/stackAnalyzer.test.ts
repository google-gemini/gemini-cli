/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  analyzeStackTrace,
  formatVariablesForDisplay,
  formatStackForDisplay,
} from '../stackAnalyzer.js';
import type { StackFrame, Variable } from '../types.js';

describe('analyzeStackTrace', () => {
  it('should filter out node_modules frames', () => {
    const frames: StackFrame[] = [
      {
        id: 0,
        name: 'userFunc',
        source: { path: '/app/src/index.ts' },
        line: 10,
        column: 5,
      },
      {
        id: 1,
        name: 'libFunc',
        source: { path: '/app/node_modules/lib/index.js' },
        line: 20,
        column: 1,
      },
      {
        id: 2,
        name: 'anotherUser',
        source: { path: '/app/src/utils.ts' },
        line: 30,
        column: 8,
      },
    ];

    const analysis = analyzeStackTrace(frames);
    expect(analysis.relevantFrames).toHaveLength(2);
    expect(analysis.relevantFrames[0]?.name).toBe('userFunc');
    expect(analysis.relevantFrames[1]?.name).toBe('anotherUser');
  });

  it('should identify root cause as first user frame', () => {
    const frames: StackFrame[] = [
      {
        id: 0,
        name: 'errorFunc',
        source: { path: '/app/src/error.ts' },
        line: 42,
        column: 1,
      },
    ];

    const analysis = analyzeStackTrace(frames);
    expect(analysis.rootCauseFrame?.name).toBe('errorFunc');
    expect(analysis.suggestions[0]).toContain('/app/src/error.ts:42');
  });

  it('should detect deep stacks', () => {
    const frames: StackFrame[] = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      name: `frame${i}`,
      source: { path: `/app/src/f${i}.ts` },
      line: i,
      column: 0,
    }));

    const analysis = analyzeStackTrace(frames);
    expect(analysis.suggestions).toContain(
      'Deep stack — possible recursion or callback chain.',
    );
  });

  it('should detect async code', () => {
    const frames: StackFrame[] = [
      {
        id: 0,
        name: 'async handleRequest',
        source: { path: '/app/src/handler.ts' },
        line: 5,
        column: 0,
      },
    ];

    const analysis = analyzeStackTrace(frames);
    expect(analysis.suggestions).toContainEqual(
      expect.stringContaining('Async code detected'),
    );
  });

  it('should provide summary', () => {
    const frames: StackFrame[] = [
      {
        id: 0,
        name: 'a',
        source: { path: '/app/src/a.ts' },
        line: 1,
        column: 0,
      },
      {
        id: 1,
        name: 'b',
        source: { path: '/node_modules/x' },
        line: 1,
        column: 0,
      },
    ];

    const analysis = analyzeStackTrace(frames);
    expect(analysis.summary).toContain('2 frames');
    expect(analysis.summary).toContain('1 user code');
  });
});

describe('formatVariablesForDisplay', () => {
  it('should format variables', () => {
    const vars: Variable[] = [
      { name: 'x', value: '42', type: 'number', variablesReference: 0 },
      { name: 'name', value: '"hello"', type: 'string', variablesReference: 0 },
    ];

    const output = formatVariablesForDisplay(vars);
    expect(output).toContain('x (number) = 42');
    expect(output).toContain('name (string) = "hello"');
  });

  it('should handle variables without type', () => {
    const vars: Variable[] = [
      { name: 'y', value: 'true', variablesReference: 0 },
    ];

    const output = formatVariablesForDisplay(vars);
    expect(output).toContain('y = true');
    expect(output).not.toContain('()');
  });
});

describe('formatStackForDisplay', () => {
  it('should format stack frames', () => {
    const frames: StackFrame[] = [
      {
        id: 0,
        name: 'main',
        source: { path: '/app/index.ts' },
        line: 10,
        column: 5,
      },
      {
        id: 1,
        name: 'helper',
        source: { path: '/app/utils.ts' },
        line: 20,
        column: 3,
      },
    ];

    const output = formatStackForDisplay(frames);
    expect(output).toContain('#0 main at /app/index.ts:10:5');
    expect(output).toContain('#1 helper at /app/utils.ts:20:3');
  });

  it('should handle unknown source', () => {
    const frames: StackFrame[] = [
      { id: 0, name: 'unknown', line: 0, column: 0 },
    ];

    const output = formatStackForDisplay(frames);
    expect(output).toContain('<unknown>');
  });
});
