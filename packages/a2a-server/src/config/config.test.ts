/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { loadConfig } from './config.js';
import type { Settings } from './settings.js';
import {
  type ExtensionLoader,
  FileDiscoveryService,
  getCodeAssistServer,
  Config,
  ExperimentFlags,
  fetchAdminControlsOnce,
  type FetchAdminControlsResponse,
  AuthType,
  isHeadlessMode,
  FatalAuthenticationError,
  PolicyDecision,
  PRIORITY_YOLO_ALLOW_ALL,
} from '@google/gemini-cli-core';

// Mock dependencies
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    PRIORITY_YOLO_ALLOW_ALL: 998,
    Config: vi.fn().mockImplementation((params) => {
      const mockConfig = {
        ...params,
        initialize: vi.fn(),
        waitForMcpInit: vi.fn(),
        refreshAuth: vi.fn(),
        getExperiments: vi.fn().mockReturnValue({
          flags: {
            [actual.ExperimentFlags.ENABLE_ADMIN_CONTROLS]: {
              boolValue: false,
            },
          },
        }),
        getRemoteAdminSettings: vi.fn(),
        setRemoteAdminSettings: vi.fn(),
      };
      return mockConfig;
    }),
    loadServerHierarchicalMemory: vi.fn().mockResolvedValue({
      memoryContent: { global: '', extension: '', project: '' },
      fileCount: 0,
      filePaths: [],
    }),
    startupProfiler: {
      flush: vi.fn(),
    },
    isHeadlessMode: vi.fn().mockReturnValue(false),
    FileDiscoveryService: vi.fn(),
    getCodeAssistServer: vi.fn(),
    fetchAdminControlsOnce: vi.fn(),
    coreEvents: {
      emitAdminSettingsChanged: vi.fn(),
    },
  };
});

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('loadConfig', () => {
  const mockSettings = {} as Settings;
  const mockExtensionLoader = {} as ExtensionLoader;
  const taskId = 'test-task-id';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('admin settings overrides', () => {
    it('should not fetch admin controls if experiment is disabled', async () => {
      await loadConfig(mockSettings, mockExtensionLoader, taskId);
      expect(fetchAdminControlsOnce).not.toHaveBeenCalled();
    });

    it('should pass clientName as a2a-server to Config', async () => {
      await loadConfig(mockSettings, mockExtensionLoader, taskId);
      expect(Config).toHaveBeenCalledWith(
        expect.objectContaining({
          clientName: 'a2a-server',
        }),
      );
    });

    describe('when admin controls experiment is enabled', () => {
      beforeEach(() => {
        // We need to cast to any here to modify the mock implementation
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Config as any).mockImplementation((params: unknown) => {
          const mockConfig = {
            ...(params as object),
            initialize: vi.fn(),
            waitForMcpInit: vi.fn(),
            refreshAuth: vi.fn(),
            getExperiments: vi.fn().mockReturnValue({
              flags: {
                [ExperimentFlags.ENABLE_ADMIN_CONTROLS]: {
                  boolValue: true,
                },
              },
            }),
            getRemoteAdminSettings: vi.fn().mockReturnValue({}),
            setRemoteAdminSettings: vi.fn(),
          };
          return mockConfig;
        });
      });

      it('should fetch admin controls and apply them', async () => {
        const mockAdminSettings: FetchAdminControlsResponse = {
          mcpSetting: {
            mcpEnabled: false,
          },
          cliFeatureSetting: {
            extensionsSetting: {
              extensionsEnabled: false,
            },
          },
          strictModeDisabled: false,
        };
        vi.mocked(fetchAdminControlsOnce).mockResolvedValue(mockAdminSettings);

        await loadConfig(mockSettings, mockExtensionLoader, taskId);

        expect(Config).toHaveBeenLastCalledWith(
          expect.objectContaining({
            disableYoloMode: !mockAdminSettings.strictModeDisabled,
            mcpEnabled: mockAdminSettings.mcpSetting?.mcpEnabled,
            extensionsEnabled:
              mockAdminSettings.cliFeatureSetting?.extensionsSetting
                ?.extensionsEnabled,
          }),
        );
      });

      it('should treat unset admin settings as false when admin settings are passed', async () => {
        const mockAdminSettings: FetchAdminControlsResponse = {
          mcpSetting: {
            mcpEnabled: true,
          },
        };
        vi.mocked(fetchAdminControlsOnce).mockResolvedValue(mockAdminSettings);

        await loadConfig(mockSettings, mockExtensionLoader, taskId);

        expect(Config).toHaveBeenLastCalledWith(
          expect.objectContaining({
            disableYoloMode: !false,
            mcpEnabled: mockAdminSettings.mcpSetting?.mcpEnabled,
            extensionsEnabled: undefined,
          }),
        );
      });

      it('should not pass default unset admin settings when no admin settings are present', async () => {
        const mockAdminSettings: FetchAdminControlsResponse = {};
        vi.mocked(fetchAdminControlsOnce).mockResolvedValue(mockAdminSettings);

        await loadConfig(mockSettings, mockExtensionLoader, taskId);

        expect(Config).toHaveBeenLastCalledWith(expect.objectContaining({}));
      });

      it('should fetch admin controls using the code assist server when available', async () => {
        const mockAdminSettings: FetchAdminControlsResponse = {
          mcpSetting: {
            mcpEnabled: true,
          },
          strictModeDisabled: true,
        };
        const mockCodeAssistServer = { projectId: 'test-project' };
        vi.mocked(getCodeAssistServer).mockReturnValue(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mockCodeAssistServer as any,
        );
        vi.mocked(fetchAdminControlsOnce).mockResolvedValue(mockAdminSettings);

        await loadConfig(mockSettings, mockExtensionLoader, taskId);

        expect(fetchAdminControlsOnce).toHaveBeenCalledWith(
          mockCodeAssistServer,
          true,
        );
        expect(Config).toHaveBeenLastCalledWith(
          expect.objectContaining({
            disableYoloMode: !mockAdminSettings.strictModeDisabled,
            mcpEnabled: mockAdminSettings.mcpSetting?.mcpEnabled,
            extensionsEnabled: undefined,
          }),
        );
      });
    });
  });

  it('should set customIgnoreFilePaths when CUSTOM_IGNORE_FILE_PATHS env var is present', async () => {
    const testPath = '/tmp/ignore';
    vi.stubEnv('CUSTOM_IGNORE_FILE_PATHS', testPath);
    const config = await loadConfig(mockSettings, mockExtensionLoader, taskId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((config as any).fileFiltering.customIgnoreFilePaths).toEqual([
      testPath,
    ]);
  });

  it('should set customIgnoreFilePaths when settings.fileFiltering.customIgnoreFilePaths is present', async () => {
    const testPath = '/settings/ignore';
    const settings: Settings = {
      fileFiltering: {
        customIgnoreFilePaths: [testPath],
      },
    };
    const config = await loadConfig(settings, mockExtensionLoader, taskId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((config as any).fileFiltering.customIgnoreFilePaths).toEqual([
      testPath,
    ]);
  });

  it('should merge customIgnoreFilePaths from settings and env var', async () => {
    const envPath = '/env/ignore';
    const settingsPath = '/settings/ignore';
    vi.stubEnv('CUSTOM_IGNORE_FILE_PATHS', envPath);
    const settings: Settings = {
      fileFiltering: {
        customIgnoreFilePaths: [settingsPath],
      },
    };
    const config = await loadConfig(settings, mockExtensionLoader, taskId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((config as any).fileFiltering.customIgnoreFilePaths).toEqual([
      settingsPath,
      envPath,
    ]);
  });

  it('should split CUSTOM_IGNORE_FILE_PATHS using system delimiter', async () => {
    const paths = ['/path/one', '/path/two'];
    vi.stubEnv('CUSTOM_IGNORE_FILE_PATHS', paths.join(path.delimiter));
    const config = await loadConfig(mockSettings, mockExtensionLoader, taskId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((config as any).fileFiltering.customIgnoreFilePaths).toEqual(paths);
  });

  it('should have empty customIgnoreFilePaths when both are missing', async () => {
    const config = await loadConfig(mockSettings, mockExtensionLoader, taskId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((config as any).fileFiltering.customIgnoreFilePaths).toEqual([]);
  });

  it('should initialize FileDiscoveryService with correct options', async () => {
    const testPath = '/tmp/ignore';
    vi.stubEnv('CUSTOM_IGNORE_FILE_PATHS', testPath);
    const settings: Settings = {
      fileFiltering: {
        respectGitIgnore: false,
      },
    };

    await loadConfig(settings, mockExtensionLoader, taskId);

    expect(FileDiscoveryService).toHaveBeenCalledWith(expect.any(String), {
      respectGitIgnore: false,
      respectGeminiIgnore: undefined,
      customIgnoreFilePaths: [testPath],
    });
  });

  describe('tool configuration', () => {
    it('should pass V1 allowedTools to Config properly', async () => {
      const settings: Settings = {
        allowedTools: ['shell', 'edit'],
      };
      await loadConfig(settings, mockExtensionLoader, taskId);
      expect(Config).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedTools: ['shell', 'edit'],
        }),
      );
    });

    it('should pass V2 tools.allowed to Config properly', async () => {
      const settings: Settings = {
        tools: {
          allowed: ['shell', 'fetch'],
        },
      };
      await loadConfig(settings, mockExtensionLoader, taskId);
      expect(Config).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedTools: ['shell', 'fetch'],
        }),
      );
    });

    it('should prefer V1 allowedTools over V2 tools.allowed if both present', async () => {
      const settings: Settings = {
        allowedTools: ['v1-tool'],
        tools: {
          allowed: ['v2-tool'],
        },
      };
      await loadConfig(settings, mockExtensionLoader, taskId);
      expect(Config).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedTools: ['v1-tool'],
        }),
      );
    });

    it('should pass enableAgents to Config constructor', async () => {
      const settings: Settings = {
        experimental: {
          enableAgents: false,
        },
      };
      await loadConfig(settings, mockExtensionLoader, taskId);
      expect(Config).toHaveBeenCalledWith(
        expect.objectContaining({
          enableAgents: false,
        }),
      );
    });

    it('should default enableAgents to true when not provided', async () => {
      await loadConfig(mockSettings, mockExtensionLoader, taskId);
      expect(Config).toHaveBeenCalledWith(
        expect.objectContaining({
          enableAgents: true,
        }),
      );
    });

    describe('interactivity', () => {
      it('should always set interactive true', async () => {
        vi.mocked(isHeadlessMode).mockReturnValue(true);
        await loadConfig(mockSettings, mockExtensionLoader, taskId);
        expect(Config).toHaveBeenCalledWith(
          expect.objectContaining({
            interactive: true,
          }),
        );

        vi.mocked(isHeadlessMode).mockReturnValue(false);
        await loadConfig(mockSettings, mockExtensionLoader, taskId);
        expect(Config).toHaveBeenCalledWith(
          expect.objectContaining({
            interactive: true,
          }),
        );
      });

      it('should set enableInteractiveShell based on headless mode', async () => {
        vi.mocked(isHeadlessMode).mockReturnValue(false);
        await loadConfig(mockSettings, mockExtensionLoader, taskId);
        expect(Config).toHaveBeenCalledWith(
          expect.objectContaining({
            enableInteractiveShell: true,
          }),
        );

        vi.mocked(isHeadlessMode).mockReturnValue(true);
        await loadConfig(mockSettings, mockExtensionLoader, taskId);
        expect(Config).toHaveBeenCalledWith(
          expect.objectContaining({
            enableInteractiveShell: false,
          }),
        );
      });
    });

    describe('YOLO mode', () => {
      it('should enable YOLO mode and add policy rule when GEMINI_YOLO_MODE is true', async () => {
        vi.stubEnv('GEMINI_YOLO_MODE', 'true');
        await loadConfig(mockSettings, mockExtensionLoader, taskId);
        expect(Config).toHaveBeenCalledWith(
          expect.objectContaining({
            approvalMode: 'yolo',
            policyEngineConfig: expect.objectContaining({
              rules: expect.arrayContaining([
                expect.objectContaining({
                  decision: PolicyDecision.ALLOW,
                  priority: PRIORITY_YOLO_ALLOW_ALL,
                  modes: ['yolo'],
                  allowRedirection: true,
                }),
              ]),
            }),
          }),
        );
      });

      it('should use default approval mode and empty rules when GEMINI_YOLO_MODE is not true', async () => {
        vi.stubEnv('GEMINI_YOLO_MODE', 'false');
        await loadConfig(mockSettings, mockExtensionLoader, taskId);
        expect(Config).toHaveBeenCalledWith(
          expect.objectContaining({
            approvalMode: 'default',
            policyEngineConfig: expect.objectContaining({
              rules: [],
            }),
          }),
        );
      });
    });

    describe('authentication fallback', () => {
      beforeEach(() => {
        vi.stubEnv('USE_CCPA', 'true');
        vi.stubEnv('GEMINI_API_KEY', '');
      });

      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it('should fall back to COMPUTE_ADC in Cloud Shell if LOGIN_WITH_GOOGLE fails', async () => {
        vi.stubEnv('CLOUD_SHELL', 'true');
        vi.mocked(isHeadlessMode).mockReturnValue(false);
        const refreshAuthMock = vi.fn().mockImplementation((authType) => {
          if (authType === AuthType.LOGIN_WITH_GOOGLE) {
            throw new FatalAuthenticationError('Non-interactive session');
          }
          return Promise.resolve();
        });

        // Update the mock implementation for this test
        vi.mocked(Config).mockImplementation(
          (params: unknown) =>
            ({
              ...(params as object),
              initialize: vi.fn(),
              waitForMcpInit: vi.fn(),
              refreshAuth: refreshAuthMock,
              getExperiments: vi.fn().mockReturnValue({ flags: {} }),
              getRemoteAdminSettings: vi.fn(),
              setRemoteAdminSettings: vi.fn(),
            }) as unknown as Config,
        );

        await loadConfig(mockSettings, mockExtensionLoader, taskId);

        expect(refreshAuthMock).toHaveBeenCalledWith(
          AuthType.LOGIN_WITH_GOOGLE,
        );
        expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.COMPUTE_ADC);
      });

      it('should not fall back to COMPUTE_ADC if not in cloud environment', async () => {
        vi.mocked(isHeadlessMode).mockReturnValue(false);
        const refreshAuthMock = vi.fn().mockImplementation((authType) => {
          if (authType === AuthType.LOGIN_WITH_GOOGLE) {
            throw new FatalAuthenticationError('Non-interactive session');
          }
          return Promise.resolve();
        });

        vi.mocked(Config).mockImplementation(
          (params: unknown) =>
            ({
              ...(params as object),
              initialize: vi.fn(),
              waitForMcpInit: vi.fn(),
              refreshAuth: refreshAuthMock,
              getExperiments: vi.fn().mockReturnValue({ flags: {} }),
              getRemoteAdminSettings: vi.fn(),
              setRemoteAdminSettings: vi.fn(),
            }) as unknown as Config,
        );

        await expect(
          loadConfig(mockSettings, mockExtensionLoader, taskId),
        ).rejects.toThrow('Non-interactive session');

        expect(refreshAuthMock).toHaveBeenCalledWith(
          AuthType.LOGIN_WITH_GOOGLE,
        );
        expect(refreshAuthMock).not.toHaveBeenCalledWith(AuthType.COMPUTE_ADC);
      });

      it('should skip LOGIN_WITH_GOOGLE and use COMPUTE_ADC directly in headless Cloud Shell', async () => {
        vi.stubEnv('CLOUD_SHELL', 'true');
        vi.mocked(isHeadlessMode).mockReturnValue(true);

        const refreshAuthMock = vi.fn().mockResolvedValue(undefined);

        vi.mocked(Config).mockImplementation(
          (params: unknown) =>
            ({
              ...(params as object),
              initialize: vi.fn(),
              waitForMcpInit: vi.fn(),
              refreshAuth: refreshAuthMock,
              getExperiments: vi.fn().mockReturnValue({ flags: {} }),
              getRemoteAdminSettings: vi.fn(),
              setRemoteAdminSettings: vi.fn(),
            }) as unknown as Config,
        );

        await loadConfig(mockSettings, mockExtensionLoader, taskId);

        expect(refreshAuthMock).not.toHaveBeenCalledWith(
          AuthType.LOGIN_WITH_GOOGLE,
        );
        expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.COMPUTE_ADC);
      });

      it('should skip LOGIN_WITH_GOOGLE and use COMPUTE_ADC directly if GEMINI_CLI_USE_COMPUTE_ADC is true', async () => {
        vi.stubEnv('GEMINI_CLI_USE_COMPUTE_ADC', 'true');
        vi.mocked(isHeadlessMode).mockReturnValue(false); // Even if not headless

        const refreshAuthMock = vi.fn().mockResolvedValue(undefined);

        vi.mocked(Config).mockImplementation(
          (params: unknown) =>
            ({
              ...(params as object),
              initialize: vi.fn(),
              waitForMcpInit: vi.fn(),
              refreshAuth: refreshAuthMock,
              getExperiments: vi.fn().mockReturnValue({ flags: {} }),
              getRemoteAdminSettings: vi.fn(),
              setRemoteAdminSettings: vi.fn(),
            }) as unknown as Config,
        );

        await loadConfig(mockSettings, mockExtensionLoader, taskId);

        expect(refreshAuthMock).not.toHaveBeenCalledWith(
          AuthType.LOGIN_WITH_GOOGLE,
        );
        expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.COMPUTE_ADC);
      });

      it('should throw FatalAuthenticationError in headless mode if no ADC fallback available', async () => {
        vi.mocked(isHeadlessMode).mockReturnValue(true);

        const refreshAuthMock = vi.fn().mockResolvedValue(undefined);

        vi.mocked(Config).mockImplementation(
          (params: unknown) =>
            ({
              ...(params as object),
              initialize: vi.fn(),
              waitForMcpInit: vi.fn(),
              refreshAuth: refreshAuthMock,
              getExperiments: vi.fn().mockReturnValue({ flags: {} }),
              getRemoteAdminSettings: vi.fn(),
              setRemoteAdminSettings: vi.fn(),
            }) as unknown as Config,
        );

        await expect(
          loadConfig(mockSettings, mockExtensionLoader, taskId),
        ).rejects.toThrow(
          'Interactive terminal required for LOGIN_WITH_GOOGLE. Run in an interactive terminal or set GEMINI_CLI_USE_COMPUTE_ADC=true to use Application Default Credentials.',
        );

        expect(refreshAuthMock).not.toHaveBeenCalled();
      });

      it('should include both original and fallback error when COMPUTE_ADC fallback fails', async () => {
        vi.stubEnv('CLOUD_SHELL', 'true');
        vi.mocked(isHeadlessMode).mockReturnValue(false);

        const refreshAuthMock = vi.fn().mockImplementation((authType) => {
          if (authType === AuthType.LOGIN_WITH_GOOGLE) {
            throw new FatalAuthenticationError('OAuth failed');
          }
          if (authType === AuthType.COMPUTE_ADC) {
            throw new Error('ADC failed');
          }
          return Promise.resolve();
        });

        vi.mocked(Config).mockImplementation(
          (params: unknown) =>
            ({
              ...(params as object),
              initialize: vi.fn(),
              waitForMcpInit: vi.fn(),
              refreshAuth: refreshAuthMock,
              getExperiments: vi.fn().mockReturnValue({ flags: {} }),
              getRemoteAdminSettings: vi.fn(),
              setRemoteAdminSettings: vi.fn(),
            }) as unknown as Config,
        );

        await expect(
          loadConfig(mockSettings, mockExtensionLoader, taskId),
        ).rejects.toThrow(
          'OAuth failed. Fallback to COMPUTE_ADC also failed: ADC failed',
        );
      });
    });
  });
});
