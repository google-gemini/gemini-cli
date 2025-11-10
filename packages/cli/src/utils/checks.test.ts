/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { checkExhaustive } from './checks.js';

describe('checkExhaustive', () => {
  it('should throw an error when called', () => {
    expect(() => checkExhaustive('unexpected value' as never)).toThrow(
      'unexpected value unexpected value!',
    );
  });
});
