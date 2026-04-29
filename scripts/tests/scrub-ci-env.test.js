/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { scrubCiEnv } from '../scrub-ci-env.js';

describe('scrubCiEnv', () => {
  it('removes CI when set to a truthy value', () => {
    const env = { CI: 'true', HOME: '/home/user' };
    const removed = scrubCiEnv(env);
    expect(removed).toEqual(['CI']);
    expect(env).not.toHaveProperty('CI');
    expect(env).toHaveProperty('HOME', '/home/user');
  });

  it('removes CONTINUOUS_INTEGRATION when set to a truthy value', () => {
    const env = { CONTINUOUS_INTEGRATION: 'true', PATH: '/usr/bin' };
    const removed = scrubCiEnv(env);
    expect(removed).toEqual(['CONTINUOUS_INTEGRATION']);
    expect(env).not.toHaveProperty('CONTINUOUS_INTEGRATION');
  });

  it('removes both CI and CONTINUOUS_INTEGRATION when both are set', () => {
    const env = { CI: '1', CONTINUOUS_INTEGRATION: 'yes' };
    const removed = scrubCiEnv(env);
    expect(removed).toEqual(['CI', 'CONTINUOUS_INTEGRATION']);
    expect(Object.keys(env)).toEqual([]);
  });

  it('deletes CI="false" but does not report it as scrubbed', () => {
    const env = { CI: 'false' };
    const removed = scrubCiEnv(env);
    expect(removed).toEqual([]);
    expect(env).not.toHaveProperty('CI');
  });

  it('deletes CI="0" but does not report it as scrubbed', () => {
    const env = { CI: '0' };
    const removed = scrubCiEnv(env);
    expect(removed).toEqual([]);
    expect(env).not.toHaveProperty('CI');
  });

  it('returns empty array when no CI vars are present', () => {
    const env = { HOME: '/home/user', PATH: '/usr/bin' };
    const removed = scrubCiEnv(env);
    expect(removed).toEqual([]);
    expect(env).toEqual({ HOME: '/home/user', PATH: '/usr/bin' });
  });

  it('removes CI with empty string value', () => {
    // `is-in-ci` treats `key in env` as truthy when the key exists with any
    // value other than '0' or 'false', including the empty string.
    const env = { CI: '' };
    const removed = scrubCiEnv(env);
    expect(removed).toEqual(['CI']);
    expect(env).not.toHaveProperty('CI');
  });
});
