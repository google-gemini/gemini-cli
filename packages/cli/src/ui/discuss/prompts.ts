/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentId, DiscussionSessionState } from './discussionState.js';

type PromptTemplateName =
  | 'system'
  | 'builder'
  | 'skeptic'
  | 'explorer'
  | 'moderator'
  | 'synthesis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.join(__dirname, 'prompts');

const FALLBACK_TEMPLATES: Record<PromptTemplateName, string> = {
  system:
    'System: 4-agent discussion. Output JSON only with action, priority, kind, text, targetsMessageId.',
  builder:
    'Builder: produce concrete implementation-oriented recommendations with tradeoffs.',
  skeptic: 'Skeptic: challenge assumptions, expose risks, propose mitigations.',
  explorer:
    'Explorer: provide novel alternatives and reframes grounded in user goals.',
  moderator:
    'Moderator: drive discussion completeness, resolve stalemates, track requirements, prefer UX over simplicity.',
  synthesis:
    'Synthesis: summarize converging insights, unresolved risks, and next action in concise bullets.',
};

const cache = new Map<PromptTemplateName, string>();

/**
 * Mitigates prompt-injection when untrusted text (user chime-ins, pasted thread
 * content, model-produced fields) is embedded in discuss prompts: angle brackets
 * cannot mimic tags or nested instructions.
 */
function sanitizeDiscussPromptText(text: string): string {
  return text.replaceAll('<', '\u003c').replaceAll('>', '\u003e');
}

async function readTemplate(name: PromptTemplateName): Promise<string> {
  const cached = cache.get(name);
  if (cached) {
    return cached;
  }

  const filePath = path.join(PROMPTS_DIR, `${name}.md`);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    cache.set(name, content);
    return content;
  } catch {
    // Fall back if file not found (e.g. running from source without build).
  }

  const fallback = FALLBACK_TEMPLATES[name];
  cache.set(name, fallback);
  return fallback;
}

function formatRecentMessages(state: DiscussionSessionState): string {
  return state.messages
    .slice(-28)
    .map((m) => {
      const safeText = sanitizeDiscussPromptText(m.text);
      return m.kind
        ? `[${m.id}] ${m.role}:${m.kind} ${safeText}`
        : `[${m.id}] ${m.role} ${safeText}`;
    })
    .join('\n');
}

function formatSessionState(state: DiscussionSessionState): string {
  return [
    `Session active: ${state.active}`,
    `Agent messages used: ${state.agentMessageCount}/${state.maxAgentMessages}`,
    `Open objections: ${state.openObjections.length}`,
    `Endorsed messages: ${state.endorsedMessageIds.length}`,
  ].join('\n');
}

export async function buildAgentPrompt(
  agent: AgentId,
  state: DiscussionSessionState,
  latestUserMessage: string,
): Promise<string> {
  const [system, agentTemplate] = await Promise.all([
    readTemplate('system'),
    readTemplate(agent),
  ]);

  return `${system}

${agentTemplate}

## Dynamic Context
${formatSessionState(state)}

Latest user chime-in:
${sanitizeDiscussPromptText(latestUserMessage)}

Recent thread (newest near end):
${formatRecentMessages(state)}

## Final instruction
Respond strictly as JSON using the contract in the system prompt.
Reference specific ideas or concerns from the thread above by name or content. Do not narrate your thought process.`;
}

export async function buildModeratorPrompt(
  state: DiscussionSessionState,
  latestUserMessage: string,
): Promise<string> {
  const [system, moderatorTemplate] = await Promise.all([
    readTemplate('system'),
    readTemplate('moderator'),
  ]);

  const unmetSection =
    state.unmetRequirements.length > 0
      ? `\nPreviously flagged unmet requirements:\n${state.unmetRequirements.map((r) => `- ${sanitizeDiscussPromptText(r)}`).join('\n')}`
      : '';

  const cyclicSection =
    state.cyclicTopics.length > 0
      ? `\nPreviously flagged cyclic topics:\n${state.cyclicTopics.map((t) => `- ${sanitizeDiscussPromptText(t)}`).join('\n')}`
      : '';

  return `${system}

${moderatorTemplate}

## Dynamic Context
${formatSessionState(state)}
${unmetSection}
${cyclicSection}

Original topic (check all requirements against this):
${sanitizeDiscussPromptText(state.topic)}

Latest user chime-in:
${sanitizeDiscussPromptText(latestUserMessage)}

Recent thread (newest near end):
${formatRecentMessages(state)}

## Final instruction
You are Moderator. Assess the current state of the discussion against the original topic's requirements.
Respond strictly as JSON using the contract in the system prompt (including the Moderator-only fields: unmetRequirements, isComplete).
Be specific about what is missing or cycling. Do not narrate your thought process.`;
}

export async function buildSynthesisPrompt(
  state: DiscussionSessionState,
): Promise<string> {
  const [system, synthesis] = await Promise.all([
    readTemplate('system'),
    readTemplate('synthesis'),
  ]);

  return `${system}

${synthesis}

## Discussion Snapshot
${formatSessionState(state)}

Recent thread:
${formatRecentMessages(state)}`;
}
