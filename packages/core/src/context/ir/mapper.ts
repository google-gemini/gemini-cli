/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import { randomUUID } from 'node:crypto';
import type {
  Episode,
  IrMetadata,
  SemanticPart,
  ToolExecution,
  AgentThought,
  AgentYield,
  UserPrompt,
} from './types.js';
import { estimateTokenCountSync } from '../../utils/tokenCalculation.js';

// WeakMap to provide stable, deterministic identity across parses for the exact same Content/Part references
const nodeIdentityMap = new WeakMap<object, string>();

function getStableId(obj: object): string {
  let id = nodeIdentityMap.get(obj);
  if (!id) {
    id = randomUUID();
    nodeIdentityMap.set(obj, id);
  }
  return id;
}

export class IrMapper {
  /**
   * Translates a flat Gemini Content[] array into our rich Episodic Intermediate Representation.
   * Groups adjacent function calls and responses into unified ToolExecution nodes.
   */
  static toIr(history: readonly Content[]): Episode[] {
    const episodes: Episode[] = [];
    let currentEpisode: Partial<Episode> | null = null;
    const pendingCallParts: Map<string, Part> = new Map();

    const createMetadata = (parts: Part[]): IrMetadata => {
      const tokens = estimateTokenCountSync(parts);
      return {
        originalTokens: tokens,
        currentTokens: tokens,
        transformations: [],
      };
    };

    const finalizeEpisode = () => {
      if (currentEpisode && currentEpisode.trigger) {
        episodes.push(currentEpisode as unknown as Episode); // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion
      }
      currentEpisode = null;
    };

    for (const msg of history) {
      if (!msg.parts) continue;

      if (msg.role === 'user') {
        const hasToolResponses = msg.parts.some((p) => !!p.functionResponse);
        const hasUserParts = msg.parts.some(
          (p) => !!p.text || !!p.inlineData || !!p.fileData,
        );

        if (hasToolResponses) {
          if (!currentEpisode) {
            currentEpisode = {
              id: getStableId(msg),
              timestamp: Date.now(),
              trigger: {
                id: getStableId(msg.parts[0] || msg),
                type: 'SYSTEM_EVENT',
                name: 'history_resume',
                payload: {},
                metadata: createMetadata([]),
              },
              steps: [],
            };
          }

          for (const part of msg.parts) {
            if (part.functionResponse) {
              const callId = part.functionResponse.id || '';
              const matchingCall = pendingCallParts.get(callId);

              const intentTokens = matchingCall
                ? estimateTokenCountSync([matchingCall])
                : 0;
              const obsTokens = estimateTokenCountSync([part]);

              const step: ToolExecution = {
                id: getStableId(part),
                type: 'TOOL_EXECUTION',
                toolName: part.functionResponse.name || 'unknown',
                intent:
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                  (matchingCall?.functionCall?.args as unknown as Record<
                    string,
                    unknown
                  >) || {},
                observation:
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                  (part.functionResponse.response as unknown as Record<
                    string,
                    unknown
                  >) || {},
                tokens: {
                  intent: intentTokens,
                  observation: obsTokens,
                },
                metadata: {
                  originalTokens: intentTokens + obsTokens,
                  currentTokens: intentTokens + obsTokens,
                  transformations: [],
                },
              };
              currentEpisode.steps!.push(step);
              if (callId) pendingCallParts.delete(callId);
            }
          }
        }

        if (hasUserParts) {
          finalizeEpisode();

          const semanticParts: SemanticPart[] = [];
          for (const p of msg.parts) {
            if (p.text !== undefined)
              semanticParts.push({ type: 'text', text: p.text });
            else if (p.inlineData)
              semanticParts.push({
                type: 'inline_data',
                mimeType: p.inlineData.mimeType || '',
                data: p.inlineData.data || '',
              });
            else if (p.fileData)
              semanticParts.push({
                type: 'file_data',
                mimeType: p.fileData.mimeType || '',
                fileUri: p.fileData.fileUri || '',
              });
            else if (!p.functionResponse)
              semanticParts.push({ type: 'raw_part', part: p }); // Preserve unknowns
          }

          const trigger: UserPrompt = {
            id: getStableId(msg.parts[0] || msg),
            type: 'USER_PROMPT',
            semanticParts,
            metadata: createMetadata(
              msg.parts.filter((p) => !p.functionResponse),
            ),
          };

          currentEpisode = {
            id: getStableId(msg),
            timestamp: Date.now(),
            trigger,
            steps: [],
          };
        }
      } else if (msg.role === 'model') {
        if (!currentEpisode) {
          currentEpisode = {
            id: getStableId(msg),
            timestamp: Date.now(),
            trigger: {
              id: getStableId(msg.parts[0] || msg),
              type: 'SYSTEM_EVENT',
              name: 'model_init',
              payload: {},
              metadata: createMetadata([]),
            },
            steps: [],
          };
        }

        for (const part of msg.parts) {
          if (part.functionCall) {
            const callId = part.functionCall.id || '';
            if (callId) pendingCallParts.set(callId, part);
          } else if (part.text) {
            const thought: AgentThought = {
              id: getStableId(part),
              type: 'AGENT_THOUGHT',
              text: part.text,
              metadata: createMetadata([part]),
            };
            currentEpisode.steps!.push(thought);
          }
        }
      }
    }

    if (currentEpisode) {
      if (currentEpisode.steps && currentEpisode.steps.length > 0) {
        const lastStep = currentEpisode.steps[currentEpisode.steps.length - 1];
        if (lastStep.type === 'AGENT_THOUGHT') {
          const yieldNode: AgentYield = {
            id: lastStep.id,
            type: 'AGENT_YIELD',
            text: lastStep.text,
            metadata: lastStep.metadata,
          };
          currentEpisode.steps.pop();
          currentEpisode.yield = yieldNode;
        }
      }
      finalizeEpisode();
    }

    return episodes;
  }

  /**
   * Re-serializes the Episodic IR back into a flat Gemini Content[] array.
   */
  static fromIr(episodes: Episode[]): Content[] {
    const history: Content[] = [];

    for (const ep of episodes) {
      // 1. Serialize Trigger
      if (ep.trigger.type === 'USER_PROMPT') {
        const parts: Part[] = [];
        for (const sp of ep.trigger.semanticParts) {
          if (sp.presentation) {
            parts.push({ text: sp.presentation.text });
          } else if (sp.type === 'text') {
            parts.push({ text: sp.text });
          } else if (sp.type === 'inline_data') {
            parts.push({
              inlineData: { mimeType: sp.mimeType, data: sp.data },
            });
          } else if (sp.type === 'file_data') {
            parts.push({
              fileData: { mimeType: sp.mimeType, fileUri: sp.fileUri },
            });
          } else if (sp.type === 'raw_part') {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unsafe-type-assertion
            parts.push(sp.part as unknown as Part);
          }
        }
        if (parts.length > 0) history.push({ role: 'user', parts });
      }

      // 2. Serialize Steps
      let pendingModelParts: Part[] = [];
      let pendingUserParts: Part[] = [];

      const flushPending = () => {
        if (pendingModelParts.length > 0) {
          history.push({ role: 'model', parts: [...pendingModelParts] });
          pendingModelParts = [];
        }
        if (pendingUserParts.length > 0) {
          history.push({ role: 'user', parts: [...pendingUserParts] });
          pendingUserParts = [];
        }
      };

      for (const step of ep.steps) {
        if (step.type === 'AGENT_THOUGHT') {
          if (pendingUserParts.length > 0) flushPending();
          pendingModelParts.push({ text: step.presentation?.text ?? step.text });
        } else if (step.type === 'TOOL_EXECUTION') {
          pendingModelParts.push({
            functionCall: {
              name: step.toolName,
              args: step.intent as unknown as Record<string, unknown>, // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion
              id: step.id,
            },
          });
          const observation = step.presentation
            ? step.presentation.observation
            : step.observation;
          pendingUserParts.push({
            functionResponse: {
              name: step.toolName,
              response: observation as unknown as Record<string, unknown>, // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion
              id: step.id,
            },
          });
        }
      }
      flushPending();

      // 3. Serialize Yield
      if (ep.yield) {
        history.push({
          role: 'model',
          parts: [{ text: ep.yield.presentation?.text ?? ep.yield.text }],
        });
      }
    }

    return history;
  }
}
