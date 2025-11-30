/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentConfig,
  PartListUnion,
  Content,
  Tool,
  GenerateContentResponse,
} from '@google/genai';
import {
  getDirectoryContextString,
  getInitialChatHistory,
} from '../utils/environmentContext.js';
import type { ServerGeminiStreamEvent, ChatCompressionInfo } from './turn.js';
import { CompressionStatus } from './turn.js';
import { Turn, GeminiEventType } from './turn.js';
import type { Config } from '../config/config.js';
import { getCoreSystemPrompt } from './prompts.js';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat } from './geminiChat.js';
import { retryWithBackoff } from '../utils/retry.js';
import { getErrorMessage } from '../utils/errors.js';
import { tokenLimit } from './tokenLimits.js';
import type {
  ChatRecordingService,
  ResumedSessionData,
} from '../services/chatRecordingService.js';
import type { ContentGenerator } from './contentGenerator.js';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  getEffectiveModel,
} from '../config/models.js';
import { LoopDetectionService } from '../services/loopDetectionService.js';
import {
  ChatCompressionService,
  type CompressionOptions,
} from '../services/chatCompressionService.js';
import { DeliberateCompressionOrchestrator } from '../services/deliberateCompressionOrchestrator.js';
import { ideContextStore } from '../ide/ideContext.js';
import {
  logContentRetryFailure,
  logNextSpeakerCheck,
} from '../telemetry/loggers.js';
import {
  fireBeforeAgentHook,
  fireAfterAgentHook,
} from './clientHookTriggers.js';
import {
  ContentRetryFailureEvent,
  NextSpeakerCheckEvent,
} from '../telemetry/types.js';
import { uiTelemetryService } from '../telemetry/uiTelemetry.js';
import type { IdeContext, File } from '../ide/types.js';
import { handleFallback } from '../fallback/handler.js';
import type { RoutingContext } from '../routing/routingStrategy.js';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents } from '../utils/events.js'; // Import coreEvents

import type { ModelConfigKey } from '../services/modelConfigService.js';
import { calculateRequestTokenCount } from '../utils/tokenCalculation.js';

const MAX_TURNS = 100;

export class GeminiClient {
  private chat?: GeminiChat;
  private sessionTurnCount = 0;

  private readonly loopDetector: LoopDetectionService;
  private readonly compressionService: ChatCompressionService;
  private readonly deliberateCompressionOrchestrator: DeliberateCompressionOrchestrator;
  private lastPromptId: string;
  private currentSequenceModel: string | null = null;
  private lastSentIdeContext: IdeContext | undefined;
  private forceFullIdeContext = true;

  /**
   * At any point in this conversation, was compression triggered without
   * being forced and did it fail?
   */
  private hasFailedCompressionAttempt = false;

  /**
   * Track state for hybrid trigger system
   */
  private messagesSinceLastCompress = 0;
  private lastCompressionTime = 0;
  private isCompressing = false;

  constructor(private readonly config: Config) {
    this.loopDetector = new LoopDetectionService(config);
    this.compressionService = new ChatCompressionService();
    this.deliberateCompressionOrchestrator =
      new DeliberateCompressionOrchestrator();
    this.lastPromptId = this.config.getSessionId();
  }

  private updateTelemetryTokenCount() {
    if (this.chat) {
      uiTelemetryService.setLastPromptTokenCount(
        this.chat.getLastPromptTokenCount(),
      );
    }
  }

  async initialize() {
    this.chat = await this.startChat();
    this.updateTelemetryTokenCount();
  }

  private getContentGeneratorOrFail(): ContentGenerator {
    if (!this.config.getContentGenerator()) {
      throw new Error('Content generator not initialized');
    }
    return this.config.getContentGenerator();
  }

  async addHistory(content: Content) {
    this.getChat().addHistory(content);
  }

  getChat(): GeminiChat {
    if (!this.chat) {
      throw new Error('Chat not initialized');
    }
    return this.chat;
  }

  isInitialized(): boolean {
    return this.chat !== undefined;
  }

  getHistory(): Content[] {
    return this.getChat().getHistory();
  }

  stripThoughtsFromHistory() {
    this.getChat().stripThoughtsFromHistory();
  }

  setHistory(history: Content[]) {
    this.getChat().setHistory(history);
    this.forceFullIdeContext = true;
  }

  async setTools(): Promise<void> {
    const toolRegistry = this.config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations();
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
    this.getChat().setTools(tools);
  }

  async resetChat(): Promise<void> {
    this.chat = await this.startChat();
    this.updateTelemetryTokenCount();
  }

  async resumeChat(
    history: Content[],
    resumedSessionData?: ResumedSessionData,
  ): Promise<void> {
    this.chat = await this.startChat(history, resumedSessionData);
  }

  getChatRecordingService(): ChatRecordingService | undefined {
    return this.chat?.getChatRecordingService();
  }

  getLoopDetectionService(): LoopDetectionService {
    return this.loopDetector;
  }

  getCurrentSequenceModel(): string | null {
    return this.currentSequenceModel;
  }

  async addDirectoryContext(): Promise<void> {
    if (!this.chat) {
      return;
    }

    this.getChat().addHistory({
      role: 'user',
      parts: [{ text: await getDirectoryContextString(this.config) }],
    });
  }

  async updateSystemInstruction(): Promise<void> {
    if (!this.isInitialized()) {
      return;
    }

    const userMemory = this.config.getUserMemory();
    const systemInstruction = getCoreSystemPrompt(this.config, userMemory);
    this.getChat().setSystemInstruction(systemInstruction);
  }

  async startChat(
    extraHistory?: Content[],
    resumedSessionData?: ResumedSessionData,
  ): Promise<GeminiChat> {
    this.forceFullIdeContext = true;
    this.hasFailedCompressionAttempt = false;

    const toolRegistry = this.config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations();
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];

    const history = await getInitialChatHistory(this.config, extraHistory);

    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(this.config, userMemory);
      return new GeminiChat(
        this.config,
        systemInstruction,
        tools,
        history,
        resumedSessionData,
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

  private getIdeContextParts(forceFullContext: boolean): {
    contextParts: string[];
    newIdeContext: IdeContext | undefined;
  } {
    const currentIdeContext = ideContextStore.get();
    if (!currentIdeContext) {
      return { contextParts: [], newIdeContext: undefined };
    }

    if (forceFullContext || !this.lastSentIdeContext) {
      // Send full context as JSON
      const openFiles = currentIdeContext.workspaceState?.openFiles || [];
      const activeFile = openFiles.find((f) => f.isActive);
      const otherOpenFiles = openFiles
        .filter((f) => !f.isActive)
        .map((f) => f.path);

      const contextData: Record<string, unknown> = {};

      if (activeFile) {
        contextData['activeFile'] = {
          path: activeFile.path,
          cursor: activeFile.cursor
            ? {
                line: activeFile.cursor.line,
                character: activeFile.cursor.character,
              }
            : undefined,
          selectedText: activeFile.selectedText || undefined,
        };
      }

      if (otherOpenFiles.length > 0) {
        contextData['otherOpenFiles'] = otherOpenFiles;
      }

      if (Object.keys(contextData).length === 0) {
        return { contextParts: [], newIdeContext: currentIdeContext };
      }

      const jsonString = JSON.stringify(contextData, null, 2);
      const contextParts = [
        "Here is the user's editor context as a JSON object. This is for your information only.",
        '```json',
        jsonString,
        '```',
      ];

      if (this.config.getDebugMode()) {
        debugLogger.log(contextParts.join('\n'));
      }
      return {
        contextParts,
        newIdeContext: currentIdeContext,
      };
    } else {
      // Calculate and send delta as JSON
      const delta: Record<string, unknown> = {};
      const changes: Record<string, unknown> = {};

      const lastFiles = new Map(
        (this.lastSentIdeContext.workspaceState?.openFiles || []).map(
          (f: File) => [f.path, f],
        ),
      );
      const currentFiles = new Map(
        (currentIdeContext.workspaceState?.openFiles || []).map((f: File) => [
          f.path,
          f,
        ]),
      );

      const openedFiles: string[] = [];
      for (const [path] of currentFiles.entries()) {
        if (!lastFiles.has(path)) {
          openedFiles.push(path);
        }
      }
      if (openedFiles.length > 0) {
        changes['filesOpened'] = openedFiles;
      }

      const closedFiles: string[] = [];
      for (const [path] of lastFiles.entries()) {
        if (!currentFiles.has(path)) {
          closedFiles.push(path);
        }
      }
      if (closedFiles.length > 0) {
        changes['filesClosed'] = closedFiles;
      }

      const lastActiveFile = (
        this.lastSentIdeContext.workspaceState?.openFiles || []
      ).find((f: File) => f.isActive);
      const currentActiveFile = (
        currentIdeContext.workspaceState?.openFiles || []
      ).find((f: File) => f.isActive);

      if (currentActiveFile) {
        if (!lastActiveFile || lastActiveFile.path !== currentActiveFile.path) {
          changes['activeFileChanged'] = {
            path: currentActiveFile.path,
            cursor: currentActiveFile.cursor
              ? {
                  line: currentActiveFile.cursor.line,
                  character: currentActiveFile.cursor.character,
                }
              : undefined,
            selectedText: currentActiveFile.selectedText || undefined,
          };
        } else {
          const lastCursor = lastActiveFile.cursor;
          const currentCursor = currentActiveFile.cursor;
          if (
            currentCursor &&
            (!lastCursor ||
              lastCursor.line !== currentCursor.line ||
              lastCursor.character !== currentCursor.character)
          ) {
            changes['cursorMoved'] = {
              path: currentActiveFile.path,
              cursor: {
                line: currentCursor.line,
                character: currentCursor.character,
              },
            };
          }

          const lastSelectedText = lastActiveFile.selectedText || '';
          const currentSelectedText = currentActiveFile.selectedText || '';
          if (lastSelectedText !== currentSelectedText) {
            changes['selectionChanged'] = {
              path: currentActiveFile.path,
              selectedText: currentSelectedText,
            };
          }
        }
      } else if (lastActiveFile) {
        changes['activeFileChanged'] = {
          path: null,
          previousPath: lastActiveFile.path,
        };
      }

      if (Object.keys(changes).length === 0) {
        return { contextParts: [], newIdeContext: currentIdeContext };
      }

      delta['changes'] = changes;
      const jsonString = JSON.stringify(delta, null, 2);
      const contextParts = [
        "Here is a summary of changes in the user's editor context, in JSON format. This is for your information only.",
        '```json',
        jsonString,
        '```',
      ];

      if (this.config.getDebugMode()) {
        debugLogger.log(contextParts.join('\n'));
      }
      return {
        contextParts,
        newIdeContext: currentIdeContext,
      };
    }
  }

  private _getEffectiveModelForCurrentTurn(): string {
    if (this.currentSequenceModel) {
      return this.currentSequenceModel;
    }

    const configModel = this.config.getModel();
    return getEffectiveModel(
      this.config.isInFallbackMode(),
      configModel,
      this.config.getPreviewFeatures(),
    );
  }

  async *sendMessageStream(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    turns: number = MAX_TURNS,
    isInvalidStreamRetry: boolean = false,
    onShowCompressionPrompt: (
      goals: string[],
      isSafetyValve: boolean,
    ) => Promise<string> = async () => 'auto',
    isTopLevelCall: boolean = true,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    // Fire BeforeAgent hook through MessageBus (only if hooks are enabled)
    const hooksEnabled = this.config.getEnableHooks();
    const messageBus = this.config.getMessageBus();
    if (hooksEnabled && messageBus) {
      const hookOutput = await fireBeforeAgentHook(messageBus, request);

      if (
        hookOutput?.isBlockingDecision() ||
        hookOutput?.shouldStopExecution()
      ) {
        yield {
          type: GeminiEventType.Error,
          value: {
            error: new Error(
              `BeforeAgent hook blocked processing: ${hookOutput.getEffectiveReason()}`,
            ),
          },
        };
        return new Turn(this.getChat(), prompt_id);
      }

      // Add additional context from hooks to the request
      const additionalContext = hookOutput?.getAdditionalContext();
      if (additionalContext) {
        const requestArray = Array.isArray(request) ? request : [request];
        request = [...requestArray, { text: additionalContext }];
      }
    }

    if (this.lastPromptId !== prompt_id) {
      this.loopDetector.reset(prompt_id);
      this.lastPromptId = prompt_id;
      this.currentSequenceModel = null;
    }
    this.sessionTurnCount++;

    // Track messages for compression guard (only count top-level user messages)
    if (isTopLevelCall) {
      this.messagesSinceLastCompress++;
    }
    if (
      this.config.getMaxSessionTurns() > 0 &&
      this.sessionTurnCount > this.config.getMaxSessionTurns()
    ) {
      yield { type: GeminiEventType.MaxSessionTurns };
      return new Turn(this.getChat(), prompt_id);
    }
    // Ensure turns never exceeds MAX_TURNS to prevent infinite loops
    const boundedTurns = Math.min(turns, MAX_TURNS);
    if (!boundedTurns) {
      return new Turn(this.getChat(), prompt_id);
    }

    // Check for context window overflow
    const modelForLimitCheck = this._getEffectiveModelForCurrentTurn();

    // Estimate tokens. For text-only requests, we estimate based on character length.
    // For requests with non-text parts (like images, tools), we use the countTokens API.
    const estimatedRequestTokenCount = await calculateRequestTokenCount(
      request,
      this.getContentGeneratorOrFail(),
      modelForLimitCheck,
    );

    const remainingTokenCount =
      tokenLimit(modelForLimitCheck) - this.getChat().getLastPromptTokenCount();

    if (estimatedRequestTokenCount > remainingTokenCount * 0.95) {
      yield {
        type: GeminiEventType.ContextWindowWillOverflow,
        value: { estimatedRequestTokenCount, remainingTokenCount },
      };
      return new Turn(this.getChat(), prompt_id);
    }

    // Prevent context updates from being sent while a tool call is
    // waiting for a response. The Gemini API requires that a functionResponse
    // part from the user immediately follows a functionCall part from the model
    // in the conversation history . The IDE context is not discarded; it will
    // be included in the next regular message sent to the model.
    const history = this.getHistory();
    const lastMessage =
      history.length > 0 ? history[history.length - 1] : undefined;
    const hasPendingToolCall =
      !!lastMessage &&
      lastMessage.role === 'model' &&
      (lastMessage.parts?.some((p) => 'functionCall' in p) || false);

    if (this.config.getIdeMode() && !hasPendingToolCall) {
      const { contextParts, newIdeContext } = this.getIdeContextParts(
        this.forceFullIdeContext || history.length === 0,
      );
      if (contextParts.length > 0) {
        this.getChat().addHistory({
          role: 'user',
          parts: [{ text: contextParts.join('\n') }],
        });
      }
      this.lastSentIdeContext = newIdeContext;
      this.forceFullIdeContext = false;
    }

    const turn = new Turn(this.getChat(), prompt_id);

    const controller = new AbortController();
    const linkedSignal = AbortSignal.any([signal, controller.signal]);

    const loopDetected = await this.loopDetector.turnStarted(signal);
    if (loopDetected) {
      yield { type: GeminiEventType.LoopDetected };
      return turn;
    }

    const routingContext: RoutingContext = {
      history: this.getChat().getHistory(/*curated=*/ true),
      request,
      signal,
    };

    let modelToUse: string;

    // Determine Model (Stickiness vs. Routing)
    if (this.currentSequenceModel) {
      modelToUse = this.currentSequenceModel;
    } else {
      const router = await this.config.getModelRouterService();
      const decision = await router.route(routingContext);
      modelToUse = decision.model;
      // Lock the model for the rest of the sequence
      this.currentSequenceModel = modelToUse;
      yield { type: GeminiEventType.ModelInfo, value: modelToUse };
    }

    const resultStream = turn.run({ model: modelToUse }, request, linkedSignal);
    for await (const event of resultStream) {
      if (this.loopDetector.addAndCheck(event)) {
        yield { type: GeminiEventType.LoopDetected };
        controller.abort();
        return turn;
      }
      yield event;

      this.updateTelemetryTokenCount();

      if (event.type === GeminiEventType.InvalidStream) {
        if (this.config.getContinueOnFailedApiCall()) {
          if (isInvalidStreamRetry) {
            // We already retried once, so stop here.
            logContentRetryFailure(
              this.config,
              new ContentRetryFailureEvent(
                4, // 2 initial + 2 after injections
                'FAILED_AFTER_PROMPT_INJECTION',
                modelToUse,
              ),
            );
            return turn;
          }
          const nextRequest = [{ text: 'System: Please continue.' }];
          yield* this.sendMessageStream(
            nextRequest,
            signal,
            prompt_id,
            boundedTurns - 1,
            true, // Set isInvalidStreamRetry to true
            onShowCompressionPrompt, // Pass the callback to recursive calls
            false, // Not a top-level call - skip compression
          );
          return turn;
        }
      }
      if (event.type === GeminiEventType.Error) {
        return turn;
      }
    }
    // Post-response compression check - run BEFORE any early returns
    if (isTopLevelCall && !turn.pendingToolCalls.length) {
      const compressionResult = await this.handlePostResponseCompression(
        prompt_id,
        onShowCompressionPrompt,
      );
      if (compressionResult) {
        yield compressionResult;
      }
    }

    if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
      // Check if next speaker check is needed
      if (this.config.getQuotaErrorOccurred()) {
        return turn;
      }

      if (this.config.getSkipNextSpeakerCheck()) {
        return turn;
      }

      const nextSpeakerCheck = await checkNextSpeaker(
        this.getChat(),
        this.config.getBaseLlmClient(),
        signal,
        prompt_id,
      );
      logNextSpeakerCheck(
        this.config,
        new NextSpeakerCheckEvent(
          prompt_id,
          turn.finishReason?.toString() || '',
          nextSpeakerCheck?.next_speaker || '',
        ),
      );
      if (nextSpeakerCheck?.next_speaker === 'model') {
        const nextRequest = [{ text: 'Please continue.' }];
        // This recursive call's events will be yielded out, and the final
        // turn object from the recursive call will be returned.
        return yield* this.sendMessageStream(
          nextRequest,
          signal,
          prompt_id,
          boundedTurns - 1,
          false, // isInvalidStreamRetry is false here, as this is a next speaker check
          onShowCompressionPrompt, // Pass the callback to recursive calls
          false, // Not a top-level call - skip compression
        );
      }
    }

    // Fire AfterAgent hook through MessageBus (only if hooks are enabled)
    if (hooksEnabled && messageBus) {
      const responseText = turn.getResponseText() || '[no response text]';
      const hookOutput = await fireAfterAgentHook(
        messageBus,
        request,
        responseText,
      );

      // For AfterAgent hooks, blocking/stop execution should force continuation
      if (
        hookOutput?.isBlockingDecision() ||
        hookOutput?.shouldStopExecution()
      ) {
        const continueReason = hookOutput.getEffectiveReason();
        const continueRequest = [{ text: continueReason }];
        yield* this.sendMessageStream(
          continueRequest,
          signal,
          prompt_id,
          boundedTurns - 1,
          false,
          onShowCompressionPrompt,
          false, // Not a top-level call - skip compression
        );
      }
    }

    return turn;
  }

  async generateContent(
    modelConfigKey: ModelConfigKey,
    contents: Content[],
    abortSignal: AbortSignal,
  ): Promise<GenerateContentResponse> {
    const desiredModelConfig =
      this.config.modelConfigService.getResolvedConfig(modelConfigKey);
    let {
      model: currentAttemptModel,
      generateContentConfig: currentAttemptGenerateContentConfig,
    } = desiredModelConfig;
    const fallbackModelConfig =
      this.config.modelConfigService.getResolvedConfig({
        ...modelConfigKey,
        model: DEFAULT_GEMINI_FLASH_MODEL,
      });

    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(this.config, userMemory);

      const apiCall = () => {
        const modelConfigToUse = this.config.isInFallbackMode()
          ? fallbackModelConfig
          : desiredModelConfig;
        currentAttemptModel = modelConfigToUse.model;
        currentAttemptGenerateContentConfig =
          modelConfigToUse.generateContentConfig;
        const requestConfig: GenerateContentConfig = {
          ...currentAttemptGenerateContentConfig,
          abortSignal,
          systemInstruction,
        };

        return this.getContentGeneratorOrFail().generateContent(
          {
            model: currentAttemptModel,
            config: requestConfig,
            contents,
          },
          this.lastPromptId,
        );
      };
      const onPersistent429Callback = async (
        authType?: string,
        error?: unknown,
      ) =>
        // Pass the captured model to the centralized handler.
        await handleFallback(this.config, currentAttemptModel, authType, error);

      const result = await retryWithBackoff(apiCall, {
        onPersistent429: onPersistent429Callback,
        authType: this.config.getContentGeneratorConfig()?.authType,
      });
      return result;
    } catch (error: unknown) {
      if (abortSignal.aborted) {
        throw error;
      }

      await reportError(
        error,
        `Error generating content via API with model ${currentAttemptModel}.`,
        {
          requestContents: contents,
          requestConfig: currentAttemptGenerateContentConfig,
        },
        'generateContent-api',
      );
      throw new Error(
        `Failed to generate content with model ${currentAttemptModel}: ${getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Determines if compression should be triggered based on hybrid criteria
   */
  async shouldTriggerCompression(): Promise<{
    shouldCompress: boolean;
    reason: string;
    isSafetyValve: boolean;
  }> {
    // Concurrency guard: prevent concurrent compressions
    if (this.isCompressing) {
      return {
        shouldCompress: false,
        reason: 'compression_in_progress',
        isSafetyValve: false,
      };
    }

    // Concurrency guard: don't compress during streaming
    // Note: Removed isStreaming() check as Turn doesn't have this method yet

    const chat = this.getChat();
    const currentTokens = chat.getLastPromptTokenCount();
    const model = this._getEffectiveModelForCurrentTurn();
    const modelLimit = tokenLimit(model);

    // Debug: Show compression evaluation
    const tokenThreshold = await this.config.getCompressionTriggerTokens();
    const minMessages = await this.config.getCompressionMinMessages();
    const debugMsg =
      `[Compress] tokens=${currentTokens}/${tokenThreshold}, ` +
      `msgs=${this.messagesSinceLastCompress}/${minMessages}`;
    debugLogger.log(debugMsg);

    // Check safety valve first (50% utilization threshold)
    const utilizationThreshold =
      await this.config.getCompressionTriggerUtilization();
    const utilization = currentTokens / modelLimit;

    if (utilization >= utilizationThreshold) {
      // Safety valve - bypass all guards
      return {
        shouldCompress: true,
        reason: 'utilization_threshold',
        isSafetyValve: true,
      };
    }

    if (currentTokens < tokenThreshold) {
      return {
        shouldCompress: false,
        reason: 'below_token_threshold',
        isSafetyValve: false,
      };
    }

    // Apply guards
    if (this.messagesSinceLastCompress < minMessages) {
      return {
        shouldCompress: false,
        reason: 'message_guard_failed',
        isSafetyValve: false,
      };
    }

    const minTimeBetween =
      await this.config.getCompressionMinTimeBetweenPrompts(); // seconds
    const timeSinceLastCompress =
      (Date.now() - this.lastCompressionTime) / 1000;
    if (
      this.lastCompressionTime > 0 &&
      timeSinceLastCompress < minTimeBetween
    ) {
      return {
        shouldCompress: false,
        reason: 'time_guard_failed',
        isSafetyValve: false,
      };
    }

    // All checks passed
    return {
      shouldCompress: true,
      reason: 'absolute_tokens',
      isSafetyValve: false,
    };
  }

  /**
   * Prepares for deliberate compression by extracting goals
   * Returns info about whether to prompt user and what goals were found
   */
  async prepareDeliberateCompression(
    prompt_id: string,
    isSafetyValve: boolean,
  ) {
    const model = this._getEffectiveModelForCurrentTurn();

    return await this.deliberateCompressionOrchestrator.prepareDeliberateCompression(
      this.getChat(),
      this.config,
      model,
      prompt_id,
      isSafetyValve,
    );
  }

  /**
   * Creates compression options from user's goal selection
   */
  createCompressionOptions(selectedGoal: string | null): CompressionOptions {
    return this.deliberateCompressionOrchestrator.createCompressionOptions(
      selectedGoal,
    );
  }

  /**
   * Handles post-response compression check and prompt flow
   * Returns a ChatCompressed event if compression occurred, undefined otherwise
   */
  private async handlePostResponseCompression(
    promptId: string,
    onShowCompressionPrompt: (
      goals: string[],
      isSafetyValve: boolean,
    ) => Promise<string>,
  ): Promise<ServerGeminiStreamEvent | undefined> {
    const { shouldCompress, isSafetyValve } =
      await this.shouldTriggerCompression();

    if (!shouldCompress) {
      return undefined;
    }

    let compressionOptions: CompressionOptions;

    if (this.config.isCompressionInteractive()) {
      const { extractedGoals, shouldPromptUser, skipReason, selectedGoal } =
        await this.prepareDeliberateCompression(promptId, isSafetyValve);

      if (shouldPromptUser && extractedGoals) {
        const selection = await onShowCompressionPrompt(
          extractedGoals,
          isSafetyValve,
        );
        compressionOptions = this.handleCompressionSelection(selection);
      } else {
        this.emitCompressionSkipFeedback(skipReason);
        compressionOptions = this.createCompressionOptions(
          selectedGoal || 'auto',
        );
      }
    } else {
      compressionOptions = this.createCompressionOptions('auto');
    }

    // Pass force=true since shouldTriggerCompression already determined we should compress
    // This bypasses the old percentage-based threshold check in compress()
    const compressed = await this.tryCompressChat(
      promptId,
      true,
      compressionOptions,
    );

    if (compressed.compressionStatus === CompressionStatus.COMPRESSED) {
      return { type: GeminiEventType.ChatCompressed, value: compressed };
    }

    return undefined;
  }

  /**
   * Handles user selection from the compression prompt and returns compression options
   */
  private handleCompressionSelection(
    selection: string | null,
  ): CompressionOptions {
    switch (selection) {
      case 'disable':
        this.config.setCompressionInteractive(false);
        coreEvents.emitFeedback(
          'info',
          'Interactive compression disabled. Future compressions will be automatic.',
        );
        return this.createCompressionOptions('auto');

      case 'less_frequent': {
        const currentTokens = this.config.getCompressionTriggerTokens();
        const currentMessages = this.config.getCompressionMinMessages();
        const multiplier = this.config.getCompressionFrequencyMultiplier();

        const cappedTokens = Math.min(
          Math.round(currentTokens * multiplier),
          200000,
        );
        const cappedMessages = Math.min(
          Math.round(currentMessages * multiplier),
          100,
        );

        this.config.setCompressionTriggerTokens(cappedTokens);
        this.config.setCompressionMinMessages(cappedMessages);

        coreEvents.emitFeedback(
          'info',
          `Check-ins ${multiplier}x less frequent: ${currentTokens / 1000}k → ${cappedTokens / 1000}k tokens, ${currentMessages} → ${cappedMessages} messages`,
        );
        return this.createCompressionOptions('auto');
      }

      case 'auto':
      case null:
        return this.createCompressionOptions('auto');

      default:
        // User selected a specific goal
        return this.createCompressionOptions(selection);
    }
  }

  /**
   * Emits user-visible feedback explaining why the compression prompt was skipped
   */
  private emitCompressionSkipFeedback(skipReason: string | undefined): void {
    if (skipReason === 'safety_valve') {
      coreEvents.emitFeedback(
        'info',
        'Context limit reached - compressing automatically.',
      );
    } else if (
      skipReason === 'no_goals' ||
      skipReason === 'extraction_failed'
    ) {
      coreEvents.emitFeedback('info', `Compressing context (${skipReason}).`);
    }
  }

  async tryCompressChat(
    prompt_id: string,
    force: boolean = false,
    options?: CompressionOptions,
  ): Promise<ChatCompressionInfo> {
    // Set compression lock
    this.isCompressing = true;

    try {
      // If the model is 'auto', we will use a placeholder model to check.
      // Compression occurs before we choose a model, so calling `count_tokens`
      // before the model is chosen would result in an error.
      const model = this._getEffectiveModelForCurrentTurn();

      const { newHistory, info } = await this.compressionService.compress(
        this.getChat(),
        prompt_id,
        force,
        model,
        this.config,
        this.hasFailedCompressionAttempt,
        options,
      );

      if (
        info.compressionStatus ===
        CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT
      ) {
        this.hasFailedCompressionAttempt = !force && true;
      } else if (info.compressionStatus === CompressionStatus.COMPRESSED) {
        if (newHistory) {
          this.chat = await this.startChat(newHistory);
          this.updateTelemetryTokenCount();
          this.forceFullIdeContext = true;

          // Update tracking state
          this.messagesSinceLastCompress = 0;
          this.lastCompressionTime = Date.now();
        }
      }

      return info;
    } finally {
      // Always clear compression lock
      this.isCompressing = false;
    }
  }
}
