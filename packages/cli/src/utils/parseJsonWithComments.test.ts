/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseJsonWithComments } from './parseJsonWithComments.js';

describe('parseJsonWithComments', () => {
  it('parses JSON with line and block comments', () => {
    const raw = `{
      // disable auto memory tuning
      "advanced": {
        /* user preference */
        "autoConfigureMemory": false
      }
    }`;

    expect(parseJsonWithComments(raw)).toEqual({
      advanced: {
        autoConfigureMemory: false,
      },
    });
  });
});
