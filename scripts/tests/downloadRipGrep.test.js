/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('tempy', () => ({
  temporaryFile: () => '/tmp/ripgrep-download',
}));

describe('downloadRipGrep', () => {
  let originalVersion;

  beforeEach(() => {
    originalVersion = process.env.RIPGREP_VERSION;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalVersion === undefined) {
      delete process.env.RIPGREP_VERSION;
    } else {
      process.env.RIPGREP_VERSION = originalVersion;
    }
    vi.resetModules();
  });

  it('throws if the checksum manifest version mismatches the requested version', async () => {
    process.env.RIPGREP_VERSION = 'v13.0.0-11';

    const { downloadRipGrep } = await import(
      '../../third_party/get-ripgrep/src/downloadRipGrep.js'
    );

    await expect(downloadRipGrep()).rejects.toThrow(
      /Checksum manifest version/,
    );
  });
});
