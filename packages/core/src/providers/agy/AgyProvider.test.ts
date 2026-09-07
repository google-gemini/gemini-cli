/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { AgyProvider } from './AgyProvider.js';

describe('AgyProvider', () => {
  it('initializes with agy defaults', () => {
    const provider = new AgyProvider();
    expect(provider.name).toBe('agy');
  });

  it('accepts custom binary path and default model', () => {
    const provider = new AgyProvider({
      binaryPath: '/custom/path/to/agy',
      defaultModel: 'claude-sonnet-4-6',
    });
    expect(provider.name).toBe('agy');
  });

  it('checks availability via binary check', async () => {
    const provider = new AgyProvider();
    const available = await provider.isAvailable();
    expect(typeof available).toBe('boolean');
  });
});
