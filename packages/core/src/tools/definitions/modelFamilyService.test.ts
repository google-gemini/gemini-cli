/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getToolFamily } from './modelFamilyService.js';

describe('getToolFamily', () => {
  it('maps local gemma models to the local-gemma tool family', () => {
    expect(getToolFamily('gemma4:31b')).toBe('local-gemma');
  });

  it('keeps Gemini 3 models on the Gemini 3 tool family', () => {
    expect(getToolFamily('gemini-3-pro-preview')).toBe('gemini-3');
  });
});
