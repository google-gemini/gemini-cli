/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { CodexProvider } from './CodexProvider.js';

describe('CodexProvider', () => {
  it('initializes with codex defaults', () => {
    const provider = new CodexProvider();
    expect(provider.name).toBe('codex');
  });

  it('accepts custom binary path and default model', () => {
    const provider = new CodexProvider({
      binaryPath: '/custom/path/to/codex',
      defaultModel: 'o3',
    });
    expect(provider.name).toBe('codex');
  });

  it('checks availability via binary check', async () => {
    const provider = new CodexProvider();
    const available = await provider.isAvailable();
    expect(typeof available).toBe('boolean');
  });
});
