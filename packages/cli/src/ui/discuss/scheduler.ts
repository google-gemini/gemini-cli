/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AgentId,
  PanelistId,
  CandidateReply,
  DiscussionSessionState,
} from './discussionState.js';

type RequestEvent =
  | { type: 'user_message'; text: string }
  | {
      type: 'request_for_response';
      reason: 'continue' | 'user_directed';
      targetAgent?: AgentId;
    };

export function scheduleReplies(
  state: DiscussionSessionState,
  _event: RequestEvent,
  candidates: CandidateReply[],
): CandidateReply[] {
  const speakCandidates = candidates.filter((c) => c.action === 'speak');
  if (speakCandidates.length === 0) {
    return [];
  }

  const remainingBudget = state.maxAgentMessages - state.agentMessageCount;
  if (remainingBudget <= 0) {
    return [];
  }

  // Drop trivial priority 0.
  const filtered = speakCandidates.filter((c) => c.priority > 0);
  if (filtered.length === 0) {
    return [];
  }

  const high = filtered.filter((c) => c.priority >= 2);
  const low = filtered.filter((c) => c.priority === 1);
  const pool = high.length > 0 ? high : low;
  if (pool.length === 0) {
    return [];
  }

  const maxReplies = Math.min(2, remainingBudget);
  const objections = pool.filter((c) => c.kind === 'objection');
  const rebuttals = pool.filter((c) => c.kind === 'question');
  const selected: CandidateReply[] = [];

  if (objections.length > 0) {
    const bestObjection = pickHighestPriority(objections);
    selected.push(bestObjection);

    const matchingRebuttal = rebuttals.find(
      (r) =>
        r.targetsMessageId &&
        r.targetsMessageId === bestObjection.targetsMessageId,
    );
    if (matchingRebuttal && selected.length < maxReplies) {
      selected.push(matchingRebuttal);
    }
  }

  if (selected.length < maxReplies) {
    const usedAgents = new Set<AgentId>(selected.map((c) => c.agent));
    const remaining = pool.filter(
      (c) =>
        !selected.includes(c) &&
        c.kind !== 'objection' &&
        c.kind !== 'question',
    );

    for (const agent of ['builder', 'skeptic', 'explorer'] as PanelistId[]) {
      if (selected.length >= maxReplies) break;
      const candidate = remaining
        .filter((c) => c.agent === agent)
        .sort(compareByPriority)[0];
      if (candidate && !usedAgents.has(agent)) {
        selected.push(candidate);
        usedAgents.add(agent);
      }
    }
  }

  if (selected.length === 0 && pool.length > 0) {
    selected.push(pickHighestPriority(pool));
  }

  const final = selected.slice(0, maxReplies);
  state.agentMessageCount += final.length;
  return final;
}

function pickHighestPriority(candidates: CandidateReply[]): CandidateReply {
  return candidates.slice().sort((a, b) => b.priority - a.priority)[0];
}

function compareByPriority(a: CandidateReply, b: CandidateReply): number {
  return b.priority - a.priority;
}
