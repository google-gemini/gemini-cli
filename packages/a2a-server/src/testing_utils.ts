/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Task as SDKTask,
  TaskStatusUpdateEvent,
  SendStreamingMessageSuccessResponse,
} from '@a2a-js/sdk';
import { ApprovalMode } from '@google/gemini-cli-core';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from '@google/gemini-cli-core';
import type {
  Config,
  ToolCallConfirmationDetails,
  ToolResult,
  ToolInvocation,
} from '@google/gemini-cli-core';
import { expect, vi } from 'vitest';

export function createMockConfig(
  overrides: Partial<Config> = {},
): Partial<Config> {
  const mockConfig = {
    getToolRegistry: vi.fn().mockReturnValue({
      getTool: vi.fn(),
      getAllToolNames: vi.fn().mockReturnValue([]),
    }),
    getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
    getIdeMode: vi.fn().mockReturnValue(false),
    getAllowedTools: vi.fn().mockReturnValue([]),
    getIdeClient: vi.fn(),
    getWorkspaceContext: vi.fn().mockReturnValue({
      isPathWithinWorkspace: () => true,
    }),
    getTargetDir: () => '/test',
    getGeminiClient: vi.fn(),
    getDebugMode: vi.fn().mockReturnValue(false),
    getContentGeneratorConfig: vi.fn().mockReturnValue({ model: 'gemini-pro' }),
    getModel: vi.fn().mockReturnValue('gemini-pro'),
    getUsageStatisticsEnabled: vi.fn().mockReturnValue(false),
    setFlashFallbackHandler: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    getProxy: vi.fn().mockReturnValue(undefined),
    getHistory: vi.fn().mockReturnValue([]),
    getEmbeddingModel: vi.fn().mockReturnValue('text-embedding-004'),
    getSessionId: vi.fn().mockReturnValue('test-session-id'),
    ...overrides,
  };
  return mockConfig;
}

export const mockOnUserConfirmForToolConfirmation = vi.fn();

export class MockToolInvocation extends BaseToolInvocation<object, ToolResult> {
  constructor(
    private readonly tool: MockTool,
    params: object,
  ) {
    super(params);
  }

  getDescription(): string {
    return JSON.stringify(this.params);
  }

  override shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return this.tool.shouldConfirmExecute(this.params, abortSignal);
  }

  execute(
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
    terminalColumns?: number,
    terminalRows?: number,
  ): Promise<ToolResult> {
    return this.tool.execute(
      this.params,
      signal,
      updateOutput,
      terminalColumns,
      terminalRows,
    );
  }
}

// TODO: dedup with gemini-cli, add shouldConfirmExecute() support in core
export class MockTool extends BaseDeclarativeTool<object, ToolResult> {
  constructor(
    name: string,
    displayName: string,
    canUpdateOutput = false,
    isOutputMarkdown = false,
    shouldConfirmExecute?: () => Promise<ToolCallConfirmationDetails | false>,
  ) {
    super(
      name,
      displayName,
      'A mock tool for testing',
      Kind.Other,
      {},
      isOutputMarkdown,
      canUpdateOutput,
    );

    if (shouldConfirmExecute) {
      this.shouldConfirmExecute.mockImplementation(shouldConfirmExecute);
    } else {
      // Default to no confirmation needed
      this.shouldConfirmExecute.mockResolvedValue(false);
    }
  }

  execute = vi.fn();
  shouldConfirmExecute = vi.fn();

  protected createInvocation(
    params: object,
  ): ToolInvocation<object, ToolResult> {
    return new MockToolInvocation(this, params);
  }
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
  const finalEvent = events[events.length - 1].result as TaskStatusUpdateEvent;
  expect(finalEvent.metadata?.['coderAgent']).toMatchObject({
    kind: 'state-change',
  });
  expect(finalEvent.status?.state).toBe('input-required');
  expect(finalEvent.final).toBe(true);

  // There is only one event with final and its the last
  expect(
    events.filter((e) => (e.result as TaskStatusUpdateEvent).final).length,
  ).toBe(1);
  expect(
    events.findIndex((e) => (e.result as TaskStatusUpdateEvent).final),
  ).toBe(events.length - 1);
}

export function assertTaskCreationAndWorkingStatus(
  events: SendStreamingMessageSuccessResponse[],
) {
  // Initial task creation event
  const taskEvent = events[0].result as SDKTask;
  expect(taskEvent.kind).toBe('task');
  expect(taskEvent.status.state).toBe('submitted');

  // Status update: working
  const workingEvent = events[1].result as TaskStatusUpdateEvent;
  expect(workingEvent.kind).toBe('status-update');
  expect(workingEvent.status.state).toBe('working');
}
