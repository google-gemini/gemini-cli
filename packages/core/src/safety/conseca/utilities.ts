/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../../config/config.js';
import { DEFAULT_GEMINI_FLASH_LITE_MODEL } from '../../config/models.js';
import { AuthType } from '../../core/contentGenerator.js';
import { GeminiClient } from '../../core/client.js';

export async function getGeminiClient(
  modelName: string = DEFAULT_GEMINI_FLASH_LITE_MODEL,
): Promise<GeminiClient> {
  // We need a temporary, isolated config for the internal LLM call.
  const tempConfig = new Config({
    model: modelName,
    targetDir: '.',
    sessionId: 'temp-conseca-session',
    debugMode: false,
    cwd: '.',
    modelConfigServiceConfig: {
      overrides: [
        {
          match: { model: modelName },
          modelConfig: {
            generateContentConfig: {
              responseMimeType: 'application/json',
            },
          },
        },
      ],
    },
  });
  await tempConfig.initialize();
  await tempConfig.refreshAuth(AuthType.USE_GEMINI);
  return new GeminiClient(tempConfig);
}
