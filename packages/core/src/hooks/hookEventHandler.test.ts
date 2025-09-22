/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookEventHandler } from './hookEventHandler.js';
import type { Config, HookConfig } from '../config/config.js';
import type { Logger } from '@opentelemetry/api-logs';
import type { HookPlanner } from './hookPlanner.js';
import type { HookRunner } from './hookRunner.js';
import type { HookAggregator } from './hookAggregator.js';
import { HookEventName, HookType } from '../config/config.js';
import {
  NotificationType,
  SessionStartSource,
  type HookExecutionResult,
} from './types.js';

// Mock console methods
const mockConsole = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.stubGlobal('console', mockConsole);

describe('HookEventHandler', () => {
  let hookEventHandler: HookEventHandler;
  let mockConfig: Config;
  let mockLogger: Logger;
  let mockHookPlanner: HookPlanner;
  let mockHookRunner: HookRunner;
  let mockHookAggregator: HookAggregator;

  beforeEach(() => {
    vi.resetAllMocks();

    mockConfig = {
      getSessionId: vi.fn().mockReturnValue('test-session'),
      getWorkingDir: vi.fn().mockReturnValue('/test/project'),
    } as unknown as Config;

    mockLogger = {} as Logger;

    mockHookPlanner = {
      createExecutionPlan: vi.fn(),
    } as unknown as HookPlanner;

    mockHookRunner = {
      executeHooksParallel: vi.fn(),
      executeHooksSequential: vi.fn(),
    } as unknown as HookRunner;

    mockHookAggregator = {
      aggregateResults: vi.fn(),
    } as unknown as HookAggregator;

    hookEventHandler = new HookEventHandler(
      mockConfig,
      mockLogger,
      mockHookPlanner,
      mockHookRunner,
      mockHookAggregator,
    );
  });

  describe('fireBeforeToolEvent', () => {
    it('should fire BeforeTool event with correct input', async () => {
      const mockPlan = [
        {
          hookConfig: {
            type: HookType.Command,
            command: './test.sh',
          } as unknown as HookConfig,
          eventName: HookEventName.BeforeTool,
        },
      ];
      const mockResults: HookExecutionResult[] = [
        {
          success: true,
          duration: 100,
          hookConfig: {
            type: HookType.Command,
            command: './test.sh',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeTool,
        },
      ];
      const mockAggregated = {
        success: true,
        allOutputs: [],
        errors: [],
        totalDuration: 100,
      };

      vi.mocked(mockHookPlanner.createExecutionPlan).mockReturnValue({
        eventName: HookEventName.BeforeTool,
        hookConfigs: mockPlan.map((p) => p.hookConfig),
        sequential: false,
      });
      vi.mocked(mockHookRunner.executeHooksParallel).mockResolvedValue(
        mockResults,
      );
      vi.mocked(mockHookAggregator.aggregateResults).mockReturnValue(
        mockAggregated,
      );

      const result = await hookEventHandler.fireBeforeToolEvent('EditTool', {
        file: 'test.txt',
      });

      expect(mockHookPlanner.createExecutionPlan).toHaveBeenCalledWith(
        HookEventName.BeforeTool,
        { toolName: 'EditTool' },
      );

      expect(mockHookRunner.executeHooksParallel).toHaveBeenCalledWith(
        [mockPlan[0].hookConfig],
        HookEventName.BeforeTool,
        expect.objectContaining({
          session_id: 'test-session',
          cwd: '/test/project',
          hook_event_name: 'BeforeTool',
          tool_name: 'EditTool',
          tool_input: { file: 'test.txt' },
        }),
      );

      expect(result).toBe(mockAggregated);
    });

    it('should return empty result when no hooks to execute', async () => {
      vi.mocked(mockHookPlanner.createExecutionPlan).mockReturnValue(null);

      const result = await hookEventHandler.fireBeforeToolEvent('EditTool', {});

      expect(result.success).toBe(true);
      expect(result.allOutputs).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.totalDuration).toBe(0);
    });

    it('should handle execution errors gracefully', async () => {
      vi.mocked(mockHookPlanner.createExecutionPlan).mockImplementation(() => {
        throw new Error('Planning failed');
      });

      const result = await hookEventHandler.fireBeforeToolEvent('EditTool', {});

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Planning failed');
      expect(mockConsole.error).toHaveBeenCalled();
    });
  });

  describe('fireAfterToolEvent', () => {
    it('should fire AfterTool event with tool response', async () => {
      const mockPlan = [
        {
          hookConfig: {
            type: HookType.Command,
            command: './after.sh',
          } as unknown as HookConfig,
          eventName: HookEventName.AfterTool,
        },
      ];
      const mockResults: HookExecutionResult[] = [
        {
          success: true,
          duration: 100,
          hookConfig: {
            type: HookType.Command,
            command: './test.sh',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeTool,
        },
      ];
      const mockAggregated = {
        success: true,
        allOutputs: [],
        errors: [],
        totalDuration: 100,
      };

      vi.mocked(mockHookPlanner.createExecutionPlan).mockReturnValue({
        eventName: HookEventName.BeforeTool,
        hookConfigs: mockPlan.map((p) => p.hookConfig),
        sequential: false,
      });
      vi.mocked(mockHookRunner.executeHooksParallel).mockResolvedValue(
        mockResults,
      );
      vi.mocked(mockHookAggregator.aggregateResults).mockReturnValue(
        mockAggregated,
      );

      const toolInput = { file: 'test.txt' };
      const toolResponse = { success: true, content: 'File edited' };

      const result = await hookEventHandler.fireAfterToolEvent(
        'EditTool',
        toolInput,
        toolResponse,
      );

      expect(mockHookRunner.executeHooksParallel).toHaveBeenCalledWith(
        [mockPlan[0].hookConfig],
        HookEventName.AfterTool,
        expect.objectContaining({
          tool_name: 'EditTool',
          tool_input: toolInput,
          tool_response: toolResponse,
        }),
      );

      expect(result).toBe(mockAggregated);
    });
  });

  describe('fireBeforeAgentEvent', () => {
    it('should fire BeforeAgent event with prompt', async () => {
      const mockPlan = [
        {
          hookConfig: {
            type: HookType.Command,
            command: './before_agent.sh',
          } as unknown as HookConfig,
          eventName: HookEventName.BeforeAgent,
        },
      ];
      const mockResults: HookExecutionResult[] = [
        {
          success: true,
          duration: 100,
          hookConfig: {
            type: HookType.Command,
            command: './test.sh',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeTool,
        },
      ];
      const mockAggregated = {
        success: true,
        allOutputs: [],
        errors: [],
        totalDuration: 100,
      };

      vi.mocked(mockHookPlanner.createExecutionPlan).mockReturnValue({
        eventName: HookEventName.BeforeTool,
        hookConfigs: mockPlan.map((p) => p.hookConfig),
        sequential: false,
      });
      vi.mocked(mockHookRunner.executeHooksParallel).mockResolvedValue(
        mockResults,
      );
      vi.mocked(mockHookAggregator.aggregateResults).mockReturnValue(
        mockAggregated,
      );

      const prompt = 'Please help me with this task';

      const result = await hookEventHandler.fireBeforeAgentEvent(prompt);

      expect(mockHookRunner.executeHooksParallel).toHaveBeenCalledWith(
        [mockPlan[0].hookConfig],
        HookEventName.BeforeAgent,
        expect.objectContaining({
          prompt,
        }),
      );

      expect(result).toBe(mockAggregated);
    });
  });

  describe('fireNotificationEvent', () => {
    it('should fire Notification event', async () => {
      const mockPlan = [
        {
          hookConfig: {
            type: HookType.Plugin,
            package: 'notification-plugin',
            method: 'notification',
          } as unknown as HookConfig,
          eventName: HookEventName.Notification,
        },
      ];
      const mockResults: HookExecutionResult[] = [
        {
          success: true,
          duration: 50,
          hookConfig: {
            type: HookType.Plugin,
            package: 'notification-plugin',
            method: 'notification',
            timeout: 30000,
          },
          eventName: HookEventName.Notification,
        },
      ];
      const mockAggregated = {
        success: true,
        allOutputs: [],
        errors: [],
        totalDuration: 50,
      };

      vi.mocked(mockHookPlanner.createExecutionPlan).mockReturnValue({
        eventName: HookEventName.Notification,
        hookConfigs: mockPlan.map((p) => p.hookConfig),
        sequential: false,
      });
      vi.mocked(mockHookRunner.executeHooksParallel).mockResolvedValue(
        mockResults,
      );
      vi.mocked(mockHookAggregator.aggregateResults).mockReturnValue(
        mockAggregated,
      );

      const message = 'Tool execution requires permission';

      const result = await hookEventHandler.fireNotificationEvent(
        NotificationType.ToolPermission,
        message,
        { type: 'ToolPermission', title: 'Test Permission' },
      );

      expect(mockHookRunner.executeHooksParallel).toHaveBeenCalledWith(
        [mockPlan[0].hookConfig],
        HookEventName.Notification,
        expect.objectContaining({
          notification_type: 'ToolPermission',
          details: { type: 'ToolPermission', title: 'Test Permission' },
        }),
      );

      expect(result).toBe(mockAggregated);
    });
  });

  describe('fireSessionStartEvent', () => {
    it('should fire SessionStart event with source', async () => {
      const mockPlan = [
        {
          hookConfig: {
            type: HookType.Command,
            command: './session_start.sh',
          } as unknown as HookConfig,
          eventName: HookEventName.SessionStart,
        },
      ];
      const mockResults: HookExecutionResult[] = [
        {
          success: true,
          duration: 200,
          hookConfig: {
            type: HookType.Command,
            command: './session_start.sh',
            timeout: 30000,
          },
          eventName: HookEventName.SessionStart,
        },
      ];
      const mockAggregated = {
        success: true,
        allOutputs: [],
        errors: [],
        totalDuration: 200,
      };

      vi.mocked(mockHookPlanner.createExecutionPlan).mockReturnValue({
        eventName: HookEventName.SessionStart,
        hookConfigs: mockPlan.map((p) => p.hookConfig),
        sequential: false,
      });
      vi.mocked(mockHookRunner.executeHooksParallel).mockResolvedValue(
        mockResults,
      );
      vi.mocked(mockHookAggregator.aggregateResults).mockReturnValue(
        mockAggregated,
      );

      const result = await hookEventHandler.fireSessionStartEvent(
        SessionStartSource.Startup,
      );

      expect(mockHookPlanner.createExecutionPlan).toHaveBeenCalledWith(
        HookEventName.SessionStart,
        { trigger: 'startup' },
      );

      expect(mockHookRunner.executeHooksParallel).toHaveBeenCalledWith(
        [mockPlan[0].hookConfig],
        HookEventName.SessionStart,
        expect.objectContaining({
          source: 'startup',
        }),
      );

      expect(result).toBe(mockAggregated);
    });
  });

  describe('fireBeforeModelEvent', () => {
    it('should fire BeforeModel event with LLM request', async () => {
      const mockPlan = [
        {
          hookConfig: {
            type: HookType.Plugin,
            package: 'model-plugin',
            method: 'beforeModel',
          } as unknown as HookConfig,
          eventName: HookEventName.BeforeModel,
        },
      ];
      const mockResults: HookExecutionResult[] = [
        {
          success: true,
          duration: 150,
          hookConfig: {
            type: HookType.Plugin,
            package: 'model-plugin',
            method: 'beforeModel',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeModel,
        },
      ];
      const mockAggregated = {
        success: true,
        allOutputs: [],
        errors: [],
        totalDuration: 150,
      };

      vi.mocked(mockHookPlanner.createExecutionPlan).mockReturnValue({
        eventName: HookEventName.BeforeModel,
        hookConfigs: mockPlan.map((p) => p.hookConfig),
        sequential: false,
      });
      vi.mocked(mockHookRunner.executeHooksParallel).mockResolvedValue(
        mockResults,
      );
      vi.mocked(mockHookAggregator.aggregateResults).mockReturnValue(
        mockAggregated,
      );

      const llmRequest = {
        model: 'gemini-pro',
        config: { temperature: 0.7 },
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      const result = await hookEventHandler.fireBeforeModelEvent(llmRequest);

      expect(mockHookRunner.executeHooksParallel).toHaveBeenCalledWith(
        [mockPlan[0].hookConfig],
        HookEventName.BeforeModel,
        expect.objectContaining({
          llm_request: expect.objectContaining({
            model: 'gemini-pro',
            messages: expect.arrayContaining([
              expect.objectContaining({
                role: 'user',
                content: 'Hello',
              }),
            ]),
          }),
        }),
      );

      expect(result).toBe(mockAggregated);
    });
  });

  describe('createBaseInput', () => {
    it('should create base input with correct fields', async () => {
      const mockPlan = [
        {
          hookConfig: {
            type: HookType.Command,
            command: './test.sh',
          } as unknown as HookConfig,
          eventName: HookEventName.BeforeTool,
        },
      ];

      vi.mocked(mockHookPlanner.createExecutionPlan).mockReturnValue({
        eventName: HookEventName.BeforeTool,
        hookConfigs: mockPlan.map((p) => p.hookConfig),
        sequential: false,
      });
      vi.mocked(mockHookRunner.executeHooksParallel).mockResolvedValue([]);
      vi.mocked(mockHookAggregator.aggregateResults).mockReturnValue({
        success: true,
        allOutputs: [],
        errors: [],
        totalDuration: 0,
      });

      await hookEventHandler.fireBeforeToolEvent('TestTool', {});

      expect(mockHookRunner.executeHooksParallel).toHaveBeenCalledWith(
        expect.any(Array),
        HookEventName.BeforeTool,
        expect.objectContaining({
          session_id: 'test-session',
          transcript_path: '',
          cwd: '/test/project',
          hook_event_name: 'BeforeTool',
          timestamp: expect.any(String),
        }),
      );
    });
  });
});
