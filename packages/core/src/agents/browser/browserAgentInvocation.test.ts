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
  AgentTerminateMode,
} from '../types.js';
import { LocalAgentExecutor } from '../local-executor.js';
import { createBrowserAgentDefinition } from './browserAgentFactory.js';

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
        definition: {
          name: 'browser_agent',
          toolConfig: { tools: [] },
        } as unknown as LocalAgentExecutor['definition'],
        browserManager: {} as unknown as NonNullable<
          Awaited<ReturnType<typeof createBrowserAgentDefinition>>
        >['browserManager'],
      });

      vi.mocked(LocalAgentExecutor.create).mockResolvedValue(
        mockExecutor as unknown as LocalAgentExecutor,
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
      let activityCallback: (activity: SubagentActivityEvent) => void;

      vi.mocked(LocalAgentExecutor.create).mockImplementation(
        async (_def, _config, onActivity) => {
          activityCallback = onActivity;
          return {
            run: vi.fn().mockResolvedValue({
              terminate_reason: AgentTerminateMode.GOAL,
              result: 'Success',
            }),
          } as unknown as LocalAgentExecutor;
        },
      );

      vi.mocked(createBrowserAgentDefinition).mockResolvedValue({
        definition: {
          name: 'browser_agent',
        } as unknown as LocalAgentExecutor['definition'],
        browserManager: {} as unknown as NonNullable<
          Awaited<ReturnType<typeof createBrowserAgentDefinition>>
        >['browserManager'],
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      await invocation.execute(new AbortController().signal, updateOutput);

      // Trigger thoughts
      activityCallback({
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
