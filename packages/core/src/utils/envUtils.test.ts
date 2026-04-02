/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseSandboxEnv } from './envUtils.js';

describe('parseSandboxEnv', () => {
  it('should return an empty object for empty input', () => {
    expect(parseSandboxEnv(undefined)).toEqual({});
    expect(parseSandboxEnv('')).toEqual({});
  });

  it('should parse simple key-value pairs', () => {
    const input = 'KEY1=VALUE1,KEY2=VALUE2';
    const expected = {
      KEY1: 'VALUE1',
      KEY2: 'VALUE2',
    };
    expect(parseSandboxEnv(input)).toEqual(expected);
  });

  it('should handle values with commas using heuristic', () => {
    const input = 'KEY1=VALUE1,WITH,COMMAS,KEY2=VALUE2';
    const expected = {
      KEY1: 'VALUE1,WITH,COMMAS',
      KEY2: 'VALUE2',
    };
    expect(parseSandboxEnv(input)).toEqual(expected);
  });

  it('should forward host environment variables (limitations noted)', () => {
    const hostEnv = {
      HOST_VAR1: 'host_value1',
      HOST_VAR2: 'host_value2',
    };
    // Put forwarded ones first to avoid ambiguity with values containing commas
    const input = 'HOST_VAR1,KEY2=VALUE2';
    const expected = {
      HOST_VAR1: 'host_value1',
      KEY2: 'VALUE2',
    };
    expect(parseSandboxEnv(input, hostEnv)).toEqual(expected);

    // Note: If a forwarded var follows a KEY=VALUE, it's treated as part of the value
    const input2 = 'KEY1=VALUE1,HOST_VAR2';
    const expected2 = {
      KEY1: 'VALUE1,HOST_VAR2',
    };
    expect(parseSandboxEnv(input2, hostEnv)).toEqual(expected2);
  });

  it('should handle keys and values with spaces (trimmed)', () => {
    const input = ' KEY1 = VALUE1 , KEY2 = VALUE2 ';
    const expected = {
      KEY1: 'VALUE1',
      KEY2: 'VALUE2',
    };
    expect(parseSandboxEnv(input)).toEqual(expected);
  });

  it('should handle multiple equals signs in a value', () => {
    const input = 'KEY1=VALUE1=WITH=EQUALS,KEY2=VALUE2';
    const expected = {
      KEY1: 'VALUE1=WITH=EQUALS',
      KEY2: 'VALUE2',
    };
    expect(parseSandboxEnv(input)).toEqual(expected);
  });

  it('should handle commas and equals in the middle (heuristic limitation)', () => {
    const input = 'KEY1=VALUE1,KEY2=VALUE2';
    const expected = {
      KEY1: 'VALUE1',
      KEY2: 'VALUE2',
    };
    expect(parseSandboxEnv(input)).toEqual(expected);
  });

  it('should demonstrate the heuristic limitation: equals after comma', () => {
    // If a value contains '=' after a comma, it will be misparsed as a new key.
    const input = 'KEY1=foo,bar=baz';
    const expected = {
      KEY1: 'foo',
      bar: 'baz',
    };
    expect(parseSandboxEnv(input)).toEqual(expected);
  });
});
