/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import {
  hydrateString,
  recursivelyHydrateStrings,
  validateVariables,
  type VariableContext,
} from './variables.js';

describe('validateVariables', () => {
  it('should not throw if all required variables are present', () => {
    const schema = {
      extensionPath: { type: 'string', description: 'test', required: true },
    } as const;
    const context = { extensionPath: 'value' };
    expect(() => validateVariables(context, schema)).not.toThrow();
  });

  it('should throw if a required variable is missing', () => {
    const schema = {
      extensionPath: { type: 'string', description: 'test', required: true },
    } as const;
    const context = {};
    expect(() => validateVariables(context, schema)).toThrow(
      'Missing required variable: extensionPath',
    );
  });
});

describe('hydrateString', () => {
  it('should replace a single variable', () => {
    const context = {
      extensionPath: 'path/my-extension',
    };
    const result = hydrateString('Hello, ${extensionPath}!', context);
    expect(result).toBe('Hello, path/my-extension!');
  });

  it('should replace multiple variables', () => {
    const context = {
      extensionPath: 'path/my-extension',
      workspacePath: '/ws',
    };
    const result = hydrateString(
      'Ext: ${extensionPath}, WS: ${workspacePath}',
      context,
    );
    expect(result).toBe('Ext: path/my-extension, WS: /ws');
  });

  it('should ignore unknown variables', () => {
    const context = {
      extensionPath: 'path/my-extension',
    };
    const result = hydrateString('Hello, ${unknown}!', context);
    expect(result).toBe('Hello, ${unknown}!');
  });

  it('should handle null and undefined context values', () => {
    const context: VariableContext = {
      extensionPath: undefined,
    };
    const result = hydrateString(
      'Ext: ${extensionPath}, WS: ${workspacePath}',
      context,
    );
    expect(result).toBe('Ext: ${extensionPath}, WS: ${workspacePath}');
  });
});

describe('recursivelyHydrateStrings', () => {
  const context = {
    extensionPath: 'path/my-extension',
    workspacePath: '/ws',
  };

  it('should hydrate strings in a flat object', () => {
    const obj = {
      a: 'Hello, ${workspacePath}',
      b: 'Hi, ${extensionPath}',
    };
    const result = recursivelyHydrateStrings(obj, context);
    expect(result).toEqual({
      a: 'Hello, /ws',
      b: 'Hi, path/my-extension',
    });
  });

  it('should hydrate strings in an array', () => {
    const arr = ['${workspacePath}', '${extensionPath}'];
    const result = recursivelyHydrateStrings(arr, context);
    expect(result).toEqual(['/ws', 'path/my-extension']);
  });

  it('should hydrate strings in a nested object', () => {
    const obj = {
      a: 'Hello, ${workspacePath}',
      b: {
        c: 'Hi, ${extensionPath}',
        d: ['${workspacePath}/foo'],
      },
    };
    const result = recursivelyHydrateStrings(obj, context);
    expect(result).toEqual({
      a: 'Hello, /ws',
      b: {
        c: 'Hi, path/my-extension',
        d: ['/ws/foo'],
      },
    });
  });

  it('should not modify non-string values', () => {
    const obj = {
      a: 123,
      b: true,
      c: null,
    };
    const result = recursivelyHydrateStrings(obj, context);
    expect(result).toEqual(obj);
  });
});
