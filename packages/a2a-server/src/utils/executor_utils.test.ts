/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import { pushTaskStateFailed } from './executor_utils.js';

describe('executor_utils', () => {
  describe('pushTaskStateFailed', () => {
    it('should publish failed status with error message from Error instance', async () => {
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      const error = new Error('Test error message');
      const taskId = 'task-123';
      const contextId = 'context-456';

      await pushTaskStateFailed(error, mockEventBus, taskId, contextId);

      expect(mockEventBus.publish).toHaveBeenCalledOnce();
      const publishCall = vi.mocked(mockEventBus.publish).mock.calls[0][0];

      expect(publishCall).toMatchObject({
        kind: 'status-update',
        taskId: 'task-123',
        contextId: 'context-456',
        status: {
          state: 'failed',
          message: {
            kind: 'message',
            role: 'agent',
            parts: [
              {
                kind: 'text',
                text: 'Test error message',
              },
            ],
            taskId: 'task-123',
            contextId: 'context-456',
          },
        },
        final: true,
      });

      expect(publishCall.metadata).toMatchObject({
        coderAgent: {
          kind: 'state-change',
        },
        model: 'unknown',
        error: 'Test error message',
      });
    });

    it('should use generic error message for non-Error instances', async () => {
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      const error = 'string error';
      const taskId = 'task-789';
      const contextId = 'context-012';

      await pushTaskStateFailed(error, mockEventBus, taskId, contextId);

      expect(mockEventBus.publish).toHaveBeenCalledOnce();
      const publishCall = vi.mocked(mockEventBus.publish).mock.calls[0][0];

      expect(publishCall.status.message.parts[0]).toMatchObject({
        kind: 'text',
        text: 'Agent execution error',
      });

      expect(publishCall.metadata.error).toBe('Agent execution error');
    });

    it('should include generated messageId in the message', async () => {
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      const error = new Error('Test');
      await pushTaskStateFailed(error, mockEventBus, 'task-1', 'context-1');

      const publishCall = vi.mocked(mockEventBus.publish).mock.calls[0][0];
      expect(publishCall.status.message.messageId).toBeDefined();
      expect(typeof publishCall.status.message.messageId).toBe('string');
      expect(publishCall.status.message.messageId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should handle null error', async () => {
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      await pushTaskStateFailed(null, mockEventBus, 'task-1', 'context-1');

      const publishCall = vi.mocked(mockEventBus.publish).mock.calls[0][0];
      expect(publishCall.status.message.parts[0].text).toBe('Agent execution error');
    });

    it('should handle undefined error', async () => {
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      await pushTaskStateFailed(undefined, mockEventBus, 'task-1', 'context-1');

      const publishCall = vi.mocked(mockEventBus.publish).mock.calls[0][0];
      expect(publishCall.status.message.parts[0].text).toBe('Agent execution error');
    });

    it('should handle Error with empty message', async () => {
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      const error = new Error('');
      await pushTaskStateFailed(error, mockEventBus, 'task-1', 'context-1');

      const publishCall = vi.mocked(mockEventBus.publish).mock.calls[0][0];
      expect(publishCall.status.message.parts[0].text).toBe('');
      expect(publishCall.metadata.error).toBe('');
    });

    it('should set final to true', async () => {
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      await pushTaskStateFailed(new Error('test'), mockEventBus, 'task-1', 'context-1');

      const publishCall = vi.mocked(mockEventBus.publish).mock.calls[0][0];
      expect(publishCall.final).toBe(true);
    });

    it('should include coderAgent state-change in metadata', async () => {
      const mockEventBus: ExecutionEventBus = {
        publish: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        finished: vi.fn(),
      };

      await pushTaskStateFailed(new Error('test'), mockEventBus, 'task-1', 'context-1');

      const publishCall = vi.mocked(mockEventBus.publish).mock.calls[0][0];
      expect(publishCall.metadata.coderAgent).toMatchObject({
        kind: 'state-change',
      });
    });
  });
});
