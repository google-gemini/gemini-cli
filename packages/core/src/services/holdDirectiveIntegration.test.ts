/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  detectHoldDirective,
  buildHoldDirectiveError,
  HoldDirectiveType,
  type HoldDirective,
} from '../services/userDirectiveService.js';
import {
  checkHoldDirective,
  checkHoldDirectiveBatch,
} from '../scheduler/holdDirectiveGuard.js';
import type { ToolCallRequestInfo } from '../scheduler/types.js';

/**
 * End-to-end integration tests that validate the full flow:
 * user message -> directive detection -> tool blocking at scheduler layer.
 *
 * These tests simulate the exact scenarios from issue #26390.
 */
describe('Hold Directive E2E Integration', () => {
  function makeRequest(name: string, callId?: string): ToolCallRequestInfo {
    return {
      callId: callId ?? `${name}_${Date.now()}`,
      name,
      args: {},
      isClientInitiated: false,
      prompt_id: 'test-prompt',
    };
  }

  describe('Issue #26390 Scenario 1: Failure to Present Design', () => {
    it('should block write tools when user says "explain first what the root cause is"', () => {
      const userMessage =
        'explain first what the root cause is before making any changes';
      const directive = detectHoldDirective(userMessage);
      expect(directive).not.toBeNull();

      // Agent tries to fire replace (edit) tool, should be blocked
      const replaceResult = checkHoldDirective(
        makeRequest('replace'),
        directive,
      );
      expect(replaceResult.blocked).toBe(true);

      // Agent tries to fire write_file, should be blocked
      const writeResult = checkHoldDirective(
        makeRequest('write_file'),
        directive,
      );
      expect(writeResult.blocked).toBe(true);

      // Agent can still read files for research
      const readResult = checkHoldDirective(
        makeRequest('read_file'),
        directive,
      );
      expect(readResult.blocked).toBe(false);

      // Agent can still search
      const searchResult = checkHoldDirective(
        makeRequest('web_search'),
        directive,
      );
      expect(searchResult.blocked).toBe(false);
    });
  });

  describe('Issue #26390 Scenario 2: Hiding Subagent Output', () => {
    it('should block agent invocation when user says "show me full review report before any changes"', () => {
      const userMessage = 'show me full review report before any changes';
      const directive = detectHoldDirective(userMessage);
      expect(directive).not.toBeNull();

      // Agent tries to invoke subagent, should be blocked
      const agentResult = checkHoldDirective(
        makeRequest('invoke_agent'),
        directive,
      );
      expect(agentResult.blocked).toBe(true);

      // Agent tries 5 concurrent replace calls, all should be blocked
      const batch = [
        makeRequest('replace', 'call-1'),
        makeRequest('replace', 'call-2'),
        makeRequest('replace', 'call-3'),
        makeRequest('replace', 'call-4'),
        makeRequest('replace', 'call-5'),
      ];
      const blockedBatch = checkHoldDirectiveBatch(batch, directive);
      expect(blockedBatch.size).toBe(5);
    });
  });

  describe('Issue #26390 Scenario 3: Ignoring Explicit Negative Constraints', () => {
    it('should block all mutating tools for "fix all feedback errors - but not now i will run more reviews"', () => {
      const userMessage =
        'fix all feedback errors - but not now i will run more reviews';
      const directive = detectHoldDirective(userMessage);
      expect(directive).not.toBeNull();
      expect(directive!.type).toBe(HoldDirectiveType.NO_CHANGES_YET);

      // Agent should be blocked from firing 3 replace tool calls
      const batch = [
        makeRequest('replace', 'fix-1'),
        makeRequest('replace', 'fix-2'),
        makeRequest('replace', 'fix-3'),
      ];
      const blocked = checkHoldDirectiveBatch(batch, directive);
      expect(blocked.size).toBe(3);

      // But grep/read for investigation should work
      const grepResult = checkHoldDirective(makeRequest('grep'), directive);
      expect(grepResult.blocked).toBe(false);
    });
  });

  describe('Comment Scenario: Stealthy Code Modification', () => {
    it('should block when user says "do not modify any files until I say so"', () => {
      const userMessage = 'do not modify any files until I say so';
      const directive = detectHoldDirective(userMessage);
      expect(directive).not.toBeNull();

      // Every mutating tool should be blocked
      for (const tool of [
        'write_file',
        'replace',
        'run_shell_command',
        'write_todos',
      ]) {
        const result = checkHoldDirective(makeRequest(tool), directive);
        expect(result.blocked).toBe(true);
      }
    });
  });

  describe('Release Directive: User says "go ahead"', () => {
    it('should NOT detect hold when user says "go ahead and apply the fix"', () => {
      const directive = detectHoldDirective('go ahead and apply the fix');
      expect(directive).toBeNull();

      // No directive means no blocking
      const result = checkHoldDirective(makeRequest('write_file'), null);
      expect(result.blocked).toBe(false);
    });

    it('should NOT detect hold when user says "proceed with the changes"', () => {
      const directive = detectHoldDirective('proceed with the changes');
      expect(directive).toBeNull();
    });

    it('should NOT detect hold when user says "just apply it"', () => {
      const directive = detectHoldDirective('just apply it');
      expect(directive).toBeNull();
    });
  });

  describe('Error Message Quality', () => {
    it('should produce actionable error messages for the model', () => {
      const directive: HoldDirective = {
        type: HoldDirectiveType.NO_CHANGES_YET,
        matchedPhrase: 'but not now',
        confidence: 0.9,
      };

      const error = buildHoldDirectiveError('replace', directive);

      // Error should contain all needed info for model self-correction
      expect(error).toContain('[HOLD DIRECTIVE ACTIVE]');
      expect(error).toContain('replace');
      expect(error).toContain('but not now');
      expect(error).toContain('read_file');
      expect(error).toContain('grep');
      expect(error).toContain('Directive');
    });
  });

  describe('Mixed batch with read and write tools', () => {
    it('should allow reads and block writes in a realistic batch', () => {
      const directive = detectHoldDirective(
        'just analyze the code without changing anything',
      );
      expect(directive).not.toBeNull();

      // Realistic batch: model tries to read AND write in one turn
      const batch = [
        makeRequest('read_file', 'read-1'),
        makeRequest('grep', 'grep-1'),
        makeRequest('replace', 'edit-1'),
        makeRequest('write_file', 'write-1'),
        makeRequest('glob', 'glob-1'),
        makeRequest('run_shell_command', 'shell-1'),
      ];

      const blocked = checkHoldDirectiveBatch(batch, directive);

      // Only 3 mutating tools should be blocked
      expect(blocked.size).toBe(3);
      expect(blocked.has('edit-1')).toBe(true);
      expect(blocked.has('write-1')).toBe(true);
      expect(blocked.has('shell-1')).toBe(true);

      // Read tools should pass through
      expect(blocked.has('read-1')).toBe(false);
      expect(blocked.has('grep-1')).toBe(false);
      expect(blocked.has('glob-1')).toBe(false);
    });
  });
});
