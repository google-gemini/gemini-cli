/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { installCommand } from './install.js';
import yargs from 'yargs';

vi.mock('../../config/extension.js', () => ({
  installExtension: vi.fn(),
}));

describe('extensions install command', () => {
  it('should fail if no source is provided', () => {
    const validationParser = yargs([]).command(installCommand).fail(false);
    expect(() => validationParser.parse('install')).toThrow(
      'Either source or --path must be provided.',
    );
  });

  it('should fail if both git source and local path are provided', () => {
    const validationParser = yargs([]).command(installCommand).fail(false);
    // Test that an error is thrown when both source and path arguments are provided
    // The exact message depends on system language, so we just verify an error occurs
    expect(() =>
      validationParser.parse('install some-url --path /some/path'),
    ).toThrow();
  });
});
