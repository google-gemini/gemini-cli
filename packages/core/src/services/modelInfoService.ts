/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';

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
    // Ideally, we should use models.get() API call, but the returned Model object doesn't contain thinking bool.
    //   const model = await this.googleGenAI.models.get({ model: modelName });
    //   return model?.thinking;
    // As a workaround, we are going to try and call generateContent with thinking budget set.
    // If the model doesn't have thinking capability, it should return an error.
    const contents = [{ role: 'user', parts: [{ text: 'Test prompt.' }] }];
    const config = {
      thinkingConfig: {
        thinkingBudget: 1, // Attempt to use thinking
      },
    };

    try {
      // Attempt to generate content with thinkingConfig
      await this.googleGenAI.models.generateContent({
        model: modelName,
        contents,
        config,
      });
      return true;
    } catch (error) {
      // A failure with 'thinkingConfig' likely reason indicates no support.
      // If the error is unrelated to thinking, false is still a better default to return.
      console.log(
        'GenerateContent returned error: %s when called with thinkingConfig set.',
        error,
      );
      return false;
    }
  }
}
