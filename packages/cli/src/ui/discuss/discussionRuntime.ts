/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  LlmRole,
  type Config,
  getErrorMessage,
  promptIdContext,
} from '@google/gemini-cli-core';
import { MessageType, type HistoryItemWithoutId } from '../types.js';
import type { UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';
import {
  type AgentId,
  type PanelistId,
  type CandidateReply,
  type DiscussionSessionState,
  appendAgentMessage,
  appendUserMessage,
  clearDiscussionState,
  createInitialState,
  loadDiscussionState,
  saveDiscussionState,
} from './discussionState.js';
import {
  buildAgentPrompt,
  buildModeratorPrompt,
  buildSynthesisPrompt,
} from './prompts.js';

const PANELISTS: PanelistId[] = ['builder', 'skeptic', 'explorer'];
const MAX_AUTO_FOLLOW_UP_ROUNDS = 2;
const turnQueues = new Map<string, Promise<void>>();
const turnAbortControllers = new Map<string, AbortController>();

function addMessage(
  addItem: UseHistoryManagerReturn['addItem'],
  item: HistoryItemWithoutId,
): void {
  addItem(item, Date.now());
}

function addAgentMessage(
  addItem: UseHistoryManagerReturn['addItem'],
  agent: AgentId,
  text: string,
): void {
  addMessage(addItem, { type: 'discuss_agent', agent, text });
}

async function expandMarkdownReference(
  config: Config,
  text: string,
): Promise<string> {
  const trimmed = text.trim();
  const match = trimmed.match(/^@(.+\.md)\s*$/);
  if (!match) {
    return text;
  }

  const projectRoot = config.getProjectRoot();
  const rawPath = match[1].trim();
  const fullPath = path.resolve(projectRoot, rawPath);

  try {
    const content = await fs.readFile(fullPath, 'utf8');
    return content;
  } catch {
    // If the file can't be read, fall back to original text so we don't silently drop input.
    return text;
  }
}

function classifyKind(agent: AgentId, text: string): CandidateReply['kind'] {
  if (agent === 'moderator') {
    return 'direction';
  }
  const lower = text.toLowerCase();
  if (
    agent === 'skeptic' ||
    lower.includes('risk') ||
    lower.includes('concern') ||
    lower.includes('failure')
  ) {
    return 'objection';
  }
  if (lower.includes('?')) {
    return 'question';
  }
  return 'proposal';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clampPriority(value: unknown, fallback: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
  if (typeof value !== 'number') {
    return fallback;
  }
  const rounded = Math.round(value);
  if (rounded <= 0) return 0;
  if (rounded === 1) return 1;
  if (rounded === 2) return 2;
  return 3;
}

function parseJsonReply(agent: AgentId, raw: string): CandidateReply {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      agent,
      action: trimmed ? 'speak' : 'pass',
      text: trimmed,
      priority: trimmed ? 2 : 0,
      kind: classifyKind(agent, trimmed),
    };
  }

  try {
    const parsedUnknown: unknown = JSON.parse(jsonMatch[0]);
    if (!isRecord(parsedUnknown)) {
      throw new Error('Invalid JSON reply shape');
    }
    const parsed = parsedUnknown;
    const text =
      typeof parsed['text'] === 'string' ? parsed['text'].trim() : '';
    const action =
      parsed['action'] === 'pass' ||
      parsed['action'] === 'speak' ||
      parsed['action'] === 'escalate'
        ? parsed['action']
        : text
          ? 'speak'
          : 'pass';
    const priority =
      action === 'speak' || action === 'escalate'
        ? clampPriority(parsed['priority'], 2)
        : clampPriority(parsed['priority'], 0);
    const kind =
      parsed['kind'] === 'proposal' ||
      parsed['kind'] === 'objection' ||
      parsed['kind'] === 'question' ||
      parsed['kind'] === 'direction'
        ? parsed['kind']
        : classifyKind(agent, text);

    return {
      agent,
      action,
      text,
      priority,
      kind,
      targetsMessageId:
        typeof parsed['targetsMessageId'] === 'string'
          ? parsed['targetsMessageId']
          : undefined,
      unmetRequirements: Array.isArray(parsed['unmetRequirements'])
        ? parsed['unmetRequirements'].filter(
            (r): r is string => typeof r === 'string',
          )
        : undefined,
      isComplete:
        typeof parsed['isComplete'] === 'boolean'
          ? parsed['isComplete']
          : undefined,
      requestFollowUpRound:
        typeof parsed['requestFollowUpRound'] === 'boolean'
          ? parsed['requestFollowUpRound']
          : undefined,
      followUpPrompt:
        typeof parsed['followUpPrompt'] === 'string'
          ? parsed['followUpPrompt'].trim()
          : undefined,
    };
  } catch {
    return {
      agent,
      action: trimmed ? 'speak' : 'pass',
      text: trimmed,
      priority: trimmed ? 2 : 0,
      kind: classifyKind(agent, trimmed),
    };
  }
}

async function generateAgentReply(
  config: Config,
  agent: AgentId,
  state: DiscussionSessionState,
  latestUserMessage: string,
  abortSignal: AbortSignal,
): Promise<CandidateReply> {
  const baseLlm = config.getBaseLlmClient();
  const prompt =
    agent === 'moderator'
      ? await buildModeratorPrompt(state, latestUserMessage)
      : await buildAgentPrompt(agent, state, latestUserMessage);
  const promptId = `discuss-${agent}-${Date.now()}`;
  const response = await promptIdContext.run(promptId, async () => baseLlm.generateContent({
      modelConfigKey: { model: config.getActiveModel() },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      abortSignal,
      promptId,
      role: LlmRole.UTILITY_TOOL,
    }));

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p: { thought?: boolean; text?: string }) => !p.thought && p.text)
    .map((p: { text?: string }) => p.text)
    .join('')
    .trim();
  return parseJsonReply(agent, text);
}

function queueDiscussionTurn(config: Config, work: () => Promise<void>): void {
  const key = config.getProjectRoot();
  const previous = turnQueues.get(key) ?? Promise.resolve();
  const next = previous
    .then(work)
    .catch(() => {
      // Keep queue alive even if one turn fails.
    })
    .finally(() => {
      if (turnQueues.get(key) === next) {
        turnQueues.delete(key);
      }
    });
  turnQueues.set(key, next);
}

async function runAgentsInParallel(
  config: Config,
  state: DiscussionSessionState,
  latestUserMessage: string,
  addItem: UseHistoryManagerReturn['addItem'],
  abortSignal: AbortSignal,
): Promise<void> {
  if (abortSignal.aborted) {
    return;
  }
  const remainingBudget = () =>
    state.maxAgentMessages - state.agentMessageCount;
  if (remainingBudget() <= 0) {
    return;
  }

  const promises = PANELISTS.map((agent) =>
    generateAgentReply(config, agent, state, latestUserMessage, abortSignal)
      .then((reply) => ({ agent, reply, error: null as Error | null }))
      .catch((error: unknown) => ({
        agent,
        reply: null,
        error:
          error instanceof Error ? error : new Error(getErrorMessage(error)),
      })),
  );

  const pending = new Set(promises);

  while (pending.size > 0 && remainingBudget() > 0) {
    if (abortSignal.aborted) {
      return;
    }
    const completed = await Promise.race(pending);
    pending.delete(
      promises.find(
        (p) => p === promises[PANELISTS.indexOf(completed.agent)],
      )!,
    );

    if (completed.error || !completed.reply) {
      addMessage(addItem, {
        type: MessageType.ERROR,
        text: `[${completed.agent}] failed: ${completed.error?.message ?? 'unknown error'}`,
      });
      continue;
    }

    const reply = completed.reply;
    if (reply.action !== 'speak' || !reply.text.trim()) {
      continue;
    }

    appendAgentMessage(state, reply.agent, reply.text, reply.kind);
    state.agentMessageCount++;
    addAgentMessage(addItem, reply.agent, reply.text);
  }
}

async function runModeratorTurn(
  config: Config,
  state: DiscussionSessionState,
  latestUserMessage: string,
  addItem: UseHistoryManagerReturn['addItem'],
  abortSignal: AbortSignal,
): Promise<{ requestFollowUpRound: boolean; followUpPrompt: string | null }> {
  if (abortSignal.aborted || state.isComplete) {
    return { requestFollowUpRound: false, followUpPrompt: null };
  }
  const remainingBudget = state.maxAgentMessages - state.agentMessageCount;
  if (remainingBudget <= 0) {
    return { requestFollowUpRound: false, followUpPrompt: null };
  }

  addMessage(addItem, {
    type: 'discuss_thinking',
    agent: 'moderator',
  });

  try {
    const reply = await generateAgentReply(
      config,
      'moderator',
      state,
      latestUserMessage,
      abortSignal,
    );

    if (reply.unmetRequirements) {
      state.unmetRequirements = reply.unmetRequirements;
    }
    if (reply.isComplete) {
      state.isComplete = true;
    }

    if (reply.action === 'pass' || !reply.text.trim()) {
      return { requestFollowUpRound: false, followUpPrompt: null };
    }

    const kind = reply.action === 'escalate' ? 'direction' : reply.kind;
    appendAgentMessage(state, 'moderator', reply.text, kind);
    state.agentMessageCount++;

    if (reply.action === 'escalate') {
      addAgentMessage(addItem, 'moderator', reply.text);
      addMessage(addItem, {
        type: MessageType.INFO,
        text: 'Moderator needs your input. Please respond to continue.',
      });
    } else {
      addAgentMessage(addItem, 'moderator', reply.text);
    }

    if (state.isComplete) {
      addMessage(addItem, {
        type: MessageType.INFO,
        text: 'Moderator considers the discussion complete. Use /discuss summary to get the final synthesis.',
      });
      return { requestFollowUpRound: false, followUpPrompt: null };
    }

    const canAutoContinue =
      reply.action === 'speak' &&
      reply.requestFollowUpRound === true &&
      !state.isComplete;
    return {
      requestFollowUpRound: canAutoContinue,
      followUpPrompt: reply.followUpPrompt || reply.text,
    };
  } catch (error) {
    if (abortSignal.aborted) {
      return { requestFollowUpRound: false, followUpPrompt: null };
    }
    addMessage(addItem, {
      type: MessageType.ERROR,
      text: `[moderator] failed: ${getErrorMessage(error)}`,
    });
    return { requestFollowUpRound: false, followUpPrompt: null };
  }
}

export async function startDiscussion(
  config: Config,
  topic: string,
  addItem: UseHistoryManagerReturn['addItem'],
): Promise<void> {
  const expandedTopic = await expandMarkdownReference(config, topic);
  const state = createInitialState(expandedTopic);
  await saveDiscussionState(config, state);

  addMessage(addItem, {
    type: MessageType.USER,
    text: expandedTopic,
  });
  addMessage(addItem, {
    type: MessageType.INFO,
    text: 'Started multi-agent discussion (builder, skeptic, explorer + moderator).',
  });
  addMessage(addItem, {
    type: MessageType.INFO,
    text: 'Chime in anytime with normal messages. Use /discuss stop to end.',
  });
}

export async function stopDiscussion(
  config: Config,
  addItem: UseHistoryManagerReturn['addItem'],
): Promise<void> {
  await clearDiscussionState(config);
  addMessage(addItem, {
    type: MessageType.INFO,
    text: 'Stopped discussion session.',
  });
}

export async function summarizeDiscussion(
  config: Config,
  addItem: UseHistoryManagerReturn['addItem'],
): Promise<void> {
  const state = await loadDiscussionState(config);
  if (!state || !state.active) {
    addMessage(addItem, {
      type: MessageType.INFO,
      text: 'No active discussion session.',
    });
    return;
  }

  const prompt = await buildSynthesisPrompt(state);
  try {
    const baseLlm = config.getBaseLlmClient();
    const response = await baseLlm.generateContent({
      modelConfigKey: { model: config.getActiveModel() },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      abortSignal: new AbortController().signal,
      promptId: `discuss-summarize-${Date.now()}`,
      role: LlmRole.UTILITY_TOOL,
    });
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    addMessage(addItem, {
      type: MessageType.GEMINI,
      text: text || 'No summary generated.',
    });
  } catch (error) {
    addMessage(addItem, {
      type: MessageType.ERROR,
      text: `Failed to summarize discussion: ${getErrorMessage(error)}`,
    });
  }
}

export async function isDiscussionActive(config: Config): Promise<boolean> {
  const state = await loadDiscussionState(config);
  return Boolean(state?.active);
}

export async function handleDiscussionUserMessage(
  config: Config,
  text: string,
  addItem: UseHistoryManagerReturn['addItem'],
  setPendingItem: (item: HistoryItemWithoutId | null) => void,
): Promise<boolean> {
  const state = await loadDiscussionState(config);
  if (!state?.active) {
    return false;
  }

  const expanded = await expandMarkdownReference(config, text);
  appendUserMessage(state, expanded);
  addMessage(addItem, { type: MessageType.USER, text: expanded });
  await saveDiscussionState(config, state);

  const key = config.getProjectRoot();
  // Abort any in-flight turn so agents "rethink" based on the latest chime-in.
  const previousAbort = turnAbortControllers.get(key);
  if (previousAbort) {
    previousAbort.abort();
  }
  const abortController = new AbortController();
  turnAbortControllers.set(key, abortController);

  queueDiscussionTurn(config, async () => {
    setPendingItem({
      type: 'info',
      text: '[builder] [skeptic] [explorer] thinking...',
    });

    const latest = await loadDiscussionState(config);
    if (!latest?.active) {
      setPendingItem(null);
      return;
    }
    try {
      await runAgentsInParallel(
        config,
        latest,
        expanded,
        addItem,
        abortController.signal,
      );

      if (!abortController.signal.aborted && latest.active) {
        let roundPrompt = expanded;
        let followUpRounds = 0;

        while (!abortController.signal.aborted && latest.active) {
          setPendingItem({
            type: 'info',
            text: '[moderator] reviewing...',
          });
          const moderatorDecision = await runModeratorTurn(
            config,
            latest,
            roundPrompt,
            addItem,
            abortController.signal,
          );
          if (
            !moderatorDecision.requestFollowUpRound ||
            !moderatorDecision.followUpPrompt
          ) {
            break;
          }
          if (followUpRounds >= MAX_AUTO_FOLLOW_UP_ROUNDS) {
            addMessage(addItem, {
              type: MessageType.INFO,
              text: 'Moderator requested more rounds, but auto-follow-up limit was reached. Please chime in to continue.',
            });
            break;
          }

          followUpRounds++;
          roundPrompt = moderatorDecision.followUpPrompt;
          setPendingItem({
            type: 'info',
            text: '[builder] [skeptic] [explorer] follow-up...',
          });
          await runAgentsInParallel(
            config,
            latest,
            roundPrompt,
            addItem,
            abortController.signal,
          );
        }
      }

      await saveDiscussionState(config, latest);
    } catch (error) {
      if (abortController.signal.aborted) {
        setPendingItem(null);
        return;
      }
      addMessage(addItem, {
        type: MessageType.ERROR,
        text: `Discussion error: ${getErrorMessage(error)}`,
      });
    }
    setPendingItem(null);
  });

  return true;
}
