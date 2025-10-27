/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { uninstallCommand, handleUninstall } from './uninstall.js';
import yargs from 'yargs';
import { uninstallExtension } from '../../config/extension.js';

vi.mock('../../config/extension.js', () => ({
  uninstallExtension: vi.fn(),
}));

describe('extensions uninstall command', () => {
  it('should fail if no source is provided', () => {
    const validationParser = yargs([])
      .command(uninstallCommand)
      .fail(false)
      .locale('en');
    expect(() => validationParser.parse('uninstall')).toThrow(
      'Not enough non-option arguments: got 0, need at least 1',
    );
  });
});
