/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractMessageText,
  extractIdsFromResponse,
  isTerminalState,
  A2AResultReassembler,
  AUTH_REQUIRED_MSG,
  normalizeAgentCard,
} from './a2aUtils.js';
import type { SendMessageResult } from './a2a-client-manager.js';
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    it('should handle file parts with neither name nor uri', () => {
      const message: Message = {
        kind: 'message',
        role: 'user',
        messageId: '1',
        parts: [
          {
            kind: 'file',
            file: {
              mimeType: 'text/plain',
            },
          } as FilePart,
        ],
      };
      expect(extractMessageText(message)).toBe('File: [binary/unnamed]');
    });
  });

  describe('normalizeAgentCard', () => {
    it('should throw if input is not an object', () => {
      expect(() => normalizeAgentCard(null)).toThrow('Agent card is missing.');
      expect(() => normalizeAgentCard(undefined)).toThrow(
        'Agent card is missing.',
      );
      expect(() => normalizeAgentCard('not an object')).toThrow(
        'Agent card is missing.',
      );
    });

    it('should preserve unknown fields while providing defaults for mandatory ones', () => {
      const raw = {
        name: 'my-agent',
        customField: 'keep-me',
      };

      const normalized = normalizeAgentCard(raw);

      expect(normalized.name).toBe('my-agent');
      // @ts-expect-error - testing dynamic preservation
      expect(normalized.customField).toBe('keep-me');
      expect(normalized.description).toBeUndefined();
      expect(normalized.skills).toBeUndefined();
      expect(normalized.defaultInputModes).toBeUndefined();
    });

    it('should map supportedInterfaces to additionalInterfaces with protocolBinding → transport', () => {
      const raw = {
        name: 'test',
        supportedInterfaces: [
          {
            url: 'grpc://test',
            protocolBinding: 'GRPC',
            protocolVersion: '1.0',
          },
        ],
      };

      const normalized = normalizeAgentCard(raw);

      expect(normalized.additionalInterfaces).toHaveLength(1);

      const intf = normalized.additionalInterfaces?.[0] as unknown as Record<
        string,
        unknown
      >;

      expect(intf['transport']).toBe('GRPC');
      expect(intf['url']).toBe('grpc://test');
    });

    it('should not overwrite additionalInterfaces if already present', () => {
      const raw = {
        name: 'test',
        additionalInterfaces: [{ url: 'http://grpc', transport: 'GRPC' }],
        supportedInterfaces: [{ url: 'http://other', transport: 'REST' }],
      };

      const normalized = normalizeAgentCard(raw);
      expect(normalized.additionalInterfaces).toHaveLength(1);
      expect(normalized.additionalInterfaces?.[0].url).toBe('http://grpc');
    });

    it('should NOT override existing transport if protocolBinding is also present', () => {
      const raw = {
        name: 'priority-test',
        supportedInterfaces: [
          { url: 'foo', transport: 'GRPC', protocolBinding: 'REST' },
        ],
      };
      const normalized = normalizeAgentCard(raw);
      expect(normalized.additionalInterfaces?.[0].transport).toBe('GRPC');
    });

    it('should not mutate the original card object', () => {
      const raw = {
        name: 'test',
        supportedInterfaces: [{ url: 'grpc://test', protocolBinding: 'GRPC' }],
      };

      const normalized = normalizeAgentCard(raw);
      expect(normalized).not.toBe(raw);
      expect(normalized.additionalInterfaces).toBeDefined();
      // Original should not have additionalInterfaces added
      expect(
        (raw as Record<string, unknown>)['additionalInterfaces'],
      ).toBeUndefined();
    });
  });

  describe('A2AResultReassembler', () => {
    it('should reassemble sequential messages and incremental artifacts', () => {
      const reassembler = new A2AResultReassembler();

      // 1. Initial status
      reassembler.update({
        kind: 'status-update',
        taskId: 't1',
        contextId: 'ctx1',
        status: {
          state: 'working',
          message: {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Analyzing...' }],
          } as Message,
        },
      } as unknown as SendMessageResult);

      // 2. First artifact chunk
      reassembler.update({
        kind: 'artifact-update',
        taskId: 't1',
        contextId: 'ctx1',
        append: false,
        artifact: {
          artifactId: 'a1',
          name: 'Code',
          parts: [{ kind: 'text', text: 'print(' }],
        },
      } as unknown as SendMessageResult);

      // 3. Second status
      reassembler.update({
        kind: 'status-update',
        taskId: 't1',
        contextId: 'ctx1',
        status: {
          state: 'working',
          message: {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Processing...' }],
          } as Message,
        },
      } as unknown as SendMessageResult);

      // 4. Second artifact chunk (append)
      reassembler.update({
        kind: 'artifact-update',
        taskId: 't1',
        contextId: 'ctx1',
        append: true,
        artifact: {
          artifactId: 'a1',
          parts: [{ kind: 'text', text: '"Done")' }],
        },
      } as unknown as SendMessageResult);

      const output = reassembler.toString();
      expect(output).toBe(
        'Analyzing...Processing...\n\nArtifact (Code):\nprint("Done")',
      );
    });

    it('should handle auth-required state with a message', () => {
      const reassembler = new A2AResultReassembler();

      reassembler.update({
        kind: 'status-update',
        contextId: 'ctx1',
        status: {
          state: 'auth-required',
          message: {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: 'I need your permission.' }],
          } as Message,
        },
      } as unknown as SendMessageResult);

      expect(reassembler.toString()).toContain('I need your permission.');
      expect(reassembler.toString()).toContain(AUTH_REQUIRED_MSG);
    });

    it('should handle auth-required state without relying on metadata', () => {
      const reassembler = new A2AResultReassembler();

      reassembler.update({
        kind: 'status-update',
        contextId: 'ctx1',
        status: {
          state: 'auth-required',
        },
      } as unknown as SendMessageResult);

      expect(reassembler.toString()).toContain(AUTH_REQUIRED_MSG);
    });

    it('should not duplicate the auth instruction OR agent message if multiple identical auth-required chunks arrive', () => {
      const reassembler = new A2AResultReassembler();

      const chunk = {
        kind: 'status-update',
        contextId: 'ctx1',
        status: {
          state: 'auth-required',
          message: {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: 'You need to login here.' }],
          } as Message,
        },
      } as unknown as SendMessageResult;

      reassembler.update(chunk);
      // Simulate multiple updates with the same overall state
      reassembler.update(chunk);
      reassembler.update(chunk);

      const output = reassembler.toString();
      // The substring should only appear exactly once
      expect(output.split(AUTH_REQUIRED_MSG).length - 1).toBe(1);

      // Crucially, the agent's actual custom message should ALSO only appear exactly once
      expect(output.split('You need to login here.').length - 1).toBe(1);
    });

    it('should fallback to history in a task chunk if no message or artifacts exist and task is terminal', () => {
      const reassembler = new A2AResultReassembler();

      reassembler.update({
        kind: 'task',
        id: 'task-1',
        contextId: 'ctx1',
        status: { state: 'completed' },
        history: [
          {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Answer from history' }],
          } as Message,
        ],
      } as unknown as SendMessageResult);

      expect(reassembler.toString()).toBe('Answer from history');
    });

    it('should NOT fallback to history in a task chunk if task is not terminal', () => {
      const reassembler = new A2AResultReassembler();

      reassembler.update({
        kind: 'task',
        id: 'task-1',
        contextId: 'ctx1',
        status: { state: 'working' },
        history: [
          {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Answer from history' }],
          } as Message,
        ],
      } as unknown as SendMessageResult);

      expect(reassembler.toString()).toBe('');
    });

    it('should not fallback to history if artifacts exist', () => {
      const reassembler = new A2AResultReassembler();

      reassembler.update({
        kind: 'task',
        id: 'task-1',
        contextId: 'ctx1',
        status: { state: 'completed' },
        artifacts: [
          {
            artifactId: 'art-1',
            name: 'Data',
            parts: [{ kind: 'text', text: 'Artifact Content' }],
          },
        ],
        history: [
          {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Answer from history' }],
          } as Message,
        ],
      } as unknown as SendMessageResult);

      const output = reassembler.toString();
      expect(output).toContain('Artifact (Data):');
      expect(output).not.toContain('Answer from history');
    });

    it('should return message log as activity items', () => {
      const reassembler = new A2AResultReassembler();

      reassembler.update({
        kind: 'status-update',
        taskId: 't1',
        contextId: 'ctx1',
        status: {
          state: 'working',
          message: {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Message 1' }],
          } as Message,
        },
      } as unknown as SendMessageResult);

      reassembler.update({
        kind: 'status-update',
        taskId: 't1',
        contextId: 'ctx1',
        status: {
          state: 'working',
          message: {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Message 2' }],
          } as Message,
        },
      } as unknown as SendMessageResult);

      const items = reassembler.toActivityItems();
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        id: 'msg-0',
        type: 'thought',
        content: 'Message 1',
        status: 'completed',
      });
      expect(items[1]).toEqual({
        id: 'msg-1',
        type: 'thought',
        content: 'Message 2',
        status: 'completed',
      });
    });
  });
});
