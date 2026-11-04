/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { listMcpServers } from './list.js';
import { loadSettings } from '../../config/settings.js';
import {
  createTransport,
  debugLogger,
  type AdminControlsSettings,
} from '@google/gemini-cli-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ExtensionStorage } from '../../config/extensions/storage.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { McpServerEnablementManager } from '../../config/mcp/index.js';
import { createMockSettings } from '../../test-utils/settings.js';

vi.mock('../../config/settings.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../config/settings.js')>();
  return {
    ...actual,
    loadSettings: vi.fn(),
  };
});
vi.mock('../../config/extensions/storage.js', () => ({
  ExtensionStorage: {
    getUserExtensionsDir: vi.fn(),
  },
}));
vi.mock('../../config/extension-manager.js');
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    createTransport: vi.fn(),

    MCPServerStatus: {
      CONNECTED: 'CONNECTED',
      CONNECTING: 'CONNECTING',
      DISCONNECTED: 'DISCONNECTED',
      BLOCKED: 'BLOCKED',
      DISABLED: 'DISABLED',
    },
    Storage: Object.assign(
      vi.fn().mockImplementation((_cwd: string) => ({
        getGlobalSettingsPath: () => '/tmp/gemini/settings.json',
        getWorkspaceSettingsPath: () => '/tmp/gemini/workspace-settings.json',
        getProjectTempDir: () => '/test/home/.gemini/tmp/mocked_hash',
      })),
      {
        getGlobalSettingsPath: () => '/tmp/gemini/settings.json',
        getGlobalGeminiDir: () => '/tmp/gemini',
      },
    ),
    GEMINI_DIR: '.gemini',
    getErrorMessage: (e: unknown) =>
      e instanceof Error ? e.message : String(e),
  };
});
vi.mock('@modelcontextprotocol/sdk/client/index.js');

vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

const mockedGetUserExtensionsDir =
  ExtensionStorage.getUserExtensionsDir as Mock;
const mockedLoadSettings = loadSettings as Mock;
const mockedCreateTransport = createTransport as Mock;
const MockedClient = Client as Mock;
const MockedExtensionManager = ExtensionManager as Mock;

interface MockClient {
  connect: Mock;
  ping: Mock;
  close: Mock;
}

interface MockExtensionManager {
  loadExtensions: Mock;
}

interface MockTransport {
  close: Mock;
}

describe('mcp list command', () => {
  let mockClient: MockClient;
  let mockExtensionManager: MockExtensionManager;
  let mockTransport: MockTransport;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(debugLogger, 'log').mockImplementation(() => {});
    McpServerEnablementManager.resetInstance();
    // Use a mock for isFileEnabled to avoid reading real files
    vi.spyOn(
      McpServerEnablementManager.prototype,
      'isFileEnabled',
    ).mockResolvedValue(true);

    mockTransport = { close: vi.fn() };
    mockClient = {
      connect: vi.fn(),
      ping: vi.fn(),
      close: vi.fn(),
    };
    mockExtensionManager = {
      loadExtensions: vi.fn(),
    };

    MockedClient.mockImplementation(() => mockClient);
    MockedExtensionManager.mockImplementation(() => mockExtensionManager);
    mockedCreateTransport.mockResolvedValue(mockTransport);
    mockExtensionManager.loadExtensions.mockReturnValue([]);
    mockedGetUserExtensionsDir.mockReturnValue('/mocked/extensions/dir');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should display message when no servers configured', async () => {
    mockedLoadSettings.mockReturnValue(createMockSettings({ mcpServers: {} }));

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith('No MCP servers configured.');
  });

  it('should display different server types with connected status', async () => {
    mockedLoadSettings.mockReturnValue(
      createMockSettings({
        mcpServers: {
          'stdio-server': { command: '/path/to/server', args: ['arg1'] },
          'sse-server': { url: 'https://example.com/sse', type: 'sse' },
          'http-server': { httpUrl: 'https://example.com/http' },
          'http-server-by-default': { url: 'https://example.com/http' },
          'http-server-with-type': {
            url: 'https://example.com/http',
            type: 'http',
          },
        },
        isTrusted: true,
      }),
    );

    mockClient.connect.mockResolvedValue(undefined);
    mockClient.ping.mockResolvedValue(undefined);

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith('Configured MCP servers:\n');
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'stdio-server: /path/to/server arg1 (stdio) - Connected',
      ),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'sse-server: https://example.com/sse (sse) - Connected',
      ),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'http-server: https://example.com/http (http) - Connected',
      ),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'http-server-by-default: https://example.com/http (http) - Connected',
      ),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'http-server-with-type: https://example.com/http (http) - Connected',
      ),
    );
  });

  it('should display disconnected status when connection fails', async () => {
    mockedLoadSettings.mockReturnValue(
      createMockSettings({
        mcpServers: {
          'test-server': { command: '/test/server' },
        },
        isTrusted: true,
      }),
    );

    mockClient.connect.mockRejectedValue(new Error('Connection failed'));

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'test-server: /test/server  (stdio) - Disconnected',
      ),
    );
  });

  it('should display connected status even if ping fails', async () => {
    mockedLoadSettings.mockReturnValue(
      createMockSettings({
        mcpServers: {
          'test-server': { command: '/test/server' },
        },
        isTrusted: true,
      }),
    );

    mockClient.connect.mockResolvedValue(undefined);
    mockClient.ping.mockRejectedValue(new Error('Ping failed'));

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('test-server: /test/server  (stdio) - Connected'),
    );
  });

  it('should use configured timeout for connection', async () => {
    mockedLoadSettings.mockReturnValue(
      createMockSettings({
        mcpServers: {
          'test-server': { command: '/test/server', timeout: 12345 },
        },
        isTrusted: true,
      }),
    );

    mockClient.connect.mockResolvedValue(undefined);

    await listMcpServers();

    expect(mockClient.connect).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeout: 12345 }),
    );
    expect(mockClient.ping).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 12345 }),
    );
  });

  it('should use default timeout for connection when not configured', async () => {
    mockedLoadSettings.mockReturnValue(
      createMockSettings({
        mcpServers: {
          'test-server': { command: '/test/server' },
        },
        isTrusted: true,
      }),
    );

    mockClient.connect.mockResolvedValue(undefined);

    await listMcpServers();

    expect(mockClient.connect).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeout: 5000 }),
    );
    expect(mockClient.ping).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it('should merge extension servers with config servers', async () => {
    mockedLoadSettings.mockReturnValue(
      createMockSettings({
        mcpServers: {
          'config-server': { command: '/config/server' },
        },
        isTrusted: true,
      }),
    );

    mockExtensionManager.loadExtensions.mockReturnValue([
      {
        name: 'test-extension',
        mcpServers: { 'extension-server': { command: '/ext/server' } },
      },
    ]);

    mockClient.connect.mockResolvedValue(undefined);
    mockClient.ping.mockResolvedValue(undefined);

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'config-server: /config/server  (stdio) - Connected',
      ),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'extension-server (from test-extension): /ext/server  (stdio) - Connected',
      ),
    );
  });

  it('should filter servers based on admin allowlist passed in settings', async () => {
    const adminControls = {
      strictModeDisabled: true,
      mcpSetting: {
        mcpEnabled: true,
        mcpConfig: {
          mcpServers: {
            'allowed-server': { url: 'http://allowed' },
          },
        },
      },
    };

    const mcpServers = {
      'allowed-server': { command: 'cmd1' },
      'forbidden-server': { command: 'cmd2' },
    };

    const mockSettings = createMockSettings({
      mcpServers,
      isTrusted: true,
    });
    // setRemoteAdminSettings is the correct way to set admin settings in tests
    (
      mockSettings as unknown as {
        setRemoteAdminSettings: (controls: AdminControlsSettings) => void;
      }
    ).setRemoteAdminSettings(adminControls as unknown as AdminControlsSettings);

    mockedLoadSettings.mockReturnValue(mockSettings);

    mockClient.connect.mockResolvedValue(undefined);
    mockClient.ping.mockResolvedValue(undefined);

    await listMcpServers(mockSettings);

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('allowed-server'),
    );
    expect(debugLogger.log).not.toHaveBeenCalledWith(
      expect.stringContaining('forbidden-server'),
    );
    expect(mockedCreateTransport).toHaveBeenCalledWith(
      'allowed-server',
      expect.objectContaining({ url: 'http://allowed' }), // Should use admin config
      false,
      expect.anything(),
    );
  });

  it('should show stdio servers as disabled in untrusted folders', async () => {
    mockedLoadSettings.mockReturnValue(
      createMockSettings({
        mcpServers: {
          'test-server': { command: '/test/server' },
        },
        isTrusted: false,
      }),
    );

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Warning: MCP servers are configured but disabled because this folder is untrusted.',
      ),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('test-server: /test/server  (stdio) - Disabled'),
    );
  });

  it('should display blocked status for servers in excluded list', async () => {
    mockedLoadSettings.mockReturnValue(
      createMockSettings({
        mcp: {
          excluded: ['blocked-server'],
        },
        mcpServers: {
          'blocked-server': { command: '/test/server' },
        },
        isTrusted: true,
      }),
    );

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'blocked-server: /test/server  (stdio) - Blocked',
      ),
    );
    expect(mockedCreateTransport).not.toHaveBeenCalled();
  });

  it('should display disabled status for servers disabled via enablement manager', async () => {
    mockedLoadSettings.mockReturnValue(
      createMockSettings({
        mcpServers: {
          'disabled-server': { command: '/test/server' },
        },
        isTrusted: true,
      }),
    );

    vi.spyOn(
      McpServerEnablementManager.prototype,
      'isFileEnabled',
    ).mockResolvedValue(false);

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'disabled-server: /test/server  (stdio) - Disabled',
      ),
    );
    expect(mockedCreateTransport).not.toHaveBeenCalled();
  });

  it('should display warning and disabled status in untrusted folders', async () => {
    const userMcpServers = {
      'user-server': { url: 'https://example.com/user' },
    };
    const workspaceMcpServers = {
      'project-server': { command: '/path/to/project/server' },
    };

    mockedLoadSettings.mockReturnValue(
      createMockSettings({
        user: {
          settings: { mcpServers: userMcpServers },
          originalSettings: { mcpServers: userMcpServers },
          path: '/mock/user/settings.json',
        },
        workspace: {
          settings: { mcpServers: workspaceMcpServers },
          originalSettings: { mcpServers: workspaceMcpServers },
          path: '/mock/workspace/settings.json',
        },
        isTrusted: false,
      }),
    );

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Warning: MCP servers are configured but disabled because this folder is untrusted.',
      ),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'project-server: /path/to/project/server  (stdio) - Disabled',
      ),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'user-server: https://example.com/user (http) - Disabled',
      ),
    );
    expect(mockedCreateTransport).not.toHaveBeenCalled();
  });

  it('should block servers excluded by user settings even if workspace settings override/clear the excluded list', async () => {
    const mockSettings = createMockSettings({
      user: {
        path: '/user/settings.json',
        settings: {
          mcp: {
            excluded: ['blocked-server'],
          },
        },
        originalSettings: {
          mcp: {
            excluded: ['blocked-server'],
          },
        },
      },
      workspace: {
        path: '/workspace/settings.json',
        settings: {
          mcp: {
            excluded: [],
          },
        },
        originalSettings: {
          mcp: {
            excluded: [],
          },
        },
      },
      mcpServers: {
        'blocked-server': { command: '/test/server' },
      },
      isTrusted: true,
      merged: {
        mcp: {
          excluded: [], // workspace has overridden user settings!
        },
        mcpServers: {
          'blocked-server': { command: '/test/server' },
        },
      },
    });

    mockedLoadSettings.mockReturnValue(mockSettings);

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'blocked-server: /test/server  (stdio) - Blocked',
      ),
    );
    expect(mockedCreateTransport).not.toHaveBeenCalled();
  });

  it('should block servers case-insensitively when excluded', async () => {
    const mockSettings = createMockSettings({
      user: {
        path: '/user/settings.json',
        settings: {
          mcp: {
            excluded: ['BLOCKED-server'],
          },
        },
        originalSettings: {
          mcp: {
            excluded: ['BLOCKED-server'],
          },
        },
      },
      mcpServers: {
        'blocked-server': { command: '/test/server' },
      },
      isTrusted: true,
      merged: {
        mcpServers: {
          'blocked-server': { command: '/test/server' },
        },
      },
    });

    mockedLoadSettings.mockReturnValue(mockSettings);

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'blocked-server: /test/server  (stdio) - Blocked',
      ),
    );
    expect(mockedCreateTransport).not.toHaveBeenCalled();
  });

  it('should restrict allowed servers to the intersection of all defined allowlists', async () => {
    const mockSettings = createMockSettings({
      user: {
        path: '/user/settings.json',
        settings: {
          mcp: {
            allowed: ['allowed-server-1', 'allowed-server-2'],
          },
        },
        originalSettings: {
          mcp: {
            allowed: ['allowed-server-1', 'allowed-server-2'],
          },
        },
      },
      workspace: {
        path: '/workspace/settings.json',
        settings: {
          mcp: {
            allowed: ['allowed-server-1', 'malicious-server'],
          },
        },
        originalSettings: {
          mcp: {
            allowed: ['allowed-server-1', 'malicious-server'],
          },
        },
      },
      mcpServers: {
        'allowed-server-1': { command: '/allowed/1' },
        'allowed-server-2': { command: '/allowed/2' },
        'malicious-server': { command: '/malicious' },
      },
      isTrusted: true,
      merged: {
        mcp: {
          allowed: ['allowed-server-1', 'malicious-server'], // workspace overrode user settings!
        },
        mcpServers: {
          'allowed-server-1': { command: '/allowed/1' },
          'allowed-server-2': { command: '/allowed/2' },
          'malicious-server': { command: '/malicious' },
        },
      },
    });

    mockedLoadSettings.mockReturnValue(mockSettings);
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.ping.mockResolvedValue(undefined);

    await listMcpServers();

    // allowed-server-1 is in the intersection, so it should connect
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'allowed-server-1: /allowed/1  (stdio) - Connected',
      ),
    );
    // allowed-server-2 and malicious-server are not in the intersection, so they should be Blocked
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'allowed-server-2: /allowed/2  (stdio) - Blocked',
      ),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'malicious-server: /malicious  (stdio) - Blocked',
      ),
    );

    expect(mockedCreateTransport).toHaveBeenCalledTimes(1);
    expect(mockedCreateTransport).toHaveBeenCalledWith(
      'allowed-server-1',
      expect.any(Object),
      false,
      expect.any(Object),
    );
  });

  it('should block all servers if the intersection of user and workspace allowlists is empty (disjoint allowlists)', async () => {
    const mockSettings = createMockSettings({
      user: {
        path: '/user/settings.json',
        settings: {
          mcp: {
            allowed: ['user-allowed-server'],
          },
        },
        originalSettings: {
          mcp: {
            allowed: ['user-allowed-server'],
          },
        },
      },
      workspace: {
        path: '/workspace/settings.json',
        settings: {
          mcp: {
            allowed: ['workspace-allowed-server'],
          },
        },
        originalSettings: {
          mcp: {
            allowed: ['workspace-allowed-server'],
          },
        },
      },
      mcpServers: {
        'user-allowed-server': { command: '/allowed/user' },
        'workspace-allowed-server': { command: '/allowed/workspace' },
      },
      isTrusted: true,
      merged: {
        mcp: {
          allowed: ['workspace-allowed-server'], // workspace override
        },
        mcpServers: {
          'user-allowed-server': { command: '/allowed/user' },
          'workspace-allowed-server': { command: '/allowed/workspace' },
        },
      },
    });

    mockedLoadSettings.mockReturnValue(mockSettings);

    await listMcpServers();

    // Since the intersection is empty ([]), both servers should be Blocked!
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'user-allowed-server: /allowed/user  (stdio) - Blocked',
      ),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'workspace-allowed-server: /allowed/workspace  (stdio) - Blocked',
      ),
    );
    expect(mockedCreateTransport).not.toHaveBeenCalled();
  });

  it('should block all servers if allowlist is configured as empty array []', async () => {
    const mockSettings = createMockSettings({
      mcp: {
        allowed: [], // empty allowlist configured!
      },
      mcpServers: {
        'test-server': { command: '/test/server' },
      },
      isTrusted: true,
    });

    mockedLoadSettings.mockReturnValue(mockSettings);

    await listMcpServers();

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('test-server: /test/server  (stdio) - Blocked'),
    );
    expect(mockedCreateTransport).not.toHaveBeenCalled();
  });
});
