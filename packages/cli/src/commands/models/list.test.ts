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
import { type Config } from '@google/gemini-cli-core';
import {
  handleList,
  listCommand,
  getModelListings,
  type ModelListing,
} from './list.js';
import { loadSettings, type LoadedSettings } from '../../config/settings.js';
import { loadCliConfig } from '../../config/config.js';
import { buildAvailableModels } from '../../acp/acpUtils.js';
import { exitCli } from '../utils.js';

vi.mock('../../config/settings.js');
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
          outputTokens: 8192,
        },
      });
      expect(listings[1].modelId).toBe('gemini-2.5-pro');
      expect(listings[1].contextLimits.inputTokens).toBe(1_048_576);
      expect(listings[1].contextLimits.outputTokens).toBe(8192);
    });

    it('should fall back to DEFAULT_TOKEN_LIMIT for unknown or custom models', () => {
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
      expect(listings[0].contextLimits.inputTokens).toBe(1_048_576);
      expect(listings[0].contextLimits.outputTokens).toBe(8192);
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
      expect(output).toContain('8,192 output tokens');
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
      expect(parsed[0].contextLimits.outputTokens).toBe(8192);
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
      expect(mockExitCli).toHaveBeenCalled();
    });
  });
});
