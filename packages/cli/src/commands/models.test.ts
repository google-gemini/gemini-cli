/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { modelsCommand } from './models.js';

vi.mock('./models/list.js', () => ({ listCommand: { command: 'list' } }));

vi.mock('../gemini.js', () => ({
  initializeOutputListenersAndFlush: vi.fn(),
}));

describe('modelsCommand', () => {
  it('should have correct command and description', () => {
    expect(modelsCommand.command).toBe('models <command>');
    expect(modelsCommand.describe).toBe('Inspect available models.');
  });

  it('should register the list subcommand in builder', () => {
    const mockYargs = {
      middleware: vi.fn().mockReturnThis(),
      command: vi.fn().mockReturnThis(),
      demandCommand: vi.fn().mockReturnThis(),
      version: vi.fn().mockReturnThis(),
    };

    // @ts-expect-error - Mocking yargs
    modelsCommand.builder(mockYargs);

    expect(mockYargs.middleware).toHaveBeenCalled();
    expect(mockYargs.command).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'list' }),
    );
    expect(mockYargs.demandCommand).toHaveBeenCalledWith(1, expect.any(String));
    expect(mockYargs.version).toHaveBeenCalledWith(false);
  });

  it('should have a handler that does nothing', () => {
    // @ts-expect-error - Handler doesn't take arguments in this case
    expect(modelsCommand.handler()).toBeUndefined();
  });
});
