/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { GeminiEventType } from '../core/turn.js';
import { GeminiClient } from '../core/client.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import { ResourceRegistry } from '../resources/resource-registry.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { PolicyDecision } from '../policy/types.js';
import { getErrorMessage } from '../utils/errors.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { AgentSession } from './agent-session.js';
import { contentPartsToGeminiParts } from './content-utils.js';
import {
  createTranslationState,
  mapFinishReason,
  translateEvent,
  type TranslationState,
} from './event-translator.js';
import type {
  AgentEvent,
  AgentProtocol,
  AgentSend,
  StreamEndReason,
  Unsubscribe,
} from './types.js';

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

class BtwAgentProtocol implements AgentProtocol {
  private readonly client: GeminiClient;
  private readonly promptId: string;
  private readonly eventsInternal: AgentEvent[] = [];
  private readonly subscribers = new Set<(event: AgentEvent) => void>();

  private translationState: TranslationState;
  private agentEndEmitted = false;
  private activeStreamId?: string;
  private abortController = new AbortController();

  constructor(client: GeminiClient, promptId: string) {
    this.client = client;
    this.promptId = promptId;
    this.translationState = createTranslationState();
  }

  get events(): readonly AgentEvent[] {
    return this.eventsInternal;
  }

  subscribe(callback: (event: AgentEvent) => void): Unsubscribe {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  async send(payload: AgentSend): Promise<{ streamId: string | null }> {
    const message = 'message' in payload ? payload.message : undefined;
    if (!message) {
      throw new Error('BTW sessions only support message sends.');
    }

    if (this.activeStreamId) {
      throw new Error('BTW session already has an active stream.');
    }

    this.beginNewStream();
    const streamId = this.translationState.streamId;
    const parts = contentPartsToGeminiParts(message.content);

    setTimeout(() => {
      void this.runInBackground(parts, message.displayContent);
    }, 0);

    return { streamId };
  }

  async abort(): Promise<void> {
    this.abortController.abort();
  }

  private beginNewStream(): void {
    this.translationState = createTranslationState();
    this.abortController = new AbortController();
    this.agentEndEmitted = false;
    this.activeStreamId = this.translationState.streamId;
  }

  private async runInBackground(
    parts: ReturnType<typeof contentPartsToGeminiParts>,
    displayContent?: string,
  ): Promise<void> {
    this.ensureAgentStart();

    try {
      for await (const event of this.client.sendMessageStream(
        parts,
        this.abortController.signal,
        this.promptId,
        undefined,
        false,
        displayContent,
      )) {
        if (this.abortController.signal.aborted) {
          this.finishStream('aborted');
          return;
        }

        if (event.type === GeminiEventType.ToolCallRequest) {
          this.emit([
            this.makeErrorEvent(
              'PERMISSION_DENIED',
              `Unauthorized tool call: '${event.value.name}' is not available in /btw sessions.`,
              true,
            ),
          ]);
          this.finishStream('failed');
          return;
        }

        this.emit(translateEvent(event, this.translationState));

        switch (event.type) {
          case GeminiEventType.Finished:
            this.finishStream(mapFinishReason(event.value.reason));
            return;
          case GeminiEventType.Error:
          case GeminiEventType.InvalidStream:
          case GeminiEventType.ContextWindowWillOverflow:
            this.finishStream('failed');
            return;
          case GeminiEventType.AgentExecutionStopped:
          case GeminiEventType.UserCancelled:
          case GeminiEventType.MaxSessionTurns:
            this.clearActiveStream();
            return;
          default:
            break;
        }
      }

      this.finishStream('completed');
    } catch (error: unknown) {
      if (this.abortController.signal.aborted || isAbortLikeError(error)) {
        this.finishStream('aborted');
      } else {
        this.emit([
          this.makeErrorEvent('INTERNAL', getErrorMessage(error), true),
        ]);
        this.finishStream('failed');
      }
    }
  }

  private emit(events: AgentEvent[]): void {
    if (events.length === 0) {
      return;
    }

    const subscribers = [...this.subscribers];
    for (const event of events) {
      if (!this.eventsInternal.some((existing) => existing.id === event.id)) {
        this.eventsInternal.push(event);
      }
      if (event.type === 'agent_end') {
        this.agentEndEmitted = true;
      }
      for (const subscriber of subscribers) {
        subscriber(event);
      }
    }
  }

  private ensureAgentStart(): void {
    if (this.translationState.streamStartEmitted) {
      return;
    }

    this.translationState.streamStartEmitted = true;
    this.emit([
      {
        id: `${this.translationState.streamId}-${this.translationState.eventCounter++}`,
        timestamp: new Date().toISOString(),
        streamId: this.translationState.streamId,
        type: 'agent_start',
      },
    ]);
  }

  private finishStream(reason: StreamEndReason): void {
    if (!this.agentEndEmitted && this.translationState.streamStartEmitted) {
      this.emit([
        {
          id: `${this.translationState.streamId}-${this.translationState.eventCounter++}`,
          timestamp: new Date().toISOString(),
          streamId: this.translationState.streamId,
          type: 'agent_end',
          reason,
        },
      ]);
    }
    this.clearActiveStream();
  }

  private clearActiveStream(): void {
    this.activeStreamId = undefined;
  }

  private makeErrorEvent(
    status: AgentEvent<'error'>['status'],
    message: string,
    fatal: boolean,
  ): AgentEvent<'error'> {
    return {
      id: `${this.translationState.streamId}-${this.translationState.eventCounter++}`,
      timestamp: new Date().toISOString(),
      streamId: this.translationState.streamId,
      type: 'error',
      status,
      message,
      fatal,
    };
  }
}

export function createBtwAgentLoopContext(
  parentContext: AgentLoopContext,
  promptId: string = `btw-${randomUUID().slice(0, 8)}`,
): AgentLoopContext {
  // Create an isolated Config view so BTW chat state cannot mutate the main
  // interactive turn bookkeeping.
  const geminiClientRef: { current?: GeminiClient } = {};
  const getForkedGeminiClient = (): GeminiClient => {
    const client = geminiClientRef.current;
    if (!client) {
      throw new Error('BTW Gemini client accessed before initialization.');
    }
    return client;
  };
  // Object.setPrototypeOf() returns any in lib typings; the value shape here is
  // intentional and verified by tests.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const forkedConfig: AgentLoopContext['config'] = Object.setPrototypeOf(
    {
      get geminiClient() {
        return getForkedGeminiClient();
      },
      getGeminiClient() {
        return getForkedGeminiClient();
      },
    },
    parentContext.config,
  );
  const denyAllPolicy = new PolicyEngine({
    rules: [
      {
        toolName: '*',
        decision: PolicyDecision.DENY,
        priority: 100,
      },
    ],
  });
  const messageBus = new MessageBus(denyAllPolicy);
  const toolRegistry = new ToolRegistry(forkedConfig, messageBus);
  const promptRegistry = new PromptRegistry();
  const resourceRegistry = new ResourceRegistry();

  const bootstrapContext: AgentLoopContext = {
    config: forkedConfig,
    promptId,
    parentSessionId: parentContext.parentSessionId ?? parentContext.promptId,
    toolRegistry,
    promptRegistry,
    resourceRegistry,
    messageBus,
    get geminiClient() {
      return getForkedGeminiClient();
    },
    sandboxManager: parentContext.sandboxManager,
  };
  geminiClientRef.current = new GeminiClient(bootstrapContext);

  return bootstrapContext;
}

export async function createBtwAgentSession(
  parentContext: AgentLoopContext,
): Promise<AgentSession> {
  const btwContext = createBtwAgentLoopContext(parentContext);
  await btwContext.geminiClient.initialize();
  btwContext.geminiClient.setHistory(parentContext.geminiClient.getHistory());
  return new AgentSession(
    new BtwAgentProtocol(btwContext.geminiClient, btwContext.promptId),
  );
}
