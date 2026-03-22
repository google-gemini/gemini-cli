/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  resolveModel,
  resolveClassifierModel,
  isGemini3Model,
  isGemini2Model,
  isCustomModel,
  supportsModernFeatures,
  isAutoModel,
  getDisplayString,
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  supportsMultimodalFunctionResponse,
  GEMINI_MODEL_ALIAS_PRO,
  GEMINI_MODEL_ALIAS_FLASH,
  GEMINI_MODEL_ALIAS_AUTO,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_MODEL_AUTO,
  isActiveModel,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  isPreviewModel,
  isProModel,
} from './models.js';
import type { Config } from './config.js';
import { ModelConfigService } from '../services/modelConfigService.js';
import { DEFAULT_MODEL_CONFIGS } from './defaultModelConfigs.js';

const modelConfigService = new ModelConfigService(DEFAULT_MODEL_CONFIGS);

const dynamicConfig = {
  getExperimentalDynamicModelConfiguration: () => true,
  modelConfigService,
} as unknown as Config;

const legacyConfig = {
  getExperimentalDynamicModelConfiguration: () => false,
  modelConfigService,
} as unknown as Config;

describe('Dynamic Configuration Parity', () => {
  const modelsToTest = [
    GEMINI_MODEL_ALIAS_AUTO,
    GEMINI_MODEL_ALIAS_PRO,
    GEMINI_MODEL_ALIAS_FLASH,
    PREVIEW_GEMINI_MODEL_AUTO,
    DEFAULT_GEMINI_MODEL_AUTO,
    PREVIEW_GEMINI_MODEL,
    DEFAULT_GEMINI_MODEL,
    'custom-model',
  ];

  const flagCombos = [
    { useGemini3_1: false, useCustomToolModel: false },
    { useGemini3_1: true, useCustomToolModel: false },
    { useGemini3_1: true, useCustomToolModel: true },
  ];

  it('resolveModel should match legacy behavior when dynamicModelConfiguration flag enabled.', () => {
    for (const model of modelsToTest) {
      for (const flags of flagCombos) {
        for (const hasAccess of [true, false]) {
          const mockLegacyConfig = {
            // eslint-disable-next-line @typescript-eslint/no-misused-spread
            ...legacyConfig,
            getHasAccessToPreviewModel: () => hasAccess,
          } as unknown as Config;
          const mockDynamicConfig = {
            // eslint-disable-next-line @typescript-eslint/no-misused-spread
            ...dynamicConfig,
            getHasAccessToPreviewModel: () => hasAccess,
          } as unknown as Config;

          const legacy = resolveModel(
            model,
            flags.useGemini3_1,
            flags.useCustomToolModel,
            hasAccess,
            mockLegacyConfig,
          );
          const dynamic = resolveModel(
            model,
            flags.useGemini3_1,
            flags.useCustomToolModel,
            hasAccess,
            mockDynamicConfig,
          );
          expect(dynamic).toBe(legacy);
        }
      }
    }
  });

  it('resolveClassifierModel should match legacy behavior.', () => {
    const classifierTiers = [GEMINI_MODEL_ALIAS_PRO, GEMINI_MODEL_ALIAS_FLASH];
    const anchorModels = [
      PREVIEW_GEMINI_MODEL_AUTO,
      DEFAULT_GEMINI_MODEL_AUTO,
      PREVIEW_GEMINI_MODEL,
      DEFAULT_GEMINI_MODEL,
    ];

    for (const hasAccess of [true, false]) {
      const mockLegacyConfig = {
        // eslint-disable-next-line @typescript-eslint/no-misused-spread
        ...legacyConfig,
        getHasAccessToPreviewModel: () => hasAccess,
      } as unknown as Config;
      const mockDynamicConfig = {
        // eslint-disable-next-line @typescript-eslint/no-misused-spread
        ...dynamicConfig,
        getHasAccessToPreviewModel: () => hasAccess,
      } as unknown as Config;

      for (const tier of classifierTiers) {
        for (const anchor of anchorModels) {
          for (const flags of flagCombos) {
            const legacy = resolveClassifierModel(
              anchor,
              tier,
              flags.useGemini3_1,
              flags.useCustomToolModel,
              hasAccess,
              mockLegacyConfig,
            );
            const dynamic = resolveClassifierModel(
              anchor,
              tier,
              flags.useGemini3_1,
              flags.useCustomToolModel,
              hasAccess,
              mockDynamicConfig,
            );
            expect(dynamic).toBe(legacy);
          }
        }
      }
    }
  });

  it('getDisplayString should match legacy behavior', () => {
    for (const model of modelsToTest) {
      const legacy = getDisplayString(model, legacyConfig);
      const dynamic = getDisplayString(model, dynamicConfig);
      expect(dynamic).toBe(legacy);
    }
  });

  it('isPreviewModel should match legacy behavior', () => {
    const allModels = [
      ...modelsToTest,
      PREVIEW_GEMINI_3_1_MODEL,
      PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
      PREVIEW_GEMINI_FLASH_MODEL,
    ];
    for (const model of allModels) {
      const legacy = isPreviewModel(model, legacyConfig);
      const dynamic = isPreviewModel(model, dynamicConfig);
      expect(dynamic).toBe(legacy);
    }
  });

  it('isProModel should match legacy behavior', () => {
    for (const model of modelsToTest) {
      const legacy = isProModel(model, legacyConfig);
      const dynamic = isProModel(model, dynamicConfig);
      expect(dynamic).toBe(legacy);
    }
  });

  it('isGemini3Model should match legacy behavior', () => {
    for (const model of modelsToTest) {
      const legacy = isGemini3Model(model, legacyConfig);
      const dynamic = isGemini3Model(model, dynamicConfig);
      expect(dynamic).toBe(legacy);
    }
  });

  it('isCustomModel should match legacy behavior', () => {
    for (const model of modelsToTest) {
      const legacy = isCustomModel(model, legacyConfig);
      const dynamic = isCustomModel(model, dynamicConfig);
      expect(dynamic).toBe(legacy);
    }
  });

  it('supportsMultimodalFunctionResponse should match legacy behavior', () => {
    for (const model of modelsToTest) {
      const legacy = supportsMultimodalFunctionResponse(model, legacyConfig);
      const dynamic = supportsMultimodalFunctionResponse(model, dynamicConfig);
      expect(dynamic).toBe(legacy);
    }
  });
});

describe('isPreviewModel', () => {
  it('should return true for preview models', () => {
    expect(isPreviewModel(PREVIEW_GEMINI_MODEL)).toBe(true);
    expect(isPreviewModel(PREVIEW_GEMINI_3_1_MODEL)).toBe(true);
    expect(isPreviewModel(PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL)).toBe(true);
    expect(isPreviewModel(PREVIEW_GEMINI_FLASH_MODEL)).toBe(true);
    expect(isPreviewModel(PREVIEW_GEMINI_MODEL_AUTO)).toBe(true);
  });

  it('should return false for non-preview models', () => {
    expect(isPreviewModel(DEFAULT_GEMINI_MODEL)).toBe(false);
    expect(isPreviewModel('gemini-1.5-pro')).toBe(false);
  });
});

describe('isProModel', () => {
  it('should return true for models containing "pro"', () => {
    expect(isProModel('gemini-3-pro-preview')).toBe(true);
    expect(isProModel('gemini-2.5-pro')).toBe(true);
    expect(isProModel('pro')).toBe(true);
  });

  it('should return false for models without "pro"', () => {
    expect(isProModel('gemini-3-flash-preview')).toBe(false);
    expect(isProModel('gemini-2.5-flash')).toBe(false);
    expect(isProModel('auto')).toBe(false);
  });
});

describe('isCustomModel', () => {
  it('should return true for models not starting with gemini-', () => {
    expect(isCustomModel('testing')).toBe(true);
    expect(isCustomModel('gpt-4')).toBe(true);
    expect(isCustomModel('claude-3')).toBe(true);
  });

  it('should return false for Gemini models', () => {
    expect(isCustomModel('gemini-1.5-pro')).toBe(false);
    expect(isCustomModel('gemini-2.0-flash')).toBe(false);
    expect(isCustomModel('gemini-3-pro-preview')).toBe(false);
  });

  it('should return false for aliases that resolve to Gemini models', () => {
    expect(isCustomModel(GEMINI_MODEL_ALIAS_AUTO)).toBe(false);
    expect(isCustomModel(GEMINI_MODEL_ALIAS_PRO)).toBe(false);
  });
});

describe('supportsModernFeatures', () => {
  it('should return true for Gemini 3 models', () => {
    expect(supportsModernFeatures('gemini-3-pro-preview')).toBe(true);
    expect(supportsModernFeatures('gemini-3-flash-preview')).toBe(true);
  });

  it('should return true for custom models', () => {
    expect(supportsModernFeatures('testing')).toBe(true);
    expect(supportsModernFeatures('some-custom-model')).toBe(true);
  });

  it('should return false for older Gemini models', () => {
    expect(supportsModernFeatures('gemini-2.5-pro')).toBe(false);
    expect(supportsModernFeatures('gemini-2.5-flash')).toBe(false);
    expect(supportsModernFeatures('gemini-2.0-flash')).toBe(false);
    expect(supportsModernFeatures('gemini-1.5-pro')).toBe(false);
    expect(supportsModernFeatures('gemini-1.0-pro')).toBe(false);
  });

  it('should return true for modern aliases', () => {
    expect(supportsModernFeatures(GEMINI_MODEL_ALIAS_PRO)).toBe(true);
    expect(supportsModernFeatures(GEMINI_MODEL_ALIAS_AUTO)).toBe(true);
  });
});

describe('isGemini3Model', () => {
  it('should return true for gemini-3 models', () => {
    expect(isGemini3Model('gemini-3-pro-preview')).toBe(true);
    expect(isGemini3Model('gemini-3-flash-preview')).toBe(true);
  });

  it('should return true for aliases that resolve to Gemini 3', () => {
    expect(isGemini3Model(GEMINI_MODEL_ALIAS_AUTO)).toBe(true);
    expect(isGemini3Model(GEMINI_MODEL_ALIAS_PRO)).toBe(true);
    expect(isGemini3Model(PREVIEW_GEMINI_MODEL_AUTO)).toBe(true);
  });

  it('should return false for Gemini 2 models', () => {
    expect(isGemini3Model('gemini-2.5-pro')).toBe(false);
    expect(isGemini3Model('gemini-2.5-flash')).toBe(false);
    expect(isGemini3Model(DEFAULT_GEMINI_MODEL_AUTO)).toBe(false);
  });

  it('should return false for arbitrary strings', () => {
    expect(isGemini3Model('gpt-4')).toBe(false);
  });
});

describe('getDisplayString', () => {
  it('should return Auto (Gemini 3) for preview auto model', () => {
    expect(getDisplayString(PREVIEW_GEMINI_MODEL_AUTO)).toBe('Auto (Gemini 3)');
  });

  it('should return Auto (Gemini 2.5) for default auto model', () => {
    expect(getDisplayString(DEFAULT_GEMINI_MODEL_AUTO)).toBe(
      'Auto (Gemini 2.5)',
    );
  });

  it('should return concrete model name for pro alias', () => {
    expect(getDisplayString(GEMINI_MODEL_ALIAS_PRO)).toBe(PREVIEW_GEMINI_MODEL);
  });

  it('should return concrete model name for flash alias', () => {
    expect(getDisplayString(GEMINI_MODEL_ALIAS_FLASH)).toBe(
      PREVIEW_GEMINI_FLASH_MODEL,
    );
  });

  it('should return PREVIEW_GEMINI_3_1_MODEL for PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL', () => {
    expect(getDisplayString(PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL)).toBe(
      PREVIEW_GEMINI_3_1_MODEL,
    );
  });

  it('should return PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL for PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL', () => {
    expect(getDisplayString(PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL)).toBe(
      PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL,
    );
  });

  it('should return the model name as is for other models', () => {
    expect(getDisplayString('custom-model')).toBe('custom-model');
    expect(getDisplayString(DEFAULT_GEMINI_FLASH_LITE_MODEL)).toBe(
      DEFAULT_GEMINI_FLASH_LITE_MODEL,
    );
  });
});

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

describe('resolveModel', () => {
  describe('delegation logic', () => {
    it('should return the Preview Pro model when auto-gemini-3 is requested', () => {
      const model = resolveModel(PREVIEW_GEMINI_MODEL_AUTO);
      expect(model).toBe(PREVIEW_GEMINI_MODEL);
    });

    it('should return Gemini 3.1 Pro when auto-gemini-3 is requested and useGemini3_1 is true', () => {
      const model = resolveModel(PREVIEW_GEMINI_MODEL_AUTO, true);
      expect(model).toBe(PREVIEW_GEMINI_3_1_MODEL);
    });

    it('should return Gemini 3.1 Pro Custom Tools when auto-gemini-3 is requested, useGemini3_1 is true, and useCustomToolModel is true', () => {
      const model = resolveModel(PREVIEW_GEMINI_MODEL_AUTO, true, true);
      expect(model).toBe(PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL);
    });

    it('should return the Default Pro model when auto-gemini-2.5 is requested', () => {
      const model = resolveModel(DEFAULT_GEMINI_MODEL_AUTO);
      expect(model).toBe(DEFAULT_GEMINI_MODEL);
    });

    it('should return the requested model as-is for explicit specific models', () => {
      expect(resolveModel(DEFAULT_GEMINI_MODEL)).toBe(DEFAULT_GEMINI_MODEL);
      expect(resolveModel(DEFAULT_GEMINI_FLASH_MODEL)).toBe(
        DEFAULT_GEMINI_FLASH_MODEL,
      );
      expect(resolveModel(DEFAULT_GEMINI_FLASH_LITE_MODEL)).toBe(
        DEFAULT_GEMINI_FLASH_LITE_MODEL,
      );
    });

    it('should return a custom model name when requested', () => {
      const customModel = 'custom-model-v1';
      const model = resolveModel(customModel);
      expect(model).toBe(customModel);
    });
  });

  describe('hasAccessToPreview logic', () => {
    it('should return default model when access to preview is false and preview model is requested', () => {
      expect(resolveModel(PREVIEW_GEMINI_MODEL, false, false, false)).toBe(
        DEFAULT_GEMINI_MODEL,
      );
    });

    it('should return default flash model when access to preview is false and preview flash model is requested', () => {
      expect(
        resolveModel(PREVIEW_GEMINI_FLASH_MODEL, false, false, false),
      ).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    });

    it('should return default flash lite model when access to preview is false and preview flash lite model is requested', () => {
      expect(
        resolveModel(PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL, false, false, false),
      ).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
    });

    it('should return default model when access to preview is false and auto-gemini-3 is requested', () => {
      expect(resolveModel(PREVIEW_GEMINI_MODEL_AUTO, false, false, false)).toBe(
        DEFAULT_GEMINI_MODEL,
      );
    });

    it('should return default model when access to preview is false and Gemini 3.1 is requested', () => {
      expect(resolveModel(PREVIEW_GEMINI_MODEL_AUTO, true, false, false)).toBe(
        DEFAULT_GEMINI_MODEL,
      );
    });

    it('should still return default model when access to preview is false and auto-gemini-2.5 is requested', () => {
      expect(resolveModel(DEFAULT_GEMINI_MODEL_AUTO, false, false, false)).toBe(
        DEFAULT_GEMINI_MODEL,
      );
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

describe('isAutoModel', () => {
  it('should return true for "auto"', () => {
    expect(isAutoModel(GEMINI_MODEL_ALIAS_AUTO)).toBe(true);
  });

  it('should return true for "auto-gemini-3"', () => {
    expect(isAutoModel(PREVIEW_GEMINI_MODEL_AUTO)).toBe(true);
  });

  it('should return true for "auto-gemini-2.5"', () => {
    expect(isAutoModel(DEFAULT_GEMINI_MODEL_AUTO)).toBe(true);
  });

  it('should return false for concrete models', () => {
    expect(isAutoModel(DEFAULT_GEMINI_MODEL)).toBe(false);
    expect(isAutoModel(PREVIEW_GEMINI_MODEL)).toBe(false);
    expect(isAutoModel('some-random-model')).toBe(false);
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

  it('should return Gemini 3.1 Pro when alias is pro and useGemini3_1 is true', () => {
    expect(
      resolveClassifierModel(
        PREVIEW_GEMINI_MODEL_AUTO,
        GEMINI_MODEL_ALIAS_PRO,
        true,
      ),
    ).toBe(PREVIEW_GEMINI_3_1_MODEL);
  });

  it('should return Gemini 3.1 Pro Custom Tools when alias is pro, useGemini3_1 is true, and useCustomToolModel is true', () => {
    expect(
      resolveClassifierModel(
        PREVIEW_GEMINI_MODEL_AUTO,
        GEMINI_MODEL_ALIAS_PRO,
        true,
        true,
      ),
    ).toBe(PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL);
  });
});

describe('isActiveModel', () => {
  it('should return true for valid models when useGemini3_1 is false', () => {
    expect(isActiveModel(DEFAULT_GEMINI_MODEL)).toBe(true);
    expect(isActiveModel(PREVIEW_GEMINI_MODEL)).toBe(true);
    expect(isActiveModel(DEFAULT_GEMINI_FLASH_MODEL)).toBe(true);
    expect(isActiveModel(PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL)).toBe(true);
  });

  it('should return true for unknown models and aliases', () => {
    expect(isActiveModel('invalid-model')).toBe(false);
    expect(isActiveModel(GEMINI_MODEL_ALIAS_AUTO)).toBe(false);
  });

  it('should return false for PREVIEW_GEMINI_MODEL when useGemini3_1 is true', () => {
    expect(isActiveModel(PREVIEW_GEMINI_MODEL, true)).toBe(false);
  });

  it('should return true for other valid models when useGemini3_1 is true', () => {
    expect(isActiveModel(DEFAULT_GEMINI_MODEL, true)).toBe(true);
    expect(isActiveModel(PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL, true)).toBe(true);
  });

  it('should correctly filter Gemini 3.1 models based on useCustomToolModel when useGemini3_1 is true', () => {
    // When custom tools are preferred, standard 3.1 should be inactive
    expect(isActiveModel(PREVIEW_GEMINI_3_1_MODEL, true, true)).toBe(false);
    expect(
      isActiveModel(PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL, true, true),
    ).toBe(true);

    // When custom tools are NOT preferred, custom tools 3.1 should be inactive
    expect(isActiveModel(PREVIEW_GEMINI_3_1_MODEL, true, false)).toBe(true);
    expect(
      isActiveModel(PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL, true, false),
    ).toBe(false);
  });

  it('should return false for both Gemini 3.1 models when useGemini3_1 is false', () => {
    expect(isActiveModel(PREVIEW_GEMINI_3_1_MODEL, false, true)).toBe(false);
    expect(isActiveModel(PREVIEW_GEMINI_3_1_MODEL, false, false)).toBe(false);
    expect(
      isActiveModel(PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL, false, true),
    ).toBe(false);
    expect(
      isActiveModel(PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL, false, false),
    ).toBe(false);
  });
});
