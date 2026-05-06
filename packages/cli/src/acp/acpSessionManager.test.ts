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
import type * as acp from '@agentclientprotocol/sdk';
import {
  AuthType,
  type Config,
  type MessageBus,
  type Storage,
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
      waitForMcpInit: vi.fn(),
      getFileSystemService: vi.fn(),
      setFileSystemService: vi.fn(),
      getContentGeneratorConfig: vi.fn(),
      getActiveModel: vi.fn().mockReturnValue('gemini-pro'),
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getGeminiClient: vi.fn().mockReturnValue({
        startChat: vi.fn().mockResolvedValue({}),
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
          modelId: 'auto-gemini-3',
          name: expect.stringContaining('Auto'),
        }),
      ]),
    );
  });

  it('should include gemini-3.1-flash-lite when useGemini31FlashLite is true', async () => {
    mockConfig.getContentGeneratorConfig = vi.fn().mockReturnValue({
      apiKey: 'test-key',
    });
    mockConfig.getHasAccessToPreviewModel = vi.fn().mockReturnValue(true);
    mockConfig.getGemini31LaunchedSync = vi.fn().mockReturnValue(true);
    mockConfig.getGemini31FlashLiteLaunchedSync = vi.fn().mockReturnValue(true);

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
          modelId: 'gemini-3.1-flash-lite-preview',
          name: 'gemini-3.1-flash-lite-preview',
        }),
      ]),
    );
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
});
