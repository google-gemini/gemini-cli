/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Content } from '@google/genai';

/**
 * A client for making single, non-streaming calls to a local Gemini-compatible API
 * and expecting a JSON response.
 */
export class LocalLiteRtLmClient {
  private readonly host: string;
  private readonly model: string;
  private readonly client: GoogleGenAI;

  constructor(config: Config) {
    const gemmaModelRouterSettings = config.getGemmaModelRouterSettings();
    this.host = gemmaModelRouterSettings.classifier!.host!;
    this.model = gemmaModelRouterSettings.classifier!.model!;

    this.client = new GoogleGenAI({
      // The LiteRT-LM server does not require an API key, but the SDK requires one to be set even for local endpoints. This is a dummy value and is not used for authentication.
      apiKey: 'no-api-key-needed',
      httpOptions: {
        baseUrl: this.host,
        // If the LiteRT-LM server is started but the wrong port is set, there will be a lengthy TCP timeout (here fixed to be 10 seconds).
        // If the LiteRT-LM server is not started, there will be an immediate connection refusal.
        // If the LiteRT-LM server is started and the model is unsupported or not downloaded, the server will return an error immediately.
        // If the model's context window is exceeded, the server will return an error immediately.
        timeout: 10000,
      },
    });
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
    abortSignal?: AbortSignal,
  ): Promise<object> {
    const geminiContents = contents.map((c) => ({
      role: c.role,
      parts: c.parts ? c.parts.map((p) => ({ text: p.text })) : [],
    }));

    if (reminder) {
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
          abortSignal,
        },
      });

      const text = result.text;
      if (!text) {
        throw new Error(
          'Invalid response from Local Gemini API: No text found',
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(result.text);
    } catch (error) {
      debugLogger.error(
        `[LocalLiteRtLmClient] Failed to generate content:`,
        error,
      );
      throw error;
    }
  }
}
