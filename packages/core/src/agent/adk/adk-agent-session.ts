/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Session,
  Event as AdkEvent,
  BaseSessionService,
} from '@google/adk';
import { InMemorySessionService, Runner, StreamingMode } from '@google/adk';
import {
  createUserContent,
  type Content as GenAIContent,
  type FinishReason,
} from '@google/genai';
import { AgentSession } from '../agent-session.js';
import type {
  AgentProtocol,
  AgentSend,
  AgentEvent,
  Unsubscribe,
} from '../types.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type { Config } from '../../config/config.js';
import { mapFinishReason } from '../event-translator.js';
import { contentPartsToGeminiParts } from '../content-utils.js';
import {
  createAdkAgent,
  type LlmAgentWithDynamicModel,
} from './adk-agent-utils.js';
import {
  translateEvent,
  elicitationToAdkToolConfirmation,
} from './adk-event-translator.js';
import {
  isUserMessage,
  isElicitationResponses,
  isUpdateCommand,
  isAction,
  type UpdateCommand,
  type ActionCommand,
} from '../types-utils.js';

const ADK_APP_NAME = 'gemini-cli-app';

type SendResult = { streamId: string | null };

enum AgentRunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  ABORTED = 'aborted',
  FAILED = 'failed',
}

export interface AdkSessionParams {
  userId: string;
  config: Config;
}

export class AdkAgentSession extends AgentSession {
  constructor(params: AdkSessionParams) {
    super(new AdkAgentProtocol(params));
  }
}

export class AdkAgentProtocol implements AgentProtocol {
  private readonly userId: string;
  private readonly config: Config;
  private adkSession?: Session;
  private adkAgent?: LlmAgentWithDynamicModel;
  private adkRunner?: Runner;
  private streamId?: string;
  private currentRun?: Promise<void>;
  private abortController?: AbortController;
  private status = AgentRunStatus.PENDING;
  private readonly adkSessionService: BaseSessionService;

  private eventCounter = 0;
  private agentEvents: AgentEvent[] = [];
  private streamListeners: Array<(event: AgentEvent) => void> = [];
  private initialized = false;

  get events(): readonly AgentEvent[] {
    return this.agentEvents;
  }

  constructor({ userId, config }: AdkSessionParams) {
    this.userId = userId;
    this.config = config;
    this.adkSessionService = new InMemorySessionService();
  }

  async send(payload: AgentSend): Promise<SendResult> {
    if (isUserMessage(payload)) {
      this.emit({
        type: 'message',
        role: 'user',
        content: payload.message.content,
      });

      const genAIParts = contentPartsToGeminiParts(payload.message.content);

      return this.runAgent(createUserContent(genAIParts));
    }

    if (isElicitationResponses(payload)) {
      const toolConfirmationResponses = [];

      for (const elicitation of payload.elicitations) {
        toolConfirmationResponses.push(
          elicitationToAdkToolConfirmation(elicitation, this.agentEvents),
        );

        this.emit({
          type: 'elicitation_response',
          ...elicitation,
        });
      }

      return this.runAgent(createUserContent(toolConfirmationResponses));
    }

    if (isUpdateCommand(payload)) {
      this.emit({
        type: 'session_update',
        ...payload.update,
      });

      return this.processUpdateCommand(payload.update);
    }

    if (isAction(payload)) {
      // TODO: ??? What action to dispatch here?
      return this.processActionCommand(payload.action);
    }

    throw new Error('Unknown payload type');
  }

  subscribe(callback: (event: AgentEvent) => void): Unsubscribe {
    this.streamListeners.push(callback);

    return () => {
      this.streamListeners = this.streamListeners.filter(
        (cb) => cb !== callback,
      );
    };
  }

  async abort(): Promise<void> {
    this.abortController?.abort();
  }

  private async prepareAdkSessionIfNeeded() {
    if (this.adkSession) {
      return;
    }

    debugLogger.debug('[ADK AGENT PROTOCOL] Creating ADK session');
    await this.config.createToolRegistry();
    this.adkAgent = await createAdkAgent(this.config.getModel(), this.config);
    this.adkSession = await this.adkSessionService.createSession({
      userId: this.userId,
      appName: ADK_APP_NAME,
    });
    this.adkRunner = new Runner({
      appName: this.adkSession.appName,
      agent: this.adkAgent,
      sessionService: this.adkSessionService,
      plugins: [],
    });
    debugLogger.debug('[ADK AGENT PROTOCOL] ADK session created');
  }

  private emit(event: Partial<AgentEvent>) {
    const streamId = event.streamId ?? this.streamId;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const agentEvent = {
      ...event,
      id: event.id ?? streamId + '-' + this.eventCounter++,
      timestamp: event.timestamp ?? new Date().toISOString(),
      streamId,
    } as AgentEvent;

    debugLogger.debug('[ADK AGENT PROTOCOL] Emitting event:', agentEvent);

    this.agentEvents.push(agentEvent);
    this.streamListeners.forEach((listener) => listener(agentEvent));
  }

  private async runAgent(newMessage: GenAIContent): Promise<SendResult> {
    await this.prepareAdkSessionIfNeeded();

    debugLogger.debug(
      '[ADK AGENT PROTOCOL] Waiting for previous agent run to finish',
    );
    // Wait for the previous agent run to finish before starting a new one.
    if (this.currentRun) {
      await this.currentRun;
      debugLogger.debug('[ADK AGENT PROTOCOL] Previous agent run finished');
    }

    if (!this.initialized) {
      this.emit({
        type: 'initialize',
        sessionId: this.adkSession!.id,
        agentId: this.adkAgent!.name,
      });
      this.initialized = true;
    }

    this.emit({
      type: 'agent_start',
      streamId: this.streamId,
    });

    this.abortController = new AbortController();
    let currentRunResolver: () => void;
    this.currentRun = new Promise((resolve) => {
      currentRunResolver = resolve;
    });

    this.status = AgentRunStatus.RUNNING;
    const eventStream = this.adkRunner!.runAsync({
      userId: this.userId,
      sessionId: this.adkSession!.id,
      newMessage,
      runConfig: {
        streamingMode: StreamingMode.SSE,
      },
      abortSignal: this.abortController.signal,
    });

    const processAdkEventStream = async () => {
      const events: AdkEvent[] = [];

      let wasPartialEvent = false;

      const firstEvent = await eventStream.next();
      if (firstEvent.done) {
        this.emit({
          type: 'error',
          message: 'No first event received from ADK runner',
        });
      }
      this.streamId = firstEvent.value!.invocationId;

      try {
        for await (const adkEvent of eventStream) {
          events.push(adkEvent);

          if (this.abortController?.signal.aborted) {
            this.status = AgentRunStatus.ABORTED;
          }

          if (adkEvent.usageMetadata) {
            this.emit({
              type: 'usage',
              model: this.config.getModel(),
              inputTokens: adkEvent.usageMetadata.promptTokenCount,
              outputTokens:
                (adkEvent.usageMetadata.toolUsePromptTokenCount || 0) +
                (adkEvent.usageMetadata.thoughtsTokenCount || 0) +
                (adkEvent.usageMetadata.candidatesTokenCount || 0),
              cachedTokens: adkEvent.usageMetadata.cachedContentTokenCount,
            });
          }

          if (adkEvent.partial) {
            wasPartialEvent = true;
          }

          // ADK aggregates partial text events and emit another one as non-partial
          // when it's done. We skip such events to prevent duplicate text.
          // Why ADK is doing that?
          if (wasPartialEvent && !adkEvent.partial) {
            if (adkEvent.content?.parts && adkEvent.content.parts[0].text) {
              continue;
            }
          }

          const agentEvents = translateEvent(adkEvent);
          for (const agentEvent of agentEvents) {
            this.emit(agentEvent);
          }
        }

        this.status = AgentRunStatus.COMPLETED;
        const agentEndEvent = getAgentRunEndEvent(events, this.status);
        this.emit(agentEndEvent);
      } catch (e: unknown) {
        this.status = AgentRunStatus.FAILED;

        this.emit({
          type: 'error',
          status: 'UNKNOWN',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          message: (e as Error).message,
          fatal: true,
        });
        this.emit({
          type: 'agent_end',
          reason: 'failed',
        });
      } finally {
        this.abortController = undefined;
        this.currentRun = undefined;
        currentRunResolver();
      }
    };

    // do not wait for the stream to finish, just start processing it
    void processAdkEventStream();

    return { streamId: this.streamId! };
  }

  private async processUpdateCommand(
    update: UpdateCommand,
  ): Promise<SendResult> {
    if (update.title) {
      this.emit({
        type: 'session_update',
        title: update.title,
      });
    }

    if (update.model) {
      this.adkAgent!.setModel(update.model);
      this.emit({
        type: 'session_update',
        model: update.model,
      });
    }

    if (update.config) {
      this.adkAgent!.setConfig(update.config);
      this.emit({
        type: 'session_update',
        config: update.config,
      });
    }

    return { streamId: this.streamId || null };
  }

  private async processActionCommand(
    _action: ActionCommand,
  ): Promise<SendResult> {
    debugLogger.warn(
      '[ADK Agent Session]: action command not supported by ADK runner yet',
    );

    return { streamId: this.streamId || null };
  }
}

function getAgentRunEndEvent(
  events: AdkEvent[],
  runStatus: AgentRunStatus,
): Partial<AgentEvent> {
  switch (runStatus) {
    case AgentRunStatus.COMPLETED: {
      const lastEvent = events[events.length - 1];
      const elicitationIds = [];
      for (const key of Object.keys(
        lastEvent.actions?.requestedToolConfirmations || {},
      )) {
        elicitationIds.push(key);
      }

      if (elicitationIds.length > 0) {
        return {
          type: 'agent_end',
          reason: 'elicitation',
          elicitationIds,
        };
      }

      return {
        type: 'agent_end',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        reason: mapFinishReason(lastEvent.finishReason as FinishReason),
      };
    }
    case AgentRunStatus.FAILED: {
      return {
        type: 'agent_end',
        reason: 'failed',
      };
    }
    case AgentRunStatus.ABORTED: {
      return {
        type: 'agent_end',
        reason: 'aborted',
      };
    }
    default:
      return {
        type: 'agent_end',
        reason: 'unknown',
      };
  }
}
