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
  AgentTerminateMode,
} from '../types.js';
import { LocalAgentExecutor } from '../local-executor.js';
import { createBrowserAgentDefinition } from './browserAgentFactory.js';
import type { z } from 'zod';

// Mock dependencies
vi.mock('../../utils/debugLogger.js', () => ({
  debugLogger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../local-executor.js', () => ({
  LocalAgentExecutor: {
    create: vi.fn(),
  },
}));

vi.mock('./browserAgentFactory.js', () => ({
  createBrowserAgentDefinition: vi.fn(),
  cleanupBrowserAgent: vi.fn(),
}));

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
    } as unknown as LocalAgentExecutor<z.ZodTypeAny>;

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

  describe('execute', () => {
    it('should emit SubagentProgress objects and return result', async () => {
      const updateOutput = vi.fn();
      const mockExecutor = {
        run: vi.fn().mockResolvedValue({
          terminate_reason: AgentTerminateMode.GOAL,
          result: 'Success',
        }),
      };

      vi.mocked(createBrowserAgentDefinition).mockResolvedValue({
        // @ts-expect-error - Partial mock for testing
        definition: {
          name: 'browser_agent',
          toolConfig: { tools: [] },
        },
        // @ts-expect-error - Partial mock for testing
        browserManager: {},
      });

      vi.mocked(LocalAgentExecutor.create).mockResolvedValue(
        // @ts-expect-error - Partial mock for testing
        mockExecutor,
      );

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const result = await invocation.execute(
        new AbortController().signal,
        updateOutput,
      );

      expect(result.llmContent).toBeDefined();
      expect(updateOutput).toHaveBeenCalled();

      // Verify that emitted objects are SubagentProgress
      const calls = updateOutput.mock.calls;
      expect(calls[0][0]).toMatchObject({
        isSubagentProgress: true,
        state: 'running',
      });

      const lastCall = calls[calls.length - 1][0];
      expect(lastCall).toMatchObject({
        isSubagentProgress: true,
        state: 'completed',
      });
    });

    it('should handle activity events and update progress', async () => {
      const updateOutput = vi.fn();
      let activityCallback:
        | ((activity: SubagentActivityEvent) => void)
        | undefined;

      vi.mocked(LocalAgentExecutor.create).mockImplementation(
        async (_def, _config, onActivity) => {
          activityCallback = onActivity;
          return {
            run: vi.fn().mockResolvedValue({
              terminate_reason: AgentTerminateMode.GOAL,
              result: 'Success',
            }),
            // @ts-expect-error - Partial mock for testing
          };
        },
      );

      vi.mocked(createBrowserAgentDefinition).mockResolvedValue({
        // @ts-expect-error - Partial mock for testing
        definition: {
          name: 'browser_agent',
        },
        // @ts-expect-error - Partial mock for testing
        browserManager: {},
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      await invocation.execute(new AbortController().signal, updateOutput);

      // Trigger thoughts
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'THOUGHT_CHUNK',
        data: { text: 'Thinking...' },
      });

      // Verify progress update with thought
      const lastProgress = updateOutput.mock.calls[
        updateOutput.mock.calls.length - 1
      ][0] as SubagentProgress;
      expect(lastProgress.recentActivity).toContainEqual(
        expect.objectContaining({
          type: 'thought',
          content: 'Thinking...',
          status: 'running',
        }),
      );
    });

    it('should sanitize sensitive data in tool arguments', async () => {
      const updateOutput = vi.fn();
      let activityCallback:
        | ((activity: SubagentActivityEvent) => void)
        | undefined;

      vi.mocked(LocalAgentExecutor.create).mockImplementation(
        async (_def, _config, onActivity) => {
          activityCallback = onActivity;
          return {
            run: vi.fn().mockResolvedValue({
              terminate_reason: AgentTerminateMode.GOAL,
              result: 'Success',
            }),
            // @ts-expect-error - Partial mock for testing
          };
        },
      );

      vi.mocked(createBrowserAgentDefinition).mockResolvedValue({
        definition: {
          name: 'browser_agent',
        } as unknown as LocalAgentExecutor<z.ZodTypeAny>,
        browserManager: {} as unknown as LocalAgentExecutor<z.ZodTypeAny>,
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      await invocation.execute(new AbortController().signal, updateOutput);

      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_START',
        data: {
          name: 'fill',
          args: {
            username: 'testuser',
            password: 'supersecretpassword',
            nested: {
              apiKey: 'my-api-key',
              publicData: 'hello',
            },
          },
        },
      });

      const lastProgress = updateOutput.mock.calls[
        updateOutput.mock.calls.length - 1
      ][0] as SubagentProgress;

      const toolCall = lastProgress.recentActivity.find(
        (item) => item.type === 'tool_call',
      );
      expect(toolCall).toBeDefined();

      const argsObj = JSON.parse(toolCall!.args!);
      expect(argsObj.username).toBe('testuser');
      expect(argsObj.password).toBe('[REDACTED]');
      expect(argsObj.nested.apiKey).toBe('[REDACTED]');
      expect(argsObj.nested.publicData).toBe('hello');
    });

    it('should correctly set error and cancelled status for tools', async () => {
      const updateOutput = vi.fn();
      let activityCallback:
        | ((activity: SubagentActivityEvent) => void)
        | undefined;

      vi.mocked(LocalAgentExecutor.create).mockImplementation(
        async (_def, _config, onActivity) => {
          activityCallback = onActivity;
          return {
            run: vi.fn().mockResolvedValue({
              terminate_reason: AgentTerminateMode.GOAL,
              result: 'Success',
            }),
          } as unknown as LocalAgentExecutor<z.ZodTypeAny>;
        },
      );

      vi.mocked(createBrowserAgentDefinition).mockResolvedValue({
        definition: {
          name: 'browser_agent',
        } as unknown as LocalAgentExecutor<z.ZodTypeAny>,
        browserManager: {} as unknown as LocalAgentExecutor<z.ZodTypeAny>,
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      await invocation.execute(new AbortController().signal, updateOutput);

      // Start tool 1
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_START',
        data: { name: 'tool1', args: {} },
      });

      // Error for tool 1
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'ERROR',
        data: { name: 'tool1', error: 'Some error' },
      });

      let lastProgress = updateOutput.mock.calls[
        updateOutput.mock.calls.length - 1
      ][0] as SubagentProgress;

      const toolCall1 = lastProgress.recentActivity.find(
        (item) => item.type === 'tool_call' && item.content === 'tool1',
      );
      expect(toolCall1?.status).toBe('error');

      // Start tool 2
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_START',
        data: { name: 'tool2', args: {} },
      });

      // Cancellation for tool 2
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'ERROR',
        data: { name: 'tool2', error: 'Request cancelled.' },
      });

      lastProgress = updateOutput.mock.calls[
        updateOutput.mock.calls.length - 1
      ][0] as SubagentProgress;

      const toolCall2 = lastProgress.recentActivity.find(
        (item) => item.type === 'tool_call' && item.content === 'tool2',
      );
      expect(toolCall2?.status).toBe('cancelled');
    });

    it('should redact sensitive keys and recursively sanitize string values in tool arguments', async () => {
      const updateOutput = vi.fn();
      let activityCallback:
        | ((activity: SubagentActivityEvent) => void)
        | undefined;

      vi.mocked(LocalAgentExecutor.create).mockImplementation(
        async (_def, _config, onActivity) => {
          activityCallback = onActivity;
          return {
            run: vi.fn().mockResolvedValue({
              terminate_reason: AgentTerminateMode.GOAL,
              result: 'Success',
            }),
          } as unknown as LocalAgentExecutor<z.ZodTypeAny>;
        },
      );

      vi.mocked(createBrowserAgentDefinition).mockResolvedValue({
        definition: {
          name: 'browser_agent',
        } as unknown as LocalAgentExecutor<z.ZodTypeAny>,
        browserManager: {} as unknown as LocalAgentExecutor<z.ZodTypeAny>,
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      await invocation.execute(new AbortController().signal, updateOutput);

      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_START',
        data: {
          name: 'configure',
          displayName: 'Configure api_key=superSecret',
          description: 'Setting up with token=jwt.token.abc',
          args: {
            api_key: 'sk-12345',
            'api-key': 'ak-67890',
            private_key: 'pk-abc',
            pwd: 'mypassword',
            hostname: 'example.com',
            nestedConfig: {
              regularUrl: 'https://api.com?apikey=secret_in_url&other=val',
            },
          },
        },
      });

      const lastProgress = updateOutput.mock.calls[
        updateOutput.mock.calls.length - 1
      ][0] as SubagentProgress;
      const toolCall = lastProgress.recentActivity.find(
        (item) => item.type === 'tool_call',
      );

      // Check display name and description
      expect(toolCall!.displayName).toContain('[REDACTED]');
      expect(toolCall!.displayName).not.toContain('superSecret');
      expect(toolCall!.description).toContain('[REDACTED]');
      expect(toolCall!.description).not.toContain('jwt.token.abc');

      const argsObj = JSON.parse(toolCall!.args!);

      // Check key-based redaction
      expect(argsObj.api_key).toBe('[REDACTED]');
      expect(argsObj['api-key']).toBe('[REDACTED]');
      expect(argsObj.private_key).toBe('[REDACTED]');
      expect(argsObj.pwd).toBe('[REDACTED]');
      expect(argsObj.hostname).toBe('example.com');

      // Check value-based redaction (string scanning)
      expect(argsObj.nestedConfig.regularUrl).toContain('[REDACTED]');
      expect(argsObj.nestedConfig.regularUrl).not.toContain('secret_in_url');
      // Note: Full query string is redacted because we no longer assume & is a delimiter
      // as part of strengthening redaction robustness for tokens that might contain &.
      expect(argsObj.nestedConfig.regularUrl).not.toContain('other=val');
    });

    it('should sanitize sensitive patterns in error messages', async () => {
      const updateOutput = vi.fn();
      let activityCallback:
        | ((activity: SubagentActivityEvent) => void)
        | undefined;

      vi.mocked(LocalAgentExecutor.create).mockImplementation(
        async (_def, _config, onActivity) => {
          activityCallback = onActivity;
          return {
            run: vi.fn().mockResolvedValue({
              terminate_reason: AgentTerminateMode.GOAL,
              result: 'Success',
            }),
          } as unknown as LocalAgentExecutor<z.ZodTypeAny>;
        },
      );

      vi.mocked(createBrowserAgentDefinition).mockResolvedValue({
        definition: {
          name: 'browser_agent',
        } as unknown as LocalAgentExecutor<z.ZodTypeAny>,
        browserManager: {} as unknown as LocalAgentExecutor<z.ZodTypeAny>,
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      await invocation.execute(new AbortController().signal, updateOutput);

      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'ERROR',
        data: { error: 'Failed with api_key=sk-12345 and token=abc123' },
      });

      const lastProgress = updateOutput.mock.calls[
        updateOutput.mock.calls.length - 1
      ][0] as SubagentProgress;
      const errorThought = lastProgress.recentActivity.find(
        (item) => item.type === 'thought' && item.status === 'error',
      );
      expect(errorThought).toBeDefined();
      expect(errorThought!.content).not.toContain('sk-12345');
      expect(errorThought!.content).not.toContain('abc123');
      expect(errorThought!.content).toContain('[REDACTED]');
    });

    it('should mark all running tools as error when no toolName in ERROR', async () => {
      const updateOutput = vi.fn();
      let activityCallback:
        | ((activity: SubagentActivityEvent) => void)
        | undefined;

      vi.mocked(LocalAgentExecutor.create).mockImplementation(
        async (_def, _config, onActivity) => {
          activityCallback = onActivity;
          return {
            run: vi.fn().mockResolvedValue({
              terminate_reason: AgentTerminateMode.GOAL,
              result: 'Success',
            }),
          } as unknown as LocalAgentExecutor<z.ZodTypeAny>;
        },
      );

      vi.mocked(createBrowserAgentDefinition).mockResolvedValue({
        definition: {
          name: 'browser_agent',
        } as unknown as LocalAgentExecutor<z.ZodTypeAny>,
        browserManager: {} as unknown as LocalAgentExecutor<z.ZodTypeAny>,
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      await invocation.execute(new AbortController().signal, updateOutput);

      // Start two tools
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_START',
        data: { name: 'toolA', args: {} },
      });
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_START',
        data: { name: 'toolB', args: {} },
      });

      // Global error (no toolName)
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'ERROR',
        data: { error: 'Connection lost' },
      });

      const lastProgress = updateOutput.mock.calls[
        updateOutput.mock.calls.length - 1
      ][0] as SubagentProgress;

      const toolA = lastProgress.recentActivity.find(
        (item) => item.type === 'tool_call' && item.content === 'toolA',
      );
      const toolB = lastProgress.recentActivity.find(
        (item) => item.type === 'tool_call' && item.content === 'toolB',
      );
      expect(toolA?.status).toBe('error');
      expect(toolB?.status).toBe('error');
    });

    it('should emit error state on failure', async () => {
      const updateOutput = vi.fn();
      vi.mocked(createBrowserAgentDefinition).mockRejectedValue(
        new Error('Launch failed'),
      );

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const result = await invocation.execute(
        new AbortController().signal,
        updateOutput,
      );

      expect(result.error).toBeDefined();
      const lastCall =
        updateOutput.mock.calls[updateOutput.mock.calls.length - 1][0];
      expect(lastCall.state).toBe('error');
    });

    it('should sanitize sensitive data in LLM thought content', async () => {
      const updateOutput = vi.fn();
      let activityCallback:
        | ((activity: SubagentActivityEvent) => void)
        | undefined;

      vi.mocked(LocalAgentExecutor.create).mockImplementation(
        async (_def, _config, onActivity) => {
          activityCallback = onActivity;
          return {
            run: vi.fn().mockResolvedValue({
              terminate_reason: AgentTerminateMode.GOAL,
              result: 'Success',
            }),
          } as unknown as LocalAgentExecutor<z.ZodTypeAny>;
        },
      );

      vi.mocked(createBrowserAgentDefinition).mockResolvedValue({
        definition: {
          name: 'browser_agent',
        } as unknown as LocalAgentExecutor<z.ZodTypeAny>,
        browserManager: {} as unknown as LocalAgentExecutor<z.ZodTypeAny>,
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      await invocation.execute(new AbortController().signal, updateOutput);

      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'THOUGHT_CHUNK',
        data: {
          text: 'Using token=eyJhbGciOi.payload.signature to authenticate',
        },
      });

      const lastProgress = updateOutput.mock.calls[
        updateOutput.mock.calls.length - 1
      ][0] as SubagentProgress;
      const thought = lastProgress.recentActivity.find(
        (item) => item.type === 'thought' && item.status === 'running',
      );
      expect(thought).toBeDefined();
      expect(thought!.content).not.toContain('eyJhbGciOi');
      expect(thought!.content).toContain('[REDACTED]');
    });

    it('should sanitize error messages in catch block', async () => {
      const updateOutput = vi.fn();
      vi.mocked(createBrowserAgentDefinition).mockRejectedValue(
        new Error(
          'Connection failed with api_key=sk-secret123 and token=jwt.token.here',
        ),
      );

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const result = await invocation.execute(
        new AbortController().signal,
        updateOutput,
      );

      expect(result.error).toBeDefined();
      const errorMsg = result.error!.message;
      expect(errorMsg).not.toContain('sk-secret123');
      expect(errorMsg).not.toContain('jwt.token.here');
      expect(errorMsg).toContain('[REDACTED]');
    });

    it('should handle concurrent tool calls correctly using callId', async () => {
      const updateOutput = vi.fn();
      let activityCallback:
        | ((activity: SubagentActivityEvent) => void)
        | undefined;

      vi.mocked(LocalAgentExecutor.create).mockImplementation(
        async (_def, _config, onActivity) => {
          activityCallback = onActivity;
          return {
            run: vi.fn().mockResolvedValue({
              terminate_reason: AgentTerminateMode.GOAL,
              result: 'Success',
            }),
          } as unknown as LocalAgentExecutor<z.ZodTypeAny>;
        },
      );

      vi.mocked(createBrowserAgentDefinition).mockResolvedValue({
        definition: {
          name: 'browser_agent',
        } as unknown as LocalAgentExecutor<z.ZodTypeAny>,
        browserManager: {} as unknown as LocalAgentExecutor<z.ZodTypeAny>,
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      await invocation.execute(new AbortController().signal, updateOutput);

      // Start tool instance 1
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_START',
        data: { name: 'readFile', args: { path: 'file1.txt' }, callId: 'id1' },
      });

      // Start tool instance 2 (same name, different callId)
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_START',
        data: { name: 'readFile', args: { path: 'file2.txt' }, callId: 'id2' },
      });

      // End tool instance 2 first
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_END',
        data: { name: 'readFile', id: 'id2' },
      });

      let lastProgress = updateOutput.mock.calls[
        updateOutput.mock.calls.length - 1
      ][0] as SubagentProgress;

      const item1 = lastProgress.recentActivity.find((i) => i.id === 'id1');
      const item2 = lastProgress.recentActivity.find((i) => i.id === 'id2');

      expect(item1?.status).toBe('running');
      expect(item2?.status).toBe('completed');

      // End tool instance 1
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_END',
        data: { name: 'readFile', id: 'id1' },
      });

      lastProgress = updateOutput.mock.calls[
        updateOutput.mock.calls.length - 1
      ][0] as SubagentProgress;

      const updatedItem1 = lastProgress.recentActivity.find(
        (i) => i.id === 'id1',
      );
      expect(updatedItem1?.status).toBe('completed');
    });

    it('should redact secrets with spaces in unquoted values', async () => {
      const updateOutput = vi.fn();
      let activityCallback:
        | ((activity: SubagentActivityEvent) => void)
        | undefined;

      vi.mocked(LocalAgentExecutor.create).mockImplementation(
        async (_def, _config, onActivity) => {
          activityCallback = onActivity;
          return {
            run: vi.fn().mockResolvedValue({
              terminate_reason: AgentTerminateMode.GOAL,
              result: 'Success',
            }),
          } as unknown as LocalAgentExecutor<z.ZodTypeAny>;
        },
      );

      vi.mocked(createBrowserAgentDefinition).mockResolvedValue({
        definition: {
          name: 'browser_agent',
        } as unknown as LocalAgentExecutor<z.ZodTypeAny>,
        browserManager: {} as unknown as LocalAgentExecutor<z.ZodTypeAny>,
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      await invocation.execute(new AbortController().signal, updateOutput);

      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'ERROR',
        data: {
          error: 'Failed with api_key=my secret value here and more text',
        },
      });

      const lastProgress = updateOutput.mock.calls[
        updateOutput.mock.calls.length - 1
      ][0] as SubagentProgress;
      const errorThought = lastProgress.recentActivity.find(
        (item) => item.type === 'thought' && item.status === 'error',
      );
      expect(errorThought!.content).toContain('api_key=[REDACTED]');
      expect(errorThought!.content).not.toContain('my secret value');
    });

    it('should handle URL-encoded sensitive keys in tool arguments', async () => {
      const updateOutput = vi.fn();
      let activityCallback:
        | ((activity: SubagentActivityEvent) => void)
        | undefined;

      vi.mocked(LocalAgentExecutor.create).mockImplementation(
        async (_def, _config, onActivity) => {
          activityCallback = onActivity;
          return {
            run: vi.fn().mockResolvedValue({
              terminate_reason: AgentTerminateMode.GOAL,
              result: 'Success',
            }),
          } as unknown as LocalAgentExecutor<z.ZodTypeAny>;
        },
      );

      vi.mocked(createBrowserAgentDefinition).mockResolvedValue({
        definition: {
          name: 'browser_agent',
        } as unknown as LocalAgentExecutor<z.ZodTypeAny>,
        browserManager: {} as unknown as LocalAgentExecutor<z.ZodTypeAny>,
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      await invocation.execute(new AbortController().signal, updateOutput);

      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'TOOL_CALL_START',
        data: {
          name: 'testTool',
          args: {
            'api%5fkey': 'secret-value',
            'auth%2dtoken': 'token-value',
          },
        },
      });

      const lastProgress = updateOutput.mock.calls[
        updateOutput.mock.calls.length - 1
      ][0] as SubagentProgress;
      const toolCall = lastProgress.recentActivity.find(
        (item) => item.type === 'tool_call',
      );
      const argsObj = JSON.parse(toolCall!.args!);
      expect(argsObj['api%5fkey']).toBe('[REDACTED]');
      expect(argsObj['auth%2dtoken']).toBe('[REDACTED]');
    });

    it('should redact JSON-style keys and space-separated values', async () => {
      const updateOutput = vi.fn();
      let activityCallback:
        | ((activity: SubagentActivityEvent) => void)
        | undefined;

      vi.mocked(LocalAgentExecutor.create).mockImplementation(
        async (_def, _config, onActivity) => {
          activityCallback = onActivity;
          return {
            run: vi.fn().mockResolvedValue({
              terminate_reason: AgentTerminateMode.GOAL,
              result: 'Success',
            }),
          } as unknown as LocalAgentExecutor<z.ZodTypeAny>;
        },
      );

      vi.mocked(createBrowserAgentDefinition).mockResolvedValue({
        definition: {
          name: 'browser_agent',
        } as unknown as LocalAgentExecutor<z.ZodTypeAny>,
        browserManager: {} as unknown as LocalAgentExecutor<z.ZodTypeAny>,
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      await invocation.execute(new AbortController().signal, updateOutput);

      // JSON-style keys
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'ERROR',
        data: {
          error: 'Error: {"api_key": "secret123", "other": "val"}',
        },
      });

      // Space-separated tokens
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'ERROR',
        data: {
          error:
            'Connection failed: token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      });

      // Bearer token
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'ERROR',
        data: {
          error: 'Unauthorized: Bearer sk_test_51Mz...',
        },
      });

      // Partial redaction with delimiters
      activityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'browser_agent',
        type: 'ERROR',
        data: {
          error: 'Failed with api_key=foo&bar;token=baz',
        },
      });

      const progressResults = updateOutput.mock.calls.map(
        (c) => c[0] as SubagentProgress,
      );

      const jsonError = progressResults.find((p) =>
        p.recentActivity.some((a) =>
          a.content.includes('"api_key": [REDACTED]'),
        ),
      );
      expect(jsonError).toBeDefined();
      expect(
        jsonError?.recentActivity.some((a) => a.content.includes('secret123')),
      ).toBe(false);

      const tokenError = progressResults.find((p) =>
        p.recentActivity.some((a) => a.content.includes('token [REDACTED]')),
      );
      expect(tokenError).toBeDefined();
      expect(
        tokenError?.recentActivity.some((a) =>
          a.content.includes('eyJhbGciOi'),
        ),
      ).toBe(false);

      const bearerError = progressResults.find((p) =>
        p.recentActivity.some((a) => a.content.includes('Bearer [REDACTED]')),
      );
      expect(bearerError).toBeDefined();
      expect(
        bearerError?.recentActivity.some((a) =>
          a.content.includes('sk_test_51Mz'),
        ),
      ).toBe(false);

      const delimiterError = progressResults.find((p) =>
        p.recentActivity.some((a) => a.content.includes('api_key=[REDACTED]')),
      );
      expect(delimiterError).toBeDefined();
      expect(
        delimiterError?.recentActivity.some((a) => a.content.includes('foo')),
      ).toBe(false);
      expect(
        delimiterError?.recentActivity.some((a) => a.content.includes('bar')),
      ).toBe(false);
      expect(
        delimiterError?.recentActivity.some((a) => a.content.includes('baz')),
      ).toBe(false);
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
});
