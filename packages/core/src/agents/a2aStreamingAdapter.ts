/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FinishReason, type PartListUnion } from '@google/genai';
import { type ServerGeminiStreamEvent, GeminiEventType } from '../core/turn.js';
import { A2AClientManager } from './a2a-client-manager.js';
import { extractTaskText, extractIdsFromResponse } from './a2aUtils.js';
import { ADCHandler } from './remote-invocation.js';
import type { Config } from '../config/config.js';
import type { Task } from '@a2a-js/sdk';
import type { ThoughtSummary } from '../utils/thoughtUtils.js';

export class A2AStreamingAdapter {
  private static sessionState = new Map<
    string,
    { contextId?: string; taskId?: string }
  >();

  constructor(private readonly config: Config) {}

  async *sendMessageStream(
    agentName: string,
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    const clientManager = A2AClientManager.getInstance();
    const registry = this.config.getAgentRegistry();
    if (!registry) {
      yield {
        type: GeminiEventType.Error,
        value: { error: new Error('Agent registry not found.') },
      };
      return;
    }

    const definition = registry.getDiscoveredDefinition(agentName);
    if (!definition || definition.kind !== 'remote') {
      yield {
        type: GeminiEventType.Error,
        value: { error: new Error(`Remote agent '${agentName}' not found.`) },
      };
      return;
    }

    // Determine query
    const { partToString } = await import('../utils/partUtils.js');
    const queryText = partToString(request);

    // Load agent if needed
    if (!clientManager.getClient(agentName)) {
      try {
        await clientManager.loadAgent(
          agentName,
          definition.agentCardUrl,
          new ADCHandler(),
        );
      } catch (err) {
        yield {
          type: GeminiEventType.Error,
          value: {
            error: new Error(`Failed to load agent ${agentName}: ${err}`),
          },
        };
        return;
      }
    }

    const priorState = A2AStreamingAdapter.sessionState.get(agentName);
    const contextId = priorState?.contextId;
    const taskId = priorState?.taskId;

    const client = clientManager.getClient(agentName);
    if (!client) {
      yield {
        type: GeminiEventType.Error,
        value: { error: new Error(`Client for ${agentName} not initialized.`) },
      };
      return;
    }

    try {
      let currentTask: Task | undefined;
      const response = await client.sendMessage({
        message: {
          kind: 'message',
          role: 'user',
          messageId: prompt_id,
          parts: [{ kind: 'text', text: queryText }],
          contextId,
          taskId,
        },
        configuration: { blocking: false }, // NON-BLOCKING!
      });

      let currentTaskId = taskId;

      if (response.kind === 'message') {
        A2AStreamingAdapter.sessionState.set(
          agentName,
          extractIdsFromResponse(response),
        );
        if (response.parts && response.parts.length > 0) {
          const finalMessageText = response.parts
            .map((p) => (p.kind === 'text' ? p.text : ''))
            .join('\\n');
          if (finalMessageText) {
            yield {
              type: GeminiEventType.Content,
              value: finalMessageText,
              traceId: response.messageId,
            };
          }
        }
      } else if (response.kind === 'task') {
        currentTask = response;
        currentTaskId = response.id;
        A2AStreamingAdapter.sessionState.set(agentName, {
          contextId: response.contextId,
          taskId: response.id,
        });
      }

      if (currentTask && currentTaskId) {
        let lastStatusMessage = '';
        while (true) {
          if (signal.aborted) {
            await client.cancelTask({ id: currentTaskId });
            yield { type: GeminiEventType.UserCancelled };
            return;
          }

          currentTask = await client.getTask({ id: currentTaskId });

          const state = currentTask.status?.state;
          const statusMessage =
            currentTask.status?.message?.parts
              ?.map((p) => (p.kind === 'text' ? p.text : ''))
              .join('\\n') || '';

          if (statusMessage && statusMessage !== lastStatusMessage) {
            const thought: ThoughtSummary = {
              subject: 'Remote Action',
              description: statusMessage,
            };
            yield {
              type: GeminiEventType.Thought,
              value: thought,
            };
            lastStatusMessage = statusMessage;
          }

          if (
            state === 'completed' ||
            state === 'failed' ||
            state === 'canceled' ||
            state === 'input-required'
          ) {
            A2AStreamingAdapter.sessionState.set(
              agentName,
              extractIdsFromResponse(currentTask),
            );
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const finalOutput = extractTaskText(currentTask);
        if (finalOutput) {
          yield {
            type: GeminiEventType.Content,
            value: finalOutput,
            traceId: currentTask.id,
          };
        }

        // Also fire finished event when complete.
        if (currentTask.status?.state === 'completed') {
          yield {
            type: GeminiEventType.Finished,
            value: {
              reason: FinishReason.STOP,
              usageMetadata: undefined,
            },
          };
        }
      }
    } catch (err) {
      yield {
        type: GeminiEventType.Error,
        value: { error: new Error(`A2A Execution Error: ${err}`) },
      };
    }
  }
}
