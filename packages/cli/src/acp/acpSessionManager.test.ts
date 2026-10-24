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
import { AcpSessionManager } from './acpSessionManager.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as acp from '@agentclientprotocol/sdk';
import {
  AuthType,
  type Config,
  CoreEvent,
  coreEvents,
  GEMINI_MODEL_ALIAS_AUTO,
  type MessageBus,
  Storage,
} from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';
import { loadCliConfig, type CliArgs } from '../config/config.js';
import { loadSettings } from '../config/settings.js';

vi.mock('../config/config.js', () => ({
  loadCliConfig: vi.fn(),
}));

vi.mock('../config/settings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/settings.js')>();
  return {
    ...actual,
    loadSettings: vi.fn(),
  };
});

const startAutoMemoryIfEnabledMock = vi.fn();
vi.mock('../utils/autoMemory.js', () => ({
  startAutoMemoryIfEnabled: (config: Config) =>
    startAutoMemoryIfEnabledMock(config),
}));

describe('AcpSessionManager', () => {
  let mockConfig: Mocked<Config>;
  let mockSettings: Mocked<LoadedSettings>;
  let mockArgv: CliArgs;
  let mockConnection: Mocked<acp.AgentSideConnection>;
  let manager: AcpSessionManager;

  beforeEach(() => {
    mockConfig = {
      refreshAuth: vi.fn(),
      initialize: vi.fn(),
      dispose: vi.fn(),
      waitForMcpInit: vi.fn(),
      getFileSystemService: vi.fn(),
      setFileSystemService: vi.fn(),
      getContentGeneratorConfig: vi.fn(),
      getActiveModel: vi.fn().mockReturnValue('gemini-pro'),
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getGeminiClient: vi.fn().mockReturnValue({
        startChat: vi.fn().mockResolvedValue({}),
        resumeChat: vi.fn().mockResolvedValue(undefined),
        getChat: vi.fn().mockReturnValue({}),
      }),
      getMessageBus: vi.fn().mockReturnValue({
        publish: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      }),
      getApprovalMode: vi.fn().mockReturnValue('default'),
      isPlanEnabled: vi.fn().mockReturnValue(true),
      getGemini31LaunchedSync: vi.fn().mockReturnValue(false),
      getHasAccessToPreviewModel: vi.fn().mockReturnValue(false),
      getCheckpointingEnabled: vi.fn().mockReturnValue(false),
      getDisableAlwaysAllow: vi.fn().mockReturnValue(false),
      validatePathAccess: vi.fn().mockReturnValue(null),
      getWorkspaceContext: vi.fn().mockReturnValue({
        addReadOnlyPath: vi.fn(),
        getDirectories: vi.fn().mockReturnValue(['/tmp']),
      }),
      getPolicyEngine: vi.fn().mockReturnValue({
        addRule: vi.fn(),
      }),
      messageBus: {
        publish: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      } as unknown as MessageBus,
      storage: {
        getWorkspaceAutoSavedPolicyPath: vi.fn(),
        getAutoSavedPolicyPath: vi.fn(),
      } as unknown as Storage,

      get config() {
        return this;
      },
    } as unknown as Mocked<Config>;
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
      requestPermission: vi.fn(),
    } as unknown as Mocked<acp.AgentSideConnection>;

    (loadCliConfig as unknown as Mock).mockResolvedValue(mockConfig);
    (loadSettings as unknown as Mock).mockImplementation(() => ({
      merged: {
        security: {
          auth: { selectedType: AuthType.LOGIN_WITH_GOOGLE },
          enablePermanentToolApproval: true,
        },
        mcpServers: {},
      },
      setValue: vi.fn(),
    }));

    manager = new AcpSessionManager(mockSettings, mockArgv, mockConnection);
    vi.mock('node:crypto', () => ({
      randomUUID: () => 'test-session-id',
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create a new session', async () => {
    vi.useFakeTimers();
    mockConfig.getContentGeneratorConfig = vi.fn().mockReturnValue({
      apiKey: 'test-key',
    });
    const response = await manager.newSession(
      {
        cwd: '/tmp',
        mcpServers: [],
      },
      {},
    );

    expect(response.sessionId).toBe('test-session-id');
    expect(loadCliConfig).toHaveBeenCalled();
    expect(mockConfig.initialize).toHaveBeenCalled();
    expect(mockConfig.getGeminiClient).toHaveBeenCalled();

    // Verify deferred call (sendAvailableCommands)
    await vi.runAllTimersAsync();
    expect(mockConnection.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sessionUpdate: 'available_commands_update',
        }),
      }),
    );
    vi.useRealTimers();
  });

  it('should return modes without plan mode when plan is disabled', async () => {
    mockConfig.getContentGeneratorConfig = vi.fn().mockReturnValue({
      apiKey: 'test-key',
    });
    mockConfig.isPlanEnabled = vi.fn().mockReturnValue(false);
    mockConfig.getApprovalMode = vi.fn().mockReturnValue('default');

    const response = await manager.newSession(
      {
        cwd: '/tmp',
        mcpServers: [],
      },
      {},
    );

    expect(response.modes).toEqual({
      availableModes: [
        { id: 'default', name: 'Default', description: 'Prompts for approval' },
        {
          id: 'autoEdit',
          name: 'Auto Edit',
          description: 'Auto-approves edit tools',
        },
        { id: 'yolo', name: 'YOLO', description: 'Auto-approves all tools' },
      ],
      currentModeId: 'default',
    });
  });

  it('should include preview models when user has access', async () => {
    mockConfig.getContentGeneratorConfig = vi.fn().mockReturnValue({
      apiKey: 'test-key',
    });
    mockConfig.getHasAccessToPreviewModel = vi.fn().mockReturnValue(true);
    mockConfig.getGemini31LaunchedSync = vi.fn().mockReturnValue(true);

    const response = await manager.newSession(
      {
        cwd: '/tmp',
        mcpServers: [],
      },
      {},
    );

    expect(response.models?.availableModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelId: GEMINI_MODEL_ALIAS_AUTO,
          name: expect.stringContaining('Auto'),
        }),
      ]),
    );
  });

  it('should NOT include retired preview models (none) in available models', async () => {
    mockConfig.getContentGeneratorConfig = vi.fn().mockReturnValue({
      apiKey: 'test-key',
    });
    mockConfig.getHasAccessToPreviewModel = vi.fn().mockReturnValue(true);
    mockConfig.getGemini31LaunchedSync = vi.fn().mockReturnValue(true);

    const response = await manager.newSession(
      {
        cwd: '/tmp',
        mcpServers: [],
      },
      {},
    );

    const modelIds =
      response.models?.availableModels?.map((m) => m.modelId) ?? [];
    expect(modelIds).not.toContain('none');
  });

  it('should return modes with plan mode when plan is enabled', async () => {
    mockConfig.getContentGeneratorConfig = vi.fn().mockReturnValue({
      apiKey: 'test-key',
    });
    mockConfig.isPlanEnabled = vi.fn().mockReturnValue(true);
    mockConfig.getApprovalMode = vi.fn().mockReturnValue('plan');

    const response = await manager.newSession(
      {
        cwd: '/tmp',
        mcpServers: [],
      },
      {},
    );

    expect(response.modes).toEqual({
      availableModes: [
        { id: 'default', name: 'Default', description: 'Prompts for approval' },
        {
          id: 'autoEdit',
          name: 'Auto Edit',
          description: 'Auto-approves edit tools',
        },
        { id: 'yolo', name: 'YOLO', description: 'Auto-approves all tools' },
        { id: 'plan', name: 'Plan', description: 'Read-only mode' },
      ],
      currentModeId: 'plan',
    });
  });

  it('should fail session creation if Gemini API key is missing', async () => {
    (loadSettings as unknown as Mock).mockImplementation(() => ({
      merged: {
        security: { auth: { selectedType: AuthType.USE_GEMINI } },
        mcpServers: {},
      },
      setValue: vi.fn(),
    }));
    mockConfig.getContentGeneratorConfig = vi.fn().mockReturnValue({
      apiKey: undefined,
    });

    await expect(
      manager.newSession(
        {
          cwd: '/tmp',
          mcpServers: [],
        },
        {},
      ),
    ).rejects.toMatchObject({
      message: 'Gemini API key is missing or not configured.',
    });
  });

  it('should create a new session with mcp servers', async () => {
    mockConfig.getContentGeneratorConfig = vi.fn().mockReturnValue({
      apiKey: 'test-key',
    });
    const mcpServers = [
      {
        name: 'test-server',
        command: 'node',
        args: ['server.js'],
        env: [{ name: 'KEY', value: 'VALUE' }],
      },
    ];

    await manager.newSession(
      {
        cwd: '/tmp',
        mcpServers,
      },
      {},
    );

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

    await expect(
      manager.newSession(
        {
          cwd: '/tmp',
          mcpServers: [],
        },
        {},
      ),
    ).rejects.toMatchObject({
      message: 'Auth failed',
    });
  });

  it('should initialize file system service if client supports it', async () => {
    mockConfig.getContentGeneratorConfig = vi.fn().mockReturnValue({
      apiKey: 'test-key',
    });
    manager.setClientCapabilities({
      fs: { readTextFile: true, writeTextFile: true },
    });

    await manager.newSession(
      {
        cwd: '/tmp',
        mcpServers: [],
      },
      {},
    );

    expect(mockConfig.setFileSystemService).toHaveBeenCalled();
  });

  it('should start auto memory for new ACP sessions', async () => {
    mockConfig.getContentGeneratorConfig = vi.fn().mockReturnValue({
      apiKey: 'test-key',
    });

    await manager.newSession(
      {
        cwd: '/tmp',
        mcpServers: [],
      },
      {},
    );

    expect(startAutoMemoryIfEnabledMock).toHaveBeenCalledWith(mockConfig);
  });

  it('should successfully load an ACP session created by newSession without resumable content filters', async () => {
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acp-load-test-'));
    const sessionId = 'test-session-uuid-123';
    const storage = new Storage(testDir, sessionId);
    await storage.initialize();
    const chatsDir = path.join(storage.getProjectTempDir(), 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    // Initial header written by ChatRecordingService on newSession (hasResumableContent is false)
    const initialRecord = {
      sessionId,
      projectHash: 'test-hash',
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      kind: 'main',
      messages: [],
    };
    await fs.writeFile(
      path.join(chatsDir, `session-2026-09-30-${sessionId.slice(0, 8)}.jsonl`),
      JSON.stringify(initialRecord) + '\n',
    );

    const response = await manager.loadSession(
      {
        sessionId,
        cwd: testDir,
        mcpServers: [],
      },
      {},
    );

    expect(response).toBeDefined();
    expect(response.modes).toBeDefined();
    expect(response.models).toBeDefined();
    expect(mockConfig.getGeminiClient().resumeChat).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        conversation: expect.objectContaining({ sessionId }),
      }),
    );
  });

  it('should successfully load an ACP session with conversational content', async () => {
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acp-load-chat-'));
    const sessionId = 'test-session-with-chat';
    const storage = new Storage(testDir, sessionId);
    await storage.initialize();
    const chatsDir = path.join(storage.getProjectTempDir(), 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const sessionRecord = {
      sessionId,
      projectHash: 'test-hash',
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      kind: 'main',
      messages: [
        { type: 'user', content: 'hello' },
        { type: 'gemini', content: 'world' },
      ],
    };
    await fs.writeFile(
      path.join(chatsDir, `session-2026-09-30-${sessionId.slice(0, 8)}.jsonl`),
      JSON.stringify(sessionRecord) + '\n',
    );

    const response = await manager.loadSession(
      {
        sessionId,
        cwd: testDir,
        mcpServers: [],
      },
      {},
    );

    expect(response).toBeDefined();
    expect(mockConfig.getGeminiClient().resumeChat).toHaveBeenCalled();
  });

  it('should reject loading an invalid session identifier without leaking event listeners', async () => {
    const testDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'acp-load-invalid-'),
    );
    const initialListenerCount = coreEvents.listenerCount(
      CoreEvent.ModelChanged,
    );

    // Call loadSession with an invalid/non-existent session ID 15 times
    for (let i = 0; i < 15; i++) {
      await expect(
        manager.loadSession(
          {
            sessionId: `non-existent-id-${i}`,
            cwd: testDir,
            mcpServers: [],
          },
          {},
        ),
      ).rejects.toThrow('Invalid session identifier');
    }

    // Verify no listeners were leaked
    expect(coreEvents.listenerCount(CoreEvent.ModelChanged)).toBe(
      initialListenerCount,
    );
  });

  it('should reject loading a session identifier containing path traversal without performing file operations', async () => {
    const testDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'acp-load-traversal-'),
    );

    await expect(
      manager.loadSession(
        {
          sessionId: '../../evil',
          cwd: testDir,
          mcpServers: [],
        },
        {},
      ),
    ).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(acp.RequestError);
      expect((error as acp.RequestError).code).toBe(-32602);
      expect((error as acp.RequestError).message).toBe(
        'Invalid session identifier format.',
      );
      return true;
    });

    await expect(
      manager.loadSession(
        {
          sessionId: 'path/with/slash',
          cwd: testDir,
          mcpServers: [],
        },
        {},
      ),
    ).rejects.toThrow('Invalid session identifier format.');

    await expect(
      manager.loadSession(
        {
          sessionId: 'path\\with\\backslash',
          cwd: testDir,
          mcpServers: [],
        },
        {},
      ),
    ).rejects.toThrow('Invalid session identifier format.');
  });

  it('should dispose an existing session before initializing new config when reloading a session', async () => {
    const testDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'acp-reload-test-'),
    );
    const sessionId = 'test-session-reload-123';
    const storage = new Storage(testDir, sessionId);
    await storage.initialize();
    const chatsDir = path.join(storage.getProjectTempDir(), 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const sessionRecord = {
      sessionId,
      projectHash: 'test-hash',
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      kind: 'main',
      messages: [{ type: 'user', content: 'hello' }],
    };
    await fs.writeFile(
      path.join(chatsDir, `session-2026-09-30-${sessionId.slice(0, 8)}.jsonl`),
      JSON.stringify(sessionRecord) + '\n',
    );

    // First load
    await manager.loadSession(
      {
        sessionId,
        cwd: testDir,
        mcpServers: [],
      },
      {},
    );

    const firstSession = manager.getSession(sessionId);
    expect(firstSession).toBeDefined();
    const disposeSpy = vi.spyOn(firstSession!, 'dispose');

    // Second load with the same sessionId
    await manager.loadSession(
      {
        sessionId,
        cwd: testDir,
        mcpServers: [],
      },
      {},
    );

    expect(disposeSpy).toHaveBeenCalledTimes(1);
    const secondSession = manager.getSession(sessionId);
    expect(secondSession).toBeDefined();
    expect(secondSession).not.toBe(firstSession);
  });

  it('should dispose config when newSession initialization fails', async () => {
    mockConfig.getContentGeneratorConfig = vi.fn().mockReturnValue({
      apiKey: 'test-key',
    });
    mockConfig.initialize = vi.fn().mockRejectedValue(new Error('Init failed'));

    await expect(
      manager.newSession(
        {
          cwd: '/tmp',
          mcpServers: [],
        },
        {},
      ),
    ).rejects.toThrow('Init failed');

    expect(mockConfig.dispose).toHaveBeenCalled();
  });

  it('should await session disposals and clear sessions on dispose', async () => {
    mockConfig.getContentGeneratorConfig = vi.fn().mockReturnValue({
      apiKey: 'test-key',
    });
    const response = await manager.newSession(
      {
        cwd: '/tmp',
        mcpServers: [],
      },
      {},
    );

    const session = manager.getSession(response.sessionId);
    expect(session).toBeDefined();
    const disposeSpy = vi.spyOn(session!, 'dispose');

    await manager.dispose();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(manager.getSession(response.sessionId)).toBeUndefined();
  });

  it('should dispose session and remove from manager when newSession fails after session instantiation', async () => {
    mockConfig.getContentGeneratorConfig = vi.fn().mockReturnValue({
      apiKey: 'test-key',
    });
    mockConfig.getModel = vi.fn().mockImplementation(() => {
      throw new Error('Post-session failure');
    });

    await expect(
      manager.newSession(
        {
          cwd: '/tmp',
          mcpServers: [],
        },
        {},
      ),
    ).rejects.toThrow('Post-session failure');

    expect(mockConfig.dispose).toHaveBeenCalled();
    expect(manager.getSession('test-session-id')).toBeUndefined();
  });

  it('should dispose session and remove from manager when loadSession fails after session instantiation', async () => {
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-test-'));
    const sessionId = '11111111-2222-3333-4444-555555555555';
    const storage = new Storage(testDir);
    await storage.initialize();
    const chatsDir = path.join(storage.getProjectTempDir(), 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const sessionRecord = {
      sessionId,
      projectHash: 'test-hash',
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      kind: 'main',
      messages: [{ type: 'user', content: 'hello' }],
    };
    await fs.writeFile(
      path.join(chatsDir, `session-2026-09-30-${sessionId.slice(0, 8)}.jsonl`),
      JSON.stringify(sessionRecord) + '\n',
    );

    mockConfig.getModel = vi.fn().mockImplementation(() => {
      throw new Error('Post-session load failure');
    });

    await expect(
      manager.loadSession(
        {
          sessionId,
          cwd: testDir,
          mcpServers: [],
        },
        {},
      ),
    ).rejects.toThrow('Post-session load failure');

    expect(mockConfig.dispose).toHaveBeenCalled();
    expect(manager.getSession(sessionId)).toBeUndefined();
  });
});
