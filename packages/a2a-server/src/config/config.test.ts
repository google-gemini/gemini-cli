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
  type MockInstance,
} from 'vitest';
import * as path from 'node:path';
import { loadConfig } from './config.js';
import type { Settings } from './settings.js';

import {
  fetchAdminControlsOnce,
  Config,
  type FetchAdminControlsResponse,
  type ExtensionLoader,
} from '@google/gemini-cli-core';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

interface MockConfigParams {
  clientName?: string;
  allowedTools?: string[];
  approvalMode?: string;
}

// Mock dependencies
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();

  const mockConfigCtor = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    params: MockConfigParams,
  ) {
    Object.assign(this, params);
    this['initialize'] = vi.fn().mockResolvedValue(undefined);
    this['waitForMcpInit'] = vi.fn().mockResolvedValue(undefined);
    this['refreshAuth'] = vi.fn().mockResolvedValue(undefined);
    this['getExperiments'] = vi.fn().mockReturnValue({
      flags: {
        ['enable_admin_controls']: {
          boolValue: false,
        },
      },
    });
    this['getRemoteAdminSettings'] = vi.fn().mockReturnValue({});
    this['setRemoteAdminSettings'] = vi.fn();
    this['getModel'] = vi.fn().mockReturnValue('gemini-2.0-flash');
    this['getUserTier'] = vi.fn().mockReturnValue('free');
    this['getClientName'] = vi.fn().mockReturnValue(params.clientName);
    this['getAllowedTools'] = vi
      .fn()
      .mockReturnValue(params.allowedTools || []);
    this['getApprovalMode'] = vi
      .fn()
      .mockReturnValue(params.approvalMode || 'default');
    return this as unknown as Config;
  });

  return {
    ...actual,
    PREVIEW_GEMINI_MODEL: 'gemini-2.0-flash',
    DEFAULT_GEMINI_EMBEDDING_MODEL: 'text-embedding-004',
    ApprovalMode: {
      DEFAULT: 'default',
      YOLO: 'yolo',
    },
    AuthType: {
      USE_GEMINI: 'use_gemini',
      LOGIN_WITH_GOOGLE: 'login_with_google',
      COMPUTE_ADC: 'compute_adc',
    },
    ExperimentFlags: {
      ENABLE_ADMIN_CONTROLS: 'enable_admin_controls',
    },
    Config: mockConfigCtor,
    loadServerHierarchicalMemory: vi.fn().mockResolvedValue({
      memoryContent: { global: '', extension: '', project: '' },
      fileCount: 0,
      filePaths: [],
    }),
    startupProfiler: {
      flush: vi.fn(),
    },
    isHeadlessMode: vi.fn().mockReturnValue(false),
    FileDiscoveryService: vi.fn().mockImplementation(() => ({})),
    getCodeAssistServer: vi.fn(),
    fetchAdminControlsOnce: vi.fn(),
    coreEvents: {
      emitAdminSettingsChanged: vi.fn(),
    },
  };
});

describe('loadConfig', () => {
  const mockSettings = {} as Settings;
  const mockExtensionLoader = {} as unknown as ExtensionLoader;
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

    it('should set clientName to a2a-server in config', async () => {
      await loadConfig(mockSettings, mockExtensionLoader, taskId);
      expect(Config).toHaveBeenCalledWith(
        expect.objectContaining({
          clientName: 'a2a-server',
        }),
      );
    });

    describe('when admin controls experiment is enabled', () => {
      beforeEach(() => {
        const mockConfig = Config as unknown as MockInstance;
        mockConfig.mockImplementation(function (
          this: Record<string, unknown>,
          params: MockConfigParams,
        ) {
          Object.assign(this, params);
          this['initialize'] = vi.fn().mockResolvedValue(undefined);
          this['waitForMcpInit'] = vi.fn().mockResolvedValue(undefined);
          this['refreshAuth'] = vi.fn().mockResolvedValue(undefined);
          this['getExperiments'] = vi.fn().mockReturnValue({
            flags: {
              ['enable_admin_controls']: {
                boolValue: true,
              },
            },
          });
          this['getRemoteAdminSettings'] = vi.fn().mockReturnValue({});
          this['setRemoteAdminSettings'] = vi.fn();
          this['getModel'] = vi.fn().mockReturnValue('gemini-2.0-flash');
          this['getUserTier'] = vi.fn().mockReturnValue('free');
          this['getClientName'] = vi.fn().mockReturnValue(params.clientName);
          return this as unknown as Config;
        });
      });

      it('should fetch admin controls and apply them', async () => {
        const mockAdminSettings: Partial<FetchAdminControlsResponse> = {
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
        vi.mocked(fetchAdminControlsOnce).mockResolvedValue(
          mockAdminSettings as FetchAdminControlsResponse,
        );

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
    });
  });

  it('should split CUSTOM_IGNORE_FILE_PATHS using system delimiter', async () => {
    const paths = ['/path/one', '/path/two'];
    vi.stubEnv('CUSTOM_IGNORE_FILE_PATHS', paths.join(path.delimiter));
    await loadConfig(mockSettings, mockExtensionLoader, taskId);
    expect(Config).toHaveBeenCalledWith(
      expect.objectContaining({
        fileFiltering: expect.objectContaining({
          customIgnoreFilePaths: paths,
        }),
      }),
    );
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
  });
});
