/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { PolicyEngine } from '../../policy/policy-engine.js';
import type { DAPClient } from '../../debug/index.js';
import {
  setSession,
  clearSession,
  getActiveSession,
  setLastStopReason,
} from './session-manager.js';

// Tool imports
import { DebugSetBreakpointTool } from './debug-set-breakpoint.js';
import { DebugGetStackTraceTool } from './debug-get-stacktrace.js';
import { DebugGetVariablesTool } from './debug-get-variables.js';
import { DebugStepTool } from './debug-step.js';
import { DebugEvaluateTool } from './debug-evaluate.js';
import { DebugDisconnectTool } from './debug-disconnect.js';
import { DebugAttachTool } from './debug-attach.js';
import { DebugSetFunctionBreakpointTool } from './debug-set-function-breakpoint.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const messageBus = new MessageBus(null as unknown as PolicyEngine, false);
const getSignal = () => new AbortController().signal;

function createMockDAPClient(
  overrides: Record<string, unknown> = {},
): DAPClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
    launch: vi.fn().mockResolvedValue(undefined),
    configurationDone: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    setBreakpoints: vi.fn().mockResolvedValue([]),
    setExceptionBreakpoints: vi.fn().mockResolvedValue(undefined),
    stackTrace: vi.fn().mockResolvedValue([]),
    scopes: vi.fn().mockResolvedValue([]),
    variables: vi.fn().mockResolvedValue([]),
    evaluate: vi
      .fn()
      .mockResolvedValue({ result: 'undefined', type: 'undefined' }),
    continue: vi.fn().mockResolvedValue(undefined),
    next: vi.fn().mockResolvedValue(undefined),
    stepIn: vi.fn().mockResolvedValue(undefined),
    stepOut: vi.fn().mockResolvedValue(undefined),
    sendRequest: vi.fn().mockResolvedValue({}),
    getRecentOutput: vi.fn().mockReturnValue([]),
    capabilities: { exceptionBreakpointFilters: [] },
    on: vi.fn(),
    once: vi.fn(),
    ...overrides,
  } as unknown as DAPClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Debug Tool Wrappers', () => {
  beforeEach(() => {
    clearSession();
    setLastStopReason('entry');
  });

  // ===================================================================
  // DebugSetBreakpointTool
  // ===================================================================

  describe('DebugSetBreakpointTool', () => {
    it('has correct static name', () => {
      expect(DebugSetBreakpointTool.Name).toBe('debug_set_breakpoint');
    });

    it('sets breakpoints and returns summary', async () => {
      const mock = createMockDAPClient({
        setBreakpoints: vi.fn().mockResolvedValue([
          { id: 1, verified: true, line: 10 },
          { id: 2, verified: false, line: 20 },
        ]),
      });
      setSession(mock);

      const tool = new DebugSetBreakpointTool(messageBus);
      const result = await tool.buildAndExecute(
        {
          file: '/src/app.ts',
          breakpoints: [{ line: 10 }, { line: 20, condition: 'x > 5' }],
        },
        getSignal(),
      );

      expect(result.llmContent).toContain('/src/app.ts');
      expect(result.llmContent).toContain('✓');
      expect(result.llmContent).toContain('✗');
    });

    // Edge: no active session
    it('returns error when no session exists', async () => {
      const tool = new DebugSetBreakpointTool(messageBus);
      const result = await tool.buildAndExecute(
        { file: '/a.ts', breakpoints: [{ line: 1 }] },
        getSignal(),
      );
      expect(result.llmContent).toContain('Error');
      expect(result.llmContent).toContain('No active debug session');
    });

    // Edge: DAP client throws
    it('handles DAP error gracefully', async () => {
      const mock = createMockDAPClient({
        setBreakpoints: vi.fn().mockRejectedValue(new Error('DAP timeout')),
      });
      setSession(mock);

      const tool = new DebugSetBreakpointTool(messageBus);
      const result = await tool.buildAndExecute(
        { file: '/a.ts', breakpoints: [{ line: 1 }] },
        getSignal(),
      );
      expect(result.llmContent).toContain('Error');
      expect(result.llmContent).toContain('DAP timeout');
    });

    // Edge: empty breakpoints array
    it('handles empty breakpoints array', async () => {
      const mock = createMockDAPClient({
        setBreakpoints: vi.fn().mockResolvedValue([]),
      });
      setSession(mock);

      const tool = new DebugSetBreakpointTool(messageBus);
      const result = await tool.buildAndExecute(
        { file: '/a.ts', breakpoints: [] },
        getSignal(),
      );
      // Should succeed without crash
      expect(result.llmContent).toBeDefined();
    });
  });

  // ===================================================================
  // DebugGetStackTraceTool
  // ===================================================================

  describe('DebugGetStackTraceTool', () => {
    it('has correct static name', () => {
      expect(DebugGetStackTraceTool.Name).toBe('debug_get_stacktrace');
    });

    it('returns "no stack frames" when program not paused', async () => {
      const mock = createMockDAPClient({
        stackTrace: vi.fn().mockResolvedValue([]),
      });
      setSession(mock);

      const tool = new DebugGetStackTraceTool(messageBus);
      const result = await tool.buildAndExecute({}, getSignal());
      expect(result.llmContent).toContain('No stack frames');
    });

    // Edge: no session
    it('returns error when no session', async () => {
      const tool = new DebugGetStackTraceTool(messageBus);
      const result = await tool.buildAndExecute({}, getSignal());
      expect(result.llmContent).toContain('Error');
    });

    // Edge: scopes fail but stacktrace still returns
    it('handles scope retrieval failure gracefully', async () => {
      const mock = createMockDAPClient({
        stackTrace: vi
          .fn()
          .mockResolvedValue([
            {
              id: 1,
              name: 'main',
              line: 1,
              column: 0,
              source: { path: '/a.js' },
            },
          ]),
        scopes: vi.fn().mockRejectedValue(new Error('scope error')),
      });
      setSession(mock);

      const tool = new DebugGetStackTraceTool(messageBus);
      const result = await tool.buildAndExecute({}, getSignal());
      // Should not crash — scopes failure is non-fatal
      expect(result.llmContent).toBeDefined();
      expect(result.returnDisplay).toBeDefined();
    });

    // Edge: custom threadId and maxFrames
    it('passes custom threadId and maxFrames', async () => {
      const stackTraceFn = vi.fn().mockResolvedValue([]);
      const mock = createMockDAPClient({ stackTrace: stackTraceFn });
      setSession(mock);

      const tool = new DebugGetStackTraceTool(messageBus);
      await tool.buildAndExecute({ threadId: 5, maxFrames: 50 }, getSignal());
      expect(stackTraceFn).toHaveBeenCalledWith(5, 0, 50);
    });
  });

  // ===================================================================
  // DebugGetVariablesTool
  // ===================================================================

  describe('DebugGetVariablesTool', () => {
    it('has correct static name', () => {
      expect(DebugGetVariablesTool.Name).toBe('debug_get_variables');
    });

    // Edge: no session
    it('returns error when no session', async () => {
      const tool = new DebugGetVariablesTool(messageBus);
      const result = await tool.buildAndExecute({}, getSignal());
      expect(result.llmContent).toContain('Error');
    });

    it('expands variablesReference directly', async () => {
      const mock = createMockDAPClient({
        variables: vi
          .fn()
          .mockResolvedValue([{ name: 'x', value: '42', type: 'number' }]),
      });
      setSession(mock);

      const tool = new DebugGetVariablesTool(messageBus);
      const result = await tool.buildAndExecute(
        { variablesReference: 100 },
        getSignal(),
      );
      expect(result.llmContent).toContain('x');
      expect(result.llmContent).toContain('42');
    });

    // Edge: frame index out of range
    it('returns error for frame index out of range', async () => {
      const mock = createMockDAPClient({
        stackTrace: vi.fn().mockResolvedValue([]),
      });
      setSession(mock);

      const tool = new DebugGetVariablesTool(messageBus);
      const result = await tool.buildAndExecute(
        { frameIndex: 99 },
        getSignal(),
      );
      expect(result.llmContent).toContain('Error');
      expect(result.llmContent).toContain('out of range');
    });

    // Edge: no variables in any scope
    it('returns "no variables" when scopes are empty', async () => {
      const mock = createMockDAPClient({
        stackTrace: vi
          .fn()
          .mockResolvedValue([{ id: 1, name: 'fn', line: 1, column: 0 }]),
        scopes: vi
          .fn()
          .mockResolvedValue([{ name: 'Local', variablesReference: 10 }]),
        variables: vi.fn().mockResolvedValue([]),
      });
      setSession(mock);

      const tool = new DebugGetVariablesTool(messageBus);
      const result = await tool.buildAndExecute({ frameIndex: 0 }, getSignal());
      expect(result.llmContent).toContain('No variables');
    });

    // Edge: empty variablesReference returns no results
    it('handles variablesReference with no vars', async () => {
      const mock = createMockDAPClient({
        variables: vi.fn().mockResolvedValue([]),
      });
      setSession(mock);

      const tool = new DebugGetVariablesTool(messageBus);
      const result = await tool.buildAndExecute(
        { variablesReference: 1 },
        getSignal(),
      );
      expect(result.llmContent).toContain('No variables');
    });
  });

  // ===================================================================
  // DebugEvaluateTool
  // ===================================================================

  describe('DebugEvaluateTool', () => {
    it('has correct static name', () => {
      expect(DebugEvaluateTool.Name).toBe('debug_evaluate');
    });

    it('evaluates expression and returns result', async () => {
      const mock = createMockDAPClient({
        stackTrace: vi
          .fn()
          .mockResolvedValue([{ id: 42, name: 'fn', line: 1, column: 0 }]),
        evaluate: vi.fn().mockResolvedValue({
          result: '"hello"',
          type: 'string',
        }),
      });
      setSession(mock);

      const tool = new DebugEvaluateTool(messageBus);
      const result = await tool.buildAndExecute(
        { expression: '1 + 1' },
        getSignal(),
      );
      expect(result.llmContent).toContain('1 + 1');
      expect(result.llmContent).toContain('"hello"');
      expect(result.llmContent).toContain('string');
    });

    // Edge: no session
    it('returns error when no session', async () => {
      const tool = new DebugEvaluateTool(messageBus);
      const result = await tool.buildAndExecute(
        { expression: 'x' },
        getSignal(),
      );
      expect(result.llmContent).toContain('Error');
    });

    // Edge: evaluate throws (e.g., reference error in debuggee)
    it('handles evaluate exception', async () => {
      const mock = createMockDAPClient({
        stackTrace: vi
          .fn()
          .mockResolvedValue([{ id: 1, name: 'fn', line: 1, column: 0 }]),
        evaluate: vi
          .fn()
          .mockRejectedValue(new Error('ReferenceError: x is not defined')),
      });
      setSession(mock);

      const tool = new DebugEvaluateTool(messageBus);
      const result = await tool.buildAndExecute(
        { expression: 'x' },
        getSignal(),
      );
      expect(result.llmContent).toContain('Error');
      expect(result.llmContent).toContain('ReferenceError');
    });

    // Edge: evaluate with non-Error throw
    it('handles non-Error thrown value', async () => {
      const mock = createMockDAPClient({
        stackTrace: vi
          .fn()
          .mockResolvedValue([{ id: 1, name: 'fn', line: 1, column: 0 }]),
        evaluate: vi.fn().mockRejectedValue('string error'),
      });
      setSession(mock);

      const tool = new DebugEvaluateTool(messageBus);
      const result = await tool.buildAndExecute(
        { expression: 'fail()' },
        getSignal(),
      );
      expect(result.llmContent).toContain('Error');
      expect(result.llmContent).toContain('string error');
    });

    // Edge: evaluate with no type in response
    it('handles missing type in evaluate response', async () => {
      const mock = createMockDAPClient({
        stackTrace: vi
          .fn()
          .mockResolvedValue([{ id: 1, name: 'fn', line: 1, column: 0 }]),
        evaluate: vi.fn().mockResolvedValue({
          result: '42',
        }),
      });
      setSession(mock);

      const tool = new DebugEvaluateTool(messageBus);
      const result = await tool.buildAndExecute(
        { expression: '42' },
        getSignal(),
      );
      expect(result.llmContent).toContain('42');
      // No type parenthetical when type is undefined
      expect(result.llmContent).not.toContain('(undefined)');
    });
  });

  // ===================================================================
  // DebugDisconnectTool
  // ===================================================================

  describe('DebugDisconnectTool', () => {
    it('has correct static name', () => {
      expect(DebugDisconnectTool.Name).toBe('debug_disconnect');
    });

    it('disconnects and clears session', async () => {
      const mock = createMockDAPClient();
      setSession(mock);

      const tool = new DebugDisconnectTool(messageBus);
      const result = await tool.buildAndExecute(
        { terminateDebuggee: true },
        getSignal(),
      );

      expect(result.llmContent).toContain('session ended');
      expect(result.llmContent).toContain('terminated');
      expect(getActiveSession()).toBeNull();
    });

    it('defaults to terminate=true', async () => {
      const disconnectFn = vi.fn().mockResolvedValue(undefined);
      const mock = createMockDAPClient({ disconnect: disconnectFn });
      setSession(mock);

      const tool = new DebugDisconnectTool(messageBus);
      await tool.buildAndExecute({}, getSignal());
      expect(disconnectFn).toHaveBeenCalledWith(true);
    });

    // Edge: no session
    it('returns error when no session', async () => {
      const tool = new DebugDisconnectTool(messageBus);
      const result = await tool.buildAndExecute({}, getSignal());
      expect(result.llmContent).toContain('Error');
    });

    // Edge: disconnect throws but session is still cleared
    it('clears session even when disconnect throws', async () => {
      const mock = createMockDAPClient({
        disconnect: vi.fn().mockRejectedValue(new Error('connection lost')),
      });
      setSession(mock);

      const tool = new DebugDisconnectTool(messageBus);
      const result = await tool.buildAndExecute({}, getSignal());
      expect(result.llmContent).toContain('Error');
      expect(getActiveSession()).toBeNull();
    });

    // Edge: terminateDebuggee=false
    it('does not mention "terminated" when terminateDebuggee=false', async () => {
      const mock = createMockDAPClient();
      setSession(mock);

      const tool = new DebugDisconnectTool(messageBus);
      const result = await tool.buildAndExecute(
        { terminateDebuggee: false },
        getSignal(),
      );
      expect(result.llmContent).toContain('session ended');
      expect(result.llmContent).not.toContain('terminated');
    });
  });

  // ===================================================================
  // DebugSetFunctionBreakpointTool
  // ===================================================================

  describe('DebugSetFunctionBreakpointTool', () => {
    it('has correct static name', () => {
      expect(DebugSetFunctionBreakpointTool.Name).toBe(
        'debug_set_function_breakpoint',
      );
    });

    it('sets function breakpoints', async () => {
      const mock = createMockDAPClient({
        sendRequest: vi.fn().mockResolvedValue({
          breakpoints: [{ verified: true }, { verified: false }],
        }),
      });
      setSession(mock);

      const tool = new DebugSetFunctionBreakpointTool(messageBus);
      const result = await tool.buildAndExecute(
        {
          breakpoints: [
            { name: 'myFunc' },
            { name: 'handleError', condition: 'err != null' },
          ],
        },
        getSignal(),
      );
      expect(result.llmContent).toContain('myFunc');
      expect(result.llmContent).toContain('handleError');
      expect(result.llmContent).toContain('✓');
      expect(result.llmContent).toContain('✗');
    });

    // Edge: empty breakpoints response
    it('handles empty breakpoints response', async () => {
      const mock = createMockDAPClient({
        sendRequest: vi.fn().mockResolvedValue({ breakpoints: [] }),
      });
      setSession(mock);

      const tool = new DebugSetFunctionBreakpointTool(messageBus);
      const result = await tool.buildAndExecute(
        { breakpoints: [{ name: 'fn' }] },
        getSignal(),
      );
      expect(result.llmContent).toContain('No function breakpoints');
    });

    // Edge: response missing breakpoints key entirely
    it('handles missing breakpoints key in response', async () => {
      const mock = createMockDAPClient({
        sendRequest: vi.fn().mockResolvedValue({}),
      });
      setSession(mock);

      const tool = new DebugSetFunctionBreakpointTool(messageBus);
      const result = await tool.buildAndExecute(
        { breakpoints: [{ name: 'fn' }] },
        getSignal(),
      );
      expect(result.llmContent).toContain('No function breakpoints');
    });

    // Edge: no session
    it('returns error when no session', async () => {
      const tool = new DebugSetFunctionBreakpointTool(messageBus);
      const result = await tool.buildAndExecute(
        { breakpoints: [{ name: 'fn' }] },
        getSignal(),
      );
      expect(result.llmContent).toContain('Error');
    });

    // Edge: breakpoint with condition and hitCondition
    it('displays condition and hitCondition', async () => {
      const mock = createMockDAPClient({
        sendRequest: vi.fn().mockResolvedValue({
          breakpoints: [{ verified: true }],
        }),
      });
      setSession(mock);

      const tool = new DebugSetFunctionBreakpointTool(messageBus);
      const result = await tool.buildAndExecute(
        {
          breakpoints: [{ name: 'fn', condition: 'x > 0', hitCondition: '3' }],
        },
        getSignal(),
      );
      expect(result.llmContent).toContain('if: x > 0');
      expect(result.llmContent).toContain('hit: 3');
    });
  });

  // ===================================================================
  // Tool constructors (all tools instantiate without error)
  // ===================================================================

  describe('Tool instantiation', () => {
    it('all tools can be instantiated', () => {
      expect(() => new DebugSetBreakpointTool(messageBus)).not.toThrow();
      expect(() => new DebugGetStackTraceTool(messageBus)).not.toThrow();
      expect(() => new DebugGetVariablesTool(messageBus)).not.toThrow();
      expect(() => new DebugStepTool(messageBus)).not.toThrow();
      expect(() => new DebugEvaluateTool(messageBus)).not.toThrow();
      expect(() => new DebugDisconnectTool(messageBus)).not.toThrow();
      expect(() => new DebugAttachTool(messageBus)).not.toThrow();
      expect(
        () => new DebugSetFunctionBreakpointTool(messageBus),
      ).not.toThrow();
    });

    it('all tools have correct Kind', () => {
      // Read tools should be Kind.Read
      const stackTool = new DebugGetStackTraceTool(messageBus);
      const varsTool = new DebugGetVariablesTool(messageBus);
      expect(stackTool.kind).toBe('read');
      expect(varsTool.kind).toBe('read');

      // Edit tools should be Kind.Edit
      const launchTool = new DebugSetBreakpointTool(messageBus);
      const stepTool = new DebugStepTool(messageBus);
      const evalTool = new DebugEvaluateTool(messageBus);
      expect(launchTool.kind).toBe('edit');
      expect(stepTool.kind).toBe('edit');
      expect(evalTool.kind).toBe('edit');
    });
  });
});
