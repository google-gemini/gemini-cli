/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  detectHoldDirective,
  isMutatingTool,
  buildHoldDirectiveError,
  HoldDirectiveType,
  MUTATING_TOOL_NAMES,
  READ_ONLY_TOOL_NAMES,
} from './userDirectiveService.js';

describe('userDirectiveService', () => {
  describe('detectHoldDirective', () => {
    describe('explicit wait directives', () => {
      it('should detect "wait for me" directive', () => {
        const result = detectHoldDirective('wait for me before doing anything');
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.EXPLICIT_WAIT);
        expect(result!.confidence).toBeGreaterThanOrEqual(0.9);
      });

      it('should detect "hold on" directive', () => {
        const result = detectHoldDirective(
          'hold on, let me review the output first',
        );
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.EXPLICIT_WAIT);
      });

      it('should detect "wait before" directive', () => {
        const result = detectHoldDirective('wait before applying any changes');
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.EXPLICIT_WAIT);
      });

      it('should detect "stop, don\'t" directive', () => {
        const result = detectHoldDirective(
          "stop, don't make those changes yet",
        );
        expect(result).not.toBeNull();
      });
    });

    describe('no-changes-yet directives', () => {
      it('should detect "don\'t apply" directive', () => {
        const result = detectHoldDirective("don't apply the fixes yet");
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.NO_CHANGES_YET);
        expect(result!.confidence).toBeGreaterThanOrEqual(0.9);
      });

      it('should detect "do not modify" directive', () => {
        const result = detectHoldDirective(
          'do not modify any files until I say so',
        );
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.NO_CHANGES_YET);
      });

      it('should detect "but not now" directive (from issue #26390)', () => {
        const result = detectHoldDirective(
          'fix all feedback errors - but not now i will run more reviews',
        );
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.NO_CHANGES_YET);
      });

      it('should detect "do not execute" with temporal suffix', () => {
        const result = detectHoldDirective(
          'do not execute any shell commands yet',
        );
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.NO_CHANGES_YET);
      });

      it('should NOT detect "do not execute" without temporal suffix (Review #6)', () => {
        const result = detectHoldDirective('do not execute any shell commands');
        expect(result).toBeNull();
      });

      it('should detect "don\'t change anything yet"', () => {
        const result = detectHoldDirective("don't change anything yet");
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.NO_CHANGES_YET);
      });

      it('should detect "but don\'t apply" with temporal suffix', () => {
        const result = detectHoldDirective(
          "analyze the problem but don't apply any fixes yet",
        );
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.NO_CHANGES_YET);
      });

      it('should NOT detect "but don\'t apply" without temporal suffix (Review #8)', () => {
        const result = detectHoldDirective(
          "analyze the problem but don't apply any fixes",
        );
        expect(result).toBeNull();
      });
    });

    describe('explain-only directives', () => {
      it('should detect "just explain" directive', () => {
        const result = detectHoldDirective('just explain what the issue is');
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.EXPLAIN_ONLY);
      });

      it('should detect "only analyze" directive', () => {
        const result = detectHoldDirective(
          'only analyze the error and tell me what you find',
        );
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.EXPLAIN_ONLY);
      });

      it('should detect "without changing anything" directive', () => {
        const result = detectHoldDirective(
          'review the code without changing anything',
        );
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.EXPLAIN_ONLY);
        expect(result!.confidence).toBeGreaterThanOrEqual(0.9);
      });

      it('should detect "explain first" directive', () => {
        const result = detectHoldDirective(
          'explain first what the root cause is',
        );
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.EXPLAIN_ONLY);
      });

      it('should detect "without modifying any files"', () => {
        const result = detectHoldDirective(
          'investigate the crash without modifying any files',
        );
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.EXPLAIN_ONLY);
      });
    });

    describe('review-first directives', () => {
      it('should detect "show me the report first"', () => {
        const result = detectHoldDirective(
          'show me the full review report first',
        );
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.REVIEW_FIRST);
      });

      it('should detect "before making any changes"', () => {
        const result = detectHoldDirective(
          'before making any changes, let me see the plan',
        );
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.REVIEW_FIRST);
      });

      it('should detect "I will run tests first"', () => {
        const result = detectHoldDirective('I will run the tests myself first');
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.REVIEW_FIRST);
      });

      it('should detect "present the findings before"', () => {
        const result = detectHoldDirective(
          'present the findings before applying fixes',
        );
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.REVIEW_FIRST);
      });
    });

    describe('negation patterns (should NOT detect hold)', () => {
      it('should NOT detect "don\'t wait" as a hold', () => {
        const result = detectHoldDirective("don't wait, just do it");
        expect(result).toBeNull();
      });

      it('should NOT detect "just apply the fix"', () => {
        const result = detectHoldDirective('just apply the fix and move on');
        expect(result).toBeNull();
      });

      it('should NOT detect "go ahead"', () => {
        const result = detectHoldDirective('go ahead and make the changes');
        expect(result).toBeNull();
      });

      it('should NOT detect "proceed with the changes"', () => {
        const result = detectHoldDirective('proceed with the changes');
        expect(result).toBeNull();
      });

      it('should NOT detect "just do it"', () => {
        const result = detectHoldDirective('just do what needs to be done');
        expect(result).toBeNull();
      });

      it('should detect hold despite "go ahead" in earlier clause (Review #18)', () => {
        const result = detectHoldDirective(
          'go ahead with the research, but do not modify files yet',
        );
        expect(result).not.toBeNull();
        expect(result!.type).toBe(HoldDirectiveType.NO_CHANGES_YET);
      });

      it('should detect hold despite "proceed" in earlier clause (Review #18)', () => {
        const result = detectHoldDirective(
          'proceed with the investigation, but hold on before fixing',
        );
        expect(result).not.toBeNull();
      });
    });

    describe('non-directive messages (should NOT detect hold)', () => {
      it('should NOT detect hold in normal coding request', () => {
        const result = detectHoldDirective(
          'fix the bug in the authentication module',
        );
        expect(result).toBeNull();
      });

      it('should NOT detect hold in "await" programming context', () => {
        const result = detectHoldDirective(
          'use await to wait for the promise to resolve',
        );
        expect(result).toBeNull();
      });

      it('should NOT detect hold in simple question', () => {
        const result = detectHoldDirective('what does this function do?');
        expect(result).toBeNull();
      });

      it('should NOT detect hold in implementation request', () => {
        const result = detectHoldDirective(
          'implement a retry mechanism with exponential backoff',
        );
        expect(result).toBeNull();
      });

      it('should return null for empty string', () => {
        expect(detectHoldDirective('')).toBeNull();
      });

      // Round 2 Review #7: multi-line messages should not cross newline
      it('should NOT match across newlines (Review #7)', () => {
        const result = detectHoldDirective(
          "Do not write duplicate tests\nNow, let's implement the feature",
        );
        expect(result).toBeNull();
      });

      // Round 2 Review #8: "but don't change" without temporal suffix
      it('should NOT detect "but don\'t change the existing tests" (Review #8)', () => {
        const result = detectHoldDirective(
          "Fix the bug in auth.ts, but don't change the existing tests",
        );
        expect(result).toBeNull();
      });

      // Round 2 Review #9: greedy .* crossing clause boundaries
      it('should NOT match "Show me report. Before that, write file" (Review #9)', () => {
        const result = detectHoldDirective(
          "Show me the report. Before that, let's write the file.",
        );
        expect(result).toBeNull();
      });

      // Round 2 Review #10: "I will do it later" in compound sentence
      it('should NOT match "I will do it later, for now implement" (Review #10)', () => {
        const result = detectHoldDirective(
          'I will do it later, for now just implement the basic structure.',
        );
        expect(result).toBeNull();
      });

      // Round 2 Review #11: "run tests before making changes" is an action
      it('should NOT match "run tests before making changes" (Review #11)', () => {
        const result = detectHoldDirective(
          'run the tests before making any changes',
        );
        expect(result).toBeNull();
      });

      it('should return null for null/undefined', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(detectHoldDirective(null as any)).toBeNull();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(detectHoldDirective(undefined as any)).toBeNull();
      });
    });

    describe('real-world issue #26390 scenarios', () => {
      it('should detect the exact phrase from issue report scenario 3', () => {
        // From issue: "fix all feedback errors - but not now i will run more reviews"
        const result = detectHoldDirective(
          'fix all feedback errors - but not now i will run more reviews',
        );
        expect(result).not.toBeNull();
      });

      it('should detect "show me full review report"', () => {
        // From issue report scenario 2
        const result = detectHoldDirective(
          'show me full review report before any changes',
        );
        expect(result).not.toBeNull();
      });

      it('should detect hold in multi-line message', () => {
        const result = detectHoldDirective(
          'I see the issues in the code.\nDo not apply any fixes yet.\nLet me review the test results first.',
        );
        expect(result).not.toBeNull();
      });
    });
  });

  describe('isMutatingTool', () => {
    it('should identify write_file as mutating', () => {
      expect(isMutatingTool('write_file')).toBe(true);
    });

    it('should identify replace (edit) as mutating', () => {
      expect(isMutatingTool('replace')).toBe(true);
    });

    it('should identify run_shell_command as mutating', () => {
      expect(isMutatingTool('run_shell_command')).toBe(true);
    });

    it('should identify invoke_agent as mutating', () => {
      expect(isMutatingTool('invoke_agent')).toBe(true);
    });

    it('should NOT identify read_file as mutating', () => {
      expect(isMutatingTool('read_file')).toBe(false);
    });

    it('should NOT identify grep as mutating', () => {
      expect(isMutatingTool('grep')).toBe(false);
    });

    it('should NOT identify web_search as mutating', () => {
      expect(isMutatingTool('web_search')).toBe(false);
    });

    it('should NOT identify ask_user as mutating', () => {
      expect(isMutatingTool('ask_user')).toBe(false);
    });

    it('should identify unknown tools as mutating (secure-by-default, Review #3)', () => {
      expect(isMutatingTool('some_random_tool')).toBe(true);
      expect(isMutatingTool('mcp_filesystem_write_file')).toBe(true);
    });
  });

  describe('tool name sets', () => {
    it('MUTATING and READ_ONLY sets should not overlap', () => {
      for (const tool of MUTATING_TOOL_NAMES) {
        expect(READ_ONLY_TOOL_NAMES.has(tool)).toBe(false);
      }
    });

    it('MUTATING set should contain all edit tools', () => {
      expect(MUTATING_TOOL_NAMES.has('write_file')).toBe(true);
      expect(MUTATING_TOOL_NAMES.has('replace')).toBe(true);
    });
  });

  describe('buildHoldDirectiveError', () => {
    it('should include tool name in error message', () => {
      const directive = {
        type: HoldDirectiveType.EXPLICIT_WAIT,
        matchedPhrase: 'wait for me',
        confidence: 0.95,
      };
      const error = buildHoldDirectiveError('write_file', directive);
      expect(error).toContain('write_file');
      expect(error).toContain('[HOLD DIRECTIVE ACTIVE]');
    });

    it('should include matched phrase in error message', () => {
      const directive = {
        type: HoldDirectiveType.NO_CHANGES_YET,
        matchedPhrase: "don't apply",
        confidence: 0.95,
      };
      const error = buildHoldDirectiveError('edit', directive);
      expect(error).toContain("don't apply");
    });

    it('should include guidance about read-only tools', () => {
      const directive = {
        type: HoldDirectiveType.EXPLAIN_ONLY,
        matchedPhrase: 'just explain',
        confidence: 0.9,
      };
      const error = buildHoldDirectiveError('shell', directive);
      expect(error).toContain('read_file');
      expect(error).toContain('grep');
    });

    it('should include different descriptions for each type', () => {
      const types = Object.values(HoldDirectiveType);
      const errors = types.map((type) =>
        buildHoldDirectiveError('edit', {
          type,
          matchedPhrase: 'test',
          confidence: 0.9,
        }),
      );
      // Each error type should produce a unique description
      const uniqueErrors = new Set(errors);
      expect(uniqueErrors.size).toBe(types.length);
    });
  });
});
