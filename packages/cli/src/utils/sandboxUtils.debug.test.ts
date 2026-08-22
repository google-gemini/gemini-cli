/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { entrypoint, isDebugEnabled } from './sandboxUtils.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sandbox DEBUG semantics', () => {
  it.each(['true', '1'])('enables DEBUG for supported value %s', (value) => {
    vi.stubEnv('DEBUG', value);

    expect(isDebugEnabled()).toBe(true);
  });

  it.each(['false', '0', 'off', 'anything', ''])(
    'disables DEBUG for unsupported value %s',
    (value) => {
      vi.stubEnv('DEBUG', value);

      expect(isDebugEnabled()).toBe(false);
    },
  );

  it('does not treat an unset DEBUG variable as enabled', () => {
    vi.stubEnv('DEBUG', '');

    expect(isDebugEnabled()).toBe(false);
  });

  it.each(['false', '0'])(
    'keeps the non-debug development entrypoint for DEBUG=%s',
    (value) => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('DEBUG', value);

      const args = entrypoint('/work', ['node', 'gemini', 'arg1']);

      expect(args[2]).toContain('npm rebuild && npm run start --');
      expect(args[2]).not.toContain('npm run debug --');
    },
  );

  it.each(['true', '1'])(
    'uses the debug development entrypoint for DEBUG=%s',
    (value) => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('DEBUG', value);

      const args = entrypoint('/work', ['node', 'gemini', 'arg1']);

      expect(args[2]).toContain('npm run debug --');
    },
  );
});
