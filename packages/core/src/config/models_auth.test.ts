/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  resolveModel,
  PREVIEW_GEMINI_MODEL_AUTO,
  PREVIEW_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL,
  type ModelCapabilityContext,
} from './models.js';
import { ModelConfigService } from '../services/modelConfigService.js';
import { DEFAULT_MODEL_CONFIGS } from './defaultModelConfigs.js';

const modelConfigService = new ModelConfigService(DEFAULT_MODEL_CONFIGS);

const dynamicConfig = {
  getExperimentalDynamicModelConfiguration: () => true,
  modelConfigService,
} as unknown as ModelCapabilityContext;

describe('resolveModel with authType', () => {
  it('should resolve auto-gemini-3 to gemini-3-pro-preview for non-personal auth', () => {
    const model = resolveModel(
      PREVIEW_GEMINI_MODEL_AUTO,
      false,
      false,
      false,
      true,
      dynamicConfig,
      'stable',
      'gemini-api-key'
    );
    expect(model).toBe(PREVIEW_GEMINI_MODEL);
  });

  it('should resolve auto-gemini-3 to gemini-2.5-pro for oauth-personal auth', () => {
    const model = resolveModel(
      PREVIEW_GEMINI_MODEL_AUTO,
      false,
      false,
      false,
      true,
      dynamicConfig,
      'stable',
      'oauth-personal'
    );
    expect(model).toBe(DEFAULT_GEMINI_MODEL);
  });

  it('should use authType from config if not passed explicitly', () => {
    const configWithAuth = {
      ...dynamicConfig,
      getAuthType: () => 'oauth-personal',
    } as unknown as ModelCapabilityContext;

    const model = resolveModel(
      PREVIEW_GEMINI_MODEL_AUTO,
      false,
      false,
      false,
      true,
      configWithAuth
    );
    expect(model).toBe(DEFAULT_GEMINI_MODEL);
  });
});
