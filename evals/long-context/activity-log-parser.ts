/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile } from 'node:fs/promises';
import type { ProcessMetrics } from './schema.js';

interface ActivityLogEntry {
  type?: string;
  payload?: unknown;
  timestamp?: number | string;
  sessionId?: string;
  role?: 'user' | 'assistant';
  content?: string;
  tool_name?: string;
  stats?: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    duration_ms?: number;
  };
}

interface StreamJsonEvent {
  type?: string;
  role?: 'user' | 'assistant';
  tool_name?: string;
  status?: 'success' | 'error';
  stats?: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    duration_ms?: number;
    tool_calls?: number;
  };
}

interface NetworkPayload {
  id?: string;
  pending?: boolean;
  error?: string;
  response?: {
    status?: number;
    body?: string;
    durationMs?: number;
  };
}

interface ParsedActivityLog {
  metrics: ProcessMetrics;
  entries: ActivityLogEntry[];
}

function parseJsonLine(line: string): ActivityLogEntry | null {
  if (!line.trim()) {
    return null;
  }

  const parsed = JSON.parse(line) as ActivityLogEntry;
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  return parsed;
}

function tryParseStreamJson(content: string): StreamJsonEvent | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as StreamJsonEvent;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.type !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseStreamJsonLines(content: string): StreamJsonEvent[] {
  return content
    .split('\n')
    .map((line) => tryParseStreamJson(line))
    .filter((event): event is StreamJsonEvent => event !== null);
}

function tryGetCompressionTokens(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  let maybeTokensBefore: unknown;
  let maybeTokensAfter: unknown;

  if ('tokens_before' in payload) {
    maybeTokensBefore = payload.tokens_before;
  }
  if ('tokens_after' in payload) {
    maybeTokensAfter = payload.tokens_after;
  }

  if (
    (maybeTokensBefore === undefined || maybeTokensAfter === undefined) &&
    'payload' in payload &&
    payload.payload &&
    typeof payload.payload === 'object'
  ) {
    if (maybeTokensBefore === undefined && 'tokens_before' in payload.payload) {
      maybeTokensBefore = payload.payload.tokens_before;
    }
    if (maybeTokensAfter === undefined && 'tokens_after' in payload.payload) {
      maybeTokensAfter = payload.payload.tokens_after;
    }
  }

  if (
    typeof maybeTokensBefore === 'number' &&
    typeof maybeTokensAfter === 'number' &&
    maybeTokensBefore >= maybeTokensAfter
  ) {
    return maybeTokensBefore - maybeTokensAfter;
  }

  return null;
}

export async function parseActivityLog(
  activityLogPath: string,
  baseDurationMs = 0,
): Promise<ParsedActivityLog> {
  let fileContent = '';
  try {
    fileContent = await readFile(activityLogPath, 'utf8');
  } catch {
    return {
      entries: [],
      metrics: {
        toolCallCount: 0,
        toolNames: [],
        apiRequestCount: 0,
        apiErrorCount: 0,
        chatCompressionCount: 0,
        compressionTokensSavedTotal: 0,
        assistantMessageCount: 0,
        durationMs: baseDurationMs,
      },
    };
  }

  const entries = fileContent
    .split('\n')
    .map((line) => parseJsonLine(line))
    .filter((entry): entry is ActivityLogEntry => entry !== null);

  const toolNames = new Set<string>();
  let toolCallCount = 0;
  let apiRequestCount = 0;
  let apiErrorCount = 0;
  const networkRequestIds = new Set<string>();
  let chatCompressionCount = 0;
  let compressionTokensSavedTotal = 0;
  let assistantMessageCount = 0;
  let totalTokens: number | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let durationMs = baseDurationMs;

  for (const entry of entries) {
    if (entry.type === 'tool_use' && typeof entry.tool_name === 'string') {
      toolCallCount += 1;
      toolNames.add(entry.tool_name);
      continue;
    }

    if (entry.type === 'message' && entry.role === 'assistant') {
      assistantMessageCount += 1;
      continue;
    }

    if (entry.type === 'result' && entry.stats) {
      totalTokens = entry.stats.total_tokens ?? totalTokens;
      inputTokens = entry.stats.input_tokens ?? inputTokens;
      outputTokens = entry.stats.output_tokens ?? outputTokens;
      durationMs = entry.stats.duration_ms ?? durationMs;
      continue;
    }

    if (entry.type === 'network') {
      const payload = entry.payload as NetworkPayload | undefined;
      if (payload?.id && !networkRequestIds.has(payload.id)) {
        networkRequestIds.add(payload.id);
        apiRequestCount += 1;
      }
      if (payload?.error) {
        apiErrorCount += 1;
      }
      if (
        payload?.response?.status !== undefined &&
        payload.response.status >= 400
      ) {
        apiErrorCount += 1;
      }
    }

    if (entry.type !== 'console') {
      continue;
    }

    const payload = entry.payload;
    if (!payload || typeof payload !== 'object') {
      continue;
    }

    const content =
      'content' in payload && typeof payload.content === 'string'
        ? payload.content
        : '';

    if (!content) {
      continue;
    }

    const streamEvent = tryParseStreamJson(content);
    if (streamEvent) {
      if (streamEvent.type === 'tool_use' && streamEvent.tool_name) {
        toolCallCount += 1;
        toolNames.add(streamEvent.tool_name);
      }
      if (streamEvent.type === 'message' && streamEvent.role === 'assistant') {
        assistantMessageCount += 1;
      }
      if (streamEvent.type === 'result' && streamEvent.stats) {
        totalTokens = streamEvent.stats.total_tokens ?? totalTokens;
        inputTokens = streamEvent.stats.input_tokens ?? inputTokens;
        outputTokens = streamEvent.stats.output_tokens ?? outputTokens;
        durationMs = streamEvent.stats.duration_ms ?? durationMs;
      }
      continue;
    }

    const lineEvents = parseStreamJsonLines(content);
    if (lineEvents.length > 0) {
      for (const event of lineEvents) {
        if (event.type === 'tool_use' && event.tool_name) {
          toolCallCount += 1;
          toolNames.add(event.tool_name);
        }
        if (event.type === 'message' && event.role === 'assistant') {
          assistantMessageCount += 1;
        }
        if (event.type === 'result' && event.stats) {
          totalTokens = event.stats.total_tokens ?? totalTokens;
          inputTokens = event.stats.input_tokens ?? inputTokens;
          outputTokens = event.stats.output_tokens ?? outputTokens;
          durationMs = event.stats.duration_ms ?? durationMs;
        }
      }
      continue;
    }

    if (content.includes('gemini_cli.chat_compression')) {
      chatCompressionCount += 1;
    }

    if (content.includes('Chat compression')) {
      chatCompressionCount += 1;
    }

    const compressionTokens = tryGetCompressionTokens(payload);
    if (compressionTokens !== null) {
      compressionTokensSavedTotal += compressionTokens;
    }
  }

  return {
    entries,
    metrics: {
      toolCallCount,
      toolNames: Array.from(toolNames),
      apiRequestCount,
      apiErrorCount,
      chatCompressionCount,
      compressionTokensSavedTotal,
      assistantMessageCount,
      totalTokens,
      inputTokens,
      outputTokens,
      durationMs,
    },
  };
}
