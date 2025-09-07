/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// DISCLAIMER: This is a copied version of https://github.com/googleapis/js-genai/blob/main/src/chats.ts with the intention of working around a key bug
// where function responses are not treated as "valid" responses: https://b.corp.google.com/issues/420354090

import type {
  GenerateContentResponse,
  Content,
  GenerateContentConfig,
  SendMessageParameters,
  Part,
  Tool,
} from '@google/genai';
import { toParts } from '../code_assist/converter.js';
import { createUserContent } from '@google/genai';
import { retryWithBackoff } from '../utils/retry.js';
import type { Config } from '../config/config.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { hasCycleInSchema } from '../tools/tools.js';
import type { StructuredError } from './turn.js';
import type { CompletedToolCall } from './coreToolScheduler.js';
import {
  logContentRetry,
  logContentRetryFailure,
  logInvalidChunk,
} from '../telemetry/loggers.js';
import { ChatRecordingService } from '../services/chatRecordingService.js';
import {
  ContentRetryEvent,
  ContentRetryFailureEvent,
  InvalidChunkEvent,
} from '../telemetry/types.js';
import { handleFallback } from '../fallback/handler.js';
import { isFunctionResponse } from '../utils/messageInspectors.js';
import { partListUnionToString } from './geminiRequest.js';

export enum StreamEventType {
  /** A regular content chunk from the API. */
  CHUNK = 'chunk',
  /** A signal that a retry is about to happen. The UI should discard any partial
   * content from the attempt that just failed. */
  RETRY = 'retry',
}

export type StreamEvent =
  | { type: StreamEventType.CHUNK; value: GenerateContentResponse }
  | { type: StreamEventType.RETRY };

/**
 * Options for retrying due to invalid content from the model.
 */
interface ContentRetryOptions {
  /** Total number of attempts to make (1 initial + N retries). */
  maxAttempts: number;
  /** The base delay in milliseconds for linear backoff. */
  initialDelayMs: number;
}

const INVALID_CONTENT_RETRY_OPTIONS: ContentRetryOptions = {
  maxAttempts: 3, // 1 initial call + 2 retries
  initialDelayMs: 500,
};

/**
 * Returns true if the response is valid, false otherwise.
 */
function isValidResponse(response: GenerateContentResponse): boolean {
  if (response.candidates === undefined || response.candidates.length === 0) {
    return false;
  }
  const content = response.candidates[0]?.content;
  if (content === undefined) {
    return false;
  }
  return isValidContent(content);
}

function isValidContent(content: Content): boolean {
  if (content.parts === undefined || content.parts.length === 0) {
    return false;
  }
  for (const part of content.parts) {
    if (part === undefined || Object.keys(part).length === 0) {
      return false;
    }
    if (!part.thought && part.text !== undefined && part.text === '') {
      return false;
    }
  }
  return true;
}

/**
 * Validates the history contains the correct roles.
 *
 * @throws Error if the history does not start with a user turn.
 * @throws Error if the history contains an invalid role.
 */
function validateHistory(history: Content[]) {
  for (const content of history) {
    if (content.role !== 'user' && content.role !== 'model') {
      throw new Error(`Role must be user or model, but got ${content.role}.`);
    }
  }
}

/**
 * Extracts the curated (valid) history from a comprehensive history.
 *
 * @remarks
 * The model may sometimes generate invalid or empty contents(e.g., due to safety
 * filters or recitation). Extracting valid turns from the history
 * ensures that subsequent requests could be accepted by the model.
 */
function extractCuratedHistory(comprehensiveHistory: Content[]): Content[] {
  if (comprehensiveHistory === undefined || comprehensiveHistory.length === 0) {
    return [];
  }
  const curatedHistory: Content[] = [];
  const length = comprehensiveHistory.length;
  let i = 0;
  while (i < length) {
    if (comprehensiveHistory[i].role === 'user') {
      curatedHistory.push(comprehensiveHistory[i]);
      i++;
    } else {
      const modelOutput: Content[] = [];
      let isValid = true;
      while (i < length && comprehensiveHistory[i].role === 'model') {
        modelOutput.push(comprehensiveHistory[i]);
        if (isValid && !isValidContent(comprehensiveHistory[i])) {
          isValid = false;
        }
        i++;
      }
      if (isValid) {
        curatedHistory.push(...modelOutput);
      }
    }
  }
  return curatedHistory;
}

/**
 * Custom error to signal that a stream completed without valid content,
 * which should trigger a retry.
 */
export class EmptyStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyStreamError';
  }
}

/**
 * Chat session that enables sending messages to the model with previous
 * conversation context.
 *
 * @remarks
 * The session maintains all the turns between user and model.
 */
export class GeminiChat {
  // A promise to represent the current state of the message being sent to the
  // model.
  private sendPromise: Promise<void> = Promise.resolve();
  private readonly chatRecordingService: ChatRecordingService;

  constructor(
    private readonly config: Config,
    private readonly generationConfig: GenerateContentConfig = {},
    private history: Content[] = [],
  ) {
    validateHistory(history);
    this.chatRecordingService = new ChatRecordingService(config);
    this.chatRecordingService.initialize();
  }

  setSystemInstruction(sysInstr: string) {
    this.generationConfig.systemInstruction = sysInstr;
  }
  /**
   * Sends a message to the model and returns the response.
   *
   * @remarks
   * This method will wait for the previous message to be processed before
   * sending the next message.
   *
   * @see {@link Chat#sendMessageStream} for streaming method.
   * @param params - parameters for sending messages within a chat session.
   * @returns The model's response.
   *
   * @example
   * ```ts
   * const chat = ai.chats.create({model: 'gemini-2.0-flash'});
   * const response = await chat.sendMessage({
   * message: 'Why is the sky blue?'
   * });
   * console.log(response.text);
   * ```
   */
  async sendMessage(
    params: SendMessageParameters,
    prompt_id: string,
  ): Promise<GenerateContentResponse> {
    await this.sendPromise;
    const userContent = createUserContent(params.message);

    // Record user input - capture complete message with all parts (text, files, images, etc.)
    // but skip recording function responses (tool call results) as they should be stored in tool call records
    if (!isFunctionResponse(userContent)) {
      const userMessage = Array.isArray(params.message)
        ? params.message
        : [params.message];
      this.chatRecordingService.recordMessage({
        type: 'user',
        content: userMessage,
      });
    }
    const requestContents = this.getHistory(true).concat(userContent);

    let response: GenerateContentResponse;

    try {
      let currentAttemptModel: string | undefined;

      const apiCall = () => {
        const modelToUse = this.config.isInFallbackMode()
          ? DEFAULT_GEMINI_FLASH_MODEL
          : this.config.getModel();
        currentAttemptModel = modelToUse;

        // Prevent Flash model calls immediately after quota error
        if (
          this.config.getQuotaErrorOccurred() &&
          modelToUse === DEFAULT_GEMINI_FLASH_MODEL
        ) {
          throw new Error(
            'Please submit a new query to continue with the Flash model.',
          );
        }

        return this.config.getContentGenerator().generateContent(
          {
            model: modelToUse,
            contents: requestContents,
            config: { ...this.generationConfig, ...params.config },
          },
          prompt_id,
        );
      };

      const onPersistent429Callback = async (
        authType?: string,
        error?: unknown,
      ) => {
        if (!currentAttemptModel) return null;
        return await handleFallback(
          this.config,
          currentAttemptModel,
          authType,
          error,
        );
      };

      response = await retryWithBackoff(apiCall, {
        shouldRetry: (error: unknown) => {
          // Check for known error messages and codes.
          if (error instanceof Error && error.message) {
            if (isSchemaDepthError(error.message)) return false;
            if (error.message.includes('429')) return true;
            if (error.message.match(/5\d{2}/)) return true;
          }
          return false; // Don't retry other errors by default
        },
        onPersistent429: onPersistent429Callback,
        authType: this.config.getContentGeneratorConfig()?.authType,
      });

      this.sendPromise = (async () => {
        const outputContent = response.candidates?.[0]?.content;
        const modelOutput = outputContent ? [outputContent] : [];

        // Because the AFC input contains the entire curated chat history in
        // addition to the new user input, we need to truncate the AFC history
        // to deduplicate the existing chat history.
        const fullAutomaticFunctionCallingHistory =
          response.automaticFunctionCallingHistory;
        const index = this.getHistory(true).length;
        let automaticFunctionCallingHistory: Content[] = [];
        if (fullAutomaticFunctionCallingHistory != null) {
          automaticFunctionCallingHistory =
            fullAutomaticFunctionCallingHistory.slice(index) ?? [];
        }

        this.recordHistory(
          userContent,
          modelOutput,
          automaticFunctionCallingHistory,
        );
      })();
      await this.sendPromise.catch((error) => {
        // Resets sendPromise to avoid subsequent calls failing
        this.sendPromise = Promise.resolve();
        // Re-throw the error so the caller knows something went wrong.
        throw error;
      });
      return response;
    } catch (error) {
      this.sendPromise = Promise.resolve();
      throw error;
    }
  }

  /**
   * Sends a message to the model and returns the response in chunks.
   *
   * @remarks
   * This method will wait for the previous message to be processed before
   * sending the next message.
   *
   * @see {@link Chat#sendMessage} for non-streaming method.
   * @param params - parameters for sending the message.
   * @return The model's response.
   *
   * @example
   * ```ts
   * const chat = ai.chats.create({model: 'gemini-2.0-flash'});
   * const response = await chat.sendMessageStream({
   * message: 'Why is the sky blue?'
   * });
   * for await (const chunk of response) {
   * console.log(chunk.text);
   * }
   * ```
   */
  async sendMessageStream(
    params: SendMessageParameters,
    prompt_id: string,
  ): Promise<AsyncGenerator<StreamEvent>> {
    await this.sendPromise;

    let streamDoneResolver: () => void;
    const streamDonePromise = new Promise<void>((resolve) => {
      streamDoneResolver = resolve;
    });
    this.sendPromise = streamDonePromise;

    const userContent = createUserContent(params.message);

    // Record user input - capture complete message with all parts (text, files, images, etc.)
    // but skip recording function responses (tool call results) as they should be stored in tool call records
    if (!isFunctionResponse(userContent)) {
      const userMessage = Array.isArray(params.message)
        ? params.message
        : [params.message];
      const userMessageContent = partListUnionToString(toParts(userMessage));
      this.chatRecordingService.recordMessage({
        type: 'user',
        content: userMessageContent,
      });
    }

    // Add user content to history ONCE before any attempts.
    this.history.push(userContent);
    const requestContents = this.getHistory(true);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return (async function* () {
      try {
        let lastError: unknown = new Error('Request failed after all retries.');

        for (
          let attempt = 0;
          attempt < INVALID_CONTENT_RETRY_OPTIONS.maxAttempts;
          attempt++
        ) {
          try {
            if (attempt > 0) {
              yield { type: StreamEventType.RETRY };
            }

            const stream = await self.makeApiCallAndProcessStream(
              requestContents,
              params,
              prompt_id,
              userContent,
            );

            for await (const chunk of stream) {
              yield { type: StreamEventType.CHUNK, value: chunk };
            }

            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            const isContentError = error instanceof EmptyStreamError;

            if (isContentError) {
              // Check if we have more attempts left.
              if (attempt < INVALID_CONTENT_RETRY_OPTIONS.maxAttempts - 1) {
                logContentRetry(
                  self.config,
                  new ContentRetryEvent(
                    attempt,
                    'EmptyStreamError',
                    INVALID_CONTENT_RETRY_OPTIONS.initialDelayMs,
                  ),
                );
                await new Promise((res) =>
                  setTimeout(
                    res,
                    INVALID_CONTENT_RETRY_OPTIONS.initialDelayMs *
                      (attempt + 1),
                  ),
                );
                continue;
              }
            }
            break;
          }
        }

        if (lastError) {
          if (lastError instanceof EmptyStreamError) {
            logContentRetryFailure(
              self.config,
              new ContentRetryFailureEvent(
                INVALID_CONTENT_RETRY_OPTIONS.maxAttempts,
                'EmptyStreamError',
              ),
            );
          }
          // If the stream fails, remove the user message that was added.
          if (self.history[self.history.length - 1] === userContent) {
            self.history.pop();
          }
          throw lastError;
        }
      } finally {
        streamDoneResolver!();
      }
    })();
  }

  private async makeApiCallAndProcessStream(
    requestContents: Content[],
    params: SendMessageParameters,
    prompt_id: string,
    userContent: Content,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    let currentAttemptModel: string | undefined;

    const apiCall = () => {
      const modelToUse = this.config.isInFallbackMode()
        ? DEFAULT_GEMINI_FLASH_MODEL
        : this.config.getModel();
      currentAttemptModel = modelToUse;

      if (
        this.config.getQuotaErrorOccurred() &&
        modelToUse === DEFAULT_GEMINI_FLASH_MODEL
      ) {
        throw new Error(
          'Please submit a new query to continue with the Flash model.',
        );
      }

      return this.config.getContentGenerator().generateContentStream(
        {
          model: modelToUse,
          contents: requestContents,
          config: { ...this.generationConfig, ...params.config },
        },
        prompt_id,
      );
    };

    const onPersistent429Callback = async (
      authType?: string,
      error?: unknown,
    ) => {
      if (!currentAttemptModel) return null;
      return await handleFallback(
        this.config,
        currentAttemptModel,
        authType,
        error,
      );
    };

    const streamResponse = await retryWithBackoff(apiCall, {
      shouldRetry: (error: unknown) => {
        if (error instanceof Error && error.message) {
          if (isSchemaDepthError(error.message)) return false;
          if (error.message.includes('429')) return true;
          if (error.message.match(/5\d{2}/)) return true;
        }
        return false;
      },
      onPersistent429: onPersistent429Callback,
      authType: this.config.getContentGeneratorConfig()?.authType,
    });

    return this.processStreamResponse(streamResponse, userContent);
  }

  /**
   * Returns the chat history.
   *
   * @remarks
   * The history is a list of contents alternating between user and model.
   *
   * There are two types of history:
   * - The `curated history` contains only the valid turns between user and
   * model, which will be included in the subsequent requests sent to the model.
   * - The `comprehensive history` contains all turns, including invalid or
   * empty model outputs, providing a complete record of the history.
   *
   * The history is updated after receiving the response from the model,
   * for streaming response, it means receiving the last chunk of the response.
   *
   * The `comprehensive history` is returned by default. To get the `curated
   * history`, set the `curated` parameter to `true`.
   *
   * @param curated - whether to return the curated history or the comprehensive
   * history.
   * @return History contents alternating between user and model for the entire
   * chat session.
   */
  getHistory(curated: boolean = false): Content[] {
    const history = curated
      ? extractCuratedHistory(this.history)
      : this.history;
    // Deep copy the history to avoid mutating the history outside of the
    // chat session.
    return structuredClone(history);
  }

  /**
   * Clears the chat history.
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Adds a new entry to the chat history.
   */
  addHistory(content: Content): void {
    this.history.push(content);
  }

  setHistory(history: Content[]): void {
    this.history = history;
  }

  stripThoughtsFromHistory(): void {
    this.history = this.history.map((content) => {
      const newContent = { ...content };
      if (newContent.parts) {
        newContent.parts = newContent.parts.map((part) => {
          if (part && typeof part === 'object' && 'thoughtSignature' in part) {
            const newPart = { ...part };
            delete (newPart as { thoughtSignature?: string }).thoughtSignature;
            return newPart;
          }
          return part;
        });
      }
      return newContent;
    });
  }

  setTools(tools: Tool[]): void {
    this.generationConfig.tools = tools;
  }

  async maybeIncludeSchemaDepthContext(error: StructuredError): Promise<void> {
    // Check for potentially problematic cyclic tools with cyclic schemas
    // and include a recommendation to remove potentially problematic tools.
    if (
      isSchemaDepthError(error.message) ||
      isInvalidArgumentError(error.message)
    ) {
      const tools = this.config.getToolRegistry().getAllTools();
      const cyclicSchemaTools: string[] = [];
      for (const tool of tools) {
        if (
          (tool.schema.parametersJsonSchema &&
            hasCycleInSchema(tool.schema.parametersJsonSchema)) ||
          (tool.schema.parameters && hasCycleInSchema(tool.schema.parameters))
        ) {
          cyclicSchemaTools.push(tool.displayName);
        }
      }
      if (cyclicSchemaTools.length > 0) {
        const extraDetails =
          `\n\nThis error was probably caused by cyclic schema references in one of the following tools, try disabling them with excludeTools:\n\n - ` +
          cyclicSchemaTools.join(`\n - `) +
          `\n`;
        error.message += extraDetails;
      }
    }
  }

  private async *processStreamResponse(
    streamResponse: AsyncGenerator<GenerateContentResponse>,
    userInput: Content,
  ): AsyncGenerator<GenerateContentResponse> {
    const modelResponseParts: Part[] = [];
    let hasReceivedAnyChunk = false;
    let hasReceivedValidChunk = false;
    let hasToolCall = false;
    let lastChunk: GenerateContentResponse | null = null;
    let lastChunkIsInvalid = false;

    for await (const chunk of streamResponse) {
      hasReceivedAnyChunk = true;
      lastChunk = chunk;

      if (isValidResponse(chunk)) {
        hasReceivedValidChunk = true;
        lastChunkIsInvalid = false;
        const content = chunk.candidates?.[0]?.content;
        if (content?.parts) {
          if (content.parts.some((part) => part.thought)) {
            // Record thoughts
            this.recordThoughtFromContent(content);
          }
          if (content.parts.some((part) => part.functionCall)) {
            hasToolCall = true;
          }
          // Always add parts - thoughts will be filtered out later in recordHistory
          modelResponseParts.push(...content.parts);
        }
      } else {
        logInvalidChunk(
          this.config,
          new InvalidChunkEvent('Invalid chunk received from stream.'),
        );
        lastChunkIsInvalid = true;
      }

      // Record token usage if this chunk has usageMetadata
      if (chunk.usageMetadata) {
        this.chatRecordingService.recordMessageTokens(chunk.usageMetadata);
      }

      yield chunk; // Yield every chunk to the UI immediately.
    }

    if (!hasReceivedAnyChunk) {
      throw new EmptyStreamError('Model stream completed without any chunks.');
    }

    const hasFinishReason = lastChunk?.candidates?.some(
      (candidate) => candidate.finishReason,
    );

    // Stream validation logic: A stream is considered successful if:
    // 1. There's a tool call (tool calls can end without explicit finish reasons), OR
    // 2. There's a finish reason AND the last chunk is valid (or we haven't received any valid chunks)
    //
    // We throw an error only when there's no tool call AND:
    // - No finish reason, OR
    // - Last chunk is invalid after receiving valid content
    if (
      !hasToolCall &&
      (!hasFinishReason || (lastChunkIsInvalid && !hasReceivedValidChunk))
    ) {
      throw new EmptyStreamError(
        'Model stream ended with an invalid chunk or missing finish reason.',
      );
    }

    // Record model response text from the collected parts
    if (modelResponseParts.length > 0) {
      const responseText = modelResponseParts
        .filter((part) => part.text && !part.thought)
        .map((part) => part.text)
        .join('');

      if (responseText.trim()) {
        this.chatRecordingService.recordMessage({
          type: 'gemini',
          content: responseText,
        });
      }
    }

    // Bundle all streamed parts into a single Content object
    const modelOutput: Content[] =
      modelResponseParts.length > 0
        ? [{ role: 'model', parts: modelResponseParts }]
        : [];

    // Pass the raw, bundled data to the new, robust recordHistory
    this.recordHistory(userInput, modelOutput);
  }

  private recordHistory(
    userInput: Content,
    modelOutput: Content[],
    automaticFunctionCallingHistory?: Content[],
  ) {
    // Part 1: Handle the user's turn.
    if (
      automaticFunctionCallingHistory &&
      automaticFunctionCallingHistory.length > 0
    ) {
      this.history.push(
        ...extractCuratedHistory(automaticFunctionCallingHistory),
      );
    } else {
      if (
        this.history.length === 0 ||
        this.history[this.history.length - 1] !== userInput
      ) {
        const lastTurn = this.history[this.history.length - 1];
        // The only time we don't push is if it's the *exact same* object,
        // which happens in streaming where we add it preemptively.
        if (lastTurn !== userInput) {
          if (lastTurn?.role === 'user') {
            // This is an invalid sequence.
            throw new Error('Cannot add a user turn after another user turn.');
          }
          this.history.push(userInput);
        }
      }
    }

    // Part 2: Process the model output into a final, consolidated list of turns.
    const finalModelTurns: Content[] = [];
    for (const content of modelOutput) {
      // A. Preserve malformed content that has no 'parts' array.
      if (!content.parts) {
        finalModelTurns.push(content);
        continue;
      }

      // B. Filter out 'thought' parts.
      const visibleParts = content.parts.filter((part) => !part.thought);

      const newTurn = { ...content, parts: visibleParts };
      const lastTurnInFinal = finalModelTurns[finalModelTurns.length - 1];

      // Consolidate this new turn with the PREVIOUS turn if they are adjacent model turns.
      if (
        lastTurnInFinal &&
        lastTurnInFinal.role === 'model' &&
        newTurn.role === 'model' &&
        lastTurnInFinal.parts && // SAFETY CHECK: Ensure the destination has a parts array.
        newTurn.parts
      ) {
        lastTurnInFinal.parts.push(...newTurn.parts);
      } else {
        finalModelTurns.push(newTurn);
      }
    }

    // Part 3: Add the processed model turns to the history, with one final consolidation pass.
    if (finalModelTurns.length > 0) {
      // Re-consolidate parts within any turns that were merged in the previous step.
      for (const turn of finalModelTurns) {
        if (turn.parts && turn.parts.length > 1) {
          const consolidatedParts: Part[] = [];
          for (const part of turn.parts) {
            const lastPart = consolidatedParts[consolidatedParts.length - 1];
            if (
              lastPart &&
              // Ensure lastPart is a pure text part
              typeof lastPart.text === 'string' &&
              !lastPart.functionCall &&
              !lastPart.functionResponse &&
              !lastPart.inlineData &&
              !lastPart.fileData &&
              !lastPart.thought &&
              // Ensure current part is a pure text part
              typeof part.text === 'string' &&
              !part.functionCall &&
              !part.functionResponse &&
              !part.inlineData &&
              !part.fileData &&
              !part.thought
            ) {
              lastPart.text += part.text;
            } else {
              consolidatedParts.push({ ...part });
            }
          }
          turn.parts = consolidatedParts;
        }
      }
      this.history.push(...finalModelTurns);
    } else {
      // If, after all processing, there's NO model output, add the placeholder.
      this.history.push({ role: 'model', parts: [] });
    }
  }

  /**
   * Gets the chat recording service instance.
   */
  getChatRecordingService(): ChatRecordingService {
    return this.chatRecordingService;
  }

  /**
   * Records completed tool calls with full metadata.
   * This is called by external components when tool calls complete, before sending responses to Gemini.
   */
  recordCompletedToolCalls(toolCalls: CompletedToolCall[]): void {
    const toolCallRecords = toolCalls.map((call) => {
      const resultDisplayRaw = call.response?.resultDisplay;
      const resultDisplay =
        typeof resultDisplayRaw === 'string' ? resultDisplayRaw : undefined;

      return {
        id: call.request.callId,
        name: call.request.name,
        args: call.request.args,
        result: call.response?.responseParts || null,
        status: call.status as 'error' | 'success' | 'cancelled',
        timestamp: new Date().toISOString(),
        resultDisplay,
      };
    });

    this.chatRecordingService.recordToolCalls(toolCallRecords);
  }

  /**
   * Extracts and records thought from thought content.
   */
  private recordThoughtFromContent(content: Content): void {
    if (!content.parts || content.parts.length === 0) {
      return;
    }

    const thoughtPart = content.parts[0];
    if (thoughtPart.text) {
      // Extract subject and description using the same logic as turn.ts
      const rawText = thoughtPart.text;
      const subjectStringMatches = rawText.match(/\*\*(.*?)\*\*/s);
      const subject = subjectStringMatches
        ? subjectStringMatches[1].trim()
        : '';
      const description = rawText.replace(/\*\*(.*?)\*\*/s, '').trim();

      this.chatRecordingService.recordThought({
        subject,
        description,
      });
    }
  }
}

/** Visible for Testing */
export function isSchemaDepthError(errorMessage: string): boolean {
  return errorMessage.includes('maximum schema depth exceeded');
}

export function isInvalidArgumentError(errorMessage: string): boolean {
  return errorMessage.includes('Request contains an invalid argument');
}
