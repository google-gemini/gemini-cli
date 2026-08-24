/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// DISCLAIMER: This is a copied version of https://github.com/googleapis/js-genai/blob/main/src/chats.ts with the intention of working around a key bug
// where function responses are not treated as "valid" responses: https://b.corp.google.com/issues/420354090

import {
  createUserContent,
  FinishReason,
  type GenerateContentResponse,
  type Content,
  type Part,
  type Tool,
  type PartListUnion,
  type GenerateContentConfig,
  type GenerateContentParameters,
  type FunctionCall,
} from '@google/genai';
export { AgentChatHistory, type HistoryTurn } from './agentChatHistory.js';
import { AgentChatHistory, type HistoryTurn } from './agentChatHistory.js';

import { randomUUID } from 'node:crypto';
import { toParts } from '../code_assist/converter.js';
import {
  retryWithBackoff,
  isRetryableError,
  getRetryErrorType,
} from '../utils/retry.js';
import type { ValidationRequiredError } from '../utils/googleQuotaErrors.js';
import {
  resolveModel,
  supportsModernFeatures,
  isGemini2Model,
} from '../config/models.js';
import { hasCycleInSchema } from '../tools/tools.js';
import type { StructuredError } from './turn.js';
import type { CompletedToolCall } from '../scheduler/types.js';
import { isAbortError } from '../utils/errors.js';
import {
  logContentRetry,
  logContentRetryFailure,
  logNetworkRetryAttempt,
} from '../telemetry/loggers.js';
import {
  ChatRecordingService,
  type ResumedSessionData,
} from '../services/chatRecordingService.js';
import {
  ContentRetryEvent,
  ContentRetryFailureEvent,
  NetworkRetryAttemptEvent,
  type LlmRole,
} from '../telemetry/types.js';
import { handleFallback } from '../fallback/handler.js';
import { isFunctionResponse } from '../utils/messageInspectors.js';
import { scrubHistory, scrubContents } from '../utils/historyHardening.js';
import {
  partListUnionToString,
  ensureStableToolIds,
} from '../utils/sessionUtils.js';
import { BINARY_INJECTION_KEY } from '../utils/generateContentResponseUtilities.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';
import {
  applyModelSelection,
  createAvailabilityContextProvider,
} from '../availability/policyHelpers.js';
import { coreEvents } from '../utils/events.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';

export enum StreamEventType {
  /** A regular content chunk from the API. */
  CHUNK = 'chunk',
  /** A signal that a retry is about to happen. The UI should discard any partial
   * content from the attempt that just failed. */
  RETRY = 'retry',
  /** A signal that the agent execution has been stopped by a hook. */
  AGENT_EXECUTION_STOPPED = 'agent_execution_stopped',
  /** A signal that the agent execution has been blocked by a hook. */
  AGENT_EXECUTION_BLOCKED = 'agent_execution_blocked',
}

export type StreamEvent =
  | { type: StreamEventType.CHUNK; value: GenerateContentResponse }
  | { type: StreamEventType.RETRY }
  | { type: StreamEventType.AGENT_EXECUTION_STOPPED; reason: string }
  | { type: StreamEventType.AGENT_EXECUTION_BLOCKED; reason: string };

/**
 * Options for retrying mid-stream errors (e.g. invalid content or API disconnects).
 */
interface MidStreamRetryOptions {
  /** Total number of attempts to make (1 initial + N retries). */
  maxAttempts: number;
  /** The base delay in milliseconds for backoff. */
  initialDelayMs: number;
  /** Whether to use exponential backoff instead of linear. */
  useExponentialBackoff: boolean;
}

const MID_STREAM_RETRY_OPTIONS: MidStreamRetryOptions = {
  maxAttempts: 4, // 1 initial call + 3 retries mid-stream
  initialDelayMs: 1000,
  useExponentialBackoff: true,
};

export const SYNTHETIC_THOUGHT_SIGNATURE = 'skip_thought_signature_validator';

/**
 * Stands in for a model turn that never arrived because the stream failed
 * after a tool response was already committed to history.
 */
export const INTERRUPTED_RESPONSE_PLACEHOLDER =
  '[The previous response was interrupted before it completed.]';

/**
 * Internal interface for parts that carry the magic 'callIndex' property
 * used during model response consolidation.
 */
interface IndexedPart extends Part {
  callIndex?: number;
}

function isIndexedPart(part: Part): part is IndexedPart {
  return 'callIndex' in part;
}

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

export function isValidNonThoughtTextPart(part: Part): boolean {
  return (
    typeof part.text === 'string' &&
    !part.thought &&
    // Technically, the model should never generate parts that have text and
    //  any of these but we don't trust them so check anyways.
    !part.functionCall &&
    !part.functionResponse &&
    !part.inlineData &&
    !part.fileData
  );
}

function isValidContent(content: Content): boolean {
  if (
    content.role === 'model' &&
    (content.parts === undefined || content.parts.length === 0)
  ) {
    return true;
  }
  if (content.parts === undefined || content.parts.length === 0) {
    return false;
  }
  for (const part of content.parts) {
    if (part === undefined || Object.keys(part).length === 0) {
      return false;
    }
    // Check if the part contains any keys other than 'text', 'thought', or 'callIndex'.
    // If it has other keys, it carries an active payload (such as tools, files, or code execution)
    // and must be preserved even if the text itself is empty, preventing history sequence corruption.
    const nonTextKeys = Object.keys(part).filter(
      (key) => key !== 'text' && key !== 'thought' && key !== 'callIndex',
    );
    if (
      !part.thought &&
      part.text !== undefined &&
      part.text === '' &&
      nonTextKeys.length === 0
    ) {
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
function validateHistory(history: Array<Content | HistoryTurn>) {
  for (const item of history) {
    const content = 'content' in item ? item.content : item;
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
function extractCuratedHistory(
  comprehensiveHistory: readonly HistoryTurn[],
): HistoryTurn[] {
  if (comprehensiveHistory === undefined || comprehensiveHistory.length === 0) {
    return [];
  }
  const curatedHistory: HistoryTurn[] = [];
  const length = comprehensiveHistory.length;
  let i = 0;
  while (i < length) {
    if (comprehensiveHistory[i].content.role === 'user') {
      curatedHistory.push(comprehensiveHistory[i]);
      i++;
    } else {
      const modelOutput: HistoryTurn[] = [];
      let isValid = true;
      while (i < length && comprehensiveHistory[i].content.role === 'model') {
        modelOutput.push(comprehensiveHistory[i]);
        if (isValid && !isValidContent(comprehensiveHistory[i].content)) {
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
 * Custom error to signal that a stream completed with invalid content,
 * which should trigger a retry.
 */
export class InvalidStreamError extends Error {
  readonly type:
    | 'NO_FINISH_REASON'
    | 'NO_RESPONSE_TEXT'
    | 'MALFORMED_FUNCTION_CALL'
    | 'UNEXPECTED_TOOL_CALL'
    | 'MAX_TOKENS_EXCEEDED'
    | 'SAFETY_BLOCKED'
    | 'RECITATION_BLOCKED'
    | 'OTHER_BLOCKED'
    | 'THINKING_ONLY_RESPONSE';

  constructor(
    message: string,
    type:
      | 'NO_FINISH_REASON'
      | 'NO_RESPONSE_TEXT'
      | 'MALFORMED_FUNCTION_CALL'
      | 'UNEXPECTED_TOOL_CALL'
      | 'MAX_TOKENS_EXCEEDED'
      | 'SAFETY_BLOCKED'
      | 'RECITATION_BLOCKED'
      | 'OTHER_BLOCKED'
      | 'THINKING_ONLY_RESPONSE',
  ) {
    super(message);
    this.name = 'InvalidStreamError';
    this.type = type;
  }
}

/**
 * Custom error to signal that agent execution has been stopped.
 */
export class AgentExecutionStoppedError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = 'AgentExecutionStoppedError';
  }
}

/**
 * Custom error to signal that agent execution has been blocked.
 */
export class AgentExecutionBlockedError extends Error {
  constructor(
    public reason: string,
    public syntheticResponse?: GenerateContentResponse,
  ) {
    super(reason);
    this.name = 'AgentExecutionBlockedError';
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
  private lastPromptTokenCount: number;
  private callCounter = 0;
  agentHistory: AgentChatHistory;
  private lastPromptId?: string;
  private promptOriginalHistoryLength?: number;
  private promptOriginalTokenCount?: number;

  constructor(
    readonly context: AgentLoopContext,
    private systemInstruction: string = '',
    private tools: Tool[] = [],
    history: Array<Content | HistoryTurn> = [],
    resumedSessionData?: ResumedSessionData,
    private readonly onModelChanged?: (modelId: string) => Promise<Tool[]>,
  ) {
    validateHistory(history);

    let initialHistory: HistoryTurn[];
    // If history is passed, it is the most up-to-date in-memory state and takes precedence.
    // This is critical for hot-restarts after operations like context compression.
    if (history.length > 0) {
      initialHistory = history.map((item) =>
        'id' in item && 'content' in item
          ? item
          : { id: randomUUID(), content: item },
      );
    } else if (resumedSessionData) {
      // Otherwise, if resuming from disk, build from the persisted record.
      initialHistory = resumedSessionData.conversation.messages
        .filter((m) => m.type === 'user' || m.type === 'gemini')
        .map((m) => ({
          id: m.id,
          content: {
            role: m.type === 'user' ? 'user' : 'model',
            parts: Array.isArray(m.content)
              ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                (m.content as Part[])
              : [{ text: String(m.content) }],
          },
        }));
    } else {
      initialHistory = [];
    }

    this.agentHistory = new AgentChatHistory(initialHistory);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    ensureStableToolIds(this.agentHistory.get() as HistoryTurn[]);
    this.chatRecordingService = new ChatRecordingService(context);
    this.lastPromptTokenCount = estimateTokenCountSync(
      this.agentHistory.flatMap((c) => c.content.parts || []),
    );
  }

  get loopContext(): AgentLoopContext {
    return this.context;
  }

  async initialize(
    resumedSessionData?: ResumedSessionData,
    kind: 'main' | 'subagent' = 'main',
  ): Promise<void> {
    await this.chatRecordingService.initialize(resumedSessionData, kind);
    // Sync initial history with the recorder to ensure all turns (even bootstrapped ones)
    // are durable and coordinated.
    this.chatRecordingService.updateMessagesFromHistory(
      this.agentHistory.get(),
    );
  }

  setSystemInstruction(sysInstr: string) {
    this.systemInstruction = sysInstr;
  }

  getSystemInstruction(): string {
    return this.systemInstruction;
  }

  /**
   * Sends a message to the model and returns the response in chunks.
   *
   * @remarks
   * This method will wait for the previous message to be processed before
   * sending the next message.
   *
   * @see {@link Chat#sendMessage} for non-streaming method.
   * @param modelConfigKey - The key for the model config.
   * @param message - The list of messages to send.
   * @param prompt_id - The ID of the prompt.
   * @param signal - An abort signal for this message.
   * @param displayContent - An optional user-friendly version of the message to record.
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
    modelConfigKey: ModelConfigKey,
    message: PartListUnion,
    prompt_id: string,
    signal: AbortSignal,
    role: LlmRole,
    displayContent?: PartListUnion,
    apiHistoryOverride?: Content[],
  ): Promise<AsyncGenerator<StreamEvent>> {
    await this.sendPromise;

    const historyLengthBefore = this.agentHistory.length;
    const baselinePromptTokenCount = this.lastPromptTokenCount;

    if (this.lastPromptId && this.lastPromptId !== prompt_id) {
      this.promptOriginalHistoryLength = undefined;
      this.promptOriginalTokenCount = undefined;
    }
    this.lastPromptId = prompt_id;

    if (this.promptOriginalHistoryLength === undefined) {
      this.promptOriginalHistoryLength = historyLengthBefore;
      this.promptOriginalTokenCount = baselinePromptTokenCount;
    }

    let streamDoneResolver: () => void;
    const streamDonePromise = new Promise<void>((resolve) => {
      streamDoneResolver = resolve;
    });
    this.sendPromise = streamDonePromise;

    let userContent = createUserContent(message);
    const isOriginalFunctionResponse = isFunctionResponse(userContent);

    // A turn can end leaving history on an unanswered tool response: a stream
    // error after the response was committed, or a cancelled tool call. Close
    // it before recording a genuinely new user message, otherwise the two user
    // turns are coalesced into one and the model continues the trailing text
    // instead of answering it.
    if (!isOriginalFunctionResponse) {
      this.closeUnansweredToolResponseTurn();
    }

    const { model } =
      this.context.config.modelConfigService.getResolvedConfig(modelConfigKey);

    const isContextManagementEnabled =
      this.context.config.isContextManagementEnabled();

    // Record user input - capture complete message with all parts (text, files, images, etc.)
    // but skip recording function responses (tool call results) as they should be stored in tool call records
    if (!isOriginalFunctionResponse) {
      const userMessageParts = userContent.parts || [];
      const userMessageContent = partListUnionToString(userMessageParts);

      let finalDisplayContent: Part[] | undefined = undefined;
      if (displayContent !== undefined) {
        const displayParts = toParts(
          Array.isArray(displayContent) ? displayContent : [displayContent],
        );
        const displayContentString = partListUnionToString(displayParts);
        if (displayContentString !== userMessageContent) {
          finalDisplayContent = displayParts;
        }
      }

      if (!isContextManagementEnabled) {
        const id = this.chatRecordingService.recordMessage({
          model,
          type: 'user',
          content: userMessageParts,
          displayContent: finalDisplayContent,
        });
        this.agentHistory.push({ id, content: userContent });
      } else {
        // With Context Management, the client has already recorded the user message
        // and called setHistory to ensure the graph is in sync.
        // We just verify it's there.
        const history = this.agentHistory.get();
        const lastTurn = history[history.length - 1];
        if (
          !lastTurn ||
          partListUnionToString(lastTurn.content.parts || []) !==
            userMessageContent
        ) {
          const id = this.chatRecordingService.recordMessage({
            model,
            type: 'user',
            content: userMessageParts,
            displayContent: finalDisplayContent,
          });
          this.agentHistory.push({ id, content: userContent });
        }
      }
    } else {
      // Record tool response as a message to ensure durable ID and linear history for resume.
      const id = this.chatRecordingService.recordSyntheticMessage(
        'user',
        userContent.parts || [],
      );

      if (!isContextManagementEnabled) {
        // Binary injections: If the tool output contains binary data, we expand the history.
        const binaryParts = this.extractBinaryInjections(userContent.parts);
        if (binaryParts) {
          // Turn 1: The original tool response (now cleaned)
          this.agentHistory.push({ id, content: userContent });

          // Turn 2: Synthetic Model Acknowledgment
          const modelId = this.chatRecordingService.recordSyntheticMessage(
            'gemini',
            [
              {
                text: 'Binary content received. Proceeding with analysis.',
                thought: true,
                thoughtSignature: SYNTHETIC_THOUGHT_SIGNATURE,
              },
            ],
          );
          this.agentHistory.push({
            id: modelId,
            content: {
              role: 'model',
              parts: [
                {
                  text: 'Binary content received. Proceeding with analysis.',
                  thought: true,
                  thoughtSignature: SYNTHETIC_THOUGHT_SIGNATURE,
                },
              ],
            },
          });

          // Turn 3: The actual binary data (becomes the current request message)
          const binaryId = this.chatRecordingService.recordSyntheticMessage(
            'info',
            binaryParts,
          );
          userContent = {
            role: 'user',
            parts: binaryParts,
          };
          this.agentHistory.push({ id: binaryId, content: userContent });
        } else {
          this.agentHistory.push({ id, content: userContent });
        }
      } else {
        // With Context Management, we just push it to the history if not already there.
        // (The client should have handled this, but we're defensive).
        const history = this.agentHistory.get();
        const lastTurn = history[history.length - 1];
        if (
          !lastTurn ||
          partListUnionToString(lastTurn.content.parts || []) !==
            partListUnionToString(userContent.parts || [])
        ) {
          this.agentHistory.push({ id, content: userContent });
        }
      }
    }

    const requestHistory = this.getHistoryTurns(true);

    const streamWithRetries = async function* (
      this: GeminiChat,
    ): AsyncGenerator<StreamEvent, void, void> {
      let isSuccess = false;
      let caughtError: unknown = undefined;

      try {
        const maxAttempts = this.context.config.getMaxAttempts();
        let lastStreamError: unknown = undefined;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          let isConnectionPhase = true;
          try {
            if (attempt > 0) {
              yield { type: StreamEventType.RETRY };
            }

            // If this is a retry, update the key with the new context.
            const currentConfigKey =
              attempt > 0
                ? { ...modelConfigKey, isRetry: true, lastStreamError }
                : modelConfigKey;

            isConnectionPhase = true;
            const stream = await this.makeApiCallAndProcessStream(
              currentConfigKey,
              requestHistory,
              prompt_id,
              signal,
              role,
              apiHistoryOverride,
              isOriginalFunctionResponse,
            );
            isConnectionPhase = false;
            for await (const chunk of stream) {
              yield { type: StreamEventType.CHUNK, value: chunk };
            }

            isSuccess = true;
            return;
          } catch (error) {
            if (error instanceof InvalidStreamError) {
              lastStreamError = error;
            }

            if (error instanceof AgentExecutionStoppedError) {
              yield {
                type: StreamEventType.AGENT_EXECUTION_STOPPED,
                reason: error.reason,
              };
              isSuccess = true;
              return; // Stop the generator
            }

            if (error instanceof AgentExecutionBlockedError) {
              yield {
                type: StreamEventType.AGENT_EXECUTION_BLOCKED,
                reason: error.reason,
              };
              if (error.syntheticResponse) {
                yield {
                  type: StreamEventType.CHUNK,
                  value: error.syntheticResponse,
                };
              }
              isSuccess = true;
              return; // Stop the generator
            }

            if (isConnectionPhase) {
              // Connection phase errors have already been retried by retryWithBackoff.
              // If they bubble up here, they are exhausted or fatal.
              throw error;
            }

            // Check if the error is retryable (e.g., transient SSL errors
            // like ERR_SSL_SSLV3_ALERT_BAD_RECORD_MAC or ApiError)
            const isRetryable = isRetryableError(
              error,
              this.context.config.getRetryFetchErrors(),
            );

            const isContentError = error instanceof InvalidStreamError;
            const isRetryableContentError = isContentError;
            const errorType = isContentError
              ? error.type
              : getRetryErrorType(error);

            if (isRetryableContentError || (isRetryable && !signal.aborted)) {
              // The issue requests exactly 3 retries (4 attempts) for API errors during stream iteration.
              // Regardless of the global maxAttempts (e.g. 10), we only want to retry these mid-stream API errors
              // up to 3 times before finally throwing the error to the user.
              const maxMidStreamAttempts = MID_STREAM_RETRY_OPTIONS.maxAttempts;

              if (
                attempt < maxAttempts - 1 &&
                attempt < maxMidStreamAttempts - 1
              ) {
                const delayMs = MID_STREAM_RETRY_OPTIONS.useExponentialBackoff
                  ? MID_STREAM_RETRY_OPTIONS.initialDelayMs *
                    Math.pow(2, attempt)
                  : MID_STREAM_RETRY_OPTIONS.initialDelayMs * (attempt + 1);

                if (isContentError) {
                  logContentRetry(
                    this.context.config,
                    new ContentRetryEvent(attempt, errorType, delayMs, model),
                  );
                } else {
                  logNetworkRetryAttempt(
                    this.context.config,
                    new NetworkRetryAttemptEvent(
                      attempt + 1,
                      maxAttempts,
                      errorType,
                      delayMs,
                      model,
                    ),
                  );
                }
                coreEvents.emitRetryAttempt({
                  attempt: attempt + 1,
                  maxAttempts: Math.min(maxAttempts, maxMidStreamAttempts),
                  delayMs,
                  error: errorType,
                  model,
                });
                await new Promise((res) => setTimeout(res, delayMs));
                continue;
              }
            }

            // If we've aborted, we throw without logging a failure.
            if (signal.aborted) {
              throw error;
            }

            logContentRetryFailure(
              this.context.config,
              new ContentRetryFailureEvent(attempt + 1, errorType, model),
            );

            throw error;
          }
        }
      } catch (error) {
        caughtError = error;
        throw error;
      } finally {
        if (!isSuccess) {
          const isAborted =
            signal?.aborted ||
            isAbortError(caughtError) ||
            (caughtError instanceof Error &&
              (caughtError.name === 'CanceledError' ||
                caughtError.name === 'FatalCancellationError'));
          const originalLength = this.promptOriginalHistoryLength;
          const originalTokenCount = this.promptOriginalTokenCount;
          if (isAborted && originalLength !== undefined) {
            this.agentHistory.rollback(originalLength);
            this.chatRecordingService.updateMessagesFromHistory(
              this.agentHistory.get(),
            );
            if (originalTokenCount !== undefined) {
              this.lastPromptTokenCount = originalTokenCount;
            }
            this.promptOriginalHistoryLength = undefined;
            this.promptOriginalTokenCount = undefined;
            this.lastPromptId = undefined;
          } else if (!isOriginalFunctionResponse) {
            this.agentHistory.rollback(historyLengthBefore);
            this.chatRecordingService.updateMessagesFromHistory(
              this.agentHistory.get(),
            );
            this.lastPromptTokenCount = baselinePromptTokenCount;
          }
        }
        streamDoneResolver!();
      }
    };

    return streamWithRetries.call(this);
  }

  /**
   * Appends a closing model turn when history ends with an unanswered tool
   * response, so the next user message stays a turn of its own.
   */
  private closeUnansweredToolResponseTurn(): void {
    const turns = this.agentHistory.get();
    const last = turns[turns.length - 1];
    if (
      last?.content.role !== 'user' ||
      !last.content.parts?.some((part) => !!part.functionResponse)
    ) {
      return;
    }
    this.agentHistory.push({
      id: randomUUID(),
      content: {
        role: 'model',
        parts: [{ text: INTERRUPTED_RESPONSE_PLACEHOLDER }],
      },
    });
  }

  private extractBinaryInjections(
    parts: Part[] | undefined,
  ): Part[] | undefined {
    const binaryParts: Part[] = [];
    if (parts) {
      for (const part of parts) {
        const response = part.functionResponse?.response;
        if (response && BINARY_INJECTION_KEY in response) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const injected = response[BINARY_INJECTION_KEY] as Part[];
          delete response[BINARY_INJECTION_KEY];
          if (Array.isArray(injected)) {
            binaryParts.push(...injected);
          }
        }
      }
    }

    return binaryParts.length > 0 ? binaryParts : undefined;
  }

  private async makeApiCallAndProcessStream(
    modelConfigKey: ModelConfigKey,
    requestHistory: readonly HistoryTurn[],
    prompt_id: string,
    abortSignal: AbortSignal,
    role: LlmRole,
    apiHistoryOverride?: Content[],
    isOriginalFunctionResponse: boolean = false,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    // Last mile scrubbing to remove internal tracking properties (e.g. callIndex)
    // before sending to the Gemini API. This whitelists only standard Gemini fields.
    let scrubbedHistory = this.context.config.isContextManagementEnabled()
      ? scrubHistory([...requestHistory])
      : [...requestHistory];

    // Always coalesce consecutive roles to prevent 400 Bad Request errors
    scrubbedHistory = coalesceConsecutiveRoles(scrubbedHistory);

    const scrubbedContents = scrubbedHistory.map((h) => h.content);

    const requestContents = apiHistoryOverride
      ? scrubContents(apiHistoryOverride)
      : scrubbedContents;

    const contentsForPreviewModel =
      this.ensureActiveLoopHasThoughtSignatures(requestContents);

    // Track final request parameters for AfterModel hooks
    const {
      model: availabilityFinalModel,
      config: newAvailabilityConfig,
      maxAttempts: availabilityMaxAttempts,
    } = applyModelSelection(this.context.config, modelConfigKey);

    let lastModelToUse = availabilityFinalModel;
    let currentGenerateContentConfig: GenerateContentConfig =
      newAvailabilityConfig;
    let lastConfig: GenerateContentConfig = currentGenerateContentConfig;
    let lastContentsToUse: Content[] = [...requestContents];

    const getAvailabilityContext = createAvailabilityContextProvider(
      this.context.config,
      () => lastModelToUse,
    );
    // Track initial active model to detect fallback changes
    const initialActiveModel = this.context.config.getActiveModel();

    const apiCall = async () => {
      const useGemini3_1 =
        (await this.context.config.getGemini31Launched?.()) ?? false;
      const hasAccessToPreview =
        this.context.config.getHasAccessToPreviewModel?.() ?? true;
      // Default to the last used model (which respects arguments/availability selection)
      let modelToUse = resolveModel(
        lastModelToUse,
        useGemini3_1,
        false,
        hasAccessToPreview,
        this.context.config,
        this.context.config.hasGemini35FlashGAAccess?.() ?? false,
      );

      // If the active model has changed (e.g. due to a fallback updating the config),
      // we switch to the new active model.
      if (this.context.config.getActiveModel() !== initialActiveModel) {
        modelToUse = resolveModel(
          this.context.config.getActiveModel(),
          useGemini3_1,
          false,
          hasAccessToPreview,
          this.context.config,
          this.context.config.hasGemini35FlashGAAccess?.() ?? false,
        );
      }

      if (modelToUse !== lastModelToUse) {
        const { generateContentConfig: newConfig } =
          this.context.config.modelConfigService.getResolvedConfig({
            ...modelConfigKey,
            model: modelToUse,
          });
        currentGenerateContentConfig = newConfig;
      }

      lastModelToUse = modelToUse;
      const config: GenerateContentConfig = {
        ...currentGenerateContentConfig,
        // TODO(12622): Ensure we don't overrwrite these when they are
        // passed via config.
        systemInstruction: this.systemInstruction,
        tools: this.tools,
        abortSignal,
      };

      // Apply Context-Aware Retries (On-Retry Nudging) to guide the model out of silent loops
      if (
        modelConfigKey.isRetry &&
        modelConfigKey.lastStreamError instanceof InvalidStreamError
      ) {
        const lastError = modelConfigKey.lastStreamError;
        let nudgeMessage = '';
        if (lastError.type === 'THINKING_ONLY_RESPONSE') {
          nudgeMessage =
            '\n[System: You previously generated thoughts but failed to provide a final user-facing response. Please ensure you provide your final answer or call a tool now.]';
        } else if (lastError.type === 'NO_RESPONSE_TEXT') {
          nudgeMessage =
            '\n[System: You previously returned an empty response with no text or thoughts. Please ensure you provide your final answer or call a tool now.]';
        }

        if (nudgeMessage) {
          if (typeof config.systemInstruction === 'string') {
            config.systemInstruction += nudgeMessage;
          } else if (config.systemInstruction === undefined) {
            config.systemInstruction = nudgeMessage;
          }
        }
      }

      let contentsToUse: Content[] =
        supportsModernFeatures(modelToUse) || isGemini2Model(modelToUse)
          ? [...contentsForPreviewModel]
          : [...requestContents];

      const hookSystem = this.context.config.getHookSystem();
      if (hookSystem) {
        const beforeModelResult = await hookSystem.fireBeforeModelEvent({
          model: modelToUse,
          config,
          contents: contentsToUse,
        });

        if (beforeModelResult.stopped) {
          throw new AgentExecutionStoppedError(
            beforeModelResult.reason || 'Agent execution stopped by hook',
          );
        }

        if (beforeModelResult.blocked) {
          const syntheticResponse = beforeModelResult.syntheticResponse;

          for (const candidate of syntheticResponse?.candidates ?? []) {
            if (!candidate.finishReason) {
              candidate.finishReason = FinishReason.STOP;
            }
          }

          throw new AgentExecutionBlockedError(
            beforeModelResult.reason || 'Model call blocked by hook',
            syntheticResponse,
          );
        }

        if (beforeModelResult.modifiedModel) {
          modelToUse = resolveModel(
            beforeModelResult.modifiedModel,
            useGemini3_1,
            false,
            hasAccessToPreview,
            this.context.config,
            this.context.config.hasGemini35FlashGAAccess?.() ?? false,
          );
          lastModelToUse = modelToUse;
          // Re-evaluate contentsToUse based on the new model's feature support
          contentsToUse =
            supportsModernFeatures(modelToUse) || isGemini2Model(modelToUse)
              ? [...contentsForPreviewModel]
              : [...requestContents];
        }
        if (beforeModelResult.modifiedConfig) {
          Object.assign(config, beforeModelResult.modifiedConfig);
        }
        if (
          beforeModelResult.modifiedContents &&
          Array.isArray(beforeModelResult.modifiedContents)
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          contentsToUse = beforeModelResult.modifiedContents as Content[];
        }

        const toolSelectionResult =
          await hookSystem.fireBeforeToolSelectionEvent({
            model: modelToUse,
            config,
            contents: contentsToUse,
          });

        if (toolSelectionResult.toolConfig) {
          config.toolConfig = toolSelectionResult.toolConfig;
        }
        if (
          toolSelectionResult.tools &&
          Array.isArray(toolSelectionResult.tools)
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          config.tools = toolSelectionResult.tools as Tool[];
        }
      }

      if (this.onModelChanged) {
        this.tools = await this.onModelChanged(modelToUse);
      }

      // Track final request parameters for AfterModel hooks
      lastModelToUse = modelToUse;
      lastConfig = config;
      lastContentsToUse = contentsToUse;

      const finalContents = stripToolCallIdPrefixes(contentsToUse);

      return this.context.config.getContentGenerator().generateContentStream(
        {
          model: modelToUse,
          contents: finalContents,
          config,
        },
        prompt_id,
        role,
      );
    };

    const onPersistent429Callback = async (
      authType?: string,
      error?: unknown,
    ) => handleFallback(this.context.config, lastModelToUse, authType, error);

    const onValidationRequiredCallback = async (
      validationError: ValidationRequiredError,
    ) => {
      const handler = this.context.config.getValidationHandler();
      if (typeof handler !== 'function') {
        // No handler registered, re-throw to show default error message
        throw validationError;
      }
      return handler(
        validationError.validationLink,
        validationError.validationDescription,
        validationError.learnMoreUrl,
      );
    };

    const streamResponse = await retryWithBackoff(apiCall, {
      onPersistent429: onPersistent429Callback,
      onValidationRequired: onValidationRequiredCallback,
      authType: this.context.config.getContentGeneratorConfig()?.authType,
      retryFetchErrors: this.context.config.getRetryFetchErrors(),
      signal: abortSignal,
      maxAttempts:
        availabilityMaxAttempts ?? this.context.config.getMaxAttempts(),
      getAvailabilityContext,
      onRetry: (attempt, error, delayMs) => {
        coreEvents.emitRetryAttempt({
          attempt,
          maxAttempts:
            availabilityMaxAttempts ?? this.context.config.getMaxAttempts(),
          delayMs,
          error: error instanceof Error ? error.message : String(error),
          model: lastModelToUse,
        });
      },
    });

    // Store the original request for AfterModel hooks
    const originalRequest: GenerateContentParameters = {
      model: lastModelToUse,
      config: lastConfig,
      contents: lastContentsToUse,
    };

    return this.processStreamResponse(
      lastModelToUse,
      streamResponse,
      originalRequest,
      isOriginalFunctionResponse,
    );
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
    return this.getHistoryTurns(curated).map((h) => h.content);
  }

  /**
   * Returns the chat history as HistoryTurns.
   */
  getHistoryTurns(curated: boolean = false): HistoryTurn[] {
    const history = curated
      ? extractCuratedHistory(this.agentHistory.get())
      : [...this.agentHistory.get()];

    if (this.context.config.isContextManagementEnabled()) {
      return scrubHistory(history);
    }

    const model = this.context.config.getModel();
    if (isGemini2Model(model) || supportsModernFeatures(model)) {
      return coalesceConsecutiveRoles(stripThoughts(history));
    }

    return history;
  }

  /**
   * Clears the chat history.
   */
  clearHistory(): void {
    this.agentHistory.clear();
  }

  /**
   * Adds a new entry to the chat history.
   */
  addHistory(content: Content | HistoryTurn): void {
    if ('id' in content && 'content' in content) {
      this.agentHistory.push(content);
    } else {
      const id = this.chatRecordingService.recordSyntheticMessage(
        content.role === 'user' ? 'user' : 'gemini',
        content.parts || [],
      );
      this.agentHistory.push({ id, content });
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    ensureStableToolIds(this.agentHistory.get() as HistoryTurn[]);
  }

  setHistory(history: ReadonlyArray<Content | HistoryTurn>): void {
    const wrappedHistory: HistoryTurn[] = history.map((item) => {
      if ('id' in item && 'content' in item) {
        return item;
      }
      const id = this.chatRecordingService.recordSyntheticMessage(
        item.role === 'user' ? 'user' : 'gemini',
        item.parts || [],
      );
      return { id, content: item };
    });
    ensureStableToolIds(wrappedHistory);
    this.agentHistory.set(wrappedHistory);
    this.lastPromptTokenCount = estimateTokenCountSync(
      this.agentHistory.flatMap((c) => c.content.parts || []),
    );
    this.chatRecordingService.updateMessagesFromHistory(
      this.agentHistory.get(),
    );
  }

  stripThoughtsFromHistory(): void {
    const newHistory = this.agentHistory.map((turn) => {
      const newContent = { ...turn.content };
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
      return { id: turn.id, content: newContent };
    });
    this.agentHistory.set(newHistory);
  }

  // To ensure our requests validate, the first function call in every model
  // turn within the active loop must have a `thoughtSignature` property.
  // If we do not do this, we will get back 400 errors from the API.
  ensureActiveLoopHasThoughtSignatures(
    requestContents: readonly Content[],
  ): readonly Content[] {
    // First, find the start of the active loop by finding the last user turn
    // with a text message, i.e. that is not a function response. Testing for
    // text alone is not enough: `coalesceConsecutiveRoles` can merge a function
    // response turn with the prompt that follows it, and starting the loop at
    // such a turn starts it later than the API starts the turn, leaving earlier
    // function calls unsigned but still validated.
    let activeLoopStartIndex = -1;
    for (let i = requestContents.length - 1; i >= 0; i--) {
      const content = requestContents[i];
      if (
        content.role === 'user' &&
        content.parts?.some((part) => part.text) &&
        !content.parts?.some((part) => part.functionResponse)
      ) {
        activeLoopStartIndex = i;
        break;
      }
    }

    if (activeLoopStartIndex === -1) {
      return requestContents;
    }

    // Iterate through every message in the active loop, ensuring that the first
    // function call in each message's list of parts has a valid
    // thoughtSignature property. If it does not we replace the function call
    // with a copy that uses the synthetic thought signature.
    const newContents = requestContents.slice(); // Shallow copy the array
    for (let i = activeLoopStartIndex; i < newContents.length; i++) {
      const content = newContents[i];
      if (content.role === 'model' && content.parts) {
        const newParts = content.parts.slice();
        for (let j = 0; j < newParts.length; j++) {
          const part = newParts[j];
          if (part.functionCall) {
            if (!part.thoughtSignature) {
              newParts[j] = {
                ...part,
                thoughtSignature: SYNTHETIC_THOUGHT_SIGNATURE,
              };
              newContents[i] = {
                ...content,
                parts: newParts,
              };
            }
            break; // Only consider the first function call
          }
        }
      }
    }
    return newContents;
  }

  setTools(tools: Tool[]): void {
    this.tools = tools;
  }

  getTools(): Tool[] {
    return this.tools;
  }

  async maybeIncludeSchemaDepthContext(error: StructuredError): Promise<void> {
    // Check for potentially problematic cyclic tools with cyclic schemas
    // and include a recommendation to remove potentially problematic tools.
    if (
      isSchemaDepthError(error.message) ||
      isInvalidArgumentError(error.message)
    ) {
      const tools = this.context.toolRegistry.getAllTools();
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
    model: string,
    streamResponse: AsyncGenerator<GenerateContentResponse>,
    originalRequest: GenerateContentParameters,
    isOriginalFunctionResponse: boolean = false,
  ): AsyncGenerator<GenerateContentResponse> {
    const modelResponseParts: Part[] = [];

    let hasToolCall = false;
    let hasThoughts = false;
    let finishReason: FinishReason | undefined;

    // Buffers to prevent failed stream attempts from polluting telemetry and logs
    const bufferedThoughts: Array<{ subject: string; description: string }> =
      [];
    let bufferedUsageMetadata:
      | GenerateContentResponse['usageMetadata']
      | undefined = undefined;

    // The SDK provides fully assembled FunctionCall objects in chunk.functionCalls
    // We use a Map to ensure we only keep the latest version of each call (by ID)
    const finalFunctionCallsMap = new Map<string, FunctionCall>();
    const legacyFunctionCalls: FunctionCall[] = [];

    // Map to track synthetic IDs assigned to each call index across chunks
    const callIndexToId = new Map<number, string>();
    let runningFunctionCallCounter = 0;

    for await (const chunk of streamResponse) {
      const currentChunkStartCounter = runningFunctionCallCounter;
      const candidateWithReason = chunk?.candidates?.find(
        (candidate) => candidate.finishReason,
      );
      if (candidateWithReason) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        finishReason = candidateWithReason.finishReason as FinishReason;
      }

      if (chunk.functionCalls && chunk.functionCalls.length > 0) {
        if (this.context.config.isContextManagementEnabled()) {
          for (let i = 0; i < chunk.functionCalls.length; i++) {
            const fnCall = chunk.functionCalls[i];
            const globalIndex = currentChunkStartCounter + i;
            if (!fnCall.id) {
              let id = callIndexToId.get(globalIndex);
              if (!id) {
                id = `synth_${this.context.promptId}_${Date.now()}_${this.callCounter++}`;
                callIndexToId.set(globalIndex, id);
              }
              fnCall.id = id;
            }
            const name = fnCall.name?.trim() || 'generic_tool';
            if (fnCall.id && !fnCall.id.startsWith(`${name}__`)) {
              fnCall.id = `${name}__${fnCall.id}`;
            }
            finalFunctionCallsMap.set(fnCall.id, fnCall);
          }
          runningFunctionCallCounter += chunk.functionCalls.length;
        } else {
          for (const fnCall of chunk.functionCalls) {
            const name = fnCall.name?.trim() || 'generic_tool';
            if (fnCall.id && !fnCall.id.startsWith(`${name}__`)) {
              fnCall.id = `${name}__${fnCall.id}`;
            }
          }
          legacyFunctionCalls.push(...chunk.functionCalls);
        }
      }
      if (isValidResponse(chunk)) {
        const content = chunk.candidates?.[0]?.content;
        if (content?.parts) {
          if (content.parts.some((part) => part.thought)) {
            // Record thoughts
            hasThoughts = true;
            const thought = this.extractThoughtFromContent(content);
            if (thought) {
              bufferedThoughts.push(thought);
            }
          }
          if (content.parts.some((part) => part.functionCall)) {
            hasToolCall = true;
          }

          let localFunctionCallCounter = 0;
          modelResponseParts.push(
            ...content.parts
              .filter((part) => !part.thought)
              .map((part) => {
                if (!this.context.config.isContextManagementEnabled()) {
                  return part;
                }
                let callIndex: number | undefined;
                if (part.functionCall) {
                  callIndex =
                    currentChunkStartCounter + localFunctionCallCounter++;
                }
                return {
                  ...part,
                  callIndex,
                };
              }),
          );
        }
      }

      // Buffer token usage if this chunk has usageMetadata
      if (chunk.usageMetadata) {
        bufferedUsageMetadata = chunk.usageMetadata;
      }

      const hookSystem = this.context.config.getHookSystem();
      if (originalRequest && chunk && hookSystem) {
        const hookResult = await hookSystem.fireAfterModelEvent(
          originalRequest,
          chunk,
        );

        if (hookResult.stopped) {
          throw new AgentExecutionStoppedError(
            hookResult.reason || 'Agent execution stopped by hook',
          );
        }

        if (hookResult.blocked) {
          throw new AgentExecutionBlockedError(
            hookResult.reason || 'Agent execution blocked by hook',
            hookResult.response,
          );
        }

        yield hookResult.response;
      } else {
        yield chunk;
      }
    }

    // String thoughts and consolidate text parts.
    const consolidatedParts: Part[] = [];
    const finalFunctionCalls = this.context.config.isContextManagementEnabled()
      ? Array.from(finalFunctionCallsMap.values())
      : legacyFunctionCalls;

    let currentCallSourceIndex = -1;
    if (this.context.config.isContextManagementEnabled()) {
      for (const part of modelResponseParts) {
        if (part.functionCall) {
          const partIndex = isIndexedPart(part) ? part.callIndex : undefined;
          const isNewCall =
            partIndex !== undefined && partIndex > currentCallSourceIndex;

          if (isNewCall) {
            currentCallSourceIndex = partIndex;
            consolidatedParts.push({ ...part }); // Push placeholder
          }
        } else {
          const lastPart = consolidatedParts[consolidatedParts.length - 1];
          if (
            lastPart?.text &&
            isValidNonThoughtTextPart(lastPart) &&
            isValidNonThoughtTextPart(part)
          ) {
            lastPart.text += part.text;
          } else {
            consolidatedParts.push(part);
          }
        }
      }

      // Now, replace the placeholders with the perfectly assembled final arguments
      if (finalFunctionCalls.length > 0) {
        let callIndex = 0;
        for (const part of consolidatedParts) {
          if (part.functionCall && callIndex < finalFunctionCalls.length) {
            part.functionCall = finalFunctionCalls[callIndex];
            callIndex++;
          }
        }
      }
    } else {
      // Fallback to legacy consolidation for non-context-manager users
      for (const part of modelResponseParts) {
        const lastPart = consolidatedParts[consolidatedParts.length - 1];
        if (
          lastPart?.text &&
          isValidNonThoughtTextPart(lastPart) &&
          isValidNonThoughtTextPart(part)
        ) {
          lastPart.text += part.text;
        } else {
          consolidatedParts.push(part);
        }
      }
    }

    const rawResponseText = consolidatedParts
      .filter((part) => part.text)
      .map((part) => part.text)
      .join('');

    // Clean zero-width/invisible characters and HTML comments to determine actual printable/visible content
    let responseText = rawResponseText.replace(
      /[\u200B-\u200D\uFEFF\u200E\u200F]/g,
      '',
    );
    let previous: string;
    do {
      previous = responseText;
      responseText = responseText.replace(/<!--[\s\S]*?-->/g, '');
    } while (responseText !== previous);
    responseText = responseText.trim();

    // Stream validation logic: A stream is considered successful if:
    // 1. There's a tool call OR
    // 2. A not MALFORMED_FUNCTION_CALL finish reason and a non-mepty resp
    //
    // We throw an error only when there's no tool call AND:
    // - No finish reason, OR
    // - MALFORMED_FUNCTION_CALL finish reason OR
    // - Empty response text (e.g., only thoughts with no actual content)
    if (!hasToolCall) {
      if (!finishReason) {
        if (!isOriginalFunctionResponse) {
          throw new InvalidStreamError(
            'Model stream ended without a finish reason.',
            'NO_FINISH_REASON',
          );
        }
      }
      if (finishReason === FinishReason.MALFORMED_FUNCTION_CALL) {
        throw new InvalidStreamError(
          'Model stream ended with malformed function call.',
          'MALFORMED_FUNCTION_CALL',
        );
      }
      if (finishReason === FinishReason.UNEXPECTED_TOOL_CALL) {
        throw new InvalidStreamError(
          'Model stream ended with unexpected tool call.',
          'UNEXPECTED_TOOL_CALL',
        );
      }
      if (!responseText) {
        if (finishReason === FinishReason.MAX_TOKENS) {
          throw new InvalidStreamError(
            'Model stream ended due to token limit exhaustion (MAX_TOKENS) with empty response text.',
            'MAX_TOKENS_EXCEEDED',
          );
        }
        if (finishReason === FinishReason.SAFETY) {
          throw new InvalidStreamError(
            'Model stream ended due to safety settings (SAFETY) with empty response text.',
            'SAFETY_BLOCKED',
          );
        }
        if (finishReason === FinishReason.RECITATION) {
          throw new InvalidStreamError(
            'Model stream ended due to recitation settings (RECITATION) with empty response text.',
            'RECITATION_BLOCKED',
          );
        }
        if (finishReason === FinishReason.OTHER) {
          throw new InvalidStreamError(
            'Model stream ended due to other settings (OTHER) with empty response text.',
            'OTHER_BLOCKED',
          );
        }
        if (hasThoughts) {
          throw new InvalidStreamError(
            'Model stream ended with empty response text but contained reasoning thoughts.',
            'THINKING_ONLY_RESPONSE',
          );
        }
        if (!isOriginalFunctionResponse) {
          throw new InvalidStreamError(
            'Model stream ended with empty response text.',
            'NO_RESPONSE_TEXT',
          );
        }
      }
    }

    // Flush buffered thoughts from the successful attempt
    for (const thought of bufferedThoughts) {
      this.chatRecordingService.recordThought(thought);
    }

    // Flush buffered usage metadata and token counts from the successful attempt
    if (bufferedUsageMetadata) {
      this.chatRecordingService.recordMessageTokens(bufferedUsageMetadata);
      if (bufferedUsageMetadata.promptTokenCount !== undefined) {
        this.lastPromptTokenCount = bufferedUsageMetadata.promptTokenCount;
      }
    }

    let id: string;
    // Record model response text from the collected parts.
    // Also flush when there are thoughts or a tool call (even with no text)
    // so that BeforeTool hooks always see the latest transcript state.
    if (responseText || hasThoughts || hasToolCall) {
      id = this.chatRecordingService.recordMessage({
        model,
        type: 'gemini',
        content: responseText,
      });
    } else {
      // Still need a durable ID even if response is empty (e.g. only tool calls)
      id = this.chatRecordingService.recordSyntheticMessage(
        'gemini',
        consolidatedParts,
      );
    }

    this.agentHistory.push({
      id,
      content: { role: 'model', parts: consolidatedParts },
    });
  }

  getLastPromptTokenCount(): number {
    return this.lastPromptTokenCount;
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
  recordCompletedToolCalls(
    model: string,
    toolCalls: CompletedToolCall[],
  ): void {
    const toolCallRecords = toolCalls.map((call) => {
      const resultDisplayRaw = call.response?.resultDisplay;
      const resultDisplay =
        typeof resultDisplayRaw === 'string' ||
        (typeof resultDisplayRaw === 'object' && resultDisplayRaw !== null)
          ? resultDisplayRaw
          : undefined;

      return {
        id: call.request.callId,
        name: call.request.originalRequestName ?? call.request.name,
        args: call.request.originalRequestArgs ?? call.request.args,
        result: call.response?.responseParts || null,
        status: call.status,
        timestamp: new Date().toISOString(),
        agentId:
          typeof call.response?.data?.['agentId'] === 'string'
            ? call.response.data['agentId']
            : undefined,
        resultDisplay,
        description:
          'invocation' in call ? call.invocation?.getDescription() : undefined,
      };
    });

    this.chatRecordingService.recordToolCalls(model, toolCallRecords);
  }

  /**
   * Extracts thought from thought content.
   */
  private extractThoughtFromContent(
    content: Content,
  ): { subject: string; description: string } | undefined {
    if (!content.parts || content.parts.length === 0) {
      return undefined;
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

      return {
        subject,
        description,
      };
    }
    return undefined;
  }
}

/** Visible for Testing */
export function isSchemaDepthError(errorMessage: string): boolean {
  return errorMessage.includes('maximum schema depth exceeded');
}

export function isInvalidArgumentError(errorMessage: string): boolean {
  return errorMessage.includes('Request contains an invalid argument');
}

export function stripToolCallIdPrefixes(contents: Content[]): Content[] {
  return contents.map((content) => ({
    ...content,
    parts: (content.parts || []).map((part) => {
      const newPart = { ...part };
      if (newPart.functionCall) {
        const fc = newPart.functionCall;
        const name = fc.name?.trim() || 'generic_tool';
        if (fc.id && fc.id.startsWith(`${name}__`)) {
          newPart.functionCall = {
            name: fc.name,
            args: fc.args,
            id: fc.id.substring(name.length + 2),
          };
        }
      }
      if (newPart.functionResponse) {
        const fr = newPart.functionResponse;
        const name = fr.name?.trim() || 'generic_tool';
        if (fr.id && fr.id.startsWith(`${name}__`)) {
          newPart.functionResponse = {
            name: fr.name,
            response: fr.response,
            id: fr.id.substring(name.length + 2),
          };
        }
      }
      return newPart;
    }),
  }));
}

export function coalesceConsecutiveRoles(
  history: HistoryTurn[],
): HistoryTurn[] {
  const result: HistoryTurn[] = [];
  for (const turn of history) {
    const lastIdx = result.length - 1;
    const last = result[lastIdx];
    if (last && last.content.role && last.content.role === turn.content.role) {
      const hasParts = last.content.parts || turn.content.parts;
      result[lastIdx] = {
        id: last.id,
        content: {
          ...last.content,
          parts: hasParts
            ? [...(last.content.parts || []), ...(turn.content.parts || [])]
            : undefined,
        },
      };
    } else {
      result.push({
        id: turn.id,
        content: { ...turn.content },
      });
    }
  }
  return result;
}

export function stripThoughts(history: HistoryTurn[]): HistoryTurn[] {
  return history
    .map((turn) => {
      if (!turn.content.parts) return turn;
      const hasThought = turn.content.parts.some((p) => p && p.thought);
      if (!hasThought) return turn;

      const nonThoughtParts = turn.content.parts.filter((p) => p && !p.thought);

      // The thoughtSignature the API requires on the first functionCall of a
      // model turn is sometimes only carried by the thought part we just
      // removed, not by the functionCall part itself. Without it, replaying
      // this turn in a later request gets rejected with a 400 "missing
      // thought_signature" error, so inject a synthetic one if needed.
      let patchedFirstCall = false;
      const finalParts =
        turn.content.role === 'model'
          ? nonThoughtParts.map((p) => {
              if (!patchedFirstCall && p.functionCall) {
                patchedFirstCall = true;
                if (!p.thoughtSignature) {
                  return {
                    ...p,
                    thoughtSignature: SYNTHETIC_THOUGHT_SIGNATURE,
                  };
                }
              }
              return p;
            })
          : nonThoughtParts;

      return {
        ...turn,
        content: {
          ...turn.content,
          parts: finalParts,
        },
      };
    })
    .filter((turn) => !turn.content.parts || turn.content.parts.length > 0);
}
