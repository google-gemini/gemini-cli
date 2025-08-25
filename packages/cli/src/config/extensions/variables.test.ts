/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import { hydrateString } from './variables.js';

describe('hydrateString', () => {
  it('should replace a single variable', () => {
    const context = {
      extensionName: 'my-extension',
    };
    const result = hydrateString('Hello, ${extensionName}!', context);
    expect(result).toBe('Hello, my-extension!');
  });

  it('should replace multiple variables', () => {
    const context = {
      extensionsDir: '/path/to/extensions',
      extensionName: 'my-extension',
    };
    const result = hydrateString(
      'Path: ${extensionsDir}/${extensionName}',
      context,
    );
    expect(result).toBe('Path: /path/to/extensions/my-extension');
  });

  it('should handle variables that are not in the context', () => {
    const context = {
      extensionName: 'my-extension',
    };
    const result = hydrateString('Hello, ${userName}!', context);
    expect(result).toBe('Hello, ${userName}!');
  });

  it('should handle an empty string', () => {
    const context = {
      extensionName: 'my-extension',
    };
    const result = hydrateString('', context);
    expect(result).toBe('');
  });

  it('should handle a string with no variables', () => {
    const context = {
      extensionName: 'my-extension',
    };
    const result = hydrateString('Hello, world!', context);
    expect(result).toBe('Hello, world!');
  });
});
