/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentConfig,
  GoogleGenAI,
  Part,
  SchemaUnion,
  PartListUnion,
  Content,
  Tool,
  GenerateContentResponse,
} from '@google/genai';
import process from 'node:process';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import { Turn, ServerGeminiStreamEvent } from './turn.js';
import { Config } from '../config/config.js';
import { getCoreSystemPrompt } from './prompts.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat } from './geminiChat.js';
import { retryWithBackoff } from '../utils/retry.js';

export class GeminiClient {
  private client: GoogleGenAI;
  private model: string;
  private generateContentConfig: GenerateContentConfig = {
    temperature: 0,
    topP: 1,
  };
  private readonly MAX_TURNS = 100;

  constructor(private config: Config) {
    const userAgent = config.getUserAgent();
    const apiKeyFromConfig = config.getApiKey();
    const vertexaiFlag = config.getVertexAI();

    this.client = new GoogleGenAI({
      apiKey: apiKeyFromConfig === '' ? undefined : apiKeyFromConfig,
      vertexai: vertexaiFlag,
      httpOptions: {
        headers: {
          'User-Agent': userAgent,
        },
      },
    });
    this.model = config.getModel();
  }

  private async getEnvironment(): Promise<Part[]> {
    const cwd = process.cwd();
    const today = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const platform = process.platform;
    const folderStructure = await getFolderStructure(cwd);
    const context = `
  Okay, just setting up the context for our chat.
  Today is ${today}.
  My operating system is: ${platform}
  I'm currently working in the directory: ${cwd}
  ${folderStructure}
          `.trim();

    const initialParts: Part[] = [{ text: context }];
    const toolRegistry = await this.config.getToolRegistry();

    // Add full file context if the flag is set
    if (this.config.getFullContext()) {
      try {
        const readManyFilesTool = toolRegistry.getTool(
          'read_many_files',
        ) as ReadManyFilesTool;
        if (readManyFilesTool) {
          // Read all files in the target directory
          const result = await readManyFilesTool.execute(
            {
              paths: ['**/*'], // Read everything recursively
              useDefaultExcludes: true, // Use default excludes
            },
            AbortSignal.timeout(30000),
          );
          if (result.llmContent) {
            initialParts.push({
              text: `\n--- Full File Context ---\n${result.llmContent}`,
            });
          } else {
            console.warn(
              'Full context requested, but read_many_files returned no content.',
            );
          }
        } else {
          console.warn(
            'Full context requested, but read_many_files tool not found.',
          );
        }
      } catch (error) {
        // Not using reportError here as it's a startup/config phase, not a chat/generation phase error.
        console.error('Error reading full file context:', error);
        initialParts.push({
          text: '\n--- Error reading full file context ---',
        });
      }
    }

    return initialParts;
  }

  async startChat(): Promise<GeminiChat> {
    const envParts = await this.getEnvironment();
    const toolRegistry = await this.config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations();
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
    const history: Content[] = [
      {
        role: 'user',
        parts: envParts,
      },
      {
        role: 'model',
        parts: [{ text: 'Got it. Thanks for the context!' }],
      },
    ];
    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);

      return new GeminiChat(
        this.client,
        this.client.models,
        this.model,
        {
          systemInstruction,
          ...this.generateContentConfig,
          tools,
        },
        history,
      );
    } catch (error) {
      await reportError(
        error,
        'Error initializing Gemini chat session.',
        history,
        'startChat',
      );
      const message = error instanceof Error ? error.message : 'Unknown error.';
      throw new Error(`Failed to initialize chat: ${message}`);
    }
  }

  async *sendMessageStream(
    chat: GeminiChat,
    request: PartListUnion,
    signal: AbortSignal,
    turns: number = this.MAX_TURNS,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    if (!turns) {
      return;
    }

    const turn = new Turn(chat);
    const resultStream = turn.run(request, signal);
    for await (const event of resultStream) {
      yield event;
    }
    if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
      const nextSpeakerCheck = await checkNextSpeaker(chat, this, signal);
      if (nextSpeakerCheck?.next_speaker === 'model') {
        const nextRequest = [{ text: 'Please continue.' }];
        yield* this.sendMessageStream(chat, nextRequest, signal, turns - 1);
      }
    }
  }

  async generateJson(
    contents: Content[],
    schema: SchemaUnion,
    abortSignal: AbortSignal,
    model: string = 'gemini-2.0-flash',
    config: GenerateContentConfig = {},
  ): Promise<Record<string, unknown>> {
    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);
      const requestConfig = {
        abortSignal,
        ...this.generateContentConfig,
        ...config,
      };

      const apiCall = () =>
        this.client.models.generateContent({
          model,
          config: {
            ...requestConfig,
            systemInstruction,
            responseSchema: schema,
            responseMimeType: 'application/json',
          },
          contents,
        });

      const result = await retryWithBackoff(apiCall);

      const text = getResponseText(result);
      if (!text) {
        const error = new Error(
          'API returned an empty response for generateJson.',
        );
        await reportError(
          error,
          'Error in generateJson: API returned an empty response.',
          contents,
          'generateJson-empty-response',
        );
        throw error;
      }
      try {
        return JSON.parse(text);
      } catch (parseError) {
        await reportError(
          parseError,
          'Failed to parse JSON response from generateJson.',
          {
            responseTextFailedToParse: text,
            originalRequestContents: contents,
          },
          'generateJson-parse',
        );
        throw new Error(
          `Failed to parse API response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        );
      }
    } catch (error) {
      if (abortSignal.aborted) {
        // Regular cancellation error, fail normally
        throw error;
      }

      // Avoid double reporting for the empty response case handled above
      if (
        error instanceof Error &&
        error.message === 'API returned an empty response for generateJson.'
      ) {
        throw error;
      }
      await reportError(
        error,
        'Error generating JSON content via API.',
        contents,
        'generateJson-api',
      );
      const message =
        error instanceof Error ? error.message : 'Unknown API error.';
      throw new Error(`Failed to generate JSON content: ${message}`);
    }
  }

  async generateContent(
    contents: Content[],
    generationConfig: GenerateContentConfig,
    abortSignal: AbortSignal,
  ): Promise<GenerateContentResponse> {
    const modelToUse = this.model;
    const configToUse: GenerateContentConfig = {
      ...this.generateContentConfig,
      ...generationConfig,
    };

    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);

      const requestConfig = {
        abortSignal,
        ...configToUse,
        systemInstruction,
      };

      const apiCall = () =>
        this.client.models.generateContent({
          model: modelToUse,
          config: requestConfig,
          contents,
        });

      const result = await retryWithBackoff(apiCall);
      return result;
    } catch (error) {
      if (abortSignal.aborted) {
        throw error;
      }

      await reportError(
        error,
        `Error generating content via API with model ${modelToUse}.`,
        {
          requestContents: contents,
          requestConfig: configToUse,
        },
        'generateContent-api',
      );
      const message =
        error instanceof Error ? error.message : 'Unknown API error.';
      throw new Error(
        `Failed to generate content with model ${modelToUse}: ${message}`,
      );
    }
  }
}
