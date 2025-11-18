/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getEffectiveModel,
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  GEMINI_MODEL_ALIAS_PRO,
  GEMINI_MODEL_ALIAS_FLASH,
  GEMINI_MODEL_ALIAS_FLASH_LITE,
} from './models.js';

describe('getEffectiveModel', () => {
  describe('When NOT in fallback mode', () => {
    const isInFallbackMode = false;

    it('should return the Pro model when Pro is requested', () => {
      const model = getEffectiveModel(
        isInFallbackMode,
        DEFAULT_GEMINI_MODEL,
        false,
      );
      expect(model).toBe(DEFAULT_GEMINI_MODEL);
    });

    it('should return the Flash model when Flash is requested', () => {
      const model = getEffectiveModel(
        isInFallbackMode,
        DEFAULT_GEMINI_FLASH_MODEL,
        false,
      );
      expect(model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    });

    it('should return the Lite model when Lite is requested', () => {
      const model = getEffectiveModel(
        isInFallbackMode,
        DEFAULT_GEMINI_FLASH_LITE_MODEL,
        false,
      );
      expect(model).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
    });

    it('should return a custom model name when requested', () => {
      const customModel = 'custom-model-v1';
      const model = getEffectiveModel(isInFallbackMode, customModel, false);
      expect(model).toBe(customModel);
    });

    describe('with preview features', () => {
      it('should return the preview model when pro alias is requested', () => {
        const model = getEffectiveModel(
          isInFallbackMode,
          GEMINI_MODEL_ALIAS_PRO,
          true,
        );
        expect(model).toBe(PREVIEW_GEMINI_MODEL);
      });

      it('should return the default pro model when pro alias is requested and preview is off', () => {
        const model = getEffectiveModel(
          isInFallbackMode,
          GEMINI_MODEL_ALIAS_PRO,
          false,
        );
        expect(model).toBe(DEFAULT_GEMINI_MODEL);
      });

      it('should return the flash model when flash is requested and preview is on', () => {
        const model = getEffectiveModel(
          isInFallbackMode,
          GEMINI_MODEL_ALIAS_FLASH,
          true,
        );
        expect(model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      });

      it('should return the flash model when lite is requested and preview is on', () => {
        const model = getEffectiveModel(
          isInFallbackMode,
          GEMINI_MODEL_ALIAS_FLASH_LITE,
          true,
        );
        expect(model).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
      });

      it('should return the flash model when the flash model name is explicitly requested and preview is on', () => {
        const model = getEffectiveModel(
          isInFallbackMode,
          DEFAULT_GEMINI_FLASH_MODEL,
          true,
        );
        expect(model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      });

      it('should return the lite model when the lite model name is requested and preview is on', () => {
        const model = getEffectiveModel(
          isInFallbackMode,
          DEFAULT_GEMINI_FLASH_LITE_MODEL,
          true,
        );
        expect(model).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
      });

      it('should return the default gemini model when the model is explicitly set and preview is on', () => {
        const model = getEffectiveModel(
          isInFallbackMode,
          DEFAULT_GEMINI_MODEL,
          true,
        );
        expect(model).toBe(DEFAULT_GEMINI_MODEL);
      });
    });
  });

  describe('When IN fallback mode', () => {
    const isInFallbackMode = true;

    it('should downgrade the Pro model to the Flash model', () => {
      const model = getEffectiveModel(
        isInFallbackMode,
        DEFAULT_GEMINI_MODEL,
        false,
      );
      expect(model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    });

    it('should return the Flash model when Flash is requested', () => {
      const model = getEffectiveModel(
        isInFallbackMode,
        DEFAULT_GEMINI_FLASH_MODEL,
        false,
      );
      expect(model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    });

    it('should HONOR the Lite model when Lite is requested', () => {
      const model = getEffectiveModel(
        isInFallbackMode,
        DEFAULT_GEMINI_FLASH_LITE_MODEL,
        false,
      );
      expect(model).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
    });

    it('should HONOR any model with "lite" in its name', () => {
      const customLiteModel = 'gemini-2.5-custom-lite-vNext';
      const model = getEffectiveModel(isInFallbackMode, customLiteModel, false);
      expect(model).toBe(customLiteModel);
    });

    it('should downgrade any other custom model to the Flash model', () => {
      const customModel = 'custom-model-v1-unlisted';
      const model = getEffectiveModel(isInFallbackMode, customModel, false);
      expect(model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    });

    describe('with preview features', () => {
      it('should downgrade the Pro alias to the Flash model', () => {
        const model = getEffectiveModel(
          isInFallbackMode,
          GEMINI_MODEL_ALIAS_PRO,
          true,
        );
        expect(model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      });

      it('should return the Flash alias when requested', () => {
        const model = getEffectiveModel(
          isInFallbackMode,
          GEMINI_MODEL_ALIAS_FLASH,
          true,
        );
        expect(model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      });

      it('should return the Lite alias when requested', () => {
        const model = getEffectiveModel(
          isInFallbackMode,
          GEMINI_MODEL_ALIAS_FLASH_LITE,
          true,
        );
        expect(model).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
      });

      it('should downgrade the default Gemini model to the Flash model', () => {
        const model = getEffectiveModel(
          isInFallbackMode,
          DEFAULT_GEMINI_MODEL,
          true,
        );
        expect(model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      });

      it('should return the default Flash model when requested', () => {
        const model = getEffectiveModel(
          isInFallbackMode,
          DEFAULT_GEMINI_FLASH_MODEL,
          true,
        );
        expect(model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      });

      it('should return the default Lite model when requested', () => {
        const model = getEffectiveModel(
          isInFallbackMode,
          DEFAULT_GEMINI_FLASH_LITE_MODEL,
          true,
        );
        expect(model).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
      });

      it('should downgrade any other custom model to the Flash model', () => {
        const customModel = 'custom-model-v1-unlisted';
        const model = getEffectiveModel(isInFallbackMode, customModel, true);
        expect(model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      });
    });
  });
});
