/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserAgentInvocation } from './browserAgentInvocation.js';
import { makeFakeConfig } from '../../test-utils/config.js';
import type { Config } from '../../config/config.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import {
  type AgentInputs,
  type SubagentProgress,
  type SubagentActivityEvent,
} from '../types.js';

// Mock dependencies before imports
vi.mock('../../utils/debugLogger.js', () => ({
  debugLogger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./browserAgentFactory.js', () => ({
  createBrowserAgentDefinition: vi.fn(),
  cleanupBrowserAgent: vi.fn(),
}));

vi.mock('../local-executor.js', () => ({
  LocalAgentExecutor: {
    create: vi.fn(),
  },
}));

import {
  createBrowserAgentDefinition,
  cleanupBrowserAgent,
} from './browserAgentFactory.js';
import { LocalAgentExecutor } from '../local-executor.js';
import type { ToolLiveOutput } from '../../tools/tools.js';

describe('BrowserAgentInvocation', () => {
  let mockConfig: Config;
  let mockMessageBus: MessageBus;
  let mockParams: AgentInputs;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = makeFakeConfig({
      agents: {
        overrides: {
          browser_agent: {
            enabled: true,
          },
        },
        browser: {
          headless: false,
          sessionMode: 'isolated',
        },
      },
    });

    mockMessageBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;

    mockParams = {
      task: 'Navigate to example.com and click the button',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create invocation with params', () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      expect(invocation.params).toEqual(mockParams);
    });

    it('should use browser_agent as default tool name', () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      expect(invocation['_toolName']).toBe('browser_agent');
    });

    it('should use custom tool name if provided', () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
        'custom_name',
        'Custom Display Name',
      );

      expect(invocation['_toolName']).toBe('custom_name');
      expect(invocation['_toolDisplayName']).toBe('Custom Display Name');
    });
  });

  describe('getDescription', () => {
    it('should return description with input summary', () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const description = invocation.getDescription();

      expect(description).toContain('browser agent');
      expect(description).toContain('task');
    });

    it('should truncate long input values', () => {
      const longParams = {
        task: 'A'.repeat(100),
      };

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        longParams,
        mockMessageBus,
      );

      const description = invocation.getDescription();

      // Should be truncated to max length
      expect(description.length).toBeLessThanOrEqual(200);
    });
  });

  describe('toolLocations', () => {
    it('should return empty array by default', () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const locations = invocation.toolLocations();

      expect(locations).toEqual([]);
    });
  });

  describe('execute', () => {
    let mockExecutor: { run: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      vi.mocked(createBrowserAgentDefinition).mockResolvedValue({
        definition: {
          name: 'browser_agent',
          description: 'mock definition',
          kind: 'local',
          inputConfig: {} as never,
          outputConfig: {} as never,
          processOutput: () => '',
          modelConfig: { model: 'test' },
          runConfig: {},
          promptConfig: { query: '', systemPrompt: '' },
          toolConfig: { tools: ['analyze_screenshot', 'click'] },
        },
        browserManager: {} as never,
      });

      mockExecutor = {
        run: vi.fn().mockResolvedValue({
          result: JSON.stringify({ success: true }),
          terminate_reason: 'GOAL',
        }),
      };

      vi.mocked(LocalAgentExecutor.create).mockResolvedValue(
        mockExecutor as never,
      );
      vi.mocked(cleanupBrowserAgent).mockClear();
    });

    it('should return result text and call cleanup on success', async () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const controller = new AbortController();
      const updateOutput: (output: ToolLiveOutput) => void = vi.fn();

      const result = await invocation.execute(controller.signal, updateOutput);

      expect(Array.isArray(result.llmContent)).toBe(true);
      expect((result.llmContent as Array<{ text: string }>)[0].text).toContain(
        'Browser agent finished',
      );
      expect(cleanupBrowserAgent).toHaveBeenCalled();
    });

    it('should work without updateOutput (fire-and-forget)', async () => {
      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const controller = new AbortController();
      // Should not throw even with no updateOutput
      await expect(
        invocation.execute(controller.signal),
      ).resolves.toBeDefined();
    });

    it('should return error result when executor throws', async () => {
      mockExecutor.run.mockRejectedValue(new Error('Unexpected crash'));

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const controller = new AbortController();
      const result = await invocation.execute(controller.signal);

      expect(result.error).toBeDefined();
      expect(cleanupBrowserAgent).toHaveBeenCalled();
    });

    // ─── Structured SubagentProgress emission tests ───────────────────────

    /**
     * Helper: sets up LocalAgentExecutor.create to capture the onActivity
     * callback so tests can fire synthetic activity events.
     */
    function setupActivityCapture(): {
      capturedOnActivity: () => SubagentActivityEvent | undefined;
      fireActivity: (event: SubagentActivityEvent) => void;
    } {
      let onActivityFn: ((e: SubagentActivityEvent) => void) | undefined;

      vi.mocked(LocalAgentExecutor.create).mockImplementation(
        async (_def, _config, onActivity) => {
          onActivityFn = onActivity;
          return mockExecutor as never;
        },
      );

      return {
        capturedOnActivity: () => undefined,
        fireActivity: (event: SubagentActivityEvent) => {
          onActivityFn?.(event);
        },
      };
    }

    it('should emit initial SubagentProgress with running state', async () => {
      const updateOutput = vi.fn();

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      await invocation.execute(new AbortController().signal, updateOutput);

      const firstCall = updateOutput.mock.calls[0]?.[0] as SubagentProgress;
      expect(firstCall.isSubagentProgress).toBe(true);
      expect(firstCall.state).toBe('running');
      expect(firstCall.recentActivity).toEqual([]);
    });

    it('should emit completed SubagentProgress on success', async () => {
      const updateOutput = vi.fn();

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      await invocation.execute(new AbortController().signal, updateOutput);

      const lastCall = updateOutput.mock.calls[
        updateOutput.mock.calls.length - 1
      ]?.[0] as SubagentProgress;
      expect(lastCall.isSubagentProgress).toBe(true);
      expect(lastCall.state).toBe('completed');
    });

    it('should handle THOUGHT_CHUNK and emit structured progress', async () => {
      const { fireActivity } = setupActivityCapture();
      const updateOutput = vi.fn();

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const executePromise = invocation.execute(
        new AbortController().signal,
        updateOutput,
      );

      // Allow createBrowserAgentDefinition to resolve and onActivity to be registered
      await Promise.resolve();
      await Promise.resolve();

      fireActivity({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'THOUGHT_CHUNK',
        data: { text: 'Navigating to the page...' },
      });

      await executePromise;

      const progressCalls = updateOutput.mock.calls
        .map((c) => c[0] as SubagentProgress)
        .filter((p) => p.isSubagentProgress);

      const thoughtProgress = progressCalls.find((p) =>
        p.recentActivity.some(
          (a) =>
            a.type === 'thought' &&
            a.content.includes('Navigating to the page...'),
        ),
      );
      expect(thoughtProgress).toBeDefined();
    });

    it('should handle TOOL_CALL_START and TOOL_CALL_END with callId tracking', async () => {
      const { fireActivity } = setupActivityCapture();
      const updateOutput = vi.fn();

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const executePromise = invocation.execute(
        new AbortController().signal,
        updateOutput,
      );

      await Promise.resolve();
      await Promise.resolve();

      fireActivity({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_START',
        data: {
          name: 'navigate_browser',
          callId: 'call-1',
          args: { url: 'https://example.com' },
        },
      });

      fireActivity({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_END',
        data: { name: 'navigate_browser', id: 'call-1' },
      });

      await executePromise;

      const progressCalls = updateOutput.mock.calls
        .map((c) => c[0] as SubagentProgress)
        .filter((p) => p.isSubagentProgress);

      // After TOOL_CALL_END, the tool should be completed
      const finalProgress = progressCalls[progressCalls.length - 1];
      const toolItem = finalProgress?.recentActivity.find(
        (a) => a.type === 'tool_call' && a.content === 'navigate_browser',
      );
      expect(toolItem).toBeDefined();
      expect(toolItem?.status).toBe('completed');
    });

    it('should sanitize sensitive data in tool call args', async () => {
      const { fireActivity } = setupActivityCapture();
      const updateOutput = vi.fn();

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const executePromise = invocation.execute(
        new AbortController().signal,
        updateOutput,
      );

      await Promise.resolve();
      await Promise.resolve();

      fireActivity({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_START',
        data: {
          name: 'fill_form',
          callId: 'call-2',
          args: { password: 'supersecret123', url: 'https://example.com' },
        },
      });

      await executePromise;

      const progressCalls = updateOutput.mock.calls
        .map((c) => c[0] as SubagentProgress)
        .filter((p) => p.isSubagentProgress);

      const toolItem = progressCalls
        .flatMap((p) => p.recentActivity)
        .find((a) => a.type === 'tool_call' && a.content === 'fill_form');

      expect(toolItem).toBeDefined();
      expect(toolItem?.args).not.toContain('supersecret123');
      expect(toolItem?.args).toContain('[REDACTED]');
    });

    it('should handle ERROR event with callId and mark tool as errored', async () => {
      const { fireActivity } = setupActivityCapture();
      const updateOutput = vi.fn();

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const executePromise = invocation.execute(
        new AbortController().signal,
        updateOutput,
      );

      await Promise.resolve();
      await Promise.resolve();

      fireActivity({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_START',
        data: { name: 'click_element', callId: 'call-3', args: {} },
      });

      fireActivity({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'ERROR',
        data: { error: 'Element not found', callId: 'call-3' },
      });

      await executePromise;

      const progressCalls = updateOutput.mock.calls
        .map((c) => c[0] as SubagentProgress)
        .filter((p) => p.isSubagentProgress);

      const allItems = progressCalls.flatMap((p) => p.recentActivity);
      const toolItem = allItems.find(
        (a) => a.type === 'tool_call' && a.content === 'click_element',
      );
      expect(toolItem?.status).toBe('error');
    });

    it('should sanitize sensitive data in ERROR event messages', async () => {
      const { fireActivity } = setupActivityCapture();
      const updateOutput = vi.fn();

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const executePromise = invocation.execute(
        new AbortController().signal,
        updateOutput,
      );

      await Promise.resolve();
      await Promise.resolve();

      fireActivity({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'ERROR',
        data: { error: 'Auth failed: api_key=sk-secret-abc1234567890' },
      });

      await executePromise;

      const progressCalls = updateOutput.mock.calls
        .map((c) => c[0] as SubagentProgress)
        .filter((p) => p.isSubagentProgress);

      const errorItem = progressCalls
        .flatMap((p) => p.recentActivity)
        .find((a) => a.type === 'thought' && a.status === 'error');

      expect(errorItem).toBeDefined();
      expect(errorItem?.content).not.toContain('sk-secret-abc1234567890');
      expect(errorItem?.content).toContain('[REDACTED]');
    });

    it('should sanitize inline PEM content in error messages', async () => {
      const { fireActivity } = setupActivityCapture();
      const updateOutput = vi.fn();

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const executePromise = invocation.execute(
        new AbortController().signal,
        updateOutput,
      );

      await Promise.resolve();
      await Promise.resolve();

      fireActivity({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'ERROR',
        data: {
          error:
            'Failed to authenticate:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA12345...\n-----END RSA PRIVATE KEY-----\nPlease check credentials.',
        },
      });

      await executePromise;

      const progressCalls = updateOutput.mock.calls
        .map((c) => c[0] as SubagentProgress)
        .filter((p) => p.isSubagentProgress);

      const errorItem = progressCalls
        .flatMap((p) => p.recentActivity)
        .find((a) => a.type === 'thought' && a.status === 'error');

      expect(errorItem).toBeDefined();
      expect(errorItem?.content).toContain('[REDACTED_PEM]');
      expect(errorItem?.content).not.toContain('-----BEGIN');
    });

    it('should mark all running tools as errored when ERROR has no callId', async () => {
      const { fireActivity } = setupActivityCapture();
      const updateOutput = vi.fn();

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const executePromise = invocation.execute(
        new AbortController().signal,
        updateOutput,
      );

      await Promise.resolve();
      await Promise.resolve();

      fireActivity({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_START',
        data: { name: 'tool_a', callId: 'c1', args: {} },
      });

      fireActivity({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_START',
        data: { name: 'tool_b', callId: 'c2', args: {} },
      });

      // ERROR with no callId should mark ALL running tools as error
      fireActivity({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'ERROR',
        data: { error: 'Agent crashed' },
      });

      await executePromise;

      const progressCalls = updateOutput.mock.calls
        .map((c) => c[0] as SubagentProgress)
        .filter((p) => p.isSubagentProgress);

      const allItems = progressCalls.flatMap((p) => p.recentActivity);
      const toolA = allItems.find(
        (a) => a.type === 'tool_call' && a.content === 'tool_a',
      );
      const toolB = allItems.find(
        (a) => a.type === 'tool_call' && a.content === 'tool_b',
      );

      // Both should be error since no callId was specified
      expect(toolA?.status).toBe('error');
      expect(toolB?.status).toBe('error');
    });
  });
});
