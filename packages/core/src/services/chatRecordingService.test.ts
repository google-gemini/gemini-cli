/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MockInstance } from 'vitest';
import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ConversationRecord,
  ToolCallRecord,
} from './chatRecordingService.js';
import { ChatRecordingService } from './chatRecordingService.js';
import type { Config } from '../config/config.js';
import { getProjectHash } from '../utils/paths.js';

vi.mock('node:fs');
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

  let mkdirSyncSpy: MockInstance<typeof fs.mkdirSync>;
  let writeFileSyncSpy: MockInstance<typeof fs.writeFileSync>;

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

    mkdirSyncSpy = vi
      .spyOn(fs, 'mkdirSync')
      .mockImplementation(() => undefined);

    writeFileSyncSpy = vi
      .spyOn(fs, 'writeFileSync')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should create a new session if none is provided', () => {
      chatRecordingService.initialize();

      expect(mkdirSyncSpy).toHaveBeenCalledWith(
        '/test/project/root/.gemini/tmp/chats',
        { recursive: true },
      );
      expect(writeFileSyncSpy).not.toHaveBeenCalled();
    });

    it('should resume from an existing session if provided', () => {
      const readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          sessionId: 'old-session-id',
          projectHash: 'test-project-hash',
          messages: [],
        }),
      );
      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => undefined);

      chatRecordingService.initialize({
        filePath: '/test/project/root/.gemini/tmp/chats/session.json',
        conversation: {
          sessionId: 'old-session-id',
        } as ConversationRecord,
      });

      expect(mkdirSyncSpy).not.toHaveBeenCalled();
      expect(readFileSyncSpy).toHaveBeenCalled();
      expect(writeFileSyncSpy).not.toHaveBeenCalled();
    });
  });

  describe('recordMessage', () => {
    beforeEach(() => {
      chatRecordingService.initialize();
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          sessionId: 'test-session-id',
          projectHash: 'test-project-hash',
          messages: [],
        }),
      );
    });

    it('should record a new message', () => {
      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => undefined);
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'Hello',
        displayContent: 'User Hello',
        model: 'gemini-pro',
      });
      expect(mkdirSyncSpy).toHaveBeenCalled();
      expect(writeFileSyncSpy).toHaveBeenCalled();
      const conversation = JSON.parse(
        writeFileSyncSpy.mock.calls[0][1] as string,
      ) as ConversationRecord;
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].content).toBe('Hello');
      expect(conversation.messages[0].displayContent).toBe('User Hello');
      expect(conversation.messages[0].type).toBe('user');
    });

    it('should create separate messages when recording multiple messages', () => {
      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => undefined);
      const initialConversation = {
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        messages: [
          {
            id: '1',
            type: 'user',
            content: 'Hello',
            timestamp: new Date().toISOString(),
          },
        ],
      };
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify(initialConversation),
      );

      chatRecordingService.recordMessage({
        type: 'user',
        content: 'World',
        model: 'gemini-pro',
      });

      expect(mkdirSyncSpy).toHaveBeenCalled();
      expect(writeFileSyncSpy).toHaveBeenCalled();
      const conversation = JSON.parse(
        writeFileSyncSpy.mock.calls[0][1] as string,
      ) as ConversationRecord;
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0].content).toBe('Hello');
      expect(conversation.messages[1].content).toBe('World');
    });
  });

  describe('recordThought', () => {
    it('should queue a thought', () => {
      chatRecordingService.initialize();
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
    beforeEach(() => {
      chatRecordingService.initialize();
    });

    it('should update the last message with token info', () => {
      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => undefined);
      const initialConversation = {
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        messages: [
          {
            id: '1',
            type: 'gemini',
            content: 'Response',
            timestamp: new Date().toISOString(),
          },
        ],
      };
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify(initialConversation),
      );

      chatRecordingService.recordMessageTokens({
        promptTokenCount: 1,
        candidatesTokenCount: 2,
        totalTokenCount: 3,
        cachedContentTokenCount: 0,
      });

      expect(mkdirSyncSpy).toHaveBeenCalled();
      expect(writeFileSyncSpy).toHaveBeenCalled();
      const conversation = JSON.parse(
        writeFileSyncSpy.mock.calls[0][1] as string,
      ) as ConversationRecord;
      expect(conversation.messages[0]).toEqual({
        ...initialConversation.messages[0],
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

    it('should queue token info if the last message already has tokens', () => {
      const initialConversation = {
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        messages: [
          {
            id: '1',
            type: 'gemini',
            content: 'Response',
            timestamp: new Date().toISOString(),
            tokens: { input: 1, output: 1, total: 2, cached: 0 },
          },
        ],
      };
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify(initialConversation),
      );

      chatRecordingService.recordMessageTokens({
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
  });

  describe('recordToolCalls', () => {
    beforeEach(() => {
      chatRecordingService.initialize();
    });

    it('should add new tool calls to the last message', () => {
      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => undefined);
      const initialConversation = {
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        messages: [
          {
            id: '1',
            type: 'gemini',
            content: '',
            timestamp: new Date().toISOString(),
          },
        ],
      };
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify(initialConversation),
      );

      const toolCall: ToolCallRecord = {
        id: 'tool-1',
        name: 'testTool',
        args: {},
        status: 'awaiting_approval',
        timestamp: new Date().toISOString(),
      };
      chatRecordingService.recordToolCalls('gemini-pro', [toolCall]);

      expect(mkdirSyncSpy).toHaveBeenCalled();
      expect(writeFileSyncSpy).toHaveBeenCalled();
      const conversation = JSON.parse(
        writeFileSyncSpy.mock.calls[0][1] as string,
      ) as ConversationRecord;
      expect(conversation.messages[0]).toEqual({
        ...initialConversation.messages[0],
        toolCalls: [
          {
            ...toolCall,
            displayName: 'Test Tool',
            description: 'A test tool',
            renderOutputAsMarkdown: false,
          },
        ],
      });
    });

    it('should create a new message if the last message is not from gemini', () => {
      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => undefined);
      const initialConversation = {
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        messages: [
          {
            id: 'a-uuid',
            type: 'user',
            content: 'call a tool',
            timestamp: new Date().toISOString(),
          },
        ],
      };
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify(initialConversation),
      );

      const toolCall: ToolCallRecord = {
        id: 'tool-1',
        name: 'testTool',
        args: {},
        status: 'awaiting_approval',
        timestamp: new Date().toISOString(),
      };
      chatRecordingService.recordToolCalls('gemini-pro', [toolCall]);

      expect(mkdirSyncSpy).toHaveBeenCalled();
      expect(writeFileSyncSpy).toHaveBeenCalled();
      const conversation = JSON.parse(
        writeFileSyncSpy.mock.calls[0][1] as string,
      ) as ConversationRecord;
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[1]).toEqual({
        ...conversation.messages[1],
        id: 'this-is-a-test-uuid',
        model: 'gemini-pro',
        type: 'gemini',
        thoughts: [],
        content: '',
        toolCalls: [
          {
            ...toolCall,
            displayName: 'Test Tool',
            description: 'A test tool',
            renderOutputAsMarkdown: false,
          },
        ],
      });
    });
  });

  describe('deleteSession', () => {
    it('should delete the session file', () => {
      const unlinkSyncSpy = vi
        .spyOn(fs, 'unlinkSync')
        .mockImplementation(() => undefined);
      chatRecordingService.deleteSession('test-session-id');
      expect(unlinkSyncSpy).toHaveBeenCalledWith(
        '/test/project/root/.gemini/tmp/chats/test-session-id.json',
      );
    });
  });

  describe('recordDirectories', () => {
    beforeEach(() => {
      chatRecordingService.initialize();
    });

    it('should save directories to the conversation', () => {
      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => undefined);
      const initialConversation = {
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        messages: [
          {
            id: '1',
            type: 'user',
            content: 'Hello',
            timestamp: new Date().toISOString(),
          },
        ],
      };
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify(initialConversation),
      );

      chatRecordingService.recordDirectories([
        '/path/to/dir1',
        '/path/to/dir2',
      ]);

      expect(writeFileSyncSpy).toHaveBeenCalled();
      const conversation = JSON.parse(
        writeFileSyncSpy.mock.calls[0][1] as string,
      ) as ConversationRecord;
      expect(conversation.directories).toEqual([
        '/path/to/dir1',
        '/path/to/dir2',
      ]);
    });

    it('should overwrite existing directories', () => {
      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => undefined);
      const initialConversation = {
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        messages: [
          {
            id: '1',
            type: 'user',
            content: 'Hello',
            timestamp: new Date().toISOString(),
          },
        ],
        directories: ['/old/dir'],
      };
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify(initialConversation),
      );

      chatRecordingService.recordDirectories(['/new/dir1', '/new/dir2']);

      expect(writeFileSyncSpy).toHaveBeenCalled();
      const conversation = JSON.parse(
        writeFileSyncSpy.mock.calls[0][1] as string,
      ) as ConversationRecord;
      expect(conversation.directories).toEqual(['/new/dir1', '/new/dir2']);
    });
  });

  describe('rewindTo', () => {
    it('should rewind the conversation to a specific message ID', () => {
      chatRecordingService.initialize();
      const initialConversation = {
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        messages: [
          { id: '1', type: 'user', content: 'msg1' },
          { id: '2', type: 'gemini', content: 'msg2' },
          { id: '3', type: 'user', content: 'msg3' },
        ],
      };
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify(initialConversation),
      );
      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => undefined);

      const result = chatRecordingService.rewindTo('2');

      if (!result) throw new Error('Result should not be null');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe('1');
      expect(writeFileSyncSpy).toHaveBeenCalled();
      const savedConversation = JSON.parse(
        writeFileSyncSpy.mock.calls[0][1] as string,
      ) as ConversationRecord;
      expect(savedConversation.messages).toHaveLength(1);
    });

    it('should return the original conversation if the message ID is not found', () => {
      chatRecordingService.initialize();
      const initialConversation = {
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        messages: [{ id: '1', type: 'user', content: 'msg1' }],
      };
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify(initialConversation),
      );
      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => undefined);

      const result = chatRecordingService.rewindTo('non-existent');

      if (!result) throw new Error('Result should not be null');
      expect(result.messages).toHaveLength(1);
      expect(writeFileSyncSpy).not.toHaveBeenCalled();
    });
  });

  describe('ENOSPC (disk full) graceful degradation - issue #16266', () => {
    it('should disable recording and not throw when ENOSPC occurs during initialize', () => {
      const enospcError = new Error('ENOSPC: no space left on device');
      (enospcError as NodeJS.ErrnoException).code = 'ENOSPC';

      mkdirSyncSpy.mockImplementation(() => {
        throw enospcError;
      });

      // Should not throw
      expect(() => chatRecordingService.initialize()).not.toThrow();

      // Recording should be disabled (conversationFile set to null)
      expect(chatRecordingService.getConversationFilePath()).toBeNull();
    });

    it('should disable recording and not throw when ENOSPC occurs during writeConversation', () => {
      chatRecordingService.initialize();

      const enospcError = new Error('ENOSPC: no space left on device');
      (enospcError as NodeJS.ErrnoException).code = 'ENOSPC';

      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          sessionId: 'test-session-id',
          projectHash: 'test-project-hash',
          messages: [],
        }),
      );

      writeFileSyncSpy.mockImplementation(() => {
        throw enospcError;
      });

      // Should not throw when recording a message
      expect(() =>
        chatRecordingService.recordMessage({
          type: 'user',
          content: 'Hello',
          model: 'gemini-pro',
        }),
      ).not.toThrow();

      // Recording should be disabled (conversationFile set to null)
      expect(chatRecordingService.getConversationFilePath()).toBeNull();
    });

    it('should skip recording operations when recording is disabled', () => {
      chatRecordingService.initialize();

      const enospcError = new Error('ENOSPC: no space left on device');
      (enospcError as NodeJS.ErrnoException).code = 'ENOSPC';

      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          sessionId: 'test-session-id',
          projectHash: 'test-project-hash',
          messages: [],
        }),
      );

      // First call throws ENOSPC
      writeFileSyncSpy.mockImplementationOnce(() => {
        throw enospcError;
      });

      chatRecordingService.recordMessage({
        type: 'user',
        content: 'First message',
        model: 'gemini-pro',
      });

      // Reset mock to track subsequent calls
      writeFileSyncSpy.mockClear();

      // Subsequent calls should be no-ops (not call writeFileSync)
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'Second message',
        model: 'gemini-pro',
      });

      chatRecordingService.recordThought({
        subject: 'Test',
        description: 'Test thought',
      });

      chatRecordingService.saveSummary('Test summary');

      // writeFileSync should not have been called for any of these
      expect(writeFileSyncSpy).not.toHaveBeenCalled();
    });

    it('should return null from getConversation when recording is disabled', () => {
      chatRecordingService.initialize();

      const enospcError = new Error('ENOSPC: no space left on device');
      (enospcError as NodeJS.ErrnoException).code = 'ENOSPC';

      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          sessionId: 'test-session-id',
          projectHash: 'test-project-hash',
          messages: [],
        }),
      );

      writeFileSyncSpy.mockImplementation(() => {
        throw enospcError;
      });

      // Trigger ENOSPC
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'Hello',
        model: 'gemini-pro',
      });

      // getConversation should return null when disabled
      expect(chatRecordingService.getConversation()).toBeNull();
      expect(chatRecordingService.getConversationFilePath()).toBeNull();
    });

    it('should still throw for non-ENOSPC errors', () => {
      chatRecordingService.initialize();

      const otherError = new Error('Permission denied');
      (otherError as NodeJS.ErrnoException).code = 'EACCES';

      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          sessionId: 'test-session-id',
          projectHash: 'test-project-hash',
          messages: [],
        }),
      );

      writeFileSyncSpy.mockImplementation(() => {
        throw otherError;
      });

      // Should throw for non-ENOSPC errors
      expect(() =>
        chatRecordingService.recordMessage({
          type: 'user',
          content: 'Hello',
          model: 'gemini-pro',
        }),
      ).toThrow('Permission denied');

      // Recording should NOT be disabled for non-ENOSPC errors (file path still exists)
      expect(chatRecordingService.getConversationFilePath()).not.toBeNull();
    });
  });
});
