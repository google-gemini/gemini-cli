/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ModelConfigService } from './modelConfigService.js';
import {
  PREVIEW_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
} from '../config/modelConstants.js';

describe('ModelConfigService Family-Aware Overrides', () => {
  const service = new ModelConfigService({
    aliases: {
      classifier: {
        modelConfig: {
          model: DEFAULT_GEMINI_FLASH_LITE_MODEL,
        },
      },
      'summarizer-default': {
        modelConfig: {
          model: DEFAULT_GEMINI_FLASH_LITE_MODEL,
        },
      },
    },
  });

  it('should override classifier to Gemini 3 Flash when active model is Gemini 3', () => {
    const resolved = service.getResolvedConfig(
      { model: 'classifier' },
      PREVIEW_GEMINI_MODEL_AUTO,
    );
    expect(resolved.model).toBe(PREVIEW_GEMINI_FLASH_MODEL);
  });

  it('should NOT override classifier when active model is Gemini 2.5', () => {
    const resolved = service.getResolvedConfig(
      { model: 'classifier' },
      'gemini-2.5-pro',
    );
    expect(resolved.model).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
  });

  it('should override summarizer-default to Gemini 3 Flash when active model is Gemini 3', () => {
    const resolved = service.getResolvedConfig(
      { model: 'summarizer-default' },
      PREVIEW_GEMINI_MODEL_AUTO,
    );
    expect(resolved.model).toBe(PREVIEW_GEMINI_FLASH_MODEL);
  });
});
