/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  resolveClassifierModel,
  PREVIEW_GEMINI_MODEL_AUTO,
  GEMINI_MODEL_ALIAS_FLASH_LITE,
  PREVIEW_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  isGemini3Model,
} from './models.js';
import { modelStringToModelConfigAlias } from '../services/chatCompressionService.js';

describe('Model Persistence & Auto-Router Fix', () => {
  it('should resolve flash-lite to Gemini 3 Flash when Auto Gemini 3 is active', () => {
    const resolved = resolveClassifierModel(
      PREVIEW_GEMINI_MODEL_AUTO,
      GEMINI_MODEL_ALIAS_FLASH_LITE,
    );
    expect(resolved).toBe(PREVIEW_GEMINI_FLASH_MODEL);
  });

  it('should resolve flash-lite to Gemini 2.5 Flash Lite when NOT in Gemini 3 mode', () => {
    const resolved = resolveClassifierModel(
      'gemini-2.5-pro',
      GEMINI_MODEL_ALIAS_FLASH_LITE,
    );
    expect(resolved).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
  });

  it('should identify Auto Gemini 3 as a Gemini 3 model', () => {
    expect(isGemini3Model(PREVIEW_GEMINI_MODEL_AUTO)).toBe(true);
  });

  it('should return chat-compression-3-pro for PREVIEW_GEMINI_MODEL_AUTO', () => {
    expect(modelStringToModelConfigAlias(PREVIEW_GEMINI_MODEL_AUTO)).toBe(
      'chat-compression-3-pro',
    );
  });
});
