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
      [
        '__GCLI_EXPAND_TARGET__ collision in env when expanding variables',
        'Hello $USER',
        { ...defaultEnv, __GCLI_EXPAND_TARGET__: 'unexpected override' },
        'Hello morty',
      ],
      [
        '__GCLI_EXPAND_TARGET__ collision in env with literal input',
        'Bearer static-token',
        { ...defaultEnv, __GCLI_EXPAND_TARGET__: 'unexpected override' },
        'Bearer static-token',
      ],
      [
        'cascading __GCLI_EXPAND_TARGET__ collisions in env',
        'Hello $USER',
        {
          ...defaultEnv,
          __GCLI_EXPAND_TARGET__: 'override-base',
          __GCLI_EXPAND_TARGET_0__: 'override-0',
          __GCLI_EXPAND_TARGET_1__: 'override-1',
        },
        'Hello morty',
      ],
      [
        'explicit reference to $__GCLI_EXPAND_TARGET__ in input when defined',
        'Target is $__GCLI_EXPAND_TARGET__ and ${__GCLI_EXPAND_TARGET__}',
        { ...defaultEnv, __GCLI_EXPAND_TARGET__: 'explicit-target' },
        'Target is explicit-target and explicit-target',
      ],
      [
        'explicit reference to $__GCLI_EXPAND_TARGET__ in input when undefined',
        'Target is $__GCLI_EXPAND_TARGET__',
        defaultEnv,
        'Target is ',
      ],
    ])('should handle %s', (_, input, env, expected) => {
      expect(expandEnvVars(input, env)).toBe(expected);
    });

    it('should not mutate the caller-provided env object', () => {
      const callerEnv: Record<string, string | undefined> = {
        USER: 'morty',
        __GCLI_EXPAND_TARGET__: 'existing-value',
        UNDEFINED_KEY: undefined,
      };
      const snapshot = { ...callerEnv };

      expect(expandEnvVars('Hello $USER', callerEnv)).toBe('Hello morty');
      expect(callerEnv).toEqual(snapshot);
      expect('__GCLI_EXPAND_TARGET_0__' in callerEnv).toBe(false);
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
      [
        '__GCLI_EXPAND_TARGET__ collision in env on Windows',
        '$USER uses %TEMP%',
        { ...defaultEnv, __GCLI_EXPAND_TARGET__: 'unexpected override' },
        'morty uses C:\\Temp',
      ],
      [
        'explicit %__GCLI_EXPAND_TARGET__% on Windows',
        'Target is %__GCLI_EXPAND_TARGET__%',
        { ...defaultEnv, __GCLI_EXPAND_TARGET__: 'win-target' },
        'Target is win-target',
      ],
    ])('should handle %s', (_, input, env, expected) => {
      expect(expandEnvVars(input, env)).toBe(expected);
    });
  });
});
