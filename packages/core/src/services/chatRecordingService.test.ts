/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  ConversationRecord,
  ToolCallRecord,
  MessageRecord,
} from './chatRecordingService.js';
import type { Content, Part } from '@google/genai';
import { ChatRecordingService } from './chatRecordingService.js';
import type { Config } from '../config/config.js';
import { getProjectHash } from '../utils/paths.js';

vi.mock('../utils/paths.js');
vi.mock('node:crypto', () => {
  let count = 0;
  return {
    randomUUID: vi.fn(() => `test-uuid-${count++}`),
    createHash: vi.fn(() => ({
      update: vi.fn(() => ({
        digest: vi.fn(() => 'mocked-hash'),
      })),
    })),
  };
});

describe('ChatRecordingService', () => {
  let chatRecordingService: ChatRecordingService;
  let mockConfig: Config;
  let testTempDir: string;

  beforeEach(async () => {
    testTempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'chat-recording-test-'),
    );

    mockConfig = {
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getProjectRoot: vi.fn().mockReturnValue('/test/project/root'),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue(testTempDir),
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
    chatRecordingService = new ChatRecordingService(mockConfig);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (testTempDir) {
      await fs.promises.rm(testTempDir, { recursive: true, force: true });
    }
  });

  describe('initialize', () => {
    it('should create a new session if none is provided', () => {
      chatRecordingService.initialize();
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'ping',
        model: 'm',
      });

      const chatsDir = path.join(testTempDir, 'chats');
      expect(fs.existsSync(chatsDir)).toBe(true);
      const files = fs.readdirSync(chatsDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toMatch(/^session-.*-test-ses\.json$/);
    });

    it('should resume from an existing session if provided', () => {
      const chatsDir = path.join(testTempDir, 'chats');
      fs.mkdirSync(chatsDir, { recursive: true });
      const sessionFile = path.join(chatsDir, 'session.json');
      const initialData = {
        sessionId: 'old-session-id',
        projectHash: 'test-project-hash',
        messages: [],
      };
      fs.writeFileSync(sessionFile, JSON.stringify(initialData));

      chatRecordingService.initialize({
        filePath: sessionFile,
        conversation: {
          sessionId: 'old-session-id',
        } as ConversationRecord,
      });

      const conversation = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      expect(conversation.sessionId).toBe('old-session-id');
    });
  });

  describe('recordMessage', () => {
    beforeEach(() => {
      chatRecordingService.initialize();
    });

    it('should record a new message', () => {
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'Hello',
        displayContent: 'User Hello',
        model: 'gemini-pro',
      });

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = JSON.parse(
        fs.readFileSync(sessionFile, 'utf8'),
      ) as ConversationRecord;

      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].content).toBe('Hello');
      expect(conversation.messages[0].displayContent).toBe('User Hello');
      expect(conversation.messages[0].type).toBe('user');
    });

    it('should create separate messages when recording multiple messages', () => {
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'World',
        model: 'gemini-pro',
      });

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = JSON.parse(
        fs.readFileSync(sessionFile, 'utf8'),
      ) as ConversationRecord;
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].content).toBe('World');
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
    });
  });

  describe('recordMessageTokens', () => {
    beforeEach(() => {
      chatRecordingService.initialize();
    });

    it('should update the last message with token info', () => {
      chatRecordingService.recordMessage({
        type: 'gemini',
        content: 'Response',
        model: 'gemini-pro',
      });

      chatRecordingService.recordMessageTokens({
        promptTokenCount: 1,
        candidatesTokenCount: 2,
        totalTokenCount: 3,
        cachedContentTokenCount: 0,
      });

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = JSON.parse(
        fs.readFileSync(sessionFile, 'utf8'),
      ) as ConversationRecord;
      const geminiMsg = conversation.messages[0] as MessageRecord & {
        type: 'gemini';
      };
      expect(geminiMsg.tokens).toEqual({
        input: 1,
        output: 2,
        total: 3,
        cached: 0,
        thoughts: 0,
        tool: 0,
      });
    });

    it('should queue token info if the last message already has tokens', () => {
      chatRecordingService.recordMessage({
        type: 'gemini',
        content: 'Response',
        model: 'gemini-pro',
      });

      chatRecordingService.recordMessageTokens({
        promptTokenCount: 1,
        candidatesTokenCount: 1,
        totalTokenCount: 2,
        cachedContentTokenCount: 0,
      });

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
      chatRecordingService.recordMessage({
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
      chatRecordingService.recordToolCalls('gemini-pro', [toolCall]);

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = JSON.parse(
        fs.readFileSync(sessionFile, 'utf8'),
      ) as ConversationRecord;
      const geminiMsg = conversation.messages[0] as MessageRecord & {
        type: 'gemini';
      };
      expect(geminiMsg.toolCalls).toHaveLength(1);
      expect(geminiMsg.toolCalls![0].name).toBe('testTool');
    });

    it('should create a new message if the last message is not from gemini', () => {
      chatRecordingService.recordMessage({
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
      chatRecordingService.recordToolCalls('gemini-pro', [toolCall]);

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = JSON.parse(
        fs.readFileSync(sessionFile, 'utf8'),
      ) as ConversationRecord;
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[1].type).toBe('gemini');
      expect(
        (conversation.messages[1] as MessageRecord & { type: 'gemini' })
          .toolCalls,
      ).toHaveLength(1);
    });
  });

  describe('deleteSession', () => {
    it('should delete the session file and tool outputs if they exist', () => {
      const chatsDir = path.join(testTempDir, 'chats');
      fs.mkdirSync(chatsDir, { recursive: true });
      const sessionFile = path.join(chatsDir, 'test-session-id.json');
      fs.writeFileSync(sessionFile, '{}');

      const toolOutputDir = path.join(
        testTempDir,
        'tool-outputs',
        'session-test-session-id',
      );
      fs.mkdirSync(toolOutputDir, { recursive: true });

      chatRecordingService.deleteSession('test-session-id');

      expect(fs.existsSync(sessionFile)).toBe(false);
      expect(fs.existsSync(toolOutputDir)).toBe(false);
    });

    it('should not throw if session file does not exist', () => {
      expect(() =>
        chatRecordingService.deleteSession('non-existent'),
      ).not.toThrow();
    });
  });

  describe('recordDirectories', () => {
    beforeEach(() => {
      chatRecordingService.initialize();
    });

    it('should save directories to the conversation', () => {
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'ping',
        model: 'm',
      });
      chatRecordingService.recordDirectories([
        '/path/to/dir1',
        '/path/to/dir2',
      ]);

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = JSON.parse(
        fs.readFileSync(sessionFile, 'utf8'),
      ) as ConversationRecord;
      expect(conversation.directories).toEqual([
        '/path/to/dir1',
        '/path/to/dir2',
      ]);
    });

    it('should overwrite existing directories', () => {
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'ping',
        model: 'm',
      });
      chatRecordingService.recordDirectories(['/old/dir']);
      chatRecordingService.recordDirectories(['/new/dir1', '/new/dir2']);

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = JSON.parse(
        fs.readFileSync(sessionFile, 'utf8'),
      ) as ConversationRecord;
      expect(conversation.directories).toEqual(['/new/dir1', '/new/dir2']);
    });
  });

  describe('rewindTo', () => {
    it('should rewind the conversation to a specific message ID', () => {
      chatRecordingService.initialize();
      // Record some messages
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'msg1',
        model: 'm',
      });
      chatRecordingService.recordMessage({
        type: 'gemini',
        content: 'msg2',
        model: 'm',
      });
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'msg3',
        model: 'm',
      });

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      let conversation = JSON.parse(
        fs.readFileSync(sessionFile, 'utf8'),
      ) as ConversationRecord;
      const secondMsgId = conversation.messages[1].id;

      const result = chatRecordingService.rewindTo(secondMsgId);

      expect(result).not.toBeNull();
      expect(result!.messages).toHaveLength(1);
      expect(result!.messages[0].content).toBe('msg1');

      conversation = JSON.parse(
        fs.readFileSync(sessionFile, 'utf8'),
      ) as ConversationRecord;
      expect(conversation.messages).toHaveLength(1);
    });

    it('should return the original conversation if the message ID is not found', () => {
      chatRecordingService.initialize();
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'msg1',
        model: 'm',
      });

      const result = chatRecordingService.rewindTo('non-existent');

      expect(result).not.toBeNull();
      expect(result!.messages).toHaveLength(1);
    });
  });

  describe('ENOSPC (disk full) graceful degradation - issue #16266', () => {
    it('should disable recording and not throw when ENOSPC occurs during initialize', () => {
      const enospcError = new Error('ENOSPC: no space left on device');
      (enospcError as NodeJS.ErrnoException).code = 'ENOSPC';

      const mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
        throw enospcError;
      });

      // Should not throw
      expect(() => chatRecordingService.initialize()).not.toThrow();

      // Recording should be disabled (conversationFile set to null)
      expect(chatRecordingService.getConversationFilePath()).toBeNull();
      mkdirSyncSpy.mockRestore();
    });

    it('should disable recording and not throw when ENOSPC occurs during writeConversation', () => {
      chatRecordingService.initialize();

      const enospcError = new Error('ENOSPC: no space left on device');
      (enospcError as NodeJS.ErrnoException).code = 'ENOSPC';

      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => {
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
      writeFileSyncSpy.mockRestore();
    });

    it('should skip recording operations when recording is disabled', () => {
      chatRecordingService.initialize();

      const enospcError = new Error('ENOSPC: no space left on device');
      (enospcError as NodeJS.ErrnoException).code = 'ENOSPC';

      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementationOnce(() => {
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
      writeFileSyncSpy.mockRestore();
    });

    it('should return null from getConversation when recording is disabled', () => {
      chatRecordingService.initialize();

      const enospcError = new Error('ENOSPC: no space left on device');
      (enospcError as NodeJS.ErrnoException).code = 'ENOSPC';

      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => {
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
      writeFileSyncSpy.mockRestore();
    });

    it('should still throw for non-ENOSPC errors', () => {
      chatRecordingService.initialize();

      const otherError = new Error('Permission denied');
      (otherError as NodeJS.ErrnoException).code = 'EACCES';

      const writeFileSyncSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => {
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
      writeFileSyncSpy.mockRestore();
    });
  });

  describe('updateMessagesFromHistory', () => {
    beforeEach(() => {
      chatRecordingService.initialize();
    });

    it('should update tool results from API history (masking sync)', () => {
      // 1. Record an initial message and tool call
      chatRecordingService.recordMessage({
        type: 'gemini',
        content: 'I will list the files.',
        model: 'gemini-pro',
      });

      const callId = 'tool-call-123';
      const originalResult = [{ text: 'a'.repeat(1000) }];
      chatRecordingService.recordToolCalls('gemini-pro', [
        {
          id: callId,
          name: 'list_files',
          args: { path: '.' },
          result: originalResult,
          status: 'success',
          timestamp: new Date().toISOString(),
        },
      ]);

      // 2. Prepare mock history with masked content
      const maskedSnippet =
        '<tool_output_masked>short preview</tool_output_masked>';
      const history: Content[] = [
        {
          role: 'model',
          parts: [
            { functionCall: { name: 'list_files', args: { path: '.' } } },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'list_files',
                id: callId,
                response: { output: maskedSnippet },
              },
            },
          ],
        },
      ];

      // 3. Trigger sync
      chatRecordingService.updateMessagesFromHistory(history);

      // 4. Verify disk content
      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = JSON.parse(
        fs.readFileSync(sessionFile, 'utf8'),
      ) as ConversationRecord;

      const geminiMsg = conversation.messages[0];
      if (geminiMsg.type !== 'gemini')
        throw new Error('Expected gemini message');
      expect(geminiMsg.toolCalls).toBeDefined();
      expect(geminiMsg.toolCalls![0].id).toBe(callId);
      // The implementation stringifies the response object
      const result = geminiMsg.toolCalls![0].result;
      if (!Array.isArray(result)) throw new Error('Expected array result');
      const firstPart = result[0] as Part;
      expect(firstPart.functionResponse).toBeDefined();
      expect(firstPart.functionResponse!.id).toBe(callId);
      expect(firstPart.functionResponse!.response).toEqual({
        output: maskedSnippet,
      });
    });
    it('should preserve multi-modal sibling parts during sync', () => {
      chatRecordingService.initialize();
      const callId = 'multi-modal-call';
      const originalResult: Part[] = [
        {
          functionResponse: {
            id: callId,
            name: 'read_file',
            response: { content: '...' },
          },
        },
        { inlineData: { mimeType: 'image/png', data: 'base64...' } },
      ];

      chatRecordingService.recordMessage({
        type: 'gemini',
        content: '',
        model: 'gemini-pro',
      });

      chatRecordingService.recordToolCalls('gemini-pro', [
        {
          id: callId,
          name: 'read_file',
          args: { path: 'image.png' },
          result: originalResult,
          status: 'success',
          timestamp: new Date().toISOString(),
        },
      ]);

      const maskedSnippet = '<masked>';
      const history: Content[] = [
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'read_file',
                id: callId,
                response: { output: maskedSnippet },
              },
            },
            { inlineData: { mimeType: 'image/png', data: 'base64...' } },
          ],
        },
      ];

      chatRecordingService.updateMessagesFromHistory(history);

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = JSON.parse(
        fs.readFileSync(sessionFile, 'utf8'),
      ) as ConversationRecord;

      const lastMsg = conversation.messages[0] as MessageRecord & {
        type: 'gemini';
      };
      const result = lastMsg.toolCalls![0].result as Part[];
      expect(result).toHaveLength(2);
      expect(result[0].functionResponse!.response).toEqual({
        output: maskedSnippet,
      });
      expect(result[1].inlineData).toBeDefined();
      expect(result[1].inlineData!.mimeType).toBe('image/png');
    });

    it('should handle parts appearing BEFORE the functionResponse in a content block', () => {
      chatRecordingService.initialize();
      const callId = 'prefix-part-call';

      chatRecordingService.recordMessage({
        type: 'gemini',
        content: '',
        model: 'gemini-pro',
      });

      chatRecordingService.recordToolCalls('gemini-pro', [
        {
          id: callId,
          name: 'read_file',
          args: { path: 'test.txt' },
          result: [],
          status: 'success',
          timestamp: new Date().toISOString(),
        },
      ]);

      const history: Content[] = [
        {
          role: 'user',
          parts: [
            { text: 'Prefix metadata or text' },
            {
              functionResponse: {
                name: 'read_file',
                id: callId,
                response: { output: 'file content' },
              },
            },
          ],
        },
      ];

      chatRecordingService.updateMessagesFromHistory(history);

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = JSON.parse(
        fs.readFileSync(sessionFile, 'utf8'),
      ) as ConversationRecord;

      const lastMsg = conversation.messages[0] as MessageRecord & {
        type: 'gemini';
      };
      const result = lastMsg.toolCalls![0].result as Part[];
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Prefix metadata or text');
      expect(result[1].functionResponse!.id).toBe(callId);
    });
  });
});
