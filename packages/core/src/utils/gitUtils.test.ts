/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';

import { getSafeGitEnv } from './gitUtils.js';

describe('getSafeGitEnv', () => {
  it('does not pass a GIT_CONFIG_KEY that maps to diff.external (#28928)', () => {
    // Regression for #28928: git treats `diff.external = ""` not as a
    // disable but as a request to spawn an empty-string executable, so the
    // safe-env helper must not emit any GIT_CONFIG_{KEY,VALUE}_* pair that
    // overrides `diff.external`. Before the fix the env safe-listing
    // exported `GIT_CONFIG_KEY_7: 'diff.external'` paired with `''`, which
    // produced `cannot spawn : No such file or directory` on every git
    // invocation that touched the diff engine.
    const env = getSafeGitEnv();
    const keys = Object.keys(env);
    for (const k of keys) {
      if (k.startsWith('GIT_CONFIG_KEY_')) {
        expect(env[k], `${k}=${env[k]} should not equal "diff.external"`).not.toBe(
          'diff.external',
        );
      }
    }
  });

  it('does not leave an empty GIT_CONFIG_VALUE_7 trailing slot', () => {
    // The previous safe-env slot 7 always emitted an empty value; if the
    // counter dropped to 7 the slot would simply not exist. Either shape is
    // fine so long as there is no slot that alias to `diff.external`.
    const env = getSafeGitEnv();
    expect(env.GIT_CONFIG_KEY_7).toBeUndefined();
    expect(env.GIT_CONFIG_VALUE_7).toBeUndefined();
  });

  it('GIT_CONFIG_COUNT matches the number of GIT_CONFIG_KEY pairs emitted', () => {
    const env = getSafeGitEnv();
    const declared = Number.parseInt(env.GIT_CONFIG_COUNT ?? '0', 10);
    const present = Object.keys(env).filter((k) =>
      /^GIT_CONFIG_KEY_\d+$/.test(k),
    ).length;
    expect(present, 'declared count must equal actual key count').toBe(declared);
    for (let i = 0; i < declared; i += 1) {
      expect(env[`GIT_CONFIG_KEY_${i}`], `slot ${i} has a key`).toBeDefined();
      expect(env[`GIT_CONFIG_VALUE_${i}`], `slot ${i} has a value`).toBeDefined();
    }
  });
});
