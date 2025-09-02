/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { ToolCall, WaitingToolCall } from './coreToolScheduler.js';
import { CoreToolScheduler } from './coreToolScheduler.js';
import type {
  ToolCallConfirmationDetails,
  ToolInvocation,
  ToolResult,
  Config,
  ToolRegistry,
} from '../index.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  ToolConfirmationOutcome,
  Kind,
  ApprovalMode,
} from '../index.js';

class TestApprovalTool extends BaseDeclarativeTool<{ id: string }, ToolResult> {
  static readonly Name = 'testApprovalTool';

  constructor(private config: Config) {
    super(
      TestApprovalTool.Name,
      'TestApprovalTool',
      'A tool for testing approval logic',
      Kind.Edit,
      {
        properties: { id: { type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    );
  }

  protected createInvocation(params: {
    id: string;
  }): ToolInvocation<{ id: string }, ToolResult> {
    return new TestApprovalInvocation(this.config, params);
  }
}

class TestApprovalInvocation extends BaseToolInvocation<
  { id: string },
  ToolResult
> {
  constructor(
    private config: Config,
    params: { id: string },
  ) {
    super(params);
  }

  getDescription(): string {
    return `Test tool ${this.params.id}`;
  }

  override async shouldConfirmExecute(): Promise<
    ToolCallConfirmationDetails | false
  > {
    // Need confirmation unless approval mode is AUTO_EDIT
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    return {
      type: 'edit',
      title: `Confirm Test Tool ${this.params.id}`,
      fileName: `test-${this.params.id}.txt`,
      filePath: `/test-${this.params.id}.txt`,
      fileDiff: 'Test diff content',
      originalContent: '',
      newContent: 'Test content',
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
  }

  async execute(): Promise<ToolResult> {
    return {
      llmContent: `Executed test tool ${this.params.id}`,
      returnDisplay: `Executed test tool ${this.params.id}`,
    };
  }
}

async function waitForStatus(
  onToolCallsUpdate: Mock,
  status:
    | 'awaiting_approval'
    | 'executing'
    | 'success'
    | 'error'
    | 'cancelled'
    | 'skipped',
  timeout = 5000,
): Promise<ToolCall> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (Date.now() - startTime > timeout) {
        const seenStatuses = onToolCallsUpdate.mock.calls
          .flatMap((call) => call[0])
          .map((toolCall: ToolCall) => toolCall.status);
        reject(
          new Error(
            `Timed out waiting for status "${status}". Seen statuses: ${seenStatuses.join(
              ', ',
            )}`,
          ),
        );
        return;
      }

      const foundCall = onToolCallsUpdate.mock.calls
        .flatMap((call) => call[0])
        .find((toolCall: ToolCall) => toolCall.status === status);
      if (foundCall) {
        resolve(foundCall);
      } else {
        setTimeout(check, 10); // Check again in 10ms
      }
    };
    check();
  });
}

describe('CoreToolScheduler skip functionality', () => {
  it('should handle SKIP outcome correctly', async () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      getApprovalMode: () => ApprovalMode.DEFAULT,
      getAllowedTools: () => [],
      getContentGeneratorConfig: () => ({
        model: 'test-model',
        authType: 'oauth-personal',
      }),
      getToolRegistry: () => mockToolRegistry,
    } as unknown as Config;

    const mockTool = new TestApprovalTool(mockConfig);
    const mockToolRegistry = {
      getTool: () => mockTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByName: () => mockTool,
      getToolByDisplayName: () => mockTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
      onEditorClose: vi.fn(),
    });

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'testApprovalTool',
      args: { id: 'skip-test' },
      isClientInitiated: false,
      prompt_id: 'prompt-id-skip',
    };

    // Schedule the tool call
    await scheduler.schedule([request], abortController.signal);

    // Wait for the tool call to reach the 'awaiting_approval' state
    const awaitingCall = (await waitForStatus(
      onToolCallsUpdate,
      'awaiting_approval',
    )) as WaitingToolCall;

    // Simulate the SKIP outcome
    const confirmationDetails = awaitingCall.confirmationDetails;
    if (confirmationDetails) {
      await confirmationDetails.onConfirm(ToolConfirmationOutcome.Skip);
    }

    // Wait for the tool call to complete
    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    // Verify the tool call was marked as 'skipped'
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls).toHaveLength(1);
    expect(completedCalls[0].status).toBe('skipped');
    // Verify the correct message is set
    if (completedCalls[0].status === 'skipped') {
      expect(completedCalls[0].response.resultDisplay).toBe(
        'Tool call skipped by user.',
      );
    }
  });
});
