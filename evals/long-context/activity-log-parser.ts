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
  tool_id?: string;
  parameters?: Record<string, unknown>;
  stats?: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    duration_ms?: number;
  };
}

interface StreamJsonEvent {
  type?: string;
  timestamp?: string;
  role?: 'user' | 'assistant';
  tool_name?: string;
  tool_id?: string;
  status?: 'success' | 'error';
  parameters?: Record<string, unknown>;
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

const SEARCH_TOOL_NAMES = new Set([
  'glob',
  'grep',
  'glob_search',
  'grep_search',
  'search_file_content',
]);
const MAX_TRACKED_PATHS = 50;

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

function addPath(target: Set<string>, pathValue: unknown) {
  if (typeof pathValue !== 'string' || pathValue.length === 0) {
    return;
  }
  if (target.size >= MAX_TRACKED_PATHS) {
    return;
  }
  target.add(pathValue);
}

function maybeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function recordToolParameters(
  toolName: string,
  parameters: unknown,
  filesRead: Set<string>,
  filesEdited: Set<string>,
  filesWritten: Set<string>,
  delegatedAgentNames: Set<string>,
): {
  delegationIncrement: number;
  fileReadIncrement: number;
  fileEditIncrement: number;
  fileWriteIncrement: number;
  searchToolIncrement: number;
} {
  let delegationIncrement = 0;
  let fileReadIncrement = 0;
  let fileEditIncrement = 0;
  let fileWriteIncrement = 0;
  let searchToolIncrement = 0;

  if (SEARCH_TOOL_NAMES.has(toolName)) {
    searchToolIncrement = 1;
  }

  if (!parameters || typeof parameters !== 'object') {
    return {
      delegationIncrement,
      fileReadIncrement,
      fileEditIncrement,
      fileWriteIncrement,
      searchToolIncrement,
    };
  }

  if (toolName === 'read_file') {
    addPath(
      filesRead,
      'file_path' in parameters ? parameters.file_path : undefined,
    );
    fileReadIncrement = 1;
  }

  if (toolName === 'edit') {
    addPath(
      filesEdited,
      'file_path' in parameters ? parameters.file_path : undefined,
    );
    fileEditIncrement = 1;
  }

  if (toolName === 'write' || toolName === 'write_file') {
    addPath(
      filesWritten,
      'file_path' in parameters ? parameters.file_path : undefined,
    );
    fileWriteIncrement = 1;
  }

  if (toolName === 'Agent') {
    const agentName =
      'subagent_type' in parameters &&
      typeof parameters.subagent_type === 'string'
        ? parameters.subagent_type
        : 'description' in parameters &&
            typeof parameters.description === 'string'
          ? parameters.description
          : undefined;
    if (agentName) {
      delegatedAgentNames.add(agentName);
    }
    delegationIncrement = 1;
  }

  for (const extraReadPath of maybeStringArray(
    'file_paths' in parameters ? parameters.file_paths : undefined,
  )) {
    addPath(filesRead, extraReadPath);
  }

  return {
    delegationIncrement,
    fileReadIncrement,
    fileEditIncrement,
    fileWriteIncrement,
    searchToolIncrement,
  };
}

function sanitizeForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForFingerprint(item));
  }
  if (value && typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nestedValue]) => [key, sanitizeForFingerprint(nestedValue)]);
    return Object.fromEntries(sortedEntries);
  }
  return value;
}

function buildEventFingerprint(event: {
  type?: string;
  timestamp?: string | number;
  role?: string;
  tool_name?: string;
  tool_id?: string;
  status?: string;
  content?: string;
  parameters?: Record<string, unknown>;
  stats?: Record<string, unknown>;
}): string | null {
  if (!event.type) {
    return null;
  }

  return JSON.stringify({
    type: event.type,
    timestamp: event.timestamp ?? null,
    role: event.role ?? null,
    tool_name: event.tool_name ?? null,
    tool_id: event.tool_id ?? null,
    status: event.status ?? null,
    content: event.content ?? null,
    parameters: sanitizeForFingerprint(event.parameters ?? null),
    stats: sanitizeForFingerprint(event.stats ?? null),
  });
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
        delegationCount: 0,
        delegatedAgentNames: [],
        filesRead: [],
        filesEdited: [],
        filesWritten: [],
        fileReadCount: 0,
        fileEditCount: 0,
        fileWriteCount: 0,
        searchToolCallCount: 0,
        durationMs: baseDurationMs,
      },
    };
  }

  const entries = fileContent
    .split('\n')
    .map((line) => parseJsonLine(line))
    .filter((entry): entry is ActivityLogEntry => entry !== null);

  const toolNames = new Set<string>();
  const delegatedAgentNames = new Set<string>();
  const filesRead = new Set<string>();
  const filesEdited = new Set<string>();
  const filesWritten = new Set<string>();
  let toolCallCount = 0;
  let apiRequestCount = 0;
  let apiErrorCount = 0;
  const networkRequestIds = new Set<string>();
  let chatCompressionCount = 0;
  let compressionTokensSavedTotal = 0;
  let assistantMessageCount = 0;
  let delegationCount = 0;
  let fileReadCount = 0;
  let fileEditCount = 0;
  let fileWriteCount = 0;
  let searchToolCallCount = 0;
  let totalTokens: number | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let durationMs = baseDurationMs;

  for (const entry of entries) {
    if (entry.type === 'tool_use' && typeof entry.tool_name === 'string') {
      toolCallCount += 1;
      toolNames.add(entry.tool_name);
      const increments = recordToolParameters(
        entry.tool_name,
        entry.parameters,
        filesRead,
        filesEdited,
        filesWritten,
        delegatedAgentNames,
      );
      delegationCount += increments.delegationIncrement;
      fileReadCount += increments.fileReadIncrement;
      fileEditCount += increments.fileEditIncrement;
      fileWriteCount += increments.fileWriteIncrement;
      searchToolCallCount += increments.searchToolIncrement;
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
        const increments = recordToolParameters(
          streamEvent.tool_name,
          streamEvent.parameters,
          filesRead,
          filesEdited,
          filesWritten,
          delegatedAgentNames,
        );
        delegationCount += increments.delegationIncrement;
        fileReadCount += increments.fileReadIncrement;
        fileEditCount += increments.fileEditIncrement;
        fileWriteCount += increments.fileWriteIncrement;
        searchToolCallCount += increments.searchToolIncrement;
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
          const increments = recordToolParameters(
            event.tool_name,
            event.parameters,
            filesRead,
            filesEdited,
            filesWritten,
            delegatedAgentNames,
          );
          delegationCount += increments.delegationIncrement;
          fileReadCount += increments.fileReadIncrement;
          fileEditCount += increments.fileEditIncrement;
          fileWriteCount += increments.fileWriteIncrement;
          searchToolCallCount += increments.searchToolIncrement;
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
      delegationCount,
      delegatedAgentNames: Array.from(delegatedAgentNames),
      filesRead: Array.from(filesRead),
      filesEdited: Array.from(filesEdited),
      filesWritten: Array.from(filesWritten),
      fileReadCount,
      fileEditCount,
      fileWriteCount,
      searchToolCallCount,
      totalTokens,
      inputTokens,
      outputTokens,
      durationMs,
    },
  };
}
