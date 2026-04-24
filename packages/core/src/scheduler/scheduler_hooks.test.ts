/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { Scheduler } from './scheduler.js';
import type { ErroredToolCall } from './types.js';
import { CoreToolCallStatus } from './types.js';
import type { Config, ToolRegistry, AgentLoopContext } from '../index.js';
import {
  ApprovalMode,
  DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD,
} from '../index.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { MockTool } from '../test-utils/mock-tool.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import { HookSystem } from '../hooks/hookSystem.js';
import { HookType, HookEventName } from '../hooks/types.js';

function createMockConfig(overrides: Partial<Config> = {}): Config {
  const defaultToolRegistry = {
    getTool: () => undefined,
    getToolByName: () => undefined,
    getFunctionDeclarations: () => [],
    tools: new Map(),
    discovery: {},
    registerTool: () => {},
    getToolByDisplayName: () => undefined,
    getTools: () => [],
    discoverTools: async () => {},
    getAllTools: () => [],
    getToolsByServer: () => [],
    getExperiments: () => {},
  } as unknown as ToolRegistry;

  const baseConfig = {
    getSessionId: () => 'test-session-id',
    getUsageStatisticsEnabled: () => true,
    getDebugMode: () => false,
    isInteractive: () => true,
    getApprovalMode: () => ApprovalMode.DEFAULT,
    setApprovalMode: () => {},
    getAllowedTools: () => [],
    getContentGeneratorConfig: () => ({
      model: 'test-model',
      authType: 'oauth-personal',
    }),
    getShellExecutionConfig: () => ({
      terminalWidth: 90,
      terminalHeight: 30,
      sanitizationConfig: {
        enableEnvironmentVariableRedaction: true,
        allowedEnvironmentVariables: [],
        blockedEnvironmentVariables: [],
      },
    }),
    storage: {
      getProjectTempDir: () => '/tmp',
    },
    getTruncateToolOutputThreshold: () =>
      DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD,
    getTruncateToolOutputLines: () => 1000,
    getToolRegistry: () => defaultToolRegistry,
    getWorkingDir: () => '/mock/dir',
    getActiveModel: () => DEFAULT_GEMINI_MODEL,
    getGeminiClient: () => null,
    getMessageBus: () => createMockMessageBus(),
    getEnableHooks: () => true,
    getExperiments: () => {},
    getTelemetryLogPromptsEnabled: () => false,
    getTelemetryTracesEnabled: () => false,
    getPolicyEngine: () =>
      ({
        check: async () => ({ decision: 'allow' }),
      }) as unknown as PolicyEngine,
    isContextManagementEnabled: () => false,
  } as unknown as Config;

  const mockConfig = Object.assign({}, baseConfig, overrides) as Config;

  (mockConfig as { config?: Config }).config = mockConfig;

  return mockConfig;
}

describe('Scheduler Hooks', () => {
  it('should stop execution if BeforeTool hook requests stop', async () => {
    const executeFn = vi.fn().mockResolvedValue({
      llmContent: 'Tool executed',
      returnDisplay: 'Tool executed',
    });
    const mockTool = new MockTool({ name: 'mockTool', execute: executeFn });

    const toolRegistry = {
      getTool: () => mockTool,
      getAllToolNames: () => ['mockTool'],
    } as unknown as ToolRegistry;

    const mockMessageBus = createMockMessageBus();

    const mockConfig = createMockConfig({
      getToolRegistry: () => toolRegistry,
      getMessageBus: () => mockMessageBus,
      getApprovalMode: () => ApprovalMode.YOLO,
    });

    const hookSystem = new HookSystem(mockConfig);

    (mockConfig as { getHookSystem?: () => HookSystem }).getHookSystem = () =>
      hookSystem;

    // Register a programmatic runtime hook
    hookSystem.registerHook(
      {
        type: HookType.Runtime,
        name: 'test-stop-hook',
        action: async () => ({
          continue: false,
          stopReason: 'Hook stopped execution',
        }),
      },
      HookEventName.BeforeTool,
    );

    const scheduler = new Scheduler({
      context: {
        config: mockConfig,
        messageBus: mockMessageBus,
        toolRegistry,
      } as unknown as AgentLoopContext,
      getPreferredEditor: () => 'vscode',
      schedulerId: 'test-scheduler',
    });

    const request = {
      callId: '1',
      name: 'mockTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-1',
    };

    const results = await scheduler.schedule(
      [request],
      new AbortController().signal,
    );

    expect(results.length).toBe(1);
    const result = results[0];
    expect(result.status).toBe(CoreToolCallStatus.Error);
    const erroredCall = result as ErroredToolCall;

    expect(erroredCall.response.error?.message).toContain(
      'Agent execution stopped by hook: Hook stopped execution',
    );
    expect(executeFn).not.toHaveBeenCalled();
  });

  it('should block tool execution if BeforeTool hook requests block', async () => {
    const executeFn = vi.fn();
    const mockTool = new MockTool({ name: 'mockTool', execute: executeFn });

    const toolRegistry = {
      getTool: () => mockTool,
      getAllToolNames: () => ['mockTool'],
    } as unknown as ToolRegistry;

    const mockMessageBus = createMockMessageBus();

    const mockConfig = createMockConfig({
      getToolRegistry: () => toolRegistry,
      getMessageBus: () => mockMessageBus,
      getApprovalMode: () => ApprovalMode.YOLO,
    });

    const hookSystem = new HookSystem(mockConfig);

    (mockConfig as { getHookSystem?: () => HookSystem }).getHookSystem = () =>
      hookSystem;

    hookSystem.registerHook(
      {
        type: HookType.Runtime,
        name: 'test-block-hook',
        action: async () => ({
          decision: 'block',
          reason: 'Hook blocked execution',
        }),
      },
      HookEventName.BeforeTool,
    );

    const scheduler = new Scheduler({
      context: {
        config: mockConfig,
        messageBus: mockMessageBus,
        toolRegistry,
      } as unknown as AgentLoopContext,
      getPreferredEditor: () => 'vscode',
      schedulerId: 'test-scheduler',
    });

    const request = {
      callId: '1',
      name: 'mockTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-1',
    };

    const results = await scheduler.schedule(
      [request],
      new AbortController().signal,
    );

    expect(results.length).toBe(1);
    const result = results[0];
    expect(result.status).toBe(CoreToolCallStatus.Error);
    const erroredCall = result as ErroredToolCall;

    expect(erroredCall.response.error?.message).toContain(
      'Tool execution blocked: Hook blocked execution',
    );
    expect(executeFn).not.toHaveBeenCalled();
  });

  it('should update tool input if BeforeTool hook provides modified input', async () => {
    const executeFn = vi.fn().mockResolvedValue({
      llmContent: 'Tool executed',
      returnDisplay: 'Tool executed',
    });
    const mockTool = new MockTool({ name: 'mockTool', execute: executeFn });

    const toolRegistry = {
      getTool: () => mockTool,
      getAllToolNames: () => ['mockTool'],
    } as unknown as ToolRegistry;

    const mockMessageBus = createMockMessageBus();

    const mockConfig = createMockConfig({
      getToolRegistry: () => toolRegistry,
      getMessageBus: () => mockMessageBus,
      getApprovalMode: () => ApprovalMode.YOLO,
    });

    const hookSystem = new HookSystem(mockConfig);

    (mockConfig as { getHookSystem?: () => HookSystem }).getHookSystem = () =>
      hookSystem;

    hookSystem.registerHook(
      {
        type: HookType.Runtime,
        name: 'test-modify-input-hook',
        action: async () => ({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'BeforeTool',
            tool_input: { newParam: 'modifiedValue' },
          },
        }),
      },
      HookEventName.BeforeTool,
    );

    const scheduler = new Scheduler({
      context: {
        config: mockConfig,
        messageBus: mockMessageBus,
        toolRegistry,
      } as unknown as AgentLoopContext,
      getPreferredEditor: () => 'vscode',
      schedulerId: 'test-scheduler',
    });

    const request = {
      callId: '1',
      name: 'mockTool',
      args: { originalParam: 'originalValue' },
      isClientInitiated: false,
      prompt_id: 'prompt-1',
    };

    const results = await scheduler.schedule(
      [request],
      new AbortController().signal,
    );

    expect(results.length).toBe(1);
    const result = results[0];
    expect(result.status).toBe(CoreToolCallStatus.Success);

    expect(executeFn).toHaveBeenCalledWith(
      { newParam: 'modifiedValue' },
      expect.anything(),
      undefined,
      expect.anything(),
    );

    expect(result.request.args).toEqual({
      newParam: 'modifiedValue',
    });
  });
});
