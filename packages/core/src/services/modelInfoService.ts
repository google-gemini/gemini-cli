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
  private googleGenAI: GoogleGenAI;
  private readonly thinkingSupportCache = new Map<string, Promise<boolean>>();

  constructor(apiKey?: string, vertexai?: boolean) {
    this.googleGenAI = new GoogleGenAI({ apiKey, vertexai });
  }

  isThinkingSupported(modelName: string): Promise<boolean> {
    if (this.thinkingSupportCache.has(modelName)) {
      return this.thinkingSupportCache.get(modelName)!;
    }
    const supportPromise = this._checkThinkingSupport(modelName);
    this.thinkingSupportCache.set(modelName, supportPromise);
    return supportPromise;
  }

  private async _checkThinkingSupport(modelName: string): Promise<boolean> {
    try {
      const model = await this.googleGenAI.models.get({
        model: modelName,
      });
      return !!model?.thinking;
    } catch (error) {
      debugLogger.log(
        'googleGenAI models.get() API call returned error: %s for model=%s',
        error,
        modelName,
      );
    }
    // Default return value false.
    return false;
  }
}
