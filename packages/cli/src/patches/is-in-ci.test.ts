/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import isInCi from './is-in-ci.js';

describe('is-in-ci', () => {
  it('should always return false', () => {
    expect(isInCi).toBe(false);
  });

  it('should be a boolean', () => {
    expect(typeof isInCi).toBe('boolean');
  });

  it('should be the default export', () => {
    expect(isInCi).toBeDefined();
  });

  it('should not be truthy', () => {
    expect(isInCi).toBeFalsy();
  });

  it('should equal false strictly', () => {
    expect(isInCi === false).toBe(true);
  });

  it('should not equal true', () => {
    expect(isInCi === true).toBe(false);
  });

  it('should be the same value across multiple imports', async () => {
    const { default: imported } = await import('./is-in-ci.js');
    expect(imported).toBe(isInCi);
    expect(imported).toBe(false);
  });
});
