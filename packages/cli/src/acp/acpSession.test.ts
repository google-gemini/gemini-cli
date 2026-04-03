/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
  type Mocked,
} from 'vitest';
import { Session } from './acpSession.js';
import type * as acp from '@agentclientprotocol/sdk';
import {
  StreamEventType,
  ReadManyFilesTool,
  type GeminiChat,
  type Config,
  type MessageBus,
  LlmRole,
  type GitService,
  type ModelRouterService,
  InvalidStreamError,
} from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CommandHandler } from './acpCommandHandler.js';

vi.mock('node:fs/promises');
vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return {
    ...actual,
    resolve: vi.fn(),
  };
});

vi.mock(
  '@google/gemini-cli-core',
  async (
    importOriginal: () => Promise<typeof import('@google/gemini-cli-core')>,
  ) => {
    const actual = await importOriginal();
    return {
      ...actual,
      updatePolicy: vi.fn(),
      ReadManyFilesTool: vi.fn(),
      logToolCall: vi.fn(),
      processSingleFileContent: vi.fn(),
    };
  },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function* createMockStream(items: any[]) {
  for (const item of items) {
    yield item;
  }
}

describe('Session', () => {
  let mockChat: Mocked<GeminiChat>;
  let mockConfig: Mocked<Config>;
  let mockConnection: Mocked<acp.AgentSideConnection>;
  let session: Session;
  let mockToolRegistry: { getTool: Mock };
  let mockTool: { kind: string; build: Mock };
  let mockMessageBus: Mocked<MessageBus>;

  beforeEach(() => {
    mockChat = {
      sendMessageStream: vi.fn(),
      addHistory: vi.fn(),
      recordCompletedToolCalls: vi.fn(),
      getHistory: vi.fn().mockReturnValue([]),
    } as unknown as Mocked<GeminiChat>;
    mockTool = {
      kind: 'read',
      build: vi.fn().mockReturnValue({
        getDescription: () => 'Test Tool',
        toolLocations: () => [],
        shouldConfirmExecute: vi.fn().mockResolvedValue(null),
        execute: vi.fn().mockResolvedValue({ llmContent: 'Tool Result' }),
      }),
    };
    mockToolRegistry = {
      getTool: vi.fn().mockReturnValue(mockTool),
    };
    mockMessageBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as Mocked<MessageBus>;
    mockConfig = {
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getActiveModel: vi.fn().mockReturnValue('gemini-pro'),
      getModelRouterService: vi.fn().mockReturnValue({
        route: vi.fn().mockResolvedValue({ model: 'resolved-model' }),
      }),
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      getFileService: vi.fn().mockReturnValue({
        shouldIgnoreFile: vi.fn().mockReturnValue(false),
      }),
      getFileFilteringOptions: vi.fn().mockReturnValue({}),
      getFileSystemService: vi.fn().mockReturnValue({}),
      getTargetDir: vi.fn().mockReturnValue('/tmp'),
      getEnableRecursiveFileSearch: vi.fn().mockReturnValue(false),
      getDebugMode: vi.fn().mockReturnValue(false),
      getMessageBus: vi.fn().mockReturnValue(mockMessageBus),
      setApprovalMode: vi.fn(),
      setModel: vi.fn(),
      isPlanEnabled: vi.fn().mockReturnValue(true),
      getCheckpointingEnabled: vi.fn().mockReturnValue(false),
      getGitService: vi.fn().mockResolvedValue({} as GitService),
      validatePathAccess: vi.fn().mockReturnValue(null),
      getWorkspaceContext: vi.fn().mockReturnValue({
        addReadOnlyPath: vi.fn(),
      }),
      waitForMcpInit: vi.fn(),
      getDisableAlwaysAllow: vi.fn().mockReturnValue(false),
      get config() {
        return this;
      },
      get toolRegistry() {
        return mockToolRegistry;
      },
    } as unknown as Mocked<Config>;
    mockConnection = {
      sessionUpdate: vi.fn(),
      requestPermission: vi.fn(),
    } as unknown as Mocked<acp.AgentSideConnection>;

    session = new Session('session-1', mockChat, mockConfig, mockConnection, {
      merged: {
        security: { enablePermanentToolApproval: true },
        mcpServers: {},
      },
      errors: [],
    } as unknown as LoadedSettings);

    (ReadManyFilesTool as unknown as Mock).mockImplementation(() => ({
      name: 'read_many_files',
      kind: 'read',
      build: vi.fn().mockReturnValue({
        getDescription: () => 'Read files',
        toolLocations: () => [],
        execute: vi.fn().mockResolvedValue({
          llmContent: ['--- file.txt ---\n\nFile content\n\n'],
        }),
      }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should send available commands', async () => {
    await session.sendAvailableCommands();

    expect(mockConnection.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sessionUpdate: 'available_commands_update',
        }),
      }),
    );
  });

  it('should await MCP initialization before processing a prompt', async () => {
    const stream = createMockStream([
      {
        type: StreamEventType.CHUNK,
        value: { candidates: [{ content: { parts: [{ text: 'Hi' }] } }] },
      },
    ]);
    mockChat.sendMessageStream.mockResolvedValue(stream);

    await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'test' }],
    });

    expect(mockConfig.waitForMcpInit).toHaveBeenCalledOnce();
  });

  it('should handle prompt with text response', async () => {
    const stream = createMockStream([
      {
        type: StreamEventType.CHUNK,
        value: {
          candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
        },
      },
    ]);
    mockChat.sendMessageStream.mockResolvedValue(stream);

    const result = await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Hi' }],
    });

    expect(mockChat.sendMessageStream).toHaveBeenCalled();
    expect(mockConnection.sessionUpdate).toHaveBeenCalledWith({
      sessionId: 'session-1',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'Hello' },
      },
    });
    expect(result).toMatchObject({ stopReason: 'end_turn' });
  });

  it('should use model router to determine model', async () => {
    const mockRouter = {
      route: vi.fn().mockResolvedValue({ model: 'routed-model' }),
    } as unknown as ModelRouterService;
    mockConfig.getModelRouterService.mockReturnValue(mockRouter);

    const stream = createMockStream([
      {
        type: StreamEventType.CHUNK,
        value: {
          candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
        },
      },
    ]);
    mockChat.sendMessageStream.mockResolvedValue(stream);

    await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Hi' }],
    });

    expect(mockRouter.route).toHaveBeenCalled();
    expect(mockChat.sendMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'routed-model' }),
      expect.any(Array),
      expect.any(String),
      expect.any(Object),
      expect.any(String),
    );
  });

  it('should handle prompt with empty response (InvalidStreamError)', async () => {
    mockChat.sendMessageStream.mockRejectedValue(
      new InvalidStreamError('Empty response', 'NO_RESPONSE_TEXT'),
    );

    const result = await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Hi' }],
    });

    expect(result).toMatchObject({ stopReason: 'end_turn' });
  });

  it('should handle prompt with no finish reason (InvalidStreamError)', async () => {
    mockChat.sendMessageStream.mockRejectedValue(
      new InvalidStreamError('No finish reason', 'NO_FINISH_REASON'),
    );

    const result = await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Hi' }],
    });

    expect(result).toMatchObject({ stopReason: 'end_turn' });
  });

  it('should handle /memory command', async () => {
    const handleCommandSpy = vi
      .spyOn(
        (session as unknown as { commandHandler: CommandHandler })
          .commandHandler,
        'handleCommand',
      )
      .mockResolvedValue(true);

    const result = await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: '/memory view' }],
    });

    expect(result).toMatchObject({ stopReason: 'end_turn' });
    expect(handleCommandSpy).toHaveBeenCalledWith(
      '/memory view',
      expect.any(Object),
    );
  });

  it('should handle tool calls', async () => {
    const stream1 = createMockStream([
      {
        type: StreamEventType.CHUNK,
        value: {
          functionCalls: [{ name: 'test_tool', args: { foo: 'bar' } }],
        },
      },
    ]);
    const stream2 = createMockStream([
      {
        type: StreamEventType.CHUNK,
        value: {
          candidates: [{ content: { parts: [{ text: 'Result' }] } }],
        },
      },
    ]);

    mockChat.sendMessageStream
      .mockResolvedValueOnce(stream1)
      .mockResolvedValueOnce(stream2);

    const result = await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Call tool' }],
    });

    expect(mockToolRegistry.getTool).toHaveBeenCalledWith('test_tool');
    expect(result).toMatchObject({ stopReason: 'end_turn' });
  });

  it('should handle tool call permission request', async () => {
    const confirmationDetails = {
      type: 'info',
      onConfirm: vi.fn(),
    };
    mockTool.build.mockReturnValue({
      getDescription: () => 'Test Tool',
      toolLocations: () => [],
      shouldConfirmExecute: vi.fn().mockResolvedValue(confirmationDetails),
      execute: vi.fn().mockResolvedValue({ llmContent: 'Tool Result' }),
    });

    mockConnection.requestPermission.mockResolvedValue({
      outcome: {
        outcome: 'selected',
        optionId: 'proceed_once',
      },
    });

    const stream1 = createMockStream([
      {
        type: StreamEventType.CHUNK,
        value: {
          functionCalls: [{ name: 'test_tool', args: {} }],
        },
      },
    ]);
    const stream2 = createMockStream([
      {
        type: StreamEventType.CHUNK,
        value: { candidates: [] },
      },
    ]);

    mockChat.sendMessageStream
      .mockResolvedValueOnce(stream1)
      .mockResolvedValueOnce(stream2);

    await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Call tool' }],
    });

    expect(mockConnection.requestPermission).toHaveBeenCalled();
    expect(confirmationDetails.onConfirm).toHaveBeenCalled();
  });

  it('should handle @path resolution', async () => {
    (path.resolve as unknown as Mock).mockReturnValue('/tmp/file.txt');
    (fs.stat as unknown as Mock).mockResolvedValue({
      isDirectory: () => false,
    });

    const stream = createMockStream([
      {
        type: StreamEventType.CHUNK,
        value: { candidates: [] },
      },
    ]);
    mockChat.sendMessageStream.mockResolvedValue(stream);

    await session.prompt({
      sessionId: 'session-1',
      prompt: [
        { type: 'text', text: 'Read' },
        {
          type: 'resource_link',
          uri: 'file://file.txt',
          mimeType: 'text/plain',
          name: 'file.txt',
        },
      ],
    });

    expect(path.resolve).toHaveBeenCalled();
    expect(fs.stat).toHaveBeenCalled();
    expect(mockChat.sendMessageStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining('Content from @file.txt'),
        }),
      ]),
      expect.anything(),
      expect.any(AbortSignal),
      LlmRole.MAIN,
    );
  });

  it('should handle rate limit error', async () => {
    const error = new Error('Rate limit');
    (error as unknown as { status: number }).status = 429;
    mockChat.sendMessageStream.mockRejectedValue(error);

    await expect(
      session.prompt({
        sessionId: 'session-1',
        prompt: [{ type: 'text', text: 'Hi' }],
      }),
    ).rejects.toMatchObject({
      code: 429,
      message: 'Rate limit exceeded. Try again later.',
    });
  });

  it('should handle missing tool', async () => {
    mockToolRegistry.getTool.mockReturnValue(undefined);

    const stream1 = createMockStream([
      {
        type: StreamEventType.CHUNK,
        value: {
          functionCalls: [{ name: 'unknown_tool', args: {} }],
        },
      },
    ]);
    const stream2 = createMockStream([
      {
        type: StreamEventType.CHUNK,
        value: { candidates: [] },
      },
    ]);

    mockChat.sendMessageStream
      .mockResolvedValueOnce(stream1)
      .mockResolvedValueOnce(stream2);

    await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Call tool' }],
    });

    expect(mockChat.sendMessageStream).toHaveBeenCalledTimes(2);
  });
});
