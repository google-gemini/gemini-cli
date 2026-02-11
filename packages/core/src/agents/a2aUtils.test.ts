/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  extractMessageText,
  extractTaskText,
  extractIdsFromResponse,
  getDelta,
  isTerminalState,
  extractAnyText,
} from './a2aUtils.js';
import type {
  Message,
  Task,
  TextPart,
  DataPart,
  FilePart,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from '@a2a-js/sdk';

describe('a2aUtils', () => {
  describe('getDelta', () => {
    it('should return the full string if previous is empty', () => {
      expect(getDelta('hello', '')).toBe('hello');
    });

    it('should return the delta if current starts with previous', () => {
      expect(getDelta('hello world', 'hello')).toBe(' world');
    });

    it('should return the full current string if it does not start with previous', () => {
      expect(getDelta('world', 'hello')).toBe('world');
    });

    it('should return an empty string if current is same as previous', () => {
      expect(getDelta('hello', 'hello')).toBe('');
    });
  });

  describe('isTerminalState', () => {
    it('should return true for completed, failed, canceled, and rejected', () => {
      expect(isTerminalState('completed')).toBe(true);
      expect(isTerminalState('failed')).toBe(true);
      expect(isTerminalState('canceled')).toBe(true);
      expect(isTerminalState('rejected')).toBe(true);
    });

    it('should return false for working, submitted, input-required, auth-required, and unknown', () => {
      expect(isTerminalState('working')).toBe(false);
      expect(isTerminalState('submitted')).toBe(false);
      expect(isTerminalState('input-required')).toBe(false);
      expect(isTerminalState('auth-required')).toBe(false);
      expect(isTerminalState('unknown')).toBe(false);
      expect(isTerminalState(undefined)).toBe(false);
    });
  });

  describe('extractIdsFromResponse', () => {
    it('should extract IDs from a message response', () => {
      const message: Message = {
        kind: 'message',
        role: 'agent',
        messageId: 'm1',
        contextId: 'ctx-1',
        taskId: 'task-1',
        parts: [],
      };

      const result = extractIdsFromResponse(message);
      expect(result).toEqual({
        contextId: 'ctx-1',
        taskId: 'task-1',
        clearTaskId: false,
      });
    });

    it('should extract IDs from an in-progress task response', () => {
      const task: Task = {
        id: 'task-2',
        contextId: 'ctx-2',
        kind: 'task',
        status: { state: 'working' },
      };

      const result = extractIdsFromResponse(task);
      expect(result).toEqual({
        contextId: 'ctx-2',
        taskId: 'task-2',
        clearTaskId: false,
      });
    });

    it('should set clearTaskId true for terminal task response', () => {
      const task: Task = {
        id: 'task-3',
        contextId: 'ctx-3',
        kind: 'task',
        status: { state: 'completed' },
      };

      const result = extractIdsFromResponse(task);
      expect(result.clearTaskId).toBe(true);
    });

    it('should set clearTaskId true for terminal status update', () => {
      const update = {
        kind: 'status-update',
        contextId: 'ctx-4',
        taskId: 'task-4',
        final: true,
        status: { state: 'failed' },
      };

      const result = extractIdsFromResponse(
        update as unknown as TaskStatusUpdateEvent,
      );
      expect(result.contextId).toBe('ctx-4');
      expect(result.taskId).toBe('task-4');
      expect(result.clearTaskId).toBe(true);
    });

    it('should extract IDs from an artifact-update event', () => {
      const update = {
        kind: 'artifact-update',
        taskId: 'task-5',
        contextId: 'ctx-5',
        artifact: {
          artifactId: 'art-1',
          parts: [{ kind: 'text', text: 'artifact content' }],
        },
      } as unknown as TaskArtifactUpdateEvent;

      const result = extractIdsFromResponse(update);
      expect(result).toEqual({
        contextId: 'ctx-5',
        taskId: 'task-5',
        clearTaskId: false,
      });
    });

    it('should extract taskId from status update event', () => {
      const update = {
        kind: 'status-update',
        taskId: 'task-6',
        contextId: 'ctx-6',
        final: false,
        status: { state: 'working' },
      };

      const result = extractIdsFromResponse(
        update as unknown as TaskStatusUpdateEvent,
      );
      expect(result.taskId).toBe('task-6');
      expect(result.contextId).toBe('ctx-6');
      expect(result.clearTaskId).toBe(false);
    });
  });

  describe('extractAnyText', () => {
    it('should extract text from message', () => {
      const message: Message = {
        kind: 'message',
        role: 'agent',
        messageId: 'm1',
        parts: [{ kind: 'text', text: 'hello' } as TextPart],
      };
      expect(extractAnyText(message)).toBe('hello');
    });

    it('should extract text from task status message', () => {
      const task: Task = {
        id: 't1',
        kind: 'task',
        status: {
          state: 'working',
          message: {
            kind: 'message',
            role: 'agent',
            messageId: 'm2',
            parts: [{ kind: 'text', text: 'working...' } as TextPart],
          },
        },
      };
      expect(extractAnyText(task)).toBe('working...');
    });

    it('should extract text from status update event', () => {
      const update = {
        kind: 'status-update',
        taskId: 'task-1',
        contextId: 'ctx-1',
        final: false,
        status: {
          state: 'working',
          message: {
            kind: 'message',
            role: 'agent',
            messageId: 'm3',
            parts: [{ kind: 'text', text: 'update' } as TextPart],
          },
        },
      };
      expect(extractAnyText(update as unknown as TaskStatusUpdateEvent)).toBe(
        'update',
      );
    });

    it('should extract text from artifact-update event', () => {
      const update = {
        kind: 'artifact-update',
        taskId: 'task-1',
        contextId: 'ctx-1',
        artifact: {
          artifactId: 'art-1',
          parts: [{ kind: 'text', text: 'artifact content' } as TextPart],
        },
      } as unknown as TaskArtifactUpdateEvent;
      expect(extractAnyText(update)).toBe('artifact content');
    });
  });

  describe('extractMessageText', () => {
    it('should extract text from simple text parts', () => {
      const message: Message = {
        kind: 'message',
        role: 'user',
        messageId: '1',
        parts: [
          { kind: 'text', text: 'Hello' } as TextPart,
          { kind: 'text', text: 'World' } as TextPart,
        ],
      };
      expect(extractMessageText(message)).toBe('Hello\nWorld');
    });

    it('should extract data from data parts', () => {
      const message: Message = {
        kind: 'message',
        role: 'user',
        messageId: '1',
        parts: [{ kind: 'data', data: { foo: 'bar' } } as DataPart],
      };
      expect(extractMessageText(message)).toBe('Data: {"foo":"bar"}');
    });

    it('should extract file info from file parts', () => {
      const message: Message = {
        kind: 'message',
        role: 'user',
        messageId: '1',
        parts: [
          {
            kind: 'file',
            file: {
              name: 'test.txt',
              uri: 'file://test.txt',
              mimeType: 'text/plain',
            },
          } as FilePart,
          {
            kind: 'file',
            file: {
              uri: 'http://example.com/doc',
              mimeType: 'application/pdf',
            },
          } as FilePart,
        ],
      };
      // The formatting logic in a2aUtils prefers name over uri
      expect(extractMessageText(message)).toContain('File: test.txt');
      expect(extractMessageText(message)).toContain(
        'File: http://example.com/doc',
      );
    });

    it('should handle mixed parts', () => {
      const message: Message = {
        kind: 'message',
        role: 'user',
        messageId: '1',
        parts: [
          { kind: 'text', text: 'Here is data:' } as TextPart,
          { kind: 'data', data: { value: 123 } } as DataPart,
        ],
      };
      expect(extractMessageText(message)).toBe(
        'Here is data:\nData: {"value":123}',
      );
    });

    it('should return empty string for undefined or empty message', () => {
      expect(extractMessageText(undefined)).toBe('');
      expect(
        extractMessageText({
          kind: 'message',
          role: 'user',
          messageId: '1',
          parts: [],
        } as Message),
      ).toBe('');
    });
  });

  describe('extractTaskText', () => {
    it('should extract basic task info (clean)', () => {
      const task: Task = {
        id: 'task-1',
        contextId: 'ctx-1',
        kind: 'task',
        status: {
          state: 'working',
          message: {
            kind: 'message',
            role: 'agent',
            messageId: 'm1',
            parts: [{ kind: 'text', text: 'Processing...' } as TextPart],
          },
        },
      };

      const result = extractTaskText(task);
      expect(result).not.toContain('ID: task-1');
      expect(result).not.toContain('State: working');
      expect(result).toBe('Processing...');
    });

    it('should extract artifacts with headers', () => {
      const task: Task = {
        id: 'task-1',
        contextId: 'ctx-1',
        kind: 'task',
        status: { state: 'completed' },
        artifacts: [
          {
            artifactId: 'art-1',
            name: 'Report',
            parts: [{ kind: 'text', text: 'This is the report.' } as TextPart],
          },
        ],
      };

      const result = extractTaskText(task);
      expect(result).toContain('Artifact (Report):');
      expect(result).toContain('This is the report.');
      expect(result).not.toContain('Artifacts:');
      expect(result).not.toContain('  - Name: Report');
    });
  });
});
