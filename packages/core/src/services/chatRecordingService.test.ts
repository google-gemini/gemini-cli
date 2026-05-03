/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const fsModule = {
    ...actual,
    mkdirSync: vi.fn(actual.mkdirSync),
    appendFileSync: vi.fn(actual.appendFileSync),
    writeFileSync: vi.fn(actual.writeFileSync),
    readFileSync: vi.fn(actual.readFileSync),
    unlinkSync: vi.fn(actual.unlinkSync),
    existsSync: vi.fn(actual.existsSync),
    readdirSync: vi.fn(actual.readdirSync),
    promises: {
      ...actual.promises,
      stat: vi.fn(actual.promises.stat),
      readFile: vi.fn(actual.promises.readFile),
      unlink: vi.fn(actual.promises.unlink),
      readdir: vi.fn(actual.promises.readdir),
      open: vi.fn(actual.promises.open),
      rm: vi.fn(actual.promises.rm),
      mkdir: vi.fn(actual.promises.mkdir),
      writeFile: vi.fn(actual.promises.writeFile),
    },
  };
  return {
    ...fsModule,
    default: fsModule,
  };
});

import {
  ChatRecordingService,
  loadConversationRecord,
  type ConversationRecord,
  type ToolCallRecord,
  type MessageRecord,
} from './chatRecordingService.js';
import type { WorkspaceContext } from '../utils/workspaceContext.js';
import { CoreToolCallStatus } from '../scheduler/types.js';
import type { Content, Part } from '@google/genai';
import type { Config } from '../config/config.js';
import { getProjectHash } from '../utils/paths.js';

vi.mock('../utils/paths.js');
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  let count = 0;
  return {
    ...actual,
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

  afterEach(() => {
    vi.restoreAllMocks();
  });
  beforeEach(async () => {
    testTempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'chat-recording-test-'),
    );

    mockConfig = {
      get config() {
        return this;
      },
      toolRegistry: {
        getTool: vi.fn(),
      },
      promptId: 'test-session-id',
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getProjectRoot: vi.fn().mockReturnValue('/test/project/root'),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue(testTempDir),
      },
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getDebugMode: vi.fn().mockReturnValue(false),
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue([]),
      }),
      getToolRegistry: vi.fn().mockReturnValue({
        getTool: vi.fn().mockReturnValue({
          displayName: 'Test Tool',
          description: 'A test tool',
          isOutputMarkdown: false,
        }),
      }),
    } as unknown as Config;

    // Ensure mockConfig.config points to itself for AgentLoopContext parity
    Object.defineProperty(mockConfig, 'config', {
      get() {
        return mockConfig;
      },
    });

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
    it('should create a new session if none is provided', async () => {
      await chatRecordingService.initialize();
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'ping',
        model: 'm',
      });

      const chatsDir = path.join(testTempDir, 'chats');
      expect(fs.existsSync(chatsDir)).toBe(true);
      const files = fs.readdirSync(chatsDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toMatch(/^session-.*-test-ses\.jsonl$/);
    });

    it('should include the conversation kind when specified', async () => {
      await chatRecordingService.initialize(undefined, 'subagent');
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'ping',
        model: 'm',
      });

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;
      expect(conversation.kind).toBe('subagent');
    });

    it('should create a subdirectory for subagents if parentSessionId is present', async () => {
      const parentSessionId = 'test-parent-uuid';
      Object.defineProperty(mockConfig, 'parentSessionId', {
        value: parentSessionId,
        writable: true,
        configurable: true,
      });

      await chatRecordingService.initialize(undefined, 'subagent');
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'ping',
        model: 'm',
      });

      const chatsDir = path.join(testTempDir, 'chats');
      const subagentDir = path.join(chatsDir, parentSessionId);
      expect(fs.existsSync(subagentDir)).toBe(true);

      const files = fs.readdirSync(subagentDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toBe('test-session-id.jsonl');
    });

    it('should inherit workspace directories for subagents during initialization', async () => {
      const mockDirectories = ['/project/dir1', '/project/dir2'];
      vi.mocked(mockConfig.getWorkspaceContext).mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(mockDirectories),
      } as unknown as WorkspaceContext);

      // Initialize as a subagent
      await chatRecordingService.initialize(undefined, 'subagent');

      // Recording a message triggers the disk write
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'ping',
        model: 'm',
      });

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;

      expect(conversation.kind).toBe('subagent');
      expect(conversation.directories).toEqual(mockDirectories);
    });

    it('should resume from an existing session if provided', async () => {
      const chatsDir = path.join(testTempDir, 'chats');
      fs.mkdirSync(chatsDir, { recursive: true });
      const sessionFile = path.join(chatsDir, 'session.jsonl');
      const initialData = {
        sessionId: 'old-session-id',
        projectHash: 'test-project-hash',
        messages: [],
      };
      fs.writeFileSync(
        sessionFile,
        JSON.stringify({ ...initialData, messages: undefined }) +
          '\n' +
          (initialData.messages || [])
            .map((m: unknown) => JSON.stringify(m))
            .join('\n') +
          '\n',
      );

      await chatRecordingService.initialize({
        filePath: sessionFile,
        conversation: {
          sessionId: 'old-session-id',
        } as ConversationRecord,
      });

      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;
      expect(conversation.sessionId).toBe('old-session-id');
    });
  });

  describe('recordMessage', () => {
    beforeEach(async () => {
      await chatRecordingService.initialize();
    });

    it('should record a new message', async () => {
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'Hello',
        displayContent: 'User Hello',
        model: 'gemini-pro',
      });

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;

      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].content).toBe('Hello');
      expect(conversation.messages[0].displayContent).toBe('User Hello');
      expect(conversation.messages[0].type).toBe('user');
    });

    it('should create separate messages when recording multiple messages', async () => {
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'World',
        model: 'gemini-pro',
      });

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].content).toBe('World');
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
    });
  });

  describe('recordMessageTokens', () => {
    beforeEach(async () => {
      await chatRecordingService.initialize();
    });

    it('should update the last message with token info', async () => {
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
      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;
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

    it('should queue token info if the last message already has tokens', async () => {
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

    it('should not write to disk when queuing tokens (no last gemini message)', async () => {
      const appendFileSyncSpy = vi.mocked(fs.appendFileSync);

      // Clear spy call count after initialize writes the initial file
      appendFileSyncSpy.mockClear();

      // No gemini message recorded yet, so tokens should only be queued
      chatRecordingService.recordMessageTokens({
        promptTokenCount: 5,
        candidatesTokenCount: 10,
        totalTokenCount: 15,
        cachedContentTokenCount: 0,
      });

      // writeFileSync should NOT have been called since we only queued
      expect(appendFileSyncSpy).not.toHaveBeenCalled();

      // @ts-expect-error private property
      expect(chatRecordingService.queuedTokens).toEqual({
        input: 5,
        output: 10,
        total: 15,
        cached: 0,
        thoughts: 0,
        tool: 0,
      });
    });

    it('should not write to disk when queuing tokens (last message already has tokens)', async () => {
      chatRecordingService.recordMessage({
        type: 'gemini',
        content: 'Response',
        model: 'gemini-pro',
      });

      // First recordMessageTokens updates the message and writes to disk
      chatRecordingService.recordMessageTokens({
        promptTokenCount: 1,
        candidatesTokenCount: 1,
        totalTokenCount: 2,
        cachedContentTokenCount: 0,
      });

      const appendFileSyncSpy = vi.mocked(fs.appendFileSync);
      appendFileSyncSpy.mockClear();

      // Second call should only queue, NOT write to disk
      chatRecordingService.recordMessageTokens({
        promptTokenCount: 2,
        candidatesTokenCount: 2,
        totalTokenCount: 4,
        cachedContentTokenCount: 0,
      });

      expect(appendFileSyncSpy).not.toHaveBeenCalled();
    });

    it('should use in-memory cache and not re-read from disk on subsequent operations', async () => {
      chatRecordingService.recordMessage({
        type: 'gemini',
        content: 'Response',
        model: 'gemini-pro',
      });

      const readFileSyncSpy = vi.mocked(fs.readFileSync);
      readFileSyncSpy.mockClear();

      // These operations should all use the in-memory cache
      chatRecordingService.recordMessageTokens({
        promptTokenCount: 1,
        candidatesTokenCount: 1,
        totalTokenCount: 2,
        cachedContentTokenCount: 0,
      });

      chatRecordingService.recordMessage({
        type: 'gemini',
        content: 'Another response',
        model: 'gemini-pro',
      });

      chatRecordingService.saveSummary('Test summary');

      // readFileSync should NOT have been called since we use the in-memory cache
      expect(readFileSyncSpy).not.toHaveBeenCalled();
    });
  });

  describe('recordToolCalls', () => {
    beforeEach(async () => {
      await chatRecordingService.initialize();
    });

    it('should add new tool calls to the last message', async () => {
      chatRecordingService.recordMessage({
        type: 'gemini',
        content: '',
        model: 'gemini-pro',
      });

      const toolCall: ToolCallRecord = {
        id: 'tool-1',
        name: 'testTool',
        args: {},
        status: CoreToolCallStatus.AwaitingApproval,
        timestamp: new Date().toISOString(),
      };
      chatRecordingService.recordToolCalls('gemini-pro', [toolCall]);

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;
      const geminiMsg = conversation.messages[0] as MessageRecord & {
        type: 'gemini';
      };
      expect(geminiMsg.toolCalls).toHaveLength(1);
      expect(geminiMsg.toolCalls![0].name).toBe('testTool');
    });

    it('should preserve dynamic description and NOT overwrite with generic one', async () => {
      chatRecordingService.recordMessage({
        type: 'gemini',
        content: '',
        model: 'gemini-pro',
      });

      const dynamicDescription = 'DYNAMIC DESCRIPTION (e.g. Read file foo.txt)';
      const toolCall: ToolCallRecord = {
        id: 'tool-1',
        name: 'testTool',
        args: {},
        status: CoreToolCallStatus.Success,
        timestamp: new Date().toISOString(),
        description: dynamicDescription,
      };

      chatRecordingService.recordToolCalls('gemini-pro', [toolCall]);

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;
      const geminiMsg = conversation.messages[0] as MessageRecord & {
        type: 'gemini';
      };

      expect(geminiMsg.toolCalls![0].description).toBe(dynamicDescription);
    });

    it('should create a new message if the last message is not from gemini', async () => {
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'call a tool',
        model: 'gemini-pro',
      });

      const toolCall: ToolCallRecord = {
        id: 'tool-1',
        name: 'testTool',
        args: {},
        status: CoreToolCallStatus.AwaitingApproval,
        timestamp: new Date().toISOString(),
      };
      chatRecordingService.recordToolCalls('gemini-pro', [toolCall]);

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[1].type).toBe('gemini');
      expect(
        (conversation.messages[1] as MessageRecord & { type: 'gemini' })
          .toolCalls,
      ).toHaveLength(1);
    });

    it('should record agentId when provided', async () => {
      chatRecordingService.recordMessage({
        type: 'gemini',
        content: '',
        model: 'gemini-pro',
      });

      const toolCall: ToolCallRecord = {
        id: 'tool-1',
        name: 'testTool',
        args: {},
        status: CoreToolCallStatus.Success,
        timestamp: new Date().toISOString(),
        agentId: 'test-agent-id',
      };
      chatRecordingService.recordToolCalls('gemini-pro', [toolCall]);

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;
      const geminiMsg = conversation.messages[0] as MessageRecord & {
        type: 'gemini';
      };
      expect(geminiMsg.toolCalls).toHaveLength(1);
      expect(geminiMsg.toolCalls![0].agentId).toBe('test-agent-id');
    });
  });

  describe('deleteSession', () => {
    it('should delete the session file, tool outputs, session directory, and logs if they exist', async () => {
      const sessionId = 'test-session-id';
      const shortId = '12345678';
      const chatsDir = path.join(testTempDir, 'chats');
      const logsDir = path.join(testTempDir, 'logs');
      const toolOutputsDir = path.join(testTempDir, 'tool-outputs');
      const sessionDir = path.join(testTempDir, sessionId);

      fs.mkdirSync(chatsDir, { recursive: true });
      fs.mkdirSync(logsDir, { recursive: true });
      fs.mkdirSync(toolOutputsDir, { recursive: true });
      fs.mkdirSync(sessionDir, { recursive: true });

      // Create main session file with timestamp
      const sessionFile = path.join(
        chatsDir,
        `session-2023-01-01T00-00-${shortId}.jsonl`,
      );
      fs.writeFileSync(sessionFile, JSON.stringify({ sessionId }) + '\n');

      const logFile = path.join(logsDir, `session-${sessionId}.jsonl`);
      fs.writeFileSync(logFile, '{}');

      const toolOutputDir = path.join(toolOutputsDir, `session-${sessionId}`);
      fs.mkdirSync(toolOutputDir, { recursive: true });

      // Call with shortId
      await chatRecordingService.deleteSession(shortId);

      expect(fs.existsSync(sessionFile)).toBe(false);
      expect(fs.existsSync(logFile)).toBe(false);
      expect(fs.existsSync(toolOutputDir)).toBe(false);
      expect(fs.existsSync(sessionDir)).toBe(false);
    });

    it('should delete legacy pretty-printed session files and their artifacts', async () => {
      const sessionId = 'legacy-uuid';
      const shortId = 'legacy12';
      const chatsDir = path.join(testTempDir, 'chats');
      const toolOutputsDir = path.join(testTempDir, 'tool-outputs');

      fs.mkdirSync(chatsDir, { recursive: true });
      fs.mkdirSync(toolOutputsDir, { recursive: true });

      const sessionFile = path.join(
        chatsDir,
        `session-2023-01-01T00-00-${shortId}.json`,
      );
      // Pretty-printed JSON (not JSONL)
      fs.writeFileSync(
        sessionFile,
        JSON.stringify({ sessionId, messages: [] }, null, 2),
      );

      const toolOutputDir = path.join(toolOutputsDir, `session-${sessionId}`);
      fs.mkdirSync(toolOutputDir, { recursive: true });
      fs.writeFileSync(path.join(toolOutputDir, 'output.txt'), 'data');

      await chatRecordingService.deleteSession(shortId);

      expect(fs.existsSync(sessionFile)).toBe(false);
      expect(fs.existsSync(toolOutputDir)).toBe(false);
    });

    it('should delete the session file even if it is corrupted (invalid JSON)', async () => {
      const shortId = 'corrupt1';
      const chatsDir = path.join(testTempDir, 'chats');

      fs.mkdirSync(chatsDir, { recursive: true });

      const sessionFile = path.join(
        chatsDir,
        `session-2023-01-01T00-00-${shortId}.jsonl`,
      );
      fs.writeFileSync(sessionFile, 'not-json');

      await chatRecordingService.deleteSession(shortId);

      expect(fs.existsSync(sessionFile)).toBe(false);
    });

    it('should delete subagent files and their logs when parent is deleted', async () => {
      const parentSessionId = '12345678-session-id';
      const shortId = '12345678';
      const subagentSessionId = 'subagent-session-id';
      const chatsDir = path.join(testTempDir, 'chats');
      const logsDir = path.join(testTempDir, 'logs');
      const toolOutputsDir = path.join(testTempDir, 'tool-outputs');

      fs.mkdirSync(chatsDir, { recursive: true });
      fs.mkdirSync(logsDir, { recursive: true });
      fs.mkdirSync(toolOutputsDir, { recursive: true });

      // Create parent session file
      const parentFile = path.join(
        chatsDir,
        `session-2023-01-01T00-00-${shortId}.jsonl`,
      );
      fs.writeFileSync(
        parentFile,
        JSON.stringify({ sessionId: parentSessionId }) + '\n',
      );

      // Create subagent session file in subdirectory
      const subagentDir = path.join(chatsDir, parentSessionId);
      fs.mkdirSync(subagentDir, { recursive: true });
      const subagentFile = path.join(subagentDir, `${subagentSessionId}.jsonl`);
      fs.writeFileSync(
        subagentFile,
        JSON.stringify({ sessionId: subagentSessionId, kind: 'subagent' }) +
          '\n',
      );

      // Create logs for both
      const parentLog = path.join(logsDir, `session-${parentSessionId}.jsonl`);
      fs.writeFileSync(parentLog, '{}');
      const subagentLog = path.join(
        logsDir,
        `session-${subagentSessionId}.jsonl`,
      );
      fs.writeFileSync(subagentLog, '{}');

      // Create tool outputs for both
      const parentToolOutputDir = path.join(
        toolOutputsDir,
        `session-${parentSessionId}`,
      );
      fs.mkdirSync(parentToolOutputDir, { recursive: true });
      const subagentToolOutputDir = path.join(
        toolOutputsDir,
        `session-${subagentSessionId}`,
      );
      fs.mkdirSync(subagentToolOutputDir, { recursive: true });

      // Call with parent sessionId
      await chatRecordingService.deleteSession(parentSessionId);

      expect(fs.existsSync(parentFile)).toBe(false);
      expect(fs.existsSync(subagentFile)).toBe(false);
      expect(fs.existsSync(subagentDir)).toBe(false); // Subagent directory should be deleted
      expect(fs.existsSync(parentLog)).toBe(false);
      expect(fs.existsSync(subagentLog)).toBe(false);
      expect(fs.existsSync(parentToolOutputDir)).toBe(false);
      expect(fs.existsSync(subagentToolOutputDir)).toBe(false);
    });

    it('should delete subagent files and their logs when parent is deleted (legacy flat structure)', async () => {
      const parentSessionId = '12345678-session-id';
      const shortId = '12345678';
      const subagentSessionId = 'subagent-session-id';
      const chatsDir = path.join(testTempDir, 'chats');
      const logsDir = path.join(testTempDir, 'logs');

      fs.mkdirSync(chatsDir, { recursive: true });
      fs.mkdirSync(logsDir, { recursive: true });

      // Create parent session file
      const parentFile = path.join(
        chatsDir,
        `session-2023-01-01T00-00-${shortId}.jsonl`,
      );
      fs.writeFileSync(
        parentFile,
        JSON.stringify({ sessionId: parentSessionId }) + '\n',
      );

      // Create legacy subagent session file (flat in chatsDir)
      const subagentFile = path.join(
        chatsDir,
        `session-2023-01-01T00-01-${shortId}.jsonl`,
      );
      fs.writeFileSync(
        subagentFile,
        JSON.stringify({ sessionId: subagentSessionId, kind: 'subagent' }) +
          '\n',
      );

      // Call with parent sessionId
      await chatRecordingService.deleteSession(parentSessionId);

      expect(fs.existsSync(parentFile)).toBe(false);
      expect(fs.existsSync(subagentFile)).toBe(false);
    });

    it('should delete by basename', async () => {
      const sessionId = 'test-session-id';
      const shortId = '12345678';
      const chatsDir = path.join(testTempDir, 'chats');
      const logsDir = path.join(testTempDir, 'logs');

      fs.mkdirSync(chatsDir, { recursive: true });
      fs.mkdirSync(logsDir, { recursive: true });

      const basename = `session-2023-01-01T00-00-${shortId}`;
      const sessionFile = path.join(chatsDir, `${basename}.jsonl`);
      fs.writeFileSync(sessionFile, JSON.stringify({ sessionId }) + '\n');

      const logFile = path.join(logsDir, `session-${sessionId}.jsonl`);
      fs.writeFileSync(logFile, '{}');

      // Call with basename
      await chatRecordingService.deleteSession(basename);

      expect(fs.existsSync(sessionFile)).toBe(false);
      expect(fs.existsSync(logFile)).toBe(false);
    });

    it('should not throw if session file does not exist', async () => {
      await expect(
        chatRecordingService.deleteSession('non-existent'),
      ).resolves.not.toThrow();
    });
  });

  describe('deleteCurrentSessionAsync', () => {
    it('should asynchronously delete the current session file and tool outputs', async () => {
      await chatRecordingService.initialize();
      // Record a message to trigger the file write (writeConversation skips
      // writing when there are no messages).
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'test',
        model: 'gemini-pro',
      });
      const conversationFile = chatRecordingService.getConversationFilePath();
      expect(conversationFile).not.toBeNull();

      // Create a tool output directory matching the session ID used by
      // deleteSessionArtifactsAsync (this.sessionId = mockConfig.promptId).
      const toolOutputDir = path.join(
        testTempDir,
        'tool-outputs',
        'session-test-session-id',
      );
      fs.mkdirSync(toolOutputDir, { recursive: true });
      fs.writeFileSync(path.join(toolOutputDir, 'output.txt'), 'data');

      expect(fs.existsSync(conversationFile!)).toBe(true);
      expect(fs.existsSync(toolOutputDir)).toBe(true);

      await chatRecordingService.deleteCurrentSessionAsync();

      expect(fs.existsSync(conversationFile!)).toBe(false);
      expect(fs.existsSync(toolOutputDir)).toBe(false);
    });

    it('should not throw if the session was never initialized', async () => {
      // conversationFile is null when not initialized
      await expect(
        chatRecordingService.deleteCurrentSessionAsync(),
      ).resolves.not.toThrow();
    });

    it('should not throw if session file does not exist on disk', async () => {
      // initialize() writes an initial metadata record synchronously, so
      // delete the file manually to simulate the "missing on disk" scenario.
      await chatRecordingService.initialize();
      const conversationFile = chatRecordingService.getConversationFilePath();
      expect(conversationFile).not.toBeNull();
      if (conversationFile && fs.existsSync(conversationFile)) {
        fs.unlinkSync(conversationFile);
      }
      expect(fs.existsSync(conversationFile!)).toBe(false);

      await expect(
        chatRecordingService.deleteCurrentSessionAsync(),
      ).resolves.not.toThrow();
    });
  });

  describe('recordDirectories', () => {
    beforeEach(async () => {
      await chatRecordingService.initialize();
    });

    it('should save directories to the conversation', async () => {
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
      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;
      expect(conversation.directories).toEqual([
        '/path/to/dir1',
        '/path/to/dir2',
      ]);
    });

    it('should overwrite existing directories', async () => {
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'ping',
        model: 'm',
      });
      chatRecordingService.recordDirectories(['/old/dir']);
      chatRecordingService.recordDirectories(['/new/dir1', '/new/dir2']);

      const sessionFile = chatRecordingService.getConversationFilePath()!;
      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;
      expect(conversation.directories).toEqual(['/new/dir1', '/new/dir2']);
    });
  });

  describe('rewindTo', () => {
    it('should rewind the conversation to a specific message ID', async () => {
      await chatRecordingService.initialize();
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
      let conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;
      const secondMsgId = conversation.messages[1].id;

      const result = chatRecordingService.rewindTo(secondMsgId);

      expect(result).not.toBeNull();
      expect(result!.messages).toHaveLength(1);
      expect(result!.messages[0].content).toBe('msg1');

      conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;
      expect(conversation.messages).toHaveLength(1);
    });

    it('should return the original conversation if the message ID is not found', async () => {
      await chatRecordingService.initialize();
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
    it('should disable recording and not throw when ENOSPC occurs during initialize', async () => {
      const enospcError = new Error('ENOSPC: no space left on device');
      (enospcError as NodeJS.ErrnoException).code = 'ENOSPC';

      const mkdirSyncSpy = vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw enospcError;
      });

      // Should not throw
      await expect(chatRecordingService.initialize()).resolves.not.toThrow();

      // Recording should be disabled (conversationFile set to null)
      expect(chatRecordingService.getConversationFilePath()).toBeNull();
      mkdirSyncSpy.mockRestore();
    });

    it('should disable recording and not throw when ENOSPC occurs during writeConversation', async () => {
      await chatRecordingService.initialize();

      const enospcError = new Error('ENOSPC: no space left on device');
      (enospcError as NodeJS.ErrnoException).code = 'ENOSPC';

      vi.mocked(fs.appendFileSync).mockImplementation(() => {
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

    it('should skip recording operations when recording is disabled', async () => {
      await chatRecordingService.initialize();

      const enospcError = new Error('ENOSPC: no space left on device');
      (enospcError as NodeJS.ErrnoException).code = 'ENOSPC';

      const appendFileSyncSpy = vi
        .mocked(fs.appendFileSync)
        .mockImplementationOnce(() => {
          throw enospcError;
        });

      chatRecordingService.recordMessage({
        type: 'user',
        content: 'First message',
        model: 'gemini-pro',
      });

      // Reset mock to track subsequent calls
      appendFileSyncSpy.mockClear();

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
      expect(appendFileSyncSpy).not.toHaveBeenCalled();
    });

    it('should return null from getConversation when recording is disabled', async () => {
      await chatRecordingService.initialize();

      const enospcError = new Error('ENOSPC: no space left on device');
      (enospcError as NodeJS.ErrnoException).code = 'ENOSPC';

      vi.mocked(fs.appendFileSync).mockImplementation(() => {
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

    it('should still throw for non-ENOSPC errors', async () => {
      await chatRecordingService.initialize();

      const otherError = new Error('Permission denied');
      (otherError as NodeJS.ErrnoException).code = 'EACCES';

      vi.mocked(fs.appendFileSync).mockImplementation(() => {
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

  describe('updateMessagesFromHistory', () => {
    beforeEach(async () => {
      await chatRecordingService.initialize();
    });

    it('should update tool results from API history (masking sync)', async () => {
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
          status: CoreToolCallStatus.Success,
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
      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;

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
    it('should preserve multi-modal sibling parts during sync', async () => {
      await chatRecordingService.initialize();
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
          status: CoreToolCallStatus.Success,
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
      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;

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

    it('should handle parts appearing BEFORE the functionResponse in a content block', async () => {
      await chatRecordingService.initialize();
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
          status: CoreToolCallStatus.Success,
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
      const conversation = (await loadConversationRecord(
        sessionFile,
      )) as ConversationRecord;

      const lastMsg = conversation.messages[0] as MessageRecord & {
        type: 'gemini';
      };
      const result = lastMsg.toolCalls![0].result as Part[];
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Prefix metadata or text');
      expect(result[1].functionResponse!.id).toBe(callId);
    });

    it('should not write to disk when no tool calls match', async () => {
      chatRecordingService.recordMessage({
        type: 'gemini',
        content: 'Response with no tool calls',
        model: 'gemini-pro',
      });

      const appendFileSyncSpy = vi.mocked(fs.appendFileSync);
      appendFileSyncSpy.mockClear();

      // History with a tool call ID that doesn't exist in the conversation
      const history: Content[] = [
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'read_file',
                id: 'nonexistent-call-id',
                response: { output: 'some content' },
              },
            },
          ],
        },
      ];

      chatRecordingService.updateMessagesFromHistory(history);

      // No tool calls matched, so writeFileSync should NOT have been called
      expect(appendFileSyncSpy).not.toHaveBeenCalled();
    });
  });

  describe('ENOENT (missing directory) handling', () => {
    it('should ensure directory exists before writing conversation file', async () => {
      await chatRecordingService.initialize();

      const mkdirSyncSpy = vi.mocked(fs.mkdirSync);
      const appendFileSyncSpy = vi.mocked(fs.appendFileSync);

      chatRecordingService.recordMessage({
        type: 'user',
        content: 'Hello after dir cleanup',
        model: 'gemini-pro',
      });

      // mkdirSync should be called with the parent directory and recursive option
      const conversationFile = chatRecordingService.getConversationFilePath()!;
      expect(mkdirSyncSpy).toHaveBeenCalledWith(
        path.dirname(conversationFile),
        { recursive: true },
      );

      // mkdirSync should be called before writeFileSync
      const mkdirCallOrder = mkdirSyncSpy.mock.invocationCallOrder;
      const writeCallOrder = appendFileSyncSpy.mock.invocationCallOrder;
      const lastMkdir = mkdirCallOrder[mkdirCallOrder.length - 1];
      const lastWrite = writeCallOrder[writeCallOrder.length - 1];
      expect(lastMkdir).toBeLessThan(lastWrite);

      mkdirSyncSpy.mockRestore();
    });
  });
});
