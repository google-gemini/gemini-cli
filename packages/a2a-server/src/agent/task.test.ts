/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { Task } from './task.js';
import {
  GeminiEventType,
  type Config,
  type ToolCallRequestInfo,
  type GitService,
  type CompletedToolCall,
  ApprovalMode,
  ToolConfirmationOutcome,
} from '@google/gemini-cli-core';
import { createMockConfig } from '../utils/testing_utils.js';
import type { ExecutionEventBus, RequestContext } from '@a2a-js/sdk/server';
import { CoderAgentEvent } from '../types.js';
import type { ToolCall } from '@google/gemini-cli-core';

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

  describe('_schedulerToolCallsUpdate', () => {
    let task: Task;
    type SpyInstance = ReturnType<typeof vi.spyOn>;
    let setTaskStateAndPublishUpdateSpy: SpyInstance;
    let mockConfig: Config;
    let mockEventBus: ExecutionEventBus;

    beforeEach(() => {
      mockConfig = createMockConfig() as Config;
      mockEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      // @ts-expect-error - Calling private constructor
      task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

      // Spy on the method we want to check calls for
      setTaskStateAndPublishUpdateSpy = vi.spyOn(
        task,
        'setTaskStateAndPublishUpdate',
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should set state to input-required when a tool is awaiting approval and none are executing', () => {
      const toolCalls = [
        { request: { callId: '1' }, status: 'awaiting_approval' },
      ] as ToolCall[];

      // @ts-expect-error - Calling private method
      task._schedulerToolCallsUpdate(toolCalls);

      // The last call should be the final state update
      expect(setTaskStateAndPublishUpdateSpy).toHaveBeenLastCalledWith(
        'input-required',
        { kind: 'state-change' },
        undefined,
        undefined,
        true, // final: true
      );
    });

    it('should NOT set state to input-required if a tool is awaiting approval but another is executing', () => {
      const toolCalls = [
        { request: { callId: '1' }, status: 'awaiting_approval' },
        { request: { callId: '2' }, status: 'executing' },
      ] as ToolCall[];

      // @ts-expect-error - Calling private method
      task._schedulerToolCallsUpdate(toolCalls);

      // It will be called for status updates, but not with final: true
      const finalCall = setTaskStateAndPublishUpdateSpy.mock.calls.find(
        (call) => call[4] === true,
      );
      expect(finalCall).toBeUndefined();
    });

    it('should set state to input-required once an executing tool finishes, leaving one awaiting approval', () => {
      const initialToolCalls = [
        { request: { callId: '1' }, status: 'awaiting_approval' },
        { request: { callId: '2' }, status: 'executing' },
      ] as ToolCall[];
      // @ts-expect-error - Calling private method
      task._schedulerToolCallsUpdate(initialToolCalls);

      // No final call yet
      let finalCall = setTaskStateAndPublishUpdateSpy.mock.calls.find(
        (call) => call[4] === true,
      );
      expect(finalCall).toBeUndefined();

      // Now, the executing tool finishes. The scheduler would call _resolveToolCall for it.
      // @ts-expect-error - Calling private method
      task._resolveToolCall('2');

      // Then another update comes in for the awaiting tool (e.g., a re-check)
      const subsequentToolCalls = [
        { request: { callId: '1' }, status: 'awaiting_approval' },
      ] as ToolCall[];
      // @ts-expect-error - Calling private method
      task._schedulerToolCallsUpdate(subsequentToolCalls);

      // NOW we should get the final call
      finalCall = setTaskStateAndPublishUpdateSpy.mock.calls.find(
        (call) => call[4] === true,
      );
      expect(finalCall).toBeDefined();
      expect(finalCall?.[0]).toBe('input-required');
    });

    it('should NOT set state to input-required if skipFinalTrueAfterInlineEdit is true', () => {
      task.skipFinalTrueAfterInlineEdit = true;
      const toolCalls = [
        { request: { callId: '1' }, status: 'awaiting_approval' },
      ] as ToolCall[];

      // @ts-expect-error - Calling private method
      task._schedulerToolCallsUpdate(toolCalls);

      const finalCall = setTaskStateAndPublishUpdateSpy.mock.calls.find(
        (call) => call[4] === true,
      );
      expect(finalCall).toBeUndefined();
    });

    describe('auto-approval', () => {
      it('should auto-approve tool calls when autoExecute is true', () => {
        task.autoExecute = true;
        const onConfirmSpy = vi.fn();
        const toolCalls = [
          {
            request: { callId: '1' },
            status: 'awaiting_approval',
            confirmationDetails: { onConfirm: onConfirmSpy },
          },
        ] as unknown as ToolCall[];

        // @ts-expect-error - Calling private method
        task._schedulerToolCallsUpdate(toolCalls);

        expect(onConfirmSpy).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedOnce,
        );
      });

      it('should auto-approve tool calls when approval mode is YOLO', () => {
        (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.YOLO);
        task.autoExecute = false;
        const onConfirmSpy = vi.fn();
        const toolCalls = [
          {
            request: { callId: '1' },
            status: 'awaiting_approval',
            confirmationDetails: { onConfirm: onConfirmSpy },
          },
        ] as unknown as ToolCall[];

        // @ts-expect-error - Calling private method
        task._schedulerToolCallsUpdate(toolCalls);

        expect(onConfirmSpy).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedOnce,
        );
      });

      it('should NOT auto-approve when autoExecute is false and mode is not YOLO', () => {
        task.autoExecute = false;
        (mockConfig.getApprovalMode as Mock).mockReturnValue(
          ApprovalMode.DEFAULT,
        );
        const onConfirmSpy = vi.fn();
        const toolCalls = [
          {
            request: { callId: '1' },
            status: 'awaiting_approval',
            confirmationDetails: { onConfirm: onConfirmSpy },
          },
        ] as unknown as ToolCall[];

        // @ts-expect-error - Calling private method
        task._schedulerToolCallsUpdate(toolCalls);

        expect(onConfirmSpy).not.toHaveBeenCalled();
      });
    });
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
});
