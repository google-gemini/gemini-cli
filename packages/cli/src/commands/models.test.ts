/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModelConfigService, tokenLimit } from '@google/gemini-cli-core';
import { handleModelsList, modelsCommand } from './models.js';
import { loadSettings, type LoadedSettings } from '../config/settings.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const { mockCoreDebugLogger } = await import(
    '../test-utils/mockDebugLogger.js'
  );
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  const mocked = mockCoreDebugLogger(actual, { stripAnsi: false });
  return {
    ...mocked,
    getErrorMessage: vi.fn((e) => (e as Error).message),
    tokenLimit: vi.fn(),
  };
});

vi.mock('../config/settings.js');
vi.mock('./utils.js', () => ({
  exitCli: vi.fn(),
}));

describe('models command', () => {
  const mockLoadSettings = vi.mocked(loadSettings);
  const mockTokenLimit = vi.mocked(tokenLimit);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleLogSpy: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLoadSettings.mockReturnValue({
      merged: {},
    } as unknown as LoadedSettings);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleModelsList', () => {
    it('should list available models in text format', async () => {
      const mockModels: ReturnType<
        ModelConfigService['getAvailableModelOptions']
      > = [
        {
          modelId: 'model-1',
          name: 'Model 1',
          description: 'Desc 1',
          tier: 'pro',
        },
        {
          modelId: 'model-2',
          name: 'Model 2',
          description: 'Desc 2',
          tier: 'flash',
        },
      ];

      vi.spyOn(
        ModelConfigService.prototype,
        'getAvailableModelOptions',
      ).mockReturnValue(mockModels);
      mockTokenLimit.mockReturnValue(1000000);

      await handleModelsList();

      expect(consoleLogSpy).toHaveBeenCalledWith('Available Gemini Models:');
      expect(consoleLogSpy).toHaveBeenCalledWith('Model 1 (model-1)');
      expect(consoleLogSpy).toHaveBeenCalledWith('  Description: Desc 1');
      expect(consoleLogSpy).toHaveBeenCalledWith('  Tier: pro');
      expect(consoleLogSpy).toHaveBeenCalledWith('Model 2 (model-2)');
      expect(consoleLogSpy).toHaveBeenCalledWith('  Description: Desc 2');
      expect(consoleLogSpy).toHaveBeenCalledWith('  Tier: flash');

      // Depending on locale, this might be 1,000,000 or 1.000.000
      // We can check if it contains "1" and "000" and "000"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const call = consoleLogSpy.mock.calls.find((c: any) =>
        String(c[0]).includes('Context Window:'),
      );
      expect(call?.[0]).toMatch(/Context Window: 1.*000.*000 tokens/);
    });

    it('should list available models in JSON format', async () => {
      const mockModels: ReturnType<
        ModelConfigService['getAvailableModelOptions']
      > = [
        {
          modelId: 'model-1',
          name: 'Model 1',
          description: 'Desc 1',
          tier: 'pro',
        },
      ];

      vi.spyOn(
        ModelConfigService.prototype,
        'getAvailableModelOptions',
      ).mockReturnValue(mockModels);
      mockTokenLimit.mockReturnValue(1000000);

      await handleModelsList({ outputFormat: 'json' });

      const expectedJson = JSON.stringify(
        [
          {
            modelId: 'model-1',
            displayName: 'Model 1',
            description: 'Desc 1',
            contextWindow: 1000000,
            tier: 'pro',
          },
        ],
        null,
        2,
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(expectedJson);
    });

    it('should throw an error on failure', async () => {
      vi.spyOn(
        ModelConfigService.prototype,
        'getAvailableModelOptions',
      ).mockImplementation(() => {
        throw new Error('Test Error');
      });

      await expect(handleModelsList()).rejects.toThrow('Test Error');
    });
  });

  describe('modelsCommand', () => {
    it('should have correct command and describe', () => {
      expect(modelsCommand.command).toBe('models');
      expect(modelsCommand.describe).toBe(
        'Lists available Gemini models in a structured format.',
      );
    });
  });
});
