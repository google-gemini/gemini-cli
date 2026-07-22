/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_GEMINI_3_5_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_ALIAS_AUTO,
} from '@google/gemini-cli-core';
import { buildAvailableModels } from './acpUtils.js';
import type { Config } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    getModel: () => GEMINI_MODEL_ALIAS_AUTO,
    getHasAccessToPreviewModel: () => false,
    getGemini31LaunchedSync: () => false,
    hasGemini35FlashGAAccess: () => false,
    getExperimentalDynamicModelConfiguration: () => false,
    ...overrides,
  } as unknown as Config;
}

function makeSettings(
  overrides: Partial<LoadedSettings['merged']> = {},
): LoadedSettings {
  return {
    merged: {
      security: { auth: { selectedType: undefined } },
      ...overrides,
    },
  } as unknown as LoadedSettings;
}

describe('buildAvailableModels (legacy path)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('always includes gemini-3.5-flash when it differs from DEFAULT_GEMINI_FLASH_MODEL (issue #28483)', () => {
    const config = makeConfig();
    const settings = makeSettings();

    const { availableModels } = buildAvailableModels(config, settings);

    const modelIds = availableModels.map((m) => m.modelId);

    // gemini-3.5-flash must be present so users can select it manually
    expect(modelIds).toContain(DEFAULT_GEMINI_3_5_FLASH_MODEL);
  });

  it('does not duplicate gemini-3.5-flash when it is already the default flash model', () => {
    // Simulate state after setFlashModels has promoted 3.5-flash to default.
    // DEFAULT_GEMINI_FLASH_MODEL becomes 'gemini-3.5-flash' at runtime;
    // the dedup logic should skip the explicit entry in that case.
    const config = makeConfig({
      hasGemini35FlashGAAccess: () => true,
    });
    const settings = makeSettings();

    const { availableModels } = buildAvailableModels(config, settings);

    const flash35Count = availableModels.filter(
      (m) => m.modelId === DEFAULT_GEMINI_3_5_FLASH_MODEL,
    ).length;

    expect(flash35Count).toBeLessThanOrEqual(1);
  });

  it('includes auto, pro, flash, and flash-lite options in the base case', () => {
    const config = makeConfig();
    const settings = makeSettings();

    const { availableModels } = buildAvailableModels(config, settings);
    const modelIds = availableModels.map((m) => m.modelId);

    expect(modelIds).toContain(GEMINI_MODEL_ALIAS_AUTO);
    expect(modelIds).toContain(DEFAULT_GEMINI_MODEL);
    expect(modelIds).toContain(DEFAULT_GEMINI_FLASH_MODEL);
    expect(modelIds).toContain(DEFAULT_GEMINI_FLASH_LITE_MODEL);
  });
});
