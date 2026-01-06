/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { CoreToolScheduler } from './coreToolScheduler.js';
import { ApprovalMode } from '../index.js';
import type { Config, ToolRegistry, ToolCall } from '../index.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import {
  MockTool,
  MOCK_TOOL_SHOULD_CONFIRM_EXECUTE,
} from '../test-utils/mock-tool.js';
import { BeforeToolHookOutput } from '../hooks/types.js';

// Mock coreToolHookTriggers
vi.mock('./coreToolHookTriggers.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./coreToolHookTriggers.js')>();
  return {
    ...actual,
    fireBeforeToolHook: vi.fn(),
    fireToolNotificationHook: vi.fn(),
    fireAfterToolHook: vi.fn(),
  };
});

import { fireBeforeToolHook } from './coreToolHookTriggers.js';
import type { ErroredToolCall } from '../scheduler/types.js';

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
    getTruncateToolOutputThreshold: () => 1000,
    getTruncateToolOutputLines: () => 100,
    getToolRegistry: () => defaultToolRegistry,
    getActiveModel: () => 'gemini-pro',
    getUseSmartEdit: () => false,
    getGeminiClient: () => null,
    getMessageBus: () => createMockMessageBus(),
    getEnableHooks: () => true,
    getPolicyEngine: () => null,
    getExperiments: () => {},
  } as unknown as Config;

  return { ...baseConfig, ...overrides } as Config;
}

describe('CoreToolScheduler Hooks', () => {
  let mockTool: MockTool;
  let mockToolRegistry: ToolRegistry;
  let onAllToolCallsComplete: Mock;
  let onToolCallsUpdate: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTool = new MockTool({
      name: 'mockTool',
      shouldConfirmExecute: MOCK_TOOL_SHOULD_CONFIRM_EXECUTE,
      execute: vi.fn().mockResolvedValue({
        llmContent: 'Tool executed',
        returnDisplay: 'Tool executed',
      }),
    });

    mockToolRegistry = {
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

    onAllToolCallsComplete = vi.fn();
    onToolCallsUpdate = vi.fn();
  });

  it('should force confirmation when BeforeTool hook returns decision: ask', async () => {
    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
      getApprovalMode: () => ApprovalMode.YOLO, // YOLO normally skips confirmation
      getEnableHooks: () => true,
    });

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    // Mock hook to return decision: ask
    vi.mocked(fireBeforeToolHook).mockResolvedValue(
      new BeforeToolHookOutput({
        decision: 'ask',
        systemMessage: 'Security policy requires manual confirmation',
      }),
    );

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockTool',
      args: { param: 'value' },
      isClientInitiated: false,
      prompt_id: 'prompt-1',
    };

    // Start scheduling
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    scheduler.schedule([request], abortController.signal);

    // Wait for update
    await vi.waitFor(() => {
      expect(onToolCallsUpdate).toHaveBeenCalled();
      const lastCall = onToolCallsUpdate.mock.calls.at(-1);
      const calls = lastCall ? (lastCall[0] as ToolCall[]) : undefined; // Add check for undefined
      const call = calls?.find((c) => c.request.callId === '1'); // Use optional chaining
      expect(call).toBeDefined();
      if (call) {
        // Should be awaiting approval despite YOLO mode
        expect(call.status).toBe('awaiting_approval');
        if (call.status === 'awaiting_approval') {
          expect(call.confirmationDetails?.systemMessage).toBe(
            // Use optional chaining
            'Security policy requires manual confirmation',
          );
        }
      }
    });
  });

  it('should apply modified tool input from BeforeTool hook', async () => {
    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
      getApprovalMode: () => ApprovalMode.YOLO,
      getEnableHooks: () => true,
    });

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    // Mock hook to return modified input
    vi.mocked(fireBeforeToolHook).mockResolvedValue(
      new BeforeToolHookOutput({
        hookSpecificOutput: {
          hookEventName: 'BeforeTool',
          tool_input: { param: 'modified_value' },
        },
      }),
    );

    const abortController = new AbortController();
    const request = {
      callId: '2',
      name: 'mockTool',
      args: { param: 'original_value' },
      isClientInitiated: false,
      prompt_id: 'prompt-2',
    };

    await scheduler.schedule([request], abortController.signal);

    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    // Verify tool executed with modified param
    expect(mockTool.execute).toHaveBeenCalledWith({ param: 'modified_value' });
  });

  it('should stop execution if BeforeTool hook stops execution', async () => {
    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
      getEnableHooks: () => true,
    });

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    vi.mocked(fireBeforeToolHook).mockResolvedValue(
      new BeforeToolHookOutput({
        continue: false,
        stopReason: 'Policy violation',
      }),
    );

    const abortController = new AbortController();
    const request = {
      callId: '3',
      name: 'mockTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-3',
    };

    await scheduler.schedule([request], abortController.signal);

    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('error');
    const erroredCall = completedCalls[0] as ErroredToolCall;
    const errorMsg =
      erroredCall.response?.responseParts?.[0]?.functionResponse?.response?.[
        'error'
      ]; // Use optional chaining and bracket notation for 'error'
    expect(errorMsg).toContain(
      'Agent execution stopped by hook: Policy violation',
    );
  });
});
