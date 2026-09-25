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
import { type Config } from '@google/gemini-cli-core';
import { handleList, listCommand } from './list.js';
import { loadSettings, type LoadedSettings } from '../../config/settings.js';
import { loadCliConfig } from '../../config/config.js';
import { buildAvailableModels } from '../../acp/acpUtils.js';

vi.mock('../../config/settings.js');
vi.mock('../../config/config.js');
vi.mock('../../acp/acpUtils.js', () => ({ buildAvailableModels: vi.fn() }));
vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

describe('models list command', () => {
  const mockLoadSettings = vi.mocked(loadSettings);
  const mockLoadCliConfig = vi.mocked(loadCliConfig);
  const mockBuildAvailableModels = vi.mocked(buildAvailableModels);
  let stdoutWriteSpy: MockInstance<typeof process.stdout.write>;

  const written = () =>
    stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSettings.mockReturnValue({
      merged: {},
    } as unknown as LoadedSettings);
    mockLoadCliConfig.mockResolvedValue({
      initialize: vi.fn().mockResolvedValue(undefined),
    } as unknown as Config);
    mockBuildAvailableModels.mockReturnValue({
      currentModelId: 'gemini-2.5-pro',
      availableModels: [
        {
          modelId: 'auto',
          name: 'Auto',
          description: 'Let Gemini CLI decide',
        },
        { modelId: 'gemini-2.5-pro', name: 'gemini-2.5-pro' },
      ],
    });
    stdoutWriteSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleList', () => {
    it('prints machine-readable JSON with id, name, description and input limit', async () => {
      await handleList({ outputFormat: 'json' });

      const parsed = JSON.parse(written());
      expect(parsed).toEqual({
        currentModel: 'gemini-2.5-pro',
        models: [
          {
            id: 'auto',
            name: 'Auto',
            description: 'Let Gemini CLI decide',
            inputTokenLimit: 1_048_576,
          },
          {
            id: 'gemini-2.5-pro',
            name: 'gemini-2.5-pro',
            description: '',
            inputTokenLimit: 1_048_576,
          },
        ],
      });
    });

    it('emits only JSON on stdout when json is requested', async () => {
      await handleList({ outputFormat: 'json' });

      expect(() => JSON.parse(written())).not.toThrow();
    });

    it('prints a human-readable list by default and marks the current model', async () => {
      await handleList({});

      const output = written();
      expect(output).toContain('Available Models:');
      expect(output).toContain('auto');
      expect(output).toContain('Let Gemini CLI decide');
      expect(output).toContain('(current)');
      expect(output).toContain('1,048,576 tokens');
    });
  });

  describe('listCommand', () => {
    it('is registered as "list" and exposes an output-format option', () => {
      expect(listCommand.command).toBe('list');

      const mockYargs = { option: vi.fn().mockReturnThis() };
      // @ts-expect-error - Mocking yargs
      listCommand.builder(mockYargs);

      expect(mockYargs.option).toHaveBeenCalledWith(
        'output-format',
        expect.objectContaining({
          alias: 'o',
          choices: ['text', 'json'],
          default: 'text',
        }),
      );
    });
  });
});
