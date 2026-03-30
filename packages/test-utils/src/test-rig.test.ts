/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestRig } from './test-rig.js';

describe('TestRig _getCleanEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function createRig() {
    const rig = new TestRig();
    rig.homeDir = '/tmp/test-home';
    return rig;
  }

  it('sets a default Gemini API key when no auth env vars are present', () => {
    vi.stubEnv('GEMINI_API_KEY', undefined);
    vi.stubEnv('GOOGLE_API_KEY', undefined);

    const rig = createRig();
    const env = (
      rig as unknown as { _getCleanEnv: (typeof rig)['_getCleanEnv'] }
    )._getCleanEnv();

    expect(env['GEMINI_API_KEY']).toBe('test-api-key');
  });

  it('preserves an explicitly empty inherited Gemini API key', () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GOOGLE_API_KEY', undefined);

    const rig = createRig();
    const env = (
      rig as unknown as { _getCleanEnv: (typeof rig)['_getCleanEnv'] }
    )._getCleanEnv();

    expect('GEMINI_API_KEY' in env).toBe(true);
    expect(env['GEMINI_API_KEY']).toBe('');
  });

  it('respects an explicitly undefined extraEnv Gemini API key', () => {
    vi.stubEnv('GEMINI_API_KEY', undefined);
    vi.stubEnv('GOOGLE_API_KEY', undefined);

    const rig = createRig();
    const env = (
      rig as unknown as { _getCleanEnv: (typeof rig)['_getCleanEnv'] }
    )._getCleanEnv({
      GEMINI_API_KEY: undefined,
    });

    expect('GEMINI_API_KEY' in env).toBe(true);
    expect(env['GEMINI_API_KEY']).toBeUndefined();
  });
});
