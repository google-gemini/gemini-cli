/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import type { Episode, EpisodeStep, UserPrompt, AgentYield } from './types.js';

export function fromIr(episodes: Episode[]): Content[] {
  const history: Content[] = [];

  for (const ep of episodes) {
    if (ep.trigger.type === 'USER_PROMPT') {
      const triggerContent = serializeTrigger(ep.trigger);
      if (triggerContent) history.push(triggerContent);
    }

    const stepContents = serializeSteps(ep.steps);
    history.push(...stepContents);

    if (ep.yield) {
      history.push(serializeYield(ep.yield));
    }
  }

  return history;
}

function serializeTrigger(trigger: UserPrompt): Content | null {
  const parts: Part[] = [];
  for (const sp of trigger.semanticParts) {
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
      parts.push(sp.part);
    }
  }
  return parts.length > 0 ? { role: 'user', parts } : null;
}

function serializeSteps(steps: EpisodeStep[]): Content[] {
  const history: Content[] = [];
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

  for (const step of steps) {
    if (step.type === 'AGENT_THOUGHT') {
      if (pendingUserParts.length > 0) flushPending();
      pendingModelParts.push({
        text: step.presentation?.text ?? step.text,
      });
    } else if (step.type === 'TOOL_EXECUTION') {
      pendingModelParts.push({
        functionCall: {
          name: step.toolName,
          args: step.intent,
          id: step.id,
        },
      });
      const observation = step.presentation
        ? step.presentation.observation
        : step.observation;
      pendingUserParts.push({
        functionResponse: {
          name: step.toolName,
          response:
            typeof observation === 'string'
              ? { message: observation }
              : observation,
          id: step.id,
        },
      });
    }
  }
  flushPending();

  return history;
}

function serializeYield(yieldNode: AgentYield): Content {
  return {
    role: 'model',
    parts: [{ text: yieldNode.presentation?.text ?? yieldNode.text }],
  };
}
