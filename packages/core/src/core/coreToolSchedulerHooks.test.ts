/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { CoreToolScheduler } from './coreToolScheduler.js';
import type { ToolCall, ErroredToolCall } from '../scheduler/types.js';
import type { Config, ToolRegistry, AgentLoopContext } from '../index.js';
import {
  ApprovalMode,
  DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD,
} from '../index.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { MockTool } from '../test-utils/mock-tool.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import type { HookSystem } from '../hooks/hookSystem.js';
import { BeforeToolHookOutput } from '../hooks/types.js';

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
    getActiveModel: () => DEFAULT_GEMINI_MODEL,
    getGeminiClient: () => null,
    getMessageBus: () => createMockMessageBus(),
    getEnableHooks: () => true, // Enabled for these tests
    getExperiments: () => {},
    getPolicyEngine: () =>
      ({
        check: async () => ({ decision: 'allow' }), // Default allow for hook tests
      }) as unknown as PolicyEngine,
  } as unknown as Config;

  // eslint-disable-next-line @typescript-eslint/no-misused-spread
  return { ...baseConfig, ...overrides } as Config;
}

describe('CoreToolScheduler Hooks', () => {
  it('should stop execution if BeforeTool hook requests stop', async () => {
    const executeFn = vi.fn().mockResolvedValue({
      llmContent: 'Tool executed',
      returnDisplay: 'Tool executed',
    });
    const mockTool = new MockTool({ name: 'mockTool', execute: executeFn });

    const toolRegistry = {
      getTool: () => mockTool,
      getToolByName: () => mockTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByDisplayName: () => mockTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const mockMessageBus = createMockMessageBus();
    const mockHookSystem = {
      fireBeforeToolEvent: vi.fn().mockResolvedValue({
        shouldStopExecution: () => true,
        getEffectiveReason: () => 'Hook stopped execution',
        getBlockingError: () => ({ blocked: false }),
        isAskDecision: () => false,
      }),
    } as unknown as HookSystem;

    const mockConfig = createMockConfig({
      getToolRegistry: () => toolRegistry,
      getMessageBus: () => mockMessageBus,
      getHookSystem: () => mockHookSystem,
      getApprovalMode: () => ApprovalMode.YOLO,
    });

    const onAllToolCallsComplete = vi.fn();
    const scheduler = new CoreToolScheduler({
      context: {
        config: mockConfig,
        messageBus: mockMessageBus,
        toolRegistry,
      } as unknown as AgentLoopContext,
      onAllToolCallsComplete,
      getPreferredEditor: () => 'vscode',
    });

    const request = {
      callId: '1',
      name: 'mockTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-1',
    };

    await scheduler.schedule([request], new AbortController().signal);

    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('error');
    const erroredCall = completedCalls[0] as ErroredToolCall;

    // Check error type/message
    expect(erroredCall.response.error?.message).toContain(
      'Hook stopped execution',
    );
    expect(executeFn).not.toHaveBeenCalled();
  });

  it('should block tool execution if BeforeTool hook requests block', async () => {
    const executeFn = vi.fn();
    const mockTool = new MockTool({ name: 'mockTool', execute: executeFn });

    const toolRegistry = {
      getTool: () => mockTool,
      getToolByName: () => mockTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByDisplayName: () => mockTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const mockMessageBus = createMockMessageBus();
    const mockHookSystem = {
      fireBeforeToolEvent: vi.fn().mockResolvedValue({
        shouldStopExecution: () => false,
        getBlockingError: () => ({
          blocked: true,
          reason: 'Hook blocked execution',
        }),
        isAskDecision: () => false,
      }),
    } as unknown as HookSystem;

    const mockConfig = createMockConfig({
      getToolRegistry: () => toolRegistry,
      getMessageBus: () => mockMessageBus,
      getHookSystem: () => mockHookSystem,
      getApprovalMode: () => ApprovalMode.YOLO,
    });

    const onAllToolCallsComplete = vi.fn();
    const scheduler = new CoreToolScheduler({
      context: {
        config: mockConfig,
        messageBus: mockMessageBus,
        toolRegistry,
      } as unknown as AgentLoopContext,
      onAllToolCallsComplete,
      getPreferredEditor: () => 'vscode',
    });

    const request = {
      callId: '1',
      name: 'mockTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-1',
    };

    await scheduler.schedule([request], new AbortController().signal);

    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('error');
    const erroredCall = completedCalls[0] as ErroredToolCall;
    expect(erroredCall.response.error?.message).toContain(
      'Hook blocked execution',
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
      getToolByName: () => mockTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByDisplayName: () => mockTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const mockMessageBus = createMockMessageBus();
    const mockBeforeOutput = new BeforeToolHookOutput({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'BeforeTool',
        tool_input: { newParam: 'modifiedValue' },
      },
    });

    const mockHookSystem = {
      fireBeforeToolEvent: vi.fn().mockResolvedValue(mockBeforeOutput),
      fireAfterToolEvent: vi.fn(),
    } as unknown as HookSystem;

    const mockConfig = createMockConfig({
      getToolRegistry: () => toolRegistry,
      getMessageBus: () => mockMessageBus,
      getHookSystem: () => mockHookSystem,
      getApprovalMode: () => ApprovalMode.YOLO,
    });

    const onAllToolCallsComplete = vi.fn();
    const scheduler = new CoreToolScheduler({
      context: {
        config: mockConfig,
        messageBus: mockMessageBus,
        toolRegistry,
      } as unknown as AgentLoopContext,
      onAllToolCallsComplete,
      getPreferredEditor: () => 'vscode',
    });

    const request = {
      callId: '1',
      name: 'mockTool',
      args: { originalParam: 'originalValue' },
      isClientInitiated: false,
      prompt_id: 'prompt-1',
    };

    await scheduler.schedule([request], new AbortController().signal);

    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('success');

    // Verify execute was called with modified args
    expect(executeFn).toHaveBeenCalledWith(
      { newParam: 'modifiedValue' },
      expect.anything(),
      undefined,
      expect.anything(),
    );

    // Verify call request args were updated in the completion report
    expect(completedCalls[0].request.args).toEqual({
      newParam: 'modifiedValue',
    });
  });
});
