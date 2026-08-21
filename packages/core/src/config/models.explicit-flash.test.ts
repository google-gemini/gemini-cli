/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  GEMINI_MODEL_ALIAS_FLASH,
  PREVIEW_GEMINI_FLASH_MODEL,
  resolveModel,
} from './models.js';

describe('explicit flash model resolution', () => {
  it.each([
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.9-flash',
    'gemini-4.2-flash',
  ])('preserves explicit model id %s during the Gemini 3.5 Flash rollout', (model) => {
    expect(resolveModel(model, false, false, true, undefined, true)).toBe(model);
  });

  it('still promotes the flash alias during the Gemini 3.5 Flash rollout', () => {
    expect(
      resolveModel(
        GEMINI_MODEL_ALIAS_FLASH,
        false,
        false,
        true,
        undefined,
        true,
      ),
    ).toBe(DEFAULT_GEMINI_FLASH_MODEL);
  });

  it('still preserves an explicitly selected preview flash model', () => {
    expect(
      resolveModel(
        PREVIEW_GEMINI_FLASH_MODEL,
        false,
        false,
        true,
        undefined,
        true,
      ),
    ).toBe(PREVIEW_GEMINI_FLASH_MODEL);
  });
});
