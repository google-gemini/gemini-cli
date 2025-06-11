/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EmbedContentParameters,
  GenerateContentConfig,
  Part,
  SchemaUnion,
  PartListUnion,
  Content,
  Tool,
  GenerateContentResponse,
} from '@google/genai';
import process from 'node:process';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import { Turn, ServerGeminiStreamEvent, GeminiEventType } from './turn.js';
import { Config } from '../config/config.js';
import { getCoreSystemPrompt } from './prompts.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat } from './geminiChat.js';
import { retryWithBackoff } from '../utils/retry.js';
import { getErrorMessage } from '../utils/errors.js';
import { tokenLimit } from './tokenLimits.js';
import {
  logApiRequest,
  logApiResponse,
  logApiError,
} from '../telemetry/index.js';
import {
  ContentGenerator,
  createContentGenerator,
} from './contentGenerator.js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const proxy =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;

if (proxy) {
  setGlobalDispatcher(new ProxyAgent(proxy));
}

export class GeminiClient {
  private chat: Promise<GeminiChat>;
  private contentGenerator: Promise<ContentGenerator>;
  private model: string;
  private embeddingModel: string;
  private generateContentConfig: GenerateContentConfig = {
    temperature: 0,
    topP: 1,
  };
  private readonly MAX_TURNS = 100;

  constructor(private config: Config) {
    this.contentGenerator = createContentGenerator(
      this.config.getContentGeneratorConfig(),
    );
    this.model = config.getModel();
    this.embeddingModel = config.getEmbeddingModel();
    this.chat = this.startChat();
  }

  async addHistory(content: Content) {
    const chat = await this.chat;
    chat.addHistory(content);
  }

  getChat(): Promise<GeminiChat> {
    return this.chat;
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

  private async startChat(extraHistory?: Content[]): Promise<GeminiChat> {
    const envParts = await this.getEnvironment();
    const toolRegistry = await this.config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations();
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
    const initialHistory: Content[] = [
      {
        role: 'user',
        parts: envParts,
      },
      {
        role: 'model',
        parts: [{ text: 'Got it. Thanks for the context!' }],
      },
    ];
    const history = initialHistory.concat(extraHistory ?? []);
    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);

      return new GeminiChat(
        this.config,
        await this.contentGenerator,
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
      throw new Error(`Failed to initialize chat: ${getErrorMessage(error)}`);
    }
  }

  async *sendMessageStream(
    request: PartListUnion,
    signal: AbortSignal,
    turns: number = this.MAX_TURNS,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    if (!turns) {
      const chat = await this.chat;
      return new Turn(chat);
    }

    const compressed = await this.tryCompressChat();
    if (compressed) {
      yield { type: GeminiEventType.ChatCompressed };
    }
    const chat = await this.chat;
    const turn = new Turn(chat);
    const resultStream = turn.run(request, signal);
    for await (const event of resultStream) {
      yield event;
    }
    if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
      const nextSpeakerCheck = await checkNextSpeaker(chat, this, signal);
      if (nextSpeakerCheck?.next_speaker === 'model') {
        const nextRequest = [{ text: 'Please continue.' }];
        // This recursive call's events will be yielded out, but the final
        // turn object will be from the top-level call.
        yield* this.sendMessageStream(nextRequest, signal, turns - 1);
      }
    }
    return turn;
  }

  private _logApiRequest(model: string, inputTokenCount: number): void {
    logApiRequest(this.config, {
      model,
      input_token_count: inputTokenCount,
      duration_ms: 0, // Duration is not known at request time
    });
  }

  private _logApiResponse(
    model: string,
    durationMs: number,
    attempt: number,
    response: GenerateContentResponse,
  ): void {
    const promptFeedback = response.promptFeedback;
    const finishReason = response.candidates?.[0]?.finishReason;
    let responseError;
    if (promptFeedback?.blockReason) {
      responseError = `Blocked: ${promptFeedback.blockReason}${promptFeedback.blockReasonMessage ? ' - ' + promptFeedback.blockReasonMessage : ''}`;
    } else if (
      finishReason &&
      !['STOP', 'MAX_TOKENS', 'UNSPECIFIED'].includes(finishReason)
    ) {
      responseError = `Finished with reason: ${finishReason}`;
    }

    logApiResponse(this.config, {
      model,
      duration_ms: durationMs,
      attempt,
      status_code: undefined,
      error: responseError,
      output_token_count: response.usageMetadata?.candidatesTokenCount ?? 0,
      cached_content_token_count:
        response.usageMetadata?.cachedContentTokenCount ?? 0,
      thoughts_token_count: response.usageMetadata?.thoughtsTokenCount ?? 0,
      tool_token_count: response.usageMetadata?.toolUsePromptTokenCount ?? 0,
      response_text: getResponseText(response),
    });
  }

  private _logApiError(
    model: string,
    error: unknown,
    durationMs: number,
    attempt: number,
    isAbort: boolean = false,
  ): void {
    let statusCode: number | string | undefined;
    let errorMessage = getErrorMessage(error);

    if (isAbort) {
      errorMessage = 'Request aborted by user';
      statusCode = 'ABORTED'; // Custom S
    } else if (typeof error === 'object' && error !== null) {
      if ('status' in error) {
        statusCode = (error as { status: number | string }).status;
      } else if ('code' in error) {
        statusCode = (error as { code: number | string }).code;
      } else if ('httpStatusCode' in error) {
        statusCode = (error as { httpStatusCode: number | string })
          .httpStatusCode;
      }
    }

    logApiError(this.config, {
      model,
      error: errorMessage,
      status_code: statusCode,
      duration_ms: durationMs,
      attempt,
    });
  }

  async generateJson(
    contents: Content[],
    schema: SchemaUnion,
    abortSignal: AbortSignal,
    model: string = 'gemini-2.0-flash',
    config: GenerateContentConfig = {},
  ): Promise<Record<string, unknown>> {
    const cg = await this.contentGenerator;
    const attempt = 1;
    const startTime = Date.now();
    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);
      const requestConfig = {
        abortSignal,
        ...this.generateContentConfig,
        ...config,
      };

      let inputTokenCount = 0;
      try {
        const { totalTokens } = await cg.countTokens({
          model,
          contents,
        });
        inputTokenCount = totalTokens || 0;
      } catch (_e) {
        console.warn(
          `Failed to count tokens for model ${model}. Proceeding with inputTokenCount = 0. Error: ${getErrorMessage(_e)}`,
        );
        inputTokenCount = 0;
      }

      this._logApiRequest(model, inputTokenCount);

      const apiCall = () =>
        cg.generateContent({
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
      const durationMs = Date.now() - startTime;

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
        this._logApiError(model, error, durationMs, attempt);
        throw error;
      }
      try {
        const parsedJson = JSON.parse(text);
        this._logApiResponse(model, durationMs, attempt, result);
        return parsedJson;
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
        this._logApiError(model, parseError, durationMs, attempt);
        throw new Error(
          `Failed to parse API response as JSON: ${getErrorMessage(parseError)}`,
        );
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      if (abortSignal.aborted) {
        this._logApiError(model, error, durationMs, attempt, true);
        throw error;
      }

      // Avoid double reporting for the empty response case handled above
      if (
        error instanceof Error &&
        error.message === 'API returned an empty response for generateJson.'
      ) {
        throw error;
      }
      this._logApiError(model, error, durationMs, attempt);

      await reportError(
        error,
        'Error generating JSON content via API.',
        contents,
        'generateJson-api',
      );
      throw new Error(
        `Failed to generate JSON content: ${getErrorMessage(error)}`,
      );
    }
  }

  async generateContent(
    contents: Content[],
    generationConfig: GenerateContentConfig,
    abortSignal: AbortSignal,
  ): Promise<GenerateContentResponse> {
    const cg = await this.contentGenerator;
    const modelToUse = this.model;
    const configToUse: GenerateContentConfig = {
      ...this.generateContentConfig,
      ...generationConfig,
    };
    const attempt = 1;
    const startTime = Date.now();

    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);

      const requestConfig = {
        abortSignal,
        ...configToUse,
        systemInstruction,
      };

      let inputTokenCount = 0;
      try {
        const { totalTokens } = await cg.countTokens({
          model: modelToUse,
          contents,
        });
        inputTokenCount = totalTokens || 0;
      } catch (_e) {
        console.warn(
          `Failed to count tokens for model ${modelToUse}. Proceeding with inputTokenCount = 0. Error: ${getErrorMessage(_e)}`,
        );
        inputTokenCount = 0;
      }

      this._logApiRequest(modelToUse, inputTokenCount);

      const apiCall = () =>
        cg.generateContent({
          model: modelToUse,
          config: requestConfig,
          contents,
        });

      const result = await retryWithBackoff(apiCall);
      console.log(
        'Raw API Response in client.ts:',
        JSON.stringify(result, null, 2),
      );
      const durationMs = Date.now() - startTime;
      this._logApiResponse(modelToUse, durationMs, attempt, result);
      return result;
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      if (abortSignal.aborted) {
        this._logApiError(modelToUse, error, durationMs, attempt, true);
        throw error;
      }

      this._logApiError(modelToUse, error, durationMs, attempt);

      await reportError(
        error,
        `Error generating content via API with model ${modelToUse}.`,
        {
          requestContents: contents,
          requestConfig: configToUse,
        },
        'generateContent-api',
      );
      throw new Error(
        `Failed to generate content with model ${modelToUse}: ${getErrorMessage(error)}`,
      );
    }
  }

  async generateEmbedding(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }
    const embedModelParams: EmbedContentParameters = {
      model: this.embeddingModel,
      contents: texts,
    };

    const cg = await this.contentGenerator;
    const embedContentResponse = await cg.embedContent(embedModelParams);
    if (
      !embedContentResponse.embeddings ||
      embedContentResponse.embeddings.length === 0
    ) {
      throw new Error('No embeddings found in API response.');
    }

    if (embedContentResponse.embeddings.length !== texts.length) {
      throw new Error(
        `API returned a mismatched number of embeddings. Expected ${texts.length}, got ${embedContentResponse.embeddings.length}.`,
      );
    }

    return embedContentResponse.embeddings.map((embedding, index) => {
      const values = embedding.values;
      if (!values || values.length === 0) {
        throw new Error(
          `API returned an empty embedding for input text at index ${index}: "${texts[index]}"`,
        );
      }
      return values;
    });
  }

  private async tryCompressChat(): Promise<boolean> {
    const chat = await this.chat;
    const history = chat.getHistory(true); // Get curated history

    const cg = await this.contentGenerator;
    const { totalTokens } = await cg.countTokens({
      model: this.model,
      contents: history,
    });

    if (totalTokens === undefined) {
      // If token count is undefined, we can't determine if we need to compress.
      console.warn(
        `Could not determine token count for model ${this.model}. Skipping compression check.`,
      );
      return false;
    }
    const tokenCount = totalTokens; // Now guaranteed to be a number

    const limit = tokenLimit(this.model);
    if (!limit) {
      // If no limit is defined for the model, we can't compress.
      console.warn(
        `No token limit defined for model ${this.model}. Skipping compression check.`,
      );
      return false;
    }

    if (tokenCount < 0.95 * limit) {
      return false;
    }
    const summarizationRequestMessage = {
      text: 'Summarize our conversation up to this point. The summary should be a concise yet comprehensive overview of all key topics, questions, answers, and important details discussed. This summary will replace the current chat history to conserve tokens, so it must capture everything essential to understand the context and continue our conversation effectively as if no information was lost.',
    };
    const response = await chat.sendMessage({
      message: summarizationRequestMessage,
    });
    this.chat = this.startChat([
      {
        role: 'user',
        parts: [summarizationRequestMessage],
      },
      {
        role: 'model',
        parts: [{ text: response.text }],
      },
    ]);

    return true;
  }
}
