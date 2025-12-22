/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MockInstance } from 'vitest';
import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ConversationRecord,
  ToolCallRecord,
} from './chatRecordingService.js';
import { ChatRecordingService, parseJsonl } from './chatRecordingService.js';
import type { Config } from '../config/config.js';
import { getProjectHash } from '../utils/paths.js';

vi.mock('node:fs/promises');
vi.mock('node:path');
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(),
  createHash: vi.fn(() => ({
    update: vi.fn(() => ({
      digest: vi.fn(() => 'mocked-hash'),
    })),
  })),
}));
vi.mock('../utils/paths.js');

describe('ChatRecordingService', () => {
  let chatRecordingService: ChatRecordingService;
  let mockConfig: Config;

  let mkdirSpy: MockInstance<typeof fsPromises.mkdir>;
  let appendFileSpy: MockInstance<typeof fsPromises.appendFile>;
  let writeFileSpy: MockInstance<typeof fsPromises.writeFile>;
  let accessSpy: MockInstance<typeof fsPromises.access>;

  beforeEach(() => {
    mockConfig = {
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getProjectRoot: vi.fn().mockReturnValue('/test/project/root'),
      storage: {
        getProjectTempDir: vi
          .fn()
          .mockReturnValue('/test/project/root/.gemini/tmp'),
      },
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getDebugMode: vi.fn().mockReturnValue(false),
      getToolRegistry: vi.fn().mockReturnValue({
        getTool: vi.fn().mockReturnValue({
          displayName: 'Test Tool',
          description: 'A test tool',
          isOutputMarkdown: false,
        }),
      }),
    } as unknown as Config;

    vi.mocked(getProjectHash).mockReturnValue('test-project-hash');
    vi.mocked(randomUUID).mockReturnValue('this-is-a-test-uuid');
    vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

    chatRecordingService = new ChatRecordingService(mockConfig);

    mkdirSpy = vi.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined);

    appendFileSpy = vi
      .spyOn(fsPromises, 'appendFile')
      .mockResolvedValue(undefined);

    writeFileSpy = vi
      .spyOn(fsPromises, 'writeFile')
      .mockResolvedValue(undefined);

    // Default: file does not exist
    accessSpy = vi
      .spyOn(fsPromises, 'access')
      .mockRejectedValue(new Error('ENOENT'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should create a new session if none is provided', async () => {
      await chatRecordingService.initialize();

      expect(mkdirSpy).toHaveBeenCalledWith(
        '/test/project/root/.gemini/tmp/chats',
        { recursive: true },
      );
      expect(writeFileSpy).not.toHaveBeenCalled();
      expect(appendFileSpy).not.toHaveBeenCalled();
    });

    it('should resume from an existing JSON session if provided', async () => {
      await chatRecordingService.initialize({
        filePath: '/test/project/root/.gemini/tmp/chats/session.json',
        conversation: {
          sessionId: 'old-session-id',
          projectHash: 'test-project-hash',
          startTime: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          messages: [
            {
              id: 'existing-msg',
              type: 'user',
              content: 'Hello',
              timestamp: new Date().toISOString(),
            },
          ],
        } as ConversationRecord,
      });

      expect(mkdirSpy).not.toHaveBeenCalled();
      expect(writeFileSpy).toHaveBeenCalled();
      expect(appendFileSpy).not.toHaveBeenCalled();
    });

    it('should resume from an existing JSONL session without appending metadata', async () => {
      await chatRecordingService.initialize({
        filePath: '/test/project/root/.gemini/tmp/chats/session.jsonl',
        conversation: {
          sessionId: 'old-session-id',
          projectHash: 'test-project-hash',
          startTime: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          messages: [],
        } as ConversationRecord,
      });

      expect(mkdirSpy).not.toHaveBeenCalled();
      expect(appendFileSpy).not.toHaveBeenCalled();
    });
  });

  describe('recordMessage', () => {
    beforeEach(async () => {
      await chatRecordingService.initialize();
    });

    it('should record a new message', async () => {
      await chatRecordingService.recordMessage({
        type: 'user',
        content: 'Hello',
        model: 'gemini-pro',
      });
      expect(mkdirSpy).toHaveBeenCalled();
      expect(appendFileSpy).toHaveBeenCalledTimes(2);
      const metadata = JSON.parse(
        (appendFileSpy.mock.calls[0][1] as string).trim(),
      ) as { type: string; sessionId: string };
      expect(metadata.type).toBe('session_metadata');
      expect(metadata.sessionId).toBe('test-session-id');
      const message = JSON.parse(
        (appendFileSpy.mock.calls[1][1] as string).trim(),
      ) as { content: string; type: string };
      expect(message.content).toBe('Hello');
      expect(message.type).toBe('user');
    });

    it('should create separate messages when recording multiple messages', async () => {
      vi.mocked(randomUUID)
        .mockReturnValueOnce(
          'msg-1-uuid-1-uuid' as `${string}-${string}-${string}-${string}-${string}`,
        )
        .mockReturnValueOnce(
          'msg-2-uuid-2-uuid' as `${string}-${string}-${string}-${string}-${string}`,
        );

      await chatRecordingService.recordMessage({
        type: 'user',
        content: 'Hello',
        model: 'gemini-pro',
      });
      await chatRecordingService.recordMessage({
        type: 'user',
        content: 'World',
        model: 'gemini-pro',
      });

      expect(mkdirSpy).toHaveBeenCalled();
      // Metadata once + two messages = 3 appends
      expect(appendFileSpy).toHaveBeenCalledTimes(3);
      const firstMessage = JSON.parse(
        (appendFileSpy.mock.calls[1][1] as string).trim(),
      ) as { content: string };
      const secondMessage = JSON.parse(
        (appendFileSpy.mock.calls[2][1] as string).trim(),
      ) as { content: string };
      expect(firstMessage.content).toBe('Hello');
      expect(secondMessage.content).toBe('World');
    });
  });

  describe('recordThought', () => {
    it('should queue a thought', async () => {
      await chatRecordingService.initialize();
      chatRecordingService.recordThought({
        subject: 'Thinking',
        description: 'Thinking...',
      });
      // @ts-expect-error private property
      expect(chatRecordingService.queuedThoughts).toHaveLength(1);
      // @ts-expect-error private property
      expect(chatRecordingService.queuedThoughts[0].subject).toBe('Thinking');
      // @ts-expect-error private property
      expect(chatRecordingService.queuedThoughts[0].description).toBe(
        'Thinking...',
      );
    });
  });

  describe('recordMessageTokens', () => {
    beforeEach(async () => {
      await chatRecordingService.initialize();
    });

    it('should update the last message with token info', async () => {
      vi.mocked(randomUUID).mockReturnValueOnce(
        'msg-1-uuid-1-uuid' as `${string}-${string}-${string}-${string}-${string}`,
      );
      await chatRecordingService.recordMessage({
        type: 'gemini',
        content: 'Response',
        model: 'gemini-pro',
      });

      await chatRecordingService.recordMessageTokens({
        promptTokenCount: 1,
        candidatesTokenCount: 2,
        totalTokenCount: 3,
        cachedContentTokenCount: 0,
      });

      expect(mkdirSpy).toHaveBeenCalled();
      // Metadata once + message + update = 3 appends
      expect(appendFileSpy).toHaveBeenCalledTimes(3);
      const update = JSON.parse(
        (appendFileSpy.mock.calls[2][1] as string).trim(),
      ) as { type: string; tokens: Record<string, number> };
      expect(update.type).toBe('message_update');
      expect(update.tokens).toEqual({
        input: 1,
        output: 2,
        total: 3,
        cached: 0,
        thoughts: 0,
        tool: 0,
      });
    });

    it('should queue token info if the last message already has tokens', async () => {
      vi.mocked(randomUUID).mockReturnValueOnce(
        'msg-1-uuid-1-uuid' as `${string}-${string}-${string}-${string}-${string}`,
      );
      await chatRecordingService.recordMessage({
        type: 'gemini',
        content: 'Response',
        model: 'gemini-pro',
      });
      await chatRecordingService.recordMessageTokens({
        promptTokenCount: 1,
        candidatesTokenCount: 1,
        totalTokenCount: 2,
        cachedContentTokenCount: 0,
      });

      await chatRecordingService.recordMessageTokens({
        promptTokenCount: 2,
        candidatesTokenCount: 2,
        totalTokenCount: 4,
        cachedContentTokenCount: 0,
      });

      // @ts-expect-error private property
      expect(chatRecordingService.queuedTokens).toEqual({
        input: 2,
        output: 2,
        total: 4,
        cached: 0,
        thoughts: 0,
        tool: 0,
      });
    });

    it('should write metadata before message_update even if tokens arrive before message', async () => {
      // This tests the race condition fix: metadata must be written before any update
      vi.mocked(randomUUID).mockReturnValueOnce(
        'msg-1-uuid-1-uuid' as `${string}-${string}-${string}-${string}-${string}`,
      );

      // Record a gemini message first (this writes metadata + message)
      await chatRecordingService.recordMessage({
        type: 'gemini',
        content: 'Response',
        model: 'gemini-pro',
      });

      // Clear the spy to check fresh calls
      appendFileSpy.mockClear();

      // Now record tokens - since metadata is already written via flag, it should NOT write metadata again
      await chatRecordingService.recordMessageTokens({
        promptTokenCount: 5,
        candidatesTokenCount: 10,
        totalTokenCount: 15,
        cachedContentTokenCount: 0,
      });

      // Should only write the update, not metadata again
      expect(appendFileSpy).toHaveBeenCalledTimes(1);
      const record = JSON.parse(
        (appendFileSpy.mock.calls[0][1] as string).trim(),
      ) as { type: string };
      expect(record.type).toBe('message_update');
    });
  });

  describe('writeMessageUpdate ordering', () => {
    it('should write session_metadata once before message_update when update is first write', async () => {
      await chatRecordingService.initialize();

      let fileExists = false;
      accessSpy.mockImplementation(async () => {
        if (fileExists) {
          return;
        }
        throw new Error('ENOENT');
      });

      const records: Array<{ type?: string }> = [];
      appendFileSpy.mockImplementation(async (_filePath, data) => {
        const record = JSON.parse(String(data)) as { type?: string };
        records.push(record);
        if (record.type === 'session_metadata') {
          fileExists = true;
        }
      });

      // @ts-expect-error testing private method ordering
      await chatRecordingService.writeMessageUpdate({
        id: 'msg-1',
        tokens: {
          input: 1,
          output: 2,
          total: 3,
          cached: 0,
          thoughts: 0,
          tool: 0,
        },
      });

      const metadataIndices = records
        .map((record, index) =>
          record.type === 'session_metadata' ? index : -1,
        )
        .filter((index) => index >= 0);
      const updateIndex = records.findIndex(
        (record) => record.type === 'message_update',
      );

      expect(metadataIndices).toHaveLength(1);
      expect(updateIndex).toBeGreaterThan(-1);
      expect(metadataIndices[0]).toBeLessThan(updateIndex);
    });

    it('should write session_metadata exactly once even with concurrent calls', async () => {
      await chatRecordingService.initialize();

      const records: Array<{ type?: string }> = [];
      appendFileSpy.mockImplementation(async (_filePath, data) => {
        // Simulate slow I/O to increase chance of race
        await new Promise((resolve) => setTimeout(resolve, 10));
        const record = JSON.parse(String(data)) as { type?: string };
        records.push(record);
      });

      // Fire multiple concurrent writes - all should await the same metadata write
      await Promise.all([
        // @ts-expect-error testing private method
        chatRecordingService.writeMessageUpdate({
          id: 'msg-1',
          tokens: {
            input: 1,
            output: 2,
            total: 3,
            cached: 0,
            thoughts: 0,
            tool: 0,
          },
        }),
        // @ts-expect-error testing private method
        chatRecordingService.writeMessageUpdate({
          id: 'msg-2',
          tokens: {
            input: 3,
            output: 4,
            total: 7,
            cached: 0,
            thoughts: 0,
            tool: 0,
          },
        }),
        // @ts-expect-error testing private method
        chatRecordingService.writeMessageUpdate({
          id: 'msg-3',
          tokens: {
            input: 5,
            output: 6,
            total: 11,
            cached: 0,
            thoughts: 0,
            tool: 0,
          },
        }),
      ]);

      const metadataCount = records.filter(
        (r) => r.type === 'session_metadata',
      ).length;
      const updateCount = records.filter(
        (r) => r.type === 'message_update',
      ).length;

      // Should have exactly 1 metadata and 3 updates
      expect(metadataCount).toBe(1);
      expect(updateCount).toBe(3);
    });
  });

  describe('ensureMetadataWritten', () => {
    it('should write session_metadata once under concurrent writes', async () => {
      await chatRecordingService.initialize();

      // Seed a Gemini message so recordMessageTokens produces a message_update.
      // @ts-expect-error private property
      chatRecordingService.conversation = {
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        startTime: '2025-01-01T00:00:00.000Z',
        lastUpdated: '2025-01-01T00:00:00.000Z',
        messages: [
          {
            id: 'msg-1',
            type: 'gemini',
            content: '',
            timestamp: '2025-01-01T00:00:01.000Z',
          },
        ],
      } as ConversationRecord;
      // @ts-expect-error private property
      chatRecordingService.conversationFile =
        '/test/project/root/.gemini/tmp/chats/session-test.jsonl';
      // @ts-expect-error private property
      chatRecordingService.fileInitialized = false;

      let metadataWrites = 0;
      let resolveFirstMetadata: (() => void) | null = null;
      const firstMetadataPromise = new Promise<void>((resolve) => {
        resolveFirstMetadata = resolve;
      });

      appendFileSpy.mockImplementation(async (_filePath, data) => {
        const record = JSON.parse(String(data)) as { type?: string };
        if (record.type === 'session_metadata') {
          metadataWrites += 1;
          if (metadataWrites === 1) {
            return firstMetadataPromise;
          }
        }
        return undefined;
      });

      const tokensPromise = chatRecordingService.recordMessageTokens({
        promptTokenCount: 1,
        candidatesTokenCount: 2,
        totalTokenCount: 3,
        cachedContentTokenCount: 0,
      });
      await Promise.resolve();

      const messagePromise = chatRecordingService.recordMessage({
        type: 'user',
        content: 'Hello',
        model: 'gemini-pro',
      });
      await Promise.resolve();

      resolveFirstMetadata!();
      await Promise.all([tokensPromise, messagePromise]);

      expect(metadataWrites).toBe(1);
    });
  });

  describe('getConversation', () => {
    it('should read a JSON session via fs.promises.readFile', async () => {
      const jsonConversation: ConversationRecord = {
        sessionId: 'json-session-id',
        projectHash: 'json-project-hash',
        startTime: '2025-01-01T00:00:00.000Z',
        lastUpdated: '2025-01-01T00:00:01.000Z',
        messages: [
          {
            id: 'msg-1',
            type: 'user',
            content: 'Hello',
            timestamp: '2025-01-01T00:00:00.500Z',
          },
        ],
      };

      const readFileSpy = vi
        .spyOn(fsPromises, 'readFile')
        .mockResolvedValue(JSON.stringify(jsonConversation));

      // @ts-expect-error private property
      chatRecordingService.conversationFile =
        '/test/project/root/.gemini/tmp/chats/session.json';
      // @ts-expect-error private property
      chatRecordingService.conversation = null;

      const conversation = await chatRecordingService.getConversation();

      expect(readFileSpy).toHaveBeenCalledWith(
        '/test/project/root/.gemini/tmp/chats/session.json',
        'utf8',
      );
      expect(conversation).toEqual(jsonConversation);
    });

    it('should read a JSONL session via fs.promises.readFile', async () => {
      const metadata = {
        type: 'session_metadata',
        sessionId: 'jsonl-session-id',
        projectHash: 'jsonl-project-hash',
        startTime: '2025-01-01T00:00:00.000Z',
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };
      const message = {
        id: 'msg-1',
        type: 'user',
        content: 'Hello',
        timestamp: '2025-01-01T00:00:01.000Z',
      };
      const jsonlContent = `${JSON.stringify(metadata)}\n${JSON.stringify(message)}\n`;

      const readFileSpy = vi
        .spyOn(fsPromises, 'readFile')
        .mockResolvedValue(jsonlContent);

      // @ts-expect-error private property
      chatRecordingService.conversationFile =
        '/test/project/root/.gemini/tmp/chats/session.jsonl';
      // @ts-expect-error private property
      chatRecordingService.conversation = null;

      const conversation = await chatRecordingService.getConversation();

      expect(readFileSpy).toHaveBeenCalledWith(
        '/test/project/root/.gemini/tmp/chats/session.jsonl',
        'utf8',
      );
      expect(conversation).toMatchObject({
        sessionId: 'jsonl-session-id',
        projectHash: 'jsonl-project-hash',
        messages: [{ id: 'msg-1', type: 'user', content: 'Hello' }],
      });
    });

    it('should return empty conversation when readFile throws ENOENT', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      const readFileSpy = vi
        .spyOn(fsPromises, 'readFile')
        .mockRejectedValue(error);

      // @ts-expect-error private property
      chatRecordingService.conversationFile =
        '/test/project/root/.gemini/tmp/chats/missing.json';
      // @ts-expect-error private property
      chatRecordingService.conversation = null;

      const conversation = await chatRecordingService.getConversation();

      expect(readFileSpy).toHaveBeenCalledWith(
        '/test/project/root/.gemini/tmp/chats/missing.json',
        'utf8',
      );
      expect(conversation).toMatchObject({
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        messages: [],
      });
    });
  });

  describe('saveSummary', () => {
    it('should rewrite JSON session files with summary', async () => {
      const jsonConversation: ConversationRecord = {
        sessionId: 'json-session-id',
        projectHash: 'json-project-hash',
        startTime: '2025-01-01T00:00:00.000Z',
        lastUpdated: '2025-01-01T00:00:01.000Z',
        messages: [
          {
            id: 'msg-1',
            type: 'user',
            content: 'Hello',
            timestamp: '2025-01-01T00:00:00.500Z',
          },
        ],
      };

      const readFileSpy = vi
        .spyOn(fsPromises, 'readFile')
        .mockResolvedValue(JSON.stringify(jsonConversation));

      // @ts-expect-error private property
      chatRecordingService.conversationFile =
        '/test/project/root/.gemini/tmp/chats/session.json';
      // @ts-expect-error private property
      chatRecordingService.conversation = null;

      await chatRecordingService.saveSummary('Summary text');

      expect(readFileSpy).toHaveBeenCalledWith(
        '/test/project/root/.gemini/tmp/chats/session.json',
        'utf8',
      );
      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      const written = JSON.parse(
        writeFileSpy.mock.calls[0][1] as string,
      ) as ConversationRecord;
      expect(written.summary).toBe('Summary text');
      expect(written.messages).toHaveLength(1);
      expect(appendFileSpy).not.toHaveBeenCalled();
    });

    it('should append summary metadata for JSONL session files', async () => {
      const metadata = {
        type: 'session_metadata',
        sessionId: 'jsonl-session-id',
        projectHash: 'jsonl-project-hash',
        startTime: '2025-01-01T00:00:00.000Z',
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };
      const message = {
        id: 'msg-1',
        type: 'user',
        content: 'Hello',
        timestamp: '2025-01-01T00:00:01.000Z',
      };
      const jsonlContent = `${JSON.stringify(metadata)}\n${JSON.stringify(message)}\n`;

      const readFileSpy = vi
        .spyOn(fsPromises, 'readFile')
        .mockResolvedValue(jsonlContent);

      // @ts-expect-error private property
      chatRecordingService.conversationFile =
        '/test/project/root/.gemini/tmp/chats/session.jsonl';
      // @ts-expect-error private property
      chatRecordingService.conversation = null;

      await chatRecordingService.saveSummary('Summary text');

      expect(readFileSpy).toHaveBeenCalledWith(
        '/test/project/root/.gemini/tmp/chats/session.jsonl',
        'utf8',
      );
      expect(writeFileSpy).not.toHaveBeenCalled();
      expect(appendFileSpy).toHaveBeenCalled();
      const records = appendFileSpy.mock.calls.map((call) =>
        JSON.parse(call[1] as string),
      ) as Array<{ type?: string; summary?: string }>;
      const summaryRecord = records.find(
        (record) => record.type === 'session_metadata' && record.summary,
      );
      expect(summaryRecord).toMatchObject({
        type: 'session_metadata',
        summary: 'Summary text',
      });
    });
  });

  describe('parseJsonl', () => {
    it('should apply a message_update that appears before its message record', () => {
      const updateLine = JSON.stringify({
        type: 'message_update',
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:02.000Z',
        tokens: {
          input: 1,
          output: 2,
          total: 3,
          cached: 0,
          thoughts: 0,
          tool: 0,
        },
      });
      const messageLine = JSON.stringify({
        id: 'msg-1',
        type: 'gemini',
        content: 'Hello',
        timestamp: '2025-01-01T00:00:01.000Z',
      });
      const content = `${updateLine}\n${messageLine}\n`;

      const conversation = parseJsonl(content, 'session-1', 'project-hash');

      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0]).toMatchObject({
        id: 'msg-1',
        type: 'gemini',
        tokens: {
          input: 1,
          output: 2,
          total: 3,
          cached: 0,
          thoughts: 0,
          tool: 0,
        },
      });
    });

    it('should apply multiple message_updates that appear before their message', () => {
      const update1 = JSON.stringify({
        type: 'message_update',
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:02.000Z',
        tokens: {
          input: 1,
          output: 2,
          total: 3,
          cached: 0,
          thoughts: 0,
          tool: 0,
        },
      });
      const update2 = JSON.stringify({
        type: 'message_update',
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:03.000Z',
        toolCalls: [{ id: 'tc-1', name: 'test' }],
      });
      const messageLine = JSON.stringify({
        id: 'msg-1',
        type: 'gemini',
        content: 'Hello',
        timestamp: '2025-01-01T00:00:01.000Z',
      });
      const content = `${update1}\n${update2}\n${messageLine}\n`;

      const conversation = parseJsonl(content, 'session-1', 'project-hash');

      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0]).toMatchObject({
        id: 'msg-1',
        type: 'gemini',
        tokens: {
          input: 1,
          output: 2,
          total: 3,
          cached: 0,
          thoughts: 0,
          tool: 0,
        },
        toolCalls: [{ id: 'tc-1', name: 'test' }],
      });
    });

    it('should track lastUpdated from message_updates that precede messages', () => {
      const updateLine = JSON.stringify({
        type: 'message_update',
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:05.000Z',
        tokens: {
          input: 1,
          output: 2,
          total: 3,
          cached: 0,
          thoughts: 0,
          tool: 0,
        },
      });
      const messageLine = JSON.stringify({
        id: 'msg-1',
        type: 'gemini',
        content: 'Hello',
        timestamp: '2025-01-01T00:00:01.000Z',
      });
      const content = `${updateLine}\n${messageLine}\n`;

      const conversation = parseJsonl(content, 'session-1', 'project-hash');

      expect(conversation.lastUpdated).toBe('2025-01-01T00:00:05.000Z');
    });

    it('should preserve applied updates when duplicate message records appear', () => {
      const messageLine = JSON.stringify({
        id: 'msg-1',
        type: 'gemini',
        content: 'Hello',
        timestamp: '2025-01-01T00:00:01.000Z',
      });
      const updateLine = JSON.stringify({
        type: 'message_update',
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:02.000Z',
        tokens: {
          input: 1,
          output: 2,
          total: 3,
          cached: 0,
          thoughts: 0,
          tool: 0,
        },
      });
      const duplicateLine = JSON.stringify({
        id: 'msg-1',
        type: 'gemini',
        content: 'Hello again',
        timestamp: '2025-01-01T00:00:03.000Z',
      });
      const content = `${messageLine}\n${updateLine}\n${duplicateLine}\n`;

      const conversation = parseJsonl(content, 'session-1', 'project-hash');

      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0]).toMatchObject({
        id: 'msg-1',
        type: 'gemini',
        content: 'Hello again',
        tokens: {
          input: 1,
          output: 2,
          total: 3,
          cached: 0,
          thoughts: 0,
          tool: 0,
        },
      });
      expect(conversation.lastUpdated).toBe('2025-01-01T00:00:03.000Z');
    });
  });

  describe('recordToolCalls', () => {
    beforeEach(async () => {
      await chatRecordingService.initialize();
    });

    it('should add new tool calls to the last message', async () => {
      vi.mocked(randomUUID).mockReturnValueOnce(
        'msg-1-uuid-1-uuid' as `${string}-${string}-${string}-${string}-${string}`,
      );
      await chatRecordingService.recordMessage({
        type: 'gemini',
        content: '',
        model: 'gemini-pro',
      });

      const toolCall: ToolCallRecord = {
        id: 'tool-1',
        name: 'testTool',
        args: {},
        status: 'awaiting_approval',
        timestamp: new Date().toISOString(),
      };
      await chatRecordingService.recordToolCalls('gemini-pro', [toolCall]);

      expect(mkdirSpy).toHaveBeenCalled();
      // Metadata + message + tool call update = 3 appends
      expect(appendFileSpy).toHaveBeenCalledTimes(3);
      const update = JSON.parse(
        (appendFileSpy.mock.calls[2][1] as string).trim(),
      ) as { type: string; toolCalls: ToolCallRecord[] };
      expect(update.type).toBe('message_update');
      expect(update.toolCalls).toEqual([
        {
          ...toolCall,
          displayName: 'Test Tool',
          description: 'A test tool',
          renderOutputAsMarkdown: false,
        },
      ]);
    });

    it('should create a new message if the last message is not from gemini', async () => {
      vi.mocked(randomUUID)
        .mockReturnValueOnce(
          'user-1-msg-1-uuid' as `${string}-${string}-${string}-${string}-${string}`,
        )
        .mockReturnValueOnce(
          'gemini-2-msg-2-uuid' as `${string}-${string}-${string}-${string}-${string}`,
        );
      await chatRecordingService.recordMessage({
        type: 'user',
        content: 'call a tool',
        model: 'gemini-pro',
      });

      const toolCall: ToolCallRecord = {
        id: 'tool-1',
        name: 'testTool',
        args: {},
        status: 'awaiting_approval',
        timestamp: new Date().toISOString(),
      };
      await chatRecordingService.recordToolCalls('gemini-pro', [toolCall]);

      expect(mkdirSpy).toHaveBeenCalled();
      // Metadata + user message + gemini message with tool call = 3 appends
      expect(appendFileSpy).toHaveBeenCalledTimes(3);
      const newMessage = JSON.parse(
        (appendFileSpy.mock.calls[2][1] as string).trim(),
      ) as {
        type: string;
        model?: string;
        content: string;
        toolCalls?: ToolCallRecord[];
      };
      expect(newMessage.type).toBe('gemini');
      expect(newMessage.model).toBe('gemini-pro');
      expect(newMessage.content).toBe('');
      expect(newMessage.toolCalls).toEqual([
        {
          ...toolCall,
          displayName: 'Test Tool',
          description: 'A test tool',
          renderOutputAsMarkdown: false,
        },
      ]);
    });
  });

  describe('deleteSession', () => {
    const makeEnoent = () => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      return err;
    };

    it('should delete all matching session files by scanning for shortId', async () => {
      const sessionId = 'abcd1234-5678-1234-9abc-1234567890ab';
      const expectedFiles = [
        'session-2025-01-01T10-00-abcd1234.jsonl',
        'session-2025-01-01T09-00-abcd1234.json',
      ];

      accessSpy.mockImplementation(async (filePath) => {
        // chats directory exists
        if (String(filePath).endsWith('/chats')) return;
        throw makeEnoent();
      });

      const readdirSpy = vi
        .spyOn(fsPromises, 'readdir')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue(expectedFiles as any);

      const readFileSpy = vi
        .spyOn(fsPromises, 'readFile')
        .mockImplementation(async (filePath) => {
          const file = String(filePath);
          if (file.endsWith('.jsonl')) {
            return (
              JSON.stringify({
                type: 'session_metadata',
                sessionId,
                startTime: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
              }) + '\n'
            );
          }
          return JSON.stringify({ sessionId, messages: [] });
        });

      const unlinkSpy = vi
        .spyOn(fsPromises, 'unlink')
        .mockResolvedValue(undefined);

      await chatRecordingService.deleteSession(sessionId);

      expect(accessSpy).toHaveBeenCalled();
      expect(readdirSpy).toHaveBeenCalledWith(
        '/test/project/root/.gemini/tmp/chats',
      );
      expect(readFileSpy).toHaveBeenCalled();
      for (const file of expectedFiles) {
        expect(unlinkSpy).toHaveBeenCalledWith(
          `/test/project/root/.gemini/tmp/chats/${file}`,
        );
      }
    });

    it('should delete by direct filename when provided', async () => {
      const filename = 'session-2025-01-01T10-00-abcd1234.jsonl';

      accessSpy.mockImplementation(async (filePath) => {
        if (String(filePath).endsWith(filename)) return;
        throw makeEnoent();
      });

      const unlinkSpy = vi
        .spyOn(fsPromises, 'unlink')
        .mockResolvedValue(undefined);

      await chatRecordingService.deleteSession(filename);

      expect(accessSpy).toHaveBeenCalled();
      expect(unlinkSpy).toHaveBeenCalledWith(
        `/test/project/root/.gemini/tmp/chats/${filename}`,
      );
    });

    it('should delete by session filename base without extension', async () => {
      const filenameBase = 'session-2025-01-01T10-00-abcd1234';
      const expectedJsonlPath = `/test/project/root/.gemini/tmp/chats/${filenameBase}.jsonl`;
      const expectedJsonPath = `/test/project/root/.gemini/tmp/chats/${filenameBase}.json`;

      accessSpy.mockImplementation(async (filePath) => {
        const file = String(filePath);
        if (
          file.endsWith(`${filenameBase}.jsonl`) ||
          file.endsWith(`${filenameBase}.json`)
        ) {
          return;
        }
        throw makeEnoent();
      });

      const unlinkSpy = vi
        .spyOn(fsPromises, 'unlink')
        .mockResolvedValue(undefined);

      await chatRecordingService.deleteSession(filenameBase);

      expect(accessSpy).toHaveBeenCalled();
      expect(unlinkSpy).toHaveBeenCalledWith(expectedJsonlPath);
      expect(unlinkSpy).toHaveBeenCalledWith(expectedJsonPath);
    });

    it('should not fall through to shortId scan when session filename not found', async () => {
      // This tests the critical bug fix: if sessionId starts with SESSION_FILE_PREFIX
      // but files don't exist, we should NOT fall through to shortId scan,
      // as shortId would be "session-" which could delete ALL session files.
      const filenameBase = 'session-2025-01-01T10-00-abcd1234';

      accessSpy.mockImplementation(async (filePath) => {
        if (String(filePath).endsWith('/chats')) {
          return;
        }
        throw makeEnoent();
      });

      const readdirSpy = vi.spyOn(fsPromises, 'readdir');

      const unlinkSpy = vi.spyOn(fsPromises, 'unlink');

      await chatRecordingService.deleteSession(filenameBase);

      expect(accessSpy).toHaveBeenCalled();
      // Should NOT have called readdir (shortId scan)
      expect(readdirSpy).not.toHaveBeenCalled();
      // Should NOT have deleted anything
      expect(unlinkSpy).not.toHaveBeenCalled();
    });

    it('should delete both jsonl and json in fallback path', async () => {
      const sessionId = 'abcd1234-efgh-5678-ijkl-9012mnop3456';
      const expectedJsonlPath = `/test/project/root/.gemini/tmp/chats/${sessionId}.jsonl`;
      const expectedJsonPath = `/test/project/root/.gemini/tmp/chats/${sessionId}.json`;

      const accessSpy = vi
        .spyOn(fsPromises, 'access')
        .mockImplementation(async (filePath) => {
          const file = String(filePath);
          if (file === expectedJsonlPath || file === expectedJsonPath) {
            return;
          }
          // Force shortId scan to be skipped
          throw makeEnoent();
        });

      const unlinkSpy = vi
        .spyOn(fsPromises, 'unlink')
        .mockResolvedValue(undefined);

      await chatRecordingService.deleteSession(sessionId);

      expect(accessSpy).toHaveBeenCalled();
      expect(unlinkSpy).toHaveBeenCalledWith(expectedJsonlPath);
      expect(unlinkSpy).toHaveBeenCalledWith(expectedJsonPath);
    });
  });
});
