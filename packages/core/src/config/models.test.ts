/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getEffectiveModel,
  resolveClassifierModel,
  isGemini2Model,
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  supportsMultimodalFunctionResponse,
  GEMINI_MODEL_ALIAS_PRO,
  GEMINI_MODEL_ALIAS_FLASH,
  GEMINI_MODEL_ALIAS_FLASH_LITE,
  PREVIEW_GEMINI_FLASH_MODEL,
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
  describe('delegation to resolveModel', () => {
    it('should return the Preview Pro model when auto-gemini-3 is requested', () => {
      const model = getEffectiveModel(PREVIEW_GEMINI_MODEL_AUTO, false);
      expect(model).toBe(PREVIEW_GEMINI_MODEL);
    });

    it('should return the Default Pro model when auto-gemini-2.5 is requested', () => {
      const model = getEffectiveModel(DEFAULT_GEMINI_MODEL_AUTO, false);
      expect(model).toBe(DEFAULT_GEMINI_MODEL);
    });

    it('should return the requested model as-is for explicit specific models', () => {
      expect(getEffectiveModel(DEFAULT_GEMINI_MODEL, false)).toBe(
        DEFAULT_GEMINI_MODEL,
      );
      expect(getEffectiveModel(DEFAULT_GEMINI_FLASH_MODEL, false)).toBe(
        DEFAULT_GEMINI_FLASH_MODEL,
      );
      expect(getEffectiveModel(DEFAULT_GEMINI_FLASH_LITE_MODEL, false)).toBe(
        DEFAULT_GEMINI_FLASH_LITE_MODEL,
      );
    });

    it('should return a custom model name when requested', () => {
      const customModel = 'custom-model-v1';
      const model = getEffectiveModel(customModel, false);
      expect(model).toBe(customModel);
    });

    describe('with preview features', () => {
      it('should return the preview model when pro alias is requested', () => {
        const model = getEffectiveModel(GEMINI_MODEL_ALIAS_PRO, true);
        expect(model).toBe(PREVIEW_GEMINI_MODEL);
      });

      it('should return the default pro model when pro alias is requested and preview is off', () => {
        const model = getEffectiveModel(GEMINI_MODEL_ALIAS_PRO, false);
        expect(model).toBe(DEFAULT_GEMINI_MODEL);
      });

      it('should return the flash model when flash is requested and preview is on', () => {
        const model = getEffectiveModel(GEMINI_MODEL_ALIAS_FLASH, true);
        expect(model).toBe(PREVIEW_GEMINI_FLASH_MODEL);
      });

      it('should return the flash model when lite is requested and preview is on', () => {
        const model = getEffectiveModel(GEMINI_MODEL_ALIAS_FLASH_LITE, true);
        expect(model).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
      });

      it('should return the flash model when the flash model name is explicitly requested and preview is on', () => {
        const model = getEffectiveModel(DEFAULT_GEMINI_FLASH_MODEL, true);
        expect(model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      });

      it('should return the lite model when the lite model name is requested and preview is on', () => {
        const model = getEffectiveModel(DEFAULT_GEMINI_FLASH_LITE_MODEL, true);
        expect(model).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
      });

      it('should return the default gemini model when the model is explicitly set and preview is on', () => {
        const model = getEffectiveModel(DEFAULT_GEMINI_MODEL, true);
        expect(model).toBe(DEFAULT_GEMINI_MODEL);
      });
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

describe('resolveClassifierModel', () => {
  it('should return flash model when alias is flash', () => {
    expect(
      resolveClassifierModel(
        DEFAULT_GEMINI_MODEL_AUTO,
        GEMINI_MODEL_ALIAS_FLASH,
      ),
    ).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    expect(
      resolveClassifierModel(
        PREVIEW_GEMINI_MODEL_AUTO,
        GEMINI_MODEL_ALIAS_FLASH,
      ),
    ).toBe(PREVIEW_GEMINI_FLASH_MODEL);
  });

  it('should return pro model when alias is pro', () => {
    expect(
      resolveClassifierModel(DEFAULT_GEMINI_MODEL_AUTO, GEMINI_MODEL_ALIAS_PRO),
    ).toBe(DEFAULT_GEMINI_MODEL);
    expect(
      resolveClassifierModel(PREVIEW_GEMINI_MODEL_AUTO, GEMINI_MODEL_ALIAS_PRO),
    ).toBe(PREVIEW_GEMINI_MODEL);
  });

  it('should handle preview features being enabled', () => {
    // If preview is enabled, resolving 'flash' without context (fallback) might switch to preview flash,
    // but here we test explicit auto models which should stick to their families if possible?
    // Actually our logic forces DEFAULT_GEMINI_FLASH_MODEL for DEFAULT_GEMINI_MODEL_AUTO even if preview is on,
    // because the USER requested 2.5 explicitly via "auto-gemini-2.5".
    expect(
      resolveClassifierModel(
        DEFAULT_GEMINI_MODEL_AUTO,
        GEMINI_MODEL_ALIAS_FLASH,
        true,
      ),
    ).toBe(DEFAULT_GEMINI_FLASH_MODEL);
  });
});
