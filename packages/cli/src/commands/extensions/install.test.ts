/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { installCommand, handleInstall } from './install.js';
import yargs from 'yargs';
import * as extension from '../../config/extension.js';

vi.mock('../../config/extension.js', () => ({
  installExtension: vi.fn(),
}));

describe('extensions install command', () => {
  it('should fail if no source is provided', () => {
    const validationParser = yargs([]).command(installCommand).fail(false);
    expect(() => validationParser.parse('install')).toThrow(
      'Either --source or --path must be provided.',
    );
  });

  it('should fail if both git source and local path are provided', () => {
    const validationParser = yargs([]).command(installCommand).fail(false);
    expect(() =>
      validationParser.parse('install --source some-url --path /some/path'),
    ).toThrow('Arguments source and path are mutually exclusive');
  });
});
