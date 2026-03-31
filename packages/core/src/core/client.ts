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
import { partListUnionToString } from './geminiRequest.js';
import {
  getDirectoryContextString,
  getInitialChatHistory,
} from '../utils/environmentContext.js';
import {
  CompressionStatus,
  Turn,
  GeminiEventType,
  type AgentSettings,
  type AgentTerminateMode,
  type LocalAgentDefinition,
} from '../agents/types.js';
import { partToString } from '../utils/partUtils.js';
import { debugLogger } from '../utils/debugLogger.js';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat } from './geminiChat.js';
import {
  retryWithBackoff,
  type RetryAvailabilityContext,
} from '../utils/retry.js';
import type { ValidationRequiredError } from '../utils/googleQuotaErrors.js';
import { getErrorMessage, isAbortError } from '../utils/errors.js';
import { tokenLimit } from './tokenLimits.js';
import type {
  ChatRecordingService,
  ResumedSessionData,
} from '../services/chatRecordingService.js';
import type { ContentGenerator } from './contentGenerator.js';
import { LoopDetectionService } from '../services/loopDetectionService.js';
import { ChatCompressionService } from '../context/chatCompressionService.js';
import { AgentHistoryProvider } from '../context/agentHistoryProvider.js';
import type { WatcherProgress } from '../agents/types.js';
import { WatcherReportSchema } from '../agents/watcher-agent.js';
import { ideContextStore } from '../ide/ideContext.js';
import {
  logContentRetryFailure,
  logNextSpeakerCheck,
} from '../telemetry/loggers.js';
import type {
  DefaultHookOutput,
  AfterAgentHookOutput,
  AfterModelHookOutput,
  AgentContextHookOutput,
  AgentLoopHookContext,
  BeforeAgentHookOutput,
  BeforeModelHookOutput,
  BeforeToolSelectionHookOutput,
  BeforeToolStopHookOutput,
  SessionStartupHookOutput,
  TailToolCallHookOutput,
  AfterToolContextHookOutput,
} from '../hooks/types.js';
import { coreEvents } from './events.js';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { LlmRole } from '../utils/constants.js';
import { ExecutionLifecycleService } from '../services/executionLifecycleService.js';
import type { Config } from '../config/config.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { Storage } from '../config/storage.js';

export class GeminiClient {
  private chat: GeminiChat | undefined;
  private sessionTurnCount = 0;
  private readonly loopDetectionService: LoopDetectionService;
  private context: AgentLoopContext;

  constructor(private readonly config: Config) {
    this.loopDetectionService = new LoopDetectionService();
    this.context = {
      config,
      messageBus: {
        emitTurn: (turn: Turn) => {
          coreEvents.emitTurn(turn);
        },
        emitCompression: (status: CompressionStatus) => {
          coreEvents.emitCompression(status);
        },
      },
      toolRegistry: config.createToolRegistry(),
      agentRegistry: config.getAgentRegistry(),
    };
  }

  async initialize(): Promise<void> {
    const history = await getInitialChatHistory(this.config);
    this.chat = new GeminiChat(this.config, '', [], history);
    await this.context.agentRegistry.initialize();
  }

  private getChat(): GeminiChat {
    if (!this.chat) {
      throw new Error('Chat not initialized. Call initialize() first.');
    }
    return this.chat;
  }

  async *processTurn(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    maxTokens: number,
    forceFullContext = false,
  ): AsyncGenerator<GenerateContentResponse> {
    this.sessionTurnCount++;

    const modelForLimitCheck = this._getActiveModelForCurrentTurn();

    if (
      this.config.isExperimentalWatcherEnabled() &&
      this.sessionTurnCount > 0 &&
      this.sessionTurnCount % this.config.getExperimentalWatcherInterval() ===
        0
    ) {
      const watcherResult = await this.tryRunWatcher(prompt_id, signal);
      if (watcherResult?.feedback) {
        const feedback = watcherResult.feedback;
        const feedbackRequest = [
          {
            text: `System: Feedback from Watcher (Review of last ${this.config.getExperimentalWatcherInterval()} turns):\n\n${feedback}`,
          },
        ];
        // Inject feedback into the conversation
        this.getChat().addHistory(createUserContent(feedbackRequest));
      }
    }

    const remainingTokenCount =
      tokenLimit(modelForLimitCheck) - this.getChat().getLastPromptTokenCount();

    if (remainingTokenCount < 0) {
      throw new Error(
        `Token limit exceeded for model ${modelForLimitCheck}. ` +
          `Last prompt used ${this.getChat().getLastPromptTokenCount()} tokens, ` +
          `but the limit is ${tokenLimit(modelForLimitCheck)}.`,
      );
    }

    const { compressionStatus } = await this.tryCompressChat(
      prompt_id,
      signal,
      maxTokens,
      forceFullContext,
    );

    const { contextParts, newIdeContext } = this.getIdeContextParts(
      forceFullContext,
    );

    const fullRequest: PartListUnion = [...contextParts, ...request];

    const generateConfig: GenerateContentConfig = {
      tools: this.context.toolRegistry.getFunctionDeclarations() as Tool[],
    };

    const turn = new Turn(
      this.sessionTurnCount,
      fullRequest,
      this._getActiveModelForCurrentTurn(),
    );

    // Call hooks before agent
    const beforeAgentResult = (await this.config.getHookSystem().callHook(
      'before-agent',
      {
        context: this.getHookContext(),
        request: fullRequest,
      },
      signal,
    )) as BeforeAgentHookOutput;

    if (beforeAgentResult?.terminate) {
      return;
    }

    const currentRequest = beforeAgentResult?.request ?? fullRequest;

    // Call hooks for agent context
    const agentContextResult = (await this.config.getHookSystem().callHook(
      'agent-context',
      {
        context: this.getHookContext(),
        request: currentRequest,
      },
      signal,
    )) as AgentContextHookOutput;

    const finalRequest = agentContextResult?.request ?? currentRequest;

    const stream = this.getChat().sendMessageStream(
      finalRequest,
      generateConfig,
    );

    let fullContent: PartListUnion = [];

    for await (const response of stream) {
      if (signal.aborted) {
        throw new Error('Turn aborted');
      }

      const parts = response.response.candidates?.[0]?.content?.parts;
      if (parts) {
        fullContent = [...fullContent, ...parts];
      }
      yield response.response;
    }

    turn.complete(fullContent);

    // Call hooks after model
    const afterModelResult = (await this.config.getHookSystem().callHook(
      'after-model',
      {
        context: this.getHookContext(),
        response: fullContent,
      },
      signal,
    )) as AfterModelHookOutput;

    const finalContent = afterModelResult?.response ?? fullContent;

    // Call hooks before tool selection
    const beforeToolSelectionResult = (await this.config
      .getHookSystem()
      .callHook(
        'before-tool-selection',
        {
          context: this.getHookContext(),
          response: finalContent,
        },
        signal,
      )) as BeforeToolSelectionHookOutput;

    if (beforeToolSelectionResult?.terminate) {
      return;
    }

    // Process tool calls
    const toolCalls = turn.pendingToolCalls;
    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        // Call hooks before tool stop
        const beforeToolStopResult = (await this.config
          .getHookSystem()
          .callHook(
            'before-tool-stop',
            {
              context: this.getHookContext(),
              toolCall: call,
            },
            signal,
          )) as BeforeToolStopHookOutput;

        if (beforeToolStopResult?.terminate) {
          continue;
        }

        const tool = this.context.toolRegistry.getTool(call.functionCall.name);
        if (tool) {
          const invocation = tool.build(call.functionCall.args);
          const result = await invocation.execute(signal);
          turn.addToolResponse(call.functionCall.name, result);

          // Call hooks for tail tool call
          await this.config.getHookSystem().callHook(
            'tail-tool-call',
            {
              context: this.getHookContext(),
              toolCall: call,
              result,
            },
            signal,
          );
        }
      }

      // Recursively process the next turn if tools were called
      const nextGenerator = this.processTurn(
        turn.getToolResponsesAsParts(),
        signal,
        prompt_id,
        maxTokens,
        forceFullContext,
      );

      for await (const nextResponse of nextGenerator) {
        yield nextResponse;
      }
    } else {
      // No more tool calls, turn is finished.
      // Call hooks after agent
      await this.config.getHookSystem().callHook(
        'after-agent',
        {
          context: this.getHookContext(),
          response: finalContent,
        },
        signal,
      );

      // Check if we should continue (next speaker)
      if (!this.config.getSkipNextSpeakerCheck()) {
        const nextSpeaker = await checkNextSpeaker(
          this.getChat().getHistory(),
          this.config.getBaseLlmClient(),
          signal,
          prompt_id,
        );

        if (nextSpeaker?.next_speaker === 'model') {
          logNextSpeakerCheck(prompt_id, 'model');
          const nextGenerator = this.processTurn(
            [],
            signal,
            prompt_id,
            maxTokens,
            forceFullContext,
          );
          for await (const nextResponse of nextGenerator) {
            yield nextResponse;
          }
        } else {
          logNextSpeakerCheck(prompt_id, 'user');
        }
      }
    }

    if (newIdeContext) {
      ideContextStore.setContext(newIdeContext);
    }
  }

  private async tryCompressChat(
    prompt_id: string,
    signal: AbortSignal,
    maxTokens: number,
    forceFullContext: boolean,
  ): Promise<{ compressionStatus: CompressionStatus }> {
    const compressionService = new ChatCompressionService(this.config);
    const result = await compressionService.compressIfNecessary(
      this.getChat(),
      maxTokens,
      forceFullContext,
    );
    return result;
  }

  private getIdeContextParts(forceFullContext: boolean): {
    contextParts: Content[];
    newIdeContext: string | undefined;
  } {
    const ideContext = ideContextStore.getContext();
    if (!ideContext || forceFullContext) {
      return { contextParts: [], newIdeContext: undefined };
    }

    const contextParts: Content[] = [
      {
        role: 'user',
        parts: [{ text: `System: Current IDE context:\n${ideContext}` }],
      },
    ];

    return { contextParts, newIdeContext: ideContext };
  }

  private getHookContext(): AgentLoopHookContext {
    return {
      sessionId: this.config.getSessionId(),
      turnCount: this.sessionTurnCount,
    };
  }

  private _getActiveModelForCurrentTurn(): string {
    return this.config.getActiveModel();
  }

  private async tryRunWatcher(
    prompt_id: string,
    signal: AbortSignal,
  ): Promise<WatcherProgress | undefined> {
    const watcherTool = this.context.toolRegistry.getTool('watcher');
    if (!watcherTool) {
      return undefined;
    }

    const interval = this.config.getExperimentalWatcherInterval();
    const history = this.getChat().getHistory();
    // Get last N turns (approx)
    const recentHistory = history
      .slice(-interval * 2)
      .map((m) => {
        const role = m.role ?? 'unknown';
        const parts =
          m.parts
            ?.map((p) => {
              if (typeof p === 'string') return p;
              if (p && typeof p === 'object') {
                if ('text' in p && typeof p.text === 'string') return p.text;
                if (
                  'functionCall' in p &&
                  p.functionCall &&
                  typeof p.functionCall === 'object' &&
                  'name' in p.functionCall &&
                  'args' in p.functionCall
                ) {
                  return `[CALL: ${String(p.functionCall.name)}(${JSON.stringify(p.functionCall.args)})]`;
                }
                if (
                  'functionResponse' in p &&
                  p.functionResponse &&
                  typeof p.functionResponse === 'object' &&
                  'name' in p.functionResponse &&
                  'response' in p.functionResponse
                ) {
                  return `[RESULT: ${String(p.functionResponse.name)} -> ${JSON.stringify(p.functionResponse.response)}]`;
                }
              }
              return partToString(p, { verbose: true });
            })
            .join('\n') ?? '';
        return `[${role.toUpperCase()}]: ${parts}`;
      })
      .join('\n\n');

    try {
      const invocation = watcherTool.build({ recentHistory });
      const result = await invocation.execute(signal);

      if (result.llmContent) {
        try {
          const contentString = partListUnionToString(result.llmContent);
          const parsed = WatcherReportSchema.parse(JSON.parse(contentString));
          return parsed as WatcherProgress;
        } catch (e) {
          debugLogger.warn('Failed to parse watcher output', e);
          return undefined;
        }
      }
    } catch (e) {
      debugLogger.warn('Error running watcher subagent', e);
    }

    return undefined;
  }
}
