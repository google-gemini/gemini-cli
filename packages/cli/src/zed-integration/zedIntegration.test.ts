/**
 * @license
 * Copyright 2025 Google LLC
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
import { GeminiAgent, Session } from './zedIntegration.js';
import * as acp from '@agentclientprotocol/sdk';
import {
  AuthType,
  ToolConfirmationOutcome,
  StreamEventType,
  isWithinRoot,
  ReadManyFilesTool,
  type GeminiChat,
  type Config,
  type MessageBus,
} from '@google/gemini-cli-core';
import { SettingScope, type LoadedSettings } from '../config/settings.js';
import { loadCliConfig, type CliArgs } from '../config/config.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

vi.mock('../config/config.js', () => ({
  loadCliConfig: vi.fn(),
}));

vi.mock('node:crypto', () => ({
  randomUUID: () => 'test-session-id',
}));

vi.mock('node:fs/promises');
vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return {
    ...actual,
    resolve: vi.fn(),
  };
});

// Mock ReadManyFilesTool
vi.mock(
  '@google/gemini-cli-core',
  async (
    importOriginal: () => Promise<typeof import('@google/gemini-cli-core')>,
  ) => {
    const actual = await importOriginal();
    return {
      ...actual,
      ReadManyFilesTool: vi.fn().mockImplementation(() => ({
        name: 'read_many_files',
        kind: 'native',
        build: vi.fn().mockReturnValue({
          getDescription: () => 'Read files',
          toolLocations: () => [],
          execute: vi.fn().mockResolvedValue({
            llmContent: ['--- file.txt ---\n\nFile content\n\n'],
          }),
        }),
      })),
      logToolCall: vi.fn(),
      isWithinRoot: vi.fn().mockReturnValue(true),
    };
  },
);

// Helper to create mock streams
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function* createMockStream(items: any[]) {
  for (const item of items) {
    yield item;
  }
}

describe('GeminiAgent', () => {
  let mockConfig: Mocked<Awaited<ReturnType<typeof loadCliConfig>>>;
  let mockSettings: Mocked<LoadedSettings>;
  let mockArgv: CliArgs;
  let mockConnection: Mocked<acp.AgentSideConnection>;
  let agent: GeminiAgent;

  beforeEach(() => {
    mockConfig = {
      refreshAuth: vi.fn(),
      initialize: vi.fn(),
      getFileSystemService: vi.fn(),
      setFileSystemService: vi.fn(),
      getGeminiClient: vi.fn().mockReturnValue({
        startChat: vi.fn().mockResolvedValue({}),
      }),
      getMessageBus: vi.fn().mockReturnValue({
        publish: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      }),
    } as unknown as Mocked<Awaited<ReturnType<typeof loadCliConfig>>>;
    mockSettings = {
      merged: {
        security: { auth: { selectedType: 'login_with_google' } },
        mcpServers: {},
      },
      setValue: vi.fn(),
    } as unknown as Mocked<LoadedSettings>;
    mockArgv = {} as unknown as CliArgs;
    mockConnection = {
      sessionUpdate: vi.fn(),
    } as unknown as Mocked<acp.AgentSideConnection>;

    (loadCliConfig as unknown as Mock).mockResolvedValue(mockConfig);

    agent = new GeminiAgent(mockConfig, mockSettings, mockArgv, mockConnection);
  });

  it('should initialize correctly', async () => {
    const response = await agent.initialize({
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
      protocolVersion: 1,
    });

    expect(response.protocolVersion).toBe(acp.PROTOCOL_VERSION);
    expect(response.authMethods).toHaveLength(3);
    expect(response.agentCapabilities?.loadSession).toBe(false);
  });

  it('should authenticate correctly', async () => {
    await agent.authenticate({
      methodId: AuthType.LOGIN_WITH_GOOGLE,
    });

    expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
      AuthType.LOGIN_WITH_GOOGLE,
    );
    expect(mockSettings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'security.auth.selectedType',
      AuthType.LOGIN_WITH_GOOGLE,
    );
  });

  it('should create a new session', async () => {
    const response = await agent.newSession({
      cwd: '/tmp',
      mcpServers: [],
    });

    expect(response.sessionId).toBe('test-session-id');
    expect(loadCliConfig).toHaveBeenCalled();
    expect(mockConfig.initialize).toHaveBeenCalled();
    expect(mockConfig.getGeminiClient).toHaveBeenCalled();
  });

  it('should create a new session with mcp servers', async () => {
    const mcpServers = [
      {
        name: 'test-server',
        command: 'node',
        args: ['server.js'],
        env: [{ name: 'KEY', value: 'VALUE' }],
      },
    ];

    await agent.newSession({
      cwd: '/tmp',
      mcpServers,
    });

    expect(loadCliConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        mcpServers: expect.objectContaining({
          'test-server': expect.objectContaining({
            command: 'node',
            args: ['server.js'],
            env: { KEY: 'VALUE' },
          }),
        }),
      }),
      'test-session-id',
      mockArgv,
      { cwd: '/tmp' },
    );
  });

  it('should handle authentication failure gracefully', async () => {
    mockConfig.refreshAuth.mockRejectedValue(new Error('Auth failed'));
    const debugSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Should throw RequestError.authRequired()
    await expect(
      agent.newSession({
        cwd: '/tmp',
        mcpServers: [],
      }),
    ).rejects.toMatchObject({
      message: 'Authentication required',
    });

    debugSpy.mockRestore();
  });

  it('should initialize file system service if client supports it', async () => {
    agent = new GeminiAgent(mockConfig, mockSettings, mockArgv, mockConnection);
    await agent.initialize({
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
      protocolVersion: 1,
    });

    await agent.newSession({
      cwd: '/tmp',
      mcpServers: [],
    });

    expect(mockConfig.setFileSystemService).toHaveBeenCalled();
  });

  it('should cancel a session', async () => {
    await agent.newSession({ cwd: '/tmp', mcpServers: [] });
    // Mock the session's cancelPendingPrompt
    const session = (
      agent as unknown as { sessions: Map<string, Session> }
    ).sessions.get('test-session-id');
    if (!session) throw new Error('Session not found');
    session.cancelPendingPrompt = vi.fn();

    await agent.cancel({ sessionId: 'test-session-id' });

    expect(session.cancelPendingPrompt).toHaveBeenCalled();
  });

  it('should throw error when cancelling non-existent session', async () => {
    await expect(agent.cancel({ sessionId: 'unknown' })).rejects.toThrow(
      'Session not found',
    );
  });

  it('should delegate prompt to session', async () => {
    await agent.newSession({ cwd: '/tmp', mcpServers: [] });
    const session = (
      agent as unknown as { sessions: Map<string, Session> }
    ).sessions.get('test-session-id');
    if (!session) throw new Error('Session not found');
    session.prompt = vi.fn().mockResolvedValue({ stopReason: 'end_turn' });

    const result = await agent.prompt({
      sessionId: 'test-session-id',
      prompt: [],
    });

    expect(session.prompt).toHaveBeenCalled();
    expect(result).toEqual({ stopReason: 'end_turn' });
  });
});

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
    } as unknown as Mocked<GeminiChat>;
    mockTool = {
      kind: 'native',
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
      getPreviewFeatures: vi.fn().mockReturnValue({}),
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      getFileService: vi.fn().mockReturnValue({
        shouldIgnoreFile: vi.fn().mockReturnValue(false),
      }),
      getFileFilteringOptions: vi.fn().mockReturnValue({}),
      getTargetDir: vi.fn().mockReturnValue('/tmp'),
      getEnableRecursiveFileSearch: vi.fn().mockReturnValue(false),
      getDebugMode: vi.fn().mockReturnValue(false),
      getMessageBus: vi.fn().mockReturnValue(mockMessageBus),
    } as unknown as Mocked<Config>;
    mockConnection = {
      sessionUpdate: vi.fn(),
      requestPermission: vi.fn(),
      sendNotification: vi.fn(),
    } as unknown as Mocked<acp.AgentSideConnection>;

    session = new Session('session-1', mockChat, mockConfig, mockConnection);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    expect(result).toEqual({ stopReason: 'end_turn' });
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
    expect(mockTool.build).toHaveBeenCalledWith({ foo: 'bar' });
    expect(mockConnection.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sessionUpdate: 'tool_call',
          status: 'in_progress',
        }),
      }),
    );
    expect(mockConnection.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sessionUpdate: 'tool_call_update',
          status: 'completed',
        }),
      }),
    );
    expect(result).toEqual({ stopReason: 'end_turn' });
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
        optionId: ToolConfirmationOutcome.ProceedOnce,
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
    expect(confirmationDetails.onConfirm).toHaveBeenCalledWith(
      ToolConfirmationOutcome.ProceedOnce,
    );
  });

  it('should handle tool call cancellation by user', async () => {
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
      outcome: { outcome: 'cancelled' },
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

    // When cancelled, it sends an error response to the model
    // We can verify that the second call to sendMessageStream contains the error
    expect(mockChat.sendMessageStream).toHaveBeenCalledTimes(2);
    const secondCallArgs = mockChat.sendMessageStream.mock.calls[1];
    const parts = secondCallArgs[1]; // parts
    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          functionResponse: expect.objectContaining({
            response: {
              error: expect.stringContaining('canceled by the user'),
            },
          }),
        }),
      ]),
    );
  });

  it('should handle @path resolution', async () => {
    (path.resolve as unknown as Mock).mockReturnValue('/tmp/file.txt');
    (fs.stat as unknown as Mock).mockResolvedValue({
      isDirectory: () => false,
    });
    (isWithinRoot as unknown as Mock).mockReturnValue(true);

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

    // Verify ReadManyFilesTool was used (implicitly by checking if sendMessageStream was called with resolved content)
    // Since we mocked ReadManyFilesTool to return specific content, we can check the args passed to sendMessageStream
    expect(mockChat.sendMessageStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining('Content from @file.txt'),
        }),
      ]),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should handle cancellation during prompt', async () => {
    let streamController: ReadableStreamDefaultController<unknown>;
    const stream = new ReadableStream({
      start(controller) {
        streamController = controller;
      },
    });

    let streamStarted: (value: unknown) => void;
    const streamStartedPromise = new Promise((resolve) => {
      streamStarted = resolve;
    });

    // Adapt web stream to async iterable
    async function* asyncStream() {
      process.stdout.write('TEST: asyncStream started\n');
      streamStarted(true);
      const reader = stream.getReader();
      try {
        while (true) {
          process.stdout.write('TEST: waiting for read\n');
          const { done, value } = await reader.read();
          process.stdout.write(`TEST: read returned done=${done}\n`);
          if (done) break;
          yield value;
        }
      } finally {
        process.stdout.write('TEST: releasing lock\n');
        reader.releaseLock();
      }
    }

    mockChat.sendMessageStream.mockResolvedValue(asyncStream());

    process.stdout.write('TEST: calling prompt\n');
    const promptPromise = session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Hi' }],
    });

    process.stdout.write('TEST: waiting for streamStarted\n');
    await streamStartedPromise;
    process.stdout.write('TEST: streamStarted\n');
    await session.cancelPendingPrompt();
    process.stdout.write('TEST: cancelled\n');

    // Close the stream to allow prompt loop to continue and check aborted signal
    streamController!.close();
    process.stdout.write('TEST: stream closed\n');

    const result = await promptPromise;
    process.stdout.write(`TEST: result received ${JSON.stringify(result)}\n`);
    expect(result).toEqual({ stopReason: 'cancelled' });
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

  it('should handle tool execution error', async () => {
    mockTool.build.mockReturnValue({
      getDescription: () => 'Test Tool',
      toolLocations: () => [],
      shouldConfirmExecute: vi.fn().mockResolvedValue(null),
      execute: vi.fn().mockRejectedValue(new Error('Tool failed')),
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

    expect(mockConnection.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sessionUpdate: 'tool_call_update',
          status: 'failed',
          content: expect.arrayContaining([
            expect.objectContaining({
              content: expect.objectContaining({ text: 'Tool failed' }),
            }),
          ]),
        }),
      }),
    );
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

    // Should send error response to model
    expect(mockChat.sendMessageStream).toHaveBeenCalledTimes(2);
    const secondCallArgs = mockChat.sendMessageStream.mock.calls[1];
    const parts = secondCallArgs[1];
    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          functionResponse: expect.objectContaining({
            response: {
              error: expect.stringContaining('not found in registry'),
            },
          }),
        }),
      ]),
    );
  });

  it('should ignore files based on configuration', async () => {
    (
      mockConfig.getFileService().shouldIgnoreFile as unknown as Mock
    ).mockReturnValue(true);
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
        {
          type: 'resource_link',
          uri: 'file://ignored.txt',
          mimeType: 'text/plain',
          name: 'ignored.txt',
        },
      ],
    });

    // Should not read file
    expect(mockToolRegistry.getTool).not.toHaveBeenCalledWith(
      'read_many_files',
    );
  });

  it('should handle directory resolution with glob', async () => {
    (path.resolve as unknown as Mock).mockReturnValue('/tmp/dir');
    (fs.stat as unknown as Mock).mockResolvedValue({
      isDirectory: () => true,
    });
    (isWithinRoot as unknown as Mock).mockReturnValue(true);

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
        {
          type: 'resource_link',
          uri: 'file://dir',
          mimeType: 'text/plain',
          name: 'dir',
        },
      ],
    });

    // Should use glob
    // ReadManyFilesTool is instantiated directly, so we check if the mock instance's build method was called
    const MockReadManyFilesTool = ReadManyFilesTool as unknown as Mock;
    const mockInstance =
      MockReadManyFilesTool.mock.results[
        MockReadManyFilesTool.mock.results.length - 1
      ].value;
    expect(mockInstance.build).toHaveBeenCalled();
  });
});
