/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MockInstance } from 'vitest';
import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ConversationRecord,
  ToolCallRecord,
} from './chatRecordingService.js';
import { ChatRecordingService } from './chatRecordingService.js';
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

  let mkdirSpy: MockInstance<typeof fs.mkdir>;
  let writeFileSpy: MockInstance<typeof fs.writeFile>;

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
    vi.mocked(path.resolve).mockImplementation((...args) => args.join('/')); // Simple mock for resolve

    chatRecordingService = new ChatRecordingService(mockConfig);

    mkdirSpy = vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);

    writeFileSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
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
      // It does NOT write the initial conversation until messages are added
      expect(writeFileSpy).not.toHaveBeenCalled();
    });

    it('should resume from an existing session if provided', async () => {
      const readFileSpy = vi.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify({
          sessionId: 'old-session-id',
          projectHash: 'test-project-hash',
          messages: [],
        }),
      );

      // We expect updateConversation to be called, which reads then writes

      await chatRecordingService.initialize({
        filePath: '/test/project/root/.gemini/tmp/chats/session.json',
        conversation: {
          sessionId: 'old-session-id',
        } as ConversationRecord,
      });

      expect(mkdirSpy).not.toHaveBeenCalled();
      expect(readFileSpy).toHaveBeenCalled();
      // It updates the session ID but since messages are empty, it might skip writing?
      // let's check updateConversation logic.
      // updateConversation -> read -> updateFn -> write
      // writeConversation checks messages.length === 0 and returns.
      expect(writeFileSpy).not.toHaveBeenCalled();
    });
  });

  describe('recordMessage', () => {
    beforeEach(async () => {
      await chatRecordingService.initialize();
      vi.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify({
          sessionId: 'test-session-id',
          projectHash: 'test-project-hash',
          messages: [],
        }),
      );
    });

    it('should record a new message', async () => {
      // clear previous calls from initialize
      writeFileSpy.mockClear();

      await chatRecordingService.recordMessage({
        type: 'user',
        content: 'Hello',
        model: 'gemini-pro',
      });

      expect(writeFileSpy).toHaveBeenCalled();
      const conversation = JSON.parse(
        writeFileSpy.mock.calls[0][1] as string,
      ) as ConversationRecord;
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].content).toBe('Hello');
      expect(conversation.messages[0].type).toBe('user');
    });

    it('should create separate messages when recording multiple messages', async () => {
      // clear previous calls from initialize
      writeFileSpy.mockClear();

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
      vi.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify(initialConversation),
      );

      await chatRecordingService.recordMessage({
        type: 'user',
        content: 'World',
        model: 'gemini-pro',
      });

      expect(writeFileSpy).toHaveBeenCalled();
      const conversation = JSON.parse(
        writeFileSpy.mock.calls[0][1] as string,
      ) as ConversationRecord;
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0].content).toBe('Hello');
      expect(conversation.messages[1].content).toBe('World');
    });
  });

  describe('recordThought', () => {
    it('should queue a thought', async () => {
      await chatRecordingService.initialize();
      await chatRecordingService.recordThought({
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
      vi.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify(initialConversation),
      );

      // clear previous calls
      writeFileSpy.mockClear();

      await chatRecordingService.recordMessageTokens({
        promptTokenCount: 1,
        candidatesTokenCount: 2,
        totalTokenCount: 3,
        cachedContentTokenCount: 0,
      });

      expect(writeFileSpy).toHaveBeenCalled();
      const conversation = JSON.parse(
        writeFileSpy.mock.calls[0][1] as string,
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

    it('should queue token info if the last message already has tokens', async () => {
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
      vi.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify(initialConversation),
      );

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
  });

  describe('recordToolCalls', () => {
    beforeEach(async () => {
      await chatRecordingService.initialize();
    });

    it('should add new tool calls to the last message', async () => {
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
      vi.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify(initialConversation),
      );

      // clear previous calls
      writeFileSpy.mockClear();

      const toolCall: ToolCallRecord = {
        id: 'tool-1',
        name: 'testTool',
        args: {},
        status: 'awaiting_approval',
        timestamp: new Date().toISOString(),
      };
      await chatRecordingService.recordToolCalls('gemini-pro', [toolCall]);

      expect(writeFileSpy).toHaveBeenCalled();
      const conversation = JSON.parse(
        writeFileSpy.mock.calls[0][1] as string,
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

    it('should create a new message if the last message is not from gemini', async () => {
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
      vi.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify(initialConversation),
      );

      // clear previous calls
      writeFileSpy.mockClear();

      const toolCall: ToolCallRecord = {
        id: 'tool-1',
        name: 'testTool',
        args: {},
        status: 'awaiting_approval',
        timestamp: new Date().toISOString(),
      };
      await chatRecordingService.recordToolCalls('gemini-pro', [toolCall]);

      expect(writeFileSpy).toHaveBeenCalled();
      const conversation = JSON.parse(
        writeFileSpy.mock.calls[0][1] as string,
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
    it('should delete the session file', async () => {
      const unlinkSpy = vi.spyOn(fs, 'unlink').mockResolvedValue(undefined);
      await chatRecordingService.deleteSession('test-session-id');
      expect(unlinkSpy).toHaveBeenCalledWith(
        '/test/project/root/.gemini/tmp/chats/test-session-id.json',
      );
    });
  });

  describe('Security', () => {
    it('should throw an error if resumed session path is outside the allowed directory', async () => {
      const maliciousPath = '/test/project/root/.gemini/tmp/../../etc/passwd';

      // Override default resolve mock for this test
      vi.mocked(path.resolve)
        .mockReturnValueOnce('/etc/passwd') // resolve(filePath)
        .mockReturnValueOnce('/test/project/root/.gemini/tmp/chats'); // resolve(chatsDir)

      await expect(
        chatRecordingService.initialize({
          filePath: maliciousPath,
          conversation: {
            sessionId: 'old-session-id',
          } as ConversationRecord,
        }),
      ).rejects.toThrow('Invalid conversation file path');
    });

    it('should throw an error if deleteSession is called with a path traversal sessionId', async () => {
      const maliciousSessionId = '../../target';

      // Override default resolve mock for this test
      vi.mocked(path.resolve).mockImplementation((...args) => {
        const joined = args.join('/');
        if (joined.includes('chats/../../target.json')) {
          return '/test/project/root/.gemini/tmp/target.json';
        }
        if (joined.includes('chats')) {
          return '/test/project/root/.gemini/tmp/chats';
        }
        return joined;
      });

      await expect(
        chatRecordingService.deleteSession(maliciousSessionId),
      ).rejects.toThrow('Invalid session ID');
    });
  });
});
