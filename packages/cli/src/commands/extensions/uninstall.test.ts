/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { uninstallCommand } from './uninstall.js';
import yargs from 'yargs';

describe('extensions uninstall command', () => {
  it('should fail if no source is provided', () => {
    const validationParser = yargs([]).command(uninstallCommand).fail(false);
    // Test that an error is thrown when no source argument is provided
    // The exact message depends on system language, so we just verify an error occurs
    expect(() => validationParser.parse('uninstall')).toThrow();
  });
});
