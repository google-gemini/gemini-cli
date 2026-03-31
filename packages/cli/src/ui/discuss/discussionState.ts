/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Config } from '@google/gemini-cli-core';

export type AgentId = 'builder' | 'skeptic' | 'explorer' | 'moderator';
export type PanelistId = 'builder' | 'skeptic' | 'explorer';
export type MessageRole = 'user' | AgentId;
export type MessageKind = 'proposal' | 'objection' | 'question' | 'direction';

export interface DiscussionMessage {
  id: string;
  role: MessageRole;
  text: string;
  kind?: MessageKind;
}

export interface CandidateReply {
  agent: AgentId;
  text: string;
  priority: 0 | 1 | 2 | 3;
  action: 'speak' | 'pass' | 'escalate';
  kind: MessageKind;
  targetsMessageId?: string;
  unmetRequirements?: string[];
  isComplete?: boolean;
  requestFollowUpRound?: boolean;
  followUpPrompt?: string;
}

export interface DiscussionSessionState {
  active: boolean;
  /**
   * Logical CLI session identifier. Used to ensure we don't
   * accidentally resume a discussion from a previous run.
   */
  sessionId?: string;
  topic: string;
  messages: DiscussionMessage[];
  endorsedMessageIds: string[];
  openObjections: string[];
  agentMessageCount: number;
  maxAgentMessages: number;
  /** Requirements the moderator has flagged as not yet addressed. */
  unmetRequirements: string[];
  /** Topics the moderator has identified as cycling without progress. */
  cyclicTopics: string[];
  /** Set to true by the moderator when it believes the discussion is complete. */
  isComplete: boolean;
}

const DEFAULT_MAX_AGENT_MESSAGES = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type ParsedMessageRecord = {
  id: string;
  role: MessageRole;
  text: string;
  kind?: unknown;
};

function isParsedMessageRecord(entry: unknown): entry is ParsedMessageRecord {
  if (!isRecord(entry)) {
    return false;
  }
  return (
    typeof entry['id'] === 'string' &&
    (entry['role'] === 'user' ||
      entry['role'] === 'builder' ||
      entry['role'] === 'skeptic' ||
      entry['role'] === 'explorer' ||
      entry['role'] === 'moderator') &&
    typeof entry['text'] === 'string'
  );
}

export function createInitialState(topic: string): DiscussionSessionState {
  return {
    active: true,
    topic,
    messages: [
      {
        id: 'm_1',
        role: 'user',
        text: topic,
      },
    ],
    endorsedMessageIds: [],
    openObjections: [],
    agentMessageCount: 0,
    maxAgentMessages: DEFAULT_MAX_AGENT_MESSAGES,
    unmetRequirements: [],
    cyclicTopics: [],
    isComplete: false,
  };
}

function getSessionPath(config: Config): string {
  return path.join(config.getProjectRoot(), '.gemini', 'discuss-session.json');
}

export async function loadDiscussionState(
  config: Config,
): Promise<DiscussionSessionState | null> {
  try {
    const raw = await fs.readFile(getSessionPath(config), 'utf8');
    const parsedUnknown: unknown = JSON.parse(raw);
    if (!isRecord(parsedUnknown)) {
      return null;
    }
    const parsed = parsedUnknown;
    // If the stored sessionId doesn't match the current one, treat as no session.
    const currentSessionId = config.getSessionId();
    if (
      typeof parsed['sessionId'] !== 'string' ||
      parsed['sessionId'] !== currentSessionId
    ) {
      return null;
    }
    if (
      !Array.isArray(parsed['messages']) ||
      typeof parsed['topic'] !== 'string'
    ) {
      return null;
    }
    const messages: DiscussionMessage[] = parsed['messages']
      .filter(isParsedMessageRecord)
      .map((entry) => {
        const kind =
          entry.kind === 'proposal' ||
          entry.kind === 'objection' ||
          entry.kind === 'question' ||
          entry.kind === 'direction'
            ? entry.kind
            : undefined;
        return {
          id: entry.id,
          role: entry.role,
          text: entry.text,
          kind,
        };
      });

    if (messages.length === 0) {
      return null;
    }

    const state: DiscussionSessionState = {
      active: parsed['active'] === true,
      sessionId: parsed['sessionId'],
      topic: parsed['topic'],
      messages,
      endorsedMessageIds: Array.isArray(parsed['endorsedMessageIds'])
        ? (parsed['endorsedMessageIds'].filter(
            (id): id is string => typeof id === 'string',
          ))
        : [],
      openObjections: Array.isArray(parsed['openObjections'])
        ? (parsed['openObjections'].filter(
            (item): item is string => typeof item === 'string',
          ))
        : [],
      agentMessageCount:
        typeof parsed['agentMessageCount'] === 'number'
          ? parsed['agentMessageCount']
          : 0,
      maxAgentMessages:
        typeof parsed['maxAgentMessages'] === 'number'
          ? parsed['maxAgentMessages']
          : DEFAULT_MAX_AGENT_MESSAGES,
      unmetRequirements: Array.isArray(parsed['unmetRequirements'])
        ? (parsed['unmetRequirements'].filter(
            (item): item is string => typeof item === 'string',
          ))
        : [],
      cyclicTopics: Array.isArray(parsed['cyclicTopics'])
        ? (parsed['cyclicTopics'].filter(
            (item): item is string => typeof item === 'string',
          ))
        : [],
      isComplete: parsed['isComplete'] === true,
    };
    return state;
  } catch {
    return null;
  }
}

export async function saveDiscussionState(
  config: Config,
  state: DiscussionSessionState,
): Promise<void> {
  const sessionPath = getSessionPath(config);
  const stateToPersist: DiscussionSessionState = {
    ...state,
    sessionId: config.getSessionId(),
  };
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  await fs.writeFile(
    sessionPath,
    JSON.stringify(stateToPersist, null, 2),
    'utf8',
  );
}

export async function clearDiscussionState(config: Config): Promise<void> {
  try {
    await fs.unlink(getSessionPath(config));
  } catch {
    // ignore missing file
  }
}

export function appendUserMessage(
  state: DiscussionSessionState,
  text: string,
): DiscussionMessage {
  const message: DiscussionMessage = {
    id: `m_${state.messages.length + 1}`,
    role: 'user',
    text,
  };
  state.messages.push(message);
  return message;
}

export function appendAgentMessage(
  state: DiscussionSessionState,
  agent: AgentId,
  text: string,
  kind: MessageKind,
): DiscussionMessage {
  const message: DiscussionMessage = {
    id: `m_${state.messages.length + 1}`,
    role: agent,
    text,
    kind,
  };
  state.messages.push(message);
  return message;
}
