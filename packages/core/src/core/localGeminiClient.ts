/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';
import { jsonrepair } from 'jsonrepair';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Content } from '@google/genai';
import * as fs from 'node:fs/promises';

/**
 * A client for making single, non-streaming calls to a local Gemini-compatible API
 * and expecting a JSON response.
 */
export class LocalGeminiClient {
  private readonly host: string;
  private readonly model: string;
  private readonly client: GoogleGenAI;

  constructor(config: Config) {
    const gemmaModelRouterSettings = config.getGemmaModelRouterSettings();
    this.host =
      gemmaModelRouterSettings?.classifier?.host || 'http://localhost:3000';
    this.model = gemmaModelRouterSettings?.classifier?.model || 'gemma3:1b';

    if (!this.model.toLowerCase().startsWith('gemma')) {
      throw new Error(
        `Invalid model name: ${this.model}. Model name must start with "Gemma" (case-insensitive).`,
      );
    }

    this.client = new GoogleGenAI({
      apiKey: 'no-api-key-needed',
      httpOptions: {
        baseUrl: this.host,
      },
    });
  }

  private _cleanLlmResponseText(response_text: string): string {
    // 1. Robust Markdown Extraction
    // Uses regex to find content inside ```...``` blocks, ignoring case and language tags.
    const match = response_text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    let cleanedText = match ? match[1].trim() : response_text.trim();

    // 2. Fix Smart Quotes
    cleanedText = cleanedText
      .replace(/“/g, '"')
      .replace(/”/g, '"')
      .replace(/‘/g, "'")
      .replace(/’/g, "'");

    // 3. Repair JSON
    return jsonrepair(cleanedText);
  }

  private async _debugRouterCall(
    systemInstruction: string,
    contents: Content[],
    modelResponse?: string,
  ) {
    let routerContent = `system =====\n${systemInstruction}\n\n`;
    for (const content of contents) {
      routerContent += `${content.role} =====\n\n`;
      for (const part of content.parts || []) {
        if (part.text) {
          routerContent += `${part.text}\n`;
        }
      }
    }

    if (modelResponse) {
      routerContent += `model =====\n${modelResponse}`;
    }

    await fs.writeFile('router.txt', routerContent);
    debugLogger.log(`[LocalGeminiClient] Wrote router content to router.txt`);
  }

  /**
   * Sends a prompt to the local Gemini model and expects a JSON object in response.
   * @param contents The history and current prompt.
   * @param systemInstruction The system prompt.
   * @returns A promise that resolves to the parsed JSON object.
   */
  async generateJson(
    contents: Content[],
    systemInstruction: string,
    reminder?: string,
  ): Promise<object> {
    debugLogger.log(
      `[LocalGeminiClient] Sending request to ${this.host} for model ${this.model}`,
    );

    const geminiContents = contents.map((c) => ({
      role: c.role === 'model' ? 'model' : 'user',
      parts: c.parts ? c.parts.map((p) => ({ text: p.text })) : [],
    }));

    if (reminder) {
      debugLogger.log(
        `[LocalGeminiClient] Appending reminder to last user content: ${reminder}`,
      );
      const lastContent = geminiContents.at(-1);
      if (lastContent?.role === 'user' && lastContent.parts?.[0]?.text) {
        lastContent.parts[0].text += `\n\n${reminder}`;
      }
    }

    try {
      const result = await this.client.models.generateContent({
        model: this.model,
        contents: geminiContents,
        config: {
          responseMimeType: 'application/json',
          systemInstruction: systemInstruction
            ? { parts: [{ text: systemInstruction }] }
            : undefined,
          temperature: 0,
          maxOutputTokens: 256,
        },
      });

      await this._debugRouterCall(systemInstruction, geminiContents);

      const text = result.text;
      if (!text) {
        throw new Error(
          'Invalid response from Local Gemini API: No text found',
        );
      }

      await this._debugRouterCall(systemInstruction, geminiContents, text);

      const cleanedText = this._cleanLlmResponseText(text);
      debugLogger.log(
        `[LocalGeminiClient] Cleaned JSON response: ${cleanedText}`,
      );
      return JSON.parse(cleanedText);
    } catch (error) {
      debugLogger.error(
        `[LocalGeminiClient] Failed to generate content:`,
        error,
      );
      throw error;
    }
  }
}
