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

  describe('internal sentinel key collision', () => {
    beforeEach(() => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('does not let a caller-provided __GCLI_EXPAND_TARGET__ entry override the input', () => {
      expect(
        expandEnvVars('Hello $USER', {
          USER: 'morty',
          __GCLI_EXPAND_TARGET__: 'unexpected override',
        }),
      ).toBe('Hello morty');
    });

    it('ignores the sentinel key even when it is the only entry in env', () => {
      expect(
        expandEnvVars('literal text, no vars', {
          __GCLI_EXPAND_TARGET__: 'unexpected override',
        }),
      ).toBe('literal text, no vars');
    });

    it('still expands other variables when the sentinel key is also present', () => {
      expect(
        expandEnvVars('$USER says ${GREETING}', {
          USER: 'morty',
          GREETING: 'hi',
          __GCLI_EXPAND_TARGET__: 'unexpected override',
        }),
      ).toBe('morty says hi');
    });

    it('still expands a variable whose name merely resembles the sentinel', () => {
      expect(
        expandEnvVars('token: $__GCLI_EXPAND_TARGET', {
          __GCLI_EXPAND_TARGET: 'real-value',
          __GCLI_EXPAND_TARGET__: 'unexpected override',
        }),
      ).toBe('token: real-value');
    });
  });
});
