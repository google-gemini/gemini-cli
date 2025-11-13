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

  constructor(apiKey?: string, vertexai?: boolean) {
    this.googleGenAI = new GoogleGenAI({ apiKey, vertexai });
  }

  async isThinkingSupported(modelName: string): Promise<boolean> {
    try {
      const model = await this.googleGenAI.models.get({ model: modelName });
      console.log('asdf');
      console.log(model);
    } catch (e) {
      debugLogger.debug('Failed to get model information, %s', e);
    }

    return false;
    // return model?.thi/nking ?? false;
  }
}
