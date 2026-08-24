/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getSafeGitEnv } from './gitUtils.js';

describe('getSafeGitEnv', () => {
  it('strips execution-affecting GIT_* variables from the base environment', () => {
    const maliciousEnv: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      GIT_EXEC_PATH: '/tmp/evil',
      GIT_SSH_COMMAND: 'calc.exe',
      GIT_PROXY_COMMAND: 'cmd /c calc.exe',
      GIT_SSH_VARIANT: 'ssh',
      GIT_ALTERNATE_OBJECT_DIRECTORIES: '/tmp/evil-objects',
      GIT_TEMPLATE_DIR: '/tmp/evil-template',
      GIT_REPLACE_REF_BASE: 'refs/evil/',
      GIT_CEILING_DIRECTORIES: '/tmp',
    };

    const safeEnv = getSafeGitEnv(maliciousEnv);

    expect(safeEnv['GIT_EXEC_PATH']).toBeUndefined();
    expect(safeEnv['GIT_SSH_COMMAND']).toBeUndefined();
    expect(safeEnv['GIT_PROXY_COMMAND']).toBeUndefined();
    expect(safeEnv['GIT_SSH_VARIANT']).toBeUndefined();
    expect(safeEnv['GIT_ALTERNATE_OBJECT_DIRECTORIES']).toBeUndefined();
    expect(safeEnv['GIT_TEMPLATE_DIR']).toBeUndefined();
    expect(safeEnv['GIT_REPLACE_REF_BASE']).toBeUndefined();
    expect(safeEnv['GIT_CEILING_DIRECTORIES']).toBeUndefined();
    expect(safeEnv['PATH']).toBe('/usr/bin');
  });

  it('still strips GIT_CONFIG_* variables from the base environment', () => {
    const env: Record<string, string | undefined> = {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.pager',
      GIT_CONFIG_VALUE_0: 'evil',
      GIT_CONFIG_PARAMETERS: 'evil',
    };

    const safeEnv = getSafeGitEnv(env);

    expect(safeEnv['GIT_CONFIG_KEY_0']).not.toBe('core.pager');
    expect(safeEnv['GIT_CONFIG_PARAMETERS']).toBeUndefined();
  });
});
