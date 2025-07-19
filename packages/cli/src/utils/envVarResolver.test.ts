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
});
