/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { spawnWrapper } from './spawnWrapper.js';

describe('spawnWrapper', () => {
  it('should successfully spawn a process', async () => {
    const child = spawnWrapper('node', ['--version']);
    const exitCode = await new Promise((resolve) => {
      child.on('close', (code) => resolve(code));
    });
    expect(exitCode).toBe(0);
  });
});
