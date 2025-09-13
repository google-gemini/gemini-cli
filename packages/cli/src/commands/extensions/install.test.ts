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
    expect(() =>
      validationParser.parse('install some-url --path /some/path'),
    ).toThrow('Arguments source and path are mutually exclusive');
  });

  it('should call installExtension with the correct arguments for a custom protocol', async () => {
    const parser = yargs([]).command(installCommand);
    await parser.parseAsync('install sso://my-internal-host/my-repo');
    const { installExtension } = await import('../../config/extension.js');
    expect(installExtension).toHaveBeenCalledWith({
      source: 'sso://my-internal-host/my-repo',
      type: 'git',
      ref: undefined,
    });
  });
});
