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
} from './a2aUtils.js';
import type { Message, Task, TextPart, DataPart, FilePart } from '@a2a-js/sdk';

describe('a2aUtils', () => {
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
      expect(result).toEqual({ contextId: 'ctx-1', taskId: 'task-1' });
    });

    it('should extract IDs from an in-progress task response', () => {
      const task: Task = {
        id: 'task-2',
        contextId: 'ctx-2',
        kind: 'task',
        status: { state: 'working' },
      };

      const result = extractIdsFromResponse(task);
      expect(result).toEqual({ contextId: 'ctx-2', taskId: 'task-2' });
    });

    it('should clear taskId for completed tasks', () => {
      const task: Task = {
        id: 'task-2',
        contextId: 'ctx-2',
        kind: 'task',
        status: { state: 'completed' },
      };

      const result = extractIdsFromResponse(task);
      expect(result).toEqual({ contextId: 'ctx-2', taskId: undefined });
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
        ],
      };
      expect(extractMessageText(message)).toContain('File: test.txt');
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
    it('should extract basic task info from status message', () => {
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
    });

    it('should fallback to last agent message in history if status message is missing', () => {
      const task: Task = {
        id: 'task-1',
        contextId: 'ctx-1',
        kind: 'task',
        status: { state: 'completed' },
        history: [
          {
            kind: 'message',
            role: 'user',
            messageId: 'u1',
            parts: [{ kind: 'text', text: 'Question' } as TextPart],
          },
          {
            kind: 'message',
            role: 'agent',
            messageId: 'a1',
            parts: [{ kind: 'text', text: 'First Answer' } as TextPart],
          },
          {
            kind: 'message',
            role: 'user',
            messageId: 'u2',
            parts: [{ kind: 'text', text: 'Follow up' } as TextPart],
          },
          {
            kind: 'message',
            role: 'agent',
            messageId: 'a2',
            parts: [{ kind: 'text', text: 'Final Answer' } as TextPart],
          },
        ],
      };

      const result = extractTaskText(task);
      expect(result).toBe('Final Answer');
    });

    it('should fallback to history only if status message and artifacts are missing', () => {
      const task: Task = {
        id: 'task-1',
        contextId: 'ctx-1',
        kind: 'task',
        status: { state: 'completed' },
        history: [
          {
            kind: 'message',
            role: 'agent',
            messageId: 'a1',
            parts: [{ kind: 'text', text: 'Answer' } as TextPart],
          },
        ],
        artifacts: [
          {
            artifactId: 'art-1',
            name: 'Data',
            parts: [{ kind: 'text', text: 'Artifact Content' } as TextPart],
          },
        ],
      };

      const result = extractTaskText(task);
      expect(result).not.toContain('Answer');
      expect(result).toContain('Artifact (Data):');
      expect(result).toContain('Artifact Content');
    });

    it('should prioritize status message over history fallback', () => {
      const task: Task = {
        id: 'task-1',
        contextId: 'ctx-1',
        kind: 'task',
        status: {
          state: 'completed',
          message: {
            kind: 'message',
            role: 'agent',
            messageId: 'm1',
            parts: [{ kind: 'text', text: 'Status Message' } as TextPart],
          },
        },
        history: [
          {
            kind: 'message',
            role: 'agent',
            messageId: 'a1',
            parts: [{ kind: 'text', text: 'History Message' } as TextPart],
          },
        ],
      };

      const result = extractTaskText(task);
      expect(result).toBe('Status Message');
      expect(result).not.toContain('History Message');
    });

    it('should handle history with no agent messages', () => {
      const task: Task = {
        id: 'task-1',
        contextId: 'ctx-1',
        kind: 'task',
        status: { state: 'completed' },
        history: [
          {
            kind: 'message',
            role: 'user',
            messageId: 'u1',
            parts: [{ kind: 'text', text: 'Only user' } as TextPart],
          },
        ],
      };

      const result = extractTaskText(task);
      expect(result).toBe('');
    });

    it('should return empty string if everything is missing', () => {
      const task: Task = {
        id: 'task-1',
        contextId: 'ctx-1',
        kind: 'task',
        status: { state: 'working' },
      };
      expect(extractTaskText(task)).toBe('');
    });
  });
});
