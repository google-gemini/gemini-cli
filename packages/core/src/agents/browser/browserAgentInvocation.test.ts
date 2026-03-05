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
import type { AgentInputs } from '../types.js';

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

vi.mock('../../telemetry/metrics.js', () => ({
  recordBrowserAgentTaskMetrics: vi.fn(),
}));

import {
  createBrowserAgentDefinition,
  cleanupBrowserAgent,
} from './browserAgentFactory.js';
import { LocalAgentExecutor } from '../local-executor.js';
import { recordBrowserAgentTaskMetrics } from '../../telemetry/metrics.js';
import { AgentTerminateMode } from '../types.js';
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
        browserManager: {} as never, // Mock browserManager
      });

      mockExecutor = {
        run: vi.fn().mockResolvedValue({
          result: JSON.stringify({ success: true }),
          terminate_reason: AgentTerminateMode.GOAL,
        }),
      };

      vi.mocked(LocalAgentExecutor.create).mockResolvedValue(
        mockExecutor as never,
      );
      vi.mocked(recordBrowserAgentTaskMetrics).mockClear();
      vi.mocked(cleanupBrowserAgent).mockClear();
    });

    it('should record successful task metrics and call cleanup', async () => {
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

      expect(recordBrowserAgentTaskMetrics).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          success: true,
          sessionMode: 'isolated',
          visionEnabled: true,
          headless: false,
          durationMs: expect.any(Number),
        }),
      );

      expect(cleanupBrowserAgent).toHaveBeenCalledWith(
        expect.anything(),
        mockConfig,
        'isolated',
      );
    });

    it('should record failed task metrics if success flag is false', async () => {
      mockExecutor.run.mockResolvedValue({
        result: JSON.stringify({ success: false, error: 'Failed' }),
        terminate_reason: AgentTerminateMode.GOAL,
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const controller = new AbortController();
      await invocation.execute(controller.signal);

      expect(recordBrowserAgentTaskMetrics).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          success: false,
        }),
      );
    });

    it('should determine success from terminate_reason if result is not JSON', async () => {
      mockExecutor.run.mockResolvedValue({
        result: 'Crash',
        terminate_reason: AgentTerminateMode.ERROR,
      });

      const invocation = new BrowserAgentInvocation(
        mockConfig,
        mockParams,
        mockMessageBus,
      );

      const controller = new AbortController();
      await invocation.execute(controller.signal);

      expect(recordBrowserAgentTaskMetrics).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          success: false,
        }),
      );
    });
  });
});
