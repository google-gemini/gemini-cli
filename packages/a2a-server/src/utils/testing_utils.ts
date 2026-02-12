/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import type {
  Task as SDKTask,
  TaskStatusUpdateEvent,
  SendStreamingMessageSuccessResponse,
} from '@a2a-js/sdk';
import {
  ApprovalMode,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD,
  GeminiClient,
  HookSystem,
  PolicyDecision,
  tmpdir,
} from '@google/gemini-cli-core';
import { createMockMessageBus } from '@google/gemini-cli-core/src/test-utils/mock-message-bus.js';
import type { Config, Storage } from '@google/gemini-cli-core';
import { expect, vi } from 'vitest';

/**
 * Required methods that the mock config must implement.
 * When new methods are added to Config and used by tool execution,
 * add them here to ensure tests fail fast with clear errors.
 */
type RequiredConfigMethods = Pick<
  Config,
  | 'getToolRegistry'
  | 'getApprovalMode'
  | 'getIdeMode'
  | 'isInteractive'
  | 'getAllowedTools'
  | 'getWorkspaceContext'
  | 'getTargetDir'
  | 'getCheckpointingEnabled'
  | 'storage'
  | 'getTruncateToolOutputThreshold'
  | 'getFastModeTimeoutMs'
  | 'getActiveModel'
  | 'getDebugMode'
  | 'getContentGeneratorConfig'
  | 'getModel'
  | 'getUsageStatisticsEnabled'
  | 'setFallbackModelHandler'
  | 'initialize'
  | 'getProxy'
  | 'getHistory'
  | 'getEmbeddingModel'
  | 'getSessionId'
  | 'getUserTier'
  | 'getMessageBus'
  | 'getPolicyEngine'
  | 'getEnableExtensionReloading'
  | 'getEnableHooks'
  | 'getMcpClientManager'
  | 'getGitService'
  | 'getHookSystem'
  | 'getGeminiClient'
>;

export function createMockConfig(
  overrides: Partial<Config> = {},
): Partial<Config> {
  const tmpDir = tmpdir();
  // Type assertion validates that we implement RequiredConfigMethods
  // If a required method is missing, TypeScript will error here
  const mockConfig: RequiredConfigMethods & Record<string, unknown> = {
    getToolRegistry: vi.fn().mockReturnValue({
      getTool: vi.fn(),
      getAllToolNames: vi.fn().mockReturnValue([]),
      getAllTools: vi.fn().mockReturnValue([]),
      getToolsByServer: vi.fn().mockReturnValue([]),
    }),
    getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
    getIdeMode: vi.fn().mockReturnValue(false),
    isInteractive: () => true,
    getAllowedTools: vi.fn().mockReturnValue([]),
    getWorkspaceContext: vi.fn().mockReturnValue({
      isPathWithinWorkspace: () => true,
    }),
    getTargetDir: () => tmpDir,
    getCheckpointingEnabled: vi.fn().mockReturnValue(false),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    storage: {
      getProjectTempDir: () => tmpDir,
      getProjectTempCheckpointsDir: () => path.join(tmpDir, 'checkpoints'),
    } as Storage,
    getTruncateToolOutputThreshold: () =>
      DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD,
    getFastModeTimeoutMs: vi.fn().mockReturnValue(0),
    getActiveModel: vi.fn().mockReturnValue(DEFAULT_GEMINI_MODEL),
    getDebugMode: vi.fn().mockReturnValue(false),
    getContentGeneratorConfig: vi.fn().mockReturnValue({ model: 'gemini-pro' }),
    getModel: vi.fn().mockReturnValue('gemini-pro'),
    getUsageStatisticsEnabled: vi.fn().mockReturnValue(false),
    setFallbackModelHandler: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    getProxy: vi.fn().mockReturnValue(undefined),
    getHistory: vi.fn().mockReturnValue([]),
    getEmbeddingModel: vi.fn().mockReturnValue('text-embedding-004'),
    getSessionId: vi.fn().mockReturnValue('test-session-id'),
    getUserTier: vi.fn(),
    getMessageBus: vi.fn(),
    getPolicyEngine: vi.fn(),
    getEnableExtensionReloading: vi.fn().mockReturnValue(false),
    getEnableHooks: vi.fn().mockReturnValue(false),
    getMcpClientManager: vi.fn().mockReturnValue({
      getMcpServers: vi.fn().mockReturnValue({}),
    }),
    getGitService: vi.fn(),
    // These are initialized below after mockConfig is created
    getMessageBus: vi.fn(),
    getHookSystem: vi.fn(),
    getGeminiClient: vi.fn(),
    getPolicyEngine: vi.fn(),
    ...overrides,
  };

  // Initialize methods that depend on mockConfig reference
  mockConfig.getMessageBus = vi.fn().mockReturnValue(createMockMessageBus());
  mockConfig.getHookSystem = vi
    .fn()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    .mockReturnValue(new HookSystem(mockConfig as Config));

  mockConfig.getGeminiClient = vi
    .fn()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    .mockReturnValue(new GeminiClient(mockConfig as Config));

  mockConfig.getPolicyEngine = vi.fn().mockReturnValue({
    check: async () => {
      const mode = mockConfig.getApprovalMode();
      if (mode === ApprovalMode.YOLO) {
        return { decision: PolicyDecision.ALLOW };
      }
      return { decision: PolicyDecision.ASK_USER };
    },
  });

  return mockConfig;
}

export function createStreamMessageRequest(
  text: string,
  messageId: string,
  taskId?: string,
) {
  const request: {
    jsonrpc: string;
    id: string;
    method: string;
    params: {
      message: {
        kind: string;
        role: string;
        parts: [{ kind: string; text: string }];
        messageId: string;
      };
      metadata: {
        coderAgent: {
          kind: string;
          workspacePath: string;
        };
      };
      taskId?: string;
    };
  } = {
    jsonrpc: '2.0',
    id: '1',
    method: 'message/stream',
    params: {
      message: {
        kind: 'message',
        role: 'user',
        parts: [{ kind: 'text', text }],
        messageId,
      },
      metadata: {
        coderAgent: {
          kind: 'agent-settings',
          workspacePath: '/tmp',
        },
      },
    },
  };

  if (taskId) {
    request.params.taskId = taskId;
  }

  return request;
}

export function assertUniqueFinalEventIsLast(
  events: SendStreamingMessageSuccessResponse[],
) {
  // Final event is input-required & final
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const finalEvent = events[events.length - 1].result as TaskStatusUpdateEvent;
  expect(finalEvent.metadata?.['coderAgent']).toMatchObject({
    kind: 'state-change',
  });
  expect(finalEvent.status?.state).toBe('input-required');
  expect(finalEvent.final).toBe(true);

  // There is only one event with final and its the last
  expect(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    events.filter((e) => (e.result as TaskStatusUpdateEvent).final).length,
  ).toBe(1);
  expect(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    events.findIndex((e) => (e.result as TaskStatusUpdateEvent).final),
  ).toBe(events.length - 1);
}

export function assertTaskCreationAndWorkingStatus(
  events: SendStreamingMessageSuccessResponse[],
) {
  // Initial task creation event
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const taskEvent = events[0].result as SDKTask;
  expect(taskEvent.kind).toBe('task');
  expect(taskEvent.status.state).toBe('submitted');

  // Status update: working
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const workingEvent = events[1].result as TaskStatusUpdateEvent;
  expect(workingEvent.kind).toBe('status-update');
  expect(workingEvent.status.state).toBe('working');
}
