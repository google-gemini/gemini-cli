/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveEnvVarsInString,
  resolveEnvVarsInObject,
} from './envVarResolver.js';

describe('resolveEnvVarsInString', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should resolve $VAR_NAME format', () => {
    process.env['TEST_VAR'] = 'test-value';

    const result = resolveEnvVarsInString('Value is $TEST_VAR');

    expect(result).toBe('Value is test-value');
  });

  it('should resolve ${VAR_NAME} format', () => {
    process.env['TEST_VAR'] = 'test-value';

    const result = resolveEnvVarsInString('Value is ${TEST_VAR}');

    expect(result).toBe('Value is test-value');
  });

  it('should resolve multiple variables in the same string', () => {
    process.env['HOST'] = 'localhost';
    process.env['PORT'] = '3000';

    const result = resolveEnvVarsInString('URL: http://$HOST:${PORT}/api');

    expect(result).toBe('URL: http://localhost:3000/api');
  });

  it('should leave undefined variables unchanged', () => {
    const result = resolveEnvVarsInString('Value is $UNDEFINED_VAR');

    expect(result).toBe('Value is $UNDEFINED_VAR');
  });

  it('should leave undefined variables with braces unchanged', () => {
    const result = resolveEnvVarsInString('Value is ${UNDEFINED_VAR}');

    expect(result).toBe('Value is ${UNDEFINED_VAR}');
  });

  it('should handle empty string', () => {
    const result = resolveEnvVarsInString('');

    expect(result).toBe('');
  });

  it('should handle string without variables', () => {
    const result = resolveEnvVarsInString('No variables here');

    expect(result).toBe('No variables here');
  });

  it('should handle mixed defined and undefined variables', () => {
    process.env['DEFINED'] = 'value';

    const result = resolveEnvVarsInString('$DEFINED and $UNDEFINED mixed');

    expect(result).toBe('value and $UNDEFINED mixed');
  });
});

describe('resolveEnvVarsInObject', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should resolve variables in nested objects', () => {
    process.env['API_KEY'] = 'secret-123';
    process.env['DB_URL'] = 'postgresql://localhost/test';

    const config = {
      server: {
        auth: {
          key: '$API_KEY',
        },
        database: '${DB_URL}',
      },
      port: 3000,
    };

    const result = resolveEnvVarsInObject(config);

    expect(result).toEqual({
      server: {
        auth: {
          key: 'secret-123',
        },
        database: 'postgresql://localhost/test',
      },
      port: 3000,
    });
  });

  it('should resolve variables in arrays', () => {
    process.env['ENV'] = 'production';
    process.env['VERSION'] = '1.0.0';

    const config = {
      tags: ['$ENV', 'app', '${VERSION}'],
      metadata: {
        env: '$ENV',
      },
    };

    const result = resolveEnvVarsInObject(config);

    expect(result).toEqual({
      tags: ['production', 'app', '1.0.0'],
      metadata: {
        env: 'production',
      },
    });
  });

  it('should preserve non-string types', () => {
    const config = {
      enabled: true,
      count: 42,
      value: null,
      data: undefined,
      tags: ['item1', 'item2'],
    };

    const result = resolveEnvVarsInObject(config);

    expect(result).toEqual(config);
  });

  it('should handle MCP server config structure', () => {
    process.env['API_TOKEN'] = 'token-123';
    process.env['SERVER_PORT'] = '8080';

    const extensionConfig = {
      name: 'test-extension',
      version: '1.0.0',
      mcpServers: {
        'test-server': {
          command: 'node',
          args: ['server.js', '--port', '${SERVER_PORT}'],
          env: {
            API_KEY: '$API_TOKEN',
            STATIC_VALUE: 'unchanged',
          },
          timeout: 5000,
        },
      },
    };

    const result = resolveEnvVarsInObject(extensionConfig);

    expect(result).toEqual({
      name: 'test-extension',
      version: '1.0.0',
      mcpServers: {
        'test-server': {
          command: 'node',
          args: ['server.js', '--port', '8080'],
          env: {
            API_KEY: 'token-123',
            STATIC_VALUE: 'unchanged',
          },
          timeout: 5000,
        },
      },
    });
  });

  it('should handle empty and null values', () => {
    const config = {
      empty: '',
      nullValue: null,
      undefinedValue: undefined,
      zero: 0,
      false: false,
    };

    const result = resolveEnvVarsInObject(config);

    expect(result).toEqual(config);
  });

  it('should handle circular references in objects without infinite recursion', () => {
    process.env['TEST_VAR'] = 'resolved-value';

    type ConfigWithCircularRef = {
      name: string;
      value: number;
      self?: ConfigWithCircularRef;
    };

    const config: ConfigWithCircularRef = {
      name: '$TEST_VAR',
      value: 42,
    };
    // Create circular reference
    config.self = config;

    const result = resolveEnvVarsInObject(config);

    expect(result.name).toBe('resolved-value');
    expect(result.value).toBe(42);
    expect(result.self).toBeDefined();
    expect(result.self?.name).toBe('$TEST_VAR'); // Circular reference should be shallow copied
    expect(result.self?.value).toBe(42);
    // Verify it doesn't create infinite recursion by checking it's not the same object
    expect(result.self).not.toBe(result);
  });

  it('should handle circular references in arrays without infinite recursion', () => {
    process.env['ARRAY_VAR'] = 'array-value';

    type ArrayWithCircularRef = Array<string | number | ArrayWithCircularRef>;
    const arr: ArrayWithCircularRef = ['$ARRAY_VAR', 123];
    // Create circular reference
    arr.push(arr);

    const result = resolveEnvVarsInObject(arr) as ArrayWithCircularRef;

    expect(result[0]).toBe('array-value');
    expect(result[1]).toBe(123);
    expect(Array.isArray(result[2])).toBe(true);
    const subArray = result[2] as ArrayWithCircularRef;
    expect(subArray[0]).toBe('$ARRAY_VAR'); // Circular reference should be shallow copied
    expect(subArray[1]).toBe(123);
    // Verify it doesn't create infinite recursion
    expect(result[2]).not.toBe(result);
  });

  it('should handle complex nested circular references', () => {
    process.env['NESTED_VAR'] = 'nested-resolved';

    type ObjWithRef = {
      name: string;
      id: number;
      ref?: ObjWithRef;
    };

    const obj1: ObjWithRef = { name: '$NESTED_VAR', id: 1 };
    const obj2: ObjWithRef = { name: 'static', id: 2 };

    // Create cross-references
    obj1.ref = obj2;
    obj2.ref = obj1;

    const config = {
      primary: obj1,
      secondary: obj2,
      value: '$NESTED_VAR',
    };

    const result = resolveEnvVarsInObject(config);

    expect(result.value).toBe('nested-resolved');
    expect(result.primary.name).toBe('nested-resolved');
    expect(result.primary.id).toBe(1);
    expect(result.secondary.name).toBe('static');
    expect(result.secondary.id).toBe(2);

    // Check that circular references are handled (shallow copied)
    expect(result.primary.ref).toBeDefined();
    expect(result.secondary.ref).toBeDefined();
    expect(result.primary.ref?.name).toBe('static'); // Should be shallow copy
    expect(result.secondary.ref?.name).toBe('nested-resolved'); // The shallow copy still gets processed

    // Most importantly: verify no infinite recursion by checking objects are different
    expect(result.primary.ref).not.toBe(result.secondary);
    expect(result.secondary.ref).not.toBe(result.primary);
    expect(result.primary).not.toBe(obj1); // New object created
    expect(result.secondary).not.toBe(obj2); // New object created
  });
});
