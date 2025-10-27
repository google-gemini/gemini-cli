/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import { Task } from './task.js';
import {
  GeminiEventType,
  type Config,
  type ToolCallRequestInfo,
} from '@google/gemini-cli-core';
import { createMockConfig } from '../utils/testing_utils.js';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import { CoderAgentEvent } from '../types.js';

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
  });
});
