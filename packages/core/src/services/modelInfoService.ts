/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';
import { debugLogger } from '../utils/debugLogger.js';

// Define a simple interface for the model information we need.
export interface ModelInfo {
  name: string;
  thinking?: boolean;
}

export class ModelInfoService {
  private modelInfoCache: Map<string, ModelInfo> = new Map();
  private googleGenAI: GoogleGenAI;

  constructor(apiKey?: string, vertexai?: boolean) {
    this.googleGenAI = new GoogleGenAI({ apiKey, vertexai });
  }

  async listModels(): Promise<Map<string, ModelInfo>> {
    if (this.modelInfoCache.size > 0) {
      return this.modelInfoCache;
    }

    try {
      // @ts-expect-error listModels is not in the public API but it works
      const models = await this.googleGenAI.listModels();
      for (const model of models) {
        this.modelInfoCache.set(model.name, {
          name: model.name,
          thinking: model.thinking,
        });
      }
    } catch (e) {
      debugLogger.log('Failed to fetch model list from API', e);
    }

    return this.modelInfoCache;
  }

  async isThinkingSupported(modelName: string): Promise<boolean> {
    const models = await this.listModels();
    const model = models.get('models/' + modelName);
    return model?.thinking ?? false;
  }
}
