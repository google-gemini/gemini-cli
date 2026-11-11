/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Argv } from 'yargs';
import { modelsCommand } from './models.js';
import { parseArguments } from '../config/config.js';
import { createTestMergedSettings } from '../config/settings.js';

vi.mock('./models/list.js', () => ({
  listCommand: { command: ['$0', 'list'] },
}));

vi.mock('../gemini.js', () => ({
  initializeOutputListenersAndFlush: vi.fn(),
}));

describe('modelsCommand', () => {
  it('should have correct command and description', () => {
    expect(modelsCommand.command).toBe('models [command]');
    expect(modelsCommand.describe).toBe('Manage or list Gemini models.');
  });

  it('should register list subcommand in builder', () => {
    const mockYargs = {
      middleware: vi.fn().mockReturnThis(),
      command: vi.fn().mockReturnThis(),
      version: vi.fn().mockReturnThis(),
    };

    if (typeof modelsCommand.builder === 'function') {
      modelsCommand.builder(mockYargs as unknown as Argv);
    }

    expect(mockYargs.middleware).toHaveBeenCalled();
    expect(mockYargs.command).toHaveBeenCalledWith(
      expect.objectContaining({ command: ['$0', 'list'] }),
    );
    expect(mockYargs.version).toHaveBeenCalledWith(false);
  });

  it('should have a safe empty handler', () => {
    if (typeof modelsCommand.handler === 'function') {
      expect(
        modelsCommand.handler(
          {} as Parameters<typeof modelsCommand.handler>[0],
        ),
      ).toBeUndefined();
    }
  });
});

describe('models command argument parsing', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    process.argv = [...originalArgv];
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('recognizes "gemini models" as a command without falling through to a prompt query', async () => {
    process.argv = ['node', 'gemini', 'models'];
    const argv = await parseArguments(createTestMergedSettings());

    expect(argv.isCommand).toBe(true);
    expect(argv.query).toBeUndefined();
  });

  it('recognizes "gemini models list" as a command', async () => {
    process.argv = ['node', 'gemini', 'models', 'list'];
    const argv = await parseArguments(createTestMergedSettings());

    expect(argv.isCommand).toBe(true);
    expect(argv.query).toBeUndefined();
  });

  it('accepts "gemini --list-models" flag without throwing unknown argument error', async () => {
    process.argv = ['node', 'gemini', '--list-models'];
    const argv = await parseArguments(createTestMergedSettings());

    expect(argv.listModels).toBe(true);
    expect(argv.isCommand).toBe(true);
  });
});
