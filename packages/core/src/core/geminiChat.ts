/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
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
} from '@google/genai';
import { toParts } from '../code_assist/converter.js';
import { retryWithBackoff } from '../utils/retry.js';
import type { ValidationRequiredError } from '../utils/googleQuotaErrors.js';
import type { Config } from '../config/config.js';
import {
  resolveModel,
  supportsModernFeatures,
} from '../config/models.js';
import { hasCycleInSchema } from '../tools/tools.js';
import type { StructuredError } from './turn.js';
import type { CompletedToolCall } from './coreToolScheduler.js';
import {
  ChatRecordingService,
  type ResumedSessionData,
} from '../services/chatRecordingService.js';
import {
  type LlmRole,
} from '../telemetry/types.js';
import { handleFallback } from '../fallback/handler.js';
import { isFunctionResponse } from '../utils/messageInspectors.js';
import { partListUnionToString } from './geminiRequest.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';
import {
  applyModelSelection,
  createAvailabilityContextProvider,
} from '../availability/policyHelpers.js';
import { coreEvents } from '../utils/events.js';
import { HistoryManager, isValidContent } from './historyManager.js';
import { HistorySideEffectApplicator } from './sideEffectApplicator.js';
import { debugLogger } from '../utils/debugLogger.js';
import { SideEffectType, type SideEffectService } from './sideEffectService.js';

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

export const SYNTHETIC_THOUGHT_SIGNATURE = 'skip_thought_signature_validator';

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
    !part.functionCall &&
    !part.functionResponse &&
    !part.inlineData &&
    !part.fileData
  );
}

/**
 * Custom error to signal that a stream completed with invalid content.
 */
export class InvalidStreamError extends Error {
  readonly type: string;

  constructor(message: string, type: string) {
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
 * Chat session that enables sending messages to the model.
 */
export class GeminiChat {
  private sendPromise: Promise<void> = Promise.resolve();
  private readonly chatRecordingService: ChatRecordingService;
  private lastPromptTokenCount: number;
  private streamingDepth = 0;
  private pendingHistory: Content[] | null = null;
  private readonly historyManager: HistoryManager;
  private readonly sideEffectService: SideEffectService;
  private readonly applicator: HistorySideEffectApplicator;
  private repromptRequested = false;

  constructor(
    private readonly config: Config,
    private systemInstruction: string = '',
    private tools: Tool[] = [],
    history: Content[] = [],
    resumedSessionData?: ResumedSessionData,
    private readonly onModelChanged?: (modelId: string) => Promise<Tool[]>,
    kind: 'main' | 'subagent' = 'main',
  ) {
    this.historyManager = new HistoryManager(history);
    this.sideEffectService = config.getSideEffectService();
    this.applicator = new HistorySideEffectApplicator(this.historyManager);
    this.chatRecordingService = new ChatRecordingService(config);
    this.chatRecordingService.initialize(resumedSessionData, kind);
    this.lastPromptTokenCount = estimateTokenCountSync(
      this.historyManager
        .getComprehensiveHistory()
        .flatMap((c) => c.parts || []),
    );
  }

  /**
   * Logs the projected history sent to the API to a side-channel file for anomaly analysis.
   */
  private logRequestHistory(
    requestContents: Content[],
    promptId: string,
  ): void {
    try {
      const logDir = path.join(
        process.cwd(),
      );
      const logFile = path.join(
        logDir,
        process.env['REQUEST_LOG_FILE'] ?? 'requests.log',
      );
      if (!fs.existsSync(logFile)) {
        fs.writeFileSync(logFile, `si:\n${this.systemInstruction}\n`);
      }
      fs.appendFileSync(logFile, `prompt ${promptId}:\n${JSON.stringify(requestContents, null, 2)}\n`);
      debugLogger.debug(
        `[PROJECT CLARITY] Request history logged to ${logFile}`,
      );
    } catch (error) {
      debugLogger.warn(
        `[PROJECT CLARITY] Failed to log request history: ${error}`,
      );
    }
  }

  /**
   * Marks a specific tool call ID for elision from the history.
   */
  addElidedCallId(callId: string): void {
    this.historyManager.addElidedCallId(callId);
  }

  getContinuityAnchor(): string | undefined {
    return this.historyManager.getContinuityAnchor();
  }

  setSystemInstruction(sysInstr: string) {
    this.systemInstruction = sysInstr;
  }

  async sendMessageStream(
    modelConfigKey: ModelConfigKey,
    message: PartListUnion,
    prompt_id: string,
    signal: AbortSignal,
    role: LlmRole,
    displayContent?: PartListUnion,
    turnId?: string,
  ): Promise<AsyncGenerator<StreamEvent>> {
    if (!turnId) {
      throw new Error("Turn ID is now required");
    }
    await this.sendPromise;

    let streamDoneResolver: () => void;
    const streamDonePromise = new Promise<void>((resolve) => {
      streamDoneResolver = resolve;
    });
    this.sendPromise = streamDonePromise;

    if (this.streamingDepth === 0) {
      // Flush any bootstrap side-effects (like session context) before starting the first turn.
      this.applyPendingSideEffects();
      if (turnId) {
        this.sideEffectService.setCurrentTurnId(turnId);
        debugLogger.debug(`[PROJECT CLARITY] Starting turn ${turnId}`);
      }
    }

    const userContent = createUserContent(message);
    const { model } =
      this.config.modelConfigService.getResolvedConfig(modelConfigKey);

    // Record user input
    if (!isFunctionResponse(userContent)) {
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

      this.chatRecordingService.recordMessage({
        model,
        type: 'user',
        content: userMessageParts,
        displayContent: finalDisplayContent,
      });
    }

    const requestContents =
      this.historyManager.getHistoryForRequest(userContent);

    // PROJECT CLARITY: Side-channel request logging.
    this.logRequestHistory(requestContents, prompt_id);

    const stream = async function* (
      this: GeminiChat,
    ): AsyncGenerator<StreamEvent, void, void> {
      this.streamingDepth++;
      try {
        const apiStream = await this.makeApiCallAndProcessStream(
          modelConfigKey,
          requestContents,
          prompt_id,
          signal,
          role,
          userContent,
        );

        for await (const chunk of apiStream) {
          yield { type: StreamEventType.CHUNK, value: chunk };
        }
      } catch (error) {
        if (error instanceof AgentExecutionStoppedError) {
          yield {
            type: StreamEventType.AGENT_EXECUTION_STOPPED,
            reason: error.reason,
          };
          return;
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
          return;
        }

        throw error;
      } finally {
        this.streamingDepth--;
        if (this.streamingDepth === 0) {
          // IMPORTANT: Side effects (like ELIDE_TURN) are flushed here.
          this.applyPendingSideEffects();
        }
        streamDoneResolver!();
      }
    };

    return stream.call(this);
  }

  isCurrentTurnElided(): boolean {
    const currentTurnId = this.sideEffectService.getCurrentTurnId();
    if (!currentTurnId) {
      debugLogger.debug('[PROJECT CLARITY] isCurrentTurnElided: No current turn ID');
      return false;
    }
  
    const historyElided = this.historyManager.isTurnElided(currentTurnId);
    const pendingIds = this.sideEffectService.getPendingElidedTurnIds();
    const pendingElided = pendingIds.has(currentTurnId);
    debugLogger.debug(`[PROJECT CLARITY] isCurrentTurnElided(${currentTurnId}): history=${historyElided}, pending=${pendingElided} (pendingIds: ${Array.from(pendingIds).join(', ')})`);
    return historyElided || pendingElided;
  }

  /**
   * Applies all pending side-effects from the SideEffectService.
   * Returns true if a re-prompt was requested.
   */
  private applyPendingSideEffects(): boolean {
    if (this.pendingHistory) {
      this.replaceHistory(this.pendingHistory);
      this.pendingHistory = null;
    }

    const effects = this.sideEffectService.flush();
    const requested = effects.some(
      (e) => e.type === SideEffectType.REPROMPT,
    );
    if (requested) {
      debugLogger.debug('[PROJECT CLARITY] Re-prompt requested via side-effects');
    }

    this.repromptRequested = this.repromptRequested || requested;
    this.applicator.apply(effects);
    return requested;
  }

  /**
   * Consumes the re-prompt request signal.
   */
  consumeRepromptRequest(): boolean {
    const requested = this.repromptRequested;
    this.repromptRequested = false;
    return requested;
  }

  private async makeApiCallAndProcessStream(
    modelConfigKey: ModelConfigKey,
    requestContents: Content[],
    prompt_id: string,
    abortSignal: AbortSignal,
    role: LlmRole,
    userContent: Content,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const contentsForPreviewModel =
      this.ensureActiveLoopHasThoughtSignatures(requestContents);

    // Track final request parameters for AfterModel hooks
    const {
      model: availabilityFinalModel,
      config: newAvailabilityConfig,
      maxAttempts: availabilityMaxAttempts,
    } = applyModelSelection(this.config, modelConfigKey);

    let lastModelToUse = availabilityFinalModel;
    let currentGenerateContentConfig: GenerateContentConfig =
      newAvailabilityConfig;
    let lastConfig: GenerateContentConfig = currentGenerateContentConfig;
    let lastContentsToUse: Content[] = requestContents;

    const getAvailabilityContext = createAvailabilityContextProvider(
      this.config,
      () => lastModelToUse,
    );
    // Track initial active model to detect fallback changes
    const initialActiveModel = this.config.getActiveModel();

    const apiCall = async () => {
      const useGemini3_1 = (await this.config.getGemini31Launched?.()) ?? false;
      // Default to the last used model (which respects arguments/availability selection)
      let modelToUse = resolveModel(lastModelToUse, useGemini3_1);

      // If the active model has changed (e.g. due to a fallback updating the config),
      // we switch to the new active model.
      if (this.config.getActiveModel() !== initialActiveModel) {
        modelToUse = resolveModel(this.config.getActiveModel(), useGemini3_1);
      }

      if (modelToUse !== lastModelToUse) {
        const { generateContentConfig: newConfig } =
          this.config.modelConfigService.getResolvedConfig({
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

      let contentsToUse = supportsModernFeatures(modelToUse)
        ? contentsForPreviewModel
        : requestContents;

      const hookSystem = this.config.getHookSystem();
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

      return this.config.getContentGenerator().generateContentStream(
        {
          model: modelToUse,
          contents: contentsToUse,
          config,
        },
        prompt_id,
        role,
      );
    };

    const onPersistent429Callback = async (
      authType?: string,
      error?: unknown,
    ) => handleFallback(this.config, lastModelToUse, authType, error);

    const onValidationRequiredCallback = async (
      validationError: ValidationRequiredError,
    ) => {
      const handler = this.config.getValidationHandler();
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
      authType: this.config.getContentGeneratorConfig()?.authType,
      retryFetchErrors: this.config.getRetryFetchErrors(),
      signal: abortSignal,
      maxAttempts: availabilityMaxAttempts ?? this.config.getMaxAttempts(),
      getAvailabilityContext,
      onRetry: (attempt, error, delayMs) => {
        coreEvents.emitRetryAttempt({
          attempt,
          maxAttempts: availabilityMaxAttempts ?? this.config.getMaxAttempts(),
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
      userContent,
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
  /**
   * Replaces the entire conversation history. Use with caution.
   * This is primarily used for context compression and history restoration.
   */
  replaceHistory(newHistory: Content[]): void {
    if (this.streamingDepth > 0) {
      this.pendingHistory = newHistory;
      return;
    }
    this.historyManager.replaceHistory(newHistory);
    this.lastPromptTokenCount = estimateTokenCountSync(
      this.historyManager
        .getComprehensiveHistory()
        .flatMap((c) => (c.parts || []) as Part[]),
    );
  }

  getHistory(curated: boolean = false): Content[] {
    return this.historyManager.getProjection({
      curated,
      addMetadata: true,
      sessionId: this.config.getSessionId(),
    });
  }

  getComprehensiveHistory(): Content[] {
    return this.historyManager.getComprehensiveHistory();
  }

  getConfig(): Config {
    return this.config;
  }

  /**
   * Clears the chat history.
   */
  clearHistory(): void {
    this.historyManager.clearHistory();
  }

  /**
   * Adds a new entry to the chat history.
   */
  addHistory(content: Content): void {
    this.historyManager.addMessage(content);
  }

  setHistory(history: Content[]): void {
    this.historyManager.replaceHistory(history);
    this.lastPromptTokenCount = estimateTokenCountSync(
      this.historyManager
        .getComprehensiveHistory()
        .flatMap((c) => c.parts || []),
    );
    this.chatRecordingService.updateMessagesFromHistory(history);
  }

  stripThoughtsFromHistory(): void {
    const history = this.historyManager
      .getComprehensiveHistory()
      .map((content) => {
        const newContent = { ...content };
        if (newContent.parts) {
          newContent.parts = newContent.parts.map((part: Part) => {
            if (
              part &&
              typeof part === 'object' &&
              'thoughtSignature' in part
            ) {
              const newPart = { ...part };
              delete (newPart as { thoughtSignature?: string }).thoughtSignature;
              return newPart;
            }
            return part;
          });
        }
        return newContent;
      });
    this.historyManager.replaceHistory(history);
  }

  // To ensure our requests validate, the first function call in every model
  // turn within the active loop must have a `thoughtSignature` property.
  // If we do not do this, we will get back 400 errors from the API.
  ensureActiveLoopHasThoughtSignatures(requestContents: Content[]): Content[] {
    // First, find the start of the active loop by finding the last user turn
    // with a text message, i.e. that is not a function response.
    let activeLoopStartIndex = -1;
    for (let i = requestContents.length - 1; i >= 0; i--) {
      const content = requestContents[i];
      if (content.role === 'user' && content.parts?.some((part) => part.text)) {
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
    model: string,
    streamResponse: AsyncGenerator<GenerateContentResponse>,
    originalRequest: GenerateContentParameters,
    userContent: Content,
  ): AsyncGenerator<GenerateContentResponse> {
    const modelResponseParts: Part[] = [];

    let hasToolCall = false;
    let hasThoughts = false;
    let finishReason: FinishReason | undefined;
    let callCounter = 0;

    const currentTurnId = this.sideEffectService.getCurrentTurnId();

    // PROJECT CLARITY: Normalize user content (function responses).
    // Note: We don't 'invent' IDs for responses; they should already have been 
    // tagged by the Tool Scheduler using the ID we injected into the call.
    if (userContent.parts) {
      for (const part of userContent.parts) {
        if (part.functionResponse && !part.functionResponse.id) {
          debugLogger.warn(
            `[PROJECT CLARITY] User functionResponse missing ID in turn ${currentTurnId}. This indicates a breakdown in the ID lifecycle.`,
          );
        }
      }
    }

    // PROJECT CLARITY: Add user content (including function responses) to history EARLY.
    // This allows meta-tools like distill_result to find the response they are distilling.
    if (isValidContent(userContent)) {
      this.historyManager.addMessage(userContent, currentTurnId);
    }

    for await (const chunk of streamResponse) {
      const candidateWithReason = chunk?.candidates?.find(
        (candidate) => candidate.finishReason,
      );
      if (candidateWithReason) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        finishReason = candidateWithReason.finishReason as FinishReason;
      }

      if (isValidResponse(chunk)) {
        const content = chunk.candidates?.[0]?.content;
        if (content?.parts) {
          if (content.parts.some((part) => part.thought)) {
            // Record thoughts
            hasThoughts = true;
            this.recordThoughtFromContent(content);
          }

          // PROJECT CLARITY: Inject call IDs if missing.
          // This ensures that the history contains the same IDs that Turn.ts will consume.
          for (const part of content.parts) {
            if (part.functionCall) {
              hasToolCall = true;
              if (!part.functionCall.id) {
                const generatedId = `${part.functionCall.name}_${Date.now()}_${callCounter++}`;
                part.functionCall.id = generatedId;
                debugLogger.debug(
                  `[PROJECT CLARITY] Airlock: Injected callId into part: ${generatedId}`,
                );
              }
              // Always pre-register, even if ID was already present (e.g. from a resumed session)
              if (currentTurnId) {
                this.historyManager.preRegisterCallId(
                  part.functionCall.id,
                  currentTurnId,
                );
              }
            }
          }

          modelResponseParts.push(...content.parts);
        }
      }

      // Record token usage if this chunk has usageMetadata
      if (chunk.usageMetadata) {
        this.chatRecordingService.recordMessageTokens(chunk.usageMetadata);
        if (chunk.usageMetadata.promptTokenCount !== undefined) {
          this.lastPromptTokenCount = chunk.usageMetadata.promptTokenCount;
        }
      }

      const hookSystem = this.config.getHookSystem();
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

    const responseText = consolidatedParts
      .filter((part) => part.text)
      .map((part) => part.text)
      .join('')
      .trim();

    // Record model response text from the collected parts.
    // Also flush when there are thoughts or a tool call (even with no text)
    // so that BeforeTool hooks always see the latest transcript state.
    if (responseText || hasThoughts || hasToolCall) {
      this.chatRecordingService.recordMessage({
        model,
        type: 'gemini',
        content: responseText,
      });
    }

    // Stream validation logic: A stream is considered successful if:
    // 1. There's a tool call OR
    // 2. We have a valid finish reason AND no critical errors.
    //
    // We throw an error only when there's no tool call AND:
    // - No finish reason, OR
    // - MALFORMED_FUNCTION_CALL finish reason.
    if (!hasToolCall) {
      if (!finishReason) {
        throw new InvalidStreamError(
          'Model stream ended without a finish reason.',
          'NO_FINISH_REASON',
        );
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
    }

    const turnId = this.sideEffectService.getCurrentTurnId();
    if (isValidContent({ role: 'model', parts: consolidatedParts })) {
      this.historyManager.addMessage(
        { role: 'model', parts: consolidatedParts },
        turnId,
      );
    }

    // PROJECT CLARITY: Flush side effects (like ELIDE_TURN) AFTER adding this turn to history.
    // This allows meta-tools to elide themselves by finding their own call IDs in the history maps.
    debugLogger.debug(`[PROJECT CLARITY] Flushing side effects for turn ${turnId}`);
    this.applyPendingSideEffects();

    const isElided = turnId ? this.historyManager.isTurnElided(turnId) : false;
    debugLogger.debug(`[PROJECT CLARITY] turn ${turnId} elided status: ${isElided}`);
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
        name: call.request.name,
        args: call.request.args,
        result: call.response?.responseParts || null,
        status: call.status,
        timestamp: new Date().toISOString(),
        resultDisplay,
      };
    });

    this.chatRecordingService.recordToolCalls(model, toolCallRecords);

    // PROJECT CLARITY: Flush side effects after tool calls are recorded.
    // This allows tools that were just executed to apply their elisions/reprompts.
    debugLogger.debug(`[PROJECT CLARITY] Flushing side effects in recordCompletedToolCalls for turn ${this.sideEffectService.getCurrentTurnId()}`);
    this.applyPendingSideEffects();
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
