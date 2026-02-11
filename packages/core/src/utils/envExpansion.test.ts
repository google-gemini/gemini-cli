/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { expandEnvVars } from './envExpansion.js';

describe('expandEnvVars', () => {
  const env = {
    USER: 'morty',
    HOME: '/home/morty',
    TEMP: 'C:\Temp',
    EMPTY: '',
  };

  it('should expand $VAR (POSIX)', () => {
    expect(expandEnvVars('Hello $USER', env)).toBe('Hello morty');
  });

  it('should expand ${VAR} (POSIX)', () => {
    expect(expandEnvVars('Welcome to ${HOME}', env)).toBe(
      'Welcome to /home/morty',
    );
  });

  it('should expand %VAR% (Windows)', () => {
    expect(expandEnvVars('Data in %TEMP%', env)).toBe('Data in C:\Temp');
  });

  it('should handle mixed formats', () => {
    expect(expandEnvVars('$USER lives in ${HOME} on %TEMP%', env)).toBe(
      'morty lives in /home/morty on C:\Temp',
    );
  });

  it('should resolve missing variables to empty strings', () => {
    expect(
      expandEnvVars('Missing $UNDEFINED and ${NONE} and %MISSING%', env),
    ).toBe('Missing  and  and ');
  });

  it('should handle empty or undefined values in env', () => {
    expect(expandEnvVars('Value is "$EMPTY"', env)).toBe('Value is ""');
  });

  it('should return original string if no variables found', () => {
    expect(expandEnvVars('No vars here', env)).toBe('No vars here');
  });

  it('should preserve literal values like "1234"', () => {
    expect(expandEnvVars('1234', env)).toBe('1234');
  });

  it('should handle empty input string', () => {
    expect(expandEnvVars('', env)).toBe('');
  });

  it('should handle complex paths', () => {
    expect(
      expandEnvVars('${HOME}/bin:$PATH', { ...env, PATH: '/usr/bin' }),
    ).toBe('/home/morty/bin:/usr/bin');
  });
});
