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
} from '@google/gemini-cli-core';
import { createMockConfig } from '../utils/testing_utils.js';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import { CoderAgentEvent } from '../types.js';
import type { ToolCall } from '@google/gemini-cli-core';

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
  });

  describe('_schedulerToolCallsUpdate', () => {
    let task: Task;
    type SpyInstance = ReturnType<typeof vi.spyOn>;
    let setTaskStateAndPublishUpdateSpy: SpyInstance;

    beforeEach(() => {
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
      task = new Task(
        'task-id',
        'context-id',
        mockConfig as Config,
        mockEventBus,
      );

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
  });
});
