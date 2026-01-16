/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyModelSelection } from './policyHelpers.js';
import type { Config } from '../config/config.js';
import {
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
} from '../config/models.js';
import { ModelAvailabilityService } from './modelAvailabilityService.js';
import { ModelConfigService } from '../services/modelConfigService.js';
import { DEFAULT_MODEL_CONFIGS } from '../config/defaultModelConfigs.js';

describe('Fallback Integration', () => {
  let config: Config;
  let availabilityService: ModelAvailabilityService;
  let modelConfigService: ModelConfigService;

  beforeEach(() => {
    // Mocking Config because it has many dependencies
    config = {
      getModel: () => PREVIEW_GEMINI_MODEL_AUTO,
      getActiveModel: () => PREVIEW_GEMINI_MODEL_AUTO,
      setActiveModel: vi.fn(),
      getPreviewFeatures: () => true, // Preview enabled for Gemini 3
      getUserTier: () => undefined,
      getModelAvailabilityService: () => availabilityService,
      modelConfigService: undefined as unknown as ModelConfigService,
    } as unknown as Config;

    availabilityService = new ModelAvailabilityService();
    modelConfigService = new ModelConfigService(DEFAULT_MODEL_CONFIGS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (config as any).modelConfigService = modelConfigService;
  });

  it('should select fallback model when primary model is terminal and config is in AUTO mode', () => {
    // 1. Simulate "Pro" failing with a terminal quota error
    // The policy chain for PREVIEW_GEMINI_MODEL_AUTO is [PREVIEW_GEMINI_MODEL, PREVIEW_GEMINI_FLASH_MODEL]
    availabilityService.markTerminal(PREVIEW_GEMINI_MODEL, 'quota');

    // 2. Request "Pro" explicitly (as Agent would)
    const requestedModel = PREVIEW_GEMINI_MODEL;

    // 3. Apply model selection
    const result = applyModelSelection(config, { model: requestedModel });

    // 4. Expect fallback to Flash
    expect(result.model).toBe(PREVIEW_GEMINI_FLASH_MODEL);

    // 5. Expect active model to be updated
    expect(config.setActiveModel).toHaveBeenCalledWith(
      PREVIEW_GEMINI_FLASH_MODEL,
    );
  });

  it('should NOT fallback if config is NOT in AUTO mode', () => {
    // 1. Config is explicitly set to Pro, not Auto
    vi.spyOn(config, 'getModel').mockReturnValue(PREVIEW_GEMINI_MODEL);

    // 2. Simulate "Pro" failing
    availabilityService.markTerminal(PREVIEW_GEMINI_MODEL, 'quota');

    // 3. Request "Pro"
    const requestedModel = PREVIEW_GEMINI_MODEL;

    // 4. Apply model selection
    const result = applyModelSelection(config, { model: requestedModel });

    // 5. Expect it to stay on Pro (because single model chain)
    expect(result.model).toBe(PREVIEW_GEMINI_MODEL);
  });
});
