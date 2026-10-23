/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Extracts reviewable human turns from a loaded Gemini CLI
 * conversation record. Observed tool calls remain evidence only and are never
 * converted into expected eval behavior.
 */

import {
  isIgnoredUserContent,
  isResumableMessageRecord,
  type ConversationRecord,
  type MessageRecord,
} from '@google/gemini-cli-core';
import { buildToolRegistry, resolveToolName } from './tool-registry.js';

export interface ObservedToolCall {
  name: string;
  status: string;
}

export interface SessionTurnCandidate {
  messageId: string;
  prompt: string;
  observedModel?: string;
  observedTools: ObservedToolCall[];
  candidatePaths: string[];
}

export interface UnsupportedSessionTurn {
  messageId: string;
  reason: string;
}

export interface SessionTurnAnalysis {
  turns: SessionTurnCandidate[];
  unsupportedTurns: UnsupportedSessionTurn[];
}

interface AnalyzableToolCall {
  name: string;
  status: string;
  args: Record<string, unknown>;
}

type UserMessageClassification =
  | { kind: 'eligible'; prompt: string }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'boundary' }
  | { kind: 'continuation' };

/**
 * Returns text only when every part is plain text. This deliberately rejects
 * images, files, function responses, and other multimodal content.
 */
function extractPlainText(content: unknown): string | undefined {
  const parts = Array.isArray(content) ? content : [content];
  let text = '';

  for (const part of parts) {
    if (typeof part === 'string') {
      text += part;
      continue;
    }

    if (
      typeof part === 'object' &&
      part !== null &&
      'text' in part &&
      typeof (part as { text?: unknown }).text === 'string' &&
      Object.keys(part).every((key) => key === 'text')
    ) {
      text += (part as { text: string }).text;
      continue;
    }

    return undefined;
  }

  return text.trim().length > 0 ? text : undefined;
}

function isFunctionResponseContinuation(content: unknown): boolean {
  const parts = Array.isArray(content) ? content : [content];
  return parts.some(
    (part) =>
      typeof part === 'object' &&
      part !== null &&
      'functionResponse' in part &&
      (part as { functionResponse?: unknown }).functionResponse !== undefined,
  );
}

function isSyntheticHistorySummary(prompt: string): boolean {
  const normalized = prompt.trimStart();
  // Compression output may persist scratchpad reasoning before its snapshot,
  // so the snapshot tag is not guaranteed to be the first content.
  return (
    prompt.includes('<state_snapshot>') ||
    normalized.startsWith('<scratchpad>') ||
    normalized.startsWith('### [System Note: Conversation History Truncated]')
  );
}

function classifyUserMessage(
  message: MessageRecord,
): UserMessageClassification {
  // Gemini Chat records each tool response as a synthetic user message. It is
  // part of the active human turn, not a new turn boundary.
  if (isFunctionResponseContinuation(message.content)) {
    return { kind: 'continuation' };
  }

  // displayContent is the user-facing form of an expanded prompt. When it is
  // present, never fall back to the hidden/expanded content: doing so could put
  // injected context into the generated eval instead of the user's request.
  const prompt = extractPlainText(
    message.displayContent !== undefined
      ? message.displayContent
      : message.content,
  );

  if (prompt) {
    if (isSyntheticHistorySummary(prompt)) {
      return {
        kind: 'unsupported',
        reason:
          'Synthetic conversation-history summaries cannot be used as human eval prompts.',
      };
    }
    if (isIgnoredUserContent(prompt.trim())) {
      return { kind: 'boundary' };
    }
    return { kind: 'eligible', prompt };
  }

  if (isResumableMessageRecord(message)) {
    return {
      kind: 'unsupported',
      reason: 'Only plain-text user turns are supported in v1.',
    };
  }

  // Function-response-only and empty user records belong to the active turn.
  return { kind: 'continuation' };
}

function extractStringArgs(
  args: Record<string, unknown>,
  key: string,
): string[] {
  const value = args[key];
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    );
  }
  return [];
}

/**
 * Extracts only known path-shaped arguments for preview suggestions. These
 * values are never used as fixture contents or automatically copied.
 */
function extractCandidatePaths(call: AnalyzableToolCall): string[] {
  switch (call.name) {
    case 'read_file':
    case 'write_file':
    case 'replace':
      return extractStringArgs(call.args, 'file_path');
    case 'list_directory':
    case 'grep_search':
    case 'glob':
      return extractStringArgs(call.args, 'dir_path');
    case 'read_many_files':
      return extractStringArgs(call.args, 'include');
    default:
      return [];
  }
}

function malformedToolCallRecordError(): Error {
  return new Error(
    'Session contains a malformed tool call record. The session may have been written by an incompatible Gemini CLI version.',
  );
}

function validatedToolCalls(message: MessageRecord): AnalyzableToolCall[] {
  // Session records originate on disk and the core loader intentionally uses a
  // permissive record guard, so validate every field consumed below.
  const rawToolCalls: unknown =
    message.type === 'gemini' ? message.toolCalls : undefined;
  if (rawToolCalls === undefined) {
    return [];
  }
  if (!Array.isArray(rawToolCalls)) {
    throw malformedToolCallRecordError();
  }

  return rawToolCalls.map((rawCall) => {
    if (
      typeof rawCall !== 'object' ||
      rawCall === null ||
      Array.isArray(rawCall)
    ) {
      throw malformedToolCallRecordError();
    }

    const call = rawCall as Record<string, unknown>;
    const name = call['name'];
    const status = call['status'];
    const args = call['args'];
    if (
      typeof name !== 'string' ||
      name.trim().length === 0 ||
      typeof status !== 'string' ||
      status.trim().length === 0 ||
      typeof args !== 'object' ||
      args === null ||
      Array.isArray(args)
    ) {
      throw malformedToolCallRecordError();
    }

    return {
      name,
      status,
      args: args as Record<string, unknown>,
    };
  });
}

function pushUnique(target: string[], values: string[]): void {
  for (const value of values) {
    if (!target.includes(value)) {
      target.push(value);
    }
  }
}

/**
 * Segments a conversation into eligible human turns. A turn starts at one
 * qualifying user message and owns the following Gemini tool calls until the
 * next human-message boundary.
 */
export function analyzeSessionTurns(
  conversation: ConversationRecord,
): SessionTurnAnalysis {
  const toolRegistry = buildToolRegistry();
  const turns: SessionTurnCandidate[] = [];
  const unsupportedTurns: UnsupportedSessionTurn[] = [];
  let activeTurn: SessionTurnCandidate | undefined;

  const finishActiveTurn = () => {
    if (activeTurn) {
      turns.push(activeTurn);
      activeTurn = undefined;
    }
  };

  for (const message of conversation.messages) {
    if (message.type === 'user') {
      const classification = classifyUserMessage(message);

      if (classification.kind === 'continuation') {
        continue;
      }

      finishActiveTurn();

      if (classification.kind === 'eligible') {
        activeTurn = {
          messageId: message.id,
          prompt: classification.prompt,
          observedTools: [],
          candidatePaths: [],
        };
      } else if (classification.kind === 'unsupported') {
        unsupportedTurns.push({
          messageId: message.id,
          reason: classification.reason,
        });
      }
      continue;
    }

    if (message.type !== 'gemini' || !activeTurn) {
      continue;
    }

    if (!activeTurn.observedModel && message.model) {
      activeTurn.observedModel = message.model;
    }

    for (const call of validatedToolCalls(message)) {
      const name = resolveToolName(toolRegistry, call.name) ?? call.name;
      activeTurn.observedTools.push({
        name,
        status: call.status,
      });
      pushUnique(
        activeTurn.candidatePaths,
        extractCandidatePaths({ ...call, name }),
      );
    }
  }

  finishActiveTurn();

  return { turns, unsupportedTurns };
}

export function selectSessionTurn(
  analysis: SessionTurnAnalysis,
  messageId?: string,
): SessionTurnCandidate {
  if (messageId) {
    const selected = analysis.turns.find(
      (turn) => turn.messageId === messageId,
    );
    if (selected) {
      return selected;
    }

    const unsupported = analysis.unsupportedTurns.find(
      (turn) => turn.messageId === messageId,
    );
    if (unsupported) {
      throw new Error(
        `User turn ${messageId} is not supported: ${unsupported.reason}`,
      );
    }

    throw new Error(
      `No eligible user turn found with message id: ${messageId}`,
    );
  }

  if (analysis.turns.length === 0) {
    throw new Error('The session contains no eligible plain-text user turns.');
  }

  if (analysis.turns.length > 1) {
    throw new Error(
      'The session contains multiple eligible user turns. Use --list-turns and select one with --message-id.',
    );
  }

  return analysis.turns[0];
}
