/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Task } from './task.js';
import {
  GeminiEventType,
  type Config,
  type ToolCallRequestInfo,
  type GitService,
  type CompletedToolCall,
  type ToolCall,
  type ToolCallsUpdateMessage,
  MessageBusType,
} from '@google/gemini-cli-core';
import { createMockConfig } from '../utils/testing_utils.js';
import type { ExecutionEventBus, RequestContext } from '@a2a-js/sdk/server';
import { CoderAgentEvent } from '../types.js';

const mockProcessRestorableToolCalls = vi.hoisted(() => vi.fn());

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    processRestorableToolCalls: mockProcessRestorableToolCalls,
  };
});

describe('Task', () => {
  it('scheduleToolCalls should not modify the input requests array', async () => {
    const mockConfig = createMockConfig();

    const mockEventBus: ExecutionEventBus = {
      publish: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
      finished: vi.fn(),
    };

    // The Task constructor is private. We'll bypass it for this unit test.
    // @ts-expect-error - Calling private constructor for test purposes.
    const task = new Task(
      'task-id',
      'context-id',
      mockConfig as Config,
      mockEventBus,
    );

    task['setTaskStateAndPublishUpdate'] = vi.fn();
    task['getProposedContent'] = vi.fn().mockResolvedValue('new content');

    const requests: ToolCallRequestInfo[] = [
      {
        callId: '1',
        name: 'replace',
        args: {
          file_path: 'test.txt',
          old_string: 'old',
          new_string: 'new',
        },
        isClientInitiated: false,
        prompt_id: 'prompt-id-1',
      },
    ];

    const originalRequests = JSON.parse(JSON.stringify(requests));
    const abortController = new AbortController();

    await task.scheduleToolCalls(requests, abortController.signal);

    expect(requests).toEqual(originalRequests);
  });

  describe('scheduleToolCalls', () => {
    const mockConfig = createMockConfig();
    const mockEventBus: ExecutionEventBus = {
      publish: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
      finished: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should not create a checkpoint if no restorable tools are called', async () => {
      // @ts-expect-error - Calling private constructor for test purposes.
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );
      const requests: ToolCallRequestInfo[] = [
        {
          callId: '1',
          name: 'run_shell_command',
          args: { command: 'ls' },
          isClientInitiated: false,
          prompt_id: 'prompt-id-1',
        },
      ];
      const abortController = new AbortController();
      await task.scheduleToolCalls(requests, abortController.signal);
      expect(mockProcessRestorableToolCalls).not.toHaveBeenCalled();
    });

    it('should create a checkpoint if a restorable tool is called', async () => {
      const mockConfig = createMockConfig({
        getCheckpointingEnabled: () => true,
        getGitService: () => Promise.resolve({} as GitService),
      });
      mockProcessRestorableToolCalls.mockResolvedValue({
        checkpointsToWrite: new Map([['test.json', 'test content']]),
        toolCallToCheckpointMap: new Map(),
        errors: [],
      });
      // @ts-expect-error - Calling private constructor for test purposes.
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );
      const requests: ToolCallRequestInfo[] = [
        {
          callId: '1',
          name: 'replace',
          args: {
            file_path: 'test.txt',
            old_string: 'old',
            new_string: 'new',
          },
          isClientInitiated: false,
          prompt_id: 'prompt-id-1',
        },
      ];
      const abortController = new AbortController();
      await task.scheduleToolCalls(requests, abortController.signal);
      expect(mockProcessRestorableToolCalls).toHaveBeenCalledOnce();
    });

    it('should process all restorable tools for checkpointing in a single batch', async () => {
      const mockConfig = createMockConfig({
        getCheckpointingEnabled: () => true,
        getGitService: () => Promise.resolve({} as GitService),
      });
      mockProcessRestorableToolCalls.mockResolvedValue({
        checkpointsToWrite: new Map([
          ['test1.json', 'test content 1'],
          ['test2.json', 'test content 2'],
        ]),
        toolCallToCheckpointMap: new Map([
          ['1', 'test1'],
          ['2', 'test2'],
        ]),
        errors: [],
      });
      // @ts-expect-error - Calling private constructor for test purposes.
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );
      const requests: ToolCallRequestInfo[] = [
        {
          callId: '1',
          name: 'replace',
          args: {
            file_path: 'test.txt',
            old_string: 'old',
            new_string: 'new',
          },
          isClientInitiated: false,
          prompt_id: 'prompt-id-1',
        },
        {
          callId: '2',
          name: 'write_file',
          args: { file_path: 'test2.txt', content: 'new content' },
          isClientInitiated: false,
          prompt_id: 'prompt-id-2',
        },
        {
          callId: '3',
          name: 'not_restorable',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-3',
        },
      ];
      const abortController = new AbortController();
      await task.scheduleToolCalls(requests, abortController.signal);
      expect(mockProcessRestorableToolCalls).toHaveBeenCalledExactlyOnceWith(
        [
          expect.objectContaining({ callId: '1' }),
          expect.objectContaining({ callId: '2' }),
        ],
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('acceptAgentMessage', () => {
    it('should set currentTraceId when event has traceId', async () => {
      const mockConfig = createMockConfig();
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      // @ts-expect-error - Calling private constructor for test purposes.
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

      const event = {
        type: 'content',
        value: 'test',
        traceId: 'test-trace-id',
      };

      await task.acceptAgentMessage(event);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            traceId: 'test-trace-id',
          }),
        }),
      );
    });

    it('should handle Citation event and publish to event bus', async () => {
      const mockConfig = createMockConfig();
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      // @ts-expect-error - Calling private constructor for test purposes.
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

      const citationText = 'Source: example.com';
      const citationEvent = {
        type: GeminiEventType.Citation,
        value: citationText,
      };

      await task.acceptAgentMessage(citationEvent);

      expect(mockEventBus.publish).toHaveBeenCalledOnce();
      const publishedEvent = (mockEventBus.publish as Mock).mock.calls[0][0];

      expect(publishedEvent.kind).toBe('status-update');
      expect(publishedEvent.taskId).toBe('task-id');
      expect(publishedEvent.metadata.coderAgent.kind).toBe(
        CoderAgentEvent.CitationEvent,
      );
      expect(publishedEvent.status.message).toBeDefined();
      expect(publishedEvent.status.message.parts).toEqual([
        {
          kind: 'text',
          text: citationText,
        },
      ]);
    });

    it('should update modelInfo and reflect it in metadata and status updates', async () => {
      const mockConfig = createMockConfig();
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      // @ts-expect-error - Calling private constructor for test purposes.
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

      const modelInfoEvent = {
        type: GeminiEventType.ModelInfo,
        value: 'new-model-name',
      };

      await task.acceptAgentMessage(modelInfoEvent);

      expect(task.modelInfo).toBe('new-model-name');

      // Check getMetadata
      const metadata = await task.getMetadata();
      expect(metadata.model).toBe('new-model-name');

      // Check status update
      task.setTaskStateAndPublishUpdate(
        'working',
        { kind: CoderAgentEvent.StateChangeEvent },
        'Working...',
      );

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            model: 'new-model-name',
          }),
        }),
      );
    });

    it.each([
      { eventType: GeminiEventType.Retry, eventName: 'Retry' },
      { eventType: GeminiEventType.InvalidStream, eventName: 'InvalidStream' },
    ])(
      'should handle $eventName event without triggering error handling',
      async ({ eventType }) => {
        const mockConfig = createMockConfig();
        const mockEventBus: ExecutionEventBus = {
          publish: vi.fn(),
          on: vi.fn(),
          off: vi.fn(),
          once: vi.fn(),
          removeAllListeners: vi.fn(),
          finished: vi.fn(),
        };

        // @ts-expect-error - Calling private constructor
        const task = new Task(
          'task-id',
          'context-id',
          mockConfig as Config,
          mockEventBus,
        );

        const cancelPendingToolsSpy = vi.spyOn(task, 'cancelPendingTools');
        const setTaskStateSpy = vi.spyOn(task, 'setTaskStateAndPublishUpdate');

        const event = {
          type: eventType,
        };

        await task.acceptAgentMessage(event);

        expect(cancelPendingToolsSpy).not.toHaveBeenCalled();
        expect(setTaskStateSpy).not.toHaveBeenCalled();
      },
    );
  });

  describe('currentPromptId and promptCount', () => {
    it('should correctly initialize and update promptId and promptCount', async () => {
      const mockConfig = createMockConfig();
      mockConfig.getGeminiClient = vi.fn().mockReturnValue({
        sendMessageStream: vi.fn().mockReturnValue((async function* () {})()),
      });
      mockConfig.getSessionId = () => 'test-session-id';

      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      // @ts-expect-error - Calling private constructor
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

      // Initial state
      expect(task.currentPromptId).toBeUndefined();
      expect(task.promptCount).toBe(0);

      // First user message should set prompt_id
      const userMessage1 = {
        userMessage: {
          parts: [{ kind: 'text', text: 'hello' }],
        },
      } as RequestContext;
      const abortController1 = new AbortController();
      for await (const _ of task.acceptUserMessage(
        userMessage1,
        abortController1.signal,
      )) {
        // no-op
      }

      const expectedPromptId1 = 'test-session-id########0';
      expect(task.promptCount).toBe(1);
      expect(task.currentPromptId).toBe(expectedPromptId1);

      // A new user message should generate a new prompt_id
      const userMessage2 = {
        userMessage: {
          parts: [{ kind: 'text', text: 'world' }],
        },
      } as RequestContext;
      const abortController2 = new AbortController();
      for await (const _ of task.acceptUserMessage(
        userMessage2,
        abortController2.signal,
      )) {
        // no-op
      }

      const expectedPromptId2 = 'test-session-id########1';
      expect(task.promptCount).toBe(2);
      expect(task.currentPromptId).toBe(expectedPromptId2);

      // Subsequent tool call processing should use the same prompt_id
      const completedTool = {
        request: { callId: 'tool-1' },
        response: { responseParts: [{ text: 'tool output' }] },
      } as CompletedToolCall;
      const abortController3 = new AbortController();
      for await (const _ of task.sendCompletedToolsToLlm(
        [completedTool],
        abortController3.signal,
      )) {
        // no-op
      }

      expect(task.promptCount).toBe(2);
      expect(task.currentPromptId).toBe(expectedPromptId2);
    });
  });

  describe('Race Condition Fix', () => {
    const mockConfig = createMockConfig();
    const mockEventBus: ExecutionEventBus = {
      publish: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
      finished: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should NOT transition to input-required if a tool is still validating', async () => {
      // @ts-expect-error - Calling private constructor
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

      // Manually register two tool calls
      task['_registerToolCall']('tool-1', 'awaiting_approval');
      task['_registerToolCall']('tool-2', 'validating');

      // Call checkInputRequiredState (private)
      task['checkInputRequiredState']();

      // Verify task state did NOT change to input-required
      expect(task.taskState).not.toBe('input-required');
      expect(mockEventBus.publish).not.toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.objectContaining({ state: 'input-required' }),
        }),
      );
    });

    it('should transition to input-required if all active tools are awaiting approval', async () => {
      // @ts-expect-error - Calling private constructor
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

      // Transition from submitted to working first to simulate normal flow
      task.taskState = 'working';

      // Manually register tool calls
      task['_registerToolCall']('tool-1', 'awaiting_approval');

      // Call checkInputRequiredState
      task['checkInputRequiredState']();

      // Verify task state changed to input-required
      expect(task.taskState).toBe('input-required');
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.objectContaining({ state: 'input-required' }),
        }),
      );
    });

    it('handleEventDrivenToolCallsUpdate should ignore events for other schedulers', async () => {
      // @ts-expect-error - Calling private constructor
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

      const handleEventDrivenToolCallSpy = vi.spyOn(
        task as unknown as {
          handleEventDrivenToolCall: Task['handleEventDrivenToolCall'];
        },
        'handleEventDrivenToolCall',
      );

      const otherEvent: ToolCallsUpdateMessage = {
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [
          { request: { callId: '1' }, status: 'executing' } as ToolCall,
        ],
        schedulerId: 'other-task-id',
      };

      task['handleEventDrivenToolCallsUpdate'](otherEvent);

      expect(handleEventDrivenToolCallSpy).not.toHaveBeenCalled();

      const ownEvent: ToolCallsUpdateMessage = {
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [
          { request: { callId: '1' }, status: 'executing' } as ToolCall,
        ],
        schedulerId: 'task-id',
      };

      task['handleEventDrivenToolCallsUpdate'](ownEvent);

      expect(handleEventDrivenToolCallSpy).toHaveBeenCalled();
    });
  });

  describe('Serialization and Mapping', () => {
    it('should map internal "validating" status to "scheduled" for the client and include outcome', async () => {
      const mockConfig = createMockConfig();
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      // @ts-expect-error - Calling private constructor
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

      const mockToolCall = {
        request: { callId: 'tool-1' },
        status: 'validating',
        outcome: 'accepted',
        tool: { name: 'test-tool' },
      };

      const message = task['toolStatusMessage'](
        mockToolCall as unknown as ToolCall,
        'task-id',
        'context-id',
      );
      const serialized = (
        message.parts![0] as {
          data: { status: string; outcome: string };
        }
      ).data;

      expect(serialized.status).toBe('scheduled');
      expect(serialized.outcome).toBe('accepted');
    });

    it('should correctly detect changes when status or outcome changes', async () => {
      const mockConfig = createMockConfig();
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      // @ts-expect-error - Calling private constructor
      const task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

      const toolCall1 = {
        request: { callId: 'tool-1' },
        status: 'awaiting_approval',
      };

      // First update - should trigger change
      const changed1 = task['handleEventDrivenToolCall'](
        toolCall1 as unknown as ToolCall,
      );
      expect(changed1).toBe(true);

      // Second update with same status - should NOT trigger change
      const changed2 = task['handleEventDrivenToolCall'](
        toolCall1 as unknown as ToolCall,
      );
      expect(changed2).toBe(false);

      // Update with new outcome - SHOULD trigger change
      const toolCall2 = {
        request: { callId: 'tool-1' },
        status: 'awaiting_approval',
        outcome: 'accepted',
      };
      const changed3 = task['handleEventDrivenToolCall'](
        toolCall2 as unknown as ToolCall,
      );
      expect(changed3).toBe(true);
    });
  });
});
