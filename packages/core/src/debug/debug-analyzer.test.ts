/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  formatStackTrace,
  formatVariables,
  formatScopes,
  buildAnalysisPrompt,
  formatSessionSummary,
} from './debug-analyzer.js';
import type { StackFrame, Variable, Scope } from './dap-types.js';

describe('debug-analyzer', () => {
  describe('formatStackTrace', () => {
    it('formats stack frames with source locations', () => {
      const frames: StackFrame[] = [
        {
          id: 0,
          name: 'throwError',
          source: { path: '/app/src/index.ts' },
          line: 42,
          column: 5,
        },
        {
          id: 1,
          name: 'processRequest',
          source: { path: '/app/src/handler.ts' },
          line: 18,
          column: 3,
        },
        {
          id: 2,
          name: 'Module._compile',
          source: { path: 'node:internal/modules/cjs/loader' },
          line: 1376,
          column: 14,
          presentationHint: 'subtle',
        },
      ];

      const result = formatStackTrace(frames);

      expect(result).toContain('## Stack Trace');
      expect(result).toContain('→ #0 throwError at /app/src/index.ts:42:5');
      expect(result).toContain(
        '  #1 processRequest at /app/src/handler.ts:18:3',
      );
      expect(result).toContain('(framework/library)');
    });

    it('truncates long traces and shows omission count', () => {
      const manyFrames: StackFrame[] = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        name: `frame${i}`,
        source: { path: '/file.ts' },
        line: i + 1,
        column: 1,
      }));

      const result = formatStackTrace(manyFrames, { maxFrames: 5 });
      expect(result).toContain('25 more frames omitted');
    });

    it('handles frames without source info', () => {
      const frames: StackFrame[] = [
        { id: 0, name: 'anonymous', line: 0, column: 0 },
      ];

      const result = formatStackTrace(frames);
      expect(result).toContain('<unknown>');
    });
  });

  describe('formatVariables', () => {
    it('formats variables with types and values', () => {
      const vars: Variable[] = [
        {
          name: 'userName',
          value: '"Alice"',
          type: 'string',
          variablesReference: 0,
        },
        {
          name: 'count',
          value: '42',
          type: 'number',
          variablesReference: 0,
        },
        {
          name: 'config',
          value: 'Object',
          type: 'object',
          variablesReference: 5,
          namedVariables: 3,
        },
      ];

      const result = formatVariables(vars);

      expect(result).toContain('userName: string = "Alice"');
      expect(result).toContain('count: number = 42');
      expect(result).toContain('config: object = Object');
      expect(result).toContain('[expandable: 3 properties]');
    });

    it('truncates long values', () => {
      const vars: Variable[] = [
        {
          name: 'longStr',
          value: 'x'.repeat(500),
          variablesReference: 0,
        },
      ];

      const result = formatVariables(vars);
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(600);
    });

    it('respects maxItems limit', () => {
      const manyVars: Variable[] = Array.from({ length: 100 }, (_, i) => ({
        name: `var${i}`,
        value: `${i}`,
        variablesReference: 0,
      }));

      const result = formatVariables(manyVars, { maxItems: 10 });
      expect(result).toContain('90 more variables omitted');
    });
  });

  describe('formatScopes', () => {
    it('formats scopes with their variables', () => {
      const scopes: Array<{ scope: Scope; variables: Variable[] }> = [
        {
          scope: {
            name: 'Local',
            variablesReference: 1,
            expensive: false,
          },
          variables: [
            {
              name: 'x',
              value: '10',
              type: 'number',
              variablesReference: 0,
            },
          ],
        },
        {
          scope: {
            name: 'Global',
            variablesReference: 2,
            expensive: true,
          },
          variables: [],
        },
      ];

      const result = formatScopes(scopes);

      expect(result).toContain('### Local');
      expect(result).toContain('x: number = 10');
      expect(result).toContain('### Global');
      expect(result).toContain('(expensive to evaluate)');
      expect(result).toContain('(no variables)');
    });
  });

  describe('buildAnalysisPrompt', () => {
    it('builds a structured analysis prompt', () => {
      const prompt = buildAnalysisPrompt({
        stackTrace: [
          {
            id: 0,
            name: 'crash',
            source: { path: '/app/bug.ts' },
            line: 10,
            column: 1,
          },
        ],
        stoppedReason: 'exception',
        errorMessage: 'TypeError: Cannot read property "x" of null',
      });

      expect(prompt).toContain('# Debug State Analysis');
      expect(prompt).toContain('**Stopped reason:** exception');
      expect(prompt).toContain('TypeError: Cannot read property');
      expect(prompt).toContain('crash at /app/bug.ts:10:1');
      expect(prompt).toContain('## Analysis Request');
      expect(prompt).toContain('Identify the root cause');
    });

    it('includes source context when provided', () => {
      const prompt = buildAnalysisPrompt({
        stackTrace: [{ id: 0, name: 'fn', line: 1, column: 1 }],
        sourceContext: 'const x = null;\nx.property; // crash here',
      });

      expect(prompt).toContain('## Source Context');
      expect(prompt).toContain('const x = null;');
    });
  });

  describe('formatSessionSummary', () => {
    it('formats a session summary', () => {
      const summary = formatSessionSummary({
        runtime: 'node',
        breakpointsHit: 3,
        errorsFound: ['TypeError at line 42', 'ReferenceError at line 88'],
        stepsPerformed: 15,
      });

      expect(summary).toContain('## Debug Session Summary');
      expect(summary).toContain('**Runtime:** node');
      expect(summary).toContain('**Breakpoints hit:** 3');
      expect(summary).toContain('**Steps performed:** 15');
      expect(summary).toContain('**Errors found:** 2');
      expect(summary).toContain('TypeError at line 42');
    });

    it('shows no errors when list is empty', () => {
      const summary = formatSessionSummary({
        runtime: 'python',
        breakpointsHit: 0,
        errorsFound: [],
        stepsPerformed: 0,
      });

      expect(summary).toContain('**Errors found:** none');
    });
  });
});
