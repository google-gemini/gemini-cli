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
import { createUserContent } from '@google/genai';
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
import { LoopDetectionService } from '../services/loopDetectionService.js';
import { ChatCompressionService } from '../services/chatCompressionService.js';
import { ideContextStore } from '../ide/ideContext.js';
import {
  logContentRetryFailure,
  logNextSpeakerCheck,
} from '../telemetry/loggers.js';
import type { DefaultHookOutput } from '../hooks/types.js';
import {
  ContentRetryFailureEvent,
  NextSpeakerCheckEvent,
} from '../telemetry/types.js';
import { uiTelemetryService } from '../telemetry/uiTelemetry.js';
import type { IdeContext, File } from '../ide/types.js';
import { handleFallback } from '../fallback/handler.js';
import type { RoutingContext } from '../routing/routingStrategy.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import { calculateRequestTokenCount } from '../utils/tokenCalculation.js';
import {
  applyModelSelection,
  createAvailabilityContextProvider,
} from '../availability/policyHelpers.js';
import { resolveModel } from '../config/models.js';
import type { RetryAvailabilityContext } from '../utils/retry.js';
import { partToString } from '../utils/partUtils.js';

const MAX_TURNS = 100;

type BeforeAgentHookReturn =
  | {
      type: GeminiEventType.AgentExecutionStopped;
      value: { reason: string; systemMessage?: string };
    }
  | {
      type: GeminiEventType.AgentExecutionBlocked;
      value: { reason: string; systemMessage?: string };
    }
  | { additionalContext: string | undefined }
  | undefined;

export class GeminiClient {
  private chat?: GeminiChat;
  private sessionTurnCount = 0;

  private readonly loopDetector: LoopDetectionService;
  private readonly compressionService: ChatCompressionService;
  private lastPromptId: string;
  private currentSequenceModel: string | null = null;
  private lastSentIdeContext: IdeContext | undefined;
  private forceFullIdeContext = true;

  /**
   * At any point in this conversation, was compression triggered without
   * being forced and did it fail?
   */
  private hasFailedCompressionAttempt = false;

  constructor(private readonly config: Config) {
    this.loopDetector = new LoopDetectionService(config);
    this.compressionService = new ChatCompressionService();
    this.lastPromptId = this.config.getSessionId();
  }

  // Hook state to deduplicate BeforeAgent calls and track response for
  // AfterAgent
  private hookStateMap = new Map<
    string,
    {
      hasFiredBeforeAgent: boolean;
      cumulativeResponse: string;
      activeCalls: number;
      originalRequest: PartListUnion;
    }
  >();

  private async fireBeforeAgentHookSafe(
    request: PartListUnion,
    prompt_id: string,
  ): Promise<BeforeAgentHookReturn> {
    let hookState = this.hookStateMap.get(prompt_id);
    if (!hookState) {
      hookState = {
        hasFiredBeforeAgent: false,
        cumulativeResponse: '',
        activeCalls: 0,
        originalRequest: request,
      };
      this.hookStateMap.set(prompt_id, hookState);
    }

    // Increment active calls for this prompt_id
    // This is called at the start of sendMessageStream, so it acts as an entry
    // counter. We increment here, assuming this helper is ALWAYS called at
    // entry.
    hookState.activeCalls++;

    if (hookState.hasFiredBeforeAgent) {
      return undefined;
    }

    const hookOutput = await this.config
      .getHookSystem()
      ?.fireBeforeAgentEvent(partToString(request));
    hookState.hasFiredBeforeAgent = true;

    if (hookOutput?.shouldStopExecution()) {
      return {
        type: GeminiEventType.AgentExecutionStopped,
        value: {
          reason: hookOutput.getEffectiveReason(),
          systemMessage: hookOutput.systemMessage,
        },
      };
    }

    if (hookOutput?.isBlockingDecision()) {
      return {
        type: GeminiEventType.AgentExecutionBlocked,
        value: {
          reason: hookOutput.getEffectiveReason(),
          systemMessage: hookOutput.systemMessage,
        },
      };
    }

    const additionalContext = hookOutput?.getAdditionalContext();
    if (additionalContext) {
      return { additionalContext };
    }
    return undefined;
  }

  private async fireAfterAgentHookSafe(
    currentRequest: PartListUnion,
    prompt_id: string,
    turn?: Turn,
  ): Promise<DefaultHookOutput | undefined> {
    const hookState = this.hookStateMap.get(prompt_id);
    // Only fire on the outermost call (when activeCalls is 1)
    if (!hookState || hookState.activeCalls !== 1) {
      return undefined;
    }

    if (turn && turn.pendingToolCalls.length > 0) {
      return undefined;
    }

    const finalResponseText =
      hookState.cumulativeResponse ||
      turn?.getResponseText() ||
      '[no response text]';
    const finalRequest = hookState.originalRequest || currentRequest;

    const hookOutput = await this.config
      .getHookSystem()
      ?.fireAfterAgentEvent(partToString(finalRequest), finalResponseText);

    return hookOutput;
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

    const systemMemory = this.config.isJitContextEnabled()
      ? this.config.getGlobalMemory()
      : this.config.getUserMemory();
    const systemInstruction = getCoreSystemPrompt(this.config, systemMemory);
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
      const systemMemory = this.config.isJitContextEnabled()
        ? this.config.getGlobalMemory()
        : this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(this.config, systemMemory);
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

  private _getActiveModelForCurrentTurn(): string {
    if (this.currentSequenceModel) {
      return this.currentSequenceModel;
    }

    // Availability logic: The configured model is the source of truth,
    // including any permanent fallbacks (config.setModel) or manual overrides.
    return resolveModel(this.config.getActiveModel());
  }

  private async *processTurn(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    boundedTurns: number,
    isInvalidStreamRetry: boolean,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    // Re-initialize turn (it was empty before if in loop, or new instance)
    let turn = new Turn(this.getChat(), prompt_id);

    this.sessionTurnCount++;
    if (
      this.config.getMaxSessionTurns() > 0 &&
      this.sessionTurnCount > this.config.getMaxSessionTurns()
    ) {
      yield { type: GeminiEventType.MaxSessionTurns };
      return turn;
    }

    if (!boundedTurns) {
      return turn;
    }

    // Check for context window overflow
    const modelForLimitCheck = this._getActiveModelForCurrentTurn();

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
      return turn;
    }

    const compressed = await this.tryCompressChat(prompt_id, false);

    if (compressed.compressionStatus === CompressionStatus.COMPRESSED) {
      yield { type: GeminiEventType.ChatCompressed, value: compressed };
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

    // Re-initialize turn with fresh history
    turn = new Turn(this.getChat(), prompt_id);

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
      requestedModel: this.config.getModel(),
    };

    let modelToUse: string;

    // Determine Model (Stickiness vs. Routing)
    if (this.currentSequenceModel) {
      modelToUse = this.currentSequenceModel;
    } else {
      const router = this.config.getModelRouterService();
      const decision = await router.route(routingContext);
      modelToUse = decision.model;
    }

    // availability logic
    const modelConfigKey: ModelConfigKey = { model: modelToUse };
    const { model: finalModel } = applyModelSelection(
      this.config,
      modelConfigKey,
      { consumeAttempt: false },
    );
    modelToUse = finalModel;

    this.currentSequenceModel = modelToUse;
    if (!signal.aborted) {
      yield { type: GeminiEventType.ModelInfo, value: modelToUse };
    }
    const resultStream = turn.run(modelConfigKey, request, linkedSignal);
    let isError = false;
    let isInvalidStream = false;

    for await (const event of resultStream) {
      if (this.loopDetector.addAndCheck(event)) {
        yield { type: GeminiEventType.LoopDetected };
        controller.abort();
        return turn;
      }
      yield event;

      this.updateTelemetryTokenCount();

      if (event.type === GeminiEventType.InvalidStream) {
        isInvalidStream = true;
      }
      if (event.type === GeminiEventType.Error) {
        isError = true;
      }
    }

    if (isError) {
      return turn;
    }

    // Update cumulative response in hook state
    // We do this immediately after the stream finishes for THIS turn.
    const hooksEnabled = this.config.getEnableHooks();
    if (hooksEnabled) {
      const responseText = turn.getResponseText() || '';
      const hookState = this.hookStateMap.get(prompt_id);
      if (hookState && responseText) {
        // Append with newline if not empty
        hookState.cumulativeResponse = hookState.cumulativeResponse
          ? `${hookState.cumulativeResponse}\n${responseText}`
          : responseText;
      }
    }

    if (isInvalidStream) {
      if (this.config.getContinueOnFailedApiCall()) {
        if (isInvalidStreamRetry) {
          logContentRetryFailure(
            this.config,
            new ContentRetryFailureEvent(
              4,
              'FAILED_AFTER_PROMPT_INJECTION',
              modelToUse,
            ),
          );
          return turn;
        }
        const nextRequest = [{ text: 'System: Please continue.' }];
        // Recursive call - update turn with result
        turn = yield* this.sendMessageStream(
          nextRequest,
          signal,
          prompt_id,
          boundedTurns - 1,
          true,
        );
        return turn;
      }
    }

    if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
      if (
        !this.config.getQuotaErrorOccurred() &&
        !this.config.getSkipNextSpeakerCheck()
      ) {
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
          turn = yield* this.sendMessageStream(
            nextRequest,
            signal,
            prompt_id,
            boundedTurns - 1,
            // isInvalidStreamRetry is false
          );
          return turn;
        }
      }
    }
    return turn;
  }

  async *sendMessageStream(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    turns: number = MAX_TURNS,
    isInvalidStreamRetry: boolean = false,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    if (!isInvalidStreamRetry) {
      this.config.resetTurn();
    }

    const hooksEnabled = this.config.getEnableHooks();
    const messageBus = this.config.getMessageBus();

    if (this.lastPromptId !== prompt_id) {
      this.loopDetector.reset(prompt_id);
      this.hookStateMap.delete(this.lastPromptId);
      this.lastPromptId = prompt_id;
      this.currentSequenceModel = null;
    }

    if (hooksEnabled && messageBus) {
      const hookResult = await this.fireBeforeAgentHookSafe(request, prompt_id);
      if (hookResult) {
        if (
          'type' in hookResult &&
          hookResult.type === GeminiEventType.AgentExecutionStopped
        ) {
          // Add user message to history before returning so it's kept in the transcript
          this.getChat().addHistory(createUserContent(request));
          yield hookResult;
          return new Turn(this.getChat(), prompt_id);
        } else if (
          'type' in hookResult &&
          hookResult.type === GeminiEventType.AgentExecutionBlocked
        ) {
          yield hookResult;
          return new Turn(this.getChat(), prompt_id);
        } else if ('additionalContext' in hookResult) {
          const additionalContext = hookResult.additionalContext;
          if (additionalContext) {
            const requestArray = Array.isArray(request) ? request : [request];
            request = [...requestArray, { text: additionalContext }];
          }
        }
      }
    }

    const boundedTurns = Math.min(turns, MAX_TURNS);
    let turn = new Turn(this.getChat(), prompt_id);

    try {
      turn = yield* this.processTurn(
        request,
        signal,
        prompt_id,
        boundedTurns,
        isInvalidStreamRetry,
      );

      // Fire AfterAgent hook if we have a turn and no pending tools
      if (hooksEnabled && messageBus) {
        const hookOutput = await this.fireAfterAgentHookSafe(
          request,
          prompt_id,
          turn,
        );

        if (hookOutput?.shouldStopExecution()) {
          yield {
            type: GeminiEventType.AgentExecutionStopped,
            value: {
              reason: hookOutput.getEffectiveReason(),
              systemMessage: hookOutput.systemMessage,
            },
          };
          return turn;
        }

        if (hookOutput?.isBlockingDecision()) {
          const continueReason = hookOutput.getEffectiveReason();
          yield {
            type: GeminiEventType.AgentExecutionBlocked,
            value: {
              reason: continueReason,
              systemMessage: hookOutput.systemMessage,
            },
          };
          const continueRequest = [{ text: continueReason }];
          yield* this.sendMessageStream(
            continueRequest,
            signal,
            prompt_id,
            boundedTurns - 1,
          );
        }
      }
    } finally {
      const hookState = this.hookStateMap.get(prompt_id);
      if (hookState) {
        hookState.activeCalls--;
        const isPendingTools =
          turn?.pendingToolCalls && turn.pendingToolCalls.length > 0;
        const isAborted = signal?.aborted;

        if (hookState.activeCalls <= 0) {
          if (!isPendingTools || isAborted) {
            this.hookStateMap.delete(prompt_id);
          }
        }
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

    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(this.config, userMemory);
      const {
        model,
        config: newConfig,
        maxAttempts: availabilityMaxAttempts,
      } = applyModelSelection(this.config, modelConfigKey);
      currentAttemptModel = model;
      if (newConfig) {
        currentAttemptGenerateContentConfig = newConfig;
      }

      // Define callback to refresh context based on currentAttemptModel which might be updated by fallback handler
      const getAvailabilityContext: () => RetryAvailabilityContext | undefined =
        createAvailabilityContextProvider(
          this.config,
          () => currentAttemptModel,
        );

      const apiCall = () => {
        // AvailabilityService
        const active = this.config.getActiveModel();
        if (active !== currentAttemptModel) {
          currentAttemptModel = active;
          // Re-resolve config if model changed
          const newConfig = this.config.modelConfigService.getResolvedConfig({
            ...modelConfigKey,
            model: currentAttemptModel,
          });
          currentAttemptGenerateContentConfig = newConfig.generateContentConfig;
        }

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
        handleFallback(this.config, currentAttemptModel, authType, error);

      const result = await retryWithBackoff(apiCall, {
        onPersistent429: onPersistent429Callback,
        authType: this.config.getContentGeneratorConfig()?.authType,
        maxAttempts: availabilityMaxAttempts,
        getAvailabilityContext,
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

  async tryCompressChat(
    prompt_id: string,
    force: boolean = false,
  ): Promise<ChatCompressionInfo> {
    // If the model is 'auto', we will use a placeholder model to check.
    // Compression occurs before we choose a model, so calling `count_tokens`
    // before the model is chosen would result in an error.
    const model = this._getActiveModelForCurrentTurn();

    const { newHistory, info } = await this.compressionService.compress(
      this.getChat(),
      prompt_id,
      force,
      model,
      this.config,
      this.hasFailedCompressionAttempt,
    );

    if (
      info.compressionStatus ===
      CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT
    ) {
      this.hasFailedCompressionAttempt =
        this.hasFailedCompressionAttempt || !force;
    } else if (info.compressionStatus === CompressionStatus.COMPRESSED) {
      if (newHistory) {
        // capture current session data before resetting
        const currentRecordingService =
          this.getChat().getChatRecordingService();
        const conversation = currentRecordingService.getConversation();
        const filePath = currentRecordingService.getConversationFilePath();

        let resumedData: ResumedSessionData | undefined;

        if (conversation && filePath) {
          resumedData = { conversation, filePath };
        }

        this.chat = await this.startChat(newHistory, resumedData);
        this.updateTelemetryTokenCount();
        this.forceFullIdeContext = true;
      }
    }

    return info;
  }
}
