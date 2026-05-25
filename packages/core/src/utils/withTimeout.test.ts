/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { withTimeout } from './withTimeout.js';

describe('withTimeout', () => {
  it('should resolve before timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('should reject after timeout', async () => {
    await expect(
      withTimeout(new Promise((resolve) => setTimeout(resolve, 2000)), 100),
    ).rejects.toThrow('Execution timed out');
  });

  it('should disable timeout when timeout <= 0', async () => {
    await expect(
      withTimeout(
        new Promise((resolve) => setTimeout(() => resolve('done'), 100)),
        0,
      ),
    ).resolves.toBe('done');
  });
});
