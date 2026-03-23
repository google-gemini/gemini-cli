/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSession,
  getActiveSession,
  setSession,
  clearSession,
  getLastStopReason,
  setLastStopReason,
  formatStackFrame,
  formatVariable,
  formatBreakpoint,
  errorResult,
  stackTraceAnalyzer,
  fixSuggestionEngine,
} from './session-manager.js';
import type { DAPClient } from '../../debug/index.js';

describe('session-manager', () => {
  beforeEach(() => {
    clearSession();
  });

  // -----------------------------------------------------------------------
  // Singleton session management
  // -----------------------------------------------------------------------

  describe('session lifecycle', () => {
    it('getActiveSession returns null when no session set', () => {
      expect(getActiveSession()).toBeNull();
    });

    it('getSession throws when no session exists', () => {
      expect(() => getSession()).toThrow('No active debug session');
    });

    it('setSession + getSession round-trips', () => {
      const mockClient = { fake: true } as unknown as DAPClient;
      setSession(mockClient);
      expect(getSession()).toBe(mockClient);
      expect(getActiveSession()).toBe(mockClient);
    });

    it('clearSession resets to null', () => {
      const mockClient = { fake: true } as unknown as DAPClient;
      setSession(mockClient);
      clearSession();
      expect(getActiveSession()).toBeNull();
      expect(() => getSession()).toThrow();
    });

    // Edge: clearing twice is safe
    it('clearSession is idempotent', () => {
      clearSession();
      clearSession();
      expect(getActiveSession()).toBeNull();
    });

    // Edge: setting a new session replaces previous
    it('setSession replaces existing session', () => {
      const client1 = { id: 1 } as unknown as DAPClient;
      const client2 = { id: 2 } as unknown as DAPClient;
      setSession(client1);
      setSession(client2);
      expect(getSession()).toBe(client2);
    });

    // Edge: getSession error message includes guidance
    it('getSession error message is user-friendly', () => {
      try {
        getSession();
      } catch (e) {
        expect((e as Error).message).toContain('debug_launch');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Stop reason tracking
  // -----------------------------------------------------------------------

  describe('last stop reason', () => {
    it('defaults to "entry"', () => {
      expect(getLastStopReason()).toBe('entry');
    });

    it('setLastStopReason updates the reason', () => {
      setLastStopReason('breakpoint');
      expect(getLastStopReason()).toBe('breakpoint');
    });

    // Edge: empty string reason
    it('allows empty string as reason', () => {
      setLastStopReason('');
      expect(getLastStopReason()).toBe('');
    });

    // Edge: special characters
    it('handles special characters in reason', () => {
      setLastStopReason('exception: TypeError');
      expect(getLastStopReason()).toBe('exception: TypeError');
    });
  });

  // -----------------------------------------------------------------------
  // Formatting helpers
  // -----------------------------------------------------------------------

  describe('formatStackFrame', () => {
    it('formats frame with source path', () => {
      const frame = {
        id: 1,
        name: 'myFunction',
        line: 42,
        column: 0,
        source: { path: '/src/app.ts' },
      };
      const result = formatStackFrame(frame, 0);
      expect(result).toBe('#0 myFunction at /src/app.ts:42');
    });

    it('formats frame without source path', () => {
      const frame = {
        id: 1,
        name: 'anonymous',
        line: 0,
        column: 0,
      };
      const result = formatStackFrame(frame, 3);
      expect(result).toBe('#3 anonymous at <unknown>');
    });

    // Edge: source object exists but path is undefined
    it('handles source with no path', () => {
      const frame = {
        id: 1,
        name: 'fn',
        line: 10,
        column: 0,
        source: { name: 'eval' },
      };
      const result = formatStackFrame(frame, 0);
      expect(result).toContain('<unknown>');
    });

    // Edge: large frame index
    it('handles large frame indices', () => {
      const frame = {
        id: 1,
        name: 'deep',
        line: 1,
        column: 0,
        source: { path: '/a.js' },
      };
      const result = formatStackFrame(frame, 999);
      expect(result).toBe('#999 deep at /a.js:1');
    });
  });

  describe('formatVariable', () => {
    it('formats variable with type', () => {
      const v = { name: 'count', value: '42', type: 'number' };
      expect(formatVariable(v)).toBe('count (number) = 42');
    });

    it('formats variable without type', () => {
      const v = { name: 'x', value: 'hello' };
      expect(formatVariable(v)).toBe('x = hello');
    });

    // Edge: empty name
    it('handles empty variable name', () => {
      const v = { name: '', value: 'val', type: 'string' };
      expect(formatVariable(v)).toBe(' (string) = val');
    });

    // Edge: multiline value
    it('handles multiline value', () => {
      const v = { name: 'obj', value: '{\n  a: 1\n}', type: 'Object' };
      expect(formatVariable(v)).toContain('obj (Object) = {\n  a: 1\n}');
    });
  });

  describe('formatBreakpoint', () => {
    it('formats verified breakpoint', () => {
      const bp = { id: 1, verified: true, line: 42 };
      expect(formatBreakpoint(bp)).toBe('[✓] id=1 line=42');
    });

    it('formats unverified breakpoint', () => {
      const bp = { id: 2, verified: false, line: 10 };
      expect(formatBreakpoint(bp)).toBe('[✗] id=2 line=10');
    });

    // Edge: missing line number
    it('handles missing line number', () => {
      const bp = { id: 3, verified: true };
      expect(formatBreakpoint(bp)).toBe('[✓] id=3 line=?');
    });

    // Edge: missing id
    it('handles undefined id', () => {
      const bp = { verified: true, line: 5 };
      expect(formatBreakpoint(bp)).toContain('line=5');
    });
  });

  // -----------------------------------------------------------------------
  // errorResult
  // -----------------------------------------------------------------------

  describe('errorResult', () => {
    it('produces correct structure', () => {
      const result = errorResult('something broke');
      expect(result.llmContent).toBe('Error: something broke');
      expect(result.returnDisplay).toBe('Debug operation failed.');
      expect(result.error).toBeDefined();
      expect(result.error!.message).toBe('something broke');
    });

    // Edge: empty message
    it('handles empty error message', () => {
      const result = errorResult('');
      expect(result.llmContent).toBe('Error: ');
    });

    // Edge: message with special chars
    it('handles special characters in error message', () => {
      const result = errorResult('ECONNREFUSED 127.0.0.1:9229');
      expect(result.llmContent).toContain('ECONNREFUSED');
    });
  });

  // -----------------------------------------------------------------------
  // Intelligence layer singletons
  // -----------------------------------------------------------------------

  describe('intelligence layer instances', () => {
    it('stackTraceAnalyzer is always the same instance', () => {
      const a = stackTraceAnalyzer;
      const b = stackTraceAnalyzer;
      expect(a).toBe(b);
    });

    it('fixSuggestionEngine is always the same instance', () => {
      const a = fixSuggestionEngine;
      const b = fixSuggestionEngine;
      expect(a).toBe(b);
    });

    it('stackTraceAnalyzer has an analyze method', () => {
      expect(typeof stackTraceAnalyzer.analyze).toBe('function');
    });

    it('fixSuggestionEngine has a suggest method', () => {
      expect(typeof fixSuggestionEngine.suggest).toBe('function');
    });
  });
});
