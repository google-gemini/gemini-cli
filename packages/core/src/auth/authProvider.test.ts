/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import { AuthProvider } from './authProvider.js';

describe('AuthProvider', () => {
  it('should have the correct values', () => {
    expect(AuthProvider.GOOGLE).toBe('GOOGLE');
  });
});
