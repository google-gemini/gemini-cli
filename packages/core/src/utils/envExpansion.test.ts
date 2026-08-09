/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expandEnvVars } from './envExpansion.js';

describe('expandEnvVars', () => {
  const defaultEnv = {
    USER: 'morty',
    HOME: '/home/morty',
    TEMP: 'C:\\Temp',
    EMPTY: '',
  };

  describe('POSIX behavior (non-Windows)', () => {
    beforeEach(() => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each([
      ['$VAR (POSIX)', 'Hello $USER', defaultEnv, 'Hello morty'],
      [
        '${VAR} (POSIX)',
        'Welcome to ${HOME}',
        defaultEnv,
        'Welcome to /home/morty',
      ],
      [
        'should NOT expand %VAR% on non-Windows',
        'Data in %TEMP%',
        defaultEnv,
        'Data in %TEMP%',
      ],
      [
        'mixed formats (only POSIX expanded)',
        '$USER lives in ${HOME} on %TEMP%',
        defaultEnv,
        'morty lives in /home/morty on %TEMP%',
      ],
      [
        'missing variables (POSIX only)',
        'Missing $UNDEFINED and ${NONE} and %MISSING%',
        defaultEnv,
        'Missing  and  and %MISSING%',
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

  describe('Windows behavior', () => {
    beforeEach(() => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each([
      ['$VAR (POSIX)', 'Hello $USER', defaultEnv, 'Hello morty'],
      [
        '${VAR} (POSIX)',
        'Welcome to ${HOME}',
        defaultEnv,
        'Welcome to /home/morty',
      ],
      [
        'should expand %VAR% on Windows',
        'Data in %TEMP%',
        defaultEnv,
        'Data in C:\\Temp',
      ],
      [
        'mixed formats (both expanded)',
        '$USER lives in ${HOME} on %TEMP%',
        defaultEnv,
        'morty lives in /home/morty on C:\\Temp',
      ],
      [
        'missing variables (all expanded to empty)',
        'Missing $UNDEFINED and ${NONE} and %MISSING%',
        defaultEnv,
        'Missing  and  and ',
      ],
    ])('should handle %s', (_, input, env, expected) => {
      expect(expandEnvVars(input, env)).toBe(expected);
    });
  });
});
