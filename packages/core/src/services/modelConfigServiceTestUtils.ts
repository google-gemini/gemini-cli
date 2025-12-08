/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ResolvedModelConfig } from '../services/modelConfigService.js';

/**
 * Creates a ResolvedModelConfig with sensible defaults, allowing overrides.
 */
export const makeResolvedModelConfig = (
  model: string,
  overrides: Partial<ResolvedModelConfig['generateContentConfig']> = {},
): ResolvedModelConfig =>
  ({
    model,
    generateContentConfig: {
      temperature: 0,
      topP: 1,
      ...overrides,
    },
  }) as ResolvedModelConfig;
