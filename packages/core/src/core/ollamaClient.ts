/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ollama } from 'ollama';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Content } from './ollamaChat.js';
import * as fs from 'node:fs/promises';

/**
 * A client for making single, non-streaming calls to an Ollama-compatible API
 * and expecting a JSON response.
 */
export class OllamaClient {
  private readonly ollama: Ollama;
  private readonly model: string;

  constructor(config: Config) {
    const useGemmaRoutingSettings = config.getUseGemmaRoutingSettings();
    const host = useGemmaRoutingSettings?.host || 'http://localhost:11434';
    this.ollama = new Ollama({ host });
    this.model = useGemmaRoutingSettings?.model || 'gemma';
  }

  /**
   * Converts an internal `Content` object to the format expected by the
   * Ollama library's `chat` method.
   */
  private toOllamaMessage(content: Content) {
    const text = content.parts.map((part) => part.text).join('');
    return {
      // Ollama uses 'assistant' for the model's role.
      role: content.role === 'model' ? 'assistant' : content.role,
      content: text,
    };
  }

  /**
   * Sends a prompt to the Ollama model and expects a JSON object in response.
   * @param contents The history and current prompt.
   * @param systemInstruction The system prompt.
   * @returns A promise that resolves to the parsed JSON object.
   */
  async generateJson(
    contents: Content[],
    systemInstruction: string,
  ): Promise<object> {
    const messages = contents.map(this.toOllamaMessage);
    if (systemInstruction) {
      // messages.unshift({
      //   role: 'system',
      //   content: systemInstruction,
      // });

      // Gemma forgets the system instruction if there's too much content.
      // Prepend the system instruction to the user query.
      if (messages.length > 1) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage) {
          lastMessage.content =
            systemInstruction + '\n\n' + lastMessage.content;
        }
      }
    }

    let fileContent = '';
    for (const message of messages) {
      fileContent += `${message.role} -----\n${message.content}\n`;
    }

    // Save the router prompt to a file for debugging.
    void (async () => {
      try {
        await fs.writeFile('router.txt', fileContent);
        debugLogger.log('[DEBUG] Router Prompt saved to router.txt');
      } catch (error) {
        debugLogger.error(
          '[DEBUG] Failed to save router prompt to router.txt:',
          error,
        );
      }
    })();

    debugLogger.log(`[OllamaClient] Sending request to model: ${this.model}`);

    const response = await this.ollama.chat({
      model: this.model,
      messages,
      stream: false, // Ensure non-streaming response
      format: 'json', // Request JSON output
    });

    const responseContent = response.message.content;
    debugLogger.log('[OllamaClient] Received response:', responseContent);

    try {
      // The response content should be a JSON string.
      return JSON.parse(responseContent);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      debugLogger.error(
        `[OllamaClient] Failed to parse JSON response:`,
        responseContent,
      );
      throw new Error('Invalid JSON response from Ollama model');
    }
  }
}
