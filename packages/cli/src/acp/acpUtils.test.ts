/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  AuthType,
  type Config,
  DEFAULT_MODEL_CONFIGS,
  GEMINI_4_ARGON_MODEL,
  GEMINI_MODEL_ALIAS_AUTO,
  ModelConfigService,
  PREVIEW_GEMINI_MODEL,
} from '@google/gemini-cli-core';
import { createMockSettings } from '../test-utils/settings.js';
import { buildAvailableModels } from './acpUtils.js';

describe('buildAvailableModels', () => {
  it.each([
    { authType: AuthType.LOGIN_WITH_GOOGLE, dynamic: false },
    { authType: AuthType.USE_GEMINI, dynamic: false },
    { authType: AuthType.USE_VERTEX_AI, dynamic: false },
    { authType: AuthType.LOGIN_WITH_GOOGLE, dynamic: true },
  ])(
    'offers Argon without preview access (auth: $authType, dynamic: $dynamic)',
    ({ authType, dynamic }) => {
      const config = {
        getModel: vi.fn().mockReturnValue(GEMINI_4_ARGON_MODEL),
        getHasAccessToPreviewModel: vi.fn().mockReturnValue(false),
        getExperimentalDynamicModelConfiguration: () => dynamic,
        getModelConfigService: () =>
          new ModelConfigService(DEFAULT_MODEL_CONFIGS),
      } as unknown as Config;
      const settings = createMockSettings({
        security: { auth: { selectedType: authType } },
      });

      const result = buildAvailableModels(config, settings);

      expect(result.currentModelId).toBe(GEMINI_4_ARGON_MODEL);
      expect(
        result.availableModels.filter(
          (model) => model.modelId === GEMINI_4_ARGON_MODEL,
        ),
      ).toEqual([
        expect.objectContaining({
          modelId: GEMINI_4_ARGON_MODEL,
          name: 'Gemini 4 Argon',
        }),
      ]);
      expect(result.availableModels).not.toContainEqual(
        expect.objectContaining({ modelId: PREVIEW_GEMINI_MODEL }),
      );

      // Listing a new explicit model does not change the default selection.
      vi.mocked(config.getModel).mockReturnValue('');
      expect(buildAvailableModels(config, settings).currentModelId).toBe(
        GEMINI_MODEL_ALIAS_AUTO,
      );
    },
  );
});
