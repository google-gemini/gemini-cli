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
  Config,
  ExperimentFlags,
  fetchAdminControls,
  coreEvents,
} from '@google/gemini-cli-core';

// Mock dependencies
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    Config: vi.fn().mockImplementation((params) => {
      const mockConfig = {
        ...params,
        initialize: vi.fn(),
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
    loadServerHierarchicalMemory: vi
      .fn()
      .mockResolvedValue({ memoryContent: '', fileCount: 0, filePaths: [] }),
    startupProfiler: {
      flush: vi.fn(),
    },
    FileDiscoveryService: vi.fn(),
    getCodeAssistServer: vi.fn(),
    fetchAdminControls: vi.fn(),
    coreEvents: {
      emitAdminSettingsChanged: vi.fn(),
    },
  };
});

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('loadConfig', () => {
  const mockSettings = {} as Settings;
  const mockExtensionLoader = {} as ExtensionLoader;
  const taskId = 'test-task-id';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['GEMINI_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    delete process.env['CUSTOM_IGNORE_FILE_PATHS'];
    delete process.env['GEMINI_API_KEY'];
  });

  describe('admin settings overrides', () => {
    it('should fetch admin controls with enabled=false if experiment is disabled', async () => {
      await loadConfig(mockSettings, mockExtensionLoader, taskId);
      expect(fetchAdminControls).toHaveBeenCalledWith(
        undefined,
        undefined,
        false,
        expect.any(Function),
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

      it('should fetch admin controls', async () => {
        const mockAdminSettings = { tool_allowlist: ['tool1'] };
        vi.mocked(fetchAdminControls).mockResolvedValue(mockAdminSettings);

        const config = await loadConfig(
          mockSettings,
          mockExtensionLoader,
          taskId,
        );

        expect(fetchAdminControls).toHaveBeenCalledWith(
          undefined,
          {},
          true,
          expect.any(Function),
        );
        expect(config.setRemoteAdminSettings).toHaveBeenCalledWith(
          mockAdminSettings,
        );
      });

      it('should call setRemoteAdminSettings and emit event on callback', async () => {
        const newAdminSettings = { tool_allowlist: ['tool2'] };
        vi.mocked(fetchAdminControls).mockImplementation(
          async (
            _server,
            _currentSettings,
            _enabled,
            callback: (newSettings: object) => void,
          ) => {
            callback(newAdminSettings);
            return {};
          },
        );

        const config = await loadConfig(
          mockSettings,
          mockExtensionLoader,
          taskId,
        );

        expect(config.setRemoteAdminSettings).toHaveBeenCalledWith(
          newAdminSettings,
        );
        expect(coreEvents.emitAdminSettingsChanged).toHaveBeenCalled();
      });
    });
  });

  it('should set customIgnoreFilePaths when CUSTOM_IGNORE_FILE_PATHS env var is present', async () => {
    const testPath = '/tmp/ignore';
    process.env['CUSTOM_IGNORE_FILE_PATHS'] = testPath;
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
    process.env['CUSTOM_IGNORE_FILE_PATHS'] = envPath;
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
    process.env['CUSTOM_IGNORE_FILE_PATHS'] = paths.join(path.delimiter);
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
    process.env['CUSTOM_IGNORE_FILE_PATHS'] = testPath;
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
});
