/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveExecutableMock } = vi.hoisted(() => ({
  resolveExecutableMock: vi.fn<(exe: string) => Promise<string | undefined>>(),
}));

vi.mock('./shell-utils.js', () => ({
  resolveExecutable: resolveExecutableMock,
}));

import {
  GEMINI_PTY_BACKEND_ENV_VAR,
  resolveConfiguredPtyBackend,
} from './getPty.js';

describe('resolveConfiguredPtyBackend', () => {
  const originalEnv = process.env[GEMINI_PTY_BACKEND_ENV_VAR];

  beforeEach(() => {
    resolveExecutableMock.mockReset();
    delete process.env[GEMINI_PTY_BACKEND_ENV_VAR];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[GEMINI_PTY_BACKEND_ENV_VAR];
    } else {
      process.env[GEMINI_PTY_BACKEND_ENV_VAR] = originalEnv;
    }
  });

  it('returns native by default', async () => {
    await expect(resolveConfiguredPtyBackend(undefined)).resolves.toBe(
      'native',
    );
  });

  it('prefers env override over config value', async () => {
    process.env[GEMINI_PTY_BACKEND_ENV_VAR] = 'none';

    await expect(resolveConfiguredPtyBackend('script')).resolves.toBe('none');
  });

  it('selects script for external when script exists', async () => {
    resolveExecutableMock.mockImplementation(async (exe) => {
      if (exe === 'script') {
        return '/usr/bin/script';
      }
      return undefined;
    });

    await expect(resolveConfiguredPtyBackend('external')).resolves.toBe(
      'script',
    );
  });

  it('falls back to proxy for external when script is missing', async () => {
    resolveExecutableMock.mockImplementation(async (exe) => {
      if (exe === 'pty-proxy') {
        return '/usr/bin/pty-proxy';
      }
      return undefined;
    });

    await expect(resolveConfiguredPtyBackend('external')).resolves.toBe(
      'proxy',
    );
  });

  it('falls back to none when requested script is unavailable', async () => {
    resolveExecutableMock.mockResolvedValue(undefined);

    await expect(resolveConfiguredPtyBackend('script')).resolves.toBe('none');
  });
});
