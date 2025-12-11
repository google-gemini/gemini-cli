/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getEffectiveModel,
  isGemini2Model,
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  supportsMultimodalFunctionResponse,
  PREVIEW_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_MODEL_AUTO,
} from './models.js';

describe('supportsMultimodalFunctionResponse', () => {
  it('should return true for gemini-3 model', () => {
    expect(supportsMultimodalFunctionResponse('gemini-3-pro')).toBe(true);
  });

  it('should return false for gemini-2 models', () => {
    expect(supportsMultimodalFunctionResponse('gemini-2.5-pro')).toBe(false);
    expect(supportsMultimodalFunctionResponse('gemini-2.5-flash')).toBe(false);
  });

  it('should return false for other models', () => {
    expect(supportsMultimodalFunctionResponse('some-other-model')).toBe(false);
    expect(supportsMultimodalFunctionResponse('')).toBe(false);
  });
});

describe('getEffectiveModel', () => {
  describe('When NOT in fallback mode', () => {
    const useFallbackModel = false;

    it('should return the Preview Pro model when auto-preview is requested', () => {
      const model = getEffectiveModel(
        PREVIEW_GEMINI_MODEL_AUTO,
        useFallbackModel,
      );
      expect(model).toBe(PREVIEW_GEMINI_MODEL);
    });

    it('should return the Default Pro model when auto-default is requested', () => {
      const model = getEffectiveModel(
        DEFAULT_GEMINI_MODEL_AUTO,
        useFallbackModel,
      );
      expect(model).toBe(DEFAULT_GEMINI_MODEL);
    });

    it('should return the requested model as-is for explicit specific models', () => {
      expect(getEffectiveModel(DEFAULT_GEMINI_MODEL, useFallbackModel)).toBe(
        DEFAULT_GEMINI_MODEL,
      );
      expect(
        getEffectiveModel(DEFAULT_GEMINI_FLASH_MODEL, useFallbackModel),
      ).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      expect(
        getEffectiveModel(DEFAULT_GEMINI_FLASH_LITE_MODEL, useFallbackModel),
      ).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
    });

    it('should return a custom model name when requested', () => {
      const customModel = 'custom-model-v1';
      const model = getEffectiveModel(customModel, useFallbackModel);
      expect(model).toBe(customModel);
    });
  });

  describe('When IN fallback mode', () => {
    const useFallbackModel = true;

    it('should return the Preview Flash model when auto-preview is requested', () => {
      const model = getEffectiveModel(
        PREVIEW_GEMINI_MODEL_AUTO,
        useFallbackModel,
      );
      expect(model).toBe(PREVIEW_GEMINI_FLASH_MODEL);
    });

    it('should return the Default Flash model when auto-default is requested', () => {
      const model = getEffectiveModel(
        DEFAULT_GEMINI_MODEL_AUTO,
        useFallbackModel,
      );
      expect(model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    });

    it('should return the requested model as-is for explicit specific models', () => {
      expect(getEffectiveModel(DEFAULT_GEMINI_MODEL, useFallbackModel)).toBe(
        DEFAULT_GEMINI_MODEL,
      );
      expect(
        getEffectiveModel(DEFAULT_GEMINI_FLASH_MODEL, useFallbackModel),
      ).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      expect(
        getEffectiveModel(DEFAULT_GEMINI_FLASH_LITE_MODEL, useFallbackModel),
      ).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
    });

    it('should return custom model name as-is', () => {
      const customModel = 'custom-model-v1';
      const model = getEffectiveModel(customModel, useFallbackModel);
      expect(model).toBe(customModel);
    });
  });
});

describe('isGemini2Model', () => {
  it('should return true for gemini-2.5-pro', () => {
    expect(isGemini2Model('gemini-2.5-pro')).toBe(true);
  });

  it('should return true for gemini-2.5-flash', () => {
    expect(isGemini2Model('gemini-2.5-flash')).toBe(true);
  });

  it('should return true for gemini-2.0-flash', () => {
    expect(isGemini2Model('gemini-2.0-flash')).toBe(true);
  });

  it('should return false for gemini-1.5-pro', () => {
    expect(isGemini2Model('gemini-1.5-pro')).toBe(false);
  });

  it('should return false for gemini-3-pro', () => {
    expect(isGemini2Model('gemini-3-pro')).toBe(false);
  });

  it('should return false for arbitrary strings', () => {
    expect(isGemini2Model('gpt-4')).toBe(false);
  });
});
