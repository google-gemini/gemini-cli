/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  checkHoldDirective,
  checkHoldDirectiveBatch,
} from './holdDirectiveGuard.js';
import { HoldDirectiveType } from '../services/userDirectiveService.js';
import type { ToolCallRequestInfo } from './types.js';
import { ToolErrorType } from '../tools/tool-error.js';

function makeRequest(name: string, callId?: string): ToolCallRequestInfo {
  return {
    callId: callId ?? `${name}_${Date.now()}`,
    name,
    args: {},
    isClientInitiated: false,
    prompt_id: 'test',
  };
}

const ACTIVE_DIRECTIVE = {
  type: HoldDirectiveType.NO_CHANGES_YET,
  matchedPhrase: "don't apply yet",
  confidence: 0.95,
};

describe('holdDirectiveGuard', () => {
  describe('checkHoldDirective', () => {
    it('should allow all tools when no directive is active', () => {
      const result = checkHoldDirective(makeRequest('write_file'), null);
      expect(result.blocked).toBe(false);
      expect(result.errorMessage).toBeUndefined();
    });

    it('should block write_file when directive is active', () => {
      const result = checkHoldDirective(
        makeRequest('write_file'),
        ACTIVE_DIRECTIVE,
      );
      expect(result.blocked).toBe(true);
      expect(result.errorMessage).toContain('[HOLD DIRECTIVE ACTIVE]');
      expect(result.errorMessage).toContain('write_file');
      expect(result.errorType).toBe(ToolErrorType.HOLD_DIRECTIVE_VIOLATION);
    });

    it('should block replace (edit) when directive is active', () => {
      const result = checkHoldDirective(
        makeRequest('replace'),
        ACTIVE_DIRECTIVE,
      );
      expect(result.blocked).toBe(true);
      expect(result.errorMessage).toContain('replace');
    });

    it('should block run_shell_command (shell) when directive is active', () => {
      const result = checkHoldDirective(
        makeRequest('run_shell_command'),
        ACTIVE_DIRECTIVE,
      );
      expect(result.blocked).toBe(true);
    });

    it('should block invoke_agent when directive is active', () => {
      const result = checkHoldDirective(
        makeRequest('invoke_agent'),
        ACTIVE_DIRECTIVE,
      );
      expect(result.blocked).toBe(true);
    });

    it('should block write_todos when directive is active', () => {
      const result = checkHoldDirective(
        makeRequest('write_todos'),
        ACTIVE_DIRECTIVE,
      );
      expect(result.blocked).toBe(true);
    });

    it('should allow read_file when directive is active', () => {
      const result = checkHoldDirective(
        makeRequest('read_file'),
        ACTIVE_DIRECTIVE,
      );
      expect(result.blocked).toBe(false);
    });

    it('should allow grep when directive is active', () => {
      const result = checkHoldDirective(makeRequest('grep'), ACTIVE_DIRECTIVE);
      expect(result.blocked).toBe(false);
    });

    it('should allow glob when directive is active', () => {
      const result = checkHoldDirective(makeRequest('glob'), ACTIVE_DIRECTIVE);
      expect(result.blocked).toBe(false);
    });

    it('should allow ls when directive is active', () => {
      const result = checkHoldDirective(makeRequest('ls'), ACTIVE_DIRECTIVE);
      expect(result.blocked).toBe(false);
    });

    it('should allow web_search when directive is active', () => {
      const result = checkHoldDirective(
        makeRequest('web_search'),
        ACTIVE_DIRECTIVE,
      );
      expect(result.blocked).toBe(false);
    });

    it('should allow ask_user when directive is active', () => {
      const result = checkHoldDirective(
        makeRequest('ask_user'),
        ACTIVE_DIRECTIVE,
      );
      expect(result.blocked).toBe(false);
    });

    it('should block unknown/MCP tools (secure-by-default, Review #3)', () => {
      const result = checkHoldDirective(
        makeRequest('mcp_my_server_my_tool'),
        ACTIVE_DIRECTIVE,
      );
      expect(result.blocked).toBe(true);
    });

    it('should include matched phrase in error message', () => {
      const result = checkHoldDirective(
        makeRequest('replace'),
        ACTIVE_DIRECTIVE,
      );
      expect(result.errorMessage).toContain("don't apply yet");
    });

    it('should work with all directive types', () => {
      const types = Object.values(HoldDirectiveType);
      for (const type of types) {
        const result = checkHoldDirective(makeRequest('write_file'), {
          type,
          matchedPhrase: 'test',
          confidence: 0.9,
        });
        expect(result.blocked).toBe(true);
      }
    });
  });

  describe('checkHoldDirectiveBatch', () => {
    it('should return empty map when no directive is active', () => {
      const requests = [
        makeRequest('write_file', 'call-1'),
        makeRequest('replace', 'call-2'),
      ];
      const result = checkHoldDirectiveBatch(requests, null);
      expect(result.size).toBe(0);
    });

    it('should block only mutating tools in a mixed batch', () => {
      const requests = [
        makeRequest('read_file', 'call-1'),
        makeRequest('write_file', 'call-2'),
        makeRequest('grep', 'call-3'),
        makeRequest('replace', 'call-4'),
        makeRequest('ls', 'call-5'),
      ];
      const result = checkHoldDirectiveBatch(requests, ACTIVE_DIRECTIVE);
      expect(result.size).toBe(2);
      expect(result.has('call-2')).toBe(true);
      expect(result.has('call-4')).toBe(true);
      expect(result.has('call-1')).toBe(false);
      expect(result.has('call-3')).toBe(false);
      expect(result.has('call-5')).toBe(false);
    });

    it('should block all mutating tools in an all-mutating batch', () => {
      const requests = [
        makeRequest('write_file', 'call-1'),
        makeRequest('replace', 'call-2'),
        makeRequest('run_shell_command', 'call-3'),
      ];
      const result = checkHoldDirectiveBatch(requests, ACTIVE_DIRECTIVE);
      expect(result.size).toBe(3);
    });

    it('should not block any tools in an all-read batch', () => {
      const requests = [
        makeRequest('read_file', 'call-1'),
        makeRequest('grep', 'call-2'),
        makeRequest('ls', 'call-3'),
      ];
      const result = checkHoldDirectiveBatch(requests, ACTIVE_DIRECTIVE);
      expect(result.size).toBe(0);
    });

    it('should handle empty batch', () => {
      const result = checkHoldDirectiveBatch([], ACTIVE_DIRECTIVE);
      expect(result.size).toBe(0);
    });
  });
});
