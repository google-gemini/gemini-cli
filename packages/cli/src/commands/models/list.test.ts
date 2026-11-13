/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import type { Argv } from 'yargs';
import stripAnsi from 'strip-ansi';
import {
  type Config,
  AuthType,
  LATEST_GEMINI_FLASH_MODEL,
  setFlashModels,
  resetModelsForTesting,
} from '@google/gemini-cli-core';
import {
  handleList,
  listCommand,
  getModelListings,
  type ModelListing,
} from './list.js';
import { loadSettings, type LoadedSettings } from '../../config/settings.js';
import { validateAuthMethod } from '../../config/auth.js';
import { loadCliConfig } from '../../config/config.js';
import { buildAvailableModels } from '../../acp/acpUtils.js';
import { exitCli } from '../utils.js';

vi.mock('../../config/settings.js');
vi.mock('../../config/auth.js', () => ({
  validateAuthMethod: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../config/config.js');
vi.mock('../../acp/acpUtils.js');
vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));
vi.mock('../../gemini.js', () => ({
  initializeOutputListenersAndFlush: vi.fn(),
}));

describe('models list command', () => {
  const originalExitCode = process.exitCode;
  const mockLoadSettings = vi.mocked(loadSettings);
  const mockValidateAuthMethod = vi.mocked(validateAuthMethod);
  const mockLoadCliConfig = vi.mocked(loadCliConfig);
  const mockBuildAvailableModels = vi.mocked(buildAvailableModels);
  const mockExitCli = vi.mocked(exitCli);
  let stdoutWriteSpy: MockInstance<typeof process.stdout.write>;

  const sampleAvailableModels = [
    {
      modelId: 'auto',
      name: 'Auto',
      description: 'Automatic model selection',
    },
    {
      modelId: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      description: 'Advanced reasoning model',
    },
    {
      modelId: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      description: 'Fast multimodal model',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateAuthMethod.mockResolvedValue(null);
    mockLoadSettings.mockReturnValue({
      merged: {},
    } as unknown as LoadedSettings);
    mockLoadCliConfig.mockResolvedValue({
      storage: { initialize: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Config);
    mockBuildAvailableModels.mockReturnValue({
      availableModels: sampleAvailableModels,
      currentModelId: 'auto',
    });
    stdoutWriteSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    resetModelsForTesting();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('getModelListings', () => {
    it('should map available models with token limits and aliases', () => {
      const mockConfig = {} as unknown as Config;
      const mockSettings = { merged: {} } as unknown as LoadedSettings;

      const listings = getModelListings(mockConfig, mockSettings);

      expect(listings).toHaveLength(3);
      expect(listings[0]).toEqual({
        modelId: 'auto',
        id: 'auto',
        name: 'Auto',
        displayName: 'Auto',
        description: 'Automatic model selection',
        contextLimits: {
          inputTokens: 1_048_576,
          outputTokens: 65_536,
        },
      });
      expect(listings[1].modelId).toBe('gemini-2.5-pro');
      expect(listings[1].contextLimits.inputTokens).toBe(1_048_576);
      expect(listings[1].contextLimits.outputTokens).toBe(65_536);
      expect(listings[2].modelId).toBe('gemini-2.5-flash');
      expect(listings[2].contextLimits.inputTokens).toBe(1_048_576);
      expect(listings[2].contextLimits.outputTokens).toBe(65_536);
    });

    it('should fall back to DEFAULT_TOKEN_LIMIT and omit outputTokens for unknown or custom models', () => {
      mockBuildAvailableModels.mockReturnValue({
        availableModels: [
          {
            modelId: 'custom-new-model',
            name: 'Custom New Model',
            description: 'Custom model test',
          },
        ],
        currentModelId: 'custom-new-model',
      });

      const mockConfig = {} as unknown as Config;
      const mockSettings = { merged: {} } as unknown as LoadedSettings;

      const listings = getModelListings(mockConfig, mockSettings);

      expect(listings).toHaveLength(1);
      expect(listings[0].modelId).toBe('custom-new-model');
      expect(listings[0].contextLimits).toEqual({
        inputTokens: 1_048_576,
      });
      expect(listings[0].contextLimits.outputTokens).toBeUndefined();
    });

    it('should fall back to modelId when name is undefined', () => {
      mockBuildAvailableModels.mockReturnValue({
        availableModels: [
          {
            modelId: 'nameless-model',
            name: undefined as unknown as string,
            description: 'Model without a name',
          },
        ],
        currentModelId: 'nameless-model',
      });

      const mockConfig = {} as unknown as Config;
      const mockSettings = { merged: {} } as unknown as LoadedSettings;

      const listings = getModelListings(mockConfig, mockSettings);

      expect(listings).toHaveLength(1);
      expect(listings[0].name).toBe('nameless-model');
      expect(listings[0].displayName).toBe('nameless-model');
    });

    it('should handle undefined availableModels gracefully', () => {
      mockBuildAvailableModels.mockReturnValue({
        availableModels: undefined as unknown as [],
        currentModelId: 'auto',
      });

      const mockConfig = {} as unknown as Config;
      const mockSettings = { merged: {} } as unknown as LoadedSettings;

      const listings = getModelListings(mockConfig, mockSettings);

      expect(listings).toEqual([]);
    });
  });

  describe('handleList', () => {
    it('should output models in human-readable text format by default', async () => {
      await handleList({ outputFormat: 'text' });

      expect(stdoutWriteSpy).toHaveBeenCalled();
      const rawOutput = stdoutWriteSpy.mock.calls
        .map((call) => call[0].toString())
        .join('');
      const output = stripAnsi(rawOutput);

      expect(output).toContain('Available Gemini Models:');
      expect(output).toContain('auto (Auto)');
      expect(output).toContain('Automatic model selection');
      expect(output).toContain('gemini-2.5-pro (Gemini 2.5 Pro)');
      expect(output).toContain('1,048,576 input tokens');
      expect(output).toContain('65,536 output tokens');
    });

    it('should omit output tokens in text format when outputTokens is unknown', async () => {
      mockBuildAvailableModels.mockReturnValue({
        availableModels: [
          {
            modelId: 'custom-new-model',
            name: 'Custom New Model',
            description: 'Custom model test',
          },
        ],
        currentModelId: 'custom-new-model',
      });

      await handleList({ outputFormat: 'text' });

      const rawOutput = stdoutWriteSpy.mock.calls
        .map((call) => call[0].toString())
        .join('');
      const output = stripAnsi(rawOutput);

      expect(output).toContain('custom-new-model (Custom New Model)');
      expect(output).toContain('Context limit: 1,048,576 input tokens\n');
      expect(output).not.toContain('output tokens');
    });

    it('should output models in JSON format when outputFormat is json', async () => {
      await handleList({ outputFormat: 'json' });

      expect(stdoutWriteSpy).toHaveBeenCalled();
      const output = stdoutWriteSpy.mock.calls
        .map((call) => call[0].toString())
        .join('');

      const parsed = JSON.parse(output) as ModelListing[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(3);
      expect(parsed[0].modelId).toBe('auto');
      expect(parsed[0].id).toBe('auto');
      expect(parsed[0].displayName).toBe('Auto');
      expect(parsed[0].contextLimits.inputTokens).toBe(1_048_576);
      expect(parsed[0].contextLimits.outputTokens).toBe(65_536);
      expect(parsed[1].modelId).toBe('gemini-2.5-pro');
      expect(parsed[1].contextLimits.outputTokens).toBe(65_536);
    });

    it('should pass custom argv and initialize storage when handleList is called', async () => {
      const mockStorage = { initialize: vi.fn().mockResolvedValue(undefined) };
      mockLoadCliConfig.mockResolvedValueOnce({
        storage: mockStorage,
      } as unknown as Config);

      await handleList({
        outputFormat: 'text',
        argv: { debug: true },
      });

      expect(mockLoadCliConfig).toHaveBeenCalledWith(
        expect.anything(),
        'models-list-session',
        expect.objectContaining({ debug: true }),
        expect.anything(),
      );
      expect(mockStorage.initialize).toHaveBeenCalled();
    });

    it('should refresh auth before listing models so gemini-3.8-flash and updated Auto description are included without duplicates', async () => {
      const { buildAvailableModels: actualBuildAvailableModels } =
        await vi.importActual<typeof import('../../acp/acpUtils.js')>(
          '../../acp/acpUtils.js',
        );
      mockBuildAvailableModels.mockImplementation(actualBuildAvailableModels);

      let authRefreshed = false;
      const mockRefreshAuth = vi.fn().mockImplementation(async () => {
        authRefreshed = true;
      });

      const mockConfig = {
        storage: { initialize: vi.fn().mockResolvedValue(undefined) },
        refreshAuth: mockRefreshAuth,
        getModel: vi.fn().mockReturnValue('auto'),
        getHasAccessToPreviewModel: vi
          .fn()
          .mockImplementation(() => authRefreshed),
        getGemini31LaunchedSync: vi
          .fn()
          .mockImplementation(() => authRefreshed),
        hasLatestFlashGAAccess: vi.fn().mockImplementation(() => {
          if (authRefreshed) {
            setFlashModels(
              LATEST_GEMINI_FLASH_MODEL,
              LATEST_GEMINI_FLASH_MODEL,
            );
            return true;
          }
          return false;
        }),
        hasLatestFlashLiteGAAccess: vi.fn().mockReturnValue(false),
        getExperimentalDynamicModelConfiguration: vi
          .fn()
          .mockReturnValue(false),
      } as unknown as Config;

      mockLoadCliConfig.mockResolvedValueOnce(mockConfig);

      const loadedSettings = {
        merged: {
          security: {
            auth: {
              selectedType: AuthType.LOGIN_WITH_GOOGLE,
            },
          },
        },
      } as unknown as LoadedSettings;

      await handleList({
        outputFormat: 'json',
        loadedSettings,
      });

      const output = stdoutWriteSpy.mock.calls
        .map((call) => call[0].toString())
        .join('');
      const parsed = JSON.parse(output) as ModelListing[];
      const modelIds = parsed.map((m) => m.modelId);

      expect(modelIds).toEqual([
        'auto',
        'gemini-3.1-pro-preview',
        'gemini-3.8-flash',
        'gemini-2.5-pro',
        'gemini-3.1-flash-lite',
      ]);
      expect(parsed[0]).toMatchObject({
        modelId: 'auto',
        description:
          'Let Gemini CLI decide the best model for the task: gemini-3.1-pro-preview, gemini-3.8-flash',
      });
      expect(mockRefreshAuth).toHaveBeenCalledWith(AuthType.LOGIN_WITH_GOOGLE);
    });

    it('should fall back to getAuthTypeFromEnv when selectedType is not set', async () => {
      vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
      const mockRefreshAuth = vi.fn().mockResolvedValue(undefined);
      mockLoadCliConfig.mockResolvedValueOnce({
        storage: { initialize: vi.fn().mockResolvedValue(undefined) },
        refreshAuth: mockRefreshAuth,
      } as unknown as Config);

      await handleList({
        outputFormat: 'json',
        loadedSettings: { merged: {} } as unknown as LoadedSettings,
      });

      expect(mockRefreshAuth).toHaveBeenCalledWith(AuthType.USE_GEMINI);
    });

    it('should skip refreshAuth when security.auth.useExternal is true', async () => {
      const mockRefreshAuth = vi.fn().mockResolvedValue(undefined);
      mockLoadCliConfig.mockResolvedValueOnce({
        storage: { initialize: vi.fn().mockResolvedValue(undefined) },
        refreshAuth: mockRefreshAuth,
      } as unknown as Config);

      await handleList({
        outputFormat: 'json',
        loadedSettings: {
          merged: {
            security: {
              auth: {
                selectedType: AuthType.LOGIN_WITH_GOOGLE,
                useExternal: true,
              },
            },
          },
        } as unknown as LoadedSettings,
      });

      expect(mockRefreshAuth).not.toHaveBeenCalled();
    });

    it('should gracefully fall back to default catalog when refreshAuth fails', async () => {
      const mockRefreshAuth = vi
        .fn()
        .mockRejectedValue(new Error('Auth failed'));
      mockLoadCliConfig.mockResolvedValueOnce({
        storage: { initialize: vi.fn().mockResolvedValue(undefined) },
        refreshAuth: mockRefreshAuth,
      } as unknown as Config);

      await handleList({
        outputFormat: 'json',
        loadedSettings: {
          merged: {
            security: {
              auth: {
                selectedType: AuthType.LOGIN_WITH_GOOGLE,
              },
            },
          },
        } as unknown as LoadedSettings,
      });

      expect(mockRefreshAuth).toHaveBeenCalledWith(AuthType.LOGIN_WITH_GOOGLE);
      expect(stdoutWriteSpy).toHaveBeenCalled();
    });

    it('should suppress browser launch on config before calling refreshAuth', async () => {
      let browserSuppressedDuringRefresh = false;
      const mockConfig = {
        storage: { initialize: vi.fn().mockResolvedValue(undefined) },
        isBrowserLaunchSuppressed: () => false,
        refreshAuth: vi.fn().mockImplementation(async () => {
          browserSuppressedDuringRefresh =
            mockConfig.isBrowserLaunchSuppressed();
        }),
      } as unknown as Config;
      mockLoadCliConfig.mockResolvedValueOnce(mockConfig);

      await handleList({
        outputFormat: 'json',
        loadedSettings: {
          merged: {
            security: {
              auth: {
                selectedType: AuthType.LOGIN_WITH_GOOGLE,
              },
            },
          },
        } as unknown as LoadedSettings,
      });

      expect(browserSuppressedDuringRefresh).toBe(true);
    });

    it('should fall back to default catalog without calling refreshAuth when validateAuthMethod returns an error', async () => {
      mockValidateAuthMethod.mockResolvedValueOnce(
        'When using Vertex AI, you must specify GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION',
      );
      const mockRefreshAuth = vi.fn().mockResolvedValue(undefined);
      mockLoadCliConfig.mockResolvedValueOnce({
        storage: { initialize: vi.fn().mockResolvedValue(undefined) },
        refreshAuth: mockRefreshAuth,
      } as unknown as Config);

      await handleList({
        outputFormat: 'json',
        loadedSettings: {
          merged: {
            security: {
              auth: {
                selectedType: AuthType.USE_VERTEX_AI,
              },
            },
          },
        } as unknown as LoadedSettings,
      });

      expect(mockValidateAuthMethod).toHaveBeenCalledWith(
        AuthType.USE_VERTEX_AI,
      );
      expect(mockRefreshAuth).not.toHaveBeenCalled();
      expect(stdoutWriteSpy).toHaveBeenCalled();
    });

    it('should skip validateAuthMethod when authType is GATEWAY', async () => {
      vi.stubEnv('GOOGLE_GEMINI_BASE_URL', 'https://gateway.example.com');
      const mockRefreshAuth = vi.fn().mockResolvedValue(undefined);
      mockLoadCliConfig.mockResolvedValueOnce({
        storage: { initialize: vi.fn().mockResolvedValue(undefined) },
        refreshAuth: mockRefreshAuth,
      } as unknown as Config);

      await handleList({
        outputFormat: 'json',
        loadedSettings: { merged: {} } as unknown as LoadedSettings,
      });

      expect(mockValidateAuthMethod).not.toHaveBeenCalled();
      expect(mockRefreshAuth).toHaveBeenCalledWith(AuthType.GATEWAY);
    });

    it('should throw before refreshing auth when enforcedType conflicts with selectedType', async () => {
      const mockRefreshAuth = vi.fn().mockResolvedValue(undefined);
      mockLoadCliConfig.mockResolvedValueOnce({
        storage: { initialize: vi.fn().mockResolvedValue(undefined) },
        refreshAuth: mockRefreshAuth,
      } as unknown as Config);

      await expect(
        handleList({
          outputFormat: 'json',
          loadedSettings: {
            merged: {
              security: {
                auth: {
                  selectedType: AuthType.LOGIN_WITH_GOOGLE,
                  enforcedType: AuthType.USE_GEMINI,
                },
              },
            },
          } as unknown as LoadedSettings,
        }),
      ).rejects.toThrow(
        "The enforced authentication type is 'gemini-api-key', but the current type is 'oauth-personal'. Please re-authenticate with the correct type.",
      );

      expect(mockRefreshAuth).not.toHaveBeenCalled();
      expect(stdoutWriteSpy).not.toHaveBeenCalled();
    });

    it('should throw when enforcedType is set and no authentication is configured', async () => {
      vi.stubEnv('GEMINI_API_KEY', '');
      vi.stubEnv('GOOGLE_GENAI_USE_VERTEXAI', '');
      vi.stubEnv('GOOGLE_GENAI_USE_GCA', '');
      vi.stubEnv('GOOGLE_GEMINI_BASE_URL', '');
      vi.stubEnv('CLOUD_SHELL', '');
      vi.stubEnv('GEMINI_CLI_USE_COMPUTE_ADC', '');

      const mockRefreshAuth = vi.fn().mockResolvedValue(undefined);
      mockLoadCliConfig.mockResolvedValueOnce({
        storage: { initialize: vi.fn().mockResolvedValue(undefined) },
        refreshAuth: mockRefreshAuth,
      } as unknown as Config);

      await expect(
        handleList({
          outputFormat: 'json',
          loadedSettings: {
            merged: {
              security: {
                auth: {
                  enforcedType: AuthType.LOGIN_WITH_GOOGLE,
                },
              },
            },
          } as unknown as LoadedSettings,
        }),
      ).rejects.toThrow(
        "The auth type 'oauth-personal' is enforced, but no authentication is configured.",
      );

      expect(mockRefreshAuth).not.toHaveBeenCalled();
      expect(stdoutWriteSpy).not.toHaveBeenCalled();
    });

    it('should propagate error when enforcedType matches selectedType but validateAuthMethod fails', async () => {
      mockValidateAuthMethod.mockResolvedValueOnce(
        'When using Gemini API, you must specify the GEMINI_API_KEY environment variable.',
      );
      const mockRefreshAuth = vi.fn().mockResolvedValue(undefined);
      mockLoadCliConfig.mockResolvedValueOnce({
        storage: { initialize: vi.fn().mockResolvedValue(undefined) },
        refreshAuth: mockRefreshAuth,
      } as unknown as Config);

      await expect(
        handleList({
          outputFormat: 'json',
          loadedSettings: {
            merged: {
              security: {
                auth: {
                  selectedType: AuthType.USE_GEMINI,
                  enforcedType: AuthType.USE_GEMINI,
                },
              },
            },
          } as unknown as LoadedSettings,
        }),
      ).rejects.toThrow(
        'When using Gemini API, you must specify the GEMINI_API_KEY environment variable.',
      );

      expect(mockRefreshAuth).not.toHaveBeenCalled();
      expect(stdoutWriteSpy).not.toHaveBeenCalled();
    });

    it('should propagate error when enforcedType matches selectedType but refreshAuth fails', async () => {
      const mockRefreshAuth = vi
        .fn()
        .mockRejectedValue(new Error('OAuth credentials missing'));
      mockLoadCliConfig.mockResolvedValueOnce({
        storage: { initialize: vi.fn().mockResolvedValue(undefined) },
        refreshAuth: mockRefreshAuth,
      } as unknown as Config);

      await expect(
        handleList({
          outputFormat: 'json',
          loadedSettings: {
            merged: {
              security: {
                auth: {
                  selectedType: AuthType.LOGIN_WITH_GOOGLE,
                  enforcedType: AuthType.LOGIN_WITH_GOOGLE,
                },
              },
            },
          } as unknown as LoadedSettings,
        }),
      ).rejects.toThrow('OAuth credentials missing');

      expect(mockRefreshAuth).toHaveBeenCalledWith(AuthType.LOGIN_WITH_GOOGLE);
      expect(stdoutWriteSpy).not.toHaveBeenCalled();
    });
  });

  describe('listCommand module', () => {
    it('should define $0 and list as command identifiers', () => {
      expect(listCommand.command).toEqual(['$0', 'list']);
      expect(listCommand.describe).toBe('Lists available Gemini models.');
    });

    it('should configure output-format option in builder', () => {
      const mockOption = vi.fn().mockReturnThis();
      const mockYargs = {
        option: mockOption,
      } as unknown as Argv;

      if (typeof listCommand.builder === 'function') {
        listCommand.builder(mockYargs);
      }

      expect(mockOption).toHaveBeenCalledWith(
        'output-format',
        expect.objectContaining({
          alias: 'o',
          choices: ['text', 'json'],
          default: 'text',
        }),
      );
    });

    it('should invoke handleList and exitCli in handler', async () => {
      if (typeof listCommand.handler === 'function') {
        await listCommand.handler({
          'output-format': 'json',
          loadedSettings: { merged: {} } as unknown as LoadedSettings,
          $0: 'models',
          _: [],
        });
      }

      expect(mockExitCli).toHaveBeenCalledWith();
      expect(stdoutWriteSpy).toHaveBeenCalled();
      const output = stdoutWriteSpy.mock.calls
        .map((call) => call[0].toString())
        .join('');
      const parsed = JSON.parse(output) as ModelListing[];
      expect(parsed[0].modelId).toBe('auto');
    });

    it('should write error to stderr and still call exitCli on failure', async () => {
      const stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      mockLoadCliConfig.mockRejectedValueOnce(new Error('Config load failure'));

      if (typeof listCommand.handler === 'function') {
        await listCommand.handler({
          'output-format': 'text',
          loadedSettings: { merged: {} } as unknown as LoadedSettings,
          $0: 'models',
          _: [],
        });
      }

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error: Config load failure'),
      );
      expect(process.exitCode).toBe(1);
      expect(mockExitCli).toHaveBeenCalledWith(1);
    });
  });
});
