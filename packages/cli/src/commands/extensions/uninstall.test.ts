/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { uninstallCommand, handleUninstall } from './uninstall.js';
import yargs from 'yargs';
import { uninstallExtension } from '../../config/extension.js';
import { ExtensionNotFoundError } from '../../utils/errors.js';

vi.mock('../../config/extension.js', () => ({
  uninstallExtension: vi.fn(),
}));

describe('extensions uninstall command', () => {
  it('should fail if no source is provided', () => {
    const validationParser = yargs([]).command(uninstallCommand).fail(false);
    expect(() => validationParser.parse('uninstall')).toThrow(
      'Not enough non-option arguments: got 0, need at least 1',
    );
  });

  it('should print a friendly error if the extension is not found', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as any);
    const extensionName = 'non-existent-extension';
    (uninstallExtension as any).mockRejectedValue(
      new ExtensionNotFoundError(extensionName),
    );

    await handleUninstall({ name: extensionName });

    expect(uninstallExtension).toHaveBeenCalledWith(extensionName);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Extension "${extensionName}" not found.`,
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});
