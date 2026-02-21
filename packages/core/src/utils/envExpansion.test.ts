/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { expandEnvVars } from './envExpansion.js';

describe('expandEnvVars', () => {
  const defaultEnv = {
    USER: 'morty',
    HOME: '/home/morty',
    TEMP: 'C:\\Temp',
    EMPTY: '',
  };

  it.each([
    ['$VAR (POSIX)', 'Hello $USER', defaultEnv, 'Hello morty'],
    [
      '${VAR} (POSIX)',
      'Welcome to ${HOME}',
      defaultEnv,
      'Welcome to /home/morty',
    ],
    ['%VAR% (Windows)', 'Data in %TEMP%', defaultEnv, 'Data in C:\\Temp'],
    [
      'mixed formats',
      '$USER lives in ${HOME} on %TEMP%',
      defaultEnv,
      'morty lives in /home/morty on C:\\Temp',
    ],
    [
      'missing variables',
      'Missing $UNDEFINED and ${NONE} and %MISSING%',
      defaultEnv,
      'Missing  and  and ',
    ],
    [
      'empty or undefined values',
      'Value is "$EMPTY"',
      defaultEnv,
      'Value is ""',
    ],
    [
      'original string if no variables',
      'No vars here',
      defaultEnv,
      'No vars here',
    ],
    ['literal values like "1234"', '1234', defaultEnv, '1234'],
    ['empty input string', '', defaultEnv, ''],
    [
      'complex paths',
      '${HOME}/bin:$PATH',
      { ...defaultEnv, PATH: '/usr/bin' },
      '/home/morty/bin:/usr/bin',
    ],
  ])('should handle %s', (_, input, env, expected) => {
    expect(expandEnvVars(input, env)).toBe(expected);
  });
});
