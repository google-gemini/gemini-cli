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
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  isPreviewModel,
  isProModel,
  GEMINI_MODEL_ALIAS_FLASH_LITE,
  VALID_ALIASES,
  VALID_GEMINI_MODELS,
  isValidModelOrAlias,
  getValidModelsAndAliases,
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

  it('supportsModernFeatures should match legacy behavior', () => {
    for (const model of modelsToTest) {
      const legacy = supportsModernFeatures(model);
      const dynamic = supportsModernFeatures(model);
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
    expect(supportsModernFeatures(PREVIEW_GEMINI_3_1_MODEL)).toBe(true);
  });

  it('should return true for custom models', () => {
    expect(supportsModernFeatures('testing')).toBe(true);
    expect(supportsModernFeatures('some-custom-model')).toBe(true);
  });

  it('should return false for non-Gemini-2/3 models', () => {
    // Gemini 2 models now redirect to Gemini 3, so they support modern features
    expect(supportsModernFeatures('gemini-2.5-pro')).toBe(true);
    expect(supportsModernFeatures('gemini-2.5-flash')).toBe(true);
    // Gemini 1.x and others are not modern
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

  it('should return true for Gemini 2 models (they redirect to Gemini 3 via auto)', () => {
    expect(isGemini3Model('gemini-2.5-pro')).toBe(true);
    expect(isGemini3Model('gemini-2.5-flash')).toBe(true);
  });

  it('should return false for arbitrary strings', () => {
    expect(isGemini3Model('gpt-4')).toBe(false);
  });
});

describe('getDisplayString', () => {
  it('should return Auto for all auto aliases', () => {
    expect(getDisplayString(GEMINI_MODEL_ALIAS_AUTO)).toBe('Auto');
    expect(getDisplayString(PREVIEW_GEMINI_MODEL_AUTO)).toBe('Auto');
    expect(getDisplayString(DEFAULT_GEMINI_MODEL_AUTO)).toBe('Auto');
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

  it('should return the model name as is for other models', () => {
    expect(getDisplayString('custom-model')).toBe('custom-model');
  });
});

describe('supportsMultimodalFunctionResponse', () => {
  it('should return true for gemini-3 model', () => {
    expect(supportsMultimodalFunctionResponse('gemini-3-pro')).toBe(true);
  });

  it('should return true for gemini-2 models (they redirect to Gemini 3 via auto)', () => {
    expect(supportsMultimodalFunctionResponse('gemini-2.5-pro')).toBe(true);
    expect(supportsMultimodalFunctionResponse('gemini-2.5-flash')).toBe(true);
  });

  it('should return false for other models', () => {
    expect(supportsMultimodalFunctionResponse('some-other-model')).toBe(false);
    expect(supportsMultimodalFunctionResponse('')).toBe(false);
  });
});

describe('resolveModel', () => {
  describe('auto mode always resolves to Gemini 3', () => {
    it('should return Gemini 3 Pro for auto with preview access', () => {
      expect(resolveModel(GEMINI_MODEL_ALIAS_AUTO, false, false, true)).toBe(
        PREVIEW_GEMINI_MODEL,
      );
    });

    it('should return Gemini 3.1 Pro for auto when useGemini3_1 is true', () => {
      expect(resolveModel(GEMINI_MODEL_ALIAS_AUTO, true, false, true)).toBe(
        PREVIEW_GEMINI_3_1_MODEL,
      );
    });

    it('should return Gemini 3.1 Custom Tools when both flags are true', () => {
      expect(resolveModel(GEMINI_MODEL_ALIAS_AUTO, true, true, true)).toBe(
        PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
      );
    });

    it('should fall back to Gemini 3 Flash when no preview access', () => {
      expect(resolveModel(GEMINI_MODEL_ALIAS_AUTO, false, false, false)).toBe(
        PREVIEW_GEMINI_FLASH_MODEL,
      );
    });
  });

  describe('legacy auto aliases also resolve to Gemini 3', () => {
    it('auto-gemini-3 resolves through progressive fallback', () => {
      expect(resolveModel(PREVIEW_GEMINI_MODEL_AUTO, false, false, true)).toBe(
        PREVIEW_GEMINI_MODEL,
      );
    });

    it('auto-gemini-2.5 resolves through progressive fallback (no Gemini 2)', () => {
      expect(resolveModel(DEFAULT_GEMINI_MODEL_AUTO, false, false, true)).toBe(
        PREVIEW_GEMINI_MODEL,
      );
    });
  });

  describe('Gemini 2 models redirect to auto', () => {
    it('should redirect gemini-2.5-pro to progressive auto', () => {
      expect(resolveModel(DEFAULT_GEMINI_MODEL, false, false, true)).toBe(
        PREVIEW_GEMINI_MODEL,
      );
    });

    it('should redirect gemini-2.5-flash to progressive auto', () => {
      expect(resolveModel(DEFAULT_GEMINI_FLASH_MODEL, false, false, true)).toBe(
        PREVIEW_GEMINI_MODEL,
      );
    });

    it('should redirect gemini-2.5-flash-lite to progressive auto', () => {
      expect(
        resolveModel(DEFAULT_GEMINI_FLASH_LITE_MODEL, false, false, true),
      ).toBe(PREVIEW_GEMINI_MODEL);
    });
  });

  describe('aliases', () => {
    it('pro alias returns Gemini 3 Pro', () => {
      expect(resolveModel(GEMINI_MODEL_ALIAS_PRO, false, false, true)).toBe(
        PREVIEW_GEMINI_MODEL,
      );
    });

    it('flash alias returns Gemini 3 Flash', () => {
      expect(resolveModel(GEMINI_MODEL_ALIAS_FLASH, false, false, true)).toBe(
        PREVIEW_GEMINI_FLASH_MODEL,
      );
    });

    it('flash-lite alias redirects to Gemini 3 Flash', () => {
      expect(
        resolveModel(GEMINI_MODEL_ALIAS_FLASH_LITE, false, false, true),
      ).toBe(PREVIEW_GEMINI_FLASH_MODEL);
    });
  });

  describe('custom models pass through', () => {
    it('should return a custom model name as-is', () => {
      expect(resolveModel('custom-model-v1')).toBe('custom-model-v1');
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
  it('should always return Gemini 3 Flash for flash alias', () => {
    expect(
      resolveClassifierModel(
        DEFAULT_GEMINI_MODEL_AUTO,
        GEMINI_MODEL_ALIAS_FLASH,
      ),
    ).toBe(PREVIEW_GEMINI_FLASH_MODEL);
    expect(
      resolveClassifierModel(
        PREVIEW_GEMINI_MODEL_AUTO,
        GEMINI_MODEL_ALIAS_FLASH,
      ),
    ).toBe(PREVIEW_GEMINI_FLASH_MODEL);
  });

  it('should return pro model when alias is pro', () => {
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
  it('should return false for all Gemini 2 models', () => {
    expect(isActiveModel(DEFAULT_GEMINI_MODEL)).toBe(false);
    expect(isActiveModel(DEFAULT_GEMINI_FLASH_MODEL)).toBe(false);
    expect(isActiveModel(DEFAULT_GEMINI_FLASH_LITE_MODEL)).toBe(false);
  });

  it('should return true for Gemini 3 Pro with preview access', () => {
    expect(isActiveModel(PREVIEW_GEMINI_MODEL, false, false, true)).toBe(true);
  });

  it('should return true for Gemini 3 Flash with preview access', () => {
    expect(isActiveModel(PREVIEW_GEMINI_FLASH_MODEL, false, false, true)).toBe(
      true,
    );
  });

  it('should return false for preview models without preview access', () => {
    expect(isActiveModel(PREVIEW_GEMINI_MODEL, false, false, false)).toBe(
      false,
    );
    expect(isActiveModel(PREVIEW_GEMINI_FLASH_MODEL, false, false, false)).toBe(
      false,
    );
  });

  it('should correctly filter Gemini 3.1 models based on useCustomToolModel', () => {
    // Custom tools enabled: 3.1 Pro is inactive, Custom Tools is active
    expect(isActiveModel(PREVIEW_GEMINI_3_1_MODEL, true, true)).toBe(false);
    expect(
      isActiveModel(PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL, true, true),
    ).toBe(true);

    // Custom tools disabled: 3.1 Pro is active, Custom Tools is inactive
    expect(
      isActiveModel(PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL, true, false),
    ).toBe(false);
    expect(isActiveModel(PREVIEW_GEMINI_3_1_MODEL, true, false)).toBe(true);
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

  it('should return true for custom (non-Gemini) models', () => {
    expect(isActiveModel('my-custom-model')).toBe(true);
  });
});
describe('isValidModelOrAlias', () => {
  it('should return true for valid model names', () => {
    expect(isValidModelOrAlias(PREVIEW_GEMINI_MODEL)).toBe(true);
    expect(isValidModelOrAlias(PREVIEW_GEMINI_FLASH_MODEL)).toBe(true);
    expect(isValidModelOrAlias(PREVIEW_GEMINI_3_1_MODEL)).toBe(true);
    expect(isValidModelOrAlias(PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL)).toBe(
      true,
    );
    // Gemini 2 models are still valid (used by internal tools)
    expect(isValidModelOrAlias(DEFAULT_GEMINI_MODEL)).toBe(true);
    expect(isValidModelOrAlias(DEFAULT_GEMINI_FLASH_MODEL)).toBe(true);
    expect(isValidModelOrAlias(DEFAULT_GEMINI_FLASH_LITE_MODEL)).toBe(true);
  });

  it('should return true for valid aliases', () => {
    expect(isValidModelOrAlias(GEMINI_MODEL_ALIAS_AUTO)).toBe(true);
    expect(isValidModelOrAlias(GEMINI_MODEL_ALIAS_PRO)).toBe(true);
    expect(isValidModelOrAlias(GEMINI_MODEL_ALIAS_FLASH)).toBe(true);
    expect(isValidModelOrAlias(GEMINI_MODEL_ALIAS_FLASH_LITE)).toBe(true);
    expect(isValidModelOrAlias(PREVIEW_GEMINI_MODEL_AUTO)).toBe(true);
    expect(isValidModelOrAlias(DEFAULT_GEMINI_MODEL_AUTO)).toBe(true);
  });

  it('should return true for custom (non-gemini) models', () => {
    expect(isValidModelOrAlias('gpt-4')).toBe(true);
    expect(isValidModelOrAlias('claude-3')).toBe(true);
    expect(isValidModelOrAlias('my-custom-model')).toBe(true);
  });

  it('should return false for invalid gemini model names', () => {
    expect(isValidModelOrAlias('gemini-4-pro')).toBe(false);
    expect(isValidModelOrAlias('gemini-99-flash')).toBe(false);
    expect(isValidModelOrAlias('gemini-invalid')).toBe(false);
  });
});

describe('getValidModelsAndAliases', () => {
  it('should return a sorted array', () => {
    const result = getValidModelsAndAliases();
    const sorted = [...result].sort();
    expect(result).toEqual(sorted);
  });

  it('should include all valid models and aliases', () => {
    const result = getValidModelsAndAliases();
    for (const model of VALID_GEMINI_MODELS) {
      expect(result).toContain(model);
    }
    for (const alias of VALID_ALIASES) {
      expect(result).toContain(alias);
    }
  });

  it('should not contain duplicates', () => {
    const result = getValidModelsAndAliases();
    const unique = [...new Set(result)];
    expect(result).toEqual(unique);
  });
});
