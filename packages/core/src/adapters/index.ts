/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeepseekContentGenerator } from './deepseekContentGenerator.js';
import { type ContentGenerator, type ContentGeneratorConfig, type AuthType } from '../core/contentGenerator.js';

export function createCustomContentGenerator(authType: AuthType, config: ContentGeneratorConfig): ContentGenerator {
  // Use string literals to avoid circular dependency with enum values
  switch (authType) {
    case 'deepseek':
      return new DeepseekContentGenerator(config);
    default:
      throw new Error(`No content generator available for auth type: ${authType}`);
  }
}

