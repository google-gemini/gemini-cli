/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Task } from './task.js';
import {
  type Config,
  MessageBusType,
  ToolConfirmationOutcome,
  ApprovalMode,
  Scheduler,
  type MessageBus,
} from '@google/gemini-cli-core';
import { createMockConfig } from '../utils/testing_utils.js';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';

describe('Task Event-Driven Scheduler', () => {
  let mockConfig: Config;
  let mockEventBus: ExecutionEventBus;
  let messageBus: MessageBus;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = createMockConfig({
      isEventDrivenSchedulerEnabled: () => true,
    }) as Config;
    messageBus = mockConfig.messageBus;
    mockEventBus = {
      publish: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
      finished: vi.fn(),
    };
  });

  it('should instantiate Scheduler when enabled', () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);
    expect(task.scheduler).toBeInstanceOf(Scheduler);
  });

  it('should subscribe to TOOL_CALLS_UPDATE and map status changes', async () => {
    // @ts-expect-error - Calling private constructor
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCall = {
      request: { callId: '1', name: 'ls', args: {} },
      status: 'executing',
    };

    // Simulate MessageBus event
    // Simulate MessageBus event
    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];

    if (!handler) {
      throw new Error('TOOL_CALLS_UPDATE handler not found');
    }

    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall],
      schedulerId: 'task-id',
    });

    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        status: expect.objectContaining({
          state: 'submitted', // initial task state
        }),
        metadata: expect.objectContaining({
          coderAgent: expect.objectContaining({
            kind: 'tool-call-update',
          }),
        }),
      }),
    );
  });

  it('should handle tool confirmations by publishing to MessageBus', async () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCall = {
      request: { callId: '1', name: 'ls', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-1',
      confirmationDetails: { type: 'info', title: 'test', prompt: 'test' },
    };

    // Simulate MessageBus event to stash the correlationId
    // Simulate MessageBus event
    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];

    if (!handler) {
      throw new Error('TOOL_CALLS_UPDATE handler not found');
    }

    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall],
      schedulerId: 'task-id',
    });

    // Simulate A2A client confirmation
    const part = {
      kind: 'data',
      data: {
        callId: '1',
        outcome: 'proceed_once',
      },
    };

    const handled = await (
      task as unknown as {
        _handleToolConfirmationPart: (part: unknown) => Promise<boolean>;
      }
    )._handleToolConfirmationPart(part);
    expect(handled).toBe(true);

    expect(messageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-1',
        confirmed: true,
        outcome: ToolConfirmationOutcome.ProceedOnce,
      }),
    );
  });

  it('should handle Rejection (Cancel) and Modification (ModifyWithEditor)', async () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCall = {
      request: { callId: '1', name: 'ls', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-1',
      confirmationDetails: { type: 'info', title: 'test', prompt: 'test' },
    };

    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];
    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall],
      schedulerId: 'task-id',
    });

    // Simulate Rejection (Cancel)
    const handled = await (
      task as unknown as {
        _handleToolConfirmationPart: (part: unknown) => Promise<boolean>;
      }
    )._handleToolConfirmationPart({
      kind: 'data',
      data: { callId: '1', outcome: 'cancel' },
    });
    expect(handled).toBe(true);
    expect(messageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-1',
        confirmed: false,
      }),
    );

    const toolCall2 = {
      request: { callId: '2', name: 'ls', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-2',
      confirmationDetails: { type: 'info', title: 'test', prompt: 'test' },
    };
    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall2],
      schedulerId: 'task-id',
    });

    // Simulate ModifyWithEditor
    const handled2 = await (
      task as unknown as {
        _handleToolConfirmationPart: (part: unknown) => Promise<boolean>;
      }
    )._handleToolConfirmationPart({
      kind: 'data',
      data: { callId: '2', outcome: 'modify_with_editor' },
    });
    expect(handled2).toBe(true);
    expect(messageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-2',
        confirmed: false,
        outcome: ToolConfirmationOutcome.ModifyWithEditor,
        payload: undefined,
      }),
    );
  });

  it('should handle MCP Server tool operations correctly', async () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCall = {
      request: { callId: '1', name: 'call_mcp_tool', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-mcp-1',
      confirmationDetails: {
        type: 'mcp',
        title: 'MCP Server Operation',
        prompt: 'test_mcp',
      },
    };

    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];
    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall],
      schedulerId: 'task-id',
    });

    // Simulate ProceedOnce for MCP
    const handled = await (
      task as unknown as {
        _handleToolConfirmationPart: (part: unknown) => Promise<boolean>;
      }
    )._handleToolConfirmationPart({
      kind: 'data',
      data: { callId: '1', outcome: 'proceed_once' },
    });
    expect(handled).toBe(true);
    expect(messageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-mcp-1',
        confirmed: true,
        outcome: ToolConfirmationOutcome.ProceedOnce,
      }),
    );
  });

  it('should handle MCP Server tool ProceedAlwaysServer outcome', async () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCall = {
      request: { callId: '1', name: 'call_mcp_tool', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-mcp-2',
      confirmationDetails: {
        type: 'mcp',
        title: 'MCP Server Operation',
        prompt: 'test_mcp',
      },
    };

    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];
    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall],
      schedulerId: 'task-id',
    });

    const handled = await (
      task as unknown as {
        _handleToolConfirmationPart: (part: unknown) => Promise<boolean>;
      }
    )._handleToolConfirmationPart({
      kind: 'data',
      data: { callId: '1', outcome: 'proceed_always_server' },
    });
    expect(handled).toBe(true);
    expect(messageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-mcp-2',
        confirmed: true,
        outcome: ToolConfirmationOutcome.ProceedAlwaysServer,
      }),
    );
  });

  it('should handle MCP Server tool ProceedAlwaysTool outcome', async () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCall = {
      request: { callId: '1', name: 'call_mcp_tool', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-mcp-3',
      confirmationDetails: {
        type: 'mcp',
        title: 'MCP Server Operation',
        prompt: 'test_mcp',
      },
    };

    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];
    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall],
      schedulerId: 'task-id',
    });

    const handled = await (
      task as unknown as {
        _handleToolConfirmationPart: (part: unknown) => Promise<boolean>;
      }
    )._handleToolConfirmationPart({
      kind: 'data',
      data: { callId: '1', outcome: 'proceed_always_tool' },
    });
    expect(handled).toBe(true);
    expect(messageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-mcp-3',
        confirmed: true,
        outcome: ToolConfirmationOutcome.ProceedAlwaysTool,
      }),
    );
  });

  it('should handle MCP Server tool ProceedAlwaysAndSave outcome', async () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCall = {
      request: { callId: '1', name: 'call_mcp_tool', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-mcp-4',
      confirmationDetails: {
        type: 'mcp',
        title: 'MCP Server Operation',
        prompt: 'test_mcp',
      },
    };

    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];
    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall],
      schedulerId: 'task-id',
    });

    const handled = await (
      task as unknown as {
        _handleToolConfirmationPart: (part: unknown) => Promise<boolean>;
      }
    )._handleToolConfirmationPart({
      kind: 'data',
      data: { callId: '1', outcome: 'proceed_always_and_save' },
    });
    expect(handled).toBe(true);
    expect(messageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-mcp-4',
        confirmed: true,
        outcome: ToolConfirmationOutcome.ProceedAlwaysAndSave,
      }),
    );
  });

  it('should execute without confirmation in YOLO mode and not transition to input-required', async () => {
    // Enable YOLO mode
    const yoloConfig = createMockConfig({
      isEventDrivenSchedulerEnabled: () => true,
      getApprovalMode: () => ApprovalMode.YOLO,
    }) as Config;
    const yoloMessageBus = yoloConfig.messageBus;

    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', yoloConfig, mockEventBus);
    task.setTaskStateAndPublishUpdate = vi.fn();

    const toolCall = {
      request: { callId: '1', name: 'ls', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-1',
      confirmationDetails: { type: 'info', title: 'test', prompt: 'test' },
    };

    const handler = (yoloMessageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];
    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall],
      schedulerId: 'task-id',
    });

    // Should NOT auto-publish ProceedOnce anymore, because PolicyEngine handles it directly
    expect(yoloMessageBus.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      }),
    );

    // Should NOT transition to input-required since it was auto-approved
    expect(task.setTaskStateAndPublishUpdate).not.toHaveBeenCalledWith(
      'input-required',
      expect.anything(),
      undefined,
      undefined,
      true,
    );
  });

  it('should handle output updates via the message bus', async () => {
    // @ts-expect-error - Calling private constructor
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCall = {
      request: { callId: '1', name: 'ls', args: {} },
      status: 'executing',
      liveOutput: 'chunk1',
    };

    // Simulate MessageBus event
    // Simulate MessageBus event
    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];

    if (!handler) {
      throw new Error('TOOL_CALLS_UPDATE handler not found');
    }

    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall],
      schedulerId: 'task-id',
    });

    // Should publish artifact update for output
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'artifact-update',
        artifact: expect.objectContaining({
          artifactId: 'tool-1-output',
          parts: [{ kind: 'text', text: 'chunk1' }],
        }),
      }),
    );
  });

  it('should complete artifact creation without hanging', async () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCallId = 'create-file-123';
    task['_registerToolCall'](toolCallId, 'executing');

    const toolCall = {
      request: {
        callId: toolCallId,
        name: 'writeFile',
        args: { path: 'test.sh' },
      },
      status: 'success',
      result: { ok: true },
    };

    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];
    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall],
      schedulerId: 'task-id',
    });

    // The tool should be complete and registered appropriately, eventually
    // triggering the toolCompletionPromise resolution when all clear.
    const internalTask = task as unknown as {
      completedToolCalls: unknown[];
      pendingToolCalls: Map<string, string>;
    };
    expect(internalTask.completedToolCalls.length).toBe(1);
    expect(internalTask.pendingToolCalls.size).toBe(0);
  });

  it('should preserve messageId across multiple text chunks to prevent UI duplication', async () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    // Initialize the ID for the first turn (happens internally upon LLM stream)
    task.currentAgentMessageId = 'test-id-123';

    // Simulate sending multiple text chunks
    task._sendTextContent('chunk 1');
    task._sendTextContent('chunk 2');

    // Both text contents should have been published with the same messageId
    const textCalls = (mockEventBus.publish as Mock).mock.calls.filter(
      (call) => call[0].status?.message?.kind === 'message',
    );
    expect(textCalls.length).toBe(2);
    expect(textCalls[0][0].status.message.messageId).toBe('test-id-123');
    expect(textCalls[1][0].status.message.messageId).toBe('test-id-123');

    // Simulate starting a new turn by calling getAndClearCompletedTools
    // (which precedes sendCompletedToolsToLlm where a new ID is minted)
    task.getAndClearCompletedTools();

    // sendCompletedToolsToLlm internally rolls the ID forward.
    // Simulate what sendCompletedToolsToLlm does:
    const internalTask = task as unknown as {
      setTaskStateAndPublishUpdate: (state: string, change: unknown) => void;
    };
    internalTask.setTaskStateAndPublishUpdate('working', {});

    // Simulate what sendCompletedToolsToLlm does: generate a new UUID for the next turn
    task.currentAgentMessageId = 'test-id-456';

    task._sendTextContent('chunk 3');

    const secondTurnCalls = (mockEventBus.publish as Mock).mock.calls.filter(
      (call) => call[0].status?.message?.messageId === 'test-id-456',
    );
    expect(secondTurnCalls.length).toBe(1);
    expect(secondTurnCalls[0][0].status.message.parts[0].text).toBe('chunk 3');
  });

  it('should handle parallel tool calls correctly', async () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCall1 = {
      request: { callId: '1', name: 'ls', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-1',
      confirmationDetails: { type: 'info', title: 'test 1', prompt: 'test 1' },
    };

    const toolCall2 = {
      request: { callId: '2', name: 'pwd', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-2',
      confirmationDetails: { type: 'info', title: 'test 2', prompt: 'test 2' },
    };

    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];

    // Publish update for both tool calls simultaneously
    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall1, toolCall2],
      schedulerId: 'task-id',
    });

    // Confirm first tool call
    const handled1 = await (
      task as unknown as {
        _handleToolConfirmationPart: (part: unknown) => Promise<boolean>;
      }
    )._handleToolConfirmationPart({
      kind: 'data',
      data: { callId: '1', outcome: 'proceed_once' },
    });
    expect(handled1).toBe(true);
    expect(messageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-1',
        confirmed: true,
      }),
    );

    // Confirm second tool call
    const handled2 = await (
      task as unknown as {
        _handleToolConfirmationPart: (part: unknown) => Promise<boolean>;
      }
    )._handleToolConfirmationPart({
      kind: 'data',
      data: { callId: '2', outcome: 'cancel' },
    });
    expect(handled2).toBe(true);
    expect(messageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-2',
        confirmed: false,
      }),
    );
  });

  it('should wait for executing tools before transitioning to input-required state', async () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    task.setTaskStateAndPublishUpdate = vi.fn();

    // Register tool 1 as executing
    task['_registerToolCall']('1', 'executing');

    const toolCall1 = {
      request: { callId: '1', name: 'ls', args: {} },
      status: 'executing',
    };

    const toolCall2 = {
      request: { callId: '2', name: 'pwd', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-2',
      confirmationDetails: { type: 'info', title: 'test 2', prompt: 'test 2' },
    };

    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];

    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall1, toolCall2],
      schedulerId: 'task-id',
    });

    // Should NOT transition to input-required yet
    expect(task.setTaskStateAndPublishUpdate).not.toHaveBeenCalledWith(
      'input-required',
      expect.anything(),
      undefined,
      undefined,
      true,
    );

    // Complete tool 1
    const toolCall1Complete = {
      ...toolCall1,
      status: 'success',
      result: { ok: true },
    };

    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall1Complete, toolCall2],
      schedulerId: 'task-id',
    });

    // Now it should transition
    expect(task.setTaskStateAndPublishUpdate).toHaveBeenCalledWith(
      'input-required',
      expect.anything(),
      undefined,
      undefined,
      true,
    );
  });

  it('should ignore confirmations for unknown tool calls', async () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const handled = await (
      task as unknown as {
        _handleToolConfirmationPart: (part: unknown) => Promise<boolean>;
      }
    )._handleToolConfirmationPart({
      kind: 'data',
      data: { callId: 'unknown-id', outcome: 'proceed_once' },
    });

    // Should return false for unhandled tool call
    expect(handled).toBe(false);

    // Should not publish anything to the message bus
    expect(messageBus.publish).not.toHaveBeenCalled();
  });
});
