/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createUserContent,
  type GenerateContentConfig,
  type PartListUnion,
  type Content,
  type Tool,
  type GenerateContentResponse,
} from '@google/genai';
import {
  getDirectoryContextString,
  getEnvironmentContext,
} from '../utils/environmentContext.js';
import { Turn, GeminiEventType, type ServerGeminiStreamEvent } from './turn.js';
import {
  CompressionStatus,
  type ChatCompressionInfo,
} from './compression-status.js';
import type { Config } from '../config/config.js';
import { getCoreSystemPrompt } from './prompts.js';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat } from './geminiChat.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  retryWithBackoff,
  type RetryAvailabilityContext,
} from '../utils/retry.js';
import type { ValidationRequiredError } from '../utils/googleQuotaErrors.js';
import { getErrorMessage } from '../utils/errors.js';
import { tokenLimit } from './tokenLimits.js';
import type {
  ChatRecordingService,
  ResumedSessionData,
} from '../services/chatRecordingService.js';
import type { ContentGenerator } from './contentGenerator.js';
import { LoopDetectionService } from '../services/loopDetectionService.js';
import type { ChatCompressionService } from '../services/chatCompressionService.js';
import type { ContinuityCompressionService } from '../services/continuityCompressionService.js';
import type {
  DefaultHookOutput,
  AfterAgentHookOutput,
} from '../hooks/types.js';
import { type LlmRole } from '../telemetry/types.js';
import { uiTelemetryService } from '../telemetry/uiTelemetry.js';
import { handleFallback } from '../fallback/handler.js';
import type { RoutingContext } from '../routing/routingStrategy.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import { ToolOutputMaskingService } from '../services/toolOutputMaskingService.js';
import { calculateRequestTokenCount } from '../utils/tokenCalculation.js';
import {
  applyModelSelection,
  createAvailabilityContextProvider,
} from '../availability/policyHelpers.js';
import { resolveModel } from '../config/models.js';
import { partToString } from '../utils/partUtils.js';
import { coreEvents, CoreEvent } from '../utils/events.js';

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
  private readonly toolOutputMaskingService: ToolOutputMaskingService;
  private lastPromptId: string;
  private currentSequenceModel: string | null = null;

  /**
   * At any point in this conversation, was compression triggered without
   * being forced and did it fail?
   */
  private hasFailedCompressionAttempt = false;

  constructor(private readonly config: Config) {
    this.loopDetector = new LoopDetectionService(config);
    this.toolOutputMaskingService = new ToolOutputMaskingService();
    this.lastPromptId = this.config.getSessionId();

    coreEvents.on(CoreEvent.ModelChanged, this.handleModelChanged);
  }

  get compressionService(): ChatCompressionService {
    return this.config.getChatCompressionService();
  }

  get continuityCompressionService(): ContinuityCompressionService {
    return this.config.getContinuityCompressionService();
  }

  private handleModelChanged = () => {
    this.currentSequenceModel = null;
  };

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
    this.updateTelemetryTokenCount();
  }

  private lastUsedModelId?: string;

  async setTools(modelId?: string): Promise<void> {
    if (!this.chat) {
      return;
    }

    if (modelId && modelId === this.lastUsedModelId) {
      return;
    }
    this.lastUsedModelId = modelId;

    const toolRegistry = this.config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations(modelId);
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
    this.getChat().setTools(tools);
  }

  async resetChat(): Promise<void> {
    this.chat = await this.startChat();
    this.updateTelemetryTokenCount();
  }

  dispose() {
    coreEvents.off(CoreEvent.ModelChanged, this.handleModelChanged);
  }

  async resumeChat(
    history: Content[],
    resumedSessionData?: ResumedSessionData,
  ): Promise<void> {
    this.chat = await this.startChat(history, resumedSessionData);
    this.updateTelemetryTokenCount();
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

  updateSystemInstruction(): void {
    if (!this.isInitialized()) {
      return;
    }

    const systemMemory = this.config.getUserMemory();
    const systemInstruction = getCoreSystemPrompt(this.config, systemMemory);
    this.getChat().setSystemInstruction(systemInstruction);
  }

  async startChat(
    extraHistory?: Content[],
    resumedSessionData?: ResumedSessionData,
  ): Promise<GeminiChat> {
    this.hasFailedCompressionAttempt = false;
    this.lastUsedModelId = undefined;

    const toolRegistry = this.config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations();
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];

    // Use environment context as a singleton session context via side-effect
    const envParts = await getEnvironmentContext(this.config);
    const envContextString = envParts
      .map((part) => part.text || '')
      .join('\n\n');
    this.config.getSideEffectService().setSessionContext(envContextString);

    try {
      const systemMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(this.config, systemMemory);
      return new GeminiChat(
        this.config,
        systemInstruction,
        tools,
        extraHistory ?? [],
        resumedSessionData,
        async (modelId: string) => {
          this.lastUsedModelId = modelId;
          const toolRegistry = this.config.getToolRegistry();
          const toolDeclarations =
            toolRegistry.getFunctionDeclarations(modelId);
          return [{ functionDeclarations: toolDeclarations }];
        },
      );
    } catch (error) {
      await reportError(
        error,
        'Error initializing Gemini chat session.',
        extraHistory,
        'startChat',
      );
      throw new Error(`Failed to initialize chat: ${getErrorMessage(error)}`);
    }
  }

  private _getActiveModelForCurrentTurn(): string {
    if (this.currentSequenceModel) {
      return this.currentSequenceModel;
    }

    // Availability logic: The configured model is the source of truth,
    // including any permanent fallbacks (config.setModel) or manual overrides.
    return resolveModel(
      this.config.getActiveModel(),
      this.config.getGemini31LaunchedSync?.() ?? false,
    );
  }

  private async *processTurn(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    boundedTurns: number,
    displayContent?: PartListUnion,
    turnId?: string,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    // Re-initialize turn
    let turn = new Turn(this.getChat(), prompt_id, turnId!);

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

    const compressed = await this.tryCompressChat(prompt_id, false);

    if (compressed.compressionStatus === CompressionStatus.COMPRESSED) {
      yield { type: GeminiEventType.ChatCompressed, value: compressed };
    }

    const remainingTokenCount =
      tokenLimit(modelForLimitCheck) - this.getChat().getLastPromptTokenCount();

    await this.tryMaskToolOutputs(this.getHistory());

    // Estimate tokens
    const estimatedRequestTokenCount = await calculateRequestTokenCount(
      request,
      this.getContentGeneratorOrFail(),
      modelForLimitCheck,
    );

    if (estimatedRequestTokenCount > remainingTokenCount) {
      yield {
        type: GeminiEventType.ContextWindowWillOverflow,
        value: { estimatedRequestTokenCount, remainingTokenCount },
      };
      return turn;
    }

    // Re-initialize turn with fresh history
    turn = new Turn(this.getChat(), prompt_id, turnId!);

    const controller = new AbortController();
    const linkedSignal = AbortSignal.any([signal, controller.signal]);

    const routingContext: RoutingContext = {
      history: this.getChat().getHistory(/*curated=*/ true),
      request,
      signal,
      requestedModel: this.config.getModel(),
    };

    let modelToUse: string;

    // Determine Model
    if (this.currentSequenceModel) {
      modelToUse = this.currentSequenceModel;
    } else {
      const router = this.config.getModelRouterService();
      const decision = await router.route(routingContext);
      modelToUse = decision.model;
    }

    // availability logic
    const modelConfigKey: ModelConfigKey = {
      model: modelToUse,
      isChatModel: true,
    };
    const { model: finalModel } = applyModelSelection(
      this.config,
      modelConfigKey,
      { consumeAttempt: false },
    );
    modelToUse = finalModel;

    if (!signal.aborted && !this.currentSequenceModel) {
      yield { type: GeminiEventType.ModelInfo, value: modelToUse };
    }
    this.currentSequenceModel = modelToUse;

    // Update tools with the final modelId
    await this.setTools(modelToUse);

    const resultStream = turn.run(
      modelConfigKey,
      request,
      linkedSignal,
      displayContent,
    );
    let isError = false;

    for await (const event of resultStream) {
      yield event;

      this.updateTelemetryTokenCount();

      if (event.type === GeminiEventType.Error) {
        isError = true;
      }

      if (event.type === GeminiEventType.ToolCallResponse) {
        const toolResponse = event.value;

        if (toolResponse.newHistory) {
          yield {
            type: GeminiEventType.ChatCompressed,
            value: toolResponse.compressionInfo ?? {
              originalTokenCount: 0,
              newTokenCount: 0,
              compressionStatus: CompressionStatus.COMPRESSED,
            },
          };
        }
      }
    }

    if (isError) {
      return turn;
    }

    // Update cumulative response in hook state
    const hooksEnabled = this.config.getEnableHooks();
    if (hooksEnabled) {
      const responseText = turn.getResponseText() || '';
      const hookState = this.hookStateMap.get(prompt_id);
      if (hookState && responseText) {
        hookState.cumulativeResponse = hookState.cumulativeResponse
          ? `${hookState.cumulativeResponse}\n${responseText}`
          : responseText;
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
    displayContent?: PartListUnion,
    turnId?: string,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    if (!isInvalidStreamRetry) {
      this.config.resetTurn();
    }

    const hooksEnabled = this.config.getEnableHooks();
    const messageBus = this.config.getMessageBus();

    if (this.lastPromptId !== prompt_id) {
      this.hookStateMap.delete(this.lastPromptId);
      this.lastPromptId = prompt_id;
      this.currentSequenceModel = null;
    }

    if (hooksEnabled && messageBus) {
      const hookResult = await this.fireBeforeAgentHookSafe(request, prompt_id);
      if (hookResult) {
        if (
          'type' in hookResult &&
          (hookResult.type === GeminiEventType.AgentExecutionStopped ||
            hookResult.type === GeminiEventType.AgentExecutionBlocked)
        ) {
          if (hookResult.type === GeminiEventType.AgentExecutionStopped) {
            this.getChat().addHistory(createUserContent(request));
          }
          yield hookResult;
          return new Turn(this.getChat(), prompt_id, turnId!);
        } else if ('additionalContext' in hookResult) {
          const additionalContext = hookResult.additionalContext;
          if (additionalContext) {
            const requestArray = Array.isArray(request) ? request : [request];
            request = [
              ...requestArray,
              { text: `<hook_context>${additionalContext}</hook_context>` },
            ];
          }
        }
      }
    }

    const boundedTurns = Math.min(turns, MAX_TURNS);
    const currentTurnId = turnId ?? Turn.generateId();
    let turn = new Turn(this.getChat(), prompt_id, currentTurnId);

    try {
      turn = yield* this.processTurn(
        request,
        signal,
        prompt_id,
        boundedTurns,
        displayContent,
        currentTurnId,
      );

      // Handle re-prompt request (e.g. from context compression or distillation)
      const hasReprompt = this.getChat().consumeRepromptRequest();

      if (hasReprompt && boundedTurns > 1) {
        debugLogger.debug('[PROJECT CLARITY] Re-prompt requested.');

        yield* this.sendMessageStream(
          [],
          signal,
          prompt_id,
          boundedTurns - 1,
          false,
          displayContent,
        );
      }

      // Fire AfterAgent hook if we have a turn and no pending tools
      if (hooksEnabled && messageBus) {
        const hookOutput = await this.fireAfterAgentHookSafe(
          request,
          prompt_id,
          turn,
        );

        const afterAgentOutput = hookOutput as AfterAgentHookOutput | undefined;

        if (afterAgentOutput?.shouldStopExecution()) {
          const contextCleared = afterAgentOutput.shouldClearContext();
          yield {
            type: GeminiEventType.AgentExecutionStopped,
            value: {
              reason: afterAgentOutput.getEffectiveReason(),
              systemMessage: afterAgentOutput.systemMessage,
              contextCleared,
            },
          };
          if (contextCleared) {
            await this.resetChat();
          }
          return turn;
        }

        if (afterAgentOutput?.isBlockingDecision()) {
          const continueReason = afterAgentOutput.getEffectiveReason();
          const contextCleared = afterAgentOutput.shouldClearContext();
          yield {
            type: GeminiEventType.AgentExecutionBlocked,
            value: {
              reason: continueReason,
              systemMessage: afterAgentOutput.systemMessage,
              contextCleared,
            },
          };
          if (contextCleared) {
            await this.resetChat();
          }
          const continueRequest = [{ text: continueReason }];
          yield* this.sendMessageStream(
            continueRequest,
            signal,
            prompt_id,
            boundedTurns - 1,
            false,
            displayContent,
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
    role: LlmRole,
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

      let initialActiveModel = this.config.getActiveModel();

      const apiCall = () => {
        // AvailabilityService
        const active = this.config.getActiveModel();
        if (active !== initialActiveModel) {
          initialActiveModel = active;
          // Re-resolve config if model changed
          const { model: resolvedModel, generateContentConfig } =
            this.config.modelConfigService.getResolvedConfig({
              ...modelConfigKey,
              model: active,
            });
          currentAttemptModel = resolvedModel;
          currentAttemptGenerateContentConfig = generateContentConfig;
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
          role,
        );
      };
      const onPersistent429Callback = async (
        authType?: string,
        error?: unknown,
      ) =>
        // Pass the captured model to the centralized handler.
        handleFallback(this.config, currentAttemptModel, authType, error);

      const onValidationRequiredCallback = async (
        validationError: ValidationRequiredError,
      ) => {
        // Suppress validation dialog for background calls (e.g. prompt-completion)
        // to prevent the dialog from appearing on startup or during typing.
        if (modelConfigKey.model === 'prompt-completion') {
          throw validationError;
        }

        const handler = this.config.getValidationHandler();
        if (typeof handler !== 'function') {
          throw validationError;
        }
        return handler(
          validationError.validationLink,
          validationError.validationDescription,
          validationError.learnMoreUrl,
        );
      };

      const result = await retryWithBackoff(apiCall, {
        onPersistent429: onPersistent429Callback,
        onValidationRequired: onValidationRequiredCallback,
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
        this.getChat().replaceHistory(newHistory);
        this.updateTelemetryTokenCount();
      }
    } else if (info.compressionStatus === CompressionStatus.CONTENT_TRUNCATED) {
      if (newHistory) {
        this.getChat().setHistory(newHistory);
        this.updateTelemetryTokenCount();
      }
    }

    return info;
  }

  /**
   * Masks bulky tool outputs to save context window space.
   */
  private async tryMaskToolOutputs(history: Content[]): Promise<void> {
    if (!this.config.getToolOutputMaskingEnabled()) {
      return;
    }
    const result = await this.toolOutputMaskingService.mask(
      history,
      this.config,
    );
    if (result.maskedCount > 0) {
      this.getChat().setHistory(result.newHistory);
    }
  }
}
